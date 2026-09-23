/**
 * Кости и Судьбы — мини-сервер для деплоя (Render / Railway / локально).
 *
 * Что делает:
 *   1. Отдаёт статику: index.html, game.html, src/, assets/.
 *   2. POST /api/gm    — прокси к текстовому ИИ (гейм-мастеру).
 *   3. GET  /api/image — прокси к генератору картинок.
 *   4. GET  /api/health — сообщает клиенту, какие каналы доступны.
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

function gmCacheKey(messages, budget) {
  const h = crypto.createHash('sha1');
  h.update(String(budget) + '|');
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
/* Провайдеры текста                                          */
/* ---------------------------------------------------------- */
const JUNK_RE = /(top up|insufficient balance|not enough credit|payment required|valid api key|missing turnstile|unauthorized)/i;

function isJunk(text) {
  if (!text || String(text).length < 25) return true;
  return JUNK_RE.test(String(text));
}

/** Какие каналы есть — клиенту показываем списком. */
function textProvidersSummary() {
  const out = [];
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
    // Оба канала Pollinations запускаем параллельно: какой ответит первым, тот и ведёт игру.
    // Сервис часто отвечает 429/502 — поэтому ещё и повторяем запрос.
    name: 'pollinations',
    enabled: () => true,
    async run(messages, budgetMs) {
      const round = (key, timeout) => pollinationsChat(messages, key, timeout);
      const started = Date.now();
      const budget = Math.max(6000, Math.min(32000, Number(budgetMs) || 32000));
      const left = () => budget - (Date.now() - started);      // сервер отвечает раньше, чем устанет клиент
      // волна 1: ключевой канал, не спеша — большие промпты обрабатываются долго
      try {
        return await round(POLLINATIONS_KEY, Math.min(26000, left()));
      } catch (err) { /* 429/502 — пробуем дальше */ }
      // волна 2: оба канала наперегонки
      if (left() > 4000) {
        try {
          return await firstGood([round(POLLINATIONS_KEY, Math.min(16000, left())), round(null, Math.min(8000, left()))]);
        } catch (err2) { /* лимит частоты: ждём и пробуем ещё */ }
      }
      // волны 3-4: лимит частоты обычно отпускает через несколько секунд
      let lastErr = new Error('HTTP 429');
      for (const wait of [2500, 5000]) {
        if (left() < 6000) break;
        await sleep(wait);
        try {
          return await firstGood([round(POLLINATIONS_KEY, Math.min(12000, left())), round(null, Math.min(7000, left()))]);
        } catch (err3) { lastErr = err3; }
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
async function askMaster(messages, budgetMs) {
  const tried = [];
  const deadline = Date.now() + (budgetMs || 24000);
  for (const p of PROVIDERS) {
    if (!p.enabled()) continue;
    if (Date.now() > deadline) { tried.push({ provider: p.name, ok: false, reason: 'budget' }); continue; }
    try {
      const text = await p.run(messages, budgetMs);
      if (isJunk(text)) { tried.push({ provider: p.name, ok: false, reason: 'junk' }); continue; }
      return { ok: true, text, provider: p.name, tried };
    } catch (err) {
      tried.push({ provider: p.name, ok: false, reason: String(err && err.message || err) });
    }
  }
  return { ok: false, provider: null, tried };
}

/* ---------------------------------------------------------- */
/* Картинки                                                   */
/* ---------------------------------------------------------- */
const IMAGE_CACHE = new Map(); // url → {type, body, ts}
const IMAGE_CACHE_TTL = 1000 * 60 * 60;

/**
 * Кандидаты на картинку. Первые два запускаются параллельно (гонка),
 * запасной фон идёт последним и срабатывает почти всегда.
 */
function imageCandidates(prompt, seed, w, h) {
  const q = encodeURIComponent(prompt);
  const race = [
    { name: 'a0', ms: 11000, url: 'https://api.a0.dev/assets/image?text=' + q + '&aspect=16:9&seed=' + seed }
  ];
  if (POLLINATIONS_KEY) {
    race.push({
      name: 'pollinations', ms: 11000,
      url: 'https://image.pollinations.ai/prompt/' + q + '?width=' + w + '&height=' + h +
        '&model=sana&nologo=true&seed=' + seed + '&token=' + encodeURIComponent(POLLINATIONS_KEY)
    });
  }
  const fallback = [{
    name: 'picsum', ms: 12000,
    url: 'https://picsum.photos/seed/' + encodeURIComponent(prompt.slice(0, 24) + seed) + '/' + (w * 2) + '/' + (h * 2)
  }];
  return { race, fallback };
}

/** Одна попытка скачать картинку. Возвращает {type, body} или null. */
async function fetchImage(cand) {
  try {
    const r = await fetchWithTimeout(cand.url, { redirect: 'follow' }, cand.ms);
    if (!r.ok) return null;
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
function raceImage(candidates) {
  return new Promise(resolve => {
    let done = false;
    let left = candidates.length;
    candidates.forEach(cand => {
      fetchImage(cand).then(hit => {
        left--;
        if (done) return;
        if (hit) { done = true; resolve(hit); }
        else if (left === 0) resolve(null);
      });
    });
  });
}

async function proxyImage(res, prompt, seed, w, h) {
  const key = prompt + '|' + seed + '|' + w + 'x' + h;
  const hit = IMAGE_CACHE.get(key);
  if (hit && Date.now() - hit.ts < IMAGE_CACHE_TTL) {
    res.writeHead(200, { 'Content-Type': hit.type, 'Cache-Control': 'public, max-age=3600', 'X-Cache': 'hit' });
    res.end(hit.body);
    return;
  }

  const { race, fallback } = imageCandidates(prompt, seed, w, h);
  const started = Date.now();
  // сначала гонка основных генераторов, затем запасной фон — он идёт фоном,
  // чтобы не ждать лишние секунды, если генераторы молчат
  const fallbackPromise = raceImage(fallback).then(r => r && Object.assign(r, { late: true }));
  let winner = await raceImage(race);
  if (!winner) winner = await fallbackPromise;
  if (!winner) winner = await raceImage(fallback);

  if (!winner) return sendJson(res, 502, { ok: false, error: 'image providers failed' });

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
    'X-Image-Ms': String(Date.now() - started)
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
      const messages = (Array.isArray(payload.messages) ? payload.messages : [])
        .filter(m => m && typeof m.content === 'string' && (m.role === 'system' || m.role === 'user'))
        .map(m => ({ role: m.role, content: m.content.slice(0, 6000) })).slice(-8);
      if (!messages.length) return sendJson(res, 400, { ok: false, error: 'messages required' });
      const budget = Math.max(6000, Math.min(34000, Number(payload.budgetMs) || 26000));
      const cacheKey = gmCacheKey(messages, budget);

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

      let full = '';
      try {
        full = await pollinationsStream(messages, POLLINATIONS_KEY, piece => {
          full += '';                       // full собирает сам поток
          send({ delta: piece });
        }, Math.min(budget, 30000));
        if (full) return finish(full, 'pollinations-stream');
      } catch (err) {
        send({ note: 'stream-failed', reason: String(err && err.message || err) });
      }
      // поток не сложился — обычный путь: результат уйдёт одним куском
      const result = await askMaster(messages, budget);
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
      const messages = Array.isArray(payload.messages) ? payload.messages.slice(-8) : [];
      if (!messages.length) return sendJson(res, 400, { ok: false, error: 'messages required' });
      const clean = messages
        .filter(m => m && typeof m.content === 'string' && (m.role === 'system' || m.role === 'user'))
        .map(m => ({ role: m.role, content: m.content.slice(0, 6000) }));
      // клиент может попросить короткий бюджет (запрос героя): тогда быстрее придёт отказ
      const budget = Math.max(6000, Math.min(34000, Number(payload.budgetMs) || 26000));
      const cacheKey = gmCacheKey(clean, budget);
      const cached = gmCacheGet(cacheKey);
      if (cached) {
        return sendJson(res, 200, { ok: true, text: cached.text, provider: cached.provider, cached: true });
      }
      const result = await askMaster(clean, budget);
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

  if (pathname === '/api/image') {
    const prompt = (url.searchParams.get('prompt') || 'dark fantasy landscape').slice(0, 400);
    const seed = parseInt(url.searchParams.get('seed') || '1', 10) || 1;
    const w = Math.min(1024, Math.max(128, parseInt(url.searchParams.get('w') || '512', 10) || 512));
    const h = Math.min(1024, Math.max(128, parseInt(url.searchParams.get('h') || '288', 10) || 288));
    return proxyImage(res, prompt, seed, w, h);
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
});
