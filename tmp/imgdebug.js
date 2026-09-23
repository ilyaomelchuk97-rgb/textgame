const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  const t0 = Date.now();
  page.on('response', async r => {
    const u = r.url();
    if (!/api\/image|image\.pollinations|a0\.dev|picsum/.test(u)) return;
    let len = '';
    try { const buf = await r.body(); len = buf.length; } catch (e) { len = 'нет тела'; }
    console.log((Date.now() - t0) + 'мс', r.status(), len, u.slice(0, 90));
  });
  page.on('requestfailed', r => {
    const u = r.url();
    if (/api\/image|image\.pollinations|a0\.dev|picsum/.test(u)) console.log((Date.now() - t0) + 'мс ОБРЫВ', (r.failure() || {}).errorText, u.slice(0, 80));
  });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(300);
  await page.click('#pane-random .scenario-card');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Проверка');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 40000 });
  await page.evaluate(() => { const b = document.querySelector('#prologue:not([hidden]) [data-act="close-prologue"]'); if (b) b.click(); });
  await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[0].click(); });
  await page.waitForTimeout(14000);
  console.log('итог:', await page.evaluate(() => ({
    src: ((document.getElementById('scene-img') || {}).getAttribute('src') || '').slice(0, 70),
    visible: !!document.querySelector('#scene-img.is-visible'),
    status: (document.getElementById('scene-status-text') || {}).textContent
  })));
  await b.close();
})();
