/**
 * tools/layout.js — проверка раскладки на разных телефонах.
 * Условие: шапка ≈14% высоты, картинка ≈22%, интерфейс без прокрутки body.
 */
const { chromium } = require('playwright');

const TARGETS = [
  ['iPhone SE', { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['iPhone 13 mini', { viewport: { width: 375, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ['Pixel 5 (Android)', { viewport: { width: 393, height: 851 }, deviceScaleFactor: 2.75, isMobile: true, hasTouch: true }],
  ['iPhone 15 Pro Max', { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ['Маленькое окно', { viewport: { width: 360, height: 640 } }],
  ['Телефон горизонтально', { viewport: { width: 667, height: 375 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]
];

(async () => {
  const browser = await chromium.launch();
  const problemsPre = [];
  const base = process.argv[2] || 'http://localhost:3000/game.html';
  let bad = 0;
  for (const [name, device] of TARGETS) {
    const ctx = await browser.newContext(Object.assign({}, device, { locale: 'ru-RU' }));
    const page = await ctx.newPage();
    // мокаем ИИ, чтобы не зависеть от сети
    await page.route('**/api/gm', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify({
        scene: 'Тонкая полоса света падает на пол, и пыль в ней стоит неподвижно, как подвешенная.',
        chapter: 'Глава I', imagePrompt: 'dark corridor with light beam, cinematic',
        options: [
          { text: 'Идти по свету', stat: 'wit', difficulty: 'medium' },
          { text: 'Осмотреть стены', stat: 'int', difficulty: 'easy' },
          { text: 'Окликнуть тишину', stat: 'str', difficulty: 'hard' }
        ], effects: { hp: -1 }
      }) })
    }));
    await page.route('**/api/image**', route => route.fulfill({
      status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64')
    }));
    await page.goto(base, { waitUntil: 'load' });
    const homeSceneLoaded = await page.waitForFunction(() => {
      const image = document.querySelector('#screen-menu .menu-bg__image');
      return !!(image && image.complete && image.naturalWidth > 0);
    }, null, { timeout: 8000 }).then(() => true).catch(() => false);
    const homeSceneLayout = await page.evaluate(() => {
      const image = document.querySelector('#screen-menu .menu-bg__image');
      if (!image) return { exists: false };
      const rect = image.getBoundingClientRect();
      const style = getComputedStyle(image);
      return {
        exists: true,
        loaded: image.complete && image.naturalWidth > 0,
        width: rect.width,
        height: rect.height,
        objectFit: style.objectFit,
        source: image.currentSrc || image.src
      };
    });
    if (!homeSceneLoaded || !homeSceneLayout.exists || homeSceneLayout.width < device.viewport.width ||
        homeSceneLayout.height < device.viewport.height || homeSceneLayout.objectFit !== 'cover') {
      problemsPre.push(name + ': фон главного меню не загрузился или не покрывает экран');
    }
    await page.waitForTimeout(250);
    await page.click('#screen-menu [data-act="new-game"]');
    await page.waitForSelector('.dice-transition-layer', { state: 'detached', timeout: 5000 });
    await page.waitForSelector('#pane-random .scenario-card');
    const scenarioTargets = await page.evaluate(() => Array.from(document.querySelectorAll('#mode-tabs button'))
      .filter(button => !button.hidden && button.getBoundingClientRect().width > 0)
      .map(button => Math.min(button.getBoundingClientRect().width, button.getBoundingClientRect().height)));
    if (scenarioTargets.some(size => size < 44)) problemsPre.push(name + ': вкладка мира меньше 44px');
    await page.click('#pane-random .scenario-card:first-child');
    await page.waitForSelector('#hero-name');
    await page.fill('#hero-name', 'Тест');
    await page.click('#class-list .arch-card:nth-child(2)');
    await page.click('#race-list .chip:nth-child(3)');
    await page.click('#origin-list .arch-card:nth-child(3)');
    // экран героя тоже не должен прокручивать страницу целиком
    const heroLayout = await page.evaluate(() => {
      const scroll = document.querySelector('#screen-hero .scroll');
      const footer = document.querySelector('#screen-hero .footer-bar');
      const smallTouchTargets = Array.from(document.querySelectorAll('#screen-hero button:not([hidden])'))
        .filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && (rect.width < 44 || rect.height < 44);
        }).map(button => button.className || button.textContent.trim().slice(0, 16));
      return {
        bodyNoScroll: document.body.scrollHeight <= window.innerHeight + 1,
        scrollAreaWorks: scroll.scrollHeight > scroll.clientHeight,
        footerVisible: footer.getBoundingClientRect().bottom <= window.innerHeight + 1,
        smallTouchTargets
      };
    });
    if (!heroLayout.bodyNoScroll) problemsPre.push(name + ': экран героя прокручивает страницу');
    if (!heroLayout.footerVisible) problemsPre.push(name + ': кнопка «Начать приключение» вне экрана');
    if (!heroLayout.scrollAreaWorks) problemsPre.push(name + ': список выбора героя не прокручивается');
    if (heroLayout.smallTouchTargets.length) problemsPre.push(name + ': мелкие кнопки героя — ' + heroLayout.smallTouchTargets.join(', '));

    // Эмулируем уменьшение visual viewport виртуальной клавиатурой и проверяем, что футер остаётся над ней.
    const originalViewport = page.viewportSize();
    if (originalViewport && originalViewport.height >= 500) {
      await page.locator('#hero-name').focus();
      await page.setViewportSize({ width: originalViewport.width, height: Math.max(240, originalViewport.height - 190) });
      await page.waitForTimeout(260);
      const keyboardLayout = await page.evaluate(() => {
        const footer = document.querySelector('#screen-hero .footer-bar').getBoundingClientRect();
        const app = document.getElementById('app').getBoundingClientRect();
        const visual = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        return {
          open: document.documentElement.dataset.keyboardOpen === '1',
          appHeight: Math.round(app.height),
          visualHeight: Math.round(visual),
          footerBottom: Math.round(footer.bottom),
          safeBottom: getComputedStyle(document.documentElement).getPropertyValue('--safe-bottom').trim()
        };
      });
      if (!keyboardLayout.open) problemsPre.push(name + ': уменьшение viewport не распознано как клавиатура');
      if (Math.abs(keyboardLayout.appHeight - keyboardLayout.visualHeight) > 1) problemsPre.push(name + ': приложение не следует за клавиатурным viewport');
      if (keyboardLayout.footerBottom > keyboardLayout.appHeight + 1) problemsPre.push(name + ': футер уходит под клавиатуру');
      if (keyboardLayout.safeBottom !== '0px') problemsPre.push(name + ': нижний safe-area оставляет зазор над клавиатурой');
      await page.setViewportSize(originalViewport);
      await page.locator('#hero-name').evaluate(input => input.blur());
      await page.waitForTimeout(240);
    }
    await page.click('#screen-hero [data-act="start-adventure"]');
    // перед первой сценой игра спрашивает, где начинается история
    await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 15000 }).catch(() => {});
    await page.click('#modal .btn--ghost').catch(() => {});
    await page.waitForSelector('#actions .action-btn', { timeout: 30000 });
    // пролог открывается поверх сцены: закрываем его, иначе он закрывает раскладку
    await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"], .prologue__go'); if (b) b.click(); });
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => {
      const app = document.getElementById('app').getBoundingClientRect();
      const top = document.querySelector('.game-topbar').getBoundingClientRect();
      const media = document.querySelector('.scene-media').getBoundingClientRect();
      const panel = document.getElementById('panel');
      const panelBox = panel.getBoundingClientRect();
      const actions = document.getElementById('actions').getBoundingClientRect();
      const buttons = Array.from(document.querySelectorAll('.action-btn:not(.action-btn--ghost)')).map(b => b.getBoundingClientRect().height);
      const text = document.querySelector('.scene-text__body').getBoundingClientRect();
      const touchTargets = Array.from(document.querySelectorAll('#screen-game button:not([hidden])'))
        .filter(button => {
          const rect = button.getBoundingClientRect();
          return rect.width > 0 && (rect.width < 44 || rect.height < 44);
        }).map(button => button.className || button.textContent.trim().slice(0, 16));
      return {
        screen: window.innerWidth + 'x' + window.innerHeight,
        appH: Math.round(app.height),
        screenW: window.innerWidth,
        viewH: Math.round(window.visualViewport ? window.visualViewport.height : window.innerHeight),
        topPct: +(top.height / app.height * 100).toFixed(1),
        mediaPct: +(media.height / app.height * 100).toFixed(1),
        deadSpace: Math.round(app.bottom - actions.bottom),   // пустота внизу экрана
        panelH: Math.round(panelBox.height),
        topH: Math.round(top.height),
        buttonsMaxH: buttons.length ? Math.round(Math.max.apply(null, buttons)) : 0,
        textInsidePanel: Math.round(text.bottom) <= Math.round(panelBox.bottom) + 2,
        appVar: getComputedStyle(document.documentElement).getPropertyValue('--app-h').trim(),
        actionsInside: Math.round(actions.bottom) <= Math.round(app.bottom) + 1,
        bodyNoScroll: document.body.scrollHeight <= window.innerHeight + 1,
        touchTargets,
        landscape: window.innerWidth > window.innerHeight,
        firstOption: (document.querySelector('.action-btn__text') || document.querySelector('.action-btn') || {}).textContent.slice(0, 40)
      };
    });
    const problems = [];
    if (m.topPct < 13 || m.topPct > 25) problems.push('шапка ' + m.topPct + '%');
    const minTopH = m.landscape && m.viewH <= 460 ? 64 : (m.viewH <= 680 ? 84 : 90);
    if (m.topH < minTopH) problems.push('шапка мелкая: ' + m.topH + 'px');
    const mediaRange = m.landscape ? [14, 30] : (m.viewH <= 640 ? [18, 26] : [19, 25]);
    if (m.mediaPct < mediaRange[0] || m.mediaPct > mediaRange[1]) problems.push('картинка ' + m.mediaPct + '%');
    if (m.deadSpace > 2) problems.push('пустота внизу ' + m.deadSpace + 'px');
    if (Math.abs(m.appH - m.viewH) > 1) problems.push('высота приложения ' + m.appH + ' ≠ видимой ' + m.viewH);
    // Остаётся место для чтения; на коротком экране допускается прокрутка сцены.
    const needPanel = m.landscape ? 44 : Math.max(110, Math.round(m.appH * (m.screenW <= 340 ? 0.18 : (m.viewH <= 640 ? 0.18 : 0.23))));
    if (m.panelH < needPanel) problems.push('тексту мало места: ' + m.panelH + 'px из ' + needPanel);
    if (m.buttonsMaxH > 54) problems.push('кнопка варианта слишком высокая: ' + m.buttonsMaxH + 'px');
    if (m.touchTargets.length) problems.push('маленькие touch targets: ' + m.touchTargets.join(', '));
    if (!m.textInsidePanel) problems.push('текст выходит за панель');
    if (!m.actionsInside) problems.push('кнопки выходят за экран');
    if (!m.bodyNoScroll) problems.push('прокручивается вся страница');
    if (problems.length) bad++;
    console.log((problems.length ? '✗ ' : '✓ ') + name.padEnd(20) + m.screen.padEnd(10) +
      ' шапка ' + m.topPct + '%  картинка ' + m.mediaPct + '%  текст ' + m.panelH + 'px  кнопка ' + m.buttonsMaxH + 'px' +
      (problems.length ? '  → ' + problems.join(', ') : ''));
    await ctx.close();
  }
  await browser.close();
  problemsPre.forEach(p => console.log('  ✗ ' + p));
  bad += problemsPre.length;
  console.log(bad ? '\nПроблемных раскладок: ' + bad : '\nВсе раскладки в порядке');
  process.exitCode = bad ? 1 : 0;
})();
