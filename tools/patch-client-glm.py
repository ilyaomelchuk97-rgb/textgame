# -*- coding: utf-8 -*-
"""
Клиентская часть канала GLM: ключ игрока в настройках и в запросах к мастеру.

src/api.js:  CONFIG.glmKey, setGlmKey/getGlmKey, glmKey в payload /api/gm и /api/gm/stream
src/app.js:  Settings.data.glmKey, применение при загрузке, поле в «Канале ИИ»
"""
import io
import sys

def sub(path, tag, old, new):
    s = io.open(path, encoding='utf-8').read()
    n = s.count(old)
    if n != 1:
        print('ЯКОРЬ (%d): %s [%s]' % (n, tag, path))
        sys.exit(1)
    io.open(path, 'w', encoding='utf-8').write(s.replace(old, new, 1))
    print('%s: %s' % (path, tag))

# ------------------------------------------------------------------ src/api.js
P = 'src/api.js'
sub(P, 'поле ключа в CONFIG',
    "    mistralKey: '',           // бесплатный ключ Mistral от игрока (не хранится на сервере)",
    "    mistralKey: '',           // бесплатный ключ Mistral от игрока (не хранится на сервере)\n"
    "    glmKey: '',               // ключ GLM (Zhipu) от игрока: id.secret, тоже только в телефоне")

sub(P, 'геттер и сеттер',
    "  function setMistralKey(key) { CONFIG.mistralKey = String(key || '').trim(); }\n"
    "  function getMistralKey() { return CONFIG.mistralKey; }",
    "  function setMistralKey(key) { CONFIG.mistralKey = String(key || '').trim(); }\n"
    "  function getMistralKey() { return CONFIG.mistralKey; }\n"
    "  function setGlmKey(key) { CONFIG.glmKey = String(key || '').trim(); }\n"
    "  function getGlmKey() { return CONFIG.glmKey; }")

sub(P, 'payload обычного запроса',
    "        body: JSON.stringify({ messages, budgetMs, kind: kind || '', provider: wantedMaster(), mistralKey: CONFIG.mistralKey }),",
    "        body: JSON.stringify({ messages, budgetMs, kind: kind || '', provider: wantedMaster(), mistralKey: CONFIG.mistralKey, glmKey: CONFIG.glmKey }),")

sub(P, 'payload потока',
    "        body: JSON.stringify({ messages, budgetMs: hooks.budgetMs, kind: hooks.kind || '', provider: wantedMaster(), mistralKey: CONFIG.mistralKey }),",
    "        body: JSON.stringify({ messages, budgetMs: hooks.budgetMs, kind: hooks.kind || '', provider: wantedMaster(), mistralKey: CONFIG.mistralKey, glmKey: CONFIG.glmKey }),")

sub(P, 'экспорт',
    "    setMistralKey, getMistralKey,",
    "    setMistralKey, getMistralKey,\n    setGlmKey, getGlmKey,")

# ------------------------------------------------------------------ src/app.js
P = 'src/app.js'
sub(P, 'поле в настройках (данные)',
    "      mistralKey: '',                      // бесплатный ключ Mistral: свой ведущий ИИ",
    "      mistralKey: '',                      // бесплатный ключ Mistral: свой ведущий ИИ\n"
    "      glmKey: '',                          // ключ GLM (Zhipu): ещё один ведущий ИИ")

sub(P, 'применение при загрузке (init)',
    "        if (typeof data.mistralKey === 'string') API.setMistralKey(data.mistralKey);\n"
    "        API.setMaster(data.master);",
    "        if (typeof data.mistralKey === 'string') API.setMistralKey(data.mistralKey);\n"
    "        if (typeof data.glmKey === 'string') API.setGlmKey(data.glmKey);\n"
    "        API.setMaster(data.master);")

sub(P, 'применение при сохранении (set)',
    "        if (typeof data.mistralKey === 'string') API.setMistralKey(data.mistralKey);\n"
    "        if (typeof data.master === 'string') API.setMaster(data.master);",
    "        if (typeof data.mistralKey === 'string') API.setMistralKey(data.mistralKey);\n"
    "        if (typeof data.glmKey === 'string') API.setGlmKey(data.glmKey);\n"
    "        if (typeof data.master === 'string') API.setMaster(data.master);")

sub(P, 'поле ввода в настройках',
    """    const saveMistral = () => {
      const key = mistralInput.value.trim();
      Settings.set({ mistralKey: key });
      API.setMistralKey(key);
      toast(key ? 'Ключ Mistral сохранён: ведущий — Mistral' : 'Ключ Mistral убран', { kind: key ? 'good' : undefined, timeout: 2600 });
    };
    mistralInput.addEventListener('change', saveMistral);
    mistralInput.addEventListener('blur', saveMistral);""",
    """    const saveMistral = () => {
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
    glmInput.addEventListener('blur', saveGlm);""")

print('клиентские правки готовы')
