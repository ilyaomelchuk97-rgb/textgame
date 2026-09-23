const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
const sana = async n => {
  const r = await fetch('https://image.pollinations.ai/prompt/desert%20oasis%20at%20dawn%20cinematic?width=448&height=256&model=sana&nologo=true&seed=' + (100 + n), { signal: AbortSignal.timeout(60000) });
  const b = await r.arrayBuffer();
  return `sana#${n} → ${r.status} ${r.headers.get('content-type')} ${b.byteLength}б`;
};
const HF = 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api/call/infer';
const hf = async n => {
  const s = await fetch(HF, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: ['desert oasis at dawn cinematic ' + n, n, false, 448, 256, 4] }), signal: AbortSignal.timeout(20000) });
  if (!s.ok) return `hf#${n} → старт ${s.status} ${(await s.text()).slice(0, 80)}`;
  const id = (await s.json()).event_id;
  const deadline = Date.now() + 40000;
  while (Date.now() < deadline) {
    const st = await fetch(HF + '/' + id, { signal: AbortSignal.timeout(12000) });
    const txt = await st.text();
    const url = (txt.match(/"(https?:\/\/[^"]+?\.(?:webp|png|jpe?g))"/) || [])[1];
    if (url) { const img = await fetch(url); const b = await img.arrayBuffer(); return `hf#${n} → ${img.status} ${b.byteLength}б за ${Date.now() - t0}мс`; }
    if (/event: error/.test(txt)) return `hf#${n} → ошибка Space: ${txt.slice(0, 120)}`;
    await new Promise(r => setTimeout(r, 900));
  }
  return `hf#${n} → не дождались`;
};
(async () => {
  console.log(stamp(), 'одиночный sana:', await sana(1).catch(e => 'отказ ' + e.message));
  console.log(stamp(), 'одиночный hf  :', await hf(2).catch(e => 'отказ ' + e.message));
  const both = await Promise.all([sana(3).catch(e => 'отказ ' + e.message), hf(4).catch(e => 'отказ ' + e.message)]);
  console.log(stamp(), 'пара  :', both.join(' | '));
  const four = await Promise.all([1, 2, 3, 4].map(n => hf(10 + n).catch(e => 'отказ ' + e.message)));
  console.log(stamp(), '4×hf :', four.join(' | '));
})();
