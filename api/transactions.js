// /api/transactions.js
// Proxy aman ke JSONBin; dukung beberapa nama ENV untuk kunci

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const BIN_ID =
    process.env.JSONBIN_BIN_ID || process.env.NEXT_PUBLIC_JSONBIN_BIN_ID;

  const MASTER =
    process.env.JSONBIN_SECRET_KEY ||
    process.env.JSONBIN_API_KEY ||
    process.env.JSONBIN_MASTER_KEY;

  if (!BIN_ID) {
    return res.status(500).json({ error: 'Missing env JSONBIN_BIN_ID' });
  }
  if (!MASTER) {
    return res.status(500).json({
      error: 'Missing env JSONBIN_SECRET_KEY/JSONBIN_API_KEY'
    });
  }

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
      const data = j?.record || { transactions: [] };
      return res.status(200).json(data);
    }

    // baca state terkini
    const curr = await fetch(`${base}/latest`, { headers, cache: 'no-store' });
    if (!curr.ok) throw new Error(`PREGET ${curr.status}: ${await curr.text()}`);
    const currJson = await curr.json();
    const state = currJson?.record || { transactions: [] };

    if (req.method === 'POST') {
      const body = await readJSON(req);
      const tx = {
        id: body?.id || rid(),
        type: body?.type,                        // 'Pemasukan' | 'Pengeluaran'
        note: body?.note || '',
        amount: Number(body?.amount || 0),
        date: body?.date || new Date().toISOString().slice(0,10)
      };
      const saldoBefore = saldo(state.transactions);
      if (tx.type === 'Pengeluaran' && tx.amount > saldoBefore) {
        return res.status(400).json({ error: 'Pengeluaran melebihi saldo saat ini' });
      }
      state.transactions.push(tx);
      const saved = await put(base, headers, state);
      return res.status(201).json({ ok: true, tx, saved });
    }

    if (req.method === 'PUT') {
      const body = await readJSON(req);
      const id = body?.id;
      if (!id) return res.status(400).json({ error: 'id required' });
      const idx = state.transactions.findIndex(t => t.id === id);
      if (idx === -1) return res.status(404).json({ error: 'not found' });

      const updated = {
        ...state.transactions[idx],
        ...body,
        amount: Number(body?.amount ?? state.transactions[idx].amount)
      };

      const without = state.transactions.filter(t => t.id !== id);
      const saldoBefore = saldo(without);
      if (updated.type === 'Pengeluaran' && updated.amount > saldoBefore) {
        return res.status(400).json({ error: 'Pengeluaran melebihi saldo saat ini' });
      }

      state.transactions[idx] = updated;
      const saved = await put(base, headers, state);
      return res.status(200).json({ ok: true, updated, saved });
    }

    if (req.method === 'DELETE') {
      const { id } = await readJSON(req);
      if (!id) return res.status(400).json({ error: 'id required' });
      const before = state.transactions.length;
      state.transactions = state.transactions.filter(t => t.id !== id);
      if (state.transactions.length === before) return res.status(404).json({ error: 'not found' });
      const saved = await put(base, headers, state);
      return res.status(200).json({ ok: true, saved });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}

// helpers
async function readJSON(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { return {}; }
}
async function put(base, headers, state) {
  const r = await fetch(base, { method: 'PUT', headers, body: JSON.stringify(state) });
  if (!r.ok) throw new Error(`PUT ${r.status}: ${await r.text()}`);
  return r.json();
}
function rid(){ return 'tx_' + Math.random().toString(36).slice(2,10) + Date.now().toString(36); }
function saldo(list){ return list.reduce((a,t)=>a + (t.type==='Pemasukan'? t.amount : -t.amount), 0); }
