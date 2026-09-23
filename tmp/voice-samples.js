// Образцы озвучки для прослушивания: один и тот же текст в разной подаче.
// Формат — 24 кГц, 96 кбит/с CBR: длительность считаем как байты / 12000.
const fs = require('fs');
const SCENE = 'Ты выходишь к сухому руслу реки. Ветер несёт песок, где-то далеко гудит горн, ' +
  'и караванщица Мара ждёт ответа. Ты чувствуешь, как под ногами хрустит стекло.';
const HURT = 'Удар отбрасывает тебя на камни. Дыхание сбито, левая рука не слушается, ' +
  'а тень у стены уже делает шаг вперёд.';
const TRIUMPH = 'Замок поддаётся, и дверь уходит в сторону. За ней — свет, воздух и путь домой. ' +
  'Ты сделал это.';
(async () => {
  const want = [
    ['golos-1-rovno', SCENE, 'book', 'f', 'ровное чтение'],
    ['golos-2-strah', SCENE, 'dread', 'f', 'мрачно и медленно (страх)'],
    ['golos-3-pobeda', TRIUMPH, 'triumph', 'f', 'победа: быстрее и выше'],
    ['golos-4-rana', HURT, 'hurt', 'f', 'сбитое дыхание (рана)'],
    ['golos-5-muzhskoy', SCENE, 'dark', 'm', 'мужской голос, мрачный тон']
  ];
  for (const [name, text, mood, gender, note] of want) {
    const url = 'http://127.0.0.1:3000/api/tts?text=' + encodeURIComponent(text) + '&mood=' + mood + '&gender=' + gender;
    const t0 = Date.now();
    const res = await fetch(url);
    if (!res.ok) { console.log(name, '→ HTTP', res.status); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    const file = 'samples/' + name + '.mp3';
    fs.writeFileSync(file, buf);
    console.log(file.padEnd(30), (buf.length / 12000).toFixed(2) + 'с ·',
      (res.headers.get('x-tts-source') || '').padEnd(28),
      (res.headers.get('x-tts-mood') || '').padEnd(30),
      '· ' + note + ' · ' + (Date.now() - t0) + 'мс');
  }
})();
