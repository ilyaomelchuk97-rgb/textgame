/**
 * tools/skins.js — темы как материалы: девять скинов в живом браузере.
 *
 *   1. Каждая тема доводит до экрана своё: форма углов, кромка, заливка, тень.
 *      Материал всех девяти тем разный (подпись темы уникальна).
 *   2. Надписи читаются: контраст текста на кнопке считается по настоящей
 *      поверхности (заливка + слои градиентов над фоном), а не по одному цвету.
 *   3. Размеры не плывут: ряд значков ровный, кнопка не ниже 44 px.
 *   4. «Лёд» действительно обледенел: многослойная наледь и сосульки по кромке.
 *   5. В настройках у каждой темы виден образец материала, под списком — расшифровка,
 *      а переключение темы меняет материал на месте.
 *
 *   node tools/skins.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const SHOTS = path.join(__dirname, '..', 'shots');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

const THEMES = ['night', 'material', 'neon', 'terminal', 'parchment', 'ink', 'sunset', 'ice', 'oled'];

async function openBook(page, theme) {
  await page.addInitScript(t => {
    localStorage.clear();
    localStorage.setItem('dt2:settings', JSON.stringify({
      master: 'local', voice: false, images: false, ambient: false, motion: false, theme: t
    }));
  }, theme);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.click('#mode-tabs .tab[data-mode="books"]');
  await page.waitForSelector('#books-list .book-card', { timeout: 8000 });
  await page.click('#books-list .book-card:nth-child(3) .btn');   // «Соляной тракт»
  await page.waitForSelector('#actions .action-btn', { timeout: 10000 });
  await page.waitForFunction(() => {
    const el = document.querySelector('.scene-text__body');
    const len = (el && el.textContent || '').length;
    const prev = el && el.dataset.prevLen ? Number(el.dataset.prevLen) : 0;
    if (el) el.dataset.prevLen = String(len);
    return len > 120 && len === prev;
  }, { timeout: 14000, polling: 600 }).catch(() => {});
  await page.waitForTimeout(400);
}

/** Читаем материал темы прямо из браузера, вместе с настоящей поверхностью кнопок. */
const read = page => page.evaluate(() => {
  const parts = c => {
    const m = String(c || '').match(/[\d.]+/g) || [];
    return [Number(m[0] || 0), Number(m[1] || 0), Number(m[2] || 0), m.length > 3 ? Number(m[3]) : 1];
  };
  const over = (fg, bg) => [
    Math.round(fg[0] * fg[3] + bg[0] * (1 - fg[3])),
    Math.round(fg[1] * fg[3] + bg[1] * (1 - fg[3])),
    Math.round(fg[2] * fg[3] + bg[2] * (1 - fg[3]))
  ];
  const lum = c => {
    const [r, g, b] = parts(c).map(v => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => {
    const l1 = lum(a), l2 = lum(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  };
  /** Настоящая поверхность: подложка снизу + все слои градиентов поверх неё. */
  const surface = el => {
    let base = [255, 255, 255];
    for (let n = el; n; n = n.parentElement) {
      const c = parts(getComputedStyle(n).backgroundColor);
      if (c[3] > 0.5) { base = c.slice(0, 3); break; }
    }
    const img = getComputedStyle(el).backgroundImage || 'none';
    const all = (img.match(/rgba?\([^)]+\)/g) || []).map(parts);
    // совсем прозрачные слои (конец градиента) поверхности не образуют — их не считаем
    const stops = all.filter(c => c[3] >= 0.45);
    if (!stops.length) return { avg: base, worst: base };
    const laid = stops.map(s => over(s, base));
    const weight = stops.reduce((n, c) => n + c[3], 0);
    const avg = [0, 1, 2].map(i => Math.round(laid.reduce((n, c, k) => n + c[i] * stops[k][3], 0) / weight));
    // худший случай — видимый слой, ближайший по яркости к цвету текста
    const text = lum(getComputedStyle(el).color);
    const worst = laid.slice().sort((a, b) => Math.abs(lum(a) - text) - Math.abs(lum(b) - text))[0];
    return { avg, worst };
  };
  const rgbStr = c => 'rgb(' + c.join(',') + ')';
  const material = el => {
    if (!el) return null;
    const cs = getComputedStyle(el);
    const s = surface(el);
    return {
      radius: cs.borderRadius,
      paint: cs.backgroundImage,
      tint: cs.backgroundColor,
      edge: cs.borderColor,
      style: cs.borderStyle,
      shadow: cs.boxShadow,
      color: cs.color,
      layers: (cs.backgroundImage || 'none').split(/,(?![^(]*\))/).length,
      contrastAvg: contrast(cs.color, rgbStr(s.avg)),
      contrastWorst: contrast(cs.color, rgbStr(s.worst))
    };
  };
  /** Пробник: кнопки нужного класса меряем даже там, где их сейчас нет на экране. */
  const probe = cls => {
    const el = document.createElement('button');
    el.className = cls;
    el.textContent = cls.indexOf('action-btn') >= 0 ? 'Проба пути' : 'Проба';
    el.style.cssText = 'position:absolute;left:-9999px;top:0;width:220px;';
    document.body.appendChild(el);
    const m = material(el);
    el.remove();
    return m;
  };
  const btn = material(document.querySelector('.action-btn')) || probe('action-btn');
  const primary = material(document.querySelector('.action-btn--primary')) || probe('btn btn--primary');
  const card = material(document.querySelector('.book-card'));
  const topbar = getComputedStyle(document.querySelector('.game-topbar'));
  const barBtns = Array.from(document.querySelectorAll('#game-bar .bar-btn')).filter(b => !b.hidden).map(b => b.getBoundingClientRect());
  const actBoxes = Array.from(document.querySelectorAll('#actions .action-btn')).map(b => b.getBoundingClientRect());
  // сосульки висят над кадром и с нижней полосы: проверяем обе кромки
  const icicle = (function () {
    const edges = [document.querySelector('.scene-media'), document.querySelector('.actions')];
    return edges.filter(Boolean).every(el => {
      const cs = getComputedStyle(el, '::after');
      return cs.content !== 'none' && cs.content !== 'normal' && parseFloat(cs.height || '0') > 0
        && /radial-gradient/.test(cs.backgroundImage || '');
    });
  })();
  const artRaw = getComputedStyle(document.body).getPropertyValue('--sk-art-bg').trim();
  const art = (artRaw && artRaw !== 'none') ? artRaw : '';
  return {
    theme: document.body.dataset.theme || '',
    art: art || '',
    artOnBtn: /data:image/.test(btn ? btn.paint : ''),
    btn, primary, card,
    topbarPaint: topbar.backgroundImage,
    barSpread: barBtns.length ? Math.max.apply(null, barBtns.map(b => Math.round(b.width))) - Math.min.apply(null, barBtns.map(b => Math.round(b.width))) : -1,
    barCount: barBtns.length,
    minBtn: actBoxes.length ? Math.min.apply(null, actBoxes.map(b => Math.round(b.height))) : -1,
    frost: /repeating-linear-gradient/.test(btn.paint || ''),
    icicle
  };
});

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage(Object.assign({}, devices['iPhone 13 Mini']));
  const errors = [];
  page.on('pageerror', e => errors.push(String((e && e.message) || e).slice(0, 140)));
  await page.route('**/api/gm*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, provider: 'mock', text: '{}' })
  }));
  await page.route('**/api/image*', route => route.fulfill({ status: 200, contentType: 'image/png', body: PNG }).catch(() => {}));
  await page.route('**/api/tts*', route => route.fulfill({ status: 204, body: '' }).catch(() => {}));

  const problems = [];
  const step = (ok, text) => {
    console.log((ok ? '✓ ' : '✗ ') + text);
    if (!ok) problems.push(text);
  };

  const seen = [];
  for (const theme of THEMES) {
    await openBook(page, theme);
    const info = await read(page);
    seen.push(info);
    await page.screenshot({ path: path.join(SHOTS, 'v22-skin-' + theme + '.png') });
    console.log('  · ' + theme + ': углы ' + info.btn.radius + ', кромка ' + info.btn.style
      + ', слоёв ' + info.btn.layers + ', контраст ' + info.btn.contrastAvg.toFixed(1)
      + '/' + info.btn.contrastWorst.toFixed(1) + ', значков ' + info.barCount
      + ', кнопка ' + info.minBtn + ' px');
  }

  /* ---------- 1. материал у каждой темы свой ---------- */
  const signatures = seen.map(i => [i.btn.radius, i.btn.paint, i.btn.shadow, i.card.radius, i.card.paint].join('|'));
  step(new Set(signatures).size === THEMES.length, 'у всех ' + THEMES.length + ' тем свой материал: подписей ' + new Set(signatures).size);
  step(seen.every(i => i.theme), 'тема применяется на экране игры: ' + seen.map(i => i.theme).join(', '));
  const radii = {};
  seen.forEach(i => { radii[i.btn.radius] = (radii[i.btn.radius] || 0) + 1; });
  step(Object.keys(radii).length >= 4, 'форма кнопок различается: радиусы — ' + Object.keys(radii).join(' / '));
  step(Object.keys(radii).some(r => parseFloat(r) <= 4) && Object.keys(radii).some(r => parseFloat(r) >= 12),
    'есть и острые, и мягкие формы: ' + Object.keys(radii).join(' / '));
  step(seen.filter(i => i.btn.style === 'dashed').map(i => i.theme).join() === 'terminal',
    'пунктирные рамки только у «Терминала»');

  /* ---------- 2. читаемость надписи ---------- */
  const avgMin = Math.min.apply(null, seen.map(i => i.btn.contrastAvg));
  const worstMin = Math.min.apply(null, seen.map(i => i.btn.contrastWorst));
  step(avgMin >= 3, 'надпись на кнопке читается во всех темах: худший контраст ' + avgMin.toFixed(1) + ':1');
  step(worstMin >= 2.2, 'даже самый бледный слой кнопки не съедает текст: ' + worstMin.toFixed(1) + ':1');
  const prim = seen.filter(i => i.primary && i.primary.contrastAvg >= 3);
  step(prim.length === seen.length, 'главные кнопки читаются в каждой теме: ' + prim.length + '/' + seen.length);

  /* ---------- 3. размеры не плывут ---------- */
  step(seen.every(i => i.barSpread === 0), 'ряд значков ровный: разброс ' + seen.map(i => i.barSpread).join('/') + ' px');
  step(seen.every(i => i.minBtn >= 44), 'кнопки не ниже 44 px во всех темах: ' + seen.map(i => i.minBtn).join('/'));

  /* ---------- 3б. настоящий материал темы (картинка) ---------- */
  const withArt = seen.filter(i => i.art);
  step(withArt.length >= 5, 'у тем есть настоящий материал-картинка: ' + withArt.map(i => i.theme).join(' · '));
  step(withArt.every(i => i.artOnBtn), 'материал доходит до кнопок: ' + withArt.filter(i => i.artOnBtn).length + '/' + withArt.length);
  const artReadable = withArt.every(i => i.btn.contrastAvg >= 3 && i.btn.contrastWorst >= 2.2);
  step(artReadable, 'на материале темы надпись всё равно читается: худший средний контраст '
    + Math.min.apply(null, withArt.map(i => i.btn.contrastAvg)).toFixed(1) + ':1');
  /* ---------- 4. лёд обледенел ---------- */
  const ice = seen[THEMES.indexOf('ice')];
  step(ice && ice.frost && ice.btn.layers >= 3, '«Лёд»: наледь на кнопке в ' + (ice ? ice.btn.layers : 0) + ' слоях');
  step(ice && ice.icicle, '«Лёд»: по кромке шапки висят сосульки');
  const neon = seen[THEMES.indexOf('neon')];
  step(neon && neon.frost, '«Киберпанк»: на кнопках сканлайны');
  const ink = seen[THEMES.indexOf('ink')];
  step(ink && ink.card.layers >= 4, '«Тушь и медь»: заклёпки по углам блоков (' + (ink ? ink.card.layers : 0) + ' слоя)');

  /* ---------- 5. образцы тем в настройках ---------- */
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  await page.click('#screen-menu [data-act="settings"]');
  await page.waitForSelector('#modal:not([hidden]) .rules-btn', { timeout: 8000 });
  await page.waitForTimeout(300);
  const demos = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('#modal .rules-btn'));
    const themes = rows.filter(r => r.querySelector('.skin-demo'));
    return {
      count: themes.length,
      titles: themes.map(r => (r.textContent || '').trim()),
      styles: themes.map(r => {
        const d = r.querySelector('.skin-demo');
        const b = r.querySelector('.skin-demo__btn');
        const cs = getComputedStyle(d), bs = getComputedStyle(b);
        return [d.borderRadius, cs.backgroundImage.slice(0, 48), bs.borderRadius, bs.borderColor].join('|');
      }),
      hint: (document.querySelector('#modal .theme-hint') || {}).textContent || '',
      // в настройках не должно быть безымянных кнопок: образец темы — украшение, а не замена надписи
      rows: Array.from(document.querySelectorAll('#modal .rules-row .rules-btn')).length,
      empty: Array.from(document.querySelectorAll('#modal .rules-row .rules-btn'))
        .filter(b => !(b.textContent || '').trim()).length
    };
  });
  step(demos.empty === 0 && demos.rows >= 30, 'все пункты настроек подписаны: '
    + demos.rows + ' строк, безымянных ' + demos.empty);
  step(demos.count === 10, 'в настройках у каждой темы есть образец: ' + demos.count + ' — ' + demos.titles.join(' · '));
  step(new Set(demos.styles).size >= 10, 'образцы показывают разный материал: ' + new Set(demos.styles).size + ' из ' + demos.count);
  step(/Тема «/.test(demos.hint) && demos.hint.length > 30, 'под списком видно, что изменится: ' + demos.hint);
  // снимок — на разделе «Оформление»: видно, как выглядят образцы всех тем
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('#modal .rules-row'))
      .find(r => r.querySelector('.skin-demo'));
    if (row && row.scrollIntoView) row.scrollIntoView({ block: 'center' });
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'v22-skins-settings.png') });

  const before = await page.evaluate(() => getComputedStyle(document.querySelector('#modal .rules-btn')).backgroundImage);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('#modal .rules-btn')).find(b => (b.textContent || '').trim() === 'Лёд');
    if (btn) btn.click();
  });
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({
    theme: document.body.dataset.theme,
    bg: getComputedStyle(document.querySelector('#modal .rules-btn')).backgroundImage,
    box: getComputedStyle(document.querySelector('.modal-box')).backgroundImage,
    hint: (document.querySelector('#modal .theme-hint') || {}).textContent || ''
  }));
  step(after.theme === 'ice' && after.bg !== before, 'смена темы в настройках сразу меняет материал кнопок');
  step(/Лёд/.test(after.hint) && /наледь/.test(after.hint), 'подпись объясняет новый материал: ' + after.hint);
  await page.screenshot({ path: path.join(SHOTS, 'v22-skins-ice-settings.png') });

  step(errors.length === 0, 'ошибок страницы нет' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  console.log(problems.length ? '\nПроблемы:\n- ' + problems.join('\n- ') : '\nСКИНЫ ТЕМ: девять материалов на месте — ❤');
  process.exit(problems.length ? 1 : 0);
})();
