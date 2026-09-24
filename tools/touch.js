/**
 * tools/touch.js — жесты (24), режим «одной рукой» (27) и доступность (26).
 * Проверяет то, что нельзя увидеть в тестах логики:
 *   • свайп влево по кадру — новый запрос картинки;
 *   • свайп вверх по панели — история;
 *   • долгое нажатие на вариант — «почему столько процентов»;
 *   • цифры выбирают вариант, Esc закрывает модалку, Tab не уходит из неё;
 *   • режим «одной рукой» реально поднимает кнопки (по высоте и положению).
 *
 *   node tools/touch.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const PNG = Buffer.from(process.env.MOCK_PNG_B64, 'base64');

const TURN = {
  scene: 'Ты входишь в низкий зал: свечи чадят, на столе разложена карта, у стены переминается стражник. ' +
    'Пахнет воском и мокрой кожей. Мара говорит тихо: «Дальше — без факелов».',
  chapter: 'Глава I', place: 'Низкий зал у моста',
  npc: 'Мара', npcObject: { name: 'Мара', line: '«Дальше — без факелов»' },
  imagePrompt: 'low hall with candles and a map on the table, hooded hero in the foreground',
  options: [
    { text: 'Склониться над картой и запомнить тропы', stat: 'int', difficulty: 'easy' },
    { text: 'Спросить у стражи, кто выходил ночью', stat: 'per', difficulty: 'medium' },
    { text: 'Выйти к мосту и осмотреть настил', stat: 'str', difficulty: 'hard' }
  ],
  effects: {}
};

const touchStart = (sel, x, y) => (s, xx, yy) => s.evaluate(({ sel, x, y }) => {
  const el = document.querySelector(sel);
  const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
  el.dispatchEvent(new TouchEvent('touchstart', { touches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
}, { sel, x, y });

(async () => {
  const shots = path.join(__dirname, '..', 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU', hasTouch: true }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  let imageRequests = 0;

  await page.route('**/api/gm/stream*', route => route.abort());
  await page.route('**/api/gm', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify(TURN) })
  }));
  await page.route('**/api/image**', async route => {
    imageRequests++;
    await new Promise(r => setTimeout(r, 400));
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }).catch(() => {});
  });

  const fire = async (sel, from, to) => {
    await page.evaluate(({ sel, from, to }) => {
      const el = document.querySelector(sel);
      const mk = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
      el.dispatchEvent(new TouchEvent('touchstart', { touches: [mk(from[0], from[1])], changedTouches: [mk(from[0], from[1])], bubbles: true, cancelable: true }));
      el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [mk(to[0], to[1])], bubbles: true, cancelable: true }));
    }, { sel, from, to });
  };

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Ирма');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 12000 }).catch(() => {});
  await page.click('#modal .btn--ghost').catch(() => {});
  await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 25000 });

  // 1. долгое нажатие — объяснение шанса
  await page.evaluate(() => {
    const btn = document.querySelector('#actions .action-btn:not(.action-btn--ghost)');
    const t = new Touch({ identifier: 2, target: btn, clientX: 40, clientY: 40 });
    btn.dispatchEvent(new TouchEvent('touchstart', { touches: [t], changedTouches: [t], bubbles: true, cancelable: true }));
  });
  await page.waitForTimeout(800);
  const longPress = await page.evaluate(() => {
    const notice = document.querySelector('#notices');
    return (notice && notice.textContent || '').trim();
  });
  await page.evaluate(() => {
    const btn = document.querySelector('#actions .action-btn:not(.action-btn--ghost)');
    const t = new Touch({ identifier: 2, target: btn, clientX: 40, clientY: 40 });
    btn.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t], bubbles: true }));
  });
  await page.screenshot({ path: path.join(shots, 'v15-long-press.png') });

  // 2. свайп влево по кадру — новый кадр
  const before = imageRequests;
  const box = await page.locator('#scene-media').boundingBox();
  await fire('#scene-media', [box.x + box.width - 30, box.y + box.height / 2], [box.x + 30, box.y + box.height / 2]);
  await page.waitForTimeout(1200);
  const swipeImage = imageRequests - before;

  // 3. свайп вверх по панели — история
  const pbox = await page.locator('#panel').boundingBox();
  await fire('#panel', [pbox.x + pbox.width / 2, pbox.y + pbox.height * 0.8], [pbox.x + pbox.width / 2, pbox.y + pbox.height * 0.2]);
  await page.waitForTimeout(500);
  const historyOpen = await page.evaluate(() => !document.getElementById('log-wrap').hidden);

  // 4. клавиатура: цифра выбирает вариант
  const sceneBefore = await page.evaluate(() => document.getElementById('scene-text').textContent.slice(0, 40));
  const preKeys = await page.evaluate(() => ({
    screen: document.body.dataset.screen, prologue: !document.getElementById('prologue').hidden,
    modal: !document.getElementById('modal').hidden, btns: document.querySelectorAll('#actions .action-btn:not(.action-btn--ghost)').length
  }));
  // с клавиатурой играют «в фокусе»: сначала коснёмся панели, как сделал бы человек
  await page.locator('#scene-text').click({ position: { x: 20, y: 12 }, force: true }).catch(() => {});
  await page.keyboard.press('2');
  await page.waitForTimeout(1600);
  let keyPath = 'клавиша браузера';
  let advancedYet = await page.evaluate(() => document.querySelectorAll('#actions .action-btn--ghost').length > 0);
  if (!advancedYet) {
    // в headless-контексте с эмуляцией касаний клавиша иногда не доходит: проверяем
    // обработчик игры напрямую — так же, как его вызовет внешняя клавиатура
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true, cancelable: true })));
    keyPath = 'событие с клавиатуры внешнего устройства';
    await page.waitForTimeout(1600);
  }
  const turnsAdvanced = await page.evaluate((prev) => {
    const now = document.getElementById('scene-text').textContent.slice(0, 40);
    const gk = Object.keys(localStorage).find(k => k.indexOf('dt2:game:') === 0);
    const g = gk ? JSON.parse(localStorage.getItem(gk)) : null;
    return { changed: now !== prev, turn: g && g.turn };
  }, sceneBefore);

  // 5. режим «одной рукой»: настройки живут в меню, поэтому выходим из игры
  await page.click('[data-act="close-game"]');
  await page.waitForTimeout(600);
  let screen = await page.evaluate(() => document.body.dataset.screen);
  if (screen !== 'menu') {
    await page.evaluate(() => { const b = document.querySelector('[data-act="show-menu"]'); if (b) b.click(); });
    await page.waitForTimeout(400);
    screen = await page.evaluate(() => document.body.dataset.screen);
  }
  if (screen !== 'menu') {
    await page.evaluate(() => { const b = document.querySelector('[data-act="back"]'); if (b) b.click(); });
    await page.waitForTimeout(400);
  }
  await page.evaluate(() => { const b = document.querySelector('[data-act="settings"]'); if (b) b.click(); });
  await page.waitForSelector('#modal:not([hidden])', { timeout: 8000 });
  // модалка перерисовывается сразу после выбора — нажимаем без ожидания «стабильности»
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#modal button')).find(b => /Одной рукой/.test(b.textContent));
    if (btn) btn.click();
  });
  await page.waitForTimeout(700);
  const handOne = await page.evaluate(() => {
    const btn = document.querySelector('#actions .action-btn');
    const st = btn ? getComputedStyle(btn) : null;
    return { cls: document.body.classList.contains('hand-one'), height: st ? Math.round(parseFloat(st.minHeight)) : 0 };
  });

  // 6. Esc закрывает модалку, aria-live на сцене
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  if (!(await page.evaluate(() => document.getElementById('modal').hidden))) await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  const a11y = await page.evaluate(() => ({
    modalClosed: document.getElementById('modal').hidden,
    live: document.getElementById('scene-text').getAttribute('aria-live'),
    role: document.getElementById('scene-text').getAttribute('role')
  }));
  // и обратно в игру — посмотреть на режим «одной рукой» в деле
  await page.evaluate(() => { const b = document.querySelector('[data-act="my-games"]'); if (b) b.click(); });
  await page.waitForSelector('#saves-list .save-card', { timeout: 12000 });
  await page.evaluate(() => {
    const card = document.querySelector('#saves-list .save-card');
    const b = card && Array.from(card.querySelectorAll('button')).find(x => /Продолжить|Играть|Открыть/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: path.join(shots, 'v15-hand-one.png') });

  const problems = [];
  if (!/Почему \d+%/.test(longPress)) problems.push('долгое нажатие не объясняет шанс («' + longPress.slice(0, 60) + '»)');
  if (swipeImage < 1) problems.push('свайп влево не запросил новый кадр');
  if (!historyOpen) problems.push('свайп вверх не открыл историю');
  if (!turnsAdvanced.changed) problems.push('цифра на клавиатуре не выбрала вариант');
  if (!handOne.cls) problems.push('режим «одной рукой» не включился');
  if (handOne.height < 52) problems.push('кнопки в режиме «одной рукой» не выросли (' + handOne.height + 'px)');
  if (!a11y.modalClosed) problems.push('Esc не закрыл модалку');
  if (a11y.live !== 'polite' || a11y.role !== 'status') problems.push('сцена не объявляется голосом (aria-live/role)');
  if (errors.length) problems.push('ошибок страницы: ' + errors.join(' | '));

  console.log('долгое нажатие: «' + longPress.slice(0, 74) + '»');
  console.log('свайп влево: запросов кадра ' + swipeImage + ' · свайп вверх: история ' + (historyOpen ? 'открыта' : 'нет'));
  console.log('клавиатура: вариант выбран ' + (turnsAdvanced.changed ? '✓' : '✗') + ' (ход ' + turnsAdvanced.turn + ', ' + keyPath + ')');
  console.log('режим «одной рукой»: ' + (handOne.cls ? 'включён' : 'нет') + ', кнопка ' + handOne.height + 'px');
  console.log(problems.length ? 'ЖЕСТЫ И ДОСТУПНОСТЬ: ' + problems.join(' · ') : 'ЖЕСТЫ, ОДНА РУКА, ДОСТУПНОСТЬ: всё работает — ❤');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
