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

/** @param {unknown} obj @returns {Element} */
export function assertEl(obj) {
  if (!(obj instanceof Element)) { throw new Error('Expected an Element'); }
  return obj;
}
/** @param {string} elId @returns {Element} */
export const id = (elId) => assertEl(document.getElementById(elId));
/** @param {string} selector @param {Document|Element} [root] @returns {Element} */
export const sel = (selector, root = document) => assertEl(root.querySelector(selector));
/** @param {string} selector @param {Document|Element} [root] @returns {Element[]} */
export const arr = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** @template {abstract new (...a:any)=>Element} C @param {Element|null} el @param {C} Ctor @param {string} label @returns {InstanceType<C>} */
function castEl(el, Ctor, label) {
  if (el instanceof Ctor) { return /** @type {InstanceType<C>} */ (el); }
  throw new Error(`Element is not ${label}`);
}
/** @param {Element|null} el @returns {HTMLElement} */
export const html = (el) => castEl(el, HTMLElement, 'an HTMLElement');
/** @param {Element|null} el @returns {HTMLInputElement} */
export const input = (el) => castEl(el, HTMLInputElement, 'an input');
/** @param {Element|null} el @returns {HTMLButtonElement} */
export const button = (el) => castEl(el, HTMLButtonElement, 'a button');
/** @param {Element|null} el @returns {HTMLFormElement} */
export const form = (el) => castEl(el, HTMLFormElement, 'a form');
/** @param {Element|null} el @returns {HTMLDialogElement} */
export const dialog = (el) => castEl(el, HTMLDialogElement, 'a dialog');

/** @param {'month'|'envelopes'} page */
export function showPage(page) {
  for (const el of arr('.tab')) {
    html(el).classList.toggle('active', html(el).dataset.page === page);
  }
  html(id('page-month')).classList.toggle('hidden', page !== 'month');
  html(id('page-envelopes')).classList.toggle('hidden', page !== 'envelopes');
}
