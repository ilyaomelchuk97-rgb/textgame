/* ============================================================
 * Dice Tales — app.js
 * UI-слой: экраны, режимы миров (случайные / по играм / свой),
 * создание героя (класс, раса, происхождение), броски, умения,
 * мгновенный фон сцены, сохранения.
 * ============================================================ */
(function () {
  'use strict';

  const E = window.DTEngine;
  const API = window.DTapi;
  const Backdrop = window.DTBackdrop;

  /* ---------------------------------------------------------- */
  /* Утилиты                                                    */
  /* ---------------------------------------------------------- */
  const $ = (sel, ctx) => (ctx || document).querySelector(sel);
  const $$ = (sel, ctx) => Array.prototype.slice.call((ctx || document).querySelectorAll(sel));

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(k => {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
      });
    }
    (children || []).forEach(c => {
      if (c === null || c === undefined || c === false) return;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return el;
  }
  const clear = node => { while (node.firstChild) node.removeChild(node.firstChild); return node; };
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function formatText(s) {
    return escapeHtml(s)
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|\s)\*([^*]+)\*/g, '$1<i>$2</i>')
      .replace(/\n{2,}/g, '</p><p>')
      .replace(/\n/g, '<br>');
  }
  function vibrate(pattern) {
    try { if (!Settings.data.muted && navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* noop */ }
  }

  /* ---------------------------------------------------------- */
  /* Сообщения                                                  */
  /* ---------------------------------------------------------- */
  function toast(text, opts) {
    const o = Object.assign({ timeout: 3200, kind: 'info' }, opts || {});
    const box = $('#toasts');
    if (!box) return;
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    const node = h('div', { class: 'toast toast--' + o.kind, text });
    box.appendChild(node);
    requestAnimationFrame(() => node.classList.add('is-in'));
    const remove = () => { node.classList.remove('is-in'); setTimeout(() => node.remove(), 260); };
    node.addEventListener('click', remove);
    setTimeout(remove, o.timeout);
  }

  function notify(text, opts) {
    const o = Object.assign({ kind: 'info', timeout: 4200 }, opts || {});
    if (document.body.dataset.screen !== 'game') {
      return toast(text, { kind: o.kind === 'info' ? 'good' : o.kind, timeout: o.timeout });
    }
    const box = $('#notices');
    if (!box) return;
    while (box.children.length >= 3) box.removeChild(box.firstChild);
    const node = h('div', { class: 'notice' + (o.kind && o.kind !== 'info' ? ' notice--' + o.kind : ''), text });
    box.appendChild(node);
    const remove = () => { node.classList.add('is-out'); setTimeout(() => node.remove(), 320); };
    setTimeout(remove, o.timeout);
  }

  function notifyAfterDice(text, opts) {
    const ov = $('#dice-overlay');
    if (!ov || ov.hidden) return notify(text, opts);
    let tries = 0;
    const wait = setInterval(() => {
      tries++;
      if (ov.hidden || tries > 40) { clearInterval(wait); notify(text, opts); }
    }, 200);
  }

  /* ---------------------------------------------------------- */
  /* Звук                                                       */
  /* ---------------------------------------------------------- */
  const Sound = (function () {
    let ctx = null;
    function ensure() {
      if (Settings.data.muted) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function blip(freq, dur, type, gain) {
      const c = ensure(); if (!c) return;
      const osc = c.createOscillator(), g = c.createGain();
      osc.type = type || 'triangle';
      osc.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.exponentialRampToValueAtTime(gain || 0.09, c.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + (dur || 0.12));
      osc.connect(g).connect(c.destination);
      osc.start(); osc.stop(c.currentTime + (dur || 0.12) + 0.02);
    }
    function noise(dur, gain, freq) {
      const c = ensure(); if (!c) return;
      const len = Math.floor(c.sampleRate * (dur || 0.06));
      const buf = c.createBuffer(1, len, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = freq || 1800; f.Q.value = 0.8;
      g.gain.value = gain || 0.16;
      src.buffer = buf; src.connect(f).connect(g).connect(c.destination);
      src.start();
    }
    return {
      unlock() { ensure(); },
      tick() { noise(0.045, 0.1); },
      land() { noise(0.09, 0.22); blip(180, 0.09, 'sine', 0.12); },
      success() { blip(620, 0.1, 'triangle', 0.07); setTimeout(() => blip(880, 0.16, 'triangle', 0.06), 90); },
      fail() { blip(240, 0.16, 'sawtooth', 0.05); setTimeout(() => blip(170, 0.22, 'sawtooth', 0.05), 110); },
      ability() { blip(720, 0.08, 'square', 0.05); setTimeout(() => blip(1080, 0.14, 'triangle', 0.06), 70); },
      tap() { blip(520, 0.05, 'square', 0.03); }
    };
  })();

  /* ---------------------------------------------------------- */
  /* Настройки                                                  */
  /* ---------------------------------------------------------- */
  const Settings = (function () {
    let store = null;
    let data = {
      muted: false, apiKey: '',
      tone: 'grim', rating: 'normal',      // тон и жёсткость рассказа
      voice: false, ambient: true,         // озвучка сцены и фоновый звук (можно выключить)
      theme: 'auto'                        // оформление интерфейса
    };
    return {
      init(storage) {
        store = storage;
        data = Object.assign(data, store.settings());
        if (data.apiKey) API.setApiKey(data.apiKey);
      },
      get data() { return data; },
      set(patch) {
        Object.assign(data, patch);
        if (typeof data.apiKey === 'string') API.setApiKey(data.apiKey);
        if (store) store.saveSettings(data);
      }
    };
  })();

  /* ---------------------------------------------------------- */
  /* Состояние                                                  */
  /* ---------------------------------------------------------- */
  const State = {
    storage: null,
    game: null,
    scenarioSet: [],
    pickedScenario: null,
    heroProfile: null,         // какие шаги создания героя показывать (для «своей игры» — от ИИ)
    pendingWorld: null,        // мир, собранный ИИ до выбора героя
    prologueOpen: false,
    profileLoading: false,    // мастер прямо сейчас придумывает героя под игру
    profileRequest: null,     // незавершённый запрос мира (чтобы не гонять мастера дважды)
    heroRequest: null,       // запрос героя: он идёт первым, мир — следом
    heroRetryTimer: null,    // фоновый повтор, если канал ответил «занят»
    heroRetries: 0,
    heroLoading: false,      // мастер придумывает героя прямо сейчас
    starting: false,         // игрок уже нажал «Начать» — второй раз не стартуем
    rerollCount: 0,
    worldMode: 'random',
    draftWorld: null,
    draft: { name: '', classId: 'warrior', raceId: 'human', originId: 'streets' },
    busy: false,
    backdropSeed: 1,
    imageCache: {},          // картинка локации по ключу места: место не перерисовываем
    imageKey: '',            // ключ места, к которому относится текущий фон
    actorProgress: 1,        // появление фигур на слое действия (0 → 1)
    portrait: '',            // портрет героя этой кампании
    portraitLoading: false,
    legacy: null,            // пепел, летопись и открытия прошлых кампаний
    runFinished: false,      // текущая кампания уже попала в наследие
    slowHintTimer: null,     // подсказка, если мастер молчит дольше обычного
    epilogueOpen: false,
    speakOn: false
  };

  const RANDOM_NAMES = ['Кай', 'Мира', 'Аскель', 'Рэй', 'Нора', 'Вит', 'Ирма', 'Дан', 'Сольвейг', 'Тарн',
    'Иветта', 'Гром', 'Лисан', 'Юна', 'Бран', 'Аста', 'Корв', 'Лейф', 'Тави', 'Оникс'];
  const randomName = () => E.rnd.pick(RANDOM_NAMES) + (E.rnd.chance(0.4) ? ' ' + E.rnd.pick(['из Грейхейвена', 'Тихий', 'Полутень', 'Восьмой', 'из Пустоши']) : '');

  /* ---------------------------------------------------------- */
  /* Роутер                                                     */
  /* ---------------------------------------------------------- */
  const SCREENS = ['menu', 'scenarios', 'hero', 'game', 'saves'];
  function show(screenId) {
    SCREENS.forEach(id => {
      const el = document.getElementById('screen-' + id);
      if (el) el.hidden = id !== screenId;
    });
    document.body.dataset.screen = screenId;
    const el = document.getElementById('screen-' + screenId);
    if (el) el.scrollTop = 0;
    if (screenId === 'menu') refreshMenu();
    if (screenId === 'saves') renderSaves();
    // живой фон и тихий звук живут только на игровом экране — батарею берегут
    if (screenId === 'game') { Living.start(); Ambient.sync(); }
    else { Living.stop(); Ambient.stop(); Voice.stop(); }
    // рыцарь с дракошей бегают только на главном экране — не тратим батарею зря
    Critters.sync(screenId === 'menu');
  }

  /* ---------------------------------------------------------- */
  /* Рыцарь и дракоша на главном экране                         */
  /* ---------------------------------------------------------- */
  const Critters = {
    api: null,
    ready: false,
    mount() {
      if (this.ready || !window.DTCritters) return;
      const host = $('#menu-critters');
      if (!host) return;
      this.api = window.DTCritters.mount(host, {
        onTap: role => {
          Sound.tap();
          if (role === 'knight') notify('Рыцарь: «Я его не звал!»', { timeout: 1800 });
          else notify('Дракоша: «Обед!.. то есть, привет»', { timeout: 1800 });
        }
      });
      this.ready = !!this.api;
    },
    sync(isMenu) {
      this.mount();
      if (!this.api) return;
      if (isMenu && !document.hidden) this.api.start();
      else this.api.stop();
    }
  };

  /* ---------------------------------------------------------- */
  /* Меню                                                       */
  /* ---------------------------------------------------------- */
  function refreshMenu() {
    const count = State.storage ? State.storage.list().length : 0;
    const badge = $('#menu-saves-count');
    badge.textContent = count ? String(count) : '';
    badge.hidden = !count;
  }

  /* ---------------------------------------------------------- */
  /* Выбор мира: вкладки, случайные, по играм, свой мир          */
  /* ---------------------------------------------------------- */
  function openScenarios() {
    State.scenarioSet = E.randomScenarioSet(0);
    renderRandomScenarios();
    renderGameWorlds();
    renderWorldBuilder();
    renderSavedWorlds();
    setWorldMode('random');
    show('scenarios');
  }

  function setWorldMode(mode) {
    State.worldMode = mode;
    $$('#mode-tabs .tab').forEach(t => t.classList.toggle('is-active', t.dataset.mode === mode));
    $('#pane-random').hidden = mode !== 'random';
    $('#pane-games').hidden = mode !== 'games';
    $('#pane-custom').hidden = mode !== 'custom';
    // «перемешать» нужно только в случайной подборке,
    // нижняя кнопка «Собрать мир» — только в конструкторе своего мира
    $('[data-act="reroll-scenarios"]').hidden = mode !== 'random';
    $('#scenarios-footer').hidden = mode !== 'custom';
    $('#scenario-scroll').scrollTop = 0;
  }

  function assetUrl(name) {
    const inlined = window.DT_ASSETS && window.DT_ASSETS[name];
    return inlined || ('assets/' + name + '.jpg');
  }
  const coverUrl = cover => 'url("' + assetUrl(cover) + '")';

  function scenarioCard(s, index, onPick) {
    return h('button', {
      class: 'scenario-card', type: 'button', dataset: { id: s.id },
      style: '--i:' + index + ';--accent:' + s.palette[2],
      onclick: () => onPick(s)
    }, [
      h('div', { class: 'scenario-card__cover', style: 'background-image:' + coverUrl(s.cover) }),
      h('div', { class: 'scenario-card__body' }, [
        h('div', { class: 'scenario-card__genre', text: s.icon + ' ' + s.genre }),
        h('h3', { class: 'scenario-card__title', text: s.title }),
        h('p', { class: 'scenario-card__tagline', text: s.tagline })
      ])
    ]);
  }

  function renderRandomScenarios() {
    const list = clear($('#pane-random'));
    State.scenarioSet.forEach((s, i) => list.appendChild(scenarioCard(s, i, pickScenario)));
    list.appendChild(h('p', { class: 'muted center small', text: 'Подборка случайная — нажмите 🎲 сверху, чтобы получить другие миры.' }));
  }

  function renderGameWorlds() {
    const list = clear($('#game-worlds-list'));
    E.GAME_WORLDS.filter(w => !w.customGame).forEach((w, i) => list.appendChild(scenarioCard(w, i, pickScenario)));
  }

  /**
   * «Своя игра» / свой мир: просим мастера собрать мир и придумать героя.
   * Экран создания героя открывается сразу — игрок вводит имя, пока мастер думает.
   */
  function heroDraft() {
    const base = State.pickedScenario || E.CUSTOM_SCENARIO;
    return E.createGame({
      scenarioId: base.id,
      heroName: 'Герой',
      classId: E.CLASSES[0].id,
      raceId: E.RACES[0].id,
      originId: E.ORIGINS[0].id,
      worldConfig: State.draftWorld || E.emptyWorldConfig()
    });
  }

  function prepareCustomWorld() {
    const draft = heroDraft();
    State.pendingWorld = null;
    State.profileLoading = true;
    State.heroLoading = true;
    // Пока мастер думает, на экране уже варианты по этой игре: прошлый заход или встроенная таблица.
    // Это важно: игрок видит осмысленный набор сразу, а ответ мастера заменяет его целиком.
    State.heroProfile = null;
    applyLocalProfile('заготовка, пока мастер думает', { force: true, quiet: true });
    openHero();                                     // экран сразу, без ожидания
    setProfileNote('🧠 Мастер придумывает героя под эту игру…', { busy: true });
    // Сначала герой: это то, что игрок видит на экране. Мир — следом, он длиннее.
    State.heroRequest = requestHeroProfile(draft, 1);
    State.profileRequest = State.heroRequest.then(() => requestWorldProfile(draft, 1));
    return State.profileRequest;
  }

  /**
   * Запрос героя к мастеру: короткий ответ строками, поэтому приходит быстрее мира.
   * Пока он идёт, на экране уже есть варианты по игре из встроенной таблицы.
   */
  async function requestHeroProfile(draft, variant) {
    State.heroLoading = true;
    setProfileNote('🧠 Мастер придумывает героя под эту игру…', { busy: true });
    let res = null;
    const onDelta = full => {
      const m = /^К[:：]\s*([^|\n]{2,40})/m.exec(full || '');
      if (m) setProfileNote('🧠 Мастер придумывает героя: «' + m[1].trim() + '»…', { busy: true });
    };
    try {
      res = await API.generateHeroProfile(draft, {
        onStatus: statusHook('hero'), variant, used: usedVariantTitles(), labels: localLabels(), onDelta
      });
    } catch (e) { res = null; }
    State.heroLoading = false;
    if (!res || !res.ok || !res.profile) {
      console.log('[профиль героя]', res ? res.reason : 'запрос не удался');
      applyLocalProfile('Мастер не ответил — оставил варианты по этой игре.');
      if (State.heroProfile && State.heroProfile.source !== 'ai') {
        State.heroProfile.note = 'канал мастера занят — попробуй «Другой набор» через минуту';
        State.heroProfile.noteWho = '🧠 Мастер (занят): ';
        afterProfileChange();
      }
      scheduleHeroRetry(22000);
      return null;
    }
    const profile = res.profile;
    profile.note = profile.note || 'герой придуман под эту игру — «Другой набор» попросит новых';
    State.heroProfile = profile;
    rememberHeroProfile(res.text);
    rememberVariantTitles(profile);
    afterProfileChange();
    return profile;
  }

  /** Набор героя, который мастер придумал для этой игры в прошлый раз. */
  function cachedHeroProfile() {
    try {
      const raw = localStorage.getItem('dt2:heroCache:' + variantKey());
      if (!raw) return null;
      const saved = JSON.parse(raw);
      const profile = E.heroProfileFromText(saved && saved.text, {});
      return profile;
    } catch (e) { return null; }
  }
  function rememberHeroProfile(text) {
    try {
      if (!text) return;
      localStorage.setItem('dt2:heroCache:' + variantKey(), JSON.stringify({ text: String(text).slice(0, 2000), at: Date.now() }));
    } catch (e) { /* приватный режим */ }
  }

  /** Метки шагов из встроенной таблицы: пригодятся, если мастер их не подсказал. */
  function localLabels() {
    const local = E.offlineHeroProfile(State.draftWorld || {}) ||
      E.offlineHeroProfile({ gameName: (State.pickedScenario || {}).title });
    return local ? { classLabel: local.classLabel, raceLabel: local.raceLabel, originLabel: local.originLabel } : {};
  }

  /** Запрос к мастеру: мир и первая сцена. Ставим результат, как только пришёл ответ. */
  async function requestWorldProfile(draft, variant) {
    State.profileLoading = true;
    setProfileNote('🧠 Мастер строит мир под эту игру…', { busy: !!State.heroLoading });
    const used = usedVariantTitles();
    let turn = null;
    // мастер печатает мир: показываем, как он складывается
    const onDelta = full => {
      const title = E.extractPartialField(full, 'title');
      const world = E.extractPartialField(full, 'world');
      if (title) setProfileNote('🧠 Мастер строит мир: «' + title + '»…', { busy: true });
      else if (world) setProfileNote('🧠 Мастер пишет мир: ' + world.slice(0, 48) + '…', { busy: true });
    };
    try {
      turn = await API.generateWorld(draft, { onStatus: statusHook('world'), variant, used, onDelta });
    } catch (e) {
      turn = null;
    }
    State.profileLoading = false;
    if (!turn) {
      applyLocalProfile('Мастер не отвечает — варианты собраны по этой игре и её жанру.');
      return null;
    }
    State.pendingWorld = turn;
    applyTurnProfile(turn);
    if (State.heroProfile && State.heroProfile.fromAI) rememberVariantTitles(State.heroProfile);
    return turn;
  }

  /** Профиль героя из ответа мастера о мире (если он его всё-таки прислал). */
  function applyTurnProfile(turn) {
    const fromAI = !!(turn.hero && (turn.hero.classes || turn.hero.races || turn.hero.origins));
    if (State.heroProfile && State.heroProfile.source === 'ai') {
      // героя уже придумал отдельный ответ — набор не трогаем,
      // но экран и строку статуса обновляем: мир построен
      afterProfileChange();
      return;
    }
    if (fromAI) {
      State.heroProfile = E.heroProfileFromWorld(turn.hero);
      State.heroProfile.source = turn.offline ? 'local' : 'ai';
      if (!State.heroProfile.note) {
        State.heroProfile.note = 'варианты придуманы под эту игру — жми «Другой набор», если хочешь свежих';
      }
    } else {
      applyLocalProfile('Мастер не предложил свой набор — берём варианты по жанру этой игры.');
      return;
    }
    afterProfileChange();
  }

  /** Запасной путь: варианты из встроенной таблицы игр и жанров. */
  function applyLocalProfile(reason, opts) {
    if (State.heroProfile && State.heroProfile.source === 'ai' && !(opts && opts.force)) {
      if (reason) console.log('[профиль героя] оставляю набор от мастера:', reason);
      return;                                   // набор от мастера лучше встроенного
    }
    const cached = cachedHeroProfile();
    if (cached) {
      cached.source = 'cache';
      cached.note = 'канал мастера занят — это набор из прошлого захода, «Другой набор» попросит свежий';
      State.heroProfile = cached;
      if (reason) console.log('[профиль героя]', reason, '→ взял прошлый набор мастера');
      afterProfileChange();
      return;
    }
    const local = E.offlineHeroProfile(State.draftWorld || {}) || E.offlineHeroProfile({ gameName: (State.pickedScenario || {}).title });
    if (local) {
      local.source = 'local';
      State.heroProfile = local;
    } else {
      const fallback = E.defaultHeroProfile('эту историю я пока не знаю — выбирай свободно.');
      fallback.source = 'default';
      State.heroProfile = fallback;
    }
    if (reason) console.log('[профиль героя]', reason);
    State.noteQuiet = !!(opts && opts.quiet);
    afterProfileChange();
    State.noteQuiet = false;
  }

  /** После нового набора: перерисовываем шаги и держим выбор корректным. */
  function afterProfileChange() {
    const p = Legacy.merge(heroProfile());
    renderLegacyBlock();
    if (!p.classes.some(c => c.id === State.draft.classId)) State.draft.classId = p.classes[0].id;
    if (p.showRace && !p.races.some(r => r.id === State.draft.raceId)) State.draft.raceId = p.races[0].id;
    if (p.showOrigin && !p.origins.some(o => o.id === State.draft.originId)) State.draft.originId = p.origins[0].id;
    if (!p.showRace) State.draft.raceId = p.races[0].id;
    if (!p.showOrigin) State.draft.originId = p.origins[0].id;
    if (document.body.dataset.screen === 'hero') {
      applyProfileToForm();
      renderClassList();
      renderRaceList();
      renderOriginList();
      renderStatPreview();
    }
  }

  /** Строка о прошлых жизнях на экране героя. */
  function renderLegacyBlock() {
    const el = $('#hero-legacy');
    if (!el) return;
    const text = Legacy.note();
    el.hidden = !text;
    if (!text) return;
    clear(el);
    el.appendChild(h('span', { class: 'hero-legacy__text', text: '🕯 ' + text }));
    const next = E.legacyNextUnlock(Legacy.get());
    if (next) el.appendChild(h('span', { class: 'hero-legacy__next', text: 'Дальше откроется: ' + next.title }));
  }

  /** Что мастер уже придумывал для этой игры: просим не повторяться. */
  function usedVariantTitles() {
    try {
      const raw = localStorage.getItem('dt2:heroUsed:' + variantKey());
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.slice(-18) : [];
    } catch (e) { return []; }
  }
  function rememberVariantTitles(profile) {
    if (!profile) return;
    try {
      const key = 'dt2:heroUsed:' + variantKey();
      const titles = []
        .concat((profile.classes || []).map(c => c.title))
        .concat((profile.races || []).map(r => r.title))
        .concat((profile.origins || []).map(o => o.title))
        .filter(Boolean);
      const kept = usedVariantTitles().concat(titles).slice(-24);
      localStorage.setItem(key, JSON.stringify(kept));
    } catch (e) { /* приватный режим — просто не помним */ }
  }
  function variantKey() {
    const cfg = State.draftWorld || {};
    return (cfg.gameName || cfg.title || (State.pickedScenario || {}).title || 'своя игра').slice(0, 40);
  }

  /**
   * Мастер не ответил сразу — зовём его ещё раз через полминуты, пока игрок выбирает.
   * Канал бесплатный и часто отвечает «занят», поэтому одна попытка не показатель.
   */
  function scheduleHeroRetry(delayMs) {
    if (State.heroRetryTimer || (State.heroRetries || 0) >= 3) return;
    State.heroRetryTimer = setTimeout(async () => {
      State.heroRetryTimer = null;
      State.heroRetries = (State.heroRetries || 0) + 1;
      const base = State.pickedScenario || E.CUSTOM_SCENARIO;
      const onHeroScreen = document.body.dataset.screen === 'hero' && !State.starting;
      if (!onHeroScreen || !(base.custom || base.customGame)) return;
      if (State.heroProfile && State.heroProfile.source === 'ai') return;     // мастер всё-таки ответил
      const profile = await requestHeroProfile(heroDraft(), (State.rerollCount || 0) + 1);
      if (profile) notify('Мастер ответил — обновил варианты героя', { kind: 'good', timeout: 2800 });
      else scheduleHeroRetry(35000);
    }, delayMs);
  }

  /** «Другой набор»: просим мастера придумать героя заново — новая история, новый персонаж. */
  async function rerollHero() {
    // ждём только героя: сборка мира перебору не мешает
    if (State.heroLoading || State.starting) return;
    const base = State.pickedScenario || E.CUSTOM_SCENARIO;
    if (!(base.custom || base.customGame)) {
      notify('Набор вариантов придумывает мастер для «своей игры» и своего мира', { kind: 'info' });
      return;
    }
    Sound.tap();
    const draft = heroDraft();
    State.rerollCount = (State.rerollCount || 0) + 1;
    // прежний набор оставляем на экране: игрок не должен видеть пустоту, пока мастер думает
    const had = await requestHeroProfile(draft, State.rerollCount + 1);
    if (had) {
      notify('Мастер придумал новых героев', { kind: 'good', timeout: 2600 });
    } else {
      // набор не портим: пусть останется прежний, но скажем честно, что мастер занят
      if (State.heroProfile) {
        State.heroProfile.note = 'канал занят — оставил прежний набор, зову мастера ещё раз';
        State.heroProfile.noteWho = '🧠 Мастер (занят): ';
        afterProfileChange();
      }
      scheduleHeroRetry(20000);
      notify('Мастер не ответил — оставил прежние варианты', { kind: 'info', timeout: 2800 });
    }
  }


  function pickScenario(s) {
    State.pickedScenario = s;
    State.pendingWorld = null;
    State.heroProfile = E.defaultHeroProfile();
    // для «своей игры» берём текст из поля
    if (s.customGame) {
      const name = $('#own-game-input').value.trim();
      if (!name) { notify('Впишите название игры', { kind: 'warn' }); return; }
      State.draftWorld = Object.assign(E.emptyWorldConfig(), {
        gameName: name,
        genre: 'По игре «' + name + '»',
        danger: 'normal',
        extra: 'Держи узнаваемые черты этой игры: её мир, лексику, персонажей-архетипы и правила. ' +
               'Создание героя подгони под эту игру: лишние шаги убери пустым массивом.'
      });
      Sound.tap();
      State.busy = true;
      prepareCustomWorld().catch(() => {
        hideLoading();
        State.busy = false;
        State.heroProfile = E.defaultHeroProfile();
        openHero();
      });
      return;
    }
    Sound.tap();
    openHero();
  }

  /* --- конструктор мира --- */
  function chips(container, values, opts) {
    const o = Object.assign({ multi: false, selected: [], onToggle: null }, opts || {});
    clear(container);
    values.forEach(v => {
      const isOn = o.multi ? o.selected.indexOf(v) !== -1 : o.selected[0] === v;
      container.appendChild(h('button', {
        class: 'chip' + (isOn ? ' is-on' : ''), type: 'button', dataset: { value: v },
        onclick: () => o.onToggle(v)
      }, [v]));
    });
  }

  function readWorldForm() {
    const cfg = State.draftWorld || E.emptyWorldConfig();
    cfg.title = $('#wc-title').value.trim();
    cfg.genre = $('#wc-genre-own').value.trim() || cfg.genre || '';
    cfg.place = $('#wc-place-own').value.trim() || cfg.place || '';
    cfg.goal = $('#wc-goal').value.trim();
    cfg.extra = $('#wc-extra').value.trim();
    State.draftWorld = cfg;
    return cfg;
  }

  function renderWorldBuilder() {
    const cfg = State.draftWorld || (State.draftWorld = E.emptyWorldConfig());

    chips($('#wc-genres'), E.WORLD_OPTIONS.genres, {
      selected: [cfg.genre], onToggle: v => { cfg.genre = cfg.genre === v ? '' : v; $('#wc-genre-own').value = ''; renderWorldBuilder(); }
    });
    chips($('#wc-tones'), E.WORLD_OPTIONS.tones, {
      selected: [cfg.tone], onToggle: v => { cfg.tone = cfg.tone === v ? '' : v; renderWorldBuilder(); }
    });
    chips($('#wc-places'), E.WORLD_OPTIONS.places, {
      selected: [cfg.place], onToggle: v => { cfg.place = cfg.place === v ? '' : v; $('#wc-place-own').value = ''; renderWorldBuilder(); }
    });
    chips($('#wc-roles'), E.OWN_ROLES, {
      selected: [cfg.role], onToggle: v => { cfg.role = cfg.role === v ? '' : v; renderWorldBuilder(); }
    });
    chips($('#wc-ingredients'), E.WORLD_OPTIONS.ingredients, {
      multi: true, selected: cfg.ingredients || [],
      onToggle: v => {
        const list = cfg.ingredients || (cfg.ingredients = []);
        const i = list.indexOf(v);
        if (i === -1) list.push(v); else list.splice(i, 1);
        renderWorldBuilder();
      }
    });
    chips($('#wc-danger'), E.DANGER_LEVELS.map(d => d.title), {
      selected: [(E.DANGER_LEVELS.find(d => d.id === cfg.danger) || E.DANGER_LEVELS[1]).title],
      onToggle: v => {
        const level = E.DANGER_LEVELS.find(d => d.title === v);
        cfg.danger = level ? level.id : 'normal';
        renderWorldBuilder();
      }
    });
  }

  function randomWorldForm() {
    const cfg = E.emptyWorldConfig();
    cfg.genre = E.rnd.pick(E.WORLD_OPTIONS.genres);
    cfg.tone = E.rnd.pick(E.WORLD_OPTIONS.tones);
    cfg.place = E.rnd.pick(E.WORLD_OPTIONS.places);
    cfg.role = E.rnd.pick(E.OWN_ROLES);
    cfg.ingredients = E.rnd.shuffle(E.WORLD_OPTIONS.ingredients).slice(0, E.rnd.int(2, 4));
    cfg.danger = E.rnd.pick(E.DANGER_LEVELS).id;
    State.draftWorld = cfg;
    $('#wc-title').value = '';
    $('#wc-goal').value = '';
    $('#wc-extra').value = '';
    $('#wc-genre-own').value = '';
    $('#wc-place-own').value = '';
    renderWorldBuilder();
    Sound.tap();
  }

  function renderSavedWorlds() {
    const wrap = clear($('#saved-worlds'));
    const worlds = State.storage.worlds();
    $('#saved-worlds-title').hidden = !worlds.length;
    if (!worlds.length) return;
    worlds.forEach(w => {
      wrap.appendChild(h('div', { class: 'save-card save-card--world' }, [
        h('div', { class: 'save-card__body' }, [
          h('div', { class: 'save-card__title', text: w.title || 'Свой мир' }),
          h('div', { class: 'save-card__meta', text: [w.genre, w.tone, w.place].filter(Boolean).join(' · ') || 'без деталей' }),
          h('div', { class: 'save-card__actions' }, [
            h('button', {
              class: 'btn btn--primary btn--sm', type: 'button', text: 'Загрузить',
              onclick: () => {
                State.draftWorld = Object.assign(E.emptyWorldConfig(), w);
                $('#wc-title').value = w.title || '';
                $('#wc-goal').value = w.goal || '';
                $('#wc-extra').value = w.extra || '';
                $('#wc-genre-own').value = (E.WORLD_OPTIONS.genres.indexOf(w.genre) === -1) ? (w.genre || '') : '';
                $('#wc-place-own').value = (E.WORLD_OPTIONS.places.indexOf(w.place) === -1) ? (w.place || '') : '';
                renderWorldBuilder();
                toast('Мир загружен в конструктор', { kind: 'good' });
              }
            }),
            h('button', {
              class: 'btn btn--danger btn--sm', type: 'button', text: 'Удалить',
              onclick: () => {
                State.storage.removeWorld(w.id);
                renderSavedWorlds();
                toast('Мир удалён', { kind: 'bad' });
              }
            })
          ])
        ])
      ]));
    });
  }

  function createCustomWorld() {
    const cfg = readWorldForm();
    if (!cfg.genre && !cfg.title && !cfg.goal && !(cfg.ingredients || []).length && !cfg.extra) {
      notify('Выберите хотя бы жанр, место или напишите пожелание', { kind: 'warn' });
      setWorldMode('custom');
      return;
    }
    State.pickedScenario = E.CUSTOM_SCENARIO;
    if (cfg.title) State.pickedScenario = Object.assign({}, E.CUSTOM_SCENARIO, { title: 'Свой мир: ' + cfg.title });
    Sound.tap();
    prepareCustomWorld();
  }

  function startOwnGame() {
    const name = $('#own-game-input').value.trim();
    if (!name) { notify('Впишите название игры', { kind: 'warn' }); return; }
    const base = E.GAME_WORLDS.find(w => w.customGame);
    State.pickedScenario = base;
    State.draftWorld = Object.assign(E.emptyWorldConfig(), {
      gameName: name,
      genre: 'По игре «' + name + '»',
      danger: 'normal',
      extra: 'Держи узнаваемые черты этой игры: её мир, лексику, персонажей-архетипы и правила. ' +
             'Создание героя подгони под эту игру: лишние шаги убери пустым массивом.'
    });
    Sound.tap();
    prepareCustomWorld();
  }

  /* ---------------------------------------------------------- */
  /* Создание героя                                             */
  /* ---------------------------------------------------------- */
  function heroBannerScenario() {
    const s = State.pickedScenario || E.SCENARIOS[0];
    const cfg = State.draftWorld;
    // мир мог быть собран ещё до выбора героя: тогда название и цель уже известны
    const pending = (State.pendingWorld && typeof State.pendingWorld === 'object') ? State.pendingWorld : {};
    const title = (cfg && cfg.gameName) ? cfg.gameName
      : ((cfg && cfg.title) ? cfg.title : (pending.title || s.title));
    const goal = (cfg && cfg.goal) || pending.goal || s.goal || 'цель определит ИИ-мастер';
    return { cover: s.cover, title, goal, icon: s.icon };
  }

  function openHero() {
    const s = heroBannerScenario();
    const banner = clear($('#hero-scenario'));
    banner.style.backgroundImage = coverUrl(s.cover);
    banner.appendChild(h('div', { class: 'scenario-banner__text' }, [
      h('strong', { text: s.icon + ' ' + s.title }),
      h('span', { text: s.goal })
    ]));
    if (!State.draft.name) State.draft.name = randomName();
    $('#hero-name').value = State.draft.name;
    applyProfileToForm();
    renderClassList();
    renderRaceList();
    renderOriginList();
    renderStatPreview();
    if (State.heroLoading) setProfileNote('🧠 Мастер придумывает героя под эту игру…', { busy: true });
    show('hero');
  }

  /** Текущий профиль создания героя (обычный мир — все шаги). */
  function heroProfile() {
    if (!State.heroProfile) State.heroProfile = E.defaultHeroProfile();
    return State.heroProfile;
  }

  /** Строка под именем героя: что мастер думает о подборе вариантов. */
  function setProfileNote(text, opts) {
    const o = Object.assign({ busy: false, showReroll: true }, opts || {});
    const note = $('#hero-profile-note');
    const label = $('#hero-profile-text');
    if (label) label.textContent = text || '';
    note.hidden = !text;
    const reroll = $('#hero-reroll');
    if (reroll) {
      reroll.hidden = !o.showReroll;
      reroll.disabled = !!o.busy;
      reroll.classList.toggle('link-btn--busy', !!o.busy);
    }
  }

  function applyProfileToForm() {
    const p = heroProfile();
    $('#label-class').textContent = p.classLabel;
    $('#label-race').textContent = p.raceLabel;
    $('#label-origin').textContent = p.originLabel;
    $('#section-class').hidden = !p.showClass;
    $('#section-race').hidden = !p.showRace;
    $('#section-origin').hidden = !p.showOrigin;
    const noAI = (p.source === 'local' || p.source === 'default');
    const who = p.noteWho || (noAI ? '🧠 Мастер (без ИИ): '
      : (p.source === 'cache' ? '🧠 Мастер (прошлый заход): ' : '🧠 Мастер: '));
    // «Другой набор» ждёт только героя: пока мастер строит мир, новые варианты уже можно просить
    if (!State.noteQuiet) setProfileNote(p.note ? who + p.note : '', { busy: !!State.heroLoading });
    // если вариант один — выбираем его сами
    if (p.classes.length === 1) State.draft.classId = p.classes[0].id;
    if (p.showRace && p.races.length === 1) State.draft.raceId = p.races[0].id;
    if (p.showOrigin && p.origins.length === 1) State.draft.originId = p.origins[0].id;
    if (!p.showRace && State.draft.raceId === null) State.draft.raceId = p.races[0].id;
    if (!p.showOrigin && State.draft.originId === null) State.draft.originId = p.origins[0].id;
  }

  function renderClassList() {
    const wrap = clear($('#class-list'));
    heroProfile().classes.forEach(c => {
      const active = c.id === State.draft.classId;
      const bonus = E.STAT_IDS.filter(id => c.bonus[id]).map(id => E.statById(id).name + ' ' + (c.bonus[id] > 0 ? '+' : '') + c.bonus[id]);
      const ability = (c.ability && typeof c.ability === 'object') ? c.ability : E.abilityById(c.ability);
      wrap.appendChild(h('button', {
        class: 'arch-card' + (active ? ' is-active' : ''), type: 'button',
        onclick: () => { State.draft.classId = c.id; Sound.tap(); renderClassList(); renderStatPreview(); }
      }, [
        h('span', { class: 'arch-card__icon', text: c.icon }),
        h('span', { class: 'arch-card__main' }, [
          h('span', { class: 'arch-card__title', text: c.title }),
          h('span', { class: 'arch-card__blurb', text: c.hint || c.blurb }),
          h('span', { class: 'arch-card__ability', text: ability.icon + ' ' + ability.name + ' — ' + ability.desc })
        ]),
        h('span', { class: 'arch-card__bonus', text: bonus.join(' · ') })
      ]));
    });
  }

  function renderRaceList() {
    const wrap = clear($('#race-list'));
    const setting = (State.pickedScenario || E.SCENARIOS[0]).setting;
    heroProfile().races.forEach(r => {
      const active = r.id === State.draft.raceId;
      wrap.appendChild(h('button', {
        class: 'chip chip--tall' + (active ? ' is-on' : ''), type: 'button',
        onclick: () => { State.draft.raceId = r.id; Sound.tap(); renderRaceList(); renderStatPreview(); }
      }, [
        h('span', { class: 'chip__title', text: r.icon + ' ' + r.title }),
        h('span', { class: 'chip__sub', text: r.hint || (r.flavor ? E.raceFlavor(r, setting) : '') || r.trait || '' })
      ]));
    });
    const profile = heroProfile();
    const race = profile.races.find(r => r.id === State.draft.raceId) || E.raceById(State.draft.raceId);
    if (race.trait) $('#race-hint').textContent = 'Особенность: ' + race.trait;
    else $('#race-hint').textContent = '';
  }

  function renderOriginList() {
    const wrap = clear($('#origin-list'));
    heroProfile().origins.forEach(o => {
      const active = o.id === State.draft.originId;
      const bonus = E.STAT_IDS.filter(id => o.bonus[id]).map(id => E.statById(id).short + ' +' + o.bonus[id]);
      wrap.appendChild(h('button', {
        class: 'arch-card arch-card--slim' + (active ? ' is-active' : ''), type: 'button',
        onclick: () => { State.draft.originId = o.id; Sound.tap(); renderOriginList(); renderStatPreview(); }
      }, [
        h('span', { class: 'arch-card__icon', text: o.icon }),
        h('span', { class: 'arch-card__main' }, [
          h('span', { class: 'arch-card__title', text: o.title }),
          h('span', { class: 'arch-card__blurb', text: o.hint || o.hook })
        ]),
        h('span', { class: 'arch-card__bonus', text: bonus.join(' · ') + ' · ' + o.item })
      ]));
    });
  }

  function renderStatPreview() {
    const d = State.draft;
    const p = heroProfile();
    const cls = p.classes.find(c => c.id === d.classId) || E.classById(d.classId);
    const race = p.races.find(r => r.id === d.raceId) || E.raceById(d.raceId);
    const origin = p.origins.find(o => o.id === d.originId) || E.originById(d.originId);
    const stats = E.statsFor(cls, race, origin);
    const hp = E.maxHpFor({ classId: cls.id, cls, stats });
    const wrap = clear($('#stat-preview'));
    E.STATS.forEach(st => {
      wrap.appendChild(h('div', { class: 'stat-chip', title: st.hint }, [
        h('span', { class: 'stat-chip__icon', text: st.icon }),
        h('span', { class: 'stat-chip__name', text: st.short }),
        h('span', { class: 'stat-chip__value', text: '+' + stats[st.id] })
      ]));
    });
    wrap.appendChild(h('div', { class: 'stat-chip stat-chip--hp' }, [
      h('span', { class: 'stat-chip__icon', text: '❤️' }),
      h('span', { class: 'stat-chip__name', text: 'ЖИЗНЬ' }),
      h('span', { class: 'stat-chip__value', text: String(hp) })
    ]));
    const ability = (cls.ability && typeof cls.ability === 'object') ? cls.ability : E.abilityById(cls.ability);
    $('#hero-hint').textContent =
      'Умение: ' + ability.icon + ' ' + ability.name + ' — ' + ability.desc +
      ' Доступно раз в ' + E.ABILITY_COOLDOWN + ' хода. Бросок: d20 + характеристика против сложности, 20 — крит, 1 — провал.';
  }

  /* ---------------------------------------------------------- */
  /* Старт игры                                                 */
  /* ---------------------------------------------------------- */
  async function startAdventure() {
    if (State.starting) return;
    if (State.heroRetryTimer) { clearTimeout(State.heroRetryTimer); State.heroRetryTimer = null; }
    const d = State.draft;
    d.name = $('#hero-name').value.trim() || d.name || 'Безымянный';
    const base = State.pickedScenario || E.SCENARIOS[0];
    const isWorldBuilding = !!(base.custom || base.customGame);
    const game = E.createGame({
      scenarioId: base.id,
      heroName: d.name,
      classId: d.classId,
      raceId: d.raceId,
      originId: d.originId,
      worldConfig: isWorldBuilding ? (State.draftWorld || E.emptyWorldConfig()) : null,
      // героя придумал мастер: играем ровно тем набором, что игрок видел на экране
      heroProfile: State.heroProfile || null,
      // прошлые кампании: пепел, память о героях и открытые варианты
      legacy: Legacy.get(),
      legacyText: Legacy.block()
    });
    game.rules = Object.assign(E.defaultRules(), game.rules || {}, rulesPatch());
    const unlockedPerks = Legacy.merge(State.heroProfile || {}).perks || [];
    const giftNotes = E.applyLegacyGifts(game.hero, game, unlockedPerks.map(x => x.id));
    if (giftNotes.length) E.pushLog(game, { kind: 'gm', text: 'Наследие прошлых жизней: ' + giftNotes.join(', ') });
    if (isWorldBuilding && State.draftWorld && State.draftWorld.gameName) {
      game.scenarioTitle = State.draftWorld.gameName;
      game.title = State.draftWorld.gameName;
    }
    State.game = game;
    State.storage.save(game);
    Sound.tap();
    if (isWorldBuilding && !State.pendingWorld && State.profileRequest) {
      // мастер ещё думает: ждём его (но не бесконечно) — экран не блокируем
      State.starting = true;
      setProfileNote('🧠 Мастер строит мир под эту игру…', { busy: true });
      if (State.heroRequest) await raceTimeout(State.heroRequest, 14000);
      if (!State.pendingWorld) await raceTimeout(State.profileRequest, 30000);
      State.starting = false;
    }
    if (isWorldBuilding && State.pendingWorld) {
      // мир уже собран, пока игрок выбирал героя — не гоняем ИИ второй раз
      const ready = State.pendingWorld;
      State.pendingWorld = null;
      show('game');
      State.busy = false;
      renderGameTop();
      renderActions(null, true);
      paintBackdrop(null, '');
      applyPendingWorld(ready);
      return;
    }
    openGame(game, true, isWorldBuilding);
  }

  /** Ждём обещание не дольше указанного времени: экран героя не должен зависнуть. */
  function raceTimeout(promise, ms) {
    return Promise.race([
      Promise.resolve(promise).catch(() => null),
      new Promise(resolve => setTimeout(() => resolve(null), ms))
    ]);
  }

  /** Применяем заранее собранный мир (вступление + первая сцена). */
  function applyPendingWorld(turn) {
    const g = State.game;
    if (turn.title) { g.title = turn.title; g.scenarioTitle = turn.title; }
    if (turn.goal) g.goal = turn.goal;
    if (turn.world || turn.backstory || (turn.plan && turn.plan.length)) {
      g.intro = { world: turn.world || '', backstory: turn.backstory || '', plan: turn.plan || [] };
    }
    applyTurn(turn, null, true, false);
  }

  /* ---------------------------------------------------------- */
  /* Игровой экран                                              */
  /* ---------------------------------------------------------- */
  function openGame(game, isNew, worldPending) {
    State.game = game;
    State.busy = false;
    State.runFinished = !!game.legacyApplied;
    State.epilogueOpen = false;
    applyTheme(game);
    Voice.syncButton();
    // фон этого места уже нарисован раньше — берём его из кэша, не тратя кадр мастера
    if (game.scene && game.scene.image) {
      const key = game.scene.placeKey || (game.scene.place ? E.placeKey(game, game.scene.place) : '');
      if (key) {
        State.imageKey = key;
        State.imageCache[key] = { url: game.scene.image, source: game.scene.imageSource || 'сохранено', at: Date.now() };
      }
    }
    show('game');
    renderGameTop();
    renderIntro(game.intro);
    renderSceneText(game.scene ? game.scene.text : '');
    const savedOptions = game.scene && game.scene.options;
    renderActions(savedOptions, !(savedOptions && savedOptions.length));
    paintBackdrop(game.scene && game.scene.imagePrompt, game.scene && game.scene.text);

    if (worldPending) {
      buildWorldThenStart();
    } else if (isNew) {
      startOpeningTurn();
    } else if (game.scene && game.scene.image) {
      setSceneImage(game.scene.image, game.scene.imageSource);
    } else if (game.scene) {
      loadSceneImage(game.scene.imagePrompt || game.lastImagePrompt, null, true);
    }
    if (game.hero && game.hero.portrait) showPortrait(game.hero.portrait);
    if (isNew && game.hero) refreshPortrait(false);
    Ambient.sync();
    renderChapter(game);
    // взятая цель могла остаться без финала: игрок закрыл игру между ходом и эпилогом
    if ((game.over || game.ending === 'victory' || game.questDone) && !game.endingSeen) {
      if (game.questDone && !game.ending) { game.ending = 'victory'; State.storage.save(game); }
      showEpilogue();
    }
  }

  function renderGameTop() {
    const g = State.game;
    $('#game-title').textContent = g.title;
    const parts = [];
    if (g.chapter) parts.push(g.chapter);
    parts.push('Ход ' + Math.max(1, g.turn));
    parts.push('❤️ ' + g.hero.hp + '/' + g.hero.maxHp);
    if (g.questDone) parts.push('🏁 цель взята');
    $('#game-sub').textContent = parts.join(' · ');
    const bar = $('#game-hp');
    const pct = Math.max(0, Math.min(100, (g.hero.hp / g.hero.maxHp) * 100));
    bar.style.width = pct + '%';
    bar.dataset.low = pct <= 30 ? '1' : '0';
    $('#game-title').dataset.icon = E.scenarioById(g.scenarioId).icon || '🎲';
  }

  /* --- текст сцены --- */
  let typingTimer = null;
  /** Вступление: о мире, предыстория героя, план отыгрыша и вход в сцену. */
  function renderIntro(intro) {
    const btn = $('#prologue-btn');
    const data = intro || (State.game && State.game.intro) || null;
    const has = !!(data && (data.world || data.backstory || (data.plan && data.plan.length)));
    if (btn) btn.hidden = !has;
    if (!has) return;
    const world = $('#intro-world'), back = $('#intro-back'), plan = $('#intro-plan');
    world.hidden = !data.world;
    if (data.world) $('#intro-world-text').textContent = data.world;
    back.hidden = !data.backstory;
    if (data.backstory) $('#intro-back-text').textContent = data.backstory;
    const steps = data.plan || [];
    plan.hidden = !steps.length;
    const list = clear($('#intro-plan-list'));
    steps.forEach(step => list.appendChild(h('li', { text: step })));
    const sceneCard = $('#intro-scene');
    const firstScene = data.scene || (State.game && State.game.scene && State.game.scene.text) || '';
    if (sceneCard) {
      sceneCard.hidden = !firstScene;
      if (firstScene) $('#intro-scene-text').textContent = firstScene;
    }
    renderPrologueTitle();
  }

  /** Титул пролога: мир, герой и картинка места — как обложка книги. */
  function renderPrologueTitle() {
    const g = State.game;
    if (!g) return;
    const campaign = $('#prologue-campaign');
    const heroLine = $('#prologue-hero');
    if (campaign) campaign.textContent = g.title || 'Своя история';
    if (heroLine) {
      const hh = g.hero || {};
      heroLine.textContent = [hh.icon, hh.name, hh.className, hh.raceName].filter(Boolean).join(' · ')
        .replace(/ · (?=·)/g, ' ');
    }
    const img = $('#prologue-img');
    if (img && img.hidden) {
      const scene = g.scene || {};
      if (scene.image) { img.src = scene.image; img.hidden = false; img.classList.add('is-on'); }
      else if (Backdrop) {
        try {
          const kind = E.sceneKindFromText([scene.text, g.title, g.goal].filter(Boolean).join(' '));
          const url = Backdrop.toDataUrl({ kind, palette: paletteFor(g, E.scenarioById(g.scenarioId)), seed: State.backdropSeed || 7 });
          if (url) { img.src = url; img.hidden = false; img.classList.add('is-on'); }
        } catch (e) { /* без картинки — не беда */ }
      }
    }
  }

  /** Пролог: показываем один раз на старте, дальше он доступен кнопкой. */
  function openPrologue() {
    const box = $('#prologue');
    const data = (State.game && State.game.intro) || null;
    if (!box || !data || !box.hidden) return;
    renderIntro(data);
    box.hidden = false;
    State.prologueOpen = true;
  }

  function closePrologue() {
    const box = $('#prologue');
    if (!box || box.hidden) return;
    box.hidden = true;
    State.prologueOpen = false;
    if (State.game) {
      State.game.introSeen = true;
      State.storage.save(State.game);
    }
    const panel = $('#panel');
    if (panel) panel.scrollTop = 0;
    renderChapter(State.game);
  }

  /**
   * Печать текста мастера: не рывками, а волной — примерно 22 мс на знак.
   * Тап по тексту показывает его целиком, если ждать не хочется.
   */
  function renderSceneText(text, opts) {
    const o = Object.assign({ typewriter: false, streaming: false }, opts || {});
    const box = $('#scene-text');
    clear(box);
    if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
    const p = h('div', { class: 'scene-text__body', html: formatText(text || '') });
    box.appendChild(p);
    $('#panel').scrollTop = 0;
    if (o.streaming) {
      // мастер печатает ответ: текст растёт на глазах, курсор показывает, что он ещё пишет
      p.classList.add('is-streaming');
      p.onclick = null;
      $('#panel').scrollTop = $('#panel').scrollHeight;
      return;
    }
    // пока открыт пролог, панель не прокручиваем — игрок читает вступление
    const keepTop = !!State.prologueOpen;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (o.typewriter && text && !reduce) {
      const full = formatText(text);
      const total = Math.min(9000, Math.max(2600, full.length * 24));   // спокойная скорость
      const tick = 40;
      const step = Math.max(1, Math.ceil(full.length / (total / tick)));
      let i = 0;
      p.innerHTML = '';
      const finish = () => {
        if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
        p.innerHTML = full;
      };
      p.title = 'Нажмите, чтобы показать текст целиком';
      p.onclick = finish;
      typingTimer = setInterval(() => {
        i += step;
        p.innerHTML = full.slice(0, i);
        if (i >= full.length) { finish(); return; }
        if (!keepTop) $('#panel').scrollTop = $('#panel').scrollHeight;
      }, tick);
    } else {
      $('#panel').scrollTop = 0;
    }
  }

  /** Пока мастер печатает ответ, сцена показывается по мере появления текста. */
  function previewSceneStream(full) {
    if (!full) { stopScenePreview(); return; }
    const scene = E.extractPartialField(full, 'scene') || E.extractPartialField(full, 'opening') || E.extractPartialField(full, 'world');
    if (!scene) return;
    State.streamPreview = true;
    renderSceneText(scene, { streaming: true });
  }
  function stopScenePreview() {
    State.streamPreview = false;
  }

  function renderLog() {
    const g = State.game;
    const wrap = clear($('#log-list'));
    const toggle = $('#log-toggle');
    const entries = g.log.slice(0, -1).slice(-14);
    const total = Math.max(0, g.log.length - 1);
    if (!entries.length) {
      $('#log-wrap').hidden = true;
      toggle.hidden = true;
      return;
    }
    toggle.hidden = false;
    toggle.textContent = $('#log-wrap').hidden ? 'История (' + total + ')' : 'Скрыть историю';
    entries.reverse().forEach(e => {
      wrap.appendChild(h('div', { class: 'log-entry log-entry--' + (e.kind || 'gm') }, [
        e.kind === 'action'
          ? h('div', { class: 'log-entry__action', text: '➤ ' + e.text })
          : h('div', { class: 'log-entry__gm', text: e.text }),
        e.meta ? h('div', { class: 'log-entry__meta', text: e.meta }) : null,
        (e.notes && e.notes.length)
          ? h('div', { class: 'log-entry__notes' }, e.notes.map(n => h('span', { text: n.icon + ' ' + n.text })))
          : null
      ]));
    });
  }

  /* --- умение + варианты действий --- */
  function renderActions(options, loading) {
    const wrap = clear($('#actions'));
    const g = State.game;
    if (g && g.hero.ability) {
      const a = g.hero.ability;
      const cd = a.ready ? '' : ' (через ' + a.cooldown + ')';
      wrap.appendChild(h('button', {
        class: 'ability-btn' + (a.ready ? '' : ' is-cooling'),
        type: 'button', disabled: a.ready ? null : 'disabled',
        onclick: () => onUseAbility()
      }, [
        h('span', { class: 'ability-btn__icon', text: a.icon }),
        h('span', { class: 'ability-btn__name', text: a.name + cd }),
        h('span', { class: 'ability-btn__desc', text: a.desc })
      ]));
    }
    if (loading || !options || !options.length) {
      // заготовки кнопок: видно, где появятся варианты, и низ не пустует
      const placeholders = Math.max(3, (options && options.length) || 3);
      for (let i = 0; i < placeholders; i++) {
        wrap.appendChild(h('div', { class: 'action-btn action-btn--ghost', 'aria-hidden': 'true' }, [
          h('span', { class: 'ghost-line ghost-line--wide' }),
          h('span', { class: 'ghost-line ghost-line--narrow' })
        ]));
      }
      return;
    }
    options.forEach(opt => {
      const stat = E.statById(opt.stat);
      const mod = g.hero.stats[opt.stat] || 0;
      const diff = E.difficultyById(opt.difficulty);
      const buff = g.hero.buff || 0;
      const totalMod = mod + buff;
      const advantage = !!g.hero.advantage;
      const chance = Math.round(E.successChance(totalMod, opt.dc, advantage) * 100);
      const meta = [
        h('span', { class: 'tag', style: '--c:' + diff.color, text: diff.label }),
        h('span', { class: 'tag tag--stat', title: stat.hint, text: stat.icon + ' ' + stat.short + ' +' + mod + (buff ? ' (+' + buff + ')' : '') })
      ];
      if (advantage) meta.push(h('span', { class: 'tag tag--adv', text: 'преимущество' }));
      meta.push(h('span', { class: 'tag tag--chance', title: 'шанс успеха', text: chance + '%' }));
      wrap.appendChild(h('button', {
        class: 'action-btn', type: 'button',
        onclick: () => onActionChosen(opt)
      }, [
        h('span', { class: 'action-btn__text', text: opt.text }),
        h('span', { class: 'action-btn__meta' }, meta)
      ]));
    });
  }

  /* --- мгновенный фон + догрузка ИИ-картинки --- */
  /**
   * Мгновенный фон: тип местности + кто в кадре.
   * Силуэты героя, противников и предметов берём прямо из текста сцены,
   * чтобы картинка совпадала с тем, что рассказывает мастер.
   */
  function paintBackdrop(prompt, sceneText, opts) {
    const g = State.game;
    if (!g || !Backdrop) return;
    const o = opts || {};
    const s = E.scenarioById(g.scenarioId);
    const narration = [sceneText, prompt, g.scene && g.scene.npc, g.goal].filter(Boolean).join(' ');
    const kind = E.sceneKindFromText(narration);
    const actors = E.sceneActors(narration);
    if (!o.keepSeed || !State.backdropSeed) State.backdropSeed = E.rnd.seed();
    try {
      // нижний слой: место и свет. Фигуры и погода живут на отдельном холсте,
      // поэтому фон можно оставить, а происходящее — сменить.
      Backdrop.draw($('#scene-canvas'), { kind, palette: paletteFor(g, s), seed: State.backdropSeed });
      const canvas = $('#scene-canvas');
      canvas.dataset.kind = kind;
      canvas.dataset.enemies = actors.enemies.join(',');
    } catch (e) { /* canvas может быть недоступен — не критично */ }
    animateActorsIn();
  }

  /** Оружие героя для силуэта: у каждого класса своё. */
  function heroBackdropWeapon(g) {
    const byClass = { warrior: 'sword', rogue: 'shield', scholar: 'staff', mage: 'staff', wanderer: 'bow', diplomat: 'sword' };
    return byClass[g.hero.classId] || 'sword';
  }

  function setSceneStatus(text, done) {
    const el = $('#scene-status');
    if (!el) return;
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    $('#scene-status-text').textContent = text;
    el.dataset.done = done ? '1' : '0';
  }

  /** Новая картинка проявляется поверх прежней: фон не мигает белым. */
  function setSceneImage(url, source) {
    const layers = [$('#scene-img'), $('#scene-img2')].filter(Boolean);
    if (!layers.length) return;
    const current = layers.find(el => el.classList.contains('is-visible')) || null;
    const next = layers.find(el => el !== current) || current;
    $('#scene-badge').hidden = true;
    setSceneStatus('');
    if (State.game && State.game.scene) {
      State.game.scene.image = url;
      State.game.scene.imageSource = source || '';
    }
    const reveal = () => {
      if (next === current) { next.classList.add('is-visible'); return; }
      next.hidden = false;
      next.classList.add('is-visible');
      if (current) {
        current.classList.remove('is-visible');
        setTimeout(() => { current.hidden = true; current.removeAttribute('src'); }, 700);
      }
      drawActorLayer(0, State.actorProgress);      // поверх картинки фигуры рисуются без затемнения
    };
    if (next.getAttribute('src') === url && next.complete) reveal();
    else {
      next.onload = reveal;
      // сеть может оборваться уже после ответа провайдера: тогда рисуем фон сами
      next.onerror = () => {
        const fallback = localSceneImage();
        if (fallback && !next.dataset.localFallback) {
          next.dataset.localFallback = '1';
          next.src = fallback;
          return;
        }
        if (current) current.classList.add('is-visible');
      };
      next.src = url;
    }
    autosave();
  }

  /**
   * Картинка места: рисуется один раз и переиспользуется. Вернулись в знакомое
   * место — фон остаётся, меняется только слой действия.
   */
  async function loadSceneImage(prompt, action, silent, opts) {
    const g = State.game;
    if (!g) return;
    const o = opts || {};
    const place = (g.scene && g.scene.place) || E.memoryOf(g).place || g.chapter || '';
    const key = place ? E.placeKey(g, place) : E.styleOf(g).id + ':начало';
    const cached = !o.force && State.imageCache[key];
    if (cached && cached.url) {
      State.imageKey = key;
      if (g.scene) { g.scene.placeKey = key; }
      setSceneImage(cached.url, cached.source || 'кэш места');
      return;
    }
    const used = E.placePrompt(g, place, prompt || (g.scene && g.scene.imagePrompt), { noStyle: true });
    if (!silent) setSceneStatus('рисуем место…');
    $('#scene-badge').textContent = 'фон рисуется';
    $('#scene-badge').hidden = false;

    const seed = E.rnd.seed();
    // гонка источников: что ответит быстрее — то и показываем.
    // Как только картинка показана, отставшие попытки больше не меняют подписи.
    let settled = false;
    const res = await API.generateImage({
      prompt: used,
      style: E.styleOf(g).imageStyle,
      aspect: '16:9',
      seed,
      onAttempt: name => {
        if (settled) return;
        const map = { pollinations: 'пробуем другой генератор…', stock: 'подбираем фон…' };
        setSceneStatus(map[name] || 'рисуем место…');
      }
    });
    settled = true;
    if (res.ok) {
      g.usedImagePrompts = (g.usedImagePrompts || []).concat([used]).slice(-12);
      g.lastImagePrompt = used;
      State.imageCache[key] = { url: res.url, source: res.source, at: Date.now() };
      trimImageCache();
      State.imageKey = key;
      if (g.scene) g.scene.placeKey = key;
      setSceneImage(res.url, res.source);
      $('#scene-badge').hidden = true;
      if (res.source === 'stock') {
        $('#scene-badge').textContent = 'запасной фон';
        $('#scene-badge').hidden = false;
      }
    } else {
      setSceneStatus('');
      $('#scene-badge').hidden = true;
      const local = localSceneImage();
      if (local) setSceneImage(local, 'локальный фон');
      else drawActorLayer(0, 1);
      notify('Генератор картинок молчит — сцена нарисована локально', { kind: 'warn', timeout: 5000 });
    }
  }

  /** Локальная картинка сцены: тот же мотив, что на холсте — на случай обрыва связи. */
  function localSceneImage() {
    const g = State.game;
    if (!g || !Backdrop) return '';
    try {
      const canvas = $('#scene-canvas');
      const kind = (canvas && canvas.dataset.kind) || E.sceneKindFromText([g.scene && g.scene.text, g.title, g.goal].filter(Boolean).join(' '));
      return Backdrop.toDataUrl({ kind, palette: paletteFor(g, E.scenarioById(g.scenarioId)), seed: State.backdropSeed || 7 });
    } catch (e) { return ''; }
  }

  /** Кэш мест: держим последние восемь картинок — этого хватает на главу. */
  function trimImageCache() {
    const keys = Object.keys(State.imageCache);
    if (keys.length <= 8) return;
    keys.sort((a, b) => (State.imageCache[a].at || 0) - (State.imageCache[b].at || 0));
    keys.slice(0, keys.length - 8).forEach(k => { delete State.imageCache[k]; });
  }

  /** Строка главы над текстом сцены. */
  function renderChapter(g) {
    const el = $('#scene-chapter');
    if (!el) return;
    const raw = g && (g.chapter || (g.scene && g.scene.chapter));
    const chapter = String(raw || '').replace(/^глава\s*[:\-–—]?\s*/i, '').trim() || String(raw || '');
    if (!chapter || State.prologueOpen) { el.hidden = true; return; }
    el.textContent = 'Глава: ' + chapter;
    el.hidden = false;
  }

  /* ---------------------------------------------------------- */
  /* Анимация броска кубика                                     */
  /* ---------------------------------------------------------- */
  const Dice = (function () {
    const overlay = () => $('#dice-overlay');
    function open() {
      const ov = overlay();
      ov.hidden = false;
      requestAnimationFrame(() => ov.classList.add('is-open'));
      document.body.classList.add('no-scroll');
    }
    function close() {
      const ov = overlay();
      ov.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
      setTimeout(() => { ov.hidden = true; reset(); }, 260);
    }
    function reset() {
      const ov = overlay();
      const box = ov.querySelector('.dice-result');
      box.className = 'dice-result';
      box.innerHTML = '';
      const scene = ov.querySelector('.dice-scene');
      if (scene) scene.className = 'dice-scene';
      const checkEl = ov.querySelector('#dice-check');
      if (checkEl) { checkEl.hidden = true; checkEl.textContent = ''; }
      const cube = ov.querySelector('#die');
      cube.style.transform = '';
      cube.style.animation = '';
      cube.classList.remove('is-rolling');
      ov.querySelectorAll('.die__face').forEach(f => {
        f.removeAttribute('data-final');
        f.textContent = String(E.rnd.int(1, 20));
      });
    }
    function roll(check, hero) {
      return new Promise(resolve => {
        const ov = overlay();
        reset();
        open();
        const cube = ov.querySelector('#die');
        const faces = $$('.die__face', ov);
        const resultBox = ov.querySelector('.dice-result');
        const caption = ov.querySelector('.dice-caption');
        const stat = E.statById(check.stat);
        const diff = E.difficultyForDc(check.dc);
        caption.innerHTML = '';
        caption.appendChild(h('div', { class: 'dice-caption__title', text: 'Проверка: ' + stat.name + ' ' + stat.icon }));
        caption.appendChild(h('div', {
          class: 'dice-caption__sub',
          text: 'Сложность ' + check.dc + ' · ' + diff.label + (check.advantage ? ' · с преимуществом' : '')
        }));

        const duration = E.rnd.int(950, 1550);
        const animName = E.rnd.pick(['dieRollA', 'dieRollB', 'dieRollC']);
        cube.style.animation = animName + ' ' + duration + 'ms ease-in-out both';
        cube.classList.add('is-rolling');

        const flicker = setInterval(() => {
          faces.forEach(f => { if (!f.dataset.final) f.textContent = String(E.rnd.int(1, 20)); });
        }, 70);
        let ticks = 0;
        const tick = setInterval(() => {
          if (ticks++ > duration / 140) { clearInterval(tick); return; }
          Sound.tick();
          vibrate(6);
        }, 140);

        setTimeout(() => {
          clearInterval(flicker); clearInterval(tick);
          faces.forEach(f => { f.removeAttribute('data-final'); f.textContent = String(E.rnd.int(1, 20)); });
          const landed = ov.querySelector('.die__face--front');
          landed.textContent = String(check.roll);
          landed.dataset.final = '1';
          cube.classList.remove('is-rolling');
          cube.style.animation = 'none';
          void cube.offsetWidth;
          cube.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
          Sound.land();
          vibrate(check.outcome === 'crit' ? [30, 40, 90] : 40);

          const ok = check.outcome === 'crit' || check.outcome === 'success';
          resultBox.classList.add('is-in', ok ? 'is-ok' : 'is-bad');
          if (check.outcome === 'crit') resultBox.classList.add('is-crit');
          if (check.outcome === 'fumble') resultBox.classList.add('is-fumble');
          // событие броска: цвет и дрожь кадра на крите, тусклый кадр на провале
          const scene = ov.querySelector('.dice-scene');
          if (scene) {
            // событие броска: крит подсвечивает кадр, провал — приглушает
            if (check.outcome === 'crit') scene.classList.add('is-crit');
            if (!ok) scene.classList.add('is-fail');
          }
          const checkEl = ov.querySelector('#dice-check');
          if (checkEl) {
            const chance = Math.round(E.successChance(check.mod, check.dc, check.advantage) * 100);
            checkEl.hidden = false;
            checkEl.textContent = stat.icon + ' ' + stat.name + ' +' + check.mod +
              ' · сложность ' + check.dc + ' · шанс ' + chance + '%' + (check.advantage ? ' · преимущество' : '');
          }
          resultBox.innerHTML = '';
          resultBox.appendChild(h('div', { class: 'dice-result__value', text: String(check.roll) }));
          const rollText = check.advantage
            ? 'd20 ' + check.rolls.join(' / ') + ' → ' + check.roll + ' + ' + check.mod + ' (' + stat.short + ') = ' + check.total
            : 'd20 ' + check.roll + ' + ' + check.mod + ' (' + stat.short + ') = ' + check.total;
          resultBox.appendChild(h('div', { class: 'dice-result__math', text: rollText + ' против ' + check.dc }));
          resultBox.appendChild(h('div', { class: 'dice-result__label', text: check.label }));
          if (ok) Sound.success(); else Sound.fail();
          const auto = setTimeout(done, ok ? 1500 : 1900);
          function done() { clearTimeout(auto); ov.removeEventListener('click', done); close(); resolve(check); }
          setTimeout(() => ov.addEventListener('click', done, { once: true }), 350);
        }, duration);
      });
    }
    return { roll, close, open };
  })();

  /* ---------------------------------------------------------- */
  /* v6: наследие прошлых кампаний, озвучка, фоновый звук, фон   */
  /* ---------------------------------------------------------- */

  /** Мелкое хранилище поверх localStorage: настройки живут отдельно от сохранений. */
  const Local = {
    get(key, fallback) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    }
  };

  /**
   * Наследие: что осталось от прошлых кампаний. Пепел, летопись героев и
   * открытые варианты (происхождение, классы, вид, дары) — они играбельны сразу.
   */
  const Legacy = {
    get() {
      if (!State.legacy) State.legacy = Object.assign(E.emptyLegacy(), Local.get(E.LEGACY_KEY, {}) || {});
      return State.legacy;
    },
    save(list) { State.legacy = list; Local.set(E.LEGACY_KEY, list); },
    /** Кампания закончилась: пополняем летопись и смотрим, что открылось. */
    finish(game) {
      const res = E.applyRunToLegacy(this.get(), game);
      this.save(res.legacy);
      return res;
    },
    note() {
      const l = this.get();
      return l.runs ? E.legacySummary(l) : '';
    },
    block() {
      const l = this.get();
      return l.runs ? E.legacyBlock(l) : '';
    },
    /** Варианты героя из наследия добавляем к любому набору мастера. */
    merge(profile) {
      if (!profile || profile.legacyMerged) return profile;
      const opts = E.legacyOptions(this.get());
      profile.legacyMerged = true;
      if (opts.classes.length) profile.classes = profile.classes.concat(opts.classes).slice(0, 8);
      if (opts.races.length && profile.showRace !== false) {
        profile.races = (profile.races || []).concat(opts.races).slice(0, 8);
      }
      if (opts.origins.length && profile.showOrigin !== false) {
        profile.origins = (profile.origins || []).concat(opts.origins).slice(0, 8);
      }
      profile.perks = opts.perks;
      return profile;
    }
  };

  /** Озвучка сцены: системный синтез речи, всегда с кнопкой «выключить». */
  const Voice = (function () {
    const supported = typeof window !== 'undefined' && 'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function';
    let ruVoice = null;

    function pick() {
      if (!supported) return null;
      let list = [];
      try { list = window.speechSynthesis.getVoices() || []; } catch (e) { list = []; }
      return list.find(v => /^ru(-|_)?/i.test(v.lang)) || list.find(v => /rus/i.test(v.name)) || null;
    }
    function stop() {
      if (!supported) return;
      try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
    }
    function say(text) {
      if (!supported) return false;
      const clean = String(text || '')
        .replace(/[«»""„“*_#`]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 900);
      if (!clean) return false;
      stop();
      if (!ruVoice) ruVoice = pick();
      const parts = clean.match(/[^.!?…]+[.!?…]*/g) || [clean];
      parts.forEach(part => {
        const piece = part.trim();
        if (!piece) return;
        const u = new window.SpeechSynthesisUtterance(piece);
        if (ruVoice) u.voice = ruVoice;
        u.lang = ruVoice ? ruVoice.lang : 'ru-RU';
        u.rate = 1;
        u.pitch = 1;
        try { window.speechSynthesis.speak(u); } catch (e) { /* noop */ }
      });
      return true;
    }

    function syncButton() {
      const btn = $('#speak-btn');
      if (!btn) return;
      if (!supported) { btn.hidden = true; return; }
      btn.hidden = false;
      const on = !!Settings.data.voice;
      btn.textContent = on ? '🔇 Без озвучки' : '🔊 Озвучить';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-on', on);
    }

    return {
      supported,
      syncButton,
      get on() { return !!Settings.data.voice && supported; },
      set(on) {
        const want = !!on && supported;
        Settings.set({ voice: want });
        syncButton();
        if (want) {
          const g = State.game;
          if (g && g.scene && g.scene.text) say(g.scene.text);
        } else stop();
      },
      toggle() { this.set(!this.on); },
      /** Новая сцена: читаем её, если игрок включил озвучку. */
      scene(text) { if (this.on) say(text); },
      stop
    };
  })();

  /**
   * Фоновый звук: тихий гул и ветер под стиль игры. Живёт только на игровом
   * экране и только пока включён в настройках — выключается одной галочкой.
   */
  const Ambient = (function () {
    const PROFILES = {
      grimwood: { drone: 74, wind: 240, gain: 0.045 },
      neon: { drone: 58, wind: 190, gain: 0.04 },
      parchment: { drone: 92, wind: 320, gain: 0.045 },
      cosmos: { drone: 46, wind: 150, gain: 0.038 },
      desert: { drone: 68, wind: 300, gain: 0.05 },
      noir: { drone: 52, wind: 210, gain: 0.04 }
    };
    let ctx = null, nodes = null;

    const profile = () => {
      const id = State.game && State.game.style ? State.game.style.id : 'grimwood';
      return PROFILES[id] || PROFILES.grimwood;
    };
    const allowed = () => !!(Settings.data.ambient && !Settings.data.muted && State.game &&
      document.body.dataset.screen === 'game' && !document.hidden);

    function build() {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) ctx = new AC();
      const p = profile();
      const master = ctx.createGain();
      master.gain.value = 0.0001;
      const oscA = ctx.createOscillator(); oscA.type = 'sine'; oscA.frequency.value = p.drone;
      const oscB = ctx.createOscillator(); oscB.type = 'triangle'; oscB.frequency.value = p.drone * 1.5;
      const gB = ctx.createGain(); gB.gain.value = 0.32;
      const len = Math.floor(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const filter = ctx.createBiquadFilter(); filter.type = 'bandpass';
      filter.frequency.value = p.wind; filter.Q.value = 0.7;
      const noiseGain = ctx.createGain(); noiseGain.gain.value = 0.22;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05;
      const lfoGain = ctx.createGain(); lfoGain.gain.value = p.gain * 0.4;
      lfo.connect(lfoGain).connect(master.gain);
      oscA.connect(master);
      oscB.connect(gB).connect(master);
      noise.connect(filter).connect(noiseGain).connect(master);
      master.connect(ctx.destination);
      oscA.start(); oscB.start(); noise.start(); lfo.start();
      return { master, p };
    }

    function start() {
      if (!allowed()) return;
      if (!nodes) nodes = build();
      if (!nodes || !ctx) return;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* noop */ } }
      const t = ctx.currentTime;
      const g = nodes.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(nodes.p.gain, t + 2.4);
    }
    function stop(instant) {
      if (!nodes || !ctx) return;
      const t = ctx.currentTime;
      const g = nodes.master.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.exponentialRampToValueAtTime(0.0001, t + (instant ? 0.05 : 1.1));
    }
    return {
      sync() { if (allowed()) start(); else stop(true); },
      stop() { stop(true); }
    };
  })();

  /** Стиль игры: палитра для локального фона (мастер выбрал его один раз на кампанию). */
  function paletteFor(g, scenario) {
    const style = E.styleOf(g);
    return (style && style.palette && style.palette.length >= 3) ? style.palette : (scenario && scenario.palette);
  }

  /**
   * Слой действия: погода и фигуры поверх фона локации. Фон при этом
   * остаётся прежним — меняется только то, что происходит в кадре.
   */
  function drawActorLayer(time, progress) {
    const g = State.game;
    if (!g || !Backdrop) return;
    const canvas = $('#scene-actors');
    if (!canvas) return;
    const s = E.scenarioById(g.scenarioId);
    const hasImage = !!(g.scene && g.scene.image);
    const narration = [g.scene && g.scene.text, g.scene && g.scene.npc, g.goal].filter(Boolean).join(' ');
    const kind = E.sceneKindFromText(narration);
    const actors = Object.assign(E.sceneActors(narration), {
      hero: { shape: 'human', weapon: heroBackdropWeapon(g), shield: ['warrior', 'lg-heir'].indexOf(g.hero.classId) >= 0 }
    });
    try {
      Backdrop.drawOver(canvas, {
        kind, seed: State.backdropSeed, actors, palette: paletteFor(g, s),
        over: hasImage, time: time || 0,
        progress: progress === undefined ? State.actorProgress : progress
      });
    } catch (e) { /* canvas может быть недоступен — не критично */ }
  }

  /** Фигуры появляются мягко: 0 → 1 за полсекунды. */
  function animateActorsIn() {
    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const now = () => ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
    State.actorProgress = 0;
    const tick = () => {
      const k = Math.min(1, (now() - t0) / 550);
      State.actorProgress = k;
      drawActorLayer(0, k);
      if (k < 1) requestAnimationFrame(tick);
      else State.actorProgress = 1;
    };
    requestAnimationFrame(tick);
  }

  /** Живой фон: медленный дрейф дымки и погоды поверх статичного слоя. */
  const Living = (function () {
    let raf = null, last = 0, t0 = 0;
    let reduced = false;
    try { reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { reduced = false; }
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      if (!t0) t0 = ts;
      if (ts - last < 90) return;                  // ~11 кадров в секунду: плавно и без нагрузки
      last = ts;
      if (document.hidden || reduced) return;
      if (!State.game || document.body.dataset.screen !== 'game') return;
      if (State.busy) return;                      // пока мастер думает, кадр не трогаем
      drawActorLayer(ts - t0);
    }
    return {
      start() { if (!raf) { t0 = 0; last = 0; raf = requestAnimationFrame(frame); } },
      stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } },
      get reduced() { return reduced; }
    };
  })();

  /** Тема интерфейса: либо из настроек, либо та, что выбрана игре. */
  function applyTheme(game) {
    const chosen = Settings.data.theme;
    const theme = (chosen && chosen !== 'auto') ? chosen
      : ((game && E.styleOf(game).theme) || 'night');
    document.body.dataset.theme = theme;
  }

  /** Тон и жёсткость из настроек — правила новой кампании и текущей. */
  function rulesPatch() {
    return {
      tone: Settings.data.tone || 'grim',
      rating: Settings.data.rating || 'normal',
      voice: !!Settings.data.voice,
      ambient: Settings.data.ambient !== false
    };
  }

  /** Настройки изменили по ходу игры: применяем к текущей кампании. */
  function applyRulesLive() {
    applyTheme(State.game);
    Voice.syncButton();
    Voice.set(Settings.data.voice);
    const g = State.game;
    if (g) {
      g.rules = Object.assign(E.defaultRules(), g.rules || {}, rulesPatch());
      g.rules.defeat = (g.rules.defeat === 'hard') ? 'hard' : 'cost';
      autosave();
    }
    Ambient.sync();
  }

  /** Портрет героя: одна картинка на кампанию, показываем в шапке и в карточке. */
  async function refreshPortrait(force) {
    const g = State.game;
    if (!g || !g.hero) return;
    if (!force && g.hero.portrait) { showPortrait(g.hero.portrait); return; }
    if (State.portraitLoading) return;
    State.portraitLoading = true;
    try {
      const res = await API.generateImage({
        prompt: E.portraitPrompt(g),
        style: E.styleOf(g).imageStyle,
        aspect: '1:1',
        width: 384, height: 384,
        seed: State.backdropSeed
      });
      if (res.ok) {
        g.hero.portrait = res.url;
        showPortrait(res.url);
        autosave();
      }
    } catch (e) { /* портрет — украшение, без него игра идёт */ }
    State.portraitLoading = false;
  }
  function showPortrait(url) {
    State.portrait = url || '';
    const el = $('#game-avatar');
    if (!el) return;
    if (!url) { el.hidden = true; return; }
    el.hidden = false;
    el.style.backgroundImage = 'url("' + url + '")';
  }

  /* ---------------------------------------------------------- */
  /* Ходы                                                       */
  /* ---------------------------------------------------------- */
  const statusText = kind => ({
    retry: 'Мастер не ответил — пробуем ещё раз…',
    offline: 'Локальный мастер ведёт игру…',
    server: 'Мастер думает (канал сервера)…',
    direct: 'Мастер описывает последствия…'
  }[kind] || 'Мастер описывает последствия…');

  /** «Мастер думает» показываем в шапке рядом с названием игры. */
  function setTurnStatus(text) {
    const box = $('#game-status');
    if (!box) return;
    const label = $('#game-status-text');
    if (text) {
      label.textContent = text;
      box.hidden = false;
    } else {
      box.hidden = true;
    }
  }

  /** Мастер молчит дольше обычного — честно предупреждаем, что дальше игра пойдёт сама. */
  function slowMasterHint() {
    clearTimeout(State.slowHintTimer);
    State.slowHintTimer = setTimeout(() => {
      if (!State.busy) return;
      setTurnStatus('Мастер молчит — если не ответит за полминуты, ход продолжит локальный мастер…');
    }, 15000);
  }
  function clearSlowMasterHint() {
    clearTimeout(State.slowHintTimer);
    State.slowHintTimer = null;
  }

  /** Пока ждём ответ, внизу стоят «заготовки» будущих кнопок. */
  function setActionsLoading(text) {
    setTurnStatus(text || 'Мастер думает…');
    renderActions(null, true);
  }

  /** Что сказать в строке мастера, пока он думает: у героя и мира разные ожидания. */
  const profilePhaseText = (phase, kind) => {
    if (kind === 'retry') return '🧠 Мастер занят — пробуем снова…';
    return phase === 'hero'
      ? '🧠 Мастер придумывает героя под эту игру…'
      : '🧠 Мастер строит мир под эту игру…';
  };

  /**
   * Хук состояния для запросов. Фаза 'hero'/'world' — мастер занят экраном героя,
   * без фазы (ходы игры) — статус идёт только в шапку игрового экрана.
   */
  const statusHook = phase => kind => {
    const text = statusText(kind);
    setTurnStatus(text);
    if (phase) setProfileNote(profilePhaseText(phase, kind), { busy: true });
  };

  /** Сборка своего мира / своей игры: ИИ придумывает название, цель и первую сцену. */
  async function buildWorldThenStart() {
    const g = State.game;
    State.busy = true;
    showLoading('Мастер строит мир…', 'Название, цель и первая сцена');
    setActionsLoading('Мастер строит мир…');
    const turn = await API.generateWorld(g, {
      onStatus: statusHook(),
      onDelta: full => previewSceneStream(full),
      onPreviewEnd: stopScenePreview
    });
    if (turn.title) { g.title = turn.title; g.scenarioTitle = turn.title; }
    if (turn.goal) g.goal = turn.goal;
    hideLoading();
    State.busy = false;
    applyTurn(turn, null, true, true);
    if (turn.source && turn.source.indexOf('server') === 0) {
      notify('Мир собран. Приятной игры!', { kind: 'info', timeout: 3000 });
    }
  }

  async function startOpeningTurn() {
    const g = State.game;
    State.busy = true;
    setActionsLoading('Мастер готовит первую сцену…');
    slowMasterHint();
    const turn = await API.generateOpening(g, {
      onStatus: statusHook(),
      onDelta: full => previewSceneStream(full),
      onPreviewEnd: stopScenePreview
    });
    applyTurn(turn, null, true);
  }

  async function onActionChosen(opt) {
    const g = State.game;
    if (State.busy || g.over) return;
    State.busy = true;
    Sound.unlock();
    const baseMod = g.hero.stats[opt.stat] || 0;
    const buff = g.hero.buff || 0;
    const advantage = !!g.hero.advantage;
    const check = E.resolveCheck({ stat: opt.stat, dc: opt.dc, bonus: baseMod + buff, advantage });
    E.pushLog(g, {
      kind: 'action',
      text: opt.text,
      meta: 'd20 ' + check.roll + ' + ' + check.mod + ' = ' + check.total + ' против ' + check.dc + ' · ' + check.label
    });
    autosave();
    await Dice.roll(check, g.hero);
    const extra = [];
    if (advantage) extra.push('Герой применил умение и бросал с преимуществом.');
    if (buff) extra.push('К броску добавлен бонус умения +' + buff + '.');
    setActionsLoading('Мастер описывает последствия…');
    slowMasterHint();
    const turn = await API.generateTurn(g, opt, check, {
      onStatus: statusHook(),
      extra: extra.join(' '),
      onDelta: full => previewSceneStream(full),
      onPreviewEnd: stopScenePreview
    });
    applyTurn(turn, opt, false);
  }

  async function onUseAbility() {
    const g = State.game;
    if (State.busy || g.over) return;
    const res = E.useAbility(g);
    if (!res.ok) return;
    Sound.ability();
    vibrate([15, 30, 15]);
    res.notes.forEach(n => notify(n.icon + ' ' + n.text, { kind: n.type === 'hp' ? 'good' : 'info', timeout: 3600 }));
    renderActions(g.scene ? g.scene.options : null, false);
    renderGameTop();
    autosave();
  }

  function applyTurn(turn, action, isOpening, isWorldBuild) {
    clearSlowMasterHint();
    const g = State.game;
    if (!isWorldBuild) g.turn = (g.turn || 0) + 1;
    const notes = E.applyEffects(g, turn.effects);
    if (turn.chapter) g.chapter = turn.chapter;
    if (turn.npc) E.pushLog(g, { kind: 'npc', text: turn.npc });
    E.pushLog(g, {
      kind: 'gm',
      text: turn.scene,
      notes: notes,
      offline: !!turn.offline,
      chapter: turn.chapter || ''
    });
    if (turn.world || turn.backstory || (turn.plan && turn.plan.length)) {
      g.intro = { world: turn.world || '', backstory: turn.backstory || '', plan: turn.plan || [], scene: turn.scene };
    }
    // память кампании: мастер помнит место, людей, нити и прошлые зачины
    E.rememberTurn(g, turn, action);
    const place = String(turn.place || E.memoryOf(g).place || turn.chapter || g.chapter || '').trim();
    const placeKey = place ? E.placeKey(g, place) : '';
    const samePlace = !!placeKey && placeKey === State.imageKey;   // место то же — фон оставляем
    g.scene = {
      text: turn.scene,
      options: turn.options,
      npc: turn.npc || '',
      place,
      placeKey,
      chapter: turn.chapter || g.chapter || '',
      partial: !!turn.partial,
      imagePrompt: turn.imagePrompt || E.composeSceneImagePrompt(g, {
        sceneText: turn.scene, npc: turn.npc, action
      }),
      image: samePlace && g.scene ? (g.scene.image || '') : '',
      imageSource: samePlace && g.scene ? (g.scene.imageSource || '') : ''
    };
    // «поражение с ценой»: проигрыш отнимает силы и вещи, но история идёт дальше
    if (!isWorldBuild && !g.over && g.hero.hp <= 0) handleHeroDown(g, notes);
    if (!isWorldBuild && g.questDone && !g.ending) g.ending = 'victory';
    // после хода: сбрасываем бафы и тикаем перезарядку умения
    if (!isWorldBuild) E.tickCooldowns(g);
    State.storage.save(g);
    State.busy = false;
    setTurnStatus('');
    renderGameTop();
    renderLog();
    renderIntro(g.intro);
    // первая сцена открывается прологом: сначала мир, потом предыстория, потом сцена и план
    if (g.intro && !g.introSeen && !State.prologueOpen) openPrologue();
    const streamed = State.streamPreview;
    stopScenePreview();
    renderSceneText(turn.scene, { typewriter: !streamed });
    renderChapter(g);
    const npcEl = $('#scene-npc');
    if (turn.npc) { npcEl.textContent = '👤 ' + turn.npc; npcEl.hidden = false; }
    else npcEl.hidden = true;
    renderActions(turn.options, false);

    if (turn.offline) {
      notifyAfterDice('ИИ-мастер недоступен — ход ведёт локальный мастер', { kind: 'warn', timeout: 5200 });
    }
    if (turn.partial) {
      notifyAfterDice('Ответ мастера оборвался — сцену собрали из того, что дошло', { kind: 'info', timeout: 4200 });
    }
    if (notes && notes.length) {
      notes.forEach(n => notifyAfterDice(n.icon + ' ' + n.text, {
        kind: n.type === 'hp' && /−|-/.test(n.text) ? 'bad' : 'info', timeout: 3400
      }));
    }

    // слои сцены: фон места — снизу, действие — сверху
    if (samePlace) {
      drawActorLayer(0, 1);                     // место узнали: меняем только происходящее
      setSceneStatus('');
    } else {
      paintBackdrop(g.scene.imagePrompt, turn.scene);
      loadSceneImage(g.scene.imagePrompt, action, false);
    }
    if (!State.portrait && g.hero) refreshPortrait(false);
    Voice.scene(turn.scene);
    Ambient.sync();
    if (g.over || g.ending === 'victory') setTimeout(showEpilogue, 950);
  }

  /**
   * Здоровье кончилось. По умолчанию это не конец игры, а цена: герой теряет
   * вещь и часть сил. Конец наступает после нескольких провалов или при
   * жёстких правилах. Перерождённый из наследия встаёт один раз за кампанию.
   */
  function handleHeroDown(g, notes) {
    const res = E.resolveDefeat(g);
    if (res.kind === 'setback') {
      notes.push({ icon: '🩸', type: 'hp', text: res.note + ' · здоровье ' + g.hero.hp + '/' + g.hero.maxHp });
      E.pushLog(g, { kind: 'gm', text: res.note });
      return res;
    }
    if (g.legacy && g.legacy.secondWind && !g.legacy.usedSecondWind) {
      g.legacy.usedSecondWind = true;
      g.over = false;
      g.hero.hp = 1;
      E.rememberFact(g, 'герой умирал — и вернулся');
      notes.push({ icon: '🕊️', type: 'hp', text: 'Перерождение: герой встаёт с 1 здоровьем' });
      E.pushLog(g, { kind: 'gm', text: 'Что-то в его крови не отпустило героя — он открывает глаза.' });
      return { kind: 'second-wind' };
    }
    g.over = true;
    g.ending = 'downfall';
    E.pushLog(g, { kind: 'gm', text: 'История героя закончилась здесь.' });
    return res;
  }

  function autosave() {
    if (State.game) State.storage.save(State.game);
  }

  /* ---------------------------------------------------------- */
  /* Оверлей ожидания                                           */
  /* ---------------------------------------------------------- */
  function showLoading(title, text) {
    $('#loading-title').textContent = title || 'Секунду…';
    $('#loading-text').textContent = text || '';
    const ov = $('#loading');
    ov.hidden = false;
    requestAnimationFrame(() => ov.classList.add('is-open'));
  }
  function hideLoading() {
    const ov = $('#loading');
    ov.classList.remove('is-open');
    setTimeout(() => { ov.hidden = true; }, 240);
  }

  /* ---------------------------------------------------------- */
  /* Конец игры и модальные окна                                */
  /* ---------------------------------------------------------- */
  function showGameOver() {
    showEpilogue();
  }

  /* ---------------------------------------------------------- */
  /* Эпилог: чем кончилась кампания                             */
  /* ---------------------------------------------------------- */
  function epilogueStat(label, value) {
    return h('div', { class: 'epilogue__stat' }, [
      h('b', { text: value }),
      h('span', { text: label })
    ]);
  }

  async function showEpilogue() {
    const g = State.game;
    const box = $('#epilogue');
    if (!g || !box || !box.hidden) return;
    Voice.stop();
    Ambient.stop();
    setTurnStatus('');
    State.epilogueOpen = true;
    const victory = g.ending === 'victory' || !!g.questDone;
    box.hidden = false;
    // кампания сразу уходит в летопись: пепел, память и открытия считаются локально,
    // текст мастера приходит следом и просто дописывает страницу
    let legacyRes = null;
    if (!g.legacyApplied) {
      g.legacyApplied = true;
      legacyRes = Legacy.finish(g);
      State.storage.save(g);
    }
    const finish = res => renderEpiloguePage(g, res, legacyRes, victory);
    // сразу показываем финал локальными словами: страница не должна ждать канал,
    // а когда мастер ответит — текст просто заменится
    finish({ title: '', text: E.epilogueText(g) });
    let res = { title: '', text: '' };
    try { res = await API.generateEpilogue(g, {}); } catch (e) { res = { title: '', text: '' }; }
    // без канала финал пишет сама игра: страница не должна оставаться заглушкой
    if (!res || !res.text) res = { title: (res && res.title) || '', text: E.epilogueText(g) };
    finish(res);
  }

  /** Страница финала: текст (или заглушка), числа кампании и вести о наследии. */
  function renderEpiloguePage(g, res, legacyRes, victory) {
    const body = clear($('#epilogue-body'));
    $('#epilogue-title').textContent = (res && res.title) || (victory ? 'Финал' : 'Конец истории');
    if (res && res.text) {
      String(res.text).split(/\n{2,}/).forEach(par => {
        if (par.trim()) body.appendChild(h('p', { text: par.trim() }));
      });
    } else {
      body.appendChild(h('p', { class: 'muted', text: 'Мастер дописывает последнюю страницу…' }));
    }
    body.scrollTop = 0;
    const m = E.memoryOf(g);
    body.appendChild(h('div', { class: 'epilogue__stats' }, [
      epilogueStat('ходов', String(g.turn || 1)),
      epilogueStat('знакомых', String(m.npcs.length)),
      epilogueStat('осталось в памяти', String(m.facts.length)),
      epilogueStat('пепел', '+' + (legacyRes ? legacyRes.ashes : 0))
    ]));
    if (legacyRes && legacyRes.opened.length) {
      const names = E.LEGACY_UNLOCKS.filter(u => legacyRes.opened.indexOf(u.id) >= 0).map(u => u.title);
      body.appendChild(h('p', { class: 'epilogue__unlock', text: '🕯 Для будущих жизней открыто: ' + names.join(', ') }));
    }
    const sum = Legacy.note();
    if (sum) body.appendChild(h('p', { class: 'muted small', text: sum }));
    const next = E.legacyNextUnlock(Legacy.get());
    if (next) {
      const left = Math.max(1, next.need - Legacy.get().runs);
      body.appendChild(h('p', { class: 'muted small', text: 'Следующее открытие: «' + next.title + '» — ' + next.desc + ' Осталось кампаний: ' + left + '.' }));
    }
  }

  function closeEpilogue() {
    const box = $('#epilogue');
    if (!box || box.hidden) return;
    box.hidden = true;
    State.epilogueOpen = false;
    if (State.game) {
      State.game.introSeen = true;
      State.game.endingSeen = true;
      State.storage.save(State.game);
    }
    renderChapter(State.game);
    Ambient.sync();
  }

  function restartSameScenario() {
    const old = State.game;
    State.pickedScenario = E.scenarioById(old.scenarioId);
    State.draftWorld = old.worldConfig || null;
    State.draft.classId = old.hero.classId;
    State.draft.raceId = old.hero.raceId;
    State.draft.originId = old.hero.originId;
    const game = E.createGame({
      scenarioId: old.scenarioId, heroName: old.hero.name,
      classId: old.hero.classId, raceId: old.hero.raceId, originId: old.hero.originId,
      worldConfig: old.worldConfig,
      heroProfile: State.heroProfile || null,
      legacy: Legacy.get(),
      legacyText: Legacy.block()
    });
    game.rules = Object.assign(E.defaultRules(), old.rules || {}, rulesPatch());
    State.game = game;
    State.storage.save(game);
    const worldPending = !!(old.worldConfig && (old.worldConfig.genre || old.worldConfig.gameName));
    openGame(game, !worldPending, worldPending);
  }

  function openModal(opts) {
    const ov = $('#modal');
    const box = $('#modal-box');
    clear(box);
    box.appendChild(h('div', { class: 'modal__icon', text: opts.icon || '🎲' }));
    box.appendChild(h('h3', { class: 'modal__title', text: opts.title || '' }));
    if (opts.text) box.appendChild(h('p', { class: 'modal__text', text: opts.text }));
    if (opts.content) box.appendChild(opts.content);
    const actions = h('div', { class: 'modal__actions' });
    (opts.actions || []).forEach(a => {
      actions.appendChild(h('button', { class: 'btn btn--' + (a.kind || 'ghost'), type: 'button', text: a.label, onclick: a.onClick }));
    });
    if (opts.cancelLabel !== null) {
      actions.appendChild(h('button', { class: 'btn btn--quiet', type: 'button', text: opts.cancelLabel || 'Отмена', onclick: closeModal }));
    }
    box.appendChild(actions);
    ov.hidden = false;
    requestAnimationFrame(() => ov.classList.add('is-open'));
  }
  function closeModal() {
    const ov = $('#modal');
    ov.classList.remove('is-open');
    setTimeout(() => { ov.hidden = true; }, 240);
  }

  function confirmCloseGame() {
    const g = State.game;
    if (!g) { show('menu'); return; }
    openModal({
      title: 'Закрыть игру?',
      text: 'Прогресс сохраняется автоматически после каждого хода — вернуться можно из «Моих игр».',
      icon: '🚪',
      cancelLabel: 'Продолжить игру',
      actions: [{
        label: 'Сохранить и выйти', kind: 'primary', onClick: () => {
          State.storage.save(g);
          closeModal();
          State.game = null;
          State.busy = false;
          setTurnStatus('');
          show('menu');
          toast('Игра сохранена в «Мои игры»', { kind: 'good' });
        }
      }]
    });
  }

  /* ---------------------------------------------------------- */
  /* Карточка героя                                             */
  /* ---------------------------------------------------------- */
  function openHeroSheet() {
    const g = State.game;
    if (!g) return;
    const hh = g.hero;
    const portraitUrl = State.portrait || hh.portrait || '';
    const titleRow = h('div', { class: 'hero-sheet__row' }, [
      h('span', { class: 'hero-sheet__name', text: hh.icon + ' ' + hh.name }),
      h('span', { class: 'hero-sheet__arch', text: hh.className })
    ]);
    const content = h('div', { class: 'hero-sheet' }, [
      portraitUrl
        ? h('div', { class: 'hero-sheet__top' }, [h('img', { class: 'hero-sheet__portrait', src: portraitUrl, alt: 'Портрет героя' }), titleRow])
        : titleRow,
      h('div', { class: 'hero-sheet__tags' }, [
        h('span', { class: 'tag tag--stat', text: hh.raceIcon + ' ' + hh.raceName }),
        h('span', { class: 'tag', text: hh.originIcon + ' ' + hh.originName }),
        h('span', { class: 'tag tag--chance', text: hh.ability.icon + ' ' + hh.ability.name + (hh.ability.ready ? ' готово' : ' (через ' + hh.ability.cooldown + ')') })
      ]),
      h('div', { class: 'stat-grid' }, E.STATS.map(st => h('div', { class: 'stat-chip' }, [
        h('span', { class: 'stat-chip__icon', text: st.icon }),
        h('span', { class: 'stat-chip__name', text: st.short }),
        h('span', { class: 'stat-chip__value', text: '+' + hh.stats[st.id] })
      ])).concat([
        h('div', { class: 'stat-chip stat-chip--hp' }, [
          h('span', { class: 'stat-chip__icon', text: '❤️' }),
          h('span', { class: 'stat-chip__name', text: 'ЖИЗНЬ' }),
          h('span', { class: 'stat-chip__value', text: hh.hp + '/' + hh.maxHp })
        ])
      ])),
      h('div', { class: 'section-title', text: 'Задача' }),
      h('p', { class: 'muted', text: g.goal + (g.questDone ? ' — выполнено 🏁' : '') }),
      h('div', { class: 'section-title', text: 'Инвентарь' }),
      h('p', { class: 'muted', text: hh.inventory.length ? hh.inventory.join(', ') : 'Пусто' }),
      (hh.hooks && hh.hooks.length) ? h('div', { class: 'section-title', text: 'Личные крючки' }) : null,
      (hh.hooks && hh.hooks.length) ? h('ul', { class: 'hooks' }, hh.hooks.map(x => h('li', { text: x }))) : null
    ]);
    openModal({
      title: 'Герой', icon: '🧝', content, cancelLabel: 'Закрыть',
      actions: [
        { label: portraitUrl ? 'Новый портрет' : 'Нарисовать портрет', kind: 'ghost',
          onClick: () => { closeModal(); refreshPortrait(true); toast('Мастер рисует портрет…', { timeout: 2200 }); } },
        { label: 'Скачать сохранение', kind: 'ghost', onClick: () => exportGame(g) }
      ]
    });
  }

  /* ---------------------------------------------------------- */
  /* Мои игры                                                   */
  /* ---------------------------------------------------------- */
  function renderSaves() {
    const list = clear($('#saves-list'));
    const games = State.storage.list();
    if (!games.length) {
      list.appendChild(h('div', { class: 'empty' }, [
        h('div', { class: 'empty__icon', text: '🎲' }),
        h('p', { text: 'Сохранённых игр пока нет.' }),
        h('p', { class: 'muted', text: 'Начните новую игру — прогресс сохраняется сам.' })
      ]));
      return;
    }
    games.forEach(item => {
      list.appendChild(h('div', { class: 'save-card' + (item.over ? ' is-over' : '') }, [
        h('div', { class: 'save-card__cover', style: 'background-image:' + coverUrl(item.cover) }),
        h('div', { class: 'save-card__body' }, [
          h('div', { class: 'save-card__title', text: item.scenarioTitle }),
          h('div', { class: 'save-card__hero', text: (item.heroIcon || '🎲') + ' ' + item.heroName + ' · ' + (item.heroRace || '') + ' · ' + item.heroArch }),
          h('div', { class: 'save-card__meta', text: 'Ход ' + Math.max(1, item.turn) + ' · ❤️ ' + item.hp + '/' + item.maxHp + ' · ' + timeAgo(item.updatedAt) + (item.over ? ' · погиб' : '') }),
          h('div', { class: 'save-card__actions' }, [
            h('button', {
              class: 'btn btn--primary btn--sm', type: 'button',
              text: item.over ? 'Перечитать финал' : 'Продолжить',
              onclick: () => loadGame(item.id, item.over)
            }),
            h('button', {
              class: 'btn btn--danger btn--sm', type: 'button', text: 'Удалить',
              onclick: () => confirmDelete(item)
            })
          ])
        ])
      ]));
    });
  }

  function timeAgo(ts) {
    const diff = Date.now() - (ts || 0);
    const m = Math.round(diff / 60000);
    if (m < 1) return 'только что';
    if (m < 60) return m + ' мин назад';
    const hh = Math.round(m / 60);
    if (hh < 24) return hh + ' ч назад';
    return Math.round(hh / 24) + ' дн назад';
  }

  function loadGame(id, wasOver) {
    const game = State.storage.load(id);
    if (!game) { toast('Сохранение не найдено', { kind: 'bad' }); return; }
    openGame(game, false);
    if (wasOver) toast('Кампания закончена — можно перечитать финал или начать заново', { kind: 'info', timeout: 3200 });
    else toast('Игра загружена', { kind: 'good' });
  }

  function confirmDelete(item) {
    openModal({
      title: 'Удалить сохранение?',
      text: item.scenarioTitle + ' · ' + item.heroName + ' · ход ' + Math.max(1, item.turn),
      icon: '🗑️',
      actions: [{
        label: 'Удалить', kind: 'danger', onClick: () => {
          State.storage.remove(item.id);
          closeModal();
          renderSaves();
          refreshMenu();
          toast('Удалено', { kind: 'bad' });
        }
      }]
    });
  }

  /* ---------------------------------------------------------- */
  /* Экспорт / импорт                                           */
  /* ---------------------------------------------------------- */
  function download(filename, text) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  }
  function exportGame(game) {
    download('dice-tales-' + (game.id || 'save') + '.json',
      JSON.stringify({ app: 'dice-tales', schema: E.SCHEMA_VERSION, exportedAt: Date.now(), game }, null, 2));
    toast('Файл сохранения скачан', { kind: 'good' });
  }
  function exportAll() {
    const games = State.storage.list().map(it => State.storage.load(it.id)).filter(Boolean);
    download('dice-tales-all-' + Date.now() + '.json',
      JSON.stringify({ app: 'dice-tales', schema: E.SCHEMA_VERSION, exportedAt: Date.now(), games }, null, 2));
    toast('Скачано игр: ' + games.length, { kind: 'good' });
  }
  function importFiles(files) {
    Array.prototype.slice.call(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(String(reader.result));
          const games = data.games ? data.games : (data.game ? [data.game] : []);
          let n = 0;
          games.forEach(g => {
            const m = E.migrate(g);
            if (m && m.id) { State.storage.save(m); n++; }
          });
          if (n) { toast('Импортировано игр: ' + n, { kind: 'good' }); renderSaves(); refreshMenu(); }
          else toast('В файле нет сохранений', { kind: 'warn' });
        } catch (e) { toast('Не удалось прочитать файл', { kind: 'bad' }); }
      };
      reader.readAsText(file);
    });
  }

  /* ---------------------------------------------------------- */
  /* Настройки                                                  */
  /* ---------------------------------------------------------- */
  /** Ряд кнопок-переключателей: выбранный вариант подсвечен. */
  function choiceRow(list, value, onPick) {
    return h('div', { class: 'rules-row' }, list.map(item => h('button', {
      class: 'rules-btn' + (item.id === value ? ' is-on' : ''),
      type: 'button', text: item.title, title: item.hint || '',
      onclick: () => { Sound.tap(); onPick(item.id); }
    })));
  }

  const THEMES = [
    { id: 'auto', title: 'Как в игре', hint: 'оформление подбирается по стилю кампании' },
    { id: 'night', title: 'Ночь', hint: 'тёмно-синий интерфейс' },
    { id: 'neon', title: 'Неон', hint: 'киберпанк-подсветка' },
    { id: 'parchment', title: 'Пергамент', hint: 'тёплые книжные тона' },
    { id: 'oled', title: 'Чёрная', hint: 'экономит батарею на OLED' }
  ];

  function openSettings() {
    const keyInput = h('input', {
      class: 'input', type: 'text',
      value: Settings.data.apiKey || API.getApiKey(), autocomplete: 'off',
      placeholder: 'ключ уже встроен в игру — можно заменить своим'
    });
    const content = h('div', { class: 'settings' }, [
      h('p', { class: 'muted small', text: 'Игра работает без ключей: ИИ-мастер — через сервер или Pollinations, картинки — гонка a0.dev и Pollinations, фон рисуется локально мгновенно.' }),

      h('div', { class: 'section-title', text: 'Тон рассказа' }),
      h('p', { class: 'muted small rules-hint', text: 'Мастер подстраивает голос и исходы под выбранный тон.' }),
      choiceRow(E.TONES, Settings.data.tone, id => {
        Settings.set({ tone: id });
        applyRulesLive();
        closeModal(); openSettings();
        toast('Тон: ' + (E.TONES.find(t => t.id === id) || {}).title, { kind: 'good', timeout: 1800 });
      }),

      h('div', { class: 'section-title', text: 'Жёсткость' }),
      choiceRow(E.RATINGS, Settings.data.rating, id => {
        Settings.set({ rating: id });
        applyRulesLive();
        closeModal(); openSettings();
        toast('Жёсткость: ' + (E.RATINGS.find(r => r.id === id) || {}).title, { kind: 'good', timeout: 1800 });
      }),

      h('div', { class: 'section-title', text: 'Озвучка и звук' }),
      choiceRow([
        { id: 'voice-on', title: '🗣 Озвучка сцены', hint: 'браузер читает текст мастера вслух' },
        { id: 'voice-off', title: '🚫 Без озвучки', hint: 'текст только глазами' }
      ], Settings.data.voice ? 'voice-on' : 'voice-off', id => {
        Voice.set(id === 'voice-on');
        closeModal(); openSettings();
      }),
      Voice.supported ? null : h('p', { class: 'muted small', text: 'Браузер не умеет синтез речи — озвучка недоступна.' }),
      choiceRow([
        { id: 'amb-on', title: '🌫 Фоновый звук', hint: 'тихий гул и ветер под стиль игры' },
        { id: 'amb-off', title: '🔇 Тишина', hint: 'совсем без фона' }
      ], Settings.data.ambient !== false ? 'amb-on' : 'amb-off', id => {
        Settings.set({ ambient: id === 'amb-on' });
        Ambient.sync();
        closeModal(); openSettings();
      }),

      h('div', { class: 'section-title', text: 'Оформление' }),
      choiceRow(THEMES, Settings.data.theme || 'auto', id => {
        Settings.set({ theme: id });
        applyTheme(State.game);
        closeModal(); openSettings();
      }),

      h('div', { class: 'section-title', text: 'Канал ИИ' }),
      h('p', { class: 'muted small', text: 'Текущий режим: ' + API.mode() }),
      h('div', { class: 'section-title', text: 'Ключ Pollinations (по желанию)' }),
      keyInput,
      h('p', { class: 'muted small', text: 'Ключ хранится только в этом браузере и поднимает лимиты. Получить: enter.pollinations.ai/keys' })
    ]);
    openModal({
      title: 'Настройки', icon: '⚙️', content, cancelLabel: 'Закрыть',
      actions: [
        {
          label: 'Сохранить', kind: 'primary', onClick: () => {
            Settings.set({ apiKey: keyInput.value.trim() });
            closeModal();
            toast('Настройки сохранены', { kind: 'good' });
          }
        },
        {
          label: Settings.data.muted ? '🔇 Звук выключен' : '🔊 Звук включён', kind: 'ghost',
          onClick: () => {
            Settings.set({ muted: !Settings.data.muted });
            Ambient.sync();
            closeModal(); openSettings();
          }
        }
      ]
    });
  }

  /* ---------------------------------------------------------- */
  /* Обработчики                                                */
  /* ---------------------------------------------------------- */
  function bind() {
    document.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      Sound.unlock();
      switch (act) {
        case 'new-game': Sound.tap(); openScenarios(); break;
        case 'my-games': Sound.tap(); show('saves'); break;
        case 'back':
          if (document.body.dataset.screen === 'scenarios') show('menu');
          else if (document.body.dataset.screen === 'hero') show('scenarios');
          else if (document.body.dataset.screen === 'saves') show('menu');
          break;
        case 'reroll-scenarios':
          Sound.tap();
          State.scenarioSet = E.randomScenarioSet(0);
          renderRandomScenarios();
          break;
        case 'random-world': randomWorldForm(); break;
        case 'save-world': {
          const cfg = readWorldForm();
          if (!cfg.title && !cfg.genre && !cfg.goal && !cfg.place) { notify('Нечего сохранять: заполните хотя бы название или жанр', { kind: 'warn' }); break; }
          // без названия собираем читаемую подпись из выбранных настроек
          if (!cfg.title) cfg.title = [cfg.genre, cfg.place].filter(Boolean).join(' · ') || 'Мой мир';
          cfg.id = cfg.title + '-' + Date.now().toString(36);
          State.storage.saveWorld(cfg);
          renderSavedWorlds();
          toast('Мир сохранён', { kind: 'good' });
          break;
        }
        case 'create-custom-world': createCustomWorld(); break;
        case 'start-own-game': startOwnGame(); break;
        case 'start-adventure': startAdventure(); break;
        case 'close-game': confirmCloseGame(); break;
        case 'open-prologue': Sound.tap(); openPrologue(); break;
        case 'reroll-hero': rerollHero(); break;
        case 'close-prologue': Sound.tap(); closePrologue(); break;
        case 'reload-image': Sound.tap(); loadSceneImage(State.game && State.game.scene && State.game.scene.imagePrompt, null, false); break;
        case 'open-hero': openHeroSheet(); break;
        case 'random-name':
          $('#hero-name').value = randomName();
          State.draft.name = $('#hero-name').value;
          Sound.tap();
          break;
        case 'show-menu': show('menu'); break;
        case 'settings': openSettings(); break;
        case 'speak-scene':
          Voice.toggle();
          if (Voice.on && State.game && State.game.scene) toast('Читаю сцену вслух', { timeout: 1800 });
          break;
        case 'close-epilogue': closeEpilogue(); break;
        case 'restart-run': Sound.tap(); closeEpilogue(); restartSameScenario(); break;
        case 'epilogue-saves': closeEpilogue(); show('saves'); break;
        case 'export-all': exportAll(); break;
        case 'import-save': $('#file-input').click(); break;
        case 'toggle-sound':
          Settings.set({ muted: !Settings.data.muted });
          btn.textContent = Settings.data.muted ? '🔇' : '🔊';
          toast(Settings.data.muted ? 'Звук выключен' : 'Звук включён', { timeout: 1400 });
          break;
        default: break;
      }
    });

    $$('#mode-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => { Sound.tap(); setWorldMode(tab.dataset.mode); });
    });

    $('#file-input').addEventListener('change', ev => { importFiles(ev.target.files); ev.target.value = ''; });
    $('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal') closeModal(); });
    $('#log-toggle').addEventListener('click', () => {
      const wrap = $('#log-wrap');
      wrap.hidden = !wrap.hidden;
      $('#log-toggle').textContent = wrap.hidden ? 'История' : 'Скрыть историю';
    });

    // клавиши: 1/2/3 — вариант, U — умение, Esc — закрыть диалог
    document.addEventListener('keydown', ev => {
      if (document.body.dataset.screen !== 'game') return;
      if (ev.key === 'Escape') {
        if (!$('#modal').hidden) { closeModal(); return; }
        if (State.prologueOpen) { closePrologue(); return; }
        return;
      }
      if (State.prologueOpen) return;
      if (ev.key.toLowerCase() === 'u' || ev.key.toLowerCase() === 'г') { onUseAbility(); return; }
      const index = ['1', '2', '3', '4'].indexOf(ev.key);
      if (index === -1 || State.busy) return;
      const buttons = $$('#actions .action-btn');
      if (buttons[index]) buttons[index].click();
    });

    window.addEventListener('pagehide', autosave);
    document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(); });
    window.addEventListener('beforeunload', autosave);
    $('#scene-media').addEventListener('dblclick', () => loadSceneImage(State.game && State.game.scene && State.game.scene.imagePrompt, null, false));

    // при смене размера перерисовываем локальный фон
    let rt = null;
    window.addEventListener('resize', () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        if (document.body.dataset.screen === 'game' && State.game && !(State.game.scene && State.game.scene.image)) {
          paintBackdrop(State.game.scene && State.game.scene.imagePrompt, State.game.scene && State.game.scene.text);
        }
      }, 250);
    });
  }

  /* ---------------------------------------------------------- */
  /* Viewport                                                   */
  /* ---------------------------------------------------------- */
  function setupViewport() {
    const apply = () => {
      const vv = window.visualViewport;
      const hgt = vv ? vv.height : window.innerHeight;
      document.documentElement.style.setProperty('--app-h', Math.round(hgt) + 'px');
    };
    apply();
    window.addEventListener('resize', apply);
    window.addEventListener('orientationchange', () => setTimeout(apply, 250));
    if (window.visualViewport) window.visualViewport.addEventListener('resize', apply);
  }

  /* ---------------------------------------------------------- */
  /* Старт                                                      */
  /* ---------------------------------------------------------- */
  function pickStorage() {
    try {
      const ls = window.localStorage;
      const probe = 'dt:probe';
      ls.setItem(probe, '1');
      ls.removeItem(probe);
      return ls;
    } catch (e) {
      const mem = new Map();
      return {
        getItem: k => (mem.has(k) ? mem.get(k) : null),
        setItem: (k, v) => { mem.set(k, String(v)); },
        removeItem: k => { mem.delete(k); }
      };
    }
  }

  function boot() {
    State.storage = E.createStorage(pickStorage());
    Settings.init(State.storage);

    try {
      const params = new URLSearchParams(window.location.search);
      const key = params.get('key');
      if (key) Settings.set({ apiKey: key });
    } catch (e) { /* noop */ }

    setupViewport();
    bind();
    applyTheme(null);
    Voice.syncButton();
    if (Voice.supported) {
      try { window.speechSynthesis.addEventListener('voiceschanged', () => Voice.syncButton()); } catch (e) { /* noop */ }
    }
    Critters.mount();
    document.addEventListener('visibilitychange', () => {
      Critters.sync(document.body.dataset.screen === 'menu');
      // вернулись в игру — поднимаем фон, ушли в другое приложение — останавливаем
      if (document.hidden) { Ambient.stop(); Voice.stop(); }
      else if (document.body.dataset.screen === 'game') { Ambient.sync(); Living.start(); }
    });
    $('#sound-toggle').textContent = Settings.data.muted ? '🔇' : '🔊';
    const menuBgEl = $('.menu-bg');
    if (menuBgEl) menuBgEl.style.backgroundImage = 'url("' + assetUrl('menu-bg') + '")';
    refreshMenu();
    show('menu');

    const status = $('#ai-status');
    status.textContent = 'ИИ: проверяем связь…';
    (async () => {
      const backend = await API.probeBackend(true);
      let online = false;
      if (backend) {
        const keyed = (backend.textProviders || []).filter(p => p !== 'pollinations-anon');
        online = true;
        status.textContent = keyed.length ? 'ИИ-мастер: ' + keyed[0] : 'ИИ-мастер: бесплатный канал';
      } else {
        const res = await API.askGameMaster([{ role: 'user', content: 'Ответь одним словом: готов' }]);
        online = !!res.ok;
        status.textContent = online ? 'ИИ-мастер на связи' : 'Локальный мастер (ИИ недоступен)';
      }
      status.dataset.state = online ? 'ok' : 'off';
    })().catch(() => {
      status.textContent = 'Локальный мастер (ИИ недоступен)';
      status.dataset.state = 'off';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
