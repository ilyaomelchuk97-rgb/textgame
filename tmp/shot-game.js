const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();
  await page.route('**/api/gm', route => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify({
      scene: 'Песчаный ветер шуршит по узкому проходу между скалами, а отдалённый шорох гудки напоминает о пропаже. Твои шаги оставляют следы на остывшем песке, но земля молчит и не отвечает на вопросы. Где-то далеко хлопнула дверь, и эхо унесло звук за горизонт.',
      chapter: 'Народная лестница', imagePrompt: 'desert canyon path, dusk, cinematic',
      npc: 'Шахмат, местный торговец, носит яркую фуражку',
      options: [
        { text: 'Отследить оставшиеся следы каравана', stat: 'wit', difficulty: 'medium' },
        { text: 'Запросить у шахмата древнюю карту', stat: 'cha', difficulty: 'easy' },
        { text: 'Скатерть укрытия от ветра и ждать ночи', stat: 'wil', difficulty: 'easy' }
      ], effects: { hp: -1 } }) })
  }));
  await page.route('**/api/image**', route => route.fulfill({ status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') }));
  await page.goto('http://localhost:3000/game.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Каин');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 30000 });
  await page.waitForTimeout(1200);
  // статус мастера — как при ожидании хода
  await page.evaluate(() => {
    const st = document.getElementById('game-status'); st.hidden = false;
    document.getElementById('game-status-text').textContent = 'Мастер описывает последствия…';
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shots/v7-01-game-iphone.png' });
  const m = await page.evaluate(() => {
    const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    return { top: r('.game-topbar'), media: r('.scene-media'), panel: r('#panel'), actions: r('#actions'), view: window.innerHeight };
  });
  console.log(JSON.stringify(m));
  await browser.close();
})();
