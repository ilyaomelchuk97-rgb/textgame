/**
 * Тесты блока B «Механики и глубина» (src/engine.js):
 * предметы с эффектом, состояния, припасы, отношения знакомых,
 * социальные броски, крит с последствиями и цена провала.
 */
const test = require('node:test');
const assert = require('node:assert');
const E = require('../src/engine.js');

const newGame = () => E.createGame({ scenarioId: 'asgeld', heroName: 'Кай', classId: 'warrior', raceId: 'human', originId: 'streets' });

test('предмет из названия получает эффект, а не остаётся словом', () => {
  const potion = E.makeItem('зелье лекаря');
  assert.strictEqual(potion.kind, 'heal');
  assert.ok(potion.power >= 2, 'лечение имеет силу');
  assert.match(E.itemLine(potion), /лечит на \d/);

  const pick = E.makeItem('заточенная отмычка');
  assert.strictEqual(pick.kind, 'boost');
  assert.strictEqual(pick.stat, 'agi', 'отмычка помогает ловкости');

  const key = E.makeItem('ключ от северной башни');
  assert.strictEqual(key.kind, 'key', 'ключ открывает веху');

  const trophy = E.makeItem('обгоревшая тетрадь');
  assert.ok(trophy.kind, 'у любого предмета есть вид');
  assert.strictEqual(E.itemVerb(trophy).length > 0, true, 'у предмета есть действие в интерфейсе');
});

test('предметы можно использовать: лечат, добавляют бонус, дают преимущество', () => {
  const g = newGame();
  g.hero.hp = 4;
  const potion = E.makeItem('бинт и зелье', { kind: 'heal', power: 3 });
  g.hero.inventory.push(potion);
  const healed = E.useItem(g, potion.id);
  assert.strictEqual(healed.ok, true);
  assert.strictEqual(g.hero.hp, 7, 'лечение сработало');
  assert.ok(!E.itemById(g, potion.id), 'предмет израсходован');

  const tool = E.makeItem('набор инструментов', { kind: 'boost', power: 2, stat: 'int' });
  g.hero.inventory.push(tool);
  E.useItem(g, tool.id);
  assert.strictEqual(g.hero.buff, 2);
  assert.strictEqual(g.hero.buffStat, 'int', 'бонус только к своей проверке');
  assert.strictEqual(g.hero.buffLabel, 'набор инструментов');

  const charm = E.makeItem('амулет-пустышка', { kind: 'advantage' });
  g.hero.inventory.push(charm);
  E.useItem(g, charm.id);
  assert.strictEqual(g.hero.advantage, true);

  const junk = E.makeItem('просто камень', { kind: 'trophy' });
  g.hero.inventory.push(junk);
  assert.strictEqual(E.useItem(g, junk.id).ok, false, 'у простой вещи эффекта нет');
  assert.strictEqual(E.itemById(g, junk.id).name, 'просто камень', 'и она остаётся в сумке');
});

test('предмет-ключ двигает веху, а старые сейвы со строками читаются', () => {
  const g = newGame();
  const key = E.makeItem('печать рода', { kind: 'key' });
  g.hero.inventory.push(key);
  const used = E.useItem(g, key.id);
  assert.strictEqual(used.ok, true);
  assert.ok(g.keysOpened >= 1, 'ключ открыл путь');
  assert.ok(E.arcOf(g), 'арка героя жива');

  const old = E.normalizeInventory(['верёвка с крюком', { name: 'зелье', kind: 'heal', power: 4, id: 'x1' }]);
  assert.strictEqual(old.length, 2);
  assert.strictEqual(old[0].kind, 'boost', 'старая строка стала предметом с эффектом');
  assert.strictEqual(old[1].power, 4, 'готовый предмет не потерял данные');
});

test('состояния меняют броски и проходят со временем', () => {
  const g = newGame();
  const notes = [];
  E.addState(g, 'wound', 2, notes);
  assert.strictEqual(E.stateMod(g, 'str'), -1, 'рана мешает силе');
  assert.strictEqual(E.stateMod(g, 'con'), -1);
  assert.strictEqual(E.stateMod(g, 'int'), 0, 'на ум рана не влияет');
  E.addState(g, 'fatigue', 2, notes);
  assert.strictEqual(E.stateMod(g, 'int'), -1, 'усталость мешает уму');
  E.addState(g, 'inspired', 2, notes);
  assert.strictEqual(E.stateMod(g, 'int'), 0, 'вдохновение складывается с усталостью');
  assert.strictEqual(E.stateMod(g, 'cha'), 1);
  assert.strictEqual(notes.length, 3, 'каждое состояние объяснено игроку');
  assert.match(E.stateLine(g), /Рана/);
  assert.strictEqual(E.tickStates(g), 0, 'в этот ход никто не истёк');
  E.tickStates(g); E.tickStates(g);
  assert.strictEqual(E.stateList(g).length, 0, 'состояния выветрились');
  E.removeState(g, 'wound');
  assert.strictEqual(E.hasState(g, 'wound'), false);
});

test('припасы: привал, перевязка и обход тратят запас, запас не уходит в минус', () => {
  const g = newGame();
  assert.strictEqual(E.suppliesOf(g), E.SUPPLIES_START);
  g.hero.hp = 3;
  const rest = E.restStop(g);
  assert.strictEqual(rest.ok, true);
  assert.strictEqual(E.suppliesOf(g) <= E.SUPPLIES_START - 1, true, 'ночёвка съела припас');
  assert.ok(g.hero.hp >= 5, 'силы вернулись');

  g.hero.hp = 2;
  E.addState(g, 'wound', 2);
  const heal = E.healStop(g);
  assert.strictEqual(heal.ok, true);
  assert.strictEqual(E.hasState(g, 'wound'), false, 'рана перевязана');
  assert.ok(g.hero.hp > 2);

  E.bypassDanger(g);
  assert.strictEqual(g.hero.advantage, true, 'обход даёт преимущество');

  g.hero.supplies = 0;
  assert.strictEqual(E.restStop(g).ok, false, 'без припасов ночевать не на чем');
  assert.strictEqual(E.suppliesOf(g), 0);
  E.addSupplies(g, 99);
  assert.strictEqual(E.suppliesOf(g), E.SUPPLIES_MAX, 'запас выше потолка не растёт');
});

test('знакомые: отношение и доверие, социальный бросок и помощь должника', () => {
  const g = newGame();
  g.memory.npcs.push({ name: 'Влас', role: 'трактирщик', attitude: '', relation: 'friend', trust: 4, seen: 1 });
  g.memory.npcs.push({ name: 'Стражник Гром', role: 'страж', attitude: '', relation: 'enemy', trust: 0, seen: 2 });

  const friend = E.npcInText(g, 'Уговорить Власа на ночлег');
  assert.ok(friend && friend.name === 'Влас', 'знакомый узнаётся по имени');
  const plan = E.socialPlan(g, 'Уговорить Власа на ночлег');
  assert.strictEqual(plan.relation, 'friend');
  assert.strictEqual(plan.dcShift, -4, 'другу легче');
  assert.match(plan.note, /легче на 4/);

  const enemy = E.socialPlan(g, 'Проверить, не врёт ли стражник Гром');
  assert.strictEqual(enemy.relation, 'enemy');
  assert.strictEqual(enemy.advantage, true, 'врага подозревать проще');
  assert.strictEqual(enemy.dcShift, 0, 'это не просьба, а слежка — сложность как обычно');

  const ask = E.socialPlan(g, 'Попросить стражника Грома о помощи');
  assert.strictEqual(ask.dcShift, 4, 'врагу труднее поверить');

  const help = E.callDebtor(g);
  assert.strictEqual(help.ok, true, 'должник пришёл на помощь');
  assert.strictEqual(g.hero.advantage, true);
  assert.strictEqual(E.callDebtor(g).ok, false, 'второй раз за кампанию — нет');
  assert.ok(g.memory.npcs.find(n => n.name === 'Влас').helped, 'помощь записана в память');
});

test('крит замечают, провал обходится дороже', () => {
  const g = newGame();
  g.memory.npcs.push({ name: 'Мара', role: 'караванщица', attitude: '', relation: 'neutral', trust: 2, seen: 1 });
  const notes = [];
  const thread = E.markNoticed(g, null, notes);
  assert.match(thread, /Мара/, 'нить ведёт к тому, кто видел успех');
  assert.strictEqual(E.trustOf(g.memory.npcs[0]), 3, 'доверие выросло');
  assert.ok(g.memory.threads.includes(thread), 'нить попала в память кампании');
  assert.ok(notes.some(n => n.type === 'thread'));
  assert.match(thread, /^Мара/, 'имя знакомого с большой буквы');

  g.hero.supplies = 2;
  assert.strictEqual(E.fumbleCost(g, notes), 'supplies', 'провал отнимает припасы');
  assert.strictEqual(E.suppliesOf(g), 1);
  g.hero.supplies = 0;
  assert.strictEqual(E.fumbleCost(g, notes), 'fatigue', 'без припасов провал оставляет усталость');
  assert.strictEqual(E.hasState(g, 'fatigue'), true);
});

test('ход мастера применяет припасы, состояния и предметы с эффектом', () => {
  const g = newGame();
  const notes = E.applyEffects(g, { hp: 0, supplies: -1, state: 'wound', give: { name: 'ключ-карта', kind: 'key' } });
  assert.strictEqual(E.suppliesOf(g), E.SUPPLIES_START - 1, 'припас потрачен по слову мастера');
  assert.strictEqual(E.hasState(g, 'wound'), true, 'состояние наложено');
  assert.ok(E.heroItems(g).some(i => i.kind === 'key'), 'предмет с эффектом в сумке');
  assert.ok(notes.some(n => n.type === 'item') && notes.some(n => n.type === 'supplies') && notes.some(n => n.type === 'state'),
    'игроку объяснили каждое изменение: ' + notes.map(n => n.type).join(', '));
  E.applyEffects(g, { fumble: true });
  assert.strictEqual(E.suppliesOf(g), E.SUPPLIES_START - 2, 'провал стоил ещё одного припаса');
  E.applyEffects(g, { noticed: true });
  assert.ok(g.memory.threads.length >= 1, 'крит оставил нить');
});

test('правила механики уходят мастеру в промпте', () => {
  const g = newGame();
  E.addState(g, 'wound', 2);
  const block = E.mechanicBlock(g);
  assert.match(block, /припас/i, 'мастер знает про припасы');
  assert.match(block, /Рана/, 'мастер знает про состояния');
  assert.match(block, /крит/i, 'мастер знает правило крита');
  assert.match(E.heroDescription(g), /Припасы: \d/, 'герой описан вместе с запасом');
  assert.match(E.SYSTEM_PROMPT, /effects\.supplies/, 'в контракте есть припасы');
  assert.match(E.SYSTEM_PROMPT, /npc\.trust|доверие/i, 'в контракте есть доверие');
});

test('старые сейвы поднимаются до схемы 4 без потери вещей', () => {
  const old = {
    schema: 3, turn: 3, log: [],
    hero: { name: 'Старый', classId: 'rogue', raceId: 'human', originId: 'streets', stats: { str: 1, agi: 2, con: 1, int: 1, per: 1, wit: 1, cha: 1 }, hp: 5, maxHp: 12, inventory: ['меч', 'фляга'] }
  };
  const g = E.migrate(old);
  assert.strictEqual(g.schema, E.SCHEMA_VERSION);
  assert.strictEqual(E.SCHEMA_VERSION, 4);
  assert.deepStrictEqual(E.heroItems(g).map(i => i.name), ['меч', 'фляга']);
  assert.strictEqual(E.suppliesOf(g), E.SUPPLIES_START, 'припасы добраны');
  assert.deepStrictEqual(g.hero.states, []);
  assert.strictEqual(E.stateMod(g, 'str'), 0);
});
