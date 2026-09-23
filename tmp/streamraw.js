// что именно отдают модели в потоке: ищем нестандартные поля
const KEY = 'sk_kCqSS3Q96WUonzrPPC9c5fxyRjOmiMOi';
const MODELS = ['mistralai/mistral-large-3','community/scriptsnsenses-sys/glm-5.3-flash-free','community/NamanSoni78/gpt-5.6-Luna','community/gggff123/qwen3.8-27b:free','community/NamanSoni78/gemini-3.8-flash','community/scriptsnsenses-sys/gpt-5.6-sol-free','community/NamanSoni78/Claude-Fable-5.1'];
(async () => {
  for (const model of MODELS) {
    const t0 = Date.now();
    try {
      const res = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json', 'Authorization': 'Bearer ' + KEY },
        body: JSON.stringify({ model, stream: true, max_tokens: 120, messages: [{ role: 'user', content: 'Скажи три слова по-русски про пустыню.' }] }),
        signal: AbortSignal.timeout(60000)
      });
      if (!res.ok) { console.log(model, '| http', res.status, (await res.text()).slice(0, 90)); continue; }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = ''; let content = ''; let keys = new Set(); let lines = 0;
      while (true) {
        const { value, done } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split('\n'); buf = parts.pop();
        for (const l of parts) {
          const t = l.trim(); if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim(); if (!payload || payload === '[DONE]') continue;
          lines++;
          try { const o = JSON.parse(payload); const d = o.choices?.[0]?.delta; if (d) { Object.keys(d).forEach(k => keys.add(k)); if (d.content) content += d.content; } } catch (e) {}
        }
      }
      console.log(model, '|', Date.now() - t0, 'мс | строк', lines, '| поля:', Array.from(keys).join(',') || '—', '| текст:', JSON.stringify(content.slice(0, 60)));
    } catch (e) { console.log(model, '| сбой:', e.message); }
  }
})();
