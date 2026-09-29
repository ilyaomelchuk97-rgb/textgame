const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('hero portrait has a designed frame, an empty state, and a loading shimmer', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(app, /hero-sheet__portrait-frame/);
  assert.match(app, /hero-sheet__portrait-placeholder/);
  assert.match(app, /classList\.add\('is-loading'\)/);
  assert.match(css, /\.hero-sheet__portrait-frame\.is-empty/);
  assert.match(css, /\.hero-sheet__portrait-frame\.is-loading::after/);
});

test('every campaign gets a class-and-origin portrait with its own generation seed', () => {
  const engine = read('src/engine.js');
  const app = read('src/app.js');
  const html = read('index.html');
  assert.match(engine, /portraitSeed: portraitSeedFromId\(id\)/);
  assert.match(engine, /selected class\/profession/);
  assert.match(engine, /h\.originName \? `background/);
  assert.match(app, /seed: g\.hero\.portraitSeed/);
  assert.match(app, /if \(force \|\| !Number\.isFinite\(Number\(g\.hero\.portraitSeed\)\)/);
  assert.match(app, /State\.portraitRequestSeq/);
  assert.match(html, /id="game-hero-line"/);
});

test('game layout foregrounds a cinematic location frame and readable story card', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  const html = read('index.html');
  assert.match(html, /class="scene-media__caption"/);
  assert.match(html, /id="scene-place"/);
  assert.match(app, /scenePlace\.textContent = \(g\.scene && g\.scene\.place\)/);
  assert.match(css, /\.scene-media \{\s*flex: 0 0 clamp\(168px, 28vh, 248px\)/);
  assert.match(css, /#scene-text \.scene-text__body/);
});

test('campaign map is an open chronological route with a highlighted current node', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(app, /Open, chronological|Открытая, хронологическая тропа/);
  assert.match(app, /map-edge-glow/);
  assert.match(app, /map-node-group.*is-now/);
  assert.match(css, /\.map-edge\.is-travelled/);
  assert.match(css, /\.map-node-group\.is-now \.map-node-halo/);
  assert.match(css, /\.map-row\.is-now/);
});

test('dice outcomes have distinct critical and fumble treatments', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(app, /resultBox\.classList\.add\('is-fumble'\)/);
  assert.match(css, /\.dice-scene\.is-crit::before/);
  assert.match(css, /\.dice-scene\.is-fail \.die__face\[data-final="1"\]/);
  assert.match(css, /\.dice-result\.is-fumble/);
});

test('scenario covers and hero states use separate visual signals', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(app, /scenario-card__sigil/);
  assert.match(css, /\.scenario-card__sigil/);
  assert.match(app, /mech-chip__icon/);
  assert.match(app, /mech-chip__modifier/);
  assert.match(css, /\.mech-chip__turns/);
});

test('loading overlay contains a local, accessible skeleton landscape', () => {
  const html = read('index.html');
  const css = read('src/styles.css');
  assert.match(html, /class="loading-box" role="status" aria-live="polite" aria-busy="true"/);
  assert.match(html, /class="loading-skeleton" aria-hidden="true"/);
  assert.match(html, /loading-skeleton__ridge--front/);
  assert.match(css, /\.loading-skeleton::after/);
  assert.match(css, /@keyframes loadingSweep/);
});

test('image prompt receives the structured NPC in normal turns and saved scenes', () => {
  const api = read('src/api.js');
  const app = read('src/app.js');
  assert.match(api, /npcObject: parsed\.npcObject/);
  assert.match(app, /npcObject: turn\.npcObject/);
  assert.match(app, /npcObject: g\.scene && g\.scene\.npcObject/);
});

test('important NPCs get one saved portrait; other contacts keep initials and trust markers', () => {
  const app = read('src/app.js');
  const engine = read('src/engine.js');
  assert.match(app, /npc-gallery__portrait/);
  assert.match(app, /function npcNeedsPortrait/);
  assert.match(app, /seenCount\) >= 2/);
  assert.match(app, /npc\.portraitSeed = Number\(npc\.portraitSeed\) \|\| E\.rnd\.seed\(\)/);
  assert.match(app, /npc\.portrait = res\.url/);
  assert.match(app, /width: 512, height: 512/);
  assert.match(app, /State\.npcPortraitPending\[key\]/);
  assert.match(engine, /seenCount: 1/);
  assert.match(app, /npc-gallery__trust/);
});

test('journal chronicle reuses only saved frames from the current campaign', () => {
  const app = read('src/app.js');
  const engine = read('src/engine.js');
  assert.match(engine, /function campaignTimeline\(game\)/);
  assert.match(app, /campaign-chronicle/);
  assert.match(app, /chronicle-card__action/);
  assert.match(app, /chronicle-card__result/);
  assert.match(app, /String\(frame\.gameId\) === String\(game\.id\)/);
  assert.match(app, /Frames\.all\(game\.id\)\.then\(frames/);
});

test('inventory cards use inline SVG art and truthful item-kind badges', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(app, /function itemArtwork\(kind\)/);
  assert.match(app, /document\.createElementNS\(SVG_NS, tag\)/);
  assert.match(app, /КЛЮЧЕВОЙ/);
  assert.match(app, /РАСХОДНИК/);
  assert.match(app, /item-card__badge--/);
  assert.match(css, /\.item-card__art/);
  assert.match(css, /\.item-card__badge--key/);
});

test('hero sheet has an accessible seven-axis chart and keeps named numeric stat chips', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(app, /function heroStatChart\(hero\)/);
  assert.match(app, /Диаграмма семи характеристик/);
  assert.match(app, /aria-label': st\.name \+ ': ' \+ hh\.stats\[st\.id\]/);
  assert.match(app, /stat-grid stat-grid--chips/);
  assert.match(css, /\.stat-constellation__shape/);
});

test('map rows hydrate image previews from this game while preserving route markers', () => {
  const app = read('src/app.js');
  const css = read('src/styles.css');
  assert.match(app, /function hydrateMapFrames\(list, game\)/);
  assert.match(app, /map-row__thumb/);
  assert.match(app, /String\(frame\.gameId\) === String\(game\.id\)/);
  assert.match(app, /map-row__step/);
  assert.match(css, /\.map-row__thumb\.has-frame/);
  assert.match(css, /\.map-edge\.is-travelled/);
});

test('milestone seals render in the journal and final summary and survive in game data', () => {
  const app = read('src/app.js');
  const engine = read('src/engine.js');
  assert.match(engine, /function campaignSeals\(game\)/);
  assert.match(engine, /g\.seals = CAMPAIGN_SEAL_DEFS/);
  assert.match(app, /campaignSealsBlock\(g, 'journal'\)/);
  assert.match(app, /campaignSealsBlock\(g, 'epilogue'\)/);
  ['Первый шаг', 'Следопыт', 'Союзник', 'Находка', 'Шрам', 'Цель достигнута'].forEach(label => {
    assert.ok(engine.includes(label), 'нет печати ' + label);
  });
});
