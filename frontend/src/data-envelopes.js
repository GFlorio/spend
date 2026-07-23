import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ id:string, name:string, createdAt:number, updatedAt:number }} Envelope
 */

export const Envelopes = {
  /** @returns {Promise<Envelope[]>} */
  async list() {
    const all = await db.getAll('envelopes');
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },

  /** @param {string} id @returns {Promise<Envelope|undefined>} */
  async get(id) {
    return await db.get('envelopes', id);
  },

  /** @param {{ name:string }} opts @returns {Promise<Envelope>} */
  async create({ name }) {
    const timestamp = now();
    /** @type {Envelope} */
    const envelope = { id: `env:${randomUUID()}`, name, createdAt: timestamp, updatedAt: timestamp };
    await db.put('envelopes', envelope);
    return envelope;
  },

  /** @param {string} id @param {string} name @returns {Promise<Envelope>} */
  async rename(id, name) {
    const envelope = await db.get('envelopes', id);
    if (!envelope) { throw new Error(`Envelope ${id} not found`); }
    const next = { ...envelope, name, updatedAt: now() };
    await db.put('envelopes', next);
    return next;
  },
};
