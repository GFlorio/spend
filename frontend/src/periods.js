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

/**
 * Distributes an integer pool across periods proportionally by day count.
 * Uses floor per period and assigns the whole residual to the last period,
 * so the result always sums exactly to `pool`. Deterministic; handles negatives.
 * @param {number} pool integer minor units (may be negative)
 * @param {Period[]} periods non-empty
 * @returns {number[]}
 */
export function allocate(pool, periods) {
  if (periods.length === 0) { throw new Error('allocate: periods must be non-empty'); }
  const totalDays = periods.reduce((sum, p) => sum + p.days, 0);
  const alloc = periods.map((p) => Math.floor((pool * p.days) / totalDays));
  const residual = pool - alloc.reduce((sum, a) => sum + a, 0);
  alloc[alloc.length - 1] += residual;
  return alloc;
}
