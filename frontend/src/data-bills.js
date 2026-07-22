import * as db from './db.js';
import { isoToday, now, randomUUID } from './utils.js';

/**
 * @typedef {{ id:string, name:string, createdAt:number, updatedAt:number }} BillSeries
 * @typedef {{ id:string, seriesId:string, monthKey:string, expected:number, paid:boolean, actual:number|null, paidDate:string|null, createdAt:number, updatedAt:number }} BillOccurrence
 * @typedef {BillOccurrence & { name:string }} BillView
 */

/** @param {string} occId @returns {Promise<BillOccurrence>} */
async function loadOccurrence(occId) {
  const occ = await db.get('billOccurrences', occId);
  if (!occ) { throw new Error(`Bill occurrence ${occId} not found`); }
  return occ;
}

export const Bills = {
  /** @param {string} monthKey @returns {Promise<BillView[]>} */
  async listForMonth(monthKey) {
    const [occurrences, series] = await Promise.all([
      db.getAllByIndex('billOccurrences', 'by_month', monthKey),
      db.getAll('billSeries'),
    ]);
    const byId = new Map(series.map((s) => [s.id, s]));
    return occurrences
      .map((occ) => ({ ...occ, name: byId.get(occ.seriesId)?.name ?? '(unknown)' }))
      .sort((a, b) => (byId.get(a.seriesId)?.createdAt ?? 0) - (byId.get(b.seriesId)?.createdAt ?? 0));
  },

  /**
   * @param {{ monthKey:string, name:string, expected:number }} opts
   * @returns {Promise<{ series:BillSeries, occ:BillOccurrence }>}
   */
  async create({ monthKey, name, expected }) {
    const timestamp = now();
    /** @type {BillSeries} */
    const series = { id: `series:${randomUUID()}`, name, createdAt: timestamp, updatedAt: timestamp };
    await db.put('billSeries', series);
    /** @type {BillOccurrence} */
    const occ = {
      id: `occ:${randomUUID()}`, seriesId: series.id, monthKey, expected,
      paid: false, actual: null, paidDate: null, createdAt: timestamp, updatedAt: timestamp,
    };
    await db.put('billOccurrences', occ);
    return { series, occ };
  },

  /** @param {string} occId @param {string} [paidDate] @returns {Promise<BillOccurrence>} */
  async markPaid(occId, paidDate) {
    const occ = await loadOccurrence(occId);
    const next = { ...occ, paid: true, actual: occ.expected, paidDate: paidDate ?? isoToday(), updatedAt: now() };
    await db.put('billOccurrences', next);
    return next;
  },

  /** @param {string} occId @returns {Promise<BillOccurrence>} */
  async markUnpaid(occId) {
    const occ = await loadOccurrence(occId);
    const next = { ...occ, paid: false, actual: null, paidDate: null, updatedAt: now() };
    await db.put('billOccurrences', next);
    return next;
  },

  /** @param {string} occId @param {number} actual @returns {Promise<BillOccurrence>} */
  async setActual(occId, actual) {
    const occ = await loadOccurrence(occId);
    const next = { ...occ, paid: true, actual, paidDate: occ.paidDate ?? isoToday(), updatedAt: now() };
    await db.put('billOccurrences', next);
    return next;
  },

  /** @param {string} seriesId @param {string} name @returns {Promise<BillSeries>} */
  async rename(seriesId, name) {
    const series = await db.get('billSeries', seriesId);
    if (!series) { throw new Error(`Bill series ${seriesId} not found`); }
    const next = { ...series, name, updatedAt: now() };
    await db.put('billSeries', next);
    return next;
  },
};
