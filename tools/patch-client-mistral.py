# -*- coding: utf-8 -*-
"""Клиент: ключ Mistral в настройках игры и передача его серверу."""
import io, sys

def patch(path, pairs):
    src = io.open(path, encoding='utf-8').read()
    for tag, old, new in pairs:
        n = src.count(old)
        if n != 1:
            print('ЯКОРЬ (%d) %s в %s' % (n, tag, path)); sys.exit(1)
        src = src.replace(old, new, 1)
    io.open(path, 'w', encoding='utf-8').write(src)
    print('ok: %s — %d симв.' % (path, len(src)))

patch('/home/user/src/api.js', [
    ('CONFIG',
     """    apiKey: BUILTIN_API_KEY,""",
     """    apiKey: BUILTIN_API_KEY,
    mistralKey: '',           // бесплатный ключ Mistral от игрока (не хранится на сервере)"""),

    ('setMistralKey',
     """  function setApiKey(key) { CONFIG.apiKey = (key || '').trim() || BUILTIN_API_KEY; }""",
     """  function setApiKey(key) { CONFIG.apiKey = (key || '').trim() || BUILTIN_API_KEY; }
  function setMistralKey(key) { CONFIG.mistralKey = String(key || '').trim(); }
  function getMistralKey() { return CONFIG.mistralKey; }"""),

    ('payload /api/gm',
     """        body: JSON.stringify({ messages, budgetMs, kind: kind || '', provider: wantedMaster() }),""",
     """        body: JSON.stringify({ messages, budgetMs, kind: kind || '', provider: wantedMaster(), mistralKey: CONFIG.mistralKey }),"""),

    ('payload stream',
     """        body: JSON.stringify({ messages, budgetMs: hooks.budgetMs, kind: hooks.kind || '', provider: wantedMaster() }),""",
     """        body: JSON.stringify({ messages, budgetMs: hooks.budgetMs, kind: hooks.kind || '', provider: wantedMaster(), mistralKey: CONFIG.mistralKey }),"""),

    ('экспорт',
     """    setMaster, masterWanted, setImageSource, imageSource, masterChoices, imageChoices,""",
     """    setMaster, masterWanted, setImageSource, imageSource, masterChoices, imageChoices,
    setMistralKey, getMistralKey,"""),
])

patch('/home/user/src/app.js', [
    ('настройка mistralKey',
     """      master: 'auto',                      // кто ведёт игру (канал из /api/health)""",
     """      master: 'auto',                      // кто ведёт игру (канал из /api/health)
      mistralKey: '',                      // бесплатный ключ Mistral: свой ведущий ИИ"""),

    ('применение ключа',
     """        if (data.apiKey) API.setApiKey(data.apiKey);""",
     """        if (data.apiKey) API.setApiKey(data.apiKey);
        if (typeof data.mistralKey === 'string') API.setMistralKey(data.mistralKey);"""),

    ('применение ключа (второй путь)',
     """        if (typeof data.apiKey === 'string') API.setApiKey(data.apiKey);""",
     """        if (typeof data.apiKey === 'string') API.setApiKey(data.apiKey);
        if (typeof data.mistralKey === 'string') API.setMistralKey(data.mistralKey);"""),

    ('поле в настройках',
     """    const masterLive = choiceRowLive(API.masterChoices, Settings.data.master || 'auto', id => {""",
     """    const mistralInput = h('input', {
      class: 'input', type: 'text',
      value: Settings.data.mistralKey || '',
      autocomplete: 'off', spellcheck: 'false',
      placeholder: 'вставьте бесплатный ключ Mistral — мастер станет умнее'
    });
    const saveMistral = () => {
      const key = mistralInput.value.trim();
      Settings.set({ mistralKey: key });
      API.setMistralKey(key);
      toast(key ? 'Ключ Mistral сохранён: ведущий — Mistral' : 'Ключ Mistral убран', { kind: key ? 'good' : undefined, timeout: 2600 });
    };
    mistralInput.addEventListener('change', saveMistral);
    mistralInput.addEventListener('blur', saveMistral);
    const masterLive = choiceRowLive(API.masterChoices, Settings.data.master || 'auto', id => {"""),

    ('секция про ключ Mistral',
     """      h('div', { class: 'section-title', text: 'Канал ИИ' }),
      h('p', { class: 'muted small', text: 'Текущий режим: ' + API.mode() }),""",
     """      h('div', { class: 'section-title', text: 'Канал ИИ' }),
      h('p', { class: 'muted small', text: 'Текущий режим: ' + API.mode() }),
      h('p', { class: 'muted small', text: 'У Mistral (Франция) есть бесплатный ключ: без карты, нужен только номер телефона. Ключ делается на console.mistral.ai → API Keys, лимит примерно запрос в секунду — для этой игры хватает с запасом.' }),
      mistralInput,
      h('p', { class: 'muted small', text: 'Ключ остаётся в телефоне и уходит только вместе с запросом к мастеру — на сервере он не хранится.' }),"""),

    ('подпись обычного поля ключа',
     """      value: Settings.data.apiKey || API.getApiKey(), autocomplete: 'off',
      placeholder: 'ключ уже встроен в игру — можно заменить своим'""",
     """      value: Settings.data.apiKey || API.getApiKey(), autocomplete: 'off',
      placeholder: 'ключ Pollinations уже встроен — можно заменить своим'"""),
])
