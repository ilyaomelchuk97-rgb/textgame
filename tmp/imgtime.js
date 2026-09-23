const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const prompt = 'narrow desert canyon path at dusk, cinematic, no text';
  const urls = {
    server: '/api/image?prompt=' + encodeURIComponent(prompt) + '&seed=7&w=448&h=252',
    a0: 'https://api.a0.dev/assets/image?text=' + encodeURIComponent(prompt) + '&aspect=16:9&seed=7',
    poll: 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) + '?width=448&height=252&model=sana&nologo=true&seed=7'
  };
  for (const [name, url] of Object.entries(urls)) {
    for (let i = 0; i < 2; i++) {
      const t = Date.now();
      const res = await page.evaluate(u => new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ ok: true, w: img.naturalWidth });
        img.onerror = () => resolve({ ok: false });
        setTimeout(() => resolve({ ok: false, timeout: true }), 30000);
        img.src = u;
      }), url);
      console.log(name, 'попытка', i + 1, '→', Math.round((Date.now() - t) / 100) / 10 + 'с', JSON.stringify(res));
    }
  }
  await b.close();
})();
