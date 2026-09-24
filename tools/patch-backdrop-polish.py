# -*- coding: utf-8 -*-
"""Доводка пака: пещера, корабль, трактир, библиотека, интерьер — читаемее."""
import io, sys

path = '/home/user/src/backdrop.js'
src = io.open(path, encoding='utf-8').read()
orig = src

def sub_once(tag, old, new):
    global src
    n = src.count(old)
    if n != 1:
        print('ЯКОРЬ НЕ НАЙДЕН (%d): %s' % (n, tag)); sys.exit(1)
    src = src.replace(old, new, 1)

# --- пещера: каменный мешок вместо «волн»
sub_once('cave',
u'''    cave(ctx, w, h, rng, col, depth) {
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
    },''',
u'''    cave(ctx, w, h, rng, col, depth) {
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
    },''')

# --- корабль: палуба, перила, волны, фонарь
sub_once('ship',
u'''    ship(ctx, w, h, rng, col, depth) {
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
    },''',
u'''    ship(ctx, w, h, rng, col, depth) {
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
    },''')

# --- трактир: очаг, кружки на стойке
sub_once('tavern',
u'''        ctx.fillRect(tx + w * 0.13, ty + 6, 5, h * 0.12);
      }
    },''',
u'''        ctx.fillRect(tx + w * 0.13, ty + 6, 5, h * 0.12);
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
    },''')

# --- интерьер: лампа и мебель, чтобы комната не была чёрным блоком
sub_once('interior',
u'''      const g = ctx.createRadialGradient(vx, vy, 2, vx, vy, w * 0.2);
      g.addColorStop(0, rgba(col.accent, 0.5));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    },''',
u'''      const g = ctx.createRadialGradient(vx, vy, 2, vx, vy, w * 0.2);
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
    },''')

# --- библиотека: свеча и стопка книг на столе
sub_once('library',
u'''      ctx.fillStyle = g;
      ctx.fillRect(w * 0.28, h * 0.56, w * 0.44, h * 0.34);
    },''',
u'''      ctx.fillStyle = g;
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
    },''')

io.open(path, 'w', encoding='utf-8').write(src)
print('OK: доводка пака — %d симв. (было %d)' % (len(src), len(orig)))
