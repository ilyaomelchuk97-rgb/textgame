const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const skins = fs.readFileSync(path.join(root, 'src', 'skins.css'), 'utf8');

test('class, race and origin choices update the draft, rerender selection, and expose pressed state', () => {
  const classList = app.slice(app.indexOf('function renderClassList()'), app.indexOf('function renderRaceList()'));
  const raceList = app.slice(app.indexOf('function renderRaceList()'), app.indexOf('function renderOriginList()'));
  const originList = app.slice(app.indexOf('function renderOriginList()'), app.indexOf('function renderStatPreview()'));

  assert.match(classList, /'aria-pressed': active \? 'true' : 'false'/);
  assert.match(classList, /State\.draft\.classId = c\.id;\s*renderClassList\(\);\s*renderStatPreview\(\);\s*Sound\.tap\(\);/);
  assert.match(raceList, /'aria-pressed': active \? 'true' : 'false'/);
  assert.match(raceList, /State\.draft\.raceId = r\.id;\s*renderRaceList\(\);\s*renderStatPreview\(\);\s*Sound\.tap\(\);/);
  assert.match(originList, /'aria-pressed': active \? 'true' : 'false'/);
  assert.match(originList, /State\.draft\.originId = o\.id;\s*renderOriginList\(\);\s*renderStatPreview\(\);\s*Sound\.tap\(\);/);
});

test('dark themes use a white pressed glow and the light themes use a green glow', () => {
  assert.match(skins, /--sk-select-color:\s*rgba\(255,255,255,\.92\)/);
  for (const theme of ['material', 'ice']) {
    const block = new RegExp(`body\\[data-theme="${theme}"\\][\\s\\S]*?--sk-select-color:\\s*#17854f`).exec(skins);
    assert.ok(block, `${theme}: отсутствует зелёная подсветка светлой темы`);
  }
  assert.match(skins, /body\[data-theme\] button:active:not\(:disabled\)[\s\S]*?outline:\s*2px solid var\(--sk-select-color\)/);
});

test('selected class and origin cards get an overlay above the theme artwork', () => {
  const generalCards = skins.indexOf('body[data-theme] .book-card,');
  const activeCards = skins.lastIndexOf('body[data-theme] .arch-card.is-active');
  assert.ok(generalCards >= 0 && activeCards > generalCards, 'активное состояние переопределяет тематическую карточку');
  const activeBlock = skins.slice(activeCards, skins.indexOf('\n}', activeCards));
  assert.match(activeBlock, /linear-gradient\(0deg, var\(--sk-select-wash\)/);
  assert.match(activeBlock, /var\(--sk-select-color\)/);
  assert.match(activeBlock, /var\(--sk-select-glow\)/);
});

test('other persistent button toggles keep the theme-colored selection ring', () => {
  assert.match(skins, /body\[data-theme\] \.tab\.is-active,[\s\S]*?body\[data-theme\] button\[aria-pressed="true"\]/);
  assert.match(skins, /0 0 0 2px var\(--sk-select-color\)/);
});
