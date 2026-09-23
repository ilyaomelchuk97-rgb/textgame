/**
 * tools/win-local.js — «честная победа» без ИИ.
 *
 * Серверные каналы отключены на уровне браузера: мастер, картинки и озвучка недоступны,
 * поэтому историю ведёт локальный мастер по сюжетным вехам. Игра обязана дойти до последней
 * вехи (цель взята), закрыться эпилогом с +3 пепла и записать победу в летопись наследия.
 *
 * Запуск: node tools/win-local.js   (нужен сервер на :3000 для статики)
 */
const { chromium } = require('playwright');

const stamp = () => new Date().toISOString().slice(14, 19) + 'с';

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  // сеть отключена намеренно: шум resource-ошибок не считаем провалом
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/ERR_FAILED|Failed to load resource|Access to fetch|429/.test(text)) return;
    errors.push('CONSOLE: ' + text.slice(0, 200));
  });

  // ИИ выключен: любой запрос к каналам падает — работает локальный мастер
  await page.route('**/api/**', route => route.abort());

  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(400);
  await page.click('#pane-random .scenario-card');
  await page.waitForSelector('#hero-name', { timeout: 8000 });
  await page.fill('#hero-name', 'Смельчак');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 40000 });
  await page.evaluate(() => {
    const b = document.querySelector('#prologue:not([hidden]) [data-act="close-prologue"]');
    if (b) b.click();
  });
  await page.waitForTimeout(500);

  const world = await page.evaluate(() => ({
    title: (document.querySelector('#game-title') || {}).textContent,
    sub: (document.querySelector('#game-sub') || {}).textContent,
    chapter: (document.querySelector('#scene-chapter') || {}).textContent,
    scene: ((document.querySelector('#scene-text') || {}).textContent || '').slice(0, 100),
    options: document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)').length,
    master: (document.querySelector('#notices') || {}).textContent.slice(0, 40)
  }));
  console.log(stamp(), 'старт:', JSON.stringify(world));

  let heroDown = false;
  let done = null;
  for (let turn = 1; turn <= 14 && !done; turn++) {
    // выбираем самый надёжный вариант: где шанс выше
    const picked = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)'));
      if (!btns.length) return null;
      const chance = b => {
        const m = (b.textContent || '').match(/(\d+)\s*%/);
        return m ? Number(m[1]) : 0;
      };
      const best = btns.slice().sort((a, b) => chance(b) - chance(a))[0];
      const text = (best.querySelector('.action-btn__text') || {}).textContent || '';
      best.click();
      return text;
    });
    if (!picked) break;

    let dice = null;
    for (let i = 0; i < 60; i++) {
      const state = await page.evaluate(() => {
        const ov = document.querySelector('#dice-overlay');
        const open = !!(ov && !ov.hidden);
        return {
          open,
          value: (document.querySelector('.dice-result__value') || {}).textContent || '',
          caption: (document.querySelector('.dice-caption') || {}).textContent || '',
          check: (document.querySelector('#dice-check') || {}).textContent || '',
          outcome: (document.querySelector('.dice-scene') || {}).className || ''
        };
      });
      if (state.open && state.value) { dice = state; break; }
      await page.waitForTimeout(200);
    }
    console.log(stamp(), 'ход ' + turn + ' «' + picked + '» → ' + (dice ? dice.value + ' (' + dice.check + ')' : 'без броска'));

    // кубик уходит сам; ждём спокойной сцены
    let prev = '';
    for (let i = 0; i < 120; i++) {
      const state = await page.evaluate(() => ({
        overlay: !!document.querySelector('#dice-overlay:not([hidden])'),
        text: (document.querySelector('#scene-text') || {}).textContent || '',
        streaming: !!document.querySelector('#scene-text .is-streaming'),
        ghosts: document.querySelectorAll('#actions .action-btn--ghost').length,
        options: document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)').length,
        epilogue: !!document.querySelector('#epilogue:not([hidden])')
      }));
      if (state.epilogue) { done = 'эпилог'; break; }
      const settled = !state.overlay && !state.streaming && state.ghosts === 0 && state.options > 0;
      if (settled && state.text === prev) break;
      prev = state.text;
      await page.waitForTimeout(500);
    }
    const save = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
      const g = JSON.parse(localStorage.getItem('dt2:game:' + ((idx[0] || {}).id) || '') || '{}');
      return {
        turn: g.turn, questDone: !!g.questDone, ending: g.ending || '', hp: g.hero && g.hero.hp,
        setbacks: (g.memory && g.memory.setbacks) || 0, over: !!g.over
      };
    });
    console.log(stamp(), '  состояние:', JSON.stringify(save));
    if (save.questDone || save.over) { done = save.questDone ? 'цель взята' : 'герой пал'; heroDown = save.over; }
  }

  // финал: ждём страницу эпилога
  let epilogue = null;
  for (let i = 0; i < 60; i++) {
    epilogue = await page.evaluate(() => {
      const box = document.querySelector('#epilogue');
      if (!box || box.hidden || !document.querySelector('.epilogue__stat')) return null;
      return {
        title: (document.querySelector('#epilogue-title') || {}).textContent,
        text: ((document.querySelector('#epilogue-body') || {}).textContent || '').slice(0, 140),
        stats: Array.from(document.querySelectorAll('.epilogue__stat')).map(x => x.textContent),
        unlock: ((document.querySelector('.epilogue__unlock') || {}).textContent || '').slice(0, 90)
      };
    });
    if (epilogue) break;
    await page.waitForTimeout(500);
  }
  console.log(stamp(), 'итог прогона:', done, '→', JSON.stringify(epilogue, null, 1));
  await page.screenshot({ path: 'shots/v6-11-victory-live.png' });

  const legend = await page.evaluate(() => {
    const leg = JSON.parse(localStorage.getItem('dt2:legacy') || '{}');
    const last = (leg.heroes || [])[0] || {};
    return {
      runs: leg.runs, victories: leg.victories, defeats: leg.defeats, ashes: leg.ashes,
      unlocked: Object.keys(leg.unlocked || {}),
      chronicle: last.name + ' · ' + last.ending + ' · ходов ' + last.turns
    };
  });
  console.log(stamp(), 'летопись:', JSON.stringify(legend));
  console.log(stamp(), 'ошибки страницы:', errors.length ? errors.slice(0, 5) : 'нет');

  const ok = done === 'цель взята' && epilogue && /\+3/.test((epilogue.stats || []).join(' '))
    && legend.victories === 1 && legend.runs === 1 && errors.length === 0;
  console.log('ИТОГ:', ok ? '✓ победа в игре закрывается финалом, летопись записана' : 'проверить выше');
  await browser.close();
  process.exitCode = ok ? 0 : 1;
})();
