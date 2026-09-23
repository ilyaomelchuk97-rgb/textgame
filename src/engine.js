/* ============================================================
 * Dice Tales — engine.js  (схема сохранений v3)
 * Чистая логика: характеристики, расы, происхождения, классы
 * с умениями, режимы миров (случайные / по играм / свой мир),
 * кубики, промпты для ИИ, локальный мастер, сохранения.
 * Не зависит от DOM — тестируется в Node.
 * ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DTEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 3;

  /* ---------------------------------------------------------- */
  /* Рандом                                                     */
  /* ---------------------------------------------------------- */
  const rnd = {
    int(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; },
    chance(p) { return Math.random() < p; },
    pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
    seed() { return Math.floor(Math.random() * 2000000000) - 1000000000; }
  };

  /* ---------------------------------------------------------- */
  /* Характеристики: семь вместо четырёх                        */
  /* ---------------------------------------------------------- */
  const STATS = [
    { id: 'str', name: 'Сила', short: 'СИЛ', icon: '⚔️', hint: 'мощь, груз, прямой бой' },
    { id: 'agi', name: 'Ловкость', short: 'ЛОВ', icon: '🏃', hint: 'скрытность, прыжки, реакция' },
    { id: 'con', name: 'Телосложение', short: 'ТЕЛ', icon: '🛡️', hint: 'стойкость, яд, усталость' },
    { id: 'int', name: 'Разум', short: 'РАЗ', icon: '🧠', hint: 'знания, механизмы, магия' },
    { id: 'per', name: 'Восприятие', short: 'ВОС', icon: '👁️', hint: 'следы, слух, замечать детали' },
    { id: 'wit', name: 'Воля', short: 'ВОЛ', icon: '🔥', hint: 'страх, давление, выдержка' },
    { id: 'cha', name: 'Харизма', short: 'ХАР', icon: '🎭', hint: 'уговорить, впечатлить, повести за собой' }
  ];
  const STAT_IDS = STATS.map(s => s.id);
  const statById = id => STATS.find(s => s.id === id) || STATS[0];
  const BASE_STAT = 1;

  /* ---------------------------------------------------------- */
  /* Классы (архетипы) — у каждого бонусы и умение              */
  /* Умение: одноразовое, восстанавливается раз в 3 хода        */
  /* ---------------------------------------------------------- */
  const ABILITIES = {
    breath: { id: 'breath', name: 'Второе дыхание', icon: '💨', kind: 'heal', power: 4, desc: 'Сразу +4 здоровья.' },
    analysis: { id: 'analysis', name: 'Анализ', icon: '📐', kind: 'bless', power: 3, desc: '+3 к следующему броску.' },
    shadow: { id: 'shadow', name: 'Тень', icon: '🌑', kind: 'advantage', power: 0, desc: 'Следующий бросок — два d20, берём лучший.' },
    spark: { id: 'spark', name: 'Искра', icon: '✨', kind: 'advantage', power: 0, desc: 'Следующий бросок — два d20, берём лучший.' },
    words: { id: 'words', name: 'Натиск слов', icon: '💬', kind: 'bless', power: 3, desc: '+3 к следующему броску.' },
    instinct: { id: 'instinct', name: 'Чутьё', icon: '🧭', kind: 'bless', power: 3, desc: '+3 к следующему броску.' }
  };

  const CLASSES = [
    { id: 'warrior', title: 'Воин', icon: '🛡️', blurb: 'Решает вопросы силой и упорством.', bonus: { str: 2, con: 1 }, hpBonus: 3, ability: 'breath' },
    { id: 'rogue', title: 'Плут', icon: '🗡️', blurb: 'Тень, ловкость и немного наглости.', bonus: { agi: 2, per: 1 }, hpBonus: 0, ability: 'shadow' },
    { id: 'scholar', title: 'Учёный', icon: '📜', blurb: 'Знает то, что другим лучше не знать.', bonus: { int: 2, per: 1 }, hpBonus: -1, ability: 'analysis' },
    { id: 'mage', title: 'Одарённый', icon: '✨', blurb: 'Чувствует то, чего не видят глаза.', bonus: { wit: 2, int: 1 }, hpBonus: 0, ability: 'spark' },
    { id: 'diplomat', title: 'Дипломат', icon: '🎭', blurb: 'Слово дороже клинка — но не всегда.', bonus: { cha: 2, wit: 1 }, hpBonus: 0, ability: 'words' },
    { id: 'wanderer', title: 'Скиталец', icon: '🧭', blurb: 'Читает следы, людей и погоду.', bonus: { per: 2, con: 1 }, hpBonus: 1, ability: 'instinct' }
  ];
  const classById = id => CLASSES.find(c => c.id === id) || CLASSES[0];
  const abilityById = id => ABILITIES[id] || ABILITIES.breath;

  /* ---------------------------------------------------------- */
  /* Расы / виды — работают в любом сеттинге,                  */
  /* у сеттинга своя подпись («в фэнтези — эльфы, в кибер — …») */
  /* ---------------------------------------------------------- */
  const RACES = [
    {
      id: 'human', title: 'Человек', icon: '🧍', bonus: { cha: 1, per: 1 },
      flavor: { fantasy: 'горожанин или солдат', scifi: 'житель мегаполиса', default: 'уроженец здешних мест' },
      trait: 'Свой среди своих: в обитаемых местах разговор даётся легко.'
    },
    {
      id: 'elder', title: 'Древний народ', icon: '🧝', bonus: { agi: 1, per: 1 },
      flavor: { fantasy: 'эльф, сидх, житель леса', scifi: 'долгоживущий колонист', default: 'представитель старой крови' },
      trait: 'Ночное зрение и привычка ждать: видишь в темноте, но люди тебя не понимают.'
    },
    {
      id: 'stone', title: 'Каменный народ', icon: '⛰️', bonus: { con: 2 },
      flavor: { fantasy: 'дварф, гном, горный мастер', scifi: 'тяжёлый киборг шахтёрской сборки', default: 'крепкая порода' },
      trait: 'Стойкость: яд, холод и голод переносишь легче других.'
    },
    {
      id: 'beast', title: 'Зверолюд', icon: '🐺', bonus: { str: 1, con: 1 },
      flavor: { fantasy: 'орк, кхаджит, оборотень', scifi: 'мутант пустошей', default: 'зверь в человеческом облике' },
      trait: 'Острый нюх и слух: чуешь кровь, ложь и погоню задолго до остальных.'
    },
    {
      id: 'construct', title: 'Искусственный', icon: '🤖', bonus: { int: 1, con: 1, cha: -1 },
      flavor: { fantasy: 'гомункул, оживлённый доспех', scifi: 'андроид, синтетик', default: 'созданный, а не рождённый' },
      trait: 'Не дышишь и не устаёшь, но живые чувства тебе расшифровывают с трудом.'
    },
    {
      id: 'changed', title: 'Изменённый', icon: '⚡', bonus: { str: 1, wit: 1, cha: -1 },
      flavor: { fantasy: 'проклятый, одержимый, метка', scifi: 'киборг с боевым имплантом', default: 'носитель чужой силы' },
      trait: 'Внутренний голос: иногда подсказывает то, чего знать не можешь.'
    },
    {
      id: 'outsider', title: 'Иномирец', icon: '🌀', bonus: { int: 1, wit: 1 },
      flavor: { fantasy: 'пришедший из-за грани', scifi: 'пришелец из другой системы', default: 'здесь не по своей воле' },
      trait: 'Видишь то, что местным кажется нормой: странности бросаются в глаза.'
    },
    {
      id: 'halfblood', title: 'Полукровка', icon: '☯️', bonus: { cha: 1, wit: 1 },
      flavor: { fantasy: 'дитя двух народов', scifi: 'гибрид, выращенный в лаборатории', default: 'между двумя мирами' },
      trait: 'Свои среди чужих: обе стороны говорят с тобой, но не доверяют до конца.'
    }
  ];
  const raceById = id => RACES.find(r => r.id === id) || RACES[0];
  function raceFlavor(race, setting) {
    if (!race) return '';
    const key = setting === 'scifi' ? 'scifi' : (setting === 'fantasy' ? 'fantasy' : 'default');
    return race.flavor[key] || race.flavor.default;
  }

  /* ---------------------------------------------------------- */
  /* Происхождение: чем герой был до первого хода               */
  /* Даёт бонусы, предмет и «крючок» — зацепку для сюжета        */
  /* ---------------------------------------------------------- */
  const ORIGINS = [
    { id: 'streets', title: 'Улицы предместий', icon: '🏚️', bonus: { agi: 1, per: 1 }, item: 'заточенная отмычка', hook: 'Долг карточному дому растёт быстрее, чем ты успеваешь платить.' },
    { id: 'soldier', title: 'Бывший солдат', icon: '🎖️', bonus: { str: 1, con: 1 }, item: 'потёртый жетон', hook: 'Ты ушёл с поля боя, оставив там кого-то живого.' },
    { id: 'scholar', title: 'Учёный-отступник', icon: '🔬', bonus: { int: 2 }, item: 'обгоревшая тетрадь', hook: 'За твоими записями охотится тот, кто их заказал.' },
    { id: 'priest', title: 'Служитель культа', icon: '🕯️', bonus: { wit: 2 }, item: 'амулет-пустышка', hook: 'Твой бог молчит уже год, а прихожане этого не знают.' },
    { id: 'sailor', title: 'Портовый моряк', icon: '⚓', bonus: { con: 1, per: 1 }, item: 'солёный компас', hook: 'Твой корабль ушёл без тебя — и вернулся без команды.' },
    { id: 'exile', title: 'Изгнанный аристократ', icon: '👑', bonus: { cha: 2 }, item: 'печать рода', hook: 'Твоё имя стоит в приговоре, который ещё не отменён.' },
    { id: 'smuggler', title: 'Контрабандист', icon: '📦', bonus: { agi: 1, cha: 1 }, item: 'чемодан с двойным дном', hook: 'Тебе должны трое. Один из них уже мёртв.' },
    { id: 'lost', title: 'Пропавший без вести', icon: '🕳️', bonus: { wit: 1, per: 1 }, item: 'чужая фотография', hook: 'Ты не помнишь последний год — а кто-то помнит.' }
  ];
  const originById = id => ORIGINS.find(o => o.id === id) || ORIGINS[0];

  /* ---------------------------------------------------------- */
  /* Статы, здоровье, умения                                    */
  /* ---------------------------------------------------------- */
  function makeStats({ classId, raceId, originId }) {
    return statsFor(classById(classId), raceById(raceId), originById(originId));
  }

  /** Характеристики из трёх выбранных вариантов (в том числе придуманных мастером). */
  function statsFor(cls, race, origin) {
    const c = cls || CLASSES[0], r = race || RACES[0], o = origin || ORIGINS[0];
    const stats = {};
    STAT_IDS.forEach(id => {
      stats[id] = BASE_STAT + (c.bonus[id] || 0) + (r.bonus[id] || 0) + (o.bonus[id] || 0);
    });
    return stats;
  }

  /** Вариант из профиля мастера по id; null — если такого нет. */
  function pickProfileOption(profile, key, id) {
    if (!profile || !Array.isArray(profile[key]) || !id) return null;
    return profile[key].find(x => x.id === id) || null;
  }

  /** Умение героя: у придуманного мастером класса оно своё. */
  function abilityForHero(cls) {
    const a = cls && cls.ability;
    if (a && typeof a === 'object') {
      return { id: a.id, name: a.name, icon: a.icon, kind: a.kind, power: a.power, desc: a.desc, ready: true, cooldown: 0 };
    }
    return makeAbility(cls ? cls.id : CLASSES[0].id);
  }
  /** Хп от телосложения и класса. Для классов, придуманных мастером, бонус считается по статам. */
  const maxHpFor = ({ classId, cls, stats }) => {
    const klass = cls || classById(classId);
    const hp = (typeof klass.hpBonus === 'number' && isFinite(klass.hpBonus)) ? klass.hpBonus : hpBonusFromStats(klass.bonus, klass.id);
    return Math.max(8, 8 + 2 * ((stats && stats.con) || BASE_STAT) + hp);
  };

  /** Если у класса нет своего запаса здоровья — выводим его из бонусов. */
  function hpBonusFromStats(bonus, classId) {
    const base = classId ? CLASSES.find(c => c.id === classId) : null;
    if (base && typeof base.hpBonus === 'number') return base.hpBonus;
    const b = bonus || {};
    return clamp((b.con || 0) + (b.str || 0) - 1, -1, 3);
  }

  const ABILITY_COOLDOWN = 3;

  function makeAbility(classId) {
    const a = abilityById(classById(classId).ability);
    return { id: a.id, name: a.name, icon: a.icon, kind: a.kind, power: a.power, desc: a.desc, ready: true, cooldown: 0 };
  }

  /* ---------------------------------------------------------- */
  /* Кубики                                                     */
  /* ---------------------------------------------------------- */
  const DIFFICULTY = [
    { id: 'easy', label: 'Легко', dc: 8, color: '#54c98b' },
    { id: 'medium', label: 'Средне', dc: 11, color: '#e0b356' },
    { id: 'hard', label: 'Трудно', dc: 14, color: '#e58a4d' },
    { id: 'deadly', label: 'Смертельно', dc: 17, color: '#e05555' }
  ];
  const DIFFICULTY_ORDER = DIFFICULTY.map(d => d.id);
  const difficultyById = id => DIFFICULTY.find(d => d.id === id) || DIFFICULTY[1];
  function difficultyForDc(dc) {
    let best = DIFFICULTY[0];
    DIFFICULTY.forEach(d => { if (dc >= d.dc) best = d; });
    return best;
  }
  /** Сдвиг сложности от «жестокости» мира (настройка своего мира). */
  const DANGER_SHIFT = { soft: -2, normal: 0, harsh: 2 };

  const rollDie = sides => rnd.int(1, sides);
  const rollD20 = () => rollDie(20);

  /** P(d20 + mod >= dc), с учётом преимущества (2d20 — лучший). */
  function successChance(mod, dc, advantage) {
    const single = (() => {
      const need = dc - mod;
      if (need <= 1) return 0.95;
      if (need > 20) return 0.05;
      return (21 - need) / 20;
    })();
    if (!advantage) return single;
    // два d20, берём лучший: провал только если оба броска ниже нужного
    const p = 1 - (1 - single) * (1 - single);
    return Math.min(0.97, p);
  }

  /**
   * Бросок проверки. При advantage бросаем два d20 и берём лучший.
   * @returns {{roll:number, rolls:number[], mod:number, total:number, dc:number,
   *            outcome:'crit'|'success'|'fail'|'fumble', label:string, stat:string, advantage:boolean}}
   */
  function resolveCheck({ stat, dc, bonus = 0, advantage = false }) {
    const rolls = advantage ? [rollD20(), rollD20()] : [rollD20()];
    const roll = Math.max.apply(null, rolls);
    const total = roll + bonus;
    let outcome;
    if (roll === 20) outcome = 'crit';
    else if (roll === 1 && rolls.every(r => r === 1)) outcome = 'fumble';
    else outcome = total >= dc ? 'success' : 'fail';
    return {
      roll, rolls, mod: bonus, total, dc, stat, advantage: !!advantage,
      margin: total - dc,
      outcome,
      label: OUTCOME_LABEL[outcome]
    };
  }
  const OUTCOME_LABEL = {
    crit: 'Критический успех!',
    success: 'Успех',
    fail: 'Провал',
    fumble: 'Критический провал!'
  };

  /* ---------------------------------------------------------- */
  /* Миры: свои сценарии                                        */
  /* ---------------------------------------------------------- */
  const SCENARIOS = [
    {
      id: 'asgeld', title: 'Проклятый лес Аскельда', tagline: 'Деревья помнят всех, кто вошёл.',
      genre: 'Тёмное фэнтези', setting: 'fantasy', icon: '🌲', cover: 'sc-forest',
      artStyle: 'dark fantasy oil painting, ancient misty forest, teal moonlight, cinematic, moody',
      palette: ['#0d1f1c', '#1d4a3f', '#7fd4a8'],
      opening: 'Тропа обрывается у чёрных стволов. Воздух липкий и холодный, а в глубине леса что-то мерно звонит — как колокольчик на шее у зверя, которого здесь не может быть.',
      goal: 'Найти источник звона и снять проклятие леса',
      systemHint: 'Держи атмосферу тихой, но враждебной: лес слушает, помогает редко и всегда берёт плату.',
      imagePrompts: [
        'twisted black trees in dense fog, glowing swamp lights',
        'narrow muddy path between mossy rocks in dark forest',
        'ancient stone shrine overgrown with roots in misty woods'
      ]
    },
    {
      id: 'aurelia', title: 'Затонувший город Аврелия', tagline: 'Купол держит воду. Небо — держит обман.',
      genre: 'Эпическое фэнтези', setting: 'fantasy', icon: '🌊', cover: 'sc-ocean',
      artStyle: 'epic underwater fantasy, deep blue god rays, ruined marble, cinematic',
      palette: ['#04202e', '#0c4a63', '#8fe2ff'],
      opening: 'Купол над Аврелией держится семьсот лет, и его часы сочтены: трещины светятся ядовито-зелёным. Внизу, среди затонувших улиц, кто-то зажёг маяк.',
      goal: 'Остановить разлом купола',
      systemHint: 'Мир на грани катастрофы: решения быстрые, вода всегда рядом, союзников мало.',
      imagePrompts: [
        'sunken marble columns under deep blue water, light rays',
        'glowing cracks in a giant magical dome underwater',
        'flooded ancient library with floating books underwater'
      ]
    },
    {
      id: 'helios', title: 'Станция «Гелиос-9»', tagline: 'Смена длится шестнадцать лет.',
      genre: 'Научная фантастика / хоррор', setting: 'scifi', icon: '🚀', cover: 'sc-space',
      artStyle: 'retro sci-fi concept art, derelict space station corridor, red emergency lights, cinematic',
      palette: ['#1a0b12', '#5c1626', '#ff7b6b'],
      opening: 'Шлюз открывается с шипением, которого не должно быть: воздух здесь есть. Аварийное освещение мигает в такт с чем-то тяжёлым в переборках, и в журнале станции последняя запись датирована завтрашним днём.',
      goal: 'Выяснить, что случилось с экипажем, и уйти живым',
      systemHint: 'Дозируй ужас: сначала быт и мелочи не на месте, потом — прямая угроза. Пусть техника иногда отвечает сама.',
      imagePrompts: [
        'derelict space station corridor with red emergency lights',
        'frozen overgrown hydroponics bay inside a space station',
        'dark hangar bay with a damaged shuttle, sparks, sci-fi'
      ]
    },
    {
      id: 'greyhaven', title: 'Порт Грейхейвен, 1924', tagline: 'Дождь смывает всё, кроме долгов.',
      genre: 'Нуар / детектив', setting: 'modern', icon: '🕵️', cover: 'sc-noir',
      artStyle: '1920s noir illustration, rainy harbor, warm street lamps, dramatic shadows, cinematic',
      palette: ['#12161c', '#2f3b4a', '#f0a95c'],
      opening: 'Телефон звонит в три ночи, и голос на другом конце называет имя, которое ты не слышал двенадцать лет. В порту как раз разгружают ящики, которых нет ни в одной накладной.',
      goal: 'Найти груз и того, кто его заказал',
      systemHint: 'Никто не говорит правду целиком. Любая услуга имеет цену, улики ведут к людям, а не к монстрам.',
      imagePrompts: [
        'rainy 1920s harbor at night, street lamps reflecting on wet cobblestone',
        'smoky noir detective office, desk lamp, venetian blind shadows',
        'foggy cargo docks with a crane silhouette, 1920s, noir'
      ]
    },
    {
      id: 'karat', title: 'Пустошь Кар-Ата', tagline: 'Ветер здесь носит только пыль и слухи.',
      genre: 'Постапокалипсис', setting: 'scifi', icon: '☢️', cover: 'sc-waste',
      artStyle: 'post-apocalyptic wasteland concept art, ruined highway, dust storm, orange sky, cinematic',
      palette: ['#241309', '#7a3d10', '#ffb05c'],
      opening: 'Последняя канистра воды пуста ещё до полудня. На горизонте — ржавый эшелон, который тридцать лет стоит поперёк трассы, и оттуда как будто машут рукой.',
      goal: 'Добраться до убежища «Тихий купол»',
      systemHint: 'Ресурсы важнее слов: вода, топливо, патроны. Каждый выбор что-то отнимает.',
      imagePrompts: [
        'rusty train wreck across a ruined desert highway, dust, orange sky',
        'makeshift survivor camp among scrap metal, campfire, night',
        'sandstorm approaching abandoned gas station, post apocalyptic'
      ]
    }
  ];

  /* ---------------------------------------------------------- */
  /* Миры по популярным играм (фан-режимы)                      */
  /* ---------------------------------------------------------- */
  const GAME_WORLDS = [
    {
      id: 'azeroth', title: 'Азерот: пепел Калимдора', tagline: 'Мир после Катаклизма. Гильдии делят руины.',
      genre: 'MMO-фэнтези в духе World of Warcraft', setting: 'fantasy', icon: '🐉', cover: 'gw-azeroth',
      artStyle: 'blizzard-style epic fantasy concept art, wide vista with storm clouds, painterly world of warcraft mood',
      palette: ['#12203a', '#3f6bb5', '#ffd479'],
      opening: 'Дозорный горн ревёт над плато: третий раз за сутки. Стены форта помнят осады, а в трактире спорят, кто первым пойдёт в рейд на тварь, что разоряет караваны.',
      goal: 'Собрать отряд и закрыть разлом, из которого лезет нежить',
      systemHint: 'Дух MMO: классовое братство, гильдейские задания, рейды, фракции, квестовые цепочки. Используй лексику: «далее», «рейд», «легендарка», «гильдмастер», «данж».',
      imagePrompts: [
        'epic fantasy fortress on a cliff, storm clouds, army banners',
        'guild tavern interior with adventurers and maps, fantasy',
        'dark portal glowing in the mountains, undead horde, epic fantasy'
      ]
    },
    {
      id: 'nightcity', title: 'Найт-Сити, 2077', tagline: 'Город продаст тебя дважды: до и после импланта.',
      genre: 'Киберпанк в духе Cyberpunk 2077', setting: 'scifi', icon: '🌆', cover: 'gw-nightcity',
      artStyle: 'cyberpunk neon mega-city concept art, rain slick streets, holograms, moody cinematic',
      palette: ['#1a0f2e', '#7a1e5c', '#40e6ff'],
      opening: 'Лифт останавливается между этажами, и в отражении синткостюма ты видишь, что за тобой шли от самого бара. На чипе — непрочитанное сообщение от фиксера с одной строкой: «имплант не продавай».',
      goal: 'Выяснить, что на чипе, и остаться живым при живых долгах',
      systemHint: 'Стиль киберпанка: импланты, рипердоки, корпорации, фиксеры, НСПД, «дела», эдди как валюта, слэнг. Доверие покупается, а не завоёвывается.',
      imagePrompts: [
        'neon cyberpunk city street in rain, holographic billboards, night',
        'chrome implants on a table in a ripperdoc clinic, neon light',
        'rooftop view of a megacity with corporate towers, drones, night'
      ]
    },
    {
      id: 'runeterra', title: 'Руны Валирана', tagline: 'Магия здесь — оружие, а чемпионы — судьба.',
      genre: 'MOBA-фэнтези в духе League of Legends', setting: 'fantasy', icon: '🔮', cover: 'gw-runes',
      artStyle: 'stylized fantasy champion art, glowing runes, magical arena, painterly, cinematic league of legends mood',
      palette: ['#0c1b2a', '#1f6a7a', '#8ff0d1'],
      opening: 'Арена засыпает полем боя: пять магов, три клинка и одна руна, за которую уже погибли двадцать человек. Вышки ждут, а судья объявляет, что правила сегодня другие.',
      goal: 'Собрать состав и забрать руну до того, как это сделает враждебный дом',
      systemHint: 'Дух MOBA: чемпионы с ультимейтами, линии, джунгли, барон, вижн и варды, договорные бои. Каждое сражение — тактика и роли.',
      imagePrompts: [
        'magical arena with glowing runes, champions silhouettes, fantasy',
        'ancient rune stone glowing in a jungle temple, epic fantasy',
        'stylized fantasy mage casting spell, energy swirl, painterly'
      ]
    },
    {
      id: 'mygame', title: 'Своя игра', tagline: 'Опишите игру — ИИ построит мир по её правилам.',
      genre: 'По вашей игре', setting: 'fantasy', icon: '🎮', cover: 'gw-custom',
      customGame: true,
      artStyle: 'video game concept art, cinematic mood, detailed environment',
      palette: ['#101820', '#2f4f5a', '#9fe6d0'],
      opening: '',
      goal: '',
      systemHint: 'Играй строго в духе описанной игроком игры: её мир, её лексика, её правила и атмосфера.',
      imagePrompts: [
        'video game cinematic environment, moody light, dramatic depth',
        'detailed game location art, atmospheric fog, cinematic',
        'epic game scene, dramatic light, concept art'
      ]
    }
  ];

  // неизвестный id (битый сейв) → первый полноценный сценарий, а не пустой «свой мир»
  const scenarioById = id =>
    SCENARIOS.concat(GAME_WORLDS, [CUSTOM_SCENARIO]).find(s => s.id === id) || SCENARIOS[0];

  /* ---------------------------------------------------------- */
  /* «Свой мир» — конструктор                                  */
  /* ---------------------------------------------------------- */
  const WORLD_OPTIONS = {
    genres: ['Фэнтези', 'Киберпанк', 'Космос', 'Постапокалипсис', 'Нуар', 'Стимпанк', 'Хоррор',
      'Восточное фэнтези', 'Современность', 'Пиратское', 'Мифическая древность', 'Школа магии'],
    tones: ['Мрачный', 'Героический', 'Ироничный', 'Мистический', 'Суровый реализм', 'Тёплый и уютный', 'Эпичный', 'Холодный триллер'],
    places: ['Город', 'Деревня', 'Пустошь', 'Орбитальная станция', 'Подземелье', 'Открытое море',
      'Руины', 'Лес', 'Пустыня', 'Подземка', 'Замок', 'Колония на другой планете'],
    ingredients: ['Магия', 'Драконы', 'Нежить и зомби', 'ИИ-компаньон', 'Детективное расследование',
      'Политика и интриги', 'Торговля и караваны', 'Выживание', 'Крафт и ремесло', 'Пираты',
      'Культы и пророчества', 'Охота за сокровищами', 'Романтика', 'Турниры и арены',
      'Путешествия во времени', 'Боги и пантеоны', 'Роботы и дроны', 'Проклятия']
  };
  const DANGER_LEVELS = [
    { id: 'soft', title: 'Мягкий', hint: 'проверки легче, герой чаще побеждает' },
    { id: 'normal', title: 'Сбалансированный', hint: 'как в классических приключениях' },
    { id: 'harsh', title: 'Жестокий', hint: 'сложнее, ошибки дорого стоят' }
  ];

  const CUSTOM_SCENARIO = {
    id: 'custom', title: 'Свой мир', tagline: 'Соберите мир сами или доверьте детали ИИ.',
    genre: 'Ваш мир', setting: 'fantasy', icon: '🧩', cover: 'gw-custom', custom: true,
    artStyle: 'atmospheric concept art, cinematic light, detailed environment',
    palette: ['#141a26', '#3a5468', '#a8e6ff'],
    opening: '',
    goal: '',
    systemHint: '',
    imagePrompts: [
      'atmospheric concept art landscape, dramatic light, cinematic',
      'moody environment art, fog and silhouette, cinematic',
      'detailed fantasy location concept art, cinematic light'
    ]
  };

  function emptyWorldConfig() {
    return {
      title: '', genre: '', tone: '', place: '', goal: '',
      ingredients: [], danger: 'normal', role: '', extra: '', gameName: ''
    };
  }
  const OWN_ROLES = ['Странник', 'Наёмник', 'Избранный (или думает, что да)', 'Шпион', 'Слуга при власти',
    'Охотник за головами', 'Лекарь', 'Проводник', 'Вор-джентльмен', 'Последний выживший'];

  /** Опасность мира сдвигает сложность всех проверок. */
  function shiftDc(dc, danger) {
    return Math.max(5, Math.min(20, dc + (DANGER_SHIFT[danger] || 0)));
  }

  /** Промпт для ИИ: собрать мир по настройкам игрока. */
  function buildWorldPrompt(config, baseScenario, opts) {
    const c = config || emptyWorldConfig();
    const s = baseScenario || null;
    const o = opts || {};
    const variant = Number(o.variant) || 0;
    const used = Array.isArray(o.used) ? o.used.filter(Boolean).slice(0, 12) : [];
    const lines = [
      'Задача: придумать мир и первую сцену текстовой RPG строго по настройкам игрока.',
      '',
      'НАСТРОЙКИ МИРА:',
      `- название: ${c.title || '(придумай сам, 2-5 слов)'}`,
      `- жанр: ${c.genre || '(на твой вкус)'}`,
      `- тон: ${c.tone || 'нейтральный'}`,
      `- место старта: ${c.place || 'не указано'}`,
      `- цель героя: ${c.goal || '(предложи внятную цель)'}`,
      `- роль героя: ${c.role || 'не указана'}`,
      `- особенности мира: ${(c.ingredients && c.ingredients.length) ? c.ingredients.join(', ') : 'нет'}`,
      `- уровень опасности: ${(DANGER_LEVELS.find(d => d.id === c.danger) || DANGER_LEVELS[1]).title}`,
      c.extra ? `- пожелания игрока: ${c.extra}` : '',
      variant > 1 ? `- это уже ${variant}-й заход: придумай другую завязку, другие имена и детали, не повторяйся` : ''
    ].filter(Boolean);
    if (s) {
      lines.push('', `ОСНОВА: мир должен быть в духе «${s.title}» (${s.genre}).`, s.systemHint ? `Особенности: ${s.systemHint}` : '');
    }
    lines.push(
      '',
      'Ответь строго одним JSON-объектом:',
      '{',
      '  "title": "название мира/кампании, 2-6 слов",',
      '  "goal": "главная задача героя, одна фраза",',
      '  "world": "2 предложения о мире: где мы и чем здесь живут люди",',
      '  "backstory": "2 предложения предыстории героя: откуда он и что его ведёт",',
      '  "plan": ["шаг сценария 1", "шаг 2", "шаг 3"],',
      '  "opening": "сцена, 2-3 предложения, второе лицо, живая деталь, ощутимая угроза",',
      '  "chapter": "название первой главы, 2-4 слова",',
      '  "npc": "имя и одна деталь персонажа, появившегося рядом, иначе пустая строка",',
      '  "imagePrompt": "English image prompt for the very first scene, 10-14 words: location + light + mood + who is in frame",',
      '  "options": [ {"text": "...", "stat": "str|agi|con|int|per|wit|cha", "difficulty": "easy|medium|hard|deadly"} x3 ]',
      '}',
      'Ровно 3 варианта действий, каждый не длиннее 12 слов. Только JSON, без пояснений.',
      '',
      'ВАЖНО: пиши предельно коротко — ответ должен целиком влезть в лимит длины.',
      'Про класс, вид и происхождение героя здесь не пиши: их мастер придумывает отдельным ответом.'
    );
    return lines.join('\n');
  }

  /* ---------------------------------------------------------- */
  /* Герой от мастера (отдельный короткий запрос)               */
  /* ---------------------------------------------------------- */

  /**
   * Мастер придумывает героя под конкретную игру отдельным ответом.
   * Формат — строки, а не JSON: у бесплатного канала жёсткий лимит длины ответа,
   * а обрезанный список строк всё равно читается построчно.
   */
  /**
   * Системная роль для запроса героя: тот же мастер, но без JSON-контракта сцены —
   * ответ должен быть коротким и по делу.
   */
  const HERO_SYSTEM_PROMPT = [
    'Ты — ведущий (гейм-мастер) текстовой ролевой игры на русском языке.',
    'Тебе называют игру — ты придумываешь героя строго под неё: класс, вид, происхождение.',
    'Отвечай сразу, без рассуждений, без пояснений и без markdown — только строками нужного формата.'
  ].join('\n');

  /**
   * Промпт героя: короткий, но с жёсткой связкой «мир → класс → происхождение → вид».
   * Маленькая модель выдаёт осмысленный набор только когда видит конфликт истории
   * и то, как каждый вариант в него встроен.
   */
  function buildHeroPrompt(config, baseScenario, opts) {
    const c = config || emptyWorldConfig();
    const s = baseScenario || null;
    const o = opts || {};
    const variant = Number(o.variant) || 0;
    const used = Array.isArray(o.used) ? o.used.filter(Boolean).slice(0, 18) : [];
    const game = c.gameName || c.title || (s && s.title) || 'своя игра';
    const genre = c.genre || (s && s.genre) || '';
    const threat = heroPromptThreat(c, s);
    const details = [];
    if (c.place) details.push(`место действия: ${c.place}`);
    if (c.role) details.push(`роль героя в истории: ${c.role}`);
    if (Array.isArray(c.ingredients) && c.ingredients.length) details.push(`важные детали мира: ${c.ingredients.slice(0, 6).join(', ')}`);
    if (c.tone) details.push(`тон: ${c.tone}`);
    if (c.gameName && c.gameName !== c.title) details.push(`игра игрока: ${c.gameName}`);
    return [
      'Ты придумываешь героя для текстовой RPG.',
      `ИГРА: «${game}»${genre ? ' — ' + genre : ''}.`,
      s && s.systemHint ? `Мир игры: ${s.systemHint}.` : '',
      details.length ? 'Что известно о мире: ' + details.join('; ') + '.' : '',
      `ГЛАВНОЕ В ЭТОЙ ИСТОРИИ: ${threat}. Все варианты — про это.`,
      '',
      'Сначала одна фраза: какая беда у этого мира и что здесь вообще можно делать.',
      'Потом ответь строками, без заголовков и пояснений.',
      '',
      'М: метка выбора класса одним словом (Школа, Роль, Путь, Класс, Клан)',
      'К: класс|чем занимается ГЕРОЙ и как решает ГЛАВНУЮ задачу Мира|Сила+2 Ловкость+1|Название приёма :: что делает',
      'П: происхождение|предмет|крючок в сюжет (до 7 слов)',
      'Р: вид или раса|врождённая особенность (до 6 слов)',
      '',
      'Правила, без них набор бессвязный:',
      '- класс — конкретное занятие в ЭТОМ мире (его профессия, фракция, орден), а не «воин» и «маг»;',
      '- в подсказке класса видно, как он берётся за главную задачу;',
      '- происхождение даёт предмет, который пригодится именно тут, и крючок, ведущий к главной задаче;',
      '- вид даёт врождённую особенность, которая либо помогает здесь, либо мешает здесь;',
      '- характеристики подходят занятию: ловкачу — Ловкость, книжнику — Разум. Не больше +2 к одной,',
      '  суммарно не больше +4, минус не ниже -2. Названия: Сила, Ловкость, Телосложение,',
      '  Разум, Восприятие, Воля, Обаяние.',
      '- приём класса делает что-то наглядное в бою или в проверке: лечение, метка, щит, рывок, чужой голос.',
      '',
      'Пример (для другой игры, содержимое придумай своё):',
      'За беда: ржавый эшелон тридцать лет стоит поперёк трассы, и по нему лезут те, кто ждёт ночи.',
      'К: Смотритель депо|караулит вагон с водой и знает, кому можно верить|Разум+2 Восприятие+1|Сигнальный огонь :: отмечает цель, союзники бьют точнее',
      'П: Дочь стрелочника|ключ от служебной двери|помнит, что отец сам открыл ворота',
      'Р: Пепельный|в темноте видишь больше остальных',
      '',
      'Нужно 4 строки К, 3 строки П и 3 строки Р.',
      'Если в этой истории нет выбора происхождения — строк П нет. Если нет видов — строк Р нет.',
      variant > 1 ? `Это ${variant}-й заход: придумай ДРУГИХ героев, не повторяй прошлых вариантов.` : '',
      used.length ? `Уже были: ${used.join(', ')} — их больше не предлагай.` : ''
    ].filter(Boolean).join('\n');
  }

  /** Главный конфликт истории: короткая строка, которой мастер обязан держаться. */
  function heroPromptThreat(config, baseScenario) {
    const c = config || {};
    const s = baseScenario || null;
    const goal = String(c.goal || (s && s.goal) || '').trim();
    if (goal) return goal.replace(/\.$/, '');
    const opening = String((s && s.opening) || '').trim();
    if (opening) return opening.split(/[.!?]/)[0].slice(0, 120);
    return 'угроза, которая вот-вот накроет это место';
  }

  /** Первая буква заглавная: мастер часто отвечает строчными. */
  function capitalize(text) {
    const t = String(text || '').trim();
    return t ? t[0].toUpperCase() + t.slice(1) : t;
  }

  /** «приём :: Название — что делает» → {name, desc}. Хвост без разделителя тоже разбираем. */
  function splitAbility(raw) {
    let t = String(raw || '')
      .replace(/^(приём|прием|умение|способность|особенность|фишка)\s*[:\-–—]*\s*/i, '')
      .trim();
    if (!t) return null;
    const parts = t.split(/\s*::\s*|\s+[—–]\s+|\s*-\s+/).filter(Boolean);
    if (parts.length > 1) return { name: capitalize(parts[0]), desc: parts.slice(1).join(' ').trim() };
    const words = t.split(/\s+/);
    if (words.length <= 4) return { name: capitalize(t), desc: '' };
    return { name: capitalize(words.slice(0, 3).join(' ')), desc: words.slice(3).join(' ') };
  }

  /** «Сила+2 Ловкость+1» → {Сила: 2, Ловкость: 1}: движок сам приведёт ключи к str/agi. */
  function parseBonusText(raw) {
    const t = String(raw || '');
    const out = {};
    const re = /([A-Za-zА-Яа-яЁё]{3,14})\s*(?:[:=]\s*)?([+\-−]\s*\d+)/g;
    let m;
    while ((m = re.exec(t))) {
      const key = m[1].trim();
      const value = Number(m[2].replace(/[−\s]/g, ''));
      if (!isFinite(value) || value === 0) continue;
      if (!STAT_ALIASES[key.toLowerCase()]) continue;
      out[key] = value;
    }
    return out;
  }

  /**
   * Разбор ответа мастера о герое: строки «М/К/П/Р» или, если мастер всё-таки
   * ответил JSON-ом, обычный объект с теми же полями.
   */
  function parseHeroReply(text) {
    // служебные токены маленьких моделей вроде <|endoftext|> игроку видеть незачем
    const t = String(text || '').replace(/<\|[^|]*\|>/g, '').replace(/<!--[\s\S]*?-->/g, '').trim();
    if (!t) return null;
    const raw = { classes: [], races: [], origins: [] };
    if (t.indexOf('{') >= 0) {                                   // мастер выбрал JSON
      const data = extractJsonObject(t);
      const hero = (data && data.hero && typeof data.hero === 'object') ? data.hero : data;
      if (hero && (hero.classes || hero.races || hero.origins)) {
        raw.classes = Array.isArray(hero.classes) ? hero.classes : [];
        raw.races = Array.isArray(hero.races) ? hero.races : [];
        raw.origins = Array.isArray(hero.origins) ? hero.origins : [];
        raw.classLabel = hero.classLabel; raw.raceLabel = hero.raceLabel; raw.originLabel = hero.originLabel;
        raw.note = hero.note;
        if (raw.classes.length) return raw;
      }
    }
    // построчный формат: «К: класс|подсказка|бонусы|приём :: описание»
    const seen = {};
    t.split(/\r?\n/).forEach(line => {
      const m = /^\s*([МMKКПPРHОO])\s*[:.)]\s*(.+)$/.exec(line);
      if (!m) return;
      const tag = m[1].toUpperCase();
      const kind = (tag === 'М' || tag === 'M') ? 'label'
        : (tag === 'К' || tag === 'K') ? 'classes'
        : (tag === 'П' || tag === 'P') ? 'origins'
        : (tag === 'Р' || tag === 'R' || tag === 'О' || tag === 'O' || tag === 'H') ? 'races' : '';
      if (!kind) return;
      const fields = m[2].split('|').map(x => x.trim()).filter(x => x !== '');
      if (kind === 'label') {
        const marks = fields.length > 1 ? fields : m[2].split(/[/,]/).map(x => x.trim());
        raw.classLabel = marks[0] || '';
        raw.raceLabel = marks[1] || '';
        raw.originLabel = marks[2] || '';
        return;
      }
      const title = capitalize((fields[0] || '').replace(/^[-–—\s]+/, '').replace(/[.,;:]+$/, '').slice(0, 40));
      if (!title || title.length < 2) return;
      const key = kind + ':' + title.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      const rest = fields.slice(1);
      if (kind === 'classes') {
        // бонус мастер обычно ставит третьим полем, но иногда пропускает его:
        // тогда всё, что после подсказки, — описание приёма
        const bonusField = parseBonusText(rest[1] || '');
        const hasBonus = Object.keys(bonusField).length > 0;
        const abilityFields = hasBonus ? rest.slice(2) : rest.slice(1);
        raw.classes.push({
          title,
          hint: rest[0] || '',
          bonus: bonusField,
          ability: splitAbility(abilityFields.join(' :: '))
        });
      } else if (kind === 'origins') {
        raw.origins.push({
          title,
          item: rest[0] || '',
          hook: (rest[1] || rest[0] || '').replace(/^крючок\s*[«"':]*\s*/i, '')
        });
      } else {
        raw.races.push({ title, trait: rest[0] || '', bonus: parseBonusText(rest[1] || '') });
      }
    });
    return raw;
  }

  /** Ключевые слова варианта → характеристика, которой он живёт. */
  const STAT_HINTS = [
    [/воин|боец|солдат|ратник|страж|щит|силач|рыцар|паладин|кулак|молот|берсерк|натиск|штурм|гвард|кузнец|мясник/i, 'str'],
    [/вор|плут|разбой|тень|ловкач|ассасин|скороход|акробат|карманник|луч|стрел|танцор|гимнаст/i, 'agi'],
    [/следопыт|разведчик|наблюдат|егер|охотник|дозорн|разведк|сыщик|внимательн|звезд|облач|небес|созвезд|навигат/i, 'per'],
    [/жрец|шаман|стоик|врач|лекарь|целител|монах|выносл|выживш|путник|странник|пилигрим|скитал|караван|закал|дыхан/i, 'con'],
    [/маг|учён|учен|чародей|инженер|нетраннер|механик|алхимик|книжник|архив|писарь|картограф|изобрет|аналитик|хранитель зна/i, 'int'],
    [/бард|дипломат|фиксер|торговец|купец|переговор|посол|сказител|лицедей|певец|глашатай/i, 'cha'],
    [/воля|упрям|несда|фанатик|мечтател|пророк|визионер|аскет|зов|клятв/i, 'wit']
  ];

  /** Вторая характеристика для пары: чтобы бонусы не сливались в одну строку. */
  const STAT_SECOND = { str: 'con', agi: 'per', con: 'str', int: 'wit', per: 'agi', wit: 'con', cha: 'wit' };

  /** Характеристика по смыслу варианта: чтобы у класса всегда были числа. */
  function statForText(text) {
    const t = String(text || '');
    for (const [re, stat] of STAT_HINTS) if (re.test(t)) return stat;
    return 'wit';
  }

  /**
   * Досыпаем то, чего мастер не дал: характеристики, особенность вида, предмет
   * и крючок происхождения. Иначе набор остаётся бессвязным списком названий.
   */
  function fillProfileGaps(profile) {
    if (!profile) return profile;
    (profile.classes || []).forEach(c => {
      if (!c.bonus || !Object.keys(c.bonus).length) {
        const main = statForText(c.title + ' ' + (c.hint || ''));
        const second = STAT_SECOND[main] || 'wit';
        c.bonus = {}; c.bonus[main] = 2; c.bonus[second] = 1;
      }
      if (!c.ability || !c.ability.name) {
        c.ability = abilityFromOption((c.hint || '') + ' ' + c.title, c.id);
      }
      if (!c.hint) c.hint = c.ability.desc || 'держит удар там, где другие отступают';
    });
    (profile.races || []).forEach(r => {
      if (!r.trait) r.trait = /эльф|лес|тир|ночн/i.test(r.title) ? 'видишь в темноте и читаешь следы'
        : /дварф|гном|камен|гор/i.test(r.title) ? 'яд, холод и голод переносишь легче'
        : /орк|ороч|гобл|велик/i.test(r.title) ? 'сила бьёт первой, и это спасало не раз'
        : /механ|робот|синт|андроид|конструкт/i.test(r.title) ? 'тело чинится, сны — нет'
        : 'твой вид чувствует опасность раньше остальных';
    });
    (profile.origins || []).forEach(o => {
      if (!o.item) o.item = /мор|порт|рыбак|корабл/i.test(o.hook + ' ' + o.title) ? 'сеть с грузилами'
        : /город|улиц|трущоб/i.test(o.hook + ' ' + o.title) ? 'спрятанный нож'
        : /войн|солдат|отряд|фронт/i.test(o.hook + ' ' + o.title) ? 'потёртый жетон'
        : 'вещь, которую ты не показываешь никому';
      if (!o.hook) o.hook = 'за тобой тянется долг, о котором лучше не вспоминать';
    });
    return profile;
  }

  /**
   * Профиль героя из ответа мастера. null — мастер не справился, вызывающий
   * берёт встроенную таблицу игр, поэтому экран героя не остаётся пустым.
   */
  function heroProfileFromText(text, fallbackLabels) {
    const raw = parseHeroReply(text);
    if (!raw || !raw.classes || raw.classes.length < 2) return null;   // обрывок вместо набора — не берём
    if (!raw.races) raw.races = [];
    if (!raw.origins) raw.origins = [];
    // мастер не дошёл ни до происхождений, ни до видов — скорее оборвался ответ,
    // чем «их нет»: тогда оставляем привычные шаги, чтобы игрок не остался без выбора
    if (!raw.races.length && !raw.origins.length) { raw.races = null; raw.origins = null; }
    const profile = heroProfileFromWorld(raw);
    fillProfileGaps(profile);
    profile.source = 'ai';
    const fb = fallbackLabels || {};
    if (!raw.classLabel && fb.classLabel) profile.classLabel = fb.classLabel;
    if (!raw.raceLabel && fb.raceLabel) profile.raceLabel = fb.raceLabel;
    if (!raw.originLabel && fb.originLabel) profile.originLabel = fb.originLabel;
    profile.note = typeof raw.note === 'string' && raw.note.trim()
      ? raw.note.trim().slice(0, 200)
      : 'Герой придуман под эту игру — «Другой набор» позовёт его снова';
    return profile;
  }


  /* ---------------------------------------------------------- */
  /* Память кампании: что мастер обязан помнить                 */
  /* ---------------------------------------------------------- */

  function emptyMemory() {
    return {
      facts: [],        // короткие факты о мире
      deeds: [],        // последние поступки героя (4 штуки — и хватит)
      npcs: [],         // знакомые персонажи: имя, роль, отношение, манера речи
      threads: [],      // незакрытые нити сюжета
      openings: [],     // как начинались последние сцены (мастеру — «так не начинай»)
      place: '',        // где мы сейчас
      idle: 0,          // ходов без продвижения к цели
      setbacks: 0       // сколько раз герой уже выкрутился из безнадёги
    };
  }

  /** Память кампании: у старых сохранений её нет — досыпаем поля. */
  function memoryOf(game) {
    if (!game.memory || typeof game.memory !== 'object') game.memory = emptyMemory();
    const m = game.memory;
    if (!Array.isArray(m.facts)) m.facts = [];
    if (!Array.isArray(m.deeds)) m.deeds = [];
    if (!Array.isArray(m.npcs)) m.npcs = [];
    if (!Array.isArray(m.threads)) m.threads = [];
    if (!Array.isArray(m.openings)) m.openings = [];
    if (typeof m.place !== 'string') m.place = '';
    if (!Number.isFinite(m.step)) m.step = 0;
    if (!Number.isFinite(m.idle)) m.idle = 0;
    if (!Number.isFinite(m.setbacks)) m.setbacks = 0;
    return m;
  }

  /** Правила игры: тон, жёсткость, цена поражения, озвучка. Игрок может менять. */
  const TONES = [
    { id: 'grim', title: 'Мрачно', hint: 'холод, усталость, цена решений' },
    { id: 'heroic', title: 'Героично', hint: 'размах, подвиги, надежда' },
    { id: 'ironic', title: 'С иронией', hint: 'сухой юмор, нелепые совпадения' }
  ];
  const RATINGS = [
    { id: 'soft', title: 'Мягко', hint: 'без жестоких подробностей' },
    { id: 'normal', title: 'Как в книге', hint: 'кровь и потери уместны' },
    { id: 'hard', title: 'Жёстко', hint: 'мир не жалеет героя' }
  ];
  function defaultRules() {
    return { tone: 'grim', rating: 'normal', defeat: 'cost', voice: false, ambient: true };
  }
  function rulesOf(game) {
    const r = Object.assign(defaultRules(), game.rules || {});
    game.rules = r;
    return r;
  }

  /** Строка про тон и жёсткость — уходит мастеру вместе с промптом хода. */
  function rulesLine(game) {
    const r = rulesOf(game);
    const tone = (TONES.find(t => t.id === r.tone) || TONES[0]).hint;
    const rating = (RATINGS.find(x => x.id === r.rating) || RATINGS[1]).hint;
    return `ТОН РАССКАЗА: ${tone}. ЖЁСТКОСТЬ: ${rating}.`;
  }

  /** Компактный блок памяти: то, что мастер должен помнить о прошлом. */
  function memoryBlock(game) {
    const m = memoryOf(game);
    const plan = (game.intro && game.intro.plan) || game.plan || [];
    const idx = Math.max(0, Math.min(plan.length - 1, Number.isFinite(m.step) ? m.step : 0));
    const step = plan.length ? plan[idx] : '';
    const known = m.npcs.slice(-6).map(n => {
      const bits = [n.role, n.attitude, n.voice ? 'говорит: ' + n.voice : ''].filter(Boolean);
      return bits.length ? `${n.name} (${bits.join(', ')})` : n.name;
    });
    return [
      m.place ? `ГДЕ МЫ: ${m.place}.` : '',
      step ? `ШАГ ПЛАНА: ${step}${m.idle >= 2 ? ` — ${m.idle} хода без сдвига, пора двигать историю` : ''}` : '',
      m.facts.length ? `ПОМНИ: ${m.facts.slice(-6).join('; ')}.` : '',
      m.deeds.length ? `ЧТО ДЕЛАЛ ГЕРОЙ: ${m.deeds.join('; ')}.` : '',
      known.length ? `ЗНАКОМЫЕ ЛЮДИ (используй их, новых вводи не больше одного): ${known.join('; ')}.` : '',
      m.threads.length ? `НЕЗАКРЫТЫЕ НИТИ: ${m.threads.slice(-4).join('; ')}.` : '',
      m.setbacks >= 2 ? 'ГЕРОЙ НА ГРАНИ: ещё одно падение — и история закончится. Дай шанс на передышку.' : '',
      m.openings.length ? `НЕ НАЧИНАЙ СЦЕНУ ТАК ЖЕ, КАК РАНЬШЕ: ${m.openings.slice(-4).map(x => '«' + x + '»').join(', ')}.` : '',
      game.legacyBlockText ? String(game.legacyBlockText) : ''
    ].filter(Boolean).join('\n');
  }

  /** Первые слова сцены — чтобы следующая не начиналась так же. */
  function openingOf(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const words = t.split(' ').slice(0, 5).join(' ').replace(/[.,;:!?]+$/, '');
    return words;
  }

  /** Что запомнить после хода: место, NPC, нити, факты, продвижение. */
  function rememberTurn(game, turn, action) {
    const m = memoryOf(game);
    if (turn && turn.place) m.place = String(turn.place).trim().slice(0, 60);
    if (turn && turn.scene) {
      const o = openingOf(turn.scene);
      if (o && m.openings[m.openings.length - 1] !== o) m.openings.push(o);
      if (m.openings.length > 8) m.openings.shift();
    }
    if (turn && (turn.npcObject || turn.npc)) {
      const npc = turn.npcObject || (typeof turn.npc === 'string'
        ? { name: turn.npc, role: '', attitude: '', voice: '' } : turn.npc);
      const name = String(npc.name || '').trim().slice(0, 40);
      if (name) {
        const known = m.npcs.find(n => n.name.toLowerCase() === name.toLowerCase());
        if (known) {
          known.seen = game.turn;
          if (npc.role) known.role = String(npc.role).slice(0, 40);
          if (npc.attitude) known.attitude = String(npc.attitude).slice(0, 40);
          if (npc.voice) known.voice = String(npc.voice).slice(0, 60);
        } else {
          m.npcs.push({
            name, seen: game.turn,
            role: String(npc.role || npc.detail || '').slice(0, 40),
            attitude: String(npc.attitude || '').slice(0, 40),
            voice: String(npc.voice || '').slice(0, 60)
          });
          if (m.npcs.length > 10) m.npcs.shift();
        }
      }
    }
    if (turn && turn.thread) {
      const th = String(turn.thread).trim().slice(0, 90);
      if (th && m.threads.indexOf(th) < 0) {
        m.threads.push(th);
        if (m.threads.length > 6) m.threads.shift();
      }
    }
    if (turn && turn.complication) {
      const c = String(turn.complication).trim().slice(0, 90);
      if (c) rememberFact(game, c);
    }
    if (action && action.text) {
      const deed = actionFact(action);
      if (deed) {
        m.deeds.push(deed.replace('герой сделал: ', ''));
        if (m.deeds.length > 4) m.deeds.shift();
      }
    }
    // продвижение к цели: если ход прошёл впустую, копим «простой»
    if (turn && turn.progress === false) m.idle += 1;
    else if (turn && turn.progress === true) {
      m.idle = 0;
      const plan = (game.intro && game.intro.plan) || game.plan || [];
      if (m.step < plan.length - 1) m.step += 1;      // история идёт вперёд по плану
    }
    return m;
  }

  function actionFact(action) {
    const t = String(action.text || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    return t ? `герой сделал: ${t.toLowerCase()}` : '';
  }

  /** Добавить факт в память: «мост сожжён», «задолжал кузнецу». */
  function rememberFact(game, fact) {
    const m = memoryOf(game);
    const f = String(fact || '').replace(/\s+/g, ' ').trim().slice(0, 110);
    if (!f) return m;
    if (m.facts.some(x => x.toLowerCase() === f.toLowerCase())) return m;
    m.facts.push(f);
    if (m.facts.length > 12) m.facts.shift();
    return m;
  }


  /* ---------------------------------------------------------- */
  /* Арт-направление игры: один стиль на всю кампанию           */
  /* ---------------------------------------------------------- */

  /**
   * Стиль-пак: палитра для процедурного фона, строка для генератора картинок
   * и тема интерфейса. Выбирается один раз при создании игры — поэтому сцены
   * выглядят как одна книга, а не как случайные картинки.
   */
  const ART_PACKS = [
    {
      id: 'grimwood', title: 'Мрачное средневековье', theme: 'night',
      palette: ['#0d1418', '#2b3f45', '#9fe6d0'],
      imageStyle: 'grim fantasy illustration, muted olive and ash palette, soft fog, film grain, painterly'
    },
    {
      id: 'neon', title: 'Неон и дождь', theme: 'neon',
      palette: ['#0a0a14', '#241a4a', '#68e1ff'],
      imageStyle: 'cyberpunk illustration, neon cyan and magenta, wet asphalt reflections, volumetric haze'
    },
    {
      id: 'parchment', title: 'Пергамент и чернила', theme: 'parchment',
      palette: ['#1b1710', '#4a3a24', '#e5c98a'],
      imageStyle: 'ink and watercolor illustration on parchment, warm sepia, visible brush strokes'
    },
    {
      id: 'cosmos', title: 'Холодный космос', theme: 'night',
      palette: ['#05070f', '#152036', '#8fb7ff'],
      imageStyle: 'sci-fi illustration, cold blue light, brushed metal, deep space contrast'
    },
    {
      id: 'desert', title: 'Выжженные пески', theme: 'parchment',
      palette: ['#191207', '#523a1c', '#f0b357'],
      imageStyle: 'sun-bleached desert illustration, ochre and rust, heat haze, harsh shadows'
    },
    {
      id: 'noir', title: 'Нуар', theme: 'night',
      palette: ['#0b0c0e', '#2a2d33', '#d9d2c0'],
      imageStyle: 'film noir illustration, black and white with one warm accent, hard shadows, rain'
    }
  ];

  const ART_RULES = [
    [/ведьмак|witcher|сказ|фэнтез|fantasy|средневеков|рыцар|дракон|магия|меч/i, 'parchment'],
    [/киберпанк|cyberpunk|нейро|tech|техно|робот|хакер|город будущ|найт-сити/i, 'neon'],
    [/космос|space|звездолёт|звездолет|орбит|галактик|станц|helios|марс/i, 'cosmos'],
    [/пустош|постапок|песок|пустын|wasteland|радиац|выживш/i, 'desert'],
    [/нуар|noir|детектив|мафия|гангстер|дождлив|город/i, 'noir'],
    [/мир|forest|лес|тропа|деревн/i, 'grimwood']
  ];

  /** Стиль-пак для этой игры: по её жанру, названию и классу героя. */
  function artStyleFor(config, scenario, opts) {
    const c = config || {};
    const s = scenario || {};
    const o = opts || {};
    const hay = [c.gameName, c.title, c.genre, c.place, (c.ingredients || []).join(' '), s.title, s.genre, s.systemHint, o.gameName]
      .filter(Boolean).join(' ');
    let pack = null;
    for (const [re, id] of ART_RULES) {
      if (re.test(hay)) { pack = ART_PACKS.find(p => p.id === id); break; }
    }
    if (!pack) {
      // незнакомая история: стиль выбираем устойчиво по названию, а не случайно
      let n = 0;
      const key = String(o.gameName || c.gameName || c.title || s.title || 'игра');
      for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) % 100000;
      pack = ART_PACKS[n % ART_PACKS.length];
    }
    return {
      id: pack.id, title: pack.title, theme: pack.theme,
      palette: pack.palette.slice(), imageStyle: pack.imageStyle
    };
  }

  function styleOf(game) {
    if (!game.style || !game.style.imageStyle) {
      game.style = artStyleFor(game.worldConfig, scenarioById(game.scenarioId), { gameName: game.title });
    }
    return game.style;
  }

  /** Строка стиля — приклеивается к каждому промпту картинки. */
  function stylePrompt(game) {
    return styleOf(game).imageStyle;
  }

  /* ---------------------------------------------------------- */
  /* Слои сцены: фон локации + то, что на нём происходит         */
  /* ---------------------------------------------------------- */

  /**
   * Ключ места: по нему переиспользуем картинку локации. Одинаковое место —
   * одинаковый фон, поэтому «действие» можно менять, не перерисовывая мир.
   */
  function placeKey(game, place) {
    const raw = String(place || '').toLowerCase().replace(/[«»"'.,!?:;()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!raw) return '';
    const words = raw.split(' ').slice(0, 4).join('-');
    return (styleOf(game).id + ':' + words).slice(0, 60);
  }

  /**
   * Основы слов места. Русские слова короткие, поэтому берём три буквы после
   * отбрасывания хвостов: «песчаного песка» → «пес пес».
   */
  function placeStems(place) {
    const ENDINGS = /(ого|его|ому|ему|ыми|ими|ыми|ых|их|ий|ый|ой|ая|яя|ое|ее|ые|ие|ами|ями|ах|ях|ов|ев|ам|ям|ом|ем|ы|и|а|я|е|у|ю|ь)$/;
    return String(place || '').toLowerCase().replace(/ё/g, 'е').replace(/[^а-яa-z0-9 ]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2)
      .map(w => {
        const cut = w.replace(ENDINGS, '');
        return (cut.length >= 3 ? cut : w).slice(0, 3);
      });
  }

  /**
   * То же ли это место, что и в прошлой сцене? Мастер каждый ход называет место
   * своими словами, поэтому сравниваем основы слов и тип местности. Совпали —
   * фон остаётся прежним, меняется только слой действия.
   */
  function isSamePlace(prevPlace, nextPlace) {
    if (!prevPlace || !nextPlace) return false;
    const a0 = String(prevPlace).toLowerCase().replace(/ё/g, 'е');
    const b0 = String(nextPlace).toLowerCase().replace(/ё/g, 'е');
    if (a0 === b0) return true;
    const a = placeStems(a0);
    const b = placeStems(b0);
    if (!a.length || !b.length) return false;
    const set = {};
    a.forEach(w => { set[w] = 1; });
    const shared = b.filter(w => set[w]).length;
    if (!shared) return false;
    // одно общее слово уже о многом говорит; для разных типов местности этого мало
    if (shared >= Math.ceil(Math.min(a.length, b.length) * 0.5)) return true;
    return sceneKindFromText(a0) === sceneKindFromText(b0) && shared >= 1;
  }

  /** Портрет героя: одна картинка на всю кампанию. */
  function portraitPrompt(game) {
    const h = game.hero;
    const race = h.raceName || '';
    const cls = h.className || '';
    const look = [cls, race].filter(Boolean).join(', ');
    return `character portrait, ${look}, head and shoulders, dramatic side light, no text, ${styleOf(game).imageStyle}`;
  }

  /** Промпт картинки локации: место и свет, без людей — их рисует слой действия. */
  function placePrompt(game, place, aiPrompt, opts) {
    const o = opts || {};
    const kind = sceneKindFromText([place, game.title, aiPrompt].filter(Boolean).join(' '));
    const look = { forest: 'ancient forest', city: 'city street and market', space: 'space station',
      caves: 'cave interior', ruins: 'old ruins', sea: 'harbour at the water', desert: 'desert dunes' }[kind] || 'empty landscape';
    const base = String(aiPrompt || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return `wide establishing shot of ${look}${place ? ' — ' + String(place).slice(0, 60) : ''}, ` +
      `${base ? base + ', ' : ''}empty scenery with no characters in focus, cinematic light, no text` +
      (o.noStyle ? '' : ', ' + styleOf(game).imageStyle);
  }

  /* ---------------------------------------------------------- */
  /* Фильтр стиля: убираем артефакты маленькой модели            */
  /* ---------------------------------------------------------- */

  const BAD_PHRASES = [
    /<\|[^|]*\|>/g, /<!--[\s\S]*?-->/g, /```[a-z]*/gi,
    /\b(reasoning|assistant|system|user)\s*:/gi
  ];

  /**
   * Приводим текст мастера в человеческий вид: без обрывков разметки, без
   * повторяющихся предложений, без служебных токенов и без «полотна».
   */
  function polishSceneText(text, limit) {
    let t = String(text || '');
    BAD_PHRASES.forEach(re => { t = t.replace(re, ' '); });
    t = t.replace(/^\s*(сцена|scene|текст|narration)\s*[:—-]\s*/i, '');
    t = t.replace(/\s+([.,;:!?])/g, '$1').replace(/([!?.,])\1{2,}/g, '$1').replace(/\s{2,}/g, ' ');
    // убираем предложения, повторённые почти дословно
    const seen = [];
    const parts = t.split(/(?<=[.!?…])\s+/);
    const kept = parts.filter(sentence => {
      const key = sentence.toLowerCase().replace(/[^а-яёa-z0-9 ]/g, '').slice(0, 40);
      if (!key) return false;
      if (seen.indexOf(key) >= 0) return false;
      seen.push(key);
      return true;
    });
    t = kept.join(' ').trim();
    const max = limit || 620;
    if (t.length > max) {
      const cut = t.slice(0, max);
      const stop = Math.max(cut.lastIndexOf('.'), cut.lastIndexOf('!'), cut.lastIndexOf('?'));
      t = stop > max * 0.5 ? cut.slice(0, stop + 1) : cut.trim() + '…';
    }
    return t.trim();
  }

  /** Варианты действий: убираем дубликаты и следим, чтобы подходы различались. */
  function dedupeOptions(options) {
    const out = [];
    const stats = {};
    (options || []).forEach(opt => {
      if (!opt) return;
      const key = String(opt.text || '').toLowerCase().replace(/[^а-яёa-z ]/g, '').split(' ').slice(0, 4).join(' ');
      if (out.some(o => String(o.text || '').toLowerCase().replace(/[^а-яёa-z ]/g, '').split(' ').slice(0, 4).join(' ') === key)) return;
      out.push(opt);
      stats[opt.stat] = (stats[opt.stat] || 0) + 1;
    });
    // если все три про одно и то же — заменяем последний на другой подход
    if (out.length >= 2 && Object.keys(stats).length === 1) {
      const other = GENERIC_OPTIONS.filter(o => o.stat !== out[0].stat);
      if (other.length) {
        out[out.length - 1] = Object.assign({}, rnd.pick(other), { id: out[out.length - 1].id });
      }
    }
    return out;
  }

  /* ---------------------------------------------------------- */
  /* Финал кампании: победа, цена поражения и эпилог             */
  /* ---------------------------------------------------------- */

  /**
   * Что случилось, когда герой дошёл до нуля здоровья. По умолчанию мир не
   * убивает сразу: поражение стоит дорого, но история продолжается.
   */
  function resolveDefeat(game) {
    const rules = rulesOf(game);
    const m = memoryOf(game);
    if (rules.defeat === 'hard' || m.setbacks >= 3) {
      game.over = true;
      return { kind: 'downfall', reviveAt: 0, note: 'История героя закончилась здесь.' };
    }
    m.setbacks += 1;
    const lost = game.hero.inventory.length ? game.hero.inventory.pop() : '';
    const hp = Math.max(2, Math.round(game.hero.maxHp * 0.3));
    game.hero.hp = hp;
    const note = lost
      ? `Герой выжил, но потерял «${lost}».`
      : 'Герой выжил, но мир запомнил его слабость.';
    rememberFact(game, note);
    return { kind: 'setback', reviveAt: hp, note: lost ? `Потеряно: ${lost}` : '', lost };
  }

  /** Эпилог кампании: короткая летопись по фактам, NPC и главам. */
  function epilogueText(game) {
    const m = memoryOf(game);
    const h = game.hero;
    const allies = m.npcs.filter(n => n.attitude && /друж|союз|верн|благодар/i.test(n.attitude)).map(n => n.name);
    const enemies = m.npcs.filter(n => n.attitude && /враж|ненав|hostile|мстит/i.test(n.attitude)).map(n => n.name);
    const chapters = [];
    (game.log || []).forEach(e => {
      const ch = e.chapter || (e.meta && e.meta.chapter);
      if (ch && chapters.indexOf(ch) < 0) chapters.push(ch);
    });
    const kind = game.ending || (game.questDone ? 'victory' : 'downfall');
    const lines = [];
    lines.push(kind === 'victory'
      ? `${h.name} довёл дело до конца: ${String(game.goal || '').replace(/\.$/, '')}.`
      : `${h.name} не дошёл до конца — история оборвалась на ${game.turn || 1}-м ходу.`);
    if (chapters.length) lines.push(`Пройденный путь: ${chapters.slice(-5).join(' → ')}.`);
    const clean = arr => arr.map(x => String(x).replace(/[.\s]+$/, '')).join('; ');
    if (m.facts.length) lines.push(`Что осталось в памяти: ${clean(m.facts.slice(-4))}.`);
    if (m.deeds.length) lines.push(`Что успел сделать: ${clean(m.deeds)}.`);
    if (allies.length) lines.push(`Рядом были: ${allies.slice(0, 4).join(', ')}.`);
    if (enemies.length) lines.push(`Не забыли героя: ${enemies.slice(0, 4).join(', ')}.`);
    if (game.turn) lines.push(`Ходов: ${game.turn}${m.setbacks ? `, из них на грани: ${m.setbacks}` : ''}.`);
    return lines.join('\n');
  }

  /** Запрос мастеру на эпилог — 3 абзаца, второе лицо, финальный аккорд. */
  function buildEpiloguePrompt(game) {
    const m = memoryOf(game);
    return [
      'История подошла к концу. Напиши эпилог.',
      worldDescription(game),
      heroDescription(game),
      m.facts.length ? `ЧТО БЫЛО: ${m.facts.slice(-8).join('; ')}` : '',
      m.npcs.length ? `КТО БЫЛ РЯДОМ: ${m.npcs.map(n => `${n.name} (${n.role})`).join(', ')}` : '',
      `ЧЕМ КОНЧИЛОСЬ: ${game.questDone ? 'цель достигнута' : 'герой пал'}, ходов: ${game.turn}.`,
      rulesLine(game),
      'Ответь строго одним JSON-объектом: {"epilogue": "3 коротких абзаца, разделённых \\n\\n", "title": "название финала, 2-4 слова"}'
    ].filter(Boolean).join('\n\n');
  }


  /* ---------------------------------------------------------- */
  /* Наследие: прошлые кампании влияют на новые                  */
  /* ---------------------------------------------------------- */

  const LEGACY_KEY = 'dt2:legacy';

  function emptyLegacy() {
    return {
      version: 1,
      runs: 0,           // завершённых кампаний
      victories: 0,
      defeats: 0,
      ashes: 0,          // «пепел памяти»: валюта наследия
      heroes: [],        // летопись: имя, класс, чем кончилось
      deeds: [],         // яркие дела из прошлых жизней (для мастера)
      unlocked: {}       // id → true
    };
  }

  /**
   * Что открывается за завершённые кампании. Первое — всегда, дальше реже.
   * Всё это сразу играбельно: происхождение, классы, вид, дары.
   */
  const LEGACY_UNLOCKS = [
    {
      id: 'origin-memory', need: 1, kind: 'origin', title: 'Помнящий прошлое',
      desc: 'Происхождение: герой помнит свою прошлую жизнь и смерть.',
      option: {
        id: 'lg-memory', title: 'Помнящий прошлое', icon: '🕯️', bonus: { wit: 1, per: 1 },
        hint: 'помнит, как это было в прошлый раз',
        item: 'пепел прошлой жизни',
        hook: 'в новой жизни его тянет к месту, где всё кончилось'
      }
    },
    {
      id: 'class-heir', need: 2, kind: 'class', title: 'Носитель наследия',
      desc: 'Класс с приёмом «Отголосок прошлого»: +3 к броску.',
      option: {
        id: 'lg-heir', title: 'Носитель наследия', icon: '📜', bonus: { int: 2, wit: 1 },
        hint: 'знает то, чего знать не должен',
        ability: { name: 'Отголосок прошлого', desc: 'Вспоминает исход похожего дела' }
      }
    },
    {
      id: 'race-reborn', need: 3, kind: 'race', title: 'Перерождённый',
      desc: 'Вид, который один раз за кампанию возвращается с того света.',
      secondWind: true,
      option: {
        id: 'lg-reborn', title: 'Перерождённый', icon: '🕊️', bonus: { con: 1, wit: 1 },
        hint: 'уже умирал — и вернулся', trait: 'Один раз за кампанию встаёт с 1 здоровьем вместо смерти'
      }
    },
    {
      id: 'perk-relic', need: 4, kind: 'perk', title: 'Реликвия прошлой жизни',
      desc: 'Новая игра начинается с предметом из прошлой кампании.',
      perk: 'relic'
    },
    {
      id: 'perk-echo-stat', need: 6, kind: 'perk', title: 'Память тела',
      desc: 'Герой начинает с +1 к двум характеристикам на выбор.',
      perk: 'stat'
    },
    {
      id: 'class-echo', need: 9, kind: 'class', title: 'Эхо прежнего героя',
      desc: 'Класс с приёмом «Призрак прошлой судьбы»: сразу +4 здоровья.',
      option: {
        id: 'lg-echo', title: 'Эхо прежнего героя', icon: '🌫️', bonus: { str: 1, agi: 1, cha: 1 },
        hint: 'в его тени стоит кто-то ещё',
        ability: { name: 'Призрак прошлой судьбы', desc: 'Восстанавливает 4 здоровья' }
      }
    }
  ];

  /** Что уже открыто при таком запасе пепла. */
  function legacyUnlocked(legacy) {
    const l = legacy || emptyLegacy();
    return LEGACY_UNLOCKS.filter(u => (l.runs >= u.need) || l.unlocked[u.id]);
  }
  function legacyNextUnlock(legacy) {
    const l = legacy || emptyLegacy();
    const open = legacyUnlocked(l).map(u => u.id);
    return LEGACY_UNLOCKS.find(u => open.indexOf(u.id) < 0) || null;
  }

  /** Записываем завершённую кампанию: пепел, летопись, дела, открытия. */
  function applyRunToLegacy(legacy, game) {
    const l = Object.assign(emptyLegacy(), legacy || {});
    const m = memoryOf(game);
    const victory = !!game.questDone;
    const before = legacyUnlocked(legacy || emptyLegacy()).map(u => u.id);   // что было открыто до этой кампании
    l.runs += 1;
    if (victory) { l.victories += 1; l.ashes += 3; } else { l.defeats += 1; l.ashes += 1; }
    l.ashes += Math.min(3, Math.floor((game.turn || 0) / 12));          // за длинную историю — надбавка
    l.heroes.unshift({
      name: game.hero.name, className: game.hero.className, raceName: game.hero.raceName,
      world: game.title, ending: victory ? 'victory' : 'downfall',
      turns: game.turn || 0, at: Date.now()
    });
    if (l.heroes.length > 8) l.heroes.length = 8;
    const deeds = (m ? m.deeds : []).concat(m ? m.facts.slice(-2) : []);
    deeds.forEach(d => {
      const line = String(d).slice(0, 90);
      if (line && l.deeds.indexOf(line) < 0) l.deeds.push(line);
    });
    while (l.deeds.length > 12) l.deeds.shift();
    const after = LEGACY_UNLOCKS.filter(u => l.runs >= u.need).map(u => u.id);
    const opened = after.filter(id => before.indexOf(id) < 0);
    after.forEach(id => { l.unlocked[id] = true; });
    return { legacy: l, opened, ashes: victory ? 3 : 1 };
  }

  /** Человеческая летопись наследия — для экрана и для мастера. */
  function legacySummary(legacy) {
    const l = legacy || emptyLegacy();
    const last = l.heroes[0];
    const text = [
      l.runs ? `Пройдено кампаний: ${l.runs} (побед: ${l.victories}, падений: ${l.defeats}).` : '',
      l.ashes ? `Пепел памяти: ${l.ashes}.` : '',
      last ? `Прошлая жизнь: ${last.name}, ${last.className} — ${last.ending === 'victory' ? 'дошёл до конца' : 'погиб'} в мире «${last.world}».` : '',
      l.deeds.length ? `Помнят о нём: ${l.deeds.slice(-3).join('; ')}.` : ''
    ].filter(Boolean);
    return text.join(' ');
  }

  /** Блок памяти прошлых жизней — уходит мастеру при создании мира. */
  function legacyBlock(legacy) {
    const l = legacy || emptyLegacy();
    if (!l.runs) return '';
    const last = l.heroes[0];
    return [
      'ПАМЯТЬ ПРОШЛЫХ ЖИЗНЕЙ (мир это помнит, но игрок начинает заново):',
      last ? `- в прошлый раз герой по имени ${last.name} (${last.className}) ${last.ending === 'victory' ? 'довёл дело до конца' : 'погиб'} в истории «${last.world}».` : '',
      l.deeds.length ? `- о нём помнят: ${l.deeds.slice(-4).join('; ')}.` : '',
      'Если уместно — оставь в новом мире след прошлой истории: имя на устах, могилу, легенду, похожего человека.',
      'Но не повторяй прошлый сюжет: это новая история с новым героем.'
    ].filter(Boolean).join('\n');
  }

  /** Варианты героя из наследия: их добавляем к любому списку выбора. */
  function legacyOptions(legacy) {
    const open = legacyUnlocked(legacy);
    const out = { classes: [], races: [], origins: [], perks: [] };
    open.forEach(u => {
      if (!u.option) return;
      const copy = Object.assign({}, u.option);
      copy.legacy = true;
      copy.hint = copy.hint || u.desc;
      if (u.kind === 'class') out.classes.push(copy);
      else if (u.kind === 'race') out.races.push(copy);
      else if (u.kind === 'origin') out.origins.push(copy);
      if (u.perk) out.perks.push({ id: u.perk, title: u.title, desc: u.desc });
    });
    return out;
  }

  /** Дары наследия, выбранные игроком: добавляем к герою при создании игры. */
  function applyLegacyGifts(hero, game, gifts) {
    const list = Array.isArray(gifts) ? gifts : [];
    const notes = [];
    list.forEach(gift => {
      if (gift === 'relic') {
        const item = 'реликвия прошлой жизни';
        hero.inventory.push(item);
        notes.push(item);
      }
      if (gift === 'stat') {
        const best = STAT_IDS.slice().sort((a, b) => (hero.stats[b] || 0) - (hero.stats[a] || 0))[0];
        const second = STAT_IDS.filter(id => id !== best).sort((a, b) => (hero.stats[b] || 0) - (hero.stats[a] || 0))[0];
        hero.stats[best] = (hero.stats[best] || 0) + 1;
        hero.stats[second] = (hero.stats[second] || 0) + 1;
        notes.push(`+1 ${statById(best).short} и +1 ${statById(second).short}`);
      }
    });
    if (game.legacy && game.legacy.secondWind) notes.push('перерождение доступно');
    return notes;
  }

  /* ---------------------------------------------------------- */
  /* Случайная подборка миров                                   */
  /* ---------------------------------------------------------- */
  function randomScenarioSet(count) {
    const pool = SCENARIOS.concat(GAME_WORLDS.filter(w => !w.customGame));
    const n = Math.max(2, Math.min(pool.length, count || rnd.int(3, 4)));
    return rnd.shuffle(pool).slice(0, n);
  }

  /* ---------------------------------------------------------- */
  /* Создание игры                                              */
  /* ---------------------------------------------------------- */
  function newGameId() {
    return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function createGame(opts) {
    const { scenarioId, heroName, classId, raceId, originId, worldConfig } = opts;
    const scenario = scenarioById(scenarioId);
    const p = opts.heroProfile || opts.profile || null;   // герой этой игры: варианты мог придумать мастер
    const cls = pickProfileOption(p, 'classes', classId) || classById(classId);
    const race = pickProfileOption(p, 'races', raceId) || raceById(raceId);
    const origin = pickProfileOption(p, 'origins', originId) || originById(originId);
    const stats = statsFor(cls, race, origin);
    const maxHp = maxHpFor({ classId: cls.id, cls, stats });
    const name = (heroName || '').trim().slice(0, 24) || 'Безымянный';
    const cfg = worldConfig ? Object.assign(emptyWorldConfig(), worldConfig) : null;
    return {
      schema: SCHEMA_VERSION,
      id: newGameId(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      scenarioId: scenario.id,
      scenarioTitle: scenario.customGame && cfg && cfg.gameName ? cfg.gameName : scenario.title,
      scenarioBase: scenario.id,
      cover: scenario.cover,
      title: scenario.customGame && cfg && cfg.gameName ? cfg.gameName : scenario.title,
      worldConfig: cfg,
      chapter: 'Пролог',
      turn: 0,
      // память кампании, правила рассказа и арт-направление живут вместе с игрой
      memory: emptyMemory(),
      // след прошлых кампаний: пригодится мастеру и механике «второго дыхания»
      legacy: {
        ashes: (opts.legacy && opts.legacy.ashes) || 0,
        runs: (opts.legacy && opts.legacy.runs) || 0,
        secondWind: !!(opts.legacy && legacyUnlocked(opts.legacy).some(u => u.secondWind)),
        usedSecondWind: false,
        lastHero: (opts.legacy && opts.legacy.heroes && opts.legacy.heroes[0] && opts.legacy.heroes[0].name) || ''
      },
      rules: defaultRules(),
      style: artStyleFor(cfg, scenario, { classId: cls.id, gameName: (cfg && cfg.gameName) || scenario.title }),
      places: {},
      hero: {
        name,
        portrait: '',
        classId: cls.id,
        className: cls.title,
        classIcon: cls.icon,
        raceId: race.id,
        raceName: race.title,
        raceIcon: race.icon,
        originId: origin.id,
        originName: origin.title,
        originIcon: origin.icon,
        archetype: cls.title,          // совместимость с прошлыми версиями
        archetypeId: cls.id,
        icon: cls.icon,
        stats,
        hp: maxHp,
        maxHp,
        inventory: origin.item ? [origin.item] : [],
        hooks: [origin.hook || origin.hint, race.trait].filter(Boolean),
        ability: abilityForHero(cls),
        buff: 0
      },
      legacyGifts: [],
      legacyNotes: [],
      goal: scenario.goal || (cfg && cfg.goal) || '',
      questDone: false,
      over: false,
      scene: null,
      log: [],
      summary: '',
      lastImagePrompt: '',
      usedImagePrompts: []
    };
  }

  /* Город/деревня/лес — по месту старта, для процедурного фона */
  function sceneKindFromText(text) {
    const s = String(text || '').toLowerCase();
    const rules = [
      ['space', /station|ship|orbit|hangar|space|reactor|космич|станци|орбит|корабл|шлюз/],
      ['city', /city|street|neon|tower|urban|market|город|улиц|неон|башн|квартал|порт|док|рынок|площад|лавк/],
      ['ruins', /ruin|temple|shrine|altar|cathedral|руин|храм|алтар|развалин|замок/],
      ['cave', /cave|tunnel|mine|dungeon|cellar|пещер|туннел|шахт|подземел|подвал/],
      ['sea', /sea|ocean|water|harbor|ship|coast|мор|океан|вод|порт|берег|корабл/],
      ['desert', /desert|dune|sand|waste|пустын|дюн|песок|пустош/],
      ['forest', /forest|wood|tree|jungle|лес|дерев|чащ|тайг/],
      ['snow', /snow|ice|frost|frozen|снег|льд|мороз|зим/],
      ['interior', /room|hall|corridor|tavern|hut|bunker|комнат|зал|коридор|трактир|хижин|бункер/]
    ];
    for (const [kind, re] of rules) if (re.test(s)) return kind;
    return 'forest';
  }

  /* ---------------------------------------------------------- */
  /* Подгонка создания героя под конкретную игру                */
  /* «Своя игра» / свой мир: часть параметров может не подходить  */
  /* миру, тогда ИИ их скрывает (пустой список) или переименовывает */
  /* ---------------------------------------------------------- */

  /** Описания для картинок: класс и раса по-английски (промпты на английском). */
  const CLASS_ART = {
    warrior: 'an armored knight with a longsword and round shield',
    rogue: 'a hooded rogue with a dagger',
    scholar: 'a scholar in a coat with a lantern and a book',
    mage: 'a spellcaster with glowing hands',
    diplomat: 'a well-dressed envoy with an ornate cloak',
    wanderer: 'a ranger in a travel cloak with a bow'
  };
  const RACE_ART = {
    human: 'a human hero',
    elder: 'an elven hero with long hair',
    stone: 'a stocky dwarf-like hero',
    beast: 'a beastfolk hero covered in fur',
    construct: 'an android hero with metal plating',
    changed: 'a hero marked by a glowing brand',
    outsider: 'a hero with an otherworldly aura',
    halfblood: 'a mixed-blood hero'
  };
  const heroArtTag = game => {
    const h = (game && game.hero) || {};
    const cls = CLASS_ART[h.classId] || 'a lone hero';
    const race = RACE_ART[h.raceId];
    return race ? race + ', ' + cls : cls;
  };

  /** Совпадение списка из ответа ИИ с нашими вариантами. */
  /* ---------------------------------------------------------- */
  /* Варианты героя, придуманные мастером                        */
  /* Мастер вправе не только переименовать стандартные варианты,  */
  /* но и придумать свои — с бонусами, чертами и особым приёмом.  */
  /* ---------------------------------------------------------- */
  const STAT_ALIASES = {
    сила: 'str', strength: 'str', мощь: 'str', str: 'str',
    ловкость: 'agi', agility: 'agi', dex: 'agi', agi: 'agi', ловк: 'agi',
    телосложение: 'con', тело: 'con', выносливость: 'con', constitution: 'con', con: 'con', end: 'con',
    разум: 'int', интеллект: 'int', intelligence: 'int', знания: 'int', ум: 'int', int: 'int',
    творчество: 'int', смекалка: 'int', изобретательность: 'int', креатив: 'int',
    восприятие: 'per', внимание: 'per', perception: 'per', per: 'per', wis: 'per',
    воля: 'wit', дух: 'wit', wit: 'wit', will: 'wit',
    харизма: 'cha', убеждение: 'cha', charisma: 'cha', cha: 'cha'
  };

  const CUSTOM_ICONS = {
    class: ['🛡️', '🗡️', '📜', '✨', '🎭', '🧭', '🪓', '🎯', '⚙️', '🔮', '🎻', '🧪'],
    race: ['🧍', '🧝', '🐺', '🤖', '🐉', '👽', '🦎', '🪶', '🦌', '🌊', '🕷️', '👑'],
    origin: ['🏙️', '⚔️', '📚', '⛪', '⚓', '👑', '📦', '🌪️', '🎓', '🛠️', '🎲', '🔗']
  };
  function slugId(prefix, title, taken) {
    let n = 0;
    for (let i = 0; i < title.length; i++) n = (n * 31 + title.charCodeAt(i)) % 100000;
    let id = prefix + String(n);
    while (taken[id]) { n = (n + 7) % 100000; id = prefix + String(n); }
    taken[id] = 1;
    return id;
  }
  function iconFrom(kind, title) {
    const pool = CUSTOM_ICONS[kind] || CUSTOM_ICONS.class;
    let n = 0;
    for (let i = 0; i < title.length; i++) n = (n * 17 + title.charCodeAt(i)) % pool.length;
    return pool[n];
  }
  /** Бонусы к характеристикам: не больше +3 в одну и не больше +4 суммарно. */
  function cleanBonus(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const out = {};
    let used = 0;
    Object.keys(raw).forEach(key => {
      const stat = STAT_ALIASES[String(key).toLowerCase().trim()];
      const value = Number(raw[key]);
      if (!stat || !isFinite(value) || value === 0) return;
      if (used >= 3) return;
      out[stat] = clamp(Math.round(value), -2, 3);
      used++;
    });
    const keys = Object.keys(out);
    let sum = keys.reduce((acc, k) => acc + out[k], 0);
    while (sum > 4 && keys.length) {                       // слишком щедро — срезаем
      const k = keys[0];
      out[k] = Math.max(0, out[k] - 1);
      sum = keys.reduce((acc, x) => acc + out[x], 0);
      if (out[k] === 0) { delete out[k]; keys.shift(); }
    }
    return out;
  }
  /** Особый приём класса: мастер даёт название, движок — механику. */
  function abilityFromOption(raw, fallbackClassId) {
    const base = abilityById(classById(fallbackClassId || 'warrior').ability);
    if (!raw) return Object.assign({}, base, { id: base.id });
    const name = (typeof raw === 'string' ? raw : (raw && raw.name) || '').trim().slice(0, 40);
    const desc = (raw && typeof raw === 'object' && typeof raw.desc === 'string') ? raw.desc.trim().slice(0, 140) : '';
    const hay = (name + ' ' + desc).toLowerCase();
    let kind = 'advantage', power = 0, icon = '🌑';
    if (/леч|восстанов|дыхан|реген|бинт|медик|стимпак|настой|пить|жив|исцел/.test(hay)) { kind = 'heal'; power = 4; icon = '💚'; }
    else if (/взлом|анализ|расчёт|расчет|скан|изуч|подготов|засад|след|интуиц|чутьё|чутье|карт|ритуал|взгляд/.test(hay)) { kind = 'bless'; power = 3; icon = '✨'; }
    else if (/слов|уговор|краснореч|бартер|натиск|харизм|убед|приказ|клич|песн/.test(hay)) { kind = 'bless'; power = 3; icon = '💬'; }
    const finalName = name || base.name;
    return {
      id: 'ab-' + (kind + finalName).replace(/\s+/g, '').slice(0, 18),
      name: finalName,
      icon: (raw && typeof raw === 'object' && typeof raw.icon === 'string' && raw.icon.trim()) ? raw.icon.trim().slice(0, 4) : icon,
      kind, power,
      desc: desc || (kind === 'heal' ? 'Сразу +4 здоровья.' : (kind === 'bless' ? '+3 к следующему броску.' : 'Следующий бросок — два d20, берём лучший.')),
      ready: true, cooldown: 0
    };
  }

  /**
   * Разбор списка вариантов героя: строки-ids берут готовые варианты движка,
   * объекты без знакомого id мастер придумывает сам — их и берём как есть.
   */
  function matchOptions(list, raw, kind) {
    if (!Array.isArray(raw)) return null;              // данных нет — список не трогаем
    if (!raw.length) return [];                        // явное «не подходит» — скрываем шаг
    const seen = {};
    const taken = {};
    const out = [];
    raw.forEach((item, i) => {
      if (out.length >= 8) return;
      const src = (item && typeof item === 'object') ? item : { id: item };
      const id = String(src.id || src.name || '').trim().toLowerCase();
      const base = list.find(x => x.id === id);
      const rawTitle = (typeof src.title === 'string' && src.title.trim()) ? src.title.trim() : '';
      if (!base && !rawTitle) return;                  // мусор без названия не берём
      const title = (rawTitle || base.title).slice(0, 40);
      const key = base ? base.id : title.toLowerCase();
      if (seen[key]) return;
      seen[key] = 1;
      const option = base ? Object.assign({}, base) : {
        id: slugId((kind || 'o')[0] + 'x', title, taken),
        title,
        icon: iconFrom(kind, title),
        bonus: {},
        trait: '',
        hook: '',
        item: '',
        flavor: null
      };
      option.title = title;
      option.id = base ? base.id : option.id;
      const hint = (typeof src.hint === 'string' && src.hint.trim()) ? src.hint.trim().slice(0, 140) : '';
      if (hint) option.hint = hint;
      const bonus = cleanBonus(src.bonus);
      if (Object.keys(bonus).length) option.bonus = bonus;
      if (typeof src.trait === 'string' && src.trait.trim()) option.trait = src.trait.trim().slice(0, 160);
      if (typeof src.hook === 'string' && src.hook.trim()) option.hook = src.hook.trim().slice(0, 160);
      if (typeof src.item === 'string' && src.item.trim()) option.item = src.item.trim().slice(0, 40);
      if (kind === 'class' || list === CLASSES) {
        const custom = abilityFromOption(src.ability, base ? base.id : null);
        option.ability = (!base || src.ability) ? custom : base.ability;
      }
      option.renamed = !!base && title !== base.title;
      option.custom = !base;
      out.push(option);
    });
    return out.length ? out : null;                    // сплошь незнакомые id — показываем всё
  }


  const DEFAULT_LABELS = { classLabel: 'Класс', raceLabel: 'Раса / вид', originLabel: 'Происхождение' };

  function defaultHeroProfile(note) {
    return {
      custom: false, fromAI: false,
      classLabel: DEFAULT_LABELS.classLabel,
      raceLabel: DEFAULT_LABELS.raceLabel,
      originLabel: DEFAULT_LABELS.originLabel,
      showClass: true, showRace: true, showOrigin: true,
      classes: CLASSES.slice(), races: RACES.slice(), origins: ORIGINS.slice(),
      note: note || ''
    };
  }

  /**
   * Профиль создания героя по ответу ИИ для конкретной игры.
   * classes — минимум один вариант (класс нужен всегда ради статов и умения);
   * races/origins пустым массивом ИИ говорит «в этой игре такого выбора нет» — шаг скрываем.
   */
  function heroProfileFromWorld(profile) {
    const p = (profile && typeof profile === 'object') ? profile : {};
    if (p.normalized) return p;                        // профиль уже разобран — второй раз не портим
    let classes = matchOptions(CLASSES, p.classes, 'class');
    if (classes && !classes.length) classes = null;    // без класса герой не собирается
    const races = matchOptions(RACES, p.races, 'race');
    const origins = matchOptions(ORIGINS, p.origins, 'origin');
    const label = (v, fb) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 24) : fb);
    return {
      custom: true,
      normalized: true,
      fromAI: !!(p.classes || p.races || p.origins || p.note),
      classLabel: label(p.classLabel, DEFAULT_LABELS.classLabel),
      raceLabel: label(p.raceLabel, DEFAULT_LABELS.raceLabel),
      originLabel: label(p.originLabel, DEFAULT_LABELS.originLabel),
      showClass: true,
      showRace: !(races && !races.length),
      showOrigin: !(origins && !origins.length),
      classes: classes || CLASSES.slice(),
      races: (races && races.length) ? races : RACES.slice(),
      origins: (origins && origins.length) ? origins : ORIGINS.slice(),
      note: typeof p.note === 'string' ? p.note.trim().slice(0, 200) : ''
    };
  }

  /* ---------------------------------------------------------- */
  /* Что происходит в сцене: кто рядом и какие предметы          */
  /* ---------------------------------------------------------- */
  const ACTOR_RULES = [
    ['dragon', /дракон|виверн|змей|dragon|wyvern/],
    ['beast', /волк|волч|пёс|пс[аыу]|собак|звер|медвед|крыс|паук|жук|лошад|лис|мотыл|твар/],
    ['undead', /скелет|мертвец|зомби|призрак|нежит|восставш|упыр|гуль|мёртв|мертв/],
    ['construct', /робот|дрон|андроид|машин|автомат|синт|голем|механизм|сервопривод/],
    ['monster', /монстр|демон|чудищ|мутант|тролл|гоблин|орк|великан|гигант/],
    ['soldier', /солдат|стражник|патрул|легион|гвард|рыцар|наёмник|наемник|бандит|разбойник|пират|страж|караул|охрана/],
    ['human', /человек|люди|людей|людьми|торговец|крестьян|старик|старух|женщин|мужчин|толп|горожан|дет[ией]|ведьм|колдун|жрец|бармен|инженер|пилот|ночлежк|прохожий/]
  ];
  const PROP_RULES = [
    ['fire', /костёр|костер|огон|пожар|пламя|спичк|головн|жарк/],
    ['torch', /факел|фонар|лампад|свеч|маяк/],
    ['banner', /знамя|флаг|штандарт|герб|вымпел/],
    ['cart', /телег|повозк|карет|фургон|вагон|грузовик|мотоцикл/],
    ['tent', /шатёр|шатер|палатк|лагерь|бивак/],
    ['ship', /корабл|лодк|шлюпк|барж|катер|яхт/],
    ['tower', /башн|крепост|цитадел|стен[аыу]|форт|замок|частокол/],
    ['statue', /стату|идол|памятник|изваяни/],
    ['bridge', /мост|переправ|акведук/],
    ['door', /двер|ворота|калитк|шлюз/]
  ];

  /** Кто есть в сцене: враги (до трёх силуэтов) и предметы окружения. */
  function sceneActors(text) {
    const s = String(text || '').toLowerCase();
    const enemies = [];
    ACTOR_RULES.forEach(pair => {
      if (enemies.length < 3 && pair[1].test(s)) enemies.push(pair[0]);
    });
    const props = [];
    PROP_RULES.forEach(pair => {
      if (props.length < 4 && pair[1].test(s)) props.push(pair[0]);
    });
    return { hero: { shape: 'human' }, enemies, props };
  }

  /** Английские слова для предметов окружения: чтобы кадр совпадал с описанием. */
  const PROP_ART = {
    fire: 'a burning campfire', torch: 'a lone torch', banner: 'torn war banners',
    cart: 'a broken cart', tent: 'a patched tent', ship: 'a boat by the water',
    tower: 'a stone tower', statue: 'an old statue', bridge: 'a narrow bridge', door: 'a heavy door'
  };
  const ENGLISH_LIGHT_RE = /dawn|dusk|night|morning|evening|sunset|sunrise|noon|moonlight|torchlight|daylight/i;

  /** Свет и время суток из текста сцены — по-английски, для генератора. */
  function sceneLightFromText(text) {
    const t = String(text || '').toLowerCase();
    if (/ноч|лун|звёзд|звезд|темнот.*глубок/.test(t)) return 'at night, moonlight';
    if (/рассвет|утр|зорь/.test(t)) return 'at dawn, cold morning light';
    if (/закат|вечер|сумерк/.test(t)) return 'at sunset, warm evening light';
    if (/полдень|жар|палит/.test(t)) return 'harsh midday light';
    if (/дожд|гроз|туман|мгл/.test(t)) return 'damp overcast light, fog';
    if (/снег|мороз|метел/.test(t)) return 'cold winter light';
    return '';
  }

  const ENEMY_ART = {
    dragon: 'a dragon looming in the background',
    beast: 'a snarling beast closing in',
    undead: 'undead figures rising',
    construct: 'a machine sentinel',
    monster: 'a hulking monster',
    soldier: 'armed figures approaching',
    human: 'a stranger watching from the shadows'
  };
  const PEOPLE_RE = /knight|warrior|figure|figures|people|person|character|hero|creature|monster|dragon|beast|bandit|guard|thief|soldier|silhouette|crowd|man |woman|robot|undead|group/i;
  const ENEMY_WORD_RE = /bandit|guard|thief|soldier|wolf|beast|monster|dragon|undead|creature|figure|figures|sentinel|warrior|knight|crowd|group/i;

  /**
   * Промпт картинки для текущей сцены. Гарантирует, что на фоне
   * будут и герой, и то, что происходит по сюжету (враги, окружение).
   */
  function composeSceneImagePrompt(game, opts) {
    const o = opts || {};
    const s = scenarioById(game && game.scenarioId);
    const sceneText = [o.sceneText, o.action && o.action.text, o.npc].filter(Boolean).join(' ');
    const actors = sceneActors(sceneText);
    let base = String(o.aiPrompt || '').replace(/\s+/g, ' ').trim();
    const hadPrompt = !!base;
    if (!base) base = s.imagePrompts[0] || 'atmospheric cinematic environment art';
    const parts = [base];
    // свет и время суток из текста сцены: кадр должен совпадать с рассказом
    const light = sceneLightFromText(sceneText);
    if (light && !ENGLISH_LIGHT_RE.test(base)) parts.push(light);
    // предметы окружения, которых ещё нет в промпте: телега, костёр, ворота
    actors.props.slice(0, 2).forEach(p => {
      const word = PROP_ART[p];
      if (word && !new RegExp(word.split(' ')[0], 'i').test(base)) parts.push(word);
    });
    if (!hadPrompt || !PEOPLE_RE.test(base)) {
      parts.push(heroArtTag(game) + ' in the foreground, seen from behind');
    }
    // врагов добавляем, если их видно в сцене и они ещё не упомянуты в промпте
    if (actors.enemies.length && !ENEMY_WORD_RE.test(base)) {
      parts.push(ENEMY_ART[actors.enemies[0]]);
    }
    return parts.join(', ').replace(/\s+/g, ' ').trim().slice(0, 380);
  }

  /* ---------------------------------------------------------- */
  /* Промпты                                                    */
  /* ---------------------------------------------------------- */
  /* ---------------------------------------------------------- */
  /* Знакомые игры: профиль героя без ИИ                          */
  /* Если мастер недоступен, но игрок написал «Ведьмак 3» или     */
  /* «Cyberpunk 2077», шаги создания героя всё равно подгоняются   */
  /* под игру — по встроенной таблице.                            */
  /* ---------------------------------------------------------- */
  /* Каждый вариант — как его собрал бы мастер: название, подсказка,
     бонусы к характеристикам, черта, предмет и особый приём. */
  const pc = (title, hint, bonus, ability) => ({ title, hint, bonus, ability });
  const pr = (title, hint, bonus, trait) => ({ title, hint, bonus, trait });
  const po = (title, hint, bonus, item, hook) => ({ title, hint, bonus, item, hook });

  const KNOWN_GAME_PROFILES = [
    {
      match: /ведьмак|witcher|ведьмач|цири|нильфгаард|школ[аы] волка|вызим/i,
      profile: {
        classLabel: 'Школа',
        classes: [
          pc('Ведьмак школы Волка', 'мутации, два меча, медальон', { con: 1, wit: 2 }, { name: 'Зелье «Кошка»', desc: 'Зрение в темноте и звериная реакция' }),
          pc('Ведьмак школы Гадюки', 'яды вместо слов', { str: 2, agi: 1 }, { name: 'Смазанный клинок', desc: 'Первый удар отравлен: +3 к броску' }),
          pc('Чародейка Ложи', 'придворные интриги и хаос', { int: 2, cha: 1 }, { name: 'Портал', desc: 'Уйти из сцены и вернуться, откуда нужно' }),
          pc('Наёмник с тракта', 'контракты без вопросов', { str: 2, con: 1 }, { name: 'Второе дыхание', desc: 'Сразу +4 здоровья' })
        ],
        races: [],                                   // здесь все люди — шага расы нет
        origins: [
          po('Дитя Предназначения', 'за тобой идут те, кого ты не звал', { wit: 1 }, 'медальон волка', 'Чародейка ищет тебя и знает твоё имя'),
          po('Ветеран Цинтрийской войны', 'война кончилась, сны нет', { str: 1, con: 1 }, 'затупленный меч', 'Кто-то из твоего отряда выжил и обвиняет тебя'),
          po('Контрабандист с Понтара', 'знаешь все броды и всех перевозчиков', { agi: 1, cha: 1 }, 'фальшивые бумаги', 'Твой последний груз ищут очень настойчиво')
        ],
        note: 'в этой истории все — люди, поэтому выбирается только школа и происхождение'
      }
    },
    {
      match: /киберпанк|cyberpunk|2077|найт-сити|night city|имплант|нетранн/i,
      profile: {
        classLabel: 'Роль',
        classes: [
          pc('Соло', 'лучший ствол в районе и цена за него', { str: 2, con: 1 }, { name: 'Боевой стимулятор', desc: 'Сразу +4 здоровья' }),
          pc('Нетраннер', 'взламываешь людей быстрее замков', { int: 2, per: 1 }, { name: 'Взлом охраны', desc: '+3 к следующему броску' }),
          pc('Кочевник', 'свой транспорт и связи на трассах', { per: 2, con: 1 }, { name: 'Дорожная карта', desc: '+3 к следующему броску' }),
          pc('Фиксер', 'свои люди везде, и долги тоже', { cha: 2, wit: 1 }, { name: 'Слово на рынке', desc: '+3 к следующему броску' })
        ],
        races: [],
        origins: [
          po('Дитя улиц', 'вырос в Найт-Сити и не умер — уже успех', { agi: 1, per: 1 }, 'дешёвый пистолет', 'Долг старому другу, который уже мёртв'),
          po('Бывший корпорат', 'знаешь их схемы изнутри', { int: 1, cha: 1 }, 'пропуск корпорации', 'Бывшие коллеги хотят тебя вернуть — или убрать'),
          po('Дальнобойщик', 'полстраны за спиной', { con: 1, per: 1 }, 'ключи от фургона', 'В кузове едет груз, о котором ты не спрашивал')
        ],
        note: 'расу здесь не выбирают — выбирают роль и прошлое'
      }
    },
    {
      match: /wow|варкрафт|warcraft|азерот|azeroth|гильд|рейд|орочий|ночной эльф/i,
      profile: {
        classLabel: 'Класс',
        classes: [
          pc('Воин', 'щит, ярость и приказ держаться', { str: 2, con: 1 }, { name: 'Второе дыхание', desc: 'Сразу +4 здоровья' }),
          pc('Маг', 'огонь, лёд и очень точный расчёт', { int: 2, wit: 1 }, { name: 'Искра', desc: 'Следующий бросок — два d20, берём лучший' }),
          pc('Жрец', 'свет лечит, а тьма убеждает', { wit: 2, cha: 1 }, { name: 'Свет лечит', desc: 'Сразу +4 здоровья' }),
          pc('Разбойник', 'удар в спину честнее открытого боя', { agi: 2, per: 1 }, { name: 'Тень', desc: 'Следующий бросок — два d20, берём лучший' })
        ],
        races: [
          pr('Ночной эльф', 'тень леса и бессмертная память', { agi: 1, per: 1 }, 'Ночное зрение: видишь в темноте и читаешь следы'),
          pr('Дворф', 'камень держит и тебя, и топор', { con: 2 }, 'Стойкость: яд, холод и голод переносишь легче'),
          pr('Таурен', 'сила земли и уважение к духам', { str: 1, con: 1 }, 'Духи подсказывают, где опасно'),
          pr('Отрекшийся', 'смерть не помешала планам', { wit: 1, int: 1 }, 'Не чувствуешь боли и страха смерти')
        ],
        origins: [
          po('Ветеран фракции', 'война кончилась, привычка осталась', { str: 1, con: 1 }, 'потемневший значок', 'Тебя узнают те, кто воевал против'),
          po('Изгнанник гильдии', 'твоё имя вычеркнули из списка', { cha: 1, wit: 1 }, 'печать гильдии', 'Гильдмастер хочет вернуть тебя — на своих условиях')
        ],
        note: 'мир гильдий: класс и раса важны, происхождение — это твоя репутация'
      }
    },
    {
      match: /league of legends|лига легенд|рунтерр|runeterra|чемпион/i,
      profile: {
        classLabel: 'Путь',
        classes: [
          pc('Воин Рунтерры', 'честь и дисциплина на поле', { str: 2, con: 1 }, { name: 'Второе дыхание', desc: 'Сразу +4 здоровья' }),
          pc('Одарённый маг', 'дар опаснее любого клинка', { int: 2, wit: 1 }, { name: 'Искра', desc: 'Следующий бросок — два d20, берём лучший' }),
          pc('Плут из трущоб', 'ни одна дверь не заперта', { agi: 2, per: 1 }, { name: 'Тень', desc: 'Следующий бросок — два d20, берём лучший' }),
          pc('Дипломат Нации', 'договор крепче пушки', { cha: 2, wit: 1 }, { name: 'Натиск слов', desc: '+3 к следующему броску' })
        ],
        races: [],
        origins: [
          po('Выживший в войне', 'свои счёты с обеими сторонами', { wit: 1, con: 1 }, 'осколок клинка', 'Кто-то с той войны узнаёт тебя'),
          po('Дитя улиц', 'знаешь, кому что нужно', { agi: 1, cha: 1 }, 'краденый амулет', 'За тобой долг местному главарю'),
          po('Служил страже', 'приказы ты больше не любишь', { str: 1, per: 1 }, 'старая дубинка', 'Твоё имя до сих пор в списках стражи')
        ],
        note: 'в Рунтерре раса не выбирается — важны путь и прошлое'
      }
    },
    {
      match: /gta|гта|мафи|гангстер|город грехов|mob|криминал/i,
      profile: {
        classLabel: 'Роль',
        classes: [
          pc('Вор', 'быстрые руки и никакого шума', { agi: 2, per: 1 }, { name: 'Тень', desc: 'Следующий бросок — два d20, берём лучший' }),
          pc('Боец', 'вопросы решаются кулаками и стволом', { str: 2, con: 1 }, { name: 'Второе дыхание', desc: 'Сразу +4 здоровья' }),
          pc('Связной', 'тебя знают все, но никто не признаёт', { cha: 2, wit: 1 }, { name: 'Натиск слов', desc: '+3 к следующему броску' }),
          pc('Водила', 'двигатель и никаких вопросов', { per: 2, agi: 1 }, { name: 'Чутьё', desc: '+3 к следующему броску' })
        ],
        races: [],
        origins: [
          po('С улиц', 'поднялся из самых низов', { agi: 1, wit: 1 }, 'обрез', 'Семья ждёт денег, которых нет'),
          po('Бывший полицейский', 'знаешь систему изнутри', { int: 1, per: 1 }, 'старое удостоверение', 'Бывшие коллеги ведут твоё дело'),
          po('Не вернулся домой', 'за тобой старые долги', { cha: 1, con: 1 }, 'чужая кредитка', 'Кредитор нашёл город, где ты прячешься')
        ],
        note: 'раса здесь не выбирается — важны роль и связи'
      }
    },
    {
      match: /космос|космич|space|станц|орбит|звездолёт|колони|марс/i,
      profile: {
        classLabel: 'Роль на борту',
        classes: [
          pc('Пилот', 'руками чувствуешь, когда корпус врёт', { per: 2, agi: 1 }, { name: 'Чутьё', desc: '+3 к следующему броску' }),
          pc('Инженер', 'держит корабль на честном слове', { int: 2, con: 1 }, { name: 'Анализ', desc: '+3 к следующему броску' }),
          pc('Ксенобиолог', 'знаешь, что живёт в пробах', { int: 2, per: 1 }, { name: 'Анализ', desc: '+3 к следующему броску' }),
          pc('Наёмник экипажа', 'дорого, зато молча', { str: 2, con: 1 }, { name: 'Второе дыхание', desc: 'Сразу +4 здоровья' })
        ],
        races: [
          pr('Человек', 'упрямый и предсказуемый', { cha: 1, per: 1 }, 'Свой среди своих: на людных палубах говорят легко'),
          pr('Искусственный', 'не дышит и не устаёт', { int: 1, con: 1, cha: -1 }, 'Не боишься вакуума и усталости'),
          pr('Изменённый', 'имплант живёт своей жизнью', { str: 1, wit: 1, cha: -1 }, 'Имплант подсказывает то, чего знать не можешь')
        ],
        origins: [
          po('Контрактник корпорации', 'подписал то, что не читал', { con: 1, int: 1 }, 'корпоративный чип', 'Корпорация помнит о контракте'),
          po('Единственный выживший', 'станция замолчала, ты — нет', { wit: 1, per: 1 }, 'чужой жетон', 'Спасатели ищут свидетелей, а не тебя'),
          po('Беглец с каторги', 'добыча на астероидах не для тебя', { agi: 1, wit: 1 }, 'шрам от кандалов', 'За тобой идёт транспорт с конвоем')
        ],
        note: 'роль важнее происхождения: на борту ценят навык'
      }
    },
    {
      match: /постапокал|пустош|выживан|wasteland|апокалипс|мутант/i,
      profile: {
        classLabel: 'Роль',
        classes: [
          pc('Рейдер', 'берёшь силой, потому что иначе не берут', { str: 2, agi: 1 }, { name: 'Второе дыхание', desc: 'Сразу +4 здоровья' }),
          pc('Механик', 'из хлама собираешь воду и свет', { int: 2, con: 1 }, { name: 'Анализ', desc: '+3 к следующему броску' }),
          pc('Лекарь', 'знаешь, какие грибы не убивают', { int: 1, wit: 2 }, { name: 'Настой', desc: 'Сразу +4 здоровья' }),
          pc('Снайпер', 'патрон дороже человека', { per: 2, agi: 1 }, { name: 'Засада', desc: 'Следующий бросок — два d20, берём лучший' })
        ],
        races: [
          pr('Человек', 'обычный, значит живучий', { cha: 1, con: 1 }, 'Свой среди своих: в поселениях тебя слушают'),
          pr('Изменённый', 'радиация не добила, а переделала', { str: 1, con: 1, cha: -1 }, 'Переносишь дозу, от которой другие умирают'),
          pr('Полукровка', 'между двумя мирами', { per: 1, wit: 1 }, 'Свои среди чужих: обе стороны говорят с тобой')
        ],
        origins: [
          po('Из бункера', 'двери открылись, и это была ошибка', { int: 1, con: 1 }, 'пропуск бункера', 'В бункере остались те, кто ждёт тебя обратно'),
          po('Вырос в караване', 'дорога — твой дом', { per: 1, cha: 1 }, 'старая карта', 'Караван пропал, и ты ищешь его след'),
          po('Пропавший без вести', 'тебя искали и не нашли', { wit: 1, agi: 1 }, 'рваный рюкзак', 'Те, кто тебя искал, больше не ждут')
        ],
        note: 'в пустоши сначала выживают, потом выбирают прошлое'
      }
    },
    {
      match: /нуар|детектив|noir|расследован|1920|мафия 30|грейхейвен/i,
      profile: {
        classLabel: 'Роль',
        classes: [
          pc('Частный сыщик', 'берёшься за дела, от которых отказались', { per: 2, int: 1 }, { name: 'Чутьё', desc: '+3 к следующему броску' }),
          pc('Полицейский', 'значки не спасают от начальства', { str: 1, per: 1, wit: 1 }, { name: 'Анализ', desc: '+3 к следующему броску' }),
          pc('Журналист', 'правда стоит дороже денег', { int: 1, cha: 2 }, { name: 'Натиск слов', desc: '+3 к следующему броску' }),
          pc('Информатор в доках', 'слышишь всё, что говорят у воды', { cha: 1, per: 2 }, { name: 'Тень', desc: 'Следующий бросок — два d20, берём лучший' })
        ],
        races: [],
        origins: [
          po('Бывший коп', 'ушёл сам, чтобы не выгнали', { wit: 1, per: 1 }, 'старый револьвер', 'Твоё увольнение кто-то устроил'),
          po('Вернулся с войны', 'война вернулась с тобой', { con: 1, wit: 1 }, 'фляжка сослуживца', 'Сослуживец, которого ты не спас, ищет тебя'),
          po('Должен боссу', 'долг растёт быстрее процентов', { cha: 1, agi: 1 }, 'чужая расписка', 'Срок долга выходит на этой неделе')
        ],
        note: 'здесь не выбирают расу — выбирают, чем ты зарабатываешь и кому должен'
      }
    },
    {
      match: /хоррор|ужас|мистик|нечист|вампир|проклят|древн(ий|ие) ужас/i,
      profile: {
        classLabel: 'Кто ты',
        classes: [
          pc('Охотник на нечисть', 'спишь с солью под подушкой', { per: 2, wit: 1 }, { name: 'Засада', desc: 'Следующий бросок — два d20, берём лучший' }),
          pc('Священник', 'вера держится не на чудесах', { wit: 2, cha: 1 }, { name: 'Молитва', desc: 'Сразу +4 здоровья' }),
          pc('Медик', 'знаешь, как выглядит настоящая смерть', { int: 2, per: 1 }, { name: 'Бинты и морфин', desc: 'Сразу +4 здоровья' }),
          pc('Скептик-учёный', 'всё объяснишь, кроме того, что видел', { int: 2, wit: 1 }, { name: 'Анализ', desc: '+3 к следующему броску' })
        ],
        races: [],
        origins: [
          po('Пережил ритуал', 'тебя вернули, но не целиком', { wit: 1, con: 1 }, 'чужая монета', 'Культисты помнят твоё лицо'),
          po('Ищет пропавшего', 'родные пропали без следа', { per: 1, wit: 1 }, 'фотография', 'След ведёт туда, куда лучше не ходить'),
          po('Наследник проклятия', 'семья платила по счёту', { wit: 1, cha: 1 }, 'фамильный медальон', 'Проклятие требует новой платы')
        ],
        note: 'в ужасе нет рас — важнее, чем ты защищаешься'
      }
    },
    {
      match: /пират|морск|океан|корсар|кариб|флот/i,
      profile: {
        classLabel: 'Роль на корабле',
        classes: [
          pc('Капитан', 'последнее слово всегда твоё', { cha: 2, wit: 1 }, { name: 'Натиск слов', desc: '+3 к следующему броску' }),
          pc('Канонир', 'попадаешь с качки', { str: 1, per: 2 }, { name: 'Заряд картечи', desc: 'Следующий бросок — два d20, берём лучший' }),
          pc('Навигатор', 'звёзды врут меньше карт', { int: 1, per: 2 }, { name: 'Чутьё', desc: '+3 к следующему броску' }),
          pc('Корабельный врач', 'пилишь и штопаешь одинаково', { int: 2, wit: 1 }, { name: 'Ром и бинты', desc: 'Сразу +4 здоровья' })
        ],
        races: [],
        origins: [
          po('Бывший офицер флота', 'знаешь устав и как его нарушать', { wit: 1, per: 1 }, 'офицерская подзорная труба', 'Флот объявил тебя дезертиром'),
          po('Пленник с галеры', 'весла научили терпеть', { con: 2 }, 'клеймо на плече', 'Тот, кто тебя продал, ещё жив'),
          po('Найден на обломках', 'тебя вытащили из воды', { agi: 1, wit: 1 }, 'щепка с названием корабля', 'Корабль, с которого ты ушёл, ищут все')
        ],
        note: 'на корабле раса не важна — важно, что ты умеешь в шторм'
      }
    },
    {
      match: /школа магии|академ|магистр|универ|ученик магии|магическ/i,
      profile: {
        classLabel: 'Факультет',
        classes: [
          pc('Стихийник', 'огонь отвечает первым', { int: 2, wit: 1 }, { name: 'Искра', desc: 'Следующий бросок — два d20, берём лучший' }),
          pc('Иллюзионист', 'правда в том, что ты покажешь', { int: 1, cha: 2 }, { name: 'Морок', desc: 'Следующий бросок — два d20, берём лучший' }),
          pc('Некромант', 'разговариваешь с теми, кто закончил', { int: 2, wit: 1 }, { name: 'Шёпот мёртвых', desc: '+3 к следующему броску' }),
          pc('Артефактор', 'магия в железе надёжнее', { int: 2, per: 1 }, { name: 'Анализ', desc: '+3 к следующему броску' })
        ],
        races: [
          pr('Человек', 'короткая жизнь, быстрые решения', { cha: 1, con: 1 }, 'Учишься быстрее долгоживущих'),
          pr('Древний народ', 'помнишь то, что записано в архивах', { agi: 1, per: 1 }, 'Ночное зрение и память на века'),
          pr('Полукровка', 'между двумя кровями', { per: 1, wit: 1 }, 'Обе стороны говорят с тобой, но не доверяют')
        ],
        origins: [
          po('Из семьи магов', 'от тебя ждали большего', { int: 1, cha: 1 }, 'фамильный гримуар', 'Родня требует отчёт об учёбе'),
          po('Поздний дар', 'магия проснулась не вовремя', { wit: 1, per: 1 }, 'обгоревшая тетрадь', 'Тот, кто видел твой первый выброс, хочет повторить'),
          po('Изгнан за эксперимент', 'тебя выгнали, а опыт остался', { int: 2 }, 'запретная схема', 'Магистр, отправивший тебя вон, следит за тобой')
        ],
        note: 'в академии раса влияет на стартовые возможности, но факультет важнее'
      }
    }
  ];

  /** Профиль героя по названию игры, если ИИ недоступен. null — если игра незнакомая. */
  function offlineHeroProfile(cfg) {
    if (!cfg) return null;
    const hay = [cfg.gameName, cfg.title, cfg.genre, cfg.extra].filter(Boolean).join(' ');
    if (!hay) return null;
    for (const row of KNOWN_GAME_PROFILES) {
      if (row.match.test(hay)) return heroProfileFromWorld(Object.assign({ fromAI: false }, row.profile));
    }
    return null;
  }

  const SYSTEM_PROMPT = [
    'Ты — ведущий (гейм-мастер) текстовой ролевой игры на русском языке.',
    'Ты описываешь мир от второго лица, живо, конкретно, без воды и без пафоса.',
    'Стиль: короткие ёмкие фразы, 2–4 предложения на сцену, максимум одна метафора.',
    'Учитывай результат броска кубика, который сообщает игрок: успех, провал, крит.',
    'Учитывай расу, происхождение, класс и умения героя — они должны оживать в тексте.',
    'Никогда не решаешь за игрока и не описываешь его действия вперёд.',
    'Ровно 3 варианта действий: разные по подходу (сила / ловкость / разум / слово / восприятие),',
    'иногда один из них — отступить, спрятаться или выждать.',
    '',
    'ОТВЕЧАЙ СТРОГО ОДНИМ JSON-ОБЪЕКТОМ, без markdown и без пояснений:',
    '{',
    '  "scene": "2–4 предложения описания сцены и последствий действия игрока",',
    '  "place": "где мы сейчас, 2–4 слова по-русски (например: «ночной рынок у моста»)",',
    '  "chapter": "название главы, 2–4 слова, если сменилась локация, иначе пустая строка",',
    '  "npc": {"name": "Имя", "role": "кто он", "attitude": "дружелюбен | насторожен | враждебен", "voice": "как говорит, 2–4 слова"} или пустая строка,',
    '  "imagePrompt": "English prompt for an image generator, 10-18 words: место, свет, настроение, кто в кадре",',
    '  "world": "только для первой сцены: 2–4 предложения о мире — где мы, как здесь всё устроено, чем живут люди",',
    '  "backstory": "только для первой сцены: 3–5 предложений предыстории героя — откуда он, что потерял, почему он здесь",',
    '  "plan": ["шаг плана 1", "шаг 2", "шаг 3"],',
    '  "options": [',
    '    {"text": "что делает игрок (1 предложение, от третьего лица)", "stat": "str|agi|con|int|per|wit|cha", "difficulty": "easy|medium|hard|deadly"}',
    '  ],',
    '  "effects": {"hp": 0, "item": "", "goal": false},',
    '  "complication": "чем обошёлся провал или крит: коротко и по делу, иначе пустая строка",',
    '  "thread": "новая незакрытая нить сюжета, если появилась, иначе пустая строка",',
    '  "progress": true',
    '}',
    'Поле "stat" — проверяемая характеристика: str сила, agi ловкость, con телосложение, int разум, per восприятие, wit воля, cha харизма.',
    '"difficulty": easy — простое (dc 8), medium (dc 11), hard (dc 14), deadly (dc 17).',
    '"effects.hp" — целое число от -6 до +4, обычно 0. "effects.item" — короткое название предмета или пусто.',
    'Пиши на русском, но "imagePrompt" — всегда на английском.',
    '',
    'ПРАВИЛА ДЛЯ "imagePrompt": в кадре должны быть те, кто участвует в сцене.',
    'Всегда указывай героя (например: armored knight with a sword) и, если в сцене есть противники,',
    'существа или заметные предметы — их тоже (two bandits, a wolf, a burning cart). Формат:',
    '"место и погода, герой в кадре, кто ещё в сцене, свет и настроение". Без текста на картинке.',
    '',
    'ПРАВИЛА БРОСКА: результат броска — закон. Крит: выгода и новая возможность, которых не ждали.',
    'Провал: цена, осложнение, потеря — но история не останавливается и не превращается в тупик.',
    'Никогда не переписывай бросок и не отменяй его последствия.',
    '',
    'ПРАВИЛА ПАМЯТИ: герой и его знакомые — живые люди. Переиспользуй персонажей из блока памяти,',
    'не придумывай каждый ход новых; если вводишь нового — не больше одного за ход.',
    'Не начинай сцену теми же словами, что и раньше. Не повторяй уже сказанное другими словами.',
    'Поле "progress": true, если этот ход приблизил героя к задаче, иначе false.',
    '',
    'ПРАВИЛА ДЛЯ ПЕРВОЙ СЦЕНЫ: не начинай с «ты в переулке, убей вора».',
    'Сначала расскажи о мире (поле "world"), затем предысторию героя ("backstory"),',
    'потом введи в текущую сцену ("scene") и наметь план отыгрыша ("plan", 3 шага).',
    'Первые варианты действий должны вытекать из плана, а не быть случайной стычкой.'
  ].join('\n');

  function heroDescription(game) {
    const h = game.hero;
    const st = h.stats;
    const statsLine = STAT_IDS.map(id => `${statById(id).name}: ${st[id]}`).join(', ');
    const inv = h.inventory.length ? h.inventory.join(', ') : 'пусто';
    const hooks = (h.hooks || []).length ? h.hooks.join(' ') : '';
    const r = raceById(h.raceId), o = originById(h.originId);
    return [
      `ГЕРОЙ: ${h.name}.`,
      `Класс: ${h.className} (${classById(h.classId).blurb}).`,
      `Раса/вид: ${h.raceName} — ${r.trait}`,
      `Происхождение: ${h.originName} — ${o.hook}`,
      `Характеристики: ${statsLine}.`,
      `Здоровье: ${h.hp}/${h.maxHp}. Инвентарь: ${inv}.`,
      hooks ? `ЛИЧНЫЕ КРЮЧКИ (используй их в сюжете!): ${hooks}` : ''
    ].filter(Boolean).join('\n');
  }

  function worldDescription(game) {
    const s = scenarioById(game.scenarioId);
    const c = game.worldConfig;
    const parts = [`МИР: ${game.title} (${s.genre}).`, `ЗАДАЧА ГЕРОЯ: ${game.goal}.`];
    if (s.systemHint) parts.push(`ОСОБЕННОСТИ МИРА: ${s.systemHint}`);
    if (c) {
      const bits = [
        c.genre ? `жанр: ${c.genre}` : '', c.tone ? `тон: ${c.tone}` : '',
        c.place ? `место: ${c.place}` : '',
        (c.ingredients && c.ingredients.length) ? `включить: ${c.ingredients.join(', ')}` : '',
        `опасность: ${(DANGER_LEVELS.find(d => d.id === c.danger) || DANGER_LEVELS[1]).title}`
      ].filter(Boolean);
      parts.push(`НАСТРОЙКИ, ЗАДАННЫЕ ИГРОКОМ: ${bits.join('; ')}${c.extra ? `; пожелания: ${c.extra}` : ''}`);
    }
    return parts.join('\n');
  }

  function buildTurnPrompt(game, action, check, extra) {
    const recent = game.log.slice(-4).map(e => `- ${e.text}`).join('\n') || '—';
    const checkLine = check
      ? `Игрок выбрал: «${action.text}».\nБросок d20: ${check.roll}${check.advantage ? ' (преимущество: ' + check.rolls.join('/') + ')' : ''} + модификатор ${check.mod} = ${check.total} против сложности ${check.dc}. Итог: ${check.label} (запас ${check.margin >= 0 ? '+' : ''}${check.margin}).`
      : `Игрок выбрал: «${action.text}».\nБросок не требуется (свободное действие).`;
    const extraLine = extra ? `ДОПОЛНИТЕЛЬНО: ${extra}` : '';
    const memory = memoryBlock(game);
    return [
      worldDescription(game),
      `ВСТУПЛЕНИЕ МИРА: ${scenarioById(game.scenarioId).opening || game.goal}`,
      heroDescription(game),
      rulesLine(game),
      memory,
      game.summary ? `РАНЕЕ: ${game.summary}` : '',
      `ХОД ${game.turn + 1}.`,
      `ПРЕДЫДУЩИЕ СОБЫТИЯ:\n${recent}`,
      checkLine,
      extraLine,
      'Опиши результат этого действия (учитывая бросок), задай атмосферу и предложи ровно 3 следующих варианта действий.',
      'Только JSON.'
    ].filter(Boolean).join('\n\n');
  }

  function summarizeLog(log, limit = 8) {
    const tail = (log || []).slice(-limit).map(e => e.text);
    let s = tail.join(' ');
    if (s.length > 700) s = s.slice(-700);
    return s;
  }

  /* ---------------------------------------------------------- */
  /* Ссылки на картинки: быстрый старт + догрузка               */
  /* ---------------------------------------------------------- */
  function buildImageUrl({ prompt, seed, width, height, aspect, style, serverFirst }) {
    const clean = String(prompt || '').replace(/\s+/g, ' ').trim().slice(0, 380);
    const full = [clean, style].filter(Boolean).join(', ');
    const w = width || 448, h = height || 252;
    return {
      server: 'api/image?prompt=' + encodeURIComponent(full) + '&seed=' + encodeURIComponent(seed || 1) + '&w=' + w + '&h=' + h,
      a0: `https://api.a0.dev/assets/image?text=${encodeURIComponent(full)}&aspect=${encodeURIComponent(aspect || '16:9')}&seed=${seed || 1}`,
      pollinations: `https://image.pollinations.ai/prompt/${encodeURIComponent(full)}?width=${w}&height=${h}&model=sana&nologo=true&seed=${seed || 1}`,
      stock: `https://picsum.photos/seed/${encodeURIComponent((clean || 'scene').slice(0, 24))}${seed || 1}/${w * 2}/${h * 2}`,
      full
    };
  }

  function fallbackImagePrompt(game, actionText) {
    const s = scenarioById(game.scenarioId);
    const used = game.usedImagePrompts || [];
    const fresh = s.imagePrompts.filter(p => !used.includes(p));
    const pool = fresh.length ? fresh : s.imagePrompts;
    return rnd.pick(pool) || (actionText || s.title);
  }

  /* ---------------------------------------------------------- */
  /* Разбор ответа модели                                       */
  /* ---------------------------------------------------------- */
  function stripFences(text) {
    return String(text || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/i, '').trim();
  }

  function extractJsonObject(text) {
    const s = stripFences(text);
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { /* ищем ниже */ }
    const start = s.indexOf('{');
    if (start === -1) return null;
    let depth = 0, inStr = false, esc = false;
    for (let i = start; i < s.length; i++) {
      const ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') inStr = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try { return JSON.parse(s.slice(start, i + 1)); } catch (e) { return null; }
        }
      }
    }
    return null;
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  const DIFF_ALIASES = {
    easy: 'easy', легко: 'easy', лёгкий: 'easy', простое: 'easy', low: 'easy',
    medium: 'medium', средне: 'medium', средний: 'medium', normal: 'medium',
    hard: 'hard', трудно: 'hard', сложно: 'hard', сложный: 'hard', high: 'hard',
    deadly: 'deadly', смертельно: 'deadly', extreme: 'deadly'
  };

  function sanitizeOption(raw, index, danger) {
    if (!raw) return null;
    const text = typeof raw === 'string' ? raw : (raw.text || raw.action || raw.title || '');
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length < 3) return null;
    let stat = String(typeof raw === 'object' ? (raw.stat || raw.check || '') : '').toLowerCase();
    stat = STAT_ALIASES[stat] || stat;
    if (!STAT_IDS.includes(stat)) stat = rnd.pick(STAT_IDS);
    let diff = String(typeof raw === 'object' ? (raw.difficulty || raw.dc || '') : '').toLowerCase();
    diff = DIFF_ALIASES[diff] || diff;
    if (!DIFFICULTY_ORDER.includes(diff)) {
      const num = parseInt(diff, 10);
      diff = Number.isFinite(num) ? difficultyForDc(clamp(num, 5, 20)).id : rnd.pick(['easy', 'medium', 'medium', 'hard']);
    }
    const explicitDc = (typeof raw === 'object' && raw !== null && raw.dc !== undefined) ? Number(raw.dc) : NaN;
    let dc = Number.isFinite(explicitDc) ? clamp(Math.round(explicitDc), 5, 20) : difficultyById(diff).dc;
    if (danger) dc = shiftDc(dc, danger);
    return { id: 'o' + index, text: clean.slice(0, 160), stat, difficulty: difficultyForDc(dc).id, dc };
  }

  function parseGmResponse(text, ctx = {}) {
    const data = typeof text === 'object' && text !== null ? text : extractJsonObject(text);
    const game = ctx.game;
    const danger = game && game.worldConfig ? game.worldConfig.danger : null;
    const sceneSrc = data && (data.scene || data.narration || data.text || data.description);
    if (!sceneSrc || typeof sceneSrc !== 'string') return { ok: false };
    const options = [];
    const rawOptions = (data && (data.options || data.choices || data.actions)) || [];
    if (Array.isArray(rawOptions)) {
      rawOptions.slice(0, 4).forEach((o, i) => {
        const opt = sanitizeOption(o, i, danger);
        if (opt) options.push(opt);
      });
    }
    while (options.length < 3) options.push(sanitizeOption(rnd.pick(GENERIC_OPTIONS), options.length, danger));
    options.forEach((o, i) => { o.id = 'o' + i; });

    const eff = (data && (data.effects || data.effect)) || {};
    const hp = Number.isFinite(Number(eff.hp)) ? clamp(Math.round(Number(eff.hp)), -8, 5) : 0;
    const effects = {
      hp,
      item: typeof eff.item === 'string' && eff.item.trim() ? eff.item.trim().slice(0, 40) : '',
      goal: !!eff.goal
    };
    const imgPrompt = data && (data.imagePrompt || data.image || data.prompt);
    return {
      ok: true,
      scene: polishSceneText(String(sceneSrc), 900),
      place: typeof data.place === 'string' ? data.place.trim().slice(0, 60) : '',
      complication: typeof data.complication === 'string' ? data.complication.trim().slice(0, 120) : '',
      thread: typeof data.thread === 'string' ? data.thread.trim().slice(0, 120) : '',
      progress: typeof data.progress === 'boolean' ? data.progress : undefined,
      npcObject: (data.npc && typeof data.npc === 'object') ? data.npc : null,
      chapter: typeof data.chapter === 'string' ? data.chapter.trim().slice(0, 60) : '',
      npc: typeof data.npc === 'string' ? data.npc.trim().slice(0, 120)
        : (data.npc && typeof data.npc === 'object' && data.npc.name ? String(data.npc.name).slice(0, 60) : ''),
      world: typeof data.world === 'string' ? data.world.trim().slice(0, 900) : '',
      backstory: typeof data.backstory === 'string' ? data.backstory.trim().slice(0, 900) : '',
      plan: parsePlan(data.plan),
      imagePrompt: typeof imgPrompt === 'string' ? imgPrompt.trim().slice(0, 260) : '',
      options,
      effects,
      raw: data
    };
  }

  /**
   * Значение поля из ещё не дописанного JSON: пока мастер печатает ответ,
   * показываем сцену по мере появления текста.
   */
  function extractPartialField(text, field) {
    const t = String(text || '');
    const re = new RegExp('"' + String(field) + '"\\s*:\\s*"');
    const m = re.exec(t);
    if (!m) return '';
    let i = m.index + m[0].length;
    let out = '';
    while (i < t.length) {
      const ch = t[i];
      if (ch === '\\') {
        const next = t[i + 1];
        if (next === undefined) break;
        out += next === 'n' ? '\n' : next;
        i += 2;
        continue;
      }
      if (ch === '"') break;
      out += ch;
      i += 1;
    }
    return out.replace(/\s+/g, ' ').trim();
  }

  /** План отыгрыша: список шагов (из массива или из строки). */
  function parsePlan(raw) {
    const norm = v => String(v || '').replace(/^[-•\d.\s]+/, '').replace(/\s+/g, ' ').trim().slice(0, 140);
    if (Array.isArray(raw)) return raw.map(norm).filter(Boolean).slice(0, 4);
    if (typeof raw === 'string' && raw.trim()) {
      return raw.split(/\n|;|•/).map(norm).filter(Boolean).slice(0, 4);
    }
    return [];
  }

  /** Разбор ответа при создании мира (кастомный режим). */
  function parseWorldResponse(text) {
    const data = typeof text === 'object' && text !== null ? text : extractJsonObject(text);
    if (!data) return { ok: false };
    const title = typeof data.title === 'string' ? data.title.trim().slice(0, 80) : '';
    const opening = typeof data.opening === 'string' ? data.opening.trim().slice(0, 1200)
      : (typeof data.scene === 'string' ? data.scene.trim().slice(0, 1200) : '');
    if (!opening && !title) return { ok: false };
    return {
      ok: true,
      title,
      goal: typeof data.goal === 'string' ? data.goal.trim().slice(0, 200) : '',
      world: typeof data.world === 'string' ? data.world.trim().slice(0, 900) : '',
      backstory: typeof data.backstory === 'string' ? data.backstory.trim().slice(0, 900) : '',
      plan: parsePlan(data.plan || data.arc || data.story),
      hero: (data.hero && typeof data.hero === 'object') ? data.hero : null,
      opening,
      chapter: typeof data.chapter === 'string' ? data.chapter.trim().slice(0, 60) : 'Пролог',
      npc: typeof data.npc === 'string' ? data.npc.trim().slice(0, 120) : '',
      imagePrompt: typeof data.imagePrompt === 'string' ? data.imagePrompt.trim().slice(0, 260) : '',
      options: Array.isArray(data.options) ? data.options : []
    };
  }

  /* ---------------------------------------------------------- */
  /* Спасение обрезанного ответа мастера                         */
  /* Лимит длины канала иногда рубит JSON на середине: собираем    */
  /* мир из того, что успело дойти, вместо «мастер недоступен».   */
  /* ---------------------------------------------------------- */

  /** Кусок текста от ключа до конца его значения (или до конца ответа). */
  function sliceAfterKey(text, key) {
    const raw = String(text || '');
    const re = new RegExp('"' + key + '"\\s*:\\s*');
    const m = re.exec(raw);
    if (!m) return '';
    const rest = raw.slice(m.index + m[0].length);
    const next = /[\]\}]\s*,\s*"[a-zA-Z]+"\s*:/.exec(rest);     // следующий ключ объекта
    return next ? rest.slice(0, next.index) : rest;
  }

  /** Строки из недописанного массива: берём только целые кавычки. */
  function listFromPartialArray(text, limit) {
    const out = [];
    const FIELDS = /^(title|goal|world|backstory|plan|opening|scene|chapter|npc|imagePrompt|options|text|stat|difficulty)$/;
    const re = /"([^"\\]{3,140})"/g;
    let m;
    while ((m = re.exec(String(text || ''))) && out.length < (limit || 6)) {
      const v = m[1].trim();
      if (v && !FIELDS.test(v)) out.push(v);
    }
    return out;
  }

  /** Объекты из недописанного массива вариантов. */
  function objectsFromPartialArray(text, limit) {
    const raw = String(text || '');
    const out = [];
    const re = /\{([^{}]{3,240})\}/g;
    let m;
    while ((m = re.exec(raw)) && out.length < (limit || 3)) {
      const chunk = '{' + m[1] + '}';
      const t = extractPartialField(chunk, 'text') || extractPartialField(chunk, 't');
      if (!t) continue;
      out.push({
        text: t,
        stat: extractPartialField(chunk, 'stat'),
        difficulty: extractPartialField(chunk, 'difficulty')
      });
    }
    return out;
  }

  /**
   * Мир из обрезанного ответа: заголовки и проза достаются по частям,
   * список шагов и варианты — по целым строкам внутри недописанных массивов.
   */
  function salvageWorldResponse(text) {
    const raw = String(text || '');
    if (!raw.trim()) return { ok: false };
    const out = {
      ok: true, partial: true,
      title: extractPartialField(raw, 'title').slice(0, 80),
      goal: extractPartialField(raw, 'goal').slice(0, 200),
      world: extractPartialField(raw, 'world').slice(0, 900),
      backstory: extractPartialField(raw, 'backstory').slice(0, 900),
      chapter: extractPartialField(raw, 'chapter').slice(0, 60),
      npc: extractPartialField(raw, 'npc').slice(0, 120),
      imagePrompt: extractPartialField(raw, 'imagePrompt').slice(0, 260)
    };
    const opening = extractPartialField(raw, 'opening') || extractPartialField(raw, 'scene');
    out.opening = opening.slice(0, 1200);
    if (!out.opening && out.world) out.opening = out.world;           // хотя бы мир, но показать сцену
    out.plan = listFromPartialArray(sliceAfterKey(raw, 'plan'), 4);
    out.options = objectsFromPartialArray(sliceAfterKey(raw, 'options'), 3);
    out.hero = null;
    if (!out.title && !out.opening && !out.world) return { ok: false };
    return out;
  }

  /* ---------------------------------------------------------- */
  /* Сюжет для локального мастера (когда ИИ недоступен)         */
  /* ---------------------------------------------------------- */
  const STORY = {
    asgeld: [
      {
        text: 'Тропа сужается между чёрными стволами, и мох под ногами пружинит, как мокрая губка. Колокольчик звенит слева — ближе, чем минуту назад.',
        ok: 'Мох оседает под шагом, и под ним угадывается пустота — внизу есть ход.',
        bad: 'Нога проваливается в холодную жижу, и что-то медленно и упрямо тянет вниз.',
        options: [
          { t: 'Осмотреться и запомнить ориентиры', stat: 'per', diff: 'easy' },
          { t: 'Идти на звон напрямик', stat: 'wit', diff: 'medium' },
          { t: 'Оттащить с дороги гнилой ствол', stat: 'str', diff: 'medium', item: 'рогатина из чёрного дерева' }
        ]
      },
      {
        text: 'За стволами лежит поваленный алтарь, увитый корнями. На плоском камне — медный колокольчик, ещё тёплый, будто его только что держали в руке.',
        ok: 'Корни разжимаются сами, будто узнали твою руку.',
        bad: 'Корни сжимаются и оставляют на ладони кровавые полосы.',
        options: [
          { t: 'Взять колокольчик', stat: 'wit', diff: 'medium', item: 'медный колокольчик' },
          { t: 'Прочитать знаки на камне', stat: 'int', diff: 'medium' },
          { t: 'Завалить алтарь камнями', stat: 'str', diff: 'hard' }
        ]
      },
      {
        text: 'Между деревьями стоит фигура в плаще из птичьих перьев — без лица, но с фонарём. Она поднимает руку, будто просит остановиться.',
        ok: 'Фонарь опускается, и фигура отступает в сторону, освобождая дорогу.',
        bad: 'Плащ разворачивается, и в свете фонаря мелькает слишком много глаз.',
        options: [
          { t: 'Заговорить с ней', stat: 'cha', diff: 'medium' },
          { t: 'Обойти, не сводя с неё взгляда', stat: 'agi', diff: 'medium' },
          { t: 'Бросить ей колокольчик', stat: 'per', diff: 'hard' }
        ]
      },
      {
        text: 'Лес обрывается в овраг, на дне которого растёт дерево-колокольня: сотни мелких колокольцев висят на ветках и все молчат.',
        ok: 'Один колокольчик всё-таки звенит, и звук указывает вниз, к корням.',
        bad: 'Ветка ломается под весом, и ты съезжаешь по грязи на самое дно.',
        options: [
          { t: 'Спуститься к корням', stat: 'str', diff: 'medium' },
          { t: 'Обойти овраг по краю', stat: 'agi', diff: 'hard' },
          { t: 'Дождаться, пока ветер качнёт дерево', stat: 'wit', diff: 'medium' }
        ]
      },
      {
        text: 'Под корнями открывается нора, а в ней — колокол размером с сердце, прикованный цепью из чужого серебра. Цепь гудит от каждого звона.',
        final: true,
        ok: 'Цепь лопается с сухим щелчком, и лес впервые за много лет выдыхает.',
        bad: 'Цепь натягивается, и серебро впивается в пальцы до кости.',
        options: [
          { t: 'Сорвать цепь руками', stat: 'str', diff: 'hard' },
          { t: 'Найти, где цепь закреплена', stat: 'int', diff: 'medium' },
          { t: 'Заговорить с колоколом', stat: 'wit', diff: 'deadly' }
        ]
      }
    ],
    aurelia: [
      {
        text: 'Купол гудит низким басом, и по стеклу сверху расползается трещина, светящаяся ядовитой зеленью. Внизу, среди затонувших улиц, мигает маяк.',
        ok: 'Стекло держится, и ты успеваешь заметить, где трещина тоньше.',
        bad: 'Трещина растёт, и на плечи падает солёная вода.',
        options: [
          { t: 'Идти к маяку', stat: 'agi', diff: 'medium' },
          { t: 'Осмотреть смотровую площадку', stat: 'per', diff: 'easy' },
          { t: 'Спуститься на нижние ярусы', stat: 'str', diff: 'medium' }
        ]
      },
      {
        text: 'Улицы кончаются у прозрачной стены: за ней стоят рыбы размером с лодку и смотрят, не мигая.',
        ok: 'Стая расходится, открывая арку под стеной.',
        bad: 'Одна из рыб бьётся о стекло, и по нему идёт новый излом.',
        options: [
          { t: 'Пройти через арку', stat: 'wit', diff: 'medium' },
          { t: 'Проверить шлюз на нижнем уровне', stat: 'int', diff: 'medium' },
          { t: 'Отогнать рыбу и пройти поверху', stat: 'str', diff: 'hard' }
        ]
      },
      {
        text: 'В библиотеке плавают раскрытые книги, как водоросли; одна сама разворачивается к тебе страницей с чертежом купола.',
        ok: 'Чертёж складывается в понятную схему: у купола есть сердце, и оно здесь.',
        bad: 'Буквы расплываются и обжигают глаза.',
        options: [
          { t: 'Запомнить схему', stat: 'int', diff: 'medium' },
          { t: 'Забрать книгу с собой', stat: 'agi', diff: 'medium', item: 'книга-чертёж' },
          { t: 'Спросить, кто её написал', stat: 'cha', diff: 'medium' }
        ]
      },
      {
        text: 'Маяк бьёт узким лучом вверх, и в свете видно: трещины складываются в одну длинную линию вокруг города.',
        ok: 'Луч упирается в панель с рычагами — такую же, как на чертеже.',
        bad: 'Свет слепит до слёз, и за спиной слышится чужое дыхание.',
        options: [
          { t: 'Разобраться с рычагами', stat: 'int', diff: 'medium' },
          { t: 'Найти того, кто дышит в темноте', stat: 'per', diff: 'medium' },
          { t: 'Спуститься к основанию маяка', stat: 'con', diff: 'hard' }
        ]
      },
      {
        text: 'Под маяком из трещины бьёт вода, и её держит фигура в тяжёлом скафандре: смотритель, семьсот лет подключённый к насосам.',
        final: true,
        ok: 'Насосы принимают твои команды, и вода отходит от стен.',
        bad: 'Рычаг обжигает холодом, и стена трещит по всей высоте.',
        options: [
          { t: 'Освободить смотрителя', stat: 'wit', diff: 'deadly' },
          { t: 'Запустить насосы вручную', stat: 'str', diff: 'hard' },
          { t: 'Погасить маяк, чтобы трещина закрылась', stat: 'int', diff: 'deadly' }
        ]
      }
    ],
    helios: [
      {
        text: 'Коридор пахнет горелым пластиком. Аварийные лампы мигают в такт чему-то тяжёлому в переборках, а табло показывает дату на сутки вперёд.',
        ok: 'Ты замечаешь на полу свежие следы: кто-то шёл здесь босиком.',
        bad: 'Переборка бьёт изнутри и оставляет вмятину размером с кулак.',
        options: [
          { t: 'Изучить журнал на терминале', stat: 'int', diff: 'easy', item: 'распечатка журнала' },
          { t: 'Пойти по следам', stat: 'per', diff: 'medium' },
          { t: 'Заклинить переборку', stat: 'str', diff: 'medium' }
        ]
      },
      {
        text: 'Оранжерея вымерзла изнутри: растения вросли в лёд, но датчик показывает плюс двадцать. На грядке кто-то оставил чашку с паром.',
        ok: 'Чашка тёплая. В отражении на дне видно затылок — хотя ты смотришь на неё спереди.',
        bad: 'Лёд трескается, и оранжерея наполняется чужим шёпотом.',
        options: [
          { t: 'Взять чашку', stat: 'wit', diff: 'medium', item: 'тёплая чашка' },
          { t: 'Проверить датчики', stat: 'int', diff: 'medium' },
          { t: 'Выломать лёд у двери', stat: 'con', diff: 'hard' }
        ]
      },
      {
        text: 'В медицинском блоке три капсулы: в двух спит экипаж, слишком спокойно. Третья открыта и пуста, но сохранила тепло.',
        ok: 'Монитор показывает регистрацию выхода: четыре часа назад, изнутри.',
        bad: 'Капсула захлопывается и прикусывает пальцы; палата краснеет от датчиков.',
        options: [
          { t: 'Прочитать данные капсулы', stat: 'int', diff: 'easy' },
          { t: 'Разбудить одного из экипажа', stat: 'cha', diff: 'hard' },
          { t: 'Заклинить створки и уйти', stat: 'str', diff: 'medium' }
        ]
      },
      {
        text: 'Двигатель работает вхолостую, и гул идёт по костям. За решёткой кто-то повторяет твой шаг — с отставанием в полсекунды.',
        ok: 'Ты разворачиваешься на звук и успеваешь увидеть, как тень уходит в вентиляцию.',
        bad: 'Тень успевает первой и выбивает свет из фонаря.',
        options: [
          { t: 'Загнать тень в тупик', stat: 'agi', diff: 'hard' },
          { t: 'Спросить, кто там', stat: 'wit', diff: 'medium' },
          { t: 'Включить свет по всей станции', stat: 'int', diff: 'hard' }
        ]
      },
      {
        text: 'В рубке сидит капитан спиной к двери, пристёгнутый ремнями. Все системы отвечают его голосом, а на экране — чужой курс.',
        final: true,
        ok: 'Курс пересчитан, двигатель принимает команду, и голос наконец замолкает.',
        bad: 'Кресло разворачивается само, и вместо лица у капитана — экран.',
        options: [
          { t: 'Отключить систему жизнеобеспечения', stat: 'int', diff: 'hard' },
          { t: 'Поговорить с капитаном', stat: 'wit', diff: 'deadly' },
          { t: 'Вытащить капитана из кресла', stat: 'str', diff: 'medium' }
        ]
      }
    ],
    greyhaven: [
      {
        text: 'Дождь стучит по жестяным навесам. В порту разгружают ящики, которых нет ни в одной накладной, и бригадир смотрит в сторону.',
        ok: 'Бригадир отводит взгляд чуть слишком поздно — ты запоминаешь номер склада.',
        bad: 'Разговор обрывается на полуслове, и в телефонной будке через улицу снимают трубку.',
        options: [
          { t: 'Прочитать накладные', stat: 'int', diff: 'easy', item: 'копия накладной' },
          { t: 'Поговорить с бригадиром', stat: 'cha', diff: 'medium' },
          { t: 'Заглянуть в кузов фургона', stat: 'agi', diff: 'medium' }
        ]
      },
      {
        text: 'В баре «Пятая пристань» полно дыма. Пианист играет одну и ту же фразу и не сбивается, даже когда в бильярдной кто-то стреляет.',
        ok: 'Пианист повторяет фразу, и по ритму ты слышишь, где в ней спрятана цифра.',
        bad: 'Разговоры обрываются, и вся стойка поворачивается к тебе.',
        options: [
          { t: 'Поговорить с пианистом', stat: 'cha', diff: 'medium' },
          { t: 'Сыграть на бильярде на информацию', stat: 'agi', diff: 'medium' },
          { t: 'Проверить кабинет хозяина', stat: 'per', diff: 'hard' }
        ]
      },
      {
        text: 'Склад номер семь пуст, но пол вымыт с мылом, и в воздухе держится запах формалина. На стене — свежая мелом полоса.',
        ok: 'За полосой проём: этой стеной ходили часто.',
        bad: 'Под ногами сдвигается половица, и мытый пол разбегается досками.',
        options: [
          { t: 'Открыть проём', stat: 'int', diff: 'medium' },
          { t: 'Осмотреть пол на следы', stat: 'per', diff: 'medium' },
          { t: 'Спрятаться под стеллаж и ждать', stat: 'agi', diff: 'medium' }
        ]
      },
      {
        text: 'На пирсе стоит человек с зонтом, будто не замечает воды под ногами. Он представляется твоим именем — до последней буквы.',
        ok: 'Он отвечает на вопрос, которого ты не задавал, и это оказывается нужная подсказка.',
        bad: 'Он произносит фразу, которую ты сказал двенадцать лет назад. Дыхание сбивается.',
        options: [
          { t: 'Спросить, кто его послал', stat: 'cha', diff: 'medium' },
          { t: 'Ударить первым', stat: 'str', diff: 'hard' },
          { t: 'Отступить и следить за ним', stat: 'per', diff: 'medium' }
        ]
      },
      {
        text: 'В трюме парохода «Мария Стикс» двадцать гробов. В девятнадцати — не люди. В двадцатом тот самый груз: портфель из чёрной кожи, ещё застёгнутый.',
        final: true,
        ok: 'Портфель открывается без усилия, и внутри — документы на весь город.',
        bad: 'Крышка одного гроба сдвигается, и вода в трюме поднимается до щиколоток.',
        options: [
          { t: 'Открыть портфель', stat: 'int', diff: 'medium' },
          { t: 'Уйти и передать всё полиции', stat: 'wit', diff: 'hard' },
          { t: 'Закрыть трюм и поджечь', stat: 'str', diff: 'hard' }
        ]
      }
    ],
    karat: [
      {
        text: 'Трасса забита песком по крыши машин. На горизонте ржавый эшелон поперёк дороги, и оттуда машут рукой.',
        ok: 'Машет не человек, а тряпка на антенне — но в вагоне есть вода.',
        bad: 'Ветер поднимает пыль, и дозиметр начинает щёлкать чаще.',
        options: [
          { t: 'Подойти к вагону', stat: 'int', diff: 'easy' },
          { t: 'Осмотреть обочину', stat: 'per', diff: 'medium', item: 'канистра с водой' },
          { t: 'Обойти эшелон по дюнам', stat: 'con', diff: 'medium' }
        ]
      },
      {
        text: 'В тени вагона сидит женщина с собакой без лапы. Имени твоего она не спрашивает, а сразу называет цену за проход к «Тихому куполу».',
        ok: 'Собака обнюхивает твою руку и отходит: платить не придётся.',
        bad: 'Собака рычит, и женщина поднимает копьё из арматуры.',
        options: [
          { t: 'Торговаться', stat: 'cha', diff: 'medium' },
          { t: 'Показать свои запасы', stat: 'int', diff: 'medium' },
          { t: 'Забрать воду силой', stat: 'str', diff: 'hard' }
        ]
      },
      {
        text: 'Посреди пустоши стоит вышка с рупором. Он повторяет одно и то же: «не идите на юг, там уже никого».',
        ok: 'В рупоре слышен фон: на юге работает генератор. Значит, кто-то есть.',
        bad: 'Рупор захлёбывается помехами, и в них звучит твой собственный голос.',
        options: [
          { t: 'Разобрать аппаратуру', stat: 'int', diff: 'medium', item: 'аккумулятор от рупора' },
          { t: 'Спросить, кто говорит', stat: 'wit', diff: 'hard' },
          { t: 'Позвать на помощь', stat: 'cha', diff: 'medium' }
        ]
      },
      {
        text: 'На ночёвке в бетонной трубе слышно, как по песку идёт кто-то большой и считает шаги вслух. На счёте «семь» он останавливается у входа.',
        ok: 'Ты зажигаешь фонарь, и шаги уходят, оставив след из двух полос.',
        bad: 'Оно всовывает в трубу руку и сгребает твой рюкзак.',
        options: [
          { t: 'Смотреть в темноту до рассвета', stat: 'wit', diff: 'medium' },
          { t: 'Выйти навстречу с ножом', stat: 'str', diff: 'hard' },
          { t: 'Выбраться через второй выход', stat: 'agi', diff: 'easy' }
        ]
      },
      {
        text: '«Тихий купол» — бетонный ангар, где работает один насос и живёт один человек. Воды хватит на двадцать лет, но дверь открывается только изнутри.',
        final: true,
        ok: 'Штурвал поддаётся, и в лицо ударяет сырой прохладный воздух.',
        bad: 'Из ангара отвечают: «мест нет», — и включают сирену.',
        options: [
          { t: 'Убедить открыть дверь', stat: 'cha', diff: 'hard' },
          { t: 'Вскрыть створку домкратом', stat: 'str', diff: 'hard' },
          { t: 'Найти способ открыть изнутри', stat: 'int', diff: 'deadly' }
        ]
      }
    ]
  };

  /** Универсальный сюжет для фан-миров и своего мира. */
  const GENERIC_STORY = [
    {
      text: 'Первый шаг всегда слышно: мир отвечает на него — скрипом половицы, эхом, чужим взглядом из окна напротив.',
      ok: 'Ты замечаешь то, мимо чего прошли бы другие: деталь, которой здесь быть не должно.',
      bad: 'Мир отвечает не отказом, а осложнением: уходит время и часть запасов.',
      options: [
        { t: 'Осмотреться и запомнить ориентиры', stat: 'per', diff: 'easy' },
        { t: 'Заговорить с первым, кто рядом', stat: 'cha', diff: 'medium' },
        { t: 'Идти к цели напрямик', stat: 'wit', diff: 'medium' }
      ]
    },
    {
      text: 'Дорогу перекрывает чужая игра: здесь кто-то уже расставил правила и ждёт, что ты их примешь.',
      ok: 'Ты разгадываешь чужие правила и обходишь их.',
      bad: 'Правила оказываются честнее, чем ты думал, и это дорого стоит.',
      options: [
        { t: 'Сыграть по чужим правилам', stat: 'int', diff: 'medium' },
        { t: 'Сломать правило', stat: 'str', diff: 'hard' },
        { t: 'Обойти стороной и выждать', stat: 'agi', diff: 'medium' }
      ]
    },
    {
      text: 'Появляется тот, кого стоит запомнить: он говорит быстро, смотрит в сторону и знает больше, чем должен.',
      ok: 'Он делится половиной правды — этого хватает, чтобы двинуться дальше.',
      bad: 'Он исчезает, оставив после себя вопрос и счёт к оплате.',
      options: [
        { t: 'Надавить и вытрясти всё', stat: 'wit', diff: 'medium' },
        { t: 'Предложить сделку', stat: 'cha', diff: 'medium' },
        { t: 'Проследить за ним', stat: 'per', diff: 'hard' }
      ]
    },
    {
      text: 'Ты выдыхаешься. Тело напоминает о себе, а цель всё ещё далека — впереди последний отрезок пути.',
      ok: 'Ты находишь силы там, где их обычно нет.',
      bad: 'Усталость берёт своё, и путь становится длиннее.',
      options: [
        { t: 'Перевести дух и починить снаряжение', stat: 'int', diff: 'easy' },
        { t: 'Идти дальше через силу', stat: 'con', diff: 'medium' },
        { t: 'Найти место для короткого отдыха', stat: 'per', diff: 'medium' }
      ]
    },
    {
      text: 'Всё сходится в одной точке: то, за чем ты шёл, здесь. Осталось решить, как это взять.',
      final: true,
      ok: 'Получается: цель взята, и мир вокруг меняется — тихо, но навсегда.',
      bad: 'Оно сопротивляется, и ошибка стоит дорого — но не окончательно.',
      options: [
        { t: 'Действовать прямо и грубо', stat: 'str', diff: 'hard' },
        { t: 'Найти слабое место', stat: 'int', diff: 'medium' },
        { t: 'Договориться с тем, кто ждёт', stat: 'cha', diff: 'deadly' }
      ]
    }
  ];

  const ATMOSPHERE = {
    asgeld: ['Лес молчит так ровно, будто слушает.', 'Под ногами хрустит не ветка, а что-то более хрупкое.', 'Колокольчик в глубине звонит ещё раз — ближе, чем раньше.'],
    aurelia: ['Вода снаружи купола глухо давит на стекло.', 'Где-то внизу расходятся круги: там прошло что-то большое.', 'Индикатор давления мигает зелёным всё реже.'],
    helios: ['Система впрыскивает в воздух запах горелого пластика.', 'В стене что-то трижды стукает — ровно, как по счёту.', 'Табло показывает, что до следующей смены шестнадцать минут.'],
    greyhaven: ['Дождь барабанит по жестяному навесу, заглушая шаги.', 'Вода в канале пахнет мазутом и чужими секретами.', 'Где-то за углом гасят фары — слишком быстро для честного такси.'],
    karat: ['Ветер несёт пыль, которая скрипит на зубах.', 'Счётчик дозиметра щёлкает чаще, чем хотелось бы.', 'На горизонте дрожит марево — а может, это кто-то идёт.'],
    azeroth: ['Горн на стене форта ревёт третий раз за сутки.', 'За воротами кто-то точит клинок — медленно, не торопясь.', 'В трактире спорят, кто пойдёт в рейд первым.'],
    nightcity: ['Неон мигает в такт рекламе имплантов: «сначала — потом спросишь».', 'Дрон-доставщик снимает тебя на видео и уходит.', 'В подворотне пахнет отработанным охлаждением и чужой ложью.'],
    runeterra: ['Руна на стене теплеет, когда ты подходишь ближе.', 'Судья арены объявляет правила, которых вчера ещё не было.', 'Где-то на линии кто-то невидимый ставит вард.']
  };
  const GENERIC_ATMOSPHERE = [
    'Свет здесь падает не так, как должен.',
    'Тишина держится ровно до следующего твоего шага.',
    'Ветер приносит запах, который ты уже где-то встречал.',
    'Кто-то наблюдает — не зло, но внимательно.'
  ];

  const storyFor = id => STORY[id] || GENERIC_STORY;
  function storyBeat(id, index) {
    const beats = storyFor(id);
    return beats[Math.max(0, Math.min(index, beats.length - 1))];
  }

  /* ---------------------------------------------------------- */
  /* Оффлайн-мастер                                             */
  /* ---------------------------------------------------------- */
  const GENERIC_OPTIONS = [
    { text: 'Осмотреться и прислушаться к окружению', stat: 'per', difficulty: 'easy' },
    { text: 'Двигаться дальше, держась в тени', stat: 'agi', difficulty: 'medium' },
    { text: 'Рискнуть и пойти напролом', stat: 'str', difficulty: 'hard' },
    { text: 'Проверить снаряжение и перевести дух', stat: 'int', difficulty: 'easy' },
    { text: 'Окликнуть тех, кто рядом, и ждать ответа', stat: 'cha', difficulty: 'medium' },
    { text: 'Изучить следы, оставленные до тебя', stat: 'per', difficulty: 'medium' }
  ];

  const OUTCOME_FLAVOR = {
    crit: ['Случается редкое: всё складывается лучше, чем можно было надеяться.', 'Тебе улыбается удача — той разновидности, которая потом требует долгов.'],
    success: ['Получается — не идеально, но так, как нужно.', 'Замысел срабатывает; путь открыт, хотя и ненадолго.'],
    fail: ['Не выходит. Мир отвечает не отказом, а осложнением.', 'Попытка срывается — и ты тратишь больше, чем рассчитывал.'],
    fumble: ['Всё идёт не так сразу и по нескольким причинам.', 'Худший вариант из возможных, и он ещё не закончился.']
  };

  function storyOptions(beat, danger) {
    return (beat.options || []).map((o, i) => {
      const dc = shiftDc(difficultyById(o.diff || 'medium').dc, danger);
      return {
        id: 'o' + i,
        text: o.t,
        stat: STAT_IDS.includes(o.stat) ? o.stat : rnd.pick(STAT_IDS),
        difficulty: difficultyForDc(dc).id,
        dc,
        item: o.item || ''
      };
    });
  }

  /** Мир словами: чем он живёт, что здесь за порядок вещей. */
  function offlineWorldIntro(game) {
    const s = scenarioById(game.scenarioId);
    const c = game.worldConfig || {};
    const atm = ATMOSPHERE[game.scenarioId] || GENERIC_ATMOSPHERE;
    const parts = [];
    parts.push(`Мир: ${game.title || s.title}. ${c.genre || s.genre}.`);
    if (c.tone) parts.push(`Тон — ${String(c.tone).toLowerCase()}: тут не объясняют дважды.`);
    if (c.place) parts.push(`Начинается всё в «${c.place}» — и это место живёт по своим правилам.`);
    if (c.ingredients && c.ingredients.length) {
      parts.push(`Здесь есть ${c.ingredients.join(', ').toLowerCase()} — и всё это уже вписано в чью-то игру.`);
    }
    if (c.gameName) parts.push(`Правила и дух — как в игре «${c.gameName}»: узнаваемые места, лица и порядки.`);
    else if (s.systemHint) parts.push(s.systemHint);
    parts.push(rnd.pick(atm));
    return parts.join(' ');
  }

  /** Предыстория героя: откуда он, что потерял, что несёт с собой. */
  function offlineBackstory(game) {
    const h = game.hero;
    const o = originById(h.originId), r = raceById(h.raceId), c = classById(h.classId);
    const parts = [];
    parts.push(`${h.name} — ${String(h.raceName).toLowerCase()}, ${String(c.title).toLowerCase()}. ${c.blurb}`);
    parts.push(o.hook);
    parts.push(r.trait);
    if (h.inventory.length) parts.push(`С собой — ${h.inventory.join(', ')}: немного, но это всё, что осталось.`);
    parts.push(`Цель, которая привела сюда: ${game.goal || s0Goal(game)}`);
    return parts.join(' ');
  }
  function s0Goal(game) {
    const s = scenarioById(game.scenarioId);
    return s.goal || 'разобраться, что здесь происходит';
  }

  /** План отыгрыша: три шага, а не «убей вора в переулке». */
  function offlinePlan(game) {
    const s = scenarioById(game.scenarioId);
    const c = game.worldConfig || {};
    const place = c.place || s.title;
    const goal = game.goal || s.goal || 'понять, что здесь происходит';
    return [
      `Осмотреться в «${place}»: кто здесь главный, кто на тебя смотрит и что тут считается нормой.`,
      `Взяться за первое звено: ${goal.charAt(0).toLowerCase() + goal.slice(1)}.`,
      `Найти союзника или рычаг: в одиночку эта история не развяжется.`
    ];
  }

  /** Первая сцена: для готовых миров — авторское вступление, для своих — сборка по настройкам. */
  function offlineScene(game, beat) {
    const s = scenarioById(game.scenarioId);
    if (s.opening) return s.opening;
    const c = game.worldConfig || {};
    const bits = [];
    if (c.place) {
      bits.push(`«${c.place}» встречает тебя без предупреждения.`);
    } else if (c.genre) {
      bits.push(`${c.genre} — и ты уже внутри этой истории.`);
    } else {
      bits.push('Мир открывается без предупреждения: ни карты, ни имени, ни запасного выхода.');
    }
    if (c.ingredients && c.ingredients.length) {
      bits.push(`Первое, что бросается в глаза: ${c.ingredients.slice(0, 3).join(', ').toLowerCase()}.`);
    }
    if (c.extra) bits.push(c.extra);
    if (game.goal) bits.push(`Цель, которую ты держишь в голове: ${game.goal}.`);
    return bits.join(' ') + ' ' + beat.text;
  }

  function offlineOpening(game) {
    const beat = storyBeat(game.scenarioId, 0);
    game.offlineBeat = 0;
    const scene = offlineScene(game, beat);
    return {
      ok: true, offline: true,
      world: offlineWorldIntro(game),
      backstory: offlineBackstory(game),
      plan: offlinePlan(game),
      scene: scene + ' ' + beat.text,
      chapter: 'Пролог',
      npc: '',
      imagePrompt: composeSceneImagePrompt(game, { sceneText: scene }),
      options: storyOptions(beat, game.worldConfig && game.worldConfig.danger),
      effects: { hp: 0, item: '', goal: false }
    };
  }


  function offlineTurn(game, action, check) {
    const s = scenarioById(game.scenarioId);
    const beats = storyFor(s.id);
    const index = Math.max(0, Math.min(game.offlineBeat || 0, beats.length - 1));
    const beat = beats[index];
    const outcome = check ? check.outcome : 'success';
    const success = outcome === 'crit' || outcome === 'success';
    const actionText = (action && action.text ? action.text : 'осмотреться').replace(/\.$/, '');
    const atmo = ATMOSPHERE[s.id] || GENERIC_ATMOSPHERE;
    const lines = [
      `${actionText.charAt(0).toUpperCase()}${actionText.slice(1)}.`,
      success ? beat.ok : beat.bad,
      rnd.pick(OUTCOME_FLAVOR[outcome] || OUTCOME_FLAVOR.success)
    ];
    if (game.hero.hp <= game.hero.maxHp * 0.4) lines.push(`Силы на исходе: ${game.hero.hp} из ${game.hero.maxHp}.`);
    if (rnd.chance(0.6)) lines.push(rnd.pick(atmo));

    const danger = game.worldConfig && game.worldConfig.danger;
    const effects = {
      hp: success ? (outcome === 'crit' ? 1 : 0) : (outcome === 'fumble' ? -rnd.int(3, 4) : -rnd.int(1, 2)),
      item: success && action && action.item ? action.item : '',
      goal: false
    };
    let nextIndex = index + 1;
    let options;
    if (beat.final && success) {
      effects.goal = true;
      lines.push('Дальше — как повезёт: история этой главы закончена.');
      nextIndex = beats.length - 1;
      options = rnd.shuffle(GENERIC_OPTIONS).slice(0, 3).map((o, i) => {
        const dc = shiftDc(difficultyById(o.difficulty).dc, danger);
        return { id: 'o' + i, text: o.text, stat: o.stat, difficulty: difficultyForDc(dc).id, dc };
      });
    } else if (beat.final && !success) {
      lines.push('Придётся попробовать иначе.');
      options = storyOptions(beat, danger);
    } else {
      const nextBeat = beats[nextIndex];
      lines.push(nextBeat.text);
      options = storyOptions(nextBeat, danger);
    }
    game.offlineBeat = nextIndex;
    const scene = lines.filter(Boolean).join(' ');
    return {
      ok: true, offline: true,
      scene,
      chapter: index === 0 ? 'Глава I' : (index === 2 ? 'Глава II' : (beat.final ? 'Финал' : '')),
      npc: '',
      imagePrompt: composeSceneImagePrompt(game, {
        aiPrompt: s.imagePrompts[index % s.imagePrompts.length],
        sceneText: scene
      }),
      options,
      effects
    };
  }

  /* ---------------------------------------------------------- */
  /* Эффекты, умения, прогресс                                  */
  /* ---------------------------------------------------------- */
  function useAbility(game) {
    const h = game.hero;
    const a = h.ability;
    if (!a || !a.ready) return { ok: false };
    const notes = [];
    if (a.kind === 'heal') {
      const before = h.hp;
      h.hp = clamp(h.hp + a.power, 0, h.maxHp);
      notes.push({ type: 'hp', icon: '💚', text: `${a.name}: +${h.hp - before} здоровья` });
    } else if (a.kind === 'bless') {
      h.buff = (h.buff || 0) + a.power;
      notes.push({ type: 'buff', icon: '🌟', text: `${a.name}: +${a.power} к следующему броску` });
    } else if (a.kind === 'advantage') {
      h.advantage = true;
      notes.push({ type: 'buff', icon: '🌑', text: `${a.name}: следующая проверка с преимуществом` });
    }
    a.ready = false;
    a.cooldown = ABILITY_COOLDOWN;
    return { ok: true, ability: a, notes };
  }

  /** Тик после хода: восстановление умения и сброс баффов. */
  function tickCooldowns(game) {
    const h = game.hero;
    if (!h.ability) return;
    if (!h.ability.ready) {
      h.ability.cooldown = Math.max(0, (h.ability.cooldown || 0) - 1);
      if (h.ability.cooldown === 0) h.ability.ready = true;
    }
    h.buff = 0;
    h.advantage = false;
  }

  function applyEffects(game, effects) {
    const notes = [];
    if (!effects) return notes;
    if (effects.hp) {
      const before = game.hero.hp;
      game.hero.hp = clamp(game.hero.hp + effects.hp, 0, game.hero.maxHp);
      const delta = game.hero.hp - before;
      if (delta < 0) notes.push({ type: 'hp', icon: '💔', text: `−${Math.abs(delta)} здоровья` });
      if (delta > 0) notes.push({ type: 'hp', icon: '💚', text: `+${delta} здоровья` });
    }
    const item = typeof effects.item === 'string' ? effects.item.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
    if (item) {
      game.hero.inventory.push(item);
      if (game.hero.inventory.length > 12) game.hero.inventory.shift();
      notes.push({ type: 'item', icon: '🎒', text: `Получено: ${item}` });
    }
    if (effects.goal && !game.questDone) {
      game.questDone = true;
      notes.push({ type: 'goal', icon: '🏁', text: 'Задача выполнена!' });
    }
    if (game.hero.hp <= 0) game.over = true;
    return notes;
  }

  function pushLog(game, entry) {
    game.log.push(Object.assign({ t: Date.now() }, entry));
    if (game.log.length > 80) game.log.splice(0, game.log.length - 80);
    game.summary = summarizeLog(game.log);
    return game.log[game.log.length - 1];
  }

  /* ---------------------------------------------------------- */
  /* Сохранения                                                 */
  /* ---------------------------------------------------------- */
  const SAVE_PREFIX = 'dt2:game:';
  const INDEX_KEY = 'dt2:index';
  const SETTINGS_KEY = 'dt2:settings';
  const WORLDS_KEY = 'dt2:worlds';

  function createStorage(driver) {
    const ls = driver;
    const safeGet = k => { try { return ls.getItem(k); } catch (e) { return null; } };
    const safeSet = (k, v) => { try { ls.setItem(k, v); return true; } catch (e) { return false; } };
    const safeDel = k => { try { ls.removeItem(k); } catch (e) { /* noop */ } };

    return {
      list() {
        try {
          const raw = JSON.parse(safeGet(INDEX_KEY) || '[]');
          return Array.isArray(raw) ? raw.filter(x => x && x.id).sort((a, b) => b.updatedAt - a.updatedAt) : [];
        } catch (e) { return []; }
      },
      writeIndex(items) { return safeSet(INDEX_KEY, JSON.stringify(items.slice(0, 40))); },
      upsert(entry) {
        const list = this.list().filter(x => x.id !== entry.id);
        list.unshift(entry);
        this.writeIndex(list);
      },
      remove(id) {
        safeDel(SAVE_PREFIX + id);
        this.writeIndex(this.list().filter(x => x.id !== id));
      },
      save(game) {
        if (!game || !game.id) return false;
        game.updatedAt = Date.now();
        const ok = safeSet(SAVE_PREFIX + game.id, JSON.stringify(game));
        this.upsert({
          id: game.id,
          title: game.title,
          scenarioTitle: game.scenarioTitle,
          cover: game.cover,
          heroName: game.hero.name,
          heroArch: game.hero.className || game.hero.archetype,
          heroIcon: game.hero.icon,
          heroRace: game.hero.raceName,
          turn: game.turn,
          hp: game.hero.hp,
          maxHp: game.hero.maxHp,
          chapter: game.chapter,
          over: !!game.over,
          questDone: !!game.questDone,
          createdAt: game.createdAt,
          updatedAt: game.updatedAt
        });
        return ok;
      },
      load(id) {
        const raw = safeGet(SAVE_PREFIX + id);
        if (!raw) return null;
        try { return migrate(JSON.parse(raw)); } catch (e) { return null; }
      },
      has(id) { return !!safeGet(SAVE_PREFIX + id); },
      clearAll() {
        this.list().forEach(it => safeDel(SAVE_PREFIX + it.id));
        safeDel(INDEX_KEY);
        safeDel(WORLDS_KEY);
      },
      /* свои миры, которые игрок сохранил в конструкторе */
      worlds() {
        try {
          const raw = JSON.parse(safeGet(WORLDS_KEY) || '[]');
          return Array.isArray(raw) ? raw.filter(w => w && w.id) : [];
        } catch (e) { return []; }
      },
      saveWorld(world) {
        if (!world) return false;
        const list = this.worlds().filter(w => w.id !== (world.id || world.title));
        list.unshift(Object.assign({ id: world.id || world.title, createdAt: Date.now() }, world));
        return safeSet(WORLDS_KEY, JSON.stringify(list.slice(0, 20)));
      },
      removeWorld(id) {
        return safeSet(WORLDS_KEY, JSON.stringify(this.worlds().filter(w => w.id !== id)));
      },
      settings() {
        try { return Object.assign({ muted: false }, JSON.parse(safeGet(SETTINGS_KEY) || '{}')); }
        catch (e) { return { muted: false }; }
      },
      saveSettings(s) { return safeSet(SETTINGS_KEY, JSON.stringify(s || {})); }
    };
  }

  /** Приведение старых сохранений к текущей схеме (v1/v2 → v3). */
  function migrate(game) {
    if (!game || typeof game !== 'object') return null;
    const h = game.hero || (game.hero = {});
    if (!game.schema || game.schema < SCHEMA_VERSION) {
      // класс: старое поле archetypeId
      const classId = h.classId || h.archetypeId || 'warrior';
      const raceId = h.raceId || 'human';
      const originId = h.originId || 'streets';
      h.classId = classId;
      h.className = h.className || classById(classId).title;
      h.classIcon = h.classIcon || classById(classId).icon;
      h.raceId = raceId;
      h.raceName = h.raceName || raceById(raceId).title;
      h.raceIcon = h.raceIcon || raceById(raceId).icon;
      h.originId = originId;
      h.originName = h.originName || originById(originId).title;
      h.originIcon = h.originIcon || originById(originId).icon;
      h.archetype = h.className;
      h.archetypeId = classId;
      h.icon = h.icon || h.classIcon;
      // статы: сохраняем прежние значения, добираем недостающие характеристики
      const fresh = makeStats({ classId, raceId, originId });
      const old = h.stats || {};
      const stats = {};
      STAT_IDS.forEach(id => { stats[id] = Number.isFinite(old[id]) ? old[id] : fresh[id]; });
      h.stats = stats;
      h.maxHp = h.maxHp || maxHpFor({ classId, stats });
      h.hp = Number.isFinite(h.hp) ? clamp(h.hp, 0, h.maxHp) : h.maxHp;
      h.inventory = h.inventory || (originById(originId).item ? [originById(originId).item] : []);
      h.hooks = h.hooks || [originById(originId).hook, raceById(raceId).trait].filter(Boolean);
      h.ability = h.ability || makeAbility(classId);
      if (h.buff === undefined) h.buff = 0;
      game.log = game.log || [];
      game.usedImagePrompts = game.usedImagePrompts || [];
      game.scenarioBase = game.scenarioBase || game.scenarioId;
      game.schema = SCHEMA_VERSION;
    }
    return game;
  }

  function probabilityLabel(mod, dc, advantage) {
    return Math.round(successChance(mod, dc, advantage) * 100) + '%';
  }

  return {
    SCHEMA_VERSION, STATS, STAT_IDS, BASE_STAT, ABILITIES, CLASSES, RACES, ORIGINS,
    DIFFICULTY, DANGER_LEVELS, WORLD_OPTIONS, OWN_ROLES, ABILITY_COOLDOWN,
    SCENARIOS, GAME_WORLDS, CUSTOM_SCENARIO, STORY, GENERIC_STORY,
    SAVE_PREFIX, INDEX_KEY, SETTINGS_KEY, WORLDS_KEY,
    rnd, statById, classById, abilityById, raceById, originById, raceFlavor,
    CLASS_ART, RACE_ART, heroArtTag, defaultHeroProfile, heroProfileFromWorld, matchOptions,
    HERO_SYSTEM_PROMPT, buildHeroPrompt, parseHeroReply, heroProfileFromText, parseBonusText, splitAbility,
    KNOWN_GAME_PROFILES, offlineHeroProfile, statsFor, abilityForHero, pickProfileOption,
    fillProfileGaps, statForText, heroPromptThreat, isSamePlace, placeStems, sceneLightFromText,
    abilityFromOption, cleanBonus, hpBonusFromStats, CUSTOM_ICONS,
    makeStats, maxHpFor, makeAbility,
    difficultyById, difficultyForDc, shiftDc, rollDie, rollD20, successChance, resolveCheck,
    scenarioById, randomScenarioSet, emptyWorldConfig, buildWorldPrompt, sceneKindFromText,
    createGame, newGameId,
    SYSTEM_PROMPT, buildTurnPrompt, worldDescription, heroDescription, summarizeLog,
    buildImageUrl, fallbackImagePrompt,
    extractJsonObject, parseGmResponse, parseWorldResponse, sanitizeOption,
    offlineTurn, offlineOpening, offlineScene, offlineWorldIntro, offlineBackstory, offlinePlan,
    sceneActors, composeSceneImagePrompt, parsePlan, storyOptions, useAbility, tickCooldowns,
    applyEffects, pushLog, createStorage, migrate, probabilityLabel, OUTCOME_LABEL,
    storyFor, storyBeat, ATMOSPHERE, GENERIC_ATMOSPHERE,
    emptyMemory, memoryOf, memoryBlock, rememberTurn, rememberFact, openingOf, rulesOf, defaultRules,
    rulesLine, TONES, RATINGS, ART_PACKS, artStyleFor, styleOf, stylePrompt, placeKey, placePrompt,
    portraitPrompt, polishSceneText, dedupeOptions, resolveDefeat, epilogueText, buildEpiloguePrompt,
    extractPartialField, salvageWorldResponse, sliceAfterKey, listFromPartialArray,
    LEGACY_KEY, LEGACY_UNLOCKS, emptyLegacy, legacyUnlocked, legacyNextUnlock,
    applyRunToLegacy, legacySummary, legacyBlock, legacyOptions, applyLegacyGifts
  };
});
