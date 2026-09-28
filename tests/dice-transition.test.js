const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const start = app.indexOf('async function openScenariosWithDiceFlight()');
const end = app.indexOf('function setWorldMode(mode)', start);
assert.ok(start >= 0 && end > start, 'анимация перехода найдена');
const flight = app.slice(start, end);

test('переход рисует один кубик, без второго слоя-куба', () => {
  assert.ok(flight.includes("glyph.className = 'dice-transition__glyph'"));
  assert.ok(flight.includes('die.appendChild(glyph)'));
  assert.ok(!flight.includes('dice-transition__face'));
  assert.ok(!styles.includes('.dice-transition__face'));
});

test('кубик летит по плавной кривой и закрывает весь экран в пике', () => {
  assert.ok(flight.includes('const curveFrames = path =>'));
  assert.ok(flight.includes('const count = 48'));
  assert.ok(flight.includes('const t = smooth(offset)'));
  assert.ok(flight.includes('scaleTo: coverScale'));
  assert.ok(flight.includes('Math.hypot(viewW, viewH) * 1.75 / tileSize'));
  assert.ok(flight.includes('die.animate(launchFrames'));
  assert.ok(flight.includes('die.animate(landingFrames'));
  assert.ok(!flight.includes("easing: 'cubic-bezier(.2,.72,.32,1)'"));
});
