/**
 * tools/smoke.js — прогон игры в headless-Chromium на экране iPhone 13 mini.
 * Проверяет: раскладку (8% / 22%), консольные ошибки, весь путь игрока,
 * работу резервного (офлайн) мастера и путь с «живым» ИИ (через мок-роут).
 *
 * Запуск:  node tools/smoke.js http://localhost:8123/index.html
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');

const URL_BASE = process.argv[2] || 'http://localhost:8123/index.html';
const LIVE = process.argv.includes('--live'); // без мока ИИ: проверяем настоящий канал
const OUT = path.join(__dirname, '..', 'shots');
const iphone = devices['iPhone 13 Mini'] || { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true };

const problems = [];
let step = 0;

async function shot(page, name) {
  fs.mkdirSync(OUT, { recursive: true });
  step++;
  const file = path.join(OUT, String(step).padStart(2, '0') + '-' + name + '.png');
  await page.screenshot({ path: file });
  console.log('  · скриншот', path.basename(file));
  return file;
}

async function main() {
  const browser = await chromium.launch();
  const context = await browser.newContext(Object.assign({}, iphone, { locale: 'ru-RU' }));
  const page = await context.newPage();

  const consoleErrors = [];
  const badResponses = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
  page.on('response', r => {
    if (r.status() >= 400) badResponses.push(r.status() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, ''));
  });

  console.log('\n1. Главный экран');
  await page.goto(URL_BASE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await shot(page, 'menu');

  // фон меню: мало иметь url() в стилях — проверяем, что картинка реально отдаётся
  const menuBg = await page.evaluate(async () => {
    const bg = getComputedStyle(document.querySelector('.menu-bg')).backgroundImage;
    const url = (bg.match(/url\(["']?([^"')]+)["']?\)/) || [])[1];
    if (!url) return { url: null, ok: false };
    const ok = await fetch(url).then(r => r.ok).catch(() => false);
    return { url, ok };
  });
  if (!menuBg.ok) problems.push('фон меню не загрузился: ' + menuBg.url);
  // рыцарь с дракошей: нарисованы кодом, бегают и останавливаются вне меню
  const critterFirst = await page.evaluate(() => {
    const k = document.querySelector('#menu-critters .critter--knight');
    const d = document.querySelector('#menu-critters .critter--dragon');
    if (!k || !d) return null;
    return {
      knightX: Math.round(k.getBoundingClientRect().x),
      dragonX: Math.round(d.getBoundingClientRect().x),
      running: k.classList.contains('is-running') && d.classList.contains('is-running'),
      hasDragonClass: d.querySelectorAll('.art-dragon, .art-wing, .art-horn').length,
      hasKnightClass: k.querySelectorAll('.art-shield, .art-star, .art-steel').length
    };
  });
  if (!critterFirst) problems.push('на главном экране нет рыцаря и дракоши');
  else {
    if (!critterFirst.running) problems.push('герои не бегают');
    if (!critterFirst.hasDragonClass) problems.push('дракоша не нарисован');
    if (!critterFirst.hasKnightClass) problems.push('рыцарь не нарисован');
    await page.waitForTimeout(1200);
    const moved = await page.evaluate(x => Math.abs(
      Math.round(document.querySelector('#menu-critters .critter--knight').getBoundingClientRect().x) - x
    ), critterFirst.knightX);
    console.log('   герои меню: сдвиг рыцаря за 1.2 с =', moved, 'px');
    if (moved < 20) problems.push('рыцарь не двигается по экрану (сдвиг ' + moved + 'px)');
  }

  const btnBox = await page.locator('#screen-menu [data-act="new-game"]').boundingBox();
  if (!btnBox || btnBox.height < 44) problems.push('кнопка «Начать новую игру» меньше 44px по высоте');
  if (!btnBox || btnBox.y + btnBox.height > iphone.viewport.height) problems.push('кнопка «Начать новую игру» вне экрана');

  console.log('2. Выбор сценария');
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card', { timeout: 5000 });
  await page.waitForTimeout(700);
  await shot(page, 'scenarios');
  const cards = await page.locator('#pane-random .scenario-card').count();
  if (cards < 2) problems.push('мало сценариев в подборке: ' + cards);

  console.log('2b. Режимы: по играм и свой мир');
  await page.click('#mode-tabs .tab[data-mode="games"]');
  await page.waitForSelector('#pane-games:not([hidden]) #game-worlds-list .scenario-card', { timeout: 4000 });
  await shot(page, 'scenarios-games');
  const worlds = await page.locator('#pane-games #game-worlds-list .scenario-card').count();
  if (worlds < 3) problems.push('мало режимов-игр: ' + worlds);

  await page.click('#mode-tabs .tab[data-mode="custom"]');
  await page.waitForSelector('#pane-custom:not([hidden]) #wc-genres .chip', { timeout: 4000 });
  const chips = await page.evaluate(() => ({
    genres: document.querySelectorAll('#wc-genres .chip').length,
    tones: document.querySelectorAll('#wc-tones .chip').length,
    places: document.querySelectorAll('#wc-places .chip').length,
    roles: document.querySelectorAll('#wc-roles .chip').length,
    ingredients: document.querySelectorAll('#wc-ingredients .chip').length,
    danger: document.querySelectorAll('#wc-danger .chip').length
  }));
  console.log('   чипы конструктора:', JSON.stringify(chips));
  ['genres', 'tones', 'places', 'roles', 'ingredients', 'danger'].forEach(k => {
    if (chips[k] < 3) problems.push('в конструкторе мира мало вариантов в «' + k + '»: ' + chips[k]);
  });
  // выбираем набор пресетов, сохраняем мир и проверяем список сохранённых миров
  await page.click('#wc-genres .chip:nth-child(2)');
  await page.click('#wc-tones .chip:nth-child(2)');
  await page.click('#wc-places .chip:nth-child(2)');
  await page.click('#wc-danger .chip:last-child');
  await page.click('#pane-custom [data-act="random-world"]');
  await page.waitForTimeout(300);
  await page.click('#pane-custom [data-act="save-world"]');
  await page.waitForSelector('#saved-worlds .save-card--world', { timeout: 4000 });
  const savedWorlds = await page.locator('#saved-worlds .save-card--world').count();
  if (!savedWorlds) problems.push('мир не сохранился в localStorage (dt2:worlds)');
  await shot(page, 'scenarios-custom');
  const customWorld = await page.evaluate(() => JSON.parse(localStorage.getItem('dt2:worlds') || '[]'));
  console.log('   сохранённые миры:', JSON.stringify(customWorld).slice(0, 120));

  // «своя игра»: пишем название игры — мир и профиль героя собирает ИИ, поэтому мокаем мастера
  await page.route('**/api/gm', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      ok: true, provider: 'mock',
      text: JSON.stringify({
        title: 'Континент под пеплом', goal: 'Найти Цири',
        world: 'Мир Вызимы живёт по контрактам: чудовища есть, но страшнее люди.',
        backstory: 'Ты вырос в школе на скале и потерял всех, кто тебя учил.',
        plan: ['Осмотреться в Вызиме', 'Найти заказчика', 'Выбрать сторону в войне'],
        hero: {
          classLabel: 'Школа',
          classes: [{ id: 'mage', title: 'Ведьмак', hint: 'мутант с медальоном' }, { id: 'warrior', title: 'Наёмник' }],
          races: [],                                        // в этой игре раса не выбирается — шаг должен исчезнуть
          origins: [{ id: 'soldier', title: 'Школа Волка' }]
        },
        opening: 'Вызима пахнет дымом и рыбой.',
        options: [{ text: 'Подойти к заказчику', stat: 'per', difficulty: 'easy' }]
      })
    })
  }));
  await page.click('#mode-tabs .tab[data-mode="games"]');
  await page.fill('#own-game-input', 'Ведьмак 3');
  await page.click('#pane-games [data-act="start-own-game"]');
  await page.waitForSelector('#hero-name', { timeout: 15000 });
  const ownTitle = await page.evaluate(() => document.getElementById('hero-scenario').textContent);
  console.log('   свой мир на экране героя:', ownTitle.slice(0, 60));
  if (!/Ведьмак/i.test(ownTitle)) problems.push('название своей игры не попало на экран героя');
  // создание героя подстроено под игру: лишний шаг скрыт, подписи от мастера на месте
  const ownProfile = await page.evaluate(() => ({
    raceHidden: document.getElementById('section-race').hidden,
    originHidden: document.getElementById('section-origin').hidden,
    classLabel: document.getElementById('label-class').textContent,
    classes: Array.from(document.querySelectorAll('#class-list .arch-card__title')).map(t => t.textContent)
  }));
  console.log('   профиль героя для «своей игры»:', JSON.stringify(ownProfile));
  // профиль собирает ИИ; если сервера нет — его подставляет встроенная таблица знакомых игр
  const backendReady = await page.evaluate(() => !!(window.DTapi && window.DTapi.CONFIG && window.DTapi.CONFIG.backend));
  console.log('   канал мастера:', backendReady ? 'свой сервер' : 'локальный (без сервера)');
  if (!ownProfile.raceHidden) problems.push('для «своей игры» шаг с расой не скрыт');
  if (ownProfile.classLabel !== 'Школа') problems.push('подпись шага класса не применилась: ' + ownProfile.classLabel);
  if (ownProfile.classes.length < 2) problems.push('список классов не применился: ' + ownProfile.classes.join(','));
  await page.click('#screen-hero [data-act="back"]');
  await page.waitForSelector('#screen-scenarios:not([hidden])', { timeout: 4000 });
  await page.click('#mode-tabs .tab[data-mode="custom"]');
  await page.click('#scenarios-footer [data-act="create-custom-world"]');
  await page.waitForSelector('#hero-name', { timeout: 5000 });

  console.log('3. Создание героя');
  await page.click('#screen-hero [data-act="back"]');
  await page.waitForSelector('#screen-scenarios:not([hidden])', { timeout: 4000 });
  await page.click('#mode-tabs .tab[data-mode="random"]');
  await page.waitForSelector('#pane-random:not([hidden]) .scenario-card', { timeout: 4000 });
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name', { timeout: 5000 });
  await page.fill('#hero-name', 'Кай');
  const pickers = await page.evaluate(() => ({
    classes: document.querySelectorAll('#class-list .arch-card').length,
    races: document.querySelectorAll('#race-list .chip').length,
    origins: document.querySelectorAll('#origin-list .arch-card').length,
    stats: document.querySelectorAll('#stat-preview .stat-chip:not(.stat-chip--hp)').length,
    hp: (document.querySelector('#stat-preview .stat-chip--hp .stat-chip__value') || {}).textContent || '',
    world: (document.getElementById('hero-scenario') || {}).textContent || ''
  }));
  console.log('   выбор героя:', JSON.stringify(pickers));
  if (pickers.classes < 6) problems.push('мало классов: ' + pickers.classes);
  if (pickers.races < 6) problems.push('мало рас: ' + pickers.races);
  if (pickers.origins < 6) problems.push('мало происхождений: ' + pickers.origins);
  if (pickers.stats !== 7) problems.push('в превью не 7 характеристик: ' + pickers.stats);
  if (!/\d/.test(pickers.hp)) problems.push('в превью нет здоровья');
  await page.click('#class-list .arch-card:nth-child(2)');
  await page.click('#race-list .chip:nth-child(3)');
  await page.click('#origin-list .arch-card:nth-child(4)');
  await page.waitForTimeout(400);
  const afterPicks = await page.evaluate(() => ({
    hp: (document.querySelector('#stat-preview .stat-chip--hp .stat-chip__value') || {}).textContent || '',
    str: (document.querySelector('#stat-preview .stat-chip:first-child .stat-chip__value') || {}).textContent || '',
    trait: (document.getElementById('race-hint') || {}).textContent || ''
  }));
  console.log('   после выбора расы/происхождения:', JSON.stringify(afterPicks));
  if (!/\d/.test(afterPicks.str)) problems.push('превью характеристик не обновляется');
  if (!/Особенность/.test(afterPicks.trait)) problems.push('не показана особенность выбранной расы');
  await shot(page, 'hero');
  const startBox = await page.locator('#screen-hero [data-act="start-adventure"]').boundingBox();
  if (!startBox || startBox.y + startBox.height > iphone.viewport.height + 1) {
    problems.push('кнопка «Начать приключение» вне экрана (не прокручивается?)');
  }

  console.log('4. Игра: старт ' + (LIVE ? '(настоящий ИИ через сервер)' : '(мок-ИИ)'));
  await page.unroute('**/api/gm');   // убираем мок мира, дальше свой ответ мастера
  // Мокаем ИИ-мастера и генератор картинок — проверяем «живой» путь без внешних сбоев
  // Мокаем ИИ-мастера и генератор картинок — проверяем «живой» путь без внешних сбоев
  if (!LIVE) await page.route('**/api/gm', route => {
    const body = JSON.stringify({
      ok: true, provider: 'mock',
      text: JSON.stringify({
        world: 'Асгельд живёт слухами: дороги держат баронские заставы, а в лесах пропадают люди.',
        backstory: 'Ты вырос на переправе у разорившегося трактира и ушёл, когда нечем стало платить за соль.',
        plan: ['Осмотреться и понять, кто ходит по этой тропе', 'Найти след пропавших с обозом', 'Выбрать, за кого держаться в Асгельде'],
        scene: 'Тропа уходит вглубь, и туман смыкается за спиной. Где-то впереди звенит колокольчик — ближе, чем вчера.',
        chapter: 'Глава I. Чёрные стволы',
        npc: 'Старуха с фонарём в глубине леса',
        imagePrompt: 'dark misty forest path, glowing lights, cinematic',
        options: [
          { text: 'Пойти на звон, не сходя с тропы', stat: 'wit', difficulty: 'medium' },
          { text: 'Осмотреть стволы в поисках меток', stat: 'int', difficulty: 'easy' },
          { text: 'Забраться на дерево и осмотреться', stat: 'str', difficulty: 'hard' }
        ],
        effects: { hp: -2, item: 'Кремень старухи', goal: false }
      })
    });
    return route.fulfill({ status: 200, contentType: 'application/json', body });
  });
  if (!LIVE) await page.route('**/api/image**', route => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
    return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(png, 'base64') });
  });

  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#screen-game:not([hidden])', { timeout: 5000 });

  // Раскладка: 8% сверху, 22% картинка
  await page.waitForSelector('#actions .action-btn', { timeout: LIVE ? 60000 : 15000 });
  // ждём, когда подставится картинка сцены (генерация занимает несколько секунд)
  await page.waitForFunction(() => {
    const img = document.getElementById('scene-img');
    return img && img.getAttribute('src') && img.getAttribute('src').length > 10;
  }, { timeout: LIVE ? 45000 : 10000 }).catch(() => console.log('  ! картинка не появилась за отведённое время'));
  await page.waitForTimeout(400);
  // фон рисуется мгновенно, но кадр может совпасть с перерисовкой — даём пару попыток
  const canvasPainted = await page.waitForFunction(() => {
    const c = document.getElementById('scene-canvas');
    if (!c || !c.width || !c.height) return false;
    const ctx = c.getContext('2d');
    const pts = [[c.width / 2, c.height / 2], [c.width * 0.25, c.height * 0.6], [c.width * 0.75, c.height * 0.4]];
    return pts.some(([x, y]) => {
      const d = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      return d[3] > 0 && (d[0] + d[1] + d[2]) > 0;
    });
  }, { timeout: 6000 }).then(() => true).catch(() => false);
  const metrics = await page.evaluate(() => {
    const app = document.getElementById('app').getBoundingClientRect();
    const top = document.querySelector('.game-topbar').getBoundingClientRect();
    const media = document.querySelector('.scene-media').getBoundingClientRect();
    const actions = document.getElementById('actions').getBoundingClientRect();
    return {
      app: Math.round(app.height), top: Math.round(top.height), media: Math.round(media.height),
      topPct: +(top.height / app.height * 100).toFixed(1),
      mediaPct: +(media.height / app.height * 100).toFixed(1),
      actionsBottom: Math.round(actions.bottom), bodyScroll: document.body.scrollHeight > window.innerHeight + 1,
      title: document.getElementById('game-title').textContent,
      sub: document.getElementById('game-sub').textContent,
      optionCount: document.querySelectorAll('#actions .action-btn').length,
      sceneText: document.getElementById('scene-text').textContent.slice(0, 90),
      imgSrc: (document.getElementById('scene-img').getAttribute('src') || '').slice(0, 40),
      canvasSize: (() => {
        const c = document.getElementById('scene-canvas');
        return c ? c.width + 'x' + c.height : 'нет';
      })(),
      status: (document.getElementById('scene-status-text') || {}).textContent || '',
      statusHidden: !!(document.getElementById('scene-status') || {}).hidden,
      badge: (document.getElementById('scene-badge') || {}).getAttribute('hidden') === null
        ? (document.getElementById('scene-badge').textContent || '') : ''
    };
  });
  console.log('   метрики:', JSON.stringify(metrics, null, 1));
  if (Math.abs(metrics.topPct - 14) > 1.7) problems.push('шапка занимает ' + metrics.topPct + '% вместо 14%');
  if (Math.abs(metrics.mediaPct - 22) > 1.6) problems.push('картинка занимает ' + metrics.mediaPct + '% вместо 22%');
  if (metrics.optionCount !== 3) problems.push('вариантов действий: ' + metrics.optionCount + ' (ожидалось 3)');
  if (!metrics.imgSrc) problems.push('картинка сцены не подставилась');
  if (!canvasPainted) problems.push('мгновенный фон (canvas) не нарисован');
  if (!metrics.statusHidden) problems.push('индикатор «рисуем…» остался поверх готовой картинки');
  await shot(page, 'game-turn1');

  console.log('4б. Пролог: мир, предыстория и план отыгрыша');
  const prologue = await page.evaluate(() => {
    const box = document.getElementById('prologue');
    return {
      open: !box.hidden,
      world: (document.getElementById('intro-world-text').textContent || '').slice(0, 70),
      back: (document.getElementById('intro-back-text').textContent || '').slice(0, 70),
      plan: document.querySelectorAll('#intro-plan-list li').length,
      sceneCard: !document.getElementById('intro-scene').hidden
    };
  });
  console.log('   пролог:', JSON.stringify(prologue, null, 1));
  if (!prologue.open) problems.push('пролог не открылся на старте игры');
  if (!prologue.world) problems.push('в прологе нет рассказа о мире');
  if (!prologue.back) problems.push('в прологе нет предыстории героя');
  if (prologue.plan < 3) problems.push('в прологе ' + prologue.plan + ' шагов плана (ожидалось 3)');
  if (!prologue.sceneCard) problems.push('в прологе нет входа в сцену');
  await shot(page, 'prologue');
  await page.click('#prologue [data-act="close-prologue"]');
  await page.waitForTimeout(300);
  const prologueState = await page.evaluate(() => {
    const closed = document.getElementById('prologue').hidden;
    document.getElementById('prologue-btn').click();
    const reopened = !document.getElementById('prologue').hidden;
    document.querySelector('#prologue [data-act="close-prologue"]').click();
    return { closed, reopened };
  });
  console.log('   пролог закрывается/открывается кнопкой:', JSON.stringify(prologueState));
  if (!prologueState.closed) problems.push('пролог не закрывается кнопкой «Играть»');
  if (!prologueState.reopened) problems.push('пролог не открывается кнопкой «Пролог»');
  // фигуры из сцены должны попадать в фон
  const actors = await page.evaluate(() => {
    const c = document.getElementById('scene-canvas');
    return { enemies: c.dataset.enemies, kind: c.dataset.kind || '' };
  });
  console.log('   кто в кадре:', JSON.stringify(actors));
  if (!actors.kind) problems.push('фон не определил тип сцены');

  console.log('5. Бросок кубика и второй ход');
  const abilities = await page.locator('#actions .ability-btn').count();
  if (!abilities) problems.push('нет кнопки умения класса');
  await page.locator('#actions .ability-btn').first().click();
  await page.waitForTimeout(700);
  await shot(page, 'ability');
  const abilityState = await page.evaluate(() => {
    const b = document.querySelector('#actions .ability-btn');
    return { cooling: b.classList.contains('is-cooling'), text: b.textContent.slice(0, 40) };
  });
  console.log('   умение:', JSON.stringify(abilityState));
  if (!abilityState.cooling) problems.push('умение не ушло на перезарядку после применения');

  await page.locator('#actions .action-btn').first().click();
  await page.waitForSelector('#dice-overlay.is-open', { timeout: 4000 });
  await page.waitForTimeout(600);
  await shot(page, 'dice-rolling');
  await page.waitForSelector('.dice-result.is-in', { timeout: 6000 });
  await shot(page, 'dice-result');
  const dice = await page.evaluate(() => ({
    value: document.querySelector('.dice-result__value').textContent,
    math: document.querySelector('.dice-result__math').textContent,
    label: document.querySelector('.dice-result__label').textContent
  }));
  console.log('   бросок:', JSON.stringify(dice));
  if (!/^([1-9]|1[0-9]|20)$/.test(dice.value)) problems.push('на кубике не число 1..20: ' + dice.value);

  await page.click('#dice-overlay');
  await page.waitForTimeout(400);
  await page.waitForFunction(() => !document.getElementById('dice-overlay').classList.contains('is-open'), { timeout: 5000 });
  await page.waitForSelector('#actions .action-btn', { timeout: LIVE ? 60000 : 20000 });
  await page.waitForTimeout(1200);
  await shot(page, 'game-turn2');
  const afterTurn = await page.evaluate(() => ({
    hp: document.getElementById('game-sub').textContent,
    hpWidth: document.getElementById('game-hp').style.width,
    logEntries: document.querySelectorAll('#log-list .log-entry').length,
    scene: document.getElementById('scene-text').textContent.slice(0, 80)
  }));
  console.log('   после хода:', JSON.stringify(afterTurn));

  console.log('6. Сохранение и «Мои игры»');
  await page.click('#screen-game [data-act="close-game"]');
  await page.waitForSelector('#modal.is-open', { timeout: 4000 });
  await shot(page, 'modal-close');
  await page.click('#modal-box .btn--primary');
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="my-games"]');
  await page.waitForSelector('#saves-list .save-card', { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot(page, 'saves');
  const saveInfo = await page.evaluate(() => {
    const raw = localStorage.getItem('dt2:index');
    return raw ? JSON.parse(raw) : null;
  });
  if (!saveInfo || !saveInfo.length) problems.push('сохранение не записалось в localStorage');
  else console.log('   в localStorage:', JSON.stringify(saveInfo[0]).slice(0, 160));

  console.log('7. Перезагрузка страницы — сохранение должно остаться');
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  await page.click('#screen-menu [data-act="my-games"]');
  await page.waitForSelector('#saves-list .save-card', { timeout: 5000 });
  await page.click('#saves-list .save-card .btn--primary');
  await page.waitForSelector('#screen-game:not([hidden])', { timeout: 6000 });
  await page.waitForTimeout(1500);
  await shot(page, 'resumed-game');
  const resumed = await page.evaluate(() => ({
    title: document.getElementById('game-title').textContent,
    turn: document.getElementById('game-sub').textContent,
    options: document.querySelectorAll('#actions .action-btn').length
  }));
  console.log('   восстановлено:', JSON.stringify(resumed));
  if (resumed.options !== 3) problems.push('после загрузки сохранения нет вариантов действий');

  console.log('8. Офлайн-мастер (серверный ИИ недоступен)');
  const beforeOffline = await page.evaluate(() => document.getElementById('scene-text').textContent);
  await page.unroute('**/api/gm');
  await page.route('**/api/gm', route => route.fulfill({ status: 500, body: 'down' }));
  await page.locator('#actions .action-btn').nth(1).click();
  await page.waitForSelector('.dice-result.is-in', { timeout: 8000 });
  await page.click('#dice-overlay');
  // прямой канал может отвечать 403 не сразу — ждём, пока локальный мастер подставит сцену
  await page.waitForFunction(
    prev => document.getElementById('scene-text').textContent !== prev,
    beforeOffline,
    { timeout: 60000 }
  ).catch(() => console.log('  ! сцена не обновилась за минуту'));
  await page.waitForSelector('#actions .action-btn', { timeout: 20000 });
  await page.waitForTimeout(800);
  await shot(page, 'offline-fallback');
  const offline = await page.evaluate(() => ({
    scene: document.getElementById('scene-text').textContent,
    notices: Array.from(document.querySelectorAll('#notices .notice')).map(n => n.textContent.slice(0, 80)),
    options: document.querySelectorAll('#actions .action-btn').length
  }));
  console.log('   офлайн-текст:', offline.scene.slice(0, 110));
  if (!offline.scene || offline.scene.length < 30) problems.push('офлайн-мастер не выдал текст сцены');
  if (offline.scene === beforeOffline) problems.push('при молчащем ИИ сцена не обновилась (офлайн-мастер не сработал)');
  if (offline.options !== 3) problems.push('офлайн-мастер не предложил 3 варианта: ' + offline.options);

  await browser.close();

  console.log('\n=== Ответы с ошибкой: ' + badResponses.length + ' ===');
  Array.from(new Set(badResponses)).slice(0, 10).forEach(e => console.log('  ·', e.slice(0, 150)));
  console.log('=== Консольные ошибки: ' + consoleErrors.length + ' ===');
  consoleErrors.slice(0, 10).forEach(e => console.log('  !', e.slice(0, 160)));
  const realErrors = consoleErrors.filter(e => !/Failed to load resource|net::ERR/.test(e));
  if (realErrors.length) problems.push('ошибки в консоли: ' + realErrors.length);

  console.log('\n=== ИТОГ ===');
  if (problems.length) {
    problems.forEach(p => console.log('  ✗ ' + p));
    process.exitCode = 1;
  } else {
    console.log('  ✓ все проверки пройдены');
  }
}

main().catch(err => { console.error('СБОЙ ТЕСТА:', err); process.exit(1); });
