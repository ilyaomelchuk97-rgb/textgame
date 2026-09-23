// Какие открытые Space'ы с картинками живы без ключа
const SPACES = [
  ['flux-1-schnell', 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api'],
  ['flux-merged', 'https://multimodalart-flux-1-merged.hf.space/gradio_api'],
  ['sd-3.5-large', 'https://stabilityai-stable-diffusion-3-5-large.hf.space/gradio_api'],
  ['kolors', 'https://kwai-kolors-kolors.hf.space/gradio_api'],
  ['qwen-image', 'https://qwen-qwen-image.hf.space/gradio_api'],
  ['sd-xl-turbo', 'https://stabilityai-stable-diffusion-xl-turbo.hf.space/gradio_api']
];
(async () => {
  for (const [name, base] of SPACES) {
    const t = Date.now();
    try {
      const r = await fetch(base + '/info', { signal: AbortSignal.timeout(12000) });
      const d = await r.json().catch(() => ({}));
      const eps = Object.keys(d.named_endpoints || {});
      const params = eps.length ? (d.named_endpoints[eps[0]].parameters || []).map(p => p.parameter_name).join(',') : '';
      console.log(name.padEnd(14), r.status, 'за', Date.now() - t + 'мс, эндпоинты:', eps.join(' ').slice(0, 40), '|', params.slice(0, 90));
    } catch (e) { console.log(name.padEnd(14), 'отказ:', String(e.message).slice(0, 60), Date.now() - t + 'мс'); }
  }
})();
