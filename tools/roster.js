/**
 * tools/roster.js — отряд главного экрана: сколько фигур, бегают ли, меняются ли.
 *
 * Пункт 5: персонажи на главном экране должны меняться, а их должно быть много
 * (герои и монстры, в том числе из знакомых игр). Проверяем в браузере:
 *   • в меню стоят две фигуры и обе бегут по экрану;
 *   • фигуры рисуются (у каждой видимая коробка и непустой SVG);
 *   • при заходе в игровой экран и обратно пара меняется;
 *   • за 12 заходов в меню показано не меньше 6 разных фигур;
 *   • снимки пар для отчёта.
 *
 *   node tools/roster.js [url] [--rounds=12]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const ROUNDS = Number((process.argv.find(a => /^--rounds=/.test(a)) || '').split('=')[1] || 12);
const SHOTS = path.join(__dirname, '..', 'shots');

const readPair = page => page.evaluate(() => {
  const host = document.getElementById('menu-critters');
  if (!host) return null;
  const items = Array.from(host.querySelectorAll('.critter'));
  return {
    ids: items.map(el => el.dataset.role),
    shapes: items.map(el => ({
      id: el.dataset.role,
      box: (() => { const r = el.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })(),
      drawn: el.querySelectorAll('svg *').length,
      running: el.classList.contains('is-running')
    }))
  };
});

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage(Object.assign({}, devices['iPhone 13 Mini']));
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e).slice(0, 120)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(900);

  const problems = [];
  const seen = new Set();
  const first = await readPair(page);
  if (!first) {
    console.log('в меню нет отряда');
    await browser.close();
    process.exit(1);
  }

  // 1. первые две фигуры: нарисованы и бегут
  first.shapes.forEach(s => {
    if (s.drawn < 8) problems.push('фигура ' + s.id + ' почти пустая (' + s.drawn + ' деталей)');
    if (s.box[0] < 40 || s.box[1] < 40) problems.push('фигура ' + s.id + ' не видна: ' + s.box.join('×'));
    if (!s.running) problems.push('фигура ' + s.id + ' не бежит');
  });
  first.ids.forEach(id => seen.add(id));
  await page.screenshot({ path: path.join(SHOTS, 'v19-roster-1.png') });

  // 2. отряд бежит: за 1.5 с фигуры сдвигаются
  const before = await page.evaluate(() => Array.from(document.querySelectorAll('#menu-critters .critter'))
    .map(el => Math.round(el.getBoundingClientRect().x)));
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => Array.from(document.querySelectorAll('#menu-critters .critter'))
    .map(el => Math.round(el.getBoundingClientRect().x)));
  const moved = before.map((x, i) => Math.abs(after[i] - x)).reduce((a, b) => a + b, 0);
  if (moved < 20) problems.push('отряд стоит на месте (сдвиг ' + moved + 'px)');
  console.log('сдвиг отряда за 1.5 с: ' + moved + ' px');

  // 3. заход в игру и обратно меняет пару
  for (let i = 0; i < ROUNDS; i++) {
    await page.click('#screen-menu [data-act="new-game"]');
    await page.waitForTimeout(260);
    // возврат в меню — кнопка «Назад» на экране миров
    await page.evaluate(() => {
      const b = document.querySelector('#screen-scenarios [data-act="back"]');
      if (b) b.click();
    });
    await page.waitForTimeout(460);
    const pair = await readPair(page);
    if (!pair) { problems.push('после возврата в меню отряда нет'); break; }
    pair.ids.forEach(id => seen.add(id));
    if (i === 1) await page.screenshot({ path: path.join(SHOTS, 'v19-roster-2.png') });
    if (i === 3) await page.screenshot({ path: path.join(SHOTS, 'v19-roster-3.png') });
  }
  if (seen.size < 6) problems.push('за ' + ROUNDS + ' заходов показано всего ' + seen.size + ' разных фигур');
  if (errors.length) problems.push('ошибок страницы: ' + errors.join(' | '));

  const roster = await page.evaluate(() => (window.DTCritters ? window.DTCritters.roster().map(r => r.id) : []));
  if (roster.length < 10) problems.push('в отряде всего ' + roster.length + ' фигур, а нужно не меньше 10');

  console.log('отряд: ' + roster.length + ' фигур · за ' + ROUNDS + ' заходов показано ' + seen.size + ': ' + Array.from(seen).join(', '));
  console.log(problems.length
    ? 'ОТРЯД ГЛАВНОГО ЭКРАНА: ' + problems.join(' · ')
    : 'ОТРЯД ГЛАВНОГО ЭКРАНА: ' + roster.length + ' фигур, бегают парами и меняются каждый заход — ❤');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
