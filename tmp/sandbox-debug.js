const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 375, height: 812 } });
  page.on('console', m => console.log('[стр]', m.type(), m.text().slice(0, 160)));
  page.on('pageerror', e => console.log('[ошибка]', e.message.slice(0, 200)));
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new DOMException('blocked', 'SecurityError'); } });
  });
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) return route.continue();
    return route.abort();
  });
  await page.goto('http://localhost:3000/game.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Один');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 40000 });
  for (let i = 0; i < 12; i++) {
    const st = await page.evaluate(() => ({
      src: (document.getElementById('scene-img').getAttribute('src') || '').slice(0, 30),
      badge: (document.getElementById('scene-badge') || {}).textContent,
      hidden: document.getElementById('scene-badge').hidden,
      status: (document.getElementById('scene-status-text') || {}).textContent
    }));
    console.log(i, JSON.stringify(st));
    await page.waitForTimeout(1500);
  }
  await b.close();
})();
