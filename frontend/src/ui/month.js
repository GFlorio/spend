import { computeMonth } from '../compute.js';
import { Activities, Bills, Months } from '../data.js';
import { formatMoney } from '../money.js';
import * as $ from '../utils.js';

/** @type {string|null} */
let selectedMonthKey = null;

export const getSelectedMonthKey = () => selectedMonthKey;

/** Builds the derived view for a stored month. @param {string} monthKey */
async function buildView(monthKey) {
  const month = await Months.get(monthKey);
  if (!month) { throw new Error(`Month ${monthKey} not found`); }
  const bills = await Bills.listForMonth(monthKey);
  const activities = await Activities.listForMonth(monthKey);
  return {
    month,
    bills,
    view: computeMonth({
      monthKey,
      available: month.available,
      bills: bills.map((b) => ({ paid: b.paid, actual: b.actual, expected: b.expected })),
      activities: activities.map((a) => ({ periodIndex: a.periodIndex, amount: a.amount, destination: a.destination })),
    }),
  };
}

/** @param {string} monthKey label e.g. "2026-07" -> "July 2026" */
export function monthLabel(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const name = new Date(year, month - 1, 1).toLocaleDateString(undefined, { month: 'long' });
  return `${name} ${year}`;
}

/** Re-render the whole Month screen for the given month. @param {string} monthKey */
export async function renderMonth(monthKey) {
  selectedMonthKey = monthKey;
  const { view } = await buildView(monthKey);
  $.html($.id('monthTitle')).textContent = monthLabel(monthKey);
  // Status card + periods are rendered by renderStatus/renderPeriods (Tasks 14-15).
  renderStatus(view);
  renderPeriods(view);
}

// Placeholders replaced in later tasks:
/** @param {import('../compute.js').MonthView} view */
function renderStatus(view) {
  $.html($.id('statusCard')).textContent = `${formatMoney(view.safeToSpend)} available`;
}
/** @param {import('../compute.js').MonthView} view */
function renderPeriods(view) {
  $.html($.id('periods')).textContent = `${view.periods.length} periods`;
}

export function setupMonth() {
  // Month selector + setup dialog wiring is added in Task 13.
}

/** Pick the initial month: current if it exists, else latest, else prompt setup. */
export async function openInitialMonth() {
  const months = await Months.list();
  if (months.length === 0) {
    // Task 13 opens the setup dialog here.
    $.html($.id('monthTitle')).textContent = 'Start a month';
    return;
  }
  const currentKey = $.isoToday().slice(0, 7);
  const target = months.find((m) => m.monthKey === currentKey) ?? months[months.length - 1];
  if (!target) { return; }
  await renderMonth(target.monthKey);
}
