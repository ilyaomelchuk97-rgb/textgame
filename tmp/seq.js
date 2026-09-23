// Три кадра по очереди — как в игре на самом деле
const prompts = ['night market with lanterns, water seller', 'frozen canyon edge, tattered cloak, wind', 'sandstorm over rusty bridge, lone traveler'];
(async () => {
  for (const p of prompts) {
    const t = Date.now();
    const r = await fetch('http://127.0.0.1:3000/api/image?prompt=' + encodeURIComponent(p + ' ' + Math.random()) + '&seed=' + Math.floor(Math.random() * 1e6) + '&w=448&h=256');
    const b = Buffer.from(await r.arrayBuffer());
    console.log(r.status, b.length + 'б', Date.now() - t + 'мс |', r.headers.get('x-image-source'), '|', (r.headers.get('x-image-report') || '').slice(0, 120));
    await new Promise(x => setTimeout(x, 1500));
  }
})();
