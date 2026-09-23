// Ходы в интерфейсе с ожиданием конца хода (через window.DTstate), а не по DOM-#actions.
// OFFLINE=1 — режем все внешние текстовые каналы и смотрим, как играет встроенный мастер.
// TURNS=3 (по умолчанию), NAME=… — уникальное имя мира, чтобы не попали в кэш мастера.
const { chromium } = require('playwright');
const TURNS = Number(process.env.TURNS || 3);
const OFFLINE = !!process.env.OFFLINE;
const NAME = process.env.NAME || ('Стеклянные Степи ' + Date.now().toString().slice(-5));

const wait = async (page, fn, timeout, label, arg) => {
  try { await page.waitForFunction(fn, arg === undefined ? null : arg, { timeout, polling: 500 }); return true; }
  catch (e) { console.log('ТАЙМАУТ: ' + label); return false; }
};

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 390, height: 844 }, locale: 'ru-RU' });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  let killed = 0;
  if (OFFLINE) {
    const cut = r => { killed++; console.log('  ✂ обрезан запрос:', r.request().url().slice(0, 90)); return r.abort(); };
    await page.route(/\/api\/gm/, cut);                      // и /api/gm, и /api/gm/stream
    await page.route(/text\.pollinations\.ai/, cut);
    await page.route(/gen\.pollinations\.ai/, cut);
  }
  page.on('console', m => {
    const t = m.text().replace(/%c\[dt-api\]\s*color:#[0-9a-f]+/i, '');
    if (t.trim() && /мастер|канал|провайдер|поток|ошибка|повтор|встроен|сервер/i.test(t)) console.log('  ·', t.slice(0, 130));
  });

  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  if (process.env.VOICE === 'auto') {
    // включаем озвучку заранее: смотрим, каким тоном игра читает сцену сама
    await page.evaluate(() => localStorage.setItem('dt2:settings', JSON.stringify({ voice: true, motion: true })));
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(400);
  await page.click('[data-mode="custom"]');
  await page.waitForTimeout(300);
  await page.fill('#wc-title', NAME);
  await page.fill('#wc-goal', 'найти пропавший караван');
  await page.click('[data-act="create-custom-world"]');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Райн');
  await page.waitForTimeout(2500);
  await page.click('#screen-hero [data-act="start-adventure"]');

  const ok = await wait(page, () => {
    const s = window.DTstate && window.DTstate();
    return s && s.screen === 'game' && s.options >= 3 && !s.busy && s.scene.length > 40;
  }, 90000, 'первый ход не дошёл');
  if (!ok) {
    await page.screenshot({ path: 'shots/dbg-turns.png' });
    console.log('снимок: shots/dbg-turns.png');
  }
  await page.evaluate(() => { const x = document.querySelector('[data-act="close-prologue"]'); if (x) x.click(); });
  await page.waitForTimeout(400);

  const seen = [];
  const dump = async (i) => {
    const s = await page.evaluate(() => window.DTstate());
    seen.push(s.scene);
    const dup = seen.length > 1 && seen[seen.length - 1].slice(0, 90) === seen[seen.length - 2].slice(0, 90);
    console.log('ХОД ' + i + ' | turn=' + s.turn + ' | ' + s.chapter + ' | место: ' + (s.place || '—') + ' | рядом: ' + (s.npc || '—') + (s.offline ? ' | [встроенный мастер]' : ''));
    console.log('  настроение: ' + s.mood + ' · подача ' + s.moodVoice + ' · движение ' + s.motion + (s.typing ? ' · печатается' : ''));
    console.log('  ' + s.scene.replace(/\s+/g, ' ').slice(0, 260) + (s.scene.length > 260 ? ' …(' + s.scene.length + ')' : ''));
    if (dup) console.log('  !! сцена совпала с прошлой');
    console.log('  варианты(' + s.options + '): ' + s.optionTexts.slice(0, 3).join(' · '));
    if (s.notes.length) console.log('  сообщения: ' + s.notes.join(' | '));
    return s;
  };

  await dump(1);
  for (let i = 2; i <= TURNS; i++) {
    const before = await page.evaluate(() => window.DTstate().turn);
    await page.evaluate(() => document.querySelectorAll('#actions .action-btn')[0].click());
    const done = await wait(page, t => { const s = window.DTstate(); return s.turn > t && !s.busy && s.options >= 3; }, 90000, 'ход ' + i, before);
    await page.waitForTimeout(600);
    await dump(i);
    if (!done) break;
  }
  if (process.env.VOICE) {
    const tts = [];
    page.on('response', r => {
      const u = r.url();
      if (u.indexOf('/api/tts') === 0 || u.indexOf('/api/tts?') > 0) {
        const h = r.headers();
        tts.push({ url: u.slice(0, 120), status: r.status(), src: h['x-tts-source'] || '', mood: h['x-tts-mood'] || '', kb: Math.round((Number(h['content-length']) || 0) / 1024) });
      }
    });
    if (process.env.VOICE !== 'auto') {
      await page.evaluate(() => { const b = document.querySelector('[data-act="speak-scene"]'); if (b) b.click(); });
    }
    await page.waitForTimeout(6000);
    console.log('ОЗВУЧКА:', JSON.stringify(tts, null, 1));
  }
  if (process.env.SETTINGS) {
    await page.click('[data-act="close-game"]');
    await page.waitForTimeout(400);
    const leave = await page.$('#modal-box .btn--primary');
    if (leave) { await leave.click(); await page.waitForTimeout(500); }
    await page.click('[data-act="settings"]');
    await page.waitForTimeout(700);
    await page.screenshot({ path: process.env.SETTINGS });
    const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#modal-box .section-title, #modal-box .chip, #modal-box .choice')).map(x => x.textContent.trim().slice(0, 60)).slice(0, 24));
    console.log('НАСТРОЙКИ-СТРОКИ:', JSON.stringify(rows, null, 1));
  }
  if (process.env.SHOT) {
    await page.evaluate(() => { const p = document.querySelector('#prologue, [data-act="close-prologue"]'); if (p) p.click(); });
    await page.waitForTimeout(700);
    await page.screenshot({ path: process.env.SHOT });
    console.log('снимок: ' + process.env.SHOT);
  }
  console.log('обрезано запросов:', killed);
  console.log('ошибки страницы:', errors.length ? errors : 'нет');
  await b.close();
})();
