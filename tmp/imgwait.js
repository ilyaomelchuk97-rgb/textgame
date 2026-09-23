const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const t0 = Date.now();
  const ev = [];
  page.on('console', m => { if (m.type() === 'error' || /картин|image/i.test(m.text())) ev.push(['console', m.text().slice(0, 120)]); });
  page.on('pageerror', e => ev.push(['ОШИБКА', e.message.slice(0, 160)]));
  page.on('request', r => { if (/\/api\/image/.test(r.url())) ev.push(['запрос', Math.round((Date.now() - t0) / 100) / 10 + 'с']); });
  page.on('response', async r => {
    if (!/\/api\/image/.test(r.url())) return;
    let len = 0; try { len = (await r.body()).length; } catch (e) {}
    ev.push([Math.round((Date.now() - t0) / 100) / 10 + 'с', r.status(), len, r.headers()['x-image-ms'] || '', r.headers()['x-image-source'] || '']);
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
  await page.screenshot({ path: 'shots/v7-02-scene-local.png' });
  await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[0].click(); });
  let shown = null;
  for (let i = 0; i < 160; i++) {
    const st = await page.evaluate(() => ({ src: (document.getElementById('scene-img') || {}).getAttribute('src') || '', visible: !!document.querySelector('#scene-img.is-visible') }));
    if (st.visible && st.src) { shown = { at: Math.round((Date.now() - t0) / 100) / 10 + 'с', src: st.src.slice(0, 80) }; break; }
    await page.waitForTimeout(500);
  }
  console.log('ответы /api/image:', JSON.stringify(ev));
  console.log('картинка показана:', JSON.stringify(shown));
  await page.screenshot({ path: 'shots/v8-03-scene-gateway.png' });
  await b.close();
})();
