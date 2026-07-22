import { describe, expect, test } from 'vitest';
import { now } from '../utils.js';

describe('now', () => {
  test('is strictly increasing even across same-millisecond calls', () => {
    const values = Array.from({ length: 1000 }, () => now());
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });
});
