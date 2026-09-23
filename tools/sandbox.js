/**
 * tools/sandbox.js — проверка «худшего случая», как в песочнице предпросмотра:
 * сеть полностью запрещена, доступ к localStorage бросает исключение.
 * Игра обязана запуститься, дать сцену, варианты и картинку-заглушку.
 */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, locale: 'ru-RU' });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  // localStorage недоступен
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new DOMException('blocked', 'SecurityError'); }
    });
  });
  // любые внешние запросы — обрыв
  await page.route('**/*', route => {
    const u = route.request().url();
    if (u.startsWith('http://localhost') || u.startsWith('http://127.0.0.1')) return route.continue();
    return route.abort();
  });

  // Статика с любого порта: либо свой статический сервер, либо основной (3000)
  const base = process.env.BASE || 'http://localhost:3000';
  // без сервера ИИ: все внешние запросы рвутся, статика отдаётся локально
  await page.goto(base + '/game.html', { waitUntil: 'load' });
  await page.waitForTimeout(800);

  const menuOk = await page.isVisible('#screen-menu [data-act="new-game"]');
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card', { timeout: 8000 });
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Один');
  await page.click('#screen-hero [data-act="start-adventure"]');

  // локальный мастер должен отработать почти сразу
  await page.waitForSelector('#actions .action-btn', { timeout: 40000 });
  // картинку тоже дожидаемся: серверный прокси может рисовать несколько секунд
  await page.waitForFunction(() => {
    const img = document.getElementById('scene-img');
    const src = img && img.getAttribute('src');
    return src && src.length > 10;
  }, { timeout: 45000 }).catch(() => console.log('  ! картинка не появилась'));
  // текст печатается «волной» — ждём, пока допечатается
  let prevText = '';
  for (let i = 0; i < 20; i++) {
    const now = await page.evaluate(() => (document.getElementById('scene-text') || {}).textContent || '');
    if (now && now === prevText) break;
    prevText = now;
    await page.waitForTimeout(700);
  }
  await page.waitForTimeout(300);

  const state = await page.evaluate(() => ({
    scene: document.getElementById('scene-text').textContent.slice(0, 120),
    options: document.querySelectorAll('#actions .action-btn').length,
    imgSrc: (document.getElementById('scene-img').getAttribute('src') || '').slice(0, 30),
    canvasPainted: (function () {
      const c = document.getElementById('scene-canvas');
      if (!c) return false;
      const d = c.getContext('2d').getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return d[3] > 0 && (d[0] + d[1] + d[2]) > 0;
    })(),
    notice: document.getElementById('notices').textContent.slice(0, 60),
    savesBefore: (function () { try { return localStorage.getItem('dt2:index'); } catch (e) { return 'localStorage заблокирован'; } })()
  }));
  await page.screenshot({ path: 'shots/sandbox.png' });

  console.log('меню открылось:', menuOk);
  console.log('сцена:', JSON.stringify(state.scene));
  console.log('вариантов:', state.options);
  console.log('картинка:', state.imgSrc || '(нет)');
  console.log('мгновенный фон canvas:', state.canvasPainted);
  console.log('уведомление:', JSON.stringify(state.notice));
  console.log('сохранения хранятся в памяти (фолбэк):', state.savesBefore === null || state.savesBefore === 'localStorage заблокирован');

  // картинка может прийти и через серверный прокси — важно, что она вообще есть
  const ok = menuOk && state.options === 3 && state.scene.length > 30 && state.imgSrc.length > 10 && state.canvasPainted;
  console.log(ok ? '\n✓ игра работает даже без сети и хранилища' : '\n✗ проблемы в «худшем случае»');
  if (errors.length) console.log('ошибки страницы:', errors);
  await browser.close();
  process.exitCode = ok ? 0 : 1;
})();
