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
  const Metrics = window.DTMetrics;
  const Books = window.Books;

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
    try {
      (window.DTnotes = window.DTnotes || []).push('х' + ((State.game && State.game.turn) || 0) + ' · ' + String(text));
    } catch (e) { /* noop */ }
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
      tap() { blip(520, 0.05, 'square', 0.03); },
      /**
       * Короткие звуки сцены: шаг, дверь, скрип, ветер, удар. Синтез — файлов нет,
       * вес игры не растёт. В страхе и холоде звук глуше и тише.
       */
      one(name, mood) {
        if (Settings.data.sfx === false) return;
        const snd = SCENE_SOUNDS[name];
        if (!snd) return;
        const quiet = /dread|hurt|dark/.test(String(mood || '')) ? 0.55 : 1;
        if (snd.kind === 'noise') noise(snd.dur, (snd.gain || 0.08) * quiet, snd.freq);
        else blip(snd.freq, snd.dur, snd.type, (snd.gain || 0.04) * quiet);
      },
      /** Звук под настроение хода: подсказка для уха, а не украшение. */
      scene(mood) {
        const m = String(mood || 'book');
        if (/dread/.test(m)) return this.one(E.rnd.chance(0.6) ? 'creak' : 'wind', m);
        if (/hurt/.test(m)) return this.one('hit', m);
        if (/tense|triumph/.test(m)) return this.one('step', m);
        if (/soft|warm/.test(m)) return this.one('wind', m);
        return this.one('step', m);
      }
    };
  })();

  /* ---------------------------------------------------------- */
  /* Наклон кадра: телефон в руке — картинка чуть отзывается      */
  /* ---------------------------------------------------------- */

  /**
   * Пункт 16: кадр «живёт» на 2–3 пикселя от наклона телефона. Больше не надо:
   * цель — ощущение объёма, а не аттракцион. iOS спрашивает разрешение на
   * датчики только по жесту игрока, поэтому подписываемся на первый тап.
   */
  const Tilt = (function () {
    const MAX = 3;
    let bound = false;
    let enabled = false;
    function apply(gamma, beta) {
      const media = document.querySelector('.scene-media');
      if (!media) return;
      const x = clampNum((gamma || 0) / 12, -1, 1) * MAX;
      const y = clampNum(((beta || 0) - 45) / 18, -1, 1) * MAX;
      media.style.setProperty('--tilt-x', x.toFixed(2) + 'px');
      media.style.setProperty('--tilt-y', y.toFixed(2) + 'px');
    }
    function clampNum(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
    function onOrientation(ev) { apply(ev.gamma, ev.beta); }
    function bind() {
      if (bound) return;
      bound = true;
      window.addEventListener('deviceorientation', onOrientation, { passive: true });
    }
    function unbind() {
      if (!bound) return;
      bound = false;
      window.removeEventListener('deviceorientation', onOrientation);
      const media = document.querySelector('.scene-media');
      if (media) {
        media.style.removeProperty('--tilt-x');
        media.style.removeProperty('--tilt-y');
      }
    }
    function supported() {
      return typeof window.DeviceOrientationEvent !== 'undefined';
    }
    function needsPermission() {
      const D = window.DeviceOrientationEvent;
      return !!(D && typeof D.requestPermission === 'function');
    }
    function start() {
      if (!Settings.data.motion || !supported()) return;
      if (needsPermission()) {
        // ждём жеста: без него iOS не отдаст датчики
        if (enabled) return;
        const ask = () => {
          window.removeEventListener('touchend', ask);
          window.removeEventListener('click', ask);
          window.DeviceOrientationEvent.requestPermission().then(res => {
            enabled = res === 'granted';
            if (enabled) bind();
          }).catch(() => { /* отказ — просто живём без наклона */ });
        };
        window.addEventListener('touchend', ask, { once: true });
        window.addEventListener('click', ask, { once: true });
        return;
      }
      enabled = true;
      bind();
    }
    function stop() { enabled = false; unbind(); }
    return { start, stop, supported, needsPermission };
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
      motion: true,                        // сцена дышит и дрожит по настроению
      haptics: true,                       // отклик вибрацией там, где телефон умеет
      handOne: false,                      // режим «одной рукой»: кнопки ниже и выше
      voiceGender: 'female',               // голос рассказчика
      theme: 'auto',                       // оформление интерфейса
      master: 'auto',                      // кто ведёт игру (канал из /api/health)
      mistralKey: '',                      // бесплатный ключ Mistral: свой ведущий ИИ
      glmKey: '',                          // ключ GLM (Zhipu): ещё один ведущий ИИ
      hfKey: '',                           // ключ Hugging Face: ведущий и очередь картинок
      imageSource: 'auto',                 // какой генератор рисует кадры
      imageStyle: 'auto',                  // стиль кадров на всю кампанию
      npcVoices: true,                     // знакомые говорят своим голосом
      beginQuestion: true,                 // спрашивать, где начинается история
      textSize: 'm',                       // размер текста: s / m / l
      music: false,                        // музыка по жанру (по умолчанию выключена)
      sfx: true                            // короткие звуки сцены
    };
    return {
      init(storage) {
        store = storage;
        data = Object.assign(data, store.settings());
        if (data.apiKey) API.setApiKey(data.apiKey);
        if (typeof data.mistralKey === 'string') API.setMistralKey(data.mistralKey);
        if (typeof data.glmKey === 'string') API.setGlmKey(data.glmKey);
        if (typeof data.hfKey === 'string') API.setHfKey(data.hfKey);
        API.setMaster(data.master);
        API.setImageSource(data.imageSource);
      },
      get data() { return data; },
      set(patch) {
        Object.assign(data, patch);
        if (typeof data.apiKey === 'string') API.setApiKey(data.apiKey);
        if (typeof data.mistralKey === 'string') API.setMistralKey(data.mistralKey);
        if (typeof data.glmKey === 'string') API.setGlmKey(data.glmKey);
        if (typeof data.hfKey === 'string') API.setHfKey(data.hfKey);
        if (typeof data.master === 'string') API.setMaster(data.master);
        if (typeof data.imageSource === 'string') API.setImageSource(data.imageSource);
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
    imagePending: {},        // запросы картинок в работе: одно место — один запрос
    lateFrame: null,         // медленный кадр: место, которое догоняем
    lateFrameTimer: null,    // таймер догоняющего запроса
    imageKey: '',            // ключ места, к которому относится текущий фон
    actorProgress: 1,        // появление фигур на слое действия (0 → 1)
    portrait: '',            // портрет героя этой кампании
    portraitLoading: false,
    legacy: null,            // пепел, летопись и открытия прошлых кампаний
    runFinished: false,      // текущая кампания уже попала в наследие
    slowHintTimer: null,     // подсказка, если мастер молчит дольше обычного
    epilogueOpen: false,
    speakOn: false,
    book: null,              // книга-игра: состояние главы, если играем без ИИ
    installEvent: null,      // отложенное приглашение установить приложение
    swReg: null,             // регистрация service worker (офлайн-запуск)
    openingExtra: ''         // ответ игрока на уточняющий вопрос перед первой сценой
  };

  const RANDOM_NAMES = ['Кай', 'Мира', 'Аскель', 'Рэй', 'Нора', 'Вит', 'Ирма', 'Дан', 'Сольвейг', 'Тарн',
    'Иветта', 'Гром', 'Лисан', 'Юна', 'Бран', 'Аста', 'Корв', 'Лейф', 'Тави', 'Оникс'];
  const randomName = () => E.rnd.pick(RANDOM_NAMES) + (E.rnd.chance(0.4) ? ' ' + E.rnd.pick(['из Грейхейвена', 'Тихий', 'Полутень', 'Восьмой', 'из Пустоши']) : '');

  /* ---------------------------------------------------------- */
  /* Метрики без слежки: считаем у себя, никуда не отправляем    */
  /* ---------------------------------------------------------- */
  const MetricsBox = {
    get() { return Object.assign(Metrics.empty(), Local.get(Metrics.KEY, {}) || {}); },
    save(m) { Local.set(Metrics.KEY, m); return m; },
    turn(opts) { return this.save(Metrics.addTurn(this.get(), opts)); },
    image(ms, opts) { return this.save(Metrics.addImage(this.get(), ms, opts)); },
    game() { return this.save(Metrics.addGame(this.get())); },
    line() { return Metrics.summary(this.get()).line; }
  };

  /* ---------------------------------------------------------- */
  /* Роутер                                                     */
  /* ---------------------------------------------------------- */
  const SCREENS = ['menu', 'scenarios', 'hero', 'game', 'saves', 'journal', 'map', 'run', 'daily'];
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
    if (screenId === 'journal') renderJournal();
    if (screenId === 'map') renderMap();
    if (screenId === 'run') renderRun();
    if (screenId === 'game') State.bookMode = !!State.book;
    // живой фон и тихий звук живут только на игровом экране — батарею берегут
    if (screenId === 'game') { Living.start(); Tilt.start(); Ambient.sync(); Music.start(State.game); }
    else { Living.stop(); Tilt.stop(); Ambient.stop(); Voice.stop(); Music.stop(); }
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
        // у каждого персонажа своя реплика: кто бы ни попал в кадр
        onTap: (role, info) => {
          Sound.tap();
          if (info && info.name) notify(info.name + ': ' + (info.line || ''), { timeout: 1800 });
        }
      });
      this.ready = !!this.api;
    },
    shown: false,      // первая пара уже случайна — её не трогаем
    sync(isMenu) {
      this.mount();
      if (!this.api) return;
      if (isMenu && !document.hidden) {
        // заходим в меню — там уже другие герои: отряд из 14 фигур, пара каждый раз новая
        if (this.shown && typeof this.api.rotate === 'function') this.api.rotate();
        this.shown = true;
        this.api.start();
      } else this.api.stop();
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
    // забег дня: значок показывает сегодняшний результат, а не только наличие
    const dayBadge = $('#menu-daily-badge');
    if (dayBadge) {
      const today = dailyStore()[D.dateKey()];
      dayBadge.textContent = today ? String(today.score) : '';
      dayBadge.hidden = !today;
    }
  }

  /* ---------------------------------------------------------- */
  /* Забег дня: один мир и одни броски на всех (п.37)            */
  /* ---------------------------------------------------------- */
  /* Дата превращается в seed: из него выходят мир дня, герой дня,
     цель дня и весь поток случайностей движка — кубик в том числе.
     Счёт копится локально и уходит в облако без имени: только числа. */

  const D = window.DTDaily;
  const DAILY_RUN_KEY = 'dt2:dailyRun';      // незаконченный забег: {date, gameId}
  const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

  function dailyStore() { return Local.get(D.KEY, {}) || {}; }

  /** Что выпало на сегодня: мир, герой и цель дня — одинаковые у всех. */
  function dailySetup() {
    return D.setup(D.dateKey(), {
      scenarios: E.SCENARIOS, classes: E.CLASSES, races: E.RACES, origins: E.ORIGINS
    });
  }

  /** «24 сентября 2026» из ключа дня. */
  function dailyDateText(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
    if (!m) return key || '';
    return Number(m[3]) + ' ' + (MONTHS[Number(m[2]) - 1] || '') + ' ' + m[1];
  }

  /** «7 ч 12 мин» — сколько ждать нового забега. */
  function dailyLeftText(ms) {
    const min = Math.max(1, Math.round((ms || 0) / 60000));
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return m + ' мин';
    return h + ' ч' + (m ? ' ' + m + ' мин' : '');
  }

  /**
   * Кубик забега идёт из зерна дня; обычные игры остаются вольными.
   * Зерно трогает только броски: подбор промптов и украшения не сдвигают его.
   */
  function setDailyRng(daily) {
    if (daily && Number.isFinite(Number(daily.seed))) E.rnd.setDiceSeed(daily.seed);
    else E.rnd.clearDiceSeed();
  }

  function dailyOf(game) { return (game && game.daily) || State.daily || null; }

  /** Незаконченный забег сегодняшнего дня: его предлагаем продолжить. */
  function dailyRunSaved(date) {
    const run = Local.get(DAILY_RUN_KEY, null);
    if (!run || run.date !== date || !run.gameId) return null;
    const list = State.storage ? State.storage.list() : [];
    const item = list.filter(x => x.id === run.gameId)[0];
    return item && !item.over ? item : null;
  }

  /** Числа для счёта: цель, жизнь, припасы, предметы, броски, темп. */
  function dailyNumbers(g, st) {
    return {
      victory: g.ending === 'victory' || !!g.questDone,
      hp: (g.hero && g.hero.hp) || 0,
      supplies: E.suppliesOf(g),
      items: (E.heroItems(g) || []).length,
      crits: (st && st.crits) || 0,
      fumbles: (st && st.fumbles) || 0,
      turns: Math.max(1, g.turn || 1)
    };
  }

  /** Записать результат дня: в один день хранится последний забег. */
  function dailyRecord(g, st) {
    const daily = dailyOf(g);
    if (!daily || !daily.date) return null;
    const res = D.score(dailyNumbers(g, st));
    const entry = {
      date: daily.date, code: daily.code || '', score: res.total,
      turns: Math.max(1, g.turn || 1), victory: res.victory, at: Date.now()
    };
    Local.set(D.KEY, D.remember(dailyStore(), entry));
    const run = Local.get(DAILY_RUN_KEY, null);
    if (run && run.date === daily.date) Local.set(DAILY_RUN_KEY, null);
    return { entry, res };
  }

  /** Кто-то ещё играл сегодня? Спрашиваем облако, но никогда не ждём его. */
  function dailyOthers(host, date, mine) {
    const line = h('p', { class: 'muted small', text: '👥 смотрим облако: кто ещё прошёл этот день…' });
    host.appendChild(line);
    const paint = board => {
      if (!board || !board.runs) return;
      const bits = ['👥 прошли день: ' + board.runs + (board.runs === 1 ? ' герой' : ' героев')];
      if (board.victory) bits.push('цель взяли: ' + board.victory);
      bits.push('лучший счёт: ' + board.best);
      bits.push('средний: ' + board.avg);
      if (board.place) bits.push('вы — ' + board.place + '-й из ' + Math.max(board.runs, board.place));
      line.textContent = bits.join(' · ');
      line.classList.remove('muted');
    };
    const ask = mine === null || mine === undefined
      ? API.dailyBoard(date)
      : API.dailySubmit({ date, code: (dailyOf(State.game) || {}).code || '', score: mine.score, turns: mine.turns, victory: mine.victory });
    ask.then(r => {
      if (r && r.ok && r.board) paint(r.board);
      else {
        line.textContent = '👥 облако молчит — результат сохранён на телефоне, доска появится позже.';
        line.classList.add('muted');
      }
    }).catch(() => {
      line.textContent = '👥 облако молчит — результат сохранён на телефоне.';
      line.classList.add('muted');
    });
  }

  /* --- экран забега --- */

  function openDaily() {
    renderDaily();
    show('daily');
  }

  function renderDaily() {
    const host = clear($('#daily-body'));
    const today = D.dateKey();
    const setup = dailySetup();
    const store = dailyStore();
    const mine = store[today] || null;
    const best = D.bestOf(store);
    const streak = D.streak(store, today);
    const run = dailyRunSaved(today);
    const footer = $('[data-act="daily-start"]');
    if (footer) footer.textContent = run ? '▶ Продолжить забег дня' : '🗓 Начать забег дня';

    // 1. что сегодня за день
    host.appendChild(h('div', { class: 'journal-block' }, [
      h('div', { class: 'section-title', text: '🗓 Забег дня · ' + dailyDateText(today) }),
      h('p', { class: 'muted small', text: 'Код дня ' + setup.code + '. У всех, кто играет сегодня, тот же мир, тот же герой и те же броски. Новый забег через ' + dailyLeftText(D.untilMidnight()) + '.' })
    ]));

    // 2. мир дня
    if (setup.scenario) {
      host.appendChild(h('div', { class: 'scenario-card' }, [
        h('div', { class: 'scenario-card__cover', style: 'background-image:' + coverUrl(setup.scenario.cover) }),
        h('div', { class: 'scenario-card__body' }, [
          h('div', { class: 'scenario-card__genre', text: setup.scenario.icon + ' ' + setup.scenario.genre + ' · мир дня' }),
          h('h3', { class: 'scenario-card__title', text: setup.scenario.title }),
          h('p', { class: 'scenario-card__tagline', text: setup.scenario.tagline })
        ])
      ]));
    }

    // 3. герой дня и цель дня
    const heroBlock = h('div', { class: 'journal-block' }, [
      h('div', { class: 'section-title', text: '🎭 Герой дня' })
    ]);
    if (setup.klass && setup.race && setup.origin) {
      const ability = (setup.klass.ability && typeof setup.klass.ability === 'object')
        ? setup.klass.ability : E.abilityById(setup.klass.ability);
      heroBlock.appendChild(h('div', { class: 'hero-sheet__tags' }, [
        h('span', { class: 'tag tag--stat', text: setup.klass.icon + ' ' + setup.klass.title }),
        h('span', { class: 'tag tag--stat', text: setup.race.icon + ' ' + setup.race.title }),
        h('span', { class: 'tag', text: setup.origin.icon + ' ' + setup.origin.title }),
        h('span', { class: 'tag tag--chance', text: ability.icon + ' ' + ability.name })
      ]));
      heroBlock.appendChild(h('p', { class: 'muted small', text: 'Судьба дня: класс, раса и происхождение заданы забегом. Ваше — имя и решения.' }));
    }
    heroBlock.appendChild(h('div', { class: 'journal-goal' }, [
      h('div', { class: 'journal-goal__label', text: '🎯 Цель дня' }),
      h('div', { class: 'journal-goal__text', text: setup.goal })
    ]));
    host.appendChild(heroBlock);

    // 4. мой результат
    const block = h('div', { class: 'journal-block' }, [
      h('div', { class: 'section-title', text: '🏆 Мой результат' })
    ]);
    block.appendChild(h('p', {
      class: mine ? '' : 'muted small',
      text: mine ? 'Сегодня: ' + D.line(mine) + (mine.victory ? ' 🌟' : '') : 'Сегодня ещё не играли — день ждёт.'
    }));
    if (best) {
      const dateText = best.date === today ? 'сегодня' : dailyDateText(best.date);
      block.appendChild(h('p', { class: 'muted small', text: 'Лучший за всё время: ' + D.line(best) + ' (' + dateText + ').' }));
    }
    if (streak > 1) block.appendChild(h('p', { class: 'muted small', text: '🔥 Дней подряд: ' + streak + '. Завтра — новый мир.' }));
    if (run) {
      block.appendChild(h('p', { class: 'muted small', text: 'Забег дня не закончен: ' + run.title + ', ход ' + Math.max(1, run.turn) + '.' }));
    }
    host.appendChild(block);

    // 5. другие игроки (облако, если оно есть)
    const others = h('div', { class: 'journal-block' }, [
      h('div', { class: 'section-title', text: '👥 Другие игроки' })
    ]);
    host.appendChild(others);
    if (mine) dailyOthers(others, today, mine);
    else dailyOthers(others, today, null);

    // 6. правила
    host.appendChild(h('div', { class: 'journal-block' }, [
      h('div', { class: 'section-title', text: '❓ Как это работает' }),
      h('ul', { class: 'journal-list' }, [
        h('li', { text: 'Мир, герой и цель дня одинаковы у всех: их считает дата, а не случай.' }),
        h('li', { text: 'Кубик тоже идёт из зерна дня — у всех, кто делает те же шаги, совпадают броски.' }),
        h('li', { text: 'Ведущий — встроенный мастер: своего ключа не нужно, без сети историю ведёт игра.' }),
        h('li', { text: 'Счёт: цель дня, жизнь, припасы, предметы, криты и темп (меньше ходов — больше очков).' }),
        h('li', { text: 'Результат хранится на телефоне, а в облако уходят только очки — без имени и без истории.' })
      ])
    ]));
  }

  /** Начать (или продолжить) забег дня. */
  function startDaily() {
    const today = D.dateKey();
    const run = dailyRunSaved(today);
    if (run) { Sound.tap(); loadGame(run.id, false); return; }
    const setup = dailySetup();
    if (!setup.scenario || !setup.klass || !setup.race || !setup.origin) {
      notify('Забег дня не собрался: не хватает данных мира', { kind: 'warn' });
      return;
    }
    State.daily = {
      date: setup.date, seed: setup.seed, code: setup.code, goal: setup.goal,
      profile: dailyHeroProfile(setup)
    };
    setDailyRng(State.daily);
    State.pickedScenario = setup.scenario;
    State.pendingWorld = null;
    State.heroProfile = State.daily.profile;
    State.draft.classId = setup.classId;
    State.draft.raceId = setup.raceId;
    State.draft.originId = setup.originId;
    if (!State.draft.name) State.draft.name = randomName();
    Sound.tap();
    openHero();
    setProfileNote('🗓 Забег дня: мир, класс, раса и происхождение заданы судьбой — ваше имя и решения.', { showReroll: false });
  }

  /** Профиль героя дня: по одному варианту — шаги выбора прячутся сами. */
  function dailyHeroProfile(setup) {
    const base = E.defaultHeroProfile();
    return Object.assign({}, base, {
      classes: [setup.klass], races: [setup.race], origins: [setup.origin],
      classLabel: 'Класс дня', raceLabel: 'Раса дня', originLabel: 'Происхождение дня',
      source: 'daily', noteWho: '🗓 ', showClass: true, showRace: true, showOrigin: true,
      note: 'судьба дня: класс, раса и происхождение выбраны за игрока, менять их нельзя'
    });
  }

  /** Выйти из режима забега: дальше игра вольная. */
  function leaveDaily() {
    State.daily = null;
    if (!State.game || !State.game.daily) setDailyRng(null);
  }

  /** Плашка забега в журнале: код, цель и счёт прямо по ходу игры. */
  function dailyJournalBlock(g) {
    const daily = dailyOf(g);
    const res = D.score(dailyNumbers(g, runStats(g)));
    return h('div', { class: 'journal-block', id: 'journal-daily' }, [
      h('div', { class: 'section-title', text: '🗓 Забег дня ' + (daily.code || '') }),
      h('ul', { class: 'journal-list' }, [
        h('li', { text: 'Цель дня: ' + daily.goal }),
        h('li', { text: 'Счёт сейчас: ' + res.total + ' · ходов ' + Math.max(1, g.turn || 1) }),
        h('li', { text: 'Новый забег через ' + dailyLeftText(D.untilMidnight()) + ' — результат дня всё равно один.' })
      ])
    ]);
  }

  /** Итог забега в финале: слагаемые счёта, мой лучший и другие игроки. */
  function dailyResultBlock(g) {
    const daily = dailyOf(g);
    if (!daily) return null;
    const stale = document.getElementById('epilogue-daily');
    if (stale) stale.remove();
    const recorded = dailyRecord(g, runStats(g));
    const res = recorded ? recorded.res : D.score(dailyNumbers(g, runStats(g)));
    const box = h('div', { class: 'journal-block', id: 'epilogue-daily' }, [
      h('div', { class: 'section-title', text: '🗓 Забег дня ' + (daily.code || '') + ' · ' + dailyDateText(daily.date) })
    ]);
    const list = h('ul', { class: 'journal-list' });
    res.rows.forEach(row => list.appendChild(h('li', {
      text: row.icon + ' ' + row.label + ': ' + (row.value > 0 ? '+' : '') + row.value
    })));
    list.appendChild(h('li', { text: '🏆 итог дня: ' + res.total + ' очков' + (res.victory ? ' · цель дня взята' : '') }));
    box.appendChild(list);
    const store = dailyStore();
    const best = D.bestOf(store);
    if (best) {
      const same = best.date === daily.date;
      box.appendChild(h('p', {
        class: 'muted small',
        text: (same ? 'Это и есть ваш лучший результат.' :
          'Лучший за всё время: ' + D.line(best) + ' (' + dailyDateText(best.date) + ').') +
          (D.streak(store, D.dateKey()) > 1 ? ' Дней подряд: ' + D.streak(store, D.dateKey()) + '.' : '')
      }));
    }
    // другие игроки: спрашиваем один раз на кампанию, чтобы не плодить строки на доске
    const others = h('p', { class: 'muted small', text: '👥 смотрим, как прошли другие…' });
    box.appendChild(others);
    if (!g.dailyPosted) {
      g.dailyPosted = true;
      API.dailySubmit({
        date: daily.date, code: daily.code || '', score: res.total,
        turns: Math.max(1, g.turn || 1), victory: res.victory
      }).then(r => {
        if (r && r.ok && r.board && r.board.runs) {
          const b = r.board;
          others.textContent = '👥 прошли день: ' + b.runs + ' · лучший счёт: ' + b.best +
            ' · средний: ' + b.avg + (b.place ? ' · вы — ' + b.place + '-й' : '') + '.';
          others.classList.remove('muted');
        } else {
          others.textContent = '👥 облако молчит — результат дня сохранён на телефоне.';
        }
      }).catch(() => {
        others.textContent = '👥 облако молчит — результат дня сохранён на телефоне.';
      });
    } else {
      others.textContent = 'Результат дня записан.';
    }
    box.appendChild(h('div', { class: 'epilogue__tools' }, [
      h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button', text: '🗓 К забегу дня',
        onclick: () => { closeEpilogue(); openDaily(); }
      }),
      h('button', {
        class: 'btn btn--primary btn--sm', type: 'button', text: '🔁 Ещё попытка',
        title: 'тот же мир и герой дня, броски с начала',
        onclick: () => { closeEpilogue(); againDaily(); }
      })
    ]));
    // забег сыгран: дальше случайности вольные, кубик снова свободный
    setDailyRng(null);
    return box;
  }

  /** Второй заход тем же забегом: мир и герой те же, броски с начала. */
  function againDaily() {
    const g = State.game;
    if (!g || !g.daily) { openDaily(); return; }
    const daily = g.daily;
    const setup = dailySetup();
    State.pickedScenario = E.scenarioById(g.scenarioId) || E.SCENARIOS[0];
    State.daily = { date: daily.date, seed: daily.seed, code: daily.code, goal: daily.goal, profile: dailyHeroProfile(setup) };
    State.heroProfile = State.daily.profile;
    State.pendingWorld = null;
    State.draft.classId = g.hero.classId;
    State.draft.raceId = g.hero.raceId;
    State.draft.originId = g.hero.originId;
    State.draft.name = g.hero.name;
    setDailyRng(State.daily);
    Sound.tap();
    openHero();
    setProfileNote('🗓 Забег дня: тот же мир и герой — броски начинаются заново.', { showReroll: false });
  }

  /* ---------------------------------------------------------- */
  /* Выбор мира: вкладки, случайные, по играм, свой мир          */
  /* ---------------------------------------------------------- */
  function openScenarios() {
    leaveDaily();
    State.scenarioSet = E.randomScenarioSet(0);
    renderRandomScenarios();
    renderGameWorlds();
    renderWorldBuilder();
    renderSavedWorlds();
    renderBooks();
    setWorldMode('random');
    show('scenarios');
  }

  function setWorldMode(mode) {
    State.worldMode = mode;
    $$('#mode-tabs .tab').forEach(t => t.classList.toggle('is-active', t.dataset.mode === mode));
    $('#pane-random').hidden = mode !== 'random';
    $('#pane-games').hidden = mode !== 'games';
    $('#pane-custom').hidden = mode !== 'custom';
    $('#pane-books').hidden = mode !== 'books';
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
      const base = State.draftWorld || {};
      const own = !!(base.custom || base.customGame);      // своя игра или известная игра-мир: шаги подгоняем под историю
      State.heroProfile = E.heroProfileFromWorld(turn.hero, {
        ownGame: own,
        gameName: base.gameName || base.title || (State.pickedScenario && State.pickedScenario.title) || ''
      });
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
   * Кем игрок уже играл в этом мире: класс, вид, происхождение и имя.
   * Мир — это антураж, который игрок собрал сам; заставлять его второй раз
   * выбирать то же самое незачем — выбор помнится и подставляется сам.
   */
  function heroPickKey() {
    return 'dt2:heroPick:' + variantKey().slice(0, 40);
  }
  function loadHeroPick() {
    try {
      const raw = localStorage.getItem(heroPickKey());
      const data = raw ? JSON.parse(raw) : null;
      return (data && typeof data === 'object') ? data : null;
    } catch (e) { return null; }
  }
  function saveHeroPick(pick) {
    try {
      const data = Object.assign({ at: Date.now() }, loadHeroPick() || {}, pick || {});
      localStorage.setItem(heroPickKey(), JSON.stringify(data));
    } catch (e) { /* приватный режим — просто не помним */ }
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
    if (State.daily) { notify('В забеге дня герой задан судьбой — новый набор невозможен', { kind: 'info' }); return; }
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
    leaveDaily();
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
              class: 'btn btn--ghost btn--sm', type: 'button', text: '🎲 Новым героем',
              title: 'тот же мир, новая история',
              onclick: () => playWorldNewHero(w.id)
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

  /**
   * true — разделы класса/вида/происхождения раскрыты вручную. Когда выбор за мир
   * уже сделан, они свёрнуты: игрок видит одну строку с итогом и кнопку «сменить».
   */
  let heroStepsOpen = false;

  /** Строка «уже выбрано» над разделами: что выбрано и как это сменить. */
  function renderHeroPickRow() {
    const note = $('#hero-pick-note');
    const text = $('#hero-pick-text');
    const change = $('#hero-pick-change');
    if (!note || !text || !change) return;
    // забег дня: герой задан судьбой, менять нечего — строку «сменить» не показываем
    if (State.daily) { note.hidden = true; return; }
    const pick = loadHeroPick();
    if (!pick || heroStepsOpen) { note.hidden = true; return; }
    const cls = pick.classId ? E.classById(pick.classId) : null;
    const race = pick.raceId ? E.raceById(pick.raceId) : null;
    const origin = pick.originId ? E.originById(pick.originId) : null;
    const bits = [cls && (cls.icon + ' ' + cls.title), race && (race.icon + ' ' + race.title), origin && origin.title]
      .filter(Boolean);
    if (!bits.length) { note.hidden = true; return; }
    note.hidden = false;
    text.textContent = 'В этом мире уже выбрано: ' + bits.join(' · ');
    change.textContent = 'сменить';
    change.onclick = () => {
      heroStepsOpen = true;
      renderHeroPickRow();
      applyProfileToForm();
      renderClassList(); renderRaceList(); renderOriginList();
      const first = $('#section-class');
      if (first && first.scrollIntoView) first.scrollIntoView({ block: 'center' });
    };
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
    if (State.daily) {
      setProfileNote('🗓 Забег дня: мир, класс, раса и происхождение заданы судьбой — ваше имя и решения.',
        { showReroll: false });
    }
    show('hero');
  }

  /** Текущий профиль создания героя (обычный мир — все шаги). */
  function heroProfile() {
    if (State.daily && State.daily.profile) return State.daily.profile;   // забег дня: судьба решена
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
    // Выбор за этот мир уже сделан? Тогда шаги не спрашиваем второй раз:
    // подставляем прежнее и прячем разделы, пока игрок сам не нажмёт «сменить».
    const pick = loadHeroPick();
    if (pick) {
      if (pick.classId && (!State.draft.classId || !p.classes.some(c => c.id === State.draft.classId))) State.draft.classId = pick.classId;
      if (pick.raceId && p.showRace && !State.draft.raceId) State.draft.raceId = pick.raceId;
      if (pick.originId && p.showOrigin && !State.draft.originId) State.draft.originId = pick.originId;
      if (pick.name && !State.draft.nameSaved) { State.draft.name = pick.name; $('#hero-name').value = pick.name; State.draft.nameSaved = true; }
    }
    // один вариант — выбирать нечего: шаг убираем совсем
    const oneClass = p.classes.length === 1;
    const oneRace = p.showRace && p.races.length === 1;
    const oneOrigin = p.showOrigin && p.origins.length === 1;
    if (oneClass) State.draft.classId = p.classes[0].id;
    if (oneRace) State.draft.raceId = p.races[0].id;
    if (oneOrigin) State.draft.originId = p.origins[0].id;
    const chose = !heroStepsOpen && !!pick;
    $('#section-class').hidden = !p.showClass || oneClass || chose;
    $('#section-race').hidden = !p.showRace || oneRace || chose;
    $('#section-origin').hidden = !p.showOrigin || oneOrigin || chose;
    renderHeroPickRow();
    const noAI = (p.source === 'local' || p.source === 'default');
    const who = p.noteWho || (noAI ? '🧠 Мастер (без ИИ): '
      : (p.source === 'cache' ? '🧠 Мастер (прошлый заход): ' : '🧠 Мастер: '));
    // «Другой набор» ждёт только героя: пока мастер строит мир, новые варианты уже можно просить
    if (!State.noteQuiet) setProfileNote(p.note ? who + p.note : '', { busy: !!State.heroLoading });
    // если вариант один — выбираем его сами
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
    // забег дня: цель дня и зерно бросков живут вместе с кампанией
    if (State.daily) {
      game.daily = { date: State.daily.date, seed: State.daily.seed, code: State.daily.code, goal: State.daily.goal };
      game.goal = State.daily.goal;
      Local.set(DAILY_RUN_KEY, { date: State.daily.date, gameId: game.id });
    }
    setDailyRng(game.daily);
    State.game = game;
    State.book = null;
    State.openingExtra = '';
    State.storage.save(game);
    MetricsBox.game();
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
    if (game.daily) {
      // цель дня уже названа: лишний вопрос только задерживает забег
      State.openingExtra = '';
      openGame(game, true, isWorldBuilding);
      return;
    }
    askOpeningQuestion().then(extra => {
      State.openingExtra = extra || '';
      if (extra) E.pushLog(game, { kind: 'gm', text: 'Выбор начала: ' + extra });
      openGame(game, true, isWorldBuilding);
    });
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
    // продолжение забега дня: броски снова из зерна того дня, вольная игра — из Math.random
    setDailyRng(game.daily);
    // выбранный стиль кадров важнее выведенного из жанра: игрок решает сам
    if (Settings.data.imageStyle && Settings.data.imageStyle !== 'auto') game.artStyle = Settings.data.imageStyle;
    if (State.book) State.book = null;
    const hpTrack = $('#game-hp') && $('#game-hp').parentElement;
    if (hpTrack) hpTrack.style.display = '';
    bookChrome(false);
    State.busy = false;
    State.earlyImageDone = false;   // новая кампания: картинку снова можно начинать заранее
    State.imagePending = {};
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
      restoreStoredFrame(game, game.scene.image, game.scene.imageSource);
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
    if (g.daily) parts.push('🗓 забег дня');
    else if (g.chapter) parts.push(g.chapter);
    parts.push('Ход ' + Math.max(1, g.turn));
    parts.push('❤️ ' + g.hero.hp + '/' + g.hero.maxHp);
    parts.push('🎒 ' + E.suppliesOf(g));       // припасы всегда на виду, места в шапке хватает
    if (g.questDone) parts.push('🏁 цель взята');
    $('#game-sub').textContent = parts.join(' · ');
    const bar = $('#game-hp');
    const pct = Math.max(0, Math.min(100, (g.hero.hp / g.hero.maxHp) * 100));
    if (pct < (Number(bar.dataset.pct) || pct)) {           // здоровье упало — полоса вздрагивает
      bar.classList.remove('is-hurt');
      void bar.offsetWidth;
      bar.classList.add('is-hurt');
      setTimeout(() => bar.classList.remove('is-hurt'), 700);
    }
    bar.dataset.pct = String(pct);
    bar.style.width = pct + '%';
    bar.dataset.low = pct <= 30 ? '1' : '0';
    $('#game-title').dataset.icon = E.scenarioById(g.scenarioId).icon || '🎲';
    renderMechanics();
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
          const ptext = [scene.text, g.title, g.goal].filter(Boolean).join(' ');
          const kind = E.sceneKindFromText(ptext);
          const players = E.sceneLayersFromText(ptext);
          const url = Backdrop.toDataUrl({
            kind, palette: paletteFor(g, E.scenarioById(g.scenarioId)), seed: State.backdropSeed || 7,
            daypart: players.daypart, weather: players.weather, fire: players.fire
          });
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
    setTimeout(updatePanelFade, 60);
  }

  /**
   * Печать текста мастера: не рывками, а волной — примерно 22 мс на знак.
   * Тап по тексту показывает его целиком, если ждать не хочется.
   */
  /**
   * Оформление реагирует на то, что случилось: сцена дрожит от боли и страха,
   * медленно «ползёт» в мрачных ходах, светлеет в победе. Плюс лёгкий отклик
   * на касание: телефон в руке должен чувствовать, что кнопка нажата.
   */
  function applyMoodToUI(mood, notes) {
    let m = mood || { mood: 'book', motion: 0, tint: '' };
    if (Settings.data.motion === false) m = Object.assign({}, m, { motion: 0 });   // игрок попросил покой
    const card = $('#screen-game');
    const panel = $('#panel');
    if (card) {
      card.dataset.mood = m.mood;
      card.dataset.motion = Settings.data.motion === false ? 'off' : 'on';
      card.style.setProperty('--mood-tint', m.tint || 'transparent');
      card.style.setProperty('--mood-motion', String(m.motion || 0));
    }
    if (panel) panel.dataset.mood = m.mood;
    const hurt = (notes || []).some(n => n.type === 'hp' && /−/.test(n.text));
    const good = (notes || []).some(n => /goal/.test(n.type));
    const stage = $('#scene-media') || card;
    if (stage && !prefersReducedMotion()) {
      const flash = hurt ? 'is-hit' : (good || m.mood === 'triumph' ? 'is-win' : '');
      if (flash) {
        stage.classList.remove('is-hit', 'is-win');
        void stage.offsetWidth;              // перезапуск анимации
        stage.classList.add(flash);
        setTimeout(() => stage.classList.remove(flash), 1400);
      }
    }
    // Телефон в кармане вздрагивает вместе с героем (там, где это умеет браузер)
    if (navigator && typeof navigator.vibrate === 'function' && Settings.data.haptics !== false) {
      if (hurt && m.motion >= 2) { try { navigator.vibrate([26, 40, 26]); } catch (e) { /* noop */ } }
      else if (m.mood === 'triumph') { try { navigator.vibrate(18); } catch (e) { /* noop */ } }
    }
  }

  function prefersReducedMotion() {
    try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  function renderSceneText(text, opts) {
    const o = Object.assign({ typewriter: false, streaming: false }, opts || {});
    const box = $('#scene-text');
    clear(box);
    if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
    const p = h('div', { class: 'scene-text__body', html: formatText(text || '') });
    box.appendChild(p);
    $('#panel').scrollTop = 0;
    if (o.streaming) {
      // мастер печатает ответ: текст растёт на глазах, курсор показывает, что он ещё пишет.
      // Панель держим в начале: места на телефоне мало, читать надо с первой строки.
      p.classList.add('is-streaming');
      p.onclick = null;
      $('#panel').scrollTop = 0;
      updatePanelFade();
      return;
    }
    // пока открыт пролог, панель не прокручиваем — игрок читает вступление
    const keepTop = !!State.prologueOpen;
    const reduce = prefersReducedMotion();
    const mood = o.mood || { mood: 'book', speed: 0.72, motion: 0 };
    const box2 = $('#panel');
    if (box) {
      box.dataset.mood = mood.mood || 'book';
      box.style.setProperty('--tremor', String(mood.motion || 0));
    }
    if (box2) box2.dataset.mood = mood.mood || 'book';
    if (o.typewriter && text && !reduce) {
      const full = formatText(text);
      // скорость задаёт настроение: в страхе текст «ползёт», в победе бежит быстрее
      const speed = Math.max(0.35, Math.min(1.3, mood.speed || 0.72));
      const total = Math.min(11000, Math.max(2400, (full.length * 24) / speed));
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
      p.classList.add('is-typing');          // по тексту идёт волна, пока он печатается
      const finishAll = () => { p.classList.remove('is-typing'); finish(); };
      typingTimer = setInterval(() => {
        i += step;
        p.innerHTML = full.slice(0, i);
        if (i >= full.length) { finishAll(); updatePanelFade(); return; }
        updatePanelFade();
      }, tick);
      p.onclick = () => { p.classList.remove('is-typing'); finish(); };
    } else {
      $('#panel').scrollTop = 0;
      updatePanelFade();
    }
  }

  /**
   * Картинку начинаем рисовать, не дожидаясь конца ответа: место и промпт
   * видны уже в потоке. К моменту, когда сцена допечатана, кадр обычно готов.
   */
  function maybeStartImageEarly(full) {
    const g = State.game;
    if (!g || State.earlyImageDone) return;
    if (window.DT_NO_EARLY) return;       // отладочный выключатель: сравнить «до/после»
    const scene = E.extractPartialField(full, 'scene') || E.extractPartialField(full, 'opening') || '';
    const place = E.extractPartialField(full, 'place');
    const aiPrompt = (/["']imagePrompt["']\s*:\s*["']([^"']{14,})/.exec(full) || [])[1] || '';
    // Первая сцена мира: поля «place» в ответе нет вовсе, поэтому кадр начинаем
    // по первым строкам рассказа — к концу допечатки он уже готов. В ходу «place»
    // приходит сразу за сценой: дождёмся его, чтобы не рисовать кадр того же места.
    if (!place && !aiPrompt) {
      if (/"place"\s*:/.test(full)) return;
      if (scene.length < 60) return;
    }
    const key = place ? E.placeKey(g, place) : '';
    if (key && key === State.imageKey) { State.earlyImageDone = true; return; }
    State.earlyImageDone = true;
    loadSceneImage(aiPrompt, null, true, { place: place || '', sceneText: scene, early: true }).catch(() => {});
  }

  /**
   * Черновой промпт кадра по первым строкам сцены: место, свет, предметы и те,
   * кто в кадре. Промпт самого мастера приходит позже — ждать его значит терять
   * секунды, за которые генератор уже успел бы нарисовать.
   */
  function earlyImagePrompt(g, place, sceneText) {
    const base = E.placePrompt(g, place || '', '', { noStyle: true })
      .replace(/\s*empty scenery with no characters in focus,?/i, '');
    return E.composeSceneImagePrompt(g, { aiPrompt: base, sceneText, npc: '' });
  }

  /** Пока мастер печатает ответ, сцена показывается по мере появления текста. */
  function previewSceneStream(full) {
    if (!full) { stopScenePreview(); return; }
    maybeStartImageEarly(full);
    const scene = E.extractPartialField(full, 'scene') || E.extractPartialField(full, 'opening') || E.extractPartialField(full, 'world');
    if (!scene) return;
    State.streamPreview = true;
    renderSceneText(scene, { streaming: true });
  }
  function stopScenePreview() {
    State.streamPreview = false;
  }

  /** Подпись кнопки-иконки: текст живёт в отдельной строке под значком. */
  function barLabel(btn, text) {
    if (!btn) return;
    const lab = btn.querySelector('.bar-btn__label');
    if (lab) lab.textContent = text; else btn.textContent = text;
  }

  /* ---------------------------------------------------------- */
  /* Блок B: механики под рукой — припасы, состояния, сумка,     */
  /* знакомые. Показываем только то, что правда пригодится.      */
  /* ---------------------------------------------------------- */

  /** Карточка предмета: иконка, название, «что делает», кнопка использования. */
  function itemCard(item) {
    const verb = E.itemVerb(item);
    return h('div', { class: 'item-card item-card--' + item.kind + (item.kind === 'key' ? ' is-key' : '') }, [
      h('span', { class: 'item-card__icon', text: item.icon }),
      h('div', { class: 'item-card__body' }, [
        h('div', { class: 'item-card__name', text: item.name }),
        h('div', { class: 'item-card__line', text: E.itemLine(item) })
      ]),
      verb ? h('button', {
        class: 'item-card__use', type: 'button', text: verb,
        title: E.itemLine(item),
        onclick: () => runMech('use-item', item.id)
      }) : null
    ]);
  }

  /** Один вход для всех механик: и с полосы над кнопками, и из журнала. */
  function runMech(kind, id) {
    const g = State.game;
    if (!g || !g.hero || State.busy || g.over) return;
    const res = kind === 'use-item' ? E.useItem(g, id)
      : kind === 'rest-stop' ? E.restStop(g)
        : kind === 'heal-stop' ? E.healStop(g)
          : kind === 'bypass' ? E.bypassDanger(g)
            : kind === 'call-debtor' ? E.callDebtor(g)
              : null;
    if (!res) return;
    if (!res.ok) {
      notify(res.reason || 'Сейчас так нельзя', { kind: 'info', timeout: 3200 });
      return;
    }
    Sound.tap();
    vibrate([12, 22, 12]);
    (res.notes || []).forEach(n => notify(n.icon + ' ' + n.text, {
      kind: n.type === 'hp' && /−|-/.test(n.text) ? 'bad' : 'info', timeout: 3600
    }));
    autosave();
    renderMechanics();
    renderGameTop();
    if (document.body.dataset.screen === 'journal') renderJournal();
    if (document.body.dataset.screen === 'game') renderActions(g.scene ? g.scene.options : null, false);
  }

  /**
   * Полоса механик: чипы сведений и кнопки полезных действий.
   * Кнопки появляются по нужде — при ране, усталости, ранении или должнике,
   * иначе экран остаётся чистым.
   */
  function renderMechanics() {
    const bar = $('#mech-bar');
    if (!bar) return;
    const g = State.game;
    if (!g || !g.hero || State.book || g.over) { bar.hidden = true; return; }
    const chips = clear($('#mech-chips'));
    // полоса занимает место у текста, поэтому появляется только когда есть что сказать:
    // состояния героя или действие, которое правда пригодится сейчас
    const acts = [];
    E.stateList(g).forEach(st => chips.appendChild(h('span', {
      class: 'mech-chip ' + (st.mod > 0 ? 'mech-chip--good' : 'mech-chip--bad'),
      title: st.hint + (st.turns ? ' · осталось ходов: ' + st.turns : ''),
      text: st.icon + ' ' + st.title + ' ' + (st.mod > 0 ? '+' + st.mod : st.mod) + (st.turns ? ' · ' + st.turns + ' х.' : '')
    })));
    const known = E.npcList(g) || [];

    const push = (text, title, kind, id) => acts.push(h('button', {
      class: 'mech-chip mech-chip--use', type: 'button', text, title,
      onclick: () => runMech(kind, id)
    }));
    const supply = E.suppliesOf(g);
    // предметы с эффектом — прямо из сцены, не откладывая ход
    E.heroItems(g).filter(i => i.kind === 'heal' || i.kind === 'advantage' || i.kind === 'boost')
      .slice(0, 2).forEach(i => push(i.icon + ' ' + E.itemVerb(i) + ': ' + i.name, E.itemLine(i), 'use-item', i.id));
    if (supply > 0 && (g.hero.hp < g.hero.maxHp || E.hasState(g, 'fatigue'))) {
      push('🔥 Привал', '−1 припас: +2 здоровья и снять усталость', 'rest-stop');
    }
    if (supply > 0 && (g.hero.hp < g.hero.maxHp || E.hasState(g, 'wound'))) {
      push('🩹 Перевязка', '−1 припас: +3 здоровья и перевязать рану', 'heal-stop');
    }
    const debtor = known.find(n => n.relation === 'debtor' && !n.helped);
    if (debtor) push('🤝 ' + debtor.name, 'Должник выручает один раз за кампанию: преимущество в следующий бросок', 'call-debtor');

    acts.forEach(a => chips.appendChild(a));
    bar.hidden = chips.children.length === 0;
    // если строка ушла за край — мягко подсказываем, что её можно пролистать
    const more = chips.scrollWidth > chips.clientWidth + 4;
    chips.classList.toggle('is-more', more);
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
    barLabel(toggle, $('#log-wrap').hidden ? 'История ' + total : 'Скрыть');
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
  /** Короткая подпись модификатора: «+1», «0», «−1». */
  function shortStat(stat, mod) {
    return (mod > 0 ? '+' : '') + mod;
  }

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
      const plan = actionPlan(g, opt);          // та же поправка, что уйдёт в бросок
      const advantage = plan.advantage;
      const dc = plan.dc;
      const chance = Math.round(E.successChance(totalMod, dc, advantage) * 100);
      // одна строка вместо трёх: сложность и шанс в одном чипе — кнопки ниже, тексту больше места
      const meta = [
        h('span', { class: 'tag tag--pair', style: '--c:' + diff.color, title: 'сложность и шанс успеха' }, [
          h('span', { text: diff.label }),
          h('span', { class: 'tag__sep', text: '·' }),
          h('span', { class: 'tag__chance', text: chance + '%' }),
          advantage ? h('span', { class: 'tag__adv', title: 'преимущество: два d20, берём лучший', text: '↑' }) : null
        ]),
        h('span', {
          class: 'tag tag--stat',
          title: stat.hint + (buff ? ' +' + buff + ' к броску' : ''),
          text: stat.icon + ' ' + stat.short + ' ' + shortStat(stat, mod + buff)
        })
      ];
      const btn = h('button', {
        class: 'action-btn' + (plan.plan ? ' action-btn--social' : ''), type: 'button',
        'aria-label': opt.text + '. ' + diff.label + ', шанс ' + chance + ' процентов'
          + (plan.plan ? '. Знакомый: ' + plan.plan.name : ''),
        onclick: () => {
          if (opt.__held) { opt.__held = false; return; }   // долгое нажатие — это вопрос, а не выбор
          onActionChosen(opt);
        }
      }, [
        h('span', { class: 'action-btn__text', text: opt.text }),
        h('span', { class: 'action-btn__meta' }, meta)
      ]);
      attachLongPress(btn, opt, { stat, diff, mod: totalMod, chance, dc, advantage });
      wrap.appendChild(btn);
    });
  }

  /**
   * Долгое нажатие на вариант — объяснение шанса словами (п.24).
   * Пальцем по телефону это быстрее, чем разбирать чипы.
   */
  function attachLongPress(btn, opt, info) {
    let timer = null;
    const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
    btn.addEventListener('touchstart', () => {
      clear();
      timer = setTimeout(() => {
        opt.__held = true;
        clear();
        Sound.tap();
        const src = info.advantage
          ? 'преимущество: два d20, берём лучший'
          : (info.mod >= 0 ? '+' + info.mod : String(info.mod)) + ' к броску';
        notify('Почему ' + info.chance + '%: ' + info.stat.short + ' ' + info.mod +
          ' против сложности ' + info.dc + ' (' + info.diff.label + '), ' + src + '.', { timeout: 5200 });
      }, 550);
    }, { passive: true });
    // Отпустили палец — снимаем метку чуть позже: так гасится «щелчок» от самого
    // долгого нажатия, но следующий осознанный тап по этому же варианту работает.
    const release = () => {
      clear();
      if (opt.__held) setTimeout(() => { opt.__held = false; }, 400);
    };
    btn.addEventListener('touchmove', clear, { passive: true });
    btn.addEventListener('touchend', release, { passive: true });
    btn.addEventListener('touchcancel', release, { passive: true });
    btn.addEventListener('contextmenu', e => e.preventDefault());
  }

  /**
   * Жесты, которых ждёт палец (п.24): свайп влево по кадру — перерисовать,
   * свайп вверх по панели — история. Всё дополнительно к кнопкам.
   * Здесь же — клавиатура и фокус-ловушка (п.26).
   */
  function attachGestures() {
    const media = $('#scene-media');
    if (media) {
      let sx = 0, sy = 0;
      media.addEventListener('touchstart', e => {
        const t = e.touches && e.touches[0];
        if (!t) return;
        sx = t.clientX; sy = t.clientY;
      }, { passive: true });
      media.addEventListener('touchend', e => {
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!t) return;
        const dx = t.clientX - sx, dy = t.clientY - sy;
        if (dx > -46 || Math.abs(dy) > 60) return;               // нужен именно свайп влево
        if (State.book) {
          const cur = bookCurrent();
          State.backdropSeed = E.rnd.seed();
          if (cur) paintBackdrop(cur.node.art || cur.node.chapter, cur.node.text.join(' '));
          toast('Кадр перерисован', { timeout: 1400 });
          return;
        }
        Sound.tap();
        toast('Рисуем кадр заново', { timeout: 1500 });
        loadSceneImage(State.game && State.game.scene && State.game.scene.imagePrompt, null, false, { force: true });
      }, { passive: true });
    }

    const panel = $('#panel');
    if (panel) {
      let py = 0;
      panel.addEventListener('touchstart', e => {
        const t = e.touches && e.touches[0];
        if (t) py = t.clientY;
      }, { passive: true });
      panel.addEventListener('touchend', e => {
        const t = (e.changedTouches && e.changedTouches[0]) || null;
        if (!t) return;
        const dy = t.clientY - py;
        const wrap = $('#log-wrap');
        const toggle = $('#log-toggle');
        if (!wrap || !toggle || toggle.hidden) return;
        if (dy < -46 && wrap.hidden) {
          wrap.hidden = false;
          barLabel(toggle, 'Скрыть');
          Sound.tap();
        } else if (dy > 46 && !wrap.hidden) {
          wrap.hidden = true;
          barLabel(toggle, 'История');
        }
      }, { passive: true });
    }

    // клавиатура: цифры выбирают вариант, Esc — назад, Tab не уходит из модалки
    document.addEventListener('keydown', e => {
      const modalOpen = !$('#modal').hidden;
      if (e.key === 'Tab' && modalOpen) {
        const items = $$('#modal button, #modal [href], #modal input, #modal [tabindex]:not([tabindex="-1"])')
          .filter(el => !el.disabled && el.offsetParent !== null);
        if (!items.length) return;
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (e.key === 'Escape') {
        if (modalOpen) { closeModal(); return; }
        if (document.body.dataset.screen === 'game' && $('#prologue') && !$('#prologue').hidden) {
          $('#prologue').hidden = true;
          return;
        }
        if (document.body.dataset.screen === 'game') {
          const close = $('[data-act="close-game"]');
          if (close) close.click();
        } else if (document.body.dataset.screen !== 'menu') {
          const back = $('[data-act="back"]');
          if (back) back.click();
        }
        return;
      }
      if (document.body.dataset.screen !== 'game' || modalOpen) return;
      if (/^[1-9]$/.test(e.key)) {
        const btns = $$('#actions .action-btn:not(.action-btn--ghost)');
        const btn = btns[Number(e.key) - 1];
        if (btn) { e.preventDefault(); btn.click(); }
      }
    });
  }

  /* --- мгновенный фон + догрузка ИИ-картинки --- */
  /**
   * Мгновенный фон: тип местности + кто в кадре.
   * Силуэты героя, противников и предметов берём прямо из текста сцены,
   * чтобы картинка совпадала с тем, что рассказывает мастер.
   */
  /** Палитра истории: берём набор того мира, на обложку которого она похожа. */
  function paletteForBook(book) {
    const list = (E.SCENARIOS || []).concat(E.GAME_WORLDS || []);
    const same = list.filter(x => x && x.palette && x.cover === book.cover);
    return same.length ? same[0].palette : null;
  }

  /** Текст главы истории: по нему кадр понимает место и погоду. */
  function bookNarration() {
    const st = State.book && State.book.state;
    if (!st || !Books) return '';
    const node = Books.bookNode(st);
    const book = Books.bookById(st.bookId);
    return [node && node.art, node && node.text && node.text.join(' '),
      book && book.title, book && book.genre, book && book.world].filter(Boolean).join(' ');
  }

  function paintBackdrop(prompt, sceneText, opts) {
    const g = State.game;
    if (!Backdrop) return;
    const st = State.book && State.book.state;
    const book = (st && Books) ? Books.bookById(st.bookId) : null;
    if (!g && !book) return;
    const o = opts || {};
    const s = g ? E.scenarioById(g.scenarioId) : null;
    // у истории нет мира кампании: место описывают её собственные главы
    const narration = (g
      ? [sceneText, prompt, g.scene && g.scene.npc, g.goal]
      : [prompt, sceneText, bookNarration()]).filter(Boolean).join(' ');
    const kind = E.sceneKindFromText(narration);
    const layers = E.sceneLayersFromText(narration);
    const actors = E.sceneActors(narration);
    if (!o.keepSeed || !State.backdropSeed) State.backdropSeed = E.rnd.seed();
    State.sceneLayers = layers;
    try {
      // нижний слой: место и свет. Фигуры и погода живут на отдельном холсте,
      // поэтому фон можно оставить, а происходящее — сменить.
      Backdrop.draw($('#scene-canvas'), {
        kind, palette: g ? paletteFor(g, s) : paletteForBook(book), seed: State.backdropSeed,
        daypart: layers.daypart, weather: layers.weather, fire: layers.fire
      });
      const canvas = $('#scene-canvas');
      canvas.dataset.kind = kind;
      canvas.dataset.daypart = layers.daypart;
      canvas.dataset.weather = layers.weather;
      canvas.dataset.enemies = actors.enemies.join(',');
    } catch (e) { /* canvas может быть недоступен — не критично */ }
    animateActorsIn();
  }

  /** Оружие героя для силуэта: у каждого класса своё. */
  function heroBackdropWeapon(g) {
    const byClass = { warrior: 'sword', rogue: 'shield', scholar: 'staff', mage: 'staff', wanderer: 'bow', diplomat: 'sword' };
    return byClass[g.hero.classId] || 'sword';
  }

  /**
   * Честный прогресс кадра (п.42): видно, сколько уже ждём и что происходит.
   * Локальный фон к этому моменту уже на экране — его и называем вслух.
   */
  function startFrameProgress() {
    stopFrameProgress();
    const started = Date.now();
    const tick = () => {
      if (!State.game || document.body.dataset.screen !== 'game') return;
      const sec = Math.round((Date.now() - started) / 1000);
      if (sec < 3) {
        setSceneStatus('кадр: ищем генератор…');
        return;
      }
      if (sec < 8) setSceneStatus('кадр ' + sec + ' с — генераторы молчат, рисуем локально');
      else setSceneStatus('кадр ' + sec + ' с — генераторы молчат, локальный фон уже в кадре');
      const badge = $('#scene-badge');
      if (badge && !(State.imagePending && State.imagePending.late)) {
        badge.textContent = 'локальный фон';
        badge.hidden = false;
      }
    };
    tick();
    State.frameProgress = setInterval(tick, 1000);
  }

  function stopFrameProgress() {
    if (State.frameProgress) { clearInterval(State.frameProgress); State.frameProgress = null; }
    clearTimeout(State.imageStatusTimer);
  }

  /**
   * Кадры живут в IndexedDB (п.17): вернулись в знакомое место — картинка
   * встаёт мгновенно, без сети. В памяти держим только последние восемь.
   */
  const FrameStore = (function () {
    const DB = 'dt2-frames-db', STORE = 'frames', LIMIT = 24, TTL = 21 * 24 * 3600 * 1000;
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(resolve => {
        if (typeof indexedDB === 'undefined') return resolve(null);
        try {
          const req = indexedDB.open(DB, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
      return dbp;
    }
    function write(db, fn) {
      try {
        const tx = db.transaction(STORE, 'readwrite');
        fn(tx.objectStore(STORE));
        return tx;
      } catch (e) { return null; }
    }
    return {
      async get(key) {
        const db = await open();
        if (!db) return null;
        return new Promise(resolve => {
          try {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(key);
            req.onsuccess = () => {
              const rec = req.result;
              if (!rec || !rec.blob) return resolve(null);
              if (Date.now() - (rec.at || 0) > TTL) return resolve(null);
              let url = '';
              try { url = URL.createObjectURL(rec.blob); } catch (e) { return resolve(null); }
              resolve({ url, source: rec.source || 'кэш кадра', at: rec.at });
            };
            req.onerror = () => resolve(null);
          } catch (e) { resolve(null); }
        });
      },
      async put(key, url, source, place) {
        if (!key || !url || /^data:/.test(url)) return false;
        const db = await open();
        if (!db) return false;
        let blob = null;
        try {
          const res = await fetch(url, { cache: 'force-cache' });
          if (res && res.ok) blob = await res.blob();
        } catch (e) { return false; }
        if (!blob || !blob.size || blob.size > 1.6e6) return false;
        const tx = write(db, store => store.put({ key, blob, source: source || '', place: place || '', at: Date.now() }, key));
        if (!tx) return false;
        tx.oncomplete = () => {
          // подрезаем хранилище: оставляем самые свежие кадры
          try {
            const all = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
            all.onsuccess = () => {
              const rows = (all.result || []).sort((a, b) => (b.at || 0) - (a.at || 0));
              rows.slice(LIMIT).forEach(r => write(db, store => store.delete(r.key)));
            };
          } catch (e) { /* подрезка не критична */ }
        };
        return true;
      },
      async count() {
        const db = await open();
        if (!db) return 0;
        return new Promise(resolve => {
          try {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).count();
            req.onsuccess = () => resolve(req.result || 0);
            req.onerror = () => resolve(0);
          } catch (e) { resolve(0); }
        });
      },
      async clear() {
        const db = await open();
        if (!db) return;
        write(db, store => store.clear());
      }
    };
  })();

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
    stopFrameProgress();
    setSceneStatus('');
    if (State.game && State.game.scene) {
      // blob: живёт до перезагрузки — в сейв уходит только «долгая» ссылка
      if (!/^blob:/.test(String(url || ''))) State.game.scene.image = url;
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
   * Кадр, нарисованный раньше, лежит в IndexedDB. Ссылка из сейва может не
   * открыться (сеть пропала, серверный кэш остыл), а копия в телефоне — нет.
   */
  function restoreStoredFrame(game, fallbackUrl, fallbackSource) {
    const g = game || State.game;
    const place = (g && g.scene && g.scene.place) || '';
    const fromLink = () => {
      if (!fallbackUrl || State.game !== g) return;
      setSceneImage(fallbackUrl, fallbackSource);
      $('#scene-badge').hidden = true;
    };
    if (!place) return fromLink();
    // Ключ кадра мог быть записан с меткой предмета (крупный план записки, карты и т.п.).
    // Сейв помнит точный ключ — берём его первым, иначе считаем по месту и по соседям.
    const saved = (g && g.scene && g.scene.placeKey) || '';
    const base = E.placeKey(g, place);
    const keys = [saved, base].filter(Boolean);
    Object.keys(State.imageCache || {}).forEach(k => {
      if (k === base || k.indexOf(base + ':') === 0) keys.push(k);
    });
    const unique = keys.filter((k, i) => k && keys.indexOf(k) === i);
    (async () => {
      for (let i = 0; i < unique.length; i++) {
        const key = unique[i];
        let stored = null;
        try { stored = await FrameStore.get(key); } catch (e) { stored = null; }
        if (State.game !== g) return;
        if (stored && stored.url) {
          State.imageCache[key] = { url: stored.url, source: stored.source, at: stored.at || Date.now() };
          State.imageKey = key;
          if (g.scene) g.scene.placeKey = key;
          setSceneImage(stored.url, stored.source);
          $('#scene-badge').hidden = true;
          return;
        }
      }
      fromLink();
    })();
  }

  /**
   * Картинка места: рисуется один раз и переиспользуется. Вернулись в знакомое
   * место — фон остаётся, меняется только слой действия.
   */
  async function loadSceneImage(prompt, action, silent, opts) {
    const g = State.game;
    if (!g) return;
    const o = opts || {};
    const place = o.place || (g.scene && g.scene.place) || E.memoryOf(g).place || g.chapter || '';
    // Кадр рисуется не только «по месту», но и «по предмету»: поднял записку —
    // это новый кадр (крупный план с запиской), а не прежний пейзаж из кэша.
    const focus = E.actionFocus(action && action.text, (g.scene && g.scene.text) || '');
    const focusTag = focus && focus.tag ? focus.tag : '';
    const placeBase = place ? E.placeKey(g, place) : E.styleOf(g).id + ':начало';
    const key = focusTag ? placeBase + ':' + focusTag : placeBase;
    // то же место, названное другими словами: переиспользуем уже нарисованный кадр
    // похожий кадр другого места берём только когда предмета в действии нет:
    // иначе игрок увидит чужой пейзаж вместо своей записки
    const nearKey = !o.force && place && !focusTag
      ? Object.keys(State.imageCache).find(k => k !== key && E.isSamePlace(k.split(':').slice(1).join(':').replace(/-/g, ' '), place))
      : null;
    const cached = !o.force && (State.imageCache[key] || (nearKey && State.imageCache[nearKey]));
    if (cached && cached.url) {
      State.imageKey = key;
      if (g.scene) { g.scene.placeKey = key; }
      setSceneImage(cached.url, cached.source || 'кэш места');
      return;
    }
    // Кадр этого места уже рисовали раньше: показываем сразу и без сети (п.17).
    if (!o.force) {
      const stored = await FrameStore.get(key);
      if (stored && stored.url) {
        State.imageCache[key] = { url: stored.url, source: stored.source, at: stored.at || Date.now() };
        State.imageKey = key;
        if (g.scene) g.scene.placeKey = key;
        if (g === State.game) { setSceneImage(stored.url, stored.source); $('#scene-badge').hidden = true; }
        return;
      }
    }
    // Кадр, начатый по первым строкам сцены: место тогда называлось иначе —
    // не запускаем второй запрос, а дожидаемся того, что уже рисуется.
    const early = State.earlyImage;
    if (!o.force && early && early.request && !State.imagePending[key]) {
      const known = ((g.scene && g.scene.text) || '').replace(/\s+/g, ' ');
      const sameScene = !!(early.scene && known.indexOf(early.scene) === 0);
      if (sameScene || early.key === key) {
        const got = await early.request;
        State.earlyImage = null;
        if (got && got.ok) {
          State.imageCache[key] = { url: got.url, source: got.source, at: Date.now() };
          State.imageKey = key;
          if (g.scene) g.scene.placeKey = key;
          setSceneImage(got.url, got.source);
          $('#scene-badge').hidden = true;
          if (!silent) setSceneStatus('');
          return;
        }
      }
    }
    // Мастер дал промпт сцены — рисуем по нему: герой, противники, предметы и свет
    // из рассказа. Если промпта ещё нет (графика идёт по потоку), собираем кадр
    // из самой сцены и места, но никогда — из промпта прошлой сцены.
    const sceneText = o.sceneText || (g.scene && g.scene.text) || '';
    const aiPrompt = prompt || (o.early ? '' : (g.scene && g.scene.imagePrompt)) || '';
    const used = o.early
      ? earlyImagePrompt(g, place, sceneText)
      : (aiPrompt
        ? E.composeSceneImagePrompt(g, { aiPrompt, sceneText, npc: g.scene && g.scene.npc, action })
        : E.placePrompt(g, place, '', { noStyle: true }));
    // строка «рисуем кадр…» живёт недолго: сцена уже нарисована сама,
    // а кадр подтянется, когда генератор ответит, — ждать его на экране не нужно
    if (!silent) startFrameProgress();
    $('#scene-badge').textContent = 'кадр подтягивается';
    $('#scene-badge').hidden = false;

    // Пока кадр для этого места уже рисуется, второй запрос не запускаем:
    // генератор занят, и дубль только отнимает время.
    if (!State.imagePending) State.imagePending = {};
    if (State.imagePending[key] && !o.force) {
      const waiting = await State.imagePending[key];
      if (waiting && waiting.ok) {
        State.imageCache[key] = { url: waiting.url, source: waiting.source, at: Date.now() };
        State.imageKey = key;
        if (g.scene) g.scene.placeKey = key;
        setSceneImage(waiting.url, waiting.source);
        $('#scene-badge').hidden = true;
      }
      return;
    }
    const turnAtRequest = g.turn || 0;
    const seed = E.rnd.seed();
    // гонка источников: что ответит быстрее — то и показываем.
    // Как только картинка показана, отставшие попытки больше не меняют подписи.
    let settled = false;
    const request = API.generateImage({
      prompt: used,
      style: E.styleOf(g).imageStyle,
      aspect: '16:9',
      seed,
      onAttempt: name => {
        if (settled) return;
        setSceneStatus(name === 'a0' ? 'пробуем другой генератор…' : 'рисуем кадр…');
      }
    });
    State.imagePending[key] = request;
    if (o.early) State.earlyImage = { request, key, scene: (o.sceneText || '').replace(/\s+/g, ' ').slice(0, 60), at: Date.now() };
    const imageStartedAt = Date.now();
    const res = await request;
    delete State.imagePending[key];
    settled = true;
    // метрика кадра: сколько секунд ждал игрок (и получил ли картинку вообще)
    MetricsBox.image(Date.now() - imageStartedAt, { failed: !res || !res.ok });
    if (o.early && State.earlyImage && State.earlyImage.request === request) State.earlyImage = null;
    if (res.ok) {
      // галерея кампании: лучшие кадры пригодятся для финала
      Frames.remember(State.game, res.url, res.source, place);
      // кадр показываем, если место всё ещё актуально: или это тот же ход,
      // или мастер называет место теми же словами другими буквами
      // игра могла закрыться, пока генератор рисовал: тогда просто складываем кадр в кэш
      const live = State.game;
      const nowPlace = (live && live.scene && live.scene.place) || '';
      const stillHere = !live || State.imageKey === key || live.turn === turnAtRequest || E.isSamePlace(nowPlace, place);
      if (!stillHere) {
        State.imageCache[key] = { url: res.url, source: res.source, at: Date.now() };
        return;
      }
      g.usedImagePrompts = (g.usedImagePrompts || []).concat([used]).slice(-12);
      g.lastImagePrompt = used;
      State.imageCache[key] = { url: res.url, source: res.source, at: Date.now() };
      trimImageCache();
      State.imageKey = key;
      if (g.scene) g.scene.placeKey = key;
      stopFrameProgress();
      setSceneImage(res.url, res.source);
      $('#scene-badge').hidden = true;
      FrameStore.put(key, res.url, res.source, place);
      if (res.source === 'stock') {
        $('#scene-badge').textContent = 'запасной фон';
        $('#scene-badge').hidden = false;
      }
    } else {
      stopFrameProgress();
      setSceneStatus('');
      $('#scene-badge').hidden = false;
      $('#scene-badge').textContent = 'локальный фон — генераторы молчат';
      const local = localSceneImage();
      if (local) setSceneImage(local, 'локальный фон');
      else drawActorLayer(0, 1);
      // Сервер досчитывает медленный кадр в фоне: через полминуты просим ещё раз —
      // если игрок всё ещё в этом месте, кадр придёт из кэша мгновенно.
      if (!res.local) scheduleLateFrame(key, place);
      // про молчащие генераторы говорим один раз и потом раз в три кадра
      const miss = (State.imageMiss = (State.imageMiss || 0) + 1);
      if (miss === 1 || miss % 3 === 0) {
        notify('Генератор картинок молчит — сцена нарисована локально', { kind: 'warn', timeout: 5000 });
      }
    }
  }

  /**
   * Медленный кадр догоняет сцену: один отложенный запрос через полминуты.
   * За это время сервер успевает получить картинку от генератора и положить её
   * в кэш, поэтому второй запрос отвечает почти мгновенно.
   */
  function scheduleLateFrame(key, place) {
    if (State.lateFrame && State.lateFrame.key === key) return;
    clearTimeout(State.lateFrameTimer);
    State.lateFrame = { key, place };
    State.lateFrameTimer = setTimeout(async () => {
      State.lateFrame = null;
      const g = State.game;
      if (!g || document.body.dataset.screen !== 'game') return;
      const nowPlace = (g.scene && g.scene.place) || '';
      if (State.imageKey === key && State.imageCache[key]) return;
      if (place && nowPlace && !E.isSamePlace(nowPlace, place)) return;   // место уже сменилось
      const cached = await API.generateImage({
        prompt: g.scene && g.scene.imagePrompt,
        style: E.styleOf(g).imageStyle,
        aspect: '16:9',
        seed: E.rnd.seed()
      });
      if (!cached || !cached.ok) return;
      if (g !== State.game) return;
      State.imageCache[key] = { url: cached.url, source: cached.source, at: Date.now() };
      State.imageKey = key;
      if (g.scene) g.scene.placeKey = key;
      stopFrameProgress();
      setSceneImage(cached.url, cached.source);
      FrameStore.put(key, cached.url, cached.source, place);
      $('#scene-badge').hidden = true;
      Frames.remember(g, cached.url, cached.source, place);
    }, 32000);
  }

  /** Локальная картинка сцены: тот же мотив, что на холсте — на случай обрыва связи. */
  function localSceneImage() {
    const g = State.game;
    if (!g || !Backdrop) return '';
    try {
      const canvas = $('#scene-canvas');
      const text = [g.scene && g.scene.text, g.title, g.goal].filter(Boolean).join(' ');
      const kind = (canvas && canvas.dataset.kind) || E.sceneKindFromText(text);
      const layers = State.sceneLayers || E.sceneLayersFromText(text);
      return Backdrop.toDataUrl({
        kind, palette: paletteFor(g, E.scenarioById(g.scenarioId)), seed: State.backdropSeed || 7,
        daypart: layers.daypart, weather: layers.weather, fire: layers.fire
      });
    } catch (e) { return ''; }
  }

  /** Кэш мест: держим последние восемь картинок — этого хватает на главу. */
  function trimImageCache() {
    const keys = Object.keys(State.imageCache);
    if (keys.length <= 8) return;
    keys.sort((a, b) => (State.imageCache[a].at || 0) - (State.imageCache[b].at || 0));
    keys.slice(0, keys.length - 8).forEach(k => { delete State.imageCache[k]; });
  }

  /** Текст длиннее панели — гасим нижнюю строку, чтобы было видно продолжение. */
  function updatePanelFade() {
    const panel = $('#panel');
    if (!panel) return;
    const more = panel.scrollHeight - panel.scrollTop - panel.clientHeight > 2;   // даже пара пикселей — уже «есть дальше»
    panel.classList.toggle('is-scrollable', more);
  }

  /** Строка главы над текстом сцены. */
  function renderChapter(g) {
    const el = $('#scene-chapter');
    if (!el) return;
    const raw = g && (g.chapter || (g.scene && g.scene.chapter));
    const chapter = String(raw || '').replace(/^глава\s*[:\-–—]?\s*/i, '').trim() || String(raw || '');
    if (!chapter || State.prologueOpen) { el.hidden = true; return; }
    // честная пометка: если ход собрал встроенный мастер, игрок видит, кто ведёт сцену
    const local = !!(g && g.scene && g.scene.offline);
    el.textContent = 'Глава: ' + chapter + (local ? ' · встроенный мастер' : '');
    el.hidden = false;
  }

  /**
   * Высота приложения = высота видимой области.
   * Safari и вебвью прячут/показывают панель адреса, из-за чего страница
   * либо оставляет пустоту снизу, либо прячет текст за краем. Меряем сами.
   */
  function syncAppHeight() {
    const vv = window.visualViewport;
    const h = Math.round((vv && vv.height) || window.innerHeight || 0);
    if (h > 200) document.documentElement.style.setProperty('--app-h', h + 'px');
  }

  function watchAppHeight() {
    syncAppHeight();
    let raf = 0;
    const soon = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => { raf = 0; syncAppHeight(); });
    };
    window.addEventListener('resize', soon);
    window.addEventListener('orientationchange', soon);
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', soon);
      window.visualViewport.addEventListener('scroll', soon);
    }
    // Safari иногда меняет высоту без событий — подстрахуемся редкой проверкой
    setInterval(syncAppHeight, 1500);
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
          // весь экран чувствует бросок: провал трясёт, крит вспыхивает
          const card = $('#screen-game');
          if (card && Settings.data.motion !== false) {
            const fx = check.outcome === 'crit' ? 'is-flash' : (check.outcome === 'fumble' ? 'is-shake' : '');
            if (fx) {
              card.classList.remove('is-flash', 'is-shake');
              void card.offsetWidth;
              card.classList.add(fx);
              setTimeout(() => card.classList.remove(fx), 900);
            }
          }
          if (Settings.data.haptics !== false && typeof navigator.vibrate === 'function') {
            if (check.outcome === 'fumble') { try { navigator.vibrate([40, 60, 90]); } catch (e) { /* noop */ } }
            else if (check.outcome === 'crit') { try { navigator.vibrate([18, 30, 18, 30, 60]); } catch (e) { /* noop */ } }
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

  /**
   * Номер озвучиваемой сцены. Всё, что относится к прошлому номеру, замолкает
   * сразу: и очередь абзацев, и уже начатый mp3. Без этого голос догонял игрока
   * через ход-два — читал то, что он уже прошёл.
   */
  let speakEpoch = 0;
  const speakAborts = new Set();
  const speakLog = [];           // след чтения для прогонов: что и когда ушло в голос

  /** Новый номер сцены: прошлая озвучка (и всё, что не успело зазвучать) отменяется. */
  function speakFresh() {
    speakEpoch += 1;
    while (speakAborts.size) {
      const abort = speakAborts.values().next().value;
      speakAborts.delete(abort);
      try { abort(); } catch (e) { /* не критично */ }
    }
    return speakEpoch;
  }

  /** Сцена сменилась — цепочка абзацев должна остановиться на ближайшей проверке. */
  function speakStill(epoch) {
    return Voice.on && epoch === speakEpoch;
  }

  /** Озвучка сцены: системный синтез речи, всегда с кнопкой «выключить». */
  const Voice = (function () {
    /**
     * Озвучка в два слоя. Первый — нейросетевой голос с сервера (mp3):
     * он заметно живее браузерного и одинаково звучит на всех устройствах.
     * Второй — синтез браузера: он есть всегда, поэтому игра не остаётся
     * без голоса ни в подземке, ни на выключенном сервере.
     */
    // Подача голоса: те же имена, что на сервере (sceneMood). Браузерный синтез
    // умеет только rate/pitch — ими и передаём настроение, чтобы голос не был «ровным роботом».
    const MOOD_VOICE = {
      book:    { rate: 0.98, pitch: 1.0 },
      dark:    { rate: 0.9,  pitch: 0.9 },
      dread:   { rate: 0.8,  pitch: 0.8 },
      hurt:    { rate: 0.87, pitch: 0.85 },
      tense:   { rate: 1.06, pitch: 1.05 },
      triumph: { rate: 1.06, pitch: 1.14 },
      ironic:  { rate: 1.02, pitch: 1.04 },
      soft:    { rate: 0.92, pitch: 1.02 },
      heroic:  { rate: 1.0,  pitch: 1.07 },
      hard:    { rate: 1.02, pitch: 0.93 }
    };
    function prosodyFor(mood) {
      const names = String(mood || 'book').split('+').filter(x => MOOD_VOICE[x]);
      if (!names.length) return { rate: 0.98, pitch: 1.0 };
      const sum = names.reduce((acc, n) => ({
        rate: acc.rate + MOOD_VOICE[n].rate, pitch: acc.pitch + MOOD_VOICE[n].pitch
      }), { rate: 0, pitch: 0 });
      return { rate: sum.rate / names.length, pitch: sum.pitch / names.length };
    }

    const supported = (typeof window !== 'undefined' && 'speechSynthesis' in window &&
      typeof window.SpeechSynthesisUtterance === 'function') || typeof window !== 'undefined';
    let ruVoice = null;
    let audio = null;          // текущее воспроизведение серверной озвучки
    let audioUrl = null;
    let speakId = 0;           // прерываем прошлую озвучку, если пришла новая сцена

    function pick() {
      if (!(typeof window !== 'undefined' && 'speechSynthesis' in window)) return null;
      let list = [];
      try { list = window.speechSynthesis.getVoices() || []; } catch (e) { list = []; }
      // На телефонах есть голоса получше системных: ищем их первыми
      const prefer = ['siri', 'google', 'premium', 'enhanced', 'natural'];
      const ru = list.filter(v => /^ru(-|_)?/i.test(v.lang) || /rus/i.test(v.name));
      return ru.find(v => prefer.some(p => new RegExp(p, 'i').test(v.name))) || ru[0] || null;
    }
    function stopBrowser() {
      if (!(typeof window !== 'undefined' && 'speechSynthesis' in window)) return;
      try { window.speechSynthesis.cancel(); } catch (e) { /* noop */ }
    }
    function stop() {
      speakId += 1;
      stopBrowser();
      if (audio) { try { audio.pause(); } catch (e) { /* noop */ } audio = null; }
      if (audioUrl) { try { URL.revokeObjectURL(audioUrl); } catch (e) { /* noop */ } audioUrl = null; }
      // очередь абзацев и уже начатые куски прекращаются вместе с плеером
      speakFresh();
    }
    function sayBrowser(text, mood) {
      if (!(typeof window !== 'undefined' && 'speechSynthesis' in window)) return false;
      const clean = String(text || '')
        .replace(/[«»""„“*_#`]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 900);
      if (!clean) return false;
      if (!ruVoice) ruVoice = pick();
      const parts = clean.match(/[^.!?…]+[.!?…]*/g) || [clean];
      parts.forEach(part => {
        const piece = part.trim();
        if (!piece) return;
        const u = new window.SpeechSynthesisUtterance(piece);
        if (ruVoice) u.voice = ruVoice;
        u.lang = ruVoice ? ruVoice.lang : 'ru-RU';
        const p = prosodyFor(mood);
        u.rate = p.rate;        // медленнее в страхе и боли, быстрее в победе
        u.pitch = p.pitch;      // ниже голос в мрачном, выше в триумфе
        try { window.speechSynthesis.speak(u); } catch (e) { /* noop */ }
      });
      return true;
    }
    /** Речь с сервера: тянем mp3 и играем. Не вышло — читаем голосом браузера. */
    function say(text, mood, voiceOverride) {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean) return false;
      stop();
      const myId = speakId;
      const gender = voiceOverride || Settings.data.voiceGender || 'female';
      API.speakScene(clean, { mood: mood || 'book', gender }).then(url => {
        if (myId !== speakId) { if (url) URL.revokeObjectURL(url); return; }   // сцена уже сменилась
        if (!url) { sayBrowser(clean, mood); return; }
        audioUrl = url;
        const el = new window.Audio(url);
        audio = el;
        el.onended = () => { if (audio === el) { try { URL.revokeObjectURL(url); } catch (e) {} audio = null; audioUrl = null; } };
        el.onerror = () => { if (audio === el) { try { URL.revokeObjectURL(url); } catch (e) {} audio = null; audioUrl = null; } sayBrowser(clean, mood); };
        el.play().catch(() => sayBrowser(clean, mood));
      }).catch(() => { if (myId === speakId) sayBrowser(clean, mood); });
      return true;
    }
    function syncButton() {
      const btn = $('#speak-btn');
      if (!btn) return;
      if (!supported) { btn.hidden = true; return; }
      btn.hidden = false;
      const on = !!Settings.data.voice;
      barLabel(btn, on ? 'Без озвучки' : 'Озвучить');
      const icon = btn.querySelector('.bar-btn__icon');
      if (icon) icon.textContent = on ? '🔇' : '🔊'; else btn.textContent = on ? '🔇 Без озвучки' : '🔊 Озвучить';
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.classList.toggle('is-on', on);
    }

    return {
      supported,
      syncButton,
      say,          // наружу — для проверок и отладки озвучки
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
      /**
       * Новая сцена: читаем абзацами, каждому — своя подача (описание, реплика,
       * ранение). Так сцена слушается как аудиокнига, а не как ровный текст.
       */
      scene(text, mood) {
        if (!this.on) return;
        speakFresh();                        // старые абзацы потеряли право голоса
        stop();
        speakParagraphs(text, mood, Settings.data.voiceGender);
      },
      stop,
      /** Состояние для прогонов: номер сцены, очередь чтения, играет ли звук. */
      state() {
        return {
          on: !!Settings.data.voice && supported,
          epoch: speakEpoch,             // номер озвучиваемой сцены
          aborts: speakAborts.size,      // сколько кусков ещё ждёт очереди
          playing: !!audio,              // звучит ли серверный mp3 прямо сейчас
          chain: !!speakChain,           // цепочка абзацев жива
          log: speakLog.slice(-12),      // что ушло в голос и когда
          now: Date.now()
        };
      }
    };
  })();

  try { window.DTvoice = Voice; } catch (e) { /* noop */ }
  // датчик блока B: прогон проверяет карточки предметов, припасы, состояния и темы
  try {
    window.DTv20 = {
      game: () => State.game,
      mech: (kind, id) => runMech(kind, id),
      refresh: () => { renderMechanics(); renderGameTop(); renderLog(); },
      theme: () => document.body.dataset.theme || ''
    };
  } catch (e) { /* noop */ }
  // датчик кадра: прогон проверяет, что действие с предметом даёт крупный план предмета
  try { window.DTfocus = (action, scene) => E.actionFocus(action, scene); } catch (e) { /* noop */ }
  // датчик состояния для прогонов и отладки: ход, занятость, сцена, варианты
  try {
    window.DTnotes = [];
    window.DTstate = () => {
      const g = State.game || {};
      const sc = g.scene || {};
      return {
        turn: g.turn || 0,
        busy: !!State.busy,
        screen: (document.body.dataset.screen || ''),
        scene: sc.text || '',
        options: (sc.options || []).length,
        optionTexts: (sc.options || []).map(o => String((o && (o.text || o.title)) || '')),
        chapter: g.chapter || sc.chapter || '',
        place: sc.place || '',
        npc: sc.npc || '',
        offline: !!sc.offline,
        mood: (State.mood && State.mood.mood) || '',
        moodVoice: (State.mood && State.mood.voice) || '',
        typing: !!(document.querySelector('#scene-text .is-typing')),
        motion: document.getElementById('screen-game') ? document.getElementById('screen-game').dataset.motion : '',
        voice: (window.DTvoice && window.DTvoice.state) ? window.DTvoice.state() : null,
        notes: (window.DTnotes || []).slice(-6)
      };
    };
  } catch (e) { /* noop */ }

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
    if (!Backdrop) return;
    const st = State.book && State.book.state;
    if (!g && !st) return;
    const canvas = $('#scene-actors');
    if (!canvas) return;
    const s = g ? E.scenarioById(g.scenarioId) : null;
    const hasImage = !!(g && g.scene && g.scene.image);
    // в истории герой безымянный странник: он идёт по главе против тех, о ком она говорит
    const narration = g
      ? [g.scene && g.scene.text, g.scene && g.scene.npc, g.goal].filter(Boolean).join(' ')
      : bookNarration();
    const kind = E.sceneKindFromText(narration);
    const actors = Object.assign(E.sceneActors(narration), {
      hero: g
        ? { shape: 'human', weapon: heroBackdropWeapon(g), shield: ['warrior', 'lg-heir'].indexOf(g.hero.classId) >= 0 }
        : { shape: 'human', weapon: 'staff', shield: false }
    });
    try {
      const layers = State.sceneLayers || E.sceneLayersFromText(narration);
      Backdrop.drawOver(canvas, {
        kind, seed: State.backdropSeed, actors, palette: g ? paletteFor(g, s) : paletteForBook(book0(State)),
        over: hasImage, time: time || 0,
        daypart: layers.daypart, weather: layers.weather, fire: layers.fire,
        progress: progress === undefined ? State.actorProgress : progress
      });
    } catch (e) { /* canvas может быть недоступен — не критично */ }
  }

  /** Книга текущей истории — там, где кампании нет. */
  function book0(state) {
    const st = state && state.book && state.book.state;
    return (st && Books) ? Books.bookById(st.bookId) : null;
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
      setTurnStatus('Мастер думает — отвечает до полуминуты, ход не потеряется…');
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
    let turn = await API.generateOpening(g, {
      extra: State.openingExtra || '',
      onStatus: statusHook(),
      onDelta: full => previewSceneStream(full),
      onPreviewEnd: stopScenePreview
    });
    // Проверяем ответ и, если он негодный, просим один раз переписать —
    // автоматически, без разговоров с игроком.
    let check = E.validateTurn(turn, g);
    if (!check.ok && !turn.offline) {
      console.log('[проверка хода]', check.problems.join('; '));
      const fixed = await API.generateOpening(g, {
        extra: State.openingExtra || '',
        repair: E.repairHint(check),
        onStatus: statusHook()
      });
      const check2 = E.validateTurn(fixed, g);
      if (fixed && !fixed.offline && (check2.ok || check2.problems.length < check.problems.length)) {
        turn = fixed;
        check = check2;
      }
    }
    if (!check.ok) console.log('[проверка хода после повтора]', check.problems.join('; '));
    applyTurn(turn, null, true);
  }

  /**
   * План броска для варианта: сложность с поправкой на знакомого (блок B, п.10).
   * Одна функция на кнопку и на бросок — иначе подпись «шанс 62%» разойдётся с делом.
   */
  function actionPlan(g, opt) {
    let plan = null;
    try { plan = E.socialPlan(g, opt.text); } catch (e) { plan = null; }
    const base = opt.dc || E.difficultyById(opt.difficulty).dc;
    return {
      plan,
      base,
      dc: Math.max(4, base + (plan ? plan.dcShift : 0)),
      advantage: !!g.hero.advantage || !!(plan && plan.advantage)
    };
  }

  async function onActionChosen(opt) {
    const g = State.game;
    if (State.busy || g.over) return;
    State.busy = true;
    Sound.unlock();
    const baseMod = g.hero.stats[opt.stat] || 0;
    const buff = g.hero.buff || 0;
    const ap = actionPlan(g, opt);
    const advantage = ap.advantage;
    if (ap.plan && (ap.plan.dcShift || ap.plan.advantage)) {
      notify(ap.plan.relationIcon + ' ' + ap.plan.note, {
        kind: ap.plan.relation === 'enemy' ? 'warn' : 'info', timeout: 3800
      });
    }
    const check = E.resolveCheck({ stat: opt.stat, dc: ap.dc, bonus: baseMod + buff, advantage });
    E.pushLog(g, {
      kind: 'action',
      text: opt.text,
      meta: 'd20 ' + check.roll + ' + ' + check.mod + ' = ' + check.total + ' против ' + check.dc + ' · ' + check.label
    });
    autosave();
    await Dice.roll(check, g.hero);
    const extra = [];
    if (g.hero.advantage) extra.push('Герой применил умение и бросал с преимуществом.');
    if (buff) extra.push('К броску добавлен бонус умения +' + buff + '.');
    if (ap.plan) {
      extra.push('Это действие про знакомого ' + ap.plan.name + ': ' + ap.plan.note
        + '. Сложность ' + ap.base + ' стала ' + ap.dc + '.');
      if (ap.plan.advantage && !g.hero.advantage) extra.push('Преимущество дало знание о нём.');
    }
    setActionsLoading('Мастер описывает последствия…');
    State.earlyImageDone = false;
    State.earlyImage = null;              // кадр прошлого хода больше не подхватываем
    slowMasterHint();
    let turn = await API.generateTurn(g, opt, check, {
      onStatus: statusHook(),
      extra: extra.join(' '),
      budgetMs: 32000,                 // ход — главный запрос: даём каналу больше времени
      onDelta: full => previewSceneStream(full),
      onPreviewEnd: stopScenePreview
    });
    // Ответ мастера проверяем сразу: короткая сцена, кривые варианты, «решай сам»
    // вместо сцены. Один раз просим переписать — молча для игрока.
    let quality = E.validateTurn(turn, g);
    if (!quality.ok && turn && !turn.offline) {
      console.log('[проверка хода]', quality.problems.join('; '));
      const fixed = await API.generateTurn(g, opt, check, {
        onStatus: statusHook(),
        extra: extra.join(' '),
        repair: E.repairHint(quality),
        budgetMs: 24000
      });
      const again = E.validateTurn(fixed, g);
      if (fixed && !fixed.offline && (again.ok || again.problems.length < quality.problems.length)) {
        turn = fixed;
        quality = again;
      }
    }
    // Слабая модель иногда повторяет прошлую сцену слово в слово: тогда ход ведёт
    // встроенный мастер — он помнит место и знакомых и не повторяется.
    if (turn && turn.scene && E.isRepeatedScene(g.scene && g.scene.text, turn.scene)) {
      const local = E.offlineTurn(g, opt, check);
      if (local && local.scene) {
        turn = Object.assign({}, local, { repeated: true });
        notify('Мастер повторил прошлую сцену — ход собрал встроенный мастер', { kind: 'info', timeout: 4200 });
      }
    }
    applyTurn(turn, opt, false, false, check);
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

  function applyTurn(turn, action, isOpening, isWorldBuild, check) {
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
      chapter: turn.chapter || '',
      place: turn.place || ''
    });
    if (turn.world || turn.backstory || (turn.plan && turn.plan.length)) {
      g.intro = { world: turn.world || '', backstory: turn.backstory || '', plan: turn.plan || [], scene: turn.scene };
    }
    // память кампании: мастер помнит место, людей, нити и прошлые зачины
    E.rememberTurn(g, turn, action);
    const place = String(turn.place || E.memoryOf(g).place || turn.chapter || g.chapter || '').trim();
    const prevPlace = (g.scene && g.scene.place) || '';
    // место то же, если мастер назвал его теми же словами или пересказал иначе —
    // тогда фон остаётся прежним, а меняется только слой действия
    let samePlace = !!place && State.imageKey === E.placeKey(g, place);
    if (!samePlace && place && prevPlace) samePlace = E.isSamePlace(prevPlace, place);
    const placeKey = samePlace && g.scene && g.scene.placeKey ? g.scene.placeKey : (place ? E.placeKey(g, place) : '');
    g.scene = {
      text: turn.scene,
      options: turn.options,
      npc: turn.npc || '',
      place,
      placeKey,
      chapter: turn.chapter || g.chapter || '',
      partial: !!turn.partial,
      offline: !!turn.offline,          // ход собрал встроенный мастер
      repeated: !!turn.repeated,        // канал повторил прошлую сцену — ход пересобрали
      imagePrompt: turn.imagePrompt || E.composeSceneImagePrompt(g, {
        sceneText: turn.scene, npc: turn.npc, action
      }),
      // мир запоминает, кем в нём играли: второй заход не спросит то же самое
      heroPickSaved: (() => {
        try {
          saveHeroPick({
            classId: g.hero.classId, raceId: g.hero.raceId, originId: g.hero.originId,
            name: g.hero.name, title: g.scenarioTitle || ''
          });
        } catch (e) { /* не критично */ }
        return true;
      })(),
      image: samePlace && g.scene ? (g.scene.image || '') : '',
      imageSource: samePlace && g.scene ? (g.scene.imageSource || '') : ''
    };
    // «поражение с ценой»: проигрыш отнимает силы и вещи, но история идёт дальше
    if (!isWorldBuild && !g.over && g.hero.hp <= 0) handleHeroDown(g, notes, turn);
    if (!isWorldBuild) {
      // метрики: сколько ходов ведёт живой канал, а сколько — встроенный мастер
      MetricsBox.turn({
        offline: !!turn.offline,
        crit: !!(check && /крит/i.test(check.label || '')),
        fumble: !!(check && /провал/i.test(check.label || ''))
      });
    }
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
    // Настроение хода: от него зависят и подача текста, и голос, и подсветка интерфейса
    const hero = g.hero || {};
    State.mood = E.sceneMood(turn, {
      check,
      rules: E.rulesOf(g),
      tone: Settings.data.tone,
      hpLost: Math.max(0, -Number((turn.effects && turn.effects.hp) || 0)),
      danger: Number(g.danger || 0),
      goalDone: !!g.questDone,
      hpLow: !!hero.maxHp && hero.hp > 0 && hero.hp <= Math.max(1, Math.round(hero.maxHp * 0.25))
    });
    applyMoodToUI(State.mood, notes);
    try {
      // видно в прогонах и в отладке: какое настроение выбрано и почему
      console.log('[настроение]', State.mood.mood, '· подача', State.mood.voice,
        '· скорость', State.mood.speed, '· дрожь', State.mood.motion,
        State.mood.reason ? '(' + State.mood.reason + ')' : '');
    } catch (e) { /* noop */ }
    renderSceneText(turn.scene, { typewriter: !streamed, mood: State.mood });
    renderChapter(g);
    const npcEl = $('#scene-npc');
    const said = E.npcLine(turn);
    if (said && said.line) {
      // реплика знакомого — отдельной строкой: её видно, её же читает свой голос
      npcEl.textContent = '🗣 ' + (said.name ? said.name + ': ' : '') + '«' + said.line + '»';
      npcEl.hidden = false;
      npcEl.dataset.npc = said.name || 'знакомый';
      npcEl.dataset.say = said.line;
    } else if (turn.npc) {
      npcEl.textContent = '👤 ' + turn.npc;
      npcEl.hidden = false;
      npcEl.dataset.npc = turn.npc;
    } else {
      npcEl.hidden = true;
      delete npcEl.dataset.npc;
    }
    renderActions(turn.options, false);

    // В книге ИИ не участвует — про недоступного мастера там говорить нечего.
    const offlineTalk = turn.offline && !State.book && !turn.silent;
    if (offlineTalk) {
      // не бубним каждый ход: первый раз предупреждаем, дальше — каждый третий.
      // Считаем именно ходы (номер), иначе повторный applyTurn одного хода пробивает тишину.
      const seen = State.offlineSeen = State.offlineSeen || { turn: -1, n: 0 };
      const turnNo = g.turn || 0;
      if (seen.turn !== turnNo) {
        seen.turn = turnNo;
        seen.n++;
        if (seen.n === 1 || seen.n % 3 === 0) {
          notifyAfterDice('ИИ-мастер недоступен — ход ведёт локальный мастер', { kind: 'warn', timeout: 5200 });
        }
      }
    }
    if (turn.partial && !State.book && !turn.silent) {
      notifyAfterDice('Ответ мастера оборвался — сцену собрали из того, что дошло', { kind: 'info', timeout: 4200 });
      // вместо сообщения — кнопка: игрок чаще всего хочет именно повторить ход
      const host = $('#actions');
      if (host && !$('#retry-turn')) {
        host.appendChild(h('button', {
          id: 'retry-turn', class: 'action-btn action-btn--ghost', type: 'button',
          text: '🔁 Повторить ход заново',
          onclick: () => retryLastTurn()
        }));
      }
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
    Sound.scene(State.mood && State.mood.mood);
    Voice.scene(turn.scene, (State.mood && State.mood.voice) || 'book');
    // знакомый говорит своим тембром — сцена звучит как разговор, а не как чтение
    if (Settings.data.npcVoices !== false && turn.npc && Voice.on) {
      const key = npcVoiceKey(turn);
      const line = E.npcLine(turn);
      const npcEpoch = speakEpoch;          // сцена, к которой относится реплика
      if (key) {
        setTimeout(() => {
          // игрок уже ушёл вперёд — прошлая реплика не звучит вдогонку
          if (npcEpoch !== speakEpoch || !Voice.on) return;
          Voice.say((line && line.line) || turn.npc, 'book', key);
        }, 1200);
      }
    }
    Ambient.sync();
    if (g.over || g.ending === 'victory') setTimeout(showEpilogue, 950);
  }

  /**
   * Здоровье кончилось. По умолчанию это не конец игры, а цена: герой теряет
   * вещь и часть сил. Конец наступает после нескольких провалов или при
   * жёстких правилах. Перерождённый из наследия встаёт один раз за кампанию.
   */
  function handleHeroDown(g, notes, turn) {
    // Канал молчит — значит конец истории был бы не «провалом героя», а технической
    // случайностью. Даём второй шанс: герой встаёт, а мастер объясняет ошибку.
    if (turn && turn.offline && g.hero.hp <= 0 && !g.usedSecondChance) {
      const e = E.resolveDefeat(g);
      // движок называет «история закончена» словом downfall — раньше здесь ждали
      // kind === 'over', и второй шанс не выдавался никогда
      if (e.kind === 'over' || e.kind === 'downfall') {
        g.usedSecondChance = true;
        const r = offerSecondChance(g, notes);
        if (Settings.data.voice) Voice.say('История не закончилась: у героя есть второй шанс.', 'dread');
        return r;
      }
    }
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
    epilogueFoot(false);   // финал кампании играет своими кнопками
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

    // Чем поделиться: карточка кампании картинкой и вся история текстом.
    // Обе кнопки работают без сети — данные уже в памяти браузера.
    const tools = h('div', { class: 'epilogue__tools' });
    tools.appendChild(h('button', {
      class: 'btn btn--primary btn--sm', type: 'button', text: '🎴 Карточка кампании',
      title: 'картинка с героем, миром и вехами',
      onclick: () => {
        const card = E.runCard(g, Object.assign({ ashes: 0 }, legacyRes || {}));
        saveRunCard(card, paletteFor(g, E.scenarioById(g.scenarioId)));
      }
    }));
    tools.appendChild(h('button', {
      class: 'btn btn--ghost btn--sm', type: 'button', text: '📄 История текстом',
      title: 'вся кампания ход за ходом в файл',
      onclick: () => {
        download('campaign-' + (g.id || 'run') + '.md', E.campaignMarkdown(g), 'text/markdown');
        toast('История сохранена текстом', { kind: 'good' });
      }
    }));
    body.appendChild(tools);

    // Итог забега дня: слагаемые счёта и как прошли другие.
    const dailyBox = dailyResultBlock(g);
    if (dailyBox) body.appendChild(dailyBox);

    // Галерея кадров: только те, что нарисовали в этой кампании.
    renderFrames(body);
  }

  /**
   * Галерея кадров в финале. Кадр последнего хода сохраняется в базу чуть позже
   * страницы, поэтому пробуем несколько раз, а не один.
   */
  function renderFrames(body, attempt) {
    const tryNo = attempt || 0;
    Frames.all().then(frames => {
      const mine = (frames || []).filter(f => f && f.url);
      const stale = document.getElementById('epilogue-frames');
      if (stale) stale.remove();
      if (!mine.length) {
        if (tryNo < 2 && body.isConnected) setTimeout(() => renderFrames(body, tryNo + 1), 2500);
        return;
      }
      if (!body.isConnected) return;
      const grid = h('div', { class: 'frames__grid' });
      mine.slice(-8).forEach(f => {
        grid.appendChild(h('img', {
          class: 'frames__img', src: f.url, alt: f.place || 'кадр истории',
          title: f.place || '', loading: 'lazy'
        }));
      });
      body.appendChild(h('div', { class: 'frames', id: 'epilogue-frames' }, [
        h('div', { class: 'frames__title', text: '🖼 Кадры этой истории' }),
        grid
      ]));
    }).catch(() => { /**/ });
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
    if (old.daily) {
      game.daily = old.daily;            // второй заход тем же забегом: мир и цель те же
      game.goal = old.daily.goal;
      Local.set(DAILY_RUN_KEY, { date: old.daily.date, gameId: game.id });
    }
    setDailyRng(game.daily);
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
    // книга-игра: прогресс главы уже сохранён, спрашивать не о чем
    if (State.book) {
      if (Settings.data.voice) Voice.stop();
      show('scenarios');
      setWorldMode('books');
      toast('Место в книге сохранено', { kind: 'good' });
      return;
    }
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
              class: 'btn btn--ghost btn--sm', type: 'button', text: '📄 Текст',
              title: 'выгрузить историю кампании',
              onclick: () => {
                const full = State.storage.load(item.id);
                if (!full) { notify('Сохранение не читается', { kind: 'warn' }); return; }
                download('campaign-' + item.id + '.md', E.campaignMarkdown(full));
                toast('История сохранена текстом', { kind: 'good' });
              }
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
  function download(filename, text, mime) {
    downloadBlob(filename, new Blob([text], { type: mime || 'application/json' }));
  }

  /**
   * Скачивание готового файла. Именно blob-адрес, а не data-URL: на data-URL
   * браузер часто игнорирует имя файла, и игрок получает «download» без расширения.
   */
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 800);
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
    const row = h('div', { class: 'rules-row' });
    list.forEach(item => {
      // образец темы: маленькая карточка с кнопкой в её материале (без текста,
      // чтобы подпись кнопки осталась ровно названием темы)
      const swatch = item.skin ? h('span', {
        class: 'skin-demo', 'data-tp': item.id, 'aria-hidden': 'true'
      }, [h('span', { class: 'skin-demo__btn' })]) : null;
      row.appendChild(h('button', {
        class: 'rules-btn' + (item.id === value ? ' is-on' : ''),
        type: 'button', title: item.hint || '',
        onclick: () => {
          Sound.tap();
          // подсветку переключаем на месте: окно настроек не должно мигать
          Array.from(row.children).forEach(b => b.classList.remove('is-on'));
          row.children[list.indexOf(item)].classList.add('is-on');
          onPick(item.id);
        }
      }, [swatch, item.title]));   // подпись есть у всех, образец — только у тем
    });
    return row;
  }

  /**
   * Темы меняют не только цвет: у каждой свой материал кнопок, блоков и окон.
   * Тот же набор токенов, что в src/skins.css, — подпись описывает его словами.
   */
  const THEMES = [
    { id: 'auto', title: 'Авто', skin: true, hint: 'материал подбирается по жанру кампании' },
    { id: 'material', title: 'Материальная', skin: true, hint: 'гладкие белые карточки, мягкие тени, скруглённые кнопки' },
    { id: 'night', title: 'Ночь', skin: true, hint: 'тёмное стекло, мягкий бирюзовый кант' },
    { id: 'neon', title: 'Киберпанк', skin: true, hint: 'острые углы, неоновая кромка, сканлайны и свечение' },
    { id: 'terminal', title: 'Терминал', skin: true, hint: 'зелёный фосфор, пунктирные рамки, ровные строки консоли' },
    { id: 'parchment', title: 'Пергамент', skin: true, hint: 'бумажные листы с неровным краем на тёмном столе' },
    { id: 'ink', title: 'Тушь и медь', skin: true, hint: 'прямые углы, медная кромка и заклёпки по углам' },
    { id: 'sunset', title: 'Закат', skin: true, hint: 'тёплое свечение и градиенты, крупные мягкие формы' },
    { id: 'ice', title: 'Лёд', skin: true, hint: 'обледеневшие кнопки и блоки: наледь, иней, сосульки по кромке' },
    { id: 'oled', title: 'Чёрная', skin: true, hint: 'чистый чёрный, только тонкий контур — экономит батарею' }
  ];

  /** Что именно сделает тема — словами, под списком выбора. */
  function themeHint(id) {
    const found = THEMES.filter(t => t.id === id)[0];
    return found ? found.hint : '';
  }

  /**
   * Чем сейчас ведётся игра: внешним каналом или встроенным мастером.
   * Когда у ключа кончается баланс, честнее сказать об этом прямо, чем
   * оставлять игрока догадываться, почему мастер стал проще.
   */
  function aiStatusText() {
    const back = (API.CONFIG && API.CONFIG.backend) || null;
    if (!back) return 'Сервер не отвечает: ходы ведёт встроенный мастер, кадр рисуется локально.';
    const channels = back.textProviders || [];
    const dead = back.genKeyDead;
    if (dead && (dead.at || dead.why)) {
      const when = dead.at ? new Date(dead.at).toTimeString().slice(0, 5) : '';
      return 'Внешний канал без баланса' + (when ? ' (проверено в ' + when + ')' : '') +
        ': ходы ведёт встроенный мастер, кадры — запасные генераторы, дальше локальный фон. ' +
        'Умный мастер вернётся сам, когда баланс пополнят.';
    }
    if (channels.some(c => /^gen:\d/.test(c))) {
      return 'Умный мастер на связи (' + channels.join(', ') + '). Кадры рисуют турбо-генераторы, при молчании — запасные.';
    }
    if (channels.some(c => /отдыхает/.test(c))) {
      return 'Внешний канал отдыхает — у ключа кончились кредиты: ходы ведёт встроенный мастер, кадры — запасные генераторы, дальше локальный фон. Умный мастер вернётся сам, когда баланс пополнят.';
    }
    return 'Каналы мастера: ' + (channels.join(', ') || 'нет') + '.';
  }

  /**
   * Список каналов приходит от сервера (/api/health): какие есть ключи, какие
   * модели живы. Пока ответ не пришёл — показываем «проверяем», а не пустоту.
   */
  function choiceRowLive(getList, value, onPick) {
    const row = h('div', { class: 'rules-row rules-row--tall' });
    const fill = () => {
      // список обновляется сам, когда сервер расскажет о каналах: палец и фокус
      // должны остаться на той же кнопке, иначе игрока выкидывает из настроек
      const box = $('#modal-box');
      const active = document.activeElement;
      const inside = !!(active && row.contains(active));
      const label = inside ? (active.textContent || '').trim() : '';
      const twinsBefore = inside
        ? Array.from(row.querySelectorAll('button')).filter(b => (b.textContent || '').trim() === label)
        : [];
      const nth = inside ? Math.max(0, twinsBefore.indexOf(active)) : 0;
      const scroll = box ? box.scrollTop : 0;
      const put = () => {
        if (!label) return;
        const twinsAfter = Array.from(row.querySelectorAll('button'))
          .filter(b => (b.textContent || '').trim() === label);
        const again = twinsAfter[Math.min(nth, twinsAfter.length - 1)];
        if (again) again.focus({ preventScroll: true });
        if (box) box.scrollTop = scroll;
      };
      const list = getList();
      clear(row);
      if (!list.length) {
        row.appendChild(h('div', { class: 'muted small', text: 'Сервер не ответил: доступен «Авто» и встроенный мастер.' }));
        put();
        return;
      }
      list.forEach(item => {
        const off = item.available === false;
        row.appendChild(h('button', {
          class: 'rules-btn' + (item.id === value ? ' is-on' : '') + (off ? ' is-off' : ''),
          type: 'button', title: item.hint || '',
          onclick: () => {
            if (off) { notify(item.title + ': ' + (item.detail || 'недоступен'), { kind: 'warn' }); return; }
            onPick(item.id);
          }
        }, [
          h('span', { class: 'rules-btn__title', text: item.title + (off ? ' ·' : '') }),
          h('span', { class: 'rules-btn__hint', text: [item.hint, item.detail].filter(Boolean).join(' · ') })
        ]));
      });
      put();
    };
    fill();
    row.dataset.live = '1';
    return { row, fill };
  }

  /**
   * Место в настройках, к которому нужно вернуться после перерисовки.
   * Игрок не должен терять прокрутку и поле ввода, нажимая галочки.
   */
  const settingsAnchor = { scroll: 0, placeholder: '', selection: null, label: '', nth: 0 };

  function openSettings(opts) {
    const keep = !!(opts && opts.keep);
    const box = $('#modal-box');
    if (keep && box) {
      settingsAnchor.scroll = box.scrollTop;
      const active = document.activeElement;
      settingsAnchor.label = '';
      if (active && box.contains(active) && /^(INPUT|TEXTAREA)$/.test(active.tagName)) {
        settingsAnchor.placeholder = active.getAttribute('placeholder') || '';
        settingsAnchor.selection = [active.selectionStart, active.selectionEnd];
      } else if (active && box.contains(active)) {
        // нажали галочку — вернём палец и клавиатурный фокус на неё же
        settingsAnchor.placeholder = '';
        settingsAnchor.selection = null;
        settingsAnchor.label = (active.textContent || '').trim();
        const twins = Array.from(box.querySelectorAll('button'))
          .filter(b => (b.textContent || '').trim() === settingsAnchor.label);
        settingsAnchor.nth = Math.max(0, twins.indexOf(active));
      }
    }
    const keyInput = h('input', {
      class: 'input', type: 'text',
      value: Settings.data.apiKey || API.getApiKey(), autocomplete: 'off',
      placeholder: 'ключ Pollinations уже встроен — можно заменить своим'
    });
    const mistralInput = h('input', {
      class: 'input', type: 'text',
      value: Settings.data.mistralKey || '',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: 'ключ Mistral (sk-…)'
    });
    const saveMistral = () => {
      const key = mistralInput.value.trim();
      Settings.set({ mistralKey: key });
      API.setMistralKey(key);
      toast(key ? 'Ключ Mistral сохранён: ведущий — Mistral' : 'Ключ Mistral убран', { kind: key ? 'good' : undefined, timeout: 2600 });
    };
    mistralInput.addEventListener('change', saveMistral);
    mistralInput.addEventListener('blur', saveMistral);
    const glmInput = h('input', {
      class: 'input', type: 'text',
      value: Settings.data.glmKey || '',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: 'ключ GLM (id.secret)'
    });
    const saveGlm = () => {
      const key = glmInput.value.trim();
      Settings.set({ glmKey: key });
      API.setGlmKey(key);
      toast(key ? 'Ключ GLM сохранён: ведущий — GLM' : 'Ключ GLM убран', { kind: key ? 'good' : undefined, timeout: 2600 });
    };
    glmInput.addEventListener('change', saveGlm);
    glmInput.addEventListener('blur', saveGlm);
    const hfInput = h('input', {
      class: 'input', type: 'text',
      value: Settings.data.hfKey || '',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: 'ключ Hugging Face (hf_…)'
    });
    const saveHf = () => {
      const key = hfInput.value.trim();
      Settings.set({ hfKey: key });
      API.setHfKey(key);
      toast(key ? 'Ключ Hugging Face сохранён' : 'Ключ Hugging Face убран', { kind: key ? 'good' : undefined, timeout: 2600 });
    };
    hfInput.addEventListener('change', saveHf);
    hfInput.addEventListener('blur', saveHf);
    const masterLive = choiceRowLive(API.masterChoices, Settings.data.master || 'auto', id => {
      Settings.set({ master: id });
      const item = (API.masterChoices() || []).find(x => x.id === id);
      toast('Ведущий: ' + ((item && item.title) || id), { kind: 'good' });
      openSettings({ keep: true });
    });
    const imageLive = choiceRowLive(API.imageChoices, Settings.data.imageSource || 'auto', id => {
      Settings.set({ imageSource: id });
      const item = (API.imageChoices() || []).find(x => x.id === id);
      toast('Кадры рисует: ' + ((item && item.title) || id), { kind: 'good' });
      openSettings({ keep: true });
    });
    // обновляем списки, когда сервер расскажет о своих каналах
    API.probeBackend(true).then(() => {
      masterLive.fill();
      imageLive.fill();
      statusLine.textContent = aiStatusText();   // состояние каналов честнее после проверки
    }).catch(() => {});
    const masterRow = masterLive.row;
    const imageRow = imageLive.row;
    const styleRow = choiceRow(E.STYLE_PRESETS, Settings.data.imageStyle || (State.game && State.game.artStyle) || 'auto', id => {
      Settings.set({ imageStyle: id });
      const g = State.game;
      if (g) { g.artStyle = E.styleById(id).id; State.storage.save(g); }
      openSettings({ keep: true });
      toast('Стиль кадров: ' + ((E.styleById(id) || {}).title || id), { kind: 'good' });
    });
    const installButton = h('button', {
      class: 'btn btn--ghost', type: 'button',
      text: State.installEvent ? '📲 Установить приложение' : (State.swReg ? '📲 Приложение уже офлайн-готово' : '📲 Установка недоступна'),
      onclick: async () => {
        if (State.installEvent) {
          State.installEvent.prompt();
          const res = await State.installEvent.userChoice.catch(() => null);
          if (res && res.outcome === 'accepted') toast('Устанавливаем…', { kind: 'good' });
          State.installEvent = null;
          return;
        }
        const ok = await registerWorker();
        toast(ok ? 'Офлайн-режим включён: игра запускается без сети' : 'Офлайн-режим недоступен в этом браузере', { kind: ok ? 'good' : 'warn' });
      }
    });
    const statusLine = h('p', { class: 'muted small', text: aiStatusText() });
    const content = h('div', { class: 'settings' }, [
      h('p', { class: 'muted small', text: 'Игра работает без ключей: мастер — через сервер или запасные каналы, картинки — турбо-генераторы и безключевые запасные, фон рисуется локально мгновенно.' }),
      statusLine,

      h('div', { class: 'section-title', text: '🧠 Ведущий мастер' }),
      h('p', { class: 'muted small', text: 'Кто ведёт игру. «Авто» — игра сама берёт лучший доступный канал и тихо переходит на следующий, если тот замолчал.' }),
      masterRow,
      h('div', { class: 'section-title', text: '🎨 Генератор картинок' }),
      h('p', { class: 'muted small', text: 'Кто рисует кадр. Быстрый генератор важнее качества: сцена должна появиться сразу.' }),
      imageRow,
      h('div', { class: 'section-title', text: '🖌 Стиль кадров' }),
      h('p', { class: 'muted small', text: 'Один стиль на всю кампанию — тогда сцены выглядят как одна книга.' }),
      styleRow,

      h('div', { class: 'section-title', text: 'Тон рассказа' }),
      h('p', { class: 'muted small rules-hint', text: 'Мастер подстраивает голос и исходы под выбранный тон.' }),
      choiceRow(E.TONES, Settings.data.tone, id => {
        Settings.set({ tone: id });
        applyRulesLive();
        openSettings({ keep: true });
        toast('Тон: ' + (E.TONES.find(t => t.id === id) || {}).title, { kind: 'good', timeout: 1800 });
      }),

      h('div', { class: 'section-title', text: 'Жёсткость' }),
      choiceRow(E.RATINGS, Settings.data.rating, id => {
        Settings.set({ rating: id });
        applyRulesLive();
        openSettings({ keep: true });
        toast('Жёсткость: ' + (E.RATINGS.find(r => r.id === id) || {}).title, { kind: 'good', timeout: 1800 });
      }),

      h('div', { class: 'section-title', text: 'Озвучка и звук' }),
      choiceRow([
        { id: 'voice-on', title: '🗣 Озвучка сцены', hint: 'браузер читает текст мастера вслух' },
        { id: 'voice-off', title: '🚫 Без озвучки', hint: 'текст только глазами' }
      ], Settings.data.voice ? 'voice-on' : 'voice-off', id => {
        Voice.set(id === 'voice-on');
        openSettings({ keep: true });
      }),
      h('p', { class: 'muted small', text: 'Голос — нейросетевой (Microsoft Edge на сервере); без сервера сцену читает голос устройства.' }),
      h('div', { class: 'section-title', text: 'Голос рассказчика' }),
      h('p', { class: 'muted small', text: 'Голоса нейронные, у каждого свой характер: выберите и включите озвучку — сцену прочитает он же.' }),
      choiceRow([
        { id: 'female', title: '🎙 Светлана', hint: 'классический русский, ровно и тепло' },
        { id: 'male', title: '🎙 Дмитрий', hint: 'ниже и глуше, для мрачных историй' },
        { id: 'ava', title: '🌍 Ава', hint: 'новая линейка, живее и мягче' },
        { id: 'andrew', title: '🌍 Эндрю', hint: 'новая линейка, мужской, с дыханием' }
      ], Settings.data.voiceGender || 'female', id => {
        Settings.set({ voiceGender: id });
        openSettings({ keep: true });
        if (Voice.on && State.game && State.game.scene) Voice.say(State.game.scene.text, (State.mood && State.mood.voice) || 'book');
      }),
      h('p', { class: 'muted small', text: 'Тон рассказа меняет подачу голоса: в страхе он тише и медленнее, в победе — быстрее и выше.' }),
      choiceRow([
        { id: 'amb-on', title: '🌫 Фоновый звук', hint: 'тихий гул и ветер под стиль игры' },
        { id: 'amb-off', title: '🔇 Тишина', hint: 'совсем без фона' }
      ], Settings.data.ambient !== false ? 'amb-on' : 'amb-off', id => {
        Settings.set({ ambient: id === 'amb-on' });
        Ambient.sync();
        openSettings({ keep: true });
      }),

      h('div', { class: 'section-title', text: 'Размер текста' }),
      h('p', { class: 'muted small', text: 'Три ступени: на крупном шапка и кадр чуть ниже, а буквы читаются легче.' }),
      choiceRow(TEXT_SIZES, Settings.data.textSize || 'm', id => {
        Settings.set({ textSize: id });
        applyTextSize();
        openSettings({ keep: true });
      }),

      h('div', { class: 'section-title', text: 'Музыка и звуки' }),
      h('p', { class: 'muted small', text: 'Звук синтезируется тут же: файлов нет, вес игры не растёт.' }),
      choiceRow([
        { id: 'music-on', title: '🎵 Музыка по жанру', hint: 'тихий луп под мир: фэнтези, кибер, пустошь' },
        { id: 'music-off', title: 'без музыки', hint: 'только голос и звуки' }
      ], Settings.data.music ? 'music-on' : 'music-off', id => {
        Settings.set({ music: id === 'music-on' });
        if (Settings.data.music) Music.start(State.game); else Music.stop();
        openSettings({ keep: true });
      }),
      choiceRow([
        { id: 'sfx-on', title: '👣 Звуки сцены', hint: 'шаг, дверь, ветер, удар — под настроение' },
        { id: 'sfx-off', title: '🔇 Без них', hint: 'тише' }
      ], Settings.data.sfx !== false ? 'sfx-on' : 'sfx-off', id => {
        Settings.set({ sfx: id === 'sfx-on' });
        openSettings({ keep: true });
      }),

      h('div', { class: 'section-title', text: 'Как держу телефон' }),
      h('p', { class: 'muted small', text: 'Режим «одной рукой» поднимает кнопки вариантов выше и делает их крупнее — удобно в транспорте.' }),
      choiceRow([
        { id: 'hand-two', title: '🖐 Как обычно', hint: 'кнопки на своих местах' },
        { id: 'hand-one', title: '👍 Одной рукой', hint: 'крупнее и ниже, ближе к пальцу' }
      ], Settings.data.handOne ? 'hand-one' : 'hand-two', id => {
        Settings.set({ handOne: id === 'hand-one' });
        applyHandOne();
        openSettings({ keep: true });
      }),

      h('div', { class: 'section-title', text: 'Оформление' }),
      h('p', { class: 'muted small', text: 'Тема меняет весь интерфейс: цвета, подложки, форму кнопок. «Авто» подбирает тему по жанру кампании.' }),
      choiceRow(THEMES, Settings.data.theme || 'auto', id => {
        Settings.set({ theme: id });
        applyTheme(State.game);
        openSettings({ keep: true });
      }),
      h('p', {
        class: 'muted small theme-hint',
        text: 'Тема «' + (THEMES.filter(t => t.id === (Settings.data.theme || 'auto'))[0] || {}).title + '»: '
          + themeHint(Settings.data.theme || 'auto')
      }),
      h('div', { class: 'section-title', text: 'Живость экрана' }),
      h('p', { class: 'muted small', text: 'Сцена дышит и дрожит по настроению: страх — медленно и с дрожью, победа — светлеет. Текст печатается волной.' }),
      choiceRow([
        { id: 'motion-on', title: '🌊 Живая сцена', hint: 'текст ползёт, кадр дрожит и отзывается на наклон телефона' },
        { id: 'motion-off', title: '🪨 Строгий покой', hint: 'текст стоит ровно, как в книге' }
      ], Settings.data.motion !== false ? 'motion-on' : 'motion-off', id => {
        Settings.set({ motion: id === 'motion-on' });
        applyMoodToUI(State.mood, []);
        // вместе с живостью включается и наклон кадра: это одна и та же настройка
        if (Settings.data.motion) Tilt.start(); else Tilt.stop();
        openSettings({ keep: true });
      }),
      choiceRow([
        { id: 'hapt-on', title: '📳 Отклик', hint: 'телефон вздрагивает от удара и победы' },
        { id: 'hapt-off', title: '🤫 Без отклика', hint: 'без вибрации' }
      ], Settings.data.haptics !== false ? 'hapt-on' : 'hapt-off', id => {
        Settings.set({ haptics: id === 'hapt-on' });
        openSettings({ keep: true });
      }),

      h('div', { class: 'section-title', text: 'Канал ИИ' }),
      h('p', { class: 'muted small', text: 'Текущий режим: ' + API.mode() }),
      h('p', { class: 'muted small', text: 'У Mistral (Франция) есть бесплатный ключ: без карты, нужен только номер телефона. Ключ делается на console.mistral.ai → API Keys, лимит примерно запрос в секунду — для этой игры хватает с запасом.' }),
      mistralInput,
      h('p', { class: 'muted small', text: 'У GLM (Zhipu, Китай) бесплатно отвечает модель glm-4.5-flash: ключ формата «id.secret» делается на open.bigmodel.cn → API Keys, карта не нужна. Ключ уже вшит в игру, поле — для своего.' }),
      glmInput,
      h('p', { class: 'muted small', text: 'У Hugging Face один ключ hf_… открывает и ведущего (137 моделей через роутер), и очередь картинок: кадры рисуют открытые Space, а по имени они отвечают охотнее, чем анонимно. Ключ делается в настройках профиля, право «Make calls to Inference Providers».' }),
      hfInput,
      h('p', { class: 'muted small', text: 'Ключи остаются в телефоне и уходят только вместе с запросом к мастеру — на сервере они не хранятся.' }),
      h('div', { class: 'section-title', text: 'Микрофон у мастера' }),
      choiceRow([
        { id: 'ask-on', title: '🎬 Спросить, где начнём', hint: 'три варианта перед первой сценой' },
        { id: 'ask-off', title: '⏩ Пусть решает сам', hint: 'мастер сразу начинает историю' }
      ], Settings.data.beginQuestion !== false ? 'ask-on' : 'ask-off', id => {
        Settings.set({ beginQuestion: id === 'ask-on' });
        openSettings({ keep: true });
      }),
      choiceRow([
        { id: 'npcvoice-on', title: '👥 Голоса знакомых', hint: 'у каждого знакомого свой тембр' },
        { id: 'npcvoice-off', title: '🎙 Один голос', hint: 'всю сцену читает рассказчик' }
      ], Settings.data.npcVoices !== false ? 'npcvoice-on' : 'npcvoice-off', id => {
        Settings.set({ npcVoices: id === 'npcvoice-on' });
        openSettings({ keep: true });
      }),

      h('div', { class: 'section-title', text: '📊 Метрики без слежки' }),
      h('p', { class: 'muted small', text: MetricsBox.line() }),
      h('p', { class: 'muted small', text: 'Считается только на этом устройстве: ничего никуда не отправляется.' }),

      h('div', { class: 'section-title', text: '📲 Приложение и офлайн' }),
      h('p', { class: 'muted small', text: State.swReg
        ? 'Офлайн-режим готов: игра запускается без сети из кэша.'
        : 'Офлайн-режим включится, когда страница открыта с сервера (не файлом).' }),
      installButton,

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
            openSettings({ keep: true });
          }
        }
      ]
    });
    if (keep) restoreSettingsAnchor();
  }

  /** Вернуть игрока туда, где он был: та же прокрутка, то же поле в фокусе. */
  function restoreSettingsAnchor() {
    const box = $('#modal-box');
    if (!box) return;
    const apply = () => {
      box.scrollTop = settingsAnchor.scroll;
      if (settingsAnchor.label) {
        const twins = Array.from(box.querySelectorAll('button'))
          .filter(b => (b.textContent || '').trim() === settingsAnchor.label);
        const again = twins[Math.min(settingsAnchor.nth, twins.length - 1)];
        if (again) {
          again.focus({ preventScroll: true });
          box.scrollTop = settingsAnchor.scroll;
        }
        return;
      }
      const want = settingsAnchor.placeholder;
      if (!want) return;
      const field = Array.from(box.querySelectorAll('input, textarea'))
        .find(el => (el.getAttribute('placeholder') || '') === want);
      if (!field) return;
      field.focus({ preventScroll: true });
      const sel = settingsAnchor.selection;
      if (sel && typeof field.setSelectionRange === 'function') {
        try { field.setSelectionRange(sel[0], sel[1]); } catch (e) { /* не критично */ }
      }
      box.scrollTop = settingsAnchor.scroll;
    };
    apply();
    requestAnimationFrame(apply);      // окно ещё дорисовывается — повторим кадром позже
  }

  /* ---------------------------------------------------------- */
  /* Голос знакомых: незнакомец говорит иначе, чем рассказчик    */
  /* ---------------------------------------------------------- */

  /** Реплика НПС озвучивается другим тембром — сцена звучит как разговор. */
  function npcVoiceKey(turn) {
    const npc = (turn && turn.npcObject) || null;
    const name = (turn && turn.npc) || '';
    if (!name) return '';
    const guess = E.npcVoiceFor(npc || { name });
    // голоса знакомых берём из того же набора, что и рассказчик
    return guess === 'female' ? (Settings.data.npcFemale || 'ava') : (Settings.data.npcMale || 'andrew');
  }

  /* ---------------------------------------------------------- */
  /* Журнал: цель, вехи арки, нити и знакомые                    */
  /* ---------------------------------------------------------- */

  function renderJournal() {
    const host = clear($('#journal-body'));
    const g = State.game;
    if (!g) {
      host.appendChild(h('div', { class: 'empty' }, [h('p', { text: 'Журнал пуст: игра не начата.' })]));
      return;
    }
    const mem = E.memoryOf(g);
    const arc = E.arcOf(g);
    const plan = (g.intro && g.intro.plan) || g.plan || [];
    $('#journal-turn').textContent = 'Ход ' + Math.max(1, g.turn || 1);

    host.appendChild(h('div', { class: 'journal-goal' }, [
      h('div', { class: 'journal-goal__label', text: '🎯 Цель' }),
      h('div', { class: 'journal-goal__text', text: g.goal || 'цель ещё не названа' }),
      h('div', { class: 'muted small', text: mem.place ? 'Где мы: ' + mem.place : 'Место пока не названо' })
    ]));

    if (dailyOf(g)) host.appendChild(dailyJournalBlock(g));

    // --- Сумка: предметы с эффектом и припасы (блок B, п.7) ---
    const bagBlock = h('div', { class: 'journal-block', id: 'journal-bag' }, [
      h('div', { class: 'section-title', text: '🎒 Сумка' })
    ]);
    const bag = E.heroItems(g);
    if (!bag.length) {
      bagBlock.appendChild(h('p', { class: 'muted small', text: 'Пусто. Предметы мастер выдаёт по ходу истории.' }));
    }
    bag.forEach(item => bagBlock.appendChild(itemCard(item)));
    bagBlock.appendChild(h('div', { class: 'supply-row' }, [
      h('span', { class: 'supply-dots', title: 'Припасы: ночёвка, перевязка и обход' },
        Array.from({ length: E.SUPPLIES_MAX }, (_, i) =>
          h('span', { class: 'supply-dot' + (i < E.suppliesOf(g) ? ' is-on' : '') }))),
      h('span', { class: 'supply-row__text', text: 'припасы: ' + E.suppliesOf(g) + ' из ' + E.SUPPLIES_MAX })
    ]));
    bagBlock.appendChild(h('div', { class: 'row-actions' }, [
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '🔥 Привал',
        title: '−1 припас: +2 здоровья и снять усталость', onclick: () => runMech('rest-stop') }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '🩹 Перевязка',
        title: '−1 припас: +3 здоровья и перевязать рану', onclick: () => runMech('heal-stop') }),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: '🧭 Обойду',
        title: '−1 припас: обойти опасное место — следующий бросок с преимуществом', onclick: () => runMech('bypass') })
    ]));
    host.appendChild(bagBlock);

    // --- состояния: что мешает и что помогает (блок B, п.9) ---
    const states = E.stateList(g);
    if (states.length) {
      const stBlock = h('div', { class: 'journal-block' }, [h('div', { class: 'section-title', text: '🩸 Состояния' })]);
      states.forEach(st => stBlock.appendChild(h('div', { class: 'rel-card' }, [
        h('span', { class: 'rel-card__icon', text: st.icon }),
        h('div', { class: 'rel-card__body' }, [
          h('div', { class: 'rel-card__name', text: st.title + ' ' + (st.mod > 0 ? '+' + st.mod : st.mod) }),
          h('div', { class: 'rel-card__line', text: st.hint + (st.turns ? ' · осталось ходов: ' + st.turns : '') })
        ])
      ])));
      stBlock.appendChild(h('p', { class: 'muted small', text: 'Состояния меняют броски и подсказывают мастеру, как вести сцену.' }));
      host.appendChild(stBlock);
    }

    // --- знакомые: отношение и доверие (блок B, пп.8, 10) ---
    const npcs = E.npcList(g) || [];
    if (npcs.length) {
      const relBlock = h('div', { class: 'journal-block' }, [
        h('div', { class: 'section-title', text: '👥 Знакомые' }),
        h('p', { class: 'muted small', text: 'С другом и должником договориться легче, врага легче заподозрить. Соцбросок мастер учитывает сам.' })
      ]);
      npcs.slice(0, 8).forEach(n => {
        const pips = '●'.repeat(Math.max(0, n.trust)) + '○'.repeat(Math.max(0, 5 - n.trust));
        const row = h('div', { class: 'rel-card rel-card--' + (n.relation || 'neutral') }, [
          h('span', { class: 'rel-card__icon', text: n.relationIcon || '👤' }),
          h('div', { class: 'rel-card__body' }, [
            h('div', { class: 'rel-card__name', text: n.name + (n.role ? ' · ' + n.role : '') }),
            h('div', { class: 'rel-card__line' }, [
              h('span', { text: (n.relationTitle || 'нейтрально') + ' ' }),
              h('span', { class: 'rel-card__trust', text: pips, title: 'Доверие ' + n.trust + ' из 5' }),
              n.note ? h('span', { text: ' · ' + n.note }) : null
            ])
          ])
        ]);
        if (n.relation === 'debtor' && !n.helped) {
          row.appendChild(h('button', {
            class: 'item-card__use', type: 'button', text: '🤝 Позвать',
            title: 'Должник выручает один раз за кампанию',
            onclick: () => runMech('call-debtor')
          }));
        }
        relBlock.appendChild(row);
      });
      host.appendChild(relBlock);
    }

    // арка: вехи, которые уже пройдены, и та, к которой идёт история
    if (arc && arc.steps && arc.steps.length) {
      const list = h('div', { class: 'arc-list' });
      arc.steps.forEach((step, i) => {
        const done = i < arc.at;
        const now = i === arc.at;
        list.appendChild(h('div', { class: 'arc-step' + (done ? ' is-done' : '') + (now ? ' is-now' : '') }, [
          h('span', { class: 'arc-step__dot', text: done ? '✓' : (now ? '◉' : '○') }),
          h('div', { class: 'arc-step__body' }, [
            h('div', { class: 'arc-step__title', text: step.title }),
            h('div', { class: 'muted small', text: step.hint })
          ])
        ]));
      });
      host.appendChild(h('div', { class: 'journal-block' }, [
        h('div', { class: 'section-title', text: '🧭 Арка кампании' }),
        list,
        h('p', { class: 'muted small', text: 'Мастер ведёт историю к следующей вехе, а не кружит на месте.' })
      ]));
    }

    if (plan.length) {
      const steps = h('ol', { class: 'intro-plan' });
      plan.forEach((step, i) => steps.appendChild(h('li', { class: i < mem.step ? 'is-done' : '', text: step })));
      host.appendChild(h('div', { class: 'journal-block' }, [
        h('div', { class: 'section-title', text: '🗺 План' }),
        steps
      ]));
    }

    const cols = h('div', { class: 'journal-cols' }, [
      h('div', { class: 'journal-col' }, [
        h('div', { class: 'section-title', text: '🤝 Обещано' }),
        mem.threads.length
          ? h('ul', { class: 'journal-list' }, mem.threads.map(t => h('li', { text: t })))
          : h('p', { class: 'muted small', text: 'Пока ничего не обещано.' })
      ]),
      h('div', { class: 'journal-col' }, [
        h('div', { class: 'section-title', text: '✅ Сделано' }),
        mem.deeds.length
          ? h('ul', { class: 'journal-list' }, mem.deeds.slice(-8).reverse().map(t => h('li', { text: t })))
          : h('p', { class: 'muted small', text: 'Герой пока ничего не совершил.' })
      ])
    ]);
    host.appendChild(cols);

    if (mem.npcs.length) {
      host.appendChild(h('div', { class: 'journal-block' }, [
        h('div', { class: 'section-title', text: '👥 Знакомые' }),
        h('div', { class: 'npc-list' }, mem.npcs.map(n => h('div', { class: 'npc-card' }, [
          h('div', { class: 'npc-card__name', text: n.name }),
          h('div', { class: 'muted small', text: [n.role, n.attitude].filter(Boolean).join(' · ') })
        ])))
      ]));
    }

    if (mem.facts.length) {
      host.appendChild(h('div', { class: 'journal-block' }, [
        h('div', { class: 'section-title', text: '📌 Помним' }),
        h('ul', { class: 'journal-list' }, mem.facts.slice(-8).map(t => h('li', { text: t })))
      ]));
    }

    const chron = E.chronicleLine(g);
    if (chron) host.appendChild(h('p', { class: 'muted small journal-chronicle', text: chron }));
  }

  /* ---------------------------------------------------------- */
  /* Карта мест: кружки-места и линии переходов по памяти        */
  /* ---------------------------------------------------------- */

  function renderMap() {
    const canvas = clear($('#map-canvas'));
    const list = clear($('#map-list'));
    const g = State.game;
    if (!g) {
      list.appendChild(h('div', { class: 'empty' }, [h('p', { text: 'Карта появится, когда игра начнётся.' })]));
      return;
    }
    const places = E.placeGraph ? E.placeGraph(g) : [];
    $('#map-note').textContent = places.length ? places.length + ' мест' : '';
    if (!places.length) {
      list.appendChild(h('div', { class: 'empty' }, [
        h('p', { text: 'Пока известно только одно место.' }),
        h('p', { class: 'muted', text: 'Карта соберётся сама, когда мастер назовёт новые места.' })
      ]));
      return;
    }
    const W = 320, H = 180, pad = 26;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.setAttribute('class', 'map-svg');
    const pos = places.map((p, i) => {
      const angle = (i / places.length) * Math.PI * 2 - Math.PI / 2;
      const radius = places.length === 1 ? 0 : Math.min(W, H) / 2 - pad;
      return {
        x: W / 2 + Math.cos(angle) * radius * 1.35,
        y: H / 2 + Math.sin(angle) * radius,
        p
      };
    });
    pos.forEach((a, i) => {
      const b = pos[(i + 1) % pos.length];
      if (pos.length < 2) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      line.setAttribute('class', 'map-edge');
      svg.appendChild(line);
    });
    pos.forEach(item => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', item.x); circle.setAttribute('cy', item.y);
      circle.setAttribute('r', item.p.now ? 9 : 6);
      circle.setAttribute('class', 'map-node' + (item.p.now ? ' is-now' : ''));
      svg.appendChild(circle);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', item.x); text.setAttribute('y', item.y - 12);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('class', 'map-label');
      text.textContent = item.p.title.slice(0, 16);
      svg.appendChild(text);
    });
    canvas.appendChild(svg);

    places.forEach(pl => {
      list.appendChild(h('div', { class: 'map-row' + (pl.now ? ' is-now' : '') }, [
        h('span', { class: 'map-row__dot', text: pl.now ? '◉' : '○' }),
        h('div', { class: 'map-row__body' }, [
          h('div', { class: 'map-row__title', text: pl.title + (pl.now ? ' — вы здесь' : '') }),
          h('div', { class: 'muted small', text: [pl.chapter, pl.turns ? 'ходов: ' + pl.turns : ''].filter(Boolean).join(' · ') })
        ])
      ]));
    });
  }

  /* ---------------------------------------------------------- */
  /* Забег: ходы, броски, цена                                   */
  /* ---------------------------------------------------------- */

  const RUN_KEY = 'dt2:lastRun';

  function runStats(g) {
    const log = (g && g.log) || [];
    const st = { turns: 0, checks: 0, crits: 0, fumbles: 0, hpLost: 0, best: 0, worst: 99, offline: 0, startedAt: (g && g.createdAt) || Date.now(), places: {} };
    log.forEach(e => {
      if (e.kind === 'action') st.turns += 1;
      if (e.offline) st.offline += 1;
      const meta = String(e.meta || '');
      const m = meta.match(/d20 (\d+)/);
      if (m) {
        const roll = Number(m[1]);
        st.checks += 1;
        if (roll > st.best) st.best = roll;
        if (roll < st.worst) st.worst = roll;
        if (/крит/i.test(meta)) st.crits += 1;
        if (/провал/i.test(meta)) st.fumbles += 1;
      }
      const lost = /здоровье|−|-/.test(String(e.text || '')) && e.notes ? 0 : 0;
      if (lost) st.hpLost += lost;
      const place = (e.place || '').trim();
      if (place) st.places[place] = (st.places[place] || 0) + 1;
    });
    const lostTotal = Math.max(0, (g && g.hero ? (g.hero.maxHp * Math.max(1, g.turn) * 0.1) : 0));
    st.hpLost = Math.round(lostTotal);
    st.worst = st.worst === 99 ? 0 : st.worst;
    st.minutes = Math.max(1, Math.round((Date.now() - st.startedAt) / 60000));
    return st;
  }

  function renderRun() {
    const host = clear($('#run-body'));
    const g = State.game;
    if (!g) {
      host.appendChild(h('div', { class: 'empty' }, [h('p', { text: 'Забег появится, когда игра начнётся.' })]));
      return;
    }
    const st = runStats(g);
    const prev = Local.get(RUN_KEY, null);
    $('#run-note').textContent = 'Ход ' + Math.max(1, g.turn || 1);

    const grid = h('div', { class: 'stat-grid' });
    const cells = [
      ['🚶', 'Ходы', String(st.turns)],
      ['🎲', 'Броски', String(st.checks)],
      ['🌟', 'Криты', String(st.crits)],
      ['💀', 'Провалы', String(st.fumbles)],
      ['🎯', 'Лучший', st.best ? String(st.best) : '—'],
      ['📉', 'Худший', st.worst ? String(st.worst) : '—'],
      ['❤️', 'Здоровье', (g.hero.hp || 0) + '/' + (g.hero.maxHp || 0)],
      ['⏱', 'Времени', st.minutes + ' мин']
    ];
    cells.forEach(([icon, label, value]) => {
      grid.appendChild(h('div', { class: 'stat-cell' }, [
        h('div', { class: 'stat-cell__icon', text: icon }),
        h('div', { class: 'stat-cell__value', text: value }),
        h('div', { class: 'stat-cell__label', text: label })
      ]));
    });
    host.appendChild(grid);

    if (prev) {
      const diff = (a, b) => {
        const d = a - b;
        return d === 0 ? 'столько же' : (d > 0 ? '+' + d : String(d));
      };
      host.appendChild(h('div', { class: 'journal-block' }, [
        h('div', { class: 'section-title', text: '⚖️ Против прошлого забега' }),
        h('ul', { class: 'journal-list' }, [
          h('li', { text: 'Ходы: ' + diff(st.turnCount || g.turn || 0, prev.turn || 0) + ' (было ' + (prev.turn || 0) + ')' }),
          h('li', { text: 'Криты: ' + diff(st.crits, prev.crits || 0) + ' (было ' + (prev.crits || 0) + ')' }),
          h('li', { text: 'Провалы: ' + diff(st.fumbles, prev.fumbles || 0) + ' (было ' + (prev.fumbles || 0) + ')' }),
          h('li', { text: 'Лучший бросок: ' + (st.best || 0) + ' против ' + (prev.best || 0) })
        ])
      ]));
    } else {
      host.appendChild(h('p', { class: 'muted small', text: 'Это ваш первый забег: после финала здесь появится сравнение с прошлым.' }));
    }

    const places = Object.keys(st.places);
    if (places.length) {
      host.appendChild(h('div', { class: 'journal-block' }, [
        h('div', { class: 'section-title', text: '🗺 Где прошло время' }),
        h('ul', { class: 'journal-list' }, places.slice(0, 6).map(pl => h('li', { text: pl + ' — ходов: ' + st.places[pl] })))
      ]));
    }

    host.appendChild(h('p', { class: 'muted small', text: 'Метрики: ' + MetricsBox.line() }));
  }

  /* ---------------------------------------------------------- */
  /* Книги-игры: главы без ИИ и без сети                        */
  /* ---------------------------------------------------------- */

  const BOOK_KEY = 'dt2:bookProgress';
  const BOOK_FILTER_KEY = 'dt2:booksFilter';
  const BOOK_ENDS_KEY = 'dt2:bookEnds';   // какие концовки уже видел игрок

  /**
   * Истории без ИИ: жанр, объём и число концовок видно сразу.
   * Фильтр по жанру запоминается, пройденные истории отмечаются.
   */
  function renderBooks() {
    const host = clear($('#books-list'));
    const all = Books ? Books.listBooks() : [];
    const saved = Local.get(BOOK_KEY, null);
    const passed = Local.get(BOOK_ENDS_KEY, {}) || {};
    if (!State.bookGroup) State.bookGroup = Local.get(BOOK_FILTER_KEY, 'all');
    const group = State.bookGroup || 'all';

    const filter = clear($('#books-filter'));
    (Books && Books.BOOK_GROUPS ? Books.BOOK_GROUPS : []).forEach(g => {
      const count = g.id === 'all' ? all.length : all.filter(b => b.group === g.id).length;
      if (!count) return;
      filter.appendChild(h('button', {
        class: 'books-filter__chip' + (g.id === group ? ' is-on' : ''),
        type: 'button', role: 'tab', 'aria-selected': g.id === group ? 'true' : 'false',
        text: g.title + ' ' + count,
        onclick: () => { Sound.tap(); State.bookGroup = g.id; Local.set(BOOK_FILTER_KEY, g.id); renderBooks(); }
      }));
    });

    const books = group === 'all' ? all : all.filter(b => b.group === group);
    books.forEach(b => {
      const inProgress = saved && saved.state && saved.state.bookId === b.id;
      const done = passed[b.id];
      const got = done && Array.isArray(done.titles) ? done.titles.length : 0;
      host.appendChild(h('div', { class: 'book-card' + (inProgress ? ' is-reading' : '') }, [
        h('div', { class: 'book-card__icon', text: b.icon }),
        h('div', { class: 'book-card__body' }, [
          h('div', { class: 'book-card__title', text: b.title }),
          h('div', { class: 'book-card__tag', text: [b.genre, b.chapters + ' глав', b.endings + ' концовки', '≈' + b.minutes + ' мин'].join(' · ') }),
          h('p', { class: 'muted small', text: b.tagline }),
          h('div', {
            class: 'book-card__note',
            text: inProgress ? 'Читаешь прямо сейчас — герой ждёт в этой истории'
              : (got ? 'Собрано концовок: ' + got + ' из ' + b.endings + (got >= b.endings ? ' — все!' : '') : '')
          })
        ]),
        h('div', { class: 'book-card__actions' }, [
          h('button', {
            class: 'btn btn--primary btn--sm', type: 'button',
            text: inProgress ? 'Продолжить' : 'Начать',
            onclick: () => { Sound.tap(); startBookMode(b.id, !!inProgress); }
          })
        ])
      ]));
    });
    if (!books.length) {
      host.appendChild(h('p', { class: 'muted small', text: 'В этом жанре историй пока нет — загляни в «Все».' }));
    }
    const chapters = all.reduce((n, b) => n + b.chapters, 0);
    host.appendChild(h('p', { class: 'muted small books-total', text:
      'Всего ' + all.length + ' историй и ' + chapters + ' глав. Играются без мастера и без сети: текст, выборы и концовки лежат внутри игры.' }));
  }

  function startBookMode(bookId, resume) {
    const saved = Local.get(BOOK_KEY, null);
    let state = (resume && saved && saved.state && saved.state.bookId === bookId) ? saved.state
      : Books.startBook(bookId, { name: (State.draft && State.draft.name) || 'Безымянный' });
    if (!state) { notify('Такой книги нет', { kind: 'warn' }); return; }
    State.book = { state, lastChoiceAt: 0 };
    State.game = null;                       // книга живёт своей жизнью, кампания не сбивается
    show('game');
    document.body.dataset.mode = 'book';
    renderBookScreen({ fresh: !resume });
  }

  function bookCurrent() {
    const b = State.book && State.book.state;
    if (!b) return null;
    const node = Books.bookNode(b);
    return { b, node };
  }

  /** Книга играется без ИИ: убираем всё, что относится к ходам мастера. */
  function bookChrome(on) {
    ['open-journal', 'open-map', 'open-run', 'open-bag'].forEach(act => {
      const btn = document.querySelector('[data-act="' + act + '"]');
      if (btn) btn.hidden = !!on;
    });
    // «История хода» собирает ходы мастера: в книге ходов нет, кнопка была бы пустой
    const logBtn = $('#log-toggle');
    if (logBtn) logBtn.hidden = !!on;
    const status = $('#scene-status-text');
    if (status) status.textContent = on ? 'нарисовано игрой' : 'рисуем…';
    const badge = $('#scene-badge');
    if (badge) { badge.hidden = !!on; if (on) badge.textContent = ''; }
  }

  function renderBookScreen(opts) {
    const cur = bookCurrent();
    if (!cur) return;
    const { b, node } = cur;
    const book = Books.bookById(b.bookId);
    if (!node) return;
    bookChrome(true);
    $('#game-title').textContent = book.title;
    $('#game-sub').textContent = node.chapter + ' · шагов: ' + (b.steps || []).length;
    $('#game-avatar').hidden = true;
    const hp = $('#game-hp');
    if (hp && hp.parentElement) hp.parentElement.style.display = 'none';
    renderSceneText(node.text.join('\n\n'), { typewriter: !!opts && opts.fresh });
    renderChapter({ chapter: node.chapter });
    const npcEl = $('#scene-npc');
    npcEl.hidden = true;
    $('#scene-badge').hidden = true;
    // кадр: книга рисует себя сама — процедурный фон по подсказке главы, без сети
    paintBackdrop(node.art || node.chapter, node.text.join(' '));
    renderActions(null, false);
    const host = clear($('#actions'));
    const choices = Books.bookChoices(b);
    if (node.ending) {
      const end = Books.bookEnding(b);
      host.appendChild(h('button', {
        class: 'action-btn action-btn--primary', type: 'button',
        text: '📖 ' + (end ? end.title : 'Конец') + ' — читать итог',
        onclick: () => { Sound.tap(); showBookEnding(end); }
      }));
      return;
    }
    choices.forEach(c => {
      const btn = h('button', {
        class: 'action-btn' + (c.locked ? ' is-locked' : ''), type: 'button',
        style: c.locked ? 'opacity:.55' : '',
        onclick: () => { if (c.locked) { notify(c.locked, { kind: 'warn' }); return; } Sound.tap(); bookChoose(c.index); }
      }, [
        h('span', { class: 'action-btn__text', text: c.text }),
        c.note ? h('span', { class: 'action-btn__meta', text: c.note }) : null,
        c.locked ? h('span', { class: 'action-btn__meta', text: '🔒 ' + c.locked }) : null
      ]);
      host.appendChild(btn);
    });
    if (Settings.data.voice) Voice.scene(node.text.join(' '), 'book');
    Local.set(BOOK_KEY, { state: b, at: Date.now() });
  }

  function bookChoose(index) {
    const cur = bookCurrent();
    if (!cur) return;
    const r = Books.bookStep(cur.b, index);
    if (!r) { notify('Этот путь закрыт: не хватает сил или вещей', { kind: 'warn' }); return; }
    State.book.state = r.state;
    Local.set(BOOK_KEY, { state: r.state, at: Date.now() });
    if (r.ending) { renderBookScreen({}); }
    else renderBookScreen({ fresh: true });
  }

  /** Финал книги: без мастера и без бросков — только то, что выбрал игрок. */
  /**
   * Подвал экрана итога: у кампании там «Мои игры», «Остаться в мире» и новая кампания,
   * у истории — «Другая концовка» и дорога назад к списку.
   */
  function epilogueFoot(book) {
    const foot = $('#epilogue .prologue__foot');
    if (!foot) return;
    foot.querySelectorAll('[data-act]').forEach(b => { b.hidden = !!book; });
    let back = foot.querySelector('[data-act="book-list"]');
    if (book && !back) {
      back = h('button', {
        class: 'btn btn--primary', type: 'button', 'data-act': 'book-list', text: '📖 К другим историям',
        onclick: () => { Sound.tap(); closeEpilogue(); openScenarios(); setWorldMode('books'); renderBooks(); }
      });
      foot.appendChild(back);
    }
    if (back) back.hidden = !book;
  }

  function showBookEnding(end) {
    if (!end) return;
    // запоминаем, что концовка собрана: в списке историй видно, сколько их ещё осталось
    const seen = Local.get(BOOK_ENDS_KEY, {}) || {};
    const rec = seen[end.bookId] || { titles: [] };
    if (rec.titles.indexOf(end.title) < 0) rec.titles.push(end.title);
    rec.last = end.title;
    rec.at = Date.now();
    seen[end.bookId] = rec;
    Local.set(BOOK_ENDS_KEY, seen);
    Local.set(BOOK_KEY, null);   // история дочитана: закладка «на чём остановился» больше не нужна
    const body = clear($('#epilogue-body'));
    $('#epilogue-title').textContent = '📖 ' + end.bookTitle;
    body.appendChild(h('h3', { class: 'book-end__title', text: end.title }));
    body.appendChild(h('div', { class: 'epilogue__stats' }, [
      epilogueStat('глав', String((end.steps || 0) + 1)),
      epilogueStat('силы', end.hp + '/5'),
      epilogueStat('выборов', String((end.flags || []).length)),
      epilogueStat('герой', end.heroName || 'безымянный')
    ]));
    if (end.flags && end.flags.length) {
      body.appendChild(h('p', { class: 'muted small', text: 'Путь героя: ' + end.flags.join(', ') }));
    }
    const story = Books.bookStory(State.book && State.book.state);
    body.appendChild(h('button', {
      class: 'btn btn--ghost', type: 'button', text: '⬇ Скачать историю текстом',
      onclick: () => download('kniga-' + end.bookId + '.md', story)
    }));
    body.appendChild(h('button', {
      class: 'btn btn--quiet', type: 'button', text: '📖 Другая концовка',
      onclick: () => {
        Local.set(BOOK_KEY, null);
        closeEpilogue();
        startBookMode(end.bookId, false);
      }
    }));
    epilogueFoot(true);
    State.epilogueOpen = true;
    $('#epilogue').hidden = false;
    MetricsBox.game();
  }

  /* ---------------------------------------------------------- */
  /* Облачные сейвы: короткий код вместо кабеля                  */
  /* ---------------------------------------------------------- */

  function currentSaveSnapshot() {
    const g = State.game;
    if (!g) return null;
    const idx = State.storage.list().find(x => x.id === g.id);
    return {
      data: { game: g, index: idx || null },
      settings: Settings.data,
      meta: { title: g.title, hero: g.hero && g.hero.name, turn: g.turn, updatedAt: g.updatedAt }
    };
  }

  async function cloudPutFlow() {
    const list = State.storage.list();
    if (!list.length) { notify('Сначала нужна хотя бы одна игра', { kind: 'warn' }); return; }
    const snap = currentSaveSnapshot() || (() => {
      const first = State.storage.load(list[0].id);
      return first ? { data: { game: first, index: list[0] }, settings: Settings.data, meta: { title: first.title, hero: first.hero && first.hero.name, turn: first.turn } } : null;
    })();
    if (!snap) { notify('Нечего выкладывать', { kind: 'warn' }); return; }
    showLoading('Выкладываем сейв…', 'Короткий код придёт через пару секунд');
    const res = await API.cloudPut(snap);
    hideLoading();
    if (!res.ok) { notify('Облако недоступно: ' + (res.reason || 'нет сервера'), { kind: 'warn', timeout: 5200 }); return; }
    openModal({
      title: '☁ Сейв в облаке', icon: '☁',
      content: h('div', { class: 'settings' }, [
        h('p', { class: 'muted small', text: 'Введите этот код на другом телефоне — игра продолжится с того же места.' }),
        h('div', { class: 'cloud-code', text: res.code }),
        h('p', { class: 'muted small', text: 'Код живёт 30 дней: ' + (snap.meta.title || 'игра') + ' · ход ' + (snap.meta.turn || 1) })
      ]),
      actions: [
        { label: 'Скопировать', kind: 'primary', onClick: () => {
          try { navigator.clipboard.writeText(res.code); toast('Код скопирован', { kind: 'good' }); } catch (e) { toast(res.code, { timeout: 4000 }); }
        } },
        { label: 'Готово', kind: 'ghost', onClick: closeModal }
      ],
      cancelLabel: 'Закрыть'
    });
  }

  function cloudGetFlow() {
    const input = h('input', { class: 'input', type: 'text', maxlength: 6, placeholder: 'например, VMT8CA', autocomplete: 'off' });
    input.style.textTransform = 'uppercase';
    input.style.letterSpacing = '0.24em';
    openModal({
      title: '🔑 Код сейва', icon: '🔑',
      content: h('div', { class: 'settings' }, [
        h('p', { class: 'muted small', text: 'Введите код, который игра выдала на другом устройстве.' }),
        input
      ]),
      actions: [{
        label: 'Продолжить', kind: 'primary', onClick: async () => {
          const code = input.value.trim().toUpperCase();
          if (code.length < 4) { notify('Код короткий: проверьте', { kind: 'warn' }); return; }
          closeModal();
          showLoading('Ищем сейв…', 'Код ' + code);
          const res = await API.cloudGet(code);
          hideLoading();
          if (!res.ok || !res.data) { notify('Не нашли сейв: ' + (res.reason || 'код не найден'), { kind: 'warn', timeout: 5200 }); return; }
          const game = res.data.game;
          if (!game) { notify('В сейве нет игры', { kind: 'warn' }); return; }
          if (res.settings) Settings.set(res.settings);
          State.storage.save(game);
          toast('Сейв загружен: ' + game.title, { kind: 'good' });
          loadGame(game.id, !!game.over);
        }
      }],
      cancelLabel: 'Отмена'
    });
  }

  /* ---------------------------------------------------------- */
  /* Второй шанс без канала: разбор ошибки вместо пустого финала  */
  /* ---------------------------------------------------------- */

  function offerSecondChance(g, notes) {
    const text = E.offlineSecondChance(g);
    notes.push({ icon: '🕯', type: 'hp', text: 'Второй шанс: герой встаёт, но с ценой' });
    E.pushLog(g, { kind: 'gm', text: 'Второй шанс. ' + text.replace(/\n/g, ' ') });
    g.over = false;
    g.hero.hp = 1;
    g.hero.items = Math.max(0, (g.hero.items || 0) - 1);
    E.rememberFact(g, 'герой падал и поднялся со второго шанса');
    notifyAfterDice('🕯 Второй шанс: мастер объяснил, где была ошибка', { kind: 'info', timeout: 6000 });
    openModal({
      title: '🕯 Второй шанс', icon: '🕯',
      content: h('div', { class: 'settings' }, text.split('\n').map(line => h('p', { class: 'small', text: line }))),
      actions: [{ label: 'Дальше', kind: 'primary', onClick: closeModal }],
      cancelLabel: 'Закрыть'
    });
    return { kind: 'offline-second-chance' };
  }

  /* ---------------------------------------------------------- */
  /* Уточняющий вопрос перед первой сценой                       */
  /* ---------------------------------------------------------- */

  function askOpeningQuestion() {
    if (Settings.data.beginQuestion === false) return Promise.resolve('');
    const q = E.openingQuestion(State.game || {});
    return new Promise(resolve => {
      const answer = extra => { closeModal(); Sound.tap(); resolve(extra || ''); };
      const content = h('div', { class: 'settings' }, [
        h('p', { class: 'muted small', text: q.question }),
        h('div', { class: 'rules-row' }, q.options.map(o => h('button', {
          class: 'rules-btn', type: 'button', title: o.hint || '',
          onclick: () => answer(o.extra)
        }, [
          h('span', { text: o.title }),
          h('span', { class: 'rules-btn__hint', text: o.hint || '' })
        ])))
      ]);
      openModal({
        title: '🎬 С чего начнём', icon: '🎬', content,
        actions: [{ label: 'Пусть решает мастер', kind: 'ghost', onClick: () => answer('') }],
        cancelLabel: ''
      });
      // закрытие крестиком — тоже «пусть решает мастер»
      State.openingResolve = () => resolve('');
    });
  }

  /* ---------------------------------------------------------- */
  /* Установка приложения (PWA)                                  */
  /* ---------------------------------------------------------- */

  function setupInstall() {
    window.addEventListener('beforeinstallprompt', ev => {
      ev.preventDefault();
      State.installEvent = ev;
    });
    window.addEventListener('appinstalled', () => {
      State.installEvent = null;
      toast('Приложение установлено — теперь игра запускается без сети', { kind: 'good', timeout: 4200 });
    });
  }

  async function registerWorker() {
    if (!('serviceWorker' in navigator)) return false;
    if (location.protocol === 'file:') return false;
    try {
      const reg = await navigator.serviceWorker.register('sw.js');
      State.swReg = reg;
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ---------------------------------------------------------- */
  /* Тон по абзацам: сцена читается как разговор                 */
  /* ---------------------------------------------------------- */

  let speakChain = Promise.resolve();
  const PARAGRAPH_PAUSE = 220;
  /** Одно чтение с ожиданием конца: серверный mp3 или голос браузера. */
  function speakPiece(text, mood, voice, epoch) {
    return new Promise(resolve => {
      const clean = String(text || '').replace(/\s+/g, ' ').trim();
      if (!clean) { resolve(false); return; }
      const done = (() => {
        let called = false;
        return value => { if (!called) { called = true; resolve(value); } };
      })();
      // смена сцены обрывает кусок сразу: очередь не должна ждать конца mp3
      const abort = () => done(false);
      speakAborts.add(abort);
      speakLog.push({ epoch: epoch === undefined ? speakEpoch : epoch, chars: clean.length, at: Date.now() });
      if (speakLog.length > 60) speakLog.shift();
      const finish = value => { speakAborts.delete(abort); done(value); };
      const alive = () => epoch === undefined || epoch === speakEpoch;
      const gender = voice || Settings.data.voiceGender || 'female';
      API.speakScene(clean, { mood: mood || 'book', gender }).then(url => {
        if (!alive()) { if (url) { try { URL.revokeObjectURL(url); } catch (e) {} } return finish(false); }
        if (!url) { return finish(speakBrowserPiece(clean, mood, gender)); }
        const el = new window.Audio(url);
        el.onended = () => { try { URL.revokeObjectURL(url); } catch (e) {} finish(true); };
        el.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) {} finish(speakBrowserPiece(clean, mood, gender)); };
        el.play().catch(() => finish(speakBrowserPiece(clean, mood, gender)));
      }).catch(() => finish(speakBrowserPiece(clean, mood, gender)));
      // страховка: не застреваем навсегда, очередь должна идти дальше
      setTimeout(() => finish(true), 30000);
    });
  }

  /** Тот же текст голосом устройства: тон и темп — по настроению абзаца. */
  function speakBrowserPiece(text, mood, voice) {
    if (!(typeof window !== 'undefined' && 'speechSynthesis' in window)) return false;
    try {
      const u = new window.SpeechSynthesisUtterance(String(text || '').slice(0, 600));
      u.lang = 'ru-RU';
      const base = { book: { rate: .98, pitch: 1 }, dark: { rate: .9, pitch: .94 }, dread: { rate: .82, pitch: .86 },
        hurt: { rate: .86, pitch: .84 }, tense: { rate: 1.06, pitch: 1.05 }, heroic: { rate: 1.02, pitch: 1.1 },
        ironic: { rate: 1.02, pitch: 1.06 } };
      const p = base[mood] || base.book;
      u.rate = p.rate;
      u.pitch = voice === 'female' || voice === 'ava' ? p.pitch + 0.12 : p.pitch - 0.06;
      window.speechSynthesis.speak(u);
      return true;
    } catch (e) { return false; }
  }

  /**
   * Сцена по абзацам: описание — тёмным голосом, реплика — живым, ранение —
   * глухим. Плюс короткая пауза между абзацами, как в аудиокниге.
   */
  function speakParagraphs(text, mood, voice) {
    const parts = E.paragraphMoods(text);
    if (!parts.length) return;
    const epoch = speakEpoch;               // сцена, которую читаем
    speakChain = speakChain.then(async () => {
      for (const part of parts) {
        if (!speakStill(epoch)) return;     // игрок ушёл дальше — дальше не читаем
        await speakPiece(part.text, mood || part.mood, voice, epoch);
        if (!speakStill(epoch)) return;     // пауза не должна тянуть старую сцену
        await new Promise(r => setTimeout(r, PARAGRAPH_PAUSE));
      }
    }).catch(() => { /* цепочка не должна ломаться */ });
  }

  /* ---------------------------------------------------------- */
  /* Короткие звуки и музыка: синтез, без файлов                 */
  /* ---------------------------------------------------------- */

  const SCENE_SOUNDS = {
    step:   { kind: 'noise', gain: 0.06, freq: 700, dur: 0.05 },
    door:   { kind: 'noise', gain: 0.09, freq: 320, dur: 0.22 },
    creak:  { kind: 'blip', freq: 210, dur: 0.3, type: 'sawtooth', gain: 0.03 },
    hit:    { kind: 'noise', gain: 0.14, freq: 180, dur: 0.12 },
    wind:   { kind: 'noise', gain: 0.05, freq: 480, dur: 0.9 },
    bell:   { kind: 'blip', freq: 660, dur: 0.5, type: 'sine', gain: 0.04 }
  };

  const Music = (function () {
    let ctx = null;
    let nodes = [];
    let playing = false;
    const PATTERNS = {
      fantasy: { root: 110, steps: [1, 1.5, 2, 1.5], wave: 'sine', gain: 0.028, beat: 1.6 },
      cyber:   { root: 82, steps: [1, 1.2, 1.5, 1.8, 1.5, 1.2], wave: 'square', gain: 0.018, beat: 0.42 },
      waste:   { root: 65, steps: [1, 1, 1.25, 1], wave: 'triangle', gain: 0.026, beat: 2.4 }
    };
    function genreFor(game) {
      const s = (game && (game.setting || game.genre)) || '';
      const hay = [s, game && game.title, game && game.scenarioTitle].filter(Boolean).join(' ').toLowerCase();
      if (/кибер|неон|cyber|sci|косм|station|найт-сити/.test(hay)) return 'cyber';
      if (/пустош|waste|зона|метро|постапок|пост-апок/.test(hay)) return 'waste';
      return 'fantasy';
    }
    function stop() {
      nodes.forEach(n => { try { n.stop(); } catch (e) {} });
      nodes = [];
      playing = false;
    }
    function start(game) {
      if (!Settings.data.music || Settings.data.muted) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!ctx) ctx = new AC();
      if (ctx.state === 'suspended') ctx.resume();
      const pat = PATTERNS[genreFor(game)] || PATTERNS.fantasy;
      stop();
      playing = true;
      const master = ctx.createGain();
      master.gain.value = pat.gain;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      master.connect(filter).connect(ctx.destination);
      // луп собираем из коротких нот: файлов нет, вес не растёт
      const step = () => {
        if (!playing) return;
        nodes = nodes.filter(n => n && n.context && n.context.currentTime >= 0);
        const now = ctx.currentTime;
        pat.steps.forEach((k, i) => {
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          osc.type = pat.wave;
          osc.frequency.value = pat.root * k;
          g.gain.setValueAtTime(0.0001, now + i * pat.beat);
          g.gain.exponentialRampToValueAtTime(0.9, now + i * pat.beat + 0.12);
          g.gain.exponentialRampToValueAtTime(0.0001, now + i * pat.beat + pat.beat * 0.9);
          osc.connect(g).connect(master);
          osc.start(now + i * pat.beat);
          osc.stop(now + i * pat.beat + pat.beat);
          nodes.push(osc);
        });
      };
      step();
      clearInterval(Music.timer);
      Music.timer = setInterval(step, pat.steps.length * pat.beat * 1000);
    }
    return { start, stop, genreFor, get playing() { return playing; }, timer: null };
  })();

  /* ---------------------------------------------------------- */
  /* Галерея кадров кампании: IndexedDB, только свои файлы        */
  /* ---------------------------------------------------------- */

  const Frames = (function () {
    const DB_NAME = 'dt2-frames';
    const STORE = 'frames';
    const MAX = 12;
    let dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(resolve => {
        try {
          const req = window.indexedDB.open(DB_NAME, 1);
          req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch (e) { resolve(null); }
      });
      return dbp;
    }
    async function put(frame) {
      const db = await open();
      if (!db) return false;
      return new Promise(resolve => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).put(frame);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) { resolve(false); }
      });
    }
    async function all() {
      const db = await open();
      if (!db) return [];
      return new Promise(resolve => {
        try {
          const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
          req.onsuccess = () => resolve((req.result || []).sort((a, b) => a.at - b.at).slice(-MAX));
          req.onerror = () => resolve([]);
        } catch (e) { resolve([]); }
      });
    }
    async function clear() {
      const db = await open();
      if (!db) return false;
      return new Promise(resolve => {
        try {
          const tx = db.transaction(STORE, 'readwrite');
          tx.objectStore(STORE).clear();
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => resolve(false);
        } catch (e) { resolve(false); }
      });
    }
    /** Кадр в галерею: адрес генератора или локальный data-URL небольшого размера. */
    async function remember(game, url, source, place) {
      if (!game || !url) return false;
      // локальные кадры тоже храним, но не раздуваем базу: data-URL длиннее 200 КБ не берём
      if (url.startsWith('data:') && url.length > 200000) return false;
      const list = await all();
      const id = game.id + ':' + (list.length + 1) + ':' + Date.now();
      await put({ id, gameId: game.id, url, source: source || '', place: place || '', turn: game.turn || 0, chapter: game.chapter || '', at: Date.now() });
      return true;
    }
    return { remember, all, clear };
  })();

  /* ---------------------------------------------------------- */
  /* Итоговая карточка кампании: canvas → PNG                    */
  /* ---------------------------------------------------------- */

  function drawRunCard(data, opts) {
    const o = opts || {};
    const W = 900, H = 1200;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    const pal = o.palette || ['#0d1117', '#243244', '#9fe6d0'];
    const grad = c.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, pal[0]);
    grad.addColorStop(0.55, pal[1]);
    grad.addColorStop(1, pal[0]);
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    // дымка поверх: карточка должна выглядеть как обложка, а не как отчёт
    const haze = c.createRadialGradient(W * 0.7, H * 0.18, 20, W * 0.7, H * 0.18, W * 0.9);
    haze.addColorStop(0, (pal[2] || '#9fe6d0') + '38');
    haze.addColorStop(1, 'transparent');
    c.fillStyle = haze;
    c.fillRect(0, 0, W, H);

    const font = (size, weight) => (weight || '') + ' ' + size + 'px "Georgia", "Times New Roman", serif';
    c.fillStyle = 'rgba(255,255,255,.92)';
    c.font = font(58, 'bold');
    const title = String(data.title || 'Кампания').slice(0, 24);
    c.fillText(title, 60, 150);
    c.font = font(30);
    c.fillStyle = 'rgba(255,255,255,.68)';
    c.fillText(String(data.world || '').slice(0, 40), 60, 200);
    c.font = font(120);
    c.fillText(data.mood || '🎲', 60, 360);

    c.fillStyle = 'rgba(255,255,255,.9)';
    c.font = font(40, 'bold');
    c.fillText(String(data.hero || '').slice(0, 34), 60, 440);
    c.font = font(34);
    c.fillStyle = (pal[2] || '#9fe6d0');
    c.fillText(String(data.verdict || '').slice(0, 34), 60, 500);

    c.fillStyle = 'rgba(255,255,255,.72)';
    c.font = font(30);
    let y = 590;
    const rows = [
      'Ходов: ' + data.turns + ' · бросков: ' + data.checks,
      data.place ? 'Последнее место: ' + data.place : '',
      data.people.length ? 'Рядом были: ' + data.people.join(', ') : ''
    ].filter(Boolean);
    rows.forEach(r => { c.fillText(String(r).slice(0, 52), 60, y); y += 50; });

    if (data.milestones.length) {
      y += 20;
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.font = font(30, 'bold');
      c.fillText('Вехи', 60, y);
      y += 46;
      c.font = font(29);
      c.fillStyle = 'rgba(255,255,255,.75)';
      data.milestones.forEach(ms => { c.fillText('• ' + String(ms).slice(0, 44), 70, y); y += 46; });
    }
    if (data.facts.length) {
      y += 20;
      c.fillStyle = 'rgba(255,255,255,.85)';
      c.font = font(30, 'bold');
      c.fillText('Осталось в памяти', 60, y);
      y += 46;
      c.font = font(27);
      c.fillStyle = 'rgba(255,255,255,.72)';
      data.facts.forEach(f => {
        const words = String(f).split(' ');
        let line = '';
        words.forEach(w => {
          if ((line + ' ' + w).length > 46) { c.fillText('• ' + line.trim(), 70, y); y += 40; line = w; }
          else line += ' ' + w;
        });
        if (line.trim()) { c.fillText('• ' + line.trim(), 70, y); y += 40; }
      });
    }
    if (data.ashes) {
      y += 16;
      c.font = font(28);
      c.fillStyle = (pal[2] || '#9fe6d0');
      c.fillText('🕯 Пепел для будущих жизней: +' + data.ashes, 60, y);
    }
    c.font = font(26);
    c.fillStyle = 'rgba(255,255,255,.45)';
    c.fillText('Кости и Судьбы · текстовая RPG', 60, H - 70);
    return cv;
  }

  function saveRunCard(data, palette) {
    const cv = drawRunCard(data, { palette });
    const name = 'campaign-' + (data.title || 'run').replace(/[^\wа-яё\-]+/gi, '-').slice(0, 30) + '.png';
    try {
      cv.toBlob(async blob => {
        if (!blob) return;
        const file = new File([blob], name, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: data.title, text: data.verdict });
            return;
          } catch (e) { /* игрок передумал — просто скачаем */ }
        }
        downloadBlob(name, blob);
        toast('Карточка кампании сохранена: ' + name, { kind: 'good' });
      }, 'image/png');
    } catch (e) {
      toast('Карточку не получилось собрать', { kind: 'warn' });
    }
  }

  function downloadFromUrl(filename, url) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('Карточка сохранена: ' + filename, { kind: 'good' });
  }

  /* ---------------------------------------------------------- */
  /* Свои миры 2.0: играть тем же миром новым героем             */
  /* ---------------------------------------------------------- */

  function playWorldNewHero(worldId) {
    const worlds = State.storage.worlds();
    const world = worlds.find(w => String(w.id) === String(worldId));
    if (!world) { notify('Мир не найден', { kind: 'warn' }); return; }
    if (!State.draft) State.draft = { name: '', classId: '', raceId: '', originId: '' };
    State.draftWorld = Object.assign({}, world);
    State.draft.name = '';
    State.pickedScenario = Object.assign({}, E.CUSTOM_SCENARIO, { id: 'custom', title: world.title || 'Мой мир' });
    State.heroProfile = null;
    openHero();
    if (typeof rerollHero === 'function') rerollHero();
    toast('Мир «' + (world.title || 'свой') + '» — придумаем нового героя', { kind: 'good', timeout: 3000 });
  }

  /** Продолжить после смерти: тот же мир, новый герой, летопись остаётся. */
  function continueAfterDeath() {
    const g = State.game;
    if (!g) { show('menu'); return; }
    const world = State.storage.worlds().find(w => (w.title || '') === (g.scenarioTitle || ''));
    closeEpilogue();
    if (world) { playWorldNewHero(world.id); return; }
    restartSameScenario();
  }

  /* ---------------------------------------------------------- */
  /* Повторить ход: если мастер молчал или ответ оборвался        */
  /* ---------------------------------------------------------- */

  function lastActionLog(g) {
    const log = (g && g.log) || [];
    for (let i = log.length - 1; i >= 0; i--) {
      if (log[i].kind === 'action') return log[i];
    }
    return null;
  }

  async function retryLastTurn() {
    const g = State.game;
    if (!g || State.busy) return;
    const entry = lastActionLog(g);
    if (!entry) { notify('Нет хода, который можно повторить', { kind: 'warn' }); return; }
    const action = { text: entry.text, stat: entry.stat, dc: entry.dc };
    State.busy = true;
    setActionsLoading('Мастер переписывает ход…');
    const turn = await API.generateTurn(g, action, null, {
      extra: 'ПРЕДЫДУЩИЙ ОТВЕТ ПОТЕРЯЛСЯ. Перепиши этот ход заново: сцена 2–4 предложения, конкретное последствие выбора игрока и ровно 3 новых варианта.',
      onStatus: statusHook(),
      onDelta: full => previewSceneStream(full),
      onPreviewEnd: stopScenePreview
    });
    applyTurn(turn, action, false);
    notifyAfterDice('Ход переписан заново', { kind: 'good', timeout: 2600 });
  }

  /* ---------------------------------------------------------- */
  /* Размер текста: три ступени                                  */
  /* ---------------------------------------------------------- */

  const TEXT_SIZES = [
    { id: 's', title: 'Мелкий', hint: 'больше строк в кадре' },
    { id: 'm', title: 'Обычный', hint: 'как сейчас' },
    { id: 'l', title: 'Крупный', hint: 'крупнее буквы, шапка и кадр чуть ниже' }
  ];

  /** Режим «одной рукой»: варианты прижимаются к низу и становятся выше. */
  function applyHandOne() {
    document.body.classList.toggle('hand-one', !!Settings.data.handOne);
  }

  function applyTextSize() {
    const id = Settings.data.textSize || 'm';
    document.body.classList.remove('text-s', 'text-m', 'text-l');
    document.body.classList.add('text-' + id);
  }

  /* ---------------------------------------------------------- */
  /* Обработчики                                                */
  /* ---------------------------------------------------------- */
  /**
   * Отклик на касание: под пальцем расходится мягкая волна света. Это и
   * «отзывчивость» кнопки, и подсказка, что нажатие засчитано, — на телефоне
   * без курсора иначе непонятно, попал ты или нет. Вибрация — где телефон умеет.
   */
  function bindTouchFeedback() {
    const pick = el => el && el.closest && el.closest('.action-btn, .log-toggle, .btn, .chip, .tab');
    document.addEventListener('pointerdown', ev => {
      const el = pick(ev.target);
      if (!el || el.disabled) return;
      if (Settings.data.haptics !== false && typeof navigator.vibrate === 'function') {
        try { navigator.vibrate(8); } catch (e) { /* noop */ }
      }
      if (Settings.data.motion === false || prefersReducedMotion()) return;
      const rect = el.getBoundingClientRect();
      const span = (el.offsetWidth + el.offsetHeight) || 160;
      const dot = h('span', { class: 'tap-ripple' });
      dot.style.left = (ev.clientX - rect.left) + 'px';
      dot.style.top = (ev.clientY - rect.top) + 'px';
      dot.style.width = span + 'px';
      dot.style.height = span + 'px';
      el.appendChild(dot);
      setTimeout(() => dot.remove(), 540);
    }, { passive: true });
  }

  function bind() {
    document.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      Sound.unlock();
      switch (act) {
        case 'new-game': Sound.tap(); openScenarios(); break;
        case 'my-games': Sound.tap(); show('saves'); break;
        case 'daily-run': Sound.tap(); openDaily(); break;
        case 'daily-start': startDaily(); break;
        case 'daily-why': {
          openModal({
            title: 'Забег дня',
            icon: '🗓',
            text: 'Каждый день один мир, один герой и один набор бросков — общие для всех. ' +
              'Ведущий встроенный: ключ и интернет не нужны. Счёт считают цель дня, жизнь, ' +
              'припасы, предметы, криты и темп. Результат хранится на телефоне, а в облако ' +
              'уходят только очки — без имени и без истории. Завтра выпадет новый мир.',
            actions: [{ label: 'Понятно', kind: 'primary', onClick: () => closeModal() }]
          });
          break;
        }
        case 'open-journal': Sound.tap(); show('journal'); break;
        case 'open-bag':
          Sound.tap();
          show('journal');
          // журнал покажет раздел сумки первым, что видно
          setTimeout(() => {
            const bag = $('#journal-bag');
            if (bag && bag.scrollIntoView) bag.scrollIntoView({ block: 'start' });
          }, 70);
          break;
        case 'open-map': Sound.tap(); show('map'); break;
        case 'open-run': Sound.tap(); show('run'); break;
        case 'back-game':
          Sound.tap();
          show('game');
          break;
        case 'cloud-put': Sound.tap(); cloudPutFlow(); break;
        case 'cloud-get': Sound.tap(); cloudGetFlow(); break;
        case 'back':
          if (document.body.dataset.screen === 'daily') show('menu');
          else if (document.body.dataset.screen === 'scenarios') show('menu');
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
        case 'reload-image':
          Sound.tap();
          if (State.book) {
            // в книге кадр рисует сама игра: просим новый вариант того же места
            const cur = bookCurrent();
            State.backdropSeed = E.rnd.seed();
            if (cur) paintBackdrop(cur.node.art || cur.node.chapter, cur.node.text.join(' '));
            toast('Кадр перерисован', { timeout: 1600 });
            break;
          }
          loadSceneImage(State.game && State.game.scene && State.game.scene.imagePrompt, null, false);
          break;
        case 'open-hero': openHeroSheet(); break;
        case 'random-name':
          $('#hero-name').value = randomName();
          State.draft.name = $('#hero-name').value;
          Sound.tap();
          break;
        case 'show-menu': show('menu'); break;
        case 'settings': openSettings(); break;
        case 'speak-scene': {
          Voice.toggle();
          if (Voice.on && State.game && State.game.scene) {
            // ручное включение читает текущую сцену тем же тоном, что и автоозвучка
            const moodNow = (State.mood && State.mood.voice) || 'book';
            Voice.say(State.game.scene.text, moodNow);
            toast('Читаю сцену вслух · ' + (State.mood && State.mood.note || 'ровно'), { timeout: 2000 });
          }
          break;
        }
        case 'close-epilogue': closeEpilogue(); break;
        case 'restart-run': Sound.tap(); closeEpilogue(); restartSameScenario(); break;
        case 'epilogue-saves': closeEpilogue(); show('saves'); break;
        case 'continue-death': Sound.tap(); continueAfterDeath(); break;
        case 'retry-turn': retryLastTurn(); break;
        case 'run-card': {
          const g = State.game || (State.storage.list()[0] && State.storage.load(State.storage.list()[0].id));
          if (!g) { notify('Кампании пока нет', { kind: 'warn' }); break; }
          saveRunCard(E.runCard(g, {}), paletteFor(g, E.scenarioById(g.scenarioId)));
          break;
        }
        case 'export-story': {
          const g = State.game || (State.storage.list()[0] && State.storage.load(State.storage.list()[0].id));
          if (!g) { notify('Истории пока нет', { kind: 'warn' }); break; }
          download('campaign-' + (g.id || 'run') + '.md', E.campaignMarkdown(g));
          toast('История сохранена текстом', { kind: 'good' });
          break;
        }
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
      barLabel($('#log-toggle'), wrap.hidden ? 'История' : 'Скрыть');
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
    attachGestures();

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
    watchAppHeight();
    const panel = $('#panel');
    if (panel) panel.addEventListener('scroll', updatePanelFade, { passive: true });
    window.addEventListener('resize', updatePanelFade);
    State.storage = E.createStorage(pickStorage());
    Settings.init(State.storage);

    try {
      const params = new URLSearchParams(window.location.search);
      const key = params.get('key');
      if (key) Settings.set({ apiKey: key });
    } catch (e) { /* noop */ }

    setupViewport();
    bind();
    bindTouchFeedback();
    setupInstall();
    // офлайн-запуск: оболочку кладём в кэш, игра открывается без сети
    registerWorker().then(ok => { if (ok) console.log('[офлайн] service worker готов'); });
    applyTheme(null);
    applyTextSize();
    applyHandOne();
    Voice.syncButton();
    if (Voice.supported) {
      try { window.speechSynthesis.addEventListener('voiceschanged', () => Voice.syncButton()); } catch (e) { /* noop */ }
    }
    Critters.mount();
    document.addEventListener('visibilitychange', () => {
      Critters.sync(document.body.dataset.screen === 'menu');
      // вернулись в игру — поднимаем фон, ушли в другое приложение — останавливаем
      if (document.hidden) { Ambient.stop(); Voice.stop(); Music.stop(); }
      else if (document.body.dataset.screen === 'game') { Ambient.sync(); Living.start(); Music.start(State.game); }
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
