import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Envelopes } from '../../data-envelopes.js';

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
});
