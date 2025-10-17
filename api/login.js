// api/login.js
// Validasi PIN admin via Environment: ADMIN_PIN
// Mengembalikan { ok: true } bila cocok, 401 bila salah.

export default async function handler(req, res) {
  // Hanya izinkan POST (GET akan muncul 405 agar mudah dideteksi)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Ambil body secara robust (Next.js = req.body sudah object,
  // Vercel Functions kadang string/stream)
  let body = {};
  try {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (typeof req.body === 'string') {
      body = JSON.parse(req.body || '{}');
    } else {
      const buffers = [];
      for await (const chunk of req) buffers.push(chunk);
      const raw = Buffer.concat(buffers).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    }
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  const { pin } = body;
  const adminPin = process.env.ADMIN_PIN;

  if (!adminPin || adminPin === '') {
    // Supaya jelas kalau ENV belum ada / belum ter-propagate
    return res.status(500).json({ error: 'ADMIN_PIN is not set on server' });
  }

  // Bandingkan sebagai string, trimming untuk menghindari spasi tak sengaja
  const ok = String(pin ?? '').trim() === String(adminPin).trim();

  if (ok) return res.status(200).json({ ok: true });
  return res.status(401).json({ error: 'INVALID_PIN' });
}
