/**
 * tools/roster-sheet.js — обзорный лист отряда: все фигуры главного экрана рядом.
 *
 * Нужен, чтобы глазами проверить рисунки: в игре фигуры бегут и разглядеть
 * их трудно. Здесь каждая стоит на месте, подписана своим именем и ролью.
 *
 *   node tools/roster-sheet.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const OUT = path.join(__dirname, '..', 'shots', 'v19-roster-sheet.png');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1180 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  const made = await page.evaluate(() => {
    const C = window.DTCritters;
    if (!C) return 0;
    const old = document.getElementById('roster-sheet');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'roster-sheet';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#0d1418;display:grid;' +
      'grid-template-columns:repeat(4,1fr);gap:6px;padding:10px;overflow:auto;font:11px system-ui';
    const list = C.roster();
    list.forEach(item => {
      const cell = document.createElement('div');
      cell.style.cssText = 'background:#17232a;border:1px solid #2b3a44;border-radius:12px;padding:6px;' +
        'display:flex;flex-direction:column;align-items:center;gap:4px';
      const skin = Object.keys(item.skin || {}).map(k => k + ':' + item.skin[k]).join(';');
      const art = document.createElement('div');
      art.className = 'menu-stage';
      art.style.cssText = 'width:150px;height:150px;position:relative;' + skin;
      art.innerHTML = '<div class="critter critter--' + item.id + '" style="position:absolute;left:8px;bottom:0;' +
        'height:120px;transform:none">' + item.svg() + '</div>';
      const title = document.createElement('div');
      title.textContent = item.name + ' · ' + (item.kind === 'hero' ? 'герой' : 'монстр');
      title.style.cssText = 'color:#cfe9e1;text-align:center';
      const line = document.createElement('div');
      line.textContent = item.line || '';
      line.style.cssText = 'color:#8fa6ae;text-align:center;font-size:10px';
      cell.appendChild(art); cell.appendChild(title); cell.appendChild(line);
      wrap.appendChild(cell);
    });
    document.body.appendChild(wrap);
    return list.length;
  });

  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT });
  console.log('лист отряда: ' + made + ' фигур → ' + OUT);
  await browser.close();
})();
