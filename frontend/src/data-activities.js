import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ type:'spent' } | { type:'period', periodIndex:number } | { type:'envelope', envelopeId:string }} Destination
 * @typedef {{ type:'period', periodIndex:number } | { type:'wholeMonth' } | { type:'envelope', envelopeId:string } | { type:'outside' }} Source
 * @typedef {{ source:Source, amount:number }} Allocation
 * @typedef {{ id:string, monthKey:string, periodIndex:number, destination:Destination, amount:number, description:string, allocations:Allocation[], createdAt:number, updatedAt:number }} Activity
 */

/** @param {string} monthKey @param {number} timestamp */
const activityId = (monthKey, timestamp) => `act:${monthKey}:${String(timestamp).padStart(15, '0')}-${randomUUID().slice(0, 8)}`;

/**
 * Enforces CAL-4 conservation: amount is a non-negative integer and equals the sum of
 * non-negative integer allocation amounts.
 * @param {number} amount @param {Allocation[]} allocations
 */
export function assertConserved(amount, allocations) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Activity amount ${amount} must be a non-negative integer`);
  }
  let sum = 0;
  for (const a of allocations) {
    if (!Number.isInteger(a.amount) || a.amount < 0) {
      throw new Error(`Allocation amount ${a.amount} must be a non-negative integer`);
    }
    sum += a.amount;
  }
  if (sum !== amount) { throw new Error(`Allocations sum ${sum} !== amount ${amount}`); }
}

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

  /** @param {string} id @returns {Promise<Activity|undefined>} */
  async get(id) {
    return await db.get('activities', id);
  },

  /**
   * Persists an activity as one atomic record. `amount` must equal the sum of allocations.
   * @param {{ monthKey:string, periodIndex:number, destination:Destination, amount:number, description?:string, allocations:Allocation[] }} opts
   * @returns {Promise<Activity>}
   */
  async create({ monthKey, periodIndex, destination, amount, description = '', allocations }) {
    assertConserved(amount, allocations);
    const timestamp = now();
    /** @type {Activity} */
    const activity = {
      id: activityId(monthKey, timestamp),
      monthKey, periodIndex, destination, amount, description, allocations,
      createdAt: timestamp, updatedAt: timestamp,
    };
    await db.put('activities', activity);
    return activity;
  },

  /**
   * Convenience for the common one-source period expense.
   * @param {{ monthKey:string, periodIndex:number, amount:number, description?:string }} opts
   * @returns {Promise<Activity>}
   */
  async createExpense({ monthKey, periodIndex, amount, description = '' }) {
    return await Activities.create({
      monthKey, periodIndex, amount, description,
      destination: { type: 'spent' },
      allocations: [{ source: { type: 'period', periodIndex }, amount }],
    });
  },

  /**
   * Replaces the mutable fields of an existing activity, preserving id/createdAt.
   * @param {string} id
   * @param {{ destination:Destination, amount:number, description:string, allocations:Allocation[], periodIndex?:number }} patch
   * @returns {Promise<Activity>}
   */
  async update(id, patch) {
    assertConserved(patch.amount, patch.allocations);
    const existing = await db.get('activities', id);
    if (!existing) { throw new Error(`Activity ${id} not found`); }
    /** @type {Activity} */
    const next = {
      ...existing,
      destination: patch.destination,
      amount: patch.amount,
      description: patch.description,
      allocations: patch.allocations,
      periodIndex: patch.periodIndex ?? existing.periodIndex,
      updatedAt: now(),
    };
    await db.put('activities', next);
    return next;
  },

  /** @param {string} id @returns {Promise<void>} */
  async remove(id) {
    await db.del('activities', id);
  },
};
