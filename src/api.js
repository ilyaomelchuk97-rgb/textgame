/* ============================================================
 * Dice Tales — api.js
 * Слой работы с ИИ: текст (гейм-мастер), картинки сцены, генерация мира.
 *
 * Каналы, в порядке предпочтения:
 *   1. Свой сервер  → POST /api/gm, GET /api/image (обходит Turnstile,
 *      умеет бесплатные ключи Groq/Gemini/HF через переменные окружения)
 *   2. Прямые запросы к Pollinations / a0.dev из браузера
 *   3. Локальный мастер — сюжет встроен в игру (engine.js), работает всегда
 *
 * Картинки грузятся «гонкой»: несколько источников стартуют почти
 * одновременно, побеждает первый ответивший. Пока они грузятся,
 * интерфейс уже показывает мгновенный процедурный фон (backdrop.js).
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.DTapi = factory(root.DTEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  // Ключ Pollinations зашит в игру: с ним выше лимиты и доступны платные модели.
  // Пользователь может переопределить его в настройках (⚙️).
  const BUILTIN_API_KEY = 'sk_kCqSS3Q96WUonzrPPC9c5fxyRjOmiMOi';

  const CONFIG = {
    textTimeoutMs: 22000,
    imageTimeoutMs: 30000,
    retriesPerProvider: 1,
    textModel: 'openai-fast',
    apiKey: BUILTIN_API_KEY,
    backend: null,
    backendChecked: false,
    imageWidth: 448,
    imageHeight: 252
  };

  function setApiKey(key) { CONFIG.apiKey = (key || '').trim() || BUILTIN_API_KEY; }
  function getApiKey() { return CONFIG.apiKey; }
  function isBuiltinKey() { return CONFIG.apiKey === BUILTIN_API_KEY; }

  /** Ключ в ссылке генератора картинок (image.pollinations.ai → &token=…). */
  function withImageKey(url) {
    if (!CONFIG.apiKey || !/image\.pollinations\.ai/.test(url)) return url;
    return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(CONFIG.apiKey);
  }

  function log(...args) {
    if (typeof console !== 'undefined') console.log('%c[dt-api]', 'color:#7fd4a8', ...args);
  }

  function withTimeout(ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
    return { signal: ctrl.signal, done: () => clearTimeout(timer) };
  }
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const JUNK_RE = /(top up|insufficient balance|not enough credits|payment required|valid api key|missing turnstile|unauthorized|rate limit)/i;
  function looksLikeJunk(text) {
    if (!text) return true;
    const s = String(text);
    if (JUNK_RE.test(s)) return true;
    return s.length < 25;
  }

  /* ---------------------------------------------------------- */
  /* Определение возможностей сервера                           */
  /* ---------------------------------------------------------- */
  async function probeBackend(force) {
    if (CONFIG.backendChecked && !force) return CONFIG.backend;
    CONFIG.backendChecked = true;
    CONFIG.backend = null;
    try {
      const t = withTimeout(6000);
      const res = await fetch('api/health', { signal: t.signal });
      t.done();
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.ok) {
        CONFIG.backend = data;
        log('сервер доступен, текстовые каналы:', (data.textProviders || []).join(', '));
      }
    } catch (err) {
      log('сервер недоступен (работаем напрямую):', String(err && err.message || err));
    }
    return CONFIG.backend;
  }

  function mode() {
    if (!CONFIG.backend) return 'direct';
    const keyed = (CONFIG.backend.textProviders || []).filter(p => p !== 'pollinations-anon');
    return keyed.length ? 'server+' + keyed[0] : 'server-anon';
  }

  /* ---------------------------------------------------------- */
  /* Текст: гейм-мастер                                         */
  /* ---------------------------------------------------------- */
  async function viaServer(messages, timeoutMs) {
    if (!CONFIG.backend) return null;
    const t = withTimeout(timeoutMs || 30000);
    try {
      const res = await fetch('api/gm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages }),
        signal: t.signal
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data && data.ok && !looksLikeJunk(data.text)) {
        log('текст через сервер, провайдер:', data.provider);
        return { text: data.text, source: 'server:' + data.provider };
      }
      return null;
    } catch (err) {
      log('ошибка сервера:', String(err && err.message || err));
      return null;
    } finally { t.done(); }
  }

  function directProviders() {
    return [
      {
        name: 'pollinations:chat',
        async run(messages) {
          const t = withTimeout(CONFIG.textTimeoutMs);
          try {
            const headers = { 'content-type': 'application/json' };
            if (CONFIG.apiKey) headers['Authorization'] = 'Bearer ' + CONFIG.apiKey;
            const res = await fetch('https://text.pollinations.ai/openai', {
              method: 'POST', headers,
              body: JSON.stringify({
                model: CONFIG.textModel, messages, temperature: 0.9,
                max_tokens: 520, private: true, referrer: 'dice-tales'
              }),
              signal: t.signal
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const text = data && data.choices && data.choices[0] &&
              (data.choices[0].message ? data.choices[0].message.content : data.choices[0].text);
            if (looksLikeJunk(text)) throw new Error('junk');
            return text;
          } finally { t.done(); }
        }
      },
      {
        name: 'pollinations:simple',
        async run(messages) {
          const prompt = messages.map(m => m.content).join('\n\n').slice(0, 5500);
          const url = 'https://text.pollinations.ai/' + encodeURIComponent(prompt) +
            '?model=' + encodeURIComponent(CONFIG.textModel) + '&json=true' +
            (CONFIG.apiKey ? '&key=' + encodeURIComponent(CONFIG.apiKey) : '');
          const t = withTimeout(CONFIG.textTimeoutMs);
          try {
            const res = await fetch(url, { signal: t.signal });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const text = await res.text();
            if (looksLikeJunk(text)) throw new Error('junk');
            return text;
          } finally { t.done(); }
        }
      }
    ];
  }

  async function askGameMaster(messages, hooks = {}) {
    const server = await probeBackend();
    if (server) {
      const viaSrv = await viaServer(messages);
      if (viaSrv) return Object.assign({ ok: true }, viaSrv);
    }
    for (const provider of directProviders()) {
      for (let attempt = 0; attempt <= CONFIG.retriesPerProvider; attempt++) {
        try {
          if (hooks.onStatus) hooks.onStatus('direct');
          const text = await provider.run(messages);
          log('текст напрямую через', provider.name);
          return { ok: true, text, source: provider.name };
        } catch (err) {
          log('не вышло через', provider.name, String(err && err.message || err));
          if (attempt < CONFIG.retriesPerProvider) await sleep(350);
        }
      }
    }
    return { ok: false };
  }

  /** Ход игры: промпт → ИИ → разбор → локальный мастер. */
  async function generateTurn(game, action, check, hooks = {}) {
    const messages = [
      { role: 'system', content: E.SYSTEM_PROMPT },
      { role: 'user', content: E.buildTurnPrompt(game, action, check) }
    ];
    const res = await askGameMaster(messages, hooks);
    if (res.ok) {
      const parsed = E.parseGmResponse(res.text, { game });
      if (parsed.ok) return Object.assign(parsed, { source: res.source });
      log('не смог разобрать ответ модели — беру локального мастера');
    }
    if (hooks.onStatus) hooks.onStatus('offline');
    return E.offlineTurn(game, action, check);
  }

  /** Стартовая сцена готового мира. */
  async function generateOpening(game, hooks = {}) {
    const scenario = E.scenarioById(game.scenarioId);
    const messages = [
      { role: 'system', content: E.SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          E.worldDescription(game),
          `ВСТУПЛЕНИЕ МИРА: ${scenario.opening}`,
          E.heroDescription(game),
          'Это первая сцена. Введи игрока в обстановку (3-5 предложений), дай почувствовать угрозу, оживи расу и происхождение героя и предложи ровно 3 первых варианта действий.',
          'Только JSON.'
        ].join('\n\n')
      }
    ];
    const res = await askGameMaster(messages, hooks);
    if (res.ok) {
      const parsed = E.parseGmResponse(res.text, { game });
      if (parsed.ok && parsed.options && parsed.options.length) {
        return Object.assign(parsed, { source: res.source });
      }
    }
    if (hooks.onStatus) hooks.onStatus('offline');
    return E.offlineOpening(game);
  }

  /**
   * Генерация мира по настройкам игрока (свой мир / своя игра).
   * ИИ придумывает название, цель, вступление и первую сцену.
   */
  async function generateWorld(game, hooks = {}) {
    const base = E.scenarioById(game.scenarioId);
    const messages = [
      { role: 'system', content: E.SYSTEM_PROMPT },
      { role: 'user', content: E.buildWorldPrompt(game.worldConfig, base.customGame ? null : base) }
    ];
    const res = await askGameMaster(messages, hooks);
    if (res.ok) {
      const parsed = E.parseWorldResponse(res.text);
      if (parsed.ok && parsed.opening) {
        const danger = game.worldConfig && game.worldConfig.danger;
        const options = [];
        (parsed.options || []).slice(0, 4).forEach((o, i) => {
          const opt = E.sanitizeOption(o, i, danger);
          if (opt) options.push(opt);
        });
        while (options.length < 3) options.push(E.sanitizeOption(E.offlineOpening(game).options[options.length] || null, options.length, danger));
        options.forEach((o, i) => { o.id = 'o' + i; });
        return {
          ok: true,
          source: res.source,
          title: parsed.title || (game.worldConfig && game.worldConfig.title) || 'Безымянный мир',
          goal: parsed.goal || 'Найти своё место в этом мире',
          scene: parsed.opening,
          chapter: parsed.chapter || 'Пролог',
          npc: parsed.npc || '',
          imagePrompt: parsed.imagePrompt || base.imagePrompts[0],
          options,
          effects: { hp: 0, item: '', goal: false }
        };
      }
      log('мир не разобрался, собираю локально');
    }
    // локальная сборка мира: название и цель — из настроек, сцена — из локального мастера
    const local = E.offlineOpening(game);
    const cfg = game.worldConfig || {};
    const fallbackTitle = cfg.title || (cfg.gameName ? cfg.gameName : '') ||
      [cfg.genre || 'Свой мир', cfg.place ? '· ' + cfg.place : ''].join(' ').trim();
    return Object.assign(local, {
      title: fallbackTitle || 'Свой мир',
      goal: cfg.goal || local.scene.split('.')[0].slice(0, 80)
    });
  }

  /* ---------------------------------------------------------- */
  /* Картинки: мгновенный локальный фон + гонка провайдеров      */
  /* ---------------------------------------------------------- */
  const imageCache = new Map();

  function loadImageOnce(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, timeoutMs || CONFIG.imageTimeoutMs);
      function cleanup() { clearTimeout(timer); img.onload = img.onerror = null; }
      img.onload = () => { cleanup(); resolve(true); };
      img.onerror = () => { cleanup(); reject(new Error('error')); };
      img.decoding = 'async';
      img.src = url;
    });
  }

  /**
   * Гонка источников картинки. Первый загрузившийся побеждает,
   * остальные отменяются. Хедж: источники второго эшелона
   * запускаются с задержкой, если никто ещё не ответил.
   * @returns {Promise<{ok:boolean,url?:string,source?:string,prompt?:string}>}
   */
  async function generateImage({ prompt, style, aspect = '16:9', seed, width, height, onAttempt, hedgeFirstMs = 0 }) {
    const built = E.buildImageUrl({
      prompt, style, aspect, seed,
      width: width || CONFIG.imageWidth, height: height || CONFIG.imageHeight
    });
    const key = built.full + '|' + (seed || 1) + '|' + aspect;
    if (imageCache.has(key)) {
      const cached = imageCache.get(key);
      try { await loadImageOnce(cached, 9000); return { ok: true, url: cached, source: 'cache', prompt: built.full }; }
      catch (e) { imageCache.delete(key); }
    }

    const server = await probeBackend();
    const queue = [];
    if (server && server.imageProxy) queue.push({ name: 'server', url: built.server, delay: 0 });
    queue.push({ name: 'a0', url: built.a0, delay: server && server.imageProxy ? 1200 : 0 });
    queue.push({ name: 'pollinations', url: withImageKey(built.pollinations), delay: 2500 });
    queue.push({ name: 'stock', url: built.stock, delay: 9000 });

    return new Promise(resolve => {
      let settled = false;
      const started = [];
      const timers = [];
      const fails = [];
      const finish = (result) => {
        if (settled) return;
        settled = true;
        timers.forEach(clearTimeout);
        started.forEach(item => { if (!result || item.url !== result.url) { try { item.img.src = ''; } catch (e) { /* noop */ } } });
        if (result) imageCache.set(key, result.url);
        resolve(result || { ok: false, prompt: built.full });
      };
      const launch = cand => {
        if (settled) return;
        if (onAttempt) onAttempt(cand.name);
        const img = new Image();
        const item = { img, url: cand.url, name: cand.name };
        started.push(item);
        img.onload = () => { log('картинка пришла через', cand.name); finish({ ok: true, url: cand.url, source: cand.name, prompt: built.full }); };
        img.onerror = () => { fails.push(cand.name); };
        img.decoding = 'async';
        img.src = cand.url;
      };
      queue.forEach((cand, i) => {
        if (!cand.delay) launch(cand);
        else timers.push(setTimeout(() => launch(cand), cand.delay + hedgeFirstMs));
      });
      // страховка: не ждём бесконечно
      timers.push(setTimeout(() => finish(null), CONFIG.imageTimeoutMs));
    });
  }

  function prefetch(url) {
    if (!url) return;
    try { const i = new Image(); i.src = url; } catch (e) { /* noop */ }
  }

  return {
    CONFIG, BUILTIN_API_KEY, setApiKey, getApiKey, isBuiltinKey, probeBackend, mode,
    askGameMaster, generateTurn, generateOpening, generateWorld,
    generateImage, prefetch, loadImageOnce, looksLikeJunk, sleep
  };
});
