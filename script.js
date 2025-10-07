// ====== Konfigurasi ======
const API = '/api/transactions';
const LOGIN_API = '/api/login';
const SESSION_KEY = 'lapkeu_session';

// ====== State ======
let state = { transactions: [] };
let currentMonthFilter = 'ALL';
let reportPeriod = 'monthly'; // default tab

// ====== Helper DOM/Format ======
const $ = (sel) => document.querySelector(sel);
const el = (tag, attrs={}, kids=[]) => {
  const x = document.createElement(tag);
  Object.entries(attrs).forEach(([k,v])=>{
    if (k==='class') x.className=v; else if (k==='text') x.textContent=v; else x.setAttribute(k,v);
  });
  kids.forEach(k=>x.appendChild(k));
  return x;
};
const fmtIDR = (n) => (n||0).toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});

// ==== Format ribuan saat mengetik ====
function parseIDR(str){
  if (!str) return 0;
  const cleaned = String(str).replace(/\./g,'').replace(',', '.').replace(/[^\d.]/g,'');
  const n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}
function formatThousandsInput(str){
  str = String(str||'').replace(/[^\d,]/g,'');
  const parts = str.split(',');
  let int = parts[0].replace(/^0+(?=\d)/,'');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g,'.');
  return parts.length>1 ? `${int},${parts[1].slice(0,2)}` : int;
}
function formatFromNumber(n){ return Math.round(n).toLocaleString('id-ID'); }
function attachThousandsMask(input){
  input.addEventListener('input', ()=>{ input.value = formatThousandsInput(input.value); });
  input.addEventListener('focus', ()=>{ if (!input.value) input.value = ''; });
}

// ====== Auth UI ======
function updateAuthUI(){
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
  try{
    const r = await fetch(LOGIN_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:v})});
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return alert(j.error || 'Login gagal');
    if (!j.ok) return alert('PIN salah');
    localStorage.setItem(SESSION_KEY,'ok');
    updateAuthUI(); loadData();
  }catch(e){ alert('Login gagal: '+e.message); }
});
$('#btn-logout')?.addEventListener('click', ()=>{ localStorage.removeItem(SESSION_KEY); updateAuthUI(); });

// ====== Data I/O ======
async function getData(){
  const r = await fetch(API, {method:'GET'});
  let j = {};
  try{ j = await r.json(); }catch{}
  if (!r.ok) throw new Error((j && j.error) ? j.error : `HTTP ${r.status}`);
  return j;
}
async function addTx(tx){
  const r = await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(tx)});
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || 'Gagal simpan');
  return j;
}
async function updateTx(tx){
  const r = await fetch(API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(tx)});
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || 'Gagal update');
  return j;
}
async function deleteTx(id){
  const r = await fetch(API,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})});
  const j = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(j.error || 'Gagal hapus');
  return j;
}

// ====== Helpers tanggal & agregasi ======
function computeSums(list){
  const sumIn = list.filter(t=>t.type==='Pemasukan').reduce((a,b)=>a+b.amount,0);
  const sumOut= list.filter(t=>t.type==='Pengeluaran').reduce((a,b)=>a+b.amount,0);
  return { sumIn, sumOut, balance: sumIn - sumOut };
}
function monthKey(d){ return (d||'').slice(0,7); }
function yearKey(d){ return (d||'').slice(0,4); }
function listMonths(list){ const s=new Set(list.map(t=>monthKey(t.date))); return Array.from(s).filter(Boolean).sort().reverse(); }
function applyFilter(list){ return (currentMonthFilter==='ALL') ? list : list.filter(t=>monthKey(t.date)===currentMonthFilter); }
function toIndoMonth(ym){
  const [y,m]=ym.split('-').map(Number);
  const id=['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${id[m]} ${y}`;
}
function toIndoDay(ymd){ // 2025-10-07 -> 07 Okt
  const [y,m,d] = ymd.split('-').map(Number);
  const id = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  return `${String(d).padStart(2,'0')} ${id[m-1]}`;
}
function isoWeek(dStr){ // {year,week}
  const d = new Date(dStr);
  const day = (d.getDay()+6)%7; // Senin=0
  d.setDate(d.getDate()-day+3); // Kamis pekan itu
  const thursday = new Date(d.getFullYear(),0,4);
  const diff = (d - thursday)/86400000;
  const week = 1 + Math.floor(diff/7);
  return { year: d.getFullYear(), week };
}
function weekKey(dStr){
  const {year,week} = isoWeek(dStr);
  return `${year}-W${String(week).padStart(2,'0')}`;
}
function labelForPeriodKey(period, key){
  if (period==='daily')   return toIndoDay(key);
  if (period==='weekly')  { const [y,w]=key.split('-W'); return `Pekan ${Number(w)} ${y}`; }
  if (period==='monthly') return toIndoMonth(key);
  if (period==='yearly')  return key;
  return key;
}
function groupByPeriod(list, period){
  const bucket = {};
  list.forEach(t=>{
    const k = period==='daily' ? t.date :
              period==='weekly' ? weekKey(t.date) :
              period==='monthly'? monthKey(t.date) : yearKey(t.date);
    if (!bucket[k]) bucket[k] = {in:0,out:0};
    if (t.type==='Pemasukan') bucket[k].in += t.amount;
    else bucket[k].out += t.amount;
  });
  const keys = Object.keys(bucket).sort();
  const labels = keys.map(k => labelForPeriodKey(period,k));
  const ins = keys.map(k=>bucket[k].in);
  const outs= keys.map(k=>bucket[k].out);
  return { labels, ins, outs, keys };
}

// ====== Kategori komposisi dari "keterangan" ======
const CATEGORY_RULES = {
  pemasukan: [
    {name:'Gaji', kw:['gaji','salary','upah']},
    {name:'Penjualan', kw:['jual','penjualan','order','invoice','nota']},
    {name:'Transfer', kw:['transfer','tf','kirim']},
    {name:'Bunga/Bonus', kw:['bunga','bonus','cashback','insentif']},
    {name:'Lainnya', kw:[]}
  ],
  pengeluaran: [
    {name:'Makanan & Minuman', kw:['makan','minum','warung','resto','kopi','snack','mie','nasi']},
    {name:'Transportasi', kw:['bbm','bensin','pertalite','grab','gojek','bus','parkir','tol','angkot','ojek']},
    {name:'Tagihan & Utilitas', kw:['listrik','token','air','pdam','wifi','indihome','pulsa','paket','telkom','pln']},
    {name:'Belanja & Rumah Tangga', kw:['belanja','market','indomaret','alfamart','pasar','sabun','beras','alat']},
    {name:'Kesehatan', kw:['obat','klinik','dokter','bpjs']},
    {name:'Pendidikan', kw:['sekolah','spp','les','buku']},
    {name:'Operasional', kw:['operasional','maintenance','servis','service','perbaikan','sewa','kontrak']},
    {name:'Hiburan', kw:['nonton','game','netflix','spotify']},
    {name:'Lainnya', kw:[]}
  ]
};
function findCategory(type, note){
  const low = (note||'').toLowerCase();
  const rules = (type==='Pemasukan') ? CATEGORY_RULES.pemasukan : CATEGORY_RULES.pengeluaran;
  for (const r of rules){
    if (r.kw.some(k=> low.includes(k))) return r.name;
  }
  return 'Lainnya';
}
function buildComposition(list){
  const income = {}, expense = {};
  list.forEach(t=>{
    const cat = findCategory(t.type, t.note);
    if (t.type==='Pemasukan') income[cat]=(income[cat]||0)+t.amount;
    else expense[cat]=(expense[cat]||0)+t.amount;
  });
  return { income, expense };
}

// ====== Render ======
function render(){
  const filtered = applyFilter(state.transactions).sort((a,b)=> (a.date<b.date?1:-1));
  const {sumIn,sumOut,balance} = computeSums(filtered);
  $('#sum-in').textContent = fmtIDR(sumIn);
  $('#sum-out').textContent = fmtIDR(sumOut);
  $('#sum-balance').textContent = fmtIDR(balance);

  // filter dropdown
  const months = listMonths(state.transactions);
  const sel = $('#filter-month'); sel.innerHTML = '';
  sel.appendChild(el('option',{value:'ALL',text:'Semua Bulan'}));
  months.forEach(m=> sel.appendChild(el('option',{value:m,text:toIndoMonth(m)})));
  sel.value = currentMonthFilter;

  // table riwayat
  const tbody = $('#tbody'); tbody.innerHTML = '';
  filtered.forEach(t=>{
    const tr = el('tr',{},[
      el('td',{text:t.date}),
      el('td',{text:t.note||'-'}),
      el('td',{text:t.type}),
      el('td',{class:'right',text:fmtIDR(t.amount)}),
      el('td',{},[
        btnSmall('Edit', ()=>openEdit(t)),
        document.createTextNode(' '),
        btnSmallDanger('Hapus', async ()=>{
          if (!confirm('Hapus transaksi ini?')) return;
          try{ await deleteTx(t.id); await loadData(); }catch(e){ alert(e.message); }
        })
      ])
    ]);
    tbody.appendChild(tr);
  });

  // analisis ringkas
  updateAnalytics(filtered);

  // laporan periodik
  updateReport(filtered);

  // komposisi kategori
  updateComposition(filtered);
}
function btnSmall(txt, fn){ const b=el('button',{class:'btn',text:txt}); b.addEventListener('click',fn); return b;}
function btnSmallDanger(txt, fn){ const b=el('button',{class:'btn danger',text:txt}); b.addEventListener('click',fn); return b;}

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
  $('#tx-amount').value = formatFromNumber(t.amount);
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
    amount: parseIDR($('#tx-amount').value),
    date: $('#tx-date').value
  };
  if (!data.amount || data.amount <= 0) return showFormError('Jumlah harus lebih dari 0');
  try{
    if (data.id) await updateTx(data); else await addTx(data);
    dlg.close(); await loadData();
  }catch(err){ showFormError(err.message); }
});
function showFormError(msg){ const e=$('#form-error'); e.textContent=msg; e.hidden=false; }
attachThousandsMask($('#tx-amount'));

// ====== Kalkulator ======
const dlgCalc = $('#modal-calc');
$('#open-calc')?.addEventListener('click', ()=> dlgCalc.showModal());
$('#close-calc')?.addEventListener('click', ()=> dlgCalc.close());
const disp = $('#calc-display');
document.querySelectorAll('.calc-grid button').forEach(b=>{
  b.addEventListener('click', ()=>{
    const v = b.textContent;
    if (v==='C') disp.value='0';
    else if (v==='='){ try{ disp.value=String(eval(disp.value)); }catch{ disp.value='Error'; } }
    else { disp.value = disp.value==='0'? v : disp.value+v; }
  });
});

// ====== Filter Bulan + Tabs ======
$('#filter-month')?.addEventListener('change', e=>{ currentMonthFilter=e.target.value; render(); });
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    reportPeriod = btn.getAttribute('data-period');
    updateReport(applyFilter(state.transactions));
  });
});

// ====== Charts (ringkas) ======
let chartBalance, chartMonthly, chartShare, chartReport, chartIncomeComp, chartExpenseComp;
Chart.defaults.color = '#e7f5ee';
Chart.defaults.borderColor = 'rgba(255,255,255,0.12)';

function toggleNoData(canvasId, isEmpty){
  const wrap = document.querySelector(`#${canvasId}`).parentElement;
  const nd = wrap.querySelector('.nodata');
  if (isEmpty) nd.classList.remove('hidden'); else nd.classList.add('hidden');
}

function updateAnalytics(list){
  // saldo kumulatif
  const byDate = {};
  list.forEach(t=>{
    const key = t.date;
    const delta = (t.type==='Pemasukan'? +t.amount : -t.amount);
    byDate[key] = (byDate[key]||0) + delta;
  });
  const dates = Object.keys(byDate).sort();
  let run=0; const saldoSeries = dates.map(d=> (run += byDate[d]));
  drawBalanceChart(dates, saldoSeries);

  // per bulan
  const byMonth = {};
  list.forEach(t=>{
    const m = monthKey(t.date);
    if (!byMonth[m]) byMonth[m] = {in:0,out:0};
    if (t.type==='Pemasukan') byMonth[m].in += t.amount; else byMonth[m].out += t.amount;
  });
  const months = Object.keys(byMonth).sort();
  drawMonthlyChart(months.map(toIndoMonth), months.map(m=>byMonth[m].in), months.map(m=>byMonth[m].out));

  // share total
  const {sumIn,sumOut} = computeSums(list);
  drawShareChart([sumIn,sumOut]);
}
function drawBalanceChart(labels, data){
  const ctx = $('#chartBalance');
  toggleNoData('chartBalance', labels.length===0);
  chartBalance?.destroy();
  chartBalance = new Chart(ctx,{
    type:'line',
    data:{labels, datasets:[{label:'Saldo kumulatif', data, tension:.25, fill:true, backgroundColor:'rgba(34,197,94,.15)', borderColor:'#22c55e', pointRadius:0}]},
    options:{ maintainAspectRatio:false, plugins:{tooltip:{callbacks:{label:c=>fmtIDR(c.parsed.y)}}}, scales:{y:{ticks:{callback:v=>(v).toLocaleString('id-ID')}}} }
  });
}
function drawMonthlyChart(labels, inData, outData){
  const ctx = $('#chartMonthly');
  toggleNoData('chartMonthly', labels.length===0);
  chartMonthly?.destroy();
  chartMonthly = new Chart(ctx,{
    type:'bar',
    data:{labels, datasets:[
      {label:'Pemasukan', data:inData, backgroundColor:'#22c55e'},
      {label:'Pengeluaran', data:outData, backgroundColor:'#ff6b6b'}
    ]},
    options:{ maintainAspectRatio:false, plugins:{tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmtIDR(c.parsed.y)}`}}}, scales:{y:{ticks:{callback:v=>(v).toLocaleString('id-ID')}}} }
  });
}
function drawShareChart(values){
  const ctx = $('#chartShare');
  const empty = (values[0]||0)+(values[1]||0)===0;
  toggleNoData('chartShare', empty);
  chartShare?.destroy();
  chartShare = new Chart(ctx,{
    type:'doughnut',
    data:{labels:['Pemasukan','Pengeluaran'], datasets:[{data:values, backgroundColor:['#22c55e','#ff6b6b']}]},
    options:{ maintainAspectRatio:false, plugins:{tooltip:{callbacks:{label:c=>`${c.label}: ${fmtIDR(c.parsed)}`}}} }
  });
}

// ====== Laporan periodik (harian/mingguan/bulanan/tahunan) ======
function updateReport(list){
  const g = groupByPeriod(list, reportPeriod);
  toggleNoData('chartReport', g.labels.length===0
