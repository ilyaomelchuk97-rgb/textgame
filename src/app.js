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
    let data = { muted: false, apiKey: '' };
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
    worldMode: 'random',
    draftWorld: null,
    draft: { name: '', classId: 'warrior', raceId: 'human', originId: 'streets' },
    busy: false,
    backdropSeed: 1
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

  function pickScenario(s) {
    State.pickedScenario = s;
    // для «своей игры» берём текст из поля
    if (s.customGame) {
      const name = $('#own-game-input').value.trim();
      State.draftWorld = Object.assign(E.emptyWorldConfig(), {
        gameName: name || 'Своя игра',
        danger: 'normal',
        extra: name ? '' : 'Придумай мир сам, но сделай его узнаваемым и цельным.'
      });
      if (!name) {
        notify('Название игры пустое — ИИ придумает мир сам', { kind: 'warn' });
      }
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
    openHero();
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
      extra: 'Держи узнаваемые черты этой игры: её мир, лексику, персонажей-архетипы и правила.'
    });
    Sound.tap();
    openHero();
  }

  /* ---------------------------------------------------------- */
  /* Создание героя                                             */
  /* ---------------------------------------------------------- */
  function heroBannerScenario() {
    const s = State.pickedScenario || E.SCENARIOS[0];
    const cfg = State.draftWorld;
    const title = (cfg && cfg.gameName) ? cfg.gameName : ((cfg && cfg.title) ? cfg.title : s.title);
    const goal = (cfg && cfg.goal) ? cfg.goal : (s.goal || 'цель определит ИИ-мастер');
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
    renderClassList();
    renderRaceList();
    renderOriginList();
    renderStatPreview();
    show('hero');
  }

  function renderClassList() {
    const wrap = clear($('#class-list'));
    E.CLASSES.forEach(c => {
      const active = c.id === State.draft.classId;
      const bonus = E.STAT_IDS.filter(id => c.bonus[id]).map(id => E.statById(id).name + ' ' + (c.bonus[id] > 0 ? '+' : '') + c.bonus[id]);
      const ability = E.abilityById(c.ability);
      wrap.appendChild(h('button', {
        class: 'arch-card' + (active ? ' is-active' : ''), type: 'button',
        onclick: () => { State.draft.classId = c.id; Sound.tap(); renderClassList(); renderStatPreview(); }
      }, [
        h('span', { class: 'arch-card__icon', text: c.icon }),
        h('span', { class: 'arch-card__main' }, [
          h('span', { class: 'arch-card__title', text: c.title }),
          h('span', { class: 'arch-card__blurb', text: c.blurb }),
          h('span', { class: 'arch-card__ability', text: ability.icon + ' ' + ability.name + ' — ' + ability.desc })
        ]),
        h('span', { class: 'arch-card__bonus', text: bonus.join(' · ') })
      ]));
    });
  }

  function renderRaceList() {
    const wrap = clear($('#race-list'));
    const setting = (State.pickedScenario || E.SCENARIOS[0]).setting;
    E.RACES.forEach(r => {
      const active = r.id === State.draft.raceId;
      wrap.appendChild(h('button', {
        class: 'chip chip--tall' + (active ? ' is-on' : ''), type: 'button',
        onclick: () => { State.draft.raceId = r.id; Sound.tap(); renderRaceList(); renderStatPreview(); }
      }, [
        h('span', { class: 'chip__title', text: r.icon + ' ' + r.title }),
        h('span', { class: 'chip__sub', text: E.raceFlavor(r, setting) })
      ]));
    });
    const race = E.raceById(State.draft.raceId);
    $('#race-hint').textContent = 'Особенность: ' + race.trait;
  }

  function renderOriginList() {
    const wrap = clear($('#origin-list'));
    E.ORIGINS.forEach(o => {
      const active = o.id === State.draft.originId;
      const bonus = E.STAT_IDS.filter(id => o.bonus[id]).map(id => E.statById(id).short + ' +' + o.bonus[id]);
      wrap.appendChild(h('button', {
        class: 'arch-card arch-card--slim' + (active ? ' is-active' : ''), type: 'button',
        onclick: () => { State.draft.originId = o.id; Sound.tap(); renderOriginList(); renderStatPreview(); }
      }, [
        h('span', { class: 'arch-card__icon', text: o.icon }),
        h('span', { class: 'arch-card__main' }, [
          h('span', { class: 'arch-card__title', text: o.title }),
          h('span', { class: 'arch-card__blurb', text: o.hook })
        ]),
        h('span', { class: 'arch-card__bonus', text: bonus.join(' · ') + ' · ' + o.item })
      ]));
    });
  }

  function renderStatPreview() {
    const d = State.draft;
    const stats = E.makeStats({ classId: d.classId, raceId: d.raceId, originId: d.originId });
    const hp = E.maxHpFor({ classId: d.classId, stats });
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
    const ability = E.abilityById(E.classById(d.classId).ability);
    $('#hero-hint').textContent =
      'Умение: ' + ability.icon + ' ' + ability.name + ' — ' + ability.desc +
      ' Доступно раз в ' + E.ABILITY_COOLDOWN + ' хода. Бросок: d20 + характеристика против сложности, 20 — крит, 1 — провал.';
  }

  /* ---------------------------------------------------------- */
  /* Старт игры                                                 */
  /* ---------------------------------------------------------- */
  function startAdventure() {
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
      worldConfig: isWorldBuilding ? (State.draftWorld || E.emptyWorldConfig()) : null
    });
    if (isWorldBuilding && State.draftWorld && State.draftWorld.gameName) {
      game.scenarioTitle = State.draftWorld.gameName;
      game.title = State.draftWorld.gameName;
    }
    State.game = game;
    State.storage.save(game);
    Sound.tap();
    openGame(game, true, isWorldBuilding);
  }

  /* ---------------------------------------------------------- */
  /* Игровой экран                                              */
  /* ---------------------------------------------------------- */
  function openGame(game, isNew, worldPending) {
    State.game = game;
    State.busy = false;
    show('game');
    renderGameTop();
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
    if (game.over) showGameOver();
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
  function renderSceneText(text, opts) {
    const o = Object.assign({ typewriter: false }, opts || {});
    const box = $('#scene-text');
    clear(box);
    if (typingTimer) { clearInterval(typingTimer); typingTimer = null; }
    const p = h('div', { class: 'scene-text__body', html: formatText(text || '') });
    box.appendChild(p);
    $('#panel').scrollTop = 0;
    if (o.typewriter && text) {
      const full = formatText(text);
      let i = 0;
      p.innerHTML = '';
      const step = Math.max(1, Math.round(full.length / 90));
      typingTimer = setInterval(() => {
        i += step;
        p.innerHTML = full.slice(0, i);
        if (i >= full.length) { clearInterval(typingTimer); typingTimer = null; p.innerHTML = full; }
        $('#panel').scrollTop = $('#panel').scrollHeight;
      }, 16);
    } else {
      $('#panel').scrollTop = 0;
    }
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
      wrap.appendChild(h('div', { class: 'actions__loading' }, [
        h('span', { class: 'spinner' }),
        h('span', { text: 'Мастер придумывает варианты…' })
      ]));
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
  function paintBackdrop(prompt, sceneText) {
    const g = State.game;
    if (!g || !Backdrop) return;
    const s = E.scenarioById(g.scenarioId);
    const kind = E.sceneKindFromText((prompt || '') + ' ' + (sceneText || '') + ' ' + (g.goal || ''));
    State.backdropSeed = E.rnd.seed();
    try {
      Backdrop.draw($('#scene-canvas'), { kind, palette: s.palette, seed: State.backdropSeed });
      $('#scene-canvas').dataset.kind = kind;
    } catch (e) { /* canvas может быть недоступен — не критично */ }
  }

  function setSceneStatus(text, done) {
    const el = $('#scene-status');
    if (!el) return;
    if (!text) { el.hidden = true; return; }
    el.hidden = false;
    $('#scene-status-text').textContent = text;
    el.dataset.done = done ? '1' : '0';
  }

  function setSceneImage(url, source) {
    const img = $('#scene-img');
    img.src = url;
    img.hidden = false;
    requestAnimationFrame(() => img.classList.add('is-visible'));
    $('#scene-badge').hidden = true;
    setSceneStatus('');
    if (State.game && State.game.scene) {
      State.game.scene.image = url;
      State.game.scene.imageSource = source || '';
    }
    autosave();
  }

  async function loadSceneImage(prompt, action, silent) {
    const g = State.game;
    if (!g) return;
    const s = E.scenarioById(g.scenarioId);
    const used = prompt || E.fallbackImagePrompt(g, action && action.text);
    if (!silent) setSceneStatus('рисуем сцену…');
    $('#scene-badge').textContent = 'фон рисуется';
    $('#scene-badge').hidden = false;

    const seed = E.rnd.seed();
    // гонка источников: что ответит быстрее — то и показываем.
    // Как только картинка показана, отставшие попытки больше не меняют подписи.
    let settled = false;
    const res = await API.generateImage({
      prompt: used,
      style: s.artStyle,
      aspect: '16:9',
      seed,
      onAttempt: name => {
        if (settled) return;
        const map = { server: 'рисуем сцену…', a0: 'рисуем сцену…', pollinations: 'пробуем другой генератор…', stock: 'подбираем фон…' };
        setSceneStatus(map[name] || 'рисуем сцену…');
      }
    });
    settled = true;
    if (res.ok) {
      g.usedImagePrompts = (g.usedImagePrompts || []).concat([used]).slice(-12);
      g.lastImagePrompt = used;
      // подстраховка: если пришёл не тот тип фона — перекрасим локальный слой под него
      paintBackdrop(used, g.scene && g.scene.text);
      setSceneImage(res.url, res.source);
      $('#scene-badge').hidden = true;
      if (res.source === 'stock') {
        $('#scene-badge').textContent = 'запасной фон';
        $('#scene-badge').hidden = false;
      }
    } else {
      setSceneStatus('');
      $('#scene-badge').hidden = true;
      notify('Генератор картинок молчит — сцена нарисована локально', { kind: 'warn', timeout: 5000 });
    }
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
  /* Ходы                                                       */
  /* ---------------------------------------------------------- */
  const statusText = kind => ({
    offline: 'Локальный мастер ведёт игру…',
    server: 'Мастер думает (канал сервера)…',
    direct: 'Мастер описывает последствия…'
  }[kind] || 'Мастер описывает последствия…');

  function setActionsLoading(text) {
    const wrap = clear($('#actions'));
    wrap.appendChild(h('div', { class: 'actions__loading' }, [
      h('span', { class: 'spinner' }), h('span', { text })
    ]));
  }

  const statusHook = () => kind => {
    const el = $('#actions .actions__loading span:last-child');
    if (el) el.textContent = statusText(kind);
  };

  /** Сборка своего мира / своей игры: ИИ придумывает название, цель и первую сцену. */
  async function buildWorldThenStart() {
    const g = State.game;
    State.busy = true;
    showLoading('Мастер строит мир…', 'Название, цель и первая сцена');
    setActionsLoading('Мастер строит мир…');
    const turn = await API.generateWorld(g, { onStatus: statusHook() });
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
    const turn = await API.generateOpening(g, { onStatus: statusHook() });
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
    const turn = await API.generateTurn(g, opt, check, {
      onStatus: statusHook(),
      extra: extra.join(' ')
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
    const g = State.game;
    if (!isWorldBuild) g.turn = (g.turn || 0) + 1;
    const notes = E.applyEffects(g, turn.effects);
    if (turn.chapter) g.chapter = turn.chapter;
    if (turn.npc) E.pushLog(g, { kind: 'npc', text: turn.npc });
    E.pushLog(g, {
      kind: isWorldBuild ? 'gm' : 'gm',
      text: turn.scene,
      notes: notes,
      offline: !!turn.offline
    });
    g.scene = {
      text: turn.scene,
      options: turn.options,
      npc: turn.npc || '',
      imagePrompt: turn.imagePrompt || E.fallbackImagePrompt(g, action && action.text),
      image: g.scene && g.scene.image ? g.scene.image : '',
      imageSource: g.scene && g.scene.imageSource ? g.scene.imageSource : ''
    };
    // после хода: сбрасываем бафы и тикаем перезарядку умения
    if (!isWorldBuild) E.tickCooldowns(g);
    State.storage.save(g);
    State.busy = false;
    renderGameTop();
    renderLog();
    renderSceneText(turn.scene, { typewriter: true });
    const npcEl = $('#scene-npc');
    if (turn.npc) { npcEl.textContent = '👤 ' + turn.npc; npcEl.hidden = false; }
    else npcEl.hidden = true;
    renderActions(turn.options, false);

    if (turn.offline) {
      notifyAfterDice('ИИ-мастер недоступен — ход ведёт локальный мастер', { kind: 'warn', timeout: 5200 });
    }
    if (notes && notes.length) {
      notes.forEach(n => notifyAfterDice(n.icon + ' ' + n.text, {
        kind: n.type === 'hp' && /−/.test(n.text) ? 'bad' : 'info', timeout: 3400
      }));
    }

    // мгновенный фон уже перекрашен, ИИ-картинка догружается
    paintBackdrop(g.scene.imagePrompt, turn.scene);
    loadSceneImage(g.scene.imagePrompt, action, false);
    if (g.over) setTimeout(showGameOver, 800);
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
    openModal({
      title: 'Герой пал',
      text: State.game.hero.name + ' прошёл ' + Math.max(1, State.game.turn) + ' ходов. Приключение останется в «Моих играх» — можно начать заново или выбрать другой мир.',
      icon: '💀',
      cancelLabel: null,
      actions: [
        { label: 'Начать заново', kind: 'primary', onClick: () => { closeModal(); restartSameScenario(); } },
        { label: 'К выбору игр', kind: 'ghost', onClick: () => { closeModal(); show('saves'); } }
      ]
    });
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
      worldConfig: old.worldConfig
    });
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
    const content = h('div', { class: 'hero-sheet' }, [
      h('div', { class: 'hero-sheet__row' }, [
        h('span', { class: 'hero-sheet__name', text: hh.icon + ' ' + hh.name }),
        h('span', { class: 'hero-sheet__arch', text: hh.className })
      ]),
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
      actions: [{ label: 'Скачать сохранение', kind: 'ghost', onClick: () => exportGame(g) }]
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
              text: item.over ? 'Новая попытка' : 'Продолжить',
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
    if (wasOver) {
      State.game = game;
      restartSameScenario();
      return;
    }
    openGame(game, false);
    toast('Игра загружена', { kind: 'good' });
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
  function openSettings() {
    const keyInput = h('input', {
      class: 'input', type: 'text', placeholder: 'ключ Pollinations (необязательно)',
      value: Settings.data.apiKey || API.getApiKey(), autocomplete: 'off',
      placeholder: 'ключ уже встроен в игру — можно заменить своим'
    });
    const content = h('div', { class: 'settings' }, [
      h('p', { class: 'muted small', text: 'Игра работает без ключей: ИИ-мастер — через сервер или Pollinations, картинки — гонка a0.dev и Pollinations, фон рисуется локально мгновенно.' }),
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
          onClick: () => { Settings.set({ muted: !Settings.data.muted }); closeModal(); openSettings(); }
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
        case 'reload-image': Sound.tap(); loadSceneImage(State.game && State.game.scene && State.game.scene.imagePrompt, null, false); break;
        case 'open-hero': openHeroSheet(); break;
        case 'random-name':
          $('#hero-name').value = randomName();
          State.draft.name = $('#hero-name').value;
          Sound.tap();
          break;
        case 'show-menu': show('menu'); break;
        case 'settings': openSettings(); break;
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
      if (ev.key === 'Escape') { if (!$('#modal').hidden) closeModal(); return; }
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
    Critters.mount();
    document.addEventListener('visibilitychange', () => {
      Critters.sync(document.body.dataset.screen === 'menu');
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
