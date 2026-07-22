import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Bills } from '../../data-bills.js';
import { Months } from '../../data-months.js';

beforeEach(async () => { await db.resetDB(); });

describe('Months', () => {
  test('create persists a month and get/list find it', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    expect(await Months.get('2026-07')).toMatchObject({ monthKey: '2026-07', available: 300000 });
    expect(await Months.list()).toHaveLength(1);
  });

  test('list is sorted chronologically by id', async () => {
    await Months.create({ monthKey: '2026-08', available: 1 });
    await Months.create({ monthKey: '2026-07', available: 1 });
    expect((await Months.list()).map((m) => m.monthKey)).toEqual(['2026-07', '2026-08']);
  });

  test('setAvailable updates only the amount', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const updated = await Months.setAvailable('2026-07', 250000);
    expect(updated.available).toBe(250000);
    expect((await Months.get('2026-07'))?.available).toBe(250000);
  });

  test('copyFromKey clones expected values only, not payments', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 120000 });
    await Bills.markPaid(occ.id);

    await Months.create({ monthKey: '2026-08', available: 300000, copyFromKey: '2026-07' });
    const augBills = await Bills.listForMonth('2026-08');
    expect(augBills).toHaveLength(1);
    expect(augBills[0]).toMatchObject({ name: 'Rent', expected: 120000, paid: false, actual: null });
  });
});
