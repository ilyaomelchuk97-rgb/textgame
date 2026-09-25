/**
 * tools/daily.js — забег дня (п.37): один мир и одни броски на всех.
 *
 * Три части, каждая проверяет своё обещание режима:
 *   1) ЭКРАН И ОБЛАКО — кнопка в меню, код дня, мир, герой, цель, правила,
 *      размеры кнопок и строка «сколько прошли другие» из облака;
 *   2) ПОЛНЫЙ ЗАБЕГ БЕЗ СЕТИ — судьба дня на экране героя, помеченная шапка,
 *      плашка в журнале, кубик из зерна дня и финал со счётом, «облако молчит»,
 *      запись результата на телефоне и возврат к экрану дня;
 *   3) ОБЛАКО ПО-НАСТОЯЩЕМУ — обмен с живым сервером /api/daily: приём очков,
 *      доска дня, место в ней и защита от мусора.
 *
 * Запуск: node tools/daily.js   (нужен сервер на :3000 для статики)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.DAILY_URL || 'http://127.0.0.1:3000/game.html';
const SERVER = 'http://127.0.0.1:3000';
// Проверочный день: далёкое прошлое, каждый прогон свой — чужая доска дня не портится,
// а счёт в проверке не зависит от прошлых прогонов (сервер держит свой список в памяти).
const TEST_DATE = '19' + String(10 + Math.floor(Math.random() * 80)) + '-' +
  String(1 + Math.floor(Math.random() * 12)).padStart(2, '0') + '-' +
  String(1 + Math.floor(Math.random() * 28)).padStart(2, '0');
const DAILY_FILE = path.join(__dirname, '..', 'data', 'daily-runs.json');

/** Убрать следы проверки из хранилища сервера (и до, и после части 3). */
function clearTestDay() {
  try {
    const all = JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8'));
    if (!(TEST_DATE in all)) return false;
    delete all[TEST_DATE];
    fs.writeFileSync(DAILY_FILE, JSON.stringify(all));
    return true;
  } catch (e) { return false; }   // файла ещё нет — и хорошо
}
const stamp = () => new Date().toISOString().slice(14, 19) + 'с';
const checks = [];
const check = (ok, text) => { checks.push({ ok: !!ok, text }); console.log((ok ? '✓ ' : '✗ ') + text); };

/** Доска дня, как её отдаёт сервер: чужие очки, без имён. */
const boardRoute = (date, mine) => ({
  ok: true, date, runs: 12 + (mine ? 1 : 0), best: Math.max(410, mine || 0),
  avg: 236, victory: 4, place: mine ? 5 : 0
});

async function openPage(browser, { cloud, real }) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/ERR_FAILED|Failed to load resource|Access to fetch|429|ERR_ABORTED/.test(text)) return;
    errors.push('CONSOLE: ' + text.slice(0, 200));
  });
  // чужие каналы мертвы всегда: игру ведёт встроенный мастер, ключи не нужны
  await page.route('https://**', route => route.abort());
  if (cloud) {
    await page.route('**/api/gm**', route => route.abort());
    await page.route('**/api/image**', route => route.abort());
    await page.route('**/api/tts**', route => route.abort());
    await page.route('**/api/health**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, channels: ['local'] })
    }));
    await page.route('**/api/daily**', route => {
      const date = new URL(route.request().url()).searchParams.get('date') || '';
      const body = route.request().method() === 'POST' ? JSON.parse(route.request().postData() || '{}') : null;
      return route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify(boardRoute(date, body ? Number(body.score) || 0 : 0))
      });
    });
  } else if (!real) {
    await page.route('**/api/**', route => route.abort());   // сеть целиком мертва
  }
  // real: страница говорит с настоящим сервером, который её отдал (часть 3)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  return { page, errors };
}

/** Экран дня: что видно игроку до старта. */
async function screenShot(page) {
  return page.evaluate(() => ({
    screen: document.body.dataset.screen,
    title: (document.querySelector('#screen-daily .sub-header h2') || {}).textContent || '',
    heads: Array.from(document.querySelectorAll('#daily-body .section-title')).map(x => x.textContent),
    text: (document.querySelector('#daily-body') || {}).textContent || '',
    world: ((document.querySelector('#daily-body .scenario-card__title') || {}).textContent || ''),
    tags: Array.from(document.querySelectorAll('#daily-body .tag')).map(x => x.textContent),
    goal: ((document.querySelector('#daily-body .journal-goal__text') || {}).textContent || ''),
    rules: document.querySelectorAll('#daily-body .journal-block ul li').length,
    start: (document.querySelector('[data-act="daily-start"]') || {}).textContent || '',
    buttons: Array.from(document.querySelectorAll('#screen-daily .btn')).map(b => {
      const r = b.getBoundingClientRect();
      return { text: (b.textContent || '').trim().slice(0, 24), h: Math.round(r.height) };
    }),
    icons: Array.from(document.querySelectorAll('#screen-daily .icon-btn')).map(b => Math.round(b.getBoundingClientRect().height))
  }));
}

/** Состояние партии: ход в хранилище плюс готовность экрана. */
async function turnState(page) {
  return page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
    const g = JSON.parse(localStorage.getItem('dt2:game:' + ((idx[0] || {}).id)) || '{}');
    const status = document.querySelector('#game-status');
    return {
      turn: g.turn || 0,
      questDone: !!g.questDone,
      over: !!g.over,
      epilogue: !!document.querySelector('#epilogue:not([hidden])'),
      real: document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)').length,
      ghosts: document.querySelectorAll('#actions .action-btn--ghost').length,
      overlay: !!document.querySelector('#dice-overlay:not([hidden])'),
      busy: !!(status && !status.hidden)
    };
  });
}

/** Ждём, когда можно ходить: варианты есть, «скелетов» нет, мастер не думает. */
async function waitIdle(page, ms) {
  const deadline = Date.now() + ms;
  let last = null;
  while (Date.now() < deadline) {
    last = await turnState(page);
    if (last.epilogue) return last;
    if (last.real > 0 && last.ghosts === 0 && !last.busy && !last.overlay) return last;
    await page.waitForTimeout(500);
  }
  return last || { real: 0 };
}

/** Один ход: самый надёжный вариант, затем ждём, пока ход запишется в кампанию. */
async function playTurn(page) {
  const ready = await waitIdle(page, 90000);
  if (ready.epilogue) return { done: 'эпилог' };
  if (!ready.real) return { done: 'нет вариантов' };
  const before = ready.turn;
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
  let dice = 0;
  for (let i = 0; i < 60; i++) {
    const v = await page.evaluate(() => {
      const ov = document.querySelector('#dice-overlay');
      return ov && !ov.hidden ? ((document.querySelector('.dice-result__value') || {}).textContent || '') : '';
    });
    if (v) { dice = Number(v); break; }
    await page.waitForTimeout(200);
  }
  const deadline = Date.now() + 90000;
  let st = null;
  while (Date.now() < deadline) {
    st = await turnState(page);
    if (st.epilogue || st.turn > before || st.questDone || st.over) break;
    await page.waitForTimeout(500);
  }
  const moved = !!(st && (st.epilogue || st.turn > before || st.questDone || st.over));
  return { picked, dice, done: moved ? '' : 'ход не состоялся' };
}

async function playToEnd(page, turns) {
  let done = '';
  for (let turn = 1; turn <= turns && !done; turn++) {
    const res = await playTurn(page);
    const st = await turnState(page);
    console.log(stamp(), '  ход ' + turn + ' «' + String(res.picked || '').slice(0, 44) + '» → d20 ' + (res.dice || '—') +
      ', состояние: ход ' + st.turn + (st.questDone ? ', цель взята' : ''));
    if (res.done === 'ход не состоялся') done = 'ход не состоялся';
    else if (st.epilogue || st.questDone || st.over) done = st.questDone ? 'цель взята' : (st.over ? 'герой пал' : 'эпилог');
  }
  return done;
}

(async () => {
  const browser = await chromium.launch();

  /* ---------- Часть 1: экран дня и облако ---------- */
  console.log(stamp(), 'часть 1: экран забега дня с живым облаком');
  const a = await openPage(browser, { cloud: true });
  const page = a.page;

  await page.click('[data-act="daily-run"]');
  await page.waitForTimeout(600);
  const scr = await screenShot(page);
  console.log(stamp(), 'экран дня:', JSON.stringify({ title: scr.title, heads: scr.heads, world: scr.world, goal: scr.goal.slice(0, 40) }));
  check(scr.screen === 'daily', 'кнопка в меню открывает экран «Забег дня»');
  check(/^[ACDEFGHJKLMNPQRTUVWXYZ2346789]{4}$/.test((scr.text.match(/Код дня (\S{4})/) || [])[1] || ''),
    'код дня показан и не содержит похожих знаков');
  check(scr.world.length > 2, 'мир дня назван: ' + scr.world);
  check(scr.tags.length >= 4, 'герой дня показан целиком (класс, раса, происхождение, умение): ' + scr.tags.join(' · '));
  check(scr.goal.length > 10, 'цель дня сформулирована: ' + scr.goal.slice(0, 50));
  check(scr.rules >= 5, 'правила забега объяснены: ' + scr.rules + ' пунктов');
  const small = scr.buttons.filter(b => b.h > 0 && b.h < 44);
  check(small.length === 0, 'главные кнопки экрана дня не меньше 44 px: ' + scr.buttons.map(b => b.h).join('/'));
  check(scr.icons.length >= 2 && scr.icons.every(h => h === 38), 'значки шапки — как на других экранах: ' + scr.icons.join('/'));
  check(/Начать забег дня/.test(scr.start), 'внизу кнопка «Начать забег дня»');
  check(/прошли день: 12/.test(scr.text), 'облако рассказало, сколько прошли день: ' +
    ((scr.text.match(/👥[^.]*/) || [''])[0] || '').slice(0, 70));
  check(/Лучший|Сегодня ещё не играли/.test(scr.text), 'виден мой результат и его отсутствие');
  await page.screenshot({ path: 'shots/v23-daily.png' });

  const same = await page.evaluate(() => {
    const D = window.DTDaily, E = window.DTEngine;
    const lists = { scenarios: E.SCENARIOS, classes: E.CLASSES, races: E.RACES, origins: E.ORIGINS };
    const one = D.setup(D.dateKey(), lists);
    const two = D.setup(D.dateKey(), lists);
    const rolls = seed => {
      E.rnd.setDiceSeed(seed);
      const out = [1, 2, 3, 4, 5, 6].map(() => E.resolveCheck({ stat: 'str', dc: 12, bonus: 1 }).roll);
      E.rnd.clearDiceSeed();
      return out;
    };
    const r1 = rolls(one.seed), r2 = rolls(one.seed);
    const other = D.setup('2001-01-01', lists);
    return {
      plan: [one.scenario.id, one.classId, one.goal].join('|') === [two.scenario.id, two.classId, two.goal].join('|'),
      rolls: r1.join() === r2.join(),
      otherDiffers: one.seed !== other.seed || one.goal !== other.goal || one.scenario.id !== other.scenario.id
    };
  });
  check(same.plan, 'мир, герой и цель дня выводятся из даты один в один');
  check(same.rolls, 'при одном зерне кубик даёт те же 6 бросков');

  check(same.otherDiffers, 'другой день — другой мир, цель и зерно');

  // судьба дня на экране героя: шагов выбора нет
  await page.click('[data-act="daily-start"]');
  await page.waitForSelector('#hero-name', { timeout: 8000 });
  await page.waitForTimeout(400);
  const hero = await page.evaluate(() => ({
    screen: document.body.dataset.screen,
    note: (document.querySelector('#hero-profile-text') || {}).textContent || '',
    reroll: !!document.querySelector('#hero-reroll:not([hidden])'),
    classStep: !document.querySelector('#section-class').hidden,
    raceStep: !document.querySelector('#section-race').hidden,
    originStep: !document.querySelector('#section-origin').hidden,
    statChips: document.querySelectorAll('#stat-preview .stat-chip').length,
    name: document.querySelector('#hero-name').value,
    draft: (() => {
      // пробуем «другой набор»: судьба дня должна остаться прежней
      const before = [window.DTstate().screen, document.querySelector('.arch-card.is-active')]
        .map(x => (x && x.textContent) || '').join('|');
      const b = document.getElementById('hero-reroll');
      if (b && !b.hidden) b.click();
      return before;
    })()
  }));
  await page.waitForTimeout(900);
  const fateAfter = await page.evaluate(() => {
    const active = document.querySelector('.arch-card.is-active');
    const ids = JSON.parse(localStorage.getItem('dt2:heroPick') || 'null') || {};
    return { cls: (active && active.textContent) || '', ids: ids.classId || '' };
  });
  console.log(stamp(), 'герой дня:', JSON.stringify({ note: hero.note.slice(0, 70), chips: hero.statChips, name: hero.name }));
  check(hero.screen === 'hero' && !hero.classStep && !hero.raceStep && !hero.originStep,
    'шагов выбора класса/расы/происхождения нет — судьба дня решена');
  check(/Забег дня/.test(hero.note), 'подпись объясняет, что задано забегом: ' + hero.note.slice(0, 60));
  check(!hero.reroll, 'кнопки «другой набор» в забеге нет');
  check(fateAfter.cls && hero.draft.includes(fateAfter.cls.split(' ')[0].slice(0, 4)),
    'перебор героя в забеге ничего не меняет — судьба дня та же');
  check(/Класс дня|Раса дня/.test(hero.note) || hero.reroll === false, 'набор героя дня помечен как забеговый');
  check(hero.statChips >= 8, 'характеристики героя дня видны: ' + hero.statChips + ' плашек');
  check(a.errors.length === 0, 'часть 1: ошибок страницы нет: ' + (a.errors.slice(0, 3).join(' | ') || 'чисто'));
  await page.screenshot({ path: 'shots/v23-daily-hero.png' });
  await page.close();

  // экран дня в теме «Лёд»: материалы должны доходить и до нового экрана
  const ice = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  await ice.route('**/api/**', route => route.abort());
  await ice.route('https://**', route => route.abort());
  await ice.addInitScript(() => {
    localStorage.setItem('dt2:settings', JSON.stringify({
      theme: 'ice', images: false, voice: false, ambient: false, motion: false
    }));
  });
  await ice.goto(BASE, { waitUntil: 'domcontentloaded' });
  await ice.waitForTimeout(500);
  await ice.click('[data-act="daily-run"]');
  await ice.waitForTimeout(500);
  const frosted = await ice.evaluate(() => {
    const skin = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { img: cs.backgroundImage !== 'none', radius: cs.borderTopLeftRadius };
    };
    return {
      theme: document.body.dataset.theme,
      btn: skin('[data-act="daily-start"]'),
      block: skin('#daily-body .journal-block')
    };
  });
  console.log(stamp(), 'тема дня:', JSON.stringify(frosted));
  check(frosted.theme === 'ice', 'тема игрока применяется к экрану забега');
  check(!!(frosted.btn && frosted.btn.img), 'кнопка забега в теме «Лёд» обледенела, а не осталась плоской');
  await ice.screenshot({ path: 'shots/v23-daily-ice.png' });
  await ice.close();

  /* ---------- Часть 2: полный забег без сети ---------- */
  console.log(stamp(), 'часть 2: тот же день без сети — от старта до финала');
  const b2 = await openPage(browser, { cloud: false });
  const p2 = b2.page;
  const today = await p2.evaluate(() => window.DTDaily.dateKey());
  await p2.click('[data-act="daily-run"]');
  await p2.waitForTimeout(600);
  const off = await screenShot(p2);
  check(off.screen === 'daily' && off.world.length > 2, 'экран дня открывается без сети: ' + off.world);
  check(/облако молчит/.test(off.text), 'без облака честно сказано, что других не видно');

  await p2.click('[data-act="daily-start"]');
  await p2.waitForSelector('#hero-name', { timeout: 8000 });
  await p2.fill('#hero-name', 'Забежный');
  await p2.evaluate(() => {
    // фиксируем и вольную случайность рассказа: маршрут прогона воспроизводим
    const D = window.DTDaily, E = window.DTEngine;
    E.rnd.setSeed(D.seedFor(D.dateKey()));
  });
  await p2.click('#screen-hero [data-act="start-adventure"]');
  await waitIdle(p2, 90000);
  await p2.evaluate(() => {
    const b = document.querySelector('#prologue:not([hidden]) [data-act="close-prologue"]');
    if (b) b.click();
  });
  await p2.waitForTimeout(600);

  const inGame = await p2.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
    const g = JSON.parse(localStorage.getItem('dt2:game:' + ((idx[0] || {}).id)) || '{}');
    return {
      sub: (document.querySelector('#game-sub') || {}).textContent || '',
      goal: g.goal, daily: g.daily || null,
      diceSeeded: window.DTEngine.rnd.diceSeeded,
      runKey: JSON.parse(localStorage.getItem('dt2:dailyRun') || 'null'),
      asked: !!document.querySelector('#modal:not([hidden])')
    };
  });
  console.log(stamp(), 'забег начался:', JSON.stringify({ sub: inGame.sub, daily: inGame.daily, diceSeeded: inGame.diceSeeded }));
  check(!!inGame.daily && inGame.daily.seed > 0, 'в кампании записаны дата и зерно забега');
  check(inGame.goal === inGame.daily.goal, 'цель дня стала целью кампании: ' + String(inGame.goal).slice(0, 44));
  check(/🗓/.test(inGame.sub), 'шапка игры помечает забег: ' + inGame.sub);
  check(inGame.diceSeeded === true, 'кубик идёт из зерна дня');
  check(!inGame.asked, 'вопрос «с чего начнём» в забеге не задаётся');
  check(!!inGame.runKey && inGame.runKey.date === today, 'незаконченный забег записан для «продолжить»');

  const journal = await p2.evaluate(() => {
    const open = document.querySelector('[data-act="open-journal"]');
    if (open) open.click();
    const box = document.getElementById('journal-daily');
    const text = box ? box.textContent : '';
    const back = document.querySelector('#screen-journal [data-act="back-game"]');
    if (back) back.click();
    return text;
  });
  check(/Забег дня/.test(journal) && /Цель дня/.test(journal) && /Счёт сейчас/.test(journal),
    'в журнале есть плашка забега со счётом по ходу игры');
  await p2.waitForTimeout(400);

  // незаконченный забег дня предлагают продолжить, а не начинать заново
  const beforeExit = await turnState(p2);
  await p2.evaluate(() => {
    document.querySelector('[data-act="close-game"]').click();
  });
  await p2.waitForSelector('#modal:not([hidden]) .btn', { timeout: 8000 });
  await p2.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#modal .btn')).find(x => /Сохранить и выйти/.test(x.textContent));
    if (b) b.click();
  });
  await p2.waitForTimeout(700);
  await p2.evaluate(() => {
    const b = document.querySelector('#screen-menu [data-act="daily-run"]');
    if (b) b.click();
  });
  await p2.waitForTimeout(700);
  const continueScreen = await screenShot(p2);
  await p2.evaluate(() => {
    const b = document.querySelector('[data-act="daily-start"]');
    if (b) b.click();
  });
  await p2.waitForTimeout(1200);
  const resumed = await turnState(p2);
  const backInGame = await p2.evaluate(() => document.body.dataset.screen);
  check(/Продолжить забег дня/.test(continueScreen.start), 'незаконченный забег предлагают продолжить: ' +
    continueScreen.start.trim());
  check(backInGame === 'game' && resumed.turn === beforeExit.turn,
    'кнопка «продолжить» возвращает в тот же забег (ход ' + resumed.turn + ')');
  await waitIdle(p2, 60000);

  const done = await playToEnd(p2, 16);
  console.log(stamp(), 'забег завершён:', done);

  let epic = null;
  for (let i = 0; i < 60; i++) {
    epic = await p2.evaluate(() => {
      const box = document.getElementById('epilogue-daily');
      const screen = document.querySelector('#epilogue');
      if (!box || !screen || screen.hidden) return null;
      return {
        head: (box.querySelector('.section-title') || {}).textContent,
        rows: Array.from(box.querySelectorAll('ul li')).map(x => x.textContent),
        text: box.textContent,
        buttons: Array.from(box.querySelectorAll('button')).map(b => b.textContent),
        stats: Array.from(document.querySelectorAll('.epilogue__stat')).map(x => x.textContent)
      };
    });
    if (epic) break;
    await p2.waitForTimeout(500);
  }
  check(done === 'цель взята', 'без сети и без ключа забег доигрывается до цели дня');
  check(!!epic, 'финал кампании содержит блок забега дня');
  if (epic) {
    console.log(stamp(), 'итог дня:', JSON.stringify({ head: epic.head, rows: epic.rows }, null, 1));
    check(/Забег дня/.test(epic.head || ''), 'блок подписан кодом дня: ' + epic.head);
    check(/итог дня: \d+ очков/.test(epic.rows.join(' ')), 'счёт дня разложен на слагаемые: ' + epic.rows.length + ' строк');
    check(epic.buttons.length >= 2 && /К забегу дня/.test(epic.buttons.join(' ')), 'из финала есть дорога назад к забегу');
    check(/облако молчит/.test(epic.text), 'без облака честное слово про очки на телефоне');
  }

  const after = await p2.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('dt2:daily') || '{}');
    return {
      diceSeeded: window.DTEngine.rnd.diceSeeded,
      entry: store[window.DTDaily.dateKey()] || null,
      runKey: JSON.parse(localStorage.getItem('dt2:dailyRun') || 'null')
    };
  });
  check(!!(after.entry && after.entry.score > 0 && after.entry.turns > 0),
    'результат дня сохранён на телефоне: ' + JSON.stringify(after.entry));
  check(after.diceSeeded === false, 'после финала кубик снова вольный');
  check(after.runKey === null, 'незаконченный забег снят с учёта');
  await p2.screenshot({ path: 'shots/v23-daily-end.png' });

  const back = await p2.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#epilogue-daily button')).find(x => /К забегу дня/.test(x.textContent));
    if (b) b.click();
    return null;
  });
  await p2.waitForTimeout(800);
  const afterScreen = await screenShot(p2);
  check(afterScreen.screen === 'daily', 'кнопка «к забегу дня» возвращает на экран дня');
  await p2.screenshot({ path: 'shots/v23-daily-after.png' });
  check(/Сегодня: \d+ очков/.test(afterScreen.text), 'на экране дня виден сегодняшний результат');
  check(/Лучший/.test(afterScreen.text), 'экран дня помнит лучший забег');
  const badge = await p2.evaluate(() => {
    document.querySelector('[data-act="back"]').click();
    const el = document.getElementById('menu-daily-badge');
    return { text: el.textContent, hidden: el.hidden, screen: document.body.dataset.screen };
  });
  check(badge.screen === 'menu' && !badge.hidden && Number(badge.text) > 0,
    'в меню у кнопки забега виден сегодняшний счёт: ' + badge.text);
  check(b2.errors.length === 0, 'часть 2: ошибок страницы нет: ' + (b2.errors.slice(0, 3).join(' | ') || 'чисто'));
  await p2.screenshot({ path: 'shots/v23-daily-menu.png' });
  await p2.close();

  /* ---------- Часть 3: облако по-настоящему ---------- */
  console.log(stamp(), 'часть 3: обмен с живым сервером /api/daily');
  clearTestDay();                    // прошлые прогоны не должны путать счёт
  const c = await openPage(browser, { cloud: false, real: true });
  const p3 = c.page;
  const noise = await p3.evaluate(() => {
    // обещание «одни броски у всех»: подбор кадров и реплики броски не сдвигают
    const E = window.DTEngine, D = window.DTDaily;
    const seed = D.seedFor(D.dateKey());
    E.rnd.setDiceSeed(seed);
    const clean = [1, 2, 3].map(() => E.resolveCheck({ stat: 'wit', dc: 11, bonus: 1 }).roll);
    E.rnd.clearDiceSeed();
    E.rnd.setDiceSeed(seed);
    E.rnd.int(1, 100); E.rnd.pick([1, 2, 3]); E.rnd.shuffle([1, 2, 3]);
    const noisy = [1, 2, 3].map(() => E.resolveCheck({ stat: 'wit', dc: 11, bonus: 1 }).roll);
    E.rnd.clearDiceSeed();
    return { clean, noisy, same: clean.join() === noisy.join() };
  });
  check(noise.same, 'подбор кадров и реплики броски не сдвигают: ' + noise.clean.join('/'));

  const probe = await p3.evaluate(async ({ SERVER, TEST_DATE }) => {
    const API = window.DTapi;
    const client = await API.probeBackend(true);          // сервер тот же, что отдал страницу
    const date = TEST_DATE;
    const first = await API.dailyBoard(date);
    const mine = await API.dailySubmit({ date, code: 'TEST', score: 275, turns: 9, victory: true });
    const board = await API.dailyBoard(date);
    const junk = await fetch(SERVER + '/api/daily?date=вчера').then(r => r.status).catch(() => 0);
    const mid = await API.dailyBoard(date);
    const big = await API.dailySubmit({ date, code: 'TEST', score: 999999, turns: 1, victory: false });
    return {
      server: !!client,
      first: first.ok ? first.board : first,
      mine: mine.ok ? mine.board : mine,
      board: board.ok ? board.board : board,
      mid: mid.ok ? mid.board : mid,
      junk,
      big: big.ok && big.board ? big.board.accepted.score : null,
      final: big.ok && big.board ? big.board : big
    };
  }, { SERVER, TEST_DATE });
  console.log(stamp(), 'доска проверочного дня:', JSON.stringify(probe));
  check(probe.server === true, 'сервер отвечает на пробу здоровья');
  check(probe.first && probe.first.ok && probe.first.date === TEST_DATE && probe.first.runs === 0,
    'доска пустого дня отдаётся с нулями: ' + JSON.stringify(probe.first));
  check(probe.mine && probe.mine.accepted && probe.mine.accepted.score === 275 &&
    probe.mine.runs === probe.first.runs + 1 && probe.mine.place === 1 && probe.mine.best === 275,
    'мой результат принят, посчитан и занял первое место: ' + JSON.stringify(probe.mine));
  check(probe.board && probe.board.runs === probe.first.runs + 1 && probe.board.avg === 275 &&
    probe.board.victory === 1, 'доска дня сложилась из моих очков: прошли ' + probe.board.runs +
    ', лучший ' + probe.board.best + ', средний ' + probe.board.avg);
  check(probe.mid && probe.mid.runs === probe.first.runs + 1 && probe.mid.best === 275,
    'повторный запрос дня видит мой забег: ' + JSON.stringify(probe.mid));
  check(probe.junk === 400, 'мусорная дата отклонена сервером (HTTP ' + probe.junk + ')');
  check(probe.big === 100000 && probe.final.best === 100000,
    'неправдоподобный счёт обрезан до предела и поднял лучший: ' + probe.big);
  check(probe.final.runs === probe.first.runs + 2, 'доска считает все заходы дня: ' + probe.final.runs);
  check(c.errors.length === 0, 'часть 3: ошибок страницы нет: ' + (c.errors.slice(0, 3).join(' | ') || 'чисто'));
  await p3.close();
  await browser.close();

  // проверочный день не должен остаться в хранилище сервера
  if (clearTestDay()) console.log(stamp(), 'проверочный день убран из data/daily-runs.json');

  const failed = checks.filter(x => !x.ok);
  console.log('\nЗАБЕГ ДНЯ: проверок ' + checks.length + ', провалено ' + failed.length);
  failed.forEach(x => console.log('  ✗ ' + x.text));
  console.log(failed.length ? 'ИТОГ: проверить выше'
    : 'ИТОГ: ✓ забег дня играется без ключа, считается и сравнивается с другими');
  process.exitCode = failed.length ? 1 : 0;
})();
