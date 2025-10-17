// ====== Konfigurasi ======
const API = '/api/transactions';
const LOGIN_API = '/api/login';
const SESSION_KEY = 'lapkeu_session';

// ====== State ======
let state = { transactions: [] };
let currentMonthFilter = 'ALL';

// ====== Helper ======
const $ = (s)=>document.querySelector(s);
const el=(t,a={},k=[])=>{const x=document.createElement(t);Object.entries(a).forEach(([k2,v])=>{if(k2==='class')x.className=v;else if(k2==='text')x.textContent=v;else x.setAttribute(k2,v);});k.forEach(n=>x.appendChild(n));return x;};
const fmtIDR = n => (n||0).toLocaleString('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0});

// Format ribuan input
function parseIDR(str){ if(!str) return 0; const c=String(str).replace(/\./g,'').replace(',', '.').replace(/[^\d.]/g,''); const n=Number(c); return isNaN(n)?0:n; }
function formatThousandsInput(s){ s=String(s||'').replace(/[^\d,]/g,''); const p=s.split(','); let i=p[0].replace(/^0+(?=\d)/,''); i=i.replace(/\B(?=(\d{3})+(?!\d))/g,'.'); return p.length>1?`${i},${p[1].slice(0,2)}`:i; }
function formatFromNumber(n){ return Math.round(n||0).toLocaleString('id-ID'); }
function attachThousandsMask(inp){ inp?.addEventListener('input',()=>{inp.value=formatThousandsInput(inp.value)}); }

// ====== Auth ======
function updateAuthUI(){ const on=!!localStorage.getItem(SESSION_KEY); $('#screen-login')?.classList.toggle('hidden',on); $('#screen-app')?.classList.toggle('hidden',!on); if($('#btn-login')) $('#btn-login').hidden=on; if($('#btn-logout')) $('#btn-logout').hidden=!on; }
$('#btn-login')?.addEventListener('click',()=>$('#screen-login').scrollIntoView({behavior:'smooth'}));
$('#do-login')?.addEventListener('click',async ()=>{
  const pin=$('#pin').value.trim(); if(!pin) return alert('Masukkan PIN');
  try{ const r=await fetch(LOGIN_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin})}); const j=await r.json().catch(()=>({})); if(!r.ok) return alert(j.error||'Login gagal'); if(!j.ok) return alert('PIN salah'); localStorage.setItem(SESSION_KEY,'ok'); updateAuthUI(); loadData(); }catch(e){ alert('Login gagal: '+e.message); }
});
$('#btn-logout')?.addEventListener('click',()=>{localStorage.removeItem(SESSION_KEY); updateAuthUI();});

// ====== API ======
async function getData(){ const r=await fetch(API); let j={}; try{j=await r.json()}catch{} if(!r.ok) throw new Error(j?.error||`HTTP ${r.status}`); if(Array.isArray(j)) return {transactions:j}; if(Array.isArray(j?.transactions)) return j; return {transactions:[]}; }
async function addTx(tx){ const r=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(tx)}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Gagal simpan'); return j; }
async function updateTx(tx){ const r=await fetch(API,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(tx)}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Gagal update'); return j; }
async function deleteTx(id){ const r=await fetch(API,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error(j.error||'Gagal hapus'); return j; }

// ====== Data util ======
function computeSums(list){ const inSum=list.filter(t=>t.type==='Pemasukan').reduce((a,b)=>a+b.amount,0); const outSum=list.filter(t=>t.type==='Pengeluaran').reduce((a,b)=>a+b.amount,0); return {sumIn:inSum,sumOut:outSum,balance:inSum-outSum}; }
const monthKey=d=>(d||'').slice(0,7); const yearKey=d=>(d||'').slice(0,4);
function listMonths(list){ const s=new Set(list.map(t=>monthKey(t.date))); return Array.from(s).filter(Boolean).sort().reverse(); }
function applyFilter(list){ return currentMonthFilter==='ALL'? list : list.filter(t=>monthKey(t.date)===currentMonthFilter); }
function toIndoMonth(ym){ const [y,m]=ym.split('-').map(Number); const id=['','Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']; return `${id[m]} ${y}`; }
const sectorLabel=v=>(v&&String(v).trim())?String(v).trim():'Tanpa Sektor';

// ====== Render ======
function render(){
  const dataFiltered=applyFilter(state.transactions).sort((a,b)=>a.date<b.date?1:-1);
  const {sumIn,sumOut,balance}=computeSums(dataFiltered);
  $('#sum-in').textContent=fmtIDR(sumIn); $('#sum-out').textContent=fmtIDR(sumOut); $('#sum-balance').textContent=fmtIDR(balance);

  const months=listMonths(state.transactions); const sel=$('#filter-month'); if(sel){ sel.innerHTML=''; sel.appendChild(el('option',{value:'ALL',text:'Semua Bulan'})); months.forEach(m=>sel.appendChild(el('option',{value:m,text:toIndoMonth(m)}))); sel.value=currentMonthFilter; }

  const tbody=$('#tbody'); if(tbody){ tbody.innerHTML=''; dataFiltered.forEach(t=>{ const tr=el('tr',{},[
      el('td',{text:t.date}), el('td',{text:t.note||'-'}), el('td',{text:sectorLabel(t.sector)}),
      el('td',{text:t.type}), el('td',{class:'right',text:fmtIDR(t.amount)}),
      el('td',{},[ smallBtn('Edit',()=>openEdit(t)), document.createTextNode(' '), smallDanger('Hapus',async()=>{ if(!confirm('Hapus transaksi ini?')) return; try{ await deleteTx(t.id); await loadData(); }catch(e){ alert(e.message); } }) ])
    ]); tbody.appendChild(tr); }); }

  updateAnalytics(dataFiltered);
  renderReports(state.transactions);
  initCollapsibles();
}
function smallBtn(t,fn){ const b=el('button',{class:'btn',text:t}); b.addEventListener('click',fn); return b; }
function smallDanger(t,fn){ const b=el('button',{class:'btn danger',text:t}); b.addEventListener('click',fn); return b; }

// ====== Modal ======
const dlg=$('#modal-tx');
$('#open-add')?.addEventListener('click',()=>{ $('#modal-title').textContent='Tambah Transaksi Baru'; $('#tx-id').value=''; $('#tx-type').value='Pemasukan'; $('#tx-note').value=''; $('#tx-sector').value=''; $('#tx-amount').value=''; $('#tx-date').valueAsDate=new Date(); $('#form-error').hidden=true; dlg.showModal(); });
$('#btn-cancel')?.addEventListener('click',()=>dlg.close());

function openEdit(t){ $('#modal-title').textContent='Edit Transaksi'; $('#tx-id').value=t.id; $('#tx-type').value=t.type; $('#tx-note').value=t.note||''; $('#tx-sector').value=t.sector||''; $('#tx-amount').value=formatFromNumber(t.amount); $('#tx-date').value=t.date; $('#form-error').hidden=true; dlg.showModal(); }

$('#form-tx')?.addEventListener('submit',async (e)=>{ e.preventDefault(); const data={
    id:$('#tx-id').value||undefined, type:$('#tx-type').value, note:$('#tx-note').value,
    sector:$('#tx-sector').value, amount:parseIDR($('#tx-amount').value), date:$('#tx-date').value
  }; if(!data.amount||data.amount<=0) return showFormError('Jumlah harus lebih dari 0');
  try{ if(data.id) await updateTx(data); else await addTx(data); dlg.close(); await loadData(); }catch(err){ showFormError(err.message); }
});
function showFormError(m){ const e=$('#form-error'); e.textContent=m; e.hidden=false; }
attachThousandsMask($('#tx-amount'));

// ====== Kalkulator ======
const dlgCalc=$('#modal-calc'); $('#open-calc')?.addEventListener('click',()=>dlgCalc.showModal()); $('#close-calc')?.addEventListener('click',()=>dlgCalc.close());
const disp=$('#calc-display'); let calcExpr="0";
function fmtComma(n){ if(!/^\-?\d+(\.\d+)?$/.test(n))return n; const [i,d]=n.split('.'); const t=i.replace(/\B(?=(\d{3})+(?!\d))/g,','); return d?`${t}.${d}`:t; }
const human=(e)=>e.replace(/(?<![A-Za-z])\-?\d+(\.\d+)?/g,m=>fmtComma(m));
const upd=()=>disp.value=human(calcExpr);
function pushCalc(tok){ if(tok==='C'){calcExpr='0'; return upd()} if(tok==='⌫'){ calcExpr=calcExpr.length<=1?'0':calcExpr.slice(0,-1); return upd()} if(tok==='='){ try{ calcExpr=String(Function(`"use strict";return (${calcExpr})`)()??0); }catch{ calcExpr='0'; } return upd(); } if(calcExpr==='0'&&/\d/.test(tok)) calcExpr=tok; else calcExpr+=tok; upd(); }
document.querySelectorAll('.calc-grid button').forEach(b=>{ if(b.hasAttribute('data-clear')) b.addEventListener('click',()=>pushCalc('C')); else b.addEventListener('click',()=>pushCalc(b.textContent)); });

// ====== Filter Bulan ======
$('#filter-month')?.addEventListener('change',e=>{ currentMonthFilter=e.target.value; render(); });

// ====== Tabs ======
function initTabs(){ document.querySelectorAll('.tabs .tab').forEach(btn=>{ btn.addEventListener('click',()=>{ document.querySelectorAll('.tabs .tab').forEach(b=>b.classList.remove('active')); document.querySelectorAll('.tabpane').forEach(p=>p.classList.remove('active')); btn.classList.add('active'); const pane=document.querySelector(btn.dataset.target); pane&&pane.classList.add('active'); }); }); }
initTabs();

// ====== Collapsible tables ======
function initCollapsibles(){ document.querySelectorAll('.table-block').forEach(bl=>{ const btn=bl.querySelector('.toggle-full'); const wrap=bl.querySelector('.table-wrap'); if(!btn||!wrap) return; btn.onclick=()=>{ wrap.classList.toggle('limited'); btn.textContent=wrap.classList.contains('limited')?'Lihat penuh':'Tutup'; }; }); }

// ====== Charts ======
let chartBalance, chartMonthly, chartShare, chartIncomeSector, chartExpenseSector, chartMonthlyLine;
if(window.Chart){ Chart.defaults.color='#eaf6ef'; Chart.defaults.borderColor='rgba(255,255,255,.12)'; }
const shadowPlugin={id:'shadow',beforeDatasetsDraw(c){const {ctx}=c;ctx.save();ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=12;ctx.shadowOffsetY=6;},afterDatasetsDraw(c){c.ctx.restore();}}; Chart.register(shadowPlugin);

function toggleNoData(id,empty){ const wrap=document.querySelector(`#${id}`)?.parentElement; const nd=wrap?.querySelector('.nodata'); if(!wrap||!nd) return; if(empty) nd.classList.remove('hidden'); else nd.classList.add('hidden'); }

function updateAnalytics(list){
  // saldo kumulatif
  const byDate={}; list.forEach(t=>{ const d=t.date; const delta=t.type==='Pemasukan'?+t.amount:-t.amount; byDate[d]=(byDate[d]||0)+delta; });
  const dates=Object.keys(byDate).sort(); let run=0; const saldo=dates.map(d=>run+=byDate[d]); drawBalanceChart(dates,saldo);

  // per bulan (bar) + line gabungan
  const byMonth={}; list.forEach(t=>{ const m=monthKey(t.date); if(!byMonth[m]) byMonth[m]={in:0,out:0}; if(t.type==='Pemasukan') byMonth[m].in+=t.amount; else byMonth[m].out+=t.amount; });
  const months=Object.keys(byMonth).sort(); const labels=months.map(toIndoMonth); const arrIn=months.map(m=>byMonth[m].in); const arrOut=months.map(m=>byMonth[m].out); const arrNet=months.map((m,i)=>arrIn[i]-arrOut[i]);
  drawMonthlyBar(labels,arrIn,arrOut); drawMonthlyLine(labels,arrIn,arrOut,arrNet);

  // share total
  const {sumIn,sumOut}=computeSums(list); drawShareChart([sumIn,sumOut]);

  // sektor
  const secIn={}, secOut={}; list.forEach(t=>{ const s=sectorLabel(t.sector); if(t.type==='Pemasukan') secIn[s]=(secIn[s]||0)+t.amount; else secOut[s]=(secOut[s]||0)+t.amount; });
  drawSector('chartIncomeSector',secIn); drawSector('chartExpenseSector',secOut);
}
function drawBalanceChart(labels,data){ const c=$('#chartBalance'); if(!c||!window.Chart) return; toggleNoData('chartBalance',labels.length===0); chartBalance?.destroy(); const g=c.getContext('2d').createLinearGradient(0,0,0,240); g.addColorStop(0,'rgba(47,224,123,.32)'); g.addColorStop(1,'rgba(47,224,123,0)'); chartBalance=new Chart(c,{type:'line',data:{labels,datasets:[{label:'Saldo kumulatif',data,tension:.25,fill:true,backgroundColor:g,borderColor:'#2fe07b',pointRadius:0}]},options:{maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:v=>fmtIDR(v.parsed.y)}}},scales:{y:{ticks:{callback:v=>v.toLocaleString('id-ID')}}}}); }
function drawMonthlyBar(labels,inD,outD){ const c=$('#chartMonthly'); if(!c) return; toggleNoData('chartMonthly',labels.length===0); chartMonthly?.destroy(); chartMonthly=new Chart(c,{type:'bar',data:{labels,datasets:[{label:'Pemasukan',data:inD,backgroundColor:'#2fe07b',borderRadius:8,barPercentage:.6,categoryPercentage:.6},{label:'Pengeluaran',data:outD,backgroundColor:'#ff6b6b',borderRadius:8,barPercentage:.6,categoryPercentage:.6}]},options:{maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:v=>`${v.dataset.label}: ${fmtIDR(v.parsed.y)}`}}},scales:{y:{ticks:{callback:v=>v.toLocaleString('id-ID')}}}}); }
function drawMonthlyLine(labels,inD,outD,netD){ const c=$('#chartMonthlyLine'); if(!c) return; toggleNoData('chartMonthlyLine',labels.length===0); chartMonthlyLine?.destroy();
  chartMonthlyLine=new Chart(c,{type:'line',data:{labels,datasets:[
      {label:'Pemasukan',data:inD,borderColor:'#2fe07b',backgroundColor:'rgba(47,224,123,.15)',tension:.25,pointRadius:2,fill:false},
      {label:'Pengeluaran',data:outD,borderColor:'#ff6b6b',backgroundColor:'rgba(255,107,107,.12)',tension:.25,pointRadius:2,fill:false},
      {label:'Saldo (In-Out)',data:netD,borderColor:'#38bdf8',backgroundColor:'rgba(56,189,248,.12)',tension:.25,pointRadius:2,fill:false}
    ]},options:{maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:v=>`${v.dataset.label}: ${fmtIDR(v.parsed.y)}`}},legend:{position:'bottom'}},scales:{y:{ticks:{callback:v=>v.toLocaleString('id-ID')}}}}); }
function drawShareChart(vals){ const c=$('#chartShare'); if(!c) return; const tot=(vals[0]||0)+(vals[1]||0); toggleNoData('chartShare',tot===0); chartShare?.destroy(); const centerText={id:'centerText',afterDraw(ch){const {ctx,chartArea:{width,height}}=ch;ctx.save();ctx.fillStyle='#eaf6ef';ctx.textAlign='center';ctx.font='700 16px ui-sans-serif,system-ui,Inter'; const pIn=tot?((vals[0]/tot)*100).toFixed(0):0; const pOut=tot?((vals[1]/tot)*100).toFixed(0):0; ctx.fillText(`${pIn}% IN / ${pOut}% OUT`,width/2,height/2);ctx.restore();}}; chartShare=new Chart(c,{type:'doughnut',data:{labels:['Pemasukan','Pengeluaran'],datasets:[{data:vals,backgroundColor:['#2fe07b','#ff6b6b']}]},options:{cutout:'65%',maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:v=>`${v.label}: ${fmtIDR(v.parsed)} (${((v.parsed/tot)*100||0).toFixed(1)}%)`}},legend:{position:'bottom'}}},plugins:[centerText]}); }
function drawSector(id,dict){ const c=document.getElementById(id); if(!c) return; const labels=Object.keys(dict); const vals=labels.map(k=>dict[k]); const tot=vals.reduce((a,b)=>a+b,0); toggleNoData(id,labels.length===0); const prev=(id==='chartIncomeSector')?chartIncomeSector:chartExpenseSector; prev?.destroy(); const inst=new Chart(c,{type:'doughnut',data:{labels,datasets:[{data:vals}]},options:{cutout:'55%',maintainAspectRatio:false,plugins:{tooltip:{callbacks:{label:v=>`${v.label}: ${fmtIDR(v.parsed)} (${((v.parsed/tot)*100||0).toFixed(1)}%)`}},legend:{position:'bottom'}}}}); if(id==='chartIncomeSector') chartIncomeSector=inst; else chartExpenseSector=inst; }
window.addEventListener('resize',()=>{ chartBalance?.resize(); chartMonthly?.resize(); chartShare?.resize(); chartMonthlyLine?.resize(); chartIncomeSector?.resize(); chartExpenseSector?.resize(); });

// ====== Laporan ======
function renderReports(all){
  const gD=groupBy(all,t=>t.date), gW=groupBy(all,t=>isoWeekKey(t.date)), gM=groupBy(all,t=>monthKey(t.date)), gY=groupBy(all,t=>yearKey(t.date));
  fillReport('#tb-harian', sortKeys(gD).slice(-30), k=>k);
  fillReport('#tb-mingguan', sortKeys(gW).slice(-20), k=>k);
  fillReport('#tb-bulanan', sortKeys(gM).slice(-24), k=>toIndoMonth(k));
  fillReport('#tb-tahunan', sortKeys(gY), k=>k);
}
function groupBy(list,key){ const m={}; list.forEach(t=>{const k=key(t); if(!m[k]) m[k]={in:0,out:0}; if(t.type==='Pemasukan') m[k].in+=t.amount; else m[k].out+=t.amount;}); return m; }
function sortKeys(m){ return Object.keys(m).sort((a,b)=>a<b?-1:1).map(k=>({key:k,...m[k]})); }
function fillReport(sel,rows,lab){ const tb=$(sel); if(!tb) return; tb.innerHTML=''; rows.forEach(r=>{ tb.appendChild(el('tr',{},[ el('td',{text:lab(r.key)}), el('td',{class:'right',text:fmtIDR(r.in)}), el('td',{class:'right',text:fmtIDR(r.out)}), el('td',{class:'right',text:fmtIDR(r.in-r.out)}) ])); }); }
function isoWeekKey(s){ const d=new Date(s+"T00:00:00"); const day=(d.getUTCDay()+6)%7; const th=new Date(d); th.setUTCDate(d.getUTCDate()-day+3); const firstThu=new Date(Date.UTC(th.getUTCFullYear(),0,4)); const week=1+Math.round(((th-firstThu)/86400000-3)/7); return `${th.getUTCFullYear()}-W${String(week).padStart(2,'0')}`; }

// ====== Boot ======
async function loadData(){ try{ const data=await getData(); state={transactions:Array.isArray(data.transactions)?data.transactions:[]}; render(); }catch(e){ alert('Gagal mengambil data: '+e.message); } }
updateAuthUI(); if(localStorage.getItem(SESSION_KEY)) loadData();
