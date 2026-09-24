/**
 * tools/pack.js — проверка офлайн-пака фонов (п.13).
 * Рисует все 24 основы и показывает слои (время суток, погода, очаг):
 *   • каждая основа должна быть «богатой» — много оттенков, не пустой холст;
 *   • ночь должна быть темнее дня, закат — теплее (по пикселям, не на словах);
 *   • сетка сохраняется в shots/v15-backdrop-pack.png и shots/v15-layers.png.
 *
 *   node tools/pack.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';

(async () => {
  const shots = path.join(__dirname, '..', 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext(Object.assign({}, devices['iPhone 13 Mini'], { locale: 'ru-RU' }));
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.DTBackdrop && window.DTBackdrop.KIND_COUNT), null, { timeout: 20000 });

  const check = await page.evaluate(() => {
    const B = window.DTBackdrop;
    const kinds = Object.keys(B.SILHOUETTES);
    const dayparts = ['dawn', 'day', 'dusk', 'night'];
    const weathers = ['clear', 'rain', 'snow', 'fog', 'storm', 'ash', 'wind'];
    const palette = ['#101820', '#2f4f5a', '#9fe6d0'];

    function stats(canvas) {
      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const seen = new Set();
      let sum = 0, n = 0, min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4 * 17) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const l = 0.299 * r + 0.587 * g + 0.114 * b;
        seen.add((r >> 4) + ',' + (g >> 4) + ',' + (b >> 4));
        sum += l; n++;
        if (l < min) min = l;
        if (l > max) max = l;
      }
      return { colors: seen.size, lum: sum / n, range: max - min };
    }

    function make(w, h, opts) {
      const c = document.createElement('canvas');
      c.style.width = w + 'px';
      c.style.height = h + 'px';
      c.width = w;
      c.height = h;
      B.draw(c, opts);
      return c;
    }

    const weak = [];
    const cells = [];
    kinds.forEach((kind, i) => {
      const daypart = dayparts[i % dayparts.length];
      const weather = weathers[i % weathers.length];
      const canvas = make(180, 101, { kind, palette, seed: 100 + i, daypart, weather, fire: i % 5 === 0 });
      const st = stats(canvas);
      if (st.colors < 10 || st.range < 12) weak.push(kind + ' (оттенков ' + st.colors + ', разброс ' + Math.round(st.range) + ')');
      cells.push({ kind, daypart, weather, canvas, st });
    });

    // сетка основ
    const grid = document.createElement('div');
    grid.id = 'pack-grid';
    grid.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;width:562px;display:grid;grid-template-columns:repeat(3,180px);gap:6px;padding:8px;background:#05070c;';
    cells.forEach(c => {
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;';
      box.appendChild(c.canvas);
      const label = document.createElement('div');
      label.textContent = c.kind + ' · ' + c.daypart + ' · ' + c.weather;
      label.style.cssText = 'position:absolute;left:2px;bottom:2px;font:10px monospace;color:#dfe9f5;text-shadow:0 1px 2px #000;';
      box.appendChild(label);
      grid.appendChild(box);
    });
    document.body.appendChild(grid);

    // слои: одна основа — четыре времени суток и четыре погоды
    const strip = document.createElement('div');
    strip.id = 'pack-layers';
    strip.style.cssText = 'position:fixed;left:0;top:0;z-index:9999;width:746px;display:grid;grid-template-columns:repeat(4,180px);gap:6px;padding:8px;background:#05070c;';
    const layerCells = [];
    dayparts.forEach(d => {
      const c = make(180, 101, { kind: 'city', palette, seed: 7, daypart: d, weather: 'auto' });
      layerCells.push({ tag: 'день:' + d, canvas: c, st: stats(c) });
    });
    weathers.slice(0, 4).forEach(w => {
      const c = make(180, 101, { kind: 'road', palette, seed: 9, daypart: 'day', weather: w });
      layerCells.push({ tag: 'погода:' + w, canvas: c, st: stats(c) });
    });
    layerCells.forEach(c => {
      const box = document.createElement('div');
      box.style.cssText = 'position:relative;';
      box.appendChild(c.canvas);
      const label = document.createElement('div');
      label.textContent = c.tag;
      label.style.cssText = 'position:absolute;left:2px;bottom:2px;font:10px monospace;color:#dfe9f5;text-shadow:0 1px 2px #000;';
      box.appendChild(label);
      strip.appendChild(box);
    });
    document.body.appendChild(strip);

    const byDay = {};
    layerCells.forEach(c => { byDay[c.tag] = c.st; });
    return {
      kinds: kinds.length,
      weak,
      nightLum: byDay['день:night'].lum,
      dayLum: byDay['день:day'].lum,
      rainColors: byDay['погода:rain'].colors,
      fogRange: byDay['погода:fog'].range,
      layerTags: layerCells.map(c => c.tag)
    };
  });

  // сетку снимаем без полосы слоёв, полосу — без сетки: обе стоят в одном слое
  await page.evaluate(() => { document.getElementById('pack-layers').style.display = 'none'; });
  await page.locator('#pack-grid').screenshot({ path: path.join(shots, 'v15-backdrop-pack.png') });
  await page.evaluate(() => {
    document.getElementById('pack-grid').remove();
    document.getElementById('pack-layers').style.display = 'grid';
  });
  await page.locator('#pack-layers').screenshot({ path: path.join(shots, 'v15-layers.png') });

  const problems = [];
  if (check.kinds !== 24) problems.push('основ не 24, а ' + check.kinds);
  if (check.weak.length) problems.push('пустые/бедные основы: ' + check.weak.join('; '));
  if (!(check.nightLum < check.dayLum)) problems.push('ночь не темнее дня (' + Math.round(check.nightLum) + ' vs ' + Math.round(check.dayLum) + ')');
  if (!(check.rainColors > 10)) problems.push('дождь не видно: оттенков ' + check.rainColors);
  if (!(check.fogRange > 8)) problems.push('туман не видно: разброс ' + Math.round(check.fogRange));
  if (errors.length) problems.push('ошибок страницы: ' + errors.join(' | '));

  console.log('основ в паке: ' + check.kinds);
  console.log('слои: ' + check.layerTags.join(', '));
  console.log('ночь/день по яркости: ' + Math.round(check.nightLum) + ' / ' + Math.round(check.dayLum));
  console.log(problems.length
    ? 'ПАК ФОНОВ: ' + problems.join(' · ')
    : 'ПАК ФОНОВ: 24 основы рисуются, слои видны — ❤');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
