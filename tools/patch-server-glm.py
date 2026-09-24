# -*- coding: utf-8 -*-
"""
Канал GLM (Zhipu / Z.ai) в server.js — по образцу Mistral.

Что делает:
  * вшивает ключ игрока (id.secret), выключается GLM_BUILTIN_KEY='', перекрывается GLM_API_KEY;
  * цепочка моделей glm-4.5-flash (бесплатная) → платные, если у ключа появится баланс;
  * отличает «пустой счёт» (код 1113) от обычного лимита: не ждёт зря;
  * провайдер 'glm' для /api/gm и поток /api/gm/stream;
  * health.glm и пункт в списке ведущих для настроек.
"""
import io
import sys

P = 'server.js'
s = io.open(P, encoding='utf-8').read()


def sub(tag, old, new):
    global s
    n = s.count(old)
    if n != 1:
        print('ЯКОРЬ (%d): %s' % (n, tag))
        sys.exit(1)
    s = s.replace(old, new, 1)


# ---------------------------------------------------------------- 1. константы
sub('константы GLM', """const MISTRAL_LAST_MODEL = { name: '', at: 0 };
""", """const MISTRAL_LAST_MODEL = { name: '', at: 0 };

/* ---------------------------------------------------------- */
/**
 * GLM (Zhipu / Z.ai). Ключ формата «id.secret» выдаётся в консоли
 * open.bigmodel.cn (или z.ai) бесплатно, без карты. Бесплатно отвечает
 * модель glm-4.5-flash; умные модели (glm-4.6, glm-5.x) требуют баланса —
 * если счёт пополнят, они подхватятся сами, потому что идут в цепочке ниже.
 */
const GLM_BASE = (process.env.GLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').replace(/\\/$/, '');
const GLM_ENV_KEY = String(process.env.GLM_API_KEY || '').trim();
const GLM_BUILTIN_KEY = process.env.GLM_BUILTIN_KEY === undefined
  ? '299abfa0a8334cb68782e93acca01901.2wk65aWEDXtmATCI'
  : String(process.env.GLM_BUILTIN_KEY || '').trim();
const GLM_BASE_KEY = GLM_ENV_KEY || GLM_BUILTIN_KEY;
const GLM_MODEL_CHAIN = String(process.env.GLM_MODEL_CHAIN ||
  'glm-4.5-flash,glm-4.6,glm-4.5,glm-4.5-air,glm-5.3-flash')
  .split(',').map(x => x.trim()).filter(Boolean);
const GLM_LAST_MODEL = { name: '', at: 0 };
/** «Ключ принят, но счёт пуст» (код 1113): чтобы экран настроек не врал, что канал готов. */
const GLM_NO_BALANCE = { at: 0, why: '' };

/** Ключ GLM — это «id.secret»; в настройках игрока проверяем формат. */
function cleanGlmKey(value) {
  const key = String(value || '').trim();
  return /^[A-Za-z0-9_\\-]{8,80}\\.[A-Za-z0-9_\\-]{8,80}$/.test(key) ? key : '';
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
""")

# ---------------------------------------------------------------- 2. чат и поток
sub('чат GLM', """/**
 * Общий поток для OpenAI-совместимых сервисов (Mistral и «свои каналы»):""", """/**
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
 * Общий поток для OpenAI-совместимых сервисов (Mistral и «свои каналы»):""")

# ---------------------------------------------------------------- 3. список ведущих
sub('пункт в списке ведущих', """  out.push({
    id: 'mistral',
    title: 'Mistral (модели по очереди)',
    hint: 'Medium → Small → Ministral: если умная занята, отвечает младшая',
    available: true,
    detail: MISTRAL_ENV_KEY ? 'ключ задан на сервере' : (MISTRAL_BUILTIN_KEY ? 'ключ вшит в игру' : 'нужен свой ключ (поле ниже)')
  });""", """  out.push({
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
  });""")

sub('сводка каналов', """  if (mistralKeyReady({ mistralKey: MISTRAL_BASE_KEY })) out.push('mistral:' + (MISTRAL_LAST_MODEL.name || MISTRAL_MODEL_CHAIN[0]));""",
    """  if (mistralKeyReady({ mistralKey: MISTRAL_BASE_KEY })) out.push('mistral:' + (MISTRAL_LAST_MODEL.name || MISTRAL_MODEL_CHAIN[0]));
  if (glmKeyReady({ glmKey: GLM_BASE_KEY })) out.push('glm:' + (GLM_LAST_MODEL.name || GLM_MODEL_CHAIN[0]));""")

# ---------------------------------------------------------------- 4. провайдер
sub('провайдер glm', """  {
    // Шлюз gen.pollinations.ai: умные модели (Mistral Large 3, GLM-5.3, Qwen 3.8).""", """  {
    // GLM (Zhipu): бесплатная glm-4.5-flash ведёт игру, если у шлюза и агента
    // Mistral не вышло. Ключ вшит, поэтому канал работает «из коробки».
    name: 'glm',
    enabled: ctx => glmKeyReady(ctx),
    async run(messages, budgetMs, kind, ctx) {
      const key = (ctx && ctx.glmKey) || GLM_BASE_KEY;
      const budget = Math.max(6000, Math.min(30000, budgetMs || 24000));
      return glmChat(messages, key, budget);
    }
  },
  {
    // Шлюз gen.pollinations.ai: умные модели (Mistral Large 3, GLM-5.3, Qwen 3.8).""")

# ---------------------------------------------------------------- 5. health
sub('health.glm', """      mistral: {
        agent: MISTRAL_AGENT_ID ? MISTRAL_AGENT_ID.slice(0, 12) + '…' : null,
        models: MISTRAL_MODEL_CHAIN,
        lastModel: MISTRAL_LAST_MODEL.name || null,
        key: MISTRAL_ENV_KEY ? 'окружение' : (MISTRAL_BUILTIN_KEY ? 'вшит' : 'нет'),
        base: MISTRAL_BASE
      },""", """      mistral: {
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
      },""")

# ---------------------------------------------------------------- 6. поток
sub('поток GLM', """          send({ note: 'mistral-stream-failed', reason });
          if (sentAny) return finish('', 'mistral-partial', { partial: true });
        }
      }
""", """          send({ note: 'mistral-stream-failed', reason });
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
""")

# ---------------------------------------------------------------- 7. контекст запроса
sub('ctx glm', """        { mistralKey: mistralKeyFor(payload), mistralAgent: mistralAgentFor(payload) });""",
    """        { mistralKey: mistralKeyFor(payload), mistralAgent: mistralAgentFor(payload), glmKey: glmKeyFor(payload) });""")

io.open(P, 'w', encoding='utf-8').write(s)
print('server.js: канал GLM вшит — %d симв.' % len(s))
