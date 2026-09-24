/* Офлайн целиком: service worker кладёт оболочку в кэш, и после выключения
   сети игра обязана открыться. Проверяем именно это — без сети, без сервера. */
const { chromium, devices } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000/game.html';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();

  await page.goto(URL, { waitUntil: 'load' });
  // ждём, пока service worker возьмёт управление и положит оболочку в кэш
  const swState = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'нет serviceWorker';
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (!reg) return 'регистрация не готова';
    const names = await caches.keys();
    let files = 0;
    for (const n of names) {
      const c = await caches.open(n);
      files += (await c.keys()).length;
    }
    return (reg.active ? 'активен' : 'не активен') + ', кэшей ' + names.length + ', файлов ' + files;
  });

  // теперь сеть выключаем совсем и перезагружаем страницу
  await ctx.setOffline(true);
  let ok = false;
  let screen = '';
  try {
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    await page.waitForSelector('#screen-menu', { timeout: 8000 });
    screen = await page.evaluate(() => {
      const m = document.getElementById('screen-menu');
      const visible = m && !m.hidden;
      const title = (document.querySelector('#screen-menu .menu__title, #screen-menu h1') || {}).textContent || '';
      return (visible ? 'меню на экране' : 'меню скрыто') + ' · ' + title.trim().slice(0, 40);
    });
    ok = /меню на экране/.test(screen);
  } catch (e) {
    screen = 'ошибка загрузки: ' + String(e.message || e).slice(0, 80);
  }
  await page.screenshot({ path: 'shots/v14-offline.png' });

  // кнопка установки приложения должна существовать в настройках
  const install = await page.evaluate(() => !!document.querySelector('[data-act="install-app"], #install-app, [data-act="pwa-install"]'));

  console.log('service worker:', swState);
  console.log('без сети:', screen);
  console.log('кнопка «установить приложение»:', install ? 'есть' : 'не найдена (появится при установке в браузере)');
  console.log(ok ? 'ОФЛАЙН: игра открывается без сети' : 'ОФЛАЙН: без сети игра не открылась');
  await browser.close();
  process.exitCode = ok ? 0 : 1;
})();
