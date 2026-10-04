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

test('hero creator no longer shows legacy or previous-pick notices, while saved choices remain editable', () => {
  assert.doesNotMatch(html, /class="hero-legacy"/);
  assert.doesNotMatch(html, /class="hint hint--pick"/);
  assert.doesNotMatch(app, /hero-legacy|hero-pick-note|hero-pick-change|renderHeroPickRow|heroStepsOpen/);
  assert.match(app, /const pick = loadHeroPick\(\)/);
  assert.match(app, /\$\('#section-class'\)\.hidden = !p\.showClass \|\| oneClass/);
  assert.match(app, /\$\('#section-race'\)\.hidden = !p\.showRace \|\| oneRace/);
  assert.match(app, /\$\('#section-origin'\)\.hidden = !p\.showOrigin \|\| oneOrigin/);
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

test('text panel has the same height as image block, smaller text size, hero portrait wardrobe, and 7-second intimate scene popup', () => {
  assert.match(css, /\.panel\s*\{\s*flex:\s*0 0 clamp\(168px,\s*28vh,\s*248px\);\s*height:\s*clamp\(168px,\s*28vh,\s*248px\)/);
  assert.match(css, /#scene-text \.scene-text__body\s*\{[\s\S]*?font-size:\s*calc\(13px \* var\(--scale-text,\s*1\)\)/);
  assert.match(html, /id="hero-portrait-viewer"/);
  assert.match(html, /id="hero-wardrobe"/);
  assert.match(html, /id="intimate-scene-popup"/);
  assert.match(app, /function openHeroPortraitViewer\(/);
  assert.match(app, /function applyHeroOutfitAndRedraw\(/);
  assert.match(app, /function showIntimateSceneIllustration\(/);
  assert.match(engine, /const INTIMATE_ILLUSTRATION_MS = 7000/);
  assert.match(engine, /function ensureIntimateOption\(/);
  assert.match(engine, /function dressHero\(/);
});

test('encountered characters distinguish male vs girl/female, use Russian gendered declensions, and allow intimate scenes for man+girl and girl+girl', () => {
  const E = require('../src/engine.js');
  // 1) Отличаем мужчину и девушку при встрече в мире
  assert.equal(E.npcGender({ name: 'Марта-знахарка' }), 'female');
  assert.equal(E.npcGender({ name: 'жрица Ирма' }), 'female');
  assert.equal(E.npcGender({ name: 'техник Сола' }), 'female');
  assert.equal(E.npcGender({ name: 'врач Ханна' }), 'female');
  assert.equal(E.npcGender({ name: 'бармен Ольга' }), 'female');
  assert.equal(E.npcGender({ name: 'Косой Ленн' }), 'male');
  assert.equal(E.npcGender({ name: 'старик Ольгерд' }), 'male');
  assert.equal(E.npcGender({ name: 'Стражник Гром' }), 'male');

  // 2) Склонения и обращения: к мужчинам — как к мужчинам, к девушкам — как к женщинам
  const femaleForms = E.npcForms({ name: 'Марта-знахарка', gender: 'female' });
  assert.equal(femaleForms.label, 'Девушка');
  assert.equal(femaleForms.name.gen, 'Марты-знахарки');
  assert.equal(femaleForms.name.dat, 'Марте-знахарке');
  assert.equal(femaleForms.name.acc, 'Марту-знахарку');
  assert.equal(femaleForms.name.ins, 'Мартой-знахаркой');
  assert.equal(femaleForms.pronoun.acc, 'её');
  assert.equal(femaleForms.verbs.yielded, 'уступила');

  const maleForms = E.npcForms({ name: 'Косой Ленн', gender: 'male' });
  assert.equal(maleForms.label, 'Мужчина');
  assert.equal(maleForms.name.gen, 'Косого Ленна');
  assert.equal(maleForms.name.dat, 'Косому Ленну');
  assert.equal(maleForms.name.acc, 'Косого Ленна');
  assert.equal(maleForms.name.ins, 'Косым Ленном');
  assert.equal(maleForms.pronoun.acc, 'его');
  assert.equal(maleForms.verbs.yielded, 'уступил');

  // 3) Постельные сцены: у мужчины с девушкой и у девушки с девушкой (и у девушки с мужчиной), но не мужчина с мужчиной
  assert.equal(E.canHaveIntimateScene('male', 'female'), true);
  assert.equal(E.canHaveIntimateScene('female', 'female'), true);
  assert.equal(E.canHaveIntimateScene('female', 'male'), true);
  assert.equal(E.canHaveIntimateScene('male', 'male'), false);

  const maleHeroGame = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', heroGender: 'male', classId: 'warrior' });
  const turnWithGirl = {
    scene: 'В таверне навстречу выходит жрица Ирма и хранит ключ от ворот.',
    npc: 'жрица Ирма',
    options: [
      { id: 'o0', text: 'Убедить словом', stat: 'cha', difficulty: 'medium', dc: 12 },
      { id: 'o1', text: 'Прокрасться мимо', stat: 'agi', difficulty: 'hard', dc: 15 },
      { id: 'o2', text: 'Осмотреть зал', stat: 'per', difficulty: 'medium', dc: 11 }
    ]
  };
  E.ensureIntimateOption(maleHeroGame, turnWithGirl);
  assert.equal(turnWithGirl.options[0].kind, 'intimate');
  assert.equal(turnWithGirl.options[0].dc, 5);
  assert.match(turnWithGirl.options[0].text, /с жрицей Ирмой \(♀ девушка\) — соблазнить её/);

  const turnWithMan = {
    scene: 'Дорогу преграждает угрюмый Стражник Гром.',
    npc: 'Стражник Гром',
    options: [
      { id: 'o0', text: 'Дать отпор', stat: 'str', difficulty: 'medium', dc: 12 },
      { id: 'o1', text: 'Обойти пост', stat: 'agi', difficulty: 'medium', dc: 12 },
      { id: 'o2', text: 'Поговорить', stat: 'cha', difficulty: 'medium', dc: 12 }
    ]
  };
  E.ensureIntimateOption(maleHeroGame, turnWithMan);
  assert.notEqual(turnWithMan.options[0].kind, 'intimate', 'у мужчины с мужчиной постельной сцены нет');

  const femaleHeroGame = E.createGame({ scenarioId: 'asgeld', heroName: 'Элиза', heroGender: 'female', classId: 'diplomat' });
  const girlWithGirlTurn = {
    scene: 'У алтаря ждёт жрица Ирма.',
    npc: 'жрица Ирма',
    options: [
      { id: 'o0', text: 'Попросить совет', stat: 'cha', difficulty: 'medium', dc: 12 },
      { id: 'o1', text: 'Изучить знаки', stat: 'int', difficulty: 'medium', dc: 12 },
      { id: 'o2', text: 'Осмотреться', stat: 'per', difficulty: 'medium', dc: 12 }
    ]
  };
  E.ensureIntimateOption(femaleHeroGame, girlWithGirlTurn);
  assert.equal(girlWithGirlTurn.options[0].kind, 'intimate', 'у девушки с девушкой доступна постельная сцена');
  assert.match(girlWithGirlTurn.options[0].text, /с жрицей Ирмой \(♀ девушка\) — соблазнить её/);
});


