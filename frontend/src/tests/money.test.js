import { describe, expect, test } from 'vitest';
import { formatMoney, parseMoney } from '../money.js';

describe('formatMoney', () => {
  test('formats whole and fractional amounts with grouping (en-US)', () => {
    expect(formatMoney(184200, 'en-US')).toBe('$1,842.00');
    expect(formatMoney(1050, 'en-US')).toBe('$10.50');
    expect(formatMoney(0, 'en-US')).toBe('$0.00');
  });
  test('formats negatives with a leading minus', () => {
    expect(formatMoney(-12000, 'en-US')).toBe('-$120.00');
  });
});

describe('parseMoney', () => {
  test('parses integers, decimals, grouping, and currency symbols to cents', () => {
    expect(parseMoney('1842')).toBe(184200);
    expect(parseMoney('1,842.50')).toBe(184250);
    expect(parseMoney('$10.5')).toBe(1050);
  });
  test('returns null for blank or non-numeric input', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.2.3')).toBeNull();
  });
});
