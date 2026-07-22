import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Activities } from '../../data-activities.js';

beforeEach(async () => { await db.resetDB(); });

describe('Activities', () => {
  test('createExpense writes one atomic record with an embedded period allocation', async () => {
    const activity = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 2, amount: 5000, description: 'Lunch' });
    expect(activity).toMatchObject({ monthKey: '2026-07', periodIndex: 2, destination: 'spent', amount: 5000, description: 'Lunch' });
    expect(activity.allocations).toEqual([{ source: { type: 'period', periodIndex: 2 }, amount: 5000 }]);

    const stored = await db.get('activities', activity.id);
    expect(stored.allocations[0].amount).toBe(5000); // single record carries its allocation
  });

  test('listForMonth and listForPeriod filter correctly', async () => {
    await Activities.createExpense({ monthKey: '2026-07', periodIndex: 0, amount: 100 });
    await Activities.createExpense({ monthKey: '2026-07', periodIndex: 2, amount: 200 });
    await Activities.createExpense({ monthKey: '2026-08', periodIndex: 0, amount: 300 });

    expect(await Activities.listForMonth('2026-07')).toHaveLength(2);
    const p2 = await Activities.listForPeriod('2026-07', 2);
    expect(p2.map((a) => a.amount)).toEqual([200]);
  });
});
