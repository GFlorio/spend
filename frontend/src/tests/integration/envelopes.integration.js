import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import { Activities } from '../../data-activities.js';
import * as db from '../../db.js';
import { Envelopes } from '../../data.js';

beforeEach(async () => { await db.resetDB(); });

describe('Envelopes', () => {
  test('create + get + list', async () => {
    const e = await Envelopes.create({ name: 'Travel' });
    expect(await Envelopes.get(e.id)).toMatchObject({ name: 'Travel' });
    expect(await Envelopes.list()).toHaveLength(1);
  });

  test('list is creation-ordered', async () => {
    await Envelopes.create({ name: 'A' });
    await Envelopes.create({ name: 'B' });
    expect((await Envelopes.list()).map((e) => e.name)).toEqual(['A', 'B']);
  });

  test('rename changes the name and keeps identity', async () => {
    const e = await Envelopes.create({ name: 'Emergancy' });
    const renamed = await Envelopes.rename(e.id, 'Emergency');
    expect(renamed.id).toBe(e.id);
    expect((await Envelopes.get(e.id))?.name).toBe('Emergency');
  });

  test('get returns undefined for a missing id', async () => {
    expect(await Envelopes.get('env:nope')).toBeUndefined();
  });
  test('rename throws for a missing id', async () => {
    await expect(Envelopes.rename('env:nope', 'X')).rejects.toThrow(/not found/i);
  });
});

describe('Envelopes — derived balances', () => {
  test('fund from a period then spend, balance reconciles', async () => {
    const travel = await Envelopes.create({ name: 'Travel' });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'envelope', envelopeId: travel.id }, amount: 10000,
      allocations: [{ source: { type: 'period', periodIndex: 2 }, amount: 10000 }],
    });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'spent' }, amount: 3000,
      allocations: [{ source: { type: 'envelope', envelopeId: travel.id }, amount: 3000 }],
    });
    const balances = await Envelopes.withBalances();
    expect(balances.find((e) => e.id === travel.id)?.balance).toBe(7000);
    expect((await Envelopes.history(travel.id)).map((r) => r.direction)).toEqual(['in', 'out']);
  });
});
