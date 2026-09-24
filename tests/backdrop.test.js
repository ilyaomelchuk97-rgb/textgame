/* Тесты пакета локальных фонов и слоёв сцены (п.13).
 * Локальный фон — единственный кадр, который есть всегда: и без ключа,
 * и без сети. Поэтому он должен покрывать места игры и быть детерминированным. */
const test = require('node:test');
const assert = require('node:assert');

const E = require('../src/engine.js');
const B = require('../src/backdrop.js');

test('пакет фонов: 24 основы, движок и рисовальщик знают одни и те же места', () => {
  const drawn = Object.keys(B.SILHOUETTES);
  assert.strictEqual(drawn.length, 24, 'основ должно быть 24: ' + drawn.join(', '));
  assert.strictEqual(B.KIND_COUNT, 24);
  E.SCENE_KINDS.forEach(kind => {
    assert.ok(drawn.indexOf(kind) >= 0, 'движок называет место «' + kind + '», а рисовать его нечем');
  });
  drawn.forEach(kind => {
    assert.ok(E.SCENE_KINDS.indexOf(kind) >= 0, 'основа «' + kind + '» никем не выбирается');
  });
});

test('каждое место из плана определяется по тексту сцены', () => {
  const cases = [
    ['Каньон, стены из красного камня', 'canyon'],
    ['Ночной рынок, фонари и прилавки', 'market'],
    ['На палубе корабля, скрипят снасти', 'ship'],
    ['Порт, краны и штабели контейнеров', 'port'],
    ['Трактир, стойка и кружки', 'tavern'],
    ['Вокзал, перрон и поезд', 'station'],
    ['Болото, коряги в тёмной воде', 'swamp'],
    ['Храм, колонны и алтарь', 'temple'],
    ['Поле боя, знамёна и вороны', 'battlefield'],
    ['Деревня, крыши и заборы', 'village'],
    ['Библиотека, стеллажи и лампа', 'library'],
    ['Мастерская, верстак и горн', 'workshop'],
    ['Крепость, стена с зубцами', 'keep'],
    ['Дорога в поля, верстовые столбы', 'road'],
    ['Мост через реку, фонари', 'bridge'],
    ['Пустыня и песчаные дюны', 'desert'],
    ['Снег и лёд', 'snow'],
    ['Чаща леса', 'forest'],
    ['Развалины храма', 'ruins'],
    ['Тёмная пещера', 'cave'],
    ['Неоновая улица', 'city'],
    ['Берег моря', 'sea'],
    ['Космическая станция, шлюз', 'space'],
    ['Комната в бункере', 'interior']
  ];
  cases.forEach(([text, kind]) => assert.strictEqual(E.sceneKindFromText(text), kind, text));
  assert.strictEqual(E.sceneKindFromText('непонятное место'), 'forest', 'незнакомое описание — лес по умолчанию');
});

test('слои сцены: время суток, погода и очаг читаются из рассказа', () => {
  const night = E.sceneLayersFromText('Ночной дождь на причале, у костра греется сторож');
  assert.strictEqual(night.daypart, 'night');
  assert.strictEqual(night.weather, 'rain');
  assert.strictEqual(night.fire, true);

  assert.strictEqual(E.sceneLayersFromText('Утро в тумане, тихая дорога').daypart, 'dawn');
  assert.strictEqual(E.sceneLayersFromText('Утро в тумане, тихая дорога').weather, 'fog');
  assert.strictEqual(E.sceneLayersFromText('Закат, гроза собирается над степью').daypart, 'dusk');
  assert.strictEqual(E.sceneLayersFromText('Закат, гроза собирается над степью').weather, 'storm');
  assert.strictEqual(E.sceneLayersFromText('Метель, ни зги не видно').weather, 'snow');
  assert.strictEqual(E.sceneLayersFromText('Пепел падает с неба').weather, 'ash');
  assert.strictEqual(E.sceneLayersFromText('Ясный полдень, ровная дорога').daypart, 'day');

  const plain = E.sceneLayersFromText('Ты выходишь на площадь');
  assert.strictEqual(plain.daypart, 'auto', 'без примет времени суток слой не навязывается');
  assert.strictEqual(plain.weather, 'auto');
  assert.strictEqual(plain.fire, false);
  assert.deepStrictEqual(E.sceneLayersFromText(null), { daypart: 'auto', weather: 'auto', fire: false });
});

test('слои уходят в промпт генератору, когда они есть', () => {
  const night = E.sceneLayersPrompt({ daypart: 'night', weather: 'rain', fire: true });
  assert.ok(/night/i.test(night), night);
  assert.ok(/rain/i.test(night), night);
  assert.ok(/firelight/i.test(night), night);
  assert.strictEqual(E.sceneLayersPrompt({ daypart: 'auto', weather: 'auto', fire: false }), '');
  assert.strictEqual(E.sceneLayersPrompt(null), '');
});

test('время суток перекрашивает палитру места, а не ломает её', () => {
  const read = color => (color[0] === '#'
    ? [1, 3, 5].map(i => parseInt(color.substr(i, 2), 16))
    : (color.match(/\d+/g) || [0, 0, 0]).map(Number));
  const lum = rgb => { const [r, g, b] = read(rgb); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const base = ['#101820', '#2f4f5a', '#9fe6d0'];
  const day = B.daypartPalette(base, 'day');
  const night = B.daypartPalette(base, 'night');
  const dusk = B.daypartPalette(base, 'dusk');
  assert.deepStrictEqual(day, base, 'день оставляет палитру как есть');
  assert.ok(lum(night[0]) < lum(day[0]), 'ночью небо темнее дня');
  assert.ok(read(dusk[1])[0] > read(day[1])[0], 'на закате средний слой теплее (больше красного)');
  assert.ok(read(night[2])[2] >= read(day[2])[2], 'ночной акцент уходит в холодную синеву');
});

test('погоды нарисованы все, включая ясную (пустой слой — это тоже слой)', () => {
  ['clear', 'rain', 'storm', 'snow', 'fog', 'ash', 'wind'].forEach(w => {
    assert.strictEqual(typeof B.WEATHERS[w], 'function', 'нет погоды ' + w);
  });
  assert.deepStrictEqual(Object.keys(B.WEATHERS).sort(), ['ash', 'clear', 'fog', 'rain', 'snow', 'storm', 'wind']);
  assert.strictEqual(E.WEATHER_KINDS.length, 8, 'auto + семь погод');
  assert.strictEqual(E.DAYPARTS.length, 5, 'auto + четыре времени суток');
});

test('фон сцены детерминирован: одно зерно — один рисунок', () => {
  const a = B.makeRng(4242), b = B.makeRng(4242), c = B.makeRng(4243);
  const seqA = [a(), a(), a()], seqB = [b(), b(), b()], seqC = [c(), c(), c()];
  assert.deepStrictEqual(seqA, seqB, 'одно зерно повторяется');
  assert.notDeepStrictEqual(seqA, seqC, 'другое зерно — другой рисунок');
  assert.ok(seqA.every(v => v >= 0 && v <= 1), 'шум живёт в диапазоне 0..1');
});
