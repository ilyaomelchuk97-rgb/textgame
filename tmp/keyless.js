// Что работает без ключа: HF Space flux-1-schnell, legacy sana, legacy текст, Google TTS.
const t0 = Date.now();
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1) + 'с';
const probe = async (label, fn) => {
  const started = Date.now();
  try { const r = await fn(); console.log(stamp(), label, '→', r, '(' + (Date.now() - started) + 'мс)'); }
  catch (e) { console.log(stamp(), label, '→ отказ:', String(e.message || e).slice(0, 140), '(' + (Date.now() - started) + 'мс)'); }
};
const HF = 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api';
(async () => {
  await probe('HF flux-1-schnell /info', async () => {
    const r = await fetch(HF + '/info', { signal: AbortSignal.timeout(15000) });
    return 'HTTP ' + r.status + ', ' + (r.headers.get('content-type') || '');
  });
  await probe('HF flux-1-schnell POST /infer', async () => {
    const body = JSON.stringify({ data: ['desert oasis at dawn, cinematic, no text', 3, 448, 256, 7] });
    const r = await fetch(HF + '/infer', { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: AbortSignal.timeout(90000) });
    const text = (await r.text()).slice(0, 160);
    return 'HTTP ' + r.status + ' ' + (r.headers.get('content-type') || '') + ' | ' + text;
  });
  await probe('legacy image sana', async () => {
    const r = await fetch('https://image.pollinations.ai/prompt/desert%20oasis%20at%20dawn%20cinematic?model=sana&width=448&height=256&nologo=true&seed=42', { signal: AbortSignal.timeout(60000) });
    const b = await r.arrayBuffer();
    return 'HTTP ' + r.status + ' ' + (r.headers.get('content-type') || '') + ' ' + b.byteLength + 'б';
  });
  await probe('legacy текст openai-fast', async () => {
    const r = await fetch('https://text.pollinations.ai/' + encodeURIComponent('Скажи одно слово: готов'), { signal: AbortSignal.timeout(45000) });
    return 'HTTP ' + r.status + ' | ' + (await r.text()).slice(0, 80);
  });
  await probe('Google Translate TTS', async () => {
    const r = await fetch('https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=ru&q=' + encodeURIComponent('Кадр нарисован'), { headers: { referer: 'https://translate.google.com/', 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) });
    const b = await r.arrayBuffer();
    return 'HTTP ' + r.status + ' ' + (r.headers.get('content-type') || '') + ' ' + b.byteLength + 'б';
  });
})();
