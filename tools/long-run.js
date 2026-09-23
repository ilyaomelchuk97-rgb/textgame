/**
 * tools/long-run.js — тридцать ходов без ошибок страницы.
 *
 * Смысл: короткий smoke проверяет, что игра открылась, а длинная дистанция —
 * что она не разваливается: память не растёт до отказа, арка двигается,
 * журнал и карта наполняются, метрики считаются, книга дочитывается до конца.
 *
 *   node tools/long-run.js [url] [--turns=30]
 */
const { chromium, devices } = require('playwright');

const argTurns = process.argv.find(a => a.startsWith('--turns='));
const TURNS = argTurns ? Number(argTurns.split('=')[1]) : 30;
const BASE = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2] : 'http://localhost:3000/game.html';

const SCENE = (i) => 'Ты входишь в трапезную: пыль висит в косом свете, на столе — чужая карта и обломок мела. ' +
  'Мара не оборачивается и говорит тише, чем нужно: «Ход номер ' + i + ' — и мы уже не одни».';

const TURN = (i) => ({
  scene: SCENE(i),
  chapter: i < 5 ? 'Глава I' : (i < 12 ? 'Глава II' : 'Глава III'),
  place: i < 6 ? 'Трапезная' : (i < 14 ? 'Северный тракт' : 'Развалины маяка'),
  npc: i % 3 === 0 ? 'Мара' : '',
  npcObject: i % 3 === 0 ? { name: 'Мара', role: 'караванщица', line: '«Иди за мной, тихо»' } : null,
  thread: i % 4 === 1 ? 'обещание вернуть долг' : '',
  progress: i % 5 === 0,
  imagePrompt: 'dusty dining hall with a map on the table, hooded hero in the foreground, warm light',
  options: [
    { text: 'Спросить про карту', stat: 'per', difficulty: 'medium' },
    { text: 'Обойти стол кругом', stat: 'agi', difficulty: 'easy' },
    { text: 'Позвать хозяйку', stat: 'cha', difficulty: 'hard' }
  ],
  // раз в три хода герою достаётся передышка: длинную дистанцию проверяем
  // на живой истории, а не на бесконечной агонии
  effects: i % 3 === 0 ? { hp: 1 } : {}
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();
  const errors = [];
  const requests = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  page.on('request', r => requests.push(r.url()));

  // Мастер отвечает локально: длинную дистанцию проверяем без сети и без ключей.
  let turnNo = 0;
  await page.route('**/api/gm/stream*', route => route.abort());   // сначала поток, иначе не попадёт
  await page.route('**/api/gm', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify(TURN(++turnNo)) })
  }));
  await page.route('**/api/image**', route => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
  }));
  await page.route('**/api/tts**', route => route.abort());

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Долгий');
  await page.click('#class-list .arch-card:nth-child(2)');
  await page.click('#race-list .chip:nth-child(3)');
  await page.click('#origin-list .arch-card:nth-child(2)');
  await page.click('#screen-hero [data-act="start-adventure"]');

  // вопрос о начале истории: отвечаем «пусть решает мастер»
  await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 15000 });
  await page.click('#modal .btn--ghost');
  await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 30000 });
  await page.click('[data-act="close-prologue"], .prologue__go').catch(() => {});
  await page.waitForTimeout(400);

  // закрываем всё, что могло всплыть поверх сцены: кубик, пролог, эпилог
  async function clearOverlays(page) {
    await page.evaluate(() => {
      const dice = document.getElementById('dice-overlay');
      if (dice && !dice.hidden) { try { dice.click(); } catch (e) {} dice.hidden = true; }
      const pro = document.getElementById('prologue');
      if (pro && !pro.hidden) { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); }
      const epi = document.getElementById('epilogue');
      if (epi && !epi.hidden) { const b = document.querySelector('[data-act="close-epilogue"]'); if (b) b.click(); }
      const modal = document.getElementById('modal');
      if (modal && !modal.hidden) { const b = modal.querySelector('.btn'); if (b) b.click(); }
    });
    await page.waitForTimeout(90);
  }

  const turns = [];
  for (let i = 0; i < TURNS; i++) {
    await clearOverlays(page);
    const buttons = await page.$$('#actions .action-btn:not(.action-btn--ghost)');
    if (!buttons.length) break;
    await buttons[i % buttons.length].click().catch(() => {});
    // бросок кубика и пролог могут появиться в любой момент хода
    for (let k = 0; k < 40; k++) {
      const ready = await page.evaluate(() => {
        const dice = document.getElementById('dice-overlay');
        const pro = document.getElementById('prologue');
        const epi = document.getElementById('epilogue');
        return (dice && !dice.hidden) || (pro && !pro.hidden && pro.classList.contains('is-open')) || (epi && !epi.hidden);
      });
      if (ready) await clearOverlays(page);
      const count = await page.evaluate(() => document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)').length);
      const busy = await page.evaluate(() => !!(window.DTstate && window.DTstate().busy));
      if (!busy && count) break;
      await page.waitForTimeout(150);
    }
    // текст сцены берём из состояния: печать по буквам — это оформление,
    // а не признак пустой сцены
    const state = await page.evaluate(() => {
      const g = window.DTstate ? window.DTstate() : {};
      const opts = Array.from(document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)')).length;
      const epi = document.getElementById('epilogue');
      return {
        turn: g.turn || 0, opts,
        len: String(g.scene || '').trim().length,
        domLen: ((document.querySelector('.scene-text__body') || {}).textContent || '').trim().length,
        over: !!(epi && !epi.hidden)
      };
    });
    turns.push(state);
    if (state.turn >= TURNS) break;
  }

  // экраны прогресса: журнал, карта, забег
  const screens = {};
  const screenNow = await page.evaluate(() => document.body.dataset.screen || '');
  for (const [act, id, sel] of [['open-journal', 'journal', '#journal-body'],
                                 ['open-map', 'map', '#map-list'],
                                 ['open-run', 'run', '#run-body']]) {
    // кнопки экранов живут в панели сцены: нажимаем через DOM, чтобы не зависеть от прокрутки
    await page.evaluate(a => { const b = document.querySelector('[data-act="' + a + '"]'); if (b) b.click(); }, act);
    await page.waitForTimeout(200);
    screens[id] = await page.evaluate(sel => {
      const el = document.querySelector(sel);
      if (!el) return { visible: false, chars: 0 };
      return { visible: !el.hidden, chars: (el.textContent || '').replace(/\s+/g, ' ').trim().length };
    }, sel);
    await page.evaluate(() => { const b = document.querySelector('[data-act="back-game"]'); if (b) b.click(); });
    await page.waitForTimeout(140);
  }

  const metrics = await page.evaluate(() => JSON.parse(localStorage.getItem('dt2:metrics') || '{}'));
  const memory = await page.evaluate(() => {
    const g = window.DTstate ? window.DTstate() : {};
    return { turn: g.turn, scene: (g.scene || '').length };
  });

  // книга-игра: читаем до конца
  await clearOverlays(page);
  await page.click('[data-act="close-game"]').catch(() => {});
  await page.waitForSelector('#modal:not([hidden])', { timeout: 8000 }).catch(() => {});
  await page.click('#modal .btn--primary').catch(() => {});
  await page.waitForTimeout(300);
  await page.click('[data-act="open-books"]');
  await page.waitForSelector('#books-list .book-card', { timeout: 8000 });
  await page.click('#books-list .book-card:first-child .btn');
  await page.waitForSelector('#actions .action-btn', { timeout: 8000 });
  let bookSteps = 0;
  for (let i = 0; i < 25; i++) {
    const btns = await page.$$('#actions .action-btn');
    if (!btns.length) break;
    const label = await btns[0].textContent();
    await btns[0].click();
    await page.waitForTimeout(120);
    bookSteps++;
    if (/читать итог/.test(label || '')) break;
  }
  const bookEnd = await page.evaluate(() => ({
    open: !document.getElementById('epilogue').hidden,
    title: (document.getElementById('epilogue-title') || {}).textContent || ''
  }));

  await browser.close();

  /* ------------------------------ отчёт ------------------------------ */
  const bad = [];
  const empty = turns.filter(t => !t.len);
  const notThree = turns.filter(t => t.opts !== 3);
  if (errors.length) bad.push('ошибок страницы: ' + errors.length + ' → ' + errors.slice(0, 3).join(' | '));
  if (turns.length < Math.min(TURNS, 10)) bad.push('ходов прошло мало: ' + turns.length);
  const ended = turns.some(t => t.over);
  if (empty.length) bad.push('пустых сцен: ' + empty.length);
  if (notThree.length) bad.push('ходов без трёх вариантов: ' + notThree.length);
  Object.keys(screens).forEach(k => {
    if (!screens[k].visible) bad.push('экран ' + k + ' не открылся');
    else if (screens[k].chars < 40) bad.push('экран ' + k + ' пустой (' + screens[k].chars + ' символов)');
  });
  if (!metrics.turns) bad.push('метрики не считаются');
  if (!bookBook(bookEnd, bad)) { /* уже добавили причину */ }

  console.log('=== Длинный прогон: ' + turns.length + ' ходов (экран: ' + screenNow + ') ===');
  console.log('  ошибок страницы: ' + errors.length + (errors.length ? ' → ' + errors.slice(0, 2).join(' | ') : ''));
  console.log('  вариантов в ходах: ' + (notThree.length ? 'НЕ ВЕЗДЕ ТРИ' : 'везде три'));
  console.log('  журнал: ' + screens.journal.chars + ' символов · карта: ' + screens.map.chars +
    ' · забег: ' + screens.run.chars);
  console.log('  метрики: ходов ' + (metrics.turns || 0) + ', кадров ' + (metrics.images || 0) +
    ', без канала ' + (metrics.offline || 0));
  console.log('  память кампании: ход ' + memory.turn + ', сцена ' + memory.scene + ' символов');
  console.log('  книга: шагов ' + bookSteps + ', финал ' + (bookEnd.open ? '«' + bookEnd.title.trim() + '»' : 'не дошёл'));
  const unique = new Set(requests.filter(u => /\/api\//.test(u)).map(u => u.split('?')[0]));
  console.log('  запросов к ИИ: ' + requests.filter(u => /\/api\/(gm|image|tts)/.test(u)).length +
    ' (' + Array.from(unique).join(', ') + ')');
  console.log(bad.length ? '\nПРОБЛЕМЫ:\n  ✗ ' + bad.join('\n  ✗ ') : '\nДлинная дистанция пройдена без замечаний');
  process.exitCode = bad.length ? 1 : 0;

  function bookBook(end, list) {
    if (!end.open) { list.push('книга не дошла до концовки'); return false; }
    if (!/Пепел|перегон|итог/i.test(end.title)) { list.push('странный заголовок финала: ' + end.title); return false; }
    return true;
  }
})();
