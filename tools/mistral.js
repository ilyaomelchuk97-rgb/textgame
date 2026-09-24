/**
 * tools/mistral.js — канал Mistral во всех его видах.
 *
 * Поднимаются два мока: обычный чат (/v1/chat/completions) и агент
 * (/v1/conversations, формат событий как у Mistral Agents API). Игра запускается
 * с MISTRAL_BASE_URL на мок и без вшитого ключа, чтобы проверить:
 *   • /api/health показывает и агента, и цепочку моделей;
 *   • /api/gm ведёт ход агентом (провайдер mistral-agent), а не «поллинейшном на сдачу»;
 *   • /api/gm/stream отдаёт текст кусками (и для агента, и для моделей);
 *   • мусор вместо ключа не улетает наверх, а без ключа канал честно пропускается;
 *   • ключ из настроек игры работает, когда ключа на сервере нет.
 *
 *   node tools/mistral.js
 */
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const PORT_MOCK = 8791;
const PORT_GAME = 8792;
const AGENT = 'ag_testagent01';
const TURN = {
  scene: 'Мара поднимает лампу: карта на стене сырая, за дверью — шаги. Ночной дождь бьёт по крыше.',
  chapter: 'Глава I', place: 'Караульная у моста',
  npc: 'Мара', npcObject: { name: 'Мара', line: '«Не свети в окно — там ждут»' },
  imagePrompt: 'dim guardroom, hooded hero, night rain outside',
  options: [
    { text: 'Прочитать карту', stat: 'int', difficulty: 'easy' },
    { text: 'Спросить, кто за дверью', stat: 'per', difficulty: 'medium' }
  ],
  effects: {}
};
const TEXT = JSON.stringify(TURN);

/* --- мок Mistral: чат и агент, оба со потоком --- */
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    const auth = req.headers.authorization || '';
    if (!/^Bearer good-key-\d+$/.test(auth)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: { message: 'Unauthorized: bad api key' } }));
    }
    let payload = {};
    try { payload = JSON.parse(body || '{}'); } catch (e) { payload = {}; }

    if (/\/conversations$/.test(req.url || '')) {
      if (payload.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
        res.write('event: conversation.response.started\ndata: ' + JSON.stringify({ type: 'conversation.response.started', conversation_id: 'conv_test' }) + '\n\n');
        (TEXT.match(/[\s\S]{1,120}/g) || [TEXT]).forEach(p => {
          res.write('event: message.output.delta\ndata: ' + JSON.stringify({
            type: 'message.output.delta', model: 'mistral-medium-latest', agent_id: payload.agent_id, role: 'assistant', content: p
          }) + '\n\n');
        });
        return res.end('event: conversation.response.done\ndata: ' + JSON.stringify({ type: 'conversation.response.done' }) + '\n\n');
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        conversation_id: 'conv_test', model: 'mistral-medium-latest',
        outputs: [{ type: 'message.output', role: 'assistant', content: TEXT }]
      }));
    }

    if (payload.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      (TEXT.match(/[\s\S]{1,120}/g) || [TEXT]).forEach(p => {
        res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: p } }] }) + '\n\n');
      });
      return res.end('data: [DONE]\n\n');
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      id: 'mock', object: 'chat.completion', model: payload.model,
      choices: [{ index: 0, message: { role: 'assistant', content: TEXT }, finish_reason: 'stop' }]
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

(async () => {
  await new Promise(r => mock.listen(PORT_MOCK, '127.0.0.1', r));
  const goodKey = 'good-key-1234567890';
  const commonEnv = {
    MISTRAL_BASE_URL: 'http://127.0.0.1:' + PORT_MOCK + '/v1',
    MISTRAL_AGENT_ID: AGENT,
    MISTRAL_MODEL_CHAIN: 'mistral-medium-latest,mistral-small-latest',
    POLLINATIONS_KEY: process.env.POLLINATIONS_KEY || '',
    SAVE_DIR: '/tmp/dt2-mistral-saves'
  };
  const start = (port, extra) => spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: Object.assign({}, process.env, commonEnv, { PORT: String(port), MISTRAL_BUILTIN_KEY: '' }, extra),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  // 1. ключ из окружения: агент должен вести игру
  const child = start(PORT_GAME, { MISTRAL_API_KEY: goodKey });
  const logs = [];
  child.stdout.on('data', d => logs.push(String(d)));
  child.stderr.on('data', d => logs.push(String(d)));
  const problems = [];
  const up = await waitPort(PORT_GAME, 15000);
  if (!up) {
    console.log('ОШИБКА: сервер не поднялся\n' + logs.join('').slice(-600));
    child.kill(); mock.close(); process.exit(1);
  }

  const health = await getJson(PORT_GAME, '/api/health');
  const choices = ((health && health.masterChoices) || []).map(c => c.id);
  const info = (health && health.mistral) || {};
  if (choices.indexOf('mistral-agent') < 0) problems.push('в выборе мастера нет агента Mistral');
  if (choices.indexOf('mistral') < 0) problems.push('в выборе мастера нет моделей Mistral');
  if (!info.agent) problems.push('health не видит агента');
  if (!Array.isArray(info.models) || info.models.length < 2) problems.push('health не показывает цепочку моделей');
  if (String((health && health.textProviders) || []).indexOf('mistral-agent') < 0) problems.push('агент не попал в список провайдеров');

  // обычный ход: ведёт агент
  const plain = parseLines0(await post(PORT_GAME, '/api/gm', {
    messages: [{ role: 'system', content: 'ты мастер' }, { role: 'user', content: 'ход 1' }],
    provider: 'mistral-agent', budgetMs: 20000
  }));
  if (!plain.ok || plain.provider !== 'mistral-agent') problems.push('ход не ушёл в агента (провайдер ' + (plain.provider || '—') + ')');
  if (!plain.text || plain.text.indexOf('Мара') < 0) problems.push('ответ агента не дошёл до клиента');

  // ход через модели: тоже должен работать
  const byModel = parseLines0(await post(PORT_GAME, '/api/gm', {
    messages: [{ role: 'user', content: 'ход 2' }], provider: 'mistral', budgetMs: 20000
  }));
  if (!byModel.ok || String(byModel.provider || '').indexOf('mistral') !== 0) problems.push('ход по моделям не сработал');

  // поток агента: текст должен идти кусками
  const streamAgent = parseLines((await post(PORT_GAME, '/api/gm/stream', {
    messages: [{ role: 'user', content: 'ход 3' }], provider: 'mistral-agent', budgetMs: 20000
  })).body);
  const agentDeltas = streamAgent.filter(l => l.delta);
  const agentDone = streamAgent.find(l => l.done);
  if (agentDeltas.length < 2) problems.push('поток агента пришёл не кусками (' + agentDeltas.length + ' частей)');
  if (!agentDone || agentDone.provider !== 'mistral-agent') problems.push('поток не отметил агента провайдером');

  // поток по моделям
  const streamModel = parseLines((await post(PORT_GAME, '/api/gm/stream', {
    messages: [{ role: 'user', content: 'ход 4' }], provider: 'mistral', budgetMs: 20000
  })).body);
  const modelDeltas = streamModel.filter(l => l.delta);
  const modelDone = streamModel.find(l => l.done);
  if (modelDeltas.length < 2) problems.push('поток моделей пришёл не кусками');
  if (!modelDone || String(modelDone.provider || '').indexOf('mistral:') !== 0) problems.push('поток моделей не отметил провайдера');

  // мусор вместо ключа: работает ключ окружения, а не «совсем-не-ключ»
  const junk = parseLines0(await post(PORT_GAME, '/api/gm', {
    messages: [{ role: 'user', content: 'ход 5' }], provider: 'mistral-agent', budgetMs: 16000,
    mistralKey: 'совсем-не-ключ'
  }));
  if (!junk.ok || junk.provider !== 'mistral-agent') problems.push('с мусором вместо ключа сервер не откатился на ключ окружения');
  child.kill();

  // 2. ключа на сервере нет: канал пропускается, а свой ключ из настроек работает
  const child2 = start(PORT_GAME + 1, { MISTRAL_API_KEY: '' });
  const up2 = await waitPort(PORT_GAME + 1, 15000);
  let personalOk = false;
  let junkBlocked = false;
  if (up2) {
    const own = parseLines0(await post(PORT_GAME + 1, '/api/gm', {
      messages: [{ role: 'user', content: 'ход 6' }], provider: 'mistral-agent', budgetMs: 20000,
      mistralKey: goodKey
    }));
    personalOk = own.ok && own.provider === 'mistral-agent';
    const junk2 = parseLines0(await post(PORT_GAME + 1, '/api/gm', {
      messages: [{ role: 'user', content: 'ход 7' }], provider: 'mistral', budgetMs: 12000,
      mistralKey: 'совсем-не-ключ'
    }));
    junkBlocked = !junk2.ok;
  }
  if (!personalOk) problems.push('ключ из настроек игры не заработал');
  if (!junkBlocked) problems.push('без ключа на сервере мусор вместо ключа всё равно ушёл в Mistral');
  child2.kill();

  const shots = path.join(ROOT, 'shots');
  if (!fs.existsSync(shots)) fs.mkdirSync(shots, { recursive: true });
  fs.writeFileSync(path.join(shots, 'v15-mistral.txt'), [
    'агент: ' + (info.agent || '—'),
    'модели по очереди: ' + (info.models || []).join(' → '),
    'ключ: ' + (info.key || '—'),
    'канал в выборе мастера: ' + choices.join(', '),
    'ход агентом: ' + (plain.provider || '—') + ', символов ' + String(plain.text || '').length,
    'ход по моделям: ' + (byModel.provider || '—'),
    'поток агента: ' + agentDeltas.length + ' частей · поток моделей: ' + modelDeltas.length + ' частей',
    'ключ из настроек: ' + (personalOk ? 'работает' : 'нет')
  ].join('\n'), 'utf8');

  console.log('каналы мастера: ' + choices.join(', '));
  console.log('ход → ' + (plain.provider || '—') + ' · по моделям → ' + (byModel.provider || '—'));
  console.log('поток: агент ' + agentDeltas.length + ' частей, модели ' + modelDeltas.length + ' частей · свой ключ из настроек: ' + (personalOk ? '✓' : '✗'));
  console.log(problems.length ? 'КАНАЛ MISTRAL: ' + problems.join(' · ') : 'КАНАЛ MISTRAL: агент ведёт игру, поток на месте, ключи работают — ❤');

  mock.close();
  process.exit(problems.length ? 1 : 0);
})();

function parseLines0(res) {
  try { return JSON.parse(res.body); } catch (e) { return {}; }
}
