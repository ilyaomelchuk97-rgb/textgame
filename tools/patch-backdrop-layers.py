# -*- coding: utf-8 -*-
"""Патч 2 (п.13): слои поверх основ — время суток, погода, костёр/очаг."""
import io, sys

path = '/home/user/src/backdrop.js'
src = io.open(path, encoding='utf-8').read()
orig = src

def sub_once(tag, old, new):
    global src
    n = src.count(old)
    if n != 1:
        print('ЯКОРЬ НЕ НАЙДЕН (%d): %s' % (n, tag)); sys.exit(1)
    src = src.replace(old, new)

# --- 1. частицы для новых основ
sub_once('KIND_PARTICLES',
u'''  const KIND_PARTICLES = {
    forest: 'embers', city: 'rain', ruins: 'dust', cave: 'dust',
    sea: 'rain', desert: 'dust', snow: 'snow', space: 'stars', interior: 'dust'
  };
''',
u'''  const KIND_PARTICLES = {
    forest: 'embers', city: 'rain', ruins: 'dust', cave: 'dust',
    sea: 'rain', desert: 'dust', snow: 'snow', space: 'stars', interior: 'dust',
    canyon: 'dust', market: 'embers', ship: 'rain', port: 'rain', tavern: 'embers',
    station: 'dust', swamp: 'fogdots', temple: 'dust', battlefield: 'embers',
    village: 'embers', library: 'dust', workshop: 'embers', keep: 'snow',
    road: 'dust', bridge: 'rain'
  };

  /** Погода: свой набор поверх основы. Явная погода перебивает «погоду места». */
  const WEATHERS = {
    clear: () => {},
    rain(ctx, w, h, rng) {
      ctx.strokeStyle = rgba('#cfe8ff', 0.34);
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 170; i++) {
        const x = rng() * w, y = rng() * h, l = 10 + rng() * 18;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + l); ctx.stroke();
      }
      const veil = ctx.createLinearGradient(0, 0, 0, h);
      veil.addColorStop(0, 'rgba(20,30,45,0.18)');
      veil.addColorStop(1, 'rgba(20,30,45,0.05)');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);
    },
    storm(ctx, w, h, rng) {
      WEATHERS.rain(ctx, w, h, rng);
      const veil = ctx.createLinearGradient(0, 0, 0, h);
      veil.addColorStop(0, 'rgba(12,16,28,0.34)');
      veil.addColorStop(1, 'rgba(12,16,28,0.12)');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);
      const flashes = 1 + Math.floor(rng() * 2);
      for (let i = 0; i < flashes; i++) {
        const fx = w * (0.15 + rng() * 0.7), fy = h * (0.05 + rng() * 0.25);
        const g = ctx.createRadialGradient(fx, fy, 1, fx, fy, w * 0.45);
        g.addColorStop(0, 'rgba(232,242,255,0.5)');
        g.addColorStop(0.4, 'rgba(200,220,255,0.16)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
    },
    snow(ctx, w, h, rng) {
      for (let i = 0; i < 150; i++) {
        ctx.fillStyle = rgba('#ffffff', 0.25 + rng() * 0.6);
        const r = rng() * 2.2 + 0.5;
        ctx.beginPath(); ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2); ctx.fill();
      }
      const veil = ctx.createLinearGradient(0, 0, 0, h);
      veil.addColorStop(0, 'rgba(226,238,255,0.16)');
      veil.addColorStop(1, 'rgba(226,238,255,0.04)');
      ctx.fillStyle = veil;
      ctx.fillRect(0, 0, w, h);
    },
    fog(ctx, w, h, rng) {
      for (let i = 0; i < 5; i++) {
        const fy = h * (0.35 + i * 0.13 + rng() * 0.04);
        const g = ctx.createLinearGradient(0, fy - h * 0.1, 0, fy + h * 0.1);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.5, rgba('#cfe0e8', 0.16 + rng() * 0.14));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, fy - h * 0.1, w, h * 0.2);
      }
    },
    ash(ctx, w, h, rng) {
      for (let i = 0; i < 120; i++) {
        ctx.fillStyle = rgba('#d9d2c6', 0.18 + rng() * 0.45);
        const r = rng() * 1.7 + 0.4;
        ctx.beginPath(); ctx.arc(rng() * w, rng() * h * 0.9, r, 0, Math.PI * 2); ctx.fill();
      }
    },
    wind(ctx, w, h, rng) {
      ctx.strokeStyle = rgba('#e8e2d0', 0.22);
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 40; i++) {
        const x = rng() * w, y = rng() * h, l = 18 + rng() * 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + l * 0.5, y - 6, x + l, y);
        ctx.stroke();
      }
    }
  };

  const FOG_DOTS = (ctx, w, h, rng) => {
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = rgba('#dfeaea', 0.06 + rng() * 0.14);
      const r = 6 + rng() * 22;
      ctx.beginPath(); ctx.arc(rng() * w, h * (0.5 + rng() * 0.5), r, 0, Math.PI * 2); ctx.fill();
    }
  };
''')

# --- 2. PARTICLES: добавить fogdots
sub_once('PARTICLES.fogdots',
u'''    embers: (ctx, w, h, rng) => {''',
u'''    fogdots: (ctx, w, h, rng) => { for (let i = 0; i < 70; i++) { ctx.fillStyle = rgba('#dfeaea', 0.05 + rng() * 0.12); const r = 5 + rng() * 20; ctx.beginPath(); ctx.arc(rng() * w, h * (0.45 + rng() * 0.55), r, 0, Math.PI * 2); ctx.fill(); } },
    embers: (ctx, w, h, rng) => {''')

# --- 3. время суток: таблица и функция поверх палитры
sub_once('DYPART блок',
u'''  /**
   * Рисует фон сцены на canvas.''',
u'''  /**
   * Время суток: мягко перекрашивает палитру места, не меняя сам рисунок.
   * Так один и тот же кадр читается как «утро», «закат» или «ночь».
   */
  const DAYPART_TINT = {
    auto: null,
    day: null,
    dawn: { bg: ['#2a2140', 0.5], mid: ['#c98a6a', 0.3], accent: ['#ffd9a8', 0.32] },
    dusk: { bg: ['#3a1c2c', 0.48], mid: ['#e0763c', 0.44], accent: ['#ffca7a', 0.4] },
    night: { bg: ['#070b18', 0.62], mid: ['#37406b', 0.55], accent: ['#9fc4ff', 0.42] }
  };

  function daypartPalette(palette, daypart) {
    const t = DAYPART_TINT[daypart];
    if (!t) return palette;
    const apply = (hex, rule) => (rule ? mix(hex, rule[0], rule[1]) : hex);
    return [apply(palette[0], t.bg), apply(palette[1], t.mid), apply(palette[2], t.accent)];
  }

  /** Костёр или очаг: тёплый свет у земли и искры вверх. */
  function fireLight(ctx, w, h, rng, col, time) {
    const fx = w * (0.26 + rng() * 0.12), fy = h * 0.88;
    const flick = 1 + Math.sin((time || 0) / 170) * 0.07;
    const radius = w * 0.34 * flick;
    const g = ctx.createRadialGradient(fx, fy, 2, fx, fy, radius);
    g.addColorStop(0, 'rgba(255,178,92,0.52)');
    g.addColorStop(0.4, 'rgba(255,126,48,0.2)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(fx - radius, fy - radius, radius * 2, radius * 2);
    // само пламя — небольшой треугольник с мягкой кромкой
    const fh = h * (0.1 + 0.035 * flick);
    ctx.beginPath();
    ctx.moveTo(fx - 10, fy);
    ctx.quadraticCurveTo(fx - 5, fy - fh * 0.6, fx, fy - fh);
    ctx.quadraticCurveTo(fx + 5, fy - fh * 0.6, fx + 10, fy);
    ctx.closePath();
    ctx.fillStyle = rgba('#ffd27a', 0.75);
    ctx.fill();
    for (let i = 0; i < 22; i++) {                             // искры
      const sx = fx + (rng() - 0.5) * 34, sy = fy - rng() * fh * 2.2;
      ctx.fillStyle = rgba('#ffbe6a', 0.25 + rng() * 0.55);
      ctx.beginPath();
      ctx.arc(sx, sy, 0.7 + rng() * 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Рисует фон сцены на canvas.''')

# --- 4. prepare: палитра по времени суток; вернуть daypart/weather/fire
sub_once('prepare палитра',
u'''    const palette = (o.palette && o.palette.length >= 3) ? o.palette : ['#101820', '#2f4f5a', '#9fe6d0'];
    const rng = makeRng(o.seed || 1);''',
u'''    const rawPalette = (o.palette && o.palette.length >= 3) ? o.palette : ['#101820', '#2f4f5a', '#9fe6d0'];
    const daypart = (o.daypart && o.daypart !== 'auto') ? o.daypart : 'auto';
    const palette = daypartPalette(rawPalette, daypart);
    const rng = makeRng(o.seed || 1);''')

sub_once('prepare return',
u'''    return { o, ctx, w, h, rng, kind, col };''',
u'''    return {
      o, ctx, w, h, rng, kind, col, daypart,
      weather: (o.weather && o.weather !== 'auto' && WEATHERS[o.weather]) ? o.weather : 'auto',
      fire: !!o.fire
    };''')

# --- 5. weather(): звёзды ночью и явная погода вместо «погоды места»
sub_once('weather слои',
u'''    (PARTICLES[KIND_PARTICLES[kind] || 'none'])(ctx, w, h, rng);
    const t = (o.time || 0) / 1000;''',
u'''    const P = prepare.lastWeather || {};
    if (P.weather && P.weather !== 'auto') WEATHERS[P.weather](ctx, w, h, rng);
    else (PARTICLES[KIND_PARTICLES[kind] || 'none'])(ctx, w, h, rng);
    if (P.daypart === 'night' && kind !== 'space') PARTICLES.stars(ctx, w, h * 0.6, rng);
    if (P.fire) fireLight(ctx, w, h, rng, col, o.time || 0);
    const t = (o.time || 0) / 1000;''')

# запомним активные слои для weather() — он не получает P
sub_once('weather подпись',
u'''  function weather(ctx, w, h, rng, col, kind, o) {''',
u'''  function weather(ctx, w, h, rng, col, kind, o) {
    prepare.lastWeather = { daypart: o.daypart, weather: o.weather, fire: o.fire };''')

# --- 6. draw(): передать слои в weather
sub_once('draw вызов weather',
u'''    weather(ctx, w, h, rng, col, kind, o);
    actorsLayer(ctx, w, h, rng, col, o);''',
u'''    weather(ctx, w, h, rng, col, kind, Object.assign({}, o, { daypart, weather: P.weather, fire: P.fire }));
    actorsLayer(ctx, w, h, rng, col, o);''')

sub_once('draw деструктуризация',
u'''    const { o, ctx, w, h, rng, kind, col } = P;

    // небо: два градиента + свечение светила''',
u'''    const { o, ctx, w, h, rng, kind, col, daypart } = P;

    // небо: два градиента + свечение светила''')

# --- 7. drawOver(): слои тоже
sub_once('drawOver вызов',
u'''    weather(ctx, w, h, rng, col, kind, Object.assign({}, o, { over: true }));''',
u'''    weather(ctx, w, h, rng, col, kind, Object.assign({}, o, { over: true, daypart: P.daypart, weather: P.weather, fire: P.fire }));''')

sub_once('drawOver деструктуризация',
u'''    const { o, ctx, w, h, rng, kind, col } = P;
    ctx.clearRect(0, 0, w, h);''',
u'''    const { o, ctx, w, h, rng, kind, col, daypart } = P;
    ctx.clearRect(0, 0, w, h);''')

# --- 8. экспорт слоёв
sub_once('export',
u'''  return { draw, drawOver, toDataUrl, makeRng, mix, shift, rgba, hexToRgb, KIND_PARTICLES, SILHOUETTES, ACTOR_SHAPES, PROPS, drawActors };''',
u'''  return {
    draw, drawOver, toDataUrl, makeRng, mix, shift, rgba, hexToRgb, daypartPalette, fireLight,
    KIND_PARTICLES, SILHOUETTES, ACTOR_SHAPES, PROPS, drawActors,
    WEATHERS, DAYPART_TINT, KIND_COUNT: Object.keys(SILHOUETTES).length
  };''')

io.open(path, 'w', encoding='utf-8').write(src)
print('OK: слои добавлены, было %d симв., стало %d' % (len(orig), len(src)))
