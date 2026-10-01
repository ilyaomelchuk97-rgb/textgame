const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skins = fs.readFileSync(path.join(root, 'src', 'skins.css'), 'utf8');

function topLevelCommas(value) {
  let depth = 0;
  let quote = '';
  let commas = 0;
  for (const char of value) {
    if (quote) {
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) commas++;
  }
  return commas;
}

test('ice artwork stays in the correct background layer for generated buttons and cards', () => {
  const start = skins.indexOf('body[data-theme="ice"], .skin-demo[data-tp="ice"]');
  const end = skins.indexOf('/* наледь по кромке', start);
  assert.ok(start >= 0 && end > start, 'block variables for Ice were not found');
  const ice = skins.slice(start, end);
  for (const name of ['--sk-card-gloss', '--sk-btn-gloss', '--sk-primary-gloss']) {
    const match = new RegExp(name + '\\s*:\\s*([^;]+);').exec(ice);
    assert.ok(match, name + ' is missing from the Ice theme');
    assert.equal(topLevelCommas(match[1]), 0, name + ' must be one image layer so it does not shift the artwork slots');
  }
  assert.match(ice, /--sk-art-btn:\s*url\("\.\.\/assets\/themes\/ice-ui-button\.webp"\)/);
  assert.match(ice, /--sk-art-tex:\s*url\("\.\.\/assets\/themes\/ice-tex\.webp"\)/);
  assert.ok(fs.existsSync(path.join(root, 'assets/themes/ice-ui-button.webp')));
  assert.ok(fs.existsSync(path.join(root, 'assets/themes/ice-tex.webp')));

  assert.match(skins, /body\[data-theme\] \.btn:not\(\.btn--quiet\)[\s\S]*?background-image:\s*var\(--sk-btn-gloss\),\s*var\(--sk-art-btn\),\s*var\(--sk-art-tex\),\s*var\(--sk-btn-paint\)/);
  assert.match(skins, /body\[data-theme\] \.book-card,[\s\S]*?background-image:\s*var\(--sk-card-gloss\),\s*var\(--sk-art-tex\),\s*var\(--sk-card-paint\)/);
});
