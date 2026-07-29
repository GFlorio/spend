const MINOR_UNITS = 100;

/**
 * Formats integer minor units as a generic `$` amount using locale separators.
 * @param {number} minor integer minor units
 * @param {string} [locale] optional BCP-47 locale; defaults to device locale
 * @returns {string}
 */
export function formatMoney(minor, locale) {
  const body = formatEditableMoney(Math.abs(minor), locale);
  return `${minor < 0 ? '-' : ''}$${body}`;
}

/**
 * Formats integer minor units for an editable money field.
 * @param {number} minor integer minor units
 * @param {string} [locale] optional BCP-47 locale; defaults to device locale
 * @returns {string}
 */
export function formatEditableMoney(minor, locale) {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'never',
  }).format(Math.abs(minor) / MINOR_UNITS);
}

/**
 * Parses a user-entered amount to integer minor units. Both `1,234.56` and
 * `1.234,56` are accepted so pasted and mobile-keyboard values work across locales.
 * @param {string} str
 * @param {string} [locale] optional BCP-47 locale used to disambiguate a lone separator
 * @returns {number|null} integer minor units, or null when the input is not a valid amount
 */
export function parseMoney(str, locale) {
  if (typeof str !== 'string') { return null; }
  const cleaned = str.trim().replace(/[$\s]/g, '');
  const match = cleaned.match(/^(-?)([\d.,]+)$/);
  if (!match) { return null; }
  const normalized = normalizeSeparators(match[2], locale);
  if (normalized === null) { return null; }
  const value = Number(`${match[1]}${normalized}`);
  if (!Number.isFinite(value)) { return null; }
  const cents = Math.round(value * MINOR_UNITS);
  if (!Number.isSafeInteger(cents)) { return null; }
  return cents === 0 ? 0 : cents;
}

/**
 * Normalizes either common money separator convention to a decimal-point number.
 * @param {string} value unsigned digits and separators
 * @param {string} [locale]
 * @returns {string|null}
 */
function normalizeSeparators(value, locale) {
  const dot = value.lastIndexOf('.');
  const comma = value.lastIndexOf(',');
  if (dot >= 0 && comma >= 0) {
    const decimal = dot > comma ? '.' : ',';
    const grouping = decimal === '.' ? ',' : '.';
    const decimalIndex = value.lastIndexOf(decimal);
    const integer = value.slice(0, decimalIndex);
    const fraction = value.slice(decimalIndex + 1);
    if (!validFraction(fraction) || !validGroupedInteger(integer, grouping)) { return null; }
    return `${integer.replaceAll(grouping, '') || '0'}.${fraction}`;
  }

  const separator = dot >= 0 ? '.' : comma >= 0 ? ',' : '';
  if (!separator) { return /^\d+$/.test(value) ? value : null; }
  const parts = value.split(separator);
  if (parts.length === 2 && validFraction(parts[1])) {
    if (parts[0] && !/^\d+$/.test(parts[0])) { return null; }
    return `${parts[0] || '0'}.${parts[1]}`;
  }
  const localeGroup = new Intl.NumberFormat(locale).formatToParts(1000).find((part) => part.type === 'group')?.value;
  if (separator !== localeGroup) { return null; }
  if (!validGroupedInteger(value, separator)) { return null; }
  return value.replaceAll(separator, '');
}

/** @param {string} value */
function validFraction(value) {
  return /^\d{1,2}$/.test(value);
}

/** @param {string} value @param {string} separator */
function validGroupedInteger(value, separator) {
  const parts = value.split(separator);
  return /^\d{1,3}$/.test(parts[0]) && parts.length > 1 && parts.slice(1).every((part) => /^\d{3}$/.test(part));
}
