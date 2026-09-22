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
    const c = classById(classId), r = raceById(raceId), o = originById(originId);
    const stats = {};
    STAT_IDS.forEach(id => {
      stats[id] = BASE_STAT + (c.bonus[id] || 0) + (r.bonus[id] || 0) + (o.bonus[id] || 0);
    });
    return stats;
  }
  const maxHpFor = ({ classId, stats }) =>
    Math.max(8, 8 + 2 * ((stats && stats.con) || BASE_STAT) + (classById(classId).hpBonus || 0));

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
        'video game cinematic environment, hero silhouette, moody light',
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
  function buildWorldPrompt(config, baseScenario) {
    const c = config || emptyWorldConfig();
    const s = baseScenario || null;
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
      c.extra ? `- пожелания игрока: ${c.extra}` : ''
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
      '  "opening": "вступительная сцена, 3-5 предложений, второе лицо, живая деталь, ощутимая угроза",',
      '  "chapter": "название первой главы, 2-4 слова",',
      '  "npc": "имя и одна деталь персонажа, появившегося рядом, иначе пустая строка",',
      '  "imagePrompt": "English image prompt for the very first scene, 8-14 words, location + light + mood, no text",',
      '  "options": [ {"text": "...", "stat": "str|agi|con|int|per|wit|cha", "difficulty": "easy|medium|hard|deadly"} x3 ]',
      '}',
      'Ровно 3 варианта действий. Только JSON, без пояснений.'
    );
    return lines.join('\n');
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
    const cls = classById(classId);
    const race = raceById(raceId);
    const origin = originById(originId);
    const stats = makeStats({ classId: cls.id, raceId: race.id, originId: origin.id });
    const maxHp = maxHpFor({ classId: cls.id, stats });
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
      hero: {
        name,
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
        hooks: [origin.hook, race.trait].filter(Boolean),
        ability: makeAbility(cls.id),
        buff: 0
      },
      goal: scenario.goal || '',
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
      ['city', /city|street|neon|tower|urban|market|город|улиц|неон|башн|квартал|порт|док/],
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
  /* Промпты                                                    */
  /* ---------------------------------------------------------- */
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
    '  "chapter": "название главы, 2–4 слова, если сменилась локация, иначе пустая строка",',
    '  "npc": "имя и одна деталь о персонаже, если появился, иначе пусто",',
    '  "imagePrompt": "English prompt for an image generator: 8-14 words, location + light + mood, no text",',
    '  "options": [',
    '    {"text": "что делает игрок (1 предложение, от третьего лица)", "stat": "str|agi|con|int|per|wit|cha", "difficulty": "easy|medium|hard|deadly"}',
    '  ],',
    '  "effects": {"hp": 0, "item": "", "goal": false}',
    '}',
    'Поле "stat" — проверяемая характеристика: str сила, agi ловкость, con телосложение, int разум, per восприятие, wit воля, cha харизма.',
    '"difficulty": easy — простое (dc 8), medium (dc 11), hard (dc 14), deadly (dc 17).',
    '"effects.hp" — целое число от -6 до +4, обычно 0. "effects.item" — короткое название предмета или пусто.',
    'Пиши на русском, но "imagePrompt" — всегда на английском.'
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
    return [
      worldDescription(game),
      `ВСТУПЛЕНИЕ МИРА: ${scenarioById(game.scenarioId).opening || game.goal}`,
      heroDescription(game),
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

  const STAT_ALIASES = {
    сила: 'str', strength: 'str', мощь: 'str', str: 'str',
    ловкость: 'agi', agility: 'agi', dex: 'agi', agi: 'agi', ловк: 'agi',
    телосложение: 'con', тело: 'con', выносливость: 'con', constitution: 'con', con: 'con', end: 'con',
    разум: 'int', интеллект: 'int', intelligence: 'int', знания: 'int', ум: 'int', int: 'int',
    восприятие: 'per', внимание: 'per', perception: 'per', per: 'per', wis: 'per',
    воля: 'wit', дух: 'wit', wit: 'wit', will: 'wit',
    харизма: 'cha', убеждение: 'cha', charisma: 'cha', cha: 'cha'
  };
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
      scene: String(sceneSrc).replace(/\s+/g, ' ').trim().slice(0, 900),
      chapter: typeof data.chapter === 'string' ? data.chapter.trim().slice(0, 60) : '',
      npc: typeof data.npc === 'string' ? data.npc.trim().slice(0, 120) : '',
      imagePrompt: typeof imgPrompt === 'string' ? imgPrompt.trim().slice(0, 260) : '',
      options,
      effects,
      raw: data
    };
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
      opening,
      chapter: typeof data.chapter === 'string' ? data.chapter.trim().slice(0, 60) : 'Пролог',
      npc: typeof data.npc === 'string' ? data.npc.trim().slice(0, 120) : '',
      imagePrompt: typeof data.imagePrompt === 'string' ? data.imagePrompt.trim().slice(0, 260) : '',
      options: Array.isArray(data.options) ? data.options : []
    };
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

  function offlineOpening(game) {
    const s = scenarioById(game.scenarioId);
    const episode = (game.worldConfig && (game.worldConfig.extra || game.worldConfig.genre)) || '';
    const beat = storyBeat(game.scenarioId, 0);
    game.offlineBeat = 0;
    const intro = s.opening || `Мир открывается без предупреждения: ${game.goal || 'цель пока неясна'}. ${episode}`;
    return {
      ok: true, offline: true,
      scene: intro + ' ' + beat.text,
      chapter: 'Пролог',
      npc: '',
      imagePrompt: (game.worldConfig && game.worldConfig.gameName)
        ? (s.title + ', ' + game.worldConfig.gameName).slice(0, 120)
        : s.imagePrompts[0],
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
    return {
      ok: true, offline: true,
      scene: lines.filter(Boolean).join(' '),
      chapter: index === 0 ? 'Глава I' : (index === 2 ? 'Глава II' : (beat.final ? 'Финал' : '')),
      npc: '',
      imagePrompt: s.imagePrompts[index % s.imagePrompts.length],
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
    makeStats, maxHpFor, makeAbility,
    difficultyById, difficultyForDc, shiftDc, rollDie, rollD20, successChance, resolveCheck,
    scenarioById, randomScenarioSet, emptyWorldConfig, buildWorldPrompt, sceneKindFromText,
    createGame, newGameId,
    SYSTEM_PROMPT, buildTurnPrompt, worldDescription, heroDescription, summarizeLog,
    buildImageUrl, fallbackImagePrompt,
    extractJsonObject, parseGmResponse, parseWorldResponse, sanitizeOption,
    offlineTurn, offlineOpening, storyOptions, useAbility, tickCooldowns,
    applyEffects, pushLog, createStorage, migrate, probabilityLabel, OUTCOME_LABEL,
    storyFor, storyBeat, ATMOSPHERE, GENERIC_ATMOSPHERE
  };
});
