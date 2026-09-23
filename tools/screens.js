/**
 * tools/screens.js — новые экраны: настройки с выбором канала, журнал, карта,
 * забег, книги и облачный сейв. Делает снимки в shots/ и проверяет, что экраны
 * действительно наполнены, а выбор мастера/генератора сохраняется.
 *
 *   node tools/screens.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';

const TURN = {
  scene: 'Мастер поднимает лампу: на стене проступает карта, а за дверью кто-то переступает с ноги на ногу. ' +
    'Пахнет дымом и мокрой шерстью. Мара говорит тихо: «Не свети в окно — там ждут».',
  chapter: 'Глава I', place: 'Караульная у моста',
  npc: 'Мара', npcObject: { name: 'Мара', role: 'караванщица', line: '«Не свети в окно — там ждут»' },
  thread: 'долг перед караванщицей',
  imagePrompt: 'dim guardroom with a lit lamp and a map on the wall, hooded hero in the foreground',
  options: [
    { text: 'Прочитать карту и запомнить тропы', stat: 'int', difficulty: 'easy' },
    { text: 'Спросить, кто ходит за дверью', stat: 'per', difficulty: 'medium' },
    { text: 'Открыть дверь рывком', stat: 'str', difficulty: 'hard' }
  ],
  effects: {}
};

(async () => {
  const shots = path.join(__dirname, '..', 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  const bad = [];
  const shot = name => page.screenshot({ path: path.join(shots, name + '.png') });

  await page.route('**/api/gm/stream*', route => route.abort());
  await page.route('**/api/gm', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify(TURN) })
  }));
  await page.route('**/api/image**', route => route.fulfill({
    status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
  }));

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  /* --- настройки: выбор ведущего мастера и генератора картинок --- */
  await page.click('#screen-menu [data-act="settings"]');
  await page.waitForSelector('#modal:not([hidden])', { timeout: 8000 });
  // списки каналов подтягиваются от сервера: ждём, пока заполнятся
  await page.waitForFunction(() => {
    const rows = Array.from(document.querySelectorAll('#modal .rules-row--tall'));
    return rows.length >= 2 && rows.every(r => r.querySelectorAll('.rules-btn').length >= 2);
  }, { timeout: 12000 }).catch(() => bad.push('списки каналов не заполнились'));
  const channels = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#modal .rules-row--tall'));
    return rows.map(r => Array.from(r.querySelectorAll('.rules-btn__title')).map(t => t.textContent.trim()));
  });
  await shot('v13-settings-channels');
  if (!channels[0] || channels[0].length < 3) bad.push('выбор мастера пуст: ' + JSON.stringify(channels[0]));
  if (!channels[1] || channels[1].length < 2) bad.push('выбор генератора пуст: ' + JSON.stringify(channels[1]));

  // выбираем конкретный генератор и конкретного мастера — проверяем, что выбор сохранился
  const picks = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#modal .rules-row--tall'));
    const pickIn = (row, want) => {
      const btns = Array.from(row.querySelectorAll('.rules-btn'));
      const target = btns.find(b => want.test(b.textContent) && !b.classList.contains('is-off'));
      if (target) target.click();
      return !!target;
    };
    return { master: pickIn(rows[0], /Встроенный|Pollinations \(ключ\)/), image: pickIn(rows[1], /Старый sana|sana/) };
  });
  if (!picks.master) bad.push('не нашли кнопку мастера для выбора');
  if (!picks.image) bad.push('не нашли кнопку генератора для выбора');
  await page.waitForTimeout(600);   // настройки переоткрываются после выбора
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dt2:settings') || '{}'));
  if (!saved.master || saved.master === 'auto') bad.push('выбор мастера не сохранился: ' + saved.master);
  if (!saved.imageSource || saved.imageSource === 'auto') bad.push('выбор генератора не сохранился: ' + saved.imageSource);
  await page.click('#modal .btn--ghost, #modal [data-act], #modal .btn').catch(() => {});
  await page.evaluate(() => {
    const box = document.getElementById('modal');
    const close = box.querySelector('.icon-btn, .modal__close');
    if (close) close.click();
    box.hidden = true;
  });

  /* --- играем ход и смотрим новые экраны --- */
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('dt2:settings') || '{}');
    s.master = 'auto'; s.imageSource = 'auto'; s.voice = false; s.music = false;
    localStorage.setItem('dt2:settings', JSON.stringify(s));
  });
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Ирма');
  await page.click('#class-list .arch-card:nth-child(3)');
  await page.click('#race-list .chip:nth-child(2)');
  await page.click('#origin-list .arch-card:nth-child(2)');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 12000 }).catch(() => {});
  await page.click('#modal .btn--ghost').catch(() => {});
  await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 30000 });
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"], .prologue__go'); if (b) b.click(); });
  await page.waitForTimeout(500);
  // два хода, чтобы в памяти появились место, знакомый и нить
  for (let i = 0; i < 2; i++) {
    const btns = await page.$$('#actions .action-btn:not(.action-btn--ghost)');
    if (btns.length) await btns[0].click();
    await page.evaluate(() => {
      const d = document.getElementById('dice-overlay');
      if (d && !d.hidden) { d.click(); d.hidden = true; }
      const p = document.getElementById('prologue');
      if (p && !p.hidden) { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); }
    });
    await page.waitForTimeout(900);
  }

  for (const [act, id, sel] of [['open-journal', 'journal', '#journal-body'],
                                ['open-map', 'map', '#map-list'],
                                ['open-run', 'run', '#run-body']]) {
    await page.evaluate(a => { const b = document.querySelector('[data-act="' + a + '"]'); if (b) b.click(); }, act);
    await page.waitForTimeout(400);
    const info = await page.evaluate(s => {
      const el = document.querySelector(s);
      return { chars: el ? el.textContent.replace(/\s+/g, ' ').trim().length : 0, visible: !document.getElementById('screen-' + (s.match(/#(\w+)/) || [])[1] || '').hidden };
    }, sel);
    await shot('v13-' + id);
    if (info.chars < 30) bad.push('экран ' + id + ' пустой (' + info.chars + ' символов)');
    await page.evaluate(() => { const b = document.querySelector('[data-act="back-game"]'); if (b) b.click(); });
    await page.waitForTimeout(200);
  }

  /* --- книга-игра --- */
  await page.evaluate(() => {
    const b = document.querySelector('[data-act="close-game"]');
    if (b) b.click();
  });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const m = document.getElementById('modal');
    if (m && !m.hidden) { const p = m.querySelector('.btn--primary'); if (p) p.click(); }
  });
  await page.click('[data-act="open-books"]');
  await page.waitForSelector('#books-list .book-card', { timeout: 8000 });
  await shot('v13-books');
  await page.click('#books-list .book-card:first-child .btn');
  await page.waitForSelector('#actions .action-btn', { timeout: 8000 });
  // в книге текст печатается волной: ждём, пока допечатается вся глава
  await page.waitForFunction(() => {
    const el = document.querySelector('.scene-text__body');
    const len = (el && el.textContent || '').length;
    const prev = el && el.dataset.prevLen ? Number(el.dataset.prevLen) : 0;
    if (el) el.dataset.prevLen = String(len);
    return len > 120 && len === prev;
  }, { timeout: 12000, polling: 700 }).catch(() => {});
  await shot('v13-book-chapter');
  const bookText = await page.evaluate(() => (document.querySelector('.scene-text__body') || {}).textContent || '');
  if (bookText.length < 60) bad.push('глава книги пуста: ' + bookText.length + ' символов');

  /* --- облачный сейв: выложить и забрать по коду --- */
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-game"]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.click('[data-act="my-games"]').catch(() => {});
  await page.waitForTimeout(400);
  await shot('v13-saves-cloud');
  if (!(await page.$('[data-act="cloud-put"]'))) bad.push('нет кнопки «выложить по коду»');
  if (!(await page.$('[data-act="cloud-get"]'))) bad.push('нет кнопки «ввести код»');

  await browser.close();
  console.log('=== Новые экраны ===');
  if (channels[0]) console.log('  мастера: ' + channels[0].join(' · '));
  if (channels[1]) console.log('  генераторы: ' + channels[1].join(' · '));
  console.log('  выбор сохранён: мастер=' + saved.master + ', картинки=' + saved.imageSource);
  console.log('  снимки: shots/v13-settings-channels.png, v13-journal, v13-map, v13-run, v13-books, v13-book-chapter, v13-saves-cloud');
  if (errors.length) bad.push('ошибок страницы: ' + errors.slice(0, 2).join(' | '));
  console.log(bad.length ? '\nПРОБЛЕМЫ:\n  ✗ ' + bad.join('\n  ✗ ') : '\nВсе новые экраны на месте');
  process.exitCode = bad.length ? 1 : 0;
})();
