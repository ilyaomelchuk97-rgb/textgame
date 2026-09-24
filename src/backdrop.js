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
      // каменный мешок: зубчатые стены, свод, сталактиты, дальний свет
      ctx.fillStyle = rgba(col.dark, 0.95);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      for (let x = 0; x <= w; x += w / 12) ctx.lineTo(x, h * (0.08 + rng() * 0.14));
      ctx.lineTo(w, 0);
      ctx.closePath();
      ctx.fill();
      [0, 1].forEach(side => {                                 // стены зубцами
        ctx.beginPath();
        ctx.moveTo(side ? w : 0, 0);
        for (let y = 0; y <= h; y += h / 10) {
          ctx.lineTo(side ? w - w * (0.05 + rng() * 0.12) : w * (0.05 + rng() * 0.12), y);
        }
        ctx.lineTo(side ? w : 0, h);
        ctx.closePath();
        ctx.fill();
      });
      const gx = w * (0.45 + rng() * 0.12), gy = h * (0.46 + depth * 0.06);
      const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, w * 0.22);
      g.addColorStop(0, rgba(col.accent, 0.42));               // свет из глубины
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = rgba(col.dark, 0.96);
      for (let i = 0; i < 8; i++) {                            // сталактиты
        const sx = rng() * w, len = 12 + rng() * 34;
        ctx.beginPath();
        ctx.moveTo(sx - 4, h * 0.18);
        ctx.lineTo(sx + 4, h * 0.18);
        ctx.lineTo(sx, h * 0.18 + len);
        ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 7; i++) {                            // сталагмиты
        const sx = rng() * w, len = 14 + rng() * 40;
        ctx.beginPath();
        ctx.moveTo(sx - 5, h);
        ctx.lineTo(sx + 5, h);
        ctx.lineTo(sx + (rng() - 0.5) * 10, h - len);
        ctx.closePath(); ctx.fill();
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
      ctx.fillStyle = rgba(col.dark, 0.92);                    // стол и стул
      ctx.fillRect(w * 0.12, h * 0.72, w * 0.24, 5);
      ctx.fillRect(w * 0.15, h * 0.78, 5, h * 0.18);
      ctx.fillRect(w * 0.29, h * 0.78, 5, h * 0.18);
      ctx.fillRect(w * 0.72, h * 0.74, w * 0.18, 4);
      ctx.fillRect(w * 0.8, h * 0.74, 4, h * 0.16);
      const lg = ctx.createRadialGradient(w * 0.24, h * 0.66, 2, w * 0.24, h * 0.66, w * 0.22);
      lg.addColorStop(0, rgba(col.accent, 0.55));              // лампа над столом
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(w * 0.02, h * 0.4, w * 0.46, h * 0.6);
    },

    canyon(ctx, w, h, rng, col, depth) {
      // слоистые стены каньона по краям и дорога между ними
      const walls = [0, 1];
      walls.forEach(side => {
        for (let layer = 0; layer < 3; layer++) {
          ctx.fillStyle = rgba(mix(col.mid, col.accent, 0.1 * layer), 0.85);
          ctx.beginPath();
          const x0 = side ? w : 0;
          ctx.moveTo(x0, h);
          for (let y = h; y >= 0; y -= h / 9) {
            const inset = (0.06 + layer * 0.13 + rng() * 0.05) * w * (0.4 + y / h);
            ctx.lineTo(side ? w - inset : inset, y);
          }
          ctx.lineTo(side ? w : 0, 0);
          ctx.closePath();
          ctx.fill();
        }
      });
      // редкие камни на дне
      ctx.fillStyle = rgba(col.dark, 0.75);
      for (let i = 0; i < 5; i++) {
        const bx = w * (0.25 + rng() * 0.5), bw = 8 + rng() * 26, bh = 5 + rng() * 14;
        ctx.beginPath();
        ctx.ellipse(bx, h * 0.86 + rng() * h * 0.06, bw, bh, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    market(ctx, w, h, rng, col, depth) {
      // ночной рынок: прилавки, навесы, фонари
      for (let row = 0; row < 2; row++) {
        const y = h * (0.62 + row * 0.18);
        const scale = 1 - row * 0.22;
        let x = -10;
        while (x < w + 10) {
          const stall = 46 + rng() * 40;
          const sh = 26 * scale + rng() * 8;
          ctx.fillStyle = rgba(col.dark, 0.9);
          ctx.fillRect(x, y, stall, sh);                       // прилавок
          ctx.beginPath();                                     // навес
          ctx.moveTo(x - 4, y);
          ctx.lineTo(x + stall * 0.5, y - 20 * scale);
          ctx.lineTo(x + stall + 4, y);
          ctx.closePath();
          ctx.fillStyle = rgba(col.mid, 0.95);
          ctx.fill();
          // фонарь
          if (rng() < 0.7) {
            const lx = x + stall * 0.5;
            ctx.strokeStyle = rgba(col.dark, 0.9);
            ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.moveTo(lx, y - 18 * scale); ctx.lineTo(lx, y - 30 * scale); ctx.stroke();
            const g = ctx.createRadialGradient(lx, y - 30 * scale, 1, lx, y - 30 * scale, 16 * scale);
            g.addColorStop(0, rgba(col.accent, 0.85));
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(lx, y - 30 * scale, 16 * scale, 0, Math.PI * 2); ctx.fill();
          }
          x += stall + 6;
        }
      }
    },
    ship(ctx, w, h, rng, col, depth) {
      // палуба с перилами, мачта с парусом, ванты, волна за бортом, фонарь
      const deck = h * (0.68 + depth * 0.04);
      for (let i = 0; i < 3; i++) {                            // волны за бортом
        ctx.fillStyle = rgba(col.mid, 0.32 - i * 0.07);
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 12) {
          ctx.lineTo(x, deck - 8 + i * 8 + Math.sin(x * 0.06 + i * 2) * 5);
        }
        ctx.lineTo(w, h);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = rgba(col.dark, 0.94);
      ctx.fillRect(0, deck, w, h - deck);
      ctx.strokeStyle = rgba(col.mid, 0.5);
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const y = deck + (h - deck) * (i / 5);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.strokeStyle = rgba(col.dark, 0.96);                  // перила
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, deck - 18); ctx.lineTo(w, deck - 18); ctx.stroke();
      for (let x = 4; x < w; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, deck - 18); ctx.lineTo(x, deck); ctx.stroke();
      }
      const mx = w * (0.46 + rng() * 0.14);
      ctx.fillStyle = rgba(col.dark, 0.98);
      ctx.fillRect(mx, h * 0.06, 7, deck - h * 0.06);
      ctx.beginPath();                                         // парус
      ctx.moveTo(mx + 7, h * 0.1);
      ctx.quadraticCurveTo(mx + w * 0.34, h * 0.3, mx + 7, h * 0.6);
      ctx.closePath();
      ctx.fillStyle = rgba(col.mid, 0.5);
      ctx.fill();
      ctx.strokeStyle = rgba(col.dark, 0.8);                   // ванты
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(mx + 3, h * (0.14 + i * 0.13));
        ctx.lineTo(mx - w * (0.06 + i * 0.08), deck - 18);
        ctx.stroke();
      }
      const lx = w * 0.14, ly = deck - 30;                     // фонарь на борту
      const lg = ctx.createRadialGradient(lx, ly, 1, lx, ly, 26);
      lg.addColorStop(0, rgba(col.accent, 0.72));
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = lg;
      ctx.beginPath(); ctx.arc(lx, ly, 26, 0, Math.PI * 2); ctx.fill();
    },
    port(ctx, w, h, rng, col, depth) {
      // порт: краны, штабели контейнеров, мачты на горизонте
      const water = h * (0.7 + depth * 0.05);
      ctx.fillStyle = rgba(col.mid, 0.5);
      ctx.fillRect(0, water, w, h - water);
      ctx.fillStyle = rgba(col.dark, 0.9);
      for (let i = 0; i < 4; i++) {                            // контейнеры
        const bw = 34 + rng() * 26, bh = 16 + rng() * 12;
        const x = rng() * (w - bw), y = h * (0.42 + rng() * 0.2);
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeStyle = rgba(col.accent, 0.18);
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 3, y + 3, bw - 6, bh - 6);
      }
      for (let i = 0; i < 2; i++) {                            // краны
        const cx = w * (0.15 + i * 0.5 + rng() * 0.1);
        ctx.strokeStyle = rgba(col.dark, 0.95);
        ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(cx, h * 0.3); ctx.lineTo(cx, h * 0.72); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx - w * 0.14, h * 0.32); ctx.lineTo(cx + w * 0.1, h * 0.32); ctx.stroke();
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx + w * 0.06, h * 0.32); ctx.lineTo(cx + w * 0.06, h * 0.52); ctx.stroke();
      }
      for (let i = 0; i < 5; i++) {                            // мачты судов
        const sx = w * (0.1 + rng() * 0.8);
        ctx.strokeStyle = rgba(col.dark, 0.7);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, water + 4); ctx.lineTo(sx, water - 30 - rng() * 30); ctx.stroke();
      }
    },
    tavern(ctx, w, h, rng, col, depth) {
      // трактир: стойка, полки, кружки, столы
      ctx.fillStyle = rgba(col.dark, 0.92);
      ctx.fillRect(w * 0.06, h * 0.5, w * 0.42, h * 0.1);      // стойка
      ctx.fillRect(w * 0.06, h * 0.6, w * 0.08, h * 0.3);      // опора
      ctx.fillRect(w * 0.4, h * 0.6, w * 0.08, h * 0.3);
      for (let s = 0; s < 2; s++) {                            // полки
        const y = h * (0.16 + s * 0.13);
        ctx.fillStyle = rgba(col.dark, 0.85);
        ctx.fillRect(w * 0.06, y, w * 0.4, 4);
        for (let i = 0; i < 7; i++) {
          const x = w * (0.08 + i * 0.055);
          ctx.fillStyle = rgba(rng() < 0.6 ? col.mid : col.accent, 0.55);
          ctx.fillRect(x, y - 9 - rng() * 3, 4 + rng() * 3, 9);
        }
      }
      for (let i = 0; i < 3; i++) {                            // столы
        const tx = w * (0.6 + (i % 2) * 0.12 + rng() * 0.08), ty = h * (0.66 + Math.floor(i / 2) * 0.14);
        ctx.fillStyle = rgba(col.dark, 0.88);
        ctx.fillRect(tx, ty, w * 0.16, 6);
        ctx.fillRect(tx + 4, ty + 6, 5, h * 0.12);
        ctx.fillRect(tx + w * 0.13, ty + 6, 5, h * 0.12);
      }
      for (let i = 0; i < 5; i++) {                            // кружки на стойке
        const mx = w * (0.12 + i * 0.06);
        ctx.fillStyle = rgba(col.mid, 0.8);
        ctx.fillRect(mx, h * 0.5 - 8 - rng() * 2, 5, 8);
      }
      const hg = ctx.createRadialGradient(w * 0.3, h * 0.66, 2, w * 0.3, h * 0.66, w * 0.26);
      hg.addColorStop(0, 'rgba(255,158,72,0.42)');             // очаг в углу
      hg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(w * 0.02, h * 0.4, w * 0.56, h * 0.6);
    },
    station(ctx, w, h, rng, col, depth) {
      // станция: навес, указатели, рельсы (или шлюз с огоньками)
      const plat = h * (0.68 + depth * 0.04);
      ctx.fillStyle = rgba(col.dark, 0.9);
      ctx.fillRect(0, plat, w, h - plat);
      ctx.strokeStyle = rgba(col.accent, 0.25);                // рельсы
      ctx.lineWidth = 3;
      for (let i = 0; i < 2; i++) {
        const y = plat + 8 + i * 12;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let x = 0; x < w; x += 18) {                        // шпалы
        ctx.fillStyle = rgba(col.mid, 0.5);
        ctx.fillRect(x, plat + 4, 9, 20);
      }
      ctx.fillStyle = rgba(col.dark, 0.95);                    // опоры навеса
      for (let i = 0; i < 3; i++) ctx.fillRect(w * (0.16 + i * 0.32), h * 0.24, 6, plat - h * 0.24);
      ctx.fillStyle = rgba(col.mid, 0.9);
      ctx.fillRect(w * 0.06, h * 0.18, w * 0.88, 10);          // крыша навеса
      for (let i = 0; i < 3; i++) {                            // указатели
        const sx = w * (0.24 + i * 0.26), sy = h * 0.28;
        ctx.fillStyle = rgba(col.dark, 0.9);
        ctx.fillRect(sx, sy, 22, 12);
        ctx.fillStyle = rgba(col.accent, 0.75);
        ctx.fillRect(sx + 3, sy + 4, 16, 2);
      }
    },
    swamp(ctx, w, h, rng, col, depth) {
      // болото: коряги, кочки, камыш
      const water = h * (0.66 + depth * 0.05);
      ctx.fillStyle = rgba(col.mid, 0.45);
      ctx.fillRect(0, water, w, h - water);
      for (let i = 0; i < 6; i++) {                            // кочки
        const cx = rng() * w, cy = water + rng() * (h - water) * 0.8;
        ctx.fillStyle = rgba(col.dark, 0.5 + rng() * 0.3);
        ctx.beginPath();
        ctx.ellipse(cx, cy, 8 + rng() * 18, 3 + rng() * 5, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 4; i++) {                            // коряги
        const tx = rng() * w, th = 30 + rng() * 60;
        ctx.strokeStyle = rgba(col.dark, 0.95);
        ctx.lineWidth = 3 + rng() * 4;
        ctx.beginPath();
        ctx.moveTo(tx, water + 4);
        ctx.lineTo(tx + (rng() - 0.5) * 24, water - th);
        ctx.stroke();
        ctx.lineWidth = 2;
        for (let b = 0; b < 3; b++) {
          const by = water - th * (0.4 + b * 0.2);
          ctx.beginPath();
          ctx.moveTo(tx, by);
          ctx.lineTo(tx + (rng() > 0.5 ? 1 : -1) * (8 + rng() * 16), by - 10 - rng() * 8);
          ctx.stroke();
        }
      }
      ctx.strokeStyle = rgba(col.dark, 0.6);                   // камыш
      ctx.lineWidth = 1.4;
      for (let i = 0; i < 26; i++) {
        const rx = rng() * w, rh = 18 + rng() * 30;
        ctx.beginPath(); ctx.moveTo(rx, water + rng() * 12); ctx.lineTo(rx + (rng() - 0.5) * 6, water - rh); ctx.stroke();
      }
    },
    temple(ctx, w, h, rng, col, depth) {
      // храм: колонны, ступени, витраж
      ctx.fillStyle = rgba(col.dark, 0.92);
      ctx.fillRect(0, h * 0.8, w, h * 0.2);                    // пол
      for (let step = 0; step < 3; step++) {
        ctx.fillStyle = rgba(col.mid, 0.6 - step * 0.12);
        ctx.fillRect(w * (0.1 + step * 0.03), h * (0.78 - step * 0.03), w * (0.8 - step * 0.06), 6);
      }
      for (let i = 0; i < 5; i++) {                            // колонны
        const cx = w * (0.06 + i * 0.22);
        const ch = h * (0.56 + (i === 2 ? 0.04 : 0));
        ctx.fillStyle = rgba(col.dark, 0.95);
        ctx.fillRect(cx, h * 0.8 - ch, 16 + rng() * 5, ch);
        ctx.fillStyle = rgba(col.mid, 0.75);                   // капитель
        ctx.fillRect(cx - 4, h * 0.8 - ch - 7, 24 + rng() * 5, 7);
        ctx.fillRect(cx - 3, h * 0.8 - 6, 22, 6);
      }
      const gr = ctx.createRadialGradient(w * 0.5, h * 0.3, 2, w * 0.5, h * 0.3, w * 0.18);
      gr.addColorStop(0, rgba(col.accent, 0.45));              // свет витража
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(w * 0.3, h * 0.1, w * 0.4, h * 0.5);
      ctx.strokeStyle = rgba(col.accent, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w * 0.5, h * 0.3, w * 0.07, 0, Math.PI * 2); ctx.stroke();
    },
    battlefield(ctx, w, h, rng, col, depth) {
      // поле боя: знамёна, воткнутые мечи, щиты, вороны
      const ground = h * (0.72 + depth * 0.04);
      ctx.fillStyle = rgba(col.dark, 0.9);
      ctx.fillRect(0, ground, w, h - ground);
      for (let i = 0; i < 5; i++) {                            // мечи и копья
        const x = w * (0.08 + rng() * 0.84), len = 30 + rng() * 55;
        ctx.strokeStyle = rgba(col.dark, 0.95);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(x, ground); ctx.lineTo(x + (rng() - 0.5) * 12, ground - len); ctx.stroke();
        if (rng() < 0.5) {                                     // перекладина меча
          const ty = ground - len * 0.86;
          ctx.beginPath(); ctx.moveTo(x - 8, ty); ctx.lineTo(x + 8, ty); ctx.stroke();
        }
      }
      ctx.fillStyle = rgba(col.mid, 0.8);                      // щиты
      for (let i = 0; i < 3; i++) {
        const sx = w * (0.15 + rng() * 0.7), sy = ground - 6 - rng() * 10;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 11 + rng() * 6, 15 + rng() * 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 2; i++) {                            // знамёна
        const bx = w * (0.2 + i * 0.5 + rng() * 0.1), bh = 60 + rng() * 40;
        ctx.strokeStyle = rgba(col.dark, 0.95);
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(bx, ground); ctx.lineTo(bx, ground - bh); ctx.stroke();
        ctx.fillStyle = rgba(col.accent, 0.35);
        ctx.beginPath();
        ctx.moveTo(bx, ground - bh);
        ctx.lineTo(bx + 26 + rng() * 10, ground - bh + 12);
        ctx.lineTo(bx, ground - bh * 0.55);
        ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = rgba(col.dark, 0.8);                     // вороны
      for (let i = 0; i < 4; i++) {
        const cx = w * (0.3 + rng() * 0.5), cy = h * (0.12 + rng() * 0.2);
        ctx.beginPath();
        ctx.moveTo(cx - 7, cy);
        ctx.lineTo(cx, cy - 4 - rng() * 3);
        ctx.lineTo(cx + 7, cy);
        ctx.lineTo(cx, cy + 2);
        ctx.closePath(); ctx.fill();
      }
    },
    village(ctx, w, h, rng, col, depth) {
      // деревня: домики с крышами, заборы, колодец
      const ground = h * (0.74 + depth * 0.04);
      ctx.fillStyle = rgba(col.dark, 0.9);
      ctx.fillRect(0, ground, w, h - ground);
      for (let i = 0; i < 4; i++) {
        const bw = 42 + rng() * 34, bh = 28 + rng() * 24;
        const x = w * (0.04 + i * 0.24 + rng() * 0.05), y = ground - bh;
        ctx.fillStyle = rgba(col.dark, 0.92);
        ctx.fillRect(x, y, bw, bh);
        ctx.beginPath();                                       // крыша
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x + bw * 0.5, y - 20 - rng() * 8);
        ctx.lineTo(x + bw + 5, y);
        ctx.closePath();
        ctx.fillStyle = rgba(col.mid, 0.95);
        ctx.fill();
        const g = ctx.createRadialGradient(x + bw * 0.3, y + bh * 0.4, 1, x + bw * 0.3, y + bh * 0.4, 14);
        g.addColorStop(0, rgba(col.accent, 0.7));              // окно
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(x + bw * 0.3, y + bh * 0.4, 14, 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = rgba(col.dark, 0.7);                    // забор
      ctx.lineWidth = 2;
      for (let x = 0; x < w; x += 12) {
        const fh = 10 + rng() * 8;
        ctx.beginPath(); ctx.moveTo(x, ground + 6); ctx.lineTo(x, ground + 6 - fh); ctx.stroke();
      }
    },
    library(ctx, w, h, rng, col, depth) {
      // библиотека: стеллажи в перспективе, стол, лампа
      const vx = w * (0.44 + rng() * 0.12), vy = h * 0.5;
      for (let side = 0; side < 2; side++) {
        for (let i = 0; i < 4; i++) {
          const t = i / 4;
          const x = side ? w * (0.52 + t * 0.42) : w * (0.48 - t * 0.42);
          const sw = w * 0.13 * (1 - t * 0.5), sh = h * (0.6 - t * 0.28);
          ctx.fillStyle = rgba(col.dark, 0.85 + t * 0.1);
          ctx.fillRect(x - (side ? 0 : sw), vy - sh * 0.5, sw, sh);
          const rows = 4;                                      // книги на полках
          for (let r = 0; r < rows; r++) {
            const by = vy - sh * 0.5 + sh * (r / rows) + 4;
            for (let b = 0; b < 5; b++) {
              ctx.fillStyle = rgba(rng() < 0.5 ? col.mid : col.accent, 0.35 + rng() * 0.3);
              ctx.fillRect(x - (side ? 0 : sw) + 3 + b * (sw / 5.6), by, sw / 8, sh / rows - 8);
            }
          }
        }
      }
      ctx.fillStyle = rgba(col.dark, 0.95);                    // стол
      ctx.fillRect(w * 0.3, h * 0.78, w * 0.4, 7);
      ctx.fillRect(w * 0.34, h * 0.85, 6, h * 0.14);
      ctx.fillRect(w * 0.63, h * 0.85, 6, h * 0.14);
      const g = ctx.createRadialGradient(w * 0.5, h * 0.76, 2, w * 0.5, h * 0.76, w * 0.2);
      g.addColorStop(0, rgba(col.accent, 0.55));               // лампа на столе
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w * 0.28, h * 0.56, w * 0.44, h * 0.34);
      for (let i = 0; i < 3; i++) {                            // стопка книг на столе
        ctx.fillStyle = rgba(i % 2 ? col.accent : col.mid, 0.6);
        ctx.fillRect(w * (0.52 + i * 0.01), h * 0.74 - i * 4, w * 0.14, 4);
      }
      const cg = ctx.createRadialGradient(w * 0.47, h * 0.72, 1, w * 0.47, h * 0.72, w * 0.12);
      cg.addColorStop(0, 'rgba(255,206,130,0.85)');            // свеча
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath(); ctx.arc(w * 0.47, h * 0.72, w * 0.12, 0, Math.PI * 2); ctx.fill();
    },
    workshop(ctx, w, h, rng, col, depth) {
      // мастерская: верстак, тиски, инструменты, горн
      ctx.fillStyle = rgba(col.dark, 0.92);
      ctx.fillRect(0, h * 0.66, w, h * 0.34);                  // верстак
      ctx.fillStyle = rgba(col.mid, 0.55);
      ctx.fillRect(0, h * 0.66, w, 5);
      for (let i = 0; i < 7; i++) {                            // инструменты на стене
        const x = w * (0.06 + i * 0.13), y = h * (0.24 + rng() * 0.06);
        ctx.strokeStyle = rgba(col.mid, 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rng() - 0.5) * 10, y + 24 + rng() * 14); ctx.stroke();
      }
      ctx.fillStyle = rgba(col.dark, 0.95);                    // горн
      ctx.fillRect(w * 0.68, h * 0.6, w * 0.24, h * 0.4);
      const g = ctx.createRadialGradient(w * 0.8, h * 0.66, 2, w * 0.8, h * 0.66, w * 0.2);
      g.addColorStop(0, 'rgba(255,150,60,0.6)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w * 0.62, h * 0.44, w * 0.38, h * 0.5);
      for (let i = 0; i < 14; i++) {                           // искры
        ctx.fillStyle = rgba('#ffb45c', 0.3 + rng() * 0.5);
        ctx.beginPath();
        ctx.arc(w * (0.7 + rng() * 0.24), h * (0.3 + rng() * 0.36), 0.8 + rng() * 1.6, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    keep(ctx, w, h, rng, col, depth) {
      // крепость: стена с зубцами, башни, ворота
      const ground = h * (0.76 + depth * 0.04);
      ctx.fillStyle = rgba(col.dark, 0.95);
      ctx.fillRect(0, h * 0.42, w, ground - h * 0.42);         // стена
      for (let x = 0; x < w; x += 22) {                        // зубцы
        ctx.fillStyle = rgba(col.dark, 0.95);
        ctx.fillRect(x, h * 0.42 - 12, 13, 12);
      }
      for (let i = 0; i < 2; i++) {                            // башни
        const tx = i ? w * 0.74 : w * 0.06, tw = w * 0.18;
        ctx.fillStyle = rgba(col.dark, 0.95);
        ctx.fillRect(tx, h * 0.24, tw, ground - h * 0.24);
        for (let x = tx; x < tx + tw; x += 16) ctx.fillRect(x, h * 0.24 - 10, 9, 10);
      }
      const gx = w * 0.42, gw = w * 0.16;                      // ворота
      ctx.fillStyle = rgba(col.dark, 0.98);
      ctx.beginPath();
      ctx.moveTo(gx, ground);
      ctx.lineTo(gx, h * 0.58);
      ctx.quadraticCurveTo(gx + gw / 2, h * 0.48, gx + gw, h * 0.58);
      ctx.lineTo(gx + gw, ground);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(col.accent, 0.22);                // решётка
      ctx.lineWidth = 1.5;
      for (let x = gx + 4; x < gx + gw; x += 7) {
        ctx.beginPath(); ctx.moveTo(x, ground); ctx.lineTo(x, h * 0.56); ctx.stroke();
      }
      const fg = ctx.createRadialGradient(w * 0.5, h * 0.5, 2, w * 0.5, h * 0.5, w * 0.3);
      fg.addColorStop(0, rgba(col.accent, 0.28));              // факелы над воротами
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(w * 0.2, h * 0.3, w * 0.6, h * 0.5);
    },
    road(ctx, w, h, rng, col, depth) {
      // дорога в перспективе, верстовые столбы, кусты по краям
      const vx = w * 0.5, vy = h * (0.5 + depth * 0.05);
      ctx.fillStyle = rgba(col.mid, 0.6);
      ctx.beginPath();
      ctx.moveTo(vx - 12, vy);
      ctx.lineTo(vx + 12, vy);
      ctx.lineTo(w * 0.92, h);
      ctx.lineTo(w * 0.08, h);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = rgba(col.dark, 0.5);                   // колеи
      ctx.lineWidth = 1.5;
      for (let i = -1; i <= 1; i += 2) {
        ctx.beginPath();
        ctx.moveTo(vx + i * 5, vy + 4);
        ctx.lineTo(vx + i * w * 0.3, h);
        ctx.stroke();
      }
      for (let i = 0; i < 3; i++) {                            // верстовые столбы
        const t = 0.25 + i * 0.28;
        const sx = vx + (i % 2 ? 1 : -1) * w * (0.06 + t * 0.3);
        const sy = vy + (h - vy) * t;
        const sh = 16 + t * 26;
        ctx.fillStyle = rgba(col.dark, 0.9);
        ctx.fillRect(sx, sy - sh, 4 + t * 3, sh);
        ctx.fillRect(sx - 5 - t * 4, sy - sh, 14 + t * 10, 3 + t * 3);
      }
      for (let i = 0; i < 6; i++) {                            // кусты
        const bx = rng() < 0.5 ? rng() * w * 0.2 : w * (0.8 + rng() * 0.2);
        ctx.fillStyle = rgba(col.dark, 0.7 + rng() * 0.25);
        ctx.beginPath();
        ctx.ellipse(bx, h * (0.72 + rng() * 0.2), 10 + rng() * 16, 7 + rng() * 10, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    bridge(ctx, w, h, rng, col, depth) {
      // мост над водой: арки, перила, фонари
      const deck = h * (0.54 + depth * 0.04);
      ctx.fillStyle = rgba(col.mid, 0.4);
      ctx.fillRect(0, h * 0.78, w, h * 0.22);                  // вода
      ctx.fillStyle = rgba(col.dark, 0.95);
      ctx.fillRect(0, deck, w, 10);                            // настил
      for (let i = 0; i < 3; i++) {                            // арки
        const ax = w * (0.12 + i * 0.3), aw = w * 0.2;
        ctx.beginPath();
        ctx.moveTo(ax, deck + 10);
        ctx.quadraticCurveTo(ax + aw / 2, deck + 44, ax + aw, deck + 10);
        ctx.lineWidth = 7;
        ctx.strokeStyle = rgba(col.dark, 0.9);
        ctx.stroke();
      }
      ctx.strokeStyle = rgba(col.dark, 0.9);                    // перила
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(0, deck - 22); ctx.lineTo(w, deck - 22); ctx.stroke();
      for (let x = 4; x < w; x += 16) {
        ctx.beginPath(); ctx.moveTo(x, deck - 22); ctx.lineTo(x, deck); ctx.stroke();
      }
      for (let i = 0; i < 2; i++) {                             // фонари
        const lx = w * (i ? 0.78 : 0.22), ly = deck - 30;
        const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, 22);
        g.addColorStop(0, rgba(col.accent, 0.8));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(lx, ly, 22, 0, Math.PI * 2); ctx.fill();
      }
    }
  };

  const PARTICLES = {
    snow: (ctx, w, h, rng) => { for (let i = 0; i < 120; i++) { ctx.fillStyle = rgba('#ffffff', 0.2 + rng() * 0.6); const r = rng() * 1.8 + 0.4; ctx.beginPath(); ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2); ctx.fill(); } },
    rain: (ctx, w, h, rng) => { ctx.strokeStyle = rgba('#cfe8ff', 0.25); ctx.lineWidth = 1; for (let i = 0; i < 90; i++) { const x = rng() * w, y = rng() * h, l = 6 + rng() * 12; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + l); ctx.stroke(); } },
    dust: (ctx, w, h, rng) => { for (let i = 0; i < 140; i++) { ctx.fillStyle = rgba('#ffdda8', 0.08 + rng() * 0.22); const r = rng() * 1.6 + 0.3; ctx.beginPath(); ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2); ctx.fill(); } },
    stars: (ctx, w, h, rng) => { for (let i = 0; i < 160; i++) { const a = 0.15 + rng() * 0.8; ctx.fillStyle = rgba('#ffffff', a); const r = rng() * 1.3 + 0.2; ctx.beginPath(); ctx.arc(rng() * w, rng() * h * 0.8, r, 0, Math.PI * 2); ctx.fill(); } },
    fogdots: (ctx, w, h, rng) => { for (let i = 0; i < 70; i++) { ctx.fillStyle = rgba('#dfeaea', 0.05 + rng() * 0.12); const r = 5 + rng() * 20; ctx.beginPath(); ctx.arc(rng() * w, h * (0.45 + rng() * 0.55), r, 0, Math.PI * 2); ctx.fill(); } },
    embers: (ctx, w, h, rng) => { for (let i = 0; i < 70; i++) { ctx.fillStyle = rgba('#ffb45c', 0.2 + rng() * 0.6); const r = rng() * 1.6 + 0.4; ctx.beginPath(); ctx.arc(rng() * w, h - rng() * h * 0.6, r, 0, Math.PI * 2); ctx.fill(); } },
    none: () => {}
  };

  const KIND_PARTICLES = {
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

  /**
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
   * Рисует фон сцены на canvas.
   * @param {HTMLCanvasElement} canvas
   * @param {object} opts {kind, palette:[bg,mid,accent], seed, tint}
   */
  /** Подготовка холста и палитры — общая для полной сцены и слоя действия. */
  function prepare(canvas, opts) {
    const o = opts || {};
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const w = canvas.clientWidth || 448;
    const h = canvas.clientHeight || 252;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const rawPalette = (o.palette && o.palette.length >= 3) ? o.palette : ['#101820', '#2f4f5a', '#9fe6d0'];
    const daypart = (o.daypart && o.daypart !== 'auto') ? o.daypart : 'auto';
    const palette = daypartPalette(rawPalette, daypart);
    const rng = makeRng(o.seed || 1);
    const kind = SILHOUETTES[o.kind] ? o.kind : 'forest';
    const col = {
      sky: palette[0], mid: palette[1], accent: palette[2],
      dark: shift(palette[0], -14)
    };
    return {
      o, ctx, w, h, rng, kind, col, daypart,
      weather: (o.weather && o.weather !== 'auto' && WEATHERS[o.weather]) ? o.weather : 'auto',
      fire: !!o.fire
    };
  }

  /** Туман, погода и медленный дрейф дымки — «дыхание» фона. */
  function weather(ctx, w, h, rng, col, kind, o) {
    for (let i = 0; i < 4; i++) {
      const fy = h * (0.45 + rng() * 0.5);
      const fg = ctx.createLinearGradient(0, fy - h * 0.12, 0, fy + h * 0.12);
      fg.addColorStop(0, 'rgba(0,0,0,0)');
      fg.addColorStop(0.5, rgba(col.mid, 0.10 + rng() * 0.12));
      fg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fg;
      ctx.fillRect(0, fy - h * 0.12, w, h * 0.24);
    }
    const wKind = (o.weather && o.weather !== 'auto') ? o.weather : '';
    if (wKind) WEATHERS[wKind](ctx, w, h, rng);
    else (PARTICLES[KIND_PARTICLES[kind] || 'none'])(ctx, w, h, rng);
    if (o.daypart === 'night' && kind !== 'space') PARTICLES.stars(ctx, w, h * 0.6, rng);
    if (o.fire) fireLight(ctx, w, h, rng, col, o.time || 0);
    const t = (o.time || 0) / 1000;
    if (!t) return;
    for (let i = 0; i < 2; i++) {
      const y = h * (0.55 + i * 0.18) + Math.sin(t * 0.25 + i) * h * 0.02;
      const dx = Math.sin(t * 0.15 + i * 2) * w * 0.05;
      const grad = ctx.createLinearGradient(dx, y - h * 0.1, dx + w, y + h * 0.1);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(0.5, rgba(col.accent, 0.05));
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, y - h * 0.1, w, h * 0.2);
    }
  }

  /** Винетка и зерно. Поверх ИИ-фона винетка мягче — картинку не глушим. */
  function vignette(ctx, w, h, rng, o) {
    const strength = o.over ? 0.42 : 0.62;
    const vig = ctx.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, h * 1.05);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,' + strength + ')');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.05;
    for (let i = 0; i < Math.round(w * h / 220); i++) {
      ctx.fillStyle = rng() > 0.5 ? '#fff' : '#000';
      ctx.fillRect(rng() * w, rng() * h, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  /** Кто в кадре: фигуры появляются, а не возникают рывком. */
  function actorsLayer(ctx, w, h, rng, col, o) {
    if (!o.actors) return;
    const progress = Math.max(0, Math.min(1, o.progress === undefined ? 1 : o.progress));
    if (o.over) {
      const shadow = ctx.createLinearGradient(0, h * 0.45, 0, h);
      shadow.addColorStop(0, 'rgba(0,0,0,0)');
      shadow.addColorStop(1, 'rgba(0,0,0,0.44)');
      ctx.fillStyle = shadow;
      ctx.fillRect(0, h * 0.45, w, h * 0.55);
    } else {
      ctx.fillStyle = rgba(col.sky, 0.34);
      ctx.fillRect(0, 0, w, h);
    }
    ctx.save();
    ctx.globalAlpha = 0.2 + 0.8 * progress;
    ctx.translate(0, (1 - progress) * h * 0.04);
    drawActors(ctx, w, h, rng, col, o.actors);
    ctx.restore();
  }

  function draw(canvas, opts) {
    const P = prepare(canvas, opts);
    if (!P) return;
    const { o, ctx, w, h, rng, kind, col, daypart } = P;

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

    weather(ctx, w, h, rng, col, kind, Object.assign({}, o, { daypart, weather: P.weather, fire: P.fire }));
    actorsLayer(ctx, w, h, rng, col, o);
    vignette(ctx, w, h, rng, o);
  }

  /**
   * Слой действия поверх готового фона локации: погода и фигуры, без неба и
   * силуэтов. Так фон можно оставить прежним, а «что происходит» — сменить.
   */
  function drawOver(canvas, opts) {
    const P = prepare(canvas, opts);
    if (!P) return;
    const { o, ctx, w, h, rng, kind, col, daypart } = P;
    ctx.clearRect(0, 0, w, h);
    weather(ctx, w, h, rng, col, kind, Object.assign({}, o, { over: true, daypart: P.daypart, weather: P.weather, fire: P.fire }));
    actorsLayer(ctx, w, h, rng, col, Object.assign({}, o, { over: true }));
    vignette(ctx, w, h, rng, Object.assign({}, o, { over: true }));
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

  return {
    draw, drawOver, toDataUrl, makeRng, mix, shift, rgba, hexToRgb, daypartPalette, fireLight,
    KIND_PARTICLES, SILHOUETTES, ACTOR_SHAPES, PROPS, drawActors,
    WEATHERS, DAYPART_TINT, KIND_COUNT: Object.keys(SILHOUETTES).length
  };

});
