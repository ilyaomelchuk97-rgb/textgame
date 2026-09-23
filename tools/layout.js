/**
 * tools/layout.js — проверка раскладки на разных телефонах.
 * Условие: шапка ≈14% высоты, картинка ≈22%, интерфейс без прокрутки body.
 */
const { chromium, devices } = require('playwright');

const TARGETS = [
  ['iPhone 13 mini', devices['iPhone 13 Mini']],
  ['iPhone SE', devices['iPhone SE'] || { viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
  ['iPhone 15 Pro Max', { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ['Pixel 5 (Android)', devices['Pixel 5']],
  ['Маленькое окно', { viewport: { width: 360, height: 640 } }]
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
    await page.waitForTimeout(700);
    await page.click('#screen-menu [data-act="new-game"]');
    await page.waitForSelector('#pane-random .scenario-card');
    await page.click('#pane-random .scenario-card:first-child');
    await page.waitForSelector('#hero-name');
    await page.fill('#hero-name', 'Тест');
    await page.click('#class-list .arch-card:nth-child(2)');
    await page.click('#race-list .chip:nth-child(3)');
    await page.click('#origin-list .arch-card:nth-child(3)');
    // экран героя тоже не должен прокручивать страницу целиком
    const heroLayout = await page.evaluate(() => ({
      bodyNoScroll: document.body.scrollHeight <= window.innerHeight + 1,
      scrollAreaWorks: document.querySelector('#screen-hero .scroll').scrollHeight >
        document.querySelector('#screen-hero .scroll').clientHeight,
      footerVisible: document.querySelector('#screen-hero .footer-bar').getBoundingClientRect().bottom <= window.innerHeight + 1
    }));
    if (!heroLayout.bodyNoScroll) problemsPre.push(name + ': экран героя прокручивает страницу');
    if (!heroLayout.footerVisible) problemsPre.push(name + ': кнопка «Начать приключение» вне экрана');
    if (!heroLayout.scrollAreaWorks) problemsPre.push(name + ': список выбора героя не прокручивается');
    await page.click('#screen-hero [data-act="start-adventure"]');
    await page.waitForSelector('#actions .action-btn', { timeout: 30000 });
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
        firstOption: (document.querySelector('.action-btn__text') || document.querySelector('.action-btn') || {}).textContent.slice(0, 40)
      };
    });
    const problems = [];
    if (m.topPct < 13 || m.topPct > 21) problems.push('шапка ' + m.topPct + '%');
    if (m.topH < 90) problems.push('шапка мелкая: ' + m.topH + 'px');
    if (Math.abs(m.mediaPct - 22) > 1.7) problems.push('картинка ' + m.mediaPct + '%');
    if (m.deadSpace > 2) problems.push('пустота внизу ' + m.deadSpace + 'px');
    if (Math.abs(m.appH - m.viewH) > 1) problems.push('высота приложения ' + m.appH + ' ≠ видимой ' + m.viewH);
    // тексту — не меньше четверти экрана: иначе читать нечего
    const needPanel = Math.max(110, Math.round(m.appH * (m.screenW <= 340 ? 0.18 : 0.23)));
    if (m.panelH < needPanel) problems.push('тексту мало места: ' + m.panelH + 'px из ' + needPanel);
    if (m.buttonsMaxH > 46) problems.push('кнопка варианта ' + m.buttonsMaxH + 'px');
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
