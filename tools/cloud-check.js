const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  await page.route('**/api/gm/stream*', r => r.abort());
  await page.route('**/api/gm', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify({
    scene: 'Ты стоишь на пристани: чайки, сеть, чужой ящик с клеймом. Ветер несёт соль и дым, и кто-то окликает тебя по имени.',
    chapter: 'Глава I', place: 'Пристань', options: [{ text: 'Ответить', stat: 'cha', difficulty: 'easy' }, { text: 'Спрятаться', stat: 'agi', difficulty: 'medium' }, { text: 'Осмотреть ящик', stat: 'per', difficulty: 'hard' }], effects: {}
  }) }) }));
  await page.goto('http://localhost:3000/game.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Облако');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 12000 }).catch(() => {});
  await page.click('#modal .btn--ghost').catch(() => {});
  await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 25000 });
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"], .prologue__go'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-game"]'); if (b) b.click(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => { const m = document.getElementById('modal'); if (m && !m.hidden) { const p = m.querySelector('.btn--primary'); if (p) p.click(); } });
  await page.click('[data-act="my-games"]');
  await page.waitForTimeout(400);
  await page.click('[data-act="cloud-put"]');
  await page.waitForTimeout(2500);
  const code = await page.evaluate(() => (document.querySelector('.cloud-code') || {}).textContent || '');
  console.log('код из интерфейса:', code || '(нет)');
  await page.screenshot({ path: 'shots/v13-cloud-code.png' });
  // теперь пробуем забрать по коду на «другом устройстве»: чистим сохранения
  await page.evaluate(() => { document.getElementById('modal').hidden = true; });
  await page.evaluate(() => { localStorage.removeItem('dt2:index'); });
  await page.click('[data-act="cloud-get"]');
  await page.waitForTimeout(300);
  await page.fill('#modal input.input', code);
  await page.click('#modal .btn--primary');
  await page.waitForTimeout(3000);
  const res = await page.evaluate(() => ({ screen: document.body.dataset.screen, title: (document.getElementById('game-title') || {}).textContent, saved: (JSON.parse(localStorage.getItem('dt2:index') || '[]') || []).length }));
  console.log('после ввода кода:', JSON.stringify(res));
  console.log('ошибок страницы:', errs.length, errs.slice(0,2).join(' | '));
  await browser.close();
  const ok = /^[A-Z0-9]{6}$/.test(code.trim()) && res.screen === 'game' && res.saved >= 1 && errs.length === 0;
  console.log(ok ? 'ОБЛАЧНЫЙ СЕЙВ × UI: работает' : 'ОБЛАЧНЫЙ СЕЙВ × UI: ПРОБЛЕМА');
  process.exitCode = ok ? 0 : 1;
})();
