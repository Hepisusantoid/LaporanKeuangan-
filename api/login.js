// /api/login.js
// Verifikasi PIN di server pakai ENV: ADMIN_PIN
export default async function handler(req, res) {
  // CORS dasar
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ADMIN_PIN = process.env.ADMIN_PIN || '';
  if (!ADMIN_PIN) return res.status(500).json({ error: 'ADMIN_PIN not set' });

  try {
    const { pin } = await readJSON(req);
    if (typeof pin !== 'string' || pin.length < 4) {
      return res.status(400).json({ error: 'PIN invalid' });
    }
    // cocokkan
    const ok = pin === ADMIN_PIN;
    return res.status(200).json({ ok });
  } catch {
    return res.status(400).json({ error: 'Bad request' });
  }
}

// helper baca JSON body (Node-style)
async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
