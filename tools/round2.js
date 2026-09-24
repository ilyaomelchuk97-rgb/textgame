/* Два хода, которые редко проверяют вручную: библиотека своих миров
   («🎲 Новым героем») и второй шанс после смерти без канала.
   Состояние героя готовим движком заранее — так проверка не зависит от везения. */
const { chromium, devices } = require('playwright');
const E = require('../src/engine.js');

const URL = process.argv[2] || 'http://localhost:3000/game.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU', acceptDownloads: true }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (/\[смерть\]/.test(m.text())) console.log('  лог:', m.text()); });
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => {
    if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text());
  });

  // Канал молчит: считаем ход встроенного мастера — именно там бывает второй шанс.
  await page.route('**/api/gm/stream*', r => r.abort());
  await page.route('**/api/gm', r => r.abort());
  await page.route('**/api/image*', r => r.fulfill({ status: 204, body: '' }));

  // Сохранение готовим движком: герой на последнем издыхании, три провала за спиной.
  const seed = (() => {
    const game = E.createGame({ scenarioId: 'custom', heroName: 'Ирма' });
    game.title = 'Стеклянный берег';
    // 0 здоровья с самого начала: так второй шанс проверяется детерминированно,
    // а не «если встроенный мастер в этот раз попадёт»
    game.hero.hp = 0;
    game.hero.maxHp = 12;
    game.turn = 4;
    game.chapter = 'Глава II';
    // сохранённый ход: без него игра честно уходит спрашивать мастера заново
    game.scene = {
      text: 'Ветер тащит по мосту сухую траву. Внизу — чёрная вода, и в ней что-то крупное ходит кругами.',
      place: 'Мост', placeKey: 'мост',
      chapter: 'Глава II', npc: 'Мара',
      options: [
        { id: 'o0', text: 'Идти по мосту не спеша', stat: 'agi', difficulty: 'medium' },
        { id: 'o1', text: 'Проверить, что там в воде', stat: 'per', difficulty: 'hard' },
        { id: 'o2', text: 'Позвать Мару', stat: 'cha', difficulty: 'easy' }
      ],
      imagePrompt: 'bridge over black water, dry grass, dusk'
    };
    E.rememberFact(game, 'герой уже дважды падал');
    E.memoryOf(game).setbacks = 3;
    game.usedSecondChance = false;
    game.rules = Object.assign(E.defaultRules ? E.defaultRules() : {}, { defeat: 'hard' });
    const store = {};
    const driver = {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    };
    E.createStorage(driver).save(game);
    return store;
  })();

  await page.addInitScript(keys => {
    Object.keys(keys).forEach(k => localStorage.setItem(k, keys[k]));
    localStorage.setItem('dt2:worlds', JSON.stringify([{
      id: 'w-test', title: 'Стеклянный берег', genre: 'постапокалипсис', tone: 'мрачно',
      place: 'порт', goal: 'найти маяк', extra: '', at: Date.now()
    }]));
  }, seed);

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // 1. Библиотека миров: тот же мир — новый герой
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(600);
  const lib = await page.evaluate(() => {
    const titles = Array.from(document.querySelectorAll('#saved-worlds .save-card__title')).map(e => e.textContent.trim());
    const btn = Array.from(document.querySelectorAll('#saved-worlds button')).find(b => /Новым героем/.test(b.textContent));
    if (btn) btn.click();
    return { titles, has: !!btn };
  });
  await page.waitForTimeout(900);
  const hero = await page.evaluate(() => {
    const s = document.getElementById('screen-hero');
    const name = document.getElementById('hero-name');
    return { visible: !!(s && !s.hidden), name: name ? name.value : '' };
  });
  await page.screenshot({ path: 'shots/v14-world-new-hero.png' });

  // 2. Продолжаем кампанию на грани смерти и слушаем молчащий канал
  await page.evaluate(() => {
    for (let i = 0; i < 5; i++) {
      const back = document.querySelector('.screen:not([hidden]) [data-act="back"], .screen:not([hidden]) [data-act="show-menu"]');
      if (back) back.click();
      const menu = document.getElementById('screen-menu');
      if (menu && !menu.hidden) break;
    }
  });
  await page.waitForTimeout(400);
  await page.click('#screen-menu [data-act="my-games"]');
  await page.waitForTimeout(700);
  const cards = await page.evaluate(() => Array.from(document.querySelectorAll('#saves-list .save-card')).length);
  await page.evaluate(() => {
    const open = Array.from(document.querySelectorAll('#saves-list button')).find(b => /Продолжить|Играть|Открыть/.test(b.textContent))
      || document.querySelector('#saves-list .save-card__body button');
    if (open) open.click();
  });
  await page.waitForSelector('#screen-game:not([hidden])', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const opened = await page.evaluate(() => ({
    screen: document.body.dataset.screen,
    hidden: document.getElementById('screen-game').hidden,
    actions: document.querySelectorAll('#actions .action-btn').length,
    overlays: ['prologue', 'epilogue', 'dice-overlay', 'modal'].filter(id => { const e = document.getElementById(id); return e && !e.hidden; }),
    title: (document.getElementById('game-title') || {}).textContent || '',
    list: Array.from(document.querySelectorAll('#actions .action-btn')).map(b => b.className + ' :: ' + b.textContent.trim().slice(0, 34))
  }));
  console.log('открытие сохранения:', JSON.stringify(opened));
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"], .prologue__go'); if (b) b.click(); });
  await page.waitForTimeout(400);

  // варианты появляются не мгновенно: ждём, пока в кнопках появится текст
  const waitActions = async (ms) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const ready = await page.evaluate(() => {
        const list = document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)');
        return Array.from(list).filter(b => b.textContent.trim().length > 3).length;
      });
      if (ready) return ready;
      await page.waitForTimeout(400);
    }
    return 0;
  };
  await waitActions(20000);

  let found = null;
  let hp = null;
  for (let i = 0; i < 10 && !found; i++) {
    await page.evaluate(() => {
      const dice = document.getElementById('dice-overlay');
      if (dice && !dice.hidden) dice.hidden = true;
      const b = document.querySelector('[data-act="close-prologue"], .prologue__go');
      if (b) b.click();
    });
    const clicked = await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('#actions .action-btn')).find(b => b.textContent.trim().length > 3);
      if (btn) { btn.click(); return btn.textContent.trim().slice(0, 30); }
      return '';
    });
    if (!clicked) break;
    await page.waitForTimeout(2800);
    const st = await page.evaluate(() => {
      const modal = document.getElementById('modal');
      const title = (document.querySelector('#modal-box .modal__title') || {}).textContent || '';
      const text = (document.querySelector('#modal-box') || {}).textContent || '';
      const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
      let hp = null, err = '';
      try {
        hp = JSON.parse(localStorage.getItem('dt2:game:' + idx[0].id) || '{}').hero.hp;
      } catch (e) { err = e.message; }
      return { open: !!(modal && !modal.hidden), title, text: text.slice(0, 100), hp, idx: idx.length, err, screen: document.body.dataset.screen, actions: document.querySelectorAll('#actions .action-btn').length };
    });
    hp = st.hp;
    const extra = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
      const g = idx[0] ? JSON.parse(localStorage.getItem('dt2:game:' + idx[0].id) || '{}') : {};
      const st = window.DTstate ? window.DTstate() : {};
      const ep = document.getElementById('epilogue');
      return {
        offline: st.offline, hp: g.hero && g.hero.hp, setbacks: g.memory && g.memory.setbacks,
        used: !!g.usedSecondChance, over: !!g.over, doomed: !!g.doomed,
        rules: g.rules && g.rules.defeat, epilogue: !!(ep && !ep.hidden), notes: st.notes
      };
    });
    console.log('  ход', i + 1 + ': hp=' + extra.hp + ' offline=' + extra.offline + ' setbacks=' + extra.setbacks + ' used=' + extra.used + ' over=' + extra.over + ' финал=' + extra.epilogue + ' modal=' + st.open + ' («' + st.title + '»)');
    if (i === 0) console.log('  записи:', JSON.stringify(extra.notes));
    const log = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
      const g = idx[0] ? JSON.parse(localStorage.getItem('dt2:game:' + idx[0].id) || '{}') : {};
      return (g.log || []).slice(-4).map(l => (l.kind || '') + ': ' + String(l.text || '').slice(0, 70));
    });
    console.log('    летопись:', JSON.stringify(log));
    if (st.open && /шанс/i.test(st.title)) found = st;
  }
  await page.screenshot({ path: 'shots/v14-second-chance.png' });

  console.log('библиотека миров:', lib.titles.join(', ') || '(пусто)', '· кнопка «Новым героем»:', lib.has ? '✓' : '✗');
  console.log('новый герой тем же миром:', hero.visible ? '✓ экран героя открыт' : '✗ экран не открылся', hero.name ? '· имя «' + hero.name + '»' : '');
  console.log('сохранений в списке:', cards, '· здоровье в конце:', hp);
  console.log('второй шанс:', found ? '✓ ' + found.title : '✗ окно не появилось');
  console.log('ошибок страницы:', errs.length, errs.slice(0, 2).join(' | '));
  const ok = lib.has && hero.visible && !!found && errs.length === 0;
  console.log(ok ? 'МИРЫ И ВТОРОЙ ШАНС: всё на месте' : 'МИРЫ И ВТОРОЙ ШАНС: есть замечания');
  await browser.close();
  process.exitCode = ok ? 0 : 1;
})();
