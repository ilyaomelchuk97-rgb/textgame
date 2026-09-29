const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src', 'engine.js'), 'utf8');

test('game tools are a fixed row between the title bar and the generated scene image', () => {
  const top = html.indexOf('class="game-topbar"');
  const tools = html.indexOf('class="game-tools"');
  const bar = html.indexOf('id="game-bar"');
  const image = html.indexOf('class="scene-media"');
  const panel = html.indexOf('id="panel"');
  assert.ok(top >= 0 && top < tools && tools < bar && bar < image && image < panel);
  assert.match(html, /id="game-tools" role="toolbar" aria-label="Инструменты игры"/);
  assert.equal((html.match(/id="game-bar"/g) || []).length, 1, 'ряд инструментов перемещён, а не продублирован');
  assert.match(css, /\.game-tools\s*\{[^}]*flex:\s*0 0 auto/);
  assert.match(css, /\.game-tools \.log-bar\s*\{\s*margin:\s*0/);
});

test('a speaking NPC gets a saved, clickable portrait and a fullscreen viewer', () => {
  assert.match(html, /id="npc-portrait-viewer"[^>]*role="dialog"[^>]*aria-modal="true"/);
  assert.ok(html.indexOf('id="scene-npc"') < html.indexOf('id="scene-text"'), 'карточка собеседника идёт первой в панели текста');
  assert.match(html, /id="npc-portrait-image"/);
  assert.match(app, /function renderSceneNpc\(host, game, turn, said\)/);
  assert.match(app, /renderSceneNpc\(npcEl, g, turn, said\)/);
  assert.match(app, /if \(line && record\) generateNpcPortrait\(game, record, avatar, true\)/);
  assert.match(app, /openNpcPortraitViewer\(url, npc, avatar\)/);
  assert.match(app, /closeNpcPortraitViewer\(\)/);
  assert.match(app, /portraitViewer && !portraitViewer\.hidden/);
  assert.match(css, /\.npc-portrait-viewer\[hidden\]\s*\{\s*display:\s*none/);
  assert.match(css, /\.npc-portrait-viewer__image/);
});

test('the AI specifies male or female NPCs and keeps gender consistent in memory and art prompts', () => {
  assert.match(engine, /"gender": "male \| female"/);
  assert.match(engine, /npc\.gender/);
  assert.match(engine, /function npcGender\(npc\)/);
  assert.match(engine, /gender: npcGender\(n\)/);
  assert.match(engine, /npcObject && \(npcGender\(npcObject\) === 'female' \? 'female woman' : 'male man'\)/);
  assert.match(app, /Gender is ' \+ gender\.id/);
  assert.match(app, /Clearly depict a female person/);
  assert.match(app, /Clearly depict a male person/);
});

test('standalone iPhone height uses the whole screen, but still shrinks for the keyboard', () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(app, /function isStandaloneDisplay\(\)/);
  assert.match(app, /navigator\.standalone === true/);
  assert.match(app, /display-mode: standalone/);
  assert.match(app, /function appViewportHeight\(\)/);
  assert.match(app, /if \(editing && visualHeight > 200\) return visualHeight/);
  assert.match(app, /fullScreenHeight/);
  assert.match(app, /function setupViewport\(\)[\s\S]*?appViewportHeight\(\)/);
  assert.match(css, /--safe-bottom:\s*env\(safe-area-inset-bottom/);
});
