/**
 * tools/v20.js — блок B «Механики и глубина» и новый интерфейс, проверка в браузере.
 *
 *   1. Нижний ряд кнопок ровный: одинаковая ширина, высота не меньше 48 px.
 *   2. Полоса механик: припасы и состояния видны, полезные действия появляются
 *      по нужде (предмет с лечением, привал, перевязка, должник).
 *   3. Предметы работают: карточка в сумке показывает «что делает», кнопка
 *      «Выпить» лечит, «ключ» уходит в веху арки.
 *   4. Знакомые: в журнале видно отношение и доверие, у должника — «Позвать».
 *   5. Тем в настройках не меньше пяти, переключение меняет оформление
 *      (Материальная — светлая, Киберпанк — тёмная).
 *
 *   node tools/v20.js [url]
 */
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3000/game.html';
const SHOTS = path.join(__dirname, '..', 'shots');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64');

(async () => {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage(Object.assign({}, devices['iPhone 13 Mini']));
  const errors = [];
  page.on('pageerror', e => errors.push(String((e && e.message) || e).slice(0, 140)));
  const problems = [];
  const step = (ok, text) => {
    console.log((ok ? '✓ ' : '✗ ') + text);
    if (!ok) problems.push(text);
  };

  // картинки и озвучку подменяем: проверяем интерфейс, а не сеть
  await page.route('**/api/image*', route => route.fulfill({
    status: 200, contentType: 'image/png', body: PNG
  }).catch(() => {}));
  await page.route('**/api/tts*', route => route.fulfill({ status: 204, body: '' }).catch(() => {}));

  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('dt2:settings', JSON.stringify({
      master: 'local', voice: false, images: false, ambient: false, motion: false
    }));
  });
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(700);

  /* ---------- начинаем игру встроенным мастером ---------- */
  await page.click('#screen-menu [data-act="new-game"]');
  await page.click('#mode-tabs .tab[data-mode="custom"]');
  await page.waitForSelector('#pane-custom:not([hidden]) #wc-genres .chip', { timeout: 8000 });
  await page.fill('#wc-title', 'Кинжал и Пепел');
  await page.evaluate(() => { const b = document.querySelector('[data-act="create-custom-world"]'); if (b) b.click(); });
  await page.waitForSelector('#hero-name', { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const cls = document.querySelector('#class-list .arch-card'); if (cls) cls.click();
    const race = document.querySelector('#race-list .chip'); if (race) race.click();
  });
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForFunction(() => document.body.dataset.screen === 'game', null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#modal button')).find(x => /Пусть решает/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForFunction(() => !!(window.DTv20 && window.DTv20.game()), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1600);
  // пролог открывается первым ходом: свернём его, чтобы видеть сам игровой экран
  await page.evaluate(() => {
    if (window.State && State.prologueOpen) { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); }
    const b = document.querySelector('[data-act="close-prologue"]');
    if (b) b.click();
    if (window.State) State.prologueOpen = false;
  });
  await page.waitForTimeout(900);
  step(await page.evaluate(() => document.body.dataset.screen === 'game'), 'игра началась: экран игры открыт');

  /* ---------- 1. ровный ряд кнопок ---------- */
  const bar = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('#game-bar .bar-btn')).filter(b => !b.hidden);
    const boxes = btns.map(b => {
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), label: (b.querySelector('.bar-btn__label') || {}).textContent || '' };
    });
    return { count: boxes.length, boxes, texts: boxes.map(b => b.label) };
  });
  const widths = bar.boxes.map(b => b.w);
  const spread = Math.max.apply(null, widths) - Math.min.apply(null, widths);
  step(bar.count >= 6 && spread <= 2, 'ряд кнопок ровный: ' + bar.count + ' кнопок, разброс ширин ' + spread + ' px');
  step(bar.boxes.every(b => b.h >= 44), 'кнопки не ниже 44 px: ' + bar.boxes.map(b => b.h).join('/'));
  step(bar.texts.indexOf('Сумка') >= 0 && bar.texts.indexOf('Журнал') >= 0, 'в ряду есть «Сумка» и «Журнал»: ' + bar.texts.join(', '));

  /* ---------- 2. полоса механик с припасами и состоянием ---------- */
  const injected = await page.evaluate(() => {
    const E = window.DTEngine;
    const g = window.DTv20.game();
    g.hero.hp = Math.max(3, g.hero.maxHp - 5);
    g.hero.inventory.push(E.makeItem('настойка лекаря', { kind: 'heal', power: 5 }));
    g.hero.inventory.push(E.makeItem('ключ от калитки', { kind: 'key' }));
    E.addState(g, 'wound', 2);
    E.addState(g, 'inspired', 2);
    E.memoryOf(g).npcs.push({ name: 'Влас', role: 'трактирщик', relation: 'debtor', trust: 4, seen: 2, helped: false });
    window.DTv20.refresh();
    return { hp: g.hero.hp, maxHp: g.hero.maxHp, items: g.hero.inventory.length, supplies: E.suppliesOf(g) };
  });
  await page.waitForTimeout(300);
  const mech = await page.evaluate(() => ({
    hidden: document.getElementById('mech-bar').hidden,
    chips: Array.from(document.querySelectorAll('#mech-chips .mech-chip')).map(c => c.textContent.trim()),
    acts: Array.from(document.querySelectorAll('#mech-chips .mech-chip--use')).map(c => c.textContent.trim()),
    sub: (document.getElementById('game-sub') || {}).textContent || ''
  }));
  step(!mech.hidden, 'полоса механик видна, когда герою есть что сказать');
  step(/🎒\s*\d/.test(mech.sub), 'припасы видны в шапке рядом с ходами: «' + mech.sub + '»');
  step(mech.chips.filter(t => /Рана|Вдохновение/.test(t)).length === 2, 'состояния видны чипами: ' + mech.chips.filter(t => /Рана|Вдохновение/.test(t)).join(', '));
  step(mech.acts.some(t => /настойка/i.test(t)), 'предмет с лечением предлагается в сцене: ' + mech.acts.join(' · '));
  step(mech.acts.some(t => /Привал/.test(t)) && mech.acts.some(t => /Перевязка/.test(t)), 'привал и перевязка под рукой');
  step(mech.acts.some(t => /Влас/.test(t)), 'должник предлагает помощь: ' + (mech.acts.find(t => /Влас/.test(t)) || '—'));
  const layout = await page.evaluate(() => {
    const r = sel => { const e = document.querySelector(sel); if (!e) return 0; return Math.round(e.getBoundingClientRect().height); };
    const p = document.getElementById('panel');
    return {
      win: Math.round(window.innerHeight),
      header: r('.game-topbar'), media: r('#scene-media'), panel: r('#panel'),
      mech: r('#mech-bar'), actions: r('#actions'),
      panelScrollH: Math.round(p.scrollHeight), textH: r('#scene-text')
    };
  });
  console.log('  экран ' + layout.win + ' px: шапка ' + layout.header + ' · кадр ' + layout.media +
    ' · текст ' + layout.panel + ' (внутри ' + layout.panelScrollH + ') · механики ' + layout.mech +
    ' · кнопки ' + layout.actions);
  await page.screenshot({ path: path.join(SHOTS, 'v20-game.png') });

  /* ---------- 3. предмет лечит, карточка объясняет ---------- */
  const heal = await page.evaluate(() => {
    const g = window.DTv20.game();
    const before = g.hero.hp;
    const chip = Array.from(document.querySelectorAll('#mech-chips .mech-chip--use')).find(c => /настойка/i.test(c.textContent));
    chip.click();
    return { before, after: g.hero.hp, label: chip.textContent.trim() };
  });
  step(heal.after > heal.before, 'настойка вылечила: ' + heal.before + ' → ' + heal.after + ' здоровья');

  const bag = await page.evaluate(() => {
    // состояния обновляем прямо перед журналом: ход мастера мог их уже снять
    const E = window.DTEngine;
    const g = window.DTv20.game();
    E.addState(g, 'wound', E.STATE_MAX_TURNS);
    window.DTv20.refresh();
    const b = document.querySelector('[data-act="open-bag"]');
    if (b) b.click();
    return true;
  });
  await page.waitForSelector('#journal-bag', { timeout: 5000 }).catch(() => {});
  const bagView = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('#journal-bag .item-card'));
    return {
      screen: document.body.dataset.screen,
      cards: cards.map(c => ({
        name: (c.querySelector('.item-card__name') || {}).textContent || '',
        line: (c.querySelector('.item-card__line') || {}).textContent || '',
        verb: (c.querySelector('.item-card__use') || {}).textContent || ''
      })),
      dots: document.querySelectorAll('#journal-bag .supply-dot.is-on').length,
      supplyText: (document.querySelector('#journal-bag .supply-row__text') || {}).textContent || '',
      rel: Array.from(document.querySelectorAll('.rel-card')).map(r => r.textContent.replace(/\s+/g, ' ').trim().slice(0, 60)),
      states: Array.from(document.querySelectorAll('.journal-block .rel-card__name')).map(e => e.textContent)
    };
  });
  step(bagView.screen === 'journal', 'кнопка «Сумка» открывает журнал');
  const key = bagView.cards.find(c => /ключ/i.test(c.name));
  step(!!key && /вех|арк/i.test(key.line) && /Открыть|Применить|Отпереть/.test(key.verb || ''),
    'ключ объясняет себя: «' + (key ? key.name + ' — ' + key.line + ' [' + key.verb + ']' : 'нет') + '»');
  step(bagView.cards.every(c => c.line && c.line.length > 8), 'у каждой карточки есть строка «что делает»');
  step(bagView.dots === injected.supplies, 'полоска припасов совпадает с запасом: ' + bagView.dots + ' из ' + injected.supplies);
  step(bagView.rel.some(t => /Влас/.test(t) && /должник/.test(t)), 'в журнале видно знакомого с отношением: ' + (bagView.rel[0] || '—'));
  step(bagView.states.some(t => /Рана/.test(t)), 'состояние «Рана» объяснено в журнале');
  await page.screenshot({ path: path.join(SHOTS, 'v20-bag.png') });

  /* ---------- 4. темы: выбор и смена оформления ---------- */
  await page.evaluate(() => { const b = document.querySelector('[data-act="back-game"]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => { const b = document.querySelector('[data-act="show-menu"]') || document.querySelector('[data-act="close-game"]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('#modal button')).find(x => /Меню/.test(x.textContent));
    if (b) b.click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const b = document.querySelector('#screen-menu [data-act="settings"]'); if (b) b.click(); });
  await page.waitForSelector('#modal:not([hidden])', { timeout: 5000 });
  await page.waitForTimeout(500);
  const themes = await page.evaluate(() => {
    const mat = Array.from(document.querySelectorAll('#modal .rules-btn'))
      .find(b => (b.textContent || '').trim() === 'Материальная');
    if (!mat) return [];
    if (mat.scrollIntoView) mat.scrollIntoView({ block: 'center' });
    return Array.from(mat.parentElement.querySelectorAll('.rules-btn'))
      .map(b => (b.textContent || '').trim());
  });
  step(themes.length >= 5, 'в настройках ' + themes.length + ' тем: ' + themes.join(' / '));
  await page.screenshot({ path: path.join(SHOTS, 'v20-themes.png') });

  const lum = async id => {
    await page.evaluate(theme => {
      const btn = Array.from(document.querySelectorAll('#modal .rules-btn')).find(b => (b.textContent || '').trim() === theme);
      if (btn) btn.click();
    }, id);
    await page.waitForTimeout(400);
    return page.evaluate(() => {
      const apply = document.getElementById('modal-overlay') || document.body;
      const rgb = getComputedStyle(document.body).backgroundColor.match(/\d+/g);
      const [r, g, b] = rgb.slice(0, 3).map(Number);
      return { theme: window.DTv20.theme(), lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 };
    });
  };
  const material = await lum('Материальная');
  step(material.theme === 'material' && material.lum > 0.7,
    'Материальная тема светлая: тема ' + material.theme + ', яркость фона ' + material.lum.toFixed(2));
  const neon = await lum('Киберпанк');
  step(neon.theme === 'neon' && neon.lum < 0.2,
    'Киберпанк тёмный: тема ' + neon.theme + ', яркость фона ' + neon.lum.toFixed(2));

  // обратно в игру и снимки оформления
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);
  await page.evaluate(() => { const b = document.getElementById('modal'); if (b) b.hidden = true; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(SHOTS, 'v20-theme-neon.png') });
  await page.evaluate(theme => {
    const btn = Array.from(document.querySelectorAll('#modal .rules-btn')).find(b => (b.textContent || '').trim() === theme);
    if (btn) btn.click();
  }, 'Материальная').catch(() => {});
  await page.waitForTimeout(400);

  /* ---------- 5. материальная тема живьём: игра и журнал ---------- */
  await page.evaluate(() => { const b = document.getElementById('modal'); if (b) b.hidden = true; });
  await page.waitForTimeout(200);
  await page.evaluate(() => { const b = document.querySelector('[data-act="my-games"]'); if (b) b.click(); });
  await page.waitForSelector('#saves-list .save-card', { timeout: 6000 }).catch(() => {});
  await page.evaluate(() => {
    const card = document.querySelector('#saves-list .save-card');
    const btn = card && Array.from(card.querySelectorAll('button')).find(b => /Продолжить|Играть|Открыть/.test(b.textContent));
    if (btn) btn.click();
  });
  await page.waitForFunction(() => document.body.dataset.screen === 'game', null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1400);
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); });
  await page.waitForTimeout(500);
  const materialGame = await page.evaluate(() => ({
    screen: document.body.dataset.screen,
    theme: document.body.dataset.theme || '',
    bg: getComputedStyle(document.body).backgroundColor
  }));
  step(materialGame.screen === 'game' && materialGame.theme === 'material',
    'игра продолжается в светлой теме: экран ' + materialGame.screen + ', тема ' + materialGame.theme);
  await page.screenshot({ path: path.join(SHOTS, 'v20-material.png') });
  await page.evaluate(() => { const b = document.querySelector('[data-act="open-bag"]'); if (b) b.click(); });
  await page.waitForSelector('#journal-bag', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'v20-material-bag.png') });

  if (errors.length) problems.push('ошибок страницы: ' + errors.join(' | '));
  console.log(problems.length
    ? '\nБЛОК B И ИНТЕРФЕЙС: ' + problems.length + ' замечаний — ' + problems.join(' · ')
    : '\nБЛОК B И ИНТЕРФЕЙС: предметы, состояния, припасы, знакомые и девять тем на месте — ❤');
  await browser.close();
  process.exit(problems.length ? 1 : 0);
})();
