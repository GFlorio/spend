import { Activities, Envelopes } from '../data.js';
import { formatEditableMoney, formatMoney } from '../money.js';
import { periodsForMonthKey } from '../periods.js';
import { activityTotal, redistributeEqual, removeProportional, setBoundary } from '../split.js';
import * as $ from '../utils.js';
import { inputSheet, pickList } from './dialogs.js';
import { describeDestination, describeSource } from './labels.js';
import { setupMoneyField } from './money-field.js';

/** @typedef {import('../data.js').Source} Source */
/** @typedef {import('../data.js').Destination} Destination */

/** @type {() => Promise<void>} */
let onSaved = async () => {};
/** @type {ReturnType<typeof setupMoneyField>|null} */
let totalField = null;
/** @type {ReturnType<typeof setupMoneyField>[]} */
let sourceFields = [];

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
  /** @type {import('../data.js').Activity|null} the persisted activity being edited, for projection baselines */ originalActivity: null,
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

function render() {
  renderDestination();
  renderSources();
  renderBar();
  renderProjection();
  $.html($.id('activityTitle')).textContent = state.destination.type === 'spent' ? 'Add expense' : 'Move money';
  const error = destinationConflicts() ? 'A source cannot equal the destination.' : '';
  $.html($.id('activityError')).textContent = error;
  $.button($.id('activityDelete')).classList.toggle('hidden', state.mode !== 'edit');
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
  // Envelopes created inline (as destination or source) live only in `pending` until save; list them too so a pending destination stays selected.
  for (const [tempId, name] of state.pending) { add(`envelope:${tempId}`, name, state.destination.type === 'envelope' && state.destination.envelopeId === tempId); }
  add('new-envelope', '＋ New envelope', false);
}

function renderSources() {
  const container = $.html($.id('activitySources'));
  container.innerHTML = '';
  sourceFields = [];
  let allocatedBefore = 0;
  state.rows.forEach((row, i) => {
    const isLast = i === state.rows.length - 1;
    const rowEl = document.createElement('div');
    rowEl.className = 'source-row';

    const label = document.createElement('span');
    label.className = 'source-name';
    label.textContent = describeSource(row.source, envName, periods());

    const amount = document.createElement('input');
    amount.className = 'source-amount';
    amount.disabled = isLast; // last is derived; the sole row mirrors the total
    amount.setAttribute('aria-label', `${label.textContent} amount`);
    const value = document.createElement('div');
    value.className = 'source-value';
    value.append(amount);
    rowEl.append(label, value);
    const field = setupMoneyField(amount, {
      required: true,
      maximum: state.total - allocatedBefore,
      onInput: (parsed) => {
        if (parsed === null) { return; }
        row.amount = parsed;
        normalize();
        syncAllocUI(amount);
      },
    });
    field.setValue(row.amount);
    sourceFields.push(field);
    allocatedBefore += row.amount;
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

/**
 * Renders the split-allocation bar: a segmented track plus a draggable handle at each
 * internal divider. Hidden when there is a single source (nothing to split).
 */
function renderBar() {
  const bar = $.html($.id('activityBar'));
  bar.innerHTML = '';
  const multi = state.rows.length > 1 && state.total > 0;
  bar.classList.toggle('hidden', !multi);
  if (!multi) { return; }
  const total = state.total;

  const track = document.createElement('div');
  track.className = 'alloc-track';
  state.rows.forEach((row, i) => {
    const seg = document.createElement('div');
    seg.className = `alloc-seg alloc-seg-${i % 4}`;
    seg.style.width = `${Math.max(0, (row.amount / total) * 100)}%`;
    track.append(seg);
  });
  bar.append(track);

  let cum = 0;
  state.rows.forEach((row, i) => {
    cum += row.amount;
    if (i >= state.rows.length - 1) { return; } // no handle past the last segment
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'alloc-handle';
    handle.style.left = `${(cum / total) * 100}%`;
    handle.setAttribute('role', 'slider');
    handle.setAttribute('aria-label', `Split between ${describeSource(state.rows[i].source, envName, periods())} and ${describeSource(state.rows[i + 1].source, envName, periods())}`);
    handle.setAttribute('aria-valuemin', '0');
    handle.setAttribute('aria-valuemax', String(total));
    handle.setAttribute('aria-valuenow', String(cum));
    attachHandle(handle, i);
    bar.append(handle);
  });
}

/**
 * Live-updates segment widths, handle positions, source inputs, and the projection during
 * a drag or key press, without rebuilding the DOM (which would drop focus / pointer capture).
 * @param {HTMLInputElement} [editingInput] input whose in-progress text should be preserved
 */
function syncAllocUI(editingInput) {
  const bar = $.html($.id('activityBar'));
  const total = state.total || 1;
  const segs = $.arr('.alloc-seg', bar);
  const handles = $.arr('.alloc-handle', bar);
  const inputs = $.arr('.source-amount', $.html($.id('activitySources')));
  let cum = 0;
  state.rows.forEach((row, i) => {
    if (segs[i]) { $.html(segs[i]).style.width = `${Math.max(0, (row.amount / total) * 100)}%`; }
    if (inputs[i] instanceof HTMLInputElement && inputs[i] !== editingInput) {
      inputs[i].value = formatEditableMoney(row.amount);
    }
    cum += row.amount;
    const handle = handles[i];
    if (handle) { $.html(handle).style.left = `${(cum / total) * 100}%`; handle.setAttribute('aria-valuenow', String(cum)); }
  });
  renderProjection();
}

/**
 * Wires pointer-drag and keyboard control for the divider at index `i`. Dragging or arrowing
 * moves money between sources `i` and `i+1` via setBoundary; a full re-render runs on release.
 * @param {HTMLButtonElement} handle @param {number} i
 */
function attachHandle(handle, i) {
  const bar = $.html($.id('activityBar'));
  /** @param {number} cumTarget */
  const applyTo = (cumTarget) => {
    const amounts = setBoundary(state.rows.map((r) => r.amount), i, cumTarget);
    state.rows.forEach((r, k) => { r.amount = amounts[k]; });
    syncAllocUI();
  };
  handle.addEventListener('pointerdown', (e) => { e.preventDefault(); handle.setPointerCapture(e.pointerId); });
  handle.addEventListener('pointermove', (e) => {
    if (!handle.hasPointerCapture(e.pointerId)) { return; }
    const rect = bar.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    applyTo(Math.round(frac * state.total));
  });
  handle.addEventListener('pointerup', (e) => { handle.releasePointerCapture(e.pointerId); render(); });
  handle.addEventListener('keydown', (e) => {
    const step = Math.max(1, Math.round(state.total / 100));
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -step : 0;
    if (!delta) { return; }
    e.preventDefault();
    let cum = 0;
    for (let k = 0; k <= i; k++) { cum += state.rows[k].amount; }
    applyTo(cum + delta);
  });
}

/**
 * The given envelope's contribution from the activity currently being edited (0 in create
 * mode, or when the original activity doesn't reference this envelope). Used to back out
 * this activity's own persisted effect from `balance` so the projection shows a correct
 * before/after for the activity being edited, instead of double-counting it.
 * @param {string} envelopeId
 */
function originalContribution(envelopeId) {
  const original = state.originalActivity;
  if (!original) { return 0; }
  let contribution = 0;
  if (original.destination.type === 'envelope' && original.destination.envelopeId === envelopeId) {
    contribution += activityTotal(original.allocations);
  }
  for (const alloc of original.allocations) {
    if (alloc.source.type === 'envelope' && alloc.source.envelopeId === envelopeId) {
      contribution -= alloc.amount;
    }
  }
  return contribution;
}

function renderProjection() {
  const el = $.html($.id('activityProjection'));
  /** @type {string[]} */
  const lines = [];
  const destination = state.destination;
  if (destination.type === 'envelope') {
    const e = state.envelopes.find((x) => x.id === destination.envelopeId);
    if (e) {
      const baseline = e.balance - originalContribution(e.id);
      lines.push(`${e.name}: ${formatMoney(baseline)} → ${formatMoney(baseline + state.total)}`);
    }
  }
  for (const row of state.rows) {
    const source = row.source;
    if (source.type === 'envelope') {
      const e = state.envelopes.find((x) => x.id === source.envelopeId);
      if (e) {
        const baseline = e.balance - originalContribution(e.id);
        lines.push(`${e.name}: ${formatMoney(baseline)} → ${formatMoney(baseline - row.amount)}`);
      }
    }
  }
  el.textContent = lines.join('  ·  ');
}

/** @returns {Promise<Source|null>} ask for a new envelope, returning a pending source */
async function newEnvelopeSource() {
  const values = await inputSheet({
    title: 'New envelope',
    fields: [{ name: 'name', label: 'Envelope name', required: true }],
    confirmLabel: 'Create',
  });
  if (!values) { return null; }
  const name = /** @type {string} */ (values.name);
  const tempId = `new:${state.pending.size}:${name}`;
  state.pending.set(tempId, name);
  return { type: 'envelope', envelopeId: tempId };
}

async function addSource() {
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

  /** @type {Array<{ label:string, value:Source|'new' }>} */
  const options = available.map((c) => ({ label: describeSource(c, envName, periods()), value: c }));
  options.push({ label: '＋ New envelope', value: 'new' });
  const choice = await pickList({ title: 'Add source', options });
  if (!choice) { return; }
  const source = choice === 'new' ? await newEnvelopeSource() : choice;
  if (!source) { return; }
  state.rows.push({ source, amount: 0 });
  const even = redistributeEqual(state.total, state.rows.length);
  state.rows.forEach((r, i) => { r.amount = even[i]; });
  normalize();
  render();
}

/** @param {string} value the destination <select> value */
async function onDestinationChange(value) {
  if (value === 'new-envelope') {
    const values = await inputSheet({
      title: 'New envelope',
      fields: [{ name: 'name', label: 'Envelope name', required: true }],
      confirmLabel: 'Create',
    });
    if (!values) { render(); return; }
    const name = /** @type {string} */ (values.name);
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
  const total = totalField?.read({ report: true }) ?? null;
  if (total === null) {
    totalField?.focus();
    return;
  }
  const invalidSource = sourceFields.find((field) => field.read({ report: true }) === null);
  if (invalidSource) {
    invalidSource.focus();
    return;
  }
  if (destinationConflicts()) { return; }
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
    await Activities.update(state.editingId, { destination, description, allocations });
  } else {
    await Activities.create({ monthKey: state.monthKey, periodIndex: state.periodIndex, destination, description, allocations });
  }
  $.dialog($.id('activityDialog')).close();
  await onSaved();
}

async function loadEnvelopes() {
  state.envelopes = await Envelopes.withBalances();
}

/** @param {{ monthKey:string, periodIndex:number, preset?:{destination:Destination, amount:number} }} opts */
export async function openActivityCreate({ monthKey, periodIndex, preset }) {
  state.mode = 'create';
  state.editingId = null;
  state.monthKey = monthKey;
  state.periodIndex = periodIndex;
  state.pending = new Map();
  state.originalActivity = null;
  state.destination = preset?.destination ?? { type: 'spent' };
  state.total = preset?.amount ?? 0;
  state.rows = [{ source: { type: 'period', periodIndex }, amount: state.total }];
  await loadEnvelopes();
  totalField?.setValue(state.total > 0 ? state.total : null);
  $.input($.id('activityDescription')).value = '';
  render();
  $.dialog($.id('activityDialog')).showModal();
  $.input($.id('activityAmount')).focus();
}

/** @param {{ monthKey:string, activity:import('../data.js').Activity }} opts */
export async function openActivityEdit({ monthKey, activity }) {
  state.mode = 'edit';
  state.editingId = activity.id;
  state.monthKey = monthKey;
  state.periodIndex = activity.periodIndex;
  state.pending = new Map();
  state.originalActivity = activity;
  state.destination = activity.destination;
  state.total = activityTotal(activity.allocations);
  state.rows = activity.allocations.map((a) => ({ source: a.source, amount: a.amount }));
  await loadEnvelopes();
  totalField?.setValue(state.total);
  $.input($.id('activityDescription')).value = activity.description;
  render();
  $.dialog($.id('activityDialog')).showModal();
  $.input($.id('activityAmount')).focus();
}

/** @param {() => Promise<void>} saved */
export function setupActivity(saved) {
  onSaved = saved;
  totalField = setupMoneyField($.input($.id('activityAmount')), {
    required: true,
    minimum: 1,
    onInput: (parsed) => {
      state.total = parsed ?? 0;
      normalize();
      render();
    },
  });
  const dlg = $.dialog($.id('activityDialog'));
  $.button($.id('activityClose')).addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) { dlg.close(); } });

  $.id('activityDestination').addEventListener('change', (e) => {
    void onDestinationChange(/** @type {HTMLSelectElement} */ (e.target).value);
  });

  $.button($.id('activityAddSource')).addEventListener('click', () => { void addSource(); });

  $.form($.id('activityForm')).addEventListener('submit', (e) => {
    e.preventDefault();
    void save();
  });

  $.button($.id('activityDelete')).addEventListener('click', () => {
    void (async () => {
      if (state.mode !== 'edit' || !state.editingId) { return; }
      await Activities.remove(state.editingId);
      $.dialog($.id('activityDialog')).close();
      await onSaved();
    })();
  });
}
