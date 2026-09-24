# -*- coding: utf-8 -*-
"""
Клиентская часть канала Hugging Face.

src/engine.js — buildImageUrl умеет дописать hfKey к запросу кадра
src/api.js    — CONFIG.hfKey, setHfKey/getHfKey, hfKey в /api/gm, /api/gm/stream и в URL картинки
src/app.js    — Settings.data.hfKey, применение при загрузке, поле в «Канале ИИ»
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


# ------------------------------------------------------------------ src/engine.js
P = 'src/engine.js'
sub(P, 'hfKey в адресе кадра',
    """  function buildImageUrl({ prompt, seed, width, height, aspect, style, serverFirst, source }) {""",
    """  function buildImageUrl({ prompt, seed, width, height, aspect, style, serverFirst, source, hfKey }) {""")
sub(P, 'hfKey в server-URL',
    """      server: 'api/image?prompt=' + encodeURIComponent(full) + '&seed=' + encodeURIComponent(seed || 1) + '&w=' + w + '&h=' + h + src,""",
    """      // hfKey — ключ игрока: открытые Space'ы отвечают по имени охотнее, чем анонимно
      server: 'api/image?prompt=' + encodeURIComponent(full) + '&seed=' + encodeURIComponent(seed || 1) +
        '&w=' + w + '&h=' + h + src + (hfKey ? '&hfKey=' + encodeURIComponent(hfKey) : ''),""")

# ------------------------------------------------------------------ src/api.js
P = 'src/api.js'
sub(P, 'поле ключа в CONFIG',
    "    glmKey: '',               // ключ GLM (Zhipu) от игрока: id.secret, тоже только в телефоне",
    "    glmKey: '',               // ключ GLM (Zhipu) от игрока: id.secret, тоже только в телефоне\n"
    "    hfKey: '',                // ключ Hugging Face (hf_…): ведёт игру и рисует кадры по имени")
sub(P, 'геттер и сеттер',
    "  function setGlmKey(key) { CONFIG.glmKey = String(key || '').trim(); }\n  function getGlmKey() { return CONFIG.glmKey; }",
    "  function setGlmKey(key) { CONFIG.glmKey = String(key || '').trim(); }\n"
    "  function getGlmKey() { return CONFIG.glmKey; }\n"
    "  function setHfKey(key) { CONFIG.hfKey = String(key || '').trim(); }\n"
    "  function getHfKey() { return CONFIG.hfKey; }")
sub(P, 'hfKey в запросе мастера',
    "        body: JSON.stringify({ messages, budgetMs, kind: kind || '', provider: wantedMaster(), mistralKey: CONFIG.mistralKey, glmKey: CONFIG.glmKey }),",
    "        body: JSON.stringify({ messages, budgetMs, kind: kind || '', provider: wantedMaster(),\n"
    "          mistralKey: CONFIG.mistralKey, glmKey: CONFIG.glmKey, hfKey: CONFIG.hfKey }),")
sub(P, 'hfKey в потоке',
    "        body: JSON.stringify({ messages, budgetMs: hooks.budgetMs, kind: hooks.kind || '', provider: wantedMaster(), mistralKey: CONFIG.mistralKey, glmKey: CONFIG.glmKey }),",
    "        body: JSON.stringify({ messages, budgetMs: hooks.budgetMs, kind: hooks.kind || '', provider: wantedMaster(),\n"
    "          mistralKey: CONFIG.mistralKey, glmKey: CONFIG.glmKey, hfKey: CONFIG.hfKey }),")
sub(P, 'hfKey в запросе кадра',
    """    const built = E.buildImageUrl({
      prompt, style, aspect, seed, source,
      width: width || CONFIG.imageWidth, height: height || CONFIG.imageHeight
    });""",
    """    const built = E.buildImageUrl({
      prompt, style, aspect, seed, source,
      width: width || CONFIG.imageWidth, height: height || CONFIG.imageHeight,
      hfKey: CONFIG.hfKey
    });""")
sub(P, 'экспорт',
    "    setGlmKey, getGlmKey,",
    "    setGlmKey, getGlmKey,\n    setHfKey, getHfKey,")

# ------------------------------------------------------------------ src/app.js
P = 'src/app.js'
sub(P, 'поле в настройках (данные)',
    "      glmKey: '',                          // ключ GLM (Zhipu): ещё один ведущий ИИ",
    "      glmKey: '',                          // ключ GLM (Zhipu): ещё один ведущий ИИ\n"
    "      hfKey: '',                           // ключ Hugging Face: ведущий и очередь картинок")
sub(P, 'применение при загрузке (init)',
    "        if (typeof data.glmKey === 'string') API.setGlmKey(data.glmKey);\n"
    "        API.setMaster(data.master);",
    "        if (typeof data.glmKey === 'string') API.setGlmKey(data.glmKey);\n"
    "        if (typeof data.hfKey === 'string') API.setHfKey(data.hfKey);\n"
    "        API.setMaster(data.master);")
sub(P, 'применение при сохранении (set)',
    "        if (typeof data.glmKey === 'string') API.setGlmKey(data.glmKey);\n"
    "        if (typeof data.master === 'string') API.setMaster(data.master);",
    "        if (typeof data.glmKey === 'string') API.setGlmKey(data.glmKey);\n"
    "        if (typeof data.hfKey === 'string') API.setHfKey(data.hfKey);\n"
    "        if (typeof data.master === 'string') API.setMaster(data.master);")
sub(P, 'поле ввода в настройках',
    """    glmInput.addEventListener('change', saveGlm);
    glmInput.addEventListener('blur', saveGlm);""",
    """    glmInput.addEventListener('change', saveGlm);
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
    hfInput.addEventListener('blur', saveHf);""")
sub(P, 'вывод полей в секции',
    """      glmInput,
      h('p', { class: 'muted small', text: 'Ключи остаются в телефоне и уходят только вместе с запросом к мастеру — на сервере они не хранятся.' }),""",
    """      glmInput,
      h('p', { class: 'muted small', text: 'У Hugging Face один ключ hf_… открывает и ведущего (137 моделей через роутер), и очередь картинок: кадры рисуют открытые Space, а по имени они отвечают охотнее, чем анонимно. Ключ делается в настройках профиля, право «Make calls to Inference Providers».' }),
      hfInput,
      h('p', { class: 'muted small', text: 'Ключи остаются в телефоне и уходят только вместе с запросом к мастеру — на сервере они не хранятся.' }),""")

print('клиентские правки готовы')
