import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Bills } from '../../data.js';

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

describe('Bills — scoped expected change and removal', () => {
  test('setExpected "thisMonth" changes only the selected month', async () => {
    const { occ, series } = await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    // create an August occurrence of the same series
    await db.put('billOccurrences', { id: 'occ:aug', seriesId: series.id, monthKey: '2026-08', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 1, updatedAt: 1 });
    await Bills.setExpected(occ.id, 9000, 'thisMonth');
    expect((await Bills.listForMonth('2026-07'))[0].expected).toBe(9000);
    expect((await Bills.listForMonth('2026-08'))[0].expected).toBe(8000);
  });

  test('setExpected "forward" changes this and later months, never earlier', async () => {
    const june = await Bills.create({ monthKey: '2026-06', name: 'Power', expected: 8000 });
    const seriesId = june.series.id;
    await db.put('billOccurrences', { id: 'occ:jul', seriesId, monthKey: '2026-07', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 2, updatedAt: 2 });
    await db.put('billOccurrences', { id: 'occ:aug', seriesId, monthKey: '2026-08', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 3, updatedAt: 3 });
    await Bills.setExpected('occ:jul', 9500, 'forward');
    expect((await Bills.listForMonth('2026-06'))[0].expected).toBe(8000); // earlier untouched
    expect((await Bills.listForMonth('2026-07'))[0].expected).toBe(9500);
    expect((await Bills.listForMonth('2026-08'))[0].expected).toBe(9500);
  });

  test('remove "thisMonth" deletes only the selected occurrence', async () => {
    const { occ, series } = await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    await db.put('billOccurrences', { id: 'occ:aug', seriesId: series.id, monthKey: '2026-08', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 4, updatedAt: 4 });
    await Bills.remove(occ.id, 'thisMonth');
    expect(await Bills.listForMonth('2026-07')).toHaveLength(0);
    expect(await Bills.listForMonth('2026-08')).toHaveLength(1);
  });

  test('remove "forward" deletes this and later occurrences', async () => {
    const june = await Bills.create({ monthKey: '2026-06', name: 'Power', expected: 8000 });
    const seriesId = june.series.id;
    await db.put('billOccurrences', { id: 'occ:jul', seriesId, monthKey: '2026-07', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 5, updatedAt: 5 });
    await Bills.remove('occ:jul', 'forward');
    expect(await Bills.listForMonth('2026-06')).toHaveLength(1);
    expect(await Bills.listForMonth('2026-07')).toHaveLength(0);
  });

  test('setExpected rejects an unknown scope', async () => {
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 100000 });
    await expect(Bills.setExpected(occ.id, 90000, /** @type {any} */ ('bogus'))).rejects.toThrow(/scope/i);
  });
  test('remove rejects an unknown scope', async () => {
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 100000 });
    await expect(Bills.remove(occ.id, /** @type {any} */ ('bogus'))).rejects.toThrow(/scope/i);
  });
  test('rename throws for a missing series', async () => {
    await expect(Bills.rename('series:nope', 'X')).rejects.toThrow(/not found/i);
  });
});
