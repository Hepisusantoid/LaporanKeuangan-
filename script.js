// =========================
//  Laporan Keuangan - Frontend (Premium + perbaikan tabs & tabel)
// =========================

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
    if (k==='class') x.className=v;
    else if (k==='text') x.textContent=v;
    else x.setAttribute(k,v);
  });
  kids.forEach(k => x.appendChild(k));
  return x;
};

const fmtIDR = (n) => (n||0).toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});

// ====== Input ribuan (titik) untuk FORM ======
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
function formatFromNumber(n){ return Math.round(n||0).toLocaleString('id-ID'); }
function attachThousandsMask(input){
  input?.addEventListener('input', ()=>{ input.value = formatThousandsInput(input.value); });
  input?.addEventListener('focus', ()=>{ if (!input.value) input.value = ''; });
}

// ====== Auth UI (stateless, multi-device) ======
function updateAuthUI() {
  const loggedIn = Boolean(localStorage.getItem(SESSION_KEY));
  $('#screen-login')?.classList.toggle('hidden', loggedIn);
  $('#screen-app')?.classList.toggle('hidden', !loggedIn);
  $('#btn-login') && ($('#btn-login').hidden = loggedIn);
  $('#btn-logout') && ($('#btn-logout').hidden = !loggedIn);
}
$('#btn-login')?.addEventListener('click', ()=> $('#screen-login').scrollIntoView({behavior:'smooth'}));
$('#do-login')?.addEventListener('click', async ()=>{
  const v = $('#pin').value.trim();
  if (!v) return alert('Masukkan PIN');
  try {
    const r = await fetch(LOGIN_API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ pin: v }) });
    const j = await r.json().catch(()=>({}));
    if (!r.ok) return alert(j.error || 'Login gagal');
    if (!j.ok)  return alert('PIN salah');
    localStorage.setItem(SESSION_KEY,'ok'); // tidak terikat device
    updateAuthUI(); loadData();
  } catch (e) { alert('Login gagal: ' + e.message); }
});
$('#btn-logout')?.addEventListener('click', ()=>{ localStorage.removeItem(SESSION_KEY); updateAuthUI(); });

// ====== Data I/O ======
async function getData() {
  const r = await fetch(API, { method:'GET' });
  let j={}; try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  if (Array.isArray(j)) return { transactions: j };
  if (Array.isArray(j?.transactions)) return j;
  return { transactions: [] };
}
async function addTx(tx) {
  const r = await fetch(API, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(tx) });
  const j = await r.json().catch(()=>({})); if (!r.ok) throw new Error(j.error||'Gagal simpan'); return j;
}
async function updateTx(tx) {
  const r = await fetch(API, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(tx) });
  const j = await r.json().catch(()=>({})); if (!r.ok) throw new Error(j.error||'Gagal update'); return j;
}
async function deleteTx(id) {
  const r = await fetch(API, { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id}) });
  const j = await r.json().catch(()=>({})); if (!r.ok) throw new Error(j.error||'Gagal hapus'); return j;
}

// ====== Helpers data ======
function computeSums(list) {
  const sumIn = list.filter(t=>t.type==='Pemasukan').reduce((a,b)=>a+b.amount,0);
  const sumOut= list.filter(t=>t.type==='Pengeluaran').reduce((a,b)=>a+b.amount,0);
  return { sumIn, sumOut, balance: sumIn - sumOut };
}
function monthKey(d){ return (d||'').slice(0,7); }
function yearKey(d){ return (d||'').slice(0,4); }
function listMonths(list){ const s = new Set(list.map(t=>monthKey(t.date))); return Array.from(s).filter(Boolean).sort().reverse(); }
function applyFilter(list){ return (currentMonthFilter==='ALL') ? list : list.filter(t=>monthKey(t.date)===currentMonthFilter); }
function toIndoMonth(ym){
  const [y,m]=ym.split('-').map(Number);
  const id=['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return `${id[m]} ${y}`;
}
function sectorLabel(v){ return v && String(v).trim() ? String(v).trim() : 'Tanpa Sektor'; }

// ====== Render Utama ======
function render(){
  const filtered = applyFilter(state.transactions).sort((a,b)=> (a.date<b.date?1:-1));
  const {sumIn,sumOut,balance} = computeSums(filtered);
  $('#sum-in').textContent = fmtIDR(sumIn);
  $('#sum-out').textContent = fmtIDR(sumOut);
  $('#sum-balance').textContent = fmtIDR(balance);

  // filter dropdown
  const months = listMonths(state.transactions);
  const sel = $('#filter-month'); if (sel){
    sel.innerHTML = '';
    sel.appendChild(el('option',{value:'ALL',text:'Semua Bulan'}));
    months.forEach(m => sel.appendChild(el('option',{value:m,text:toIndoMonth(m)})));
    sel.value = currentMonthFilter;
  }

  // table
  const tbody = $('#tbody'); if (tbody){
    tbody.innerHTML = '';
    filtered.forEach(t=>{
      const tr = el('tr',{},[
        el('td',{text: t.date}),
        el('td',{text: t.note || '-'}),
        el('td',{text: sectorLabel(t.sector)}),
        el('td',{text: t.type}),
        el('td',{class:'right', text: fmtIDR(t.amount)}),
        el('td',{},[
          btnSmall('Edit', ()=>openEdit(t)),
          document.createTextNode(' '),
          btnSmallDanger('Hapus', async ()=>{
            if (!confirm('Hapus transaksi ini?')) return;
            try { await deleteTx(t.id); await loadData(); } catch(e){ alert(e.message); }
          })
        ])
      ]);
      tbody.appendChild(tr);
    });
  }

  // charts + laporan
  updateAnalytics(filtered);
  renderReports(state.transactions); // laporan gunakan semua data supaya lengkap

  // aktifkan tombol "Lihat penuh" pada semua block tabel
  initCollapsibles();
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
  $('#tx-sector').value = '';
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
  $('#tx-sector').value = t.sector || '';
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
    sector: $('#tx-sector').value,
    amount: parseIDR($('#tx-amount').value),
    date: $('#tx-date').value
  };
  if (!data.amount || data.amount <= 0) return showFormError('Jumlah harus lebih dari 0');
  try { if (data.id) await updateTx(data); else await addTx(data); dlg.close(); await loadData(); }
  catch (err) { showFormError(err.message); }
});
function showFormError(msg){ const e=$('#form-error'); e.textContent=msg; e.hidden=false; }
attachThousandsMask($('#tx-amount'));

// ====== Kalkulator (koma ribuan + backspace) ======
const dlgCalc = $('#modal-calc');
$('#open-calc')?.addEventListener('click', ()=> dlgCalc.showModal());
$('#close-calc')?.addEventListener('click', ()=> dlgCalc.close());

const disp = $('#calc-display');
let calcExpr = "0";
function formatNumberWithCommas(nstr){
  if (!/^\-?\d+(\.\d+)?$/.test(nstr)) return nstr;
  const [i, d] = nstr.split('.');
  const withCommas = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return d ? `${withCommas}.${d}` : withCommas;
}
function humanizeExpr(expr){ return expr.replace(/(?<![A-Za-z])\-?\d+(\.\d+)?/g, m => formatNumberWithCommas(m)); }
function updateCalcDisplay(){ disp.value = humanizeExpr(calcExpr); }
function pushCalc(token){
  if (token === 'C') { calcExpr = '0'; return updateCalcDisplay(); }
  if (token === '⌫') { if (calcExpr.length <= 1) calcExpr = '0'; else calcExpr = calcExpr.slice(0,-1); return updateCalcDisplay(); }
  if (token === '=') {
    try { calcExpr = String(Function(`"use strict";return (${calcExpr})`)() ?? 0); }
    catch { calcExpr = '0'; }
    return updateCalcDisplay();
  }
  if (calcExpr === '0' && /\d/.test(token)) calcExpr = token; else calcExpr += token;
  updateCalcDisplay();
}
document.querySelectorAll('.calc-grid button').forEach(b=>{
  if (b.hasAttribute('data-clear')) { b.addEventListener('click', ()=>pushCalc('C')); return; }
  b.addEventListener('click', ()=> pushCalc(b.textContent));
});

// ====== Filter Bulan ======
$('#filter-month')?.addEventListener('change', (e)=>{ currentMonthFilter = e.target.value; render(); });

// ====== TABS: perbaikan supaya klik berfungsi ======
function initTabs(){
  document.querySelectorAll('.tabs .tab').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelectorAll('.tabs .tab').forEach(b=>b.classList.remove('active'));
      document.querySelectorAll('.tabpane').forEach(p=>p.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.getAttribute('data-target');
      const pane = document.querySelector(target);
      if (pane) pane.classList.add('active');
    });
  });
}
initTabs();

// ====== TABLE COLLAPSIBLE (lihat penuh / tutup) ======
function initCollapsibles(){
  document.querySelectorAll('.table-block').forEach(block=>{
    const btn = block.querySelector('.toggle-full'); if (!btn) return;
    const wrap = block.querySelector('.table-wrap'); if (!wrap) return;
    btn.onclick = () => {
      wrap.classList.toggle('limited');
      btn.textContent = wrap.classList.contains('limited') ? 'Lihat penuh' : 'Tutup';
    };
  });
}

// ====== Analitik (Chart.js) ======
let chartBalance, chartMonthly, chartShare, chartIncomeSector, chartExpenseSector;
let chartMonthlyIn, chartMonthlyOut, chartMonthlyBoth;

if (window.Chart) {
  Chart.defaults.color = '#e7f5ee';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.12)';
}

// plugin shadow halus
const shadowPlugin = {
  id: 'shadow',
  beforeDatasetsDraw(chart){ const { ctx } = chart; ctx.save(); ctx.shadowColor='rgba(0,0,0,.25)'; ctx.shadowBlur=12; ctx.shadowOffsetY=6; },
  afterDatasetsDraw(chart){ chart.ctx.restore(); }
};
Chart.register(shadowPlugin);

function toggleNoData(canvasId, isEmpty){
  const wrap = document.querySelector(`#${canvasId}`)?.parentElement;
  const nd = wrap?.querySelector('.nodata');
  if (!wrap || !nd) return;
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
  let run = 0; const saldoSeries = dates.map(d=> (run += byDate[d]));
  drawBalanceChart(dates, saldoSeries);

  // pemasukan vs pengeluaran per bulan + varian 3 grafik
  const byMonth = {};
  list.forEach(t=>{
    const m = monthKey(t.date);
    if (!byMonth[m]) byMonth[m] = {in:0,out:0};
    if (t.type==='Pemasukan') byMonth[m].in += t.amount; else byMonth[m].out += t.amount;
  });
  const months = Object.keys(byMonth).sort();
  const labels = months.map(toIndoMonth);
  const arrIn  = months.map(m=>byMonth[m].in);
  const arrOut = months.map(m=>byMonth[m].out);
  drawMonthlyChart(labels, arrIn, arrOut);
  drawMonthlyTri(labels, arrIn, arrOut);

  // share total + persentase
  const {sumIn, sumOut} = computeSums(list);
  drawShareChart([sumIn, sumOut]);

  // komposisi sektor
  const secIn = {}; const secOut = {};
  list.forEach(t=>{
    const s = sectorLabel(t.sector);
    if (t.type==='Pemasukan') secIn[s]=(secIn[s]||0)+t.amount; else secOut[s]=(secOut[s]||0)+t.amount;
  });
  drawSectorChart('chartIncomeSector', secIn);
  drawSectorChart('chartExpenseSector', secOut);
}

function drawBalanceChart(labels, data){
  const ctx = $('#chartBalance'); if (!ctx || !window.Chart) return;
  toggleNoData('chartBalance', labels.length===0);
  chartBalance?.destroy();
  const g = ctx.getContext('2d').createLinearGradient(0,0,0,240);
  g.addColorStop(0,'rgba(34,197,94,.35)'); g.addColorStop(1,'rgba(34,197,94,0)');
  chartBalance = new Chart(ctx, {
    type:'line',
    data:{ labels, datasets:[{ label:'Saldo kumulatif', data, tension:.25, fill:true, backgroundColor:g, borderColor:'#22c55e', pointRadius:0 }]},
    options:{ maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label:c => fmtIDR(c.parsed.y) } } }, scales:{ y:{ ticks:{ callback:v => (v).toLocaleString('id-ID') } } } }
  });
}
function drawMonthlyChart(labels, inData, outData){
  const ctx = $('#chartMonthly'); if (!ctx || !window.Chart) return;
  toggleNoData('chartMonthly', labels.length===0);
  chartMonthly?.destroy();
  chartMonthly = new Chart(ctx, {
    type:'bar',
    data:{ labels,
      datasets:[
        { label:'Pemasukan', data:inData, backgroundColor:'#22c55e', borderRadius:8, barPercentage:.6, categoryPercentage:.6 },
        { label:'Pengeluaran', data:outData, backgroundColor:'#ff6b6b', borderRadius:8, barPercentage:.6, categoryPercentage:.6 }
      ] },
    options:{ maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label:c=> `${c.dataset.label}: ${fmtIDR(c.parsed.y)}` } } }, scales:{ y:{ ticks:{ callback:v=> (v).toLocaleString('id-ID') } } } }
  });
}
function drawMonthlyTri(labels, inData, outData){
  // IN only
  const c1 = $('#chartMonthlyIn'); if (c1){
    toggleNoData('chartMonthlyIn', labels.length===0);
    chartMonthlyIn?.destroy();
    chartMonthlyIn = new Chart(c1, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Pemasukan', data:inData, backgroundColor:'#22c55e', borderRadius:8, barPercentage:.6, categoryPercentage:.6 }] },
      options:{ maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label:c=> fmtIDR(c.parsed.y) } } }, scales:{ y:{ ticks:{ callback:v=> (v).toLocaleString('id-ID') } } } }
    });
  }
  // OUT only
  const c2 = $('#chartMonthlyOut'); if (c2){
    toggleNoData('chartMonthlyOut', labels.length===0);
    chartMonthlyOut?.destroy();
    chartMonthlyOut = new Chart(c2, {
      type:'bar',
      data:{ labels, datasets:[{ label:'Pengeluaran', data:outData, backgroundColor:'#ff6b6b', borderRadius:8, barPercentage:.6, categoryPercentage:.6 }] },
      options:{ maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label:c=> fmtIDR(c.parsed.y) } } }, scales:{ y:{ ticks:{ callback:v=> (v).toLocaleString('id-ID') } } } }
    });
  }
  // BOTH (duplikasi agar 3 grafik dalam 1 ruang konsisten)
  const c3 = $('#chartMonthlyBoth'); if (c3){
    toggleNoData('chartMonthlyBoth', labels.length===0);
    chartMonthlyBoth?.destroy();
    chartMonthlyBoth = new Chart(c3, {
      type:'bar',
      data:{ labels,
        datasets:[
          { label:'In', data:inData, backgroundColor:'#22c55e', borderRadius:8, barPercentage:.6, categoryPercentage:.6 },
          { label:'Out', data:outData, backgroundColor:'#ff6b6b', borderRadius:8, barPercentage:.6, categoryPercentage:.6 }
        ]
      },
      options:{ maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label:c=> `${c.dataset.label}: ${fmtIDR(c.parsed.y)}` } }, legend:{position:'bottom'} }, scales:{ y:{ ticks:{ callback:v=> (v).toLocaleString('id-ID') } } } }
    });
  }
}

function drawShareChart(values){
  const ctx = $('#chartShare'); if (!ctx || !window.Chart) return;
  const total = (values[0]||0)+(values[1]||0);
  const perc = total>0 ? [values[0]/total*100, values[1]/total*100] : [0,0];
  toggleNoData('chartShare', total===0);
  chartShare?.destroy();
  const centerText = {
    id:'centerText',
    afterDraw(chart){
      const {ctx, chartArea:{width,height}} = chart;
      ctx.save(); ctx.fillStyle='#e7f5ee'; ctx.textAlign='center';
      ctx.font='700 16px ui-sans-serif,system-ui,Inter';
      ctx.fillText(`${perc[0].toFixed(0)}% IN / ${perc[1].toFixed(0)}% OUT`, width/2, height/2);
      ctx.restore();
    }
  };
  chartShare = new Chart(ctx, {
    type:'doughnut',
    data:{ labels:['Pemasukan','Pengeluaran'], datasets:[{ data: values, backgroundColor:['#22c55e','#ff6b6b'] }] },
    options:{ cutout:'65%', maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label:c=> `${c.label}: ${fmtIDR(c.parsed)} (${((c.parsed/total)*100||0).toFixed(1)}%)` } }, legend:{ position:'bottom' } } },
    plugins:[centerText]
  });
}
function drawSectorChart(canvasId, dict){
  const ctx = document.getElementById(canvasId); if (!ctx || !window.Chart) return;
  const labels = Object.keys(dict); const vals = labels.map(k=>dict[k]);
  const total = vals.reduce((a,b)=>a+b,0);
  toggleNoData(canvasId, labels.length===0);
  const prev = (canvasId==='chartIncomeSector') ? chartIncomeSector : chartExpenseSector;
  prev?.destroy();
  const inst = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data: vals }] },
    options:{ cutout:'55%', maintainAspectRatio:false, plugins:{ tooltip:{ callbacks:{ label:c=> `${c.label}: ${fmtIDR(c.parsed)} (${((c.parsed/total)*100||0).toFixed(1)}%)` } }, legend:{ position:'bottom' } } }
  });
  if (canvasId==='chartIncomeSector') chartIncomeSector = inst; else chartExpenseSector = inst;
}
window.addEventListener('resize', ()=>{
  chartBalance?.resize(); chartMonthly?.resize(); chartShare?.resize();
  chartIncomeSector?.resize(); chartExpenseSector?.resize();
  chartMonthlyIn?.resize(); chartMonthlyOut?.resize(); chartMonthlyBoth?.resize();
});

// ====== Laporan (harian/mingguan/bulanan/tahunan) ======
function renderReports(all){
  const gDaily = groupBy(all, t=>t.date);
  const gWeekly= groupBy(all, t=>isoWeekKey(t.date));
  const gMonthly= groupBy(all, t=>monthKey(t.date));
  const gYearly = groupBy(all, t=>yearKey(t.date));

  fillReport('#tb-harian', sortKeys(gDaily).slice(-30), (k)=>k);
  fillReport('#tb-mingguan', sortKeys(gWeekly).slice(-20), (k)=>k);
  fillReport('#tb-bulanan', sortKeys(gMonthly).slice(-24), (k)=>toIndoMonth(k));
  fillReport('#tb-tahunan', sortKeys(gYearly), (k)=>k);
}
function groupBy(list, keyFn){
  const map = {};
  list.forEach(t=>{
    const k = keyFn(t);
    if (!map[k]) map[k] = {in:0,out:0};
    if (t.type==='Pemasukan') map[k].in += t.amount; else map[k].out += t.amount;
  });
  return map;
}
function sortKeys(map){
  return Object.keys(map).sort((a,b)=> a<b?-1:1).map(k=>({ key:k, ...map[k] }));
}
function fillReport(tbodySel, rows, labeler){
  const tb = $(tbodySel); if (!tb) return; tb.innerHTML='';
  rows.forEach(r=>{
    const tr = el('tr',{},[
      el('td',{text: labeler(r.key)}),
      el('td',{class:'right', text: fmtIDR(r.in)}),
      el('td',{class:'right', text: fmtIDR(r.out)}),
      el('td',{class:'right', text: fmtIDR(r.in - r.out)}),
    ]);
    tb.appendChild(tr);
  });
}

// ====== Week util ======
function isoWeekKey(dateStr){
  const d = new Date(dateStr+"T00:00:00");
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const th = new Date(d); th.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(th.getUTCFullYear(),0,4));
  const week = 1 + Math.round(((th - firstThu) / 86400000 - 3) / 7);
  return `${th.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}

// ====== Boot ======
async function loadData() {
  try { const data = await getData();
    state = { transactions: Array.isArray(data.transactions)? data.transactions : [] };
    render();
  } catch (e) { alert('Gagal mengambil data: ' + e.message); }
}
updateAuthUI();
if (localStorage.getItem(SESSION_KEY)) loadData();
