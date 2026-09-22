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
const path = require('path');

const PORT = process.env.PORT || 3000;
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
  out.push('pollinations-anon');
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
            generationConfig: { temperature: 0.9, maxOutputTokens: 640, responseMimeType: 'application/json' }
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
    name: 'pollinations-key',
    enabled: () => !!POLLINATIONS_KEY,
    async run(messages) {
      return pollinationsChat(messages, POLLINATIONS_KEY);
    }
  },
  {
    name: 'pollinations-anon',
    enabled: () => true,
    // анонимный канал иногда отвечает «нет баланса» — пробуем несколько раз
    async run(messages) {
      let lastErr = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const text = await pollinationsChat(messages, null, 9000);
          if (!isJunk(text)) return text;
          lastErr = new Error('junk response');
        } catch (err) { lastErr = err; }
        await new Promise(r => setTimeout(r, 600));
      }
      throw lastErr || new Error('pollinations failed');
    }
  }
];

async function openAiChat({ url, key, model, messages }) {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, messages, temperature: 0.9, max_tokens: 640 })
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
    body: JSON.stringify({ model: 'openai-fast', messages, temperature: 0.9, max_tokens: 520, private: true })
  }, timeoutMs || 16000);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  const text = data && data.choices && data.choices[0] &&
    (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text);
  if (!text) throw new Error('empty completion');
  return text;
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
      const text = await p.run(messages);
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
      const result = await askMaster(clean, 22000);
      if (res.writableEnded) return;
      if (!result.ok) {
        console.warn('[gm] все провайдеры не ответили:', JSON.stringify(result.tried));
        return sendJson(res, 200, { ok: false, tried: result.tried });
      }
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
    const ext = path.extname(abs).toLowerCase();
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
    headers['Cache-Control'] = (ext === '.jpg' || ext === '.png' || ext === '.webp')
      ? 'public, max-age=86400' : 'no-cache';
    res.writeHead(200, headers);
    res.end(fs.readFileSync(abs));
  });
}

server.listen(PORT, HOST, () => {
  console.log('Кости и Судьбы v' + VERSION + ' → http://' + HOST + ':' + PORT);
  console.log('Текстовые каналы:', textProvidersSummary().join(', '));
  if (textProvidersSummary().length === 1) {
    console.log('Подсказка: добавьте бесплатный ключ GROQ_API_KEY или GEMINI_API_KEY — ИИ-мастер будет работать стабильно.');
  }
});
