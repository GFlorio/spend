import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import { computeMonth } from '../../compute.js';
import { Activities, Bills, Months } from '../../data.js';
import { addExpense, resetTestDB } from './helpers.js';

beforeEach(resetTestDB);

/** Rebuild the derived monthly view from stored records. @param {string} monthKey */
async function viewFor(monthKey) {
  const month = await Months.get(monthKey);
  if (!month) { throw new Error(`Month ${monthKey} not found`); }
  const bills = await Bills.listForMonth(monthKey);
  const activities = await Activities.listForMonth(monthKey);
  return computeMonth({
    monthKey,
    available: month.available,
    bills: bills.map((b) => ({ paid: b.paid, actual: b.actual, expected: b.expected })),
    activities,
  });
}

describe('whole-system month flow', () => {
  test('create month -> add bills -> pay one -> record expenses -> derived view is correct', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const rent = await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 120000 });
    await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    await Bills.markPaid(rent.occ.id); // actual = 120000

    await addExpense('2026-07', 2, 5000);
    await addExpense('2026-07', 2, 1500);

    const view = await viewFor('2026-07');
    expect(view.billsReserved).toBe(128000); // 120000 paid actual + 8000 unpaid expected
    expect(view.paidCount).toBe(1);
    expect(view.billCount).toBe(2);
    expect(view.spendingPool).toBe(172000);
    expect(view.periods[2].spent).toBe(6500);
    expect(view.safeToSpend).toBe(300000 - 128000 - 6500); // 165500
    expect(view.periods.reduce((s, p) => s + p.allocation, 0)).toBe(view.spendingPool);
  });

  test('changing the monthly amount recalculates allocations', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    await Months.setAvailable('2026-07', 155000);
    const view = await viewFor('2026-07');
    expect(view.spendingPool).toBe(155000);
    expect(view.periods.reduce((s, p) => s + p.allocation, 0)).toBe(155000);
  });
});
