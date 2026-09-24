/* Финал кампании: карточка, галерея кадров, выгрузка текстом.
   Прогон идёт с моками ИИ и картинок, поэтому проверяет именно интерфейс. */
const { chromium, devices } = require('playwright');

const URL = process.argv[2] || 'http://localhost:3000/game.html';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAoCAIAAADBrGu+AAAArElEQVR42u2ZsRGAIAxFgXMMB3AAB7G0tLRwHAtLS0sHcShbtdCEO4x4Lx1HDv4jEMLhy6p2OVtwmRsAAAAAgK0VttNP83Bs9t2oHcFbXWQX6dEY4WvqH3vtAST65Azhg+pVnqTRNMsv9ycCAADwomkrBYk/EUgWBKGnQQQkyuScNlvoXp/qqJzK6bpptVK2dbF9Dxg/aCIUk4UAAAAAAAAAAAAA/gPgc/9m3QEiXSeNkC2rigAAAABJRU5ErkJggg==';
const TURN = {
  scene: 'Ты выходишь к маяку. Ветер бьёт в лицо, и Мара держит фонарь, чтобы ты видел ступени. Наверху кто-то ждёт — и он не рад.',
  chapter: 'Глава последняя', place: 'Маяк', goalDone: true,
  npc: { name: 'Мара', line: 'Не свети в окно — там смотрят.' },
  options: [
    { text: 'Подняться наверх', stat: 'str', difficulty: 'medium' },
    { text: 'Крикнуть в темноту', stat: 'cha', difficulty: 'easy' },
    { text: 'Засветить маяк', stat: 'per', difficulty: 'hard' }
  ],
  effects: { goal: true }
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU', acceptDownloads: true }));
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => {
    // отказ мок-канала — ожидаемая часть прогона, а не дефект страницы
    if (m.type() === 'error' && !/ERR_FAILED|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text());
  });

  // картинки: маленький PNG, чтобы галерея кадров наполнилась
  await page.route('**/api/image*', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG, 'base64') }));
  await page.route('**/api/gm/stream*', r => r.abort());
  // мастер каждый ход говорит новое: иначе самопроверка справедливо решит,
  // что сцена повторяется, и передаст ход встроенному мастеру
  let turnNo = 0;
  await page.route('**/api/gm', r => {
    turnNo++;
    const turn = Object.assign({}, TURN, {
      scene: TURN.scene + ' Это уже ' + turnNo + '-й шаг пути, и маяк ближе.'
    });
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, provider: 'mock', text: JSON.stringify(turn) }) });
  });

  await page.goto(URL, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForSelector('#pane-random .scenario-card');
  await page.click('#pane-random .scenario-card:first-child');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Ирма');
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForSelector('#modal:not([hidden]) .btn', { timeout: 12000 }).catch(() => {});
  await page.click('#modal .btn--ghost').catch(() => {});
  await page.waitForSelector('#actions .action-btn:not(.action-btn--ghost)', { timeout: 25000 });

  // ход: сцена с репликой знакомого
  await page.click('#actions .action-btn:not(.action-btn--ghost)');
  await page.waitForTimeout(2500);
  const npc = await page.evaluate(() => {
    const el = document.getElementById('scene-npc');
    return { text: (el && el.textContent || '').trim(), hidden: !el || el.hidden };
  });

  // финал: победа → эпилог с инструментами
  await page.waitForSelector('#epilogue:not([hidden])', { timeout: 25000 });
  // галерея кадров доезжает с задержкой: ждём, а не заглядываем один раз
  await page.waitForSelector('#epilogue-frames .frames__img', { timeout: 12000 }).catch(() => {});
  await page.waitForTimeout(600);
  const fin = await page.evaluate(() => ({
    title: (document.getElementById('epilogue-title') || {}).textContent || '',
    tools: Array.from(document.querySelectorAll('.epilogue__tools .btn')).map(b => b.textContent.trim()),
    frames: document.querySelectorAll('#epilogue-frames .frames__img').length,
    stats: document.querySelectorAll('.epilogue__stats .epilogue__stat').length
  }));

  // выгрузка текстом: ждём файл
  let saved = null;
  const dl = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('.epilogue__tools .btn--ghost');
  const download = await dl;
  if (download) {
    saved = download.suggestedFilename();
    await download.saveAs('/tmp/' + saved);
  }
  await page.screenshot({ path: 'shots/v14-epilogue.png', fullPage: false });

  // карточка кампании: canvas → PNG, файл тоже должен появиться
  let card = null;
  const dl2 = page.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  await page.click('.epilogue__tools .btn--primary');
  await page.waitForTimeout(1200);
  const dl2res = await dl2;
  if (dl2res) { card = dl2res.suggestedFilename(); await dl2res.saveAs('/tmp/' + card); }

  console.log('реплика знакомого:', npc.hidden ? '✗ не показана' : '✓ ' + npc.text.slice(0, 42));
  console.log('финал:', fin.title.trim(), '| кнопок', fin.tools.length, '| кадров', fin.frames, '| чисел', fin.stats);
  console.log('выгрузка текстом:', saved ? '✓ ' + saved : '✗ файла нет');
  console.log('карточка кампании:', card ? '✓ ' + card : '✗ файла нет');
  console.log('ошибок страницы:', errs.length, errs.slice(0, 3).join(' | '));

  const ok = !npc.hidden && /Мара/.test(npc.text) && fin.tools.length >= 2 && fin.frames >= 1 && !!saved && !!card && errs.length === 0;
  console.log(ok ? 'ФИНАЛ И РЕПЛИКИ: всё на месте' : 'ФИНАЛ И РЕПЛИКИ: есть замечания');
  await browser.close();
  process.exitCode = ok ? 0 : 1;
})();
