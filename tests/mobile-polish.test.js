const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'tools', 'layout.js'), 'utf8');

test('mobile interactive controls use a consistent 44px minimum target', () => {
  assert.match(css, /button,\s*\[role="button"\],\s*\[role="tab"\]\s*\{\s*min-height:\s*44px/);
  assert.match(css, /\.icon-btn\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px;[^}]*min-width:\s*44px;[^}]*min-height:\s*44px;/s);
  assert.match(css, /\.btn--sm\s*\{\s*min-height:\s*44px/);
  assert.match(css, /\.ability-btn\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.mech-chip--use[^\n]*\.item-card__use[\s\S]*?min-height:\s*44px/);
  assert.match(css, /\.npc-gallery__call,[^}]*\{\s*min-height:\s*44px/s);
});

test('keyboard resizing is centralized, debounced and releases the bottom safe area', () => {
  assert.match(app, /function setupViewport\(\)/);
  assert.match(app, /visualViewport\.addEventListener\('resize', schedule/);
  assert.match(app, /visualViewport\.addEventListener\('scroll', schedule/);
  assert.match(app, /document\.addEventListener\('focusin', afterViewportTransition, true\)/);
  assert.match(app, /document\.addEventListener\('focusout', afterViewportTransition, true\)/);
  assert.match(app, /root\.dataset\.keyboardOpen = keyboardOpen \? '1' : '0'/);
  assert.match(css, /:root\[data-keyboard-open="1"\]\s*\{\s*--safe-bottom:\s*0px/);
  assert.doesNotMatch(app, /watchAppHeight\(|setInterval\(syncAppHeight/);
  assert.equal((app.match(/function setupViewport\(\)/g) || []).length, 1, 'обработчик viewport должен быть один');
});

test('short-screen and landscape breakpoints preserve the action row while shrinking only the scene', () => {
  assert.match(css, /@media\s*\(max-height:\s*680px\)[\s\S]*?\.scene-media\s*\{\s*flex-basis:\s*clamp\(112px,\s*calc\(32\.15vh - 71px\),\s*148px\);\s*min-height:\s*112px;/);
  assert.match(css, /@media\s*\(max-height:\s*460px\) and \(orientation:\s*landscape\)/);
  assert.match(css, /\.actions\s*\{\s*gap:\s*3px;\s*padding:\s*4px 8px calc\(4px \+ var\(--safe-bottom\)\)/);
  assert.match(css, /\.input--slim\s*\{[^}]*font-size:\s*16px/);
  assert.match(css, /\.input--area\s*\{[^}]*font-size:\s*16px/);
});

test('browser layout audit covers compact, standard and large phones plus the menu image and hit areas', () => {
  assert.match(layout, /\['iPhone SE'/);
  assert.match(layout, /\['iPhone 13 mini'/);
  assert.match(layout, /\['iPhone 15 Pro Max'/);
  assert.match(layout, /menu-bg__image/);
  assert.match(layout, /naturalWidth/);
  assert.match(layout, /touchTargets/);
  assert.match(layout, /44/);
});
