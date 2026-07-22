/**
 * @typedef {{ index:number, startDay:number, endDay:number, days:number }} Period
 */

const BOUNDARIES = [1, 8, 15, 22, 29];

/**
 * Generates the fixed 7-day spending periods for a month.
 * The fifth period (29-end) is omitted when the month ends on the 28th.
 * @param {number} year
 * @param {number} monthIndex0 zero-based month (0 = January)
 * @returns {Period[]}
 */
export function generatePeriods(year, monthIndex0) {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  /** @type {Period[]} */
  const periods = [];
  for (let i = 0; i < BOUNDARIES.length; i++) {
    const startDay = BOUNDARIES[i];
    if (startDay > lastDay) { break; }
    const nextBoundary = BOUNDARIES[i + 1];
    const endDay = nextBoundary === undefined ? lastDay : Math.min(nextBoundary - 1, lastDay);
    periods.push({ index: periods.length, startDay, endDay, days: endDay - startDay + 1 });
  }
  return periods;
}

/**
 * @param {string} monthKey "YYYY-MM"
 * @returns {Period[]}
 */
export function periodsForMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return generatePeriods(year, month - 1);
}
