const KEY = 'sk_kCqSS3Q96WUonzrPPC9c5fxyRjOmiMOi';
const MODELS = ['community/gggff123/qwen3.8-27b:free', 'mistralai/mistral-large-3', 'community/scriptsnsenses-sys/glm-5.3-flash-free'];
(async () => {
  for (const model of MODELS) {
    const t0 = Date.now();
    let first = null, full = '';
    try {
      const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({ model, stream: true, max_tokens: 250,
          messages: [{ role: 'user', content: 'Опиши одним абзацем ночной рынок в пустынном городе, где продают воду. По-русски.' }] }),
        signal: AbortSignal.timeout(90000)
      });
      if (!res.ok) { console.log(model, '→ http', res.status, (await res.text()).slice(0, 120)); continue; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = '';
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n'); buf = lines.pop();
        for (const l of lines) {
          const t = l.trim(); if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim(); if (payload === '[DONE]') continue;
          try { const o = JSON.parse(payload); const d = o.choices?.[0]?.delta?.content; if (d) { if (!first) first = Date.now() - t0; full += d; } } catch (e) {}
        }
      }
      console.log(model, '→ первый кусок', first + 'мс, всего', full.length, 'симв за', (Date.now() - t0) + 'мс');
      console.log('   ', full.replace(/\s+/g, ' ').slice(0, 150));
    } catch (e) { console.log(model, '→ сбой:', e.message); }
  }
})();
