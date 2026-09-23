// Визуальная проверка настроений: как выглядят и движутся сцена и текст
const { chromium } = require('playwright');
const MOODS = process.env.MOODS ? process.env.MOODS.split(',') : ['book', 'dark', 'dread', 'hurt', 'tense', 'triumph', 'ironic'];
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 375, height: 629 }, deviceScaleFactor: 2, locale: 'ru-RU' });
  await page.goto('http://127.0.0.1:3000/index.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  // быстрый вход в игру: своя игра + герой
  await page.click('#screen-menu [data-act="new-game"]');
  await page.waitForTimeout(300);
  await page.click('[data-mode="custom"]');
  await page.fill('#wc-title', 'Тонкая проверка оформления');
  await page.fill('#wc-goal', 'дойти до города');
  await page.click('[data-act="create-custom-world"]');
  await page.waitForSelector('#hero-name');
  await page.fill('#hero-name', 'Райн');
  await page.waitForTimeout(1200);
  await page.click('#screen-hero [data-act="start-adventure"]');
  await page.waitForFunction(() => window.DTstate && window.DTstate().options >= 3, null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => { const b = document.querySelector('[data-act="close-prologue"]'); if (b) b.click(); });
  await page.waitForTimeout(400);
  for (const mood of MOODS) {
    const info = await page.evaluate(m => {
      const g = document.getElementById('screen-game');
      g.dataset.mood = m;
      g.dataset.motion = 'on';
      g.style.setProperty('--mood-tint', ({ book: '', dark: '#2a2f45', dread: '#1b1030', hurt: '#3a1620', tense: '#33290f', triumph: '#12301f', ironic: '#2b2a3a' })[m] || 'transparent');
      const body = document.querySelector('#scene-text .scene-text__body');
      const cs = body ? getComputedStyle(body) : null;
      const panel = document.getElementById('panel');
      return {
        anim: cs ? cs.animationName : '—',
        dur: cs ? cs.animationDuration : '',
        wash: panel ? getComputedStyle(panel).borderLeftColor : '',
        transform: cs ? cs.transform : ''
      };
    }, mood);
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'shots/mood-' + mood + '.png' });
    console.log(mood.padEnd(8), 'анимация:', info.anim, '|', info.dur, '| кромка:', info.wash);
  }
  // Проверка «ползёт и дрожит»: сравниваем положение текста в двух кадрах анимации
  await page.evaluate(() => { document.getElementById('screen-game').dataset.mood = 'dread'; });
  const pos = [];
  for (let i = 0; i < 6; i++) {
    pos.push(await page.evaluate(() => {
      const r = document.querySelector('#scene-text .scene-text__body').getBoundingClientRect();
      return [Math.round(r.x * 100) / 100, Math.round(r.y * 100) / 100];
    }));
    await page.waitForTimeout(420);
  }
  const xs = pos.map(p => p[0]), ys = pos.map(p => p[1]);
  console.log('текст в страхе: x', xs.join('/'), '· y', ys.join('/'));
  console.log('сдвиг за 2.5с: x', (Math.max(...xs) - Math.min(...xs)).toFixed(2), 'px, y', (Math.max(...ys) - Math.min(...ys)).toFixed(2), 'px');
  await b.close();
})();
