import { describe, expect, test, vi } from 'vitest';
import { setupMoneyField } from '../ui/money-field.js';

function inputInField() {
  const label = document.createElement('label');
  label.className = 'field';
  const input = document.createElement('input');
  label.append(input);
  document.body.append(label);
  return input;
}

describe('setupMoneyField', () => {
  test('adds a currency prefix and formats stored values for editing', () => {
    const input = inputInField();
    const field = setupMoneyField(input, { locale: 'en-US' });

    field.setValue(184250);

    expect(input.value).toBe('1,842.50');
    expect(input.parentElement?.className).toBe('money-input');
    expect(input.previousElementSibling?.textContent).toBe('$');
  });

  test('reports a useful error and points aria-describedby at it', () => {
    const input = inputInField();
    const field = setupMoneyField(input, { required: true });
    input.value = 'not money';

    expect(field.read({ report: true })).toBeNull();
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(input.getAttribute('aria-describedby') ?? '')?.textContent)
      .toBe('Enter a valid amount with up to 2 decimal places.');
  });

  test('formats a valid typed amount on blur and emits parsed cents', () => {
    const input = inputInField();
    const onInput = vi.fn();
    setupMoneyField(input, { locale: 'en-US', onInput });
    input.value = '1842.5';

    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));

    expect(onInput).toHaveBeenLastCalledWith(184250);
    expect(input.value).toBe('1,842.50');
    expect(input.getAttribute('aria-invalid')).toBe('false');
  });
});
