/**
 * Тесты мгновенного фона (v5): фигуры героя, врагов и предметов в кадре.
 * Канвас подменяется заглушкой — проверяем, что рисование не падает
 * и что в кадре действительно появляются фигуры.
 */
const test = require('node:test');
const assert = require('node:assert');
const B = require('../src/backdrop.js');

function stubCtx() {
  const calls = { fill: 0, stroke: 0, arc: 0, ellipse: 0, rect: 0, grad: 0, blur: 0 };
  const grad = { addColorStop() {} };
  const target = {
    calls,
    shadowBlur: 0,
    save() {}, restore() {}, beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, setTransform() {}, translate() {}, scale() {}, rotate() {},
    arc() { calls.arc++; }, ellipse() { calls.ellipse++; },
    fill() { calls.fill++; }, stroke() { calls.stroke++; },
    fillRect() { calls.rect++; }, strokeRect() {},
    createLinearGradient() { calls.grad++; return grad; },
    createRadialGradient() { calls.grad++; return grad; },
    fillText() {}, measureText() { return { width: 10 }; }
  };
  return new Proxy(target, {
    get: (t, k) => {
      if (k in t) return t[k];
      return undefined;
    },
    set: (t, k, v) => {
      if (k === 'shadowBlur' && v > 0) calls.blur++;
      t[k] = v;
      return true;
    }
  });
}

test('формы и предметы объявлены полностью', () => {
  assert.ok(Object.keys(B.ACTOR_SHAPES).length >= 7, 'формы: ' + Object.keys(B.ACTOR_SHAPES).join(','));
  assert.ok(Object.keys(B.PROPS).length >= 8, 'предметы: ' + Object.keys(B.PROPS).join(','));
  ['human', 'soldier', 'beast', 'monster', 'dragon', 'undead', 'construct'].forEach(k => {
    assert.strictEqual(typeof B.ACTOR_SHAPES[k], 'function', 'нет формы ' + k);
  });
  ['fire', 'cart', 'tent', 'ship', 'tower', 'statue', 'bridge', 'door'].forEach(k => {
    assert.strictEqual(typeof B.PROPS[k], 'function', 'нет предмета ' + k);
  });
});

test('каждая форма и предмет рисуются без ошибок', () => {
  const ctx = stubCtx();
  Object.keys(B.ACTOR_SHAPES).forEach(k => {
    const before = ctx.calls.fill;
    B.ACTOR_SHAPES[k](ctx, 10, 100, 60, { flip: true, weapon: 'sword', shield: true, cloak: true });
    assert.ok(ctx.calls.fill > before, 'форма ' + k + ' ничего не нарисовала');
  });
  Object.keys(B.PROPS).forEach(k => {
    const before = ctx.calls.fill + ctx.calls.rect;
    B.PROPS[k](ctx, 20, 120, 70, { dark: '#111', accent: '#7fd4a8' });
    assert.ok(ctx.calls.fill + ctx.calls.rect > before, 'предмет ' + k + ' ничего не нарисовал');
  });
});

test('в кадре появляются герой, враги и предметы', () => {
  const ctx = stubCtx();
  const rng = B.makeRng(7);
  const below = 120;
  B.drawActors(ctx, 448, 252, rng, { dark: '#06121a', accent: '#7fd4ff' }, {
    hero: { shape: 'soldier', weapon: 'sword', shield: true },
    enemies: ['dragon', 'monster', 'undead'],
    props: ['fire', 'cart', 'tower', 'ship']
  });
  assert.ok(ctx.calls.fill > 30, 'фигуры нарисованы: ' + ctx.calls.fill);
  assert.ok(ctx.calls.grad >= 2, 'вокруг фигур есть подсветка: ' + ctx.calls.grad);
  assert.ok(ctx.calls.blur >= 2, 'силуэты получают светящуюся кромку: ' + ctx.calls.blur);

  const empty = stubCtx();
  B.drawActors(empty, 448, 252, B.makeRng(7), { dark: '#000', accent: '#fff' }, { hero: { shape: 'human' }, enemies: [], props: [] });
  assert.ok(empty.calls.fill > 0, 'один герой тоже рисуется');
});

test('фон с фигурами рисуется целиком и не падает', () => {
  const canvas = {
    width: 0, height: 0, clientWidth: 448, clientHeight: 252,
    getContext: () => stubCtx()
  };
  ['forest', 'city', 'sea', 'ruins', 'space'].forEach(kind => {
    assert.doesNotThrow(() => B.draw(canvas, {
      kind, palette: ['#0d1f1c', '#1d4a3f', '#7fd4a8'], seed: 3,
      actors: { hero: { shape: 'human', weapon: 'staff' }, enemies: ['beast'], props: ['fire'] }
    }), 'фон ' + kind + ' упал');
  });
  assert.doesNotThrow(() => B.draw(canvas, { kind: 'city', palette: ['#101820', '#2f4f5a', '#9fe6d0'], seed: 1 }),
    'фон без фигур тоже работает');
});

test('незнакомая форма или предмет не ломают кадр', () => {
  const ctx = stubCtx();
  assert.doesNotThrow(() => B.drawActors(ctx, 400, 200, B.makeRng(1), { dark: '#000', accent: '#fff' },
    { hero: { shape: 'нет-такой-формы' }, enemies: ['тоже-нет'], props: ['нет-предмета'] }));
});

test('зерно фона воспроизводимо', () => {
  const a = B.makeRng(42), b = B.makeRng(42);
  const left = [a(), a(), a()], right = [b(), b(), b()];
  assert.deepStrictEqual(left, right, 'одинаковое зерно → одинаковая картинка');
  assert.ok(B.makeRng(43)() !== left[0], 'разное зерно → разная картинка');
});
