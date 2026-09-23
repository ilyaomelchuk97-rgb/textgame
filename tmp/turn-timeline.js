// Хронометраж хода: поток (сцена → место → промпт), старт запроса кадра, показ кадра.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  page.on('console', m => {
    const t = m.text().replace(/%c\[dt-api\]\s*color:#[0-9a-f]+/i, '');
    if (/потоком|картинка пришла|не ответил|провайдер:/i.test(t)) console.log('  ·', t.slice(0, 110));
  });
  await page.addInitScript(() => {
    window.__marks = [];
    const mk = (name, t0) => ({ name, ms: Date.now() - t0 });
    const mark = (name, t0, once) => {
      if (window.__marks.some(m => m.name === name && m.call === once)) return;
      const m = mk(name, t0); m.call = once; window.__marks.push(m);
    };
    let api = null;
    Object.defineProperty(window, 'DTapi', {
      configurable: true,
      get() { return api; },
      set(v) {
        api = v;
        const E = window.DTEngine;
        const origImg = v.generateImage;
        v.generateImage = function (o) {
          const t = Date.now(); const call = (window.__callN = (window.__callN || 0) + 1);
          mark('кадр: запрос отправлен', t, call);
          return origImg.apply(this, arguments).then(r => { mark('кадр: ответ (' + (r && r.source) + ')', t, call); return r; });
        };
        ['generateTurn', 'generateOpening', 'generateWorld'].forEach(fn => {
          const orig = v[fn];
          v[fn] = function (game, a, c, hooks) {
            const h = hooks || c || a || {};
            if (!h || typeof h !== 'object') return orig.apply(this, arguments);
            const t0 = Date.now(); const call = fn + '#' + (window.__callN = (window.__callN || 0) + 1);
            mark(fn + ': запрос ушёл', t0, call);
            const seen = {};
            const prev = h.onDelta;
            h.onDelta = full => {
              ['scene', 'place', 'imagePrompt'].forEach(f => {
                if (!seen[f] && E.extractPartialField(full || '', f)) { seen[f] = 1; mark(fn + ': поле ' + f, t0, call); }
              });
              if (prev) prev(full);
            };
            return orig.apply(this, arguments);
          };
        });
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
  await page.fill('#wc-title', 'Ржавые Пески Кар-Адама');
  await page.click('[data-act="create-custom-world"]');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Каин');
  await page.waitForTimeout(24000);
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 90000 });
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  const shot = async label => {
    const marks = await page.evaluate(() => { const m = window.__marks.slice(); window.__marks = []; return m; });
    console.log('—— ' + label);
    marks.forEach(m => console.log('   ' + String(m.ms).padStart(6) + 'мс  ' + m.call + '  ' + m.name));
  };
  await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[0].click(); });
  await page.waitForFunction(() => !document.querySelector('#actions .action-btn[disabled]') && document.querySelectorAll('#actions .action-btn').length >= 3, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await shot('ход 1');
  await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[1].click(); });
  await page.waitForFunction(() => !document.querySelector('#actions .action-btn[disabled]') && document.querySelectorAll('#actions .action-btn').length >= 3, null, { timeout: 90000 });
  await page.waitForTimeout(1500);
  await shot('ход 2');
  const place = await page.evaluate(() => (document.getElementById('chapter') || {}).textContent || '');
  console.log('глава/место:', place);
  await b.close();
})();
