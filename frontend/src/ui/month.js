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
      activities,
      todayKey: $.isoToday(),
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
  const { view, bills } = await buildView(monthKey);
  $.html($.id('monthTitle')).textContent = monthLabel(monthKey);
  renderStatus(view, bills);
  await renderPeriods(view);
}

/** Rebuild the current month's rendering after a mutation. */
async function refresh() {
  if (selectedMonthKey) { await renderMonth(selectedMonthKey); }
}

let statusExpanded = false;

/**
 * Renders the collapsible monthly status card: collapsed shows the safe-to-spend hero,
 * paid count, and reserved total; expanded also reveals the bill list and amount editor.
 * @param {import('../compute.js').MonthView} view
 * @param {import('../data.js').BillView[]} bills
 */
function renderStatus(view, bills) {
  const card = $.html($.id('statusCard'));
  card.innerHTML = '';

  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.textContent = `${formatMoney(view.safeToSpend)} available`;

  const progress = document.createElement('div');
  progress.className = 'bill-progress';
  progress.textContent = `Bills: ${view.paidCount} of ${view.billCount} paid · ${formatMoney(view.billsReserved)} reserved`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn ghost small';
  toggle.textContent = statusExpanded ? 'Hide details' : 'Show bills';
  toggle.addEventListener('click', () => {
    statusExpanded = !statusExpanded;
    void refresh();
  });

  card.append(hero, progress, toggle);
  if (statusExpanded) { card.append(renderBillList(bills), renderAmountEditor(view)); }
}

/**
 * Renders the bill list with one-tap paid checkbox, rename, and actual-amount editing,
 * plus an "+ Add bill" control.
 * @param {import('../data.js').BillView[]} bills
 * @returns {HTMLElement}
 */
function renderBillList(bills) {
  const wrap = document.createElement('div');
  wrap.className = 'bill-list';

  for (const bill of bills) {
    const row = document.createElement('div');
    row.className = 'bill-row';

    const pay = document.createElement('input');
    pay.type = 'checkbox';
    pay.checked = bill.paid;
    pay.setAttribute('aria-label', `${bill.name} paid`);
    pay.addEventListener('change', () => {
      void (async () => {
        if (pay.checked) { await Bills.markPaid(bill.id); } else { await Bills.markUnpaid(bill.id); }
        await refresh();
      })();
    });

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'btn ghost bill-name';
    name.textContent = bill.name;
    name.addEventListener('click', () => {
      void (async () => {
        const next = prompt('Rename bill', bill.name);
        if (next?.trim()) {
          await Bills.rename(bill.seriesId, next.trim());
          await refresh();
        }
      })();
    });

    const amount = document.createElement('button');
    amount.type = 'button';
    amount.className = 'btn ghost bill-amount';
    const shown = bill.paid ? (bill.actual ?? bill.expected) : bill.expected;
    amount.textContent = shown !== bill.expected ? `${formatMoney(shown)} (exp ${formatMoney(bill.expected)})` : formatMoney(shown);
    amount.addEventListener('click', () => {
      void (async () => {
        const entered = parseMoney(prompt('Actual amount', (shown / 100).toFixed(2)) ?? '');
        if (entered !== null && entered >= 0) {
          await Bills.setActual(bill.id, entered);
          await refresh();
        }
      })();
    });

    row.append(pay, name, amount);
    wrap.append(row);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn small';
  add.textContent = '+ Add bill';
  add.addEventListener('click', () => {
    void (async () => {
      const name = prompt('Bill name')?.trim();
      if (!name) { return; }
      const expected = parseMoney(prompt('Expected amount') ?? '');
      if (expected === null || expected < 0) { return; }
      await Bills.create({ monthKey: /** @type {string} */ (selectedMonthKey), name, expected });
      await refresh();
    })();
  });
  wrap.append(add);

  return wrap;
}

/**
 * Renders the "edit monthly amount" control.
 * @param {import('../compute.js').MonthView} view
 * @returns {HTMLElement}
 */
function renderAmountEditor(view) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn ghost small';
  btn.textContent = `Monthly amount: ${formatMoney(view.available)} · Edit`;
  btn.addEventListener('click', () => {
    void (async () => {
      const entered = parseMoney(prompt('Monthly available amount', (view.available / 100).toFixed(2)) ?? '');
      if (entered !== null && entered >= 0) {
        await Months.setAvailable(/** @type {string} */ (selectedMonthKey), entered);
        await refresh();
      }
    })();
  });
  return btn;
}

/** Index of the period containing today, or -1 if the selected month is not the current month. @param {import('../compute.js').MonthView} view */
function currentPeriodIndex(view) {
  const todayKey = $.isoToday();
  if (todayKey.slice(0, 7) !== selectedMonthKey) { return -1; }
  const day = Number(todayKey.slice(8, 10));
  const p = view.periods.find((x) => day >= x.startDay && day <= x.endDay);
  return p ? p.index : -1;
}

/** Renders period cards: date range, remaining/allocated, current-period emphasis, and expense list. @param {import('../compute.js').MonthView} view */
async function renderPeriods(view) {
  const container = $.html($.id('periods'));
  container.innerHTML = '';
  const activities = await Activities.listForMonth(/** @type {string} */ (selectedMonthKey));
  const current = currentPeriodIndex(view);

  for (const p of view.periods) {
    const card = document.createElement('section');
    card.className = `period-card${p.index === current ? ' current' : ''}`;

    const range = document.createElement('div');
    range.className = 'range';
    const rangeText = `${p.startDay}–${p.endDay}`;
    range.textContent = rangeText;
    card.setAttribute('aria-label', `Period ${rangeText}`);

    const remaining = document.createElement('div');
    remaining.className = `remaining${p.remaining < 0 ? ' negative' : ''}`;
    remaining.textContent = `${formatMoney(p.remaining)} left of ${formatMoney(p.allocation)}`;

    const secondary = document.createElement('div');
    secondary.className = 'secondary';
    secondary.textContent = `${formatMoney(p.spent)} of ${formatMoney(p.allocation)}`;

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn small';
    add.textContent = '+ Add';
    add.addEventListener('click', () => openActivity(p.index));

    card.append(range, remaining, secondary, add);

    const periodActivities = activities.filter((a) => a.periodIndex === p.index);
    if (periodActivities.length) {
      const list = document.createElement('div');
      list.className = 'expense-list';
      for (const a of periodActivities) {
        const item = document.createElement('div');
        item.className = 'secondary';
        item.textContent = `${formatMoney(a.amount)} ${a.description}`.trim();
        list.append(item);
      }
      card.append(list);
    }
    container.append(card);
  }
}

/** Opens the activity dialog for a source period. @param {number} periodIndex */
function openActivity(periodIndex) {
  const dlg = $.dialog($.id('activityDialog'));
  dlg.dataset.periodIndex = String(periodIndex);
  $.input($.id('activityAmount')).value = '';
  $.input($.id('activityDescription')).value = '';
  $.html($.id('activitySource')).textContent = `From period ${periodIndex + 1}`;
  dlg.showModal();
  $.input($.id('activityAmount')).focus();
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
  setupDlg.addEventListener('click', (e) => { if (e.target === setupDlg) { setupDlg.close(); } });
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

  // Activity dialog submit / cancel.
  const activityDlg = $.dialog($.id('activityDialog'));
  $.button($.id('activityClose')).addEventListener('click', () => activityDlg.close());
  activityDlg.addEventListener('click', (e) => { if (e.target === activityDlg) { activityDlg.close(); } });
  $.form($.id('activityForm')).addEventListener('submit', (e) => {
    e.preventDefault();
    void (async () => {
      const amount = parseMoney($.input($.id('activityAmount')).value);
      if (amount === null || amount <= 0) { return; } // zero/blank cannot be saved
      const periodIndex = Number(activityDlg.dataset.periodIndex);
      await Activities.createExpense({
        monthKey: /** @type {string} */ (selectedMonthKey),
        periodIndex,
        amount,
        description: $.input($.id('activityDescription')).value.trim(),
      });
      activityDlg.close();
      await renderMonth(/** @type {string} */ (selectedMonthKey));
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
