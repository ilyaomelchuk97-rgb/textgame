# -*- coding: utf-8 -*-
"""Канал Mistral: бесплатный ключ (план Experiment) как ведущий ИИ игры.

Ключ берётся из окружения (MISTRAL_API_KEY) ИЛИ из настроек игры —
игрок вставляет свой бесплатный ключ, и мастер ведёт игру на нём.
"""
import io, sys

path = '/home/user/server.js'
src = io.open(path, encoding='utf-8').read()
orig = len(src)


def sub_once(tag, old, new):
    global src
    n = src.count(old)
    if n != 1:
        print('ЯКОРЬ (%d): %s' % (n, tag)); sys.exit(1)
    src = src.replace(old, new, 1)


# ---------------------------------------------------------------- 1. блок Mistral
sub_once('блок Mistral',
"""const JUNK_RE = /(top up|insufficient balance|not enough credit|payment required|valid api key|missing turnstile|unauthorized)/i;""",
"""/* ---------------------------------------------------------- */
/* Mistral: бесплатный ключ (план Experiment)                  */
/* ---------------------------------------------------------- */
/**
 * У Mistral есть бесплатный тариф: ключ выдаётся без карты, лимит примерно
 * один запрос в секунду. Модель умная, поэтому канал идёт сразу после шлюза.
 * Ключ можно задать в окружении (MISTRAL_API_KEY) или вставить в настройках
 * игры — тогда он приходит вместе с запросом и никуда не сохраняется на сервере.
 */
const MISTRAL_BASE = (process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1').replace(/\\/$/, '');
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-medium-latest';
const MISTRAL_FALLBACK_MODEL = process.env.MISTRAL_MODEL_FALLBACK || 'mistral-small-latest';
const MISTRAL_ENV_KEY = String(process.env.MISTRAL_API_KEY || '').trim();

/** Ключ из настроек игры: пускаем только похожее на ключ, без пробелов и адресов. */
function cleanMistralKey(value) {
  const key = String(value || '').trim();
  return /^[A-Za-z0-9_\\-]{12,80}$/.test(key) ? key : '';
}

function mistralKeyFor(payload) {
  return cleanMistralKey(payload && payload.mistralKey) || MISTRAL_ENV_KEY;
}

function mistralKeyReady(ctx) {
  return !!((ctx && ctx.mistralKey) || MISTRAL_ENV_KEY);
}

/** Бесплатный тариф любит отвечать 429: одна вежливая пауза и повтор. */
function mistralRetryDelay(status) {
  return status === 429 ? 900 : 0;
}

async function mistralChat(messages, key, timeoutMs, model) {
  const url = MISTRAL_BASE + '/chat/completions';
  const call = () => fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model: model || MISTRAL_MODEL,
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
    throw new Error('mistral HTTP ' + res.status + (body ? ' ' + body.slice(0, 90) : ''));
  }
  const data = await res.json();
  const text = data && data.choices && data.choices[0] && data.choices[0].message &&
    data.choices[0].message.content;
  if (!text) throw new Error('mistral empty completion');
  return text;
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
    const lines = buffer.split('\\n');
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

const JUNK_RE = /(top up|insufficient balance|not enough credit|payment required|valid api key|missing turnstile|unauthorized)/i;""")

# ---------------------------------------------------------------- 2. провайдер в списке
sub_once('провайдер mistral',
"""  {
    // Шлюз gen.pollinations.ai: умные модели (Mistral Large 3, GLM-5.3, Qwen 3.8).
    // Он идёт первым — мастер должен быть толковым, а не «на сдачу».
    name: 'gen',""",
"""  {
    // Mistral с бесплатным ключом: умная модель без квот и без баланса.
    // Идёт сразу после шлюза — если у шлюза кончился баланс, ведёт она.
    name: 'mistral',
    enabled: ctx => mistralKeyReady(ctx),
    async run(messages, budgetMs, kind, ctx) {
      const key = (ctx && ctx.mistralKey) || MISTRAL_ENV_KEY;
      const budget = Math.max(6000, Math.min(26000, budgetMs || 20000));
      try {
        return await mistralChat(messages, key, budget);
      } catch (err) {
        // модель могла быть выключена в этом аккаунте: пробуем младшую
        if (/404|400/.test(String(err && err.message))) {
          return await mistralChat(messages, key, budget, MISTRAL_FALLBACK_MODEL);
        }
        throw err;
      }
    }
  },
  {
    // Шлюз gen.pollinations.ai: умные модели (Mistral Large 3, GLM-5.3, Qwen 3.8).
    // Он идёт первым — мастер должен быть толковым, а не «на сдачу».
    name: 'gen',""")

# ---------------------------------------------------------------- 3. выбор канала
sub_once('providerList ctx',
"""function providerList(want) {
  // Выбор игрока: 'auto' — обычный порядок, иначе только выбранный канал.
  if (!want || want === 'auto') return PROVIDERS;""",
"""function providerList(want, ctx) {
  // Выбор игрока: 'auto' — обычный порядок, иначе только выбранный канал.
  if (want === 'mistral') {
    return mistralKeyReady(ctx) ? PROVIDERS.filter(p => p.name === 'mistral') : [];
  }
  if (!want || want === 'auto') return PROVIDERS;""")

sub_once('askMaster ctx',
"""async function askMaster(messages, budgetMs, kind, want) {
  const tried = [];
  const deadline = Date.now() + (budgetMs || 24000);
  for (const p of providerList(want)) {
    if (!p.enabled()) continue;""",
"""async function askMaster(messages, budgetMs, kind, want, ctx) {
  const tried = [];
  const deadline = Date.now() + (budgetMs || 24000);
  for (const p of providerList(want, ctx)) {
    if (!p.enabled(ctx)) continue;""")

sub_once('askMaster вызов провайдера',
"""      const text = await p.run(messages, budgetMs, kind);""",
"""      const text = await p.run(messages, budgetMs, kind, ctx);""")

sub_once('summary mistral',
"""  if (process.env.GROQ_API_KEY) out.push('groq');""",
"""  if (MISTRAL_ENV_KEY) out.push('mistral:' + MISTRAL_MODEL);
  if (process.env.GROQ_API_KEY) out.push('groq');""")

sub_once('choices mistral',
"""  if (process.env.GROQ_API_KEY) out.push({ id: 'groq', title: 'Groq', hint: 'Llama 3.3 70B, очень быстрый', available: true, detail: 'ключ задан' });""",
"""  out.push({
    id: 'mistral',
    title: 'Mistral (бесплатный ключ)',
    hint: 'Mistral Medium: умно и без баланса — ключ вставляется в настройках',
    available: true,
    detail: MISTRAL_ENV_KEY ? 'ключ задан в окружении' : 'свой ключ — в настройках'
  });
  if (process.env.GROQ_API_KEY) out.push({ id: 'groq', title: 'Groq', hint: 'Llama 3.3 70B, очень быстрый', available: true, detail: 'ключ задан' });""")

# ---------------------------------------------------------------- 4. /api/gm: контекст ключа
sub_once('gm ctx',
"""      const want = typeof payload.provider === 'string' ? payload.provider.slice(0, 24) : '';
      const result = await askMaster(clean, budget, kind, want);""",
"""      const want = typeof payload.provider === 'string' ? payload.provider.slice(0, 24) : '';
      const result = await askMaster(clean, budget, kind, want, { mistralKey: mistralKeyFor(payload) });""")

# ---------------------------------------------------------------- 5. поток: Mistral после шлюза
sub_once('поток mistral',
"""      // 2) Старый канал Pollinations — запасной. Поток идёт в очереди текста:""",
"""      // 1.5) Mistral: бесплатный ключ (окружение или настройки) — умная модель без баланса.
      const streamMistralKey = mistralKeyFor(payload);
      if (streamMistralKey && allow('mistral')) {
        try {
          const r = await mistralStream(messages, streamMistralKey,
            piece => { sentAny = true; send({ delta: piece }); },
            Math.min(budget, 26000));
          if (r) {
            send({ model: MISTRAL_MODEL });
            return finish(r, 'mistral:' + MISTRAL_MODEL);
          }
          send({ note: 'mistral-empty' });
        } catch (err) {
          const reason = String(err && err.message || err).slice(0, 140);
          send({ note: 'mistral-stream-failed', reason });
          if (sentAny) return finish('', 'mistral-partial', { partial: true });
        }
      }

      // 2) Старый канал Pollinations — запасной. Поток идёт в очереди текста:""")

# ---------------------------------------------------------------- 6. приписка к health
sub_once('health mistral',
"""      textProviders: textProvidersSummary(),
      hasKeyedProvider: textProvidersSummary().some(p => p !== 'pollinations-anon'),""",
"""      textProviders: textProvidersSummary(),
      hasKeyedProvider: textProvidersSummary().some(p => p !== 'pollinations-anon'),
      mistral: { model: MISTRAL_MODEL, envKey: !!MISTRAL_ENV_KEY, base: MISTRAL_BASE },""")

io.open(path, 'w', encoding='utf-8').write(src)
print('server.js: канал Mistral добавлен — %d симв. (было %d)' % (len(src), orig))
