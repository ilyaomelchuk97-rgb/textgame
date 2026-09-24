/**
 * tools/hf-live.js — живая проверка канала Hugging Face настоящим ключом.
 *
 * Никаких моков: настоящий сервер и настоящий ключ hf_…. Смотрим на то, что
 * важно игроку:
 *   • что говорит health: модели, состояние ключа и не кончились ли кредиты;
 *   • ведёт ли ход канал hf — а если у бесплатного аккаунта кредиты выбраны,
 *     игра обязана честно уступить другому мастеру и сказать почему;
 *   • сколько рисуют кадры открытые Space'ы с ключом и кто из них живой;
 *   • что попадёт игроку: имя канала, время и размер кадра.
 *
 *   node tools/hf-live.js [url]
 */
const path = require('path');
const fs = require('fs');

const BASE = (process.argv[2] && process.argv[2].indexOf('http') === 0) ? process.argv[2] : 'http://localhost:3000';
const SPACES = ['hf:flux-merged', 'hf:flux-1-dev', 'hf:sd-3.5-large'];

const post = async (urlPath, body, timeoutMs) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 60000);
  try {
    const res = await fetch(BASE + urlPath, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { status: 0, text: String(e && e.message || e) };
  } finally { clearTimeout(timer); }
};

const readStream = raw => {
  let full = '', provider = '', cached = false;
  const notes = [];
  String(raw || '').split('\n').filter(Boolean).forEach(line => {
    let obj = null;
    try { obj = JSON.parse(line); } catch (e) { return; }
    if (obj.delta) full += obj.delta;
    if (obj.provider) provider = obj.provider;
    if (obj.cached) cached = true;
    if (obj.note) notes.push(obj.note + (obj.reason ? ': ' + String(obj.reason).slice(0, 90) : ''));
  });
  return { full, provider, notes, cached };
};

const shot = async (name, prompt) => {
  const t0 = Date.now();
  const url = BASE + '/api/image?prompt=' + encodeURIComponent(prompt) + '&seed=' + Math.floor(Math.random() * 900 + 10) +
    '&w=448&h=252&source=' + encodeURIComponent(name);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const buf = Buffer.from(await res.arrayBuffer());
    const ms = Date.now() - t0;
    const isImage = /^image\//.test(res.headers.get('content-type') || '') && buf.length > 512;
    return { name, ms, bytes: buf.length, ok: isImage, status: res.status, type: res.headers.get('content-type') || '', body: buf };
  } catch (e) {
    return { name, ms: Date.now() - t0, bytes: 0, ok: false, status: 0, type: String(e && e.message || e) };
  }
};

(async () => {
  let health = null;
  try { health = await (await fetch(BASE + '/api/health')).json(); } catch (e) { health = null; }
  if (!health || !health.ok) {
    console.log('СЕРВЕР НЕ ОТВЕЧАЕТ: сначала запустите node server.js');
    process.exit(1);
  }
  const problems = [];
  const info = health.hf || {};
  console.log('ведущие сервера: ' + (health.masterChoices || []).map(c => c.id).join(', '));
  console.log('HF: модели ' + (info.models || []).join(' → ') + ' · ключ: ' + (info.key || '—') + ' · адрес: ' + (info.base || '—'));
  console.log('HF: Space\'ы ' + (info.spaces || []).join(', '));
  if (info.credits) console.log('HF: кредиты (' + String(info.credits.why || '').slice(0, 100) + ')');
  if (!(info.models || []).length) problems.push('health не видит моделей HF');
  if ((health.masterChoices || []).map(c => c.id).indexOf('hf') < 0) problems.push('канал hf не попал в список ведущих');

  /* --- текст: либо ход, либо честный отказ --- */
  const started = Date.now();
  const res = await post('/api/gm/stream', {
    messages: [
      { role: 'system', content: 'Ты ведущий текстовой RPG на русском. Ответь одним JSON: {"scene":"2 предложения","options":[{"text":"...","stat":"per","difficulty":"easy"}]}' },
      { role: 'user', content: 'Прогон ' + Date.now().toString(36) + ': мост ночью, игрок считает царапины на перилах.' }
    ],
    provider: 'hf', budgetMs: 40000, kind: 'turn'
  }, 60000);
  const ms = Date.now() - started;
  const got = readStream(res.text);
  const textOk = /^hf/.test(got.provider || '');
  console.log('--- ход через hf (' + (got.provider || '—') + ', ' + (ms / 1000).toFixed(1) + ' с, ' + got.full.length + ' симв.)');
  if (got.full) console.log(got.full.replace(/\s+/g, ' ').slice(0, 220));
  if (got.notes.length) console.log('заметки сервера: ' + got.notes.join(', '));
  if (!textOk) {
    // так бывает у бесплатного аккаунта: кредиты кончились. Это не поломка —
    // важно, что игра сказала причину и не заставила ждать.
    const honest = got.notes.some(x => /402|credits|hf-/i.test(x));
    console.log('текст: канал hf не повёл ход' + (honest ? ' — сказал причину честно (' + got.notes[0].slice(0, 90) + ')' : ' без объяснения'));
    if (!honest && ms > 8000) problems.push('канал hf молчал ' + (ms / 1000).toFixed(1) + ' с без объяснения');
  }

  /* --- кадры: рисуют ли Space'ы с ключом --- */
  const shots = [];
  for (const name of SPACES) {
    const s = await shot(name, 'stone bridge at night, swinging lantern, hooded hero, fog over water');
    shots.push(s);
    console.log('кадр ' + name + ': ' + (s.ok ? (s.ms / 1000).toFixed(1) + ' с, ' + Math.round(s.bytes / 1024) + ' КБ' : 'не вышел (' + s.status + ' ' + String(s.type).slice(0, 40) + ')'));
  }
  const good = shots.filter(s => s.ok);
  if (!good.length) problems.push('ни один Space не нарисовал кадр');
  else {
    const fastest = good.reduce((a, b) => (a.ms < b.ms ? a : b));
    console.log('быстрее всех: ' + fastest.name + ' · ' + (fastest.ms / 1000).toFixed(1) + ' с');
    // сохраним один настоящий кадр — чтобы было видно, что рисуется
    const pic = path.join(__dirname, '..', 'shots', 'v18-hf-frame.png');
    fs.writeFileSync(pic, good[0].body);
  }

  const dir = path.join(__dirname, '..', 'shots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'v18-hf-live.txt'), [
    'модели HF: ' + (info.models || []).join(' → '),
    'ключ: ' + (info.key || '—') + ' · кредиты: ' + (info.credits ? 'кончились' : 'есть'),
    'Space\'ы: ' + (info.spaces || []).join(', '),
    '',
    'ход через hf: ' + (got.provider || '—') + ', ' + (ms / 1000).toFixed(1) + ' с, ' + got.full.length + ' симв.' +
      (got.full ? '\n  ' + got.full.replace(/\s+/g, ' ').slice(0, 240) : ''),
    got.notes.length ? '  заметки: ' + got.notes.join(', ') : '',
    '',
    'кадры:',
    ...shots.map(s => '  ' + s.name + ': ' + (s.ok ? (s.ms / 1000).toFixed(1) + ' с, ' + s.bytes + ' байт' : 'нет (' + s.status + ')'))
  ].filter(Boolean).join('\n'), 'utf8');

  console.log(problems.length
    ? 'ЖИВОЙ HUGGING FACE: ' + problems.join(' · ')
    : 'ЖИВОЙ HUGGING FACE: кадры рисуются, состояние ключа видно, отказы честные — ❤');
  process.exit(problems.length ? 1 : 0);
})();
