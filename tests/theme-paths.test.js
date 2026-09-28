const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skins = fs.readFileSync(path.join(root, 'src', 'skins.css'), 'utf8');
const build = fs.readFileSync(path.join(root, 'build.py'), 'utf8');

test('фактуры тем загружаются из modular CSS и встраиваются в game.html', () => {
  const urls = Array.from(skins.matchAll(/url\("(\.\.\/assets\/themes\/[^\"]+)"\)/g), m => m[1]);
  assert.ok(urls.length > 0, 'в CSS остались тематические изображения');
  for (const url of urls) {
    const asset = path.resolve(root, 'src', url);
    assert.ok(fs.existsSync(asset), 'не найден ресурс по URL из src/skins.css: ' + url);
  }
  assert.ok(!/url\("assets\/themes\//.test(skins), 'в CSS нет путей, которые ошибочно ищутся внутри /src/');
  assert.ok(build.includes('"../assets/themes/%s" % art.name'), 'сборка обрабатывает относительные пути тем');
});
