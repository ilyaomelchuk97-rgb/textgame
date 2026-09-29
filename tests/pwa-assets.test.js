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

test('PWA precaches all menu sprites, theme artwork, cover images and transition die', () => {
  const critters = new Set(namesFromArray('CRITTER_IMAGES'));
  const themes = new Set(namesFromArray('THEME_IMAGES'));
  const covers = new Set(namesFromArray('COVER_IMAGES'));
  const homeScenes = new Set(namesFromArray('HOME_SCENE_IMAGES'));
  const shell = new Set(namesFromArray('SHELL'));

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
  const sceneFiles = fs.readdirSync(path.join(root, 'assets', 'home-scenes'));
  assert.equal(sceneFiles.filter(file => file.endsWith('.jpg')).length, 10, 'должно быть ровно 10 фоновых сцен');
  assert.match(worker, /\.\.\.HOME_SCENE_IMAGES\.map\(name => '\.\/assets\/home-scenes\/' \+ name \+ '\.jpg'\)/,
    'service worker должен precache-ить каждый фон');
  for (const file of sceneFiles) {
    if (!file.endsWith('.jpg')) continue;
    const name = file.replace(/\.jpg$/, '');
    assert.ok(homeScenes.has(name), 'фон не добавлен в precache: ' + file);
  }
  assert.ok(shell.has('./assets/dice-transition.png'), 'кубик перехода не попал в precache');
  const dice = fs.readFileSync(path.join(root, 'assets', 'dice-transition.png'));
  assert.equal(dice.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', 'ассет кубика не является PNG');
  assert.equal(dice[25], 6, 'у кубика должен быть alpha-канал');
  assert.match(worker, /const VERSION = 'dt2-v31'/, 'не обновлена версия service worker');
});
