// снимки новой версии: кадр от генератора на игровом экране и умный набор героя
const { chromium } = require('playwright');
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU', deviceScaleFactor: 2 });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(300);
  await page.click('[data-mode="custom"]');
  await page.waitForTimeout(300);
  await page.fill('#wc-title', 'Стеклянные Степи Немо');
  await page.click('[data-act="create-custom-world"]');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Райн');
  await page.waitForTimeout(22000);                 // ждём набор героя от мастера
  await page.screenshot({ path: 'shots/v8-04-hero-ai.png' });
  console.log(stamp(), 'набор:', await page.evaluate(() => (document.querySelector('#class-list .arch-card__title') || {}).textContent),
    '|', await page.evaluate(() => Array.from(document.querySelectorAll('#class-list .arch-card')).slice(0,2).map(c => (c.querySelector('.arch-card__bonus')||{}).textContent).join(' ; ')));
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 90000 });
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[0].click(); });
  let shown = null;
  for (let i = 0; i < 200; i++) {
    const st = await page.evaluate(() => ({ src: (document.getElementById('scene-img') || {}).getAttribute('src') || '', vis: !!document.querySelector('#scene-img.is-visible') }));
    if (st.vis && st.src) { shown = stamp(); break; }
    await page.waitForTimeout(500);
  }
  const txt = await page.evaluate(() => (document.getElementById('scene-text') || {}).textContent || '');
  console.log(stamp(), 'кадр показан:', shown, '| сцена:', txt.replace(/\s+/g, ' ').slice(0, 110));
  await page.screenshot({ path: 'shots/v8-05-scene-gateway.png' });
  await b.close();
})();
