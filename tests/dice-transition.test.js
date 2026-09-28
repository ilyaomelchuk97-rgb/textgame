const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const start = app.indexOf('async function openScenariosWithDiceFlight(reverse)');
const end = app.indexOf('function setWorldMode(mode)', start);
assert.ok(start >= 0 && end > start, 'анимация перехода найдена');
const flight = app.slice(start, end);

test('переход использует один AI-кубик в меню, на кнопке и в полёте', () => {
  assert.match(html, /class="menu-dice"><img class="dice-icon"/);
  assert.match(html, /data-act="reroll-scenarios"[^>]*><img class="dice-icon"/);
  assert.ok(flight.includes("source.querySelector('.dice-icon')"));
  assert.ok(flight.includes("target.querySelector('.dice-icon')"));
  assert.ok(flight.includes("document.createElement('img')"));
  assert.ok(flight.includes("glyph.className = 'dice-transition__glyph'"));
  assert.ok(flight.includes('glyph.src = diceTransitionUrl()'));
  assert.ok(flight.includes('target.classList.add(\'is-launching\')'));
  assert.ok(flight.includes('target.classList.remove(\'is-launching\')'));
  assert.ok(flight.includes('die.appendChild(glyph)'));
  assert.ok(!flight.includes('glyph.textContent'));
  assert.ok(!flight.includes('dice-transition__face'));
  assert.ok(!styles.includes('.dice-transition__face'));
  assert.ok(app.includes("window.DT_ASSETS['dice-transition']"));
  assert.ok(app.includes('icon.src = diceArt'), 'иконки не загружают общий AI-ассет');
});

test('кубик центрирован над логотипом, высота логотипа 55px', () => {
  const headRule = /\.menu-head\s*\{([^}]*)\}/.exec(styles)?.[1] || '';
  const diceRule = /\.menu-dice\s*\{([^}]*)\}/.exec(styles)?.[1] || '';
  const logoRule = /\.logo\s*\{([^}]*)\}/.exec(styles)?.[1] || '';
  assert.match(headRule, /display:\s*flex/);
  assert.match(headRule, /flex-direction:\s*column/);
  assert.match(headRule, /align-items:\s*center/);
  assert.doesNotMatch(diceRule, /position:\s*absolute/);
  assert.match(html, /<div class="menu-dice">[\s\S]*?<\/div>\s*<h1 class="logo">/);
  assert.match(logoRule, /height:\s*55px/);
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

test('вперёд кубик идёт по левой дуге, назад — по правой и с обратным вращением', () => {
  assert.ok(flight.includes('const launchSide = backward ? 1 : -1'));
  assert.ok(flight.includes('const spin = backward ? -1 : 1'));
  assert.match(flight, /backward\s*\?\s*\{\s*x: coverX \+ viewW \* 0\.32/);
  assert.ok(app.includes("openScenariosWithDiceFlight(true)"), 'кнопка «Назад» не запускает обратный полёт');
  assert.ok(styles.includes('#screen-scenarios [data-act="reroll-scenarios"].is-launching'));
});
