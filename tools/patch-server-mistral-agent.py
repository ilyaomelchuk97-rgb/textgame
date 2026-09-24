# -*- coding: utf-8 -*-
"""Mistral в игре: вшитый ключ, агент «Textgame» и цепочка моделей с откатом.

Итог: игра по умолчанию ведёт ход агентом Mistral (mistral-medium-latest) —
умная модель, работает потоком; если агент недоступен — идём по моделям
(medium → small → ministral-14b → ministral-8b → nemo), а дальше запасные каналы.
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


# ---------------------------------------------------------------- 1. константы
sub_once('константы Mistral',
"""const MISTRAL_BASE = (process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1').replace(/\\/$/, '');
const MISTRAL_MODEL = process.env.MISTRAL_MODEL || 'mistral-medium-latest';
const MISTRAL_FALLBACK_MODEL = process.env.MISTRAL_MODEL_FALLBACK || 'mistral-small-latest';
const MISTRAL_ENV_KEY = String(process.env.MISTRAL_API_KEY || '').trim();""",
"""const MISTRAL_BASE = (process.env.MISTRAL_BASE_URL || 'https://api.mistral.ai/v1').replace(/\\/$/, '');
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
const MISTRAL_LAST_MODEL = { name: '', at: 0 };""")

# ---------------------------------------------------------------- 2. ключ и агент
sub_once('ключ и агент',
"""function mistralKeyFor(payload) {
  return cleanMistralKey(payload && payload.mistralKey) || MISTRAL_ENV_KEY;
}

function mistralKeyReady(ctx) {
  return !!((ctx && ctx.mistralKey) || MISTRAL_ENV_KEY);
}""",
"""function mistralKeyFor(payload) {
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
  const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\\n\\n');
  const rest = messages.filter(m => m.role !== 'system');
  const entries = rest.map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 20000)
  }));
  if (!entries.length) entries.push({ role: 'user', content: (sys || 'Продолжай игру.').slice(0, 20000) });
  else if (sys) entries[0] = { role: 'user', content: (sys + '\\n\\n' + entries[0].content).slice(0, 20000) };
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
        if (obj && obj.type === 'message.output.delta') {
          const c = obj.content;
          piece = typeof c === 'string' ? c : (Array.isArray(c) ? c.map(p => (p && p.text) || '').join('') : '');
        }
      } catch (e) { piece = ''; }
      if (piece) { full += piece; onDelta(piece); }
    }
  }
  return full;
}""")

# ---------------------------------------------------------------- 3. чат по цепочке моделей
sub_once('чат по цепочке',
"""async function mistralChat(messages, key, timeoutMs, model) {
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
}""",
"""async function mistralChatOnce(messages, key, timeoutMs, model) {
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
}""")

# ---------------------------------------------------------------- 4. провайдеры
sub_once('провайдер агента',
"""  {
    // Mistral с бесплатным ключом: умная модель без квот и без баланса.
    // Идёт сразу после шлюза — если у шлюза кончился баланс, ведёт она.
    name: 'mistral',""",
"""  {
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
    name: 'mistral',""")

sub_once('провайдер чат',
"""    name: 'mistral',
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
  },""",
"""    name: 'mistral',
    enabled: ctx => mistralKeyReady(ctx),
    async run(messages, budgetMs, kind, ctx) {
      const key = (ctx && ctx.mistralKey) || MISTRAL_BASE_KEY;
      const budget = Math.max(6000, Math.min(26000, budgetMs || 20000));
      return mistralChat(messages, key, budget);
    }
  },""")

sub_once('providerList агент',
"""  if (want === 'mistral') {
    return mistralKeyReady(ctx) ? PROVIDERS.filter(p => p.name === 'mistral') : [];
  }""",
"""  if (want === 'mistral') {
    return mistralKeyReady(ctx) ? PROVIDERS.filter(p => p.name === 'mistral') : [];
  }
  if (want === 'mistral-agent') {
    return mistralAgentReady(ctx) ? PROVIDERS.filter(p => p.name === 'mistral-agent') : [];
  }""")

sub_once('контекст вызова',
"""      const result = await askMaster(clean, budget, kind, want, { mistralKey: mistralKeyFor(payload) });""",
"""      const result = await askMaster(clean, budget, kind, want,
        { mistralKey: mistralKeyFor(payload), mistralAgent: mistralAgentFor(payload) });""")

# ---------------------------------------------------------------- 5. поток: агент первым
sub_once('поток агента',
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
""",
"""      // 1.5) Mistral: агент — ведущий мастер игры. Умная модель, своя квота, поток.
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
""")

# ---------------------------------------------------------------- 6. выбор в настройках и здоровье
sub_once('выбор канала',
"""  out.push({
    id: 'mistral',
    title: 'Mistral (бесплатный ключ)',
    hint: 'Mistral Medium: умно и бесплатно — ключ выдаётся без карты',
    available: true,
    detail: MISTRAL_ENV_KEY ? 'ключ задан на сервере' : 'нужен свой ключ (поле ниже)'
  });""",
"""  out.push({
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
  });""")

sub_once('сводка каналов',
"""  if (MISTRAL_ENV_KEY) out.push('mistral:' + MISTRAL_MODEL);""",
"""  if (MISTRAL_AGENT_ID && mistralKeyReady({ mistralKey: MISTRAL_BASE_KEY })) out.push('mistral-agent');
  if (mistralKeyReady({ mistralKey: MISTRAL_BASE_KEY })) out.push('mistral:' + (MISTRAL_LAST_MODEL.name || MISTRAL_MODEL_CHAIN[0]));""")

sub_once('health',
"""      mistral: { model: MISTRAL_MODEL, envKey: !!MISTRAL_ENV_KEY, base: MISTRAL_BASE },""",
"""      mistral: {
        agent: MISTRAL_AGENT_ID ? MISTRAL_AGENT_ID.slice(0, 12) + '…' : null,
        models: MISTRAL_MODEL_CHAIN,
        lastModel: MISTRAL_LAST_MODEL.name || null,
        key: MISTRAL_ENV_KEY ? 'окружение' : (MISTRAL_BUILTIN_KEY ? 'вшит' : 'нет'),
        base: MISTRAL_BASE
      },""")

io.open(path, 'w', encoding='utf-8').write(src)
print('server.js: Mistral-агент и цепочка моделей — %d симв. (было %d)' % (len(src), orig))
