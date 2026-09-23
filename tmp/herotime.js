// сколько идёт набор героя от умной модели (свежий запрос, без кэша)
const E = require('../src/engine.js');
const base = E.scenarioById ? E.scenarioById('desert') : null;
const draft = { title: 'Ржавые Пески Кар-Адама ' + Math.random().toString(36).slice(2, 6), gameName: 'Ржавые Пески Кар-Адама' };
const messages = [
  { role: 'system', content: E.HERO_SYSTEM_PROMPT },
  { role: 'user', content: E.buildHeroPrompt(draft, base, { variant: 3, used: [] }) }
];
(async () => {
  const t0 = Date.now();
  let first = null, text = '';
  const res = await fetch('http://127.0.0.1:3000/api/gm/stream', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ messages, budgetMs: 32000 })
  });
  const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let provider = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      if (!l.trim()) continue;
      let o; try { o = JSON.parse(l); } catch (e) { continue; }
      if (o.delta) { text += o.delta; if (!first) first = Date.now() - t0; }
      if (o.note) console.log('  нота:', o.note, String(o.reason).slice(0, 80));
      if (o.done) provider = o.provider || '';
    }
  }
  console.log('герой: первый кусок', first, 'мс | всего', text.length, 'симв за', Date.now() - t0, 'мс | канал:', provider);
  const p = E.heroProfileFromText(text, {});
  if (p) p.classes.slice(0, 3).forEach(c => console.log('  ·', c.title, '|', c.hint, '|', JSON.stringify(c.bonus)));
  else console.log('  разбор не прошёл:', text.slice(0, 200));
})();
