import { describe, expect, test } from 'vitest';
import { computeMonth } from '../compute.js';

const base = { monthKey: '2026-07', available: 300000, bills: [], activities: [] };

describe('computeMonth', () => {
  test('reserves expected for unpaid bills and actual for paid bills', () => {
    const view = computeMonth({
      ...base,
      bills: [
        { paid: true, actual: 120000, expected: 118000 },
        { paid: false, actual: null, expected: 8000 },
      ],
    });
    expect(view.billsReserved).toBe(128000);
    expect(view.paidCount).toBe(1);
    expect(view.billCount).toBe(2);
    expect(view.spendingPool).toBe(172000);
    expect(view.safeToSpend).toBe(172000);
  });

  test('period allocations sum to the spending pool', () => {
    const view = computeMonth({ ...base, bills: [{ paid: false, actual: null, expected: 100000 }] });
    expect(view.periods.reduce((s, p) => s + p.allocation, 0)).toBe(view.spendingPool);
  });

  test('expenses reduce the originating period and safe-to-spend', () => {
    const view = computeMonth({
      ...base,
      activities: [
        { periodIndex: 2, amount: 5000, destination: 'spent' },
        { periodIndex: 2, amount: 1500, destination: 'spent' },
      ],
    });
    expect(view.periods[2].spent).toBe(6500);
    expect(view.periods[2].remaining).toBe(view.periods[2].allocation - 6500);
    expect(view.safeToSpend).toBe(300000 - 6500);
  });

  test('safe-to-spend equals the sum of period remaining when there is no carry', () => {
    const view = computeMonth({
      ...base,
      bills: [{ paid: false, actual: null, expected: 40000 }],
      activities: [{ periodIndex: 0, amount: 3000, destination: 'spent' }],
    });
    expect(view.safeToSpend).toBe(view.periods.reduce((s, p) => s + p.remaining, 0));
  });

  test('is idempotent for identical inputs', () => {
    const input = { ...base, bills: [{ paid: true, actual: 9999, expected: 9000 }] };
    expect(computeMonth(input)).toEqual(computeMonth(input));
  });
});
