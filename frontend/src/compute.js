import { allocate, periodsForMonthKey } from './periods.js';

/**
 * @typedef {import('./periods.js').Period} Period
 * @typedef {import('./data-activities.js').Destination} Destination
 * @typedef {import('./data-activities.js').Source} Source
 * @typedef {import('./data-activities.js').Allocation} Allocation
 * @typedef {{ paid:boolean, actual:number|null, expected:number }} BillInput
 * @typedef {{ destination:Destination, amount:number, allocations:Allocation[] }} ActivityInput
 * @typedef {Period & { allocation:number, carryIn:number, transferIn:number, out:number, wholeMonthDebit:number, spent:number, remaining:number, completed:boolean, openFunds:boolean }} PeriodView
 * @typedef {{ available:number, billsReserved:number, paidCount:number, billCount:number, spendingPool:number, safeToSpend:number, hasOpenFunds:boolean, periods:PeriodView[] }} MonthView
 * @typedef {import('./data-activities.js').Activity} Activity
 * @typedef {import('./data-envelopes.js').Envelope} Envelope
 * @typedef {Envelope & { balance:number }} EnvelopeView
 * @typedef {{ activityId:string, direction:'in'|'out', amount:number, counterparty:Source[]|Destination, monthKey:string, periodIndex:number, description:string }} HistoryRow
 */

/**
 * @param {Period} period @param {string} monthKey @param {string|undefined} todayKey
 * @returns {boolean} whether the period's end date has passed
 */
function isCompleted(period, monthKey, todayKey) {
  if (!todayKey) { return false; }
  const todayMonth = todayKey.slice(0, 7);
  if (monthKey < todayMonth) { return true; }
  if (monthKey > todayMonth) { return false; }
  return period.endDay < Number(todayKey.slice(8, 10));
}

/** @param {number} idx @param {number} n @param {string} what */
function assertPeriodIndex(idx, n, what) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= n) {
    throw new Error(`computeMonth: ${what} periodIndex ${idx} out of range [0,${n})`);
  }
}

/**
 * Derives the monthly view from primary records: proportional allocation, whole-month
 * debits, transfers, deficit carry (negatives only), safe-to-spend, and open funds.
 * @param {{ monthKey:string, available:number, bills:BillInput[], activities:ActivityInput[], todayKey?:string }} input
 * @returns {MonthView}
 */
export function computeMonth({ monthKey, available, bills, activities, todayKey }) {
  const billsReserved = bills.reduce((sum, b) => sum + (b.paid ? (b.actual ?? 0) : b.expected), 0);
  const paidCount = bills.filter((b) => b.paid).length;
  const spendingPool = available - billsReserved;

  const periods = periodsForMonthKey(monthKey);
  const base = allocate(spendingPool, periods);
  const n = periods.length;
  const out = periods.map(() => 0);
  const spent = periods.map(() => 0);
  const transferIn = periods.map(() => 0);
  const wholeMonthDebit = periods.map(() => 0);

  for (const a of activities) {
    if (a.destination.type === 'period') {
      assertPeriodIndex(a.destination.periodIndex, n, 'destination');
      transferIn[a.destination.periodIndex] += a.amount;
    }
    for (const alloc of a.allocations) {
      const source = alloc.source;
      if (source.type === 'period') {
        assertPeriodIndex(source.periodIndex, n, 'source');
        out[source.periodIndex] += alloc.amount;
        if (a.destination.type === 'spent') { spent[source.periodIndex] += alloc.amount; }
      } else if (source.type === 'wholeMonth') {
        const shares = allocate(alloc.amount, periods);
        for (let i = 0; i < n; i++) { wholeMonthDebit[i] += shares[i]; }
      }
      // 'envelope' and 'outside' sources do not touch period balances
    }
  }

  let carryIn = 0;
  let safeToSpend = 0;
  let hasOpenFunds = false;
  /** @type {PeriodView[]} */
  const periodViews = periods.map((p, i) => {
    const net = base[i] + transferIn[i] - out[i] - wholeMonthDebit[i];
    safeToSpend += net;
    const remaining = net + carryIn;
    const thisCarryIn = carryIn;
    carryIn = Math.min(0, remaining);
    const completed = isCompleted(p, monthKey, todayKey);
    const openFunds = completed && remaining > 0;
    if (openFunds) { hasOpenFunds = true; }
    return {
      ...p,
      allocation: base[i],
      carryIn: thisCarryIn,
      transferIn: transferIn[i],
      out: out[i],
      wholeMonthDebit: wholeMonthDebit[i],
      spent: spent[i],
      remaining,
      completed,
      openFunds,
    };
  });

  return {
    available,
    billsReserved,
    paidCount,
    billCount: bills.length,
    spendingPool,
    safeToSpend,
    hasOpenFunds,
    periods: periodViews,
  };
}

/**
 * Derives every envelope's balance from all activities: +amount when the envelope is the
 * destination, -allocation for each allocation sourced from the envelope. Balances may be negative.
 * @param {Envelope[]} envelopes @param {Activity[]} allActivities @returns {EnvelopeView[]}
 */
export function computeEnvelopes(envelopes, allActivities) {
  /** @type {Map<string, number>} */
  const balance = new Map(envelopes.map((e) => [e.id, 0]));
  for (const a of allActivities) {
    if (a.destination.type === 'envelope') {
      balance.set(a.destination.envelopeId, (balance.get(a.destination.envelopeId) ?? 0) + a.amount);
    }
    for (const alloc of a.allocations) {
      if (alloc.source.type === 'envelope') {
        balance.set(alloc.source.envelopeId, (balance.get(alloc.source.envelopeId) ?? 0) - alloc.amount);
      }
    }
  }
  return envelopes.map((e) => ({ ...e, balance: balance.get(e.id) ?? 0 }));
}

/**
 * Derives one envelope's transaction history. An 'in' row's counterparty is the activity's
 * sources; an 'out' row's counterparty is the activity's destination. Ordered by activity id.
 * @param {string} envelopeId @param {Activity[]} allActivities @returns {HistoryRow[]}
 */
export function computeEnvelopeHistory(envelopeId, allActivities) {
  /** @type {HistoryRow[]} */
  const rows = [];
  for (const a of allActivities) {
    if (a.destination.type === 'envelope' && a.destination.envelopeId === envelopeId) {
      rows.push({
        activityId: a.id, direction: 'in', amount: a.amount,
        counterparty: a.allocations.map((al) => al.source),
        monthKey: a.monthKey, periodIndex: a.periodIndex, description: a.description,
      });
    }
    for (const alloc of a.allocations) {
      if (alloc.source.type === 'envelope' && alloc.source.envelopeId === envelopeId) {
        rows.push({
          activityId: a.id, direction: 'out', amount: alloc.amount,
          counterparty: a.destination,
          monthKey: a.monthKey, periodIndex: a.periodIndex, description: a.description,
        });
      }
    }
  }
  return rows.sort((x, y) => x.activityId.localeCompare(y.activityId));
}
