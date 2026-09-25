/* ------------------------------------------------------------------ *
 * Забег дня: один мир и одни броски на всех.
 *
 * Смысл режима — вернуться завтра и сравнить результат с другими.
 * Дата превращается в seed; из seed выводятся мир дня, герой дня,
 * цель дня и весь поток случайностей движка (кубик в том числе).
 * Поэтому у всех игроков планета одна и броски совпадают.
 *
 * Здесь нет ни DOM, ни сети: только чистые функции. Экран, облако и
 * запись результата живут в app.js и server.js.
 * ------------------------------------------------------------------ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DTDaily = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY = 'dt2:daily';                 // где лежат мои забеги
  const MAX_KEPT = 60;                     // держим два месяца истории

  /** Цели дня: короткие, конкретные и годятся любому миру. */
  const GOALS = [
    'Дожить до рассвета и узнать, кто отдал приказ.',
    'Вернуть чужой долг — и не потерять своё.',
    'Найти пропавшего и не стать следующим.',
    'Вынести оттуда то, что держат силой.',
    'Договориться с тем, с кем договориться нельзя.',
    'Довести спутника домой живым.',
    'Выяснить, кто врёт, и не выдать себя.',
    'Разорвать сделку, которую заключил не ты.',
    'Найти вход, о котором не знает никто.',
    'Спасти то, что ещё можно спасти.',
    'Забрать то, что охраняют лучше всего.',
    'Остановить то, что уже началось.'
  ];

  /* ---------------------------------------------------------- */
  /* Дата и seed                                                */
  /* ---------------------------------------------------------- */

  const pad = n => (n < 10 ? '0' : '') + n;

  /** Ключ дня по местному календарю игрока: «2026-09-24». */
  function dateKey(date) {
    const d = date instanceof Date ? date : new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** Сколько осталось до полуночи — забег дня меняется по календарю игрока. */
  function untilMidnight(date) {
    const d = date instanceof Date ? date : new Date();
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 0, 0);
    return Math.max(0, next.getTime() - d.getTime());
  }

  /** Хеш строки в 32 бита: одинаковый для всех, кто открыл игру в тот же день. */
  function hash(text) {
    let x = 2166136261;
    const s = String(text);
    for (let i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = (x + ((x << 1) + (x << 4) + (x << 7) + (x << 8) + (x << 24))) >>> 0;
    }
    return x >>> 0;
  }

  /** Seed дня: из него растёт всё остальное. */
  function seedFor(key) {
    return hash('dt2-daily:' + String(key)) % 2000000000;
  }

  /** Короткий код дня: «B7K3» — по нему видно, что играли в один день. */
  function code(seed) {
    const alphabet = 'ACDEFGHJKLMNPQRTUVWXYZ2346789';
    let x = (seed >>> 0) || 1;
    let out = '';
    for (let i = 0; i < 4; i++) {
      out += alphabet[x % alphabet.length];
      x = Math.floor(x / alphabet.length);
    }
    return out;
  }

  /** Генератор как в движке (mulberry32): поток одинаков у всех. */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const pickWith = (next, list) => (list && list.length ? list[Math.floor(next() * list.length) % list.length] : null);

  /**
   * Мир дня, герой дня и цель дня.
   * Списки приходят снаружи (движок), поэтому модуль не зависит от него.
   */
  function setup(key, lists) {
    const date = key || dateKey();
    const seed = seedFor(date);
    const next = rng(seed);
    const l = lists || {};
    const scenarios = (l.scenarios || []).filter(s => s && !s.custom && !s.customGame);
    const classes = l.classes || [];
    const races = l.races || [];
    const origins = l.origins || [];
    const scenario = pickWith(next, scenarios);
    // герой дня задан заранее: у всех одинаковая судьба, различает только имя
    const klass = pickWith(next, classes);
    const race = pickWith(next, races);
    const origin = pickWith(next, origins);
    const goal = pickWith(next, GOALS);
    return {
      date, seed, code: code(seed), goal,
      scenario, classId: klass ? klass.id : null, klass,
      raceId: race ? race.id : null, race,
      originId: origin ? origin.id : null, origin
    };
  }

  /* ---------------------------------------------------------- */
  /* Счёт                                                       */
  /* ---------------------------------------------------------- */

  const LIMITS = { wins: 120, end: 30, hp: 6, supplies: 4, item: 5, crit: 12, fumble: 5, pace: 40 };

  /**
   * Счёт забега: цель важнее всего, дальше — как дошёл.
   * Все слагаемые видны игроку списком, чтобы не было «откуда столько».
   */
  function score(run) {
    const r = run || {};
    const num = v => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
    const victory = !!r.victory;
    const hp = num(r.hp);
    const supplies = num(r.supplies);
    const items = num(r.items);
    const crits = num(r.crits);
    const fumbles = num(r.fumbles);
    const turns = Math.max(1, num(r.turns) || 1);
    const rows = [
      { icon: '🏁', label: victory ? 'цель дня взята' : 'финал без цели дня', value: victory ? LIMITS.wins : LIMITS.end },
      { icon: '❤️', label: 'жизнь на финале (' + hp + ')', value: hp * LIMITS.hp },
      { icon: '🎒', label: 'припасы (' + supplies + ')', value: supplies * LIMITS.supplies },
      { icon: '🧰', label: 'предметы (' + items + ')', value: items * LIMITS.item },
      { icon: '🌟', label: 'криты (' + crits + ')', value: crits * LIMITS.crit },
      { icon: '💀', label: 'провалы (' + fumbles + ')', value: -fumbles * LIMITS.fumble },
      { icon: '⏱', label: 'темп: ходов ' + turns, value: Math.max(0, LIMITS.pace - 2 * turns) }
    ].filter(row => row.value !== 0);
    const total = rows.reduce((sum, row) => sum + row.value, 0);
    return { total: Math.max(0, total), rows, victory, turns };
  }

  /** Итог дня: сколько прошли, средний и лучший результат, где моя строка. */
  function summary(runs, mine) {
    const list = (runs || []).filter(r => r && Number.isFinite(Number(r.score)));
    if (!list.length) return { runs: 0, best: 0, avg: 0, place: 0 };
    const sum = list.reduce((acc, r) => acc + Number(r.score), 0);
    const best = list.reduce((acc, r) => Math.max(acc, Number(r.score)), 0);
    let place = 0;
    if (Number.isFinite(Number(mine))) {
      const better = list.filter(r => Number(r.score) > Number(mine)).length;
      place = better + 1;
    }
    return { runs: list.length, best, avg: Math.round(sum / list.length), place };
  }

  /* ---------------------------------------------------------- */
  /* Мои забеги в памяти браузера                               */
  /* ---------------------------------------------------------- */

  /** Запись результата: { date: {score, turns, victory, at, code} }. */
  function remember(store, entry) {
    const all = Object.assign({}, store || {});
    if (!entry || !entry.date) return all;
    all[entry.date] = {
      score: Math.max(0, Math.round(Number(entry.score) || 0)),
      turns: Math.max(1, Math.round(Number(entry.turns) || 1)),
      victory: !!entry.victory,
      code: entry.code || '',
      at: entry.at || Date.now()
    };
    return trim(all);
  }

  /** Оставляем только свежие дни: хранилище не должно расти бесконечно. */
  function trim(all) {
    const keys = Object.keys(all).sort().reverse();
    if (keys.length <= MAX_KEPT) return all;
    const fresh = {};
    keys.slice(0, MAX_KEPT).forEach(k => { fresh[k] = all[k]; });
    return fresh;
  }

  /** Лучший забег за всё время. */
  function bestOf(store) {
    const all = store || {};
    let best = null;
    Object.keys(all).forEach(date => {
      const e = all[date];
      if (!e) return;
      if (!best || e.score > best.score || (e.score === best.score && e.at > best.at)) {
        best = Object.assign({ date }, e);
      }
    });
    return best;
  }

  /** Сколько дней подряд играл: серия — хороший повод вернуться. */
  function streak(store, today) {
    const all = store || {};
    const start = today || dateKey();
    const d = new Date(start + 'T12:00:00');
    if (isNaN(d.getTime())) return 0;
    let count = 0;
    while (all[dateKey(d)]) {
      count += 1;
      d.setDate(d.getDate() - 1);
      if (count > 400) break;
    }
    return count;
  }

  /** Строка для показа: «312 очков · цель взята · 9 ходов». */
  function line(entry) {
    if (!entry) return '';
    const marks = [String(entry.score) + ' очков'];
    marks.push(entry.victory ? 'цель дня взята' : 'без цели дня');
    marks.push(entry.turns + ' ходов');
    return marks.join(' · ');
  }

  return {
    KEY, GOALS, LIMITS,
    dateKey, untilMidnight, hash, seedFor, code, rng, setup,
    score, summary, remember, trim, bestOf, streak, line
  };
});
