let lastNow = 0;
/**
 * Strictly-increasing epoch milliseconds. Monotonic within the process so that
 * records created in the same wall-clock millisecond still receive a deterministic,
 * creation-ordered timestamp (used to order bills, occurrences, and activities).
 * @returns {number}
 */
export const now = () => {
  const wall = Date.now();
  lastNow = wall > lastNow ? wall : lastNow + 1;
  return lastNow;
};

/** @returns {string} a random UUID */
export const randomUUID = () => crypto.randomUUID();

/** @returns {string} today's local date as YYYY-MM-DD */
export function isoToday() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
