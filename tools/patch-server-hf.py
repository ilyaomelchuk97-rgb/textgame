# -*- coding: utf-8 -*-
"""
Канал Hugging Face в server.js.

Ключ игрока (hf_…) используется в двух местах:
  1) текст — роутер Inference Providers (137 моделей, провайдеры вместе, groq, novita…).
     У бесплатного аккаунта есть месячные кредиты; когда они кончились, роутер отвечает
     402 — канал это понимает, не ждёт и честно уступает другому ведущему;
  2) картинки — те же открытые Space'ы, но с Authorization: Bearer. Анонимную квоту
     Space'ы режут чаще, чем именную.

Всё выключается HF_BUILTIN_KEY='' и перекрывается HF_API_KEY.
"""
import io
import sys

P = 'server.js'
s = io.open(P, encoding='utf-8').read()


def sub(tag, old, new, count=1):
    global s
    n = s.count(old)
    if n != count:
        print('ЯКОРЬ (%d, ждал %d): %s' % (n, count, tag))
        sys.exit(1)
    s = s.replace(old, new, count)


# ---------------------------------------------------------------- 1. константы
sub('константы HF', """const GLM_LAST_MODEL = { name: '', at: 0 };""", """const GLM_LAST_MODEL = { name: '', at: 0 };

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
const HF_BASE = (process.env.HF_BASE_URL || 'https://router.huggingface.co/v1').replace(/\\/$/, '');
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
""")

# ---------------------------------------------------------------- 2. чат и поток
sub('чат HF', """/**
 * Общий поток для OpenAI-совместимых сервисов (Mistral и «свои каналы»):""", """/**
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
 * Общий поток для OpenAI-совместимых сервисов (Mistral и «свои каналы»):""")

# ---------------------------------------------------------------- 3. провайдер
sub('провайдер hf', """  {
    // Шлюз gen.pollinations.ai: умные модели (Mistral Large 3, GLM-5.3, Qwen 3.8).""", """  {
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
    // Шлюз gen.pollinations.ai: умные модели (Mistral Large 3, GLM-5.3, Qwen 3.8).""")

# ---------------------------------------------------------------- 4. список ведущих
sub('пункт в списке ведущих', """  if (process.env.GROQ_API_KEY) out.push({ id: 'groq',""", """  out.push({
    id: 'hf',
    title: 'Hugging Face (137 моделей)',
    hint: 'GLM-5.3-Flash и DeepSeek отвечают за 1.5–3 с; у бесплатного ключа кредиты крошечные',
    available: hfKeyReady({}),
    detail: hfCreditsFresh()
      ? 'кредиты бесплатного ключа кончились — вставьте свой ключ (поле ниже)'
      : (HF_ENV_KEY ? 'ключ задан на сервере'
        : (HF_BUILTIN_KEY ? 'ключ вшит в игру' : 'нужен свой ключ (поле ниже)'))
  });
  if (process.env.GROQ_API_KEY) out.push({ id: 'groq',""")

sub('сводка каналов', """  if (glmKeyReady({ glmKey: GLM_BASE_KEY })) out.push('glm:' + (GLM_LAST_MODEL.name || GLM_MODEL_CHAIN[0]));""",
    """  if (glmKeyReady({ glmKey: GLM_BASE_KEY })) out.push('glm:' + (GLM_LAST_MODEL.name || GLM_MODEL_CHAIN[0]));
  if (hfKeyReady({})) out.push('hf:' + (HF_LAST_MODEL.name || HF_MODEL_CHAIN[0]));
  else if (HF_BASE_KEY && hfCreditsFresh()) out.push('hf:кредиты кончились');""")

# ---------------------------------------------------------------- 5. health
sub('health.hf', """      genKeyDead: genKeyDeadFresh() ? { at: GEN_KEY_DEAD.at, why: GEN_KEY_DEAD.why } : null,""",
    """      hf: {
        models: HF_MODEL_CHAIN,
        lastModel: HF_LAST_MODEL.name || null,
        key: HF_ENV_KEY ? 'окружение' : (HF_BUILTIN_KEY ? 'вшит' : 'нет'),
        base: HF_BASE,
        credits: hfCreditsFresh() ? { at: HF_CREDITS.at, why: HF_CREDITS.why } : null,
        spaces: HF_SPACES.map(x => x.name)
      },
      genKeyDead: genKeyDeadFresh() ? { at: GEN_KEY_DEAD.at, why: GEN_KEY_DEAD.why } : null,""")

# ---------------------------------------------------------------- 6. поток
sub('поток HF', """          send({ note: 'glm-stream-failed', reason });
          if (sentAny) return finish('', 'glm-partial', { partial: true });
        }
      }
""", """          send({ note: 'glm-stream-failed', reason });
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
""")

# ---------------------------------------------------------------- 7. контекст запроса
sub('ctx hf', """        { mistralKey: mistralKeyFor(payload), mistralAgent: mistralAgentFor(payload), glmKey: glmKeyFor(payload) });""",
    """        { mistralKey: mistralKeyFor(payload), mistralAgent: mistralAgentFor(payload),
          glmKey: glmKeyFor(payload), hfKey: cleanHfKey(payload.hfKey) });""")

# ---------------------------------------------------------------- 8. Space-мёртвый генератор
sub('замена мёртвого Space', """  {
    name: 'hf:flux-1-schnell',
    base: 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api',
    build: (prompt, seed, w, h) => [prompt, seed, false, w, h, 4]
  },""", """  {
    // Бывший тут FLUX.1-schnell отдаёт 404 изнутри Space — кадр не выйдет никогда,
    // поэтому вместо него FLUX.1-dev (тот же интерфейс, модель живая).
    name: 'hf:flux-1-dev',
    base: 'https://black-forest-labs-flux-1-dev.hf.space/gradio_api',
    build: (prompt, seed, w, h) => [prompt, seed, false, w, h, 3.5, 4]
  },""")

# ---------------------------------------------------------------- 9. токен в Space-вызовы
sub('Space с токеном', """async function fetchGradioSpace(space, prompt, seed, w, h) {
  try {
    const start = await fetchWithTimeout(space.base + '/call/infer', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },""",
    """async function fetchGradioSpace(space, prompt, seed, w, h, token) {
  // Ключ HF здесь по делу: у открытых Space'ов есть анонимная квота, и по имени
  // они отвечают охотнее, чем без него. Токен не обязателен — без него тоже работает.
  const auth = token ? { 'Authorization': 'Bearer ' + token } : {};
  try {
    const start = await fetchWithTimeout(space.base + '/call/infer', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, auth),""")

sub('Space опрос с токеном', """      const step = await fetchWithTimeout(space.base + '/call/infer/' + id, {}, 12000);""",
    """      const step = await fetchWithTimeout(space.base + '/call/infer/' + id, { headers: auth }, 12000);""")

sub('гонка получает токен', """function imageCandidates(prompt, seed, w, h, want) {""",
    """function imageCandidates(prompt, seed, w, h, want, hfToken) {""")

sub('кандидат Space с токеном', """      run: () => fetchGradioSpace(space, prompt, seed, w, h)""",
    """      run: () => fetchGradioSpace(space, prompt, seed, w, h, hfToken)""")

sub('proxyImage получает токен', """async function proxyImage(res, prompt, seed, w, h, source) {""",
    """async function proxyImage(res, prompt, seed, w, h, source, hfToken) {""")

sub('подстановка токена в гонку', """  const { race, fallback } = imageCandidates(prompt, seed, w, h, source);""",
    """  // Ключ HF: свой у игрока, иначе вшитый — Space'ы отвечают по имени охотнее
  const hfToken = cleanHfKey(hfTokenParam) || HF_BASE_KEY;
  const { race, fallback } = imageCandidates(prompt, seed, w, h, source, hfToken);""")

sub('роут картинки читает ключ', """    const source = (url.searchParams.get('source') || '').slice(0, 24);   // выбор генератора в настройках
    return proxyImage(res, prompt, seed, w, h, source);""",
    """    const source = (url.searchParams.get('source') || '').slice(0, 24);   // выбор генератора в настройках
    const hfTokenParam = url.searchParams.get('hfKey') || '';
    return proxyImage(res, prompt, seed, w, h, source, hfTokenParam);""")

io.open(P, 'w', encoding='utf-8').write(s)
print('server.js: канал Hugging Face вшит — %d симв.' % len(s))
