import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import { computeMonth } from '../../compute.js';
import * as db from '../../db.js';
import { Activities } from '../../data-activities.js';
import { addExpense, createMonth } from './helpers.js';

beforeEach(async () => { await db.resetDB(); });

describe('Activities', () => {
  test('createExpense makes a single-period spent activity', async () => {
    const a = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 2, amount: 5000 });
    expect(a.destination).toEqual({ type: 'spent' });
    expect(a.allocations).toEqual([{ source: { type: 'period', periodIndex: 2 }, amount: 5000 }]);
    expect(a.amount).toBe(5000);
  });

  test('create persists a split expense (period + envelope)', async () => {
    const a = await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'spent' }, amount: 10000,
      allocations: [
        { source: { type: 'period', periodIndex: 2 }, amount: 6000 },
        { source: { type: 'envelope', envelopeId: 'env:g' }, amount: 4000 },
      ],
    });
    expect((await Activities.get(a.id))?.allocations).toHaveLength(2);
    expect(await Activities.listForMonth('2026-07')).toHaveLength(1);
  });

  test('update replaces amount, destination and allocations in place', async () => {
    const a = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 0, amount: 5000 });
    const updated = await Activities.update(a.id, {
      destination: { type: 'envelope', envelopeId: 'env:t' }, amount: 3000, description: 'moved',
      allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 3000 }],
    });
    expect(updated.id).toBe(a.id);
    expect(updated.createdAt).toBe(a.createdAt);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(a.createdAt);
    expect(updated.destination).toEqual({ type: 'envelope', envelopeId: 'env:t' });
    expect((await Activities.get(a.id))?.amount).toBe(3000);
  });

  test('remove deletes the record', async () => {
    const a = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 0, amount: 5000 });
    await Activities.remove(a.id);
    expect(await Activities.get(a.id)).toBeUndefined();
    expect(await Activities.listForMonth('2026-07')).toEqual([]);
  });

  test('listForMonth / listForPeriod filter to the right records', async () => {
    await createMonth('2026-07', 300000);
    await addExpense('2026-07', 0, 1000);
    await addExpense('2026-07', 2, 2000);
    await addExpense('2026-07', 2, 500);
    expect(await Activities.listForMonth('2026-07')).toHaveLength(3);
    expect(await Activities.listForPeriod('2026-07', 2)).toHaveLength(2);
    expect(await Activities.listForPeriod('2026-07', 0)).toHaveLength(1);
  });
});

describe('Activities — edit/delete reverse effects', () => {
  test('reducing an expense amount is a partial refund; deleting is a full refund', async () => {
    const a = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 0, amount: 5000 });
    const acts1 = await Activities.listForMonth('2026-07');
    const v1 = computeMonth({ monthKey: '2026-07', available: 300000, bills: [], activities: acts1 });
    expect(v1.safeToSpend).toBe(295000);

    await Activities.update(a.id, {
      destination: { type: 'spent' }, amount: 2000, description: '',
      allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 2000 }],
    });
    const acts2 = await Activities.listForMonth('2026-07');
    expect(computeMonth({ monthKey: '2026-07', available: 300000, bills: [], activities: acts2 }).safeToSpend).toBe(298000);

    await Activities.remove(a.id);
    const acts3 = await Activities.listForMonth('2026-07');
    expect(computeMonth({ monthKey: '2026-07', available: 300000, bills: [], activities: acts3 }).safeToSpend).toBe(300000);
  });
});
