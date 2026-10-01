/* Отдельный одиночный онлайн-режим: большой клеточный мир, квесты, бои и отношения. */
(function () {
  'use strict';

  const E = window.DTEngine;
  const API = window.DTapi;
  if (!E || !API) return;

  const $ = selector => document.querySelector(selector);
  const SAVE_KEY = 'dt2:open-world:campaign:v1';
  const MAP_W = 34, MAP_H = 24, VIEW_W = 13, VIEW_H = 9;
  const MAIN_QUESTS = 20;
  let worldMode = 'ai';
  let adventure = null;
  let pendingAdventure = null;
  let busy = false;

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function cleanText(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max || 180);
  }

  function setStatus(text, bad) {
    const node = $('#online-setup-status');
    if (!node) return;
    node.textContent = text || '';
    node.classList.toggle('is-error', !!bad);
  }

  function enterMode() {
    document.querySelectorAll('#app > .screen').forEach(screen => { screen.hidden = true; });
    const screen = $('#screen-online');
    if (!screen) return;
    screen.hidden = false;
    $('#online-cloud-save').hidden = true;
    document.body.dataset.screen = 'online';
    const stage = $('#menu-critters');
    if (stage && stage.__dtCritters) stage.__dtCritters.stop();
    setStatus('');
    if (adventure) { showAdventure(); return; }
    $('#online-setup').hidden = false;
    $('#online-play').hidden = true;
    $('#online-cloud-save').hidden = true;
    const saved = readLocal();
    const resume = $('#online-resume');
    if (saved && resume) {
      $('#online-resume-text').textContent = 'Найдена кампания «' + (saved.title || 'Открытый мир') + '» · ходов: ' + (saved.steps || 0) + '.';
      resume.hidden = false;
    } else if (resume) resume.hidden = true;
  }

  function exitMode() {
    const screen = $('#screen-online');
    if (screen) screen.hidden = true;
    document.querySelectorAll('#app > .screen').forEach(item => { item.hidden = item.id !== 'screen-menu'; });
    document.body.dataset.screen = 'menu';
    const stage = $('#menu-critters');
    if (stage && stage.__dtCritters) stage.__dtCritters.start();
  }

  function selectWorldMode(mode) {
    worldMode = mode === 'custom' ? 'custom' : 'ai';
    document.querySelectorAll('[data-online-world-mode]').forEach(button => {
      const active = button.dataset.onlineWorldMode === worldMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    const description = $('#online-world-description');
    if (description) description.placeholder = worldMode === 'custom'
      ? 'Опиши свой мир и желаемое приключение — ИИ развернёт это в большую кампанию'
      : 'Можно задать тему или оставить пустым — мастер придумает мир сам';
  }

  function readLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      return saved && saved.game && saved.map ? saved : null;
    } catch (err) { return null; }
  }

  function saveLocal() {
    if (!adventure) return;
    adventure.updatedAt = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(adventure)); } catch (err) { /* private mode/storage full */ }
  }

  function hashSeed(text) {
    let hash = 2166136261;
    const s = String(text || 'open-world');
    for (let i = 0; i < s.length; i++) { hash ^= s.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let a = seed >>> 0;
    return function () {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function fallbackQuestline(title, villain, goal) {
    const beats = [
      ['Сигнал на старом тракте', 'Найти источник странного сигнала у дороги', 'per', 'explore'],
      ['Долг поселения', 'Помочь жителям и узнать, чего они боятся', 'cha', 'social'],
      ['След под корнями', 'Проследить за знаками, ведущими в лес', 'agi', 'explore'],
      ['Страж каменных ворот', 'Победить дозорного на пути к руинам', 'str', 'combat'],
      ['Карта без края', 'Собрать недостающий фрагмент старой карты', 'int', 'explore'],
      ['Затонувший дозор', 'Отыскать союзника, пропавшего у воды', 'per', 'social'],
      ['Пепельный перевал', 'Преодолеть опасный горный переход', 'con', 'explore'],
      ['Охотники за печатью', 'Перехватить отряд, идущий по тому же следу', 'agi', 'combat'],
      ['Шёпот святилища', 'Раскрыть назначение древнего знака', 'wit', 'explore'],
      ['Союз на перепутье', 'Добиться поддержки одного из соседних поселений', 'cha', 'social'],
      ['Ночная засада', 'Отразить нападение и удержать тропу', 'str', 'combat'],
      ['Нить к источнику', 'Сверить улики и определить истинное направление', 'int', 'explore'],
      ['Последний обоз', 'Найти и вывести караван из опасной долины', 'con', 'social'],
      ['Башня ветров', 'Подняться к механизму, который меняет погоду', 'agi', 'explore'],
      ['Ключ хранителя', 'Одержать победу и забрать знак доступа', 'str', 'combat'],
      ['Голоса за стеной', 'Понять, кто управляет защитой крепости', 'wit', 'explore'],
      ['Перед штурмом', 'Собрать сведения и выбрать путь внутрь', 'per', 'social'],
      ['Внешний двор', 'Пробиться через последнюю линию стражи', 'str', 'combat'],
      ['Сердце глубин', 'Отключить источник силы, питающий угрозу', 'int', 'explore'],
      ['Последний бросок', 'Остановить ' + (villain || 'владыку разлома') + ' и решить судьбу мира', 'wit', 'combat']
    ];
    return beats.slice(0, MAIN_QUESTS).map((beat, index) => ({
      id: 'main-' + (index + 1), title: beat[0], objective: beat[1], stat: beat[2], kind: beat[3],
      chapter: 'Глава ' + (Math.floor(index / 5) + 1), location: (title || 'Этот мир') + ' · точка ' + (index + 1)
    }));
  }

  function normalizeBlueprint(raw, config) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const title = cleanText(source.title || config.gameName || 'Земли за Туманным хребтом', 70);
    const villain = cleanText(source.villain || source.antagonist || 'Хранитель разлома', 60);
    const rawQuests = Array.isArray(source.questline) ? source.questline
      : (Array.isArray(source.mainQuests) ? source.mainQuests : (Array.isArray(source.quests) ? source.quests : []));
    const fallback = fallbackQuestline(title, villain, config.goal);
    const quests = rawQuests.slice(0, MAIN_QUESTS).map((item, index) => {
      const base = fallback[index];
      const entry = typeof item === 'string' ? { title: item } : (item || {});
      const kindText = cleanText(entry.kind || entry.type || base.kind, 30).toLowerCase();
      const kind = /бой|combat|boss|fight|враг/.test(kindText) ? 'combat'
        : (/social|talk|dialog|люд|свидан/.test(kindText) ? 'social' : 'explore');
      const stat = E.STAT_IDS.indexOf(entry.stat) >= 0 ? entry.stat : base.stat;
      return {
        id: 'main-' + (index + 1),
        title: cleanText(entry.title || entry.name || base.title, 74),
        objective: cleanText(entry.objective || entry.goal || entry.summary || base.objective, 150),
        stat, kind,
        chapter: cleanText(entry.chapter || base.chapter, 40),
        location: cleanText(entry.location || base.location, 60)
      };
    });
    while (quests.length < MAIN_QUESTS) quests.push(fallback[quests.length]);
    const companionRaw = source.companion && typeof source.companion === 'object' ? source.companion : {};
    const age = Number(companionRaw.age);
    const companion = {
      name: cleanText(companionRaw.name || 'Мира', 40),
      age: Number.isFinite(age) ? Math.max(18, Math.min(99, Math.round(age))) : 24,
      role: cleanText(companionRaw.role || 'проводник из приграничного поселения', 72),
      gender: /^(male|муж|man)$/i.test(String(companionRaw.gender || '')) ? 'male' : 'female',
      description: cleanText(companionRaw.description || companionRaw.personality || 'Сдержанная, наблюдательная и верная своим обещаниям.', 160)
    };
    return {
      title,
      premise: cleanText(source.premise || source.world || source.description || config.extra || 'Большой край, где древняя магия проснулась под землёй.', 600),
      region: cleanText(source.region || source.regionName || 'Пограничные земли', 60),
      villain,
      goal: cleanText(source.goal || config.goal || 'Остановить угрозу и решить судьбу края', 120),
      quests,
      companion
    };
  }

  async function askBlueprint(config) {
    if (!API.askGameMaster) return null;
    const system = [
      'Ты проектируешь оригинальную одиночную приключенческую RPG с открытой клеточной картой.',
      'Придумай самобытный мир, не копируй названия, сюжет или персонажей существующих игр.',
      'Верни только валидный JSON без Markdown: title, premise, region, goal, villain, questline, companion.',
      'questline — ровно 20 последовательных главных заданий; у каждого поля title, objective, kind (explore/social/combat), stat (str/agi/con/int/per/wit/cha), chapter, location.',
      'Сделай задания разными: исследование, разговоры, поиск, опасные переходы, бои и четыре сильных столкновения.',
      'companion — один потенциальный взрослый романтический персонаж: name, age не меньше 21, gender male/female, role, description.',
      'Романтика добровольная, взаимная и необязательная. Интим возможен только после ясного согласия и описывается мягко, с затемнением кадра.'
    ].join(' ');
    const prompt = [
      'Режим: ' + (worldMode === 'custom' ? 'игрок задаёт мир, мастер развивает его' : 'мастер создаёт мир с нуля'),
      'Название/затравка: ' + (config.gameName || 'не задано'),
      'Описание игрока: ' + (config.extra || 'не задано'),
      'Цель: ' + (config.goal || 'придумай большую цель для кампании'),
      'Сделай карту пригодной для исследования пешком и свяжи все двадцать заданий в один сюжет с тайнами, союзниками, противником и финалом.'
    ].join('\n');
    try {
      const result = await API.askGameMaster([
        { role: 'system', content: system },
        { role: 'user', content: prompt }
      ], { kind: 'world', budgetMs: 20000 });
      if (!result || !result.ok) return null;
      return E.extractJsonObject(result.text) || null;
    } catch (err) { return null; }
  }

  async function askHeroProfile(config) {
    const fallback = E.defaultHeroProfile('Мастер собрал героя по законам мира.');
    if (!API.generateHeroProfile) return { profile: fallback, ai: false };
    const draft = {
      scenarioId: 'custom',
      worldConfig: Object.assign(E.emptyWorldConfig(), config)
    };
    try {
      const result = await API.generateHeroProfile(draft, { variant: E.rnd.seed() });
      if (result && result.ok && result.profile && result.profile.classes && result.profile.classes.length) {
        return { profile: result.profile, ai: true };
      }
    } catch (err) { /* локальный профиль оставляет режим играбельным */ }
    return { profile: fallback, ai: false };
  }

  function questCoordinates() {
    const points = [];
    for (let row = 0; row < 4; row++) {
      const y = 3 + row * 5;
      const xs = [5, 11, 17, 23, 29];
      if (row % 2) xs.reverse();
      xs.forEach(x => points.push({ x, y }));
    }
    return points;
  }

  function createMap(seed, quests) {
    const random = seededRandom(seed);
    const terrain = Array.from({ length: MAP_H }, () => Array.from({ length: MAP_W }, () => {
      const n = random();
      if (n < 0.045) return 'water';
      if (n < 0.105) return 'mountain';
      if (n < 0.34) return 'forest';
      return 'grass';
    }));
    const start = { x: 2, y: 2 };
    const qcoords = questCoordinates();
    const carve = (from, to) => {
      let x = from.x, y = from.y;
      while (x !== to.x) { terrain[y][x] = 'road'; x += x < to.x ? 1 : -1; }
      while (y !== to.y) { terrain[y][x] = 'road'; y += y < to.y ? 1 : -1; }
      terrain[to.y][to.x] = 'road';
    };
    let last = start;
    qcoords.forEach(point => { carve(last, point); last = point; });
    for (let y = start.y - 1; y <= start.y + 1; y++) for (let x = start.x - 1; x <= start.x + 1; x++) {
      if (terrain[y] && terrain[y][x]) terrain[y][x] = 'grass';
    }
    const markers = [{ id: 'town-start', type: 'town', x: start.x, y: start.y, title: 'Поселение у тракта' }];
    qcoords.forEach((point, index) => markers.push({
      id: 'quest-point-' + index, type: 'quest', x: point.x, y: point.y,
      index, title: quests[index] && quests[index].location || ('Точка ' + (index + 1))
    }));
    const sideCoords = [{ x: 7, y: 6 }, { x: 18, y: 6 }, { x: 26, y: 11 }, { x: 8, y: 17 }, { x: 21, y: 21 }, { x: 31, y: 15 }];
    sideCoords.forEach((point, index) => {
      if (markers.some(m => m.x === point.x && m.y === point.y)) return;
      terrain[point.y][point.x] = terrain[point.y][point.x] === 'water' || terrain[point.y][point.x] === 'mountain' ? 'grass' : terrain[point.y][point.x];
      markers.push({ id: 'side-' + index, type: 'side', x: point.x, y: point.y, index, title: ['Сломанный обоз', 'Забытая часовня', 'Письмо без адреса', 'Следы на болоте', 'Старый маяк', 'Колодец шёпота'][index] });
    });
    const companionPoint = { x: 3, y: 6 };
    carve(start, companionPoint);
    markers.push({ id: 'companion-meet', type: 'companion', x: companionPoint.x, y: companionPoint.y, title: 'Полевой лагерь' });
    const occupied = new Set(markers.map(m => m.x + ',' + m.y));
    const enemies = [];
    let tries = 0;
    while (enemies.length < 18 && tries++ < 1200) {
      const x = 1 + Math.floor(random() * (MAP_W - 2));
      const y = 1 + Math.floor(random() * (MAP_H - 2));
      const key = x + ',' + y;
      if (occupied.has(key) || Math.abs(x - start.x) + Math.abs(y - start.y) < 4) continue;
      if (terrain[y][x] === 'water' || terrain[y][x] === 'mountain') continue;
      occupied.add(key);
      markers.push({ id: 'enemy-' + enemies.length, type: 'enemy', x, y, title: 'Незнакомый противник' });
      enemies.push(key);
    }
    const shrineCoords = [{ x: 15, y: 5 }, { x: 28, y: 18 }, { x: 6, y: 13 }];
    shrineCoords.forEach((point, index) => {
      if (markers.some(m => m.x === point.x && m.y === point.y)) return;
      terrain[point.y][point.x] = 'road';
      markers.push({ id: 'shrine-' + index, type: 'shrine', x: point.x, y: point.y, title: ['Источник', 'Камень памяти', 'Укрытие путника'][index] });
    });
    return { width: MAP_W, height: MAP_H, terrain, markers, start };
  }

  function buildAdventure(config, blueprint, profileResult, name, selection) {
    const book = normalizeBlueprint(blueprint, config);
    const profile = profileResult.profile || E.defaultHeroProfile();
    const defaults = E.defaultHeroProfile();
    const classes = Array.isArray(profile.classes) && profile.classes.length ? profile.classes : defaults.classes;
    const races = Array.isArray(profile.races) && profile.races.length ? profile.races : defaults.races;
    const origins = Array.isArray(profile.origins) && profile.origins.length ? profile.origins : defaults.origins;
    const picked = selection || {};
    const cls = classes.find(option => option.id === picked.classId) || classes[0];
    const race = races.find(option => option.id === picked.raceId) || races[0];
    const origin = origins.find(option => option.id === picked.originId) || origins[0];
    const game = E.createGame({
      scenarioId: 'custom', heroName: name || 'Странник',
      classId: cls.id, raceId: race.id, originId: origin.id,
      heroProfile: profile, worldConfig: Object.assign(E.emptyWorldConfig(), config)
    });
    game.title = book.title;
    game.scenarioTitle = book.title;
    game.goal = book.goal;
    game.turn = 0;
    game.hero.age = 24;
    game.onlineAdventure = true;
    game.intro = { world: book.premise, plan: book.quests.slice(0, 5).map(q => q.title) };
    const map = createMap(hashSeed(game.id + book.title), book.quests);
    return {
      version: 1,
      id: 'open-' + game.id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      title: book.title,
      premise: book.premise,
      region: book.region,
      villain: book.villain,
      worldMode,
      source: (blueprint ? 'ai' : 'local') + (profileResult.ai ? '+ai-hero' : '+local-hero'),
      game,
      heroProfile: profile,
      questline: book.quests,
      mainIndex: 0,
      sideCompleted: [],
      defeatedEnemies: [],
      map,
      player: { x: map.start.x, y: map.start.y },
      previous: { x: map.start.x, y: map.start.y },
      visited: [map.start.x + ',' + map.start.y],
      steps: 0,
      coins: 0,
      xp: 0,
      story: [{ title: 'Начало пути', text: book.premise, at: Date.now() }],
      interaction: null,
      battle: null,
      isComplete: false,
      companion: Object.assign(book.companion, { affinity: 0, mutualInterest: false, friendsOnly: false, intimacySceneSeen: false }),
      gameSettings: { worldDescription: config.extra || '', goal: config.goal || '' }
    };
  }

  function choiceOptions(profile, key, defaults) {
    const list = profile && Array.isArray(profile[key]) ? profile[key].filter(item => item && item.id) : [];
    return list.length ? list : defaults;
  }

  function renderHeroChoicePreview() {
    if (!pendingAdventure) return;
    const profile = pendingAdventure.profileResult.profile || E.defaultHeroProfile();
    const defaults = E.defaultHeroProfile();
    const classes = choiceOptions(profile, 'classes', defaults.classes);
    const races = choiceOptions(profile, 'races', defaults.races);
    const origins = choiceOptions(profile, 'origins', defaults.origins);
    const classId = $('#online-hero-class').value;
    const raceId = $('#online-hero-race').value;
    const originId = $('#online-hero-origin').value;
    const cls = classes.find(option => option.id === classId) || classes[0];
    const race = races.find(option => option.id === raceId) || races[0];
    const origin = origins.find(option => option.id === originId) || origins[0];
    const stats = E.statsFor(cls, race, origin);
    const hp = E.maxHpFor({ classId: cls.id, cls, stats });
    const statText = E.STATS.map(stat => stat.short + ' ' + stats[stat.id]).join(' · ');
    $('#online-hero-preview').textContent = 'Характеристики: ' + statText + ' · ❤️ ' + hp + ' здоровья. ' +
      [cls.hint || cls.blurb, race.hint || race.trait, origin.hint || origin.hook].filter(Boolean).join(' ');
  }

  function renderHeroPicker(profileResult) {
    const profile = profileResult.profile || E.defaultHeroProfile();
    const defaults = E.defaultHeroProfile();
    const groups = [
      { id: 'online-hero-class', key: 'classes', label: 'Класс / путь', fallback: defaults.classes, visible: true },
      { id: 'online-hero-race', key: 'races', label: profile.raceLabel || 'Раса / вид', fallback: defaults.races, visible: profile.showRace !== false },
      { id: 'online-hero-origin', key: 'origins', label: profile.originLabel || 'Происхождение', fallback: defaults.origins, visible: profile.showOrigin !== false }
    ];
    groups.forEach(group => {
      const select = $('#' + group.id);
      const field = select.closest('.online-hero-choice');
      const options = choiceOptions(profile, group.key, group.fallback);
      select.replaceChildren();
      options.forEach(item => {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.title + (item.hint ? ' — ' + item.hint : (item.blurb || item.trait || item.hook ? ' — ' + (item.blurb || item.trait || item.hook) : ''));
        select.appendChild(option);
      });
      field.hidden = !group.visible;
      select.setAttribute('aria-label', group.label);
    });
    $('#online-hero-picker').hidden = false;
    renderHeroChoicePreview();
  }

  function confirmHeroChoice() {
    if (!pendingAdventure || busy) return;
    const pending = pendingAdventure;
    pendingAdventure = null;
    worldMode = pending.mode;
    const selection = {
      classId: $('#online-hero-class').value,
      raceId: $('#online-hero-race').value,
      originId: $('#online-hero-origin').value
    };
    adventure = buildAdventure(pending.config, pending.blueprint, pending.profileResult, pending.heroName, selection);
    $('#online-hero-picker').hidden = true;
    $('#online-start').hidden = false;
    document.querySelectorAll('[data-online-world-mode]').forEach(button => { button.disabled = false; });
    saveLocal();
    setStatus(pending.blueprint
      ? (pending.profileResult.ai ? 'Мир и варианты героя подготовлены ИИ. Кампания сохранена на устройстве.' : 'Мир создан ИИ; варианты героя собраны локально, потому что канал профиля не ответил.')
      : 'Канал мира не ответил — собрал играбельную основу локально. Кампания сохранена на устройстве.', !pending.blueprint);
    showAdventure();
    addStory('Первый шаг', 'Ты входишь в ' + adventure.region + '. На карте отмечен путь из двадцати главных заданий; исследуй ответвления и решай, кому доверять.', true);
  }

  function returnToWorldSetup() {
    pendingAdventure = null;
    $('#online-hero-picker').hidden = true;
    $('#online-start').hidden = false;
    document.querySelectorAll('[data-online-world-mode]').forEach(button => { button.disabled = false; });
    setStatus('Настройки мира можно изменить — затем создай новый набор героя.');
  }

  async function startNewAdventure() {
    if (busy) return;
    const inputTitle = cleanText($('#online-world-title').value, 80);
    const description = cleanText($('#online-world-description').value, 900);
    const heroName = cleanText($('#online-hero-name').value, 24) || 'Странник';
    if (worldMode === 'custom' && !description && !inputTitle) {
      setStatus('Впиши хотя бы название или пару строк о своём мире.', true);
      return;
    }
    const config = Object.assign(E.emptyWorldConfig(), {
      gameName: inputTitle || 'Открытый мир',
      genre: 'Приключенческое фэнтези',
      tone: 'Исследование, тайна, дружба и опасность',
      place: 'приграничная область большого мира',
      goal: 'раскрыть угрозу, пройти главную линию и решить судьбу края',
      extra: description || 'Создай оригинальный фэнтезийный мир с несколькими регионами, тайнами, древними местами и угрозой, которая раскрывается постепенно.'
    });
    busy = true;
    $('#online-start').disabled = true;
    setStatus('Мастер придумывает мир и длинную сюжетную линию…');
    const fakeGame = { scenarioId: 'custom', worldConfig: config };
    const [blueprint, profileResult] = await Promise.all([
      askBlueprint(config),
      askHeroProfile(fakeGame.worldConfig)
    ]);
    pendingAdventure = { config, blueprint, profileResult, heroName, mode: worldMode };
    busy = false;
    $('#online-start').disabled = false;
    $('#online-start').hidden = true;
    document.querySelectorAll('[data-online-world-mode]').forEach(button => { button.disabled = true; });
    renderHeroPicker(profileResult);
    setStatus(blueprint
      ? 'Мир и сюжет готовы. Выбери один из вариантов героя от мастера ИИ.'
      : 'Мастер мира не ответил — подготовлена локальная карта. Выбери героя и начни приключение.', !blueprint);
  }

  function showAdventure() {
    if (!adventure) return;
    $('#online-setup').hidden = true;
    $('#online-play').hidden = false;
    $('#online-cloud-save').hidden = false;
    renderAll();
    if (adventure.companion && adventure.companion.mutualInterest && !adventure.companion.friendsOnly && !adventure.companion.intimacySceneSeen) renderRomanceOffer();
    saveLocal();
  }

  function resumeLocalAdventure() {
    const saved = readLocal();
    if (!saved) { setStatus('Локальной кампании пока нет.', true); return; }
    adventure = saved;
    try { adventure.game = E.migrate(adventure.game); } catch (err) { /* сохраняем восстановленную запись */ }
    if (!adventure.companion) adventure.companion = { name: 'Мира', age: 24, role: 'проводник', gender: 'female', description: '', affinity: 0, mutualInterest: false, friendsOnly: false };
    showAdventure();
  }

  function loadCloudAdventure() {
    const code = cleanText($('#online-cloud-input').value, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4) { setStatus('Введи код облачного сохранения.', true); return; }
    setStatus('Ищем кампанию в облаке…');
    API.cloudGet(code).then(result => {
      const cloud = result && result.data;
      const loaded = cloud && (cloud.onlineAdventure || (cloud.data && cloud.data.onlineAdventure));
      if (!result || !result.ok || !loaded || !loaded.game || !loaded.map) {
        setStatus('Не нашли открытую кампанию по этому коду.', true);
        return;
      }
      adventure = loaded;
      try { adventure.game = E.migrate(adventure.game); } catch (err) { /* оставляем импортированный сейв */ }
      saveLocal();
      setStatus('Облачная кампания загружена.');
      showAdventure();
    }).catch(() => setStatus('Сервер сохранений недоступен.', true));
  }

  function saveCloudAdventure() {
    if (!adventure) return;
    const button = $('#online-save-button');
    if (button) button.disabled = true;
    const resultBox = $('#online-cloud-result');
    resultBox.hidden = false;
    resultBox.textContent = 'Отправляем кампанию в облако…';
    const payload = {
      data: { onlineAdventure: adventure },
      settings: null,
      meta: { title: adventure.title, hero: adventure.game.hero.name, turn: adventure.steps }
    };
    API.cloudPut(payload).then(result => {
      if (!result || !result.ok) {
        resultBox.textContent = 'Облако пока недоступно. Локальная копия сохранена.';
        return;
      }
      resultBox.replaceChildren();
      resultBox.appendChild(el('span', 'online-cloud-result__label', 'Код для продолжения на другом устройстве'));
      resultBox.appendChild(el('strong', 'online-cloud-code', result.code));
      const copy = el('button', 'btn btn--ghost btn--sm', 'Скопировать код');
      copy.type = 'button';
      copy.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(result.code); copy.textContent = 'Код скопирован'; }
        catch (err) { copy.textContent = 'Код: ' + result.code; }
      });
      resultBox.appendChild(copy);
    }).catch(() => { resultBox.textContent = 'Не удалось связаться с облаком; локальная копия сохранена.'; })
      .finally(() => { if (button) button.disabled = false; });
  }

  function markerAt(x, y) {
    return adventure.map.markers.find(item => item.x === x && item.y === y) || null;
  }

  function isBlocked(x, y) {
    if (x < 0 || y < 0 || x >= adventure.map.width || y >= adventure.map.height) return true;
    const terrain = adventure.map.terrain[y][x];
    return terrain === 'water' || terrain === 'mountain';
  }

  function addStory(title, text, fromAI) {
    if (!adventure) return;
    adventure.story.unshift({ title: cleanText(title, 80), text: cleanText(text, 520), at: Date.now(), fromAI: !!fromAI });
    adventure.story = adventure.story.slice(0, 18);
    renderStory();
    saveLocal();
  }

  function askNarration(title, prompt, fallback) {
    if (!adventure) return;
    const entry = { title: cleanText(title, 80), text: fallback, at: Date.now(), pending: true };
    adventure.story.unshift(entry);
    adventure.story = adventure.story.slice(0, 18);
    renderStory();
    saveLocal();
    const campaignId = adventure.id;
    API.askGameMaster([
      { role: 'system', content: 'Ты мастер оригинальной приключенческой RPG. Пиши по-русски, 2–4 выразительных предложения, конкретно и без повторов. Не меняй результаты бросков и сохранённые факты. Для романтических сцен все участники совершеннолетние и согласны; интим описывай только намёком с затемнением, без графичных деталей.' },
      { role: 'user', content: prompt }
    ], { kind: 'turn', budgetMs: 9000 }).then(result => {
      if (!adventure || adventure.id !== campaignId || !result || !result.ok) return;
      const parsed = E.extractJsonObject(result.text);
      const text = cleanText(parsed && (parsed.scene || parsed.text || parsed.narrative) || result.text, 520);
      if (text) entry.text = text;
      entry.pending = false;
      renderStory();
      saveLocal();
    }).catch(() => { entry.pending = false; });
  }

  function renderStory() {
    const host = $('#online-story-log');
    if (!host || !adventure) return;
    host.replaceChildren();
    adventure.story.slice(0, 5).forEach(item => {
      const card = el('article', 'online-story-entry');
      const title = el('strong', '', item.title || 'Событие');
      const text = el('p', '', item.text || '');
      card.append(title, text);
      if (item.pending) card.appendChild(el('small', 'online-pending', 'Мастер дописывает сцену…'));
      host.appendChild(card);
    });
  }

  function currentQuest() {
    return adventure && adventure.questline[adventure.mainIndex] || null;
  }

  function questIsCombat(quest, index) {
    return (quest && quest.kind === 'combat') || index === MAIN_QUESTS - 1 || ((index + 1) % 5 === 0);
  }

  function renderQuestline() {
    const list = $('#online-questline');
    if (!list || !adventure) return;
    list.replaceChildren();
    adventure.questline.forEach((quest, index) => {
      const li = el('li', index < adventure.mainIndex ? 'is-complete' : (index === adventure.mainIndex ? 'is-current' : 'is-locked'));
      const marker = index < adventure.mainIndex ? '✓ ' : (index === adventure.mainIndex ? '▸ ' : '· ');
      li.textContent = marker + quest.title;
      list.appendChild(li);
    });
    $('#online-quest-count').textContent = Math.min(adventure.mainIndex + 1, adventure.questline.length) + '/' + adventure.questline.length;
    const quest = currentQuest();
    const card = $('#online-current-quest');
    card.replaceChildren();
    card.appendChild(el('span', 'online-current-quest__eyebrow', adventure.isComplete ? 'Кампания завершена' : 'Главная цель · ' + (quest ? quest.chapter : 'финал')));
    card.appendChild(el('strong', 'online-current-quest__title', adventure.isComplete ? 'Судьба края решена' : (quest && quest.title || 'Свободное исследование')));
    card.appendChild(el('span', 'online-current-quest__objective', adventure.isComplete ? 'Можно остаться в мире, исследовать карту и завершить побочные истории.' : (quest && quest.objective || 'Исследуй край и найди следующую зацепку.')));
    if (quest) card.appendChild(el('span', 'online-current-quest__where', quest.location));
  }

  function renderHud() {
    const game = adventure.game, hero = game.hero;
    $('#online-hero-title').textContent = hero.name;
    const statLine = E.STATS.map(stat => stat.short + ' ' + hero.stats[stat.id]).join(' · ');
    $('#online-hero-meta').textContent = [hero.className, hero.raceName, hero.originName, statLine].filter(Boolean).join(' · ');
    $('#online-hero-icon').textContent = hero.icon || '🧭';
    $('#online-world-title-play').textContent = adventure.title;
    $('#online-world-subtitle').textContent = adventure.region + ' · ' + adventure.steps + ' шагов · ' + adventure.coins + ' монет';
    $('#online-hp-label').textContent = '❤️ ' + hero.hp + '/' + hero.maxHp;
    $('#online-hp-fill').style.width = Math.max(0, Math.min(100, hero.hp / Math.max(1, hero.maxHp) * 100)) + '%';
    $('#online-coordinates').textContent = 'x ' + (adventure.player.x + 1) + ' · y ' + (adventure.player.y + 1);
  }

  function visibleMarker(marker, x, y) {
    if (!marker) return null;
    const distance = Math.abs(adventure.player.x - x) + Math.abs(adventure.player.y - y);
    if (marker.type === 'quest') {
      if (marker.index < adventure.mainIndex) return { icon: '✓', className: 'done' };
      if (marker.index === adventure.mainIndex) return { icon: '📍', className: 'quest' };
      return distance <= 5 ? { icon: '◆', className: 'future' } : null;
    }
    if (marker.type === 'enemy') {
      return adventure.defeatedEnemies.includes(marker.id) ? null : { icon: '⚔️', className: 'enemy' };
    }
    if (marker.type === 'side') return adventure.sideCompleted.includes(marker.id) ? { icon: '✓', className: 'done' } : { icon: '❔', className: 'side' };
    if (marker.type === 'companion') return { icon: '🧑', className: 'companion' };
    if (marker.type === 'town') return { icon: '🏘️', className: 'town' };
    if (marker.type === 'shrine') return { icon: '✨', className: 'shrine' };
    return null;
  }

  function terrainIcon(terrain) {
    return ({ grass: '·', forest: '♣', road: '▫', water: '≈', mountain: '▲' })[terrain] || '·';
  }

  function renderMap() {
    const grid = $('#online-map');
    if (!grid || !adventure) return;
    grid.replaceChildren();
    grid.style.gridTemplateColumns = 'repeat(' + VIEW_W + ', minmax(0, 1fr))';
    const map = adventure.map;
    const x0 = Math.max(0, Math.min(map.width - VIEW_W, adventure.player.x - Math.floor(VIEW_W / 2)));
    const y0 = Math.max(0, Math.min(map.height - VIEW_H, adventure.player.y - Math.floor(VIEW_H / 2)));
    const visited = new Set(adventure.visited || []);
    for (let vy = 0; vy < VIEW_H; vy++) {
      for (let vx = 0; vx < VIEW_W; vx++) {
        const x = x0 + vx, y = y0 + vy;
        const terrain = map.terrain[y][x];
        const key = x + ',' + y;
        const distance = Math.abs(adventure.player.x - x) + Math.abs(adventure.player.y - y);
        const visible = visited.has(key) || distance <= 3;
        const tile = el('button', 'online-tile online-tile--' + terrain);
        tile.type = 'button';
        tile.setAttribute('role', 'gridcell');
        tile.setAttribute('aria-label', visible ? (terrain + ', ' + x + ':' + y) : 'Неизведанная клетка');
        if (!visible) {
          tile.classList.add('is-fog');
          tile.textContent = '·';
          tile.disabled = true;
        } else if (x === adventure.player.x && y === adventure.player.y) {
          tile.classList.add('is-player');
          tile.textContent = '🧝';
          tile.title = 'Ты здесь';
        } else {
          const marker = markerAt(x, y);
          const shown = visibleMarker(marker, x, y);
          if (shown) {
            tile.classList.add('online-tile--' + shown.className);
            tile.textContent = shown.icon;
            tile.title = marker.title || terrain;
          } else {
            tile.textContent = terrainIcon(terrain);
            tile.title = terrain;
          }
          const deltaX = x - adventure.player.x, deltaY = y - adventure.player.y;
          if (Math.abs(deltaX) + Math.abs(deltaY) === 1 && !adventure.battle) {
            tile.dataset.stepX = String(deltaX);
            tile.dataset.stepY = String(deltaY);
          } else tile.disabled = true;
        }
        grid.appendChild(tile);
      }
    }
  }

  function renderCompanion() {
    const host = $('#online-companion-card');
    if (!host || !adventure || !adventure.companion) return;
    const companion = adventure.companion;
    host.replaceChildren();
    host.appendChild(el('div', 'online-section-title', 'Спутник и отношения'));
    host.appendChild(el('strong', 'online-companion-name', '🧑 ' + companion.name + ' · ' + companion.age + '+'));
    host.appendChild(el('p', 'muted small', companion.role + '. ' + companion.description));
    const pct = Math.max(0, Math.min(100, companion.affinity || 0));
    host.appendChild(el('div', 'online-affinity-label', 'Доверие и взаимный интерес · ' + pct + '%'));
    const meter = el('div', 'online-affinity-track');
    const fill = el('i', ''); fill.style.width = pct + '%'; meter.appendChild(fill); host.appendChild(meter);
    if (companion.mutualInterest) host.appendChild(el('small', 'online-consent-note', 'Между героями есть взаимный интерес; любые близкие сцены остаются выбором игрока.'));
  }

  function renderAll() {
    if (!adventure) return;
    renderHud();
    renderMap();
    renderQuestline();
    renderCompanion();
    renderStory();
    renderEvent();
    renderBattle();
    saveLocal();
  }

  function move(dx, dy) {
    if (!adventure || adventure.battle || adventure.interaction || adventure.isComplete && adventure.mainIndex < adventure.questline.length) return;
    const x = adventure.player.x + dx, y = adventure.player.y + dy;
    if (isBlocked(x, y)) {
      addStory('Путь закрыт', 'Вода или скальный склон не дают пройти. Попробуй обойти препятствие.', false);
      return;
    }
    adventure.previous = { x: adventure.player.x, y: adventure.player.y };
    adventure.player = { x, y };
    adventure.steps++;
    const visit = x + ',' + y;
    if (!adventure.visited.includes(visit)) adventure.visited.push(visit);
    const marker = markerAt(x, y);
    renderAll();
    if (marker) triggerMarker(marker);
    else if (adventure.steps % 12 === 0) addStory('Путь продолжается', 'Ветер приносит новые запахи и далёкий звон. На карте проявляются неизведанные клетки.', false);
    saveLocal();
  }

  function button(label, action, className) {
    const node = el('button', className || 'btn btn--ghost btn--sm', label);
    node.type = 'button';
    node.dataset.eventAction = action;
    return node;
  }

  function setInteraction(type, data, title, text, actions) {
    adventure.interaction = { type, data: data || {} };
    const host = $('#online-event');
    host.replaceChildren();
    host.hidden = false;
    host.appendChild(el('div', 'online-section-title', title));
    host.appendChild(el('p', '', text));
    const actionsWrap = el('div', 'online-event-actions');
    actions.forEach(action => actionsWrap.appendChild(button(action.label, action.action, action.kind === 'primary' ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm')));
    host.appendChild(actionsWrap);
    renderMap();
    saveLocal();
  }

  function clearInteraction() {
    if (!adventure) return;
    adventure.interaction = null;
    $('#online-event').hidden = true;
    $('#online-event').replaceChildren();
    renderMap();
    saveLocal();
  }

  function triggerMarker(marker) {
    if (!adventure) return;
    if (marker.type === 'quest') {
      if (marker.index < adventure.mainIndex) return;
      if (marker.index > adventure.mainIndex) {
        setInteraction('locked', { index: marker.index }, 'Пока рано', 'Этот знак относится к будущей главе. Сначала раскрой текущую зацепку.', [{ label: 'Понятно', action: 'close' }]);
        return;
      }
      const quest = adventure.questline[marker.index];
      addStory(quest.title, quest.objective, false);
      if (questIsCombat(quest, marker.index)) {
        setInteraction('main-combat', { index: marker.index }, quest.title, quest.objective + ' Впереди серьёзный противник.', [
          { label: '⚔️ Начать пошаговый бой', action: 'start-main-battle', kind: 'primary' },
          { label: 'Отойти и подготовиться', action: 'close' }
        ]);
      } else {
        setInteraction('main-check', { index: marker.index }, quest.title, quest.objective + ' Сделай проверку характеристики «' + (E.statById(quest.stat).name) + '».', [
          { label: '🎲 Выполнить задачу', action: 'resolve-main', kind: 'primary' },
          { label: 'Осмотреться ещё', action: 'close' }
        ]);
      }
    } else if (marker.type === 'enemy' && !adventure.defeatedEnemies.includes(marker.id)) {
      setInteraction('random-combat', { markerId: marker.id }, 'Засада!', 'На пути появляется противник. Сначала выбери, вступать ли в бой.', [
        { label: '⚔️ Принять бой', action: 'start-random-battle', kind: 'primary' },
        { label: 'Отступить на шаг', action: 'retreat' }
      ]);
    } else if (marker.type === 'side' && !adventure.sideCompleted.includes(marker.id)) {
      setInteraction('side', { markerId: marker.id }, marker.title, 'Побочная история может принести припасы и монеты. Проверь удачу и подходящую характеристику.', [
        { label: '🔎 Помочь и разобраться', action: 'resolve-side', kind: 'primary' },
        { label: 'Вернуться на тропу', action: 'close' }
      ]);
    } else if (marker.type === 'companion') {
      const companion = adventure.companion;
      setInteraction('companion', {}, 'Встреча у полевого лагеря', companion.name + ', ' + companion.age + ' лет, ' + companion.role + '. ' + companion.description + ' Отношения необязательны: можно остаться друзьями.', [
        { label: 'Поговорить по душам', action: 'companion-talk', kind: 'primary' },
        { label: 'Мягко пофлиртовать', action: 'companion-flirt' },
        { label: 'Остаться друзьями', action: 'companion-friends' },
        { label: 'Пока попрощаться', action: 'close' }
      ]);
    } else if (marker.type === 'shrine') {
      const hero = adventure.game.hero;
      const before = hero.hp;
      hero.hp = Math.min(hero.maxHp, hero.hp + 2);
      addStory(marker.title, before < hero.hp ? 'Укрытие возвращает ' + (hero.hp - before) + ' здоровья.' : 'Ты находишь тихое место и переводишь дыхание.');
      renderAll();
    } else if (marker.type === 'town') {
      addStory('Поселение', 'Путники обсуждают слухи о ' + adventure.villain + '. Дорога дальше открыта.');
    }
  }

  function rollCheck(stat, dc) {
    const roll = E.rollD20();
    const bonus = Number(adventure.game.hero.stats[stat]) || 0;
    return { roll, bonus, total: roll + bonus, dc, success: roll === 20 || (roll !== 1 && roll + bonus >= dc) };
  }

  function resolveMainQuest() {
    const index = adventure.interaction && adventure.interaction.data.index;
    const quest = adventure.questline[index];
    if (!quest) return;
    const dc = Math.min(19, 11 + Math.floor(index / 4));
    const check = rollCheck(quest.stat, dc);
    clearInteraction();
    if (check.success) {
      addStory('Успех · d20=' + check.roll + ' +' + check.bonus + ' = ' + check.total,
        check.roll === 20 ? 'Критический успех! Ты справляешься блестяще и находишь дополнительную зацепку.' : 'Проверка пройдена. Ты выполнил задачу: ' + quest.objective);
      completeMainQuest(index, quest);
      askNarration(quest.title, 'Опиши коротко последствия успеха героя в главе «' + quest.title + '». Цель: ' + quest.objective + '. Результат броска d20=' + check.roll + ', итог ' + check.total + ' против сложности ' + dc + '. Не меняй его.', 'Ты преодолеваешь препятствие и находишь следующий след.');
    } else {
      const cost = check.roll === 1 ? 2 : 1;
      adventure.game.hero.hp = Math.max(1, adventure.game.hero.hp - cost);
      addStory('Проверка · d20=' + check.roll + ' +' + check.bonus + ' = ' + check.total,
        'Пока не получилось. Теряешь ' + cost + ' здоровья, но зацепка остаётся — можно попробовать ещё раз или укрепиться.');
      adventure.interaction = null;
    }
    renderAll();
  }

  function completeMainQuest(index, quest) {
    if (index !== adventure.mainIndex) return;
    adventure.mainIndex++;
    adventure.xp += 10 + index;
    adventure.coins += 4 + Math.floor(index / 2);
    if (adventure.mainIndex >= adventure.questline.length) {
      adventure.isComplete = true;
      addStory('Финал · ' + adventure.title, 'Ты остановил ' + adventure.villain + ' и изменил судьбу ' + adventure.region + '. Мир остаётся открытым: можно завершить побочные задания и исследовать карту.');
    }
    renderQuestline();
    saveLocal();
  }

  function resolveSideQuest() {
    const markerId = adventure.interaction && adventure.interaction.data.markerId;
    const marker = adventure.map.markers.find(point => point.id === markerId);
    if (!marker) return;
    const stat = marker.index % 2 ? 'per' : 'cha';
    const dc = 10 + marker.index % 5;
    const check = rollCheck(stat, dc);
    clearInteraction();
    if (check.success) {
      adventure.sideCompleted.push(markerId);
      adventure.coins += 6;
      adventure.game.hero.supplies = Math.min(E.SUPPLIES_MAX, adventure.game.hero.supplies + 1);
      addStory('Побочная история завершена', marker.title + ': проверка d20=' + check.roll + ' +' + check.bonus + ' = ' + check.total + '. Получено 6 монет и один припас.');
      askNarration(marker.title, 'Коротко опиши, как герой помог в побочной истории «' + marker.title + '». Успешный бросок d20=' + check.roll + '.', 'Люди благодарят тебя и делятся припасами.');
    } else {
      adventure.game.hero.hp = Math.max(1, adventure.game.hero.hp - 1);
      addStory('Неудача · d20=' + check.roll, 'Задача пока не решена. Ты теряешь 1 здоровье, но можешь вернуться позже.');
    }
    renderAll();
  }

  function companionCheck(kind) {
    const companion = adventure.companion;
    if (companion.friendsOnly && kind !== 'talk') {
      addStory('Личные границы', companion.name + ' просит оставить отношения дружескими. Ты принимаешь ответ.');
      clearInteraction(); renderAll(); return;
    }
    const dc = kind === 'flirt' ? 15 : 12;
    const check = rollCheck('cha', dc);
    clearInteraction();
    if (check.success) {
      companion.affinity = Math.min(100, companion.affinity + (kind === 'flirt' ? 22 : 16));
      if (companion.affinity >= 55 && kind === 'flirt') companion.mutualInterest = true;
      const response = companion.mutualInterest
        ? 'Между вами появляется взаимный интерес. ' + companion.name + ' ясно даёт понять, что тоже хочет продолжить сближение.'
        : companion.name + ' улыбается и делится личной историей. Доверие становится крепче.';
      addStory('Связь крепнет · d20=' + check.roll + ' +' + check.bonus, response);
      if (companion.mutualInterest) renderRomanceOffer();
    } else {
      addStory('Разговор не сложился · d20=' + check.roll, companion.name + ' мягко меняет тему. Ты уважаешь её/его ответ — дружба остаётся возможной.');
    }
    renderCompanion();
    renderAll();
  }

  function renderRomanceOffer() {
    const host = $('#online-romance');
    if (!host || !adventure || !adventure.companion.mutualInterest) return;
    host.hidden = false;
    host.replaceChildren();
    host.appendChild(el('div', 'online-section-title', 'Любовная линия · взаимный интерес'));
    host.appendChild(el('p', '', 'Вы оба совершеннолетние. ' + adventure.companion.name + ' явно согласен/согласна провести с тобой вечер; интимная сцена появится только если ты сам выберешь её.'));
    const actions = el('div', 'online-event-actions');
    actions.appendChild(button('🌙 Предложить уединиться', 'romance-ask', 'btn btn--primary btn--sm'));
    actions.appendChild(button('💛 Оставить вечер романтичным', 'romance-soft', 'btn btn--ghost btn--sm'));
    actions.appendChild(button('Остаться друзьями', 'companion-friends', 'btn btn--ghost btn--sm'));
    host.appendChild(actions);
  }

  function renderRomanceConfirm() {
    const host = $('#online-romance');
    host.hidden = false;
    host.replaceChildren();
    host.appendChild(el('div', 'online-section-title', 'Взаимное согласие'));
    host.appendChild(el('p', '', 'Ты и ' + adventure.companion.name + ' выбираете провести ночь вместе. Оба взрослые и согласны. Сцена будет мягко затемнена — без графичных подробностей.'));
    const actions = el('div', 'online-event-actions');
    actions.appendChild(button('Да, затемнить сцену', 'romance-confirm', 'btn btn--primary btn--sm'));
    actions.appendChild(button('Нет, только разговор и объятия', 'romance-soft', 'btn btn--ghost btn--sm'));
    host.appendChild(actions);
  }

  function resolveRomance(action) {
    const companion = adventure.companion;
    if (action === 'romance-ask') {
      if (!companion.mutualInterest || companion.affinity < 55 || companion.friendsOnly) return;
      renderRomanceConfirm();
      return;
    }
    if (action === 'romance-confirm') {
      if (!companion.mutualInterest || companion.friendsOnly || companion.intimacySceneSeen) return;
      companion.intimacySceneSeen = true;
      const fallback = 'Вы проводите вечер вместе; камера задерживается на огнях за окном и мягко уходит в темноту. Утром между вами остаётся доверие и спокойная улыбка.';
      addStory('Ночь у костра', fallback);
      askNarration('Ночь у костра', 'Оба персонажа совершеннолетние (' + adventure.game.hero.name + ' и ' + companion.name + ', ' + companion.age + ' лет) и явно согласны. Напиши нежную романтическую сцену сближения на 2–3 предложения, затем мягко затемни сцену (fade-to-black), без описания сексуальных действий или обнажения.', fallback);
      adventure.companion.affinity = Math.min(100, adventure.companion.affinity + 8);
      $('#online-romance').hidden = true;
    } else if (action === 'romance-soft') {
      addStory('Вечер вдвоём', 'Вы делитесь историями, смеётесь и встречаете рассвет рядом. Интимность не обязательна; выбор остаётся за вами.');
      $('#online-romance').hidden = true;
    } else if (action === 'companion-friends') {
      companion.friendsOnly = true;
      companion.mutualInterest = false;
      addStory('Дружба', 'Вы договариваетесь оставить отношения дружескими. ' + companion.name + ' уважает твой выбор.');
      $('#online-romance').hidden = true;
    }
    renderCompanion();
    saveLocal();
  }

  function randomEnemyName(index) {
    const names = ['туманная гончая', 'разбойник с тракта', 'каменный страж', 'рой болотных огней', 'северный наёмник', 'теневой зверь', 'страж руин', 'пепельный охотник'];
    return names[index % names.length];
  }

  function startBattle(options) {
    const questIndex = options.questIndex;
    const boss = options.boss || false;
    const index = questIndex == null ? adventure.steps : questIndex;
    const enemyName = options.enemyName || (boss ? adventure.villain : randomEnemyName(index));
    const level = Math.max(1, Math.floor((questIndex == null ? adventure.mainIndex : questIndex) / 4) + 1);
    adventure.battle = {
      enemy: { name: enemyName, hp: boss ? 14 + level * 2 : 7 + level * 2, maxHp: boss ? 14 + level * 2 : 7 + level * 2, attack: 1 + Math.floor(level / 2), guard: 2 + Math.floor(level / 3), boss },
      questIndex: questIndex == null ? null : questIndex,
      markerId: options.markerId || '',
      log: [boss ? 'Главный противник преграждает путь.' : 'Враг нападает. Каждый обмен решает d20 обеих сторон.'],
      guardBonus: 0
    };
    adventure.interaction = null;
    $('#online-event').hidden = true;
    $('#online-battle').hidden = false;
    addStory('Бой начинается', adventure.battle.enemy.name + ' выходит на тропу. Выбирай действие: попадание и защита решаются встречными бросками d20.');
    renderBattle();
    renderMap();
    saveLocal();
  }

  function renderBattle() {
    const host = $('#online-battle');
    if (!host || !adventure) return;
    const battle = adventure.battle;
    if (!battle) { host.hidden = true; host.replaceChildren(); return; }
    host.hidden = false;
    host.replaceChildren();
    host.appendChild(el('div', 'online-section-title', battle.enemy.boss ? 'Бой · босс главной линии' : 'Пошаговый бой'));
    host.appendChild(el('strong', 'online-enemy-name', '👹 ' + battle.enemy.name));
    host.appendChild(el('div', 'online-enemy-health-label', 'Здоровье врага · ' + battle.enemy.hp + '/' + battle.enemy.maxHp));
    const track = el('div', 'online-enemy-track');
    const fill = el('i', ''); fill.style.width = Math.max(0, battle.enemy.hp / battle.enemy.maxHp * 100) + '%'; track.appendChild(fill); host.appendChild(track);
    const log = el('div', 'online-battle-log');
    battle.log.slice(-5).forEach(line => log.appendChild(el('p', '', line)));
    host.appendChild(log);
    const actions = el('div', 'online-battle-actions');
    [
      ['⚔️ Атаковать', 'attack'],
      ['🧪 Проверить лечение', 'heal'],
      ['🛡️ Защищаться', 'defend'],
      ['🏃 Попытаться отступить', 'flee']
    ].forEach((entry, index) => {
      const b = el('button', index === 0 ? 'btn btn--primary btn--sm' : 'btn btn--ghost btn--sm', entry[0]);
      b.type = 'button'; b.dataset.battleAction = entry[1];
      if (entry[1] === 'heal' && adventure.game.hero.hp >= adventure.game.hero.maxHp) b.disabled = true;
      actions.appendChild(b);
    });
    host.appendChild(actions);
  }

  function battleLog(text) {
    if (!adventure || !adventure.battle) return;
    adventure.battle.log.push(text);
    adventure.battle.log = adventure.battle.log.slice(-8);
  }

  function renderEvent() {
    const host = $('#online-event');
    if (!host || !adventure) return;
    if (!adventure.interaction) { host.hidden = true; host.replaceChildren(); return; }
    // setInteraction отрисовывает карточку сразу; эта функция восстанавливает её после загрузки.
    const item = adventure.interaction;
    const marker = item.data && item.data.markerId && adventure.map.markers.find(point => point.id === item.data.markerId);
    const quest = item.data && Number.isInteger(item.data.index) ? adventure.questline[item.data.index] : null;
    if (item.type === 'main-combat') {
      setInteraction('main-combat', item.data, quest && quest.title || 'Главная цель', quest && quest.objective || '', [
        { label: '⚔️ Начать пошаговый бой', action: 'start-main-battle', kind: 'primary' }, { label: 'Отойти и подготовиться', action: 'close' }
      ]);
    } else if (item.type === 'main-check') {
      setInteraction('main-check', item.data, quest && quest.title || 'Главная цель', quest && quest.objective || '', [
        { label: '🎲 Выполнить задачу', action: 'resolve-main', kind: 'primary' }, { label: 'Осмотреться ещё', action: 'close' }
      ]);
    } else if (item.type === 'side') {
      setInteraction('side', item.data, marker && marker.title || 'Побочная история', 'Побочная история может принести припасы и монеты.', [
        { label: '🔎 Помочь и разобраться', action: 'resolve-side', kind: 'primary' }, { label: 'Вернуться на тропу', action: 'close' }
      ]);
    } else if (item.type === 'companion') {
      const name = adventure.companion.name;
      setInteraction('companion', {}, 'Встреча у полевого лагеря', name + ', совершеннолетний спутник. Отношения необязательны и строятся только на взаимном интересе.', [
        { label: 'Поговорить по душам', action: 'companion-talk', kind: 'primary' }, { label: 'Мягко пофлиртовать', action: 'companion-flirt' }, { label: 'Остаться друзьями', action: 'companion-friends' }, { label: 'Пока попрощаться', action: 'close' }
      ]);
    } else if (item.type === 'random-combat') {
      setInteraction('random-combat', item.data, 'Засада!', 'На пути появляется противник. Сначала выбери, вступать ли в бой.', [
        { label: '⚔️ Принять бой', action: 'start-random-battle', kind: 'primary' }, { label: 'Отступить на шаг', action: 'retreat' }
      ]);
    } else if (item.type === 'locked') {
      setInteraction('locked', item.data, 'Пока рано', 'Этот знак относится к будущей главе. Сначала раскрой текущую зацепку.', [{ label: 'Понятно', action: 'close' }]);
    }
  }

  function handleEventAction(action) {
    if (!adventure || !adventure.interaction) return;
    if (action === 'close') { clearInteraction(); return; }
    if (action === 'retreat') {
      adventure.player = { x: adventure.previous.x, y: adventure.previous.y };
      clearInteraction(); renderAll(); return;
    }
    if (action === 'start-main-battle') {
      const index = adventure.interaction.data.index;
      const quest = adventure.questline[index];
      clearInteraction();
      startBattle({ questIndex: index, boss: index === MAIN_QUESTS - 1 || (index + 1) % 5 === 0, enemyName: index === MAIN_QUESTS - 1 ? adventure.villain : randomEnemyName(index) });
      return;
    }
    if (action === 'start-random-battle') {
      const markerId = adventure.interaction.data.markerId;
      clearInteraction();
      startBattle({ markerId, enemyName: randomEnemyName(adventure.steps) });
      return;
    }
    if (action === 'resolve-main') { resolveMainQuest(); return; }
    if (action === 'resolve-side') { resolveSideQuest(); return; }
    if (action === 'companion-talk') { companionCheck('talk'); return; }
    if (action === 'companion-flirt') { companionCheck('flirt'); return; }
    if (action === 'companion-friends') { resolveRomance('companion-friends'); clearInteraction(); renderAll(); return; }
  }

  function enemyTurn(defend) {
    const battle = adventure.battle;
    if (!battle) return;
    const enemy = battle.enemy;
    const hero = adventure.game.hero;
    const enemyDie = E.rollD20(), heroDie = E.rollD20();
    const enemyTotal = enemyDie + enemy.attack;
    const defense = heroDie + (Number(hero.stats.agi) || 0) + (defend ? 3 : battle.guardBonus || 0);
    battle.guardBonus = 0;
    if (enemyDie === 20 || (enemyDie !== 1 && enemyTotal > defense)) {
      const damage = E.rnd.int(1, 3) + Math.floor(enemy.attack / 2);
      hero.hp = Math.max(0, hero.hp - damage);
      battleLog('Ответ врага: d20=' + enemyDie + ' +' + enemy.attack + ' = ' + enemyTotal + '; твоя защита d20=' + heroDie + ' + ЛОВ = ' + defense + ' → попадание, −' + damage + ' HP.');
    } else {
      battleLog('Ответ врага: d20=' + enemyDie + ' +' + enemy.attack + ' = ' + enemyTotal + '; твоя защита d20=' + heroDie + ' + ЛОВ = ' + defense + ' → уклонился.');
    }
  }

  function finishBattle(won, escaped) {
    const battle = adventure.battle;
    if (!battle) return;
    const questIndex = battle.questIndex;
    const markerId = battle.markerId;
    const enemyName = battle.enemy.name;
    if (won) {
      adventure.xp += battle.enemy.boss ? 30 : 8;
      adventure.coins += battle.enemy.boss ? 18 : 3;
      adventure.battle = null;
      $('#online-battle').hidden = true;
      if (markerId && !adventure.defeatedEnemies.includes(markerId)) adventure.defeatedEnemies.push(markerId);
      if (questIndex != null) {
        const quest = adventure.questline[questIndex];
        addStory('Победа над ' + enemyName, 'Бой выигран. Получено ' + (battle.enemy.boss ? 18 : 3) + ' монет. Главная линия продолжается.');
        completeMainQuest(questIndex, quest);
        askNarration(quest && quest.title || 'Победа', 'Опиши последствия пошагового боя. Герой победил ' + enemyName + '. Не меняй исход.', 'Последний удар сбивает противника с ног. Путь вперёд свободен.');
      } else addStory('Победа', enemyName + ' повержен. Ты получаешь монеты и можешь продолжать исследование.');
    } else if (escaped) {
      adventure.battle = null;
      $('#online-battle').hidden = true;
      adventure.player = { x: adventure.previous.x, y: adventure.previous.y };
      addStory('Отступление', 'Ты отрываешься от ' + enemyName + ' и возвращаешься на предыдущую клетку.');
    } else {
      const hero = adventure.game.hero;
      hero.hp = Math.max(1, Math.round(hero.maxHp * 0.55));
      hero.supplies = Math.max(0, (Number(hero.supplies) || 0) - 1);
      adventure.battle = null;
      $('#online-battle').hidden = true;
      adventure.player = { x: adventure.map.start.x, y: adventure.map.start.y };
      addStory('Герой отступил', 'Ты приходишь в себя у поселения. Здоровье восстановлено до половины, потерян 1 припас; кампания продолжается.');
    }
    renderAll();
    saveLocal();
  }

  function handleBattleAction(action) {
    const battle = adventure && adventure.battle;
    if (!battle) return;
    const hero = adventure.game.hero;
    const enemy = battle.enemy;
    if (action === 'attack') {
      const playerDie = E.rollD20(), guardDie = E.rollD20();
      const attackTotal = playerDie + (Number(hero.stats.str) || 0);
      const guardTotal = guardDie + enemy.guard;
      if (playerDie === 20 || (playerDie !== 1 && attackTotal > guardTotal)) {
        const damage = E.rnd.int(2, 5) + Math.floor((Number(hero.stats.str) || 0) / 2);
        enemy.hp = Math.max(0, enemy.hp - damage);
        battleLog('Твой удар: d20=' + playerDie + ' + СИЛ ' + hero.stats.str + ' = ' + attackTotal + '; защита врага d20=' + guardDie + ' +' + enemy.guard + ' = ' + guardTotal + ' → попадание, −' + damage + ' HP.');
      } else {
        battleLog('Твой удар: d20=' + playerDie + ' + СИЛ ' + hero.stats.str + ' = ' + attackTotal + '; защита врага d20=' + guardDie + ' +' + enemy.guard + ' = ' + guardTotal + ' → промах.');
      }
      if (enemy.hp <= 0) { finishBattle(true, false); return; }
      enemyTurn(false);
    } else if (action === 'heal') {
      const roll = E.rollD20();
      const bonus = Number(hero.stats.con) || 0;
      const total = roll + bonus;
      if (roll === 20 || (roll !== 1 && total >= 12)) {
        const before = hero.hp;
        const heal = 2 + E.rnd.int(1, 4) + Math.floor(bonus / 2);
        hero.hp = Math.min(hero.maxHp, hero.hp + heal);
        battleLog('Лечение: d20=' + roll + ' + ТЕЛ ' + bonus + ' = ' + total + ' против DC 12 → успех, +' + (hero.hp - before) + ' HP.');
      } else battleLog('Лечение: d20=' + roll + ' + ТЕЛ ' + bonus + ' = ' + total + ' против DC 12 → не удалось.');
      enemyTurn(false);
    } else if (action === 'defend') {
      battle.guardBonus = 3;
      battleLog('Ты готовишься к удару и получаешь +3 к защите на этот обмен.');
      enemyTurn(true);
    } else if (action === 'flee') {
      const playerDie = E.rollD20(), enemyDie = E.rollD20();
      const escapeTotal = playerDie + (Number(hero.stats.agi) || 0);
      const enemyTotal = enemyDie + enemy.attack;
      battleLog('Отступление: твой d20=' + playerDie + ' + ЛОВ = ' + escapeTotal + '; враг d20=' + enemyDie + ' +' + enemy.attack + ' = ' + enemyTotal + '.');
      if (playerDie === 20 || (playerDie !== 1 && escapeTotal > enemyTotal)) { finishBattle(false, true); return; }
      enemyTurn(false);
    }
    if (hero.hp <= 0) { finishBattle(false, false); return; }
    renderHud(); renderBattle(); renderMap(); saveLocal();
  }

  function handleRomanceAction(action) {
    if (['romance-ask', 'romance-confirm', 'romance-soft', 'companion-friends'].includes(action)) {
      resolveRomance(action);
      if (action === 'companion-friends') { clearInteraction(); renderAll(); }
    }
  }

  function renderEventClick(event) {
    const target = event.target.closest('[data-event-action]');
    if (target) handleEventAction(target.dataset.eventAction);
  }

  function renderAllAfterLoad() {
    adventure.battle = adventure.battle || null;
    adventure.interaction = adventure.interaction || null;
    showAdventure();
  }

  function init() {
    const launch = $('#open-online-adventure');
    if (launch) launch.addEventListener('click', enterMode);
    const back = $('#online-exit');
    if (back) back.addEventListener('click', exitMode);
    document.querySelectorAll('[data-online-world-mode]').forEach(button => button.addEventListener('click', () => selectWorldMode(button.dataset.onlineWorldMode)));
    $('#online-start').addEventListener('click', startNewAdventure);
    $('#online-hero-confirm').addEventListener('click', confirmHeroChoice);
    $('#online-hero-back').addEventListener('click', returnToWorldSetup);
    ['#online-hero-class', '#online-hero-race', '#online-hero-origin'].forEach(selector => $(selector).addEventListener('change', renderHeroChoicePreview));
    $('#online-resume-button').addEventListener('click', resumeLocalAdventure);
    $('#online-cloud-load').addEventListener('click', loadCloudAdventure);
    $('#online-cloud-save').addEventListener('click', saveCloudAdventure);
    $('#online-save-button').addEventListener('click', saveCloudAdventure);
    $('#online-event').addEventListener('click', renderEventClick);
    $('#online-battle').addEventListener('click', event => {
      const target = event.target.closest('[data-battle-action]');
      if (target) handleBattleAction(target.dataset.battleAction);
    });
    $('#online-romance').addEventListener('click', event => {
      const target = event.target.closest('[data-event-action]');
      if (target) handleRomanceAction(target.dataset.eventAction);
    });
    $('#online-map').addEventListener('click', event => {
      const target = event.target.closest('[data-step-x]');
      if (target) move(Number(target.dataset.stepX), Number(target.dataset.stepY));
    });
    document.querySelectorAll('[data-online-move]').forEach(button => button.addEventListener('click', () => {
      const parts = button.dataset.onlineMove.split(',').map(Number);
      move(parts[0], parts[1]);
    }));
    document.addEventListener('keydown', event => {
      if (document.body.dataset.screen !== 'online' || $('#online-play').hidden || adventure && adventure.battle) return;
      const target = event.target;
      if (target && /INPUT|TEXTAREA|SELECT/.test(target.tagName)) return;
      const map = { ArrowUp: [0, -1], w: [0, -1], W: [0, -1], ArrowDown: [0, 1], s: [0, 1], S: [0, 1], ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0], ArrowRight: [1, 0], d: [1, 0], D: [1, 0] };
      if (map[event.key]) { event.preventDefault(); move(map[event.key][0], map[event.key][1]); }
    });
    // Restore a saved interaction/battle when a player continues the campaign.
    const originalResume = $('#online-resume-button');
    if (originalResume) originalResume.addEventListener('click', renderAllAfterLoad);
  }

  init();
  window.DTOnlineAdventure = {
    open: enterMode,
    get state() { return adventure; },
    get mapSize() { return { width: MAP_W, height: MAP_H, visibleWidth: VIEW_W, visibleHeight: VIEW_H }; }
  };
})();
