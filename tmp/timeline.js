// Хронометраж хода: когда стартовал поток, когда пошёл запрос кадра, когда кадр показан.
const { chromium } = require('playwright');
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  page.on('console', m => {
    const t = m.text().replace(/%c\[dt-api\]\s*color:#[0-9a-f]+/i, '');
    if (/потоком|картинка|кадр|мастер|не ответил|провайдер/i.test(t)) console.log(stamp(), '·', t.slice(0, 120));
  });
  // перехват запроса кадра: подменяем метод до загрузки скриптов
  await page.addInitScript(() => {
    let api = null;
    Object.defineProperty(window, 'DTapi', {
      configurable: true,
      get() { return api; },
      set(v) {
        api = v;
        const orig = v.generateImage;
        v.generateImage = function (o) {
          const rec = { at: Math.round(performance.now()), prompt: String((o && o.prompt) || '').slice(0, 80) };
          (window.__img = window.__img || []).push(rec);
          const t = Date.now();
          const p = orig.apply(this, arguments);
          return p.then(r => {
            rec.ms = Date.now() - t; rec.ok = !!(r && r.ok); rec.src = r && r.source;
            console.log('[dt-api] кадр-запрос закончен: ' + rec.ms + 'мс, ' + (rec.src || '-') + ', ок=' + rec.ok);
            return r;
          });
        };
      }
    });
  });
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
  await page.waitForTimeout(24000);
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 90000 });
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); });
  await page.waitForTimeout(800);
  console.log(stamp(), '→ клик по первому варианту, ход начинается');
  await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[0].click(); });
  let textFirst = null, textLast = null, lastLen = 0, shown = null;
  for (let i = 0; i < 400; i++) {
    const st = await page.evaluate(() => ({
      len: ((document.getElementById('scene-text') || {}).textContent || '').length,
      src: (document.getElementById('scene-img') || {}).getAttribute('src') || '',
      vis: !!(document.querySelector('#scene-img') && document.querySelector('#scene-img').classList.contains('is-visible'))
    }));
    if (st.len && !textFirst) { textFirst = stamp(); console.log(textFirst, '· первая строка сцены на экране'); }
    if (st.len !== lastLen) { lastLen = st.len; textLast = stamp(); }
    if (!shown && st.vis && st.src) { shown = stamp(); console.log(shown, '· кадр показан в игре'); break; }
    await page.waitForTimeout(100);
  }
  const imgs = await page.evaluate(() => window.__img || []);
  imgs.forEach(r => console.log('кадр-запрос: +' + (r.at / 1000).toFixed(1) + 'с от старта страницы, ' + (r.ms || '?') + 'мс, ' + (r.src || '-') + ' | ' + r.prompt));
  console.log('ИТОГО кадр:', shown || 'не показан', '| печать с', textFirst, 'до', textLast);
  await b.close();
})();
