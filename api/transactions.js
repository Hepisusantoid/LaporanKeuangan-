// /api/transactions.js
// Proxy aman ke JSONBin + kompatibel format lama/baru
// - Bisa baca record: ARRAY langsung [] ATAU { transactions: [] }
// - Selalu menyimpan balik dalam bentuk { transactions: [...] }

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ENV
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
      const { list } = await loadList(base, headers);
      // Selalu kirim objek standar agar FE konsisten
      return res.status(200).json({ transactions: list });
    }

    // Ambil state terkini
    const { list } = await loadList(base, headers);

    if (req.method === 'POST') {
      const body = await readJSON(req);
      const tx = sanitizeTx(body);
      // validasi saldo (pengeluaran tak boleh melebihi saldo saat ini)
      if (tx.type === 'Pengeluaran' && tx.amount > calcSaldo(list)) {
        return res.status(400).json({ error: 'Pengeluaran melebihi saldo saat ini' });
      }
      list.push(tx);
      await saveList(base, headers, list);
      return res.status(201).json({ ok: true, tx });
    }

    if (req.method === 'PUT') {
      const body = await readJSON(req);
      const id = body?.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const idx = list.findIndex(t => t.id === id);
      if (idx === -1) return res.status(404).json({ error: 'not found' });

      const updated = {
        ...list[idx],
        ...body,
        amount: Number(body?.amount ?? list[idx].amount)
      };

      const without = list.filter(t => t.id !== id);
      if (updated.type === 'Pengeluaran' && updated.amount > calcSaldo(without)) {
        return res.status(400).json({ error: 'Pengeluaran melebihi saldo saat ini' });
      }

      list[idx] = updated;
      await saveList(base, headers, list);
      return res.status(200).json({ ok: true, updated });
    }

    if (req.method === 'DELETE') {
      const { id } = await readJSON(req);
      if (!id) return res.status(400).json({ error: 'id required' });
      const before = list.length;
      const next = list.filter(t => t.id !== id);
      if (next.length === before) return res.status(404).json({ error: 'not found' });
      await saveList(base, headers, next);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}

// ===== Helpers =====
async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}
function sanitizeTx(body){
  return {
    id: body?.id || rid(),
    type: body?.type, // 'Pemasukan' | 'Pengeluaran'
    note: body?.note || '',
    amount: Number(body?.amount || 0),
    date: body?.date || new Date().toISOString().slice(0,10)
  };
}
function rid(){ return 'tx_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function calcSaldo(list){ return list.reduce((a,t)=>a + (t.type==='Pemasukan'? t.amount : -t.amount), 0); }

function extractList(record){
  if (Array.isArray(record?.transactions)) return record.transactions; // bentuk baru
  if (Array.isArray(record)) return record;                             // bentuk lama (array langsung)
  return [];                                                            // fallback
}
async function loadList(base, headers){
  const r = await fetch(`${base}/latest`, { headers, cache:'no-store' });
  if (!r.ok) throw new Error(`GET ${r.status}: ${await r.text()}`);
  const j = await r.json();
  return { list: extractList(j?.record) };
}
async function saveList(base, headers, list){
  // Simpan balik SELALU sebagai objek standar
  const r = await fetch(base, { method:'PUT', headers, body: JSON.stringify({ transactions: list }) });
  if (!r.ok) throw new Error(`PUT ${r.status}: ${await r.text()}`);
  return r.json();
          }
