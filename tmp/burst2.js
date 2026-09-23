// залп запросов картинок: как в игре (кадр + портрет + ранний старт)
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
const one = async (label, prompt) => {
  const R = Math.floor(Math.random() * 1e6);
  const started = Date.now();
  try {
    const r = await fetch('http://127.0.0.1:3000/api/image?prompt=' + encodeURIComponent(prompt + ' ' + R) + '&seed=' + R + '&w=448&h=256');
    const buf = Buffer.from(await r.arrayBuffer());
    console.log(stamp(), label, '→', r.status, buf.length, 'байт за', Date.now() - started + 'мс |', r.headers.get('x-image-source') || '-');
    return r.status === 200;
  } catch (e) { console.log(stamp(), label, '→ сбой', e.message); return false; }
};
(async () => {
  const jobs = [
    one('кадр-1', 'sandstorm over rusty bridge, lone traveler'),
    one('портрет', 'character portrait, desert fox in armor, head and shoulders'),
  ];
  const res = await Promise.all(jobs);
  console.log(stamp(), 'итог: успешно', res.filter(Boolean).length, 'из', res.length);
})();
