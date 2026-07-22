import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Bills } from '../../data-bills.js';

beforeEach(async () => { await db.resetDB(); });

describe('Bills', () => {
  test('create makes a series + unpaid occurrence, listForMonth joins the name', async () => {
    await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 120000 });
    const bills = await Bills.listForMonth('2026-07');
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ name: 'Rent', expected: 120000, paid: false, actual: null });
  });

  test('markPaid defaults actual to expected and stamps a date', async () => {
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    const paid = await Bills.markPaid(occ.id);
    expect(paid).toMatchObject({ paid: true, actual: 8000 });
    expect(paid.paidDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('setActual overrides the paid amount, markUnpaid clears it', async () => {
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    await Bills.markPaid(occ.id);
    expect((await Bills.setActual(occ.id, 9600)).actual).toBe(9600);
    const undone = await Bills.markUnpaid(occ.id);
    expect(undone).toMatchObject({ paid: false, actual: null, paidDate: null });
  });

  test('rename changes the name across every month', async () => {
    const { series } = await Bills.create({ monthKey: '2026-07', name: 'Powr', expected: 8000 });
    await Bills.create({ monthKey: '2026-08', name: 'Powr', expected: 8000 }); // unrelated series
    await Bills.rename(series.id, 'Electricity');
    const july = await Bills.listForMonth('2026-07');
    expect(july[0].name).toBe('Electricity');
  });

  test('listForMonth sorts by series creation order', async () => {
    await Bills.create({ monthKey: '2026-07', name: 'A', expected: 1 });
    await Bills.create({ monthKey: '2026-07', name: 'B', expected: 1 });
    expect((await Bills.listForMonth('2026-07')).map((b) => b.name)).toEqual(['A', 'B']);
  });
});
