/**
 * gemini-proxy-server.js
 * -----------------------------------------------------------------------
 * Minimal Gemini API proxy. Keeps your API key on the SERVER — the
 * landing page (index.html/app.js) only ever calls this server, never
 * Google directly, so the key is never exposed in the browser.
 *
 * Requires Node.js 18+ (uses the built-in `fetch`). No npm install needed.
 *
 * SETUP
 *   1. Get a free API key at https://aistudio.google.com/apikey
 *   2. Run:  GEMINI_API_KEY=your_key_here node gemini-proxy-server.js
 *      (or set the env var another way — see gemini-proxy-README.txt)
 *   3. In the landing page admin panel (gear icon in the footer),
 *      set "AI Endpoint URL" to: http://YOUR_SERVER_ADDRESS:8787/api/chat
 *      (use https:// and a real domain once deployed — not localhost —
 *      so it works for real visitors, not just your own machine)
 *
 * DEPLOY
 *   Works on any host that can run a long-lived Node process: a VPS,
 *   Railway, Render, Fly.io, etc. Just set GEMINI_API_KEY as an
 *   environment variable on that host and run this file with `node`.
 *
 * THIS SERVER ALSO HOSTS THE LANDING PAGE ITSELF
 *   To keep deployment to ONE place, this script also serves index.html,
 *   styles.css, app.js, i18n.js and logo.png straight from this folder.
 *   So the same URL (e.g. https://your-app.onrender.com) is both your
 *   live website AND your API — no separate static hosting needed.
 * -----------------------------------------------------------------------
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

// Auto-load a .env file sitting next to this script, if present.
// Requires Node 20.12+/22+ (built-in, no npm install needed). Safe to skip on older Node.
try { process.loadEnvFile(); } catch (e) { /* no .env file or unsupported Node version — fine, use real env vars instead */ }

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.GEMINI_API_KEY || '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*'; // lock this to your real domain in production
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const MESSENGER_URL = process.env.MESSENGER_URL || '';
const TELEGRAM_URL = process.env.TELEGRAM_URL || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';

const SYSTEM_PROMPT = `Bạn là trợ lý ảo của một đơn vị cung cấp nguyên liệu quảng cáo Facebook (tài khoản quảng cáo, Business Manager, thẻ thanh toán quốc tế, fanpage, proxy, hỗ trợ kháng checkpoint). Trả lời ngắn gọn, chuyên nghiệp, thân thiện, đúng trọng tâm câu hỏi. Nếu không chắc chắn về chính sách giá/bảo hành cụ thể, hãy đề nghị khách nhắn tin trực tiếp qua Messenger hoặc Telegram để được tư vấn chính xác nhất. Trả lời bằng ngôn ngữ mà khách hàng sử dụng.`;

// ---- static site files served alongside the API (see header comment) ----
const STATIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/styles.css': 'styles.css',
  '/app.js': 'app.js',
  '/i18n.js': 'i18n.js',
  '/logo.png': 'logo.png'
};
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml'
};
function serveStatic(req, res) {
  const relPath = STATIC_FILES[req.url];
  if (!relPath) return false;
  const filePath = path.join(__dirname, relPath);
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Not found: ' + relPath);
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
  return true;
}

// very small in-memory rate limiter: max 20 requests / minute / IP
const rateMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000;
  const max = 20;
  const entry = rateMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) {
    entry.count = 0;
    entry.start = now;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  return entry.count > max;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(body);
}

async function callGemini(userMessage) {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY is not set on the server.');
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const payload = {
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: { maxOutputTokens: 300, temperature: 0.6 }
  };
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const errText = await r.text().catch(() => '');
    throw new Error(`Gemini API error ${r.status}: ${errText.slice(0, 300)}`);
  }
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned no text.');
  return text.trim();
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  if (req.method === 'GET' && req.url === '/health') {
    return sendJson(res, 200, { ok: true, hasKey: !!API_KEY });
  }

  // Lets the static landing page pull Messenger/Telegram/email from THIS
  // server's .env instead of needing them re-entered in the admin panel.
  if (req.method === 'GET' && req.url === '/config') {
    return sendJson(res, 200, {
      messenger: MESSENGER_URL,
      telegram: TELEGRAM_URL,
      email: CONTACT_EMAIL
    });
  }

  if (req.method === 'POST' && req.url === '/api/chat') {
    const ip = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(ip)) {
      return sendJson(res, 429, { error: 'Too many requests, please slow down.' });
    }
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 10000) req.destroy(); });
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const message = (parsed.message || '').toString().slice(0, 2000);
        if (!message.trim()) return sendJson(res, 400, { error: 'Missing "message".' });
        const reply = await callGemini(message);
        return sendJson(res, 200, { reply });
      } catch (err) {
        return sendJson(res, 500, { error: err.message || 'Server error.' });
      }
    });
    return;
  }

  if (req.method === 'GET' && serveStatic(req, res)) {
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
});

server.listen(PORT, () => {
  console.log(`Gemini proxy listening on port ${PORT}`);
  console.log(`Loaded from .env (or real env vars) — GEMINI_API_KEY set: ${!!API_KEY}`);
  console.log(`MESSENGER_URL: ${MESSENGER_URL || '(not set)'} | TELEGRAM_URL: ${TELEGRAM_URL || '(not set)'} | CONTACT_EMAIL: ${CONTACT_EMAIL || '(not set)'}`);
  if (!API_KEY) console.warn('WARNING: GEMINI_API_KEY is not set — /api/chat will fail until you set it in .env.');
});
