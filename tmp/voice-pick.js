// Один и тот же текст четырьмя голосами — чтобы выбрать на слух.
// Метка голоса идёт заголовком X-TTS-Voice, поэтому после склейки понятно, где кто.
const fs = require('fs');
const LINE = 'Ты выходишь к сухому руслу реки. Ветер несёт песок, где-то далеко гудит горн, ' +
  'и караванщица Мара ждёт ответа.';
(async () => {
  const parts = [];
  for (const [id, name] of [['female', 'Светлана'], ['male', 'Дмитрий'], ['ava', 'Ава'], ['andrew', 'Эндрю']]) {
    const t0 = Date.now();
    const res = await fetch('http://127.0.0.1:3000/api/tts?text=' + encodeURIComponent(LINE) + '&mood=book&gender=' + id);
    if (!res.ok) { console.log(id, '→ HTTP', res.status); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const src = res.headers.get('x-tts-source') || '';
    const file = 'samples/golos-' + id + '.mp3';
    fs.writeFileSync(file, buf);
    parts.push({ id, name, buf });
    console.log(name.padEnd(10), src.padEnd(34), (buf.length / 12000).toFixed(2) + 'с ·', (Date.now() - t0) + 'мс');
  }
  // склейка в один файл: кадры у всех одинакового формата (24 кГц, 96 кбит/с)
  const strip = b => (b.slice(0, 3).toString() === 'ID3')
    ? b.slice(10 + (((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f)))
    : b;
  const out = Buffer.concat(parts.map(p => strip(p.buf)));
  fs.writeFileSync('samples/golos-vybor.mp3', out);
  console.log('samples/golos-vybor.mp3:', (out.length / 12000).toFixed(1) + 'с —',
    parts.map(p => p.name).join(' → '));
})();
