import { describe, expect, test } from 'vitest';
import { computeMonth } from '../compute.js';

const base = { monthKey: '2026-07', available: 300000, bills: [], activities: [] };
/** @param {number} periodIndex @param {number} amount @returns {import('../compute.js').ActivityInput} */
const expense = (periodIndex, amount) => ({
  destination: { type: 'spent' }, amount,
  allocations: [{ source: { type: 'period', periodIndex }, amount }],
});

describe('computeMonth — bills + pool', () => {
  test('reserves expected for unpaid and actual for paid bills', () => {
    const view = computeMonth({
      ...base,
      bills: [
        { paid: true, actual: 120000, expected: 118000 },
        { paid: false, actual: null, expected: 8000 },
      ],
    });
    expect(view.billsReserved).toBe(128000);
    expect(view.paidCount).toBe(1);
    expect(view.spendingPool).toBe(172000);
    expect(view.safeToSpend).toBe(172000);
    expect(view.periods.reduce((s, p) => s + p.allocation, 0)).toBe(172000);
  });
});

describe('computeMonth — expenses', () => {
  test('period-sourced expenses reduce that period and safe-to-spend', () => {
    const view = computeMonth({ ...base, activities: [expense(2, 5000), expense(2, 1500)] });
    expect(view.periods[2].spent).toBe(6500);
    expect(view.periods[2].remaining).toBe(view.periods[2].allocation - 6500);
    expect(view.safeToSpend).toBe(300000 - 6500);
  });
});

describe('computeMonth — deficit carry (PER-5/6)', () => {
  test('a negative balance reduces the next period only (positives do not carry)', () => {
    // July base per period ~ [67741,67741,67741,67741,29036] for 300000 pool.
    const view = computeMonth({ ...base, activities: [expense(0, 80000)] });
    expect(view.periods[0].remaining).toBeLessThan(0);
    const deficit = view.periods[0].remaining; // negative
    expect(view.periods[1].carryIn).toBe(deficit);
    expect(view.periods[1].remaining).toBe(view.periods[1].allocation + deficit);
    // period 2 is positive and does NOT carry into period 3
    expect(view.periods[3].carryIn).toBe(0);
  });

  test('safe-to-spend is the sum of pre-carry nets, NOT the sum of displayed balances', () => {
    const view = computeMonth({ ...base, activities: [expense(0, 80000)] });
    const sumDisplayed = view.periods.reduce((s, p) => s + p.remaining, 0);
    expect(view.safeToSpend).toBe(300000 - 80000);
    expect(view.safeToSpend).not.toBe(sumDisplayed); // carry double-counts the deficit
  });

  test('final-period deficit remains as a month-end overrun', () => {
    const view = computeMonth({ ...base, activities: [expense(4, 60000)] });
    expect(view.periods[4].remaining).toBeLessThan(0);
  });
});

describe('computeMonth — transfers between periods', () => {
  test('period-to-period transfer moves money without changing safe-to-spend', () => {
    const view = computeMonth({
      ...base,
      activities: [{
        destination: { type: 'period', periodIndex: 1 }, amount: 10000,
        allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 10000 }],
      }],
    });
    expect(view.periods[0].out).toBe(10000);
    expect(view.periods[1].transferIn).toBe(10000);
    expect(view.safeToSpend).toBe(300000); // internal move
  });
});

describe('computeMonth — whole-month envelope funding (TRX-6)', () => {
  test('debits every period proportionally and is not counted as spending', () => {
    const view = computeMonth({
      ...base,
      activities: [{
        destination: { type: 'envelope', envelopeId: 'env:t' }, amount: 31000,
        allocations: [{ source: { type: 'wholeMonth' }, amount: 31000 }],
      }],
    });
    const debited = view.periods.reduce((s, p) => s + p.allocation - p.remaining - p.spent, 0);
    // whole-month debit removed 31000 from the pool across periods
    expect(view.safeToSpend).toBe(300000 - 31000);
    expect(view.periods.every((p) => p.spent === 0)).toBe(true); // funding is not spending
    expect(debited).toBe(31000);
  });
});

describe('computeMonth — open funds (PER-8)', () => {
  test('past month: every positive period is completed and open', () => {
    const view = computeMonth({ ...base, monthKey: '2026-05', todayKey: '2026-07-10', available: 300000 });
    expect(view.periods.every((p) => p.completed)).toBe(true);
    expect(view.hasOpenFunds).toBe(true);
  });
  test('current month: only periods that have ended are completed', () => {
    const view = computeMonth({ ...base, monthKey: '2026-07', todayKey: '2026-07-10' });
    // day 10 -> periods ending before day 10 are completed (1-7 done; 8-14 not yet)
    expect(view.periods[0].completed).toBe(true);
    expect(view.periods[1].completed).toBe(false);
  });
  test('without todayKey no period is completed', () => {
    const view = computeMonth({ ...base });
    expect(view.periods.some((p) => p.completed)).toBe(false);
    expect(view.hasOpenFunds).toBe(false);
  });
});

describe('computeMonth — determinism', () => {
  test('idempotent for identical inputs', () => {
    const input = { ...base, activities: [expense(1, 4200)] };
    expect(computeMonth(input)).toEqual(computeMonth(input));
  });
});
