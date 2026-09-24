/**
 * Кости и Судьбы — мини-сервер для деплоя (Render / Railway / локально).
 *
 * Что делает:
 *   1. Отдаёт статику: index.html, game.html, src/, assets/.
 *   2. POST /api/gm    — прокси к текстовому ИИ (гейм-мастеру).
 *   3. GET  /api/image — прокси к генератору картинок.
 *   4. GET  /api/health — сообщает клиенту, какие каналы доступны.
 *   5. GET  /api/tts   — нейросетевая озвучка сцены (нейронный голос, mp3).
 *
 * Прокси нужен потому, что браузерные запросы к text.pollinations.ai
 * сейчас требуют Cloudflare Turnstile, а серверные — нет.
 *
 * Переменные окружения (все необязательны):
 *   GROQ_API_KEY        — бесплатный ключ Groq (быстро и надёжно)
 *   GEMINI_API_KEY      — ключ Google AI Studio (есть бесплатный тариф)
 *   OPENROUTER_API_KEY  — ключ OpenRouter (есть бесплатные модели)
 *   OPENAI_API_KEY      — ключ OpenAI-совместимого сервиса
 *   OPENAI_BASE_URL     — адрес OpenAI-совместимого сервиса (по умолчанию api.openai.com)
 *   OPENAI_MODEL        — имя модели для этого сервиса
 *   POLLINATIONS_API_KEY — ключ Pollinations (переопределяет вшитый в проект)
 * Без ключей игра работает: пробуем анонимный Pollinations, при неудаче —
 * клиент переключается на локальный мастер (сюжет встроен в игру).
 *
 * Зависимостей нет: только стандартная библиотека Node.
 */
'use strict';

/**
 * Ключ Pollinations вшит в проект, чтобы текст и картинки работали сразу
 * после деплоя, без настройки переменных окружения.
 * Переопределяется переменной окружения POLLINATIONS_API_KEY.
 */
const POLLINATIONS_KEY = process.env.POLLINATIONS_API_KEY || 'sk_kCqSS3Q96WUonzrPPC9c5fxyRjOmiMOi';

const http = require('http');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const path = require('path');

const PORT = process.env.PORT || 3000;
// Сколько токенов разрешаем мастеру: мир + предыстория + сцена + план + герой
// помещаются только с запасом — иначе JSON обрывается на середине.
const TEXT_MAX_TOKENS = Number(process.env.TEXT_MAX_TOKENS || 1500);
// Канал тратит бюджет ответа на скрытые рассуждения: с полным бюджетом видимого
// текста не остаётся вовсе. 'low' оставляет рассуждения короткими.
const POLLINATIONS_EFFORT = process.env.POLLINATIONS_EFFORT || 'low';

/**
 * Новый шлюз Pollinations (gen.pollinations.ai). Через него доступны десятки
 * моделей: умный текст (Mistral Large 3, GLM-5.3, Qwen 3.8), быстрые генераторы
 * картинок (Z-Image Turbo — «турбо»-дистилляция, кадр за считанные секунды)
 * и нейросетевой синтез речи (Fish Audio S2.1 Pro).
 * Ключ тот же, что и раньше: он просто должен быть разрешён для этих моделей.
 */
const GEN_BASE = (process.env.POLLINATIONS_GEN_BASE || 'https://gen.pollinations.ai').replace(/\/$/, '');

/** Порядок моделей-мастеров: сначала самая толковая, дальше — по убыванию. */
const GEN_TEXT_MODELS = (process.env.GEN_TEXT_MODELS || [
  'mistralai/mistral-large-3',                        // самая толковая: сюжет, числа, характеры
  'community/scriptsnsenses-sys/glm-5.3-flash-free',  // быстрая и живая, хорошо держит русский
  'community/scriptsnsenses-sys/gpt-5.6-sol-free',
  'community/gggff123/qwen3.8-27b:free',              // очень быстрая, но лимит 1 запрос в минуту
  'community/NamanSoni78/gemini-3.8-flash'            // медленная, но с большим контекстом
].join(',')).split(',').map(x => x.trim()).filter(Boolean);
// Модели, которые в потоке отдают только «рассуждения» без текста: для мастера
// они бесполезны (игрок ждёт описания сцены, а не цепочку мыслей) — не берём их.
const GEN_STREAM_SKIP = /Claude-Fable|gpt-5\.6-Luna|Glm-5\.3-Thinking|opus-5-max/i;

/** У каждой модели лимит — примерно один запрос в минуту: ведём «остывание». */
const GEN_MODEL_COOLDOWN = Number(process.env.GEN_MODEL_COOLDOWN || 62000);
const genModelUsedAt = new Map();
function genMarkUsed(model) { genModelUsedAt.set(model, Date.now()); }
/**
 * Порядок моделей. Для набора героя важнее скорость (игрок ждёт экран),
 * поэтому первыми идут быстрые модели; для ходов — сначала самая толковая.
 * Внутри порядка сперва идут отдохнувшие, использованные — в конец.
 */
const GEN_FAST_MODELS = (process.env.GEN_FAST_MODELS || [
  'community/gggff123/qwen3.8-27b:free',
  'community/scriptsnsenses-sys/glm-5.3-flash-free',
  'mistralai/mistral-large-3',
  'community/scriptsnsenses-sys/gpt-5.6-sol-free'
].join(',')).split(',').map(x => x.trim()).filter(Boolean);

function genModelOrder(kind) {
  const preferred = kind === 'hero' ? GEN_FAST_MODELS : GEN_TEXT_MODELS;
  const now = Date.now();
  return preferred.slice().sort((a, b) => {
    const fa = (genModelUsedAt.get(a) || 0) + GEN_MODEL_COOLDOWN - now;
    const fb = (genModelUsedAt.get(b) || 0) + GEN_MODEL_COOLDOWN - now;
    return (fa > 0 ? fa + 1e6 : 0) - (fb > 0 ? fb + 1e6 : 0) || preferred.indexOf(a) - preferred.indexOf(b);
  });
}

/**
 * Неудачи генераторов картинок: у шлюза лимит запросов на пользователя, поэтому
 * модель, только что отказавшую, ставим в конец очереди и на время не трогаем.
 */
const GEN_IMAGE_FAILED_AT = new Map();
const GEN_IMAGE_COOLDOWN = Number(process.env.GEN_IMAGE_COOLDOWN || 15000);
function genImageNoteFailure(model) { GEN_IMAGE_FAILED_AT.set(model, Date.now()); }
function genImageCooled(model) {
  return Date.now() - (GEN_IMAGE_FAILED_AT.get(model) || 0) > GEN_IMAGE_COOLDOWN;
}
let genImageTurn = 0;
function genImageOrder() {
  const ready = [], resting = [];
  GEN_IMAGE_MODELS.forEach(m => (genImageCooled(m) ? ready : resting).push(m));
  if (ready.length) {
    // Кадр сцены и портрет героя уходят почти одновременно. Если оба начнут
    // с одной модели, второй получит «1 запрос в минуту» и будет ждать впустую:
    // сдвигаем порядок от запроса к запросу, чтобы стартовые модели различались.
    const shift = genImageTurn++ % ready.length;
    ready.push(...ready.splice(0, shift));
  }
  return ready.concat(resting);
}

/** Генераторы картинок шлюза: у каждого свой upstream, поэтому их можно гонять гонкой. */
const GEN_IMAGE_MODELS = (process.env.GEN_IMAGE_MODELS || [
  'community/NamanSoni78/Z-Image-Turbo',
  'tongyi-mai/z-image-turbo',
  'community/NamanSoni78/Imagine-4-low'
].join(',')).split(',').map(x => x.trim()).filter(Boolean);

/** Голос для озвучки: у Fish Audio работает 'alloy'. */
const GEN_TTS_MODEL = process.env.GEN_TTS_MODEL || 'community/NamanSoni78/FISH-AUDIO-S2.1-PRO';
const GEN_TTS_VOICE = process.env.GEN_TTS_VOICE || 'alloy';

/**
 * Баланс ключа может кончиться, и тогда шлюз отвечает мгновенным отказом
 * («Insufficient balance»). Ждать его впустую нельзя: помечаем ключ отдыхающим,
 * пока не оживёт, и работаем на безключевых источниках.
 */
const GEN_KEY_REST_MS = Number(process.env.GEN_KEY_REST_MS || 20 * 60 * 1000);
let GEN_KEY_RESTING_UNTIL = 0;
function genKeyResting() { return Date.now() < GEN_KEY_RESTING_UNTIL; }
// «нет баланса» помним дольше, чем отдых: иначе через 20 минут статус снова
// бодро пишет «5 моделей», хотя ключ по-прежнему пустой.
const GEN_KEY_DEAD_TTL = Number(process.env.GEN_KEY_DEAD_TTL || 6 * 60 * 60 * 1000);
let GEN_KEY_DEAD = { at: 0, why: '' };
function genKeyDeadFresh() { return !!GEN_KEY_DEAD.at && (Date.now() - GEN_KEY_DEAD.at) < GEN_KEY_DEAD_TTL; }
function genKeyMarkDead(why) { GEN_KEY_DEAD = { at: Date.now(), why: String(why || 'нет баланса') }; }
function genKeyRest(why) {
  // «нет баланса» приходит и по-русски (внутренние метки), и по-английски (шлюз)
  if (looksLikeNoBalance(why) || /402|нет баланса/i.test(String(why || ''))) genKeyMarkDead(why);
  if (genKeyResting()) return;
  GEN_KEY_RESTING_UNTIL = Date.now() + GEN_KEY_REST_MS;
  console.log('[gen] ключ шлюза отдыхает ' + Math.round(GEN_KEY_REST_MS / 60000) + ' мин (' + why +
    ') — кадры рисуют безключевые генераторы, текст ведут запасные каналы');
}
function genWake() {
  GEN_KEY_RESTING_UNTIL = 0;
  GEN_KEY_DEAD = { at: 0, why: '' };
  console.log('[gen] ключ шлюза снова в строю');
}
function looksLikeNoBalance(text) {
  return /insufficient balance|not enough credits|no credits|top ?up|INSUFFICIENT_BALANCE|available balance is 0/i.test(String(text || ''));
}
function genReady() { return !!GEN_KEY_ACTIVE && !genKeyResting(); }
/** Готовые нейронные голоса Edge есть всегда, когда есть сеть и websocket-клиент. */
function edgeReady() { return !!edgeSocket(); }
const GEN_KEY_ACTIVE = POLLINATIONS_KEY;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const VERSION = '1.0.0';

/* ---------------------------------------------------------- */
/* Статика                                                    */
/* ---------------------------------------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.webmanifest': 'application/manifest+json'
};

/* ---------------------------------------------------------- */
/* Сжатие, ETag и кэш промптов                                 */
/* ---------------------------------------------------------- */

const GZIP_TYPES = /\.(html|js|css|json|svg|md|webmanifest|txt)$/i;
const STATIC_CACHE = new Map();          // путь → {mtime, size, gzip}
const STATIC_CACHE_MAX = 12;

function acceptsGzip(req) {
  return /gzip/i.test(String(req.headers['accept-encoding'] || ''));
}

/** Отдаём текст с gzip, если клиент умеет: game.html весит 860 КБ, а по сети уходит ~200. */
function sendText(req, res, code, type, body, extraHeaders) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  const headers = Object.assign({
    'Content-Type': type,
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  }, extraHeaders || {});
  if (acceptsGzip(req) && buf.length > 1024) {
    zlib.gzip(buf, (err, gz) => {
      if (err || res.writableEnded) {
        headers['Content-Length'] = buf.length;
        res.writeHead(code, headers);
        return res.end(buf);
      }
      headers['Content-Encoding'] = 'gzip';
      headers['Vary'] = 'Accept-Encoding';
      headers['Content-Length'] = gz.length;
      res.writeHead(code, headers);
      res.end(gz);
    });
    return;
  }
  headers['Content-Length'] = buf.length;
  res.writeHead(code, headers);
  res.end(buf);
}

/** Статика: ETag по размеру и времени правки, 304 без пересылки тела, gzip в памяти. */
function serveStatic(req, res, abs, stat) {
  const etag = '"' + stat.size.toString(16) + '-' + Math.round(stat.mtimeMs).toString(16) + '"';
  const ext = path.extname(abs).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  const headers = { 'Content-Type': type };
  if (ext === '.jpg' || ext === '.png' || ext === '.webp' || ext === '.ico') {
    headers['Cache-Control'] = 'public, max-age=86400';
    headers['ETag'] = etag;
  } else {
    headers['Cache-Control'] = 'no-cache';
    headers['ETag'] = etag;
  }
  if (String(req.headers['if-none-match'] || '') === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  if (!GZIP_TYPES.test(abs) || !acceptsGzip(req)) {
    res.writeHead(200, headers);
    return res.end(fs.readFileSync(abs));
  }
  const cached = STATIC_CACHE.get(abs);
  if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size) {
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    res.writeHead(200, headers);
    return res.end(cached.gzip);
  }
  zlib.gzip(fs.readFileSync(abs), (err, gz) => {
    if (err) { res.writeHead(200, headers); return res.end(fs.readFileSync(abs)); }
    if (STATIC_CACHE.size >= STATIC_CACHE_MAX) STATIC_CACHE.clear();
    STATIC_CACHE.set(abs, { mtime: stat.mtimeMs, size: stat.size, gzip: gz });
    headers['Content-Encoding'] = 'gzip';
    headers['Vary'] = 'Accept-Encoding';
    res.writeHead(200, headers);
    res.end(gz);
  });
}

/* Кэш ответов мастера: одинаковый промпт не гоняем по сети дважды. */
const GM_CACHE = new Map();              // ключ → {text, provider, ts}
const GM_CACHE_TTL = 20 * 60 * 1000;
const GM_CACHE_MAX = 80;

function gmCacheKey(messages) {
  const h = crypto.createHash('sha1');
  messages.forEach(m => h.update(m.role + ':' + m.content + '\n'));
  return h.digest('hex');
}
function gmCacheGet(key) {
  const hit = GM_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() - hit.ts > GM_CACHE_TTL) { GM_CACHE.delete(key); return null; }
  return hit;
}
function gmCacheSet(key, text, provider) {
  if (GM_CACHE.size >= GM_CACHE_MAX) GM_CACHE.delete(GM_CACHE.keys().next().value);
  GM_CACHE.set(key, { text, provider, ts: Date.now() });
}

/** Поток ответа от канала: строки SSE «data: {...}» → куски текста. */
async function pollinationsStream(messages, key, onDelta, timeoutMs) {
  return queuePollinations('text', () => withQueueRetry(
    leftMs => pollinationsStreamRaw(messages, key, onDelta, Math.max(6000, Math.min(timeoutMs, leftMs))),
    timeoutMs, key ? 'stream-key' : 'stream-anon'));
}

async function pollinationsStreamRaw(messages, key, onDelta, timeoutMs) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['Authorization'] = 'Bearer ' + key;
  const res = await fetchWithTimeout('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'openai-fast', messages, temperature: 0.9, stream: true,
      max_tokens: TEXT_MAX_TOKENS, private: true, reasoning_effort: POLLINATIONS_EFFORT
    })
  }, timeoutMs || 26000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (!res.body || typeof res.body.getReader !== 'function') {
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!text) throw new Error('empty completion');
    onDelta(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let piece = '';
      try {
        const obj = JSON.parse(payload);
        piece = (obj.choices && obj.choices[0] && ((obj.choices[0].delta && obj.choices[0].delta.content) || obj.choices[0].text)) || '';
      } catch (e) { continue; }
      if (piece) { full += piece; onDelta(piece); }
    }
  }
  if (!full) throw new Error('empty stream');
  return full;
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > (limit || 128 * 1024)) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function fetchWithTimeout(url, options, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), ms || 20000);
  try {
    return await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

/* ---------------------------------------------------------- */
/* Очередь к Pollinations                                     */
/* ---------------------------------------------------------- */
/**
 * У Pollinations лимит на IP — один запрос в работе: второй получает
 * «Queue full for IP» и это видел игрок как «мастер перестал отвечать».
 * Текстовый и картинный сервисы считают лимит отдельно, поэтому очереди две:
 * текст (ходы, герой, мир) и картинки (кадры, портрет). Внутри каждой — по одному
 * запросу за раз, иначе игра сама себе перекрывает канал.
 */
const PLLN_QUEUES = { text: { items: [], busy: false }, image: { items: [], busy: false } };

/**
 * Ставим запрос в очередь канала. Отсчёт времени начинается, когда слот
 * освободился: пока запрос ждал, бюджет не тратится — иначе второй ход
 * подряд отваливался бы «по таймауту», не успев начаться.
 */
const PLLN_INFLIGHT = new Map();   // одинаковые запросы к каналу не дублируем

function queuePollinations(kind, task, dedupeKey) {
  const q = PLLN_QUEUES[kind] || PLLN_QUEUES.text;
  const key = dedupeKey ? kind + '|' + dedupeKey : '';
  if (key && PLLN_INFLIGHT.has(key)) return PLLN_INFLIGHT.get(key);
  const job = new Promise((resolve, reject) => {
    q.items.push({ task, resolve, reject, at: Date.now() });
    pumpPollinations(kind);
  });
  if (key) {
    PLLN_INFLIGHT.set(key, job);
    const clear = () => PLLN_INFLIGHT.delete(key);
    job.then(clear, clear);
  }
  return job;
}

async function pumpPollinations(kind) {
  const q = PLLN_QUEUES[kind];
  if (!q || q.busy) return;
  const next = q.items.shift();
  if (!next) return;
  q.busy = true;
  const waited = Date.now() - (next.at || Date.now());
  if (kind === 'text' && waited > 45000) {
    // держать игрока в очереди дольше — хуже, чем честно уйти на локального мастера
    next.reject(new Error('queue-timeout: ' + Math.round(waited / 1000) + 's'));
    q.busy = false;
    return setImmediate(() => pumpPollinations(kind));
  }
  try {
    next.resolve(await next.task());
  } catch (err) {
    next.reject(err);
  } finally {
    q.busy = false;
    setImmediate(() => pumpPollinations(kind));
  }
}

/** Сколько запросов ждёт очереди — для диагностики. */
function pollinationsQueueDepth() {
  return {
    text: { wait: PLLN_QUEUES.text.items.length, busy: PLLN_QUEUES.text.busy },
    image: { wait: PLLN_QUEUES.image.items.length, busy: PLLN_QUEUES.image.busy }
  };
}

/**
 * «Queue full» — это не отказ, а просьба подождать. Повторяем, но строго внутри
 * общего бюджета: каждая попытка получает остаток времени, а не полный таймаут
 * заново, — иначе один запрос мог растянуться на минуты и мастер «замолкал».
 */
async function withQueueRetry(makeCall, budgetMs, label) {
  const total = Number(budgetMs) || 20000;
  const started = Date.now();
  let lastErr = null;
  let attempt = 0;
  while (attempt < 4) {
    attempt++;
    const left = total - (Date.now() - started);
    if (left < 3000) break;
    try {
      return await makeCall(left);
    } catch (err) {
      lastErr = err;
      const msg = String(err && err.message || err);
      if (!/queue full|HTTP 429|rate/i.test(msg)) throw err;
      const rest = total - (Date.now() - started);
      if (rest < 3500) break;
      await sleep(Math.min(2500, Math.max(500, rest / 3)));
    }
  }
  throw lastErr || new Error('pollinations: ' + label);
}

/* ---------------------------------------------------------- */
/* Провайдеры текста                                          */
/* ---------------------------------------------------------- */
/* ---------------------------------------------------------- */
/* Mistral: бесплатный ключ (план Experiment)                  */
/* ---------------------------------------------------------- */
/**
 * У Mistral есть бесплатный тариф: ключ выдаётся без карты, лимит примерно
 * один запрос в секунду. Модель умная, поэтому канал идёт сразу после шлюза.
 * Ключ можно задать в окружении (MISTRAL_API_KEY) или вставить в настройках
 * игры — тогда он приходит вместе с запросом и никуда не сохраняется на сервере.
 */
const MISTRAL_BASE = (process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1').replace(/\/$/, '');
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-medium-latest';
/**
 * Ключ игры. Порядок такой же, как у Pollinations: свой ключ игрока в настройках →
 * ключ окружения → вшитый. Вшитый нужен, чтобы мастер был умным «из коробки».
 * В тестах его можно выключить: MISTRAL_BUILTIN_KEY=''.
 */
const MISTRAL_ENV_KEY = String(process.env.MISTRAL_API_KEY || '').trim();
const MISTRAL_BUILTIN_KEY = process.env.MISTRAL_BUILTIN_KEY === undefined
  ? 'mstrl_Em8SyFmMCKpx2S0yJ7GGfcxWYCnYcnbA_1bhNM3'
  : String(process.env.MISTRAL_BUILTIN_KEY || '').trim();
/** Агент из Mistral Studio (имя «Textgame», модель Mistral Medium): свой системный
 *  промпт и своя квота — прямой чат на medium нашему ключу не отдаёт. */
const MISTRAL_AGENT_ID = String(process.env.MISTRAL_AGENT_ID || 'ag_01a0d2eae583767ca848c91910957803').trim();
const MISTRAL_BASE_KEY = MISTRAL_ENV_KEY || MISTRAL_BUILTIN_KEY;
/** У бесплатного ключа умные пулы часто отдают 429 — идём по моделям сверху вниз. */
const MISTRAL_MODEL_CHAIN = String(process.env.MISTRAL_MODEL_CHAIN ||
  'mistral-medium-latest,mistral-small-latest,ministral-14b-latest,ministral-8b-latest,open-mistral-nemo')
  .split(',').map(s => s.trim()).filter(Boolean);
const MISTRAL_LAST_MODEL = { name: '', at: 0 };

/* ---------------------------------------------------------- */
/**
 * GLM (Zhipu / Z.ai). Ключ формата «id.secret» выдаётся в консоли
 * open.bigmodel.cn (или z.ai) бесплатно, без карты. Бесплатно отвечает
 * модель glm-4.5-flash; умные модели (glm-4.6, glm-5.x) требуют баланса —
 * если счёт пополнят, они подхватятся сами, потому что идут в цепочке ниже.
 */
const GLM_BASE = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\/$/, '');
const GLM_ENV_KEY = String(process.env.GLM_API_KEY || '').trim();
const GLM_BUILTIN_KEY = process.env.GLM_BUILTIN_KEY === undefined
  ? '299abfa0a8334cb68782e93acca01901.2wk65aWEDXtmATCI'
  : String(process.env.GLM_BUILTIN_KEY || '').trim();
const GLM_BASE_KEY = GLM_ENV_KEY || GLM_BUILTIN_KEY;
const GLM_MODEL_CHAIN = String(process.env.GLM_MODEL_CHAIN ||
  'glm-4.5-flash,glm-4.6,glm-4.5,glm-4.5-air,glm-5.3-flash')
  .split(',').map(x => x.trim()).filter(Boolean);
const GLM_LAST_MODEL = { name: '', at: 0 };

/* ---------------------------------------------------------- */
/**
 * Hugging Face. Ключ hf_… берётся бесплатно в настройках профиля (Fine-grained →
 * «Make calls to Inference Providers»). Им можно и вести игру (роутер отдаёт
 * 137 моделей у 14 провайдеров), и рисовать кадры: те же открытые Space'ы,
 * но по имени, а не анонимно.
 *
 * У бесплатного аккаунта кредиты на Inference Providers крошечные (около десяти
 * центов в месяц) — когда они кончились, роутер отвечает 402, и канал должен
 * уступать место, а не держать игрока. Поэтому состояние «кредиты кончились»
 * запоминается и показывается в health.
 */
const HF_BASE = (process.env.HF_BASE_URL || 'https://router.huggingface.co/v1').replace(/\/$/, '');
const HF_ENV_KEY = String(process.env.HF_API_KEY || process.env.HUGGING_FACE_TOKEN || '').trim();
const HF_BUILTIN_KEY = process.env.HF_BUILTIN_KEY === undefined
  ? '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'
  : String(process.env.HF_BUILTIN_KEY || '').trim();
const HF_BASE_KEY = HF_ENV_KEY || HF_BUILTIN_KEY;
/** Быстрые и толковые модели роутера (проверены живыми ходами: 1.5–2.7 с на ход). */
const HF_MODEL_CHAIN = String(process.env.HF_MODEL_CHAIN ||
  'zai-org/GLM-5.3-Flash,deepseek-ai/DeepSeek-V4.1-Flash,Qwen/Qwen3.8-27B')
  .split(',').map(x => x.trim()).filter(Boolean);
const HF_LAST_MODEL = { name: '', at: 0 };
/** «Кредиты кончились» (402): держим в памяти, чтобы не ждать впустую каждым ходом. */
const HF_CREDITS = { at: 0, why: '' };

function cleanHfKey(value) {
  const key = String(value || '').trim();
  return /^hf_[A-Za-z0-9]{20,80}$/.test(key) ? key : '';
}

function hfKeyFor(payload) {
  return cleanHfKey(payload && payload.hfKey) || HF_BASE_KEY;
}

/** Свой ключ игрока пробуем всегда: у него могут быть свои кредиты. */
function hfOwnKey(ctx) {
  return cleanHfKey(ctx && ctx.hfKey) || '';
}

function hfKeyReady(ctx) {
  const own = hfOwnKey(ctx);
  if (own) return true;
  if (!HF_BASE_KEY) return false;
  return !hfCreditsDead();                 // вшитый ключ без кредитов не дёргаем
}

function hfCreditsDead(err) {
  return /402|Payment Required|included credits|pre-paid credits/i.test(String(err && err.message || ''));
}

function hfCreditsFresh() {
  return HF_CREDITS.at > 0 && (Date.now() - HF_CREDITS.at) < 30 * 60 * 1000;
}

/** «Ключ принят, но счёт пуст» (код 1113): чтобы экран настроек не врал, что канал готов. */
const GLM_NO_BALANCE = { at: 0, why: '' };

/** Ключ GLM — это «id.secret»; в настройках игрока проверяем формат. */
function cleanGlmKey(value) {
  const key = String(value || '').trim();
  // формат: «id.secret», две части через точку; пробелы и кириллица отсекаются
  return /^[A-Za-z0-9_\-]{6,80}\.[A-Za-z0-9_\-]{6,80}$/.test(key) ? key : '';
}

function glmKeyFor(payload) {
  return cleanGlmKey(payload && payload.glmKey) || GLM_BASE_KEY;
}

function glmKeyReady(ctx) {
  return !!((ctx && ctx.glmKey) || GLM_BASE_KEY);
}

/** Пустой счёт у ключа: это не лимит, повторять бессмысленно. */
function glmNoBalance(err) {
  return /1113|Insufficient balance|余额不足/.test(String(err && err.message || ''));
}

function glmNoBalanceFresh() {
  return GLM_NO_BALANCE.at > 0 && (Date.now() - GLM_NO_BALANCE.at) < 30 * 60 * 1000;
}

/** Ключ из настроек игры: пускаем только похожее на ключ, без пробелов и адресов. */
function cleanMistralKey(value) {
  const key = String(value || '').trim();
  return /^[A-Za-z0-9_\-]{12,80}$/.test(key) ? key : '';
}

function mistralKeyFor(payload) {
  return cleanMistralKey(payload && payload.mistralKey) || MISTRAL_BASE_KEY;
}

function mistralKeyReady(ctx) {
  return !!((ctx && ctx.mistralKey) || MISTRAL_BASE_KEY);
}

/** Агент для разговора: из запроса, из окружения или вшитый. */
function mistralAgentFor(payload) {
  const own = String((payload && payload.mistralAgent) || '').trim();
  return /^ag_[A-Za-z0-9]{6,64}$/.test(own) ? own : MISTRAL_AGENT_ID;
}

function mistralAgentReady(ctx) {
  return !!(ctx && ctx.mistralAgent) && mistralKeyReady(ctx);
}

/**
 * Разговор агента принимает только роли user/assistant, поэтому системную часть
 * промпта кладём в начало первого сообщения — игра ничего не теряет.
 */
function agentInputs(messages) {
  const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
  const rest = messages.filter(m => m.role !== 'system');
  const entries = rest.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 20000)
  }));
  if (!entries.length) entries.push({ role: 'user', content: (sys || 'Продолжай игру.').slice(0, 20000) });
  else if (sys) entries[0] = { role: 'user', content: (sys + '\n\n' + entries[0].content).slice(0, 20000) };
  return entries;
}

/** Текст из ответа агента: части могут приходить строкой или списком кусков. */
function outputsText(outputs) {
  return (outputs || [])
    .filter(o => o && (o.type === 'message.output' || o.role === 'assistant'))
    .map(o => {
      const c = o.content;
      if (typeof c === 'string') return c;
      if (Array.isArray(c)) return c.map(p => (p && (p.text || p.content)) || '').join('');
      return '';
    }).join('');
}

async function mistralAgentChat(messages, key, agentId, timeoutMs) {
  const res = await fetchWithTimeout(MISTRAL_BASE + '/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Accept': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ inputs: agentInputs(messages), agent_id: agentId, stream: false })
  }, timeoutMs || 26000);
  if (!res.ok) throw new Error('mistral-agent HTTP ' + res.status);
  const data = await res.json();
  const text = outputsText(data && data.outputs);
  if (!text) throw new Error('mistral-agent empty answer');
  return text;
}

/** Поток агента: события message.output.delta несут куски текста. */
async function mistralAgentStream(messages, key, agentId, onDelta, timeoutMs) {
  const res = await fetchWithTimeout(MISTRAL_BASE + '/conversations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Accept': 'text/event-stream', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ inputs: agentInputs(messages), agent_id: agentId, stream: true })
  }, timeoutMs || 26000);
  if (!res.ok) throw new Error('mistral-agent HTTP ' + res.status);
  if (!res.body || typeof res.body.getReader !== 'function') {
    const data = await res.json();
    const text = outputsText(data && data.outputs);
    if (!text) throw new Error('mistral-agent empty answer');
    onDelta(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let piece = '';
      try {
        const obj = JSON.parse(payload);
        if (obj && obj.type === 'message.output.delta') {
          const c = obj.content;
          piece = typeof c === 'string' ? c : (Array.isArray(c) ? c.map(p => (p && p.text) || '').join('') : '');
        }
      } catch (e) { piece = ''; }
      if (piece) { full += piece; onDelta(piece); }
    }
  }
  return full;
}

/** Бесплатный тариф любит отвечать 429: одна вежливая пауза и повтор. */
function mistralRetryDelay(status) {
  return status === 429 ? 900 : 0;
}

async function mistralChatOnce(messages, key, timeoutMs, model) {
  const url = MISTRAL_BASE + '/chat/completions';
  const call = () => fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.9,
      max_tokens: TEXT_MAX_TOKENS,
      response_format: { type: 'json_object' }
    })
  }, timeoutMs || 20000);
  let res = await call();
  if (!res.ok && res.status === 429) {
    await sleep(mistralRetryDelay(res.status));
    res = await call();
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error('mistral HTTP ' + res.status + (body ? ' ' + body.slice(0, 90) : ''));
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message &&
    data.choices[0].message.content;
  if (!text) throw new Error('mistral empty completion');
  return text;
}

/**
 * Чат с откатом по моделям: у бесплатного ключа умные пулы часто заняты (429),
 * поэтому пробуем следующую модель, а не сдаёмся сразу. Удачная модель
 * запоминается и в следующий раз идёт первой — так игра не тратит время зря.
 */
async function mistralChat(messages, key, timeoutMs, model) {
  const order = (() => {
    if (model) return [model];
    const chain = MISTRAL_MODEL_CHAIN.slice();
    const fresh = MISTRAL_LAST_MODEL.name && (Date.now() - MISTRAL_LAST_MODEL.at < 10 * 60 * 1000) ? MISTRAL_LAST_MODEL.name : '';
    if (fresh) {
      const i = chain.indexOf(fresh);
      if (i > 0) { chain.splice(i, 1); chain.unshift(fresh); }
    }
    return chain;
  })();
  let lastErr = null;
  const started = Date.now();
  for (const name of order) {
    const left = (timeoutMs || 20000) - (Date.now() - started);
    if (left < 5000) break;
    try {
      const text = await mistralChatOnce(messages, key, left, name);
      if (name !== MISTRAL_LAST_MODEL.name) MISTRAL_LAST_MODEL.name = name;
      MISTRAL_LAST_MODEL.at = Date.now();
      return text;
    } catch (err) {
      lastErr = err;
      const retryable = err && (err.status === 429 || err.status === 404 || err.status === 401);
      if (!retryable) break;                    // 500-е нет смысла перебирать моделями
    }
  }
  throw lastErr || new Error('mistral: нет доступной модели');
}

/** Поток от Mistral: тот же SSE, что у остальных OpenAI-совместимых каналов. */
async function mistralStream(messages, key, onDelta, timeoutMs, model) {
  return openAiStream({
    url: MISTRAL_BASE + '/chat/completions',
    key,
    model: model || MISTRAL_MODEL,
    messages,
    onDelta,
    timeoutMs: timeoutMs || 26000,
    responseFormat: { type: 'json_object' }
  });
}

/**
 * Один запрос к GLM. Модель glm-4.5-flash умеет «размышлять» и по умолчанию
 * тратит на это весь max_tokens — для мастера игры это лишние секунды, поэтому
 * размышления выключаем. Ответ просим в JSON: контракт хода такой же, как у всех.
 */
async function glmChatOnce(messages, key, timeoutMs, model) {
  const url = GLM_BASE + '/chat/completions';
  const call = () => fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.9,
      max_tokens: TEXT_MAX_TOKENS,
      thinking: { type: 'disabled' },
      response_format: { type: 'json_object' }
    })
  }, timeoutMs || 20000);
  const res = await call();
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error('glm HTTP ' + res.status + (body ? ' ' + body.slice(0, 120) : ''));
    err.status = res.status;
    if (glmNoBalance(err)) {
      GLM_NO_BALANCE.at = Date.now();
      GLM_NO_BALANCE.why = 'HTTP ' + res.status + ' ' + body.slice(0, 120);
    }
    throw err;
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message &&
    data.choices[0].message.content;
  if (!text) throw new Error('glm empty completion');
  return text;
}

/**
 * Чат с откатом по моделям: первой идёт бесплатная glm-4.5-flash, за ней —
 * умные модели (нужен баланс). «Пустой счёт» не повторяем: ждать нечего.
 */
async function glmChat(messages, key, timeoutMs, model) {
  const order = (() => {
    if (model) return [model];
    const chain = GLM_MODEL_CHAIN.slice();
    const fresh = GLM_LAST_MODEL.name && (Date.now() - GLM_LAST_MODEL.at < 10 * 60 * 1000) ? GLM_LAST_MODEL.name : '';
    if (fresh) {
      const i = chain.indexOf(fresh);
      if (i > 0) { chain.splice(i, 1); chain.unshift(fresh); }
    }
    return chain;
  })();
  let lastErr = null;
  const started = Date.now();
  for (const name of order) {
    const left = (timeoutMs || 20000) - (Date.now() - started);
    if (left < 5000) break;
    try {
      const text = await glmChatOnce(messages, key, left, name);
      if (name !== GLM_LAST_MODEL.name) GLM_LAST_MODEL.name = name;
      GLM_LAST_MODEL.at = Date.now();
      GLM_NO_BALANCE.at = 0;
      return text;
    } catch (err) {
      lastErr = err;
      if (glmNoBalance(err)) continue;                 // счёт пуст — пробуем следующую модель (flash бесплатна)
      const retryable = err && (err.status === 429 || err.status === 404 || err.status === 401);
      if (!retryable) break;
    }
  }
  throw lastErr || new Error('glm: нет доступной модели');
}

/** Поток от GLM: обычный OpenAI SSE, отличается только выключенными размышлениями. */
async function glmStream(messages, key, onDelta, timeoutMs, model) {
  return openAiStream({
    url: GLM_BASE + '/chat/completions',
    key,
    model: model || GLM_LAST_MODEL.name || GLM_MODEL_CHAIN[0],
    messages,
    onDelta,
    timeoutMs: timeoutMs || 26000,
    responseFormat: { type: 'json_object' },
    extra: { thinking: { type: 'disabled' } }
  });
}

/**
 * Один запрос к роутеру Hugging Face. Формат — обычный OpenAI, поэтому вся
 * обвязка та же, что у остальных каналов: отличается только адрес и то, что
 * 402 («кредиты кончились») мы запоминаем и больше не ждём.
 */
async function hfChatOnce(messages, key, timeoutMs, model) {
  const res = await fetchWithTimeout(HF_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.9,
      max_tokens: TEXT_MAX_TOKENS
    })
  }, timeoutMs || 20000);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error('hf HTTP ' + res.status + (body ? ' ' + body.slice(0, 120) : ''));
    err.status = res.status;
    if (hfCreditsDead(err)) {
      HF_CREDITS.at = Date.now();
      HF_CREDITS.why = 'HTTP ' + res.status + ' ' + body.slice(0, 120);
    }
    throw err;
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message &&
    data.choices[0].message.content;
  if (!text) throw new Error('hf empty completion');
  return text;
}

/** Чат с откатом по моделям: у каждой свой провайдер, поэтому отказы разные. */
async function hfChat(messages, key, timeoutMs, model) {
  const order = (() => {
    if (model) return [model];
    const chain = HF_MODEL_CHAIN.slice();
    const fresh = HF_LAST_MODEL.name && (Date.now() - HF_LAST_MODEL.at < 10 * 60 * 1000) ? HF_LAST_MODEL.name : '';
    if (fresh) {
      const i = chain.indexOf(fresh);
      if (i > 0) { chain.splice(i, 1); chain.unshift(fresh); }
    }
    return chain;
  })();
  let lastErr = null;
  const started = Date.now();
  for (const name of order) {
    const left = (timeoutMs || 20000) - (Date.now() - started);
    if (left < 5000) break;
    try {
      const text = await hfChatOnce(messages, key, left, name);
      HF_LAST_MODEL.name = name;
      HF_LAST_MODEL.at = Date.now();
      HF_CREDITS.at = 0;
      return text;
    } catch (err) {
      lastErr = err;
      if (hfCreditsDead(err)) break;                   // общий счёт аккаунта — другие модели не помогут
      const retryable = err && (err.status === 429 || err.status === 404 || err.status === 403);
      if (!retryable) break;
    }
  }
  throw lastErr || new Error('hf: нет доступной модели');
}

/** Поток от HF-роутера (обычный OpenAI SSE). */
async function hfStream(messages, key, onDelta, timeoutMs, model) {
  return openAiStream({
    url: HF_BASE + '/chat/completions',
    key,
    model: model || HF_LAST_MODEL.name || HF_MODEL_CHAIN[0],
    messages,
    onDelta,
    timeoutMs: timeoutMs || 26000
  });
}

/**
 * Общий поток для OpenAI-совместимых сервисов (Mistral и «свои каналы»):
 * строки SSE «data: {…}» → куски текста. Одна реализация на всех, чтобы
 * новый канал не пришлось учить стриму отдельно.
 */
async function openAiStream({ url, key, model, messages, onDelta, timeoutMs, responseFormat, extra }) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, key ? { 'Authorization': 'Bearer ' + key } : {}),
    body: JSON.stringify(Object.assign({
      model, messages, temperature: 0.9, stream: true, max_tokens: TEXT_MAX_TOKENS
    }, responseFormat ? { response_format: responseFormat } : {}, extra || {}))
  }, timeoutMs || 26000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  if (!res.body || typeof res.body.getReader !== 'function') {
    const data = await res.json();
    const text = data && data.choices && data.choices[0] && data.choices[0].message &&
      data.choices[0].message.content;
    if (!text) throw new Error('empty completion');
    onDelta(text);
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let piece = '';
      try {
        const obj = JSON.parse(payload);
        const choice = obj && obj.choices && obj.choices[0];
        piece = (choice && ((choice.delta && choice.delta.content) || (choice.message && choice.message.content))) || '';
      } catch (e) { piece = ''; }
      if (piece) { full += piece; onDelta(piece); }
    }
  }
  return full;
}

const JUNK_RE = /(top up|insufficient balance|not enough credit|payment required|valid api key|missing turnstile|unauthorized)/i;

function isJunk(text) {
  if (!text || String(text).length < 25) return true;
  return JUNK_RE.test(String(text));
}

/**
 * Каналы мастера для выбора в настройках: id (его клиент присылает в provider),
 * название для игрока, доступность и короткое пояснение. Порядок — от умного к запасному.
 */
function masterChoices() {
  const out = [
    { id: 'auto', title: 'Авто (умный, быстрый)', hint: 'игра сама выбирает лучший живой канал',
      available: true, detail: textProvidersSummary().join(', ') }
  ];
  if (GEN_KEY_ACTIVE) {
    out.push({
      id: 'gen',
      title: 'Шлюз: ' + GEN_TEXT_MODELS.length + ' моделей',
      hint: 'Mistral Large, GLM, Qwen — самые умные',
      available: genReady(),
      detail: genReady() ? 'готов' : (genKeyDeadFresh() ? 'у ключа нет баланса' : 'ключ отдыхает')
    });
  }
  out.push({
    id: 'mistral-agent',
    title: 'Mistral-агент «Textgame»',
    hint: 'Mistral Medium: самый умный из доступных, ответ идёт потоком',
    available: true,
    detail: MISTRAL_AGENT_ID ? 'агент из Studio' : 'нужен id агента'
  });
  out.push({
    id: 'mistral',
    title: 'Mistral (модели по очереди)',
    hint: 'Medium → Small → Ministral: если умная занята, отвечает младшая',
    available: true,
    detail: MISTRAL_ENV_KEY ? 'ключ задан на сервере' : (MISTRAL_BUILTIN_KEY ? 'ключ вшит в игру' : 'нужен свой ключ (поле ниже)')
  });
  out.push({
    id: 'glm',
    title: 'GLM (Zhipu, бесплатная flash)',
    hint: 'glm-4.5-flash: китайская модель Zhipu, отвечает без ключа и без баланса',
    available: !glmNoBalanceFresh() || GLM_LAST_MODEL.name === 'glm-4.5-flash',
    detail: glmNoBalanceFresh() && !GLM_LAST_MODEL.name
      ? 'у ключа пустой счёт — ждём пополнения'
      : (GLM_ENV_KEY ? 'ключ задан на сервере'
        : (GLM_BUILTIN_KEY ? 'ключ вшит в игру' : 'нужен свой ключ (поле ниже)'))
  });
  out.push({
    id: 'hf',
    title: 'Hugging Face (137 моделей)',
    hint: 'GLM-5.3-Flash и DeepSeek отвечают за 1.5–3 с; у бесплатного ключа кредиты крошечные',
    available: hfKeyReady({}),
    detail: hfCreditsFresh()
      ? 'кредиты бесплатного ключа кончились — вставьте свой ключ (поле ниже)'
      : (HF_ENV_KEY ? 'ключ задан на сервере'
        : (HF_BUILTIN_KEY ? 'ключ вшит в игру' : 'нужен свой ключ (поле ниже)'))
  });
  if (process.env.GROQ_API_KEY) out.push({ id: 'groq', title: 'Groq', hint: 'Llama 3.3 70B, очень быстрый', available: true, detail: 'ключ задан' });
  if (process.env.GEMINI_API_KEY) out.push({ id: 'gemini', title: 'Gemini', hint: 'Google, щедрая бесплатная квота', available: true, detail: 'ключ задан' });
  if (process.env.OPENROUTER_API_KEY) out.push({ id: 'openrouter', title: 'OpenRouter', hint: 'бесплатные маршруты :free', available: true, detail: 'ключ задан' });
  if (process.env.OPENAI_API_KEY) out.push({ id: 'openai', title: 'OpenAI', hint: 'GPT-4o mini', available: true, detail: 'ключ задан' });
  for (const extra of customProviders()) {
    out.push({ id: extra.id, title: extra.title, hint: extra.hint, available: true, detail: 'свой канал' });
  }
  if (POLLINATIONS_KEY) out.push({ id: 'pollinations-key', title: 'Pollinations (ключ)', hint: 'запасной канал игры', available: true, detail: 'вшитый ключ' });
  out.push({ id: 'pollinations-anon', title: 'Pollinations (без ключа)', hint: 'всегда доступен, отвечает медленно', available: true, detail: 'анонимно' });
  out.push({ id: 'local', title: 'Встроенный мастер', hint: 'без сети: ведёт игру сама игра, мгновенно', available: true, detail: 'память и вехи кампании' });
  return out;
}

/**
 * Свои каналы из окружения: LLM_BASE_1/LLM_KEY_1/LLM_MODEL_1 (и до 3 штук).
 * Так можно подключить любой OpenAI-совместимый сервис — включая бесплатные
 * (LLM7, OVH, Ollama рядом, корпоративный шлюз) — без правки кода.
 */
function customProviders() {
  const out = [];
  for (let i = 1; i <= 3; i++) {
    const base = process.env['LLM_BASE_' + i];
    if (!base) continue;
    out.push({
      id: 'custom' + i,
      title: process.env['LLM_TITLE_' + i] || ('Свой канал ' + i),
      hint: process.env['LLM_HINT_' + i] || 'OpenAI-совместимый сервис',
      url: base.replace(/\/$/, '') + '/chat/completions',
      key: process.env['LLM_KEY_' + i] || 'none',
      model: process.env['LLM_MODEL_' + i] || 'auto:free'
    });
  }
  return out;
}

/** Какие каналы есть — клиенту показываем списком. */
function textProvidersSummary() {
  const out = [];
  if (genReady()) out.push(genKeyDeadFresh() ? 'gen:без баланса, пробуем' : 'gen:' + GEN_TEXT_MODELS.length + 'моделей');
  else if (GEN_KEY_ACTIVE) out.push(genKeyDeadFresh() ? 'gen:без баланса (ключ отдыхает)' : 'gen:ключ отдыхает');
  if (MISTRAL_AGENT_ID && mistralKeyReady({ mistralKey: MISTRAL_BASE_KEY })) out.push('mistral-agent');
  if (mistralKeyReady({ mistralKey: MISTRAL_BASE_KEY })) out.push('mistral:' + (MISTRAL_LAST_MODEL.name || MISTRAL_MODEL_CHAIN[0]));
  if (glmKeyReady({ glmKey: GLM_BASE_KEY })) out.push('glm:' + (GLM_LAST_MODEL.name || GLM_MODEL_CHAIN[0]));
  if (hfKeyReady({})) out.push('hf:' + (HF_LAST_MODEL.name || HF_MODEL_CHAIN[0]));
  else if (HF_BASE_KEY && hfCreditsFresh()) out.push('hf:кредиты кончились');
  if (process.env.GROQ_API_KEY) out.push('groq');
  if (process.env.GEMINI_API_KEY) out.push('gemini');
  if (process.env.OPENROUTER_API_KEY) out.push('openrouter');
  if (process.env.OPENAI_API_KEY) out.push('openai');
  if (POLLINATIONS_KEY) out.push('pollinations-key');
  out.push('pollinations-anon');   // оба канала работают гонкой внутри одного провайдера
  return out;
}

/** Провайдеры в порядке приоритета. Каждый: {name, run(messages, model)} → текст. */
const PROVIDERS = [
  {
    name: 'groq',
    enabled: () => !!process.env.GROQ_API_KEY,
    async run(messages) {
      const base = process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1';
      const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
      return openAiChat({
        url: base.replace(/\/$/, '') + '/chat/completions',
        key: process.env.GROQ_API_KEY,
        model, messages
      });
    }
  },
  {
    name: 'gemini',
    enabled: () => !!process.env.GEMINI_API_KEY,
    async run(messages) {
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const key = process.env.GEMINI_API_KEY;
      const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
      const user = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n');
      const res = await fetchWithTimeout(
        'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key),
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: sys ? { parts: [{ text: sys }] } : undefined,
            contents: [{ role: 'user', parts: [{ text: user }] }],
            generationConfig: { temperature: 0.9, maxOutputTokens: Math.min(TEXT_MAX_TOKENS, 2048), responseMimeType: 'application/json' }
          })
        }, 20000);
      if (!res.ok) throw new Error('gemini HTTP ' + res.status);
      const data = await res.json();
      const text = data && data.candidates && data.candidates[0] &&
        data.candidates[0].content && data.candidates[0].content.parts &&
        data.candidates[0].content.parts.map(p => p.text || '').join('');
      if (!text) throw new Error('gemini empty');
      return text;
    }
  },
  {
    name: 'openrouter',
    enabled: () => !!process.env.OPENROUTER_API_KEY,
    async run(messages) {
      return openAiChat({
        url: 'https://openrouter.ai/api/v1/chat/completions',
        key: process.env.OPENROUTER_API_KEY,
        model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
        messages
      });
    }
  },
  {
    name: 'openai',
    enabled: () => !!process.env.OPENAI_API_KEY,
    async run(messages) {
      const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
      return openAiChat({
        url: base.replace(/\/$/, '') + '/chat/completions',
        key: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages
      });
    }
  },
  {
    // Агент Mistral — ведёт игру по умолчанию: умная модель (Medium) через Agents API,
    // свой системный промпт и своя квота, ответ идёт потоком.
    name: 'mistral-agent',
    enabled: ctx => mistralAgentReady(ctx),
    async run(messages, budgetMs, kind, ctx) {
      const budget = Math.max(6000, Math.min(26000, budgetMs || 20000));
      return mistralAgentChat(messages, ctx.mistralKey || MISTRAL_BASE_KEY, ctx.mistralAgent, budget);
    }
  },
  {
    // Mistral с бесплатным ключом: умная модель без квот и без баланса.
    // Идёт сразу после шлюза — если у шлюза кончился баланс, ведёт она.
    name: 'mistral',
    label: () => 'mistral:' + (MISTRAL_LAST_MODEL.name || MISTRAL_MODEL_CHAIN[0]),
    enabled: ctx => mistralKeyReady(ctx),
    async run(messages, budgetMs, kind, ctx) {
      const key = (ctx && ctx.mistralKey) || MISTRAL_BASE_KEY;
      const budget = Math.max(6000, Math.min(26000, budgetMs || 20000));
      return mistralChat(messages, key, budget);
    }
  },
  {
    // GLM (Zhipu): бесплатная glm-4.5-flash ведёт игру, если у шлюза и агента
    // Mistral не вышло. Ключ вшит, поэтому канал работает «из коробки».
    name: 'glm',
    label: () => 'glm:' + (GLM_LAST_MODEL.name || GLM_MODEL_CHAIN[0]),
    enabled: ctx => glmKeyReady(ctx),
    async run(messages, budgetMs, kind, ctx) {
      const key = (ctx && ctx.glmKey) || GLM_BASE_KEY;
      const budget = Math.max(6000, Math.min(30000, budgetMs || 24000));
      return glmChat(messages, key, budget);
    }
  },
  {
    // Hugging Face: один ключ — 137 моделей у 14 провайдеров. Ходы короткие
    // и по-русски, но у бесплатного аккаунта кредиты крошечные, поэтому канал
    // уступает место сразу, как только роутер сказал «402».
    name: 'hf',
    label: () => 'hf:' + (HF_LAST_MODEL.name || HF_MODEL_CHAIN[0]),
    enabled: ctx => hfKeyReady(ctx),
    async run(messages, budgetMs, kind, ctx) {
      const key = hfOwnKey(ctx) || HF_BASE_KEY;
      const budget = Math.max(6000, Math.min(30000, budgetMs || 24000));
      return hfChat(messages, key, budget);
    }
  },
  {
    // Шлюз gen.pollinations.ai: умные модели (Mistral Large 3, GLM-5.3, Qwen 3.8).
    // Он идёт первым — мастер должен быть толковым, а не «на сдачу».
    name: 'gen',
    enabled: () => genReady(),
    async run(messages, budgetMs, kind) {
      const res = await genChatRotating(messages, { budgetMs: Math.max(8000, Math.min(32000, budgetMs || 26000)), kind });
      return res.text;
    }
  },
  {
    // Старый канал Pollinations: остаётся запасным — если шлюз недоступен, игра не встанет.
    // Сервис часто отвечает 429/502 — поэтому ещё и повторяем запрос.
    name: 'pollinations',
    enabled: () => true,
    async run(messages, budgetMs) {
      const started = Date.now();
      const budget = Math.max(6000, Math.min(32000, Number(budgetMs) || 32000));
      const left = () => budget - (Date.now() - started);      // сервер отвечает раньше, чем устанет клиент
      // Каналы строго по очереди: два одновременных запроса Pollinations
      // гарантированно получают «Queue full». Ключевой канал — основной,
      // анонимный — запасной, он часто разгружен.
      const attempts = POLLINATIONS_KEY ? [POLLINATIONS_KEY, null] : [null];
      let lastErr = new Error('HTTP 429');
      for (const key of attempts) {
        for (let wave = 0; wave < 2; wave++) {
          const timeout = Math.max(6000, Math.min(22000, left()));
          if (timeout < 6000) break;
          try {
            return await pollinationsChat(messages, key, timeout);
          } catch (err) {
            lastErr = err;
            if (left() < 8000) break;
            await sleep(1200);
          }
        }
        if (left() < 8000) break;
      }
      throw lastErr;
    }
  }
];

async function openAiChat({ url, key, model, messages }) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: TEXT_MAX_TOKENS })
  }, 20000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const text = data && data.choices && data.choices[0] &&
    (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text);
  if (!text) throw new Error('empty completion');
  return text;
}

async function pollinationsChat(messages, key, timeoutMs) {
  return queuePollinations('text', () => withQueueRetry(
    leftMs => pollinationsChatRaw(messages, key, Math.max(6000, Math.min(timeoutMs, leftMs))),
    timeoutMs, key ? 'chat-key' : 'chat-anon'));
}

async function pollinationsChatRaw(messages, key, timeoutMs) {
  const headers = { 'content-type': 'application/json' };
  if (key) headers['Authorization'] = 'Bearer ' + key;
  const res = await fetchWithTimeout('https://text.pollinations.ai/openai', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'openai-fast', messages, temperature: 0.9,
      max_tokens: TEXT_MAX_TOKENS, private: true, reasoning_effort: POLLINATIONS_EFFORT
    })
  }, timeoutMs || 16000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const text = data && data.choices && data.choices[0] &&
    (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text);
  if (!text) throw new Error('empty completion');
  return text;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------- */
/* Шлюз gen.pollinations.ai                                   */
/* ---------------------------------------------------------- */

/** Один запрос к шлюзу. stream=true — читаем SSE и отдаём куски в onDelta. */
async function genChat(messages, opts) {
  const o = opts || {};
  const body = {
    model: o.model,
    messages,
    temperature: typeof o.temperature === 'number' ? o.temperature : 0.85
  };
  if (o.maxTokens) body.max_tokens = o.maxTokens;
  if (o.stream) body.stream = true;
  const res = await fetchWithTimeout(GEN_BASE + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + GEN_KEY_ACTIVE },
    body: JSON.stringify(body)
  }, o.timeoutMs || 30000);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 140); } catch (e) { /* noop */ }
    if (res.status === 402 || looksLikeNoBalance(detail)) genKeyRest('HTTP ' + res.status);
    throw new Error('HTTP ' + res.status + (detail ? ' ' + detail : ''));
  }
  if (!o.stream || !res.body || typeof res.body.getReader !== 'function') {
    const data = await res.json();
    const text = data && data.choices && data.choices[0] &&
      (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text);
    if (!text) throw new Error('пустой ответ модели');
    if (looksLikeNoBalance(text)) { genKeyRest('модель вернула «нет баланса»'); throw new Error('шлюз: нет баланса ключа'); }
    return text;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices && obj.choices[0] && obj.choices[0].delta && obj.choices[0].delta.content;
        if (delta) { full += delta; if (o.onDelta) o.onDelta(delta); }
      } catch (e) { /* мусорная строка потока — пропускаем */ }
    }
  }
  if (!full) throw new Error('пустой поток модели');
  if (looksLikeNoBalance(full)) { genKeyRest('поток вернул «нет баланса»'); throw new Error('шлюз: нет баланса ключа'); }
  return full;
}

/**
 * Мастер от шлюза: перебираем модели по кругу, у каждой свой минутный лимит.
 * Успех и неудача одинаково «остужают» модель, чтобы не биться в закрытую дверь.
 */
async function genChatRotating(messages, opts) {
  const o = opts || {};
  const deadline = Date.now() + (o.budgetMs || 30000);
  let lastErr = null;
  // Набору героя нужен быстрый ответ: короткая попытка и переход к следующей модели.
  const perAttempt = o.kind === 'hero' ? 12000 : 22000;
  for (const model of genModelOrder(o.kind)) {
    if (o.stream && GEN_STREAM_SKIP.test(model)) continue;
    const left = deadline - Date.now();
    if (left < 5000) break;
    try {
      // Не даём одной модели съесть весь бюджет: если она «задумалась», быстрее
      // перейдём к следующей — у нас их пять.
      const text = await genChat(messages, Object.assign({}, o, { model, timeoutMs: Math.min(o.timeoutMs || perAttempt, left) }));
      genMarkUsed(model);
      return { text, model };
    } catch (err) {
      genMarkUsed(model);
      lastErr = err;
    }
  }
  throw lastErr || new Error('шлюз: нет доступной модели');
}

/** Первый осмысленный ответ из нескольких параллельных попыток. */
function firstGood(promises) {
  return new Promise((resolve, reject) => {
    let failed = 0;
    let done = false;
    const reasons = [];
    promises.forEach(pm => {
      Promise.resolve(pm).then(text => {
        if (done) return;
        if (isJunk(text)) {
          reasons.push('junk');
          failed++;
          if (failed === promises.length) reject(new Error(reasons.join(' / ')));
          return;
        }
        done = true;
        resolve(text);
      }).catch(err => {
        if (done) return;
        reasons.push(String(err && err.message || err));
        failed++;
        if (failed === promises.length) reject(new Error(reasons.join(' / ')));
      });
    });
    if (!promises.length) reject(new Error('нет попыток'));
  });
}

/**
 * Прогон по всем провайдерам: возвращает первый осмысленный ответ.
 * Бюджет времени ограничен, чтобы клиент не ждал дольше своего таймаута.
 */
function providerList(want, ctx) {
  // Выбор игрока: 'auto' — обычный порядок, иначе только выбранный канал.
  if (want === 'mistral') {
    return mistralKeyReady(ctx) ? PROVIDERS.filter(p => p.name === 'mistral') : [];
  }
  if (want === 'mistral-agent') {
    return mistralAgentReady(ctx) ? PROVIDERS.filter(p => p.name === 'mistral-agent') : [];
  }
  if (!want || want === 'auto') return PROVIDERS;
  if (want === 'pollinations-anon') {
    return PROVIDERS.filter(p => p.name === 'pollinations').map(p => Object.assign({}, p, {
      name: 'pollinations-anon',
      run: (messages, budget, kind) => pollinationsChat(messages, null, Math.max(6000, Math.min(22000, budget || 20000)))
    }));
  }
  if (want === 'pollinations-key') {
    return POLLINATIONS_KEY ? PROVIDERS.filter(p => p.name === 'pollinations').map(p => Object.assign({}, p, {
      name: 'pollinations-key',
      run: (messages, budget) => pollinationsChat(messages, POLLINATIONS_KEY, Math.max(6000, Math.min(22000, budget || 20000)))
    })) : [];
  }
  const custom = customProviders().find(c => c.id === want);
  if (custom) {
    return [{
      name: custom.id,
      enabled: () => true,
      run: messages => openAiChat({ url: custom.url, key: custom.key, model: custom.model, messages })
    }];
  }
  return PROVIDERS.filter(p => p.name === want);
}

async function askMaster(messages, budgetMs, kind, want, ctx) {
  const tried = [];
  const deadline = Date.now() + (budgetMs || 24000);
  for (const p of providerList(want, ctx)) {
    if (!p.enabled(ctx)) continue;
    if (Date.now() > deadline) { tried.push({ provider: p.name, ok: false, reason: 'budget' }); continue; }
    try {
      const text = await p.run(messages, budgetMs, kind, ctx);
      if (isJunk(text)) { tried.push({ provider: p.name, ok: false, reason: 'junk' }); continue; }
      // канал может уточнить своё имя после ответа — например, добавить модель,
      // которая реально сработала: игроку и логам это полезно видеть
      const label = typeof p.label === 'function' ? p.label() : p.name;
      return { ok: true, text, provider: label || p.name, tried };
    } catch (err) {
      tried.push({ provider: p.name, ok: false, reason: String(err && err.message || err) });
    }
  }
  return { ok: false, provider: null, tried };
}

/* ---------------------------------------------------------- */
/* Озвучка                                                    */
/* ---------------------------------------------------------- */
/**
 * Облачные сейвы: короткий код вместо файла. Хранится рядом с сервером (data/),
 * чтобы «продолжить на другом телефоне» работало без настройки базы. Диск на
 * бесплатных хостингах эфемерный — поэтому рядом всегда есть файл-экспорт.
 */
const CLOUD_DIR = path.join(ROOT, 'data');
const CLOUD_FILE = path.join(CLOUD_DIR, 'cloud-saves.json');
const CLOUD_TTL_MS = Number(process.env.CLOUD_TTL_MS || 30 * 24 * 60 * 60 * 1000);   // 30 дней
const CLOUD_MAX = Number(process.env.CLOUD_MAX || 500);
const CLOUD_ALPHABET = 'ACDEFGHJKLMNPQRTUVWXYZ2346789';      // без похожих букв и цифр

function cloudLoad() {
  try { return JSON.parse(fs.readFileSync(CLOUD_FILE, 'utf8')) || {}; } catch (e) { return {}; }
}
function cloudSaveAll(all) {
  const now = Date.now();
  const entries = Object.entries(all)
    .filter(([, v]) => v && (now - (v.at || 0)) < CLOUD_TTL_MS)
    .sort((a, b) => (b[1].at || 0) - (a[1].at || 0))
    .slice(0, CLOUD_MAX);
  const fresh = {};
  entries.forEach(([k, v]) => { fresh[k] = v; });
  try {
    fs.mkdirSync(CLOUD_DIR, { recursive: true });
    fs.writeFileSync(CLOUD_FILE, JSON.stringify(fresh));
  } catch (e) { /* диск может быть только для чтения — тогда сейвы живут до перезапуска */ }
  CLOUD_MEM = fresh;
}
let CLOUD_MEM = null;
function cloudAll() { if (!CLOUD_MEM) CLOUD_MEM = cloudLoad(); return CLOUD_MEM; }
function cloudCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CLOUD_ALPHABET[Math.floor(Math.random() * CLOUD_ALPHABET.length)];
  return code;
}
function cloudPut(code, data, settings, meta) {
  const all = cloudAll();
  let key = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  if (key && !all[key]) key = '';                 // чужой код не перезаписываем: только свой
  if (!key) { do { key = cloudCode(); } while (all[key]); }
  all[key] = { at: Date.now(), data, settings: settings || null, meta: meta || null, v: (all[key] && all[key].v || 0) + 1 };
  cloudSaveAll(all);
  return key;
}
function cloudGet(code) {
  const all = cloudAll();
  const hit = all[String(code || '').toUpperCase()];
  if (!hit) return null;
  if (Date.now() - (hit.at || 0) > CLOUD_TTL_MS) { delete all[code.toUpperCase()]; cloudSaveAll(all); return null; }
  return hit;
}

const TTS_CACHE = new Map();           // text+voice → {body, ts}
const TTS_CACHE_TTL = 1000 * 60 * 30;
const TTS_CACHE_MAX = 60;

/** Нейросетевой синтез речи (Fish Audio S2.1 Pro через шлюз). */
/**
 * Нейронные голоса Microsoft Edge — без ключа и без регистрации. Качество заметно
 * выше «переводчика»: живая интонация, а главное — управляемый тон: prosody
 * (rate/pitch) даёт разную подачу для мрачной сцены, бодрой победы или шёпота.
 * Токен Sec-MS-GEC меняется каждые 5 минут: SHA256 от «тиков» Windows и токена клиента.
 */
const EDGE_TTS_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const EDGE_TTS_VERSION = process.env.EDGE_TTS_VERSION || '1-143.0.3650.75';
const EDGE_TTS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  'Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';
/*
   Русских голосов у Microsoft два (Svetlana и Dmitry), но мультиязычные голоса
   из новой линейки читают по-русски не хуже, а звучат живее: у них больше
   естественных интонаций. Даём четыре варианта — игрок выбирает на слух.
*/
const EDGE_TTS_VOICES = {
  female: 'ru-RU-SvetlanaNeural',
  male: 'ru-RU-DmitryNeural',
  ava: 'en-US-AvaMultilingualNeural',
  andrew: 'en-US-AndrewMultilingualNeural',
  emma: 'en-US-EmmaMultilingualNeural'
};
function edgeSecMsGec() {
  const WIN_EPOCH = 11644473600;                        // секунды между 1601-01-01 и 1970-01-01
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;                                 // Microsoft ждёт шаг в 5 минут
  const str = String(BigInt(ticks) * 10000000n);        // 100-нс интервалы (BigInt: 1.7e19 не влезает в double)
  return crypto.createHash('sha256').update(str + EDGE_TTS_TOKEN).digest('hex').toUpperCase();
}
function edgeSocket() {
  try { return require('ws'); } catch (e) { /* на Node 22+ WebSocket есть из коробки */ }
  return typeof WebSocket !== 'undefined' ? WebSocket : null;
}
function edgeSpeech(text, opts) {
  const o = opts || {};
  const WS = edgeSocket();
  if (!WS) return Promise.reject(new Error('нет websocket-клиента'));
  const voice = o.voice || EDGE_TTS_VOICES.female;
  const signed = v => (v >= 0 ? '+' : '') + v;
  const rate = signed(typeof o.rate === 'number' ? o.rate : 0) + '%';
  const pitch = signed(typeof o.pitch === 'number' ? o.pitch : 0) + 'Hz';
  const rid = () => crypto.randomUUID().replace(/-/g, '');
  const url = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
    '?TrustedClientToken=' + EDGE_TTS_TOKEN + '&ConnectionId=' + rid() +
    '&Sec-MS-GEC=' + edgeSecMsGec() + '&Sec-MS-GEC-Version=' + EDGE_TTS_VERSION;
  const started = Date.now();
  return new Promise((resolve, reject) => {
    let ws;
    try {
      ws = new WS(url, { headers: {
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': EDGE_TTS_UA,
        'Accept-Language': 'ru-RU,ru;q=0.9,en;q=0.8',
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Sec-WebSocket-Version': '13'
      } });
    } catch (err) { return reject(err); }
    const chunks = [];
    const timer = setTimeout(() => { try { ws.terminate(); } catch (e) { /* noop */ } reject(new Error('таймаут 25с')); }, 25000);
    const esc = t => String(t).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    ws.on('open', () => {
      const ts = new Date().toISOString();
      ws.send('X-Timestamp:' + ts + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
        JSON.stringify({ context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
          outputFormat: o.format || 'audio-24khz-96kbitrate-mono-mp3' } } } }));
      const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'>" +
        "<voice name='" + voice + "'><prosody rate='" + rate + "' pitch='" + pitch + "'>" + esc(text) +
        "</prosody></voice></speak>";
      ws.send('X-RequestId:' + rid() + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + ts +
        '\r\nPath:ssml\r\n\r\n' + ssml);
    });
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        const line = String(data);
        if (line.includes('Path:turn.end')) {
          clearTimeout(timer);
          try { ws.close(); } catch (e) { /* noop */ }
          const body = Buffer.concat(chunks);
          return body.length >= 512 ? resolve({ body, source: 'edge:' + voice, ms: Date.now() - started })
            : reject(new Error('пустая озвучка Edge'));
        }
        if (/event: error|"error"/.test(line) && /Path:response/.test(line)) {
          clearTimeout(timer);
          try { ws.terminate(); } catch (e) { /* noop */ }
          reject(new Error('Edge TTS: ' + line.replace(/\s+/g, ' ').slice(0, 120)));
        }
        return;
      }
      const buf = Buffer.from(data);
      const len = buf.readUInt16BE(0);
      if (/Path:\s*audio/.test(buf.slice(2, 2 + len).toString())) chunks.push(buf.slice(2 + len));
    });
    ws.on('error', err => { clearTimeout(timer); reject(err); });
    ws.on('close', code => { clearTimeout(timer); if (!chunks.length) reject(new Error('Edge TTS закрыт (' + code + ')')); });
  });
}

/** Подача голоса по тону истории и по тому, что случилось в этот ход. */
const VOICE_MOODS = {
  book:    { rate: -2, pitch: 0,  note: 'ровно, как чтец' },
  dark:    { rate: -8, pitch: -6, note: 'глухо и медленно' },
  heroic:  { rate: 7,  pitch: 4,  note: 'с подъёмом' },
  ironic:  { rate: 6,  pitch: 3,  note: 'с усмешкой' },
  soft:    { rate: -6, pitch: 2,  note: 'мягко' },
  hard:    { rate: 2,  pitch: -3, note: 'жёстко, без нежностей' },
  hurt:    { rate: -7, pitch: -8, note: 'сбитое дыхание' },
  triumph: { rate: 6,  pitch: 6,  note: 'победа' },
  dread:   { rate: -12, pitch: -9, note: 'страшно, почти шёпотом' },
  tense:   { rate: 4,  pitch: 2,  note: 'напряжение' }
};
function voiceMood(text) {
  const raw = String(text || 'book').split('+').map(x => x.trim().toLowerCase()).filter(Boolean);
  let rate = 0, pitch = 0;
  const used = [];
  raw.forEach(name => {
    const m = VOICE_MOODS[name];
    if (!m) return;
    rate += m.rate; pitch += m.pitch; used.push(name);
  });
  if (!used.length) return { rate: 0, pitch: 0, mood: 'book' };
  return {
    rate: Math.max(-40, Math.min(40, Math.round(rate / used.length * 1.6))),
    pitch: Math.max(-25, Math.min(25, Math.round(pitch / used.length * 1.5))),
    mood: used.join('+')
  };
}

async function synthesize(text, voice, mood, gender) {
  const m = voiceMood(mood);
  const key = [voice || GEN_TTS_VOICE, m.mood, m.rate, m.pitch, gender || 'f', text].join('|');
  const hit = TTS_CACHE.get(key);
  if (hit && Date.now() - hit.ts < TTS_CACHE_TTL) return { body: hit.body, cached: true, source: hit.source || 'cache' };
  if (!genReady()) {
    // ключ шлюза отдыхает: сначала нейронные голоса Edge, потом «переводчик»
    try {
      const voiceName = EDGE_TTS_VOICES[gender] || (gender === 'm' ? EDGE_TTS_VOICES.male : EDGE_TTS_VOICES.female);
      const r = await edgeSpeech(text, { voice: voiceName, rate: m.rate, pitch: m.pitch });
      TTS_CACHE.set(key, { body: r.body, ts: Date.now(), source: r.source });
      return { body: r.body, cached: false, source: r.source };
    } catch (err) {
      console.log('[tts] Edge не вышло:', String(err && err.message || err).slice(0, 120));
      return googleSpeech(text, key);
    }
  }
  const res = await fetchWithTimeout(GEN_BASE + '/v1/audio/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + GEN_KEY_ACTIVE },
    body: JSON.stringify({
      model: GEN_TTS_MODEL,
      input: text,
      voice: voice || GEN_TTS_VOICE,
      response_format: 'mp3'
    })
  }, 45000);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 120); } catch (e) { /* noop */ }
    throw new Error('HTTP ' + res.status + (detail ? ' ' + detail : ''));
  }
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.length) throw new Error('пустая озвучка');
  TTS_CACHE.set(key, { body, ts: Date.now() });
  if (TTS_CACHE.size > TTS_CACHE_MAX) {
    const oldest = Array.from(TTS_CACHE.keys()).sort((a, b) => TTS_CACHE.get(a).ts - TTS_CACHE.get(b).ts);
    oldest.slice(0, TTS_CACHE.size - TTS_CACHE_MAX).forEach(k => TTS_CACHE.delete(k));
  }
  return { body, cached: false };
}

/**
 * Резервный голос без ключа: Google Translate TTS, один спокойный женский голос.
 * Звучит ровнее, чем голос устройства, и отвечает за десятые доли секунды.
 */
async function googleSpeech(text, cacheKey) {
  const chunk = String(text).replace(/\s+/g, ' ').trim().slice(0, 200);
  const url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ru&q=' + encodeURIComponent(chunk);
  const res = await fetchWithTimeout(url, {
    headers: { referer: 'https://translate.google.com/', 'user-agent': 'Mozilla/5.0' }
  }, 15000);
  if (!res.ok) throw new Error('резервная озвучка: HTTP ' + res.status);
  const body = Buffer.from(await res.arrayBuffer());
  if (!body.length) throw new Error('резервная озвучка пуста');
  if (cacheKey) {
    TTS_CACHE.set(cacheKey, { body, ts: Date.now(), source: 'google:резерв' });
    if (TTS_CACHE.size > TTS_CACHE_MAX) {
      const oldest = Array.from(TTS_CACHE.keys()).sort((a, b) => TTS_CACHE.get(a).ts - TTS_CACHE.get(b).ts);
      oldest.slice(0, TTS_CACHE.size - TTS_CACHE_MAX).forEach(k => TTS_CACHE.delete(k));
    }
  }
  return { body, cached: false, fallback: true, source: 'google:резерв' };
}

/* ---------------------------------------------------------- */
/* Картинки                                                   */
/* ---------------------------------------------------------- */
const IMAGE_CACHE = new Map(); // url → {type, body, ts}
const IMAGE_CACHE_TTL = 1000 * 60 * 60;
/** Сколько всего ждём кадр: дальше игра показывает локальный фон и идёт дальше. */
const IMAGE_DEADLINE_MS = Number(process.env.IMAGE_DEADLINE_MS || 16000);

/**
 * Список генераторов картинок для настроек: игрок выбирает, чем рисовать.
 * Старый sana — самый быстрый (2–3 с), открытые Space'ы с FLUX — качественнее,
 * «локальный фон» — мгновенно и без сети.
 */
function imageCandidateNames() {
  return HF_SPACES.map(x => x.name);
}
function imageChoices() {
  const out = [
    { id: 'auto', title: 'Авто (быстро)', hint: 'гонка генераторов, побеждает первый', available: true, detail: imageCandidateNames().join(', ') },
    { id: 'sana', title: 'Старый sana', hint: 'самый быстрый: 2–3 секунды', available: true, detail: 'image.pollinations.ai' }
  ];
  HF_SPACES.forEach(space => {
    out.push({ id: space.name, title: space.name.replace(/^hf:/, '') + ' (HF)', hint: 'открытый Space, качество выше', available: true, detail: space.base.replace('https://', '').split('.')[0] });
  });
  out.push({ id: 'local', title: 'Только локальный фон', hint: 'мгновенно, без сети — рисует сама игра', available: true, detail: 'процедурный фон по тексту' });
  return out;
}

/**
 * Бывает, что разом отказывают все безключевые генераторы: у Space'ов кончается
 * анонимная квота, старый генератор перестаёт отвечать. Тогда каждый кадр — это
 * шестнадцать секунд ожидания впустую. Считаем отказы подряд и объявляем тишину:
 * фон игрок получает локально, сразу, а генераторы пробуем позже.
 */
const IMAGE_REST_MS = Number(process.env.IMAGE_REST_MS || 10 * 60 * 1000);
const IMAGE_REST_AFTER = Number(process.env.IMAGE_REST_AFTER || 2);   // игрок не должен ждать впустую три раза подряд
let IMAGE_FAIL_STREAK = 0;
let IMAGE_RESTING_UNTIL = 0;
function imageResting() { return Date.now() < IMAGE_RESTING_UNTIL; }
function imageRestLeft() { return Math.max(0, IMAGE_RESTING_UNTIL - Date.now()); }
function imageRestTick(ok) {
  if (ok) { IMAGE_FAIL_STREAK = 0; IMAGE_RESTING_UNTIL = 0; return; }
  IMAGE_FAIL_STREAK++;
  if (IMAGE_FAIL_STREAK >= IMAGE_REST_AFTER && !imageResting()) {
    IMAGE_RESTING_UNTIL = Date.now() + IMAGE_REST_MS;
    console.log('[image] генераторы молчат ' + IMAGE_FAIL_STREAK + ' кадра подряд — пауза ' +
      Math.round(IMAGE_REST_MS / 60000) + ' мин, фон рисуем локально');
  }
}

/**
 * Кандидаты на картинку. Первые два запускаются параллельно (гонка),
 * запасной фон идёт последним и срабатывает почти всегда.
 */
/**
 * Генераторы картинок. Случайные стоковые фото убраны: они не совпадают
 * со сценой, а игрок ждёт именно свой кадр. Пока генератор думает, игра
 * показывает процедурный фон по тексту сцены — он всегда в тему.
 */
function imageCandidates(prompt, seed, w, h, want, hfToken) {
  const q = encodeURIComponent(prompt);
  const race = [];
  // Модели шлюза: у каждой свой upstream, поэтому запускаем их гонкой —
  // кто ответит первым, тот и показываем. Таймаут короткий: кадр не должен
  // держать игрока, пока генератор «думает».
  if (genReady()) {
    const safeW = Math.max(256, Math.round(w / 8) * 8);
    const safeH = Math.max(256, Math.round(h / 8) * 8);
    genImageOrder().forEach(model => {
      race.push({
        name: 'gen:' + String(model).replace(/^community\//, '').replace('NamanSoni78/', 'n/').replace('tongyi-mai/', 't/'),
        model,
        ms: 22000,
        headers: { 'Authorization': 'Bearer ' + GEN_KEY_ACTIVE, 'Accept': 'image/*' },
        url: GEN_BASE + '/image/' + q + '?model=' + encodeURIComponent(model) +
          '&width=' + safeW + '&height=' + safeH + '&seed=' + seed
      });
    });
  }
  // Безключевые Space'ы: ключ им не нужен, поэтому они спасают, когда баланс
  // шлюза кончился. Рисуют ~5–9 секунд и без водяного знака.
  HF_SPACES.forEach(space => {
    race.push({
      name: space.name,
      ms: space.ms,
      run: () => fetchGradioSpace(space, prompt, seed, w, h, hfToken)
    });
  });
  // Старый генератор (sana) — быстрый (2–3 с), но с водяным знаком и общим лимитом на IP.
  const legacy = (name, token) => ({
    name, ms: 18000,
    url: 'https://image.pollinations.ai/prompt/' + q + '?width=' + w + '&height=' + h +
      '&model=sana&nologo=true&seed=' + seed + (token ? '&token=' + encodeURIComponent(token) : '')
  });
  // Когда ключ отдыхает, быстрый безключевой генератор должен идти первым:
  // порядок «сначала лучший, потом запасной» рассчитан на живой ключ.
  if (!genReady()) race.unshift(legacy('pollinations-anon', null));
  else race.push(legacy('pollinations-anon', null));
  // Выбор игрока: оставляем только его генератор (или ставим выбранный первым).
  if (want && want !== 'auto') {
    const named = race.filter(c => c.name === want);
    if (named.length) return { race: named, fallback: [] };
    if (want === 'sana') {
      const sana = race.filter(c => /pollinations-anon|pollinations-key/.test(c.name));
      if (sana.length) return { race: sana, fallback: [] };
    }
    if (want === 'local') return { race: [], fallback: [] };   // игрок попросил рисовать локально
  }
  return { race: race, fallback: [] };
}

/* ---------------------------------------------------------- */
/* Картинки без ключа: открытые Space'ы на Hugging Face        */
/* ---------------------------------------------------------- */
/**
 * У каждого Space своя бесплатная квота, поэтому их несколько: если один
 * занят чужими запросами, кадр возьмёт следующий. Ключ им не нужен.
 */
const HF_SPACES = [
  {
    name: 'hf:flux-merged',
    base: 'https://multimodalart-flux-1-merged.hf.space/gradio_api',
    build: (prompt, seed, w, h) => [prompt, seed, false, w, h, 3.5, 4]
  },
  {
    // Бывший тут FLUX.1-schnell отдаёт 404 изнутри Space — кадр не выйдет никогда,
    // поэтому вместо него FLUX.1-dev (тот же интерфейс, модель живая).
    name: 'hf:flux-1-dev',
    base: 'https://black-forest-labs-flux-1-dev.hf.space/gradio_api',
    build: (prompt, seed, w, h) => [prompt, seed, false, w, h, 3.5, 4]
  },
  {
    name: 'hf:sd-3.5-large',
    base: 'https://stabilityai-stable-diffusion-3-5-large.hf.space/gradio_api',
    build: (prompt, seed, w, h) => [prompt, 'blurry, text, watermark', seed, false,
      Math.max(512, w), Math.max(512, h), 4.5, 12]
  }
].map(x => Object.assign(x, { ms: 45000 },
  // адрес Space'ов можно подменить целиком: так их проверяет тест без сети
  process.env.HF_SPACES_BASE ? { base: process.env.HF_SPACES_BASE.replace(/\/$/, '') } : {}));

/** Анонимный вызов Space: create → опрос события → скачивание картинки. */
async function fetchGradioSpace(space, prompt, seed, w, h, token) {
  // Ключ HF здесь по делу: у открытых Space'ов есть анонимная квота, и по имени
  // они отвечают охотнее, чем без него. Токен не обязателен — без него тоже работает.
  const auth = token ? { 'Authorization': 'Bearer ' + token } : {};
  try {
    const start = await fetchWithTimeout(space.base + '/call/infer', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, auth),
      body: JSON.stringify({ data: space.build(String(prompt).replace(/\s+/g, ' ').slice(0, 380), seed, w, h) })
    }, 20000);
    if (!start.ok) return null;
    const id = (await start.json().catch(() => ({}))).event_id;
    if (!id) return null;
    const deadline = Date.now() + (space.ms || 45000) - 8000;
    while (Date.now() < deadline) {
      const step = await fetchWithTimeout(space.base + '/call/infer/' + id, { headers: auth }, 12000);
      const text = await step.text().catch(() => '');
      const url = (text.match(/"(https?:\/\/[^"]+?\.(?:webp|png|jpe?g)[^"]*)"/) || [])[1];
      if (url) {
        const img = await fetchWithTimeout(url, { redirect: 'follow' }, 20000);
        if (!img.ok) return null;
        const type = img.headers.get('content-type') || 'image/webp';
        const body = Buffer.from(await img.arrayBuffer());
        if (type.indexOf('image/') !== 0 || body.length < 512) return null;
        return { type, body, source: space.name };
      }
      if (/event: error/.test(text)) return null;   // квота Space кончилась — пробуем следующий
      await sleep(900);
    }
    return null;
  } catch (err) { return null; }
}

/** Одна попытка скачать картинку. Возвращает {type, body} или null. */
async function fetchImage(cand) {
  try {
    // Кандидат со своим способом отрисовки (открытый Space с FLUX) — свой вызов.
    if (typeof cand.run === 'function') return await cand.run();
    // Старый генератор живёт на image.pollinations.ai с лимитом «один запрос в работе»
    // — его запросы идут через очередь. Модели нового шлюза считают лимиты сами,
    // поэтому их запускаем напрямую: иначе гонка превращается в «по очереди».
    const legacy = /image\.pollinations\.ai/.test(cand.url);
    const call = () => fetchWithTimeout(cand.url,
      { redirect: 'follow', headers: cand.headers || undefined }, cand.ms);
    const r = legacy ? await queuePollinations('image', call) : await call();
    if (!r.ok) {
      // «Нет баланса» у моделей шлюза — повод отдохнуть ключу, а не биться в него каждый кадр
      if (cand.model && (r.status === 402 || r.status === 401)) {
        let detail = '';
        try { detail = await r.text(); } catch (e) { /* noop */ }
        if (r.status === 402 || looksLikeNoBalance(detail)) genKeyRest('картинки: HTTP ' + r.status);
      }
      return null;
    }
    const type = r.headers.get('content-type') || '';
    if (type.indexOf('image/') !== 0) return null;
    const body = Buffer.from(await r.arrayBuffer());
    if (body.length < 512) return null;
    return { type, body, source: cand.name };
  } catch (err) {
    return null;
  }
}

/** Параллельная гонка: побеждает первый, кто отдал валидную картинку. */
/**
 * Гонка генераторов с подстраховкой. Держать три запроса разом накладно: у шлюза
 * лимит на пользователя, и часть моделей отвечает отказом. Поэтому вторая модель
 * стартует, только если первая молчит пару секунд, третья — если молчат обе.
 */
function raceImage(candidates, hedgeMs) {
  const hedge = Number(hedgeMs || 0);
  if (!candidates || !candidates.length) return Promise.resolve(null);
  if (hedge > 0) {
    return new Promise(resolve => {
      let done = false;
      let started = 0;
      let finished = 0;
      const results = [];
      const launch = () => {
        if (done || started >= candidates.length) return;
        const cand = candidates[started++];
        fetchImage(cand).then(hit => {
          finished++;
          if (cand.onSettle) cand.onSettle(!!hit, 0);
          if (!hit && cand.model) genImageNoteFailure(cand.model);
          if (done) return;
          if (hit) { done = true; resolve(hit); return; }
          if (finished === candidates.length) resolve(null);
          else launch();
        });
        // если ответа нет — запускаем следующую модель, не дожидаясь таймаута
        setTimeout(() => { if (!done && started === finished + 1) launch(); }, hedge);
      };
      launch();
    });
  }
  return new Promise(resolve => {
    let done = false;
    let left = candidates.length;
    candidates.forEach(cand => {
      const c0 = Date.now();
      fetchImage(cand).then(hit => {
        if (cand.onSettle) cand.onSettle(!!hit, Date.now() - c0);
        if (!hit && cand.model) genImageNoteFailure(cand.model);
        left--;
        if (done) return;
        if (hit) { done = true; resolve(hit); }
        else if (left === 0) resolve(null);
      });
    });
  });
}

async function proxyImage(res, prompt, seed, w, h, source, hfToken) {
  const report = [];
  const key = prompt + '|' + seed + '|' + w + 'x' + h;
  const hit = IMAGE_CACHE.get(key);
  if (hit && Date.now() - hit.ts < IMAGE_CACHE_TTL) {
    res.writeHead(200, { 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'hit' });
    res.end(hit.body);
    return;
  }
  if (source === 'local') {
    // Игрок выбрал «только локальный фон»: не тратим ни секунды на сеть
    res.writeHead(204, { 'X-Image-Source': 'local', 'Access-Control-Allow-Origin': '*' });
    return res.end();
  }
  if (imageResting() && (!source || source === 'auto')) {
    // Все каналы только что отказывали: не держим игрока, он рисует фон локально
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Image-Rest': String(Math.round(imageRestLeft() / 1000))
    });
    res.end(JSON.stringify({ ok: false, error: 'image generators resting', retryInMs: imageRestLeft() }));
    return;
  }

  // Ключ HF: свой у игрока, иначе вшитый — Space'ы отвечают по имени охотнее
  const spaceToken = cleanHfKey(hfToken) || HF_BASE_KEY;
  const { race, fallback } = imageCandidates(prompt, seed, w, h, source, spaceToken);
  const started = Date.now();
  const track = list => list.map(c => Object.assign({}, c, {
    ms: c.ms,
    onSettle: (ok, ms) => report.push(c.name + (ok ? '=' : '×') + ms)
  }));
  // Кандидаты идут по очереди с подстраховкой: следующий стартует, если
  // предыдущий молчит 2,5 с. Запасной канал не дёргаем параллельно — он нужен
  // только тогда, когда основные молчат.
  // Игрок не должен ждать генератор дольше пары десятков секунд: за это время
  // сцена уже дочитана, и честнее показать нарисованный локально фон.
  const work = (async () => {
    let w = await raceImage(track(race), 2500);
    if (!w && fallback.length) w = await raceImage(track(fallback), 2500);
    if (!w) {
      // Генераторы промолчали: у каналов лимиты, поэтому пауза и вторая попытка
      // только теми моделями, что не отказывали только что.
      await sleep(1200);
      const ready = race.filter(c => !c.model || genImageCooled(c.model));
      w = await raceImage(track(ready.length ? ready : race), 2500);
    }
    if (!w && fallback.length) w = await raceImage(track(fallback));
    return w;
  })();
  const winner = await Promise.race([work, sleep(IMAGE_DEADLINE_MS).then(() => null)]);

  if (!winner) {
    // Генераторы рисуют медленно (30–45 с): игрок ждать не должен. Но бросать
    // работу бессмысленно — досчитываем кадр в фоне и кладём в кэш, чтобы
    // следующее возвращение в это место получило картинку мгновенно.
    work.then(late => {
      if (!late) return;
      IMAGE_CACHE.set(key, { type: late.type, body: late.body, ts: Date.now() });
      if (IMAGE_CACHE.size > 120) IMAGE_CACHE.delete(IMAGE_CACHE.keys().next().value);
      console.log('[image] поздний кадр в кэш за ' + Math.round((Date.now() - started) / 1000) + ' с:', prompt.slice(0, 48));
    }).catch(() => {});
    imageRestTick(false);
    console.log('[image] не успели за отведённое время:', prompt.slice(0, 60), '|', report.join(', '),
      imageResting() ? '| пауза' : '');
    res.writeHead(202, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Image-Pending': '1',
      'X-Image-Report': report.join(', ').slice(0, 300)
    });
    return res.end(JSON.stringify({
      ok: false, pending: true, error: 'generators are slow', deadlineMs: IMAGE_DEADLINE_MS,
      retryInMs: Math.max(12000, Math.round(IMAGE_DEADLINE_MS / 2))
    }));
  }
  imageRestTick(true);

  IMAGE_CACHE.set(key, { type: winner.type, body: winner.body, ts: Date.now() });
  if (IMAGE_CACHE.size > 120) {
    const oldest = IMAGE_CACHE.keys().next().value;
    IMAGE_CACHE.delete(oldest);
  }
  res.writeHead(200, {
    'Content-Type': winner.type,
    'Cache-Control': 'public, max-age=3600',
    'X-Cache': 'miss',
    'X-Image-Source': winner.source + (winner.late ? '-late' : ''),
    'X-Image-Ms': String(Date.now() - started),
    'X-Image-Report': report.join(', ').slice(0, 300)
  });
  res.end(winner.body);
}

/* ---------------------------------------------------------- */
/* Роутер                                                     */
/* ---------------------------------------------------------- */
const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    // обрыв соединения клиентом — не ошибка сервера
    if (!res.headersSent && !res.writableEnded) {
      try { sendJson(res, 500, { ok: false, error: String(err && err.message || err) }); } catch (e) { /* noop */ }
    }
  }
});

// если клиент ушёл — молча закрываем ответ
process.on('uncaughtException', err => {
  console.error('[uncaught]', String(err && err.message || err));
});

async function handleRequest(req, res) {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: 'bad url' });
  }
  const pathname = decodeURIComponent(url.pathname);

  /* --- API --- */
  if (pathname === '/api/health') {
    return sendJson(res, 200, {
      ok: true,
      version: VERSION,
      textProviders: textProvidersSummary(),
      hasKeyedProvider: textProvidersSummary().some(p => p !== 'pollinations-anon'),
      mistral: {
        agent: MISTRAL_AGENT_ID ? MISTRAL_AGENT_ID.slice(0, 12) + '…' : null,
        models: MISTRAL_MODEL_CHAIN,
        lastModel: MISTRAL_LAST_MODEL.name || null,
        key: MISTRAL_ENV_KEY ? 'окружение' : (MISTRAL_BUILTIN_KEY ? 'вшит' : 'нет'),
        base: MISTRAL_BASE
      },
      glm: {
        models: GLM_MODEL_CHAIN,
        lastModel: GLM_LAST_MODEL.name || null,
        key: GLM_ENV_KEY ? 'окружение' : (GLM_BUILTIN_KEY ? 'вшит' : 'нет'),
        base: GLM_BASE,
        balance: glmNoBalanceFresh() ? { at: GLM_NO_BALANCE.at, why: GLM_NO_BALANCE.why } : null
      },
      hf: {
        models: HF_MODEL_CHAIN,
        lastModel: HF_LAST_MODEL.name || null,
        key: HF_ENV_KEY ? 'окружение' : (HF_BUILTIN_KEY ? 'вшит' : 'нет'),
        base: HF_BASE,
        credits: hfCreditsFresh() ? { at: HF_CREDITS.at, why: HF_CREDITS.why } : null,
        spaces: HF_SPACES.map(x => x.name)
      },
      genKeyDead: genKeyDeadFresh() ? { at: GEN_KEY_DEAD.at, why: GEN_KEY_DEAD.why } : null,
      imageRestMs: imageRestLeft(),
      masterChoices: masterChoices(),
      imageChoices: imageChoices(),
      imageSources: imageCandidateNames(),
      ttsProviders: [
        GEN_KEY_ACTIVE ? 'fish(ключ шлюза)' : null,
        edgeReady() ? 'edge:нейронные голоса' : null,
        'google:резерв'
      ].filter(Boolean),
      pollinationsQueue: pollinationsQueueDepth(),
      imageProxy: true
    });
  }

  if (pathname === '/api/gm/stream') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      });
      return res.end();
    }
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'use POST' });
    try {
      const payload = JSON.parse((await readBody(req)) || '{}');
      const kind = typeof payload.kind === 'string' ? payload.kind.slice(0, 16) : '';
      const messages = (Array.isArray(payload.messages) ? payload.messages : [])
        .filter(m => m && typeof m.content === 'string' && (m.role === 'system' || m.role === 'user'))
        .map(m => ({ role: m.role, content: m.content.slice(0, 6000) })).slice(-8);
      if (!messages.length) return sendJson(res, 400, { ok: false, error: 'messages required' });
      const budget = Math.max(6000, Math.min(34000, Number(payload.budgetMs) || 26000));
      const want = typeof payload.provider === 'string' ? payload.provider.slice(0, 24) : '';
      const cacheKey = gmCacheKey(messages) + '|' + (want || 'auto');   // бюджет в ключ не входит: тот же вопрос — тот же ответ

      res.writeHead(200, {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*'
      });
      const send = obj => { if (!res.writableEnded) res.write(JSON.stringify(obj) + '\n'); };
      const finish = (text, provider, extra) => {
        if (text) gmCacheSet(cacheKey, text, provider);
        send(Object.assign({ done: true, provider, length: (text || '').length }, extra || {}));
        res.end();
      };

      const cached = gmCacheGet(cacheKey);
      if (cached) {
        send({ delta: cached.text, cached: true });
        return finish(cached.text, cached.provider, { cached: true });
      }

      const allow = name => !want || want === 'auto' || want === name;
      // 1) Шлюз: умная модель и живой поток. Именно он ведёт игру.
      let sentAny = false;
      if (genReady() && allow('gen')) {
        try {
          const r = await genChatRotating(messages, {
            kind,
            budgetMs: Math.min(budget, 32000),
            maxTokens: TEXT_MAX_TOKENS,
            stream: true,
            onDelta: piece => { sentAny = true; send({ delta: piece }); }
          });
          if (r.text) {
            send({ model: r.model });
            return finish(r.text, 'gen:' + r.model.split('/').pop());
          }
        } catch (err) {
          const reason = String(err && err.message || err).slice(0, 140);
          send({ note: 'gen-stream-failed', reason });
          if (sentAny) {
            // часть текста уже у игрока: обрывать нельзя — отдаём что есть,
            // а мастер сцены дособерёт остальное
            return finish('', 'gen-partial', { partial: true });
          }
        }
      }

      // 1.5) Mistral: агент — ведущий мастер игры. Умная модель, своя квота, поток.
      const streamMistralKey = mistralKeyFor(payload);
      const streamAgentId = mistralAgentFor(payload);
      if (streamMistralKey && streamAgentId && allow('mistral-agent')) {
        try {
          const r = await mistralAgentStream(messages, streamMistralKey, streamAgentId,
            piece => { sentAny = true; send({ delta: piece }); },
            Math.min(budget, 30000));
          if (r) return finish(r, 'mistral-agent');
          send({ note: 'mistral-agent-empty' });
        } catch (err) {
          const reason = String(err && err.message || err).slice(0, 140);
          send({ note: 'mistral-agent-failed', reason });
          if (sentAny) return finish('', 'mistral-agent-partial', { partial: true });
        }
      }

      // 1.6) Mistral по моделям: если агент недоступен, идём цепочкой моделей.
      if (streamMistralKey && allow('mistral')) {
        try {
          const model = (MISTRAL_LAST_MODEL.name && Date.now() - MISTRAL_LAST_MODEL.at < 10 * 60 * 1000)
            ? MISTRAL_LAST_MODEL.name : MISTRAL_MODEL_CHAIN[0];
          const r = await mistralStream(messages, streamMistralKey,
            piece => { sentAny = true; send({ delta: piece }); },
            Math.min(budget, 26000), model);
          if (r) {
            MISTRAL_LAST_MODEL.name = model;
            MISTRAL_LAST_MODEL.at = Date.now();
            send({ model });
            return finish(r, 'mistral:' + model);
          }
          send({ note: 'mistral-empty' });
        } catch (err) {
          const reason = String(err && err.message || err).slice(0, 140);
          send({ note: 'mistral-stream-failed', reason });
          if (sentAny) return finish('', 'mistral-partial', { partial: true });
        }
      }

      // 1.7) GLM (Zhipu): бесплатная glm-4.5-flash. Идёт после Mistral —
      // отвечает чуть медленнее, зато ключ вшит и квота своя.
      const streamGlmKey = glmKeyFor(payload);
      if (streamGlmKey && allow('glm')) {
        try {
          const model = (GLM_LAST_MODEL.name && Date.now() - GLM_LAST_MODEL.at < 10 * 60 * 1000)
            ? GLM_LAST_MODEL.name : GLM_MODEL_CHAIN[0];
          const r = await glmStream(messages, streamGlmKey,
            piece => { sentAny = true; send({ delta: piece }); },
            Math.min(budget, 26000), model);
          if (r) {
            GLM_LAST_MODEL.name = model;
            GLM_LAST_MODEL.at = Date.now();
            send({ model });
            return finish(r, 'glm:' + model);
          }
          send({ note: 'glm-empty' });
        } catch (err) {
          const reason = String(err && err.message || err).slice(0, 140);
          send({ note: 'glm-stream-failed', reason });
          if (sentAny) return finish('', 'glm-partial', { partial: true });
        }
      }

      // 1.8) Hugging Face: роутер с сотней моделей. Ключ может быть свой —
      // тогда кредиты игрока, и канал не уступает место.
      const streamHfOwn = cleanHfKey(payload && payload.hfKey);
      const streamHfKey = streamHfOwn || (hfKeyReady({}) ? HF_BASE_KEY : '');
      if (streamHfKey && allow('hf')) {
        try {
          const model = (HF_LAST_MODEL.name && Date.now() - HF_LAST_MODEL.at < 10 * 60 * 1000)
            ? HF_LAST_MODEL.name : HF_MODEL_CHAIN[0];
          const r = await hfStream(messages, streamHfKey,
            piece => { sentAny = true; send({ delta: piece }); },
            Math.min(budget, 26000), model);
          if (r) {
            HF_LAST_MODEL.name = model;
            HF_LAST_MODEL.at = Date.now();
            send({ model });
            return finish(r, 'hf:' + model);
          }
          send({ note: 'hf-empty' });
        } catch (err) {
          const reason = String(err && err.message || err).slice(0, 140);
          send({ note: 'hf-stream-failed', reason });
          if (sentAny) return finish('', 'hf-partial', { partial: true });
        }
      }

      // 2) Старый канал Pollinations — запасной. Поток идёт в очереди текста:
      // бюджет отсчитывается внутри слота, ожидание в очереди время не тратит.
      const streamKeys = want === 'pollinations-anon' ? [null]
        : want === 'pollinations-key' ? (POLLINATIONS_KEY ? [POLLINATIONS_KEY] : [])
        : want ? []                                        // выбран другой канал — Pollinations не трогаем
        : (POLLINATIONS_KEY ? [POLLINATIONS_KEY, null] : [null]);
      let full = '';
      try {
        full = await queuePollinations('text', async () => {
          const started = Date.now();
          const streamBudget = Math.min(budget, 26000);   // одна попытка мастера: 26 с
          const left = () => streamBudget - (Date.now() - started);
          for (const key of streamKeys) {
            if (left() < 6000) break;
            try {
              const text = await withQueueRetry(
                leftMs => pollinationsStreamRaw(messages, key, piece => send({ delta: piece }),
                  Math.max(6000, Math.min(29000, leftMs))),
                Math.max(6000, Math.min(29000, left())));
              if (text) return text;
            } catch (err) {
              send({ note: 'stream-failed', reason: String(err && err.message || err) });
            }
          }
          return '';
        });
        if (full) return finish(full, 'pollinations-stream');
      } catch (err) {
        send({ note: 'stream-failed', reason: String(err && err.message || err) });
      }
      // поток не сложился — обычный путь: результат уйдёт одним куском.
      // Бюджет короткий: клиент не должен ждать дольше пары десятков секунд.
      const result = await askMaster(messages, Math.min(budget, 14000), kind, want);
      if (!result.ok) {
        send({ done: true, ok: false, tried: result.tried });
        return res.end();
      }
      send({ delta: result.text });
      return finish(result.text, result.provider, { fallback: true });
    } catch (err) {
      return sendJson(res, 200, { ok: false, error: String(err && err.message || err) });
    }
  }

  if (pathname === '/api/gm') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      });
      return res.end();
    }
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'use POST' });
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || '{}');
      const kind = typeof payload.kind === 'string' ? payload.kind.slice(0, 16) : '';
      const messages = Array.isArray(payload.messages) ? payload.messages.slice(-8) : [];
      if (!messages.length) return sendJson(res, 400, { ok: false, error: 'messages required' });
      const clean = messages
        .filter(m => m && typeof m.content === 'string' && (m.role === 'system' || m.role === 'user'))
        .map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));
      // клиент может попросить короткий бюджет (запрос героя): тогда быстрее придёт отказ
      const budget = Math.max(6000, Math.min(34000, Number(payload.budgetMs) || 26000));
      const cacheKey = gmCacheKey(clean);
      const cached = gmCacheGet(cacheKey);
      if (cached) {
        return sendJson(res, 200, { ok: true, text: cached.text, provider: cached.provider, cached: true });
      }
      const want = typeof payload.provider === 'string' ? payload.provider.slice(0, 24) : '';
      const result = await askMaster(clean, budget, kind, want,
        { mistralKey: mistralKeyFor(payload), mistralAgent: mistralAgentFor(payload),
          glmKey: glmKeyFor(payload), hfKey: cleanHfKey(payload.hfKey) });
      if (res.writableEnded) return;
      if (!result.ok) {
        console.warn('[gm] все провайдеры не ответили:', JSON.stringify(result.tried));
        return sendJson(res, 200, { ok: false, tried: result.tried });
      }
      gmCacheSet(cacheKey, result.text, result.provider);
      return sendJson(res, 200, { ok: true, text: result.text, provider: result.provider });
    } catch (err) {
      return sendJson(res, 200, { ok: false, error: String(err && err.message || err) });
    }
  }

  /* --- Облачные сейвы по короткому коду --------------------- */
  if (pathname === '/api/save') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      });
      return res.end();
    }
    const q = new URL(req.url, 'http://localhost').searchParams;
    if (req.method === 'GET') {
      const code = String(q.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
      const found = code ? cloudGet(code) : null;
      if (!found) return sendJson(res, 404, { ok: false, error: 'код не найден или срок хранения вышел' });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      return res.end(JSON.stringify({ ok: true, code, savedAt: found.at, data: found.data, settings: found.settings || null }));
    }
    if (req.method !== 'POST') return sendJson(res, 405, { ok: false, error: 'use GET or POST' });
    try {
      const payload = JSON.parse((await readBody(req, 900 * 1024)) || '{}');
      if (!payload || typeof payload !== 'object' || !payload.data) {
        return sendJson(res, 400, { ok: false, error: 'нужны поля code (можно пусто) и data' });
      }
      const size = JSON.stringify(payload.data).length;
      if (size > 800 * 1024) return sendJson(res, 413, { ok: false, error: 'слишком большое сохранение' });
      const code = cloudPut(String(payload.code || ''), payload.data, payload.settings, payload.meta);
      return sendJson(res, 200, { ok: true, code, savedAt: Date.now(), size });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: String(err && err.message || err).slice(0, 160) });
    }
  }

  if (pathname === '/api/tts') {
    const q = new URL(req.url, 'http://localhost').searchParams;
    const text = (q.get('text') || '').replace(/\s+/g, ' ').trim().slice(0, 700);
    if (!text) return sendJson(res, 400, { ok: false, error: 'text required' });
    try {
      const { body, cached, source } = await synthesize(text, q.get('voice') || GEN_TTS_VOICE,
        q.get('mood') || 'book', q.get('gender') || 'f');
      const m = voiceMood(q.get('mood') || 'book');
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': body.length,
        'Cache-Control': 'public, max-age=1800',
        'X-TTS': cached ? 'hit' : 'miss',
        'X-TTS-Voice': q.get('voice') || GEN_TTS_VOICE,
        'X-TTS-Source': String(source || '').slice(0, 60),
        'X-TTS-Mood': m.mood + ' (rate ' + m.rate + ', pitch ' + m.pitch + ')',
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(body);
    } catch (err) {
      return sendJson(res, 502, { ok: false, error: String(err && err.message || err).slice(0, 160) });
    }
  }

  if (pathname === '/api/image') {
    const prompt = (url.searchParams.get('prompt') || 'dark fantasy landscape').slice(0, 400);
    const seed = parseInt(url.searchParams.get('seed') || '1', 10) || 1;
    const w = Math.min(1024, Math.max(128, parseInt(url.searchParams.get('w') || '512', 10) || 512));
    const h = Math.min(1024, Math.max(128, parseInt(url.searchParams.get('h') || '288', 10) || 288));
    const source = (url.searchParams.get('source') || '').slice(0, 24);   // выбор генератора в настройках
    const hfTokenParam = url.searchParams.get('hfKey') || '';
    return proxyImage(res, prompt, seed, w, h, source, hfTokenParam);
  }

  /* --- Статика --- */
  let filePath = pathname === '/' || pathname === '' ? '/index.html' : pathname;
  const abs = path.join(ROOT, path.normalize(filePath).replace(/^([/\\])+/, ''));
  if (!abs.startsWith(ROOT)) return sendJson(res, 403, { ok: false, error: 'forbidden' });

  fs.stat(abs, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Не найдено: ' + filePath);
    }
    return serveStatic(req, res, abs, stat);
  });
}

server.listen(PORT, HOST, () => {
  console.log('Кости и Судьбы v' + VERSION + ' → http://' + HOST + ':' + PORT);
  console.log('Текстовые каналы:', textProvidersSummary().join(', '));
  if (textProvidersSummary().length === 1) {
    console.log('Подсказка: добавьте бесплатный ключ GROQ_API_KEY или GEMINI_API_KEY — ИИ-мастер будет работать стабильно.');
  }
  // Один короткий запрос при старте: сразу видно, живёт ли ключ шлюза и есть ли на нём баланс.
  // Иначе статус «5 моделей» врёт до первого кадра, который упрётся в «нет баланса».
  if (GEN_KEY_ACTIVE) {
    setTimeout(() => {
      genChat([{ role: 'user', content: 'Ответь одним словом: жив?' }], {
        model: GEN_TEXT_MODELS[0], maxTokens: 8, timeoutMs: 12000, temperature: 0
      }).then(() => {
        genWake();
        console.log('[gen] ключ шлюза отвечает');
      }).catch(err => {
        const m = String(err && err.message || err);
        console.log('[gen] ключ шлюза не ответил: ' + m.replace(/\s+/g, ' ').slice(0, 100));
      });
    }, 400);
  }
});
