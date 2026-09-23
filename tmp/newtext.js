// проверка текстовых моделей нового шлюза: скорость, русский язык, JSON
const KEY = 'sk_kCqSS3Q96WUonzrPPC9c5fxyRjOmiMOi';
const MODELS = [
  'mistralai/mistral-large-3',
  'community/NamanSoni78/gpt-5.4-nano',
  'community/NamanSoni78/gemini-3.8-flash',
  'community/scriptsnsenses-sys/glm-5.3-flash-free',
  'community/NamanSoni78/gpt-5.6-Luna',
  'community/gggff123/qwen3.8-27b:free'
];
const SYSTEM = 'Ты мастер настольной текстовой игры на русском языке. Отвечай только JSON без пояснений.';
const USER = `Мир: «Ржавые Пески Кар-Адама». Беда: караван с водой пропал в пустыне, город гибнет от жажды.
Место: пересохшее русло реки у ржавого моста. Роль игрока: тот, кто ищет караван.
Придумай 3 варианта класса героя под эту историю. Формат:
{"classes":[{"title":"...","hint":"одна строка, чем занят","bonus":"Характеристика +2 · Характеристика +1","ability":"Приём — что делает"}]}
Характеристики только из списка: Сила, Ловкость, Телосложение, Разум, Восприятие, Воля, Харизма. Числа: не больше +2 к одной и +3 суммарно.`;

(async () => {
  for (const model of MODELS) {
    const t0 = Date.now();
    let status = '', text = '', err = '';
    try {
      const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }], max_tokens: 700, temperature: 0.8 }),
        signal: AbortSignal.timeout(120000)
      });
      status = res.status;
      const data = await res.json();
      text = data.choices?.[0]?.message?.content || '';
      if (!text) err = JSON.stringify(data).slice(0, 140);
    } catch (e) { err = e.message; }
    const ms = Date.now() - t0;
    let parsed = null;
    try { parsed = JSON.parse((text.match(/\{[\s\S]*\}/) || [text])[0]); } catch (e) {}
    console.log('\n===', model, '| http', status, '|', ms, 'мс');
    if (err) { console.log('  ошибка:', err); continue; }
    console.log('  JSON разобран:', parsed ? 'да' : 'НЕТ');
    if (parsed?.classes) {
      parsed.classes.slice(0, 3).forEach(c => console.log('   ·', c.title, '|', c.hint, '|', c.bonus, '|', String(c.ability).slice(0, 60)));
    } else {
      console.log('  текст:', text.replace(/\s+/g, ' ').slice(0, 220));
    }
  }
})();
