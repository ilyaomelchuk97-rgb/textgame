/**
 * tests/daily.test.js — забег дня (п.37).
 *
 * Проверяем главное обещание режима: у всех игроков один и тот же день.
 * Значит, от даты до кубика всё должно быть воспроизводимо, а счёт —
 * объяснимым: цель дня дороже всего, темп и здоровье — добавка.
 */
const test = require('node:test');
const assert = require('node:assert');
const Daily = require('../src/daily.js');
const E = require('../src/engine.js');

const LISTS = {
  scenarios: E.SCENARIOS,
  classes: E.CLASSES,
  races: E.RACES,
  origins: E.ORIGINS
};

test('ключ дня собирается из местной даты', () => {
  assert.equal(Daily.dateKey(new Date(2026, 8, 24, 23, 59)), '2026-09-24');
  assert.equal(Daily.dateKey(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
  assert.equal(Daily.dateKey(new Date(2026, 11, 31, 12, 0)), '2026-12-31');
});

test('до полуночи остаётся меньше суток и не меньше нуля', () => {
  const left = Daily.untilMidnight(new Date(2026, 8, 24, 23, 0));
  assert.ok(left > 0 && left <= 3600000, 'у 23:00 остался час: ' + left);
  assert.equal(Daily.untilMidnight(new Date(2026, 8, 24, 0, 0)), 24 * 3600000);
});

test('seed дня одинаков у всех, но разный в разные дни', () => {
  const a = Daily.seedFor('2026-09-24');
  const b = Daily.seedFor('2026-09-24');
  const c = Daily.seedFor('2026-09-25');
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.ok(a >= 0, 'seed неотрицательный');
});

test('код дня — четыре знака без похожих букв', () => {
  const code = Daily.code(Daily.seedFor('2026-09-24'));
  assert.match(code, /^[ACDEFGHJKLMNPQRTUVWXYZ2346789]{4}$/);
  assert.equal(code, Daily.code(Daily.seedFor('2026-09-24')));
  assert.notEqual(code, Daily.code(Daily.seedFor('2026-09-25')));
});

test('мир, герой и цель дня воспроизводятся из даты', () => {
  const a = Daily.setup('2026-09-24', LISTS);
  const b = Daily.setup('2026-09-24', LISTS);
  assert.equal(a.code, b.code);
  assert.equal(a.scenario.id, b.scenario.id);
  assert.equal(a.classId, b.classId);
  assert.equal(a.raceId, b.raceId);
  assert.equal(a.originId, b.originId);
  assert.equal(a.goal, b.goal);
  assert.ok(Daily.GOALS.includes(a.goal));
  assert.ok(E.SCENARIOS.some(s => s.id === a.scenario.id));
  assert.ok(E.CLASSES.some(c => c.id === a.classId));
});

test('в разные дни выпадает разное', () => {
  const days = ['2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28'];
  const picks = days.map(d => {
    const s = Daily.setup(d, LISTS);
    return [s.scenario.id, s.classId, s.goal].join('|');
  });
  assert.ok(new Set(picks).size >= 4, 'за пять дней подборы не должны повторяться: ' + picks.join(' / '));
});

test('зерно дня даёт одинаковый поток случайностей', () => {
  const one = Daily.rng(12345);
  const two = Daily.rng(12345);
  const three = Daily.rng(12346);
  const a = [one(), one(), one()];
  const b = [two(), two(), two()];
  const c = [three(), three(), three()];
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  assert.ok(a.every(x => x >= 0 && x < 1));
});

test('кубик с зерном дня даёт одни и те же броски — «одни броски у всех»', () => {
  const rolls = [];
  for (let i = 0; i < 3; i++) {
    E.rnd.setDiceSeed(4242);
    rolls.push([1, 2, 3, 4, 5].map(() => E.resolveCheck({ stat: 'str', dc: 12, bonus: 2 }).roll));
    E.rnd.clearDiceSeed();
  }
  assert.deepEqual(rolls[0], rolls[1], 'два запуска с одним зерном — один и тот же кубик');
  for (const run of rolls) {
    assert.equal(run.length, 5);
    assert.ok(run.every(v => v >= 1 && v <= 20), 'кубик не выходит за пределы d20: ' + run.join(','));
  }
  const other = (() => {
    E.rnd.setDiceSeed(4243);
    const out = [1, 2, 3, 4, 5].map(() => E.resolveCheck({ stat: 'str', dc: 12, bonus: 2 }).roll);
    E.rnd.clearDiceSeed();
    return out;
  })();
  assert.notDeepEqual(rolls[0], other, 'другое зерно — другой поток');
});

test('сторонняя случайность (кадры, подборы) не сдвигает броски', () => {
  const seed = Daily.seedFor('2026-09-24');
  E.rnd.setDiceSeed(seed);
  const clean = [1, 2, 3].map(() => E.resolveCheck({ stat: 'wit', dc: 11, bonus: 1 }).roll);
  E.rnd.clearDiceSeed();
  E.rnd.setDiceSeed(seed);
  E.rnd.int(1, 100);               // так движок выбирает промпт кадра, реплики и прочее
  E.rnd.pick([1, 2, 3]);
  E.rnd.shuffle([1, 2, 3, 4]);
  const noisy = [1, 2, 3].map(() => E.resolveCheck({ stat: 'wit', dc: 11, bonus: 1 }).roll);
  E.rnd.clearDiceSeed();
  assert.deepEqual(clean, noisy, 'броски одинаковы, хотя между ними шла посторонняя случайность');
});

test('без зерна дня кубик снова вольный', () => {
  E.rnd.clearDiceSeed();
  assert.equal(E.rnd.diceSeeded, false);
  assert.equal(E.rnd.seeded, false);
  const free = [1, 2, 3, 4, 5].map(() => E.resolveCheck({ stat: 'str', dc: 12 }).roll);
  assert.ok(free.every(v => v >= 1 && v <= 20));
  E.rnd.setSeed(777);
  assert.deepEqual([1, 2, 3].map(() => E.rnd.int(1, 20)), (() => {
    E.rnd.setSeed(777);
    return [1, 2, 3].map(() => E.rnd.int(1, 20));
  })(), 'общий генератор тоже слушается зерна, когда его просят');
  E.rnd.clearSeed();
});

test('счёт: цель дня дороже всего остального', () => {
  const won = Daily.score({ victory: true, hp: 10, supplies: 4, items: 2, crits: 1, fumbles: 0, turns: 6 });
  const lost = Daily.score({ victory: false, hp: 10, supplies: 4, items: 2, crits: 1, fumbles: 0, turns: 6 });
  assert.ok(won.total > lost.total);
  assert.equal(won.total - lost.total, Daily.LIMITS.wins - Daily.LIMITS.end);
  assert.equal(won.victory, true);
});

test('счёт: жизнь, припасы, предметы и криты добавляют, провалы снимают', () => {
  const base = Daily.score({ victory: false, hp: 5, supplies: 2, items: 1, crits: 1, fumbles: 0, turns: 10 });
  const hurt = Daily.score({ victory: false, hp: 1, supplies: 2, items: 1, crits: 1, fumbles: 0, turns: 10 });
  assert.equal(base.total - hurt.total, 4 * Daily.LIMITS.hp);
  const clumsy = Daily.score({ victory: false, hp: 5, supplies: 2, items: 1, crits: 1, fumbles: 2, turns: 10 });
  assert.ok(clumsy.total < base.total);
  const fast = Daily.score({ victory: false, hp: 5, supplies: 2, items: 1, crits: 1, fumbles: 0, turns: 3 });
  assert.ok(fast.total > base.total, 'быстрый забег ценнее долгого');
});

test('счёт никогда не отрицательный и раскладывается на строки', () => {
  const bad = Daily.score({ victory: false, hp: 0, supplies: 0, items: 0, crits: 0, fumbles: 20, turns: 60 });
  assert.equal(bad.total, 0);
  const good = Daily.score({ victory: true, hp: 12, supplies: 6, items: 3, crits: 2, fumbles: 0, turns: 8 });
  const sum = good.rows.reduce((acc, r) => acc + r.value, 0);
  assert.equal(sum, good.total);
  assert.ok(good.rows.every(r => r.label && Number.isFinite(r.value)));
});

test('доска дня: сколько прошли, лучший, средний и место', () => {
  const board = Daily.summary([{ score: 100 }, { score: 300 }, { score: 200 }], 200);
  assert.equal(board.runs, 3);
  assert.equal(board.best, 300);
  assert.equal(board.avg, 200);
  assert.equal(board.place, 2);
  assert.equal(Daily.summary([], 100).runs, 0);
});

test('мои забеги: запись дня заменяется, хранилище не растёт бесконечно', () => {
  let store = Daily.remember({}, { date: '2026-09-24', score: 120, turns: 8, victory: false });
  assert.equal(Daily.line(store['2026-09-24']), '120 очков · без цели дня · 8 ходов');
  store = Daily.remember(store, { date: '2026-09-24', score: 340, turns: 5, victory: true });
  assert.equal(Object.keys(store).length, 1, 'в один день хранится последний забег');
  assert.equal(store['2026-09-24'].score, 340);
  for (let i = 0; i < 200; i++) {
    const d = new Date(2026, 0, 1 + i);
    store = Daily.remember(store, { date: Daily.dateKey(d), score: i, turns: 3, victory: false });
  }
  assert.ok(Object.keys(store).length <= 60, 'держим не больше двух месяцев: ' + Object.keys(store).length);
});

test('лучший забег и серия дней', () => {
  const store = {
    '2026-09-22': { score: 90, turns: 9, victory: false, at: 1 },
    '2026-09-23': { score: 250, turns: 6, victory: true, at: 2 },
    '2026-09-24': { score: 180, turns: 7, victory: false, at: 3 }
  };
  assert.equal(Daily.bestOf(store).date, '2026-09-23');
  assert.equal(Daily.bestOf(store).score, 250);
  assert.equal(Daily.bestOf({}), null);
  assert.equal(Daily.streak(store, '2026-09-24'), 3);
  assert.equal(Daily.streak(store, '2026-09-25'), 0, 'сегодня ещё не играли — серия не идёт');
  assert.equal(Daily.streak({}, '2026-09-24'), 0);
});
