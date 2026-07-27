/** @typedef {import('./data-activities.js').Allocation} Allocation */

/**
 * Splits an integer total into `count` near-equal parts; the last part absorbs the residual.
 * @param {number} total integer minor units (>= 0)
 * @param {number} count number of parts (>= 1)
 * @returns {number[]}
 */
export function redistributeEqual(total, count) {
  if (count < 1) { throw new Error('redistributeEqual: count must be >= 1'); }
  const each = Math.floor(total / count);
  const parts = Array.from({ length: count }, () => each);
  parts[count - 1] += total - each * count;
  return parts;
}

/**
 * Removes one entry and redistributes so the remaining entries keep their relative
 * proportions and still sum to `total`. The last kept entry absorbs the residual.
 * @param {number[]} amounts current per-source amounts (length >= 2)
 * @param {number} indexToRemove index being removed
 * @param {number} total the activity total the result must sum to
 * @returns {number[]}
 */
export function removeProportional(amounts, indexToRemove, total) {
  if (!Number.isInteger(indexToRemove) || indexToRemove < 0 || indexToRemove >= amounts.length) {
    throw new Error(`removeProportional: indexToRemove ${indexToRemove} out of range [0,${amounts.length})`);
  }
  const kept = amounts.filter((_, i) => i !== indexToRemove);
  if (kept.length === 0) { throw new Error('removeProportional: cannot remove the last source'); }
  const keptTotal = kept.reduce((sum, a) => sum + a, 0);
  if (keptTotal === 0) { return redistributeEqual(total, kept.length); }
  const parts = kept.map((a) => Math.floor((total * a) / keptTotal));
  parts[parts.length - 1] += total - parts.reduce((sum, a) => sum + a, 0);
  return parts;
}

/**
 * Moves money across the divider between segments `index` and `index+1` so their combined
 * amount is unchanged and the overall total is preserved; all other segments are untouched.
 * `cumTarget` is the desired cumulative sum through segment `index` (i.e. the dragged
 * boundary position expressed in minor units), clamped to the adjacent pair.
 * @param {number[]} amounts current per-source amounts (length >= 2)
 * @param {number} index divider index in [0, amounts.length - 2]
 * @param {number} cumTarget desired cumulative total through segment `index`
 * @returns {number[]} a new amounts array
 */
export function setBoundary(amounts, index, cumTarget) {
  if (!Number.isInteger(index) || index < 0 || index >= amounts.length - 1) {
    throw new Error(`setBoundary: divider index ${index} out of range [0,${amounts.length - 1})`);
  }
  let prefix = 0;
  for (let i = 0; i < index; i++) { prefix += amounts[i]; }
  const pairTotal = amounts[index] + amounts[index + 1];
  const next = amounts.slice();
  next[index] = Math.max(0, Math.min(cumTarget - prefix, pairTotal));
  next[index + 1] = pairTotal - next[index];
  return next;
}

/**
 * Total of an activity's allocations, in integer minor units.
 * @param {Allocation[]} allocations
 * @returns {number}
 */
export const activityTotal = (allocations) => allocations.reduce((sum, a) => sum + a.amount, 0);
