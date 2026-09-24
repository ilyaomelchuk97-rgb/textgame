/**
 * tools/glm-live.js — живая проверка канала GLM настоящим ключом.
 *
 * Никаких моков: настоящий сервер (по умолчанию http://localhost:3000) и
 * настоящий ключ Zhipu, вшитый в server.js. Смотрим на то, что важно игроку:
 *   • ход приходит разбираемым (parseGmResponse) и проходит самопроверку (validateTurn);
 *   • сцена продолжает историю, а не начинается заново;
 *   • вариантов ровно три, у каждого есть характеристика и сложность;
 *   • сколько секунд занял ход и какая модель ответила;
 *   • что говорит health про счёт ключа (платные модели — только при балансе).
 *
 *   node tools/glm-live.js [url] [--turns=2]
 */
const path = require('path');
const fs = require('fs');
const E = require(path.join(__dirname, '..', 'src', 'engine.js'));

const BASE = (process.argv[2] && process.argv[2].indexOf('http') === 0) ? process.argv[2] : 'http://localhost:3000';
const TURNS_ARG = process.argv.find(a => /^--turns=/.test(a));
const TURNS = Math.max(1, Math.min(4, Number((TURNS_ARG || '').split('=')[1] || 2)));

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
    if (obj.note) notes.push(obj.note + (obj.reason ? ': ' + String(obj.reason).slice(0, 80) : ''));
  });
  return { full, provider, partial, notes, cached };
}

(async () => {
  let health = null;
  try { health = await (await fetch(BASE + '/api/health')).json(); } catch (e) { health = null; }
  if (!health || !health.ok) {
    console.log('СЕРВЕР НЕ ОТВЕЧАЕТ: сначала запустите node server.js');
    process.exit(1);
  }
  const problems = [];
  const info = health.glm || {};
  console.log('ведущие сервера: ' + (health.masterChoices || []).map(c => c.id).join(', '));
  console.log('GLM: модели ' + (info.models || []).join(' → ') + ' · ключ: ' + (info.key || '—') + ' · адрес: ' + (info.base || '—'));
  if (info.balance) console.log('GLM: у ключа пустой счёт (' + String(info.balance.why || '').slice(0, 90) + ') — играет бесплатная flash');
  if (!(info.models || []).length) problems.push('health не видит моделей GLM');
  if ((health.masterChoices || []).map(c => c.id).indexOf('glm') < 0) problems.push('канал glm не попал в список ведущих');

  const game = E.createGame({
    scenarioId: 'custom', heroName: 'Освальд', heroClass: 'rogue', heroRace: 'human', heroOrigin: 'streets',
    stats: { str: 3, agi: 4, con: 3, int: 3, per: 5, wit: 4, cha: 2 }
  });
  game.title = 'Фонарь на пристани';
  game.goal = 'выяснить, кто привозит груз без огней';
  game.place = 'Пристань';

  const turns = [];
  let lastScene = '';
  for (let i = 0; i < TURNS; i++) {
    const action = i === 0
      ? { text: 'Погасить фонарь и слушать туман', stat: 'per' }
      : { text: 'Пойти за лодкой вдоль берега', stat: 'agi' };
    const check = { roll: 13 + i, mod: 4, total: 17 + i, dc: 11, margin: 6, label: 'успех', advantage: false, rolls: [13 + i] };
    const nonce = 'прогон ' + Date.now().toString(36) + '-' + i;      // против кэша сервера
    const prompt = E.buildTurnPrompt(game, action, check, nonce);
    const started = Date.now();
    const res = await post('/api/gm/stream', {
      messages: [{ role: 'system', content: E.SYSTEM_PROMPT }, { role: 'user', content: prompt }],
      provider: 'glm', budgetMs: 50000, kind: 'turn'
    }, 70000);
    const ms = Date.now() - started;
    const got = readStream(res.text);
    if (got.cached) got.notes.push('ответ из кэша сервера');
    const parsed = E.parseGmResponse(got.full, { game });
    const valid = parsed.ok ? E.validateTurn(parsed, game) : { ok: false, problems: ['ответ не разобрался как ход'] };
    const turn = {
      n: i + 1, ms: got.cached ? 0 : ms, provider: got.provider, chars: got.full.length,
      ok: parsed.ok && valid.ok, problems: (valid.problems || []).slice(0, 3),
      scene: parsed.ok ? parsed.scene : String(got.full).slice(0, 200),
      options: parsed.ok ? parsed.options.map(o => o.text) : [],
      npc: parsed.ok ? parsed.npc : '', place: parsed.ok ? parsed.place : ''
    };
    turns.push(turn);
    if (!parsed.ok) problems.push('ход ' + (i + 1) + ': ответ мастера не разобрался как ход');
    else if (!valid.ok) problems.push('ход ' + (i + 1) + ': самопроверка нашла ' + (valid.problems || []).join('; '));
    if (parsed.ok) {
      if (parsed.options.length !== 3) problems.push('ход ' + (i + 1) + ': вариантов ' + parsed.options.length + ', а нужно 3');
      if (parsed.options.filter(o => o.stat && o.difficulty).length !== parsed.options.length) {
        problems.push('ход ' + (i + 1) + ': у части вариантов нет характеристики или сложности');
      }
      if (lastScene && E.isRepeatedScene(parsed.scene, lastScene)) problems.push('ход ' + (i + 1) + ': мастер повторил прошлую сцену');
      lastScene = parsed.scene;
      game.log.push({ text: parsed.scene.slice(0, 200), turn: i + 1 });
      game.turn = i + 1;
      if (parsed.place) game.place = parsed.place;
    }
    console.log('--- ход ' + (i + 1) + ' (' + (got.provider || '—') + ', ' + (ms / 1000).toFixed(1) + ' с, ' + got.full.length + ' симв.)');
    console.log(turn.scene.replace(/\s+/g, ' ').slice(0, 300));
    console.log('варианты: ' + turn.options.join(' | '));
    if (turn.npc || turn.place) console.log('знакомый: ' + (turn.npc || '—') + ' · место: ' + (turn.place || '—'));
    if (got.notes.length) console.log('заметки сервера: ' + got.notes.join(', '));
  }

  const fresh = turns.filter(t => t.ms > 0);
  const avg = fresh.length ? Math.round(fresh.reduce((s, t) => s + t.ms, 0) / fresh.length) : 0;
  if (!fresh.length) problems.push('все ходы пришли из кэша сервера — живой замер не получился');
  if (!turns.every(t => String(t.provider || '').indexOf('glm') === 0)) {
    problems.push('часть ходов вела не GLM: ' + turns.map(t => t.provider).join(', '));
  }

  const shots = path.join(__dirname, '..', 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, 'v17-glm-live.txt'), [
    'модели GLM: ' + (info.models || []).join(' → '),
    'ключ: ' + (info.key || '—') + ' · адрес: ' + (info.base || '—'),
    info.balance ? 'счёт ключа: пуст — платные модели отдают 1113, играет бесплатная glm-4.5-flash' : 'счёт ключа: есть баланс',
    ''
  ].concat(turns.map(t => [
    'ход ' + t.n + ': ' + (t.provider || '—') + ', ' + (t.ms / 1000).toFixed(1) + ' с, ' + t.chars + ' симв., проверка ' + (t.ok ? '✓' : '✗'),
    '  сцена: ' + t.scene.replace(/\s+/g, ' ').slice(0, 240),
    '  варианты: ' + t.options.join(' | ')
  ].join('\n'))).join('\n\n') + '\n\nсредний ход: ' + (avg / 1000).toFixed(1) + ' с\n', 'utf8');

  console.log('средний ход: ' + (avg / 1000).toFixed(1) + ' с (' + fresh.length + ' живых из ' + turns.length + ')');
  console.log(problems.length
    ? 'ЖИВОЙ МАСТЕР GLM: ' + problems.join(' · ')
    : 'ЖИВОЙ МАСТЕР НА GLM: ходы логичны, разбираются и проходят самопроверку — ❤');
  process.exit(problems.length ? 1 : 0);
})();
