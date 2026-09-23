// Проверка качества и тона озвучки: считаем длительность mp3 по кадрам (24 кГц, кадр 1152 сэмпла)
const FRAME = 1152 / 24000;   // ≈ 48 мс на кадр
function duration(buf) {
  let i = 0, frames = 0;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xFF || (buf[i + 1] & 0xE0) !== 0xE0) { i++; continue; }
    const bitrateIdx = (buf[i + 2] >> 4) & 0x0F;
    const sampleIdx = (buf[i + 2] >> 2) & 0x03;
    const pad = (buf[i + 2] >> 1) & 0x01;
    const layers = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320][bitrateIdx] * 1000;
    const rates = [44100, 48000, 32000];
    if (!layers || sampleIdx === 3) { i++; continue; }
    const size = Math.floor(layers * FRAME / rates[sampleIdx]) + pad;
    if (size < 24) { i++; continue; }
    frames++; i += size;
  }
  return frames * FRAME;
}
(async () => {
  const text = 'Ты выходишь к сухому руслу. Ветер несёт песок, где-то далеко гудит горн.';
  const q = encodeURIComponent(text);
  for (const [mood, gender] of [['book', 'f'], ['dread', 'f'], ['triumph', 'f'], ['heroic', 'm'], ['hurt', 'm']]) {
    const t0 = Date.now();
    const res = await fetch('http://127.0.0.1:3000/api/tts?text=' + q + '&mood=' + mood + '&gender=' + gender);
    const buf = Buffer.from(await res.arrayBuffer());
    const ms = Date.now() - t0;
    console.log((mood + '/' + gender).padEnd(12),
      res.status, String(buf.length).padStart(7), 'б ·',
      duration(buf).toFixed(2) + 'с ·',
      'kb/s ' + (buf.length * 8 / duration(buf) / 1000).toFixed(0) + ' ·',
      'X-TTS-Source ' + (res.headers.get('x-tts-source') || '—') + ' ·',
      'подача ' + (res.headers.get('x-tts-mood') || '—') + ' ·',
      ms + 'мс');
  }
})();
