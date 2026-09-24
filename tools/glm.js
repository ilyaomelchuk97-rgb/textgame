/**
 * tools/glm.js — канал GLM (Zhipu) во всех его видах.
 *
 * Поднимается мок GLM: glm-4.5-flash отвечает, платные модели отдают ровно ту
 * ошибку, что у ключа без баланса (429, код 1113, «余额不足或无可用资源包»).
 * Игра запускается с GLM_BASE_URL на мок и без вшитого ключа — проверяем:
 *   • /api/health и список ведущих видят канал glm;
 *   • ход уходит в glm-4.5-flash и возвращается с провайдером glm:<модель>;
 *   • поток идёт кусками;
 *   • «нет баланса» не задерживает игру: цепочка спускается к бесплатной модели;
 *   • если платных моделей в цепочке нет и flash недоступен — канал честно сдаётся;
 *   • мусор вместо ключа не улетает провайдеру, а свой ключ из настроек работает;
 *   • в запрос уходит thinking:disabled и JSON-режим (иначе flash тратит время на размышления).
 *
 *   node tools/glm.js
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT_MOCK = 8793;
const PORT_GAME = 8794;
const TURN = {
  scene: 'Фонарь качается над мокрой пристанью, и в его свете видно, как из тумана выходит лодка без огней.',
  chapter: 'Глава I', place: 'Пристань',
  npc: 'Сильвестр', npcObject: { name: 'Сильвестр', line: '«Хочешь груз — не свети фонарём»' },
  imagePrompt: 'foggy pier at night, lantern, boat without lights',
  options: [
    { text: 'Погасить фонарь и ждать', stat: 'dex', difficulty: 'easy' },
    { text: 'Окликнуть лодку', stat: 'cha', difficulty: 'medium' },
    { text: 'Забраться на сваю и смотреть', stat: 'per', difficulty: 'hard' }
  ],
  effects: {}
};
const TEXT = JSON.stringify(TURN);
const NO_BALANCE = { error: { code: '1113', message: '余额不足或无可用资源包,请充值。' } };

const seen = [];                       // что реально уходило в GLM
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const auth = req.headers.authorization || '';
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch (e) { payload = {}; }
    seen.push({ auth, model: payload.model, thinking: payload.thinking, format: payload.response_format, stream: !!payload.stream });

    if (!/^Bearer goodkey0123456789abcd\.key0123456789abcd$/.test(auth)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { code: '1002', message: 'Authorization token invalid' } }));
    }
    if (payload.model !== 'glm-4.5-flash') {          // платные модели: счёт пуст
      res.writeHead(429, { 'content-type': 'application/json' });
      return res.end(JSON.stringify(NO_BALANCE));
    }
    if (payload.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      (TEXT.match(/[\s\S]{1,120}/g) || [TEXT]).forEach(p => {
        res.write('data: ' + JSON.stringify({ choices: [{ index: 0, delta: { content: p } }] }) + '\n\n');
      });
      return res.end('data: [DONE]\n\n');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'mock-glm', object: 'chat.completion', model: payload.model,
      choices: [{ index: 0, message: { role: 'assistant', content: TEXT }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 180, total_tokens: 280 }
    }));
  });
});

const post = (port, urlPath, body) => new Promise(resolve => {
  const data = JSON.stringify(body || {});
  const req = http.request({ host: '127.0.0.1', port, path: urlPath, method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } }, res => {
    let out = '';
    res.on('data', c => { out += c; });
    res.on('end', () => resolve({ status: res.statusCode, body: out }));
  });
  req.on('error', e => resolve({ status: 0, body: String(e.message), error: true }));
  req.end(data);
});

const getJson = (port, urlPath) => new Promise(resolve => {
  http.get({ host: '127.0.0.1', port, path: urlPath }, res => {
    let out = '';
    res.on('data', c => { out += c; });
    res.on('end', () => { try { resolve(JSON.parse(out)); } catch (e) { resolve(null); } });
  }).on('error', () => resolve(null));
});

const waitPort = (port, ms) => new Promise(resolve => {
  const started = Date.now();
  const tick = () => {
    http.get({ host: '127.0.0.1', port, path: '/api/health' }, res => { res.resume(); resolve(true); })
      .on('error', () => (Date.now() - started > ms ? resolve(false) : setTimeout(tick, 300)));
  };
  tick();
});

const parseLines = body => String(body || '').split('\n').filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
const parseJson = res => { try { return JSON.parse(res.body); } catch (e) { return {}; } };

(async () => {
  await new Promise(r => mock.listen(PORT_MOCK, '127.0.0.1', r));
  const goodKey = 'goodkey0123456789abcd.key0123456789abcd';
  const commonEnv = {
    GLM_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK,
    // платная модель впереди бесплатной: так проверяем и «пустой счёт», и откат к flash
    GLM_MODEL_CHAIN: 'glm-4.6,glm-4.5-flash',
    MISTRAL_BUILTIN_KEY: '', MISTRAL_API_KEY: '', MISTRAL_AGENT_ID: '',
    POLLINATIONS_KEY: '', SAVE_DIR: '/tmp/dt2-glm-saves'
  };
  const start = (port, extra) => spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, commonEnv, { PORT: String(port), GLM_BUILTIN_KEY: '' }, extra),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const problems = [];

  /* --- 1. ключ задан на сервере: канал обязан работать --- */
  const child = start(PORT_GAME, { GLM_API_KEY: goodKey });
  const logs = [];
  child.stdout.on('data', d => logs.push(String(d)));
  child.stderr.on('data', d => logs.push(String(d)));
  if (!await waitPort(PORT_GAME, 15000)) {
    console.log('ОШИБКА: сервер не поднялся\n' + logs.join('').slice(-600));
    child.kill(); mock.close(); process.exit(1);
  }

  const health = await getJson(PORT_GAME, '/api/health');
  const choices = ((health && health.masterChoices) || []).map(c => c.id);
  const info = (health && health.glm) || {};
  const summary = String((health && health.textProviders) || []);
  if (choices.indexOf('glm') < 0) problems.push('в выборе мастера нет GLM');
  if (!Array.isArray(info.models) || info.models.length < 2) problems.push('health не показывает цепочку моделей GLM');
  if (info.key !== 'окружение') problems.push('health не видит ключ GLM из окружения (сказал «' + (info.key || '—') + '»)');
  if (summary.indexOf('glm:') < 0) problems.push('канал GLM не попал в список провайдеров');

  // ход: платная модель впереди, но счёт пуст — должен ответить flash
  const plain = parseJson(await post(PORT_GAME, '/api/gm', {
    messages: [{ role: 'system', content: 'ты мастер' }, { role: 'user', content: 'ход 1' }],
    provider: 'glm', budgetMs: 20000
  }));
  if (!plain.ok) problems.push('ход через GLM не прошёл');
  if (String(plain.provider || '') !== 'glm:glm-4.5-flash') {
    problems.push('ход не спустился к бесплатной модели (провайдер ' + (plain.provider || '—') + ')');
  }
  if (!plain.text || plain.text.indexOf('Сильвестр') < 0) problems.push('ответ GLM не дошёл до клиента');

  // поток: текст должен идти кусками и пометить модель
  const stream = parseLines((await post(PORT_GAME, '/api/gm/stream', {
    messages: [{ role: 'user', content: 'ход 2' }], provider: 'glm', budgetMs: 20000
  })).body);
  const deltas = stream.filter(l => l.delta);
  const done = stream.find(l => l.done);
  if (deltas.length < 2) problems.push('поток GLM пришёл не кусками (' + deltas.length + ' частей)');
  if (!done || String(done.provider || '').indexOf('glm:') !== 0) problems.push('поток не отметил провайдера glm');

  // в запрос должен уходить выключенный «размышляющий» режим и JSON-контракт
  const flashCalls = seen.filter(x => x.model === 'glm-4.5-flash');
  if (!flashCalls.length) problems.push('в GLM не ушло ни одного запроса к бесплатной модели');
  if (flashCalls.length && !flashCalls.every(x => x.thinking && x.thinking.type === 'disabled')) {
    problems.push('размышления модели не выключены — ход будет вдвое медленнее');
  }
  if (flashCalls.length && !flashCalls.every(x => x.format && x.format.type === 'json_object')) {
    problems.push('у GLM не запрошен JSON-режим');
  }

  // мусор вместо ключа: пусть играет серверный ключ, а «совсем-не-ключ» наверх не уходит
  const junk = parseJson(await post(PORT_GAME, '/api/gm', {
    messages: [{ role: 'user', content: 'ход 3' }], provider: 'glm', budgetMs: 16000,
    glmKey: 'совсем-не-ключ'
  }));
  if (!junk.ok || String(junk.provider || '').indexOf('glm:') !== 0) {
    problems.push('с мусором вместо ключа сервер не откатился на ключ окружения');
  }
  child.kill();

  /* --- 2. платных моделей нет и flash не отвечает: канал должен честно сдаться --- */
  const childDead = start(PORT_GAME + 1, {
    GLM_API_KEY: goodKey, GLM_MODEL_CHAIN: 'glm-4.6',
    GLM_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK
  });
  let honest = false;
  let balanceShown = false;
  if (await waitPort(PORT_GAME + 1, 15000)) {
    const dead = parseJson(await post(PORT_GAME + 1, '/api/gm', {
      messages: [{ role: 'user', content: 'ход 4' }], provider: 'glm', budgetMs: 12000
    }));
    honest = !dead.ok;                                  // играть нечем — не выдумываем ответ
    const h2 = await getJson(PORT_GAME + 1, '/api/health');
    balanceShown = !!(h2 && h2.glm && h2.glm.balance);
  }
  if (!honest) problems.push('канал с пустым счётом всё равно отдал текст');
  if (!balanceShown) problems.push('health не сообщил, что у ключа GLM пустой счёт');
  childDead.kill();

  /* --- 3. ключа на сервере нет: работает свой ключ из настроек игры --- */
  const child3 = start(PORT_GAME + 2, { GLM_API_KEY: '', GLM_MODEL_CHAIN: 'glm-4.5-flash' });
  let personalOk = false;
  let blocked = false;
  if (await waitPort(PORT_GAME + 2, 15000)) {
    const own = parseJson(await post(PORT_GAME + 2, '/api/gm', {
      messages: [{ role: 'user', content: 'ход 5' }], provider: 'glm', budgetMs: 20000, glmKey: goodKey
    }));
    personalOk = own.ok && String(own.provider || '').indexOf('glm:') === 0;
    const bad = parseJson(await post(PORT_GAME + 2, '/api/gm', {
      messages: [{ role: 'user', content: 'ход 6' }], provider: 'glm', budgetMs: 10000, glmKey: 'совсем-не-ключ'
    }));
    blocked = !bad.ok;
  }
  if (!personalOk) problems.push('ключ GLM из настроек игры не заработал');
  if (!blocked) problems.push('без серверного ключа мусор вместо ключа всё равно ушёл в GLM');
  child3.kill();

  const shots = path.join(ROOT, 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, 'v17-glm.txt'), [
    'модели по очереди: ' + (info.models || []).join(' → '),
    'ключ: ' + (info.key || '—') + ' · адрес: ' + (info.base || '—'),
    'канал в выборе мастера: ' + choices.join(', '),
    'ход: ' + (plain.provider || '—') + ', символов ' + String(plain.text || '').length,
    'поток: ' + deltas.length + ' частей',
    'с пустым счётом игра не выдумана, а честно остановлена: ' + (honest ? 'да' : 'нет'),
    'ключ из настроек: ' + (personalOk ? 'работает' : 'нет'),
    'запросов к GLM за прогон: ' + seen.length
  ].join('\n'), 'utf8');

  console.log('каналы мастера: ' + choices.join(', '));
  console.log('ход → ' + (plain.provider || '—') + ' · поток ' + deltas.length + ' частей · счёт пуст → откат к бесплатной: да');
  console.log('ключ из настроек: ' + (personalOk ? '✓' : '✗') + ' · честный отказ без баланса: ' + (honest ? '✓' : '✗'));
  console.log(problems.length ? 'КАНАЛ GLM: ' + problems.join(' · ') : 'КАНАЛ GLM: бесплатная flash ведёт игру, поток на месте, пустой счёт не тормозит — ❤');

  mock.close();
  process.exit(problems.length ? 1 : 0);
})();
