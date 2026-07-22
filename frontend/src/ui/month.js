import { computeMonth } from '../compute.js';
import { Activities, Bills, Months } from '../data.js';
import { formatMoney, parseMoney } from '../money.js';
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

/** Next month key after the latest existing month, else the current month. */
async function nextMonthKey() {
  const months = await Months.list();
  const base = months.length ? months[months.length - 1].monthKey : $.isoToday().slice(0, 7);
  const [year, month] = base.split('-').map(Number);
  const d = new Date(year, month, 1); // month is 1-based -> Date month index = next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Open the setup dialog for a month key. @param {string} monthKey */
async function openMonthSetup(monthKey) {
  const months = await Months.list();
  const isFirst = months.length === 0;
  const prev = months.length ? months[months.length - 1] : null;

  const dlg = $.dialog($.id('monthSetupDialog'));
  $.html($.id('monthSetupTitle')).textContent = `Set up ${monthLabel(monthKey)}`;
  const amount = $.input($.id('monthSetupAmount'));
  amount.value = prev ? (prev.available / 100).toFixed(2) : '';

  const copyField = $.html($.id('monthSetupCopyField'));
  const copy = $.input($.id('monthSetupCopy'));
  copyField.classList.toggle('hidden', isFirst);
  if (prev) { $.html($.id('monthSetupCopyLabel')).textContent = `Copy ${monthLabel(prev.monthKey)}'s bills`; }
  copy.checked = !isFirst;

  dlg.dataset.monthKey = monthKey;
  dlg.dataset.copyFrom = prev?.monthKey ?? '';
  dlg.showModal();
  amount.focus();
}

/** Open the month selector sheet, listing all months chronologically with the current one marked. */
async function openSelector() {
  const selectSheet = $.dialog($.id('monthSelectSheet'));
  const months = await Months.list();
  const list = $.html($.id('monthList'));
  list.innerHTML = '';
  for (const m of months) {
    const li = document.createElement('li');
    if (m.monthKey === selectedMonthKey) { li.className = 'selected'; }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn';
    btn.textContent = monthLabel(m.monthKey);
    btn.addEventListener('click', () => {
      void (async () => {
        selectSheet.close();
        await renderMonth(m.monthKey);
      })();
    });
    li.append(btn);
    list.append(li);
  }
  selectSheet.showModal();
}

export function setupMonth() {
  // Month title opens the selector sheet.
  const selectSheet = $.dialog($.id('monthSelectSheet'));
  $.button($.id('monthTitle')).addEventListener('click', () => void openSelector());
  $.button($.id('monthSelectClose')).addEventListener('click', () => selectSheet.close());
  selectSheet.addEventListener('click', (e) => { if (e.target === selectSheet) { selectSheet.close(); } });
  $.button($.id('startMonthBtn')).addEventListener('click', () => {
    void (async () => {
      selectSheet.close();
      await openMonthSetup(await nextMonthKey());
    })();
  });

  // Setup dialog submit / cancel.
  const setupDlg = $.dialog($.id('monthSetupDialog'));
  $.button($.id('monthSetupClose')).addEventListener('click', () => setupDlg.close());
  $.form($.id('monthSetupForm')).addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      const available = parseMoney($.input($.id('monthSetupAmount')).value);
      if (available === null || available < 0) { return; } // required; invalid stays open
      const monthKey = /** @type {string} */ (setupDlg.dataset.monthKey);
      const copyFrom = setupDlg.dataset.copyFrom || null;
      const shouldCopy = $.input($.id('monthSetupCopy')).checked && !$.html($.id('monthSetupCopyField')).classList.contains('hidden');
      await Months.create({ monthKey, available, copyFromKey: shouldCopy ? copyFrom : null });
      setupDlg.close();
      await renderMonth(monthKey);
    })();
  });
}

/** Pick the initial month: current if it exists, else latest, else prompt setup. */
export async function openInitialMonth() {
  const months = await Months.list();
  if (months.length === 0) {
    await openMonthSetup($.isoToday().slice(0, 7));
    return;
  }
  const currentKey = $.isoToday().slice(0, 7);
  const target = months.find((m) => m.monthKey === currentKey) ?? months[months.length - 1];
  if (!target) { return; }
  await renderMonth(target.monthKey);
}
