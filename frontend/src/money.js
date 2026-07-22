const MINOR_UNITS = 100;

/**
 * Formats integer minor units as a generic `$` amount using locale separators.
 * @param {number} minor integer minor units
 * @param {string} [locale] optional BCP-47 locale; defaults to device locale
 * @returns {string}
 */
export function formatMoney(minor, locale) {
  const abs = Math.abs(minor) / MINOR_UNITS;
  const body = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'never',
  }).format(abs);
  return `${minor < 0 ? '-' : ''}$${body}`;
}

/**
 * Parses a user-entered amount to integer minor units.
 * @param {string} str
 * @returns {number|null} integer minor units, or null when the input is not a valid amount
 */
export function parseMoney(str) {
  if (typeof str !== 'string') { return null; }
  const cleaned = str.trim().replace(/[$\s]/g, '').replace(/,/g, '');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) { return null; }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) { return null; }
  return Math.round(value * MINOR_UNITS);
}
