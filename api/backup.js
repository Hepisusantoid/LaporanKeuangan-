// /api/backup.js
// GET  -> kembalikan seluruh record (transactions + sectors) untuk diunduh sebagai backup.
// POST -> timpa seluruh record dengan payload yang dikirim (untuk memulihkan dari backup).
// Tidak mengubah skema data: tetap { transactions: [...], sectors: [...] }.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const BIN_ID =
    process.env.JSONBIN_BIN_ID || process.env.NEXT_PUBLIC_JSONBIN_BIN_ID;
  const MASTER =
    process.env.JSONBIN_SECRET_KEY ||
    process.env.JSONBIN_API_KEY ||
    process.env.JSONBIN_MASTER_KEY;

  if (!BIN_ID) return res.status(500).json({ error: 'Missing env JSONBIN_BIN_ID' });
  if (!MASTER) return res.status(500).json({ error: 'Missing env JSONBIN_SECRET_KEY/JSONBIN_API_KEY' });

  const base = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
  const headers = {
    'Content-Type': 'application/json',
    'X-Master-Key': MASTER,
    'X-Access-Key': MASTER,
    'X-Bin-Meta': 'false',
  };

  try {
    if (req.method === 'GET') {
      const r = await fetch(`${base}/latest`, { headers, cache: 'no-store' });
      if (!r.ok) throw new Error(`GET ${r.status}: ${await r.text()}`);
      const j = await r.json();
      const record = (j && typeof j === 'object' && 'record' in j) ? j.record : j;
      const transactions = Array.isArray(record?.transactions) ? record.transactions
        : (Array.isArray(record) ? record : []);
      const sectors = Array.isArray(record?.sectors) ? record.sectors : [];
      return res.status(200).json({ transactions, sectors, exportedAt: new Date().toISOString() });
    }

    if (req.method === 'POST') {
      const body = await readJSON(req);
      const transactions = Array.isArray(body?.transactions) ? body.transactions : [];
      const sectors = Array.isArray(body?.sectors) ? body.sectors : [];

      // validasi minimal tiap transaksi agar tidak merusak data
      const clean = transactions
        .filter((t) => t && typeof t === 'object')
        .map((t) => ({
          id: t.id || ('tx_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)),
          type: t.type === 'Pengeluaran' ? 'Pengeluaran' : 'Pemasukan',
          note: t.note || '',
          sector: t.sector || '',
          by: t.by || '',
          amount: Number(t.amount || 0),
          date: t.date || new Date().toISOString().slice(0, 10),
        }));

      const r = await fetch(base, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ transactions: clean, sectors: sectors.filter(Boolean).map(String) }),
      });
      if (!r.ok) throw new Error(`PUT ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true, count: clean.length });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}

async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}
