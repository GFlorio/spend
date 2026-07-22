import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ source:{ type:'period', periodIndex:number }, amount:number }} Allocation
 * @typedef {{ id:string, monthKey:string, periodIndex:number, destination:'spent', amount:number, description:string, allocations:Allocation[], createdAt:number, updatedAt:number }} Activity
 */

export const Activities = {
  /** @param {string} monthKey @returns {Promise<Activity[]>} */
  async listForMonth(monthKey) {
    const all = await db.getAllByIndex('activities', 'by_month', monthKey);
    return all.sort((a, b) => a.id.localeCompare(b.id));
  },

  /** @param {string} monthKey @param {number} periodIndex @returns {Promise<Activity[]>} */
  async listForPeriod(monthKey, periodIndex) {
    const all = await Activities.listForMonth(monthKey);
    return all.filter((a) => a.periodIndex === periodIndex);
  },

  /**
   * Records a single-source period expense as one atomic record.
   * @param {{ monthKey:string, periodIndex:number, amount:number, description?:string }} opts
   * @returns {Promise<Activity>}
   */
  async createExpense({ monthKey, periodIndex, amount, description = '' }) {
    const timestamp = now();
    /** @type {Activity} */
    const activity = {
      id: `act:${monthKey}:${String(timestamp).padStart(15, '0')}-${randomUUID().slice(0, 8)}`,
      monthKey,
      periodIndex,
      destination: 'spent',
      amount,
      description,
      allocations: [{ source: { type: 'period', periodIndex }, amount }],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.put('activities', activity);
    return activity;
  },
};
