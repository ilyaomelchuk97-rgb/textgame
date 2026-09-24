/**
 * tools/frame.js — бюджет кадра (п.42) и офлайн-кэш кадров (п.17).
 * Генератор здесь «молчит» семь секунд, поэтому видно, что игра не врёт:
 *   • сообщение меняется на «кадр N с — генераторы молчат, рисуем локально»;
 *   • локальный фон сцены к этому моменту уже на экране (холст не пустой);
 *   • когда кадр приходит, он подменяет локальный;
 *   • после перезапуска тот же кадр берётся из IndexedDB — без запроса к сети.
 *
 *   node tools/frame.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const PNG = Buffer.from(process.env.MOCK_PNG_B64, 'base64');

const TURN = {
  scene: 'Мастер поднимает лампу: на стене проступает карта, а за дверью кто-то переступает с ноги на ногу. ' +
    'Пахнет дымом и мокрой шерстью. Ночной дождь стучит по крыше караульной у моста.',
  chapter: 'Глава I', place: 'Караульная у моста',
  npc: 'Мара', npcObject: { name: 'Мара', role: 'караванщица', line: '«Не свети в окно — там ждут»' },
  imagePrompt: 'dim guardroom with a lit lamp, hooded hero in the foreground, night rain outside',
  options: [
    { text: 'Прочитать карту и запомнить тропы', stat: 'int', difficulty: 'easy' },
    { text: 'Спросить, кто ходит за дверью', stat: 'per', difficulty: 'medium' }
  ],
  effects: {}
};

(async () => {
  const shots = path.join(__dirname, '..', 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  let imageRequests = 0;

  await page.route('**/api/gm/stream*', route => route.abort());
  await page.route('**/api/gm', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify(TURN) })
  }));
  const imageUrls = [];
  await page.route('**/api/image**', async route => {
    imageRequests++;
    const u = route.request().url();
    imageUrls.push({ url: u.slice(-60), scene: !/volumetric|portrait|avatar/i.test(u) });
    await new Promise(r => setTimeout(r, 7000));      // генератор молчит семь секунд
    route.fulfill({ status: 200, contentType: 'image/png', body: PNG }).catch(() => {});
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Ирма');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 12000 }).catch(() => {});
  await page.click('#modal .btn--ghost').catch(() => {});
  await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 25000 });

  // 1. пока генератор молчит: что игрок видит на пятой секунде
  await page.waitForTimeout(5000);
  const waiting = await page.evaluate(() => {
    const status = document.getElementById('scene-status');
    const badge = document.getElementById('scene-badge');
    const canvas = document.getElementById('scene-canvas');
    let painted = 0;
    try {
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const seen = new Set();
      for (let i = 0; i < data.length; i += 4 * 29) seen.add((data[i] >> 4) + ',' + (data[i + 1] >> 4) + ',' + (data[i + 2] >> 4));
      painted = seen.size;
    } catch (e) { painted = -1; }
    return {
      status: status && !status.hidden ? (document.getElementById('scene-status-text') || {}).textContent : '',
      badge: badge && !badge.hidden ? badge.textContent : '',
      painted
    };
  });
  await page.screenshot({ path: path.join(shots, 'v15-frame-local.png') });

  // 2. кадр пришёл: локальный фон подменился картинкой генератора
  await page.waitForSelector('#scene-img.is-visible', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
  const arrived = await page.evaluate(() => {
    const img = document.getElementById('scene-img');
    return { visible: !!(img && img.classList.contains('is-visible')), src: (img && img.src || '').slice(0, 12) };
  });
  const afterFirst = imageRequests;

  // 3. перезапуск: тот же кадр должен прийти из IndexedDB, без сети
  await page.waitForTimeout(3000);                     // даём записи в базу закрыться
  const before = imageRequests;
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(600);
  const screen = await page.evaluate(() => document.body.dataset.screen);
  if (screen !== 'game') {
    await page.click('[data-act="my-games"]').catch(() => {});
    await page.waitForSelector('#saves-list .save-card', { timeout: 12000 });
    const openBtn = page.locator('#saves-list .save-card').first().locator('button', { hasText: /Продолжить|Играть|Открыть/ });
    const target = (await openBtn.count()) ? openBtn.first() : page.locator('#saves-list .save-card').first().locator('.save-card__actions button').first();
    await target.click();
  }
  await page.waitForSelector('#screen-game:not([hidden])', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1800);
  const restored = await page.evaluate(() => {
    const img = document.getElementById('scene-img');
    const cur = [document.getElementById('scene-img'), document.getElementById('scene-img2')]
      .find(el => el && el.classList.contains('is-visible'));
    return { src: (cur && cur.src || '').slice(0, 12), any: !!img };
  });
  const netAfter = imageRequests - before;
  const sceneAfter = imageUrls.slice(-netAfter || 0).filter(r => r.scene).length;
  const debug = await page.evaluate(async () => {
    const out = { screen: document.body.dataset.screen, keys: Object.keys(localStorage) };
    out.db = await new Promise(resolve => {
      try {
        const req = indexedDB.open('dt2-frames-db', 1);
        req.onsuccess = () => {
          const db = req.result;
          try {
            const all = db.transaction('frames', 'readonly').objectStore('frames').getAll();
            all.onsuccess = () => resolve((all.result || []).map(r => ({ key: r.key, size: r.blob && r.blob.size, at: r.at })));
            all.onerror = () => resolve('ошибка чтения: ' + all.error);
          } catch (e) { resolve('нет хранилища: ' + e.message); }
        };
        req.onerror = () => resolve('база не открылась');
      } catch (e) { resolve('исключение: ' + e.message); }
    });
    const idx = localStorage.getItem('dt2:index');
    out.index = idx ? idx.slice(0, 90) : '';
    out.scene = (() => {
      try { const g = JSON.parse(localStorage.getItem(Object.keys(localStorage).find(k => k.indexOf('dt2:game:') === 0) || 'null') || 'null');
        return g && g.scene ? { place: g.scene.place, image: String(g.scene.image || '').slice(0, 40), key: g.scene.placeKey } : null;
      } catch (e) { return 'сейв не прочитался'; }
    })();
    return out;
  });
  console.log('ОТЛАДКА:', JSON.stringify(debug).slice(0, 400));
  await page.screenshot({ path: path.join(shots, 'v15-frame-restored.png') });

  const problems = [];
  if (!/кадр/.test(waiting.status) || !/молчат/.test(waiting.status)) problems.push('нет честного прогресса: «' + waiting.status + '»');
  if (waiting.painted < 10) problems.push('локальный фон пустой (оттенков ' + waiting.painted + ')');
  if (!arrived.visible) problems.push('кадр генератора так и не встал');
  if (afterFirst < 1) problems.push('запрос кадра не ушёл');
  if (sceneAfter !== 0) problems.push('после перезапуска кадр пошёл в сеть (' + sceneAfter + ' запросов)');
  if (!/^blob:/.test(restored.src)) problems.push('кадр не поднялся из IndexedDB (src ' + restored.src + ')');
  if (errors.length) problems.push('ошибок страницы: ' + errors.join(' | '));

  console.log('на пятой секунде: «' + waiting.status + '» · бейдж: «' + waiting.badge + '» · оттенков фона: ' + waiting.painted);
  console.log('кадр пришёл:', arrived.visible ? '✓' : '✗', '| запросов за сессию:', afterFirst);
  console.log('после перезапуска: из хранилища ' + (restored.src || '—') + ', в сеть — ' + netAfter + ' запросов');
  if (netAfter) console.log('  в сеть ушло: ' + imageUrls.slice(-netAfter).map(r => (r.scene ? 'кадр' : 'портрет') + ' ' + r.url.slice(-40)).join(' | '));
  console.log(problems.length ? 'БЮДЖЕТ КАДРА: ' + problems.join(' · ') : 'БЮДЖЕТ КАДРА И ОФЛАЙН-КАДРЫ: всё на месте — ❤');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
