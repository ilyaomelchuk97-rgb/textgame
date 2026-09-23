/* ------------------------------------------------------------------ *
 * Книги-игры: главы, написанные вручную.
 *
 * Это страховка: если канал к ИИ мёртв, а интернет пропал, игра всё равно
 * остаётся игрой — с текстом, развилками и концовками. Здесь нет ни сети,
 * ни модели: только главы, выборы и последствия.
 *
 * Формат книги: узлы (node). У узла — абзацы текста, варианты выбора и
 * пометки (нужный флаг, потеря здоровья, полученный предмет, концовка).
 * ------------------------------------------------------------------ */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Books = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* Книга первая: тёмное фэнтези                                      */
  /* ---------------------------------------------------------------- */

  const ASH = {
    id: 'ash',
    title: 'Пепел и свет',
    tagline: 'У тебя в фонаре последний огонь мира. Донеси его — или согрейся сам.',
    genre: 'тёмное фэнтези',
    icon: '🏮',
    cover: 'sc-forest',
    world: 'Города выгорели три года назад. Огонь остался только в фонарях Хранителей — и в твоём. Если маяк на Острой скале не зажжётся до новолуния, тепло уйдёт из мира совсем.',
    start: 'lamp',
    nodes: {
      lamp: {
        chapter: 'Глава 1. Фонарь',
        art: 'ruined village at dusk, a hooded wanderer holding a lantern, ash falling, dark fantasy',
        text: [
          'Пепел падает медленно, как снег, и не тает. Ты стоишь на мосту через пересохшую реку, и в твоём фонаре горит последний огонь, который ещё кому-то нужен.',
          'На другом берегу — трое. У них нет фонаря, но есть топоры, и они не прячутся.'
        ],
        choices: [
          { text: 'Показать фонарь и предложить поделиться теплом', to: 'bridge_talk', flag: 'милосердие', note: 'Они запомнят это' },
          { text: 'Погасить фитиль и обойти по камням в темноте', to: 'bridge_sneak', flag: 'хитрость', check: 'ловкость' },
          { text: 'Выйти навстречу с поднятым фонарём и не сбавлять шаг', to: 'bridge_force', flag: 'воля', hp: -1 }
        ]
      },
      bridge_talk: {
        chapter: 'Глава 2. Тёплый воздух',
        art: 'three ragged strangers warming hands around a lantern on a broken bridge, ash snow, dark fantasy',
        text: [
          'Старший из троих греет ладони и молчит долго — так, что ты уже жалеешь о своём порыве. Потом говорит: «До скалы две ночи. Один ты туда не дойдёшь».',
          'Они идут с тобой: не за огнём, за дорогой. Младший всю дорогу спрашивает, правда ли на скале снова станет светло.'
        ],
        choices: [
          { text: 'Рассказать правду: ты не знаешь, зажжётся ли маяк', to: 'road_camp', flag: 'правда' },
          { text: 'Сказать, что зажжётся — им нужна эта вера', to: 'road_camp', flag: 'вера' }
        ]
      },
      bridge_sneak: {
        chapter: 'Глава 2. Камни и вода',
        art: 'dark riverbed with stepping stones, fog, a hooded figure crossing by night, dark fantasy',
        text: [
          'Ты гасишь фитиль — и мир становится старше на три года. По камням, в темноте, на слух. Один камень качается; ты успеваешь поставить ногу иначе.',
          'За спиной слышно, как топоры бьют по мосту: они искали не тебя. Всё равно холодно.'
        ],
        choices: [
          { text: 'Идти дальше в темноте, экономя фитиль', to: 'road_camp', hp: -1, flag: 'терпение' },
          { text: 'Зажечь фонарь и идти открыто', to: 'road_camp', flag: 'открытость' }
        ]
      },
      bridge_force: {
        chapter: 'Глава 2. Прямая дорога',
        art: 'hooded figure walking forward with raised lantern, armed strangers stepping back, dark fantasy',
        text: [
          'Ты идёшь прямо. Свет бьёт им в глаза, и трое отступают — не от страха, а от неожиданности: за огонь в этом мире дерутся, а не носят его открыто.',
          'Один успевает задеть тебя древком. Ребро ноет, но фонарь цел. Позади кто-то говорит: «Хранитель».'
        ],
        choices: [
          { text: 'Не оглядываться и идти к перевалу', to: 'road_camp', flag: 'воля' },
          { text: 'Обернуться и сказать, что придёт время — они тоже будут греться', to: 'road_camp', flag: 'слово' }
        ]
      },
      road_camp: {
        chapter: 'Глава 3. Костёр без огня',
        art: 'night camp among burnt trees, people around a lantern instead of a campfire, dark fantasy',
        text: [
          'Ночью вас находит охотник за фонарями. Он не разбойник: он платит — предлагает воду, еду и лошадь за один огонёк из фонаря. «Ты донесёшь остаток, я донесу свой. Так двое дойдут вместо одного».',
          'Он говорит дело. Но огня в фонаре ровно столько, сколько нужно одному.'
        ],
        choices: [
          { text: 'Отдать ему часть огня', to: 'fork_light', flag: 'щедрость' },
          { text: 'Отказать и идти дальше ночью', to: 'fork_alone', flag: 'упрямство' },
          { text: 'Предложить идти вместе до скалы', to: 'fork_together', flag: 'союз' }
        ]
      },
      fork_light: {
        chapter: 'Глава 4. Двое с огнём',
        art: 'two wanderers splitting a flame, dark landscape, sparks rising, dark fantasy',
        text: [
          'Огонь делится, как хлеб: ничего не исчезает, только становится меньше. Охотник уходит на восток, к своему городу; ты — на север.',
          'Через день в небе над востоком вспыхивает тёплое пятно. Кто-то уже греется.'
        ],
        choices: [
          { text: 'Идти к скале один', to: 'storm_gate' },
          { text: 'Повернуть к востоку — помочь, если там беда', to: 'storm_gate', flag: 'милосердие', hp: -1 }
        ]
      },
      fork_alone: {
        chapter: 'Глава 4. Холодная ночь',
        art: 'lone hooded figure in a freezing night, ash snow, distant mountains, dark fantasy',
        text: [
          'Ночь идёт длинная. Огонь приходится держать закрытым, чтобы его не увидели, и ты греешь руки о стекло, как о чужой дом.',
          'Под утро на снегу — следы: кто-то шёл за тобой и ушёл. Ты не знаешь, друг или беда.'
        ],
        choices: [
          { text: 'Идти по следам', to: 'storm_gate', check: 'внимание' },
          { text: 'Забыть о следах и беречь силы', to: 'storm_gate', hp: +1 }
        ]
      },
      fork_together: {
        chapter: 'Глава 4. Двое у одного фонаря',
        art: 'two travelers sharing one lantern on a mountain road, wind, dark fantasy',
        text: [
          'Идти вдвоём — быстрее и опаснее: вас видно. Охотник знает дорогу, ты знаешь цену огня. Ночью вы спорите о том, кому нести фонарь, и оба не спите.',
          'На перевале ветер валит с ног. Охотник подставляет плечо и хрипит: «Держи свет выше, я держу тебя».'
        ],
        choices: [
          { text: 'Держать свет выше и идти', to: 'storm_gate', flag: 'вместе' },
          { text: 'Отдать фонарь ему и толкать его вперёд', to: 'storm_gate', flag: 'доверие' }
        ]
      },
      storm_gate: {
        chapter: 'Глава 5. Ветер на перевале',
        art: 'mountain pass in a storm, lantern light against dark clouds, dark fantasy',
        text: [
          'На перевале стоит человек в обугленных доспехах. Он не нападает — он просит: «Дай огня. Я три года не видел света, я забываю, как выглядит лицо».',
          'Он воин, он сильнее тебя, и он всё равно просит. За скалой, в двух шагах, — маяк.'
        ],
        choices: [
          { text: 'Дать ему свет на несколько минут', to: 'road_dark', flag: 'человек' },
          { text: 'Отказать: огонь нужен маяку', to: 'road_dark', flag: 'цена' },
          { text: 'Взять его с собой к маяку', to: 'beacon', flag: 'спутник' }
        ]
      },
      road_dark: {
        chapter: 'Глава 6. Тёмная дорога',
        art: 'narrow path along a cliff at night, faint lantern glow, dark fantasy',
        text: [
          'Дальше тропа идёт по краю, и в фонаре остаётся меньше половины. Ты считаешь шаги, чтобы не считать огонь.',
          'Внизу, под обрывом, кто-то плачет. Это не ловушка: голос детский, и он не зовёт — просто плачет.'
        ],
        choices: [
          { text: 'Спуститься', to: 'child', hp: -1, flag: 'милосердие' },
          { text: 'Идти дальше: на маяке решается больше', to: 'beacon', flag: 'цена' }
        ]
      },
      child: {
        chapter: 'Глава 7. Под обрывом',
        art: 'child sitting by a dead stream under a cliff, faint lantern light, dark fantasy',
        text: [
          'Девочка сидит у мёртвого ручья и держит остывший уголёк. «Он был тёплый утром», — говорит она и не просит ничего.',
          'Ты даёшь ей фонарь на минуту. Она не греет руки — она греет уголёк, чтобы у неё тоже был свой огонь.'
        ],
        choices: [
          { text: 'Забрать её с собой на маяк', to: 'beacon', flag: 'девочка' },
          { text: 'Оставить ей уголёк, а самому идти наверх', to: 'beacon', flag: 'искра' }
        ]
      },
      beacon: {
        chapter: 'Глава 8. Маяк',
        art: 'ancient stone beacon tower on a cliff with a dark brazier, night, dark fantasy',
        text: [
          'Маяк — это чаша на скале, обложенная камнем, и три ступени, которые вытерты до блеска: сюда уже приходили. Чаша пуста и вымыта дождями.',
          'В твоём фонаре — огонь на одну попытку. За спиной стоят те, кто шёл с тобой, если кто-то шёл.'
        ],
        choices: [
          { text: 'Вылить весь огонь в чашу', to: 'end_light', flag: 'свет' },
          { text: 'Оставить огонь себе и спуститься к людям', to: 'end_warmth', flag: 'тепло' },
          { text: 'Разделить огонь между чашей и теми, кто рядом', to: 'end_share', flag: 'делить' }
        ]
      },
      end_light: {
        chapter: 'Концовка. Свет над скалой',
        ending: true,
        art: 'great beacon fire blazing on a sea cliff, people below looking up, epic dark fantasy',
        text: [
          'Огонь уходит вниз, в камень, и чаша отвечает сразу: сначала искра, потом столб, потом — свет, от которого становится видно море до горизонта.',
          'Ты сидишь на камне без огня, и тебе больше не холодно. По дорогам, которые ты прошёл, идут люди: свет видно на три дня пути.',
          'Фонарь в твоих руках пуст. Но если кто-то поднимется по этим ступеням завтра — его встретит горячая чаша.'
        ]
      },
      end_warmth: {
        chapter: 'Концовка. Тёплые руки',
        ending: true,
        art: 'small group sitting around a lantern in a stone shelter, snow outside, quiet dark fantasy',
        text: [
          'Ты несёшь огонь вниз, к переправе, и там он становится общим: чай, ладони, чужой кашель, детский смех в темноте.',
          'Маяк так и стоит тёмный. Но три года в этом мире никто не грелся вместе — и теперь греется.',
          'Иногда на скале вспыхивает искра — кто-то другой поднимается с фонарём. Ты знаешь, что он сделает, и не завидуешь: у него свой выбор.'
        ]
      },
      end_share: {
        chapter: 'Концовка. Огонь пополам',
        ending: true,
        art: 'beacon burning weakly while people warm hands below, uncertain dawn, dark fantasy',
        text: [
          'Чаша получает половину — хватит на слабый, неровный свет, который видно только с ближнего берега. Остальное достаётся тем, кто рядом: пальцы, лица, дыхание.',
          'Маяк горит неровно, как сердце уставшего человека. К нему идут не все, но идут.',
          'Ты остаёшься на скале дежурить. И понимаешь простую вещь: мир держится не на большом огне, а на том, что кто-то каждый день решает делиться.'
        ]
      }
    },
    endings: {
      end_light: { title: 'Свет над скалой', mood: 'triumph' },
      end_warmth: { title: 'Тёплые руки', mood: 'warm' },
      end_share: { title: 'Огонь пополам', mood: 'wise' }
    }
  };

  /* ---------------------------------------------------------------- */
  /* Книга вторая: постапокалипсис                                     */
  /* ---------------------------------------------------------------- */

  const LINE = {
    id: 'line',
    title: 'Последний перегон',
    tagline: 'Станция «Заря» отвечает. Один перегон отделяет тебя от людей.',
    genre: 'постапокалипсис',
    icon: '🚇',
    cover: 'sc-waste',
    world: 'Восемнадцать лет назад наверху всё закончилось. Люди живут в туннелях: у кого фильтр — тот дышит, у кого патрон — тот идёт. Станция «Заря» вышла на связь впервые за годы.',
    start: 'gate',
    nodes: {
      gate: {
        chapter: 'Глава 1. Гермодверь',
        art: 'rusted hermetic door in a dark metro tunnel, torchlight, postapocalyptic',
        text: [
          'Дверь держат на засове: за ней — перегон, который не проходил никто из живущих. В руке у тебя два патрона и полфильтра.',
          'Начальник станции не уговаривает. Просто говорит: «Нужен тот, кому можно верить. Вернись — или хотя бы дойди».'
        ],
        choices: [
          { text: 'Взять фонарь и запас угля — идти налегке', to: 'tunnel_dark', flag: 'свет' },
          { text: 'Взять дробовик и два патрона', to: 'tunnel_dark', flag: 'сталь' },
          { text: 'Взять радиостанцию и оставить себе полфильтра про запас', to: 'tunnel_dark', flag: 'связь' }
        ]
      },
      tunnel_dark: {
        chapter: 'Глава 2. Перегон',
        art: 'dark circular metro tunnel with rails curving into blackness, torchlight, postapocalyptic',
        text: [
          'Первый километр — просто темнота и рельсы. На втором ты слышишь: по трубам идёт ритм. Не ветер, не шаги. Кто-то стучит.',
          'Тук. Тук-тук. Тук. Три коротких, один длинный. Так стучат, когда передают буквы.'
        ],
        choices: [
          { text: 'Ответить тем же стуком', to: 'tunnel_voice', flag: 'ответ' },
          { text: 'Погасить фонарь и пройти мимо', to: 'tunnel_silent', flag: 'тихо' },
          { text: 'Идти на стук', to: 'tunnel_voice', flag: 'встреча' }
        ]
      },
      tunnel_voice: {
        chapter: 'Глава 3. Слепой',
        art: 'old blind man sitting on a rail cart in a dark tunnel, hooded figure with lantern, postapocalyptic',
        text: [
          'В боковой нише сидит старик на тележке — слепой, в мокром плаще. «Ты первый за девять лет», — говорит он и стучит ещё раз, чтобы ты понял: стучал он.',
          'Он знает дорогу и знает цену: «Проведу через затопленный участок. За это возьму один патрон. Или возьму твоё дыхание в тумане — фильтр-то у тебя почти пустой».'
        ],
        choices: [
          { text: 'Заплатить патроном', to: 'flood', flag: 'патрон-цена', item: -1 },
          { text: 'Идти одному и рискнуть в тумане', to: 'flood', hp: -1, flag: 'один' },
          { text: 'Оставить ему запас угля и идти вдвоём', to: 'flood', flag: 'дружба', item: -1 }
        ]
      },
      tunnel_silent: {
        chapter: 'Глава 3. Тишина',
        art: 'figure sneaking through a flooded dark tunnel without light, postapocalyptic',
        text: [
          'Ты гасишь свет и идёшь на ощупь по стене, по ржавым скобам. Стук стихает — тебя потеряли.',
          'В темноте так страшно, что слышно собственный пульс. А потом под ногой — рельс, вымытый водой: впереди затоплено.'
        ],
        choices: [
          { text: 'Идти по грудь в воде', to: 'flood', hp: -1, flag: 'вода' },
          { text: 'Найти обход по вентиляционному коробу', to: 'flood', check: 'ловкость', flag: 'верхний путь' }
        ]
      },
      flood: {
        chapter: 'Глава 4. Вода',
        art: 'flooded metro tunnel with dark water, single figure with a lamp on a narrow ledge, postapocalyptic',
        text: [
          'Вода стоит по грудь и держит холод, как мокрая рука. На стене — надписи мелом, старые: имена, даты, «здесь был».',
          'По воде проходит волна. Не от тебя.'
        ],
        choices: [
          { text: 'Замереть и ждать', to: 'nest', flag: 'ожидание' },
          { text: 'Стрелять на шум', to: 'nest', flag: 'выстрел', item: -1 },
          { text: 'Кричать — вдруг это люди', to: 'nest', flag: 'крик' }
        ]
      },
      nest: {
        chapter: 'Глава 5. Гнездо',
        art: 'huge tangled nest of cables and bones in a metro depot, dark, postapocalyptic',
        text: [
          'Из воды поднимается депо: тупиковые пути, сплетения кабеля, кости. Здесь живёт то, что пережило людей, и оно не спешит.',
          'У стены — щиток с рычагом вентиляции. Один рычаг, и перегон станет проходимым для всех: и для тебя, и для тех, кто пойдёт после.'
        ],
        choices: [
          { text: 'Добраться до щитка и включить вентиляцию', to: 'vent_on', hp: -1, flag: 'вентиляция' },
          { text: 'Тихо обойти гнездо и не трогать механизмы', to: 'vent_off', check: 'внимание', flag: 'обход' },
          { text: 'Устроить шум и уйти в темноту', to: 'vent_off', flag: 'буря' }
        ]
      },
      vent_on: {
        chapter: 'Глава 6. Воздух',
        art: 'ventilation shutters opening in a metro tunnel, dust and light beams, postapocalyptic',
        text: [
          'Рычаг идёт тяжело, как ржавое слово. Створки вентиляции открываются с грохотом, и перегон наполняется воздухом, который пахнет ржавчиной и свободой.',
          'Теперь этой дорогой можно идти без фильтра. Ты тратишь последний патрон как звуковой сигнал и замечаешь на стене знакомый мел: «Заря. 2 км».'
        ],
        choices: [
          { text: 'Идти к станции', to: 'zarya_gate' },
          { text: 'Вернуться за слепым: он должен узнать, что путь открыт', to: 'zarya_gate', flag: 'вернулся', hp: -1 }
        ]
      },
      vent_off: {
        chapter: 'Глава 6. Мимо',
        art: 'lone figure slipping past a monster nest in the dark, postapocalyptic',
        text: [
          'Ты проходишь мимо. Гнездо шевелится за спиной, но не встаёт: здесь никого не трогают, пока не трогают механизмы.',
          'Ты держишь дыхание до самого выхода и понимаешь, что фильтр почти пуст.'
        ],
        choices: [
          { text: 'Идти дальше', to: 'zarya_gate', flag: 'один' },
          { text: 'Вернуться и предупредить станцию об этом месте', to: 'zarya_gate', flag: 'вернулся', hp: -1 }
        ]
      },
      zarya_gate: {
        chapter: 'Глава 7. Тот берег',
        art: 'lit metro platform station with people and lanterns ahead of a lone traveler, postapocalyptic',
        text: [
          'Свет на станции «Заря» слабый, но настоящий: лампы, дым, люди. Двое в броне у закрытых дверей направляют на тебя автоматы.',
          '«Ты один? Перегон открыт? Говори быстро — у нас раненые и кончается воздух».'
        ],
        choices: [
          { text: 'Сказать правду целиком', to: 'end_open', flag: 'правда' },
          { text: 'Сказать, что путь открыт — и вести их за собой', to: 'end_open', flag: 'ведущий' },
          { text: 'Промолчать и сначала попросить кислород для пострадавших', to: 'end_slow', flag: 'осторожность' }
        ]
      },
      end_open: {
        chapter: 'Концовка. Две станции',
        ending: true,
        art: 'two metro stations connected by a lit tunnel with people walking, hopeful light, postapocalyptic',
        text: [
          'Через сутки по перегону идут первые: за водой, за углём, за людьми. Тоннель перестаёт быть границей и становится дорогой.',
          'Тебе дают место у лампы и постоянный патрон. Ты не герой — ты проводник, и это гораздо полезнее.',
          'Раз в месяц кто-то приходит с запада и спрашивает: «Кто открыл перегон?» Ему показывают на тебя, а ты показываешь на рычаг.'
        ]
      },
      end_slow: {
        chapter: 'Концовка. Долгий путь',
        ending: true,
        art: 'people carrying a stretcher through a metro tunnel, dim lights, postapocalyptic',
        text: [
          'Они не спорят: у них и правда двое раненых. Воздух, носилки, четверо носильщиков, обратный путь вдвое медленнее.',
          'Перегон открывается позже — через месяц, осторожно, с проверками. Медленный путь спас больше людей, чем быстрый.',
          'На стене «Зари» появляется надпись: «Перегон открыт. Идите тихо. Уважайте гнездо».'
        ]
      }
    },
    endings: {
      end_open: { title: 'Две станции', mood: 'triumph' },
      end_slow: { title: 'Долгий путь', mood: 'wise' }
    }
  };

  const BOOKS = [ASH, LINE];

  /* ---------------------------------------------------------------- */
  /* Движок                                                            */
  /* ---------------------------------------------------------------- */

  function bookById(id) {
    const key = String(id || '').trim();
    return BOOKS.find(b => b.id === key) || null;
  }

  function listBooks() {
    return BOOKS.map(b => ({
      id: b.id, title: b.title, tagline: b.tagline, genre: b.genre,
      icon: b.icon, cover: b.cover, chapters: Object.keys(b.nodes).length
    }));
  }

  function bookNode(state) {
    const b = bookById(state && state.bookId);
    if (!b) return null;
    return b.nodes[state.node] || null;
  }

  /** Новая книга: герой передаёт только имя и настройки, механика — книжная. */
  function startBook(bookId, hero) {
    const b = bookById(bookId);
    if (!b) return null;
    const h = hero || {};
    return {
      version: 1,
      bookId: b.id,
      node: b.start,
      heroName: String(h.name || 'Безымянный').slice(0, 24),
      voice: h.voice || '',
      hp: 5,
      maxHp: 5,
      items: 3,
      flags: [],
      steps: [],
      startedAt: Date.now()
    };
  }

  /** Вариант доступен, если герой не пуст: здоровье и предметы — это ресурс. */
  function choiceLocked(state, choice) {
    const c = choice || {};
    if (typeof c.hp === 'number' && c.hp < 0 && state.hp + c.hp <= 0) return 'нет сил: этот путь убьёт';
    if (c.item === -1 && state.items <= 0) return 'нечего отдать';
    return '';
  }

  function bookChoices(state) {
    const node = bookNode(state);
    if (!node || node.ending) return [];
    return (node.choices || []).map((c, i) => ({
      index: i,
      text: c.text,
      note: c.note || '',
      locked: choiceLocked(state, c)
    }));
  }

  /** Ход по книге: возвращает новый state, текст следующей главы и варианты. */
  function bookStep(state, index) {
    const node = bookNode(state);
    if (!node || node.ending) return null;
    const c = (node.choices || [])[index];
    if (!c) return null;
    if (choiceLocked(state, c)) return null;
    const next = Object.assign({}, state, {
      node: c.to,
      flags: c.flag && state.flags.indexOf(c.flag) < 0 ? state.flags.concat([c.flag]) : state.flags.slice(),
      hp: Math.max(0, Math.min(state.maxHp, state.hp + (c.hp || 0))),
      items: Math.max(0, state.items + (c.item || 0)),
      steps: state.steps.concat([{ from: state.node, choice: String(c.text).slice(0, 90), flag: c.flag || '', hp: c.hp || 0 }])
    });
    const b = bookById(next.bookId);
    const to = b && b.nodes[next.node];
    return {
      state: next,
      chapter: to ? to.chapter : '',
      art: to ? to.art : '',
      text: to ? to.text.slice() : [],
      choices: bookChoices(next),
      ending: !!(to && to.ending),
      mood: (to && to.ending && b.endings && b.endings[next.node] && b.endings[next.node].mood) || ''
    };
  }

  /** Концовка книги: заголовок, тон и строчка для летописи. */
  function bookEnding(state) {
    const b = bookById(state && state.bookId);
    if (!b) return null;
    const node = b.nodes[state.node];
    if (!node || !node.ending) return null;
    const meta = (b.endings && b.endings[state.node]) || {};
    const flags = (state.flags || []).join(', ');
    return {
      bookId: b.id,
      bookTitle: b.title,
      node: state.node,
      title: meta.title || node.chapter,
      mood: meta.mood || 'wise',
      steps: (state.steps || []).length,
      flags: state.flags.slice(),
      hp: state.hp,
      line: `${b.title}: ${meta.title || node.chapter}` + (flags ? `. Герой выбирал: ${flags}` : '')
    };
  }

  /** Текстовый экспорт прохождения — как «книга, прочитанная именно так». */
  function bookStory(state, book) {
    const b = bookById((state && state.bookId) || (book && book.id));
    if (!b) return '';
    const parts = [`# ${b.title}`, '', `**Герой:** ${state.heroName || 'Безымянный'}`, ''];
    (state.steps || []).forEach((s, i) => {
      const node = b.nodes[s.from];
      if (!node) return;
      parts.push(`## ${node.chapter}`);
      (node.text || []).forEach(p => parts.push(p, ''));
      parts.push(`> Выбор: ${s.choice}`, '');
      if (i === state.steps.length - 1) {
        const last = b.nodes[state.node];
        if (last) {
          parts.push(`## ${last.chapter}`);
          (last.text || []).forEach(p => parts.push(p, ''));
        }
      }
    });
    const end = bookEnding(state);
    if (end) parts.push('', `**Концовка:** ${end.title}`);
    return parts.join('\n');
  }

  return {
    BOOKS, listBooks, bookById, startBook, bookChoices, bookStep, bookNode, bookEnding, bookStory, choiceLocked
  };
});
