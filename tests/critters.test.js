/**
 * Тесты мультяшных героев главного экрана (src/critters.js).
 * Проверяем, что рисунки и разметка на месте и что модуль не зависит
 * от DOM при загрузке (важно для однофайловой сборки и песочницы).
 */
const test = require('node:test');
const assert = require('node:assert');
const C = require('../src/critters.js');

test('модуль героев экспортирует рисунки и роли', () => {
  assert.strictEqual(typeof C.mount, 'function');
  assert.deepStrictEqual(C.ROLES, ['knight', 'dragon']);
});

test('рыцарь нарисован: шлем, щит, меч, плащ и два кадра ног', () => {
  const svg = C.knightSvg();
  ['art-steel', 'art-shield', 'art-star', 'art-plume', 'art-cloak', 'art-visor'].forEach(part => {
    assert.ok(svg.includes(part), 'нет детали ' + part);
  });
  assert.ok(svg.includes('legs--a') && svg.includes('legs--b'), 'нет двух кадров бега');
  assert.ok(svg.includes('<svg'), 'это не svg');
});

test('дракоша красный, с крыльями, рогами и зубом', () => {
  const svg = C.dragonSvg();
  ['art-dragon', 'art-wing', 'art-horn', 'art-tooth', 'art-claw', 'art-tail'].forEach(part => {
    assert.ok(svg.includes(part), 'нет детали ' + part);
  });
  assert.ok(svg.includes('legs--a') && svg.includes('legs--b'), 'нет двух кадров бега');
  assert.ok(/art-cheek/.test(svg), 'нет румянца — а он смешной');
});

test('в разметке героя нет внешних ссылок — работает без сети', () => {
  [C.knightSvg(), C.dragonSvg()].forEach(svg => {
    assert.ok(!/https?:|src=|href=/.test(svg), 'есть внешний ресурс');
  });
});

test('mount требует контейнер и не падает без него', () => {
  assert.strictEqual(C.mount(null), null);
  assert.strictEqual(C.mount(undefined), null);
});
