import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ type:'spent' } | { type:'period', periodIndex:number } | { type:'envelope', envelopeId:string }} Destination
 * @typedef {{ type:'period', periodIndex:number } | { type:'wholeMonth' } | { type:'envelope', envelopeId:string } | { type:'outside' }} Source
 * @typedef {{ source:Source, amount:number }} Allocation
 * @typedef {{ id:string, monthKey:string, periodIndex:number, destination:Destination, description:string, allocations:Allocation[], createdAt:number, updatedAt:number }} Activity
 */

/** @param {string} monthKey @param {number} timestamp */
const activityId = (monthKey, timestamp) => `act:${monthKey}:${String(timestamp).padStart(15, '0')}-${randomUUID().slice(0, 8)}`;

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
   * Persists an activity as one atomic record. Its total is derived from `allocations`.
   * @param {{ monthKey:string, periodIndex:number, destination:Destination, description?:string, allocations:Allocation[] }} opts
   * @returns {Promise<Activity>}
   */
  async create({ monthKey, periodIndex, destination, description = '', allocations }) {
    const timestamp = now();
    /** @type {Activity} */
    const activity = {
      id: activityId(monthKey, timestamp),
      monthKey, periodIndex, destination, description, allocations,
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
      monthKey, periodIndex, description,
      destination: { type: 'spent' },
      allocations: [{ source: { type: 'period', periodIndex }, amount }],
    });
  },

  /**
   * Replaces the mutable fields of an existing activity, preserving id/createdAt/monthKey.
   * @param {string} id
   * @param {{ destination:Destination, description:string, allocations:Allocation[], periodIndex?:number }} patch
   * @returns {Promise<Activity>}
   */
  async update(id, patch) {
    const existing = await db.get('activities', id);
    if (!existing) { throw new Error(`Activity ${id} not found`); }
    /** @type {Activity} */
    const next = {
      id: existing.id,
      monthKey: existing.monthKey,
      createdAt: existing.createdAt,
      periodIndex: patch.periodIndex ?? existing.periodIndex,
      destination: patch.destination,
      description: patch.description,
      allocations: patch.allocations,
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
