const BASE = 'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api';
(async () => {
  const t0 = Date.now();
  const r = await fetch(BASE + '/call/infer', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: ['desert oasis at dawn, cinematic, no text', 7, true, 448, 256, 4] }),
    signal: AbortSignal.timeout(30000)
  });
  console.log('POST /call/infer →', r.status, (r.headers.get('content-type') || ''), (await r.text()).slice(0, 120), (Date.now() - t0) + 'мс');
  const id = (await (await fetch(BASE + '/call/infer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: ['desert oasis at dawn, cinematic, no text', 7, true, 448, 256, 4] }) })).json().catch(() => ({}))).event_id;
  console.log('event_id:', id);
  if (!id) return;
  let url = '';
  for (let i = 0; i < 90 && Date.now() - t0 < 120000; i++) {
    const s = await fetch(BASE + '/call/infer/' + id, { signal: AbortSignal.timeout(15000) });
    const txt = await s.text();
    if (/event: complete|event: error/.test(txt) || /"url"/.test(txt)) { console.log('финал через', Date.now() - t0, 'мс:', txt.slice(0, 300)); url = (txt.match(/"(https?:\/\/[^"]+)"/) || [])[1] || ''; break; }
    await new Promise(r => setTimeout(r, 1500));
  }
  if (url) {
    const img = await fetch(url, { signal: AbortSignal.timeout(60000) });
    const b = await img.arrayBuffer();
    console.log('картинка:', img.status, img.headers.get('content-type'), b.byteLength, 'байт за', Date.now() - t0, 'мс');
    require('fs').writeFileSync('tmp/hf-frame.jpg', Buffer.from(b));
  }
})();
