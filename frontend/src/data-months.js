import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ id:string, monthKey:string, available:number, createdAt:number, updatedAt:number }} BudgetMonth
 */

/** @param {string} monthKey */
const monthId = (monthKey) => `month:${monthKey}`;

/**
 * Clones the source month's occurrences into fresh unpaid occurrences.
 * @param {string} fromKey @param {string} toKey @param {number} timestamp
 */
async function copyBills(fromKey, toKey, timestamp) {
  const occurrences = await db.getAllByIndex('billOccurrences', 'by_month', fromKey);
  for (const source of occurrences) {
    await db.put('billOccurrences', {
      id: `occ:${randomUUID()}`,
      seriesId: source.seriesId,
      monthKey: toKey,
      expected: source.expected,
      paid: false,
      actual: null,
      paidDate: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

export const Months = {
  /** @returns {Promise<BudgetMonth[]>} */
  async list() {
    const all = await db.getAll('months');
    return all.sort((a, b) => a.id.localeCompare(b.id));
  },
  /** @param {string} monthKey @returns {Promise<BudgetMonth|undefined>} */
  async get(monthKey) {
    return await db.get('months', monthId(monthKey));
  },
  /**
   * @param {{ monthKey:string, available:number, copyFromKey?:string|null }} opts
   * @returns {Promise<BudgetMonth>}
   */
  async create({ monthKey, available, copyFromKey = null }) {
    const timestamp = now();
    /** @type {BudgetMonth} */
    const month = { id: monthId(monthKey), monthKey, available, createdAt: timestamp, updatedAt: timestamp };
    await db.put('months', month);
    if (copyFromKey) { await copyBills(copyFromKey, monthKey, timestamp); }
    return month;
  },
  /** @param {string} monthKey @param {number} available @returns {Promise<BudgetMonth>} */
  async setAvailable(monthKey, available) {
    const month = await db.get('months', monthId(monthKey));
    if (!month) { throw new Error(`Month ${monthKey} not found`); }
    const next = { ...month, available, updatedAt: now() };
    await db.put('months', next);
    return next;
  },
};
