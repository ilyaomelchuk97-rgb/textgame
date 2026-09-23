/**
 * tools/fonts.js — раскладка при трёх размерах шрифта.
 *
 * На iPhone 13 mini узкий экран: если игрок увеличил текст (крупнее системный
 * шрифт, режим доступности), кнопки и сцена не должны уезжать за край.
 * Проверяем три масштаба и сохраняем снимки в shots/.
 *
 *   node tools/fonts.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const SCALES = [
  { id: 'font-100', zoom: 1.0, label: 'обычный' },
  { id: 'font-115', zoom: 1.15, label: 'крупнее' },
  { id: 'font-130', zoom: 1.3, label: 'крупный' }
];

(async () => {
  const shots = path.join(__dirname, '..', 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  let bad = 0;
  for (const scale of SCALES) {
    const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e && e.message || e)));
    await page.route('**/api/gm/stream*', route => route.abort());
    await page.route('**/api/gm', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify({
        scene: 'Мастер поднимает лампу: на стене проступает карта, а за дверью кто-то переступает с ноги на ногу. ' +
          'Пахнет дымом и мокрой шерстью; тени идут по потолку впереди тебя.',
        chapter: 'Глава I', place: 'Караульная у моста',
        imagePrompt: 'dim guardroom with a lit lamp and a map on the wall, hero in the foreground',
        options: [
          { text: 'Прочитать карту и запомнить тропы', stat: 'int', difficulty: 'easy' },
          { text: 'Спросить, кто ходит за дверью', stat: 'per', difficulty: 'medium' },
          { text: 'Открыть дверь рывком', stat: 'str', difficulty: 'hard' }
        ], effects: {}
      }) })
    }));
    await page.route('**/api/image**', route => route.fulfill({
      status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
    }));
    await page.goto(BASE, { waitUntil: 'load' });
    // имитируем увеличенный текст так, как это делает система: масштаб страницы
    await page.evaluate(z => { document.documentElement.style.zoom = String(z); }, scale.zoom);
    await page.waitForTimeout(500);
    await page.click('#screen-menu [data-act="new-game"]');
    await page.waitForSelector('#pane-random .scenario-card');
    await page.click('#pane-random .scenario-card:first-child');
    await page.waitForSelector('#hero-name');
    await page.fill('#hero-name', 'Шрифт');
    await page.click('#class-list .arch-card:nth-child(1)');
    await page.click('#race-list .chip:nth-child(1)');
    await page.click('#origin-list .arch-card:nth-child(1)');
    await page.click('#screen-hero [data-act="start-adventure"]');
    await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 15000 }).catch(() => {});
    await page.click('#modal .btn--ghost').catch(() => {});
    await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 30000 });
    await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"], .prologue__go'); if (b) b.click(); });
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => {
      const app = document.getElementById('app').getBoundingClientRect();
      const actions = document.getElementById('actions').getBoundingClientRect();
      const buttons = Array.from(document.querySelectorAll('.action-btn:not(.action-btn--ghost)'));
      const texts = buttons.map(b => (b.querySelector('.action-btn__text') || b).getBoundingClientRect());
      const panel = document.getElementById('panel').getBoundingClientRect();
      const overflowX = document.body.scrollWidth > window.innerWidth + 1;
      return {
        vw: window.innerWidth, vh: window.innerHeight,
        buttonRows: texts.length,
        maxTextWidth: texts.length ? Math.round(Math.max.apply(null, texts.map(t => t.width))) : 0,
        buttonsInside: Math.round(actions.right) <= Math.round(app.right) + 1,
        actionsBottom: Math.round(actions.bottom),
        appBottom: Math.round(app.bottom),
        panelH: Math.round(panel.height),
        clipped: buttons.filter(b => b.scrollHeight > b.clientHeight + 2).length,
        overflowX
      };
    });
    const problems = [];
    if (m.overflowX) problems.push('страница шире экрана по горизонтали');
    if (!m.buttonsInside) problems.push('кнопки выходят за пределы приложения');
    if (m.actionsBottom > m.appBottom + 1) problems.push('кнопки уехали ниже экрана');
    if (m.clipped) problems.push('обрезанных кнопок: ' + m.clipped);
    if (m.panelH < 90) problems.push('тексту мало места: ' + m.panelH + 'px');
    await page.screenshot({ path: path.join(shots, scale.id + '.png') });
    console.log((problems.length ? '✗ ' : '✓ ') + scale.id.padEnd(10) + scale.label.padEnd(10) +
      ' текст ' + m.panelH + 'px, кнопок ' + m.buttonRows + ', ширина текста кнопки ' + m.maxTextWidth + 'px' +
      (problems.length ? '  → ' + problems.join(', ') : ''));
    if (problems.length || errors.length) {
      bad++;
      errors.slice(0, 2).forEach(e => console.log('   ! ' + e));
    }
    await ctx.close();
  }
  /* ---- встроенные ступени текста: мелкий / обычный / крупный ---- */
  for (const size of ['s', 'm', 'l']) {
    const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e && e.message || e)));
    await page.addInitScript(sz => {
      try {
        const cur = JSON.parse(localStorage.getItem('dt2:settings') || '{}');
        cur.textSize = sz;
        localStorage.setItem('dt2:settings', JSON.stringify(cur));
      } catch (e) {}
    }, size);
    await page.route('**/api/gm/stream*', route => route.abort());
    await page.route('**/api/gm', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify({
        scene: 'Мастер поднимает лампу: на стене проступает карта, а за дверью кто-то переступает с ноги на ногу. ' +
          'Пахнет дымом и мокрой шерстью; тени идут по потолку впереди тебя. Мара шепчет: «Не свети в окно».',
        chapter: 'Глава I', place: 'Караульная у моста',
        imagePrompt: 'dim guardroom with a lit lamp and a map on the wall, hero in the foreground',
        options: [
          { text: 'Прочитать карту и запомнить тропы', stat: 'int', difficulty: 'easy' },
          { text: 'Спросить, кто ходит за дверью', stat: 'per', difficulty: 'medium' },
          { text: 'Открыть дверь рывком', stat: 'str', difficulty: 'hard' }
        ], effects: {}
      }) })
    }));
    await page.route('**/api/image**', route => route.fulfill({
      status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
    }));
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    await page.click('#screen-menu [data-act="new-game"]');
    await page.waitForSelector('#pane-random .scenario-card');
    await page.click('#pane-random .scenario-card:first-child');
    await page.waitForSelector('#hero-name');
    await page.fill('#hero-name', 'Ступень');
    await page.click('#class-list .arch-card:nth-child(1)');
    await page.click('#race-list .chip:nth-child(1)');
    await page.click('#origin-list .arch-card:nth-child(1)');
    await page.click('#screen-hero [data-act="start-adventure"]');
    await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 15000 }).catch(() => {});
    await page.click('#modal .btn--ghost').catch(() => {});
    await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 30000 });
    await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"], .prologue__go'); if (b) b.click(); });
    await page.waitForTimeout(700);
    const m = await page.evaluate(() => {
      const app = document.getElementById('app').getBoundingClientRect();
      const top = document.querySelector('.game-topbar').getBoundingClientRect();
      const media = document.querySelector('.scene-media').getBoundingClientRect();
      const panel = document.getElementById('panel').getBoundingClientRect();
      const actions = document.getElementById('actions').getBoundingClientRect();
      const buttons = Array.from(document.querySelectorAll('.action-btn:not(.action-btn--ghost)'));
      return {
        topPct: +(top.height / app.height * 100).toFixed(1),
        mediaPct: +(media.height / app.height * 100).toFixed(1),
        panelH: Math.round(panel.height),
        actionsInside: Math.round(actions.bottom) <= Math.round(app.bottom) + 1,
        clipped: buttons.filter(b => b.scrollHeight > b.clientHeight + 2).length,
        fontPx: parseFloat(getComputedStyle(document.querySelector('.scene-text__body')).fontSize),
        bodyClass: document.body.className
      };
    });
    const problems = [];
    if (Math.abs(m.topPct - 17) > 4) problems.push('шапка ' + m.topPct + '%');
    if (Math.abs(m.mediaPct - 22) > 1.7) problems.push('картинка ' + m.mediaPct + '%');
    if (!m.actionsInside) problems.push('кнопки за экраном');
    if (m.clipped) problems.push('обрезанных кнопок: ' + m.clipped);
    if (m.panelH < 90) problems.push('тексту мало места');
    if (!/text-/.test(m.bodyClass)) problems.push('класс ступени не применён');
    await page.screenshot({ path: path.join(shots, 'textsize-' + size + '.png') });
    console.log((problems.length ? '✗ ' : '✓ ') + ('текст ' + size).padEnd(12) +
      'шрифт ' + m.fontPx + 'px, шапка ' + m.topPct + '%, кадр ' + m.mediaPct + '%, панель ' + m.panelH + 'px' +
      (problems.length ? '  → ' + problems.join(', ') : ''));
    if (problems.length || errors.length) {
      bad++;
      errors.slice(0, 2).forEach(e => console.log('   ! ' + e));
    }
    await ctx.close();
  }

  await browser.close();
  console.log(bad ? '\nПроблемных масштабов: ' + bad : '\nВсе размеры текста в порядке');
  process.exitCode = bad ? 1 : 0;
})();
