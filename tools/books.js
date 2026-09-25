/**
 * tools/books.js — истории без ИИ: проверка в браузере.
 *
 *   1. В главном меню больше нет пункта «Книга-игра без ИИ» — истории живут
 *      во вкладке «Истории» экрана «Новая игра».
 *   2. Вкладка показывает восемь историй и фильтр по жанрам; фильтр работает.
 *   3. История играется без мастера: за весь заход ни одного запроса к ИИ.
 *   4. Главу можно дочитать до конца: история доходит до концовки, экран итога
 *      показывает заголовок, а «собрано концовок» остаётся в списке.
 *   5. Концовка снимает закладку: карточка снова предлагает начать заново.
 *
 *   node tools/books.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const SHOTS = path.join(__dirname, '..', 'shots');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage(Object.assign({}, devices['iPhone 13 Mini']));
  const errors = [];
  const aiCalls = [];
  page.on('pageerror', e => errors.push(String((e && e.message) || e).slice(0, 140)));
  page.on('request', r => {
    const u = r.url();
    if (/\/api\/(gm|image|tts)/.test(u)) aiCalls.push(u.replace(/^https?:\/\/[^/]+/, ''));
  });
  const problems = [];
  const step = (ok, text) => {
    console.log((ok ? '✓ ' : '✗ ') + text);
    if (!ok) problems.push(text);
  };
  const shot = name => page.screenshot({ path: path.join(SHOTS, name + '.png') });

  // сеть подменяем: истории не должны к ней обращаться вообще
  await page.route('**/api/gm*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, provider: 'mock', text: '{}' })
  }));
  await page.route('**/api/image*', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }).catch(() => {}));
  await page.route('**/api/tts*', route => route.fulfill({ status: 204, body: '' }).catch(() => {}));

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('dt2:settings', JSON.stringify({
      master: 'local', voice: false, images: false, ambient: false, motion: false
    }));
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  /* ---------- 1. меню: пункта про книги больше нет ---------- */
  const menu = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#screen-menu .menu-buttons .btn'));
    return {
      texts: btns.map(b => b.textContent.trim()),
      books: btns.filter(b => /книга-игра|книг/i.test(b.textContent)).length,
      acts: btns.map(b => b.dataset.act || '')
    };
  });
  step(menu.books === 0, 'в главном меню нет пункта про книгу-игру: ' + menu.texts.join(' · '));
  step(menu.acts.indexOf('open-books') < 0, 'обработчик open-books из меню убран');
  step(menu.acts.indexOf('new-game') >= 0 && menu.acts.indexOf('my-games') >= 0, 'остальные пункты меню на месте');

  /* ---------- 2. вкладка «Истории»: восемь историй и жанры ---------- */
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#mode-tabs .tab[data-mode="books"]', { timeout: 8000 });
  await page.click('#mode-tabs .tab[data-mode="books"]');
  await page.waitForSelector('#books-list .book-card', { timeout: 8000 });
  await page.waitForTimeout(300);
  const list = await page.evaluate(() => ({
    count: document.querySelectorAll('#books-list .book-card').length,
    chips: Array.from(document.querySelectorAll('#books-filter .books-filter__chip')).map(c => c.textContent.trim()),
    first: (function () {
      const card = document.querySelector('#books-list .book-card');
      return {
        title: (card.querySelector('.book-card__title') || {}).textContent || '',
        tag: (card.querySelector('.book-card__tag') || {}).textContent || '',
        button: (card.querySelector('.btn') || {}).textContent || ''
      };
    })(),
    total: (document.querySelector('.books-total') || {}).textContent || ''
  }));
  step(list.count === 8, 'во вкладке «Истории» восемь историй: ' + list.count);
  step(list.chips.length >= 4, 'жанры фильтруются: ' + list.chips.join(' · '));
  step(/глав/.test(list.first.tag) && /концовк/.test(list.first.tag), 'карточка рассказывает про объём: «' + list.first.tag + '»');
  step(/Всего 8 историй/.test(list.total), 'внизу честная сводка: ' + list.total.slice(0, 60) + '…');
  await shot('v21-books');

  const byChip = async (name) => {
    await page.evaluate((label) => {
      const chip = Array.from(document.querySelectorAll('#books-filter .books-filter__chip'))
        .find(c => c.textContent.trim().indexOf(label) === 0);
      if (chip) chip.click();
    }, name);
    await page.waitForTimeout(250);
    return page.evaluate(() => Array.from(document.querySelectorAll('#books-list .book-card .book-card__title'))
      .map(t => t.textContent));
  };
  const future = await byChip('Будущее');
  step(future.length === 3, 'в «Будущем» три истории: ' + future.join(', '));
  const past = await byChip('Прошлое');
  step(past.length === 3, 'в «Прошлом» три истории: ' + past.join(', '));
  await shot('v21-books-genres');
  const all = await byChip('Все');
  step(all.length === 8, 'фильтр «Все» возвращает полный список: ' + all.length);

  /* ---------- 3. история играется без мастера ---------- */
  aiCalls.length = 0;
  await page.click('#books-list .book-card:first-child .btn');
  await page.waitForFunction(() => document.body.dataset.screen === 'game', null, { timeout: 10000 });
  await page.waitForSelector('#actions .action-btn', { timeout: 10000 });
  // глава печатается волной: ждём, пока текст допечатается
  await page.waitForTimeout(900);
  await page.waitForFunction(() => {
    const el = document.querySelector('.scene-text__body');
    const len = (el && el.textContent || '').length;
    const prev = el && el.dataset.prevLen ? Number(el.dataset.prevLen) : 0;
    if (el) el.dataset.prevLen = String(len);
    return len > 120 && len === prev;
  }, { timeout: 12000, polling: 600 }).catch(() => {});
  await page.waitForTimeout(300);
  const bookScreen = await page.evaluate(() => ({
    mode: document.body.dataset.mode || '',
    sub: (document.getElementById('game-sub') || {}).textContent || '',
    title: (document.getElementById('game-title') || {}).textContent || '',
    avatar: (document.getElementById('game-avatar') || {}).hidden,
    barHidden: Array.from(document.querySelectorAll('#game-bar .bar-btn')).filter(b => b.hidden).length,
    choices: document.querySelectorAll('#actions .action-btn').length,
    heights: Array.from(document.querySelectorAll('#actions .action-btn')).map(b => Math.round(b.getBoundingClientRect().height))
  }));
  step(bookScreen.mode === 'book', 'игра идёт в книжном режиме: ' + bookScreen.mode);
  step(/Глава/.test(bookScreen.sub), 'шапка показывает главу: «' + bookScreen.sub + '»');
  step(bookScreen.avatar === true, 'портрет героя в книге не мешает: аватар скрыт');
  step(bookScreen.barHidden >= 4, 'кнопки мастера (журнал, карта, привал, сумка) в книге убраны: ' + bookScreen.barHidden);
  step(bookScreen.heights.every(h => h >= 44), 'варианты удобные для пальца: ' + bookScreen.heights.join('/') + ' px');
  step(aiCalls.length === 0, 'за открытие истории ни одного запроса к ИИ: ' + aiCalls.length);
  await shot('v21-book-chapter');

  /* ---------- 4. дочитываем до концовки ---------- */
  let steps = 0;
  let ending = false;
  for (let i = 0; i < 30; i++) {
    const picked = await page.evaluate(() => {
      const end = document.querySelector('#actions .action-btn--primary');
      if (end) return { kind: 'end', text: end.textContent.trim() };
      const btn = Array.from(document.querySelectorAll('#actions .action-btn'))
        .find(b => !b.classList.contains('is-locked') && !b.classList.contains('action-btn--primary'));
      if (!btn) return null;
      const text = btn.textContent.trim();
      btn.click();
      return { kind: 'step', text: text };
    });
    if (!picked) break;
    if (picked.kind === 'end') {
      ending = true;
      await page.evaluate(() => { const b = document.querySelector('#actions .action-btn--primary'); if (b) b.click(); });
      break;
    }
    steps++;
    await page.waitForTimeout(420);
    if (steps > 1 && i % 3 === 0) await page.evaluate(() => {
      const el = document.querySelector('.scene-text__body');
      if (el) el.dataset.prevLen = String((el.textContent || '').length);
    });
  }
  await page.waitForTimeout(700);
  step(ending, 'история доведена до концовки за ' + steps + ' выборов');
  const epi = await page.evaluate(() => ({
    open: !document.getElementById('epilogue').hidden,
    title: (document.getElementById('epilogue-title') || {}).textContent || '',
    head: ((document.querySelector('#epilogue-body .book-end__title') || {}).textContent) || '',
    buttons: Array.from(document.querySelectorAll('#epilogue-body .btn')).map(b => b.textContent.trim()),
    stats: Array.from(document.querySelectorAll('#epilogue-body .epilogue__stat'))
      .map(s => s.textContent.replace(/\s+/g, ' ').trim()).slice(0, 4)
  }));
  step(epi.open && /📖/.test(epi.title), 'экран итога открылся: ' + epi.title);
  step(!!epi.head, 'у концовки есть название: ' + epi.head);
  step(epi.buttons.some(b => /Скачать/.test(b)), 'историю можно забрать текстом: ' + epi.buttons.join(' · '));
  step(epi.stats.length === 4, 'итог считает путь героя: ' + epi.stats.join(' | '));
  const chapterStat = (epi.stats.find(t => /глав/.test(t)) || '');
  step(parseInt(chapterStat, 10) >= 4, 'история прошла несколько глав: ' + chapterStat);
  await shot('v21-book-end');
  await page.evaluate(() => {
    const b = document.querySelector('#epilogue [data-act="close-epilogue"], #epilogue .btn--quiet');
    if (b) b.click();
  });
  await page.waitForTimeout(300);

  /* ---------- 5. концовка запомнена, закладка снята ---------- */
  // выход из книги ведёт прямо в раздел историй, оттуда — назад в меню и снова в список,
  // чтобы карточки перерисовались уже с собранной концовкой
  await page.click('#screen-game [data-act="close-game"]');
  await page.waitForSelector('#screen-scenarios:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(400);
  await page.click('#screen-scenarios [data-act="back"]');
  await page.waitForSelector('#screen-menu:not([hidden])', { timeout: 8000 });
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#mode-tabs .tab[data-mode="books"]', { timeout: 8000 });
  await page.click('#mode-tabs .tab[data-mode="books"]');
  await page.waitForSelector('#books-list .book-card', { timeout: 8000 });
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const card = document.querySelector('#books-list .book-card');
    return {
      note: (card.querySelector('.book-card__note') || {}).textContent || '',
      button: (card.querySelector('.btn') || {}).textContent || ''
    };
  });
  step(/Собрано концовок: 1 из/.test(after.note), 'концовка запомнена: «' + after.note + '»');
  step(after.button.trim() === 'Начать', 'после концовки карточка снова зовёт начать: «' + after.button + '»');
  await shot('v21-books-after');

  step(errors.length === 0, 'ошибок страницы нет' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(problems.length ? '\nПроблемы:\n- ' + problems.join('\n- ') : '\nВсе проверки историй пройдены');
  process.exit(problems.length ? 1 : 0);
})();
