// качество и скорость мастера через свой сервер (шлюз gen)
process.env.TZ = 'Europe/Moscow';
const E = require('../src/engine.js');
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';

const draft = { name: 'Астра', gameName: 'Ржавые Пески Кар-Адама', mode: 'custom', title: 'Ржавые Пески Кар-Адама' };
const game = E.createGame({ scenarioId: 'desert', heroName: 'Астра', gameName: 'Ржавые Пески Кар-Адама' });
const heroPrompt = E.buildHeroPrompt ? null : null;
console.log(stamp(), 'доступные функции движка:', Object.keys(E).filter(k => /Prompt|hero|HERO/i.test(k)).join(', '));

const post = (path, body) => fetch('http://127.0.0.1:3000' + path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
});

(async () => {
  // 1) герой от мастера — самый показательный запрос
  if (E.HERO_SYSTEM_PROMPT || E.buildHeroPrompt) {
    const messages = [
      { role: 'system', content: E.HERO_SYSTEM_PROMPT || E.SYSTEM_PROMPT },
      { role: 'user', content: E.buildHeroPrompt ? E.buildHeroPrompt(draft, 6) : 'придумай героя' }
    ];
    const started = Date.now();
    const res = await post('/api/gm', { messages, budgetMs: 32000 });
    const data = await res.json();
    console.log('\n=== герой: http', res.status, '| за', Date.now() - started, 'мс | канал:', data.provider, '| кэш:', !!data.cached);
    console.log(String(data.text || data.ok === false ? data.text : '').slice(0, 1200));
  }

  // 2) ход мастера
  const turn = [
    { role: 'system', content: E.SYSTEM_PROMPT },
    { role: 'user', content: E.buildTurnPrompt(game, { text: 'Отследить оставшиеся следы каравана', stat: 'perception', dc: 11 }, { roll: 13, total: 14, dc: 11, success: true, label: 'Средне', margin: 3 }) }
  ];
  const started2 = Date.now();
  let first = null, text = '';
  const res2 = await post('/api/gm/stream', { messages: turn, budgetMs: 32000 });
  const reader = res2.body.getReader(); const dec = new TextDecoder(); let buf = '';
  let provider = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    for (const l of lines) {
      if (!l.trim()) return;
      let o; try { o = JSON.parse(l); } catch (e) { continue; }
      if (o.delta) { text += o.delta; if (!first) first = Date.now() - started2; }
      if (o.done) provider = o.provider || '';
      if (o.note) console.log('  нота:', o.note, String(o.reason).slice(0, 90));
    }
  }
  console.log('\n=== ход: первый кусок', first, 'мс | всего', text.length, 'симв за', Date.now() - started2, 'мс | канал:', provider);
  try { const p = E.parseGmResponse(text, { game }); console.log('  разбор ответа:', p.ok ? 'ок' : 'сбой', '| сцен:', (p.scenes || []).length || '—', '| вариантов:', (p.options || []).length || '—'); if (p.scene) console.log('  сцена:', p.scene.replace(/\s+/g, ' ').slice(0, 200)); if (p.options) p.options.slice(0, 3).forEach(o => console.log('   ·', o.text)); } catch (e) { console.log('  разбор упал:', e.message); }
})();
