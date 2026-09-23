// Сколько секунд от клика до кадра в игре. Переменная окружения DT_NO_EARLY=1 — кадр ждёт ответа мастера.
const { chromium } = require('playwright');
const noEarly = process.env.DT_NO_EARLY === '1';
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  page.on('console', m => {
    const t = m.text().replace(/%c\[dt-api\]\s*color:#[0-9a-f]+/i, '');
    if (/картинка пришла|кадр-запрос|не ответил/i.test(t)) console.log('   ·', t.slice(0, 110));
  });
  await page.addInitScript(noEarly => {
    if (noEarly) window.DT_NO_EARLY = true;
    let api = null;
    Object.defineProperty(window, 'DTapi', {
      configurable: true,
      get() { return api; },
      set(v) {
        api = v;
        const orig = v.generateImage;
        v.generateImage = function (o) {
          const rec = { at: Date.now(), prompt: String((o && o.prompt) || '').slice(0, 90) };
          (window.__img = window.__img || []).push(rec);
          const p = orig.apply(this, arguments);
          return p.then(r => { rec.ms = Date.now() - rec.at; rec.ok = !!(r && r.ok); rec.src = r && r.source; return r; });
        };
      }
    });
  }, noEarly);
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(300);
  await page.click('[data-mode="custom"]');
  await page.waitForTimeout(300);
  // имя мира каждый раз новое: иначе мастер отвечает из кэша и замер врёт
  const gameName = (process.env.GAME || 'Ржавые Пески Кар-Адама') + ' · заход ' + Math.floor(Date.now() / 1000) % 100000;
  await page.fill('#wc-title', gameName);
  await page.click('[data-act="create-custom-world"]');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Каин');
  await page.waitForTimeout(24000);
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 90000 });
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  const watch = async label => {
    const before = await page.evaluate(() => ((document.getElementById('scene-text') || {}).textContent || ''));
    const src0 = await page.evaluate(() => (document.getElementById('scene-img') || {}).getAttribute('src') || '');
    const t0 = Date.now(); const s = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
    await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[Math.min(1, document.querySelectorAll('#actions .action-btn').length - 1)].click(); });
    let textAt = null, imgAt = null, doneAt = null, lastTxt = '';
    for (let i = 0; i < 600; i++) {
      const st = await page.evaluate(() => ({
        txt: ((document.getElementById('scene-text') || {}).textContent || ''),
        src: (document.getElementById('scene-img') || {}).getAttribute('src') || '',
        vis: !!(document.querySelector('#scene-img') && document.querySelector('#scene-img').classList.contains('is-visible'))
      }));
      if (!textAt && st.txt && st.txt !== before) { textAt = s(); }
      if (st.txt !== before && st.txt !== lastTxt) { lastTxt = st.txt; doneAt = (Date.now() - t0) / 1000; }
      if (!imgAt && st.vis && st.src && st.src !== src0) { imgAt = s(); break; }
      await page.waitForTimeout(100);
    }
    const imgs = await page.evaluate(() => { const a = window.__img || []; window.__img = []; return a; });
    const rel = (imgAt && doneAt) ? ' (+' + (parseFloat(imgAt) - doneAt).toFixed(1) + 'с после последней правки текста)' : '';
    console.log(`[${noEarly ? 'без раннего кадра' : 'с ранним кадром'}] ${label}: сцена пошла на ${textAt || '—'}, мастер дописал на ${doneAt ? doneAt.toFixed(1) + 'с' : '—'}, кадр показан на ${imgAt || '—'}${rel}`);
    imgs.forEach(r => console.log('     запрос кадра: старт +' + Math.round((r.at - t0) / 100) / 10 + 'с' + (r.ms ? ', ' + r.ms + 'мс' : ', не ответил') + ', ' + (r.src || '-') + ' | ' + r.prompt));
  };
  await watch('первая сцена');
  await page.waitForTimeout(1200);
  await watch('ход 2');
  await b.close();
})();
