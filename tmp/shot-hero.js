const { chromium, devices } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();
  // герой от мастера: сценарий с числами и приёмами, но с шероховатостями модели
  await page.route('**/api/gm/stream', route => route.fulfill({ status: 200, contentType: 'application/x-ndjson',
    body: [
      JSON.stringify({ delta: 'За беда: караван пропал в песках.\n' }),
      JSON.stringify({ delta: 'М: Коммутатор\nК: Телескопический пилот|смотрит за дорогами, ищет сквозняки|Сила+2 Ловкость+1|Метеоритный щит :: отражает стрелы и видит сквозь песчаный ветер\n' }),
      JSON.stringify({ delta: 'К: Пастуший мудрец|ведёт группу через опасные места|Разум+2 Восприятие+1|Песочный шёпот :: находит скрытые узлы\n' }),
      JSON.stringify({ delta: 'К: Черноморский караванщик|водит караваны и находит тропы|Ловкость+2 Телосложение+1|Песчаная маска :: маскировка и быстрый бег\n' }),
      JSON.stringify({ delta: 'К: Завоеватель пустыни|ставит ловушки и читает коды|Сила+2 Воля+1|Сигнал бури :: зовёт песчаный вихрь\n' }),
      JSON.stringify({ delta: 'П: Хранитель реликвий|ключ от тайника|карта ведёт к пропавшему каравану\nП: Лев-страж|стражный кристалл|замечает движение в песке\nП: Патриарх ветров|песчаный амулет|знает, кто увёл караван\n' }),
      JSON.stringify({ delta: 'Р: Амаж|наследует песок и умеет в него уходить\nР: Песчаная душа|чувствует ветер раньше всех\nР: Кинжальный|металл в крови не ржавеет\n' }),
      JSON.stringify({ done: true })
    ].join('\n') + '\n'
  }));
  await page.route('**/api/gm', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, provider: 'mock', text: '{}' }) }));
  await page.route('**/api/image**', route => route.fulfill({ status: 200, contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64') }));
  await page.goto('http://localhost:3000/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(600);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('[data-mode="custom"]');
  await page.waitForTimeout(300);
  await page.fill('#wc-title', 'Ржавые Пески Кар-Адама');
  await page.click('[data-act="create-custom-world"]');
  await page.waitForSelector('#screen-hero:not([hidden])');
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'shots/v7-04-hero-set.png' });
  console.log(await page.evaluate(() => Array.from(document.querySelectorAll('#class-list .arch-card')).map(c => ({
    t: (c.querySelector('.arch-card__title') || {}).textContent,
    b: (c.querySelector('.arch-card__bonus') || {}).textContent.replace(/\s+/g, ' '),
    h: Math.round(c.getBoundingClientRect().height)
  }))));
  await browser.close();
})();
