import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';

beforeEach(async () => { await db.resetDB(); });

describe('db.js raw IndexedDB wrapper', () => {
  test('put/get/getAll round-trip and index query', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 300000 });
    await db.put('billOccurrences', { id: 'occ:a', seriesId: 's1', monthKey: '2026-07', expected: 8000 });
    await db.put('billOccurrences', { id: 'occ:b', seriesId: 's2', monthKey: '2026-08', expected: 9000 });

    expect(await db.get('months', 'month:2026-07')).toMatchObject({ available: 300000 });
    expect(await db.getAll('billOccurrences')).toHaveLength(2);
    const july = await db.getAllByIndex('billOccurrences', 'by_month', '2026-07');
    expect(july.map((o) => o.id)).toEqual(['occ:a']);
  });

  test('envelopes store round-trips', async () => {
    await db.put('envelopes', { id: 'env:1', name: 'Travel' });
    expect(await db.getAll('envelopes')).toHaveLength(1);
    expect(await db.get('envelopes', 'env:1')).toMatchObject({ name: 'Travel' });
  });

  test('exportDB serialises every store including envelopes', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 1 });
    await db.put('envelopes', { id: 'env:1', name: 'Travel' });
    const dump = await db.exportDB();
    expect(dump.version).toBe(2);
    expect(dump.months).toHaveLength(1);
    expect(dump.envelopes).toHaveLength(1);
    expect(dump.activities).toEqual([]);
  });
});
