import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Activities } from '../../data-activities.js';

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
});
