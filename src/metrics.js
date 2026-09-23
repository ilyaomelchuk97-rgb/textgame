/* ------------------------------------------------------------------ *
 * Метрики без слежки.
 *
 * Считаем только то, что помогает понять, что чинить: сколько ходов
 * прошло без внешнего канала, сколько занял кадр, как часто выпадали
 * криты. Всё живёт в localStorage этого телефона и никуда не уходит.
 * ------------------------------------------------------------------ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DTMetrics = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const KEY = 'dt2:metrics';
  const MAX_SAMPLES = 40;      // держим последние замеры, а не всю историю
  const MAX_DAYS = 60;

  function empty() {
    return { version: 1, turns: 0, offline: 0, images: 0, imageMs: [], crits: 0, fumbles: 0, games: 0, runs: 0, days: {}, lastAt: 0 };
  }

  function dayKey(ts) {
    const d = new Date(Number(ts) || Date.now());
    return d.toISOString().slice(0, 10);
  }

  /** Один ход: чей мастер вёл, был ли крит — и день, чтобы видеть привычку. */
  function addTurn(m, opts) {
    const o = opts || {};
    const out = Object.assign(empty(), m || {});
    out.turns += 1;
    out.lastAt = Date.now();
    if (o.offline) out.offline += 1;
    if (o.crit) out.crits += 1;
    if (o.fumble) out.fumbles += 1;
    const key = dayKey(o.at);
    out.days[key] = (out.days[key] || 0) + 1;
    const keys = Object.keys(out.days).sort();
    while (keys.length > MAX_DAYS) delete out.days[keys.shift()];
    return out;
  }

  /** Замер кадра: сколько миллисекунд ждал игрок. */
  function addImage(m, ms, opts) {
    const o = opts || {};
    const out = Object.assign(empty(), m || {});
    const value = Math.max(0, Math.round(Number(ms) || 0));
    if (value && !o.failed) {
      out.images += 1;
      out.imageMs = out.imageMs.concat([value]).slice(-MAX_SAMPLES);
    }
    out.lastAt = Date.now();
    return out;
  }

  function addGame(m) {
    const out = Object.assign(empty(), m || {});
    out.games += 1;
    out.lastAt = Date.now();
    return out;
  }

  /** Средний кадр: медиана честнее среднего — единичные 40 секунд не врут. */
  function median(list) {
    const arr = (list || []).filter(x => x > 0).sort((a, b) => a - b);
    if (!arr.length) return 0;
    const mid = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[mid] : Math.round((arr[mid - 1] + arr[mid]) / 2);
  }

  /** Человеческая сводка: её показываем в настройках. */
  function summary(m) {
    const out = Object.assign(empty(), m || {});
    const share = out.turns ? Math.round((out.offline / out.turns) * 100) : 0;
    const med = median(out.imageMs);
    const days = Object.keys(out.days).length;
    return {
      turns: out.turns,
      offlineTurns: out.offline,
      offlineShare: share,
      crits: out.crits,
      fumbles: out.fumbles,
      images: out.images,
      imageMedianMs: med,
      imageMedian: med ? (med / 1000).toFixed(1).replace('.', ',') + ' с' : '—',
      games: out.games,
      days: days,
      line: out.turns
        ? `ходов: ${out.turns}, из них без канала: ${out.offline} (${share}%) · ` +
          `критов ${out.crits}, провалов ${out.fumbles} · ` +
          `кадр обычно ${med ? (med / 1000).toFixed(1).replace('.', ',') + ' с' : '—'} · ` +
          `дней в игре: ${days}`
        : 'пока пусто: метрики появятся после первых ходов'
    };
  }

  return { KEY, empty, addTurn, addImage, addGame, summary, median, dayKey };
});
