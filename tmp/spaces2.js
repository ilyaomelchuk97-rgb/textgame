// Пробуем нарисовать кадр на открытых Space'ах (все разом, чтобы не ждать по очереди)
const fs = require('fs');
const PROMPT = 'wide shot of a desert oasis at dawn, lone traveler in a tattered cloak, cinematic, no text';
const call = async (name, base, data, file) => {
  const t = Date.now();
  try {
    const s = await fetch(base + '/call/infer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data }), signal: AbortSignal.timeout(20000) });
    if (!s.ok) return console.log(name, 'старт', s.status, (await s.text()).slice(0, 90));
    const id = (await s.json()).event_id;
    const deadline = Date.now() + 150000;
    while (Date.now() < deadline) {
      const st = await fetch(base + '/call/infer/' + id, { signal: AbortSignal.timeout(20000) });
      const txt = await st.text();
      const url = (txt.match(/"(https?:\/\/[^"]+?\.(?:webp|png|jpe?g)[^"]*)"/) || [])[1];
      if (url) {
        const img = await fetch(url, { signal: AbortSignal.timeout(30000) });
        const b = Buffer.from(await img.arrayBuffer());
        fs.writeFileSync(file, b);
        console.log(name, '✓', img.status, b.length, 'байт за', Date.now() - t + 'мс →', file);
        return;
      }
      if (/event: error/.test(txt)) return console.log(name, 'ошибка Space:', txt.replace(/\s+/g, ' ').slice(0, 90), Date.now() - t + 'мс');
      await new Promise(r => setTimeout(r, 1500));
    }
    console.log(name, 'не дождались за', Date.now() - t + 'мс');
  } catch (e) { console.log(name, 'сбой:', String(e.message).slice(0, 70), Date.now() - t + 'мс'); }
};
(async () => {
  await Promise.all([
    call('flux-merged  ', 'https://multimodalart-flux-1-merged.hf.space/gradio_api', [PROMPT, 11, false, 448, 256, 3.5, 4], 'tmp/sp-flux-merged.png'),
    call('sd3.5-large  ', 'https://stabilityai-stable-diffusion-3-5-large.hf.space/gradio_api', [PROMPT, 'blurry, text, watermark', 12, false, 448, 256, 4.5, 20], 'tmp/sp-sd35.png'),
    call('kolors       ', 'https://kwai-kolors-kolors.hf.space/gradio_api', [PROMPT, null, 0.5, 'text, watermark', 13, false, 448, 256, 5, 20], 'tmp/sp-kolors.png')
  ]);
})();
