// живая проверка: мастер (умная модель), картинка (шлюз), озвучка (нейроголос)
const { chromium } = require('playwright');
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = [];
  const reqs = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 130)));
  page.on('request', r => { if (/\/api\/(gm|image|tts)/.test(r.url())) reqs.push({ url: r.url().slice(0, 60), at: Date.now() - t0 }); });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(300);
  await page.click('#pane-random .scenario-card');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Райн');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 90000 });
  console.log(stamp(), 'набор героя:', await page.evaluate(() => (document.querySelector('#class-list .arch-card__title') || {}).textContent));
  await page.evaluate(() => { const b = document.querySelector('#prologue:not([hidden]) [data-act="close-prologue"]'); if (b) b.click(); });

  // озвучка: включаем и смотрим, ушёл ли запрос на сервер и заиграло ли аудио
  const tts = [];
  page.on('request', r => { if (r.url().includes('/api/tts')) tts.push(Date.now() - t0); });
  await page.evaluate(() => { const b = document.getElementById('speak-btn'); if (b) b.click(); });
  await page.waitForTimeout(25000);
  const audioState = await page.evaluate(() => {
    const a = Array.from(document.querySelectorAll('audio'));
    return { тегов: a.length, играет: a.filter(x => !x.paused).map(x => Math.round(x.currentTime)) };
  });
  console.log(stamp(), 'озвучка: запросов на сервер', tts.length, '| аудио:', JSON.stringify(audioState));

  // ход
  for (let turn = 1; turn <= 2; turn++) {
    const before = await page.evaluate(() => document.getElementById('scene-text').textContent || '');
    await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[0].click(); });
    let firstLine = null;
    for (let i = 0; i < 240; i++) {
      const st = await page.evaluate(() => ({
        busy: !!document.querySelector('#game-status:not([hidden])'),
        text: document.getElementById('scene-text').textContent || '',
        status: (document.getElementById('game-status-text') || {}).textContent || ''
      }));
      if (st.status && !firstLine) firstLine = st.status.slice(0, 50);
      if (!st.busy && st.text !== before && st.text.length > 40) {
        console.log(stamp(), 'ход ' + turn + ': готов ·', st.text.replace(/\s+/g, ' ').slice(0, 90));
        break;
      }
      await page.waitForTimeout(500);
    }
  }
  const img = await page.evaluate(() => {
    const el = document.getElementById('scene-img');
    return { есть: !!el, src: (el && el.src || '').slice(0, 40), загружена: !!(el && el.complete && el.naturalWidth) };
  });
  console.log(stamp(), 'кадр:', JSON.stringify(img));
  console.log(stamp(), 'запросы к серверу:', reqs.map(r => r.url.split('/api/')[1].slice(0, 22) + '@' + r.at + 'мс').join(' | '));
  console.log(stamp(), 'ошибки:', errors.length ? errors.slice(0, 3) : 'нет');
  await page.screenshot({ path: 'shots/v8-02-gateway-live.png' });
  await b.close();
})();
