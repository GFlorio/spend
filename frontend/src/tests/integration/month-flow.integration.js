import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import { computeEnvelopes, computeMonth } from '../../compute.js';
import { Activities, Bills, Envelopes, Months } from '../../data.js';
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

describe('whole-system — envelopes, transfers, carry (invariants)', () => {
  test('split expense: period + envelope, funding is not double-counted', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const groceries = await Envelopes.create({ name: 'Groceries' });
    // fund the envelope from period 2, then spend split across period 2 + envelope
    await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'envelope', envelopeId: groceries.id },
      allocations: [{ source: { type: 'period', periodIndex: 2 }, amount: 20000 }],
    });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'spent' },
      allocations: [
        { source: { type: 'period', periodIndex: 2 }, amount: 9000 },
        { source: { type: 'envelope', envelopeId: groceries.id }, amount: 6000 },
      ],
    });
    const view = await viewFor('2026-07');
    // month loses only the period-sourced money: 20000 funding + 9000 expense
    expect(view.safeToSpend).toBe(300000 - 20000 - 9000);
    const balances = computeEnvelopes([groceries], await Activities.listForMonth('2026-07'));
    expect(balances[0].balance).toBe(20000 - 6000); // 14000
  });

  test('period-to-period positive move leaves the month total unchanged', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 0, destination: { type: 'period', periodIndex: 1 },
      allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 10000 }],
    });
    const view = await viewFor('2026-07');
    expect(view.safeToSpend).toBe(300000);
    expect(view.periods[1].transferIn).toBe(10000);
  });

  test('whole-month envelope funding debits periods but is not spending', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const travel = await Envelopes.create({ name: 'Travel' });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 0, destination: { type: 'envelope', envelopeId: travel.id },
      allocations: [{ source: { type: 'wholeMonth' }, amount: 31000 }],
    });
    const view = await viewFor('2026-07');
    expect(view.safeToSpend).toBe(300000 - 31000);
    expect(view.periods.every((p) => p.spent === 0)).toBe(true);
    const balances = computeEnvelopes([travel], await Activities.listForMonth('2026-07'));
    expect(balances[0].balance).toBe(31000);
  });

  test('open funds appear on completed positive periods of a past month', async () => {
    await Months.create({ monthKey: '2026-05', available: 300000 });
    const view = computeMonth({
      monthKey: '2026-05', available: 300000, bills: [],
      activities: await Activities.listForMonth('2026-05'), todayKey: '2026-07-15',
    });
    expect(view.hasOpenFunds).toBe(true);
    expect(view.periods.every((p) => p.completed)).toBe(true);
  });
});
