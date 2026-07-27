import { describe, expect, test } from 'vitest';
import { validateDump } from '../db.js';

const good = {
  version: 2, exportedAt: 'x',
  envelopes: [], months: [], billSeries: [], billOccurrences: [], activities: [],
};

describe('validateDump (DAT-5)', () => {
  test('accepts a well-formed empty dump', () => {
    expect(() => validateDump(good)).not.toThrow();
  });
  test('rejects a non-object', () => {
    expect(() => validateDump(null)).toThrow();
  });
  test('rejects a wrong version', () => {
    expect(() => validateDump({ ...good, version: 1 })).toThrow(/version/i);
  });
  test('rejects a non-array store', () => {
    expect(() => validateDump({ ...good, months: {} })).toThrow(/array/i);
  });
  test('rejects a record without a string id', () => {
    expect(() => validateDump({ ...good, envelopes: [{ name: 'x' }] })).toThrow(/id/i);
  });
  test('rejects an activity with an out-of-range periodIndex', () => {
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 9, allocations: [{ source: { type: 'outside' }, amount: 1 }] }; // Feb 2026 has 4 periods
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/out of range/i);
  });
  test('rejects an activity with a malformed monthKey', () => {
    const act = { id: 'act:1', monthKey: '2026-99', periodIndex: 0 };
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/monthKey/i);
  });
  test('rejects an activity whose allocations is not an array', () => {
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 0, allocations: {} };
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/allocations/i);
  });
  test('rejects an activity with empty allocations', () => {
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 0, allocations: [] };
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/allocations/i);
  });
  test('rejects a negative allocation amount', () => {
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 0, allocations: [{ source: { type: 'outside' }, amount: -5 }] };
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/allocation amount/i);
  });
});
