// стресс: текст, картинка и второй текст одновременно — как в живой игре
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
const rnd = Math.random().toString(36).slice(2, 8);

const stream = (label, prompt) => fetch('http://127.0.0.1:3000/api/gm/stream', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ messages: [{ role: 'system', content: 'Отвечай одним предложением.' }, { role: 'user', content: prompt }], budgetMs: 26000 })
}).then(async r => {
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = ''; let text = ''; let first = null; let provider = '';
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    lines.forEach(l => { if (!l.trim()) return; try { const o = JSON.parse(l); if (o.delta) { text += o.delta; if (!first) first = stamp(); } if (o.done) provider = o.provider || ''; if (o.note) console.log(stamp(), label, 'нота:', o.note, o.reason || ''); } catch (e) {} });
  }
  console.log(stamp(), label, '→ первый кусок', first, '· всего', text.length, 'симв. · канал', provider || '—');
  return text.length;
});

(async () => {
  const img = fetch('http://127.0.0.1:3000/api/image?prompt=lonely%20canyon%20' + rnd + '&seed=' + rnd + '&w=448&h=252')
    .then(async r => console.log(stamp(), 'картинка:', r.status, (await r.arrayBuffer()).byteLength, 'байт'))
    .catch(e => console.log(stamp(), 'картинка: сбой', e.message));
  const a = stream('текст-А', 'Опиши одним предложением пустыню ' + rnd);
  const b = stream('текст-Б', 'Опиши одним предложением ночной город ' + rnd);
  const [ra, rb] = await Promise.all([a, b]);
  await img;
  console.log(stamp(), 'итог: А', ra, '· Б', rb, '· оба ответили:', ra > 20 && rb > 20 ? 'да' : 'НЕТ');
})();
