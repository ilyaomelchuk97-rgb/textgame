// озвучка: серверный нейроголос + откат на голос браузера
const { chromium } = require('playwright');
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 } });
  page.on('console', m => { const t = m.text(); if (/озвучка|сервер/.test(t)) console.log(stamp(), '[стр]', t.replace(/%c\[dt-api\]\s*color:#[0-9a-f]+/i, '').slice(0, 110)); });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // 1. серверная озвучка: получаем mp3 и проигрываем
  const r1 = await page.evaluate(async () => {
    const url = await window.DTapi.speakScene('Ты вышел к сухому руслу реки. Ветер несёт песок.');
    if (!url) return { ok: false };
    const size = await fetch(url).then(r => r.blob()).then(x => x.size);
    const el = new Audio(url);
    let played = false;
    await new Promise(res => { el.oncanplay = () => { played = true; res(); }; el.onerror = () => res(); el.play().then(() => {}).catch(() => {}); setTimeout(res, 8000); });
    return { ok: true, size, played, duration: el.duration };
  });
  console.log(stamp(), 'серверный голос:', JSON.stringify(r1));

  // 2. откат: сервер «недоступен» — должен включиться голос браузера
  await page.unroute('**/api/tts*').catch(() => {});
  await page.route('**/api/tts*', route => route.abort());
  await page.evaluate(() => {
    window.__said = 0;
    const OrigU = window.SpeechSynthesisUtterance;   // speak() не переопределить, считаем реплики
    window.SpeechSynthesisUtterance = function (t) { window.__said++; return new OrigU(t); };
    window.DTForceBrowserVoice = true;
  });
  const r2 = await page.evaluate(async () => {
    const origFetch = window.fetch;
    window.fetch = (u, o) => String(u).includes('/api/tts') ? Promise.reject(new Error('нет сети')) : origFetch(u, o);
    const url = await window.DTapi.speakScene('Проверка отката на голос браузера.');
    window.fetch = origFetch;
    return { url: url, сказано: window.__said };
  });
  console.log(stamp(), 'откат:', JSON.stringify(r2));
  console.log(stamp(), 'ошибки страницы: нет');
  await b.close();
})();
