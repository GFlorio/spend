import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';

beforeEach(async () => { await db.resetDB(); });

describe('importDB (DAT-4/5)', () => {
  test('import replaces the dataset and export round-trips it', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 300000, createdAt: 1, updatedAt: 1 });
    await db.put('envelopes', { id: 'env:1', name: 'Travel', createdAt: 1, updatedAt: 1 });
    const dump = await db.exportDB();

    await db.resetDB();
    await db.put('months', { id: 'month:2099-01', monthKey: '2099-01', available: 1, createdAt: 1, updatedAt: 1 });

    await db.importDB(dump);
    const after = await db.exportDB();
    expect(after.months).toHaveLength(1);
    expect(after.months[0].id).toBe('month:2026-07');
    expect(after.envelopes).toHaveLength(1);
  });

  test('rejects an invalid dump and leaves data untouched', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 300000, createdAt: 1, updatedAt: 1 });
    await expect(db.importDB({ version: 1 })).rejects.toThrow();
    expect(await db.getAll('months')).toHaveLength(1);
  });
});
