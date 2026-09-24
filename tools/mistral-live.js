/**
 * tools/mistral-live.js — живая проверка ведущего мастера на Mistral.
 *
 * Никаких моков: настоящий сервер (по умолчанию http://localhost:3000),
 * настоящий агент Mistral и настоящие ходы игры. Смотрим на то, что важно игроку:
 *   • ход приходит разбираемым (parseGmResponse) и проходит самопроверку (validateTurn);
 *   • сцена продолжает историю, а не начинается заново;
 *   • вариантов ровно три, у каждого есть характеристика и сложность;
 *   • видно, сколько секунд занял ход и как выглядит текст.
 *
 *   node tools/mistral-live.js [url] [--turns=2]
 */
const path = require('path');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));

const BASE = (process.argv[2] && process.argv[2].indexOf('http') === 0) ? process.argv[2] : 'http://localhost:3000';
const TURNS_ARG = process.argv.find(a => /^--turns=/.test(a));
const TURNS = Math.max(1, Math.min(4, Number((TURNS_ARG || '').split('=')[1] || 2)));

const post = async (urlPath, body, timeoutMs) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 40000);
  try {
    const res = await fetch(BASE + urlPath, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: ctrl.signal
    });
    const text = await res.text();
    return { status: res.status, text };
  } catch (e) {
    return { status: 0, text: String(e && e.message || e) };
  } finally { clearTimeout(timer); }
};

/** Поток сервера: NDJSON, где delta — куски текста мастера. */
function readStream(raw) {
  let full = '';
  let provider = '';
  let partial = false;
  let cached = false;
  const notes = [];
  String(raw || '').split('\n').filter(Boolean).forEach(line => {
    let obj = null;
    try { obj = JSON.parse(line); } catch (e) { return; }
    if (obj.delta) full += obj.delta;
    if (obj.provider) provider = obj.provider;
    if (obj.cached) cached = true;
    if (obj.partial) partial = true;
    if (obj.note) notes.push(obj.note + (obj.reason ? ': ' + String(obj.reason).slice(0, 60) : ''));
  });
  return { full, provider, partial, notes, cached };
}

(async () => {
  const health = await (async () => {
    try { const r = await fetch(BASE + '/api/health'); return await r.json(); } catch (e) { return null; }
  })();
  if (!health || !health.ok) {
    console.log('СЕРВЕР НЕ ОТВЕЧАЕТ: сначала запустите node server.js');
    process.exit(1);
  }
  const problems = [];
  const info = health.mistral || {};
  console.log('мастер сервера: ' + (health.masterChoices || []).map(c => c.id).join(', '));
  console.log('Mistral: агент ' + (info.agent || '—') + ' · модели: ' + (info.models || []).join(' → ') + ' · ключ: ' + (info.key || '—'));

  // настоящая игра: мир, герой, память
  const game = E.createGame({
    scenarioId: 'custom', heroName: 'Ирма', heroClass: 'scholar', heroRace: 'human', heroOrigin: 'scholar',
    stats: { str: 2, agi: 3, con: 2, int: 5, per: 4, wit: 3, cha: 3 }
  });
  game.title = 'Караульная у моста';
  game.goal = 'довести караван через мост до рассвета';
  game.place = 'Караульная у моста';

  const turns = [];
  let lastScene = '';
  for (let i = 0; i < TURNS; i++) {
    const action = i === 0
      ? { text: 'Спросить Мару, кто ходит за дверью', stat: 'per' }
      : { text: 'Осмотреть карту и запомнить броды', stat: 'int' };
    const check = { roll: 12 + i, mod: 4, total: 16 + i, dc: 11, margin: 5, label: i === 0 ? 'успех' : 'успех', advantage: false, rolls: [12 + i] };
    // метка: каждый прогон — своя история, кэш сервера не должен выдавать чужой ход за наш
    const nonce = 'прогон ' + Date.now().toString(36) + '-' + i;
    const prompt = E.buildTurnPrompt(game, action, check,
      (i === 0 ? 'Знакомый героя — Мара, караванщица. ' : '') + nonce);
    const started = Date.now();
    const res = await post('/api/gm/stream', {
      messages: [{ role: 'system', content: E.SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      provider: 'mistral-agent', budgetMs: 34000, kind: 'turn'
    }, 45000);
    const ms = Date.now() - started;
    const got = readStream(res.text);
    if (got.cached) got.notes.push('ответ из кэша сервера');
    // parseGmResponse отдаёт сам ход «плоско»: scene, options, place, npc
    const parsed = E.parseGmResponse(got.full, { game });
    const valid = parsed.ok ? E.validateTurn(parsed, game) : { ok: false, problems: ['ответ не разобрался как ход'] };
    turns.push({
      n: i + 1, ms: got.cached ? 0 : ms, provider: got.provider, notes: got.notes, chars: got.full.length,
      ok: parsed.ok && valid.ok, problems: (valid.problems || []).slice(0, 3),
      scene: parsed.ok ? parsed.scene : String(got.full).slice(0, 160),
      options: parsed.ok ? parsed.options.map(o => o.text) : [],
      npc: parsed.ok ? parsed.npc : '',
      place: parsed.ok ? parsed.place : '',
      repeated: lastScene ? E.isRepeatedScene(parsed.ok ? parsed.scene : '', lastScene) : false
    });
    if (!parsed.ok) problems.push('ход ' + (i + 1) + ': ответ мастера не разобрался как ход');
    else if (!valid.ok) problems.push('ход ' + (i + 1) + ': самопроверка нашла ' + (valid.problems || []).join('; '));
    if (parsed.ok) {
      if (parsed.options.length !== 3) problems.push('ход ' + (i + 1) + ': вариантов ' + parsed.options.length + ', а нужно 3');
      const usable = parsed.options.filter(o => o.stat && o.difficulty);
      if (usable.length !== parsed.options.length) problems.push('ход ' + (i + 1) + ': у части вариантов нет характеристики или сложности');
      if (lastScene && E.isRepeatedScene(parsed.scene, lastScene)) problems.push('ход ' + (i + 1) + ': мастер повторил прошлую сцену');
      lastScene = parsed.scene;
      game.log.push({ text: parsed.scene.slice(0, 200), turn: i + 1 });
      game.turn = i + 1;
      if (parsed.place) game.place = parsed.place;
    }
    console.log('--- ход ' + (i + 1) + ' (' + (got.provider || '—') + ', ' + (ms / 1000).toFixed(1) + ' с, ' + got.full.length + ' симв.)');
    console.log(turns[i].scene.replace(/\s+/g, ' ').slice(0, 300));
    console.log('варианты: ' + turns[i].options.join(' | '));
    if (turns[i].npc) console.log('знакомый: ' + turns[i].npc + (turns[i].place ? ' · место: ' + turns[i].place : ''));
    if (got.notes.length) console.log('заметки сервера: ' + got.notes.join(', '));
  }

  const fresh = turns.filter(t => t.ms > 0);
  const avg = fresh.length ? Math.round(fresh.reduce((s, t) => s + t.ms, 0) / fresh.length) : 0;
  if (!fresh.length) problems.push('все ходы пришли из кэша сервера — живой замер не получился');
  const providerOk = turns.every(t => String(t.provider || '').indexOf('mistral') === 0);
  if (!providerOk) problems.push('часть ходов вела не Mistral: ' + turns.map(t => t.provider).join(', '));

  const fs = require('fs');
  const shots = path.join(__dirname, '..', 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, 'v15-mistral-live.txt'), turns.map(t => [
    'ход ' + t.n + ': ' + (t.provider || '—') + ', ' + (t.ms / 1000).toFixed(1) + ' с, ' + t.chars + ' симв., проверка ' + (t.ok ? '✓' : '✗'),
    '  сцена: ' + t.scene.replace(/\s+/g, ' ').slice(0, 200),
    '  варианты: ' + t.options.join(' | ')
  ].join('\n')).join('\n\n') + '\n\nсредний ход: ' + (avg / 1000).toFixed(1) + ' с\n', 'utf8');

  console.log('средний ход: ' + (avg / 1000).toFixed(1) + ' с (' + fresh.length + ' живых из ' + turns.length + ') · все ходы от Mistral: ' + (providerOk ? 'да' : 'нет'));
  console.log(problems.length ? 'ЖИВОЙ МАСТЕР: ' + problems.join(' · ') : 'ЖИВОЙ МАСТЕР НА MISTRAL: ходы логичны, разбираются и проходят самопроверку — ❤');
  process.exit(problems.length ? 1 : 0);
})();
