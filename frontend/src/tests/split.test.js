import { describe, expect, test } from 'vitest';
import { redistributeEqual, removeProportional } from '../split.js';

describe('redistributeEqual', () => {
  test('splits evenly and sums to total', () => {
    expect(redistributeEqual(9000, 3)).toEqual([3000, 3000, 3000]);
  });
  test('residual lands on the last entry', () => {
    expect(redistributeEqual(10000, 3)).toEqual([3333, 3333, 3334]);
  });
  test('count of 1 returns the whole total', () => {
    expect(redistributeEqual(4200, 1)).toEqual([4200]);
  });
});

describe('removeProportional', () => {
  test('drops an entry and redistributes proportionally, summing to total', () => {
    // remove index 0 from [2000,2000,6000]; kept proportions 2000:6000 of 10000 -> 2500,7500
    expect(removeProportional([2000, 2000, 6000], 0, 10000)).toEqual([2500, 7500]);
  });
  test('residual lands on the last kept entry', () => {
    const out = removeProportional([1000, 1000, 1000], 2, 10000);
    expect(out.reduce((s, a) => s + a, 0)).toBe(10000);
    expect(out).toHaveLength(2);
  });
  test('when kept entries are all zero, splits equally', () => {
    expect(removeProportional([0, 0, 5000], 2, 6000)).toEqual([3000, 3000]);
  });
});

describe('removeProportional — index guard + residual (Slice 2 deferral)', () => {
  test('throws on an out-of-range index', () => {
    expect(() => removeProportional([100, 200], 5, 300)).toThrow(/out of range/);
  });
  test('keeps proportions and sums to total', () => {
    expect(removeProportional([10, 20, 30], 0, 100)).toEqual([40, 60]);
  });
  test('assigns the flooring residual to the last kept entry', () => {
    expect(removeProportional([5, 1, 1, 1], 0, 100)).toEqual([33, 33, 34]);
  });
});
