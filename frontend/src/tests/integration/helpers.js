import * as db from '../../db.js';
import { Activities, Bills, Months } from '../../data.js';

/** Wipe the in-memory database between tests. */
export async function resetTestDB() {
  await db.resetDB();
}
/** @param {string} monthKey @param {number} available @param {{copyFromKey?:string}} [opts] */
export async function createMonth(monthKey, available, opts = {}) {
  return await Months.create({ monthKey, available, ...opts });
}
/** @param {string} monthKey @param {string} name @param {number} expected */
export async function addBill(monthKey, name, expected) {
  return await Bills.create({ monthKey, name, expected });
}
/** @param {string} occId */
export async function payBill(occId) {
  return await Bills.markPaid(occId);
}
/** @param {string} monthKey @param {number} periodIndex @param {number} amount @param {string} [description] */
export async function addExpense(monthKey, periodIndex, amount, description = '') {
  return await Activities.createExpense({ monthKey, periodIndex, amount, description });
}
