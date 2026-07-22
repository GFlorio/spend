import { describe, expect, test } from 'vitest';
import { generatePeriods, periodsForMonthKey } from '../periods.js';

describe('generatePeriods', () => {
  test('31-day month has 5 periods, last is 29-31 (3 days)', () => {
    const p = generatePeriods(2026, 6); // July 2026
    expect(p.map((x) => [x.startDay, x.endDay, x.days])).toEqual([
      [1, 7, 7], [8, 14, 7], [15, 21, 7], [22, 28, 7], [29, 31, 3],
    ]);
    expect(p.map((x) => x.index)).toEqual([0, 1, 2, 3, 4]);
  });
  test('30-day month last period is 29-30 (2 days)', () => {
    expect(generatePeriods(2026, 3).at(-1)).toMatchObject({ startDay: 29, endDay: 30, days: 2 });
  });
  test('non-leap February (28 days) omits the fifth period', () => {
    const p = generatePeriods(2026, 1);
    expect(p).toHaveLength(4);
    expect(p.at(-1)).toMatchObject({ startDay: 22, endDay: 28, days: 7 });
  });
  test('leap February (29 days) keeps a 1-day fifth period', () => {
    const p = generatePeriods(2024, 1);
    expect(p).toHaveLength(5);
    expect(p.at(-1)).toMatchObject({ startDay: 29, endDay: 29, days: 1 });
  });
  test('total days always equals the month length', () => {
    for (const [y, m, len] of [[2026, 6, 31], [2026, 3, 30], [2026, 1, 28], [2024, 1, 29]]) {
      expect(generatePeriods(y, m).reduce((s, p) => s + p.days, 0)).toBe(len);
    }
  });
});

describe('periodsForMonthKey', () => {
  test('parses YYYY-MM', () => {
    expect(periodsForMonthKey('2026-07')).toEqual(generatePeriods(2026, 6));
  });
});

import { allocate } from '../periods.js';

describe('allocate', () => {
  const july = generatePeriods(2026, 6); // days [7,7,7,7,3], total 31

  test('allocations always sum exactly to the pool', () => {
    for (const pool of [60000, 100000, 1, 99999, 300000]) {
      expect(allocate(pool, july).reduce((s, a) => s + a, 0)).toBe(pool);
    }
  });
  test('residual lands on the last period', () => {
    // floor(60000*7/31)=13548 x4 = 54192; floor(60000*3/31)=5806; residual 2 -> last 5808
    expect(allocate(60000, july)).toEqual([13548, 13548, 13548, 13548, 5808]);
  });
  test('handles a negative pool deterministically and still sums to pool', () => {
    const result = allocate(-5000, july);
    expect(result.reduce((s, a) => s + a, 0)).toBe(-5000);
  });
  test('is deterministic (idempotent)', () => {
    expect(allocate(12345, july)).toEqual(allocate(12345, july));
  });
});
