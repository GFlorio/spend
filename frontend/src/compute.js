import { allocate, periodsForMonthKey } from './periods.js';

/**
 * @typedef {import('./periods.js').Period} Period
 * @typedef {{ paid:boolean, actual:number|null, expected:number }} BillInput
 * @typedef {{ periodIndex:number, amount:number, destination:'spent' }} ActivityInput
 * @typedef {Period & { allocation:number, spent:number, remaining:number }} PeriodView
 * @typedef {{
 *   available:number, billsReserved:number, paidCount:number, billCount:number,
 *   spendingPool:number, safeToSpend:number, periods:PeriodView[]
 * }} MonthView
 */

/**
 * Derives the monthly view from primary records. Pure; no carry in Slice 1.
 * @param {{ monthKey:string, available:number, bills:BillInput[], activities:ActivityInput[] }} input
 * @returns {MonthView}
 */
export function computeMonth({ monthKey, available, bills, activities }) {
  const billsReserved = bills.reduce((sum, b) => sum + (b.paid ? (b.actual ?? 0) : b.expected), 0);
  const paidCount = bills.filter((b) => b.paid).length;
  const spendingPool = available - billsReserved;

  const periods = periodsForMonthKey(monthKey);
  const allocations = allocate(spendingPool, periods);
  const spentByPeriod = periods.map(() => 0);
  let totalExpenses = 0;
  for (const a of activities) {
    if (a.destination === 'spent') {
      spentByPeriod[a.periodIndex] += a.amount;
      totalExpenses += a.amount;
    }
  }

  const periodViews = periods.map((p, i) => ({
    ...p,
    allocation: allocations[i],
    spent: spentByPeriod[i],
    remaining: allocations[i] - spentByPeriod[i],
  }));

  return {
    available,
    billsReserved,
    paidCount,
    billCount: bills.length,
    spendingPool,
    safeToSpend: available - billsReserved - totalExpenses,
    periods: periodViews,
  };
}
