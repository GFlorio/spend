import { computeMonth } from '../compute.js';
import { Activities, Bills, Months } from '../data.js';
import { formatMoney, parseMoney } from '../money.js';
import { activityTotal } from '../split.js';
import * as $ from '../utils.js';
import { openActivityCreate, openActivityEdit, setupActivity } from './activity.js';
import { confirmDialog, inputSheet } from './dialogs.js';

/**
 * Opens the scope chooser and resolves to the selected scope, or null if dismissed.
 * @param {string} title
 * @returns {Promise<'thisMonth'|'forward'|null>}
 */
function chooseScope(title) {
  return new Promise((resolve) => {
    const dlg = $.dialog($.id('billScopeDialog'));
    $.html($.id('billScopeTitle')).textContent = title;
    /** @param {'thisMonth'|'forward'|null} value */
    const done = (value) => { dlg.close(); resolve(value); };
    const thisBtn = $.button($.id('billScopeThis'));
    const fwdBtn = $.button($.id('billScopeForward'));
    const closeBtn = $.button($.id('billScopeClose'));
    const onThis = () => finish('thisMonth');
    const onFwd = () => finish('forward');
    const onClose = () => finish(null);
    const onCancel = () => finish(null);
    let settled = false;
    /** @param {'thisMonth'|'forward'|null} value */
    function finish(value) {
      if (settled) {
        return;
      }
      settled = true;
      thisBtn.removeEventListener('click', onThis);
      fwdBtn.removeEventListener('click', onFwd);
      closeBtn.removeEventListener('click', onClose);
      dlg.removeEventListener('cancel', onCancel);
      done(value);
    }
    thisBtn.addEventListener('click', onThis);
    fwdBtn.addEventListener('click', onFwd);
    closeBtn.addEventListener('click', onClose);
    dlg.addEventListener('cancel', onCancel);
    dlg.showModal();
  });
}

/** @type {string|null} */
let selectedMonthKey = null;
/** @type {import('../compute.js').MonthView|null} */
let lastView = null;
/** @type {Set<number>} indices of expanded period cards */
const expandedPeriods = new Set();

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
  if (monthKey !== selectedMonthKey) { expandedPeriods.clear(); statusExpanded = false; }
  selectedMonthKey = monthKey;
  const { view, bills } = await buildView(monthKey);
  lastView = view;
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

  const hasBills = view.billCount > 0;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn ghost small';
  toggle.textContent = statusExpanded ? 'Hide details' : hasBills ? 'Show bills' : 'Add a bill';
  toggle.addEventListener('click', () => {
    statusExpanded = !statusExpanded;
    void refresh();
  });

  card.append(hero);
  // With no bills, the "0 of 0 paid" line is noise; the toggle invites adding one instead.
  if (hasBills) {
    const progress = document.createElement('div');
    progress.className = 'bill-progress';
    progress.textContent = `Bills: ${view.paidCount} of ${view.billCount} paid · ${formatMoney(view.billsReserved)} reserved`;
    card.append(progress);
  }
  card.append(toggle);
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
        const values = await inputSheet({
          title: 'Rename bill',
          fields: [{ name: 'name', label: 'Bill name', value: bill.name, required: true }],
        });
        if (values) {
          await Bills.rename(bill.seriesId, /** @type {string} */ (values.name));
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
        if (bill.paid) {
          const values = await inputSheet({
            title: 'Actual amount',
            fields: [{ name: 'amount', label: 'Actual amount', kind: 'amount', value: bill.actual ?? bill.expected, required: true }],
          });
          if (values) { await Bills.setActual(bill.id, /** @type {number} */ (values.amount)); await refresh(); }
          return;
        }
        const values = await inputSheet({
          title: 'Expected amount',
          fields: [{ name: 'amount', label: 'Expected amount', kind: 'amount', value: bill.expected, required: true }],
        });
        if (!values) { return; }
        const scope = await chooseScope('Change expected amount');
        if (!scope) { return; }
        await Bills.setExpected(bill.id, /** @type {number} */ (values.amount), scope);
        await refresh();
      })();
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn ghost small bill-remove';
    remove.textContent = '🗑';
    remove.setAttribute('aria-label', `Remove ${bill.name}`);
    remove.addEventListener('click', () => {
      void (async () => {
        if (bill.paid) {
          const ok = await confirmDialog({
            title: 'Remove bill', message: `${bill.name} is paid. Remove it anyway?`,
            confirmLabel: 'Remove', destructive: true,
          });
          if (!ok) { return; }
        }
        const scope = await chooseScope('Remove bill');
        if (!scope) { return; }
        await Bills.remove(bill.id, scope);
        await refresh();
      })();
    });
    row.append(pay, name, amount, remove);
    wrap.append(row);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn small';
  add.textContent = '+ Add bill';
  add.addEventListener('click', () => {
    void (async () => {
      const values = await inputSheet({
        title: 'Add bill',
        fields: [
          { name: 'name', label: 'Bill name', required: true },
          { name: 'expected', label: 'Expected amount', kind: 'amount', required: true },
        ],
        confirmLabel: 'Add bill',
      });
      if (!values) { return; }
      await Bills.create({
        monthKey: /** @type {string} */ (selectedMonthKey),
        name: /** @type {string} */ (values.name),
        expected: /** @type {number} */ (values.expected),
      });
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
      const values = await inputSheet({
        title: 'Monthly amount',
        fields: [{ name: 'amount', label: 'Available this month', kind: 'amount', value: view.available, required: true }],
      });
      if (values) {
        await Months.setAvailable(/** @type {string} */ (selectedMonthKey), /** @type {number} */ (values.amount));
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

    if (p.openFunds) {
      const flag = document.createElement('div');
      flag.className = 'open-funds';
      flag.textContent = `Open funds: ${formatMoney(p.remaining)}`;
      card.append(flag);

      const move = document.createElement('button');
      move.type = 'button';
      move.className = 'btn small move-leftover';
      move.textContent = 'Move leftover';
      move.addEventListener('click', () => {
        const view = lastView;
        if (!view) { return; }
        const nextIndex = p.index + 1 < view.periods.length ? p.index + 1 : p.index;
        // Next period when one exists; for the final period the preset equals the source
        // period, which flags a conflict so the user must pick an envelope (§11.4).
        /** @type {import('../data.js').Destination} */
        const destination = { type: 'period', periodIndex: nextIndex };
        void openActivityCreate({
          monthKey: /** @type {string} */ (selectedMonthKey),
          periodIndex: p.index,
          preset: { destination, amount: p.remaining },
        });
      });
      card.append(move);
    }

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn ghost small';
    toggle.textContent = expandedPeriods.has(p.index) ? 'Hide details' : 'Details';
    toggle.addEventListener('click', () => {
      if (expandedPeriods.has(p.index)) { expandedPeriods.delete(p.index); } else { expandedPeriods.add(p.index); }
      void refresh();
    });
    card.append(toggle);

    if (expandedPeriods.has(p.index)) {
      const breakdown = document.createElement('div');
      breakdown.className = 'breakdown secondary';
      const rows = [
        `Base ${formatMoney(p.allocation)}`,
        p.carryIn ? `Carried deficit ${formatMoney(p.carryIn)}` : '',
        p.transferIn ? `Transfers in ${formatMoney(p.transferIn)}` : '',
        p.out ? `Out ${formatMoney(-p.out)}` : '',
        p.wholeMonthDebit ? `Whole-month funding ${formatMoney(-p.wholeMonthDebit)}` : '',
        `Remaining ${formatMoney(p.remaining)}`,
      ].filter(Boolean);
      breakdown.innerHTML = rows.map((r) => `<div>${r}</div>`).join('');
      card.append(breakdown);
    }

    const periodActivities = activities.filter((a) => a.periodIndex === p.index);
    if (periodActivities.length) {
      const list = document.createElement('div');
      list.className = 'expense-list';
      for (const a of periodActivities) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'btn ghost expense-item';
        item.textContent = `${formatMoney(activityTotal(a.allocations))} ${a.description}`.trim();
        item.addEventListener('click', () => {
          if (lastView) { void openActivityEdit({ monthKey: /** @type {string} */ (selectedMonthKey), activity: a }); }
        });
        list.append(item);
      }
      card.append(list);
    }
    container.append(card);
  }
}

/** Opens the universal form for a new expense from a source period. @param {number} periodIndex */
function openActivity(periodIndex) {
  if (!lastView) { return; }
  void openActivityCreate({ monthKey: /** @type {string} */ (selectedMonthKey), periodIndex });
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
    const { view } = await buildView(m.monthKey);
    if (view.hasOpenFunds) {
      const dot = document.createElement('span');
      dot.className = 'attention-dot';
      dot.textContent = '●';
      dot.setAttribute('aria-label', 'has open funds');
      dot.title = 'Has open funds';
      btn.append(dot);
    }
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

  setupActivity(async () => { await refresh(); });
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
