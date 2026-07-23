import { describe, expect, test } from 'vitest';
import { generatePeriods } from '../periods.js';
import { describeDestination, describeSource, periodRange } from '../ui/labels.js';

const july = generatePeriods(2026, 6);
/** @type {(id: string) => string} */
const envName = (id) => (id === 'env:t' ? 'Travel' : '(unknown)');

describe('labels', () => {
  test('periodRange formats the day span', () => {
    expect(periodRange(july, 2)).toBe('15–21');
  });
  test('describeSource covers every source type', () => {
    expect(describeSource({ type: 'period', periodIndex: 2 }, envName, july)).toBe('15–21');
    expect(describeSource({ type: 'wholeMonth' }, envName, july)).toBe('Whole month');
    expect(describeSource({ type: 'envelope', envelopeId: 'env:t' }, envName, july)).toBe('Travel');
    expect(describeSource({ type: 'outside' }, envName, july)).toBe('Outside budget');
  });
  test('describeDestination covers every destination type', () => {
    expect(describeDestination({ type: 'spent' }, envName, july)).toBe('Spent');
    expect(describeDestination({ type: 'period', periodIndex: 0 }, envName, july)).toBe('1–7');
    expect(describeDestination({ type: 'envelope', envelopeId: 'env:t' }, envName, july)).toBe('Travel');
  });
});
