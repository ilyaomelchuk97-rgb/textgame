const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('hero stat chips wrap instead of being forced into the four-column run grid', () => {
  const html = read('index.html');
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(html, /class="stat-grid stat-grid--chips" id="stat-preview"/);
  assert.match(app, /class: 'stat-grid stat-grid--chips'/);
  assert.match(app, /class: 'stat-grid stat-grid--run'/);
  assert.match(css, /\.stat-grid--chips\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;/s);
  assert.match(css, /\.stat-grid--run\s*\{\s*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/);
});

test('SANA is the image default and old auto defaults migrate only once', () => {
  const app = read('src/app.js');
  const api = read('src/api.js');
  const server = read('server.js');
  assert.match(app, /imageSource: 'sana'/);
  assert.match(api, /imageSource: 'sana'/);
  assert.match(app, /saved\.imageSource === 'auto'[\s\S]*?data\.imageSource = 'sana'/);
  assert.match(app, /imageSourceDefaultVersion: 1/);
  assert.match(server, /id: 'sana', title: 'SANA · самый быстрый'/);
});

test('auto narrative starts with Mistral Large 3 when available and preserves provider switching', () => {
  const server = read('server.js');
  const api = read('src/api.js');
  const app = read('src/app.js');
  const providerStart = server.indexOf('const PROVIDERS = [');
  const genIndex = server.indexOf("name: 'gen'", providerStart);
  const nextIndex = server.indexOf("name: 'groq'", providerStart);
  assert.ok(providerStart >= 0 && genIndex > providerStart && genIndex < nextIndex,
    'the strong gen gateway must be first in auto provider order');
  assert.match(server, /'mistralai\/mistral-large-3'/);
  assert.match(server, /Авто · Mistral Large 3/);
  assert.match(api, /masterWanted: 'auto'/);
  assert.match(app, /Settings\.data\.master \|\| 'auto'/);
  assert.match(app, /Settings\.set\(\{ master: id \}\)/, 'the player can still select a different master');
  assert.match(app, /Settings\.set\(\{ imageSource: id/);
  assert.match(app, /imageSource \|\| 'sana'/);
});

test('settings controls remain narrow-screen friendly and the misleading mic label is gone', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(css, /\.settings \.rules-row\s*\{[^}]*display:\s*grid;[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(app, /Начало истории и голоса знакомых/);
  assert.doesNotMatch(app, /Микрофон у мастера/);
});

test('save actions wrap safely on iPhone-sized screens', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(app, /class: 'save-card__actions'/);
  assert.match(app, /text: item\.over \? 'Перечитать финал' : 'Продолжить'/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*?#screen-saves \.save-card__actions\s*\{[^}]*display:\s*grid;[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.match(css, /#screen-saves \.save-card__actions \.btn--sm:first-child\s*\{\s*grid-column:\s*1 \/ -1;/);
});
