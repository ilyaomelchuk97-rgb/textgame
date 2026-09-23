// Сборка демо: один и тот же текст в четырёх тонах подряд (склейка mp3-кадров).
// У всех файлов одинаковый формат (24 кГц, 96 кбит/с), поэтому кадры склеиваются без перекодирования.
const fs = require('fs');
function stripId3(buf) {
  if (buf.slice(0, 3).toString() === 'ID3') {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    return buf.slice(10 + size);
  }
  return buf;
}
const parts = ['golos-1-rovno', 'golos-2-strah', 'golos-3-pobeda', 'golos-4-rana'];
const chunks = parts.map((n, i) => {
  const b = stripId3(fs.readFileSync('samples/' + n + '.mp3'));
  return b;
});
const out = Buffer.concat(chunks);
fs.writeFileSync('samples/golos-demo-tony.mp3', out);
console.log('samples/golos-demo-tony.mp3:', out.length, 'байт =', (out.length / 12000).toFixed(1), 'с');
console.log('порядок: ровно → страх → победа → рана');
