/**
 * tools/hf.js — канал Hugging Face (роутер + Space'ы) во всех его видах.
 *
 * Поднимаются два мока: роутер Inference Providers (/v1/chat/completions) и
 * «Space» с gradio-интерфейсом (/call/infer → опрос → картинка). Игра стартует
 * с HF_BASE_URL и HF_SPACES_BASE на моки, без вшитого ключа. Проверяем:
 *   • /api/health и список ведущих видят канал hf;
 *   • ход уходит в роутер и возвращается с провайдером hf:<модель>, поток идёт кусками;
 *   • «кредиты кончились» (402) не держат игрока: канал уступает место, а health говорит причину;
 *   • ключ из настроек игры работает, когда ключа на сервере нет;
 *   • мусор вместо ключа (не hf_…) наверх не уходит;
 *   • ключ уходит в Space вместе с запросом кадра (по имени Space отвечает охотнее).
 *
 *   node tools/hf.js
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT_ROUTER = 8796;
const PORT_SPACE = 8797;
const PORT_GAME = 8798;

const GOOD_KEY = 'hf_' + 'a'.repeat(34);        // формат настоящего ключа: hf_ + 34 символа
const DEPLETED_KEY = 'hf_' + 'b'.repeat(34);
const PNG = fs.readFileSync(path.join(__dirname, '_mock-big.png'));   // настоящий PNG: сервер требует кадр не меньше 512 байт

const TURN = {
  scene: 'Мост скрипит под сапогами, фонарь качается, и в его свете на перилах видна свежая царапина — кто-то считал доски.',
  chapter: 'Глава I', place: 'Мост через Стеклянную',
  npc: 'Мара', npcObject: { name: 'Мара', line: '«Не свети вниз — там считают»' },
  imagePrompt: 'stone bridge at night, swinging lantern, hooded hero, fresh scratch on railing',
  options: [
    { text: 'Посчитать царапины на перилах', stat: 'per', difficulty: 'easy' },
    { text: 'Перебраться на другой берег', stat: 'dex', difficulty: 'medium' },
    { text: 'Спросить Мару, кто считал', stat: 'cha', difficulty: 'hard' }
  ],
  effects: {}
};
const TEXT = JSON.stringify(TURN);

const seenSpaces = [];                          // что уходило в Space (заголовки и данные)

/* --- мок роутера: 402 у «выработанного» ключа, ответ у рабочего --- */
const router = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const auth = req.headers.authorization || '';
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch (e) { payload = {}; }

    if (auth === 'Bearer ' + DEPLETED_KEY) {
      res.writeHead(402, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'You have depleted your monthly included credits. Purchase pre-paid credits to continue.' }));
    }
    if (auth !== 'Bearer ' + GOOD_KEY) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Invalid credentials in Authorization header' }));
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
      id: 'mock-hf', object: 'chat.completion', model: payload.model,
      choices: [{ index: 0, message: { role: 'assistant', content: TEXT }, finish_reason: 'stop' }]
    }));
  });
});

/* --- мок Space: create → опрос → картинка --- */
const space = http.createServer((req, res) => {
  const auth = req.headers.authorization || '';
  if (req.method === 'POST' && /\/call\/infer$/.test(req.url || '')) {
    let body = '';
    req.on('data', c => { body += c; });
    return req.on('end', () => {
      let prompt = '';
      try { prompt = (JSON.parse(body || '{}').data || [])[0] || ''; } catch (e) {}
      seenSpaces.push({ kind: 'create', auth, prompt: String(prompt) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ event_id: 'evt1' }));
    });
  }
  if (/\/call\/infer\/evt1$/.test(req.url || '')) {
    seenSpaces.push({ kind: 'poll', auth });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    return res.end('event: complete\ndata: [{"url":"http://127.0.0.1:' + PORT_SPACE + '/img.png"}]\n\n');
  }
  if (/\/img\.png$/.test(req.url || '')) {
    res.writeHead(200, { 'content-type': 'image/png' });
    return res.end(PNG);
  }
  res.writeHead(404); res.end('нет');
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
    const chunks = [];
    res.on('data', c => { out += c; chunks.push(c); });
    res.on('end', () => {
      try { resolve({ json: JSON.parse(out), status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }); }
      catch (e) { resolve({ json: null, status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks) }); }
    });
  }).on('error', () => resolve({ json: null, status: 0, bytes: Buffer.alloc(0) }));
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
  await new Promise(r => router.listen(PORT_ROUTER, '127.0.0.1', r));
  await new Promise(r => space.listen(PORT_SPACE, '127.0.0.1', r));

  const commonEnv = {
    HF_BASE_URL: 'http://127.0.0.1:' + PORT_ROUTER + '/v1',
    HF_SPACES_BASE: 'http://127.0.0.1:' + PORT_SPACE + '/gradio_api',
    HF_MODEL_CHAIN: 'zai-org/GLM-5.3-Flash,deepseek-ai/DeepSeek-V4.1-Flash',
    MISTRAL_BUILTIN_KEY: '', MISTRAL_API_KEY: '', MISTRAL_AGENT_ID: '',
    GLM_BUILTIN_KEY: '', GLM_API_KEY: '',
    POLLINATIONS_KEY: '', SAVE_DIR: '/tmp/dt2-hf-saves'
  };
  const start = (port, extra) => spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, commonEnv, { PORT: String(port), HF_BUILTIN_KEY: '' }, extra),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const problems = [];
  const logs = [];

  /* --- 1. рабочий ключ: канал ведёт игру и просит картинку по имени --- */
  const child = start(PORT_GAME, { HF_API_KEY: GOOD_KEY });
  child.stdout.on('data', d => logs.push(String(d)));
  child.stderr.on('data', d => logs.push(String(d)));
  if (!await waitPort(PORT_GAME, 15000)) {
    console.log('ОШИБКА: сервер не поднялся\n' + logs.join('').slice(-600));
    child.kill(); router.close(); space.close(); process.exit(1);
  }

  const health = (await getJson(PORT_GAME, '/api/health')).json;
  const choices = ((health && health.masterChoices) || []).map(c => c.id);
  const info = (health && health.hf) || {};
  const summary = String((health && health.textProviders) || []);
  if (choices.indexOf('hf') < 0) problems.push('в выборе мастера нет Hugging Face');
  if (!Array.isArray(info.models) || info.models.length < 2) problems.push('health не показывает цепочку моделей HF');
  if (info.key !== 'окружение') problems.push('health не видит ключ HF из окружения (сказал «' + (info.key || '—') + '»)');
  if (summary.indexOf('hf:') < 0) problems.push('канал hf не попал в список провайдеров');

  const plain = parseJson(await post(PORT_GAME, '/api/gm', {
    messages: [{ role: 'system', content: 'ты мастер' }, { role: 'user', content: 'ход 1' }],
    provider: 'hf', budgetMs: 20000
  }));
  if (!plain.ok) problems.push('ход через HF не прошёл');
  if (String(plain.provider || '') !== 'hf:zai-org/GLM-5.3-Flash') {
    problems.push('ход не назвал модель HF (провайдер ' + (plain.provider || '—') + ')');
  }
  if (!plain.text || plain.text.indexOf('Мара') < 0) problems.push('ответ HF не дошёл до клиента');

  const stream = parseLines((await post(PORT_GAME, '/api/gm/stream', {
    messages: [{ role: 'user', content: 'ход 2' }], provider: 'hf', budgetMs: 20000
  })).body);
  const deltas = stream.filter(l => l.delta);
  const done = stream.find(l => l.done);
  if (deltas.length < 2) problems.push('поток HF пришёл не кусками (' + deltas.length + ' частей)');
  if (!done || String(done.provider || '').indexOf('hf:') !== 0) problems.push('поток не отметил провайдера hf');

  // картинка: Space должен получить ключ вместе с запросом
  const img = await getJson(PORT_GAME, '/api/image?prompt=stone%20bridge%20at%20night&seed=5&w=448&h=252&source=hf:flux-merged');
  if (!img.bytes || img.bytes.length < 512) problems.push('кадр через Space не пришёл (байт ' + (img.bytes || []).length + ')');
  const create = seenSpaces.find(x => x.kind === 'create');
  const poll = seenSpaces.find(x => x.kind === 'poll');
  if (!create) problems.push('Space не получил запрос на кадр');
  else if (create.auth !== 'Bearer ' + GOOD_KEY) problems.push('ключ HF не ушёл в Space (' + (create.auth || 'без ключа') + ')');
  if (poll && poll.auth !== 'Bearer ' + GOOD_KEY) problems.push('опрос Space пошёл без ключа');
  if (create && !/bridge/i.test(create.prompt)) problems.push('в Space ушёл не тот запрос: ' + String(create.prompt).slice(0, 60));

  // мусор вместо ключа не улетает наверх: работает серверный ключ
  const junk = parseJson(await post(PORT_GAME, '/api/gm', {
    messages: [{ role: 'user', content: 'ход 3' }], provider: 'hf', budgetMs: 16000, hfKey: 'совсем-не-ключ'
  }));
  if (!junk.ok || String(junk.provider || '').indexOf('hf:') !== 0) {
    problems.push('с мусором вместо ключа сервер не откатился на ключ окружения');
  }
  child.kill();

  /* --- 2. кредиты кончились: канал уступает быстро и честно --- */
  const child2 = start(PORT_GAME + 1, { HF_API_KEY: DEPLETED_KEY });
  let quick = 0, refused = false, creditsReason = '';
  if (await waitPort(PORT_GAME + 1, 15000)) {
    const t0 = Date.now();
    const dead = parseJson(await post(PORT_GAME + 1, '/api/gm', {
      messages: [{ role: 'user', content: 'ход 4' }], provider: 'hf', budgetMs: 18000
    }));
    quick = Date.now() - t0;
    refused = !dead.ok;                                  // играть нечем — ответа не выдумываем
    const h2 = (await getJson(PORT_GAME + 1, '/api/health')).json;
    creditsReason = ((h2 && h2.hf && h2.hf.credits) || {}).why || '';
    if (creditsReason && !/402|credits/i.test(creditsReason)) problems.push('health не объяснил причину: ' + creditsReason.slice(0, 60));
  }
  if (!refused) problems.push('канал с выработанными кредитами всё равно отдал текст');
  if (!creditsReason) problems.push('health не сообщил, что кредиты кончились');
  if (quick > 6000) problems.push('отказ при пустых кредитах занял ' + quick + ' мс — игрок ждёт впустую');
  child2.kill();

  /* --- 3. серверного ключа нет: работает ключ игрока из настроек --- */
  const child3 = start(PORT_GAME + 2, { HF_API_KEY: '' });
  let personalOk = false, blocked = false;
  if (await waitPort(PORT_GAME + 2, 15000)) {
    const own = parseJson(await post(PORT_GAME + 2, '/api/gm', {
      messages: [{ role: 'user', content: 'ход 5' }], provider: 'hf', budgetMs: 20000, hfKey: GOOD_KEY
    }));
    personalOk = own.ok && String(own.provider || '').indexOf('hf:') === 0;
    const bad = parseJson(await post(PORT_GAME + 2, '/api/gm', {
      messages: [{ role: 'user', content: 'ход 6' }], provider: 'hf', budgetMs: 10000, hfKey: 'совсем-не-ключ'
    }));
    blocked = !bad.ok;
  }
  if (!personalOk) problems.push('ключ HF из настроек игры не заработал');
  if (!blocked) problems.push('без серверного ключа мусор вместо ключа всё равно ушёл в HF');
  child3.kill();

  const shots = path.join(ROOT, 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, 'v18-hf.txt'), [
    'модели роутера: ' + (info.models || []).join(' → '),
    'ключ: ' + (info.key || '—') + ' · адрес: ' + (info.base || '—'),
    'канал в выборе мастера: ' + choices.join(', '),
    'ход: ' + (plain.provider || '—') + ', символов ' + String(plain.text || '').length,
    'поток: ' + deltas.length + ' частей',
    'кадр через Space: ' + (img.bytes ? img.bytes.length + ' байт, ключ ушёл: ' + (create && create.auth === 'Bearer ' + GOOD_KEY ? 'да' : 'нет') : 'нет'),
    'пустые кредиты: отказ за ' + quick + ' мс, причина «' + creditsReason.slice(0, 60) + '»',
    'ключ из настроек: ' + (personalOk ? 'работает' : 'нет')
  ].join('\n'), 'utf8');

  console.log('каналы мастера: ' + choices.join(', '));
  console.log('ход → ' + (plain.provider || '—') + ' · поток ' + deltas.length + ' частей · кадр ' + ((img.bytes || []).length) + ' байт');
  console.log('пустые кредиты → отказ за ' + quick + ' мс · свой ключ из настроек: ' + (personalOk ? '✓' : '✗'));
  console.log(problems.length ? 'КАНАЛ HUGGING FACE: ' + problems.join(' · ') : 'КАНАЛ HUGGING FACE: ведёт игру, рисует кадры, пустые кредиты не тормозят — ❤');

  router.close(); space.close();
  process.exit(problems.length ? 1 : 0);
})();
