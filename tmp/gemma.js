// Проверка Space'ов с чат-моделями: годится ли кто-то на роль мастера без ключа
const T = [
  ['gemma-3-12b-it', 'https://huggingface-projects-gemma-3-12b-it.hf.space/gradio_api', '/run',
    (text, sys) => [{ text, files: [] }, sys, 700]],
  ['gemma-3n-E4B', 'https://huggingface-projects-gemma-3n-e4b-it.hf.space/gradio_api', '/generate',
    (text, sys) => [{ text, files: [] }, sys, 700]],
  ['llama-3.2-3B', 'https://huggingface-projects-llama-3-2-3b-instruct.hf.space/gradio_api', '/generate',
    (text, sys) => [text, 700, 0.6, 0.9, 50, 1.2]]
];
const SYS = 'Ты — ведущий настольной ролевой игры. Пишешь по-русски, коротко и живо.';
const ASK = 'Герой — картограф в ржавой пустыне, только что нашёл колесо от каравана. Дай сцену: 2 предложения и 3 варианта действий с характеристиками. Отвечай одним JSON: {"scene":"...","options":[{"text":"...","stat":"str|agi|con|int|per|wit|cha","difficulty":"easy|medium|hard"}]}';
const call = async (name, base, ep, build) => {
  const t = Date.now();
  try {
    const s = await fetch(base + '/call' + ep, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: build ? [build(ASK, SYS)] : [] }), signal: AbortSignal.timeout(30000) });
    if (!s.ok) return console.log(name.padEnd(14), 'старт', s.status, (await s.text()).slice(0, 100), Date.now() - t + 'мс');
    const id = (await s.json()).event_id;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const st = await fetch(base + '/call' + ep + '/' + id, { signal: AbortSignal.timeout(20000) });
      const txt = await st.text();
      const m = /"data:\s*(.*)/.exec(txt.replace(/\n/g, ' '));
      if (/event: complete/.test(txt)) {
        const out = txt.replace(/\\n/g, '\n').replace(/\\"/g, '"');
        console.log(name.padEnd(14), '✓ за', Date.now() - t + 'мс |', out.slice(0, 420));
        return;
      }
      if (/event: error/.test(txt)) { console.log(name.padEnd(14), 'ошибка:', txt.replace(/\s+/g, ' ').slice(0, 130), Date.now() - t + 'мс'); return; }
      await new Promise(r => setTimeout(r, 1500));
    }
    console.log(name.padEnd(14), 'не дождались');
  } catch (e) { console.log(name.padEnd(14), 'сбой:', String(e.message).slice(0, 60), Date.now() - t + 'мс'); }
};
(async () => { for (const [n, b, e, f] of T) await call(n, b, e, f); })();
