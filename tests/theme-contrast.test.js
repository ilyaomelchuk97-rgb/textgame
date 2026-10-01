const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const styles = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const skins = fs.readFileSync(path.join(root, 'src', 'skins.css'), 'utf8');
const themes = ['night', 'material', 'neon', 'terminal', 'parchment', 'ink', 'sunset', 'ice', 'oled'];

function blockFor(source, theme, skin) {
  const selector = skin
    ? `body\\[data-theme="${theme}"\\],\\s*\\.skin-demo\\[data-tp="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`
    : `body\\[data-theme="${theme}"\\]\\s*\\{([\\s\\S]*?)\\n\\}`;
  const match = new RegExp(selector).exec(source);
  assert.ok(match, `не найдены токены темы ${theme}`);
  return match[1];
}

function declaration(block, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`--${escaped}:\\s*([^;]+);`).exec(block);
  return match ? match[1].trim() : '';
}

function parseColor(value) {
  const color = String(value || '').trim();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3) digits = digits.split('').map(ch => ch + ch).join('');
    return [0, 2, 4].map(index => parseInt(digits.slice(index, index + 2), 16)).concat(1);
  }
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color);
  if (!rgb) return null;
  const parts = rgb[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
}

function colorStops(value) {
  const matches = String(value || '').match(/#[\da-f]{3}(?:[\da-f]{3})?|rgba?\([^)]+\)/gi) || [];
  return matches.map(parseColor).filter(Boolean);
}

function composite(foreground, background) {
  const alpha = foreground[3];
  return [0, 1, 2].map(index => Math.round(foreground[index] * alpha + background[index] * (1 - alpha))).concat(1);
}

function luminance(color) {
  const channels = color.slice(0, 3).map(channel => {
    const s = channel / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function themedData(id) {
  const base = blockFor(styles, id, false);
  const skin = blockFor(skins, id, true);
  const pageBg = parseColor(declaration(base, 'bg'));
  assert.ok(pageBg, `${id}: нужен сплошной --bg для статической проверки`);
  return { base, skin, pageBg };
}

test('foreground text and muted labels meet 4.5:1 on every theme base', () => {
  for (const id of themes) {
    const { base, pageBg } = themedData(id);
    for (const token of ['text', 'muted']) {
      const foreground = parseColor(declaration(base, token));
      assert.ok(foreground, `${id}: отсутствует --${token}`);
      const ratio = contrast(composite(foreground, pageBg), pageBg);
      assert.ok(ratio >= 4.5, `${id}: --${token} контраст ${ratio.toFixed(2)}:1`);
    }
  }
});

test('button text, muted labels and primary states meet 4.5:1 on each theme paint', () => {
  for (const id of themes) {
    const { skin, pageBg } = themedData(id);
    const buttonPaint = declaration(skin, 'sk-btn-paint');
    let buttonStops = colorStops(buttonPaint);
    if (!buttonStops.length) buttonStops = colorStops(declaration(skin, 'sk-btn-tint'));
    assert.ok(buttonStops.length, `${id}: не найден цвет обычной кнопки`);
    buttonStops = buttonStops.map(stop => composite(stop, pageBg));

    for (const token of ['sk-btn-text', 'sk-btn-muted']) {
      const foreground = parseColor(declaration(skin, token));
      assert.ok(foreground, `${id}: отсутствует --${token}`);
      for (const background of buttonStops) {
        const ratio = contrast(composite(foreground, background), background);
        assert.ok(ratio >= 4.5, `${id}: --${token} контраст ${ratio.toFixed(2)}:1 на кнопке`);
      }
    }

    const primaryPaint = declaration(skin, 'sk-primary-paint');
    let primaryStops = colorStops(primaryPaint);
    if (!primaryStops.length) primaryStops = colorStops(declaration(skin, 'sk-primary-tint'));
    assert.ok(primaryStops.length, `${id}: не найден цвет активной кнопки`);
    const primaryText = parseColor(declaration(skin, 'sk-primary-text'));
    assert.ok(primaryText, `${id}: отсутствует --sk-primary-text`);
    for (const background of primaryStops.map(stop => composite(stop, pageBg))) {
      const ratio = contrast(composite(primaryText, background), background);
      assert.ok(ratio >= 4.5, `${id}: primary-текст контраст ${ratio.toFixed(2)}:1`);
    }
  }
});

test('selected chip captions and parchment ghost buttons keep contextual contrast', () => {
  assert.match(skins, /body\[data-theme\] \.chip\.is-on \.chip__sub\s*\{\s*color:\s*var\(--sk-primary-text\)/);
  assert.match(skins, /body\[data-theme="parchment"\] \.screen--menu \.btn--ghost/);
  assert.match(skins, /body\[data-theme="parchment"\] \.footer-bar \.btn--ghost/);
});
