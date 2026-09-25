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
    serverTimeoutMs: 42000,   // ход просит у сервера до 32 с + запасной путь: клиент ждёт дольше   // сервер сам пытается несколько раз, но не тянет время зря
    imageTimeoutMs: 45000,   // генератор картинок бывает загружен — ждём дольше, фон всё это время уже на экране
    retriesPerProvider: 1,
    textModel: 'openai-fast',
    apiKey: BUILTIN_API_KEY,
    mistralKey: '',           // бесплатный ключ Mistral от игрока (не хранится на сервере)
    glmKey: '',               // ключ GLM (Zhipu) от игрока: id.secret, тоже только в телефоне
    hfKey: '',                // ключ Hugging Face (hf_…): ведёт игру и рисует кадры по имени
    backend: null,
    backendChecked: false,
    // Выбор игрока в настройках: кто ведёт игру и кто рисует кадры.
    // 'auto' — доверяем серверу и его очереди каналов.
    masterWanted: 'auto',
    imageSource: 'auto',
    imageWidth: 448,
    imageHeight: 256,   // генераторы шлюза принимают высоту не меньше 256
    serverBase: ''            // напр. https://dice-tales.onrender.com — для GitHub Pages
  };

  /* ---------------------------------------------------------- */
  /* Адрес своего сервера                                        */
  /* GitHub Pages не умеет /api/*, поэтому на нём можно указать   */
  /* бэкенд ссылкой:  index.html?server=https://…                */
  /* ---------------------------------------------------------- */
  function normalizeBase(b) { return String(b || '').trim().replace(/\/+$/, ''); }
  function initServerBase() {
    let fromQuery = '';
    try {
      if (typeof location !== 'undefined') {
        fromQuery = normalizeBase(new URLSearchParams(location.search).get('server'));
      }
    } catch (e) { /* старый браузер — не страшно */ }
    let stored = '';
    try { stored = normalizeBase(localStorage.getItem('dt2:server')); } catch (e) { /* приватный режим */ }
    CONFIG.serverBase = fromQuery || stored;
    if (fromQuery) {
      try { localStorage.setItem('dt2:server', fromQuery); } catch (e) { /* приватный режим */ }
    }
    if (CONFIG.serverBase) log('свой сервер:', CONFIG.serverBase);
    return CONFIG.serverBase;
  }
  initServerBase();
  function setServerBase(b) {
    CONFIG.serverBase = normalizeBase(b);
    try { localStorage.setItem('dt2:server', CONFIG.serverBase); } catch (e) { /* noop */ }
    CONFIG.backendChecked = false;
    CONFIG.backend = null;
  }
  /** Путь к своему серверу: относительный на самом сервере, абсолютный с GitHub Pages. */
  function serverUrl(path) {
    return CONFIG.serverBase && path.indexOf('api/') === 0 ? CONFIG.serverBase + '/' + path : path;
  }

  function setApiKey(key) { CONFIG.apiKey = (key || '').trim() || BUILTIN_API_KEY; }
  function setMistralKey(key) { CONFIG.mistralKey = String(key || '').trim(); }
  function getMistralKey() { return CONFIG.mistralKey; }
  function setGlmKey(key) { CONFIG.glmKey = String(key || '').trim(); }
  function getGlmKey() { return CONFIG.glmKey; }
  function setHfKey(key) { CONFIG.hfKey = String(key || '').trim(); }
  function getHfKey() { return CONFIG.hfKey; }
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
      const res = await fetch(serverUrl('api/health'), { signal: t.signal });
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
  /* ---------------------------------------------------------- */
  /* Очередь запросов к мастеру                                  */
  /*                                                             */
  /* Бесплатный канал даёт примерно один ответ за раз: если       */
  /* запустить сцену, героя и мир одновременно, часть уйдёт в 429. */
  /* Поэтому генерации идут по одной, а важное — вперёд.          */
  /* ---------------------------------------------------------- */

  const PRIORITY = { turn: 30, epilogue: 25, hero: 20, world: 10 };
  const queue = { items: [], active: null };

  function queueDepth() { return queue.items.length + (queue.active ? 1 : 0); }
  function queueInfo() {
    return { active: queue.active ? queue.active.kind : '', waiting: queue.items.map(i => i.kind) };
  }

  function pump() {
    if (queue.active || !queue.items.length) return;
    queue.items.sort((a, b) => b.priority - a.priority);
    const item = queue.items.shift();
    if (item.dropped) return pump();
    queue.active = item;
    Promise.resolve()
      .then(() => (item.dropped ? null : item.task()))
      .then(
        res => { queue.active = null; item.resolve(res); pump(); },
        err => { queue.active = null; item.reject(err); pump(); }
      );
  }

  /** Поставить генерацию в очередь: kind — 'turn' | 'hero' | 'world' | 'epilogue'. */
  function runQueued(kind, task) {
    return new Promise((resolve, reject) => {
      queue.items.push({ kind, priority: PRIORITY[kind] || 15, task, resolve, reject });
      pump();
    });
  }

  /** Отменить всё, что ещё не началось (например, мир при выходе в меню). */
  function cancelQueued(kind) {
    let dropped = 0;
    queue.items.forEach(item => {
      if (item.kind === kind && !item.dropped) {
        item.dropped = true;
        dropped += 1;
        item.resolve(null);
      }
    });
    queue.items = queue.items.filter(i => !i.dropped);
    if (dropped) log('снято из очереди:', dropped, kind);
    return dropped;
  }

  /** Кого игрок выбрал ведущим: 'auto' — решает сервер. */
  function wantedMaster() {
    return CONFIG.masterWanted && CONFIG.masterWanted !== 'auto' ? CONFIG.masterWanted : '';
  }

  function setMaster(id) {
    CONFIG.masterWanted = String(id || 'auto');
    log('ведущий мастер:', CONFIG.masterWanted);
  }

  function masterWanted() { return CONFIG.masterWanted || 'auto'; }

  function setImageSource(id) {
    CONFIG.imageSource = String(id || 'auto');
    log('генератор картинок:', CONFIG.imageSource);
  }

  function imageSource() { return CONFIG.imageSource || 'auto'; }

  /** Доступные варианты: их присылает сервер в /api/health. */
  function masterChoices() {
    const back = CONFIG.backend || {};
    return Array.isArray(back.masterChoices) ? back.masterChoices : [];
  }

  function imageChoices() {
    const back = CONFIG.backend || {};
    return Array.isArray(back.imageChoices) ? back.imageChoices : [];
  }

  async function viaServer(messages, timeoutMs, budgetMs, kind) {
    if (!CONFIG.backend) return null;
    const t = withTimeout(timeoutMs || CONFIG.serverTimeoutMs);
    try {
      const res = await fetch(serverUrl('api/gm'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, budgetMs, kind: kind || '', provider: wantedMaster(),
          mistralKey: CONFIG.mistralKey, glmKey: CONFIG.glmKey, hfKey: CONFIG.hfKey }),
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

  /**
   * Потоковый запрос: мастер отвечает по кускам, сцена печатается сразу,
   * а не после того, как весь JSON склеится. Только через свой сервер —
   * браузерные каналы поток не отдают.
   */
  async function askGameMasterStream(messages, hooks, onDelta) {
    const server = await probeBackend();
    if (!server) return { ok: false };
    const t = withTimeout(hooks.timeoutMs || CONFIG.serverTimeoutMs);
    // поток — основной путь: если канал взялся за дело, ждём столько, сколько нужно
    try {
      const res = await fetch(serverUrl('api/gm/stream'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages, budgetMs: hooks.budgetMs, kind: hooks.kind || '', provider: wantedMaster(),
          mistralKey: CONFIG.mistralKey, glmKey: CONFIG.glmKey, hfKey: CONFIG.hfKey }),
        signal: t.signal
      });
      if (!res.ok || !res.body || typeof res.body.getReader !== 'function') throw new Error('HTTP ' + res.status);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
      let provider = '';
      let stopped = false;
      while (!stopped) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let obj = null;
          try { obj = JSON.parse(trimmed); } catch (err) { continue; }
          if (obj.delta) {
            full += obj.delta;
            if (onDelta) onDelta(full);
          }
          if (obj.done) {
            provider = obj.provider || '';
            if (obj.ok === false) throw new Error('канал не ответил');
          }
          if (obj.error) throw new Error(obj.error);
        }
      }
      if (!full) throw new Error('пустой поток');
      if (looksLikeJunk(full)) throw new Error('мусор в потоке');
      log('текст потоком, провайдер:', provider || 'stream');
      return { ok: true, text: full, source: 'server:' + (provider || 'stream') };
    } catch (err) {
      log('поток не сложился:', String(err && err.message || err));
      if (onDelta) onDelta('');                     // сбрасываем предпросмотр
      return { ok: false };
    } finally { t.done(); }
  }

  async function askGameMaster(messages, hooks = {}) {
    const server = await probeBackend();
    if (server) {
      const viaSrv = await viaServer(messages, null, hooks.budgetMs, hooks.kind);
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
      { role: 'user', content: E.buildTurnPrompt(game, action, check, hooks.extra || '', hooks.repair || '') }
    ];
    const started = Date.now();
    let res = await runQueued('turn', async () => {
      if (hooks.onDelta) {
        const streamed = await askGameMasterStream(messages, Object.assign({ kind: 'turn' }, hooks), hooks.onDelta);
        if (streamed.ok) return streamed;
        if (hooks.onPreviewEnd) hooks.onPreviewEnd();
        // Канал отвечает 20–30 секунд: даём мастеру шанс, но не держим игрока
        // дольше — иначе ход соберёт локальный мастер.
        if (Date.now() - started > 28000) return { ok: false };
      }
      return askGameMaster(messages, hooks);
    });
    if (res.ok) {
      const parsed = E.parseGmResponse(res.text, { game });
      if (parsed.ok) {
        // в кадре должны быть герой и те, кто есть в сцене
        parsed.imagePrompt = E.composeSceneImagePrompt(game, {
          aiPrompt: parsed.imagePrompt,
          sceneText: parsed.scene,
          npc: parsed.npc,
          action
        });
        return Object.assign(parsed, { source: res.source });
      }
      const salv = E.salvageWorldResponse(res.text);
      if (salv.ok && salv.opening) {
        // сцена из обрезанного ответа лучше, чем ход локального мастера:
        // варианты и последствия добавим из локальной таблицы
        const local = E.offlineTurn(game, action, check);
        return Object.assign(local, {
          scene: salv.opening,
          chapter: salv.chapter || local.chapter,
          npc: salv.npc || local.npc,
          partial: true,
          source: res.source,
          options: (local.options || []).map((o, i) => o)
        });
      }
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
          'Это первая сцена игры. Не начинай со случайной стычки. Нужно:',
          '1) "world" — 2-4 предложения о мире и здешних порядках;',
          '2) "backstory" — 3-5 предложений предыстории героя: откуда он, что потерял, почему здесь;',
          '3) "scene" — ввод в текущую сцену (3-5 предложений), живая деталь и ощутимая угроза;',
          '4) "plan" — 3 шага плана отыгрыша (что герою предстоит и в каком порядке);',
          '5) "imagePrompt" — по-английски, с героем в кадре и с теми, кто есть в сцене;',
          '6) ровно 3 первых варианта действий, вытекающих из плана.',
          hooks.extra ? 'ПОЖЕЛАНИЕ ИГРОКА О НАЧАЛЕ: ' + hooks.extra : '',
          hooks.repair || '',
          'Только JSON.'
        ].filter(Boolean).join('\n\n')
      }
    ];
    const res = await askGameMaster(messages, hooks);
    if (res.ok) {
      const parsed = E.parseGmResponse(res.text, { game });
      if (parsed.ok && parsed.options && parsed.options.length) {
        parsed.imagePrompt = E.composeSceneImagePrompt(game, {
          aiPrompt: parsed.imagePrompt,
          sceneText: parsed.scene,
          npc: parsed.npc
        });
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
  /**
   * Герой от мастера: отдельный короткий запрос — большой ответ канала
   * обрывается на середине, поэтому героя просим отдельно от мира.
   * Возвращает {ok, profile, source} либо {ok: false, reason}.
   */
  async function generateHeroProfile(game, hooks = {}) {
    const base = E.scenarioById(game.scenarioId);
    const messages = [
      { role: 'system', content: E.HERO_SYSTEM_PROMPT },
      {
        role: 'user',
        content: E.buildHeroPrompt(game.worldConfig, base.customGame ? null : base, {
          variant: hooks.variant,
          used: hooks.used
        })
      }
    ];
    const ask = async () => {
      // умные модели думают дольше прежней: даём герою до 26 секунд
      const opts = Object.assign({ budgetMs: 26000, timeoutMs: 30000, kind: 'hero' }, hooks);
      const started = Date.now();
      if (hooks.onDelta) {
        const streamed = await askGameMasterStream(messages, opts, hooks.onDelta);
        if (streamed.ok) return streamed;
        if (hooks.onPreviewEnd) hooks.onPreviewEnd();
        // канал занят — не тянем: лучше быстро попробовать снова
        if (Date.now() - started > 14000) return { ok: false };
      }
      return askGameMaster(messages, opts);
    };
    const t0 = Date.now();
    let res = await runQueued('hero', ask);
    // герой — то, без чего экран не собрать: даём мастеру ещё пару шансов,
    // но общий кап держим: игрок не должен ждать набор дольше ~20 секунд
    for (const wait of [900, 2600]) {
      if (res.ok) break;
      if (Date.now() - t0 > 34000) break;   // три попытки, но не дольше ~34 секунд
      if (hooks.onStatus) hooks.onStatus('retry');
      await sleep(wait);
      res = await runQueued('hero', ask);
    }
    if (!res.ok) return { ok: false, reason: 'мастер не ответил' };
    const profile = E.heroProfileFromText(res.text, hooks.labels || {});
    if (!profile) return { ok: false, reason: 'ответ мастера не разобрался', text: res.text };
    log('герой от мастера:', profile.classes.map(c => c.title).join(', '));
    return { ok: true, profile: profile, source: res.source, text: res.text };
  }

  async function generateWorld(game, hooks = {}) {
    const base = E.scenarioById(game.scenarioId);
    const messages = [
      { role: 'system', content: E.SYSTEM_PROMPT },
      { role: 'user', content: E.buildWorldPrompt(game.worldConfig, base.customGame ? null : base, { variant: hooks.variant }) }
    ];
    // поток: первый кусок виден сразу, а обрезанный ответ можно спасти
    const run = async () => {
      if (hooks.onDelta) {
        const streamed = await askGameMasterStream(messages, hooks, hooks.onDelta);
        if (streamed.ok) return streamed;
        if (hooks.onPreviewEnd) hooks.onPreviewEnd();
      }
      return askGameMaster(messages, hooks);
    };
    // мастер любит отвечать 429/502 — даём ему вторую попытку, прежде чем звать локального
    let res = await runQueued('world', run);
    if (!res || !res.ok) {
      if (hooks.onStatus) hooks.onStatus('retry');
      await sleep(700);
      res = await runQueued('world', run);
    }
    if (!res) return null;                       // запрос сняли из очереди (игрок вышел)
    if (res.ok) {
      const parsed = E.parseWorldResponse(res.text);
      // канал с жёстким лимитом длины иногда рубит JSON на середине:
      // тогда собираем мир из того, что успело дойти, а не зовём локального мастера
      const partial = (parsed.ok && parsed.opening) ? null : E.salvageWorldResponse(res.text);
      const data = (parsed.ok && parsed.opening) ? parsed : (partial && partial.ok ? partial : null);
      if (data) {
        const danger = game.worldConfig && game.worldConfig.danger;
        const options = [];
        (data.options || []).slice(0, 4).forEach((o, i) => {
          const opt = E.sanitizeOption(o, i, danger);
          if (opt) options.push(opt);
        });
        while (options.length < 3) options.push(E.sanitizeOption(E.offlineOpening(game).options[options.length] || null, options.length, danger));
        options.forEach((o, i) => { o.id = 'o' + i; });
        const scene = data.opening || data.scene || '';
        return {
          ok: true,
          partial: !!partial,
          raw: res.text,
          source: res.source,
          title: data.title || (game.worldConfig && game.worldConfig.title) || 'Безымянный мир',
          goal: data.goal || 'Найти своё место в этом мире',
          world: data.world || '',
          backstory: data.backstory || '',
          plan: data.plan || [],
          hero: data.hero || null,
          scene,
          chapter: data.chapter || 'Пролог',
          npc: data.npc || '',
          imagePrompt: E.composeSceneImagePrompt(game, {
            aiPrompt: data.imagePrompt || base.imagePrompts[0],
            sceneText: scene,
            npc: data.npc
          }),
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
      goal: cfg.goal || local.scene.split('.')[0].slice(0, 80),
      // ИИ недоступен, но знакомые игры собираются и локально
      hero: E.offlineHeroProfile(cfg)
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
  /** Эпилог кампании: короткий текст от мастера, иначе — летопись из памяти. */
  async function generateEpilogue(game, hooks = {}) {
    const messages = [
      { role: 'system', content: E.SYSTEM_PROMPT.split('ОТВЕЧАЙ')[0].trim() },
      { role: 'user', content: E.buildEpiloguePrompt(game) }
    ];
    const res = await runQueued('epilogue', () => askGameMaster(messages, Object.assign({ budgetMs: 20000 }, hooks)));
    if (res && res.ok) {
      const data = E.extractJsonObject(res.text);
      const text = data && typeof data.epilogue === 'string' ? E.polishSceneText(data.epilogue, 1400) : '';
      if (text.length > 80) {
        return { ok: true, text, title: (data && data.title) || 'Финал', source: 'ai' };
      }
    }
    return { ok: true, text: E.epilogueText(game), title: 'Финал', source: 'local' };
  }

  /**
   * Озвучка сцены. Голос синтезирует сервер (нейросетевой голос, mp3):
   * браузерный синтез звучит заметно хуже и на разных устройствах по-разному.
   * Возвращает blob-URL или null — тогда игра читает сцену голосом браузера.
   */
  async function speakScene(text, hooks = {}) {
    const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 700);
    if (!clean) return null;
    const server = await probeBackend();
    if (!server) return null;
    const t = withTimeout(hooks.timeoutMs || 30000);
    try {
      const q = ['text=' + encodeURIComponent(clean)];
      if (hooks.mood) q.push('mood=' + encodeURIComponent(hooks.mood));
      if (hooks.gender) q.push('gender=' + encodeURIComponent(hooks.gender));
      if (hooks.voice) q.push('voice=' + encodeURIComponent(hooks.voice));
      const res = await fetch(serverUrl('api/tts') + '?' + q.join('&'), { signal: t.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const blob = await res.blob();
      if (!blob || blob.size < 1024) throw new Error('пустая озвучка');
      log('озвучка от сервера:', Math.round(blob.size / 1024), 'КБ',
        hooks.mood ? '· подача ' + hooks.mood : '');
      return URL.createObjectURL(blob);
    } catch (err) {
      log('озвучка не сложилась:', String(err && err.message || err));
      return null;
    } finally {
      t.done();
    }
  }

  async function generateImage({ prompt, style, aspect = '16:9', seed, width, height, onAttempt, hedgeFirstMs = 0 }) {
    const source = CONFIG.imageSource || 'auto';
    const built = E.buildImageUrl({
      prompt, style, aspect, seed, source,
      width: width || CONFIG.imageWidth, height: height || CONFIG.imageHeight,
      hfKey: CONFIG.hfKey
    });
    const key = built.full + '|' + (seed || 1) + '|' + aspect;
    if (imageCache.has(key)) {
      const cached = imageCache.get(key);
      try { await loadImageOnce(cached, 9000); return { ok: true, url: cached, source: 'cache', prompt: built.full }; }
      catch (e) { imageCache.delete(key); }
    }

    // Замеры: серверный прокси с ключом — 3–4 с холодным кэшем и 0 с тёплым.
    // Прямой pollinations из браузера блокируется (net::ERR_BLOCKED_BY_ORB),
    // a0.dev отвечает дольше 30 с. Поэтому: сервер, его повтор, и только потом
    // дальние источники. Случайные стоковые фото убраны совсем — кадр должен
    // совпадать со сценой, а не быть «какой-то картинкой»; пока кадр рисуется,
    // игрок видит процедурный фон по тексту сцены.
    const server = await probeBackend();
    const queue = [];
    if (source === 'local') {
      // «локальный фон»: генераторы не дёргаем вовсе, сцена рисует себя сама
      return { ok: false, prompt: built.full, local: true };
    }
    if (server && server.imageProxy) queue.push({ name: 'server', url: serverUrl(built.server), delay: 0 });
    // Без своего сервера (например, страница открыта файлом с GitHub Pages)
    // картинку просим напрямую у генератора — анонимный адрес из браузера работает.
    else queue.push({ name: 'pollinations', url: built.pollinations, delay: 0 });
    // Один запрос на место: генератор бывает занят, а второй запрос на ту же
    // картинку только съедает время. Повтор случится, когда игрок вернётся сюда.

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
        img.onerror = () => {
          fails.push(cand.name);
          // все попытки отвалились — не держим игрока: сцена уже нарисована сама
          if (fails.length >= started.length) finish(null);
        };
        img.decoding = 'async';
        img.src = cand.url;
      };
      if (!queue.length) { finish(null); return; }
      queue.forEach((cand, i) => {
        if (!cand.delay) launch(cand);
        else timers.push(setTimeout(() => launch(cand), cand.delay + hedgeFirstMs));
      });
      // страховка: не ждём бесконечно
      timers.push(setTimeout(() => finish(null), CONFIG.imageTimeoutMs));
    });
  }

  /* ---------------------------------------------------------- */
  /* Облачные сейвы: короткий код, чтобы продолжить на другом телефоне */
  /* ---------------------------------------------------------- */

  async function cloudPut(payload) {
    const server = await probeBackend();
    if (!server) return { ok: false, reason: 'сервер недоступен' };
    const t = withTimeout(15000);
    try {
      const res = await fetch(serverUrl('api/save'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: t.signal
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
      return { ok: true, code: data.code };
    } catch (err) {
      log('выложить сейв не вышло:', String(err && err.message || err));
      return { ok: false, reason: String(err && err.message || err) };
    } finally { t.done(); }
  }

  async function cloudGet(code) {
    const server = await probeBackend();
    if (!server) return { ok: false, reason: 'сервер недоступен' };
    const t = withTimeout(15000);
    try {
      const res = await fetch(serverUrl('api/save?code=' + encodeURIComponent(String(code || '').toUpperCase())), { signal: t.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'код не найден');
      return { ok: true, data: data.data, settings: data.settings, savedAt: data.savedAt };
    } catch (err) {
      log('забрать сейв не вышло:', String(err && err.message || err));
      return { ok: false, reason: String(err && err.message || err) };
    } finally { t.done(); }
  }

  /* ---------------------------------------------------------- */
  /* Забег дня: чужие результаты живут в облаке (если оно есть)   */
  /* ---------------------------------------------------------- */

  /** Что показали другие в этот день: сколько прошли и с каким счётом. */
  async function dailyBoard(date) {
    const server = await probeBackend();
    if (!server) return { ok: false, reason: 'облако молчит' };
    const t = withTimeout(9000);
    try {
      const res = await fetch(serverUrl('api/daily?date=' + encodeURIComponent(String(date || ''))), { signal: t.signal });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
      return { ok: true, board: data };
    } catch (err) {
      log('забег дня: доска не ответила', String(err && err.message || err));
      return { ok: false, reason: String(err && err.message || err) };
    } finally { t.done(); }
  }

  /** Отдать свой результат забега и получить место среди прошедших. */
  async function dailySubmit(entry) {
    const server = await probeBackend();
    if (!server) return { ok: false, reason: 'облако молчит' };
    const t = withTimeout(12000);
    try {
      const res = await fetch(serverUrl('api/daily'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entry),
        signal: t.signal
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.ok) throw new Error((data && data.error) || 'HTTP ' + res.status);
      return { ok: true, board: data };
    } catch (err) {
      log('забег дня: результат не ушёл', String(err && err.message || err));
      return { ok: false, reason: String(err && err.message || err) };
    } finally { t.done(); }
  }

  function prefetch(url) {
    if (!url) return;
    try { const i = new Image(); i.src = url; } catch (e) { /* noop */ }
  }

  return {
    CONFIG, BUILTIN_API_KEY, setApiKey, getApiKey, isBuiltinKey, probeBackend, mode, serverUrl, setServerBase,
    askGameMaster, askGameMasterStream, runQueued, cancelQueued, queueDepth, queueInfo, PRIORITY,
    generateTurn, generateOpening, generateWorld, generateHeroProfile, generateEpilogue, speakScene,
    generateImage, prefetch, loadImageOnce, looksLikeJunk, sleep,
    setMaster, masterWanted, setImageSource, imageSource, masterChoices, imageChoices,
    setMistralKey, getMistralKey,
    setGlmKey, getGlmKey,
    setHfKey, getHfKey,
    cloudPut, cloudGet, dailyBoard, dailySubmit
  };
});
