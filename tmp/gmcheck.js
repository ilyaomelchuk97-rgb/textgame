// проверка: мастер отвечает, даже когда параллельно рисуется картинка
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
const post = (path, body, onChunk) => fetch('http://127.0.0.1:3000' + path, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
}).then(async r => {
  if (!onChunk) return r.json();
  let text = '';
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n'); buf = lines.pop();
    lines.forEach(l => {
      if (!l.trim()) return;
      try { const o = JSON.parse(l); if (o.delta) { text += o.delta; onChunk(o.delta); } if (o.done) console.log(stamp(), 'поток завершён:', o.provider || o.ok, o.cached ? '(кэш)' : ''); } catch (e) {}
    });
  }
  return text;
});

(async () => {
  // 1) картинка и текст одновременно — так делает игра
  const imgAt = stamp();
  const img = fetch('http://127.0.0.1:3000/api/image?prompt=desert%20canyon%20at%20dusk&seed=3&w=448&h=252')
    .then(async r => { console.log(stamp(), 'картинка:', r.status, (await r.arrayBuffer()).byteLength, 'байт (запрошена в ' + imgAt + ')'); })
    .catch(e => console.log(stamp(), 'картинка: сбой', e.message));
  let first = null;
  const text = await post('/api/gm/stream', {
    messages: [{ role: 'system', content: 'Ты гейм-мастер. Отвечай коротко.' }, { role: 'user', content: 'Опиши одним предложением песчаный каньон на закате.' }],
    budgetMs: 26000
  }, chunk => { if (!first) { first = stamp(); console.log(stamp(), 'первый кусок текста:', JSON.stringify(chunk.slice(0, 40))); } });
  await img;
  console.log(stamp(), 'текст целиком:', text.length, 'символов →', JSON.stringify(String(text).slice(0, 80)));
})();
