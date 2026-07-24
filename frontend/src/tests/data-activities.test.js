import { describe, expect, test } from 'vitest';
import { assertConserved } from '../data-activities.js';

describe('assertConserved (CAL-4 conservation)', () => {
  test('accepts an exact split', () => {
    expect(() => assertConserved(100, [
      { source: { type: 'period', periodIndex: 0 }, amount: 40 },
      { source: { type: 'outside' }, amount: 60 },
    ])).not.toThrow();
  });
  test('rejects a sum that differs from the amount', () => {
    expect(() => assertConserved(100, [{ source: { type: 'outside' }, amount: 60 }])).toThrow(/sum/i);
  });
  test('rejects a negative allocation', () => {
    expect(() => assertConserved(100, [
      { source: { type: 'outside' }, amount: -100 },
      { source: { type: 'outside' }, amount: 200 },
    ])).toThrow(/non-negative/i);
  });
});
