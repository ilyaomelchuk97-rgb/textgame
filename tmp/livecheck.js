// живая проверка: играем два хода и смотрим, кто отвечает — мастер или локальный фолбэк
const { chromium } = require('playwright');
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message.slice(0, 120)));
  page.on('console', m => {
    const t = m.text();
    if (/сервер|провайдер|поток|канал/.test(t)) console.log(stamp(), '[стр]', t.replace(/%c\[dt-api\]\s*color:#[0-9a-f]+/i, '').slice(0, 110));
  });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(300);
  await page.click('#pane-random .scenario-card');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Каин');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#actions .action-btn', { timeout: 60000 });
  await page.evaluate(() => { const b = document.querySelector('#prologue:not([hidden]) [data-act="close-prologue"]'); if (b) b.click(); });
  console.log(stamp(), 'сцена открылась:', await page.evaluate(() => (document.getElementById('scene-text').textContent || '').slice(0, 60)));

  for (let turn = 1; turn <= 2; turn++) {
    const before = await page.evaluate(() => document.getElementById('scene-text').textContent || '');
    await page.evaluate(() => { document.querySelectorAll('#actions .action-btn')[0].click(); });
    let streaming = false;
    let done = false;
    for (let i = 0; i < 200; i++) {
      const st = await page.evaluate(() => ({
        streaming: !!document.querySelector('#scene-text .is-streaming'),
        busy: !!document.querySelector('#game-status:not([hidden])'),
        status: (document.getElementById('game-status-text') || {}).textContent || '',
        text: document.getElementById('scene-text').textContent || '',
        notice: (document.getElementById('notices') || {}).textContent || ''
      }));
      if (st.streaming && !streaming) { streaming = true; console.log(stamp(), 'ход ' + turn + ': стрим пошёл'); }
      if (st.status) { if (!done) console.log(stamp(), 'ход ' + turn + ': статус «' + st.status.slice(0, 60) + '»'); done = true; }
      if (!st.busy && st.text !== before && st.text.length > 30) {
        console.log(stamp(), 'ход ' + turn + ': готово · стрим ' + (streaming ? 'да' : 'НЕТ (локальный мастер)') + ' · ' + st.text.slice(0, 70));
        if (st.notice) console.log(stamp(), 'уведомление:', st.notice.slice(0, 90));
        break;
      }
      await page.waitForTimeout(500);
    }
  }
  const save = await page.evaluate(() => {
    const idx = JSON.parse(localStorage.getItem('dt2:index') || '[]');
    return JSON.parse(localStorage.getItem('dt2:game:' + ((idx[0] || {}).id) || '') || '{}');
  });
  console.log(stamp(), 'ходов в сейве:', save.turn, '· память:', JSON.stringify(save.memory && { place: save.memory.place, npcs: (save.memory.npcs || []).length }));
  console.log(stamp(), 'ошибки страницы:', errors.length ? errors.slice(0, 3) : 'нет');
  await page.screenshot({ path: 'shots/v8-01-master-live.png' });
  await b.close();
})();
