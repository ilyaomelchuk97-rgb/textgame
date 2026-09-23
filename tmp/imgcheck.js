// проверка: картинка начинается во время потока и приходит быстрее текста
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks = [];
  page.on('request', r => { if (/\/api\/image|image\.pollinations/.test(r.url())) marks.push(['запрос картинки', Date.now() - t0]); });
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
  await page.waitForTimeout(300);
  marks.push(['первая сцена готова', Date.now() - t0]);
  await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[0].click(); });
  let shown = null;
  for (let i = 0; i < 90; i++) {
    const st = await page.evaluate(() => ({
      src: (document.getElementById('scene-img') || {}).getAttribute('src') || '',
      visible: !!document.querySelector('#scene-img.is-visible'),
      status: (document.getElementById('scene-status-text') || {}).textContent || ''
    }));
    if (st.visible && st.src) { shown = { at: Date.now() - t0, src: st.src.slice(0, 60), status: st.status }; break; }
    await page.waitForTimeout(300);
  }
  console.log('метки:', JSON.stringify(marks));
  console.log('картинка показана:', JSON.stringify(shown));
  await b.close();
})();
