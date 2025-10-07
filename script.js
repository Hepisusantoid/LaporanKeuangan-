// ====== Konfigurasi ======
const API = '/api/transactions';
const LOGIN_API = '/api/login';
const SESSION_KEY = 'lapkeu_session';

// ====== State ======
let state = { transactions: [] };
let currentMonthFilter = 'ALL';

// ====== Helper DOM/Format ======
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs={}, kids=[]) => {
  const x = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v]) => {
    if (k==='class') x.className=v; else if (k==='text') x.textContent=v; else x.setAttribute(k,v);
  });
  kids.forEach(k => x.appendChild(k));
  return x;
};
const fmtIDR = (n) => (n||0).toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});

// ==== Format ribuan saat mengetik (titik) ====
// "12.345,67" -> 12345.67 (Number)
function parseIDR(str){
  if (!str) return 0;
  const cleaned = String(str).replace(/\./g,'').replace(',', '.').replace(/[^\d.]/g,'');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}
// "12345.67" -> "12.345,67" (string)
function formatThousandsInput(str){
  str = String(str||'').replace(/[^\d,]/g,''); // hanya angka & koma
  const parts = str.split(',');
  let int = parts[0].replace(/^0+(?=\d)/,'');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return parts.length>1 ? `${int},${parts[1].slice(0,2)}` : int;
}
function formatFromNumber(n){
  // tampilkan 0 desimal (sesuai tampilan IDR di app)
  return Math.round(n).toLocaleString('id-ID');
}
function attachThousandsMask(input){
  input.addEventListener('input', ()=>{
    const v = input.value;
    input.value = formatThousandsInput(v);
  });
  input.addEventListener('focus', ()=> {
    if (!input.value) input.value = '';
  });
}

// ====== Auth UI ======
function updateAuthUI() {
  const loggedIn = Boolean(localStorage.getItem(SESSION_KEY));
  $('#screen-login').classList.toggle('hidden', loggedIn);
  $('#screen-app').classList.toggle('hidden', !loggedIn);
  $('#btn-login').hidden = loggedIn;
  $('#btn-logout').hidden = !loggedIn;
}
$('#btn-login')?.addEventListener('click', ()=> $('#screen-login').scrollIntoView({behavior:'smooth'}));
$('#do-login')?.addEventListener('click', async ()=>{
  const v = $('#pin').value.trim();
  if (v.length < 4) return alert('PIN minimal 4 digit');
  try {
    const r = await fetch(LOGIN_API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pin: v }) });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return alert(j.error || 'Login gagal');
    if (!j.ok) return alert('PIN salah');
    localStorage.setItem(SESSION_KEY,'ok');
    updateAuthUI();
    loadData();
  } catch (e) { alert('Login gagal: ' + e.message); }
});
$('#btn-logout')?.addEventListener('click', ()=>{
  localStorage.removeItem(SESSION_KEY);
  updateAuthUI();
});

// ====== Data I/O ======
async function getData() {
  const r = await fetch(API, { method:'GET' });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) {
    const msg = (j && j.error) ? j.error : `HTTP ${r.status}`;
    throw new Error(msg);
  }
  return j;
}
async function addTx(tx) {
  const r = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(tx) });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || 'Gagal simpan');
  return j;
}
async function updateTx(tx) {
  const r = await fetch(API, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(tx) });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || 'Gagal update');
  return j;
}
async function deleteTx(id) {
  const r = await fetch(API, { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id}) });
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || 'Gagal hapus');
  return j;
}

// ====== Render ======
function computeSums(list) {
  const sumIn = list.filter(t=>t.type==='Pemasukan').reduce((a,b)=>a+b.amount,0);
  const sumOut= list.filter(t=>t.type==='Pengeluaran').reduce((a,b)=>a+b.amount,0);
  return { sumIn, sumOut, balance: sumIn - sumOut };
}
function monthKey(d){ return (d||'').slice(0,7); }
function listMonths(list){
  const s = new Set(list.map(t=>monthKey(t.date)));
  return Array.from(s).filter(Boolean).sort().reverse();
}
function applyFilter(list){
  if (currentMonthFilter==='ALL') return list;
  return list.filter(t=>monthKey(t.date)===currentMonthFilter);
}
function render(){
  const filtered = applyFilter(state.transactions).sort((a,b)=> (a.date<b.date?1:-1));
  const {sumIn,sumOut,balance} = computeSums(filtered);
  $('#sum-in').textContent = fmtIDR(sumIn);
  $('#sum-out').textContent = fmtIDR(sumOut);
  $('#sum-balance').textContent = fmtIDR(balance);

  // filter dropdown
  const months = listMonths(state.transactions);
  const sel = $('#filter-month');
  sel.innerHTML = '';
  sel.appendChild(el('option',{value:'ALL',text:'Semua Bulan'}));
  months.forEach(m => sel.appendChild(el('option',{value:m,text:toIndoMonth(m)})));
  sel.value = currentMonthFilter;

  // table
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
        document.createTextNode(' '),
        btnSmallDanger('Hapus', async ()=>{
          if (!confirm('Hapus transaksi ini?')) return;
          try { await deleteTx(t.id); await loadData(); }
          catch(e){ alert(e.message); }
        })
      ])
    ]);
    tbody.appendChild(tr);
  });

  // charts + summary
  updateAnalytics(filtered);
}
function btnSmall(txt, fn){ const b=el('button',{class:'btn',text:txt}); b.addEventListener('click',fn); return b;}
function btnSmallDanger(txt, fn){ const b=el('button',{class:'btn danger',text:txt}); b.addEventListener('click',fn); return b;}
function toIndoMonth(ym){
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

function openEdit(t){
  $('#modal-title').textContent = 'Edit Transaksi';
  $('#tx-id').value = t.id;
  $('#tx-type').value = t.type;
  $('#tx-note').value = t.note || '';
  $('#tx-amount').value = formatFromNumber(t.amount); // tampil ribuan
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
    amount: parseIDR($('#tx-amount').value), // pastikan angka bersih
    date: $('#tx-date').value
  };
  if (!data.amount || data.amount <= 0) return showFormError('Jumlah harus lebih dari 0');
  try {
    if (data.id) await updateTx(data); else await addTx(data);
    dlg.close();
    await loadData();
  } catch (err) { showFormError(err.message); }
});
function showFormError(msg){ const e=$('#form-error'); e.textContent=msg; e.hidden=false; }

// aktifkan masker ribuan untuk semua input.berclass=thousands
attachThousandsMask($('#tx-amount'));

// ====== Kalkulator ======
const dlgCalc = $('#modal-calc');
$('#open-calc')?.addEventListener('click', ()=> dlgCalc.showModal());
$('#close-calc')?.addEventListener('click', ()=> dlgCalc.close());
const disp = $('#calc-display');
document.querySelectorAll('.calc-grid button').forEach(b=>{
  b.addEventListener('click', ()=>{
    const v = b.textContent;
    if (v==='C') disp.value = '0';
    else if (v==='=') { try { disp.value = String(eval(disp.value)); } catch { disp.value = 'Error'; } }
    else { disp.value = disp.value==='0' ? v : disp.value + v; }
  });
});

// ====== Filter Bulan ======
$('#filter-month')?.addEventListener('change', (e)=>{
  currentMonthFilter = e.target.value;
  render();
});

// ====== Analitik (Chart.js) ======
let chartBalance, chartMonthly, chartShare;
Chart.defaults.color = '#e7f5ee';
Chart.defaults.borderColor = 'rgba(255,255,255,0.12)';

function updateAnalytics(list){
  // --- saldo kumulatif per hari ---
  const byDate = {};
  list.forEach(t=>{
    const key = t.date;
    const delta = (t.type==='Pemasukan'? +t.amount : -t.amount);
    byDate[key] = (byDate[key]||0) + delta;
  });
  const dates = Object.keys(byDate).sort();
  let run = 0;
  const saldoSeries = dates.map(d=> (run += byDate[d]));
  drawBalanceChart(dates, saldoSeries);

  // --- pemasukan vs pengeluaran per bulan (pakai semua transaksi, bukan cuma filter? -> sesuai filter) ---
  const byMonth = {};
  list.forEach(t=>{
    const m = monthKey(t.date);
    if (!byMonth[m]) byMonth[m] = {in:0,out:0};
    if (t.type==='Pemasukan') byMonth[m].in += t.amount; else byMonth[m].out += t.amount;
  });
  const months = Object.keys(byMonth).sort();
  const ins = months.map(m=>byMonth[m].in);
  const outs= months.map(m=>byMonth[m].out);
  drawMonthlyChart(months.map(toIndoMonth), ins, outs);

  // --- share total ---
  const {sumIn, sumOut} = computeSums(list);
  drawShareChart([sumIn, sumOut]);

  // --- ringkasan tabel ---
  const tbody = $('#summary-body');
  tbody.innerHTML = '';
  months.forEach(m=>{
    const pemasukan = byMonth[m].in, pengeluaran = byMonth[m].out, saldo = pemasukan - pengeluaran;
    const tr = el('tr',{},[
      el('td',{text: toIndoMonth(m)}),
      el('td',{class:'right', text: fmtIDR(pemasukan)}),
      el('td',{class:'right', text: fmtIDR(pengeluaran)}),
      el('td',{class:'right', text: fmtIDR(saldo)}),
    ]);
    tbody.appendChild(tr);
  });
}

function drawBalanceChart(labels, data){
  const ctx = $('#chartBalance');
  chartBalance?.destroy();
  chartBalance = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{
      label:'Saldo kumulatif',
      data,
      tension:.25,
      fill:true,
      backgroundColor:'rgba(34,197,94,.15)',
      borderColor:'#22c55e',
      pointRadius:0
    }]},
    options:{
      plugins:{ tooltip:{ callbacks:{ label: c=> fmtIDR(c.parsed.y) } } },
      scales:{ y:{ ticks:{ callback:v=> (v).toLocaleString('id-ID') } } }
    }
  });
}
function drawMonthlyChart(labels, inData, outData){
  const ctx = $('#chartMonthly');
  chartMonthly?.destroy();
  chartMonthly = new Chart(ctx, {
    type:'bar',
    data:{
      labels,
      datasets:[
        { label:'Pemasukan', data:inData, backgroundColor:'#22c55e' },
        { label:'Pengeluaran', data:outData, backgroundColor:'#ff6b6b' }
      ]
    },
    options:{
      responsive:true,
      plugins:{ tooltip:{ callbacks:{ label:c=> `${c.dataset.label}: ${fmtIDR(c.parsed.y)}` } } },
      scales:{ y:{ ticks:{ callback:v=> (v).toLocaleString('id-ID') } } }
    }
  });
}
function drawShareChart(values){
  const ctx = $('#chartShare');
  chartShare?.destroy();
  chartShare = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:['Pemasukan','Pengeluaran'], datasets:[{ data:values, backgroundColor:['#22c55e','#ff6b6b'] }] },
    options:{ plugins:{ tooltip:{ callbacks:{ label:c=> `${c.label}: ${fmtIDR(c.parsed)}` } } } }
  });
}

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
