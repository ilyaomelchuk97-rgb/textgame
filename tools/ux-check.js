/**
 * tools/ux-check.js — четыре обещания игроку, проверенные в браузере.
 *
 *   1. Настройки не выкидывают: галочка меняет подсветку, окно остаётся открытым,
 *      прокрутка и поле в фокусе сохраняются.
 *   2. Озвучка не отстаёт: смена сцены обрывает старую цепочку чтения
 *      (номер сцены растёт, очередь пуста, старый звук не играет).
 *   3. Кадры информативнее: действие с предметом даёт крупный план предмета
 *      и новый кадр (в промпте есть предмет, ключ кадра помечен предметом).
 *   4. Класс и вид, выбранные для мира, второй раз не спрашиваются:
 *      при следующем заходе разделы скрыты, видна строка «в этом мире уже выбрано».
 *
 *   node tools/ux-check.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const SHOTS = path.join(__dirname, '..', 'shots');

const openSettings = async page => {
  const onMenu = await page.evaluate(() => document.body.dataset.screen === 'menu');
  if (!onMenu) await page.evaluate(() => { const b = document.querySelector('[data-act="show-menu"]'); if (b) b.click(); });
  await page.waitForTimeout(300);
  await page.click('#screen-menu [data-act="settings"]');
  await page.waitForSelector('#modal:not([hidden])');
  await page.waitForTimeout(600);
};

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage(Object.assign({}, devices['iPhone 13 Mini']));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e).slice(0, 120)));
  const problems = [];

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  /* ---------- 1. настройки не выкидывают ---------- */
  await openSettings(page);
  // уводим окно вниз и находим галочку, которая раньше перерисовывала окно целиком
  const clicked = await page.evaluate(() => {
    const box = document.getElementById('modal-box');
    const btns = Array.from(document.querySelectorAll('#modal button'));
    const target = btns.find(b => /Отклик|Без отклика|Озвучка|Одна рука|Авто \(умный/.test(b.textContent));
    if (!target) return null;
    target.scrollIntoView({ block: 'center' });
    target.focus();
    return target.textContent.trim().slice(0, 34);
  });
  const before = await page.evaluate(() => {
    const box = document.getElementById('modal-box');
    return {
      open: !document.getElementById('modal').hidden,
      scroll: box.scrollTop,
      focused: !!(document.activeElement && document.getElementById('modal').contains(document.activeElement)),
      buttons: box.querySelectorAll('button').length
    };
  });
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#modal button'));
    const target = btns.find(b => /Отклик|Без отклика|Озвучка|Одна рука|Авто \(умный/.test(b.textContent));
    if (target) target.click();
  });
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => {
    const box = document.getElementById('modal-box');
    return {
      open: !document.getElementById('modal').hidden,
      isOpenClass: document.getElementById('modal').classList.contains('is-open'),
      scroll: box.scrollTop,
      focused: !!(document.activeElement && document.getElementById('modal').contains(document.activeElement)),
      buttons: box.querySelectorAll('button').length
    };
  });
  await page.screenshot({ path: path.join(SHOTS, 'v19-settings-stay.png') });
  if (!clicked) problems.push('не нашлась галочка в настройках для проверки');
  if (!after.open || !after.isOpenClass) problems.push('после галочки настройки закрылись');
  const scrollLost = Math.abs(after.scroll - before.scroll);
  if (scrollLost > 40) problems.push('прокрутка настроек слетела на ' + scrollLost + ' px');
  console.log('настройки: галочка «' + clicked + '» · окно открыто: ' + after.open + ' · прокрутка ' + before.scroll + ' → ' + after.scroll +
    ' · фокус остался в окне: ' + after.focused);
  if (!after.focused) problems.push('после галочки фокус вылетел из настроек');
  await page.evaluate(() => { const b = Array.from(document.querySelectorAll('#modal button')).find(x => /Закрыть/.test(x.textContent)); if (b) b.click(); });
  await page.waitForTimeout(400);

  /* ---------- 2. озвучка не отстаёт ---------- */
  await page.evaluate(() => {
    // включаем озвучку без ожидания сервера: проверяем именно механику очереди
    window.DTvoice.set(true);
  });
  const voice = await page.evaluate(async () => {
    const V = window.DTvoice;
    const long = 'Мара поднимает лампу над картой. За дверью слышны шаги, и кто-то считает доски моста.\n\n' +
      'Ветер бьёт в окно, стекло дрожит и звенит, как монета по камню.\n\n' +
      'Ты кладёшь ладонь на холодную рукоять и ждёшь, пока шаги стихнут.\n\n' +
      'Где-то внизу плещет вода, и мост отвечает скрипом на каждый шаг.';
    V.scene(long, 'book');
    const started = V.state();
    // игрок проходит сцену быстрее чтения: новая сцена должна обойти старую
    await new Promise(r => setTimeout(r, 1600));
    V.scene('Мост обрывается. Внизу только туман и вода.', 'dread');
    const switchedAt = Date.now();
    await new Promise(r => setTimeout(r, 2600));
    const after = V.state();
    V.stop();
    return { started, after, switchedAt };
  });
  const late = voice.after.log.filter(p => p.epoch === voice.started.epoch && p.at > voice.switchedAt + 300);
  console.log('озвучка: сцена ' + voice.started.epoch + ' → ' + voice.after.epoch +
    ' · кусков ушло в голос: ' + voice.after.log.length +
    ' · старых после смены сцены: ' + late.length);
  if (voice.after.epoch <= voice.started.epoch) problems.push('смена сцены не открыла новую очередь чтения');
  if (late.length) problems.push('старая сцена читалась ещё ' + late.length + ' куском после ухода вперёд');
  await page.evaluate(() => window.DTvoice.set(false));

  /* ---------- 3. кадры информативнее ---------- */
  const focus = await page.evaluate(() => {
    const fn = window.DTfocus;
    if (typeof fn !== 'function') return null;
    return {
      note: fn('Поднять записку с пола и прочитать', 'Ты в тёмной комнате, на полу бумага.'),
      walk: fn('Идти по мосту дальше', 'Ты выходишь на мост.'),
      idle: fn('Ждать', 'Ночь, тишина.')
    };
  });
  if (!focus) problems.push('разбор действия для кадра недоступен');
  else {
    console.log('кадр: записка → «' + String(focus.note && focus.note.art).slice(0, 60) + '» · метка ' + (focus.note && focus.note.tag));
    if (!focus.note || !/note|letter/i.test(focus.note.art)) problems.push('действие «поднять записку» не даёт крупный план записки');
    if (!focus.note || !focus.note.close) problems.push('записка не помечена как крупный план');
    if (!focus.note || !focus.note.tag) problems.push('у записки нет метки для нового кадра');
    if (!focus.walk || !/bridge|travelling/i.test(focus.walk.art)) problems.push('ходьба не даёт кадр движения');
    if (focus.idle) problems.push('простое ожидание не должно менять кадр');
  }

  /* ---------- 4. класс и вид не спрашивают дважды ---------- */
  await page.evaluate(() => {
    localStorage.clear();
    const raw = JSON.parse(localStorage.getItem('dt2:settings') || '{}');
    localStorage.setItem('dt2:settings', JSON.stringify(Object.assign(raw, { master: 'local', voice: false })));
  });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.click('#mode-tabs .tab[data-mode="custom"]');
  await page.waitForSelector('#pane-custom:not([hidden]) #wc-genres .chip', { timeout: 6000 });
  await page.fill('#wc-title', 'Пепел Астры');
  await page.evaluate(() => { const b = document.querySelector('[data-act="create-custom-world"]'); if (b) b.click(); });
  await page.waitForSelector('#hero-name', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(500);
  const firstVisit = await page.evaluate(() => {
    const cls = document.querySelector('#class-list .arch-card');
    if (cls) cls.click();
    const race = document.querySelector('#race-list .chip');
    if (race) race.click();
    return {
      sections: ['#section-class', '#section-race', '#section-origin'].map(s => !document.querySelector(s).hidden),
      name: (document.getElementById('hero-name') || {}).value || ''
    };
  });
  console.log('первый заход: разделы открыты ' + firstVisit.sections.filter(Boolean).length + '/3, герой «' + firstVisit.name + '»');
  await page.waitForTimeout(300);
  // начинаем игру: выбор героя сохраняется первым же ходом
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'game', null, { timeout: 90000 }).catch(() => {});
  // мастер может спросить, где начать: отвечаем «пусть решает сам», если спросил
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#modal button')).find(x => /Пусть решает/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForFunction(() => {
    const k = Object.keys(localStorage).find(x => x.indexOf('dt2:heroPick:') === 0);
    return !!k;
  }, null, { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const b = document.querySelector('[data-act="close-game"]');
    if (b) b.click();
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#modal button')).find(x => /Выйти|Да|Меню/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(800);
  const saved = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.indexOf('dt2:heroPick:') === 0);
    return key ? JSON.parse(localStorage.getItem(key)) : null;
  });
  // второй заход в тот же мир
  console.log('экран перед вторым заходом: ' + await page.evaluate(() => document.body.dataset.screen));
  await page.evaluate(() => { const b = document.querySelector('#screen-menu [data-act="new-game"]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  console.log('экран миров: ' + await page.evaluate(() => document.body.dataset.screen +
    ' · вкладок ' + document.querySelectorAll('#mode-tabs .tab').length));
  await page.evaluate(() => { const b = document.querySelector('#mode-tabs .tab[data-mode="custom"]'); if (b) b.click(); });
  await page.waitForSelector('#pane-custom:not([hidden]) #wc-genres .chip', { timeout: 6000 });
  await page.fill('#wc-title', 'Пепел Астры');
  await page.evaluate(() => { const b = document.querySelector('[data-act="create-custom-world"]'); if (b) b.click(); });
  await page.waitForSelector('#hero-name', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(700);
  const secondVisit = await page.evaluate(() => ({
    noteShown: !document.getElementById('hero-pick-note').hidden,
    noteText: (document.getElementById('hero-pick-text') || {}).textContent || '',
    sections: ['#section-class', '#section-race', '#section-origin'].map(s => !document.querySelector(s).hidden),
    chosenClass: (window.DTstate ? '' : '')
  }));
  await page.screenshot({ path: path.join(SHOTS, 'v19-hero-pick-kept.png') });
  console.log('герой: выбор сохранён ' + (saved ? ('(' + [saved.classId, saved.raceId, saved.originId].filter(Boolean).join(', ') + ')') : 'НЕТ'));
  console.log('второй заход: строка «уже выбрано» ' + (secondVisit.noteShown ? 'видна' : 'скрыта') +
    ' · разделы раскрыты: ' + secondVisit.sections.filter(Boolean).length + '/3 · «' + secondVisit.noteText.slice(0, 70) + '»');
  if (!saved) problems.push('выбор героя не сохранился за миром');
  else {
    if (!secondVisit.noteShown) problems.push('во второй заход нет строки «в этом мире уже выбрано»');
    if (secondVisit.sections.some(Boolean)) problems.push('во второй заход снова спрашивают класс/вид/происхождение');
    if (!/Пепел Астры|уже выбрано/i.test(secondVisit.noteText)) problems.push('строка «уже выбрано» пустая');
  }

  if (errors.length) problems.push('ошибок страницы: ' + errors.join(' | '));
  console.log(problems.length
    ? 'ЧЕТЫРЕ ОБЕЩАНИЯ: ' + problems.join(' · ')
    : 'ЧЕТЫРЕ ОБЕЩАНИЯ: настройки не выкидывают, озвучка догоняет сцену, выбор героя помнится — ❤');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
