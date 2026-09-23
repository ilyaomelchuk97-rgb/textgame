// Как играется, когда внешний мастер недоступен: режем все каналы и смотрим встроенного мастера
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  // блокируем внешний текст: и сервер, и прямые каналы
  await page.route('**/api/gm**', r => r.abort());
  await page.route('**text.pollinations.ai**', r => r.abort());
  await page.route('**gen.pollinations.ai/**', r => r.abort());
  page.on('console', m => { const t = m.text().replace(/%c\[dt-api\]\s*color:#[0-9a-f]+/i, ''); if (t.trim()) console.log('  ·', t.slice(0, 120)); });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(400);
  await page.click('[data-mode="custom"]');
  await page.waitForTimeout(300);
  await page.fill('#wc-title', 'Стеклянные Степи Немо');
  await page.fill('#wc-goal', 'найти пропавший караван');
  await page.click('[data-act="create-custom-world"]');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Райн');
  await page.waitForTimeout(2500);
  await page.click('#screen-hero [data-act="start-adventure"]');
  try { await page.waitForSelector('#actions .action-btn', { timeout: 30000 }); }
  catch (e) { await page.screenshot({ path: 'shots/dbg-local.png' }); console.log('не дошли до кнопок:', await page.evaluate(() => ({ screen: document.body.dataset.screen, status: (document.querySelector('#game-status') || {}).textContent, panel: ((document.getElementById('scene-text') || {}).textContent || '').slice(0, 120) }))); throw e; }
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); });
  await page.waitForTimeout(600);
  for (let i = 1; i <= 3; i++) {
    await page.evaluate(() => document.querySelectorAll('#actions .action-btn')[0].click());
    await page.waitForFunction(() => !document.querySelector('#game-status:not([hidden])') && document.querySelectorAll('#actions .action-btn').length >= 3, null, { timeout: 40000 }).catch(() => {});
    await page.waitForTimeout(2500);
    const st = await page.evaluate(() => ({
      scene: ((document.getElementById('scene-text') || {}).textContent || '').replace(/\s+/g, ' ').slice(0, 240),
      chapter: (document.querySelector('#scene-chapter') || {}).textContent || '',
      npc: (document.querySelector('#scene-npc') || {}).hidden ? '—' : ((document.querySelector('#scene-npc') || {}).textContent || ''),
      options: Array.from(document.querySelectorAll('#actions .action-btn')).map(x => (x.querySelector('.action-btn__text') || x).textContent.trim()).slice(0, 3),
      stats: Array.from(document.querySelectorAll('#actions .action-btn')).map(x => (x.querySelector('.action-btn__meta') || {}).textContent || '').slice(0, 3),
      toast: Array.from(document.querySelectorAll('.toast, #toasts > *')).map(x => x.textContent.trim()).slice(-2).join(' | ')
    }));
    console.log('ХОД ' + i + ' | ' + st.chapter + ' | рядом: ' + st.npc);
    console.log('  ' + st.scene);
    if (st.toast) console.log('  [сообщение] ' + st.toast);
    console.log('  варианты: ' + st.options.map((o, j) => o + ' [' + (st.stats[j] || '').replace(/\s+/g, ' ').trim() + ']').join(' · '));
  }
  await page.click('[data-act="close-game"]');
  await page.waitForTimeout(400);
  const leave = await page.$('#modal-box .btn--primary');
  if (leave) { await leave.click(); await page.waitForTimeout(600); }
  await page.click('[data-act="settings"]');
  await page.waitForTimeout(600);
  const settings = await page.evaluate(() => Array.from(document.querySelectorAll('#modal-box p')).map(p => p.textContent.trim()).slice(0, 3));
  console.log('НАСТРОЙКИ:', JSON.stringify(settings, null, 1));
  console.log('ошибки страницы:', errors.length ? errors : 'нет');
  await b.close();
})();
