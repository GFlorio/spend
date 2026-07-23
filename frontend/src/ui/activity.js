import { Activities, Envelopes } from '../data.js';
import { formatMoney, parseMoney } from '../money.js';
import { periodsForMonthKey } from '../periods.js';
import { redistributeEqual, removeProportional } from '../split.js';
import * as $ from '../utils.js';
import { describeDestination, describeSource } from './labels.js';

/** @typedef {import('../data.js').Source} Source */
/** @typedef {import('../data.js').Destination} Destination */
/** @typedef {import('../compute.js').MonthView} MonthView */

/** @type {() => Promise<void>} */
let onSaved = async () => {};

const state = {
  /** @type {'create'|'edit'} */ mode: 'create',
  /** @type {string|null} */ editingId: null,
  monthKey: '',
  periodIndex: 0,
  total: 0,
  /** @type {Destination} */ destination: { type: 'spent' },
  /** @type {{ source:Source, amount:number }[]} */ rows: [],
  /** @type {{ id:string, name:string, balance:number }[]} */ envelopes: [],
  /** @type {Map<string,string>} tempId -> name for envelopes created on save */ pending: new Map(),
};

/** @param {string} id */
function envName(id) {
  const found = state.envelopes.find((e) => e.id === id);
  if (found) { return found.name; }
  return state.pending.get(id) ?? '(new envelope)';
}

function periods() { return periodsForMonthKey(state.monthKey); }

/** @param {Source} a @param {Source} b */
function sameRef(a, b) {
  if (a.type !== b.type) { return false; }
  if (a.type === 'period' && b.type === 'period') { return a.periodIndex === b.periodIndex; }
  if (a.type === 'envelope' && b.type === 'envelope') { return a.envelopeId === b.envelopeId; }
  return true; // wholeMonth / outside are singletons
}

/** Keep allocations valid: single source mirrors total; last source absorbs the remainder. */
function normalize() {
  const rows = state.rows;
  const n = rows.length;
  if (n === 1) { rows[0].amount = state.total; return; }
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    rows[i].amount = Math.max(0, Math.min(rows[i].amount, state.total - acc));
    acc += rows[i].amount;
  }
  rows[n - 1].amount = state.total - acc;
}

/** @returns {boolean} whether the destination is an envelope that also appears as a source */
function destinationConflicts() {
  if (state.destination.type !== 'envelope' && state.destination.type !== 'period') { return false; }
  /** @type {Source} */
  const asSource = state.destination.type === 'envelope'
    ? { type: 'envelope', envelopeId: state.destination.envelopeId }
    : { type: 'period', periodIndex: state.destination.periodIndex };
  return state.rows.some((r) => sameRef(r.source, asSource));
}

function isValid() {
  return state.total > 0 && !destinationConflicts();
}

function render() {
  renderDestination();
  renderSources();
  renderBar();
  renderProjection();
  $.html($.id('activityTitle')).textContent = state.destination.type === 'spent' ? 'Add expense' : 'Move money';
  const error = destinationConflicts() ? 'A source cannot equal the destination.' : '';
  $.html($.id('activityError')).textContent = error;
  $.button($.id('activitySave')).disabled = !isValid();
}

function renderDestination() {
  const select = /** @type {HTMLSelectElement} */ ($.id('activityDestination'));
  select.innerHTML = '';
  /** @param {string} value @param {string} label @param {boolean} selected */
  const add = (value, label, selected) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label; opt.selected = selected;
    select.append(opt);
  };
  add('spent', 'Spent', state.destination.type === 'spent');
  periods().forEach((_, i) => { add(`period:${i}`, describeDestination({ type: 'period', periodIndex: i }, envName, periods()), state.destination.type === 'period' && state.destination.periodIndex === i); });
  for (const e of state.envelopes) { add(`envelope:${e.id}`, e.name, state.destination.type === 'envelope' && state.destination.envelopeId === e.id); }
  add('new-envelope', '＋ New envelope', false);
}

function renderSources() {
  const container = $.html($.id('activitySources'));
  container.innerHTML = '';
  state.rows.forEach((row, i) => {
    const isLast = i === state.rows.length - 1;
    const rowEl = document.createElement('div');
    rowEl.className = 'source-row';

    const label = document.createElement('span');
    label.className = 'source-name';
    label.textContent = describeSource(row.source, envName, periods());

    const amount = document.createElement('input');
    amount.type = 'text';
    amount.inputMode = 'decimal';
    amount.className = 'source-amount';
    amount.value = (row.amount / 100).toFixed(2);
    amount.disabled = isLast; // last is derived; the sole row mirrors the total
    amount.setAttribute('aria-label', `${label.textContent} amount`);
    amount.addEventListener('input', () => {
      const parsed = parseMoney(amount.value);
      row.amount = parsed === null ? 0 : Math.max(0, parsed);
      normalize();
      render();
    });

    rowEl.append(label, amount);
    if (state.rows.length > 1) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn ghost small source-remove';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `Remove ${label.textContent}`);
      remove.addEventListener('click', () => {
        const amounts = state.rows.map((r) => r.amount);
        const next = removeProportional(amounts, i, state.total);
        state.rows.splice(i, 1);
        state.rows.forEach((r, j) => { r.amount = next[j]; });
        normalize();
        render();
      });
      rowEl.append(remove);
    }
    container.append(rowEl);
  });
}

function renderBar() {
  const bar = $.html($.id('activityBar'));
  bar.innerHTML = '';
  const total = state.total || 1;
  state.rows.forEach((row, i) => {
    const seg = document.createElement('div');
    seg.className = `alloc-seg alloc-seg-${i % 4}`;
    seg.style.width = `${Math.max(0, (row.amount / total) * 100)}%`;
    bar.append(seg);
  });
}

function renderProjection() {
  const el = $.html($.id('activityProjection'));
  /** @type {string[]} */
  const lines = [];
  const destination = state.destination;
  if (destination.type === 'envelope') {
    const e = state.envelopes.find((x) => x.id === destination.envelopeId);
    if (e) { lines.push(`${e.name}: ${formatMoney(e.balance)} → ${formatMoney(e.balance + state.total)}`); }
  }
  for (const row of state.rows) {
    const source = row.source;
    if (source.type === 'envelope') {
      const e = state.envelopes.find((x) => x.id === source.envelopeId);
      if (e) { lines.push(`${e.name}: ${formatMoney(e.balance)} → ${formatMoney(e.balance - row.amount)}`); }
    }
  }
  el.textContent = lines.join('  ·  ');
}

/** @returns {Source|null} prompt for a new envelope, returning a pending source */
function newEnvelopeSource() {
  const name = prompt('New envelope name')?.trim();
  if (!name) { return null; }
  const tempId = `new:${state.pending.size}:${name}`;
  state.pending.set(tempId, name);
  return { type: 'envelope', envelopeId: tempId };
}

function addSource() {
  const used = state.rows.map((r) => r.source);
  /** @type {Source[]} */
  const candidates = [];
  periods().forEach((_, i) => { candidates.push({ type: 'period', periodIndex: i }); });
  candidates.push({ type: 'wholeMonth' });
  for (const e of state.envelopes) { candidates.push({ type: 'envelope', envelopeId: e.id }); }
  if (state.destination.type === 'envelope') { candidates.push({ type: 'outside' }); }
  /** @type {Source|null} */
  let asSource = null;
  if (state.destination.type === 'envelope') { asSource = { type: 'envelope', envelopeId: state.destination.envelopeId }; }
  else if (state.destination.type === 'period') { asSource = { type: 'period', periodIndex: state.destination.periodIndex }; }
  const available = candidates.filter((c) => !used.some((u) => sameRef(u, c)) && !(asSource && sameRef(asSource, c)));

  // Build a tiny picker via prompt of numbered options plus new-envelope.
  const labels = available.map((c, i) => `${i + 1}. ${describeSource(c, envName, periods())}`);
  const choice = prompt(`Add source:\n${labels.join('\n')}\n\nEnter a number, or "new" for a new envelope`);
  if (!choice) { return; }
  /** @type {Source|null} */
  let source = null;
  if (choice.trim().toLowerCase() === 'new') { source = newEnvelopeSource(); }
  else { const idx = Number(choice) - 1; source = available[idx] ?? null; }
  if (!source) { return; }
  state.rows.push({ source, amount: 0 });
  const even = redistributeEqual(state.total, state.rows.length);
  state.rows.forEach((r, i) => { r.amount = even[i]; });
  normalize();
  render();
}

/** @param {string} value the destination <select> value */
function onDestinationChange(value) {
  if (value === 'new-envelope') {
    const name = prompt('New envelope name')?.trim();
    if (!name) { render(); return; }
    const tempId = `new:${state.pending.size}:${name}`;
    state.pending.set(tempId, name);
    state.destination = { type: 'envelope', envelopeId: tempId };
  } else if (value === 'spent') {
    state.destination = { type: 'spent' };
  } else if (value.startsWith('period:')) {
    state.destination = { type: 'period', periodIndex: Number(value.slice('period:'.length)) };
  } else if (value.startsWith('envelope:')) {
    state.destination = { type: 'envelope', envelopeId: value.slice('envelope:'.length) };
  }
  // Drop any source that now equals the destination (keep at least one).
  if (destinationConflicts() && state.rows.length > 1) {
    const asSource = state.destination.type === 'envelope'
      ? { type: 'envelope', envelopeId: state.destination.envelopeId }
      : state.destination;
    const idx = state.rows.findIndex((r) => sameRef(r.source, /** @type {Source} */ (asSource)));
    if (idx >= 0) {
      const amounts = state.rows.map((r) => r.amount);
      const next = removeProportional(amounts, idx, state.total);
      state.rows.splice(idx, 1);
      state.rows.forEach((r, j) => { r.amount = next[j]; });
    }
  }
  normalize();
  render();
}

async function save() {
  if (!isValid()) { return; }
  // Only materialise pending envelopes still referenced by the destination or a source.
  /** @type {Set<string>} */
  const referenced = new Set();
  if (state.destination.type === 'envelope' && state.pending.has(state.destination.envelopeId)) {
    referenced.add(state.destination.envelopeId);
  }
  for (const row of state.rows) {
    if (row.source.type === 'envelope' && state.pending.has(row.source.envelopeId)) {
      referenced.add(row.source.envelopeId);
    }
  }
  /** @type {Map<string,string>} tempId -> realId */
  const idMap = new Map();
  for (const [tempId, name] of state.pending) {
    if (!referenced.has(tempId)) { continue; }
    const created = await Envelopes.create({ name });
    idMap.set(tempId, created.id);
  }
  /** @param {Source} s @returns {Source} */
  const fixSource = (s) => (s.type === 'envelope' && idMap.has(s.envelopeId) ? { type: 'envelope', envelopeId: idMap.get(s.envelopeId) ?? s.envelopeId } : s);
  /** @type {Destination} */
  let destination = state.destination;
  if (destination.type === 'envelope' && idMap.has(destination.envelopeId)) { destination = { type: 'envelope', envelopeId: idMap.get(destination.envelopeId) ?? destination.envelopeId }; }
  const allocations = state.rows.map((r) => ({ source: fixSource(r.source), amount: r.amount }));
  const description = $.input($.id('activityDescription')).value.trim();

  if (state.mode === 'edit' && state.editingId) {
    await Activities.update(state.editingId, { destination, amount: state.total, description, allocations });
  } else {
    await Activities.create({ monthKey: state.monthKey, periodIndex: state.periodIndex, destination, amount: state.total, description, allocations });
  }
  $.dialog($.id('activityDialog')).close();
  await onSaved();
}

async function loadEnvelopes() {
  state.envelopes = await Envelopes.withBalances();
}

/** @param {{ monthKey:string, periodIndex:number, view:MonthView, preset?:{destination:Destination, amount:number} }} opts */
export async function openActivityCreate({ monthKey, periodIndex, preset }) {
  state.mode = 'create';
  state.editingId = null;
  state.monthKey = monthKey;
  state.periodIndex = periodIndex;
  state.pending = new Map();
  state.destination = preset?.destination ?? { type: 'spent' };
  state.total = preset?.amount ?? 0;
  state.rows = [{ source: { type: 'period', periodIndex }, amount: state.total }];
  await loadEnvelopes();
  $.input($.id('activityAmount')).value = state.total > 0 ? (state.total / 100).toFixed(2) : '';
  $.input($.id('activityDescription')).value = '';
  render();
  $.dialog($.id('activityDialog')).showModal();
  $.input($.id('activityAmount')).focus();
}

/** @param {{ monthKey:string, view:MonthView, activity:import('../data.js').Activity }} opts */
export async function openActivityEdit({ monthKey, activity }) {
  state.mode = 'edit';
  state.editingId = activity.id;
  state.monthKey = monthKey;
  state.periodIndex = activity.periodIndex;
  state.pending = new Map();
  state.destination = activity.destination;
  state.total = activity.amount;
  state.rows = activity.allocations.map((a) => ({ source: a.source, amount: a.amount }));
  await loadEnvelopes();
  $.input($.id('activityAmount')).value = (state.total / 100).toFixed(2);
  $.input($.id('activityDescription')).value = activity.description;
  render();
  $.dialog($.id('activityDialog')).showModal();
  $.input($.id('activityAmount')).focus();
}

/** @param {() => Promise<void>} saved */
export function setupActivity(saved) {
  onSaved = saved;
  const dlg = $.dialog($.id('activityDialog'));
  $.button($.id('activityClose')).addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) { dlg.close(); } });

  $.input($.id('activityAmount')).addEventListener('input', () => {
    const parsed = parseMoney($.input($.id('activityAmount')).value);
    state.total = parsed === null ? 0 : Math.max(0, parsed);
    normalize();
    render();
  });

  $.id('activityDestination').addEventListener('change', (e) => {
    onDestinationChange(/** @type {HTMLSelectElement} */ (e.target).value);
  });

  $.button($.id('activityAddSource')).addEventListener('click', () => addSource());

  $.form($.id('activityForm')).addEventListener('submit', (e) => {
    e.preventDefault();
    void save();
  });
}
