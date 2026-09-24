# -*- coding: utf-8 -*-
"""Патч 1 (п.13): офлайн-пак фонов — 15 новых основ + слои (время суток, погода, огонь)."""
import io, sys

path = '/home/user/src/backdrop.js'
src = io.open(path, encoding='utf-8').read()
orig = src

def sub_once(tag, old, new):
    global src
    n = src.count(old)
    if n != 1:
        print('ЯКОРЬ НЕ НАЙДЕН (%d совпадений): %s' % (n, tag)); sys.exit(1)
    src = src.replace(old, new)

# ---------------------------------------------------------------- 1. новые основы
NEW_KINDS = u'''
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
      // палуба: борт, мачта с парусом, ванты
      const deck = h * (0.66 + depth * 0.06);
      ctx.fillStyle = rgba(col.dark, 0.92);
      ctx.fillRect(0, deck, w, h - deck);
      ctx.strokeStyle = rgba(col.mid, 0.7);
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = deck + (h - deck) * (i / 6);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      const mx = w * (0.42 + rng() * 0.16);
      ctx.fillStyle = rgba(col.dark, 0.95);
      ctx.fillRect(mx, h * 0.08, 6, deck - h * 0.08);
      ctx.beginPath();                                        // парус
      ctx.moveTo(mx + 6, h * 0.1);
      ctx.quadraticCurveTo(mx + w * 0.3, h * 0.28, mx + 6, h * 0.62);
      ctx.closePath();
      ctx.fillStyle = rgba(col.mid, 0.55);
      ctx.fill();
      ctx.strokeStyle = rgba(col.dark, 0.75);                 // ванты
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(mx + 3, h * (0.12 + i * 0.14));
        ctx.lineTo(mx + w * (0.07 + i * 0.09) * -1, deck);
        ctx.stroke();
      }
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
'''

sub_once('SILHOUETTES',
  u'''      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  };
''',
  u'''      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },
''' + NEW_KINDS + u'''  };
''')

io.open(path, 'w', encoding='utf-8').write(src)
print('OK: основы добавлены, было %d симв., стало %d' % (len(orig), len(src)))
