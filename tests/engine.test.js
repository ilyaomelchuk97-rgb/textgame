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
