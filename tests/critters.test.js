/**
 * Тесты персонажей главного экрана (src/critters.js).
 * Проверяем, что фигур в отряде много, рисунки на месте, пары не повторяются
 * и что модуль не зависит от DOM при загрузке (важно для однофайловой сборки
 * и песочницы).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/critters.js');

// детали, по которым видно, что фигура нарисована, а не пустая заготовка
const PARTS = {
  knight:   ['art-steel', 'art-shield', 'art-star', 'art-plume', 'art-cloak', 'art-visor'],
  dragon:   ['art-dragon', 'art-wing', 'art-horn', 'art-tooth', 'art-claw', 'art-tail'],
  engineer: ['art-rig', 'art-plate', 'art-glow', 'art-visor'],
  cyber:    ['art-cyber', 'art-cloak', 'art-glowline', 'art-visor', 'art-hilt'],
  assassin: ['art-assassin', 'art-hood', 'art-scarf', 'art-hilt', 'art-visor'],
  mage:     ['art-robe', 'art-wood', 'art-glow', 'art-beard'],
  orc:      ['art-orc', 'art-hide', 'art-metal', 'art-tooth', 'art-ear'],
  pirate:   ['art-coat', 'art-hat', 'art-sash', 'art-skin', 'art-wood'],
  necro:    ['art-necro', 'art-bone', 'art-glow', 'art-blade'],
  golem:    ['art-stone', 'art-glow', 'art-glowline'],
  wolf:     ['art-wolf', 'art-fur', 'art-jaw', 'art-tooth'],
  drone:    ['art-metal', 'art-blade', 'art-glow', 'art-glowline'],
  ghost:    ['art-ghost', 'art-eye'],
  zombie:   ['art-zombie', 'art-rot', 'art-skin', 'art-eye']
};

test('модуль героев экспортирует рисунки, роли и отряд', () => {
  assert.strictEqual(typeof C.mount, 'function');
  assert.ok(Array.isArray(C.ROLES), 'ROLES — не список');
  assert.ok(C.ROSTER.length >= 10, 'фигур в отряде меньше десяти: ' + C.ROSTER.length);
  assert.strictEqual(C.ROLES.length, C.ROSTER.length);
  assert.deepStrictEqual(new Set(C.ROLES).size, C.ROLES.length, 'есть повторяющиеся роли');
});

test('в отряде есть и герои, и монстры', () => {
  const heroes = C.ROSTER.filter(r => r.kind === 'hero');
  const beasts = C.ROSTER.filter(r => r.kind !== 'hero');
  assert.ok(heroes.length >= 5, 'героев мало: ' + heroes.length);
  assert.ok(beasts.length >= 5, 'монстров мало: ' + beasts.length);
  C.ROSTER.forEach(r => {
    assert.ok(r.name && r.name.length > 2, 'у фигуры ' + r.id + ' нет имени');
    assert.ok(r.line && r.line.length > 3, 'у фигуры ' + r.id + ' нет реплики');
    assert.match(r.id, /^[a-z]+$/, 'роль ' + r.id + ' не похожа на метку');
  });
});

test('у всех 14 человечков подключён локальный sprite sheet', () => {
  assert.strictEqual(C.ROSTER.length, 14, 'ожидалось 14 бегущих персонажей');
  C.ROSTER.forEach(r => {
    assert.strictEqual(r.sprite, r.id + '-run.webp', r.id + ': нет имени спрайта');
    const file = path.join(__dirname, '..', 'assets', 'critters', r.sprite);
    assert.ok(fs.existsSync(file), r.id + ': sprite sheet не найден: ' + file);
    assert.ok(fs.statSync(file).size > 1000, r.id + ': sprite sheet пустой');
  });
});

// каменный голем, дрон и призрак не шагают, а висят в воздухе — им кадры ног не нужны
const HOVERS = ['golem', 'drone', 'ghost'];

test('каждая фигура нарисована: детали на месте и фигура двигается', () => {
  C.ROSTER.forEach(r => {
    const svg = r.svg();
    assert.ok(svg.includes('<svg'), r.id + ': это не svg');
    assert.ok(/class="bob"/.test(svg), r.id + ': фигура не двигается — нет группы покачивания');
    if (!HOVERS.includes(r.id)) {
      assert.ok(svg.includes('legs--a') && svg.includes('legs--b'), r.id + ': нет двух кадров шага');
    }
    const parts = PARTS[r.id] || [];
    assert.ok(parts.length >= 2, r.id + ': тест не знает деталей фигуры — допишите их');
    parts.forEach(part => assert.ok(svg.includes(part), r.id + ': нет детали ' + part));
    assert.ok(svg.length > 400, r.id + ': рисунок подозрительно пустой');
  });
});

test('рыцарь и дракоша остались узнаваемыми', () => {
  assert.ok(C.knightSvg().includes('art-shield') && C.knightSvg().includes('art-visor'));
  assert.ok(/art-cheek/.test(C.dragonSvg()), 'нет румянца — а он смешной');
  assert.strictEqual(C.svgFor('knight'), C.knightSvg());
  assert.strictEqual(C.svgFor('dragon'), C.dragonSvg());
  assert.strictEqual(C.svgFor('такого-нет'), '');
});

test('пара на главном экране всегда новая: герой и монстр, без повторов', () => {
  let previous = null;
  const seen = new Set();
  for (let i = 0; i < 30; i++) {
    // пары передаём то фигурами, то их метками: модуль понимает оба вида
    const pair = C.pickPair(i % 2 ? previous : (previous || []).map(p => p.id));
    assert.strictEqual(pair.length, 2, 'в паре не двое');
    assert.notStrictEqual(pair[0].kind, pair[1].kind, 'в паре две одинаковые роли: ' + pair.map(p => p.kind));
    const ids = pair.map(p => p.id);
    assert.strictEqual(new Set(ids).size, 2, 'фигура повторилась внутри пары');
    if (previous) {
      const before = previous.map(p => p.id);
      assert.ok(ids.every(id => !before.includes(id)), 'пара повторила прошлую: ' + ids + ' vs ' + before);
    }
    ids.forEach(id => seen.add(id));
    previous = pair;
  }
  assert.ok(seen.size >= 6, 'за 30 заходов показано мало разных фигур: ' + seen.size);
});

test('по метке фигуры отдаются имя, реплика и рисунок', () => {
  C.ROLES.forEach(id => {
    const info = C.infoFor(id);
    assert.ok(info && info.name, 'нет описания для ' + id);
    assert.ok(C.svgFor(id).includes('<svg'), 'нет рисунка для ' + id);
  });
});

test('в разметке нет внешних ссылок — работает без сети', () => {
  C.ROSTER.forEach(r => {
    const svg = r.svg();
    assert.ok(!/https?:|src=|href=/.test(svg), r.id + ': есть внешний ресурс');
  });
});

test('mount требует контейнер и не падает без него', () => {
  assert.strictEqual(C.mount(null), null);
  assert.strictEqual(C.mount(undefined), null);
});

test('при уменьшении движения случайная пара остаётся видна и не склеивается после stop/start', () => {
  const oldWindow = global.window;
  const elements = [];
  class FakeClassList {
    constructor(value) { this.values = new Set(String(value || '').split(/\\s+/).filter(Boolean)); }
    add(...items) { items.forEach(item => this.values.add(item)); }
    remove(...items) { items.forEach(item => this.values.delete(item)); }
    contains(item) { return this.values.has(item); }
  }
  class FakeElement {
    constructor(classes, role) {
      this.classList = new FakeClassList(classes);
      this.dataset = { role };
      this.style = { setProperty(name, value) { this[name] = value; } };
      this.listeners = {};
    }
    addEventListener(name, fn) { this.listeners[name] = fn; }
  }
  class FakeContainer {
    constructor() { this.dataset = {}; this.__dtCritters = null; this.nodes = []; }
    set innerHTML(value) {
      this.nodes = Array.from(String(value).matchAll(/<div class="([^"]+)" data-role="([^"]+)" style="[^"]*">/g), m => {
        const el = new FakeElement(m[1], m[2]);
        elements.push(el);
        return el;
      });
    }
    querySelector(selector) {
      const match = /data-role="([^"]+)"/.exec(selector);
      return match ? this.nodes.find(el => el.dataset.role === match[1]) || null : null;
    }
  }
  try {
    global.window = { matchMedia: () => ({ matches: true }) };
    const api = C.mount(new FakeContainer());
    assert.ok(api && api.reduced);
    api.start();
    api.stop();
    assert.strictEqual(elements.length, 2);
    assert.ok(elements.every(el => el.classList.contains('critter--still')));
    assert.ok(elements.some(el => el.style.left === '12px' && el.style.right === 'auto'));
    assert.ok(elements.some(el => el.style.left === 'auto' && el.style.right === '12px'));
    assert.ok(elements.every(el => el.style.transform === 'none'));
  } finally {
    if (oldWindow === undefined) delete global.window;
    else global.window = oldWindow;
  }
});
