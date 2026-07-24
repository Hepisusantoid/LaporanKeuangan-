/* =========================
   Laporan Keuangan – script.js (FULL v5)
   Fitur:
   - Filter: bulan, sektor, rentang tanggal custom, pencarian (Keterangan/Sektor)
   - Tambah/Edit/Hapus transaksi (bebas minus), field opsional "Dicatat oleh"
   - Sektor: combobox searchable (union sektor terpakai + manual via /api/sectors)
   - Bulk action: pilih banyak baris -> hapus massal / ganti sektor massal
   - Ekspor: CSV, Excel (SheetJS), PDF (jsPDF+autotable) — mengikuti data terfilter
   - Backup: unduh seluruh data sebagai JSON, pulihkan dari file JSON (/api/backup)
   - Loading state saat simpan + toast ceklis sukses/gagal
   - Analitik & Diagram termasuk tren sektor per bulan (top 6)
   - Laporan ringkas: harian, mingguan (ISO), bulanan, tahunan
   - Kalkulator
   ========================= */

//// ---------- Konfigurasi ----------
const API_TX = '/api/transactions';
const API_SECTORS = '/api/sectors';
const API_BACKUP = '/api/backup';
const SESSION_KEY = 'lapkeu_session';

//// ---------- State ----------
let state = { transactions: [], sectors: [] };
let currentMonthFilter = 'ALL';
let currentSectorFilter = 'ALL';
let currentSearch = '';
let dateFrom = '';
let dateTo = '';
let selectedIds = new Set();

//// ---------- Helpers ----------
const $ = (s) => document.querySelector(s);
const el = (t, a = {}, kids = []) => {
  const n = document.createElement(t);
  Object.entries(a).forEach(([k, v]) => {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  });
  kids.forEach((k) => n.appendChild(k));
  return n;
};
const fmtIDR = (n) =>
  (n || 0).toLocaleString('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  });

function parseIDR(str) {
  if (!str) return 0;
  const cleaned = String(str)
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.-]/g, '');
  const num = Number(cleaned);
  return isNaN(num) ? 0 : num;
}
function formatThousandsInput(s) {
  s = String(s || '').replace(/[^\d,]/g, '');
  const parts = s.split(',');
  let int = parts[0].replace(/^0+(?=\d)/, '');
  int = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return parts.length > 1 ? `${int},${parts[1].slice(0, 2)}` : int;
}
function formatFromNumber(n) {
  return Math.round(n || 0).toLocaleString('id-ID');
}
function attachThousandsMask(inp) {
  inp?.addEventListener('input', () => {
    const pos = inp.selectionStart;
    const before = inp.value.length;
    inp.value = formatThousandsInput(inp.value);
    const after = inp.value.length;
    inp.selectionStart = inp.selectionEnd = Math.max(0, pos + (after - before));
  });
}
function norm(s) {
  return String(s || '').toLowerCase().trim();
}

//// ---------- Toast & Loading ----------
function toast(msg, type = 'ok') {
  const box = $('#toast-container');
  if (!box) return;
  const t = el('div', { class: `toast${type === 'error' ? ' error' : ''}` });
  const tick = el('span', { class: 'tick', text: type === 'error' ? '!' : '✓' });
  t.appendChild(tick);
  t.appendChild(document.createTextNode(msg));
  box.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}
function showLoading(text) {
  const ov = $('#loading-overlay');
  if (!ov) return;
  $('#loading-text').textContent = text || 'Memuat...';
  ov.classList.remove('hidden');
}
function hideLoading() {
  $('#loading-overlay')?.classList.add('hidden');
}
function setSaving(isSaving) {
  const btn = $('#btn-save');
  if (!btn) return;
  btn.disabled = isSaving;
  btn.querySelector('.btn-label').textContent = isSaving ? 'Menyimpan...' : 'Simpan';
  btn.querySelector('.btn-spinner').classList.toggle('hidden', !isSaving);
}

//// ---------- Auth UI (tanpa ubah alur login) ----------
function updateAuthUI() {
  const on = !!localStorage.getItem(SESSION_KEY);
  $('#screen-login')?.classList.toggle('hidden', on);
  $('#screen-app')?.classList.toggle('hidden', !on);
  if ($('#btn-login')) $('#btn-login').hidden = on;
  if ($('#btn-logout')) $('#btn-logout').hidden = !on;
}
$('#btn-logout')?.addEventListener('click', () => {
  localStorage.removeItem(SESSION_KEY);
  updateAuthUI();
});
$('#btn-login')?.addEventListener('click', () =>
  $('#screen-login')?.scrollIntoView({ behavior: 'smooth' })
);

//// ---------- API ----------
async function apiGet() {
  const r = await fetch(API_TX, { method: 'GET' });
  let j = {};
  try { j = await r.json(); } catch {}
  if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  const transactions = Array.isArray(j) ? j : (Array.isArray(j?.transactions) ? j.transactions : []);
  const sectors = Array.isArray(j?.sectors) ? j.sectors : [];
  return { transactions, sectors };
}
async function apiPost(tx) {
  const r = await fetch(API_TX, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tx),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Gagal menyimpan');
  return j;
}
async function apiPut(tx) {
  const r = await fetch(API_TX, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tx),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Gagal memperbarui');
  return j;
}
async function apiDelete(id) {
  const r = await fetch(API_TX, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Gagal menghapus');
  return j;
}
async function apiAddSector(name) {
  const r = await fetch(API_SECTORS, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Gagal menambah sektor');
  return j;
}
async function apiBackupGet() {
  const r = await fetch(API_BACKUP, { method: 'GET' });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Gagal mengambil backup');
  return j;
}
async function apiBackupRestore(payload) {
  const r = await fetch(API_BACKUP, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Gagal memulihkan backup');
  return j;
}

//// ---------- Data Utils ----------
function computeSums(list) {
  const IN = list.filter((t) => t.type === 'Pemasukan').reduce((a, b) => a + b.amount, 0);
  const OUT = list.filter((t) => t.type === 'Pengeluaran').reduce((a, b) => a + b.amount, 0);
  return { sumIn: IN, sumOut: OUT, balance: IN - OUT };
}
const monthKey = (d) => (d || '').slice(0, 7);
const yearKey = (d) => (d || '').slice(0, 4);
function listMonths(list) {
  const s = new Set(list.map((t) => monthKey(t.date)));
  return Array.from(s).filter(Boolean).sort().reverse();
}
function toIndoMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  const id = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  return `${id[m]} ${y}`;
}
const sectorLabel = (v) => (v && String(v).trim()) ? String(v).trim() : 'Tanpa Sektor';

function allSectors() {
  const map = new Map();
  state.sectors.forEach((s) => {
    const n = String(s || '').trim();
    if (n) map.set(n.toLowerCase(), n);
  });
  state.transactions.forEach((t) => {
    const n = String(t.sector || '').trim();
    if (n) map.set(n.toLowerCase(), n);
  });
  return Array.from(map.values()).sort((a, b) => a.localeCompare(b, 'id'));
}

function applyFilter(list) {
  let out = list;
  if (currentMonthFilter !== 'ALL') out = out.filter((t) => monthKey(t.date) === currentMonthFilter);
  if (currentSectorFilter !== 'ALL') out = out.filter((t) => sectorLabel(t.sector) === currentSectorFilter);
  if (dateFrom) out = out.filter((t) => t.date >= dateFrom);
  if (dateTo) out = out.filter((t) => t.date <= dateTo);
  if (currentSearch) {
    const q = norm(currentSearch);
    out = out.filter((t) => norm(t.note).includes(q) || norm(sectorLabel(t.sector)).includes(q));
  }
  return out;
}
function currentFilteredSorted() {
  return applyFilter(state.transactions).sort((a, b) => (a.date < b.date ? 1 : -1));
}

//// ---------- Render ----------
function render() {
  const filtered = currentFilteredSorted();
  const { sumIn, sumOut, balance } = computeSums(filtered);
  if ($('#sum-in')) $('#sum-in').textContent = fmtIDR(sumIn);
  if ($('#sum-out')) $('#sum-out').textContent = fmtIDR(sumOut);
  if ($('#sum-balance')) $('#sum-balance').textContent = fmtIDR(balance);

  const selMonth = $('#filter-month');
  if (selMonth) {
    const months = listMonths(state.transactions);
    selMonth.innerHTML = '';
    selMonth.appendChild(el('option', { value: 'ALL', text: 'Semua Bulan' }));
    months.forEach((m) => selMonth.appendChild(el('option', { value: m, text: toIndoMonth(m) })));
    selMonth.value = currentMonthFilter;
  }

  const selSector = $('#filter-sector');
  if (selSector) {
    const sectors = allSectors();
    selSector.innerHTML = '';
    selSector.appendChild(el('option', { value: 'ALL', text: 'Semua Sektor' }));
    sectors.forEach((s) => selSector.appendChild(el('option', { value: s, text: s })));
    selSector.value = sectors.includes(currentSectorFilter) ? currentSectorFilter : 'ALL';
    if (selSector.value !== currentSectorFilter) currentSectorFilter = selSector.value;
  }

  // bersihkan seleksi yang sudah tidak ada di data terfilter
  const filteredIds = new Set(filtered.map((t) => t.id));
  selectedIds.forEach((id) => { if (!filteredIds.has(id)) selectedIds.delete(id); });

  const tbody = $('#tbody');
  if (tbody) {
    tbody.innerHTML = '';
    if (filtered.length === 0) {
      tbody.appendChild(
        el('tr', {}, [el('td', { colspan: '7', class: 'muted', text: 'Tidak ada data yang cocok.' })])
      );
    }
    filtered.forEach((t) => {
      const cb = el('input', { type: 'checkbox' });
      cb.checked = selectedIds.has(t.id);
      cb.addEventListener('change', () => {
        if (cb.checked) selectedIds.add(t.id); else selectedIds.delete(t.id);
        updateBulkToolbar();
      });
      const tr = el('tr', {}, [
        el('td', {}, [cb]),
        el('td', { text: t.date }),
        el('td', { text: t.note || '-' }),
        el('td', { text: sectorLabel(t.sector) }),
        el('td', { text: t.type }),
        el('td', { class: 'right', text: fmtIDR(t.amount) }),
        el('td', {}, [
          smallBtn('Edit', () => openEdit(t)),
          document.createTextNode(' '),
          smallDanger('Hapus', async () => {
            if (!confirm('Hapus transaksi ini?')) return;
            try {
              showLoading('Menghapus...');
              await apiDelete(t.id);
              await loadData();
              toast('Transaksi terhapus');
            } catch (e) { toast(e.message, 'error'); }
            finally { hideLoading(); }
          }),
        ]),
      ]);
      tbody.appendChild(tr);
    });
  }
  updateBulkToolbar();
  updateSelectAllState(filtered);

  updateAnalytics(filtered);
  renderReports(state.transactions);
  initCollapsibles();
}

function smallBtn(txt, fn) {
  const b = el('button', { class: 'btn', text: txt });
  b.addEventListener('click', fn);
  return b;
}
function smallDanger(txt, fn) {
  const b = el('button', { class: 'btn danger', text: txt });
  b.addEventListener('click', fn);
  return b;
}

//// ---------- Bulk Select & Actions ----------
function updateBulkToolbar() {
  const n = selectedIds.size;
  const btnDel = $('#bulk-delete');
  const btnSec = $('#bulk-sector');
  if (btnDel) btnDel.disabled = n === 0;
  if (btnSec) btnSec.disabled = n === 0;
  const cnt = $('#bulk-count');
  if (cnt) cnt.textContent = n > 0 ? `${n} dipilih` : '';
}
function updateSelectAllState(filtered) {
  const sa = $('#select-all');
  if (!sa) return;
  sa.checked = filtered.length > 0 && filtered.every((t) => selectedIds.has(t.id));
  sa.indeterminate = !sa.checked && filtered.some((t) => selectedIds.has(t.id));
}
$('#select-all')?.addEventListener('change', (e) => {
  const filtered = currentFilteredSorted();
  if (e.target.checked) filtered.forEach((t) => selectedIds.add(t.id));
  else filtered.forEach((t) => selectedIds.delete(t.id));
  render();
});
$('#bulk-delete')?.addEventListener('click', async () => {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;
  if (!confirm(`Hapus ${ids.length} transaksi terpilih?`)) return;
  try {
    showLoading(`Menghapus ${ids.length} transaksi...`);
    for (const id of ids) await apiDelete(id);
    selectedIds.clear();
    await loadData();
    toast(`${ids.length} transaksi terhapus`);
  } catch (e) { toast(e.message, 'error'); }
  finally { hideLoading(); }
});
$('#bulk-sector')?.addEventListener('click', async () => {
  const ids = Array.from(selectedIds);
  if (ids.length === 0) return;
  const name = prompt(`Ganti sektor untuk ${ids.length} transaksi terpilih menjadi:`);
  if (name === null) return;
  const trimmed = name.trim();
  try {
    showLoading(`Memperbarui ${ids.length} transaksi...`);
    const byId = new Map(state.transactions.map((t) => [t.id, t]));
    for (const id of ids) {
      const t = byId.get(id);
      if (!t) continue;
      await apiPut({ ...t, sector: trimmed });
    }
    if (trimmed) { try { await apiAddSector(trimmed); } catch {} }
    selectedIds.clear();
    await loadData();
    toast(`Sektor ${ids.length} transaksi diperbarui`);
  } catch (e) { toast(e.message, 'error'); }
  finally { hideLoading(); }
});

//// ---------- Filter Bulan / Sektor / Search / Rentang Tanggal ----------
$('#filter-month')?.addEventListener('change', (e) => { currentMonthFilter = e.target.value; render(); });
$('#filter-sector')?.addEventListener('change', (e) => { currentSectorFilter = e.target.value; render(); });
let searchDebounce;
$('#search-box')?.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const val = e.target.value;
  searchDebounce = setTimeout(() => { currentSearch = val; render(); }, 150);
});
$('#filter-date-from')?.addEventListener('change', (e) => { dateFrom = e.target.value; render(); });
$('#filter-date-to')?.addEventListener('change', (e) => { dateTo = e.target.value; render(); });
$('#btn-clear-range')?.addEventListener('click', () => {
  dateFrom = ''; dateTo = '';
  if ($('#filter-date-from')) $('#filter-date-from').value = '';
  if ($('#filter-date-to')) $('#filter-date-to').value = '';
  render();
});

//// ---------- Combobox Sektor ----------
const sectorInput = $('#tx-sector');
const sectorDropdown = $('#sector-dropdown');

function renderSectorDropdown() {
  if (!sectorDropdown) return;
  const q = norm(sectorInput.value);
  const all = allSectors();
  const matches = q ? all.filter((s) => norm(s).includes(q)) : all;
  sectorDropdown.innerHTML = '';

  if (matches.length === 0) {
    sectorDropdown.appendChild(el('div', { class: 'cb-empty', text: 'Belum ada sektor cocok' }));
  } else {
    matches.forEach((s) => {
      const item = el('div', { class: 'cb-item', text: s });
      item.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        sectorInput.value = s;
        hideSectorDropdown();
      });
      sectorDropdown.appendChild(item);
    });
  }

  const typed = sectorInput.value.trim();
  const exists = all.some((s) => norm(s) === norm(typed));
  if (typed && !exists) {
    const addItem = el('div', { class: 'cb-item cb-add', text: `+ Tambah sektor "${typed}"` });
    addItem.addEventListener('mousedown', async (ev) => {
      ev.preventDefault();
      try { await apiAddSector(typed); } catch (e) { /* tetap lanjut lokal */ }
      state.sectors = addLocalSector(state.sectors, typed);
      sectorInput.value = typed;
      hideSectorDropdown();
      render();
    });
    sectorDropdown.appendChild(addItem);
  }
  sectorDropdown.classList.remove('hidden');
}
function addLocalSector(list, name) {
  const has = list.some((s) => norm(s) === norm(name));
  return has ? list : [...list, name];
}
function hideSectorDropdown() { sectorDropdown?.classList.add('hidden'); }
sectorInput?.addEventListener('focus', renderSectorDropdown);
sectorInput?.addEventListener('input', renderSectorDropdown);
sectorInput?.addEventListener('blur', () => setTimeout(hideSectorDropdown, 120));
document.addEventListener('click', (e) => {
  if (!$('#sector-combobox')?.contains(e.target)) hideSectorDropdown();
});

//// ---------- Modal Tambah/Edit ----------
const dlg = $('#modal-tx');
$('#open-add')?.addEventListener('click', () => {
  $('#modal-title').textContent = 'Tambah Transaksi Baru';
  $('#tx-id').value = '';
  $('#tx-type').value = 'Pemasukan';
  $('#tx-note').value = '';
  $('#tx-sector').value = '';
  $('#tx-amount').value = '';
  $('#tx-by').value = '';
  $('#tx-date').valueAsDate = new Date();
  $('#form-error').hidden = true;
  dlg.showModal();
});
$('#btn-cancel')?.addEventListener('click', () => dlg.close());

function openEdit(t) {
  $('#modal-title').textContent = 'Edit Transaksi';
  $('#tx-id').value = t.id;
  $('#tx-type').value = t.type;
  $('#tx-note').value = t.note || '';
  $('#tx-sector').value = t.sector || '';
  $('#tx-amount').value = formatFromNumber(t.amount);
  $('#tx-by').value = t.by || '';
  $('#tx-date').value = t.date;
  $('#form-error').hidden = true;
  dlg.showModal();
}

$('#form-tx')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = {
    id: $('#tx-id').value || undefined,
    type: $('#tx-type').value,
    note: $('#tx-note').value,
    sector: $('#tx-sector').value,
    by: $('#tx-by').value,
    amount: parseIDR($('#tx-amount').value),
    date: $('#tx-date').value,
  };
  if (!data.amount || data.amount <= 0) return showFormError('Jumlah harus > 0');

  setSaving(true);
  try {
    if (data.id) await apiPut(data);
    else await apiPost(data);
    dlg.close();
    await loadData();
    toast('Tersimpan');
  } catch (err) {
    showFormError(err.message);
    toast(err.message, 'error');
  } finally {
    setSaving(false);
  }
});
function showFormError(m) {
  const e = $('#form-error');
  e.textContent = m;
  e.hidden = false;
}
attachThousandsMask($('#tx-amount'));

//// ---------- Ekspor (CSV / Excel / PDF) ----------
function exportRows() {
  return currentFilteredSorted().map((t) => ({
    Tanggal: t.date,
    Keterangan: t.note || '',
    Sektor: sectorLabel(t.sector),
    Jenis: t.type,
    Jumlah: t.amount,
    'Dicatat oleh': t.by || '',
  }));
}
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
$('#export-csv')?.addEventListener('click', () => {
  const rows = exportRows();
  if (rows.length === 0) return toast('Tidak ada data untuk diekspor', 'error');
  const headers = Object.keys(rows[0]);
  const csvLines = [headers.join(',')];
  rows.forEach((r) => {
    csvLines.push(headers.map((h) => `"${String(r[h]).replace(/"/g, '""')}"`).join(','));
  });
  const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, `laporan-keuangan-${new Date().toISOString().slice(0, 10)}.csv`);
  toast('CSV diunduh');
});
$('#export-xlsx')?.addEventListener('click', () => {
  if (!window.XLSX) return toast('Library Excel belum siap, coba lagi sebentar', 'error');
  const rows = exportRows();
  if (rows.length === 0) return toast('Tidak ada data untuk diekspor', 'error');
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transaksi');
  XLSX.writeFile(wb, `laporan-keuangan-${new Date().toISOString().slice(0, 10)}.xlsx`);
  toast('Excel diunduh');
});
$('#export-pdf')?.addEventListener('click', () => {
  const jsPDFLib = window.jspdf?.jsPDF;
  if (!jsPDFLib) return toast('Library PDF belum siap, coba lagi sebentar', 'error');
  const rows = exportRows();
  if (rows.length === 0) return toast('Tidak ada data untuk diekspor', 'error');
  const doc = new jsPDFLib();
  doc.setFontSize(14);
  doc.text('Laporan Keuangan', 14, 16);
  doc.setFontSize(9);
  const { sumIn, sumOut, balance } = computeSums(currentFilteredSorted());
  doc.text(`Pemasukan: ${fmtIDR(sumIn)}  |  Pengeluaran: ${fmtIDR(sumOut)}  |  Saldo: ${fmtIDR(balance)}`, 14, 22);
  doc.autoTable({
    startY: 28,
    head: [Object.keys(rows[0])],
    body: rows.map((r) => Object.values(r).map((v) => (typeof v === 'number' ? fmtIDR(v) : v))),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [33, 223, 122], textColor: [6, 19, 11] },
  });
  doc.save(`laporan-keuangan-${new Date().toISOString().slice(0, 10)}.pdf`);
  toast('PDF diunduh');
});

//// ---------- Backup & Restore ----------
$('#backup-download')?.addEventListener('click', async () => {
  try {
    showLoading('Menyiapkan backup...');
    const data = await apiBackupGet();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `backup-laporan-keuangan-${new Date().toISOString().slice(0, 10)}.json`);
    toast('Backup diunduh');
  } catch (e) { toast(e.message, 'error'); }
  finally { hideLoading(); }
});
$('#backup-upload-trigger')?.addEventListener('click', () => $('#backup-file').click());
$('#backup-file')?.addEventListener('change', async (e) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  if (!confirm('Memulihkan backup akan MENIMPA seluruh data transaksi & sektor saat ini. Lanjutkan?')) return;
  try {
    showLoading('Memulihkan backup...');
    const text = await file.text();
    const payload = JSON.parse(text);
    if (!Array.isArray(payload?.transactions)) throw new Error('Format file backup tidak valid');
    const res = await apiBackupRestore(payload);
    await loadData();
    toast(`Backup dipulihkan (${res.count ?? payload.transactions.length} transaksi)`);
  } catch (e) { toast(e.message, 'error'); }
  finally { hideLoading(); }
});

//// ---------- Kalkulator ----------
const dlgCalc = $('#modal-calc');
$('#open-calc')?.addEventListener('click', () => dlgCalc.showModal());
$('#close-calc')?.addEventListener('click', () => dlgCalc.close());

const disp = $('#calc-display');
let calcExpr = '0';
const fmtComma = (n) => {
  if (!/^\-?\d+(\.\d+)?$/.test(n)) return n;
  const [i, d] = n.split('.');
  const t = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return d ? `${t}.${d}` : t;
};
const human = (e) => e.replace(/(?<![A-Za-z])\-?\d+(\.\d+)?/g, (m) => fmtComma(m));
const upd = () => (disp.value = human(calcExpr));
function pushCalc(tok) {
  if (tok === 'C') { calcExpr = '0'; return upd(); }
  if (tok === '⌫') { calcExpr = calcExpr.length <= 1 ? '0' : calcExpr.slice(0, -1); return upd(); }
  if (tok === '=') {
    try { calcExpr = String(Function('"use strict";return (' + calcExpr + ')')() ?? 0); }
    catch { calcExpr = '0'; }
    return upd();
  }
  if (calcExpr === '0' && /\d/.test(tok)) calcExpr = tok;
  else calcExpr += tok;
  upd();
}
document.querySelectorAll('.calc-grid button').forEach((b) => {
  if (b.hasAttribute('data-clear')) b.addEventListener('click', () => pushCalc('C'));
  else b.addEventListener('click', () => pushCalc(b.textContent));
});

//// ---------- Tabs ----------
function initTabs() {
  document.querySelectorAll('.tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tabs .tab').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tabpane').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      const pane = document.querySelector(btn.dataset.target);
      pane && pane.classList.add('active');
    });
  });
}
initTabs();

//// ---------- Collapsible Tables ----------
function initCollapsibles() {
  document.querySelectorAll('.table-block').forEach((block) => {
    const btn = block.querySelector('.toggle-full');
    const wrap = block.querySelector('.table-wrap');
    if (!btn || !wrap) return;
    btn.onclick = () => {
      wrap.classList.toggle('limited');
      btn.textContent = wrap.classList.contains('limited') ? 'Lihat penuh' : 'Tutup';
    };
  });
}

//// ---------- Charts ----------
let chartBalance, chartMonthly, chartShare, chartIncomeSector, chartExpenseSector, chartMonthlyLine, chartSectorTrend;

if (window.Chart) {
  Chart.defaults.color = '#eaf6ef';
  Chart.defaults.borderColor = 'rgba(255,255,255,.12)';
}
const shadowPlugin = {
  id: 'shadow',
  beforeDatasetsDraw(c) {
    const { ctx } = c;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.25)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 6;
  },
  afterDatasetsDraw(c) { c.ctx.restore(); },
};
window.Chart && Chart.register(shadowPlugin);

function toggleNoData(canvasId, empty) {
  const wrap = document.getElementById(canvasId)?.parentElement;
  const nd = wrap?.querySelector('.nodata');
  if (!wrap || !nd) return;
  if (empty) nd.classList.remove('hidden'); else nd.classList.add('hidden');
}

const PALETTE = ['#2fe07b', '#38bdf8', '#f9c74f', '#f3722c', '#f94144', '#9b5de5', '#43aa8b', '#577590'];

function updateAnalytics(list) {
  const byDate = {};
  list.forEach((t) => {
    const d = t.date;
    const delta = t.type === 'Pemasukan' ? +t.amount : -t.amount;
    byDate[d] = (byDate[d] || 0) + delta;
  });
  const dates = Object.keys(byDate).sort();
  let run = 0;
  const saldo = dates.map((d) => (run += byDate[d]));
  drawBalanceChart(dates, saldo);

  const byMonth = {};
  list.forEach((t) => {
    const m = monthKey(t.date);
    if (!byMonth[m]) byMonth[m] = { in: 0, out: 0 };
    if (t.type === 'Pemasukan') byMonth[m].in += t.amount;
    else byMonth[m].out += t.amount;
  });
  const months = Object.keys(byMonth).sort();
  const labels = months.map(toIndoMonth);
  const arrIn = months.map((m) => byMonth[m].in);
  const arrOut = months.map((m) => byMonth[m].out);
  const arrNet = months.map((_, i) => arrIn[i] - arrOut[i]);

  drawMonthlyBar(labels, arrIn, arrOut);
  drawMonthlyLine(labels, arrIn, arrOut, arrNet);

  const { sumIn, sumOut } = computeSums(list);
  drawShareChart([sumIn, sumOut]);

  const secIn = {}, secOut = {};
  list.forEach((t) => {
    const s = sectorLabel(t.sector);
    if (t.type === 'Pemasukan') secIn[s] = (secIn[s] || 0) + t.amount;
    else secOut[s] = (secOut[s] || 0) + t.amount;
  });
  drawSector('chartIncomeSector', secIn);
  drawSector('chartExpenseSector', secOut);

  drawSectorTrend(list, months, labels);
}

function drawBalanceChart(labels, data) {
  const c = $('#chartBalance');
  if (!c || !window.Chart) return;
  toggleNoData('chartBalance', labels.length === 0);
  chartBalance?.destroy();
  const g = c.getContext('2d').createLinearGradient(0, 0, 0, 240);
  g.addColorStop(0, 'rgba(47,224,123,.32)');
  g.addColorStop(1, 'rgba(47,224,123,0)');
  chartBalance = new Chart(c, {
    type: 'line',
    data: { labels, datasets: [{ label: 'Saldo kumulatif', data, tension: .25, fill: true, backgroundColor: g, borderColor: '#2fe07b', pointRadius: 0 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: v => fmtIDR(v.parsed.y) } } },
      scales: { y: { ticks: { callback: v => v.toLocaleString('id-ID') } } }
    }
  });
}
function drawMonthlyBar(labels, inD, outD) {
  const c = $('#chartMonthly'); if (!c) return;
  toggleNoData('chartMonthly', labels.length === 0);
  chartMonthly?.destroy();
  chartMonthly = new Chart(c, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: inD, backgroundColor: '#2fe07b', borderRadius: 8, barPercentage: .6, categoryPercentage: .6 },
        { label: 'Pengeluaran', data: outD, backgroundColor: '#ff6b6b', borderRadius: 8, barPercentage: .6, categoryPercentage: .6 },
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { tooltip: { callbacks: { label: v => `${v.dataset.label}: ${fmtIDR(v.parsed.y)}` } } },
      scales: { y: { ticks: { callback: v => v.toLocaleString('id-ID') } } }
    }
  });
}
function drawMonthlyLine(labels, inD, outD, netD) {
  const c = $('#chartMonthlyLine'); if (!c) return;
  toggleNoData('chartMonthlyLine', labels.length === 0);
  chartMonthlyLine?.destroy();
  chartMonthlyLine = new Chart(c, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label: 'Pemasukan', data: inD, borderColor: '#2fe07b', backgroundColor: 'rgba(47,224,123,.12)', tension: .25, pointRadius: 2, fill: false },
        { label: 'Pengeluaran', data: outD, borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,.12)', tension: .25, pointRadius: 2, fill: false },
        { label: 'Saldo (In-Out)', data: netD, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,.12)', tension: .25, pointRadius: 2, fill: false },
      ]
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: v => `${v.dataset.label}: ${fmtIDR(v.parsed.y)}` } } },
      scales: { y: { ticks: { callback: v => v.toLocaleString('id-ID') } } }
    }
  });
}
function drawShareChart(vals) {
  const c = $('#chartShare'); if (!c) return;
  const tot = (vals[0] || 0) + (vals[1] || 0);
  toggleNoData('chartShare', tot === 0);
  chartShare?.destroy();
  const centerText = {
    id: 'centerText',
    afterDraw(ch) {
      const { ctx, chartArea: { width, height } } = ch;
      ctx.save();
      ctx.fillStyle = '#eaf6ef';
      ctx.textAlign = 'center';
      ctx.font = '700 16px ui-sans-serif,system-ui,Inter';
      const pIn = tot ? ((vals[0] / tot) * 100).toFixed(0) : 0;
      const pOut = tot ? ((vals[1] / tot) * 100).toFixed(0) : 0;
      ctx.fillText(`${pIn}% IN / ${pOut}% OUT`, width / 2, height / 2);
      ctx.restore();
    }
  };
  chartShare = new Chart(c, {
    type: 'doughnut',
    data: { labels: ['Pemasukan', 'Pengeluaran'], datasets: [{ data: vals, backgroundColor: ['#2fe07b', '#ff6b6b'] }] },
    options: {
      cutout: '65%', maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: v => `${v.label}: ${fmtIDR(v.parsed)} (${((v.parsed / tot) * 100 || 0).toFixed(1)}%)` } }
      }
    },
    plugins: [centerText]
  });
}
function drawSector(id, dict) {
  const c = document.getElementById(id); if (!c) return;
  const labels = Object.keys(dict);
  const vals = labels.map((k) => dict[k]);
  const tot = vals.reduce((a, b) => a + b, 0);
  toggleNoData(id, labels.length === 0);
  const prev = id === 'chartIncomeSector' ? chartIncomeSector : chartExpenseSector;
  prev?.destroy();
  const inst = new Chart(c, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: vals, backgroundColor: PALETTE }] },
    options: {
      cutout: '55%', maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: v => `${v.label}: ${fmtIDR(v.parsed)} (${((v.parsed / tot) * 100 || 0).toFixed(1)}%)` } }
      }
    }
  });
  if (id === 'chartIncomeSector') chartIncomeSector = inst;
  else chartExpenseSector = inst;
}
function drawSectorTrend(list, months, labels) {
  const c = $('#chartSectorTrend'); if (!c) return;
  // net (in-out) per sektor per bulan, ambil top 6 sektor berdasarkan total absolut
  const bySector = {};
  list.forEach((t) => {
    const s = sectorLabel(t.sector);
    const m = monthKey(t.date);
    if (!bySector[s]) bySector[s] = {};
    const delta = t.type === 'Pemasukan' ? t.amount : -t.amount;
    bySector[s][m] = (bySector[s][m] || 0) + delta;
  });
  const totals = Object.entries(bySector).map(([s, byM]) => [s, Object.values(byM).reduce((a, b) => a + Math.abs(b), 0)]);
  const topSectors = totals.sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s]) => s);

  toggleNoData('chartSectorTrend', topSectors.length === 0 || months.length === 0);
  chartSectorTrend?.destroy();
  chartSectorTrend = new Chart(c, {
    type: 'line',
    data: {
      labels,
      datasets: topSectors.map((s, i) => ({
        label: s,
        data: months.map((m) => (bySector[s]?.[m]) || 0),
        borderColor: PALETTE[i % PALETTE.length],
        backgroundColor: PALETTE[i % PALETTE.length],
        tension: .25, pointRadius: 2, fill: false,
      })),
    },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: v => `${v.dataset.label}: ${fmtIDR(v.parsed.y)}` } } },
      scales: { y: { ticks: { callback: v => v.toLocaleString('id-ID') } } }
    }
  });
}
window.addEventListener('resize', () => {
  chartBalance?.resize(); chartMonthly?.resize(); chartShare?.resize();
  chartMonthlyLine?.resize(); chartIncomeSector?.resize(); chartExpenseSector?.resize();
  chartSectorTrend?.resize();
});

//// ---------- Laporan Ringkas ----------
function renderReports(all) {
  const gD = groupBy(all, (t) => t.date);
  const gW = groupBy(all, (t) => isoWeekKey(t.date));
  const gM = groupBy(all, (t) => monthKey(t.date));
  const gY = groupBy(all, (t) => yearKey(t.date));

  fillReport('#tb-harian', sortKeys(gD).slice(-30), (k) => k);
  fillReport('#tb-mingguan', sortKeys(gW).slice(-20), (k) => k);
  fillReport('#tb-bulanan', sortKeys(gM).slice(-24), (k) => toIndoMonth(k));
  fillReport('#tb-tahunan', sortKeys(gY), (k) => k);
}
function groupBy(list, key) {
  const m = {};
  list.forEach((t) => {
    const k = key(t);
    if (!m[k]) m[k] = { in: 0, out: 0 };
    if (t.type === 'Pemasukan') m[k].in += t.amount;
    else m[k].out += t.amount;
  });
  return m;
}
function sortKeys(m) {
  return Object.keys(m).sort((a, b) => (a < b ? -1 : 1)).map((k) => ({ key: k, ...m[k] }));
}
function fillReport(sel, rows, lab) {
  const tb = $(sel); if (!tb) return;
  tb.innerHTML = '';
  rows.forEach((r) => {
    tb.appendChild(
      el('tr', {}, [
        el('td', { text: lab(r.key) }),
        el('td', { class: 'right', text: fmtIDR(r.in) }),
        el('td', { class: 'right', text: fmtIDR(r.out) }),
        el('td', { class: 'right', text: fmtIDR(r.in - r.out) }),
      ])
    );
  });
}
function isoWeekKey(s) {
  const d = new Date(s + 'T00:00:00');
  const day = (d.getUTCDay() + 6) % 7;
  const th = new Date(d);
  th.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(th.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((th - firstThu) / 86400000 - 3) / 7);
  return `${th.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

//// ---------- Boot ----------
async function loadData() {
  try {
    const data = await apiGet();
    state = {
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
      sectors: Array.isArray(data.sectors) ? data.sectors : [],
    };
    render();
  } catch (e) {
    toast('Gagal mengambil data: ' + e.message, 'error');
  }
}
updateAuthUI();
if (localStorage.getItem(SESSION_KEY)) loadData();
