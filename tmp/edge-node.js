// Edge TTS из Node: нейронные голоса Microsoft без ключа.
// Токен Sec-MS-GEC = SHA256(тики Windows, округлённые до 5 минут + trusted-token).
const crypto = require('crypto');
const fs = require('fs');
const WS = (() => { try { return require('ws'); } catch (e) { return typeof WebSocket !== 'undefined' ? WebSocket : null; } })();
const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const VER = '1-143.0.3650.75';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0';

function secMsGec() {
  const WIN_EPOCH = 11644473600;                       // секунды от 1601-01-01 до 1970-01-01
  let ticks = Math.floor(Date.now() / 1000) + WIN_EPOCH;
  ticks -= ticks % 300;                                // округление до 5 минут
  const str = BigInt(ticks) * 10000000n;               // 100-нс интервалы
  return crypto.createHash('sha256').update(String(str) + TOKEN).digest('hex').toUpperCase();
}

function edgeSpeech(text, opts) {
  const o = opts || {};
  const voice = o.voice || 'ru-RU-SvetlanaNeural';
  const rate = typeof o.rate === 'number' ? (o.rate >= 0 ? '+' : '') + o.rate + '%' : '+0%';
  const pitch = typeof o.pitch === 'number' ? (o.pitch >= 0 ? '+' : '') + o.pitch + 'Hz' : '+0Hz';
  const id = () => crypto.randomUUID().replace(/-/g, '');
  const url = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
    '?TrustedClientToken=' + TOKEN + '&ConnectionId=' + id() +
    '&Sec-MS-GEC=' + secMsGec() + '&Sec-MS-GEC-Version=' + VER;
  const t0 = Date.now();
  return new Promise((resolve, reject) => {
    const ws = new WS(url, { headers: {
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9', 'Pragma': 'no-cache', 'Cache-Control': 'no-cache',
      'Sec-WebSocket-Version': '13'
    } });
    const chunks = [];
    const timer = setTimeout(() => { try { ws.terminate(); } catch (e) {} reject(new Error('таймаут 25с')); }, 25000);
    const done = () => { clearTimeout(timer); try { ws.close(); } catch (e) {} };
    ws.on('open', () => {
      const ts = new Date().toISOString().replace(/Z$/, 'Z');
      ws.send('X-Timestamp:' + ts + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
        JSON.stringify({ context: { synthesis: { audio: {
          metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
          outputFormat: o.format || 'audio-24khz-96kbitrate-mono-mp3' } } } }));
      const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'>" +
        "<voice name='" + voice + "'><prosody rate='" + rate + "' pitch='" + pitch + "'>" +
        String(text).replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])) +
        "</prosody></voice></speak>";
      ws.send('X-RequestId:' + id() + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + ts + '\r\nPath:ssml\r\n\r\n' + ssml);
    });
    ws.on('message', (data, isBinary) => {
      if (!isBinary) {
        const s = String(data);
        if (s.includes('Path:turn.end')) { done(); resolve({ body: Buffer.concat(chunks), ms: Date.now() - t0 }); }
        else if (/Path:response/.test(s) && /"error"/.test(s)) { done(); reject(new Error('сервер вернул ошибку: ' + s.slice(0, 160))); }
        return;
      }
      const buf = Buffer.from(data);
      const len = buf.readUInt16BE(0);
      const head = buf.slice(2, 2 + len).toString();
      if (/Path:\s*audio/.test(head)) chunks.push(buf.slice(2 + len));
    });
    ws.on('error', err => { clearTimeout(timer); reject(err); });
    ws.on('close', code => { clearTimeout(timer); if (!chunks.length) reject(new Error('закрыто с кодом ' + code)); });
  });
}

(async () => {
  const text = 'Ты выходишь к сухому руслу. Ветер несёт песок, где-то далеко гудит горн, и караванщица Мара ждёт ответа.';
  for (const [voice, rate, pitch, name] of [
    ['ru-RU-SvetlanaNeural', 0, 0, 'svetlana-96'],
    ['ru-RU-DmitryNeural', -8, -4, 'dmitry-mrachno'],
    ['ru-RU-SvetlanaNeural', 10, 3, 'svetlana-bystro']
  ]) {
    try {
      const r = await edgeSpeech(text, { voice, rate, pitch });
      const f = 'tmp/edge-' + name + '.mp3';
      fs.writeFileSync(f, r.body); console.log(name, '→', r.body.length, 'байт за', r.ms, 'мс');
    } catch (e) { console.log(name, '→ сбой:', e.message.slice(0, 140)); }
  }
})();
