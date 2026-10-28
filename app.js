'use strict';

/* ---------- Config ---------- */
const APP_VERSION = '1.0.0';
const CATEGORIES = [
  { id: 'food',      name: 'Food',      icon: '🍔', color: '#f97316' },
  { id: 'transport', name: 'Transport', icon: '🚌', color: '#3b82f6' },
  { id: 'shopping',  name: 'Shopping',  icon: '🛍️', color: '#ec4899' },
  { id: 'bills',     name: 'Bills',     icon: '💡', color: '#eab308' },
  { id: 'health',    name: 'Health',    icon: '💊', color: '#10b981' },
  { id: 'education', name: 'Education', icon: '📚', color: '#8b5cf6' },
  { id: 'fun',       name: 'Fun',       icon: '🎬', color: '#ef4444' },
  { id: 'other',     name: 'Other',     icon: '📦', color: '#64748b' },
];
const catById = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* ---------- IndexedDB (data lives on the device) ---------- */
const DB_NAME = 'expense-tracker';
const STORE = 'expenses';
let dbPromise;
function openDb() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('date', 'date');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}
async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const out = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
const dbGetAll = () => withStore('readonly', s => s.getAll());
const dbPut = e => withStore('readwrite', s => s.put(e));
const dbPutMany = list => withStore('readwrite', s => { list.forEach(e => s.put(e)); });
const dbDelete = id => withStore('readwrite', s => s.delete(id));
const dbClear = () => withStore('readwrite', s => s.clear());

/* ---------- Settings (small, so localStorage is fine) ---------- */
const settings = { currency: '৳', budget: 0 };
try { Object.assign(settings, JSON.parse(localStorage.getItem('settings') || '{}')); } catch {}
function saveSettings() {
  try { localStorage.setItem('settings', JSON.stringify(settings)); } catch {}
}

/* ---------- Helpers ---------- */
const $ = sel => document.querySelector(sel);
const pad = n => String(n).padStart(2, '0');
const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayIso = () => isoDate(new Date());
const monthKey = (y, m) => `${y}-${pad(m + 1)}`;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const round2 = n => Math.round(n * 100) / 100;
function money(n) {
  return settings.currency + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function shortMoney(n) {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}
function parseAmount(str) {
  const n = parseFloat(String(str).replace(/,/g, '').trim());
  return Number.isFinite(n) ? round2(n) : NaN;
}
function dayLabel(iso) {
  const t = todayIso();
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === t) return 'Today';
  if (iso === isoDate(y)) return 'Yesterday';
  const [Y, M, D] = iso.split('-').map(Number);
  return new Date(Y, M - 1, D).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

/* ---------- State ---------- */
let expenses = [];
const now = new Date();
let viewYear = now.getFullYear();
let viewMonth = now.getMonth();
let editingId = null;
let selectedCat = 'food';

function monthExpenses(y = viewYear, m = viewMonth) {
  const key = monthKey(y, m);
  return expenses.filter(e => e.date.startsWith(key));
}
const sum = list => round2(list.reduce((a, e) => a + e.amount, 0));

/* ---------- Rendering ---------- */
function render() {
  $('#monthLabel').textContent = `${MONTHS[viewMonth]} ${viewYear}`;
  const list = monthExpenses();
  const total = sum(list);
  $('#monthTotal').textContent = money(total);

  // Budget bar
  const wrap = $('#budgetWrap');
  if (settings.budget > 0) {
    wrap.hidden = false;
    const pct = total / settings.budget * 100;
    const fill = $('#budgetFill');
    fill.style.width = Math.min(pct, 100) + '%';
    fill.classList.toggle('over', pct > 100);
    const left = round2(settings.budget - total);
    $('#budgetText').textContent = left >= 0
      ? `${money(left)} left of ${money(settings.budget)}`
      : `${money(-left)} over budget of ${money(settings.budget)}`;
  } else {
    wrap.hidden = true;
  }

  renderList(list);
  renderSummary(list, total);
}

function renderList(list) {
  const sorted = [...list].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const groups = new Map();
  for (const e of sorted) {
    if (!groups.has(e.date)) groups.set(e.date, []);
    groups.get(e.date).push(e);
  }
  let html = '';
  for (const [date, items] of groups) {
    html += `<div class="day"><div class="day-head"><span>${dayLabel(date)}</span><span>${money(sum(items))}</span></div><div class="day-items">`;
    for (const e of items) {
      const c = catById[e.category] || catById.other;
      html += `<button class="item" data-id="${esc(e.id)}">
        <span class="cat-icon" style="background:${c.color}22">${c.icon}</span>
        <span class="item-main"><div class="item-title">${esc(c.name)}</div>${e.note ? `<div class="item-note">${esc(e.note)}</div>` : ''}</span>
        <span class="item-amt">${money(e.amount)}</span>
      </button>`;
    }
    html += '</div></div>';
  }
  $('#list').innerHTML = html;
  $('#empty').hidden = list.length > 0;
}

function renderSummary(list, total) {
  // Stats
  const isCurrent = viewYear === now.getFullYear() && viewMonth === now.getMonth();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const days = isCurrent ? new Date().getDate() : daysInMonth;
  const biggest = list.reduce((m, e) => (e.amount > m ? e.amount : m), 0);

  let html = `<div class="card"><div class="stats">
    <div><b>${list.length}</b><span>expenses</span></div>
    <div><b>${money(round2(total / days))}</b><span>per day</span></div>
    <div><b>${money(biggest)}</b><span>largest</span></div>
  </div></div>`;

  // By category
  const byCat = CATEGORIES.map(c => ({ ...c, total: sum(list.filter(e => e.category === c.id)) }))
    .filter(c => c.total > 0)
    .sort((a, b) => b.total - a.total);

  if (byCat.length) {
    let acc = 0;
    const stops = byCat.map(c => {
      const from = acc / total * 360;
      acc += c.total;
      const to = acc / total * 360;
      return `${c.color} ${from}deg ${to}deg`;
    }).join(', ');
    html += `<div class="card"><h2>By category</h2>
      <div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops})"></div></div>`;
    for (const c of byCat) {
      const pct = Math.round(c.total / total * 100);
      html += `<div class="cat-row">
        <span>${c.icon}</span>
        <span>${c.name}<span class="pct">${pct}%</span></span>
        <b>${money(c.total)}</b>
        <div class="bar"><div style="width:${c.total / byCat[0].total * 100}%;background:${c.color}"></div></div>
      </div>`;
    }
    html += '</div>';
  } else {
    html += `<div class="card"><h2>By category</h2><p class="hint">Nothing spent this month yet.</p></div>`;
  }

  // Last 6 months
  const cols = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(viewYear, viewMonth - i, 1);
    cols.push({ label: MONTHS[d.getMonth()].slice(0, 3), total: sum(monthExpenses(d.getFullYear(), d.getMonth())), current: i === 0 });
  }
  const max = Math.max(...cols.map(c => c.total), 1);
  html += `<div class="card"><h2>Last 6 months</h2><div class="months">` +
    cols.map(c => `<div class="mcol${c.current ? ' current' : ''}">
      <span class="v">${c.total ? shortMoney(c.total) : ''}</span>
      <div class="col" style="height:${c.total / max * 100}%"></div>
      <small>${c.label}</small></div>`).join('') +
    `</div></div>`;

  $('#summary').innerHTML = html;
}

/* ---------- Add / edit sheet ---------- */
function renderChips() {
  $('#fCats').innerHTML = CATEGORIES.map(c =>
    `<button type="button" class="chip" role="radio" data-cat="${c.id}" aria-checked="${c.id === selectedCat}">
      <span class="e">${c.icon}</span>${c.name}</button>`).join('');
}
function openSheet(expense) {
  editingId = expense ? expense.id : null;
  selectedCat = expense ? expense.category : (localStorageGet('lastCat') || 'food');
  if (!catById[selectedCat]) selectedCat = 'food';
  $('#sheetTitle').textContent = expense ? 'Edit expense' : 'Add expense';
  $('#amountCur').textContent = settings.currency;
  $('#fAmount').value = expense ? String(expense.amount) : '';
  fitAmount();
  $('#fDate').value = expense ? expense.date : defaultDate();
  $('#fNote').value = expense ? (expense.note || '') : '';
  $('#deleteBtn').hidden = !expense;
  $('#formError').hidden = true;
  renderChips();
  $('#sheet').showModal();
  if (!expense) setTimeout(() => $('#fAmount').focus(), 50);
}
function defaultDate() {
  // In the current month use today; when browsing another month, default to its 1st day.
  if (viewYear === now.getFullYear() && viewMonth === now.getMonth()) return todayIso();
  return `${monthKey(viewYear, viewMonth)}-01`;
}
// Grow the amount field with what's typed so the currency symbol stays next to the number.
function fitAmount() {
  const el = $('#fAmount');
  el.style.width = Math.max(el.value.length, 1) + 1 + 'ch';
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function closeSheet() { $('#sheet').close(); }

async function saveForm(ev) {
  ev.preventDefault();
  const amount = parseAmount($('#fAmount').value);
  const date = $('#fDate').value;
  const err = $('#formError');
  if (!(amount > 0)) { err.textContent = 'Enter an amount greater than 0.'; err.hidden = false; return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { err.textContent = 'Pick a date.'; err.hidden = false; return; }

  const existing = editingId && expenses.find(e => e.id === editingId);
  const exp = {
    id: editingId || uid(),
    amount,
    category: selectedCat,
    date,
    note: $('#fNote').value.trim(),
    createdAt: existing ? existing.createdAt : Date.now(),
    updatedAt: Date.now(),
  };
  try {
    await dbPut(exp);
  } catch (e) {
    err.textContent = 'Could not save: ' + e.message; err.hidden = false; return;
  }
  if (existing) Object.assign(existing, exp); else expenses.push(exp);
  try { localStorage.setItem('lastCat', selectedCat); } catch {}

  // Jump to the month of the saved expense so the user sees it
  const [y, m] = date.split('-').map(Number);
  viewYear = y; viewMonth = m - 1;
  closeSheet();
  render();
  toast(existing ? 'Expense updated' : 'Expense added');
}

async function deleteCurrent() {
  if (!editingId) return;
  if (!confirm('Delete this expense?')) return;
  await dbDelete(editingId);
  expenses = expenses.filter(e => e.id !== editingId);
  closeSheet();
  render();
  toast('Expense deleted');
}

/* ---------- Export / import ---------- */
async function shareOrDownload(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], filename, { type: mime });
  // On iPhone the share sheet lets you "Save to Files", AirDrop, email, etc.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function exportJson() {
  const data = { app: 'expense-tracker', version: 1, exportedAt: new Date().toISOString(), settings, expenses };
  shareOrDownload(`expenses-backup-${todayIso()}.json`, JSON.stringify(data, null, 2), 'application/json');
}
function exportCsv() {
  const q = v => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['Date', 'Category', 'Amount', 'Note']];
  [...expenses].sort((a, b) => a.date.localeCompare(b.date))
    .forEach(e => rows.push([e.date, (catById[e.category] || catById.other).name, e.amount, e.note || '']));
  const csv = '﻿' + rows.map(r => r.map(q).join(',')).join('\r\n');
  shareOrDownload(`expenses-${todayIso()}.csv`, csv, 'text/csv');
}
async function importJson(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data.expenses;
    if (!Array.isArray(list)) throw new Error('No expenses found in file.');
    const clean = list
      .filter(e => e && Number(e.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(e.date))
      .map(e => ({
        id: String(e.id || uid()),
        amount: round2(Number(e.amount)),
        category: catById[e.category] ? e.category : 'other',
        date: e.date,
        note: String(e.note || '').slice(0, 80),
        createdAt: Number(e.createdAt) || Date.now(),
        updatedAt: Number(e.updatedAt) || Date.now(),
      }));
    if (!clean.length) throw new Error('No valid expenses found in file.');
    if (!confirm(`Import ${clean.length} expenses? Existing entries with the same ID will be replaced.`)) return;
    await dbPutMany(clean);
    expenses = await dbGetAll();
    render();
    toast(`Imported ${clean.length} expenses`);
  } catch (e) {
    alert('Import failed: ' + e.message);
  }
}

/* ---------- Settings view ---------- */
function initSettings() {
  const cur = $('#setCurrency');
  const bud = $('#setBudget');
  cur.value = settings.currency;
  bud.value = settings.budget > 0 ? String(settings.budget) : '';
  cur.addEventListener('change', () => {
    settings.currency = cur.value.trim() || '৳';
    cur.value = settings.currency;
    saveSettings(); render();
  });
  bud.addEventListener('change', () => {
    const n = parseAmount(bud.value);
    settings.budget = n > 0 ? n : 0;
    bud.value = settings.budget ? String(settings.budget) : '';
    saveSettings(); render();
  });
  $('#exportJson').addEventListener('click', exportJson);
  $('#exportCsv').addEventListener('click', exportCsv);
  $('#importFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) importJson(f);
    e.target.value = '';
  });
  $('#deleteAll').addEventListener('click', async () => {
    if (!expenses.length) { toast('Nothing to delete'); return; }
    if (!confirm(`Delete all ${expenses.length} expenses? This cannot be undone. Export a backup first if unsure.`)) return;
    await dbClear();
    expenses = [];
    render();
    toast('All expenses deleted');
  });
}

/* ---------- Wire up ---------- */
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  $('#addBtn').hidden = name === 'settings';
  window.scrollTo(0, 0);
}

function bindEvents() {
  $('#prevMonth').addEventListener('click', () => {
    viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; } render();
  });
  $('#nextMonth').addEventListener('click', () => {
    viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; } render();
  });
  $('#addBtn').addEventListener('click', () => openSheet(null));
  $('#list').addEventListener('click', e => {
    const btn = e.target.closest('.item');
    if (btn) openSheet(expenses.find(x => x.id === btn.dataset.id));
  });
  $('#fCats').addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    selectedCat = chip.dataset.cat;
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-checked', String(c === chip)));
  });
  $('#fAmount').addEventListener('input', fitAmount);
  $('#form').addEventListener('submit', saveForm);
  $('#cancelBtn').addEventListener('click', closeSheet);
  $('#deleteBtn').addEventListener('click', deleteCurrent);
  $('#sheet').addEventListener('click', e => { if (e.target === $('#sheet')) closeSheet(); }); // tap backdrop
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
}

async function init() {
  bindEvents();
  initSettings();
  $('#appInfo').textContent = `Expense Tracker v${APP_VERSION} · works offline · data stays on this device`;
  try {
    expenses = await dbGetAll();
  } catch (e) {
    toast('Storage unavailable: ' + e.message);
  }
  render();

  // Ask the browser to keep our data even when storage is low.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // Offline support
  if ('serviceWorker' in navigator) {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
  }
}

init();
