import { Envelopes } from '../data.js';
import { formatMoney } from '../money.js';
import { periodsForMonthKey } from '../periods.js';
import * as $ from '../utils.js';
import { describeDestination, describeSource, periodRange } from './labels.js';
import { monthLabel } from './month.js';

/** @param {(id:string)=>string} nameOf @param {import('../compute.js').HistoryRow} row */
function counterpartyText(nameOf, row) {
  const periods = periodsForMonthKey(row.monthKey);
  if (row.direction === 'in') {
    const sources = /** @type {import('../data.js').Source[]} */ (row.counterparty);
    return sources.map((s) => describeSource(s, nameOf, periods)).join(' + ');
  }
  return describeDestination(/** @type {import('../data.js').Destination} */ (row.counterparty), nameOf, periods);
}

/** Render the envelope overview list (hides the detail view). */
export async function renderEnvelopes() {
  const envelopes = await Envelopes.withBalances();
  $.html($.id('envelopeDetail')).classList.add('hidden');
  $.html($.id('envelopeOverview')).classList.remove('hidden');
  const list = $.html($.id('envelopeList'));
  list.innerHTML = '';
  $.html($.id('envelopeEmpty')).classList.toggle('hidden', envelopes.length > 0);
  for (const e of envelopes) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn envelope-row';
    const sign = e.balance < 0 ? 'negative' : e.balance === 0 ? 'zero' : 'positive';
    const name = document.createElement('span');
    name.className = 'envelope-name';
    name.textContent = e.name;
    const bal = document.createElement('span');
    bal.className = `envelope-balance ${sign}`;
    bal.textContent = e.balance < 0 ? `−${formatMoney(-e.balance)}` : formatMoney(e.balance);
    btn.append(name, bal);
    btn.addEventListener('click', () => { void renderEnvelopeDetail(e.id); });
    li.append(btn);
    list.append(li);
  }
}

/** @param {string} envelopeId */
async function renderEnvelopeDetail(envelopeId) {
  const [envelopes, rows] = await Promise.all([Envelopes.withBalances(), Envelopes.history(envelopeId)]);
  const env = envelopes.find((e) => e.id === envelopeId);
  if (!env) { return; }
  /** @type {(id: string) => string} */
  const nameOf = (id) => envelopes.find((e) => e.id === id)?.name ?? '(unknown)';

  $.html($.id('envelopeOverview')).classList.add('hidden');
  $.html($.id('envelopeDetail')).classList.remove('hidden');
  $.html($.id('envelopeDetailName')).textContent = env.name;
  $.html($.id('envelopeDetailBalance')).textContent = env.balance < 0 ? `−${formatMoney(-env.balance)}` : formatMoney(env.balance);

  const list = $.html($.id('envelopeHistory'));
  list.innerHTML = '';
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'history-row';
    const sign = row.direction === 'in' ? '+' : '−';
    const context = `${monthLabel(row.monthKey)} · ${periodRange(periodsForMonthKey(row.monthKey), row.periodIndex)}`;
    const label = row.direction === 'in' ? `From ${counterpartyText(nameOf, row)}` : `To ${counterpartyText(nameOf, row)}`;
    const amountSpan = document.createElement('span');
    amountSpan.className = `history-amount ${row.direction}`;
    amountSpan.textContent = `${sign}${formatMoney(row.amount)}`;
    const labelSpan = document.createElement('span');
    labelSpan.className = 'history-label';
    labelSpan.textContent = `${label}${row.description ? ` — ${row.description}` : ''}`;
    const contextSpan = document.createElement('span');
    contextSpan.className = 'history-context';
    contextSpan.textContent = context;
    li.append(amountSpan, labelSpan, contextSpan);
    list.append(li);
  }
}

/** Wire the back button once. */
export function setupEnvelopes() {
  $.button($.id('envelopeBack')).addEventListener('click', () => { void renderEnvelopes(); });
}
