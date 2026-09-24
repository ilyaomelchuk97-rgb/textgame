# -*- coding: utf-8 -*-
"""Патч 3 (п.13): 24 основы места + слои сцены (время суток, погода, огонь)."""
import io, sys

path = '/home/user/src/engine.js'
src = io.open(path, encoding='utf-8').read()
orig = src

def sub_once(tag, old, new):
    global src
    n = src.count(old)
    if n != 1:
        print('ЯКОРЬ НЕ НАЙДЕН (%d): %s' % (n, tag)); sys.exit(1)
    src = src.replace(old, new, 1)

OLD_KIND = u'''  function sceneKindFromText(text) {
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
  }'''

NEW_KIND = u'''  /**
   * Пакет основ для локального фона: 24 узнаваемых места.
   * Порядок правил = приоритет: специфичное раньше общего («развалины храма» —
   * руины, а не храм; «шлюз станции» — космос, а не вокзал).
   */
  const KIND_RULES = [
    ['space', /орбит|космич|космодром|шлюз|реактор|star ?ship|spaceship|starship|orbit|hangar|reactor|station|станци|планет|марс|лунн[ао]й баз/],
    ['ship', /палуб|мачт|трюм|фрегат|бриг|шхун|капитан|deck|sail|mast|hull|на борту/],
    ['port', /причал|портов|порт[уеа]|пирс|верфь|док|harbor|dock|pier|quay/],
    ['sea', /мор[еяю]|океан|берег|волн|шторм|корабл|лодк|река|озер|sea|ocean|coast|water/],
    ['market', /рынок|базар|прилав|ярмарк|торговы|лавк|market|bazaar|stall/],
    ['city', /город|улиц|неон|квартал|площад|переул|проспект|башн|city|street|neon|tower|urban|rooftop|крыш/],
    ['village', /деревн|посел|село|хутор|ферм|village|hamlet|farm/],
    ['keep', /крепост|цитадел|замок|бастион|форт|стен[аы] с зубц|fortress|castle|keep/],
    ['ruins', /руин|развалин|обломк|пепелищ|заброшенн|ruin|wreck/],
    ['tavern', /трактир|таверн|корчм|пивн|кабак|pub\\b|inn\\b|bar\\b/],
    ['temple', /храм|собор|часовн|церков|алтар|монаст|temple|church|cathedral|shrine|chapel/],
    ['library', /библиотек|архив|скриптор|книгохра|library|archive/],
    ['workshop', /мастерск|кузн|лаборатор|верстак|литей|forge|workshop|smithery/],
    ['station', /вокзал|перрон|платформ|поезд|рельс|метро|railway|train|platform|terminal/],
    ['cave', /пещер|туннел|шахт|подземел|подвал|катакомб|cave|tunnel|mine|dungeon|cellar/],
    ['battlefield', /битв|сражен|побоищ|поле боя|окоп|арми|войск|вороны|труп|battlefield|battle|corpses|raven/],
    ['interior', /комнат|коридор|хижин|бункер|кают|холл|зал[еауы]|room|hall|corridor|hut|bunker|cabin|interior/],
    ['swamp', /болот|топь|трясин|топк|swamp|marsh/],
    ['road', /дорог|тракт|шлях|тропа|перекрест|трасс|road|path|trail|crossroad/],
    ['canyon', /каньон|ущел|обрыв|скал|перевал|canyon|gorge|cliff|ravine/],
    ['bridge', /мост|виадук|акведук|bridge|viaduct/],
    ['desert', /пустын|дюн|песок|бархан|пустош|desert|dune|sand|waste/],
    ['snow', /снег|льд|ледян|мороз|зим|метел|frost|ice|frozen|snow/],
    ['forest', /лес|дерев|чащ|тайг|forest|wood|tree|jungle/]
  ];

  function sceneKindFromText(text) {
    const s = String(text || '').toLowerCase();
    for (let i = 0; i < KIND_RULES.length; i++) if (KIND_RULES[i][1].test(s)) return KIND_RULES[i][0];
    return 'forest';
  }

  /** Все основы пака — для проверок и настроек. */
  const SCENE_KINDS = KIND_RULES.map(r => r[0]);

  /**
   * Слои сцены: время суток, погода и очаг. Тот же рисунок места читается
   * как «ночной дождь» или «утро в тумане» — без единого запроса к генератору.
   */
  const DAYPARTS = ['auto', 'dawn', 'day', 'dusk', 'night'];
  const WEATHER_KINDS = ['auto', 'clear', 'rain', 'storm', 'snow', 'fog', 'ash', 'wind'];

  function sceneLayersFromText(text) {
    const t = String(text || '').toLowerCase();
    let daypart = 'auto';
    if (/ноч|лун|звёзд|звезд|темнот|полноч|сумрак глубок|night|moonlight|midnight/.test(t)) daypart = 'night';
    else if (/рассвет|утр[оае]|зорь|dawn|sunrise|morning/.test(t)) daypart = 'dawn';
    else if (/закат|вечер|сумерк|dusk|sunset|evening|twilight/.test(t)) daypart = 'dusk';
    else if (/полдень|днём|дневн|яркое солн|noon|midday/.test(t)) daypart = 'day';
    let weather = 'auto';
    if (/гроз|гром|молни|storm|thunder/.test(t)) weather = 'storm';
    else if (/дожд|ливн|моросит|rain|drizzle/.test(t)) weather = 'rain';
    else if (/снег|метел|пург|снежн|snow|blizzard/.test(t)) weather = 'snow';
    else if (/туман|мгл|дымк|fog|mist|haze/.test(t)) weather = 'fog';
    else if (/пепел|вулкан|гарь|ash fall/.test(t)) weather = 'ash';
    else if (/ветер|буря|вьюг|wind|gust/.test(t)) weather = 'wind';
    else if (/ясно|солнечн|clear sky|sunny/.test(t)) weather = 'clear';
    const fire = /кост[её]р|очаг|факел|пожар|пламя|огон[ьяе]|campfire|bonfire|torch|hearth|firelight/.test(t);
    return { daypart, weather, fire };
  }

  /** Погода и время суток для промпта генератору — чтобы кадр совпал с фоном. */
  function sceneLayersPrompt(layers) {
    const l = layers || {};
    const day = { dawn: 'at dawn, soft morning light', day: 'in daylight', dusk: 'at sunset, warm light', night: 'at night, moonlight and deep shadows' };
    const wea = { clear: 'clear sky', rain: 'rain', storm: 'thunderstorm', snow: 'falling snow', fog: 'thick fog', ash: 'ash falling in the air', wind: 'strong wind' };
    const out = [];
    if (day[l.daypart]) out.push(day[l.daypart]);
    if (wea[l.weather]) out.push(wea[l.weather]);
    if (l.fire) out.push('firelight, warm glow');
    return out.join(', ');
  }'''

sub_once('sceneKindFromText', OLD_KIND, NEW_KIND)

sub_once('экспорт',
u'''    scenarioById, randomScenarioSet, emptyWorldConfig, buildWorldPrompt, sceneKindFromText,''',
u'''    scenarioById, randomScenarioSet, emptyWorldConfig, buildWorldPrompt, sceneKindFromText, sceneLayersFromText, sceneLayersPrompt, SCENE_KINDS, DAYPARTS, WEATHER_KINDS,''')

io.open(path, 'w', encoding='utf-8').write(src)
print('OK: engine.js — %d симв. (было %d)' % (len(src), len(orig)))
