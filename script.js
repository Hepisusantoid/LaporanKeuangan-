// ====== Konfigurasi ======
// URL serverless kita (Vercel)
const API = '/api/transactions';

// Login pakai PIN yang diverifikasi oleh server secara sederhana.
// Di sini untuk demo aku simpan di LocalStorage saja agar kamu cepat pakai.
// Jika mau, kamu bisa bikin API /api/login yang cek ke ENV, tapi sementara cukup client-side.
const SESSION_KEY = 'lapkeu_session';

// ====== State ======
let state = { transactions: [] };
let currentMonthFilter = 'ALL';

// ====== Utility ======
const fmtIDR = (n) => (n||0).toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs={}, kids=[]) => {
  const x = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k==='class') x.className=v; else if (k==='text') x.textContent=v; else x.setAttribute(k,v);
  });
  kids.forEach(k => x.appendChild(k));
  return x;
};

// ====== Auth UI ======
function updateAuthUI() {
  const loggedIn = Boolean(localStorage.getItem(SESSION_KEY));
  $('#screen-login').classList.toggle('hidden', loggedIn);
  $('#screen-app').classList.toggle('hidden', !loggedIn);
  $('#btn-login').hidden = loggedIn;
  $('#btn-logout').hidden = !loggedIn;
}
$('#btn-login')?.addEventListener('click', ()=> $('#screen-login').scrollIntoView({behavior:'smooth'}));
$('#do-login')?.addEventListener('click', ()=>{
  const v = $('#pin').value.trim();
  if (!v) return alert('Masukkan PIN');
  // Minimal 4 digit
  if (v.length < 4) return alert('PIN minimal 4 digit');
  localStorage.setItem(SESSION_KEY, 'ok');
  updateAuthUI();
  loadData();
});
$('#btn-logout')?.addEventListener('click', ()=>{
  localStorage.removeItem(SESSION_KEY);
  updateAuthUI();
});

// ====== Data I/O ======
async function getData() {
  const r = await fetch(API, { method:'GET' });
  if (!r.ok) throw new Error('Gagal memuat data');
  return r.json();
}
async function addTx(tx) {
  const r = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(tx) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Gagal simpan');
  return j;
}
async function updateTx(tx) {
  const r = await fetch(API, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(tx) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Gagal update');
  return j;
}
async function deleteTx(id) {
  const r = await fetch(API, { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id}) });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Gagal hapus');
  return j;
}

// ====== Render ======
function computeSums(list) {
  const sumIn = list.filter(t=>t.type==='Pemasukan').reduce((a,b)=>a+b.amount,0);
  const sumOut= list.filter(t=>t.type==='Pengeluaran').reduce((a,b)=>a+b.amount,0);
  return { sumIn, sumOut, balance: sumIn - sumOut };
}
function monthKey(d) { // 'YYYY-MM'
  return (d||'').slice(0,7);
}
function listMonths(list) {
  const s = new Set(list.map(t=>monthKey(t.date)));
  return Array.from(s).filter(Boolean).sort().reverse();
}
function applyFilter(list) {
  if (currentMonthFilter==='ALL') return list;
  return list.filter(t=>monthKey(t.date)===currentMonthFilter);
}
function render() {
  const filtered = applyFilter(state.transactions).sort((a,b)=> (a.date<b.date?1:-1));
  const {sumIn,sumOut,balance} = computeSums(filtered);
  $('#sum-in').textContent = fmtIDR(sumIn);
  $('#sum-out').textContent = fmtIDR(sumOut);
  $('#sum-balance').textContent = fmtIDR(balance);

  // filter dropdown
  const months = listMonths(state.transactions);
  const sel = $('#filter-month');
  sel.innerHTML = '';
  const optAll = el('option',{value:'ALL',text:'Semua Bulan'});
  sel.appendChild(optAll);
  months.forEach(m => sel.appendChild(el('option',{value:m,text:toIndoMonth(m)})));
  sel.value = currentMonthFilter;

  const tbody = $('#tbody');
  tbody.innerHTML = '';
  filtered.forEach(t=>{
    const tr = el('tr',{},[
      el('td',{text: t.date}),
      el('td',{text: t.note || '-'}),
      el('td',{text: t.type}),
      el('td',{class:'right', text: fmtIDR(t.amount)}),
      el('td',{},[
        btnSmall('Edit', ()=>openEdit(t)),
        space(),
        btnSmallDanger('Hapus', async ()=>{
          if (!confirm('Hapus transaksi ini?')) return;
          try { await deleteTx(t.id); await loadData(); }
          catch(e){ alert(e.message); }
        })
      ])
    ]);
    tbody.appendChild(tr);
  });
}
function btnSmall(txt, fn){ const b=el('button',{class:'btn',text:txt}); b.addEventListener('click',fn); return b;}
function btnSmallDanger(txt, fn){ const b=el('button',{class:'btn danger',text:txt}); b.addEventListener('click',fn); return b;}
function space(){ const s=document.createTextNode(' '); return s; }
function toIndoMonth(ym){ // '2025-10' -> 'Oktober 2025'
  const [y,m]=ym.split('-').map(Number);
  const id=['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${id[m]} ${y}`;
}

// ====== Modal Tambah/Edit ======
const dlg = $('#modal-tx');
$('#open-add')?.addEventListener('click', ()=>{
  $('#modal-title').textContent = 'Tambah Transaksi Baru';
  $('#tx-id').value = '';
  $('#tx-type').value = 'Pemasukan';
  $('#tx-note').value = '';
  $('#tx-amount').value = '';
  $('#tx-date').valueAsDate = new Date();
  $('#form-error').hidden = true;
  dlg.showModal();
});
$('#btn-cancel')?.addEventListener('click', ()=> dlg.close());

function openEdit(t) {
  $('#modal-title').textContent = 'Edit Transaksi';
  $('#tx-id').value = t.id;
  $('#tx-type').value = t.type;
  $('#tx-note').value = t.note || '';
  $('#tx-amount').value = t.amount;
  $('#tx-date').value = t.date;
  $('#form-error').hidden = true;
  dlg.showModal();
}

$('#form-tx')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const data = {
    id: $('#tx-id').value || undefined,
    type: $('#tx-type').value,
    note: $('#tx-note').value,
    amount: Number($('#tx-amount').value),
    date: $('#tx-date').value
  };
  // Validasi dasar
  if (!data.amount || data.amount <= 0) return showFormError('Jumlah harus lebih dari 0');
  try {
    if (data.id) await updateTx(data); else await addTx(data);
    dlg.close();
    await loadData();
  } catch (err) {
    showFormError(err.message);
  }
});
function showFormError(msg){
  const e = $('#form-error'); e.textContent = msg; e.hidden = false;
}

// ====== Kalkulator ======
const dlgCalc = $('#modal-calc');
$('#open-calc')?.addEventListener('click', ()=> dlgCalc.showModal());
$('#close-calc')?.addEventListener('click', ()=> dlgCalc.close());
const disp = $('#calc-display');
document.querySelectorAll('.calc-grid button').forEach(b=>{
  b.addEventListener('click', ()=>{
    const v = b.textContent;
    if (v==='C') disp.value = '0';
    else if (v==='=') {
      try { disp.value = String(eval(disp.value)); } catch { disp.value = 'Error'; }
    } else {
      disp.value = disp.value==='0' ? v : disp.value + v;
    }
  });
});

// ====== Filter Bulan ======
$('#filter-month')?.addEventListener('change', (e)=>{
  currentMonthFilter = e.target.value;
  render();
});

// ====== Boot ======
async function loadData() {
  try {
    const data = await getData();
    state = { transactions: Array.isArray(data.transactions)? data.transactions : [] };
    render();
  } catch (e) {
    alert('Gagal mengambil data: ' + e.message);
  }
}
updateAuthUI();
if (localStorage.getItem(SESSION_KEY)) loadData();
