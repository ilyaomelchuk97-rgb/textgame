const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const moduleSource = fs.readFileSync(path.join(root, 'src', 'online-adventure.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'styles.css'), 'utf8');
const build = fs.readFileSync(path.join(root, 'build.py'), 'utf8');
const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');

test('the open-world online adventure is a separate menu mode with AI and player-authored world setup', () => {
  assert.match(html, /id="open-online-adventure"/);
  assert.match(html, /id="screen-online"[^>]*hidden/);
  assert.match(html, /data-online-world-mode="ai"/);
  assert.match(html, /data-online-world-mode="custom"/);
  assert.match(html, /id="online-world-description"/);
  assert.match(html, /id="online-hero-name"/);
  assert.match(html, /id="online-hero-picker"/);
  assert.match(html, /id="online-hero-class"/);
  assert.match(html, /id="online-hero-race"/);
  assert.match(html, /id="online-hero-origin"/);
  assert.match(moduleSource, /API\.askGameMaster\(/);
  assert.match(moduleSource, /API\.generateHeroProfile\(/);
  assert.match(moduleSource, /E\.createGame\(/);
  assert.match(moduleSource, /function renderHeroPicker\(/);
  assert.match(moduleSource, /choiceOptions\(profile, 'classes', defaults\.classes\)/);
  assert.match(moduleSource, /classes\.find\(option => option\.id === picked\.classId\)/);
  assert.match(moduleSource, /API\.cloudPut\(/);
  assert.match(moduleSource, /API\.cloudGet\(/);
});

test('open world has a sizeable grid map, keyboard and touch movement, and a twenty-step main questline', () => {
  assert.match(moduleSource, /const MAP_W = 34, MAP_H = 24, VIEW_W = 13, VIEW_H = 9/);
  assert.match(moduleSource, /const MAIN_QUESTS = 20/);
  assert.match(moduleSource, /ArrowUp/);
  assert.match(moduleSource, /data-online-move/);
  assert.match(moduleSource, /questline: book\.quests/);
  assert.match(html, /id="online-map" role="grid"/);
  assert.match(html, /id="online-questline"/);
  assert.match(css, /\.online-map\s*\{[\s\S]*?display:\s*grid/);
  assert.match(css, /\.online-dpad\s*\{[\s\S]*?grid-template-columns/);
  assert.match(css, /\.online-dpad button\s*\{[\s\S]*?min-height:\s*44px/);
  assert.match(css, /@media \(max-width:\s*390px\)/);
});

test('turn-based combat uses opposing d20 rolls for both attacks, and a d20 check for healing', () => {
  assert.match(moduleSource, /const playerDie = E\.rollD20\(\), guardDie = E\.rollD20\(\)/);
  assert.match(moduleSource, /const enemyDie = E\.rollD20\(\), heroDie = E\.rollD20\(\)/);
  assert.match(moduleSource, /action === 'heal'[\s\S]*?const roll = E\.rollD20\(\)[\s\S]*?total >= 12/);
  assert.match(moduleSource, /battleLog\('Ответ врага: d20='/);
  assert.match(moduleSource, /data-battle-action/);
});

test('optional romance is adult-only, mutual, consent-gated, and fades to black', () => {
  assert.match(moduleSource, /age: Number\.isFinite\(age\) \? Math\.max\(18/);
  assert.match(moduleSource, /companion\.mutualInterest/);
  assert.match(moduleSource, /action === 'romance-confirm'[\s\S]*?companion\.intimacySceneSeen = true/);
  assert.match(moduleSource, /fade-to-black/);
  assert.match(moduleSource, /without graphic|без графичных деталей/);
  assert.match(moduleSource, /romance-confirm/);
});

test('the standalone build and PWA cache include the new online-mode module', () => {
  assert.match(html, /<script src="src\/online-adventure\.js"><\/script>/);
  assert.match(build, /"online-adventure\.js"/);
  assert.match(build, /online-adventure\\\.js/);
  assert.match(worker, /'\.\/src\/online-adventure\.js'/);
});

test('open world connects to AI generator for world seed, map biomes/landmarks, world art, and live GM actions, and menu removes ai-status label', () => {
  const appSource = fs.readFileSync(path.join(root, 'src', 'app.js'), 'utf8');
  const apiSource = fs.readFileSync(path.join(root, 'src', 'api.js'), 'utf8');
  const serverSource = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.doesNotMatch(html, /id="ai-status"/);
  assert.doesNotMatch(appSource, /Локальный мастер \(ИИ недоступен\)/);
  assert.match(serverSource, /fetchMagicStudio/);
  assert.match(serverSource, /fetchSubnp/);
  assert.match(serverSource, /hf:z-image-turbo/);
  assert.match(serverSource, /llm7Chat/);
  assert.match(serverSource, /kiloChat/);
  assert.match(apiSource, /llm7:default/);
  assert.match(apiSource, /subnp:magic/);
  assert.match(html, /id="online-ai-seed"/);
  assert.match(html, /id="online-world-art"/);
  assert.match(html, /id="online-ai-bar"/);
  assert.match(moduleSource, /function salvageBlueprint\(/);
  assert.match(moduleSource, /function generateWorldSeedIdea\(/);
  assert.match(moduleSource, /function renderWorldArt\(/);
  assert.match(moduleSource, /function askOnlineMasterAction\(/);
  assert.match(moduleSource, /API\.generateImage\(/);
});
