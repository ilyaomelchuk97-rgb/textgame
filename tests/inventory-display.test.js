const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../src/engine.js');

const app = fs.readFileSync(path.join(__dirname, '..', 'src', 'app.js'), 'utf8');

test('inventory names are extracted from strings, item objects, and nested AI item objects', () => {
  const inventory = E.normalizeInventory([
    'Медальон волка',
    { name: 'Зелье здоровья', kind: 'heal', power: 3 },
    { item: { title: 'Старинный ключ', kind: 'key', power: 1 }, icon: '🗝️' },
    { title: '[object Object]' }
  ]);
  assert.deepEqual(E.inventoryNames(inventory), ['Медальон волка', 'Зелье здоровья', 'Старинный ключ']);
  assert.equal(inventory[1].kind, 'heal');
  assert.equal(inventory[2].kind, 'key');
});

test('hero inventory display and narrative prompts show item names, not JavaScript object labels', () => {
  assert.match(app, /const inventoryText = E\.inventoryNames\(hh\.inventory\)\.join\(', '\) \|\| 'Пусто'/);
  assert.match(app, /text: inventoryText/);

  const game = E.createGame({ scenarioId: 'asgeld', heroName: 'Искра' });
  game.hero.inventory = E.normalizeInventory([{ title: 'Солнечный амулет' }, { item: 'Красное зелье', kind: 'heal' }]);
  const description = E.heroDescription(game);
  const backstory = E.offlineBackstory(game);
  assert.match(description, /Солнечный амулет, Красное зелье/);
  assert.match(backstory, /Солнечный амулет, Красное зелье/);
  assert.doesNotMatch(description + backstory, /\[object Object\]/);
});

test('legacy migration cleans malformed inventory entries while preserving valid item data', () => {
  const game = E.createGame({ scenarioId: 'asgeld', heroName: 'Искра' });
  game.hero.inventory = [
    { name: 'Лекарственная трава', kind: 'heal', power: 2, id: 'herb-1' },
    { title: '[object Object]' }
  ];
  const migrated = E.migrate(game);
  assert.deepEqual(E.inventoryNames(migrated.hero.inventory), ['Лекарственная трава']);
  assert.equal(migrated.hero.inventory[0].id, 'herb-1');
  assert.equal(migrated.hero.inventory[0].kind, 'heal');
});
