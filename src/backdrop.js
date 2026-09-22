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

  return { draw, toDataUrl, makeRng, mix, shift, rgba, hexToRgb, KIND_PARTICLES, SILHOUETTES };
});
