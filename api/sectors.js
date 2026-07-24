// /api/sectors.js
// Kelola daftar "sektor manual" (yang ditambahkan user tanpa lewat transaksi).
// Disimpan di JSONBin yang SAMA dengan transaksi, cukup field baru `sectors: []`.
// Tidak mengubah struktur/skema transaksi sama sekali.

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
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
      const { record } = await loadRecord(base, headers);
      return res.status(200).json({ sectors: extractSectors(record) });
    }

    const { record } = await loadRecord(base, headers);
    const sectors = extractSectors(record);

    if (req.method === 'POST') {
      const body = await readJSON(req);
      const name = String(body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name required' });
      if (!sectors.some((s) => s.toLowerCase() === name.toLowerCase())) {
        sectors.push(name);
        await saveRecord(base, headers, record, sectors);
      }
      return res.status(201).json({ ok: true, sectors });
    }

    if (req.method === 'DELETE') {
      const body = await readJSON(req);
      const name = String(body?.name || '').trim();
      if (!name) return res.status(400).json({ error: 'name required' });
      const next = sectors.filter((s) => s.toLowerCase() !== name.toLowerCase());
      await saveRecord(base, headers, record, next);
      return res.status(200).json({ ok: true, sectors: next });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}

/* =================== Helpers =================== */
async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}
function extractSectors(record) {
  if (Array.isArray(record?.sectors)) return record.sectors.filter(Boolean).map(String);
  return [];
}
async function loadRecord(base, headers) {
  const r = await fetch(`${base}/latest`, { headers, cache: 'no-store' });
  if (!r.ok) throw new Error(`GET ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const record = (j && typeof j === 'object' && 'record' in j) ? j.record : j;
  return { record: record && typeof record === 'object' ? record : {} };
}
async function saveRecord(base, headers, record, sectors) {
  const transactions = Array.isArray(record?.transactions) ? record.transactions : [];
  const r = await fetch(base, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ ...record, transactions, sectors }),
  });
  if (!r.ok) throw new Error(`PUT ${r.status}: ${await r.text()}`);
  return r.json();
}
