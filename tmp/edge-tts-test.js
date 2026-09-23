// проверка Edge TTS (нейронные голоса Microsoft, без ключа)
const WebSocket = require('ws');
const crypto = require('crypto');
const fs = require('fs');
const TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const uuid = () => crypto.randomUUID().replace(/-/g, '');

const synth = (text, voice) => new Promise((resolve, reject) => {
  const url = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1' +
    '?TrustedClientToken=' + TOKEN + '&ConnectionId=' + uuid();
  // Microsoft требует Sec-MS-GEC: SHA256 от «тика» времени (+11644473600, шаг 5 минут) и токена
  const secs = Math.floor(Date.now() / 1000) + 11644473600;
  const ticks = BigInt(secs - (secs % 300)) * 10000000n;   // BigInt: 1.7e19 не влезает в double
  const gec = require('crypto').createHash('sha256').update(String(ticks) + TOKEN).digest('hex').toUpperCase();
  const ws = new WebSocket(url, {
    headers: {
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Sec-MS-GEC': gec,
      'Sec-MS-GEC-Version': '1-130.0.2849.68',
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache'
    }
  });
  const chunks = [];
  const t0 = Date.now();
  setTimeout(() => { try { ws.terminate(); } catch (e) {} reject(new Error('timeout 20с')); }, 20000);
  ws.on('open', () => {
    const ts = new Date().toISOString();
    ws.send('X-Timestamp:' + ts + '\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n' +
      JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } }));
    const ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='ru-RU'>" +
      "<voice name='" + voice + "'><prosody rate='+0%' pitch='+0Hz'>" + text + "</prosody></voice></speak>";
    ws.send('X-RequestId:' + uuid() + '\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:' + ts + 'Z\r\nPath:ssml\r\n\r\n' + ssml);
  });
  ws.on('message', (data, isBinary) => {
    if (!isBinary) { if (String(data).includes('Path:turn.end')) { try { ws.close(); } catch (e) {} resolve({ buf: Buffer.concat(chunks), ms: Date.now() - t0 }); } return; }
    const buf = Buffer.from(data);
    const headerLen = buf.readUInt16BE(0);
    const header = buf.slice(2, 2 + headerLen).toString();
    if (/Path:\s*audio/.test(header)) chunks.push(buf.slice(2 + headerLen));
  });
  ws.on('error', err => reject(err));
});

(async () => {
  const text = 'Ты вышел к сухому руслу реки. Ветер несёт песок, и где-то далеко гудит горн.';
  for (const voice of ['ru-RU-DmitryNeural', 'ru-RU-SvetlanaNeural']) {
    try {
      const r = await synth(text, voice);
      fs.writeFileSync('tmp/edge-' + voice + '.mp3', r.buf);
      console.log(voice, '→', r.buf.length, 'байт за', r.ms, 'мс');
    } catch (e) { console.log(voice, '→ сбой:', e.message); }
  }
})();
