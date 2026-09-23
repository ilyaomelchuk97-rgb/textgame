/**
 * Тесты игровой логики v3 (Node, без зависимостей).
 * Запуск: npm test      или      node --test tests/
 */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/engine.js');

/* ---------------------------------------------------------- */
/* Кубики: честный d20, крит, преимущество                    */
/* ---------------------------------------------------------- */
test('d20 всегда в диапазоне 1..20', () => {
  for (let i = 0; i < 2000; i++) {
    const r = E.rollD20();
    assert.ok(Number.isInteger(r) && r >= 1 && r <= 20, 'плохой бросок: ' + r);
  }
});

test('вероятность успеха считается честно', () => {
  assert.strictEqual(E.successChance(0, 11), 0.5);   // 11..20 → 10/20
  assert.strictEqual(E.successChance(5, 11), 0.75);  // 6..20 → 15/20
  assert.strictEqual(E.successChance(30, 5), 0.95);  // потолок
  assert.strictEqual(E.successChance(-30, 30), 0.05); // пол
  assert.ok(E.successChance(0, 11, true) > E.successChance(0, 11), 'преимущество повышает шанс');
  assert.ok(E.successChance(0, 11, true) <= 0.97, 'преимущество не даёт 100%');
});

test('крит и провал важнее суммы (20 и 1)', () => {
  const orig = Math.random;
  try {
    Math.random = () => 0.999999;
    const crit = E.resolveCheck({ stat: 'str', dc: 30, bonus: 1 });
    assert.strictEqual(crit.outcome, 'crit');
    assert.strictEqual(crit.roll, 20);
    Math.random = () => 0;
    const fumble = E.resolveCheck({ stat: 'str', dc: 1, bonus: 9 });
    assert.strictEqual(fumble.outcome, 'fumble');
    assert.strictEqual(fumble.roll, 1);
  } finally { Math.random = orig; }
});

test('преимущество бросает два d20 и берёт лучший', () => {
  const res = E.resolveCheck({ stat: 'agi', dc: 11, bonus: 0, advantage: true });
  assert.strictEqual(res.rolls.length, 2);
  assert.strictEqual(res.roll, Math.max(...res.rolls));
  assert.strictEqual(res.advantage, true);
  assert.strictEqual(res.total, res.roll + res.mod);
});

test('исход проверки согласован с dc и модификатором', () => {
  for (let i = 0; i < 300; i++) {
    const r = E.resolveCheck({ stat: 'wit', dc: 11, bonus: 2 });
    if (r.roll === 20) assert.strictEqual(r.outcome, 'crit');
    else if (r.roll !== 1) assert.strictEqual(r.outcome, r.total >= r.dc ? 'success' : 'fail');
    assert.ok(E.OUTCOME_LABEL[r.outcome], 'есть подпись исхода');
    assert.strictEqual(E.probabilityLabel(0, 11), '50%');
  }
});

/* ---------------------------------------------------------- */
/* Статы, классы, расы, происхождение                         */
/* ---------------------------------------------------------- */
test('характеристик стало семь', () => {
  assert.strictEqual(E.STATS.length, 7);
  assert.strictEqual(E.STAT_IDS.length, 7);
  ['str', 'agi', 'con', 'int', 'per', 'wit', 'cha'].forEach(id => {
    assert.ok(E.STAT_IDS.includes(id), 'нет характеристики ' + id);
    assert.ok(E.statById(id).name, 'нет названия у ' + id);
  });
});

test('статы складываются из класса, расы и происхождения', () => {
  const cls = E.CLASSES[0], race = E.RACES[0], origin = E.ORIGINS[0];
  const stats = E.makeStats({ classId: cls.id, raceId: race.id, originId: origin.id });
  E.STAT_IDS.forEach(id => {
    const expected = E.BASE_STAT + (cls.bonus[id] || 0) + (race.bonus[id] || 0) + (origin.bonus[id] || 0);
    assert.strictEqual(stats[id], expected, 'не сходится ' + id);
    assert.ok(stats[id] >= 0, 'отрицательная характеристика ' + id);
  });
});

test('здоровье зависит от телосложения и класса, но не ниже 8', () => {
  const weak = E.makeStats({ classId: 'scholar', raceId: 'human', originId: 'streets' });
  const strong = E.makeStats({ classId: 'warrior', raceId: 'beast', originId: 'soldier' });
  const hpWeak = E.maxHpFor({ classId: 'scholar', stats: weak });
  const hpStrong = E.maxHpFor({ classId: 'warrior', stats: strong });
  assert.ok(hpStrong > hpWeak, 'воин крепче учёного');
  E.STAT_IDS.forEach(() => {});
  assert.ok(E.maxHpFor({ classId: 'scholar', stats: { con: 0 } }) >= 8);
});

test('у каждой из восьми рас есть бонус, черта и текст для сеттинга', () => {
  assert.strictEqual(E.RACES.length, 8);
  const ids = E.RACES.map(r => r.id);
  assert.strictEqual(new Set(ids).size, ids.length, 'дубликаты рас');
  E.RACES.forEach(r => {
    assert.ok(r.title && r.icon && r.trait, 'раса без описания: ' + r.id);
    const plus = Object.keys(r.bonus).reduce((n, k) => n + Math.max(0, r.bonus[k]), 0);
    assert.ok(plus >= 1, 'нет положительного бонуса у ' + r.id);
    assert.ok(plus > Object.keys(r.bonus).reduce((n, k) => n + Math.min(0, r.bonus[k]), 0), 'раса не должна быть сплошным штрафом');
    assert.ok(E.raceFlavor(r, 'fantasy'), 'нет fantasy-текста у ' + r.id);
    assert.ok(E.raceFlavor(r, 'scifi'), 'нет scifi-текста у ' + r.id);
  });
  assert.notStrictEqual(E.raceFlavor(E.RACES[0], 'fantasy'), E.raceFlavor(E.RACES[0], 'scifi'));
});

test('у каждого из восьми происхождений есть бонус, предмет и зацепка', () => {
  assert.strictEqual(E.ORIGINS.length, 8);
  E.ORIGINS.forEach(o => {
    assert.ok(o.title && o.icon && o.item && o.hook, 'неполное происхождение: ' + o.id);
    assert.ok(Object.keys(o.bonus).length >= 1, 'нет бонуса у ' + o.id);
  });
});

test('у классов есть рабочие умения и они складываются в объект героя', () => {
  assert.strictEqual(E.CLASSES.length, 6);
  E.CLASSES.forEach(c => {
    const a = E.abilityById(c.ability);
    assert.ok(a && a.id === c.ability, 'нет умения у класса ' + c.id);
    assert.ok(['heal', 'bless', 'advantage'].includes(a.kind), 'странный тип умения ' + a.kind);
    const ability = E.makeAbility(c.id);
    assert.strictEqual(ability.ready, true);
    assert.strictEqual(ability.cooldown, 0);
    assert.ok(ability.name && ability.desc);
  });
});

test('сложность переводится в полосы и сдвигается «опасностью» мира', () => {
  assert.strictEqual(E.difficultyById('deadly').dc, 17);
  assert.strictEqual(E.difficultyById('нет-такого').id, 'medium');
  assert.strictEqual(E.difficultyForDc(8).id, 'easy');
  assert.strictEqual(E.difficultyForDc(11).id, 'medium');
  assert.strictEqual(E.difficultyForDc(15).id, 'hard');
  assert.strictEqual(E.difficultyForDc(20).id, 'deadly');
  assert.strictEqual(E.shiftDc(11, 'soft'), 9);
  assert.strictEqual(E.shiftDc(11, 'normal'), 11);
  assert.strictEqual(E.shiftDc(11, 'harsh'), 13);
  assert.strictEqual(E.shiftDc(19, 'harsh'), 20, 'верхняя граница');
  assert.strictEqual(E.shiftDc(6, 'soft'), 5, 'нижняя граница');
  assert.strictEqual(E.DANGER_LEVELS.length, 3);
});

/* ---------------------------------------------------------- */
/* Режимы: случайные миры, игры, свой мир                     */
/* ---------------------------------------------------------- */
test('подборка сценариев не повторяется и не пустая', () => {
  for (let i = 0; i < 30; i++) {
    const set = E.randomScenarioSet();
    assert.ok(set.length >= 2 && set.length <= E.SCENARIOS.length);
    const ids = set.map(s => s.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'дубликаты в подборке');
    set.forEach(s => assert.ok(s.title && s.opening && s.cover));
  }
});

test('режимы-игры оформлены: Азерот, Найт-Сити, Рунитерра и «своя игра»', () => {
  assert.strictEqual(E.GAME_WORLDS.length, 4);
  ['azeroth', 'nightcity', 'runeterra', 'mygame'].forEach(id => {
    const w = E.GAME_WORLDS.find(x => x.id === id);
    assert.ok(w, 'нет режима ' + id);
    assert.ok(w.title && w.cover, 'неполный режим ' + id);
    if (!w.customGame) assert.ok(w.opening && w.goal, 'нет вступления у ' + id);
    assert.ok(w.setting && w.artStyle && Array.isArray(w.palette), 'нет оформления у ' + id);
  });
  const mine = E.GAME_WORLDS.find(w => w.id === 'mygame');
  assert.strictEqual(mine.customGame, true, '«своя игра» должна быть кастомной');
  assert.strictEqual(mine.cover, E.CUSTOM_SCENARIO.cover, 'у «своей игры» та же обложка');
  assert.strictEqual(E.scenarioById('custom').id, 'custom', 'конструктор мира доступен по своему id');
  assert.strictEqual(E.scenarioById('нет-такого').id, E.SCENARIOS[0].id, 'битый id не ломает игру');
  const set = E.randomScenarioSet(5);
  assert.ok(!set.some(s => s.id === 'mygame'), '«своя игра» не попадает в случайную подборку');
});

test('настройки своего мира: пустой шаблон, промпт и разбор ответа', () => {
  const empty = E.emptyWorldConfig();
  assert.deepStrictEqual(empty.ingredients, []);
  assert.strictEqual(empty.danger, 'normal');
  assert.ok(E.WORLD_OPTIONS.genres.length >= 4 && E.WORLD_OPTIONS.tones.length >= 4);
  assert.ok(E.WORLD_OPTIONS.places.length >= 4 && E.WORLD_OPTIONS.ingredients.length >= 4);
  assert.ok(E.OWN_ROLES.length >= 6);

  const prompt = E.buildWorldPrompt({
    title: '', genre: 'Кибер-вестерн', tone: 'мрачный', place: 'город под куполом',
    goal: 'найти брата', ingredients: ['песчаные бури', 'дроны'], danger: 'harsh',
    role: 'Шпион', extra: 'без романтики'
  }, E.SCENARIOS[0]);
  assert.ok(prompt.includes('Кибер-вестерн') && prompt.includes('песчаные бури'));
  const harsh = E.DANGER_LEVELS.find(d => d.id === 'harsh');
  assert.ok(prompt.includes(harsh.title), 'опасность попадает в промпт');
  assert.ok(prompt.includes('без романтики') && prompt.includes('Шпион'));
  assert.ok(/JSON/.test(prompt) && prompt.includes('imagePrompt'), 'промпт требует JSON-контракт');
  assert.ok(E.buildWorldPrompt(null).length > 50, 'пустой конфиг тоже даёт промпт');

  const parsed = E.parseWorldResponse('```json\n{"title":"Мор Гнева","goal":"выжить",' +
    '"opening":"Ты стоишь на пирсе.","chapter":"Глава 1","npc":"Старик Хэм, пахнет рыбой",' +
    '"imagePrompt":"rainy pier at night, lantern light","options":[{"text":"Идти в порт","stat":"per","difficulty":"easy"}]}\n```');
  assert.strictEqual(parsed.ok, true);
  assert.strictEqual(parsed.title, 'Мор Гнева');
  assert.strictEqual(parsed.chapter, 'Глава 1');
  assert.ok(parsed.npc.includes('Хэм'));
  assert.strictEqual(parsed.options.length, 1);
  assert.strictEqual(E.parseWorldResponse('что-то не то').ok, false);
  assert.strictEqual(E.parseWorldResponse('{}').ok, false);
});

test('тип фона определяется по тексту сцены', () => {
  const cases = [
    ['Ты входишь в заброшенную станцию, шлюз шипит', 'space'],
    ['Неоновая улица тонет в дожде, рекламные щиты мигают', 'city'],
    ['Развалины храма, алтарь разрушен', 'ruins'],
    ['Тёмная пещера, в шахте капает вода', 'cave'],
    ['Берег моря, солёный ветер', 'sea'],
    ['Пустыня и песчаные дюны до горизонта', 'desert'],
    ['Чаща леса, стволы в тумане', 'forest'],
    ['Снег и лёд скрипят под сапогами', 'snow'],
    ['Тесный трактир, огонь в очаге', 'interior']
  ];
  cases.forEach(([text, kind]) => assert.strictEqual(E.sceneKindFromText(text), kind, text));
  assert.strictEqual(E.sceneKindFromText(''), 'forest');
  assert.strictEqual(E.sceneKindFromText(null), 'forest');
  assert.ok(E.fallbackImagePrompt('forest', E.SCENARIOS[0]).length > 8);
});

/* ---------------------------------------------------------- */
/* Создание игры                                              */
/* ---------------------------------------------------------- */
test('новая игра v3 создаётся корректно', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: '  Кай  ', classId: 'rogue', raceId: 'beast', originId: 'smuggler' });
  assert.strictEqual(g.schema, E.SCHEMA_VERSION);
  assert.strictEqual(g.hero.name, 'Кай');
  assert.strictEqual(g.hero.classId, 'rogue');
  assert.strictEqual(g.hero.raceId, 'beast');
  assert.strictEqual(g.hero.originId, 'smuggler');
  assert.ok(g.hero.raceName && g.hero.originName);
  assert.strictEqual(Object.keys(g.hero.stats).length, 7);
  assert.strictEqual(g.hero.hp, g.hero.maxHp);
  assert.ok(g.hero.inventory.includes(E.originById('smuggler').item));
  assert.strictEqual(g.hero.hooks.length, 2);
  assert.ok(g.hero.ability && g.hero.ability.ready);
  assert.strictEqual(g.turn, 0);
  assert.ok(g.goal && g.cover);
});

test('имя героя чистится и обрезается, пустое — заменяется', () => {
  const g = E.createGame({ scenarioId: 'helios', heroName: '   ', classId: 'mage' });
  assert.strictEqual(g.hero.name, 'Безымянный');
  const long = E.createGame({ scenarioId: 'helios', heroName: 'Ы'.repeat(80), classId: 'mage' });
  assert.strictEqual(long.hero.name.length, 24);
});

test('свой мир: название берётся из введённой игры, база сохраняется', () => {
  const g = E.createGame({
    scenarioId: 'mygame', heroName: 'Рэй', classId: 'mage',
    worldConfig: { gameName: 'Ведьмак 3', genre: 'фэнтези', danger: 'harsh', ingredients: ['война'] }
  });
  assert.strictEqual(g.title, 'Ведьмак 3');
  assert.strictEqual(g.scenarioBase, 'mygame');
  assert.strictEqual(g.worldConfig.gameName, 'Ведьмак 3');
  assert.strictEqual(g.worldConfig.danger, 'harsh');
  assert.strictEqual(g.worldConfig.ingredients[0], 'война');
  assert.strictEqual(g.cover, E.CUSTOM_SCENARIO.cover);
});

test('игра в духе известной игры: режим подставляется как основа мира', () => {
  const wow = E.GAME_WORLDS.find(w => w.id === 'azeroth');
  const g = E.createGame({ scenarioId: 'azeroth', heroName: 'Тор', classId: 'warrior', raceId: 'beast', originId: 'soldier' });
  assert.strictEqual(g.scenarioBase, 'azeroth');
  assert.ok(g.goal.includes(wow.goal.slice(0, 6)) || g.goal.length > 5);
  assert.ok(wow.imagePrompts.length >= 2, 'у режима есть заготовки картинок');
});

/* ---------------------------------------------------------- */
/* Разбор ответов ИИ                                          */
/* ---------------------------------------------------------- */
test('JSON достаётся из грязного ответа модели', () => {
  const data = E.extractJsonObject('Вот сцена:\n{"scene":"Ты идёшь.","chapter":"Лес"}\nСпасибо!');
  assert.strictEqual(data.scene, 'Ты идёшь.');
  assert.strictEqual(data.chapter, 'Лес');
  assert.strictEqual(E.extractJsonObject('совсем не json'), null);
});

test('битый JSON не ломает парсер', () => {
  assert.strictEqual(E.parseGmResponse('{"scene": ').ok, false);
  assert.strictEqual(E.parseGmResponse('').ok, false);
  assert.strictEqual(E.parseGmResponse(null).ok, false);
});

test('варианты нормализуются: статы, сложность, обрезка', () => {
  const opt = E.sanitizeOption({ text: '  Прыгнуть через  провал ' + 'x'.repeat(300), stat: 'нет-такой', difficulty: 'нет-такой' }, 0);
  assert.ok(opt.text.length <= 160 && !/ {2}/.test(opt.text));
  assert.ok(E.STAT_IDS.includes(opt.stat), 'стат приведён к известному');
  assert.ok(['easy', 'medium', 'hard', 'deadly'].includes(opt.difficulty), 'сложность из списка');
  assert.ok(opt.dc >= 5 && opt.dc <= 20);
  assert.strictEqual(E.sanitizeOption({ text: 'Взломать замок', dc: 99 }, 0).dc, 20, 'dc не выходит за границы');
  assert.strictEqual(E.sanitizeOption({ text: 'Идти вперёд', dc: '2' }, 0).dc, 5);
  // без подсказки от модели сложность выбирается сама, но всегда из допустимых
  const auto = E.sanitizeOption({ text: 'Идти' }, 0);
  const allowed = E.DIFFICULTY.map(d => d.dc);
  assert.ok(allowed.includes(auto.dc), 'случайная сложность вне полос: ' + auto.dc);
  assert.strictEqual(auto.difficulty, E.difficultyForDc(auto.dc).id, 'полоса согласована с dc');
  assert.strictEqual(E.sanitizeOption(null, 0), null);
});

test('эффекты зажимаются в безопасные границы', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'warrior' });
  g.hero.hp = 3;
  E.applyEffects(g, { hp: -99, item: 'я'.repeat(80), goal: true });
  assert.strictEqual(g.hero.hp, 0);
  assert.ok(g.hero.inventory[g.hero.inventory.length - 1].length <= 40, 'предмет обрезан');
  assert.strictEqual(g.questDone, true);
  E.applyEffects(g, { hp: 99 });
  assert.strictEqual(g.hero.hp, g.hero.maxHp, 'лечение не превышает максимум');
  const hpBefore = g.hero.hp;
  assert.deepStrictEqual(E.applyEffects(g, null), [], 'пустые эффекты ничего не делают');
  assert.strictEqual(g.hero.hp, hpBefore);
});

test('оффлайн-мастер выдаёт 3 варианта и текст', () => {
  E.SCENARIOS.forEach(s => {
    const g = E.createGame({ scenarioId: s.id, heroName: 'Кай', classId: 'wanderer' });
    const open = E.offlineOpening(g);
    assert.strictEqual(open.ok, true);
    assert.strictEqual(open.options.length, 3, 'три варианта у ' + s.id);
    assert.ok(open.scene.length > 40, 'вступление слишком короткое у ' + s.id);
    open.options.forEach(o => assert.ok(o.text && E.STAT_IDS.includes(o.stat)));
  });
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'wanderer' });
  const turn = E.offlineTurn(g, g.hero, { text: 'Идти вперёд', stat: 'str', dc: 11 }, { outcome: 'success' });
  assert.strictEqual(turn.ok, true);
  assert.ok(turn.scene && turn.options.length === 3);
});

/* ---------------------------------------------------------- */
/* Умения, эффекты, копирование сохранений                    */
/* ---------------------------------------------------------- */
test('умение срабатывает раз в три хода и лечит не выше максимума', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Рэй', classId: 'warrior' });
  const max = g.hero.maxHp;
  g.hero.hp = max - 1;
  const first = E.useAbility(g);
  assert.strictEqual(first.ok, true);
  assert.strictEqual(g.hero.hp, max, 'лечение не превышает максимум');
  assert.strictEqual(g.hero.ability.ready, false);
  assert.strictEqual(g.hero.ability.cooldown, E.ABILITY_COOLDOWN);
  assert.strictEqual(E.useAbility(g).ok, false, 'второй раз подряд нельзя');
  for (let i = 0; i < E.ABILITY_COOLDOWN; i++) E.tickCooldowns(g);
  assert.strictEqual(g.hero.ability.ready, true, 'умение восстановилось');
});

test('умения «благословение» и «преимущество» ставят нужные эффекты', () => {
  const bless = E.createGame({ scenarioId: 'asgeld', heroName: 'Ая', classId: 'scholar' });
  E.useAbility(bless);
  assert.strictEqual(bless.hero.buff, E.abilityById('analysis').power);
  E.tickCooldowns(bless);
  assert.strictEqual(bless.hero.buff, 0, 'бафф сбрасывается после хода');

  const adv = E.createGame({ scenarioId: 'asgeld', heroName: 'Тень', classId: 'rogue' });
  const res = E.useAbility(adv);
  assert.strictEqual(res.ok, true);
  assert.ok(res.notes[0].text.length > 5);
  assert.strictEqual(adv.hero.ability.kind, 'advantage');
});

/* ---------------------------------------------------------- */
/* Сохранения и миграция v2 → v3                              */
/* ---------------------------------------------------------- */
function memDriver(initial) {
  const map = new Map(Object.entries(initial || {}));
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: k => { map.delete(k); },
    _map: map
  };
}

test('хранилище игр и миров переживает записи и удаления', () => {
  const store = E.createStorage(memDriver());
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'rogue' });
  store.save(g);
  assert.strictEqual(store.list().length, 1);
  assert.strictEqual(store.load(g.id).hero.name, 'Кай');
  store.remove(g.id);
  assert.strictEqual(store.list().length, 0);

  assert.strictEqual(store.saveWorld({ title: 'Мор', genre: 'нуар' }), true);
  const w1 = store.worlds()[0];
  assert.ok(w1 && w1.id, 'мир получает id');
  assert.strictEqual(w1.title, 'Мор');
  store.saveWorld({ id: w1.id, title: 'Мор v2', genre: 'нуар' });
  assert.strictEqual(store.worlds().length, 1, 'повторная запись обновляет мир');
  assert.strictEqual(store.worlds()[0].title, 'Мор v2');
  store.removeWorld(w1.id);
  assert.strictEqual(store.worlds().length, 0);
  assert.strictEqual(store.saveWorld(null), false, 'пустой мир не сохраняется');
});

test('хранилище не падает на выключенном localStorage', () => {
  const broken = E.createStorage({
    getItem() { throw new Error('нет доступа'); },
    setItem() { throw new Error('нет доступа'); },
    removeItem() { throw new Error('нет доступа'); }
  });
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'rogue' });
  assert.strictEqual(broken.save(g), false);
  assert.deepStrictEqual(broken.list(), []);
  assert.deepStrictEqual(broken.worlds(), []);
  assert.strictEqual(broken.load('нет'), null);
});

test('сохранение v2 превращается в v3 с расой, происхождением и умением', () => {
  const store = E.createStorage(memDriver());
  const old = {
    schema: 2, id: 'g-old', createdAt: 1, updatedAt: 1,
    scenarioId: 'asgeld', title: 'Проклятый лес Аскельда',
    hero: {
      name: 'Старый', archetypeId: 'rogue', archetype: 'Плут',
      stats: { str: 1, agi: 3, con: 2, int: 1 }, hp: 9, maxHp: 11,
      inventory: ['нож'], ability: null
    },
    log: [], turn: 4
  };
  store.save(old);
  const back = store.load('g-old');
  assert.strictEqual(back.schema, E.SCHEMA_VERSION);
  assert.strictEqual(back.hero.classId, 'rogue');
  assert.strictEqual(back.hero.className, 'Плут');
  assert.strictEqual(Object.keys(back.hero.stats).length, 7, 'добраны недостающие характеристики');
  assert.strictEqual(back.hero.stats.agi, 3, 'старые значения сохранены');
  assert.ok(back.hero.raceId && back.hero.originId, 'раса и происхождение подставлены');
  assert.ok(back.hero.ability && back.hero.ability.id, 'умение появилось');
  assert.ok(back.hero.hooks.length >= 1);
  assert.ok(back.hero.hp >= 1 && back.hero.hp <= back.hero.maxHp);
  assert.strictEqual(back.hero.name, 'Старый', 'имя и прогресс не теряются');
  assert.ok(Array.isArray(back.usedImagePrompts));
});

test('миграция идемпотентна и не ломает мусор', () => {
  assert.strictEqual(E.migrate(null), null);
  const g = E.createGame({ scenarioId: 'aurelia', heroName: 'Ая', classId: 'mage' });
  const snapshot = JSON.stringify(g.hero);
  E.migrate(g);
  E.migrate(g);
  assert.strictEqual(JSON.stringify(g.hero), snapshot, 'второй проход ничего не меняет');
  const junk = { hero: {} };
  const fixed = E.migrate(junk);
  assert.strictEqual(fixed.schema, E.SCHEMA_VERSION);
  assert.strictEqual(fixed.hero.name, undefined, 'миграция не выдумывает имя');
});

/* ---------------------------------------------------------- */
/* Промпты и картинки                                         */
/* ---------------------------------------------------------- */
test('промпт хода описывает героя, мир и результат броска', () => {
  const g = E.createGame({ scenarioId: 'helios', heroName: 'Кай', classId: 'wanderer', raceId: 'outsider', originId: 'lost' });
  g.scene = 'Ты стоишь в коридоре.';
  const check = { stat: 'per', dc: 11, roll: 15, total: 17, outcome: 'success', label: 'Успех' };
  const prompt = E.buildTurnPrompt(g, { text: 'Осмотреть переборку', stat: 'per', dc: 11 }, check);
  assert.ok(prompt.includes('Кай'));
  assert.ok(prompt.includes(E.raceById('outsider').title));
  assert.ok(prompt.includes(E.originById('lost').title));
  assert.ok(/15/.test(prompt), 'результат броска попадает в промпт');
  assert.ok(prompt.includes('Успех'));
  assert.ok(prompt.length > 200);
});

test('ссылка на картинку собирается из промпта и стиля', () => {
  const url = E.buildImageUrl({ prompt: 'dark forest', width: 448, height: 252, seed: 7 });
  assert.ok(url.server && url.a0 && url.pollinations && url.stock && url.full, 'есть все источники');
  assert.strictEqual(url.full, 'dark forest');
  assert.ok(url.pollinations.includes('448') && url.pollinations.includes('252'));
  assert.ok(url.server.startsWith('api/image?'), 'серверная ссылка относительная — работает на Pages и Render');
  assert.ok(url.pollinations.includes('seed=7') && url.a0.includes('seed=7'));
  const withStyle = E.buildImageUrl({ prompt: 'dark forest', width: 448, height: 252, seed: 7, style: 'watercolor' });
  assert.strictEqual(withStyle.full, 'dark forest, watercolor');
  assert.ok(withStyle.a0.length > url.a0.length, 'стиль добавляется к промпту');
  const noPrompt = E.buildImageUrl({});
  assert.strictEqual(noPrompt.full, '');
  assert.ok(noPrompt.stock.includes('scene'), 'без промпта остаётся запасной сид');
});

test('запасной промпт картинки берётся из заготовок мира и не повторяется', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'rogue' });
  const first = E.fallbackImagePrompt(g, 'идти вперёд');
  assert.ok(E.SCENARIOS[0].imagePrompts.includes(first), 'взято из заготовок сценария');
  g.usedImagePrompts = E.SCENARIOS[0].imagePrompts.slice();
  const again = E.fallbackImagePrompt(g, 'осмотреться');
  assert.ok(E.SCENARIOS[0].imagePrompts.includes(again), 'когда заготовки кончились, они идут по кругу');
  const custom = E.createGame({ scenarioId: 'mygame', heroName: 'Кай', classId: 'mage', worldConfig: { gameName: 'Ведьмак' } });
  const cp = E.fallbackImagePrompt(custom, 'взять меч');
  assert.ok(cp && cp.length > 8, 'у своего мира тоже есть промпт');
});

/* ---------------------------------------------------------- */
/* v5: создание героя под конкретную игру                      */
/* ---------------------------------------------------------- */
test('обычный мир показывает все шаги создания героя', () => {
  const p = E.defaultHeroProfile();
  assert.strictEqual(p.showClass, true);
  assert.strictEqual(p.showRace, true);
  assert.strictEqual(p.showOrigin, true);
  assert.strictEqual(p.classLabel, 'Класс');
  assert.ok(p.classes.length >= 6, 'классы по умолчанию — все');
  assert.ok(p.races.length >= 8 && p.origins.length >= 8, 'расы и происхождения на месте');
});

test('своя игра: пустые массивы прячут шаг, который игре не подходит', () => {
  const p = E.heroProfileFromWorld({
    classLabel: 'Школа',
    classes: [{ id: 'mage', title: 'Ведьмак' }],
    races: [],                       // в этой игре все люди — шаг прячем
    origins: [{ id: 'soldier', title: 'Школа Волка' }],
    note: 'в этой игре раса не выбирается'
  });
  assert.strictEqual(p.showRace, false, 'пустая раса — шаг скрыт');
  assert.strictEqual(p.showOrigin, true);
  assert.strictEqual(p.classLabel, 'Школа');
  assert.strictEqual(p.classes.length, 1);
  assert.strictEqual(p.classes[0].title, 'Ведьмак');
  assert.strictEqual(p.note, 'в этой игре раса не выбирается');
});

test('профиль героя: мусор от ИИ безвреден, классы никогда не пусты', () => {
  const junk = E.heroProfileFromWorld({ classes: ['нет-такого'], races: null, origins: ['тоже-нет'] });
  assert.ok(junk.classes.length >= 6, 'неизвестные классы заменяются полным списком');
  assert.strictEqual(junk.showRace, true, 'null — это «данных нет», а не «скрыть»');
  const empty = E.heroProfileFromWorld({ classes: [] });
  assert.ok(empty.classes.length >= 6, 'пустой список классов тоже безопасен');
  const noArg = E.heroProfileFromWorld(null);
  assert.strictEqual(noArg.showClass && noArg.showRace && noArg.showOrigin, true);
});

test('профиль героя: длинные подписи и подсказки обрезаются', () => {
  const p = E.heroProfileFromWorld({
    classLabel: 'О'.repeat(80),
    classes: [{ id: 'mage', title: 'И'.repeat(80), hint: 'Х'.repeat(400) }]
  });
  assert.ok(p.classLabel.length <= 40, 'заголовок шага укорочен: ' + p.classLabel.length);
  assert.ok(p.classes[0].title.length <= 40);
  assert.ok(p.classes[0].hint.length <= 140);
});

/* ---------------------------------------------------------- */
/* v5: кто в кадре                                             */
/* ---------------------------------------------------------- */
test('участники сцены: герой, враги и предметы узнаются из текста', () => {
  const a = E.sceneActors('Из тени выходят двое бандитов с ножами, за ними волк. Рядом горит костёр у повозки.');
  assert.ok(a.hero && a.hero.shape, 'герой в кадре всегда');
  assert.ok(a.enemies.length >= 1 && a.enemies.length <= 3, 'врагов не больше трёх: ' + JSON.stringify(a.enemies));
  assert.ok(a.props.includes('fire') || a.props.includes('cart'), 'предметы окружения: ' + JSON.stringify(a.props));
  const calm = E.sceneActors('Ты стоишь на причале, пахнет дымом и рыбой.');
  assert.strictEqual(calm.enemies.length, 0, 'в спокойной сцене врагов нет');
  assert.ok(a.enemies.every(x => typeof x === 'string'), 'формы силуэтов — строки');
});

test('промпт картинки: герой попадает в кадр всегда, враги — когда есть', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'warrior', raceId: 'beast' });
  const withEnemy = E.composeSceneImagePrompt(g, { aiPrompt: 'dark alley, rain', sceneText: 'Двое бандитов преграждают путь.' });
  assert.ok(/hero/i.test(withEnemy), 'герой назван: ' + withEnemy);
  assert.ok(/approaching|snarling|looming|rising|sentinel|hulking|watching/i.test(withEnemy),
    'враг назван в кадре: ' + withEnemy);
  assert.ok(withEnemy.length > 'dark alley, rain'.length, 'к промпту добавлены участники');
  assert.ok(withEnemy.length <= 380, 'промпт не раздувается: ' + withEnemy.length);
  const aiDrewPeople = E.composeSceneImagePrompt(g, { aiPrompt: 'armored knight and two bandits in a rain-soaked alley, cinematic' });
  assert.strictEqual(aiDrewPeople, 'armored knight and two bandits in a rain-soaked alley, cinematic',
    'если ИИ уже нарисовал героя, промпт не дублируется');
  const heroOnly = E.composeSceneImagePrompt(g, { aiPrompt: 'misty forest at dawn' });
  assert.ok(/hero/i.test(heroOnly), 'без подсказки герой всё равно добавляется');
});

test('план отыгрыша: строки и массивы, не больше четырёх шагов', () => {
  assert.strictEqual(E.parsePlan(['Шаг раз', 'Шаг два']).length, 2);
  const fromString = E.parsePlan('1. Осмотреться; 2. Найти союзника\n3. Взяться за дело');
  assert.strictEqual(fromString.length, 3, JSON.stringify(fromString));
  assert.strictEqual(E.parsePlan('а; б; в; г; д; е').length, 4, 'лишние шаги отбрасываются');
  assert.deepStrictEqual(E.parsePlan(''), []);
  assert.deepStrictEqual(E.parsePlan(null), []);
  assert.ok(E.parsePlan(['Я'.repeat(300)])[0].length <= 140, 'шаг не растягивается на экран');
});

/* ---------------------------------------------------------- */
/* v5: вступление вместо «ты в переулке, убей вора»            */
/* ---------------------------------------------------------- */
test('первая сцена: мир, предыстория и план отыгрыша на месте', () => {
  const g = E.createGame({
    scenarioId: 'mygame', heroName: 'Рэй', classId: 'mage', raceId: 'human', originId: 'soldier',
    worldConfig: { gameName: 'Ведьмак 3', genre: 'тёмное фэнтези', place: 'Вызима', goal: 'найти Цири', danger: 'normal' }
  });
  const o = E.offlineOpening(g);
  assert.ok(o.world && o.world.length > 60, 'о мире рассказано: ' + (o.world || '').slice(0, 40));
  assert.ok(/Вызима|Ведьмак/i.test(o.world), 'мир опирается на настройки игрока');
  assert.ok(o.backstory && o.backstory.includes('Рэй'), 'предыстория говорит о герое');
  assert.ok(Array.isArray(o.plan) && o.plan.length === 3, 'план отыгрыша из трёх шагов');
  assert.ok(/Вызима/.test(o.scene), 'сцена начинается в заданном месте: ' + o.scene.slice(0, 60));
  assert.ok(o.options.length >= 3, 'кнопки действий готовы');
  assert.ok(/hero/i.test(o.imagePrompt), 'в кадре есть герой');
});

test('вступление готового мира тоже не сухое', () => {
  const g = E.createGame({ scenarioId: 'greyhaven', heroName: 'Кай', classId: 'rogue' });
  const o = E.offlineOpening(g);
  assert.ok(o.world.length > 40 && o.backstory.length > 40, 'мир и предыстория заполнены');
  assert.strictEqual(o.plan.length, 3);
  const turn = E.offlineTurn(g, { text: 'Осмотреть переулок', stat: 'per' }, { outcome: 'success', roll: 15 });
  assert.ok(/hero/i.test(turn.imagePrompt), 'дальше герой тоже в кадре: ' + turn.imagePrompt);
});

test('новые поля ответов ИИ доходят до игры', () => {
  const world = E.parseWorldResponse(JSON.stringify({
    title: 'Континент', goal: 'Найти Цири',
    world: 'Мир контрактов и войны.', backstory: 'Ты вырос в школе на скале.',
    plan: ['Осмотреться', 'Найти заказчика', 'Выбрать сторону'],
    hero: { classes: [{ id: 'mage', title: 'Ведьмак' }], races: [] },
    opening: 'Вызима пахнет дымом.', imagePrompt: 'medieval harbor', options: ['Подойти к заказчику']
  }), {});
  assert.strictEqual(world.ok, true);
  assert.strictEqual(world.world, 'Мир контрактов и войны.');
  assert.strictEqual(world.plan.length, 3);
  assert.ok(world.hero && world.hero.classes.length === 1, 'профиль героя прошёл');

  const turn = E.parseGmResponse(JSON.stringify({
    world: 'Мир контрактов.', backstory: 'Ты вырос на скале.',
    plan: 'Осмотреться\nНайти заказчика', scene: 'Ты входишь в порт.', options: ['Идти дальше']
  }), {});
  assert.strictEqual(turn.ok, true);
  assert.strictEqual(turn.backstory, 'Ты вырос на скале.');
  assert.strictEqual(turn.plan.length, 2, 'план-строка разбирается на шаги');
});

/* ---------------------------------------------------------- */
/* v5: знакомые игры — профиль героя без ИИ                    */
/* ---------------------------------------------------------- */
test('таблица знакомых игр заполнена по правилам', () => {
  const classIds = E.CLASSES.map(c => c.id);
  const raceIds = E.RACES.map(r => r.id);
  const originIds = E.ORIGINS.map(o => o.id);
  assert.ok(E.KNOWN_GAME_PROFILES.length >= 8, 'игр и жанров в таблице: ' + E.KNOWN_GAME_PROFILES.length);
  E.KNOWN_GAME_PROFILES.forEach((row, i) => {
    assert.ok(row.match && row.profile, 'строка ' + i + ' без условия или профиля');
    const p = row.profile;
    assert.ok((p.classes || []).length >= 3, `игра ${i}: классов меньше трёх`);
    const seen = {};
    ['classes', 'races', 'origins'].forEach(key => {
      (p[key] || []).forEach(opt => {
        assert.ok(opt.title && opt.title.length >= 3, `игра ${i}: пустое название в ${key}`);
        assert.ok(!seen[key + opt.title], `игра ${i}: дубль «${opt.title}» в ${key}`);
        seen[key + opt.title] = 1;
        if (opt.bonus) {
          const sum = Object.values(opt.bonus).reduce((a, b) => a + b, 0);
          assert.ok(sum <= 4, `игра ${i}: «${opt.title}» — суммарный бонус ${sum}`);
          Object.entries(opt.bonus).forEach(([stat, v]) => {
            assert.ok(E.STAT_IDS.includes(stat), `игра ${i}: неизвестная характеристика ${stat}`);
            assert.ok(v <= 3 && v >= -2, `игра ${i}: бонус ${stat} = ${v}`);
          });
        }
      });
    });
    (p.classes || []).forEach(c => {
      assert.ok(c.ability && c.ability.name && c.ability.desc, `игра ${i}: у класса «${c.title}» нет своего приёма`);
    });
    (p.origins || []).forEach(o => {
      assert.ok(o.item && o.hook, `игра ${i}: у происхождения «${o.title}» нет предмета или крючка`);
    });
  });
  assert.ok(classIds.length && raceIds.length && originIds.length);
});

test('без ИИ знакомые игры всё равно подгоняют создание героя', () => {
  const witcher = E.offlineHeroProfile({ gameName: 'Ведьмак 3' });
  assert.ok(witcher, 'Ведьмак распознан');
  assert.strictEqual(witcher.showRace, false, 'в Ведьмаке раса не выбирается');
  assert.strictEqual(witcher.showOrigin, true);
  assert.strictEqual(witcher.classLabel, 'Школа');
  assert.ok(witcher.classes.length >= 3 && witcher.classes.length <= 6, 'классов: ' + witcher.classes.length);
  assert.ok(/школ[ыа]/i.test(witcher.classes.map(c => c.title).join(' ')), 'школы ведьмаков на месте');
  assert.ok(witcher.classes.every(c => c.ability && c.ability.name), 'у каждой школы свой приём');

  const cyber = E.offlineHeroProfile({ gameName: 'Cyberpunk 2077' });
  assert.strictEqual(cyber.showRace, false, 'в Киберпанке раса не выбирается');
  assert.strictEqual(cyber.classLabel, 'Роль');

  const wow = E.offlineHeroProfile({ gameName: 'World of Warcraft' });
  assert.strictEqual(wow.showRace, true, 'в WoW раса есть');
  assert.ok(wow.races.length >= 3, 'расы WoW: ' + wow.races.map(r => r.title).join(','));

  assert.strictEqual(E.offlineHeroProfile({ gameName: 'Моя игра про грибы' }), null, 'незнакомая игра — решает ИИ');
  assert.strictEqual(E.offlineHeroProfile(null), null);
  assert.strictEqual(E.offlineHeroProfile({}), null);
});

/* ---------------------------------------------------------- */
/* v6: мастер сам придумывает класс, расу и происхождение      */
/* ---------------------------------------------------------- */
test('мастер может придумать вариант, которого нет в движке', () => {
  const p = E.heroProfileFromWorld({
    classLabel: 'Школа',
    classes: [{
      title: 'Ведьмак школы Волка', hint: 'мутации и медальон',
      bonus: { con: 1, wit: 2 }, trait: 'видит в темноте',
      ability: { name: 'Зелье «Кошка»', desc: 'Зрение в темноте и звериная реакция' }
    }],
    races: [],
    origins: [{ title: 'Дитя Предназначения', hint: 'за тобой идут', bonus: { wit: 1 }, item: 'медальон волка', hook: 'тебя ищет чародейка' }]
  });
  const cls = p.classes[0];
  assert.strictEqual(cls.custom, true, 'вариант помечен как придуманный');
  assert.ok(cls.id && cls.id !== 'warrior', 'у него свой id: ' + cls.id);
  assert.deepStrictEqual(cls.bonus, { con: 1, wit: 2 });
  assert.strictEqual(cls.trait, 'видит в темноте');
  assert.ok(cls.ability && cls.ability.name === 'Зелье «Кошка»', 'свой приём сохранён');
  assert.ok(['heal', 'bless', 'advantage'].includes(cls.ability.kind), 'механика приёма задана: ' + cls.ability.kind);
  assert.strictEqual(p.showRace, false, 'пустая раса скрывает шаг');
  const origin = p.origins[0];
  assert.strictEqual(origin.item, 'медальон волка');
  assert.strictEqual(origin.hook, 'тебя ищет чародейка');
});

test('бонусы от мастера приводятся к балансу', () => {
  const p = E.heroProfileFromWorld({
    classes: [{ title: 'Мегагерой', bonus: { str: 9, agi: 4, con: 4, int: 4, per: 1 } }]
  });
  const bonus = p.classes[0].bonus;
  Object.entries(bonus).forEach(([stat, v]) => {
    assert.ok(E.STAT_IDS.includes(stat), 'незнакомая характеристика отброшена: ' + stat);
    assert.ok(v <= 3, stat + ' = ' + v);
  });
  const sum = Object.values(bonus).reduce((a, b) => a + b, 0);
  assert.ok(sum <= 4, 'суммарный бонус приведён к ' + sum);
  assert.ok(Object.keys(bonus).length <= 3, 'характеристик не больше трёх');
  const rus = E.heroProfileFromWorld({ origins: [{ title: 'Из леса', bonus: { 'сила': 2, 'воля': 1 } }] });
  assert.deepStrictEqual(rus.origins[0].bonus, { str: 2, wit: 1 }, 'русские названия характеристик поняты');
});

test('придуманный мастером герой играется: статы, умение, предмет, крючки', () => {
  const profile = E.heroProfileFromWorld({
    classes: [{ title: 'Ведьмак школы Волка', bonus: { con: 1, wit: 2 }, ability: { name: 'Зелье «Кошка»', desc: 'Зрение в темноте' } }],
    races: [],
    origins: [{ title: 'Дитя Предназначения', bonus: { wit: 1 }, item: 'медальон волка', hook: 'тебя ищет чародейка' }]
  });
  const g = E.createGame({
    scenarioId: 'mygame', heroName: 'Геральт',
    classId: profile.classes[0].id, raceId: profile.races[0].id, originId: profile.origins[0].id,
    heroProfile: profile,
    worldConfig: { gameName: 'Ведьмак 3', goal: 'найти Цири' }
  });
  assert.strictEqual(g.hero.className, 'Ведьмак школы Волка');
  assert.strictEqual(g.hero.originName, 'Дитя Предназначения');
  assert.strictEqual(g.hero.stats.wit, 1 + 2 + 1, 'бонусы класса и происхождения сложились');
  assert.ok(g.hero.maxHp >= 8, 'здоровье посчитано: ' + g.hero.maxHp);
  assert.strictEqual(g.hero.ability.name, 'Зелье «Кошка»', 'приём мастера достался герою');
  assert.deepStrictEqual(g.hero.inventory, ['медальон волка']);
  assert.ok(g.hero.hooks.join(' ').includes('чародейка'), 'крючок происхождения в деле');
  const turn = E.offlineTurn(g, { text: 'Идти по следу', stat: 'wit' }, { outcome: 'success', roll: 15 });
  assert.strictEqual(turn.ok, true, 'ход с таким героем проходит');
  const opened = E.offlineOpening(g);
  assert.ok(opened.backstory.includes('Геральт') && opened.world.length > 40, 'вступление учитывает героя');
});

test('умение придуманного класса получает механику по смыслу', () => {
  const heal = E.heroProfileFromWorld({ classes: [{ title: 'Рипердок', ability: { name: 'Стимпак', desc: 'Восстанавливает здоровье' } }] }).classes[0];
  assert.strictEqual(heal.ability.kind, 'heal');
  assert.ok(heal.ability.power > 0, 'лечение лечит');
  const sneak = E.heroProfileFromWorld({ classes: [{ title: 'Лазутчик', ability: { name: 'Тень на стене', desc: 'Скрытность и удар в спину' } }] }).classes[0];
  assert.strictEqual(sneak.ability.kind, 'advantage');
  const talk = E.heroProfileFromWorld({ classes: [{ title: 'Парламентёр', ability: { name: 'Натиск слов', desc: 'Уговорить кого угодно' } }] }).classes[0];
  assert.strictEqual(talk.ability.kind, 'bless');
  const noAbility = E.heroProfileFromWorld({ classes: [{ title: 'Просто герой' }] }).classes[0];
  assert.ok(noAbility.ability && noAbility.ability.name, 'без подсказки остаётся рабочий приём');
});

test('каждый набор героев отличается от следующего', () => {
  const a = E.heroProfileFromWorld({ classes: [{ title: 'Соло' }, { title: 'Нетраннер' }] });
  const b = E.heroProfileFromWorld({ classes: [{ title: 'Нетраннер' }, { title: 'Соло' }] });
  assert.notDeepStrictEqual(a.classes.map(c => c.id), b.classes.map(c => c.id), 'порядок вариантов сохраняется');
  const again = E.heroProfileFromWorld({ classes: [{ title: 'Соло' }, { title: 'Нетраннер' }] });
  assert.deepStrictEqual(a.classes.map(c => c.id), again.classes.map(c => c.id), 'один набор — одинаковые id (сохранения не ломаются)');
  assert.strictEqual(a.classes.length, 2);
});

test('запрос героя: мастер придумывает заново и не повторяет прошлое', () => {
  const first = E.buildHeroPrompt({ gameName: 'Ведьмак 3', genre: 'тёмное фэнтези' }, null, { variant: 1 });
  assert.ok(first.includes('Ведьмак 3'), 'игра названа: по ней и придумывать');
  assert.ok(/^М:/m.test(first) && /^К:/m.test(first) && /^П:/m.test(first) && /^Р:/m.test(first), 'формат строк задан');
  assert.ok(!/ability\.name/.test(first), 'JSON-контракт герою не нужен — ответ короткий');
  const third = E.buildHeroPrompt({ gameName: 'Ведьмак 3' }, null, { variant: 3, used: ['Ведьмак школы Волка', 'Горожанин'] });
  assert.ok(/ДРУГИХ героев/.test(third), 'мастеру сказано придумать других');
  assert.ok(third.includes('Ведьмак школы Волка') && third.includes('Горожанин'), 'прошлые варианты перечислены');
});

test('герой из строкового ответа мастера: классы, метки, бонусы, приёмы', () => {
  const reply = [
    'М: Школа',
    'К: Ведьмак школы Волка|мутации, два меча|Сила+2 Ловкость+1|Зелье «Кошка» :: видит в темноте',
    'К: Чародейка Ложи|придворные интриги|Разум+2 Обаяние+1|Портал уносит из сцены и возвращает',
    'П: Дитя Предназначения|медальон волка|ищет того, кто сжёг её дом',
    'Р: Эльф|видит в темноте'
  ].join('\n');
  const p = E.heroProfileFromText(reply);
  assert.strictEqual(p.source, 'ai');
  assert.strictEqual(p.classLabel, 'Школа', 'метка шага от мастера');
  assert.strictEqual(p.classes.length, 2);
  assert.deepStrictEqual(p.classes[0].bonus, { str: 2, agi: 1 }, 'русские характеристики поняты');
  assert.strictEqual(p.classes[0].ability.name, 'Зелье «Кошка»', 'название приёма отделено от описания');
  assert.ok(['heal', 'bless', 'advantage'].includes(p.classes[0].ability.kind), 'у приёма есть механика');
  assert.strictEqual(p.origins[0].item, 'медальон волка');
  assert.ok(p.origins[0].hook.includes('сжёг'), 'крючок происхождения сохранён');
  assert.strictEqual(p.showRace, true);
  assert.strictEqual(p.races[0].trait, 'видит в темноте');
});

test('приём, записанный через «|» или без описания, всё равно читается', () => {
  const bar = E.heroProfileFromText([
    'К: Истребитель туманов|шум дождя|Сила+2 Ловкость+1|Туманный клинок|отскакивает от ударов',
    'К: Пламя ночи|свет ломает тьму|Разум+2 Воля+1|Пламень безумия :: вызывает огненную бурю'
  ].join('\n'));
  assert.strictEqual(bar.classes[0].ability.name, 'Туманный клинок');
  assert.ok(bar.classes[0].ability.desc.includes('отскакивает'));
  const noBonus = E.heroProfileFromText([
    'К: Следопыт|тихий шаг|Умение :: идёт по следу без ошибок',
    'К: Травница|знает настойки|Умение :: лечит раны травами'
  ].join('\n'));
  assert.deepStrictEqual(noBonus.classes[0].bonus, {}, 'без бонуса класс остаётся рабочим');
  assert.ok(noBonus.classes[0].ability.name, 'название приёма не пустое');
  assert.ok(['heal', 'bless', 'advantage'].includes(noBonus.classes[0].ability.kind));
});

test('мастер ответил JSON-ом — разбор тот же', () => {
  const json = JSON.stringify({
    classLabel: 'Роль',
    classes: [
      { title: 'Соло', hint: 'одиночка', bonus: { str: 2 }, ability: { name: 'Дерзкий рывок', desc: 'врывается первым' } },
      { title: 'Нетраннер', hint: 'взлом сетей', bonus: { int: 2 }, ability: { name: 'Взлом', desc: 'отключает технику' } }
    ],
    origins: [{ title: 'Кочевник', item: 'фургон', hook: 'ищет семью' }],
    races: []
  });
  const p = E.heroProfileFromText(json);
  assert.strictEqual(p.classLabel, 'Роль');
  assert.deepStrictEqual(p.classes.map(c => c.title), ['Соло', 'Нетраннер']);
  assert.strictEqual(p.showRace, false, 'пустые виды скрывают шаг');
  assert.strictEqual(p.origins[0].item, 'фургон');
});

test('если ответ мастера оборвался до видов и происхождений — шаги не пропадают', () => {
  const cut = E.heroProfileFromText([
    'К: Кровавый Охотник|тень и дым|Сила+2 Ловкость+1|Кровавая резня :: истекает кровь врагов',
    'К: Затмённый Пастух|голос ветра|Сила+2 Ловкость+1|Шипящий клич :: отгоняет тьму',
    'К: Похищённый Жрец'
  ].join('\n'));
  assert.strictEqual(cut.classes.length, 3, 'все три класса на месте');
  assert.strictEqual(cut.showRace, true, 'вид всё ещё выбирается');
  assert.strictEqual(cut.showOrigin, true, 'происхождение всё ещё выбирается');
  assert.ok(cut.races.length >= 3 && cut.origins.length >= 3, 'списки не пустые');
  assert.ok(cut.classes[2].ability.name, 'у обрезанного класса есть рабочий приём');
  const toldNo = E.heroProfileFromText([
    'К: Соло|одиночка|Сила+2|Дерзкий рывок :: бьёт первым',
    'К: Нетраннер|взлом сетей|Разум+2|Взлом :: отключает технику',
    'П: Кочевник|фургон|ищет семью'
  ].join('\n'));
  assert.strictEqual(toldNo.showOrigin, true, 'происхождение есть — шаг показан');
  assert.strictEqual(toldNo.showRace, false, 'виды не названы — шаг скрыт');
});

test('обрывок ответа мастера не ломает экран героя', () => {
  assert.strictEqual(E.heroProfileFromText('К: Один класс|такой|Сила+1'), null, 'одного класса мало');
  assert.strictEqual(E.heroProfileFromText('Я не могу придумать героя, извините.'), null);
  assert.strictEqual(E.heroProfileFromText(''), null);
  assert.strictEqual(E.heroProfileFromText(null), null);
  const junk = E.heroProfileFromText('К: Охотник|лес|Сила+1<|endoftext|>\nК: Травница|настойки|Разум+1');
  assert.ok(junk && junk.classes.length === 2, 'служебные токены модели вычищены');
});

test('герой от мастера попадает в игру целиком', () => {
  const reply = [
    'К: Киберхакер|ночные коды|Разум+2 Воля+1|Обрыв сети :: отключает охрану',
    'К: Строитель разломов|протокол разрушения|Телосложение+2 Ловкость+1|Пушка скважин :: крушит стену',
    'П: Детектив сети|датчик перехвата|раскрывает заговор',
    'Р: Городской скелет|металлическая броня'
  ].join('\n');
  const profile = E.heroProfileFromText(reply);
  const g = E.createGame({
    scenarioId: 'mygame', heroName: 'Ви', heroProfile: profile,
    classId: profile.classes[0].id, raceId: profile.races[0].id, originId: profile.origins[0].id,
    worldConfig: { gameName: 'Cyberpunk 2077' }
  });
  assert.strictEqual(g.hero.className, 'Киберхакер', 'класс из строки мастера');
  assert.strictEqual(g.hero.raceName, 'Городской скелет');
  assert.strictEqual(g.hero.originName, 'Детектив сети');
  assert.strictEqual(g.hero.stats.int, 1 + 2, 'бонус класса дошёл до статов');
  assert.strictEqual(g.hero.ability.name, 'Обрыв сети');
  assert.deepStrictEqual(g.hero.inventory, ['датчик перехвата']);
  const turn = E.offlineTurn(g, { text: 'Взломать дверь', stat: 'int' }, { outcome: 'success', roll: 13 });
  assert.strictEqual(turn.ok, true, 'с таким героем ход проходит');
});

/* ---------------------------------------------------------- */
/* v6: память кампании, тон, арт-стиль, поражение с ценой      */
/* ---------------------------------------------------------- */

test('память кампании копится и уходит мастеру блоком', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'rogue' });
  g.intro = { world: 'мир', backstory: 'предыстория', plan: ['найти след', 'дойти до башни', 'выяснить правду'] };
  g.turn = 1;
  E.rememberTurn(g, {
    scene: 'Тропа сужается между чёрными стволами и мхом',
    place: 'Чёрная тропа у Аскельда',
    npc: 'Звонарь Михель, нервный, говорит шёпотом',
    thread: 'колокольчик звонит сам',
    progress: true
  }, { text: 'Идти на звон напрямик' });
  const m = E.memoryOf(g);
  assert.strictEqual(m.place, 'Чёрная тропа у Аскельда');
  assert.ok(m.npcs.some(n => n.name.indexOf('Звонарь') === 0), 'NPC попал в реестр');
  assert.ok(m.threads.length === 1 && m.deeds.length === 1, 'нить и дело записаны');
  assert.strictEqual(m.step, 1, 'шаг плана сдвинулся');
  const block = E.memoryBlock(g);
  assert.ok(block.includes('ГДЕ МЫ'), 'блок памяти знает место');
  assert.ok(block.includes('ЗНАКОМЫЕ ЛЮДИ'), 'блок памяти знает людей');
  assert.ok(block.includes('НЕ НАЧИНАЙ СЦЕНУ ТАК ЖЕ'), 'анти-повтор зачинов работает');
  assert.strictEqual(m.openings[0], 'Тропа сужается между чёрными стволами', 'зачин запомнен');
});

test('пустой ход копит простой, а не память о прогрессе', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'rogue' });
  g.intro = { plan: ['шаг', 'два', 'три'] };
  E.rememberTurn(g, { scene: 'Ничего не произошло.', progress: false });
  E.rememberTurn(g, { scene: 'Опять ничего.', progress: false });
  assert.strictEqual(E.memoryOf(g).idle, 2, 'простой накапливается');
  assert.ok(E.memoryBlock(g).includes('пора двигать историю'), 'мастер получает намёк двигать сюжет');
});

test('тон и жёсткость попадают в промпт хода', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'rogue' });
  g.rules = { tone: 'ironic', rating: 'soft', defeat: 'cost' };
  const line = E.rulesLine(g);
  assert.ok(/ирони|сухой юмор/i.test(line), 'тон в строке правил');
  assert.ok(/жесток|жёстк/i.test(line), 'жёсткость в строке правил');
  assert.strictEqual(E.rulesOf(g).tone, 'ironic');
});

test('арт-стиль выбирается по игре и один для всей кампании', () => {
  const g = E.createGame({
    scenarioId: 'mygame', heroName: 'Ви', classId: 'warrior',
    worldConfig: { gameName: 'Cyberpunk 2077' }
  });
  assert.strictEqual(E.styleOf(g).id, 'neon', 'киберпанк — неон');
  const again = E.styleOf(g);
  assert.strictEqual(again.id, 'neon', 'стиль не меняется по ходу игры');
  assert.ok(E.portraitPrompt(g).includes('portrait'), 'промпт портрета героя готов');
  const place = E.placeKey(g, 'Тесный трактир, огонь в очаге');
  assert.strictEqual(place, E.placeKey(g, 'тесный трактир огонь в очаге!'), 'ключ места устойчив к знакам');
  const prompt = E.placePrompt(g, 'Тесный трактир', 'warm light', { noStyle: true });
  assert.ok(prompt.includes('no characters in focus'), 'фон места — без людей в кадре');
  assert.ok(!prompt.includes('cyberpunk'), 'стиль можно приклеить отдельно');
});

test('поражение с ценой: герой теряет вещь и часть сил, а не игру', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'warrior' });
  g.hero.inventory = ['меч', 'фляга'];
  g.hero.hp = 0;
  const res = E.resolveDefeat(g);
  assert.strictEqual(res.kind, 'setback', 'первый провал — не конец');
  assert.strictEqual(g.over, false);
  assert.strictEqual(g.hero.inventory.length, 1, 'вещь потеряна');
  assert.ok(g.hero.hp >= 2, 'герой поднялся на ноги: ' + g.hero.hp);
  assert.strictEqual(E.memoryOf(g).setbacks, 1);
  assert.strictEqual(E.resolveDefeat(g).kind, 'setback', 'второй провал тоже переживаем');
  assert.strictEqual(E.resolveDefeat(g).kind, 'setback', 'третий — последняя передышка');
  assert.strictEqual(E.resolveDefeat(g).kind, 'downfall', 'четвёртое падение заканчивает историю');
  assert.strictEqual(g.over, true);
});

test('эпилог собирается из памяти кампании даже без ИИ', () => {
  const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'rogue' });
  g.turn = 9;
  g.questDone = true;
  g.goal = 'найти пропавшего брата';
  E.rememberTurn(g, { scene: 'Мост рухнул в реку.', thread: 'мост сожжён' }, { text: 'Перейти реку вброд' });
  const text = E.epilogueText(g);
  assert.ok(text.includes('Кай'), 'герой назван');
  assert.ok(text.includes('9'), 'число ходов в летописи');
  assert.ok(E.buildEpiloguePrompt(g).includes('epilogue'), 'промпт эпилога просит JSON');
});

test('обрезанный ответ мастера не теряется: мир собирается по частям', () => {
  const full = JSON.stringify({
    title: 'Ржавые Пески Кар-Адама', goal: 'найти караван',
    world: 'Пустыня держит караванные тропы, и вода дороже золота.',
    backstory: 'Ты вырос среди караванщиков и потерял свой груз.',
    plan: ['опросить местных', 'идти по следу', 'разобраться с виновным'],
    opening: 'Ветер швыряет песок в лицо, и впереди кто-то ждёт у погасшего костра.',
    chapter: 'Пустынные тропы', npc: 'Кирил, наблюдатель с картой',
    options: [{ text: 'Осмотреть следы', stat: 'per', difficulty: 'easy' }]
  });
  const cut = full.slice(0, Math.floor(full.length * 0.7));
  assert.strictEqual(E.parseWorldResponse(cut).ok, false, 'целиком такой JSON не читается');
  const salv = E.salvageWorldResponse(cut);
  assert.strictEqual(salv.ok, true, 'спасение работает');
  assert.strictEqual(salv.title, 'Ржавые Пески Кар-Адама');
  assert.ok(salv.opening.length > 30 || salv.world.length > 30, 'сцена или мир достались');
  assert.ok(salv.plan.length >= 2, 'шаги плана собраны: ' + salv.plan.length);
  assert.strictEqual(E.salvageWorldResponse('извини, не могу').ok, false, 'мусор не спасаем');
});

test('наследие прошлых кампаний открывает варианты и не повторяет историю', () => {
  let legacy = E.emptyLegacy();
  assert.strictEqual(E.legacySummary(legacy), '', 'до первой кампании летописи нет');
  for (let i = 1; i <= 3; i++) {
    const g = E.createGame({ scenarioId: 'asgeld', heroName: 'Герой' + i, classId: 'rogue', legacy });
    g.turn = 10 + i;
    g.questDone = i % 2 === 0;
    const res = E.applyRunToLegacy(legacy, g);
    legacy = res.legacy;
    assert.ok(res.ashes >= 1, 'пепел начисляется');
  }
  assert.strictEqual(legacy.runs, 3, 'все кампании в летописи');
  const open = E.legacyUnlocked(legacy).map(u => u.id);
  assert.ok(open.includes('origin-memory') && open.includes('class-heir'), 'первые открытия получены');
  const opts = E.legacyOptions(legacy);
  assert.ok(opts.origins.some(o => o.title === 'Помнящий прошлое'), 'происхождение из наследия играбельно');
  assert.ok(opts.classes.some(c => c.id === 'lg-heir' && c.ability), 'класс из наследия с умением');
  assert.ok(E.legacyBlock(legacy).includes('ПАМЯТЬ ПРОШЛЫХ ЖИЗНЕЙ'), 'мастер знает о прошлой жизни');
  const next = E.legacyNextUnlock(legacy);
  assert.ok(next && next.title === 'Реликвия прошлой жизни', 'следующее открытие известно: ' + (next && next.title));

  // герой собирается по варианту из наследия целиком
  const heir = opts.classes.find(c => c.id === 'lg-heir');
  const g2 = E.createGame({
    scenarioId: 'asgeld', heroName: 'Лис', classId: heir.id, raceId: 'human', originId: 'streets',
    heroProfile: { classes: opts.classes, races: E.RACES, origins: E.ORIGINS },
    legacy
  });
  assert.strictEqual(g2.hero.className, 'Носитель наследия', 'класс из наследия достался герою');
  assert.strictEqual(g2.legacy.runs, 3, 'игра помнит прошлые кампании');
  const notes = E.applyLegacyGifts(g2.hero, g2, ['relic', 'stat']);
  assert.ok(notes.length >= 2, 'дары наследия применились');
  assert.ok(g2.hero.inventory.includes('реликвия прошлой жизни'));
});

test('победа: цель взята — финал с ценой, +3 пепла и «дошёл до конца» в летописи', () => {
  const legacy = E.emptyLegacy();
  const g = E.createGame({ scenarioId: 'aurelia', heroName: 'Ирма', classId: 'scholar', legacy });
  g.turn = 4;
  g.questDone = true;
  g.memory = g.memory || E.emptyMemory();
  g.memory.facts = ['печать снята', 'купол ещё держится'];
  g.memory.deeds = ['сняла печать с купола'];
  g.memory.npcs = [{ name: 'Симон', role: 'мастер купола', attitude: 'союз', seen: 2 }];

  assert.ok(/довёл дело до конца/.test(E.epilogueText(g)), 'локальный эпилог говорит о взятой цели');
  const prompt = E.buildEpiloguePrompt(g);
  assert.ok(prompt.includes('цель достигнута'), 'мастеру сказано, чем кончилось');
  assert.ok(/Симон/.test(prompt), 'эпилог знает, кто был рядом');

  const res = E.applyRunToLegacy(legacy, g);
  assert.strictEqual(res.ashes, 3, 'победа приносит три пепла');
  assert.strictEqual(res.legacy.victories, 1);
  assert.strictEqual(res.legacy.defeats, 0);
  assert.strictEqual(res.legacy.ashes, 3, 'ходов мало — только победа');
  assert.strictEqual(res.legacy.heroes[0].ending, 'victory', 'в летописи победа, а не падение');
  const summary = E.legacySummary(res.legacy);
  assert.ok(/побед: 1/.test(summary), 'летопись считает победы: ' + summary);
  assert.ok(/дошёл до конца/.test(summary), 'прошлая жизнь описана как победа');
  const next = E.legacyNextUnlock(res.legacy);
  assert.ok(next && next.title === 'Носитель наследия', 'после первой кампании ждёт наследник: ' + (next && next.title));
});
