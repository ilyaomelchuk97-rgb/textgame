/**
 * tools/glm-browser.js — живая игра в браузере, где игрок САМ выбирает GLM ведущим.
 *
 * Никаких моков: настоящий сервер и настоящий ключ Zhipu. Проверяем то, что видит игрок:
 *   • в настройках есть канал «GLM (Zhipu, бесплатная flash)» и он выбирается пальцем;
 *   • после выбора игра идёт именно через этот канал (по логам клиента);
 *   • сцена длинная и связная, вариантов три, у каждого свой шанс;
 *   • второй ход продолжает историю;
 *   • снимки экрана для отчёта.
 *
 *   node tools/glm-browser.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const SHOTS = path.join(__dirname, '..', 'shots');
// Какой канал выбирает игрок и как называть снимки. По умолчанию GLM, но тот же
// прогон годится для любого ведущего: CHANNEL=hf SHOT=v18-hf npm run master:game
const CHANNEL = String(process.env.CHANNEL || 'glm').toLowerCase();
const SHOT = String(process.env.SHOT || 'v17-glm');
const CHANNEL_TITLE = { glm: /^GLM/i, hf: /^Hugging Face/i, mistral: /^Mistral-агент/i }[CHANNEL] || new RegExp('^' + CHANNEL, 'i');
const LABEL = { glm: 'GLM', hf: 'HUGGING FACE', mistral: 'MISTRAL' }[CHANNEL] || CHANNEL.toUpperCase();

const waitGame = async (page, ms) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const st = await page.evaluate(() => {
      const prologue = document.getElementById('prologue');
      if (prologue && !prologue.hidden) return { prologue: true };
      return {
        actions: document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)').length,
        sceneLen: (document.getElementById('scene-text') || {}).textContent.trim().length,
        turn: (() => {
          const k = Object.keys(localStorage).find(x => x.indexOf('dt2:game:') === 0);
          try { return k ? JSON.parse(localStorage.getItem(k)).turn : 0; } catch (e) { return 0; }
        })()
      };
    }).catch(() => null);
    if (st && st.prologue) {
      await page.evaluate(() => { const b = document.querySelector('#prologue .prologue__go'); if (b) b.click(); });
      await page.waitForTimeout(600);
      continue;
    }
    if (st && st.actions >= 3 && st.sceneLen > 80) return st;
    await page.waitForTimeout(1000);
  }
  return null;
};

const waitTyped = async (page, ms) => {
  const started = Date.now();
  let last = -1, stable = 0;
  while (Date.now() - started < (ms || 30000)) {
    const len = await page.evaluate(() => (document.getElementById('scene-text') || {}).textContent.trim().length).catch(() => 0);
    if (len === last && len > 0) { stable++; if (stable >= 3) return len; }
    else { stable = 0; last = len; }
    await page.waitForTimeout(500);
  }
  return last;
};

const readState = page => page.evaluate(() => ({
  scene: String((document.getElementById('scene-text') || {}).textContent || '').trim(),
  goal: (() => {
    const k = Object.keys(localStorage).find(x => x.indexOf('dt2:game:') === 0);
    try { return k ? JSON.parse(localStorage.getItem(k)).goal || '' : ''; } catch (e) { return ''; }
  })(),
  turn: (() => {
    const k = Object.keys(localStorage).find(x => x.indexOf('dt2:game:') === 0);
    try { return k ? JSON.parse(localStorage.getItem(k)).turn : 0; } catch (e) { return 0; }
  })(),
  options: Array.from(document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)')).map(b => ({
    text: String((b.querySelector('.action-btn__text') || b).textContent || '').trim(),
    meta: String((b.querySelector('.tag--pair') || {}).textContent || '')
  }))
}));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage(Object.assign({}, devices['iPhone 13 mini']));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e).slice(0, 120)));
  const channels = [];
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error' && !/ERR_FAILED|Failed to load/.test(t)) errors.push(t.slice(0, 120));
    const prov = /провайдер[:\s]+([\w:.\-]+)/i.exec(t);      // [dt-api] текст через сервер, провайдер: glm:glm-4.5-flash
    if (prov) channels.push(prov[1]);
  });
  const timings = [];
  const pending = new Map();
  page.on('request', r => { if (/\/api\/gm/.test(r.url())) pending.set(r, Date.now()); });
  page.on('requestfinished', r => {
    if (pending.has(r)) { timings.push({ url: r.url().split('/api/')[1].slice(0, 12), ms: Date.now() - pending.get(r) }); pending.delete(r); }
  });
  page.on('requestfailed', r => {
    if (pending.has(r)) { timings.push({ url: r.url().split('/api/')[1].slice(0, 12), ms: Date.now() - pending.get(r), failed: true }); pending.delete(r); }
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  /* --- 1. игрок выбирает ведущего GLM в настройках --- */
  await page.click('#screen-menu [data-act="settings"]');
  await page.waitForSelector('#modal:not([hidden])');
  await page.waitForTimeout(600);
  const wantSource = CHANNEL_TITLE.source, wantFlags = CHANNEL_TITLE.flags;
  const picked = await page.evaluate(([src, flags]) => {
    const WANT = new RegExp(src, flags);
    const rows = Array.from(document.querySelectorAll('#modal .rules-row--tall'));
    const masterRow = rows[0];
    if (!masterRow) return null;
    // ищем по ЗАГОЛОВКУ кнопки: в подсказках других каналов тоже упоминается GLM
    const btns = Array.from(masterRow.querySelectorAll('.rules-btn'));
    const titleOf = b => String((b.querySelector('.rules-btn__title') || b).textContent || '').trim();
    const btn = btns.find(b => WANT.test(titleOf(b)) && !b.classList.contains('is-off'));
    if (!btn) return null;
    btn.click();
    return titleOf(btn).slice(0, 60);
  }, [wantSource, wantFlags]);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(SHOTS, SHOT + '-settings-picked.png') });
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#modal button')).find(x => /Закрыть|Готово|Назад/.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(400);
  const master = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('dt2:settings') || '{}').master || ''; } catch (e) { return ''; }
  });

  /* --- 2. обычная игра: мир → герой → ход --- */
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Освальд');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#modal:not([hidden]) button', { timeout: 30000 }).catch(() => {});
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#modal button')).find(x => /Пусть решает/.test(x.textContent));
    if (b) b.click();
  });

  const first = await waitGame(page, 180000);
  if (!first) {
    console.log('ИГРА НЕ НАЧАЛАСЬ: варианты не появились');
    await page.screenshot({ path: path.join(SHOTS, SHOT + '-stuck.png') });
    await browser.close();
    process.exit(1);
  }
  await waitTyped(page, 40000);
  const open = await readState(page);
  await page.screenshot({ path: path.join(SHOTS, SHOT + '-master.png') });

  const turnBefore = open.turn;
  await page.click('#actions .action-btn:not(.action-btn--ghost)');
  const second = await (async () => {
    const started = Date.now();
    while (Date.now() - started < 180000) {
      await page.waitForTimeout(2000);
      const st = await readState(page);
      if (st.turn > turnBefore && st.scene.trim().length > 80 && st.options.length >= 3) {
        await waitTyped(page, 30000);
        return readState(page);
      }
    }
    return null;
  })();
  await page.screenshot({ path: path.join(SHOTS, SHOT + '-master-2.png') });

  const gmCalls = timings.filter(t => t.url.indexOf('gm') === 0);
  const slowest = gmCalls.reduce((m, t) => Math.max(m, t.ms), 0);
  const problems = [];
  if (!picked) problems.push('в настройках не нашёлся канал GLM для выбора');
  if (master !== CHANNEL) problems.push('выбор ведущего не сохранился (в настройках «' + (master || '—') + '», ждали ' + CHANNEL + ')');
  if (!channels.some(l => new RegExp(CHANNEL, 'i').test(l))) problems.push('в логах клиента нет канала ' + CHANNEL + ': ' + (channels.join(' | ') || 'пусто'));
  if (open.scene.length < 120) problems.push('открывающая сцена слишком короткая (' + open.scene.length + ' симв.)');
  if (open.options.length !== 3) problems.push('вариантов на старте ' + open.options.length);
  if (open.options.some(o => !/%/.test(o.meta))) problems.push('у части вариантов нет шанса в подписи');
  if (!second) problems.push('второй ход не состоялся за 180 с');
  else {
    if (second.scene.length < 120) problems.push('сцена второго хода короткая (' + second.scene.length + ' симв.)');
    if (second.options.length !== 3) problems.push('вариантов во втором ходе ' + second.options.length);
  }
  if (slowest > 60000) problems.push('самый долгий запрос к мастеру ' + Math.round(slowest / 1000) + ' с');
  if (errors.length) problems.push('ошибок страницы: ' + errors.join(' | '));

  const report = [
    'выбор игрока: ' + (picked || '—') + ' (в настройках master=' + (master || '—') + ')',
    'каналы в логах: ' + (channels.join(' | ') || '—'),
    'запросы к мастеру: ' + gmCalls.map(t => t.url + ' ' + (t.ms / 1000).toFixed(1) + 'с').join(', '),
    '',
    'ЦЕЛЬ КАМПАНИИ: ' + open.goal,
    '',
    'ОТКРЫВАЮЩАЯ СЦЕНА (' + LABEL + '):',
    open.scene.slice(0, 700),
    'варианты:',
    ...open.options.map(o => '  • ' + o.text + '  [' + o.meta + ']'),
    '',
    'ХОД 2:',
    (second ? second.scene : '(хода не было)').slice(0, 700),
    'варианты:',
    ...((second ? second.options : []).map(o => '  • ' + o.text + '  [' + o.meta + ']'))
  ].join('\n');
  fs.writeFileSync(path.join(SHOTS, SHOT + '-browser.txt'), report, 'utf8');

  console.log('выбор игрока: ' + (picked || '—') + ' · master=' + (master || '—'));
  console.log('логи клиента: ' + (channels.join(' | ') || '—'));
  console.log('запросы: ' + gmCalls.map(t => t.url + ' ' + (t.ms / 1000).toFixed(1) + 'с').join(' · '));
  console.log('цель: ' + open.goal);
  console.log('ход 1: ' + open.scene.replace(/\s+/g, ' ').slice(0, 170));
  console.log('ход 2: ' + (second ? second.scene.replace(/\s+/g, ' ').slice(0, 170) : '—'));
  console.log(problems.length
    ? LABEL + ': ' + problems.join(' · ')
    : LABEL + ': канал выбран пальцем, ведёт игру, сцены связные, варианты со шансами — ❤');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
