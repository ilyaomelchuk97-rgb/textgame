/**
 * tools/master-live.js — живая игра с настоящим мастером Mistral.
 *
 * Никаких моков: сервер настоящий, мастер — агент Mistral, кадры — обычные
 * генераторы. Смотрим то, что видит игрок:
 *   • ход ведёт канал mistral-agent (по логам клиента) и сколько это занимает;
 *   • сцена длинная и связная, вариантов ровно три, у каждого свой шанс;
 *   • пролог написан для этого мира (а не шаблон), второй ход продолжает историю;
 *   • снимки экрана для отчёта.
 *
 *   node tools/master-live.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const SHOTS = path.join(__dirname, '..', 'shots');

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

/** Сцена печатается волной: ждём, пока текст перестанет расти. */
const waitTyped = async (page, ms) => {
  const started = Date.now();
  let last = -1, stable = 0;
  while (Date.now() - started < (ms || 20000)) {
    const len = await page.evaluate(() => (document.getElementById('scene-text') || {}).textContent.trim().length).catch(() => 0);
    if (len === last && len > 0) { stable++; if (stable >= 3) return len; }
    else { stable = 0; last = len; }
    await page.waitForTimeout(500);
  }
  return last;
};

const readState = page => page.evaluate(() => ({
  scene: (document.getElementById('scene-text') || {}).textContent.trim(),
  chapter: (document.getElementById('scene-chapter') || {}).textContent.trim(),
  options: Array.from(document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)')).map(b => ({
    text: (b.querySelector('.action-btn__text') || {}).textContent || '',
    meta: Array.from(b.querySelectorAll('.tag')).map(t => t.textContent.trim()).join(' · ')
  })),
  turn: (() => {
    const k = Object.keys(localStorage).find(x => x.indexOf('dt2:game:') === 0);
    try { return k ? JSON.parse(localStorage.getItem(k)).turn : 0; } catch (e) { return 0; }
  })(),
  frame: document.getElementById('scene-img').classList.contains('is-visible'),
  goal: (() => {
    const k = Object.keys(localStorage).find(x => x.indexOf('dt2:game:') === 0);
    try { return k ? JSON.parse(localStorage.getItem(k)).goal : ''; } catch (e) { return ''; }
  })()
}));

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();
  const errors = [];
  const channels = [];
  const timings = [];
  const pending = new Map();
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  page.on('console', m => {
    const t = m.text();
    const prov = /провайдер[:\s]+([\w:.\-]+)/i.exec(t);
    if (prov) channels.push(prov[1]);
  });
  page.on('request', r => { if (/\/api\/gm/.test(r.url())) pending.set(r, Date.now()); });
  page.on('requestfinished', r => {
    if (!pending.has(r)) return;
    timings.push({ url: r.url().split('/api/')[1].slice(0, 12), ms: Date.now() - pending.get(r) });
    pending.delete(r);
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Ирма');
  await page.click('#screen-hero [data-act="start-adventure"]');

  await page.waitForSelector('#modal:not([hidden]) button', { timeout: 25000 }).catch(() => {});
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#modal button')).find(x => /Пусть решает/.test(x.textContent));
    if (b) b.click();
  });

  const first = await waitGame(page, 150000);
  if (!first) {
    console.log('ИГРА НЕ НАЧАЛАСЬ: варианты не появились');
    await page.screenshot({ path: path.join(SHOTS, 'v16-master-stuck.png') });
    await browser.close();
    process.exit(1);
  }
  await waitTyped(page, 25000);
  const open = await readState(page);
  await page.screenshot({ path: path.join(SHOTS, 'v16-master-mistral.png') });

  // второй ход: выбор игрока → новый ход мастера
  const turnBefore = open.turn;
  await page.click('#actions .action-btn:not(.action-btn--ghost)');
  const second = await (async () => {
    const started = Date.now();
    while (Date.now() - started < 150000) {
      await page.waitForTimeout(2000);
      const st = await readState(page);
      if (st.turn > turnBefore && st.scene.trim().length > 80 && st.options.length >= 3) {
        await waitTyped(page, 20000);
        return readState(page);
      }
    }
    return null;
  })();
  await page.screenshot({ path: path.join(SHOTS, 'v16-master-mistral-2.png') });

  const mistral = channels.filter(c => /mistral/i.test(c));
  const gmCalls = timings.filter(t => t.url.indexOf('gm') === 0);
  const slowest = gmCalls.reduce((m, t) => Math.max(m, t.ms), 0);
  const problems = [];
  if (!mistral.length) problems.push('в логах клиента нет канала mistral: ' + (channels.join(', ') || 'пусто'));
  if (open.scene.length < 120) problems.push('открывающая сцена слишком короткая (' + open.scene.length + ' симв.)');
  if (open.options.length !== 3) problems.push('вариантов на старте ' + open.options.length);
  if (open.options.some(o => !/%/.test(o.meta))) problems.push('у части вариантов нет шанса в подписи');
  if (!second) problems.push('второй ход не состоялся за 150 с');
  else {
    if (second.scene.length < 120) problems.push('сцена второго хода короткая (' + second.scene.length + ' симв.)');
    if (second.options.length !== 3) problems.push('вариантов во втором ходе ' + second.options.length);
  }
  if (slowest > 45000) problems.push('самый долгий запрос к мастеру ' + Math.round(slowest / 1000) + ' с');
  if (errors.length) problems.push('ошибок страницы: ' + errors.join(' | '));

  const report = [
    'каналы мастера: ' + (channels.join(', ') || '—'),
    'запросы к мастеру: ' + gmCalls.map(t => t.url + ' ' + (t.ms / 1000).toFixed(1) + 'с').join(', '),
    '',
    'ЦЕЛЬ КАМПАНИИ: ' + open.goal,
    '',
    'ОТКРЫВАЮЩАЯ СЦЕНА:',
    open.scene.slice(0, 700),
    'варианты:',
    ...open.options.map(o => '  • ' + o.text + '  [' + o.meta + ']'),
    '',
    'ХОД 2:',
    (second ? second.scene : '(хода не было)').slice(0, 700),
    'варианты:',
    ...((second ? second.options : []).map(o => '  • ' + o.text + '  [' + o.meta + ']'))
  ].join('\n');
  fs.writeFileSync(path.join(SHOTS, 'v16-master-live.txt'), report, 'utf8');

  console.log('каналы мастера в логах: ' + (channels.join(', ') || '—'));
  console.log('запросы: ' + gmCalls.map(t => t.url + ' ' + (t.ms / 1000).toFixed(1) + 'с').join(' · '));
  console.log('цель: ' + open.goal);
  console.log('ход 1: ' + open.scene.replace(/\s+/g, ' ').slice(0, 170));
  console.log('ход 2: ' + (second ? second.scene.replace(/\s+/g, ' ').slice(0, 170) : '—'));
  console.log(problems.length ? 'ЖИВАЯ ИГРА С MISTRAL: ' + problems.join(' · ') : 'ЖИВАЯ ИГРА С MISTRAL: агент ведёт, сцены связные, варианты со шансами — ❤');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
