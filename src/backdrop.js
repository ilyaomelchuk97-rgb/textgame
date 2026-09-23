/* ============================================================
 * Dice Tales — backdrop.js
 * Мгновенный фон сцены: рисуется на canvas за пару миллисекунд,
 * пока в фоне грузится картинка от ИИ (12–40 с).
 * Никаких внешних ресурсов: всё считается по палитре мира,
 * типу локации и зерну сцены.
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DTBackdrop = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------- */
  /* Мелкая утилита: детерминированный шум по зерну              */
  /* ---------------------------------------------------------- */
  function makeRng(seed) {
    let s = (seed | 0) || 1;
    return function next() {
      s ^= s << 13; s |= 0;
      s ^= s >>> 17;
      s ^= s << 5; s |= 0;
      return ((s >>> 0) % 100000) / 100000;
    };
  }

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const num = parseInt(full || '223344', 16);
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }
  const rgba = (hex, a) => {
    const c = hexToRgb(hex);
    return 'rgba(' + c.r + ',' + c.g + ',' + c.b + ',' + a + ')';
  };
  function mix(hexA, hexB, t) {
    const a = hexToRgb(hexA), b = hexToRgb(hexB);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return 'rgb(' + r + ',' + g + ',' + bl + ')';
  }
  const shift = (hex, amount) => {
    const c = hexToRgb(hex);
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
    return 'rgb(' + clamp(c.r + amount) + ',' + clamp(c.g + amount) + ',' + clamp(c.b + amount) + ')';
  };

  /* ---------------------------------------------------------- */
  /* Силуэты: каждый вид локации — своя функция слоя            */
  /* ctx, w, h, rng, colors(sky, mid, accent), depth(0..1)      */
  /* ---------------------------------------------------------- */
  const SILHOUETTES = {
    forest(ctx, w, h, rng, col, depth) {
      const base = h * (0.55 + depth * 0.35);
      for (let layer = 0; layer < 3; layer++) {
        ctx.fillStyle = rgba(col.dark, 0.5 + layer * 0.2);
        const trees = 7 + Math.floor(rng() * 6);
        const spread = w / trees;
        for (let i = 0; i <= trees; i++) {
          const x = i * spread + (rng() - 0.5) * spread * 0.9;
          const th = base + (rng() - 0.5) * h * 0.22 - layer * h * 0.05;
          const trunk = 2 + rng() * 5 + layer;
          ctx.beginPath();
          ctx.moveTo(x - trunk, h);
          ctx.lineTo(x - trunk * 0.4, th);
          ctx.lineTo(x + trunk * 0.4, th);
          ctx.lineTo(x + trunk, h);
          ctx.closePath();
          ctx.fill();
          // ветви
          for (let b = 0; b < 3 + Math.floor(rng() * 3); b++) {
            const by = th + rng() * (h - th) * 0.5;
            const len = spread * (0.4 + rng() * 0.5);
            ctx.lineWidth = 1 + rng() * 2;
            ctx.strokeStyle = rgba(col.dark, 0.35 + layer * 0.15);
            ctx.beginPath();
            ctx.moveTo(x, by);
            ctx.lineTo(x + (rng() > 0.5 ? len : -len), by - len * 0.35);
            ctx.stroke();
          }
        }
      }
    },
    city(ctx, w, h, rng, col, depth) {
      ctx.fillStyle = rgba(col.dark, 0.85);
      let x = -20;
      while (x < w + 20) {
        const bw = 26 + rng() * 60;
        const bh = h * (0.25 + rng() * 0.55) * (0.6 + depth * 0.5);
        ctx.fillRect(x, h - bh, bw, bh);
        // окна
        const cols = Math.max(1, Math.floor(bw / 12));
        const rows = Math.max(1, Math.floor(bh / 16));
        for (let cx = 0; cx < cols; cx++) {
          for (let cy = 0; cy < rows; cy++) {
            if (rng() < 0.28) {
              ctx.fillStyle = rgba(col.accent, 0.18 + rng() * 0.5);
              ctx.fillRect(x + 4 + cx * 12, h - bh + 6 + cy * 16, 5, 7);
              ctx.fillStyle = rgba(col.dark, 0.85);
            }
          }
        }
        x += bw + 3 + rng() * 12;
      }
    },
    ruins(ctx, w, h, rng, col, depth) {
      const base = h * 0.78;
      ctx.fillStyle = rgba(col.dark, 0.9);
      for (let i = 0; i < 8; i++) {
        const cw = 18 + rng() * 26;
        const ch = 40 + rng() * (h * 0.4);
        const x = rng() * (w - cw);
        ctx.fillRect(x, base - ch * (0.6 + depth * 0.5), cw, ch);
      }
      // арки
      ctx.strokeStyle = rgba(col.dark, 0.95);
      ctx.lineWidth = 10 + rng() * 6;
      for (let i = 0; i < 2 + Math.floor(rng() * 2); i++) {
        const cx = w * (0.2 + rng() * 0.6), r = 40 + rng() * 70;
        ctx.beginPath();
        ctx.arc(cx, base, r, Math.PI, 0);
        ctx.stroke();
      }
    },
    cave(ctx, w, h, rng, col, depth) {
      ctx.fillStyle = rgba(col.dark, 0.95);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= w; x += w / 14) {
        const y = 20 + Math.abs(Math.sin(x * 0.01 + rng())) * h * 0.28 * (0.6 + depth);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(w, 0); ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 12) {
        ctx.lineTo(x, h - 10 - rng() * h * 0.16);
      }
      ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      // сталактиты
      ctx.strokeStyle = rgba(col.dark, 0.8);
      ctx.lineWidth = 3;
      for (let i = 0; i < 12; i++) {
        const x = rng() * w, len = 12 + rng() * 60;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, len); ctx.stroke();
      }
    },
    sea(ctx, w, h, rng, col, depth) {
      const horizon = h * (0.52 + depth * 0.1);
      // волны
      for (let layer = 0; layer < 4; layer++) {
        ctx.fillStyle = rgba(col.dark, 0.18 + layer * 0.16);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 8) {
          const y = horizon + layer * h * 0.09 + Math.sin(x * 0.05 + layer * 1.7 + rng()) * 4;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      }
      // силуэт корабля
      ctx.fillStyle = rgba(col.dark, 0.9);
      const sx = w * (0.25 + rng() * 0.4), sw = w * 0.22;
      ctx.beginPath();
      ctx.moveTo(sx - sw / 2, horizon);
      ctx.lineTo(sx + sw / 2, horizon);
      ctx.lineTo(sx + sw / 2 - 12, horizon + 12);
      ctx.lineTo(sx - sw / 2 + 12, horizon + 12);
      ctx.closePath(); ctx.fill();
      ctx.fillRect(sx - 2, horizon - h * 0.16, 3, h * 0.16);
      ctx.beginPath();
      ctx.moveTo(sx, horizon - h * 0.16);
      ctx.lineTo(sx + sw * 0.28, horizon - h * 0.08);
      ctx.lineTo(sx, horizon - h * 0.02);
      ctx.closePath();
      ctx.fillStyle = rgba(col.accent, 0.35);
      ctx.fill();
    },
    desert(ctx, w, h, rng, col, depth) {
      for (let layer = 0; layer < 4; layer++) {
        ctx.fillStyle = rgba(mix(col.dark, col.accent, 0.15 * layer), 0.85 - layer * 0.1);
        ctx.beginPath();
        ctx.moveTo(0, h);
        const off = h * (0.5 + layer * 0.12);
        for (let x = 0; x <= w; x += 10) {
          ctx.lineTo(x, off + Math.sin(x * 0.012 + layer) * 18 + rng() * 3);
        }
        ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
      }
      // скалы
      ctx.fillStyle = rgba(col.dark, 0.85);
      for (let i = 0; i < 3; i++) {
        const bx = rng() * w, bw = 14 + rng() * 30, bh = 24 + rng() * 60;
        ctx.beginPath();
        ctx.moveTo(bx - bw / 2, h * 0.62);
        ctx.lineTo(bx, h * 0.62 - bh);
        ctx.lineTo(bx + bw / 2, h * 0.62);
        ctx.closePath(); ctx.fill();
      }
    },
    snow(ctx, w, h, rng, col, depth) {
      ctx.fillStyle = rgba(col.dark, 0.8);
      // горы
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-20 + i * w * 0.4, h * 0.72);
        ctx.lineTo(w * (0.15 + i * 0.35), h * (0.25 + rng() * 0.2));
        ctx.lineTo(w * (0.35 + i * 0.4), h * 0.72);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgba(col.accent, 0.25);
        ctx.beginPath();
        ctx.moveTo(w * (0.08 + i * 0.35), h * (0.33 + rng() * 0.1));
        ctx.lineTo(w * (0.15 + i * 0.35), h * (0.25 + rng() * 0.12));
        ctx.lineTo(w * (0.22 + i * 0.35), h * (0.33 + rng() * 0.1));
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = rgba(col.dark, 0.8);
      }
    },
    space(ctx, w, h, rng, col, depth) {
      // планета
      const px = w * (0.65 + rng() * 0.2), py = h * (0.3 + rng() * 0.2), pr = 40 + rng() * 60;
      const g = ctx.createRadialGradient(px - pr * 0.3, py - pr * 0.3, pr * 0.1, px, py, pr);
      g.addColorStop(0, rgba(col.mid, 0.95));
      g.addColorStop(1, rgba(col.dark, 0.95));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(px, py, pr, 0, Math.PI * 2); ctx.fill();
      // обломки станции
      ctx.fillStyle = rgba(col.dark, 0.9);
      const sx = w * (0.12 + rng() * 0.2), sy = h * (0.45 + rng() * 0.2);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(rng() * 0.6 - 0.3);
      ctx.fillRect(-w * 0.12, -10, w * 0.24, 20);
      ctx.fillRect(-w * 0.05, -26, w * 0.1, 52);
      ctx.restore();
    },
    interior(ctx, w, h, rng, col, depth) {
      // перспектива коридора
      const vx = w * (0.4 + rng() * 0.2), vy = h * 0.48;
      ctx.strokeStyle = rgba(col.accent, 0.18);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 9; i++) {
        const t = i / 9;
        const rx = w * (0.5 - t * 0.42), ry = h * (0.5 - t * 0.44);
        ctx.strokeRect(vx - rx, vy - ry, rx * 2, ry * 2);
      }
      // двери
      ctx.fillStyle = rgba(col.dark, 0.85);
      for (let i = 0; i < 4; i++) {
        const t = 0.15 + i * 0.2;
        ctx.fillRect(vx - w * (0.5 - t * 0.42), vy - 18 * (1 - t), 10, 36 * (1 - t));
        ctx.fillRect(vx + w * (0.5 - t * 0.42) - 10, vy - 18 * (1 - t), 10, 36 * (1 - t));
      }
      // свечение в конце
      const g = ctx.createRadialGradient(vx, vy, 2, vx, vy, w * 0.2);
      g.addColorStop(0, rgba(col.accent, 0.5));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  };

  const PARTICLES = {
    snow: (ctx, w, h, rng) => { for (let i = 0; i < 120; i++) { ctx.fillStyle = rgba('#ffffff', 0.2 + rng() * 0.6); const r = rng() * 1.8 + 0.4; ctx.beginPath(); ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2); ctx.fill(); } },
    rain: (ctx, w, h, rng) => { ctx.strokeStyle = rgba('#cfe8ff', 0.25); ctx.lineWidth = 1; for (let i = 0; i < 90; i++) { const x = rng() * w, y = rng() * h, l = 6 + rng() * 12; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + l); ctx.stroke(); } },
    dust: (ctx, w, h, rng) => { for (let i = 0; i < 140; i++) { ctx.fillStyle = rgba('#ffdda8', 0.08 + rng() * 0.22); const r = rng() * 1.6 + 0.3; ctx.beginPath(); ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2); ctx.fill(); } },
    stars: (ctx, w, h, rng) => { for (let i = 0; i < 160; i++) { const a = 0.15 + rng() * 0.8; ctx.fillStyle = rgba('#ffffff', a); const r = rng() * 1.3 + 0.2; ctx.beginPath(); ctx.arc(rng() * w, rng() * h * 0.8, r, 0, Math.PI * 2); ctx.fill(); } },
    embers: (ctx, w, h, rng) => { for (let i = 0; i < 70; i++) { ctx.fillStyle = rgba('#ffb45c', 0.2 + rng() * 0.6); const r = rng() * 1.6 + 0.4; ctx.beginPath(); ctx.arc(rng() * w, h - rng() * h * 0.6, r, 0, Math.PI * 2); ctx.fill(); } },
    none: () => {}
  };

  const KIND_PARTICLES = {
    forest: 'embers', city: 'rain', ruins: 'dust', cave: 'dust',
    sea: 'rain', desert: 'dust', snow: 'snow', space: 'stars', interior: 'dust'
  };

  /**
   * Рисует фон сцены на canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts {kind, palette:[bg,mid,accent], seed, tint}
   */
  function draw(canvas, opts) {
    const o = opts || {};
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const w = canvas.clientWidth || 448;
    const h = canvas.clientHeight || 252;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const palette = (o.palette && o.palette.length >= 3) ? o.palette : ['#101820', '#2f4f5a', '#9fe6d0'];
    const rng = makeRng(o.seed || 1);
    const kind = SILHOUETTES[o.kind] ? o.kind : 'forest';
    const col = {
      sky: palette[0], mid: palette[1], accent: palette[2],
      dark: shift(palette[0], -14)
    };

    // небо: два градиента + свечение светила
    const sky = ctx.createLinearGradient(0, 0, w * 0.3, h);
    sky.addColorStop(0, mix(col.sky, col.mid, 0.35));
    sky.addColorStop(0.55, col.mid);
    sky.addColorStop(1, col.sky);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const lx = w * (0.2 + rng() * 0.6), ly = h * (0.12 + rng() * 0.3);
    const halo = ctx.createRadialGradient(lx, ly, 2, lx, ly, w * (0.25 + rng() * 0.25));
    halo.addColorStop(0, rgba(col.accent, 0.55));
    halo.addColorStop(0.4, rgba(col.accent, 0.14));
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, w, h);

    if (kind === 'space') {
      PARTICLES.stars(ctx, w, h, rng);
    }

    // дальний слой, силуэт, туман, частицы — по слоям
    const layer = (fn, depth) => {
      ctx.save();
      fn(ctx, w, h, rng, col, depth);
      ctx.restore();
    };
    layer(SILHOUETTES[kind], 0);
    layer(SILHOUETTES[kind], 0.4);

    // туманные полосы
    for (let i = 0; i < 4; i++) {
      const fy = h * (0.45 + rng() * 0.5);
      const fg = ctx.createLinearGradient(0, fy - h * 0.12, 0, fy + h * 0.12);
      fg.addColorStop(0, 'rgba(0,0,0,0)');
      fg.addColorStop(0.5, rgba(col.mid, 0.1 + rng() * 0.12));
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, fy - h * 0.12, w, h * 0.24);
    }

    (PARTICLES[KIND_PARTICLES[kind] || 'none'])(ctx, w, h, rng);

    // кто в кадре: герой, противники и предметы окружения из текущей сцены.
    // Перед ними приглушаем фон, чтобы фигуры читались с первого взгляда.
    if (o.actors) {
      ctx.fillStyle = rgba(col.sky, 0.34);
      ctx.fillRect(0, 0, w, h);
      drawActors(ctx, w, h, rng, col, o.actors);
    }

    // винетка и зерно
    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 1.05);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = 0.05;
    for (let i = 0; i < Math.round(w * h / 220); i++) {
      ctx.fillStyle = rng() > 0.5 ? '#fff' : '#000';
      ctx.fillRect(rng() * w, rng() * h, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Отрисовка в data-URL (для сохранения/превью). */
  function toDataUrl(opts) {
    const c = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    if (!c) return '';
    c.style.width = '448px';
    c.style.height = '252px';
    draw(c, opts);
    return c.toDataURL('image/jpeg', 0.8);
  }

  /* ---------------------------------------------------------- */
  /* Действующие лица: силуэты героя, врагов и предметов сцены   */
  /* Рисуются в фоне сцены, чтобы картинка совпадала с рассказом  */
  /* ---------------------------------------------------------- */
  function limb(ctx, x, y, w, h, dx, dy) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.lineTo(x + dx + w, y + dy);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
  }

  /** Человекоподобная фигура: x — центр, y — ступни, s — рост в пикселях. */
  function drawHuman(ctx, x, y, s, opts) {
    const o = opts || {};
    const w = s * 0.30;
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(-1, 1);
    // голова
    ctx.beginPath();
    ctx.arc(0, -s * 0.87, s * 0.10, 0, Math.PI * 2);
    ctx.fill();
    // корпус
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -s * 0.74);
    ctx.lineTo(w * 0.5, -s * 0.74);
    ctx.lineTo(w * 0.62, -s * 0.40);
    ctx.lineTo(-w * 0.62, -s * 0.40);
    ctx.closePath();
    ctx.fill();
    // ноги в шаге
    limb(ctx, -w * 0.42, -s * 0.42, w * 0.26, s * 0.42, -s * 0.05, 0);
    limb(ctx, w * 0.16, -s * 0.42, w * 0.26, s * 0.42, s * 0.06, 0);
    // руки: поднятая (с оружием) и опущенная
    limb(ctx, -w * 0.5, -s * 0.72, w * 0.20, s * 0.30, -s * 0.10, s * 0.04);
    limb(ctx, w * 0.34, -s * 0.72, w * 0.20, s * 0.28, s * 0.05, 0);
    if (o.weapon === 'sword') {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = Math.max(1.5, s * 0.045);
      ctx.beginPath();
      ctx.moveTo(-w * 0.78, -s * 0.72);
      ctx.lineTo(-w * 0.9, -s * 1.02);
      ctx.stroke();
      ctx.restore();
    } else if (o.weapon === 'staff') {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = Math.max(1.5, s * 0.035);
      ctx.beginPath();
      ctx.moveTo(-w * 0.72, -s * 0.66);
      ctx.lineTo(-w * 0.72, -s * 1.05);
      ctx.stroke();
      ctx.restore();
    } else if (o.weapon === 'bow') {
      ctx.save();
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = Math.max(1.2, s * 0.03);
      ctx.beginPath();
      ctx.arc(-w * 0.7, -s * 0.62, s * 0.16, -Math.PI * 0.7, Math.PI * 0.7);
      ctx.stroke();
      ctx.restore();
    }
    if (o.shield) {
      ctx.beginPath();
      ctx.ellipse(w * 0.5, -s * 0.5, s * 0.07, s * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (o.cloak) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.4, -s * 0.72);
      ctx.lineTo(-w * 1.0, -s * 0.28);
      ctx.lineTo(-w * 0.34, -s * 0.32);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /** Зверь на четырёх лапах. */
  function drawBeast(ctx, x, y, s, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(-1, 1);
    const bw = s * 0.5;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.46, bw * 0.5, s * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    // лапы
    limb(ctx, -bw * 0.36, -s * 0.46, s * 0.055, s * 0.46, -s * 0.03, 0);
    limb(ctx, -bw * 0.1, -s * 0.46, s * 0.055, s * 0.46, -s * 0.02, 0);
    limb(ctx, bw * 0.18, -s * 0.46, s * 0.055, s * 0.46, 0, 0);
    limb(ctx, bw * 0.4, -s * 0.46, s * 0.055, s * 0.46, s * 0.02, 0);
    // шея, голова и морда
    ctx.beginPath();
    ctx.moveTo(bw * 0.3, -s * 0.52);
    ctx.lineTo(bw * 0.56, -s * 0.62);
    ctx.lineTo(bw * 0.56, -s * 0.5);
    ctx.lineTo(bw * 0.28, -s * 0.42);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(bw * 0.58, -s * 0.62, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(bw * 0.66, -s * 0.68);
    ctx.lineTo(bw * 0.78, -s * 0.58);
    ctx.lineTo(bw * 0.62, -s * 0.53);
    ctx.closePath();
    ctx.fill();
    // уши и хвост
    ctx.beginPath();
    ctx.moveTo(bw * 0.5, -s * 0.7);
    ctx.lineTo(bw * 0.55, -s * 0.84);
    ctx.lineTo(bw * 0.64, -s * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-bw * 0.5, -s * 0.55);
    ctx.quadraticCurveTo(-bw * 0.8, -s * 0.5, -bw * 0.76, -s * 0.78);
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
    ctx.restore();
  }

  /** Громила: широкий, рогатый, с когтями. */
  function drawMonster(ctx, x, y, s, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(-1, 1);
    const w = s * 0.44;
    ctx.beginPath();
    ctx.moveTo(-w * 0.5, -s * 0.28);
    ctx.lineTo(-w * 0.62, -s * 0.78);
    ctx.lineTo(w * 0.62, -s * 0.78);
    ctx.lineTo(w * 0.5, -s * 0.28);
    ctx.closePath();
    ctx.fill();
    limb(ctx, -w * 0.46, -s * 0.3, w * 0.32, s * 0.3, -s * 0.03, 0);
    limb(ctx, w * 0.14, -s * 0.3, w * 0.32, s * 0.3, s * 0.03, 0);
    limb(ctx, -w * 0.6, -s * 0.74, w * 0.26, s * 0.42, -s * 0.06, s * 0.06);
    limb(ctx, w * 0.36, -s * 0.74, w * 0.26, s * 0.42, s * 0.06, s * 0.06);
    ctx.beginPath();
    ctx.arc(0, -s * 0.86, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    // рога
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.moveTo(side * s * 0.09, -s * 0.92);
      ctx.lineTo(side * s * 0.2, -s * 1.06);
      ctx.lineTo(side * s * 0.04, -s * 0.95);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
  }

  /** Нежить: скрюченная фигура с поднятыми руками. */
  function drawUndead(ctx, x, y, s, opts) {
    const o = Object.assign({}, opts, { armsUp: true });
    ctx.save();
    ctx.translate(0, 0);
    drawHuman(ctx, x, y, s, o);
    ctx.restore();
  }

  /** Машина: коробка с антенной и гусеницами. */
  function drawConstruct(ctx, x, y, s, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(-1, 1);
    const w = s * 0.36;
    ctx.fillRect(-w / 2, -s * 1.14, w, s * 0.38);            // голова
    ctx.beginPath();
    ctx.moveTo(-w * 0.6, -s * 0.74);
    ctx.lineTo(w * 0.6, -s * 0.74);
    ctx.lineTo(w * 0.5, -s * 0.3);
    ctx.lineTo(-w * 0.5, -s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(-w * 0.62, -s * 0.3, w * 1.24, s * 0.18);    // гусеницы
    ctx.fillRect(w * 0.3, -s * 1.2, w * 0.06, s * 0.12);      // антенна
    ctx.restore();
  }

  /** Дракон: длинная шея, крылья, хвост. */
  function drawDragon(ctx, x, y, s, opts) {
    const o = opts || {};
    ctx.save();
    ctx.translate(x, y);
    if (o.flip) ctx.scale(-1, 1);
    const bw = s * 0.5;
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.5, bw * 0.5, s * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();                                          // шея
    ctx.moveTo(bw * 0.34, -s * 0.62);
    ctx.lineTo(bw * 0.54, -s * 0.62);
    ctx.lineTo(bw * 0.72, -s * 0.92);
    ctx.lineTo(bw * 0.52, -s * 0.94);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();                                          // голова
    ctx.arc(bw * 0.62, -s * 0.98, s * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();                                          // крыло
    ctx.moveTo(-bw * 0.2, -s * 0.64);
    ctx.lineTo(-bw * 0.52, -s * 0.98);
    ctx.lineTo(bw * 0.06, -s * 0.94);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();                                          // рог
    ctx.moveTo(bw * 0.66, -s * 1.04);
    ctx.lineTo(bw * 0.78, -s * 1.14);
    ctx.lineTo(bw * 0.6, -s * 1.0);
    ctx.closePath();
    ctx.fill();
    limb(ctx, -bw * 0.32, -s * 0.5, s * 0.08, s * 0.5, -s * 0.03, 0);
    limb(ctx, bw * 0.18, -s * 0.5, s * 0.08, s * 0.5, s * 0.03, 0);
    ctx.beginPath();                                          // хвост
    ctx.moveTo(-bw * 0.46, -s * 0.56);
    ctx.quadraticCurveTo(-bw * 0.9, -s * 0.5, -bw * 0.84, -s * 0.82);
    ctx.lineWidth = Math.max(2, s * 0.07);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
    ctx.restore();
  }

  const ACTOR_SHAPES = {
    human: drawHuman,
    soldier: (ctx, x, y, s, o) => drawHuman(ctx, x, y, s, Object.assign({ weapon: 'sword', shield: true }, o)),
    undead: drawUndead,
    beast: drawBeast,
    monster: drawMonster,
    construct: drawConstruct,
    dragon: drawDragon,
    crowd: (ctx, x, y, s, o) => {
      drawHuman(ctx, x - s * 0.38, y, s * 0.74, o);
      drawHuman(ctx, x + s * 0.3, y, s * 0.82, o);
      drawHuman(ctx, x, y, s, o);
    }
  };

  /** Предметы окружения: костёр, повозка, шатёр, башня, корабль… */
  const PROPS = {
    fire(ctx, x, y, s, col) {
      const glow = ctx.createRadialGradient(x, y - s * 0.3, 2, x, y - s * 0.3, s * 0.9);
      glow.addColorStop(0, rgba(col.accent, 0.55));
      glow.addColorStop(0.45, rgba(col.accent, 0.18));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(x - s, y - s * 1.4, s * 2, s * 1.6);
      ctx.fillStyle = rgba(col.accent, 0.85);
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x - s * 0.16 + i * s * 0.14, y);
        ctx.quadraticCurveTo(x - s * 0.2 + i * s * 0.14, y - s * 0.42, x - s * 0.06 + i * s * 0.1, y - s * 0.62);
        ctx.quadraticCurveTo(x + s * 0.02 + i * s * 0.1, y - s * 0.34, x + s * 0.08 + i * s * 0.1, y);
        ctx.closePath();
        ctx.fill();
      }
    },
    torch(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(x - s * 0.03, y - s * 0.9, s * 0.06, s * 0.9);
      ctx.fillStyle = rgba(col.accent, 0.9);
      ctx.beginPath();
      ctx.ellipse(x, y - s * 0.98, s * 0.09, s * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    },
    banner(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(x - s * 0.03, y - s * 1.1, s * 0.06, s * 1.1);
      ctx.fillStyle = rgba(col.accent, 0.5);
      ctx.beginPath();
      ctx.moveTo(x, y - s * 1.08);
      ctx.lineTo(x + s * 0.42, y - s * 1.0);
      ctx.lineTo(x + s * 0.34, y - s * 0.72);
      ctx.lineTo(x, y - s * 0.8);
      ctx.closePath();
      ctx.fill();
    },
    cart(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(x - s * 0.42, y - s * 0.6, s * 0.84, s * 0.36);
      [-1, 1].forEach(side => {
        ctx.beginPath();
        ctx.arc(x + side * s * 0.28, y - s * 0.16, s * 0.18, 0, Math.PI * 2);
        ctx.fill();
      });
    },
    tent(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.beginPath();
      ctx.moveTo(x, y - s * 0.72);
      ctx.lineTo(x + s * 0.52, y);
      ctx.lineTo(x - s * 0.52, y);
      ctx.closePath();
      ctx.fill();
    },
    ship(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.6, y - s * 0.16);
      ctx.lineTo(x + s * 0.6, y - s * 0.16);
      ctx.lineTo(x + s * 0.4, y);
      ctx.lineTo(x - s * 0.4, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(x - s * 0.02, y - s * 1.05, s * 0.05, s * 0.9);
      ctx.beginPath();
      ctx.moveTo(x + s * 0.03, y - s * 1.0);
      ctx.lineTo(x + s * 0.42, y - s * 0.6);
      ctx.lineTo(x + s * 0.03, y - s * 0.35);
      ctx.closePath();
      ctx.fill();
    },
    tower(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(x - s * 0.24, y - s * 1.5, s * 0.48, s * 1.5);
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x - s * 0.26 + i * s * 0.14, y - s * 1.62, s * 0.09, s * 0.14);
      }
    },
    statue(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.fillRect(x - s * 0.26, y - s * 0.26, s * 0.52, s * 0.26);
      drawHuman(ctx, x, y - s * 0.24, s * 0.78, {});
    },
    bridge(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.8, y);
      ctx.quadraticCurveTo(x, y - s * 0.7, x + s * 0.8, y);
      ctx.lineTo(x + s * 0.8, y + s * 0.12);
      ctx.lineTo(x - s * 0.8, y + s * 0.12);
      ctx.closePath();
      ctx.fill();
    },
    door(ctx, x, y, s, col) {
      ctx.fillStyle = col.dark;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.3, y);
      ctx.lineTo(x - s * 0.3, y - s * 0.5);
      ctx.quadraticCurveTo(x, y - s * 0.92, x + s * 0.3, y - s * 0.5);
      ctx.lineTo(x + s * 0.3, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = rgba(col.accent, 0.22);
      ctx.fillRect(x - s * 0.08, y - s * 0.66, s * 0.16, s * 0.28);
    }
  };

  /** Врагов в кадр — до трёх, герой всегда слева и лицом к ним. */
  function drawActors(ctx, w, h, rng, col, actors) {
    if (!actors) return;
    const groundY = h * 0.97;
    const heroS = h * 0.56;
    // тёмная фигура + светящаяся кромка: читается на любом фоне
    const silhouette = () => {
      ctx.fillStyle = col.dark;
      ctx.strokeStyle = rgba(col.accent, 0.75);
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      if ('shadowBlur' in ctx) {
        ctx.shadowColor = rgba(col.accent, 0.85);
        ctx.shadowBlur = Math.max(10, h * 0.06);
      }
    };
    const doneSilhouette = () => {
      if ('shadowBlur' in ctx) { ctx.shadowBlur = 0; ctx.shadowColor = 'rgba(0,0,0,0)'; }
    };
    const shadow = s => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.42, s * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = col.dark;
    };
    const enemies = (actors.enemies || []).slice(0, 3);
    const props = (actors.props || []).slice(0, 4);

    // мягкий ореол: силуэт отделяется от такого же тёмного фона
    const glow = (x, y, s, col) => {
      const g = ctx.createRadialGradient(x, y, s * 0.05, x, y, s * 0.95);
      g.addColorStop(0, rgba(col.accent, 0.3));
      g.addColorStop(0.5, rgba(col.accent, 0.12));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - s, y - s * 1.25, s * 2, s * 1.35);
    };

    // предметы окружения — на заднем плане
    props.forEach((name, i) => {
      const draw = PROPS[name];
      if (!draw) return;
      const px = w * (0.46 + i * 0.14 + rng() * 0.05);
      const ps = h * (0.22 + rng() * 0.14);
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.translate(Math.min(px, w * 0.94), groundY);
      draw(ctx, 0, 0, ps, col, rng);
      ctx.restore();
    });

    // враги — справа, лицом к герою
    enemies.forEach((shape, i) => {
      const draw = ACTOR_SHAPES[shape] || ACTOR_SHAPES.human;
      const s = h * (0.44 - i * 0.05 + rng() * 0.03);
      const px = Math.min(w * (0.6 + i * 0.145), w * 0.9);
      glow(px, groundY - s * 0.5, s, col);
      ctx.save();
      ctx.translate(px, groundY);
      silhouette();
      ctx.save();
      doneSilhouette();
      shadow(s);
      silhouette();
      ctx.beginPath();
      draw(ctx, 0, 0, s, { flip: true, weapon: shape === 'soldier' ? 'sword' : undefined });
      doneSilhouette();
      ctx.restore();
      ctx.restore();
    });

    // герой — слева, лицом вправо
    const heroShape = ACTOR_SHAPES[(actors.hero && actors.hero.shape) || 'human'] || ACTOR_SHAPES.human;
    glow(w * 0.22, groundY - heroS * 0.5, heroS, col);
    ctx.save();
    ctx.translate(w * 0.22, groundY);
    doneSilhouette();
    shadow(heroS);
    silhouette();
    ctx.beginPath();
    heroShape(ctx, 0, 0, heroS, { weapon: actors.hero && actors.hero.weapon, shield: actors.hero && actors.hero.shield, cloak: true });
    doneSilhouette();
    ctx.restore();
  }

  return { draw, toDataUrl, makeRng, mix, shift, rgba, hexToRgb, KIND_PARTICLES, SILHOUETTES, ACTOR_SHAPES, PROPS, drawActors };

});
