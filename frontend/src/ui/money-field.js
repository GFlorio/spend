import { formatEditableMoney, formatMoney, parseMoney } from '../money.js';

let nextFieldId = 0;

/**
 * Gives a text input consistent money formatting, parsing, and inline validation.
 * @param {HTMLInputElement} input
 * @param {{
 *   required?:boolean,
 *   minimum?:number,
 *   maximum?:number,
 *   locale?:string,
 *   errorElement?:HTMLElement,
 *   onInput?:(value:number|null) => void
 * }} [options]
 */
export function setupMoneyField(input, options = {}) {
  const required = options.required ?? false;
  const minimum = options.minimum ?? 0;
  input.type = 'text';
  input.inputMode = 'decimal';
  input.autocomplete = 'off';
  input.required = false;
  input.setAttribute('aria-required', String(required));

  const container = moneyContainer(input);
  const error = options.errorElement ?? document.createElement('p');
  if (!options.errorElement) {
    error.className = 'field-error';
    error.setAttribute('role', 'alert');
    container.after(error);
  }

  if (!input.id) {
    nextFieldId += 1;
    input.id = `money-field-${nextFieldId}`;
  }
  if (!error.id) { error.id = `${input.id}-error`; }
  const describedBy = new Set((input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
  describedBy.add(error.id);
  input.setAttribute('aria-describedby', [...describedBy].join(' '));

  let reported = false;

  /** @param {boolean} report */
  function validate(report) {
    if (report) { reported = true; }
    const result = parseValue(input.value, { required, minimum, maximum: options.maximum });
    const visibleError = reported ? result.error : '';
    error.textContent = visibleError;
    error.hidden = !visibleError;
    input.setAttribute('aria-invalid', String(Boolean(visibleError)));
    container.classList.toggle('invalid', Boolean(visibleError));
    return result.value;
  }

  input.addEventListener('input', () => {
    const value = validate(false);
    options.onInput?.(value);
  });
  input.addEventListener('blur', () => {
    const value = validate(true);
    if (value !== null) { input.value = formatEditableMoney(value, options.locale); }
  });

  return {
    /** @param {{ report?:boolean }} [readOptions] @returns {number|null} */
    read(readOptions = {}) {
      return validate(readOptions.report ?? false);
    },
    /** @param {number|null} value */
    setValue(value) {
      reported = false;
      input.value = value === null ? '' : formatEditableMoney(value, options.locale);
      validate(false);
    },
    focus() { input.focus(); },
  };
}

/** @param {HTMLInputElement} input */
function moneyContainer(input) {
  if (input.parentElement?.classList.contains('money-input')) { return input.parentElement; }
  const container = document.createElement('span');
  container.className = 'money-input';
  const prefix = document.createElement('span');
  prefix.className = 'money-prefix';
  prefix.setAttribute('aria-hidden', 'true');
  prefix.textContent = '$';
  input.replaceWith(container);
  container.append(prefix, input);
  return container;
}

/**
 * @param {string} raw
 * @param {{ required:boolean, minimum:number, maximum?:number }} constraints
 */
function parseValue(raw, constraints) {
  if (!raw.trim()) {
    return constraints.required
      ? { value: null, error: 'Enter an amount.' }
      : { value: 0, error: '' };
  }
  const value = parseMoney(raw);
  if (value === null) {
    return { value: null, error: 'Enter a valid amount with up to 2 decimal places.' };
  }
  if (value < constraints.minimum) {
    const error = constraints.minimum === 0
      ? 'Amount cannot be negative.'
      : `Enter an amount of at least ${formatMoney(constraints.minimum)}.`;
    return { value: null, error };
  }
  if (constraints.maximum !== undefined && value > constraints.maximum) {
    return { value: null, error: `Amount cannot exceed ${formatMoney(constraints.maximum)}.` };
  }
  return { value, error: '' };
}
