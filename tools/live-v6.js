/**
 * Живой прогон v6: свой мир → герой мастера → игра → ходы, память, слои.
 * Запуск: node tools/live-v6.js [url]
 */
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:3000/index.html';
const shot = (page, name) => page.screenshot({ path: 'shots/' + name, fullPage: false });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/403|404|Failed to load resource/.test(m.text())) errors.push('CONSOLE: ' + m.text()); });

  const t0 = Date.now();
  const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
  const note = async () => (await page.$('#hero-profile-text')) ? (await page.textContent('#hero-profile-text')) : '';

  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);

  await page.click('[data-act="new-game"]');
  await page.waitForTimeout(500);
  await page.click('[data-mode="custom"]');
  await page.waitForTimeout(300);
  await page.fill('#wc-title', 'Ржавые Пески Кар-Адама');
  await page.fill('#wc-goal', 'найти пропавший караван');
  await page.click('[data-act="create-custom-world"]');

  // экран героя: сразу видны варианты, мастер догоняет
  await page.waitForSelector('#screen-hero:not([hidden])', { timeout: 8000 });
  console.log(stamp(), 'экран героя открыт, строка:', (await note()).slice(0, 70));
  const firstClass = async () => (await page.$('#class-list .arch-card__title')) ? await page.textContent('#class-list .arch-card__title') : '';
  console.log(stamp(), 'стартовый набор:', await firstClass());
  await shot(page, 'v6-01-hero-opening.png');

  let heroFromAI = false;
  for (let i = 0; i < 40; i++) {
    const txt = await note();
    if (/Мастер[:\s]/.test(txt) && !/придумывает|строит|занят/.test(txt)) { heroFromAI = true; break; }
    await page.waitForTimeout(1000);
  }
  console.log(stamp(), 'набор героя:', await firstClass(), '| строка:', (await note()).slice(0, 80));
  const labels = await page.evaluate(() => ({
    class: (document.querySelector('#label-class') || {}).textContent,
    race: (document.querySelector('#label-race') || {}).textContent,
    origin: (document.querySelector('#label-origin') || {}).textContent,
    classes: document.querySelectorAll('#class-list .arch-card').length,
    races: document.querySelectorAll('#race-list .chip').length,
    origins: document.querySelectorAll('#origin-list .arch-card').length,
    legacy: (document.querySelector('#hero-legacy') || {}).hidden
  }));
  console.log(stamp(), 'шаги:', JSON.stringify(labels));
  // связность набора: у каждого класса числа и приём, у вида — черта, у происхождения — предмет и крючок
  const heroSet = await page.evaluate(() => ({
    classes: Array.from(document.querySelectorAll('#class-list .arch-card')).slice(0, 4).map(c => ({
      title: (c.querySelector('.arch-card__title') || {}).textContent,
      hint: (c.querySelector('.arch-card__blurb') || {}).textContent,
      bonus: (c.querySelector('.arch-card__bonus') || {}).textContent.replace(/\s+/g, ' ').trim(),
      ability: (c.querySelector('.arch-card__ability') || {}).textContent.replace(/\s+/g, ' ').trim().slice(0, 70)
    })),
    races: Array.from(document.querySelectorAll('#race-list .chip')).slice(0, 3).map(c => c.textContent.replace(/\s+/g, ' ').trim().slice(0, 70)),
    origins: Array.from(document.querySelectorAll('#origin-list .arch-card')).slice(0, 3).map(o => o.textContent.replace(/\s+/g, ' ').trim().slice(0, 90))
  }));
  console.log(stamp(), 'набор героя:', JSON.stringify(heroSet, null, 1));
  await shot(page, 'v6-02-hero-ready.png');

  // «Другой набор»: мастер придумывает заново и не повторяет прошлое
  if (heroFromAI) {
    const titlesNow = async () => page.evaluate(() => Array.from(document.querySelectorAll('#class-list .arch-card__title')).map(x => x.textContent).join(' | '));
    const beforeReroll = await titlesNow();
    await page.click('#hero-reroll');
    const tReroll = Date.now();
    let afterReroll = beforeReroll;
    for (let i = 0; i < 60; i++) {
      afterReroll = await titlesNow();
      if (afterReroll !== beforeReroll) break;
      await page.waitForTimeout(1000);
    }
    console.log(((Date.now() - t0) / 1000).toFixed(1) + 'с', 'перебор за', ((Date.now() - tReroll) / 1000).toFixed(1) + 'с:', afterReroll === beforeReroll ? 'набор не сменился (канал занят) · ' + (await note()).slice(0, 70) : 'новый набор: ' + afterReroll);
    await shot(page, 'v6-02b-reroll.png');
  }

  // ждём мир от мастера (он приходит после героя)
  let worldReady = false;
  for (let i = 0; i < 90; i++) {
    const pending = await page.evaluate(() => !!(document.querySelector('#hero-profile-text') || {}).textContent);
    if (pending) { worldReady = true; }
    await page.waitForTimeout(1000);
    if (i > 8 && !(await note()).includes('мир')) break;
  }
  console.log(stamp(), 'строка после мира:', (await note()).slice(0, 90));

  await page.fill('#hero-name', 'Каин');
  await page.click('[data-act="start-adventure"]');
  await page.waitForSelector('#screen-game:not([hidden])', { timeout: 60000 });
  console.log(stamp(), 'игровой экран открыт');
  // пролог закрываем — он перекрывает сцену
  if (await page.$('#prologue:not([hidden])')) {
    await shot(page, 'v6-03-prologue.png');
    await page.click('[data-act="close-prologue"]');
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(2500);
  const game = await page.evaluate(() => {
    const text = (document.querySelector('#scene-text') || {}).textContent || '';
    const save = JSON.parse(localStorage.getItem('dt2:game:' + (localStorage.getItem('dt2:index') ? (JSON.parse(localStorage.getItem('dt2:index'))[0] || {}).id : '')) || '{}');
    return {
      title: (document.querySelector('#game-title') || {}).textContent,
      sub: (document.querySelector('#game-sub') || {}).textContent,
      chapter: (document.querySelector('#scene-chapter') || {}).textContent,
      scene: text.slice(0, 140),
      options: document.querySelectorAll('#actions .action-btn').length,
      theme: document.body.dataset.theme,
      avatarHidden: !!(document.querySelector('#game-avatar') || {}).hidden,
      actors: !!document.querySelector('#scene-actors'),
      speakHidden: !!(document.querySelector('#speak-btn') || {}).hidden,
      heroClass: save.hero && save.hero.className,
      heroAbility: save.hero && save.hero.ability && save.hero.ability.name,
      memory: save.memory && { place: save.memory.place, npcs: (save.memory.npcs || []).length, facts: (save.memory.facts || []).length },
      worldHero: save.scenarioId,
      styleId: save.style && save.style.id
    };
  });
  console.log(stamp(), 'игра:', JSON.stringify(game, null, 1));
  await shot(page, 'v6-04-game.png');

  // ход: кубик + сцена
  const TURNS = Number(process.env.TURNS || 2);
  for (let turn = 1; turn <= TURNS; turn++) {
    const before = await page.evaluate(() => (document.querySelector('#scene-text') || {}).textContent || '');
    const btn = await page.$('#actions .action-btn');
    if (!btn) { console.log(stamp(), 'кнопок действий нет'); break; }
    await btn.click();
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
          scene: ov ? ('dice-scene ' + (ov.querySelector('.dice-scene') ? ov.querySelector('.dice-scene').className : '')).trim() : ''
        };
      });
      if (state.open && state.value) { dice = state; break; }
      await page.waitForTimeout(200);
    }
    console.log(stamp(), 'бросок ' + turn + ':', JSON.stringify(dice));
    if (turn === 1 && dice) await shot(page, 'v6-05-dice.png');
    // ждём, пока кубик уйдёт сам
    for (let i = 0; i < 40; i++) {
      const open = await page.evaluate(() => { const ov = document.querySelector('#dice-overlay'); return !!(ov && !ov.hidden); });
      if (!open) break;
      await page.waitForTimeout(250);
    }
    let prev = '';
    let sawStreaming = false;
    for (let i = 0; i < 120; i++) {
      const state = await page.evaluate(() => ({
        text: (document.querySelector('#scene-text') || {}).textContent || '',
        streaming: !!document.querySelector('#scene-text .is-streaming'),
        busy: !!document.querySelector('#game-status:not([hidden])'),
        ghosts: document.querySelectorAll('#actions .action-btn--ghost').length,
        options: document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)').length
      }));
      if (state.streaming) sawStreaming = true;
      const settled = !state.streaming && !state.busy && state.ghosts === 0 && state.options > 0;
      if (settled && state.text === prev && state.text !== before) break;
      prev = state.text;
      await page.waitForTimeout(600);
    }
    const after = await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('dt2:game:' + (JSON.parse(localStorage.getItem('dt2:index'))[0] || {}).id) || '{}');
      return {
        scene: ((document.querySelector('#scene-text') || {}).textContent || '').slice(0, 120),
        options: document.querySelectorAll('#actions .action-btn').length,
        turn: save.turn,
        memory: save.memory && { place: save.memory.place, npcs: (save.memory.npcs || []).length, openings: (save.memory.openings || []).length, deeds: (save.memory.deeds || []).length },
        chapter: (document.querySelector('#scene-chapter') || {}).textContent,
        imageKey: (save.scene && save.scene.placeKey) || ''
      };
    });
    after.streamingSeen = sawStreaming;
    console.log(stamp(), 'ход ' + turn + ':', JSON.stringify(after, null, 1));
  }
  await shot(page, 'v6-06-after-turns.png');

  // «Мои игры» → настройки: правила, озвучка, тема
  await page.click('[data-act="close-game"]');
  await page.waitForTimeout(500);
  const leave = await page.$('#modal-box .btn--primary');
  if (leave) { await leave.click(); await page.waitForTimeout(600); }

  await page.click('[data-act="settings"]');
  await page.waitForTimeout(500);
  const settings = await page.evaluate(() => ({
    rows: document.querySelectorAll('#modal-box .rules-row').length,
    buttons: Array.from(document.querySelectorAll('#modal-box .rules-btn')).map(b => b.textContent).slice(0, 8)
  }));
  console.log(stamp(), 'настройки:', JSON.stringify(settings));
  await shot(page, 'v6-07-settings.png');
  const push = async label => {
    // модалка перерисовывается после нажатия, поэтому кликаем прямо в странице
    const found = await page.evaluate(l => {
      const b = Array.from(document.querySelectorAll('#modal-box .rules-btn')).find(x => x.textContent.trim() === l);
      if (!b) return false;
      b.click();
      return true;
    }, label);
    if (!found) { console.log('нет кнопки', label); return; }
    await page.waitForTimeout(700);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('dt2:settings') || '{}'));
    console.log(stamp(), 'настройки →', label, ':', JSON.stringify({ tone: st.tone, rating: st.rating, theme: st.theme, voice: st.voice, ambient: st.ambient }));
    for (let i = 0; i < 20; i++) {
      const open = await page.evaluate(() => { const m = document.querySelector('#modal'); return !!(m && !m.hidden); });
      if (open) break;
      await page.waitForTimeout(200);
    }
  };
  await push('С иронией');
  await push('Жёстко');
  await push('🗣 Озвучка сцены');
  await push('Чёрная');
  const themeNow = await page.evaluate(() => document.body.dataset.theme);
  console.log(stamp(), 'тема страницы:', themeNow);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* --- эпилог: подкладываем сохранение о погибшем герое --- */
  const patched = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
    const key = 'dt2:game:' + (idx[0] || {}).id;
    const g = JSON.parse(localStorage.getItem(key));
    g.over = true;
    g.ending = 'downfall';
    g.questDone = false;
    g.hero.hp = 0;
    g.memory = g.memory || {};
    g.memory.facts = ['мост сожжён', 'караванщик Мара обещал помочь'];
    g.memory.npcs = [{ name: 'Мара', role: 'караванщица', attitude: 'союз', seen: 2 }];
    g.legacyApplied = false;
    localStorage.setItem(key, JSON.stringify(g));
    localStorage.removeItem('dt2:legacy');
    return { key, turn: g.turn };
  });
  console.log(stamp(), 'сохранение о падении подготовлено:', JSON.stringify(patched));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);
  await page.click('[data-act="my-games"]');
  await page.waitForTimeout(600);
  const card = await page.$('#saves-list .save-card .btn--primary');
  if (card) {
    console.log(stamp(), 'кнопка сохранения:', await page.evaluate(() => (document.querySelector('#saves-list .btn--primary') || {}).textContent));
    await card.click();
    await page.waitForTimeout(1500);
    const firstScene = await page.$('#prologue:not([hidden]) [data-act="close-prologue"]');
    if (firstScene) { await firstScene.click(); await page.waitForTimeout(400); }
    let epi = null;
    for (let i = 0; i < 60; i++) {
      epi = await page.evaluate(() => {
        if (!document.querySelector('.epilogue__stat')) return null;
        const box = document.querySelector('#epilogue');
        if (!box || box.hidden) return null;
        return {
          title: (document.querySelector('#epilogue-title') || {}).textContent,
          text: ((document.querySelector('#epilogue-body') || {}).textContent || '').slice(0, 260),
          stats: Array.from(document.querySelectorAll('.epilogue__stat')).map(x => x.textContent),
          legacy: localStorage.getItem('dt2:legacy')
        };
      });
      if (epi) break;
      await page.waitForTimeout(500);
    }
    console.log(stamp(), 'эпилог:', JSON.stringify(epi, null, 1));
    await shot(page, 'v6-08-epilogue.png');
    if (epi) {
      const leg = JSON.parse(epi.legacy || '{}');
      console.log(stamp(), 'наследие после кампании:', JSON.stringify({ runs: leg.runs, defeats: leg.defeats, ashes: leg.ashes, heroes: (leg.heroes || []).length, unlocked: Object.keys(leg.unlocked || {}) }));
    }
    const stay = await page.$('[data-act="epilogue-saves"]');
    if (stay) { await stay.click(); await page.waitForTimeout(600); }
    console.log(stamp(), 'после закрытия эпилога экраны:', await page.evaluate(() => document.body.dataset.screen));
  } else {
    console.log('карточка сохранения не найдена');
  }

  // экран героя с наследием: новая игра видит прошлую жизнь
  await page.evaluate(() => {
    const b = document.querySelector('#screen-saves [data-act="new-game"]');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await page.click('[data-mode="custom"]');
  await page.waitForTimeout(300);
  await page.fill('#wc-title', 'Пепел Астры');
  await page.click('[data-act="create-custom-world"]');
  await page.waitForSelector('#screen-hero:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(1500);
  const legacyLine = await page.evaluate(() => {
    const el = document.querySelector('#hero-legacy');
    return { hidden: !!(el && el.hidden), text: ((el || {}).textContent || '').slice(0, 160) };
  });
  console.log(stamp(), 'наследие на экране героя:', JSON.stringify(legacyLine));
  await shot(page, 'v6-09-legacy-hero.png');

  // второй конец истории: цель взята — финал, +3 пепла и «дошёл до конца» в летописи.
  // патчим сейв после перезагрузки: приложение в этот момент ещё не держит игру в памяти
  // и не перезапишет сохранение своим автосейвом.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const winPatch = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
    const key = 'dt2:game:' + (idx[0] || {}).id;
    const g = JSON.parse(localStorage.getItem(key) || 'null');
    if (!g) return null;
    g.questDone = true;
    g.over = false;
    g.ending = '';
    g.endingSeen = false;
    g.legacyApplied = false;
    g.hero.hp = g.hero.maxHp || 12;
    g.memory = g.memory || {};
    g.memory.deeds = (g.memory.deeds || []).concat(['цель истории достигнута']);
    localStorage.setItem(key, JSON.stringify(g));
    const idx2 = JSON.parse(localStorage.getItem('dt2:index') || '[]');
    if (idx2[0]) { idx2[0].over = false; localStorage.setItem('dt2:index', JSON.stringify(idx2)); }
    return { key, turn: g.turn, hp: g.hero.hp, over: !!idx2[0] && idx2[0].over };
  });
  console.log(stamp(), 'сейв с взятой целью:', JSON.stringify(winPatch));
  if (winPatch) {
    await page.click('[data-act="my-games"]');
    await page.waitForTimeout(600);
    await page.waitForSelector('#saves-list .save-card .btn--primary', { timeout: 8000 }).catch(() => {});
    const winCard = await page.$('#saves-list .save-card .btn--primary');
    console.log(stamp(), 'карточка победного сейва:', await page.evaluate(() => ((document.querySelector('#saves-list .save-card .btn--primary') || {}).textContent || 'нет')), winCard ? 'ok' : 'не найдена');
    if (winCard) await winCard.click();
    await page.waitForTimeout(1500);
    const firstScene = await page.$('#prologue:not([hidden]) [data-act="close-prologue"]');
    if (firstScene) { await firstScene.click(); await page.waitForTimeout(400); }
    let win = null;
    for (let i = 0; i < 60; i++) {
      win = await page.evaluate(() => {
        const box = document.querySelector('#epilogue');
        if (!box || box.hidden || !document.querySelector('.epilogue__stat')) return null;
        return {
          title: (document.querySelector('#epilogue-title') || {}).textContent,
          text: ((document.querySelector('#epilogue-body') || {}).textContent || '').slice(0, 200),
          stats: Array.from(document.querySelectorAll('.epilogue__stat')).map(x => x.textContent),
          unlock: ((document.querySelector('.epilogue__unlock') || {}).textContent || '').slice(0, 120),
          legacy: localStorage.getItem('dt2:legacy')
        };
      });
      if (win) break;
      await page.waitForTimeout(500);
    }
    // текст мастера приходит следом за числами: ждём, пока заглушка сменится
    if (win) {
      for (let i = 0; i < 50; i++) {
        const text = await page.evaluate(() => ((document.querySelector('#epilogue-body') || {}).textContent || ''));
        if (text && !/дописывает/.test(text)) break;
        await page.waitForTimeout(500);
      }
      win = await page.evaluate(() => {
        const box = document.querySelector('#epilogue');
        if (!box || box.hidden) return null;
        return {
          title: (document.querySelector('#epilogue-title') || {}).textContent,
          text: ((document.querySelector('#epilogue-body') || {}).textContent || '').slice(0, 200),
          stats: Array.from(document.querySelectorAll('.epilogue__stat')).map(x => x.textContent),
          unlock: ((document.querySelector('.epilogue__unlock') || {}).textContent || '').slice(0, 120)
        };
      });
    }
    console.log(stamp(), 'финал с взятой целью:', JSON.stringify(win, null, 1));
    await shot(page, 'v6-10-victory.png');
    const closeWin = await page.$('[data-act="close-epilogue"]');
    if (closeWin) { await closeWin.click(); await page.waitForTimeout(600); }
    const legend = await page.evaluate(() => {
      const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
      const g = JSON.parse(localStorage.getItem('dt2:game:' + (idx[0] || {}).id) || '{}');
      const leg = JSON.parse(localStorage.getItem('dt2:legacy') || '{}');
      const last = (leg.heroes || [])[0] || {};
      return {
        ending: g.ending, questDone: !!g.questDone, endingSeen: !!g.endingSeen,
        runs: leg.runs, victories: leg.victories, defeats: leg.defeats, ashes: leg.ashes,
        unlocked: Object.keys(leg.unlocked || {}),
        chronicle: last.name + ' · ' + last.ending + ' · ходов ' + last.turns
      };
    });
    console.log(stamp(), 'летопись после победы:', JSON.stringify(legend));
  }

  console.log(stamp(), 'ошибки страницы:', errors.length ? errors.slice(0, 6) : 'нет');
  console.log('ИТОГ:', errors.length === 0 && heroFromAI ? '✓' : 'проверить выше');
  await browser.close();
})();
