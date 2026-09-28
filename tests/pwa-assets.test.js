const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

function namesFromArray(name) {
  const match = new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];').exec(worker);
  assert.ok(match, 'в sw.js нет массива ' + name);
  return Array.from(match[1].matchAll(/'([^']+)'/g), item => item[1]);
}

test('PWA precaches all menu sprites, theme artwork and cover images', () => {
  const critters = new Set(namesFromArray('CRITTER_IMAGES'));
  const themes = new Set(namesFromArray('THEME_IMAGES'));
  const covers = new Set(namesFromArray('COVER_IMAGES'));

  for (const file of fs.readdirSync(path.join(root, 'assets', 'critters'))) {
    if (!file.endsWith('-run.webp')) continue;
    assert.ok(critters.has(file.replace(/-run\.webp$/, '')), 'в кэше нет спрайта ' + file);
  }
  for (const file of fs.readdirSync(path.join(root, 'assets', 'themes'))) {
    if (!file.endsWith('.webp')) continue;
    assert.ok(themes.has(file.replace(/\.webp$/, '')), 'в кэше нет оформления ' + file);
  }
  for (const file of fs.readdirSync(path.join(root, 'assets'))) {
    if (!file.endsWith('.jpg')) continue;
    assert.ok(covers.has(file.replace(/\.jpg$/, '')), 'в кэше нет обложки ' + file);
  }
  assert.match(worker, /const VERSION = 'dt2-v16'/, 'не обновлена версия service worker');
});
