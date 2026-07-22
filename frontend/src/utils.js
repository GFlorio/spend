/** @returns {number} current epoch milliseconds */
export const now = () => Date.now();

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
