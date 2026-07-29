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

const CHEVRON_ICON = '<svg class="icon chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const PLUS_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
const BILLS_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2Z"/><path d="M9 8h6M9 12h6"/></svg>';
const EDIT_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>';
const TRASH_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>';
const CHECK_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>';

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
 * Renders the collapsible monthly status card.
 * @param {import('../compute.js').MonthView} view
 * @param {import('../data.js').BillView[]} bills
 */
function renderStatus(view, bills) {
  const card = $.html($.id('statusCard'));
  card.innerHTML = '';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'status-eyebrow';
  eyebrow.textContent = 'Available this month';

  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.textContent = formatMoney(view.safeToSpend);

  const hasBills = view.billCount > 0;
  const unpaid = view.billCount - view.paidCount;
  const unpaidReserved = bills
    .filter((bill) => !bill.paid)
    .reduce((total, bill) => total + bill.expected, 0);

  const summary = document.createElement('div');
  summary.className = 'status-summary';
  summary.append(eyebrow, hero);

  const billProgress = document.createElement('div');
  billProgress.className = 'bill-progress';
  const progressText = document.createElement('span');
  progressText.textContent = hasBills
    ? `${view.paidCount} of ${view.billCount} bills paid`
    : 'No bills added yet';
  billProgress.append(progressText);
  if (unpaid > 0) {
    const reserved = document.createElement('span');
    reserved.textContent = `${formatMoney(unpaidReserved)} reserved`;
    billProgress.append(reserved);
  }

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn disclosure-btn status-toggle';
  toggle.innerHTML = `${BILLS_ICON}<span>Bills</span>${CHEVRON_ICON}`;
  toggle.setAttribute('aria-label', statusExpanded ? 'Hide bills' : 'Show bills');
  toggle.setAttribute('aria-expanded', String(statusExpanded));
  toggle.setAttribute('aria-controls', 'monthlyBills');
  toggle.addEventListener('click', () => {
    statusExpanded = !statusExpanded;
    void refresh();
  });

  card.append(summary, billProgress, toggle);
  if (statusExpanded) {
    const section = document.createElement('section');
    section.id = 'monthlyBills';
    section.className = 'monthly-bills';
    const heading = document.createElement('div');
    heading.className = 'section-heading';
    const title = document.createElement('h2');
    title.textContent = 'Monthly bills';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn small icon-btn add-bill';
    add.innerHTML = PLUS_ICON;
    add.setAttribute('aria-label', 'Add bill');
    add.title = 'Add bill';
    add.addEventListener('click', () => void addBill());
    heading.append(title, add);
    section.append(heading, renderBillList(bills), renderAmountEditor(view));
    card.append(section);
  }
}

/**
 * Captures the actual amount while marking a bill as paid.
 * @param {import('../data.js').BillView} bill
 */
async function payBill(bill) {
  const values = await inputSheet({
    title: `Pay ${bill.name}`,
    fields: [{ name: 'amount', label: 'Actual amount', kind: 'amount', value: bill.expected, required: true }],
    confirmLabel: 'Mark paid',
  });
  if (!values) { return; }
  await Bills.setActual(bill.id, /** @type {number} */ (values.amount));
  await refresh();
}

/** Opens the add-bill sheet and creates a bill in the selected month. */
async function addBill() {
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
}

/**
 * Renders the bill list with clear payment, edit, and removal affordances.
 * @param {import('../data.js').BillView[]} bills
 * @returns {HTMLElement}
 */
function renderBillList(bills) {
  const wrap = document.createElement('div');
  wrap.className = 'bill-list';

  if (bills.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'bill-empty';
    empty.textContent = 'Add your regular bills to keep this month’s spending plan accurate.';
    wrap.append(empty);
    return wrap;
  }

  for (const bill of bills) {
    const row = document.createElement('article');
    row.className = 'bill-row';

    const main = document.createElement('div');
    main.className = 'bill-row-main';

    const pay = document.createElement('button');
    pay.type = 'button';
    pay.className = `btn small bill-paid-toggle ${bill.paid ? 'paid' : 'unpaid'}`;
    pay.innerHTML = CHECK_ICON;
    pay.setAttribute('aria-label', `Mark ${bill.name} ${bill.paid ? 'unpaid' : 'paid'}`);
    pay.title = bill.paid ? 'Mark unpaid' : 'Mark paid';
    pay.addEventListener('click', () => {
      void (async () => {
        if (bill.paid) {
          await Bills.markUnpaid(bill.id);
          await refresh();
        } else {
          await payBill(bill);
        }
      })();
    });

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'btn ghost bill-name';
    const nameText = document.createElement('span');
    nameText.textContent = bill.name;
    name.innerHTML = EDIT_ICON;
    name.prepend(nameText);
    name.setAttribute('aria-label', `Rename ${bill.name}`);
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
    amount.className = 'btn bill-amount';
    const shown = bill.paid ? (bill.actual ?? bill.expected) : bill.expected;
    const amountLabel = document.createElement('span');
    amountLabel.className = 'bill-amount-label';
    amountLabel.textContent = bill.paid ? 'Actual' : 'Expected';
    const amountValue = document.createElement('strong');
    amountValue.textContent = formatMoney(shown);
    amount.append(amountLabel, amountValue);
    if (shown !== bill.expected) {
      const expected = document.createElement('span');
      expected.className = 'bill-expected';
      expected.textContent = `${formatMoney(bill.expected)} expected`;
      amount.append(expected);
    }
    amount.insertAdjacentHTML('beforeend', CHEVRON_ICON);
    amount.setAttribute('aria-label', `Edit ${bill.paid ? 'actual' : 'expected'} amount for ${bill.name}`);
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
    remove.className = 'btn ghost icon-btn bill-remove';
    remove.innerHTML = TRASH_ICON;
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
    main.append(pay, name, remove);
    row.append(main, amount);
    wrap.append(row);
  }

  return wrap;
}

/**
 * Renders the "edit monthly amount" control.
 * @param {import('../compute.js').MonthView} view
 * @returns {HTMLElement}
 */
function renderAmountEditor(view) {
  const wrap = document.createElement('div');
  wrap.className = 'month-plan';
  const heading = document.createElement('h3');
  heading.textContent = 'Month plan';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn plan-row';
  const label = document.createElement('span');
  label.textContent = 'Starting amount';
  const value = document.createElement('strong');
  value.textContent = formatMoney(view.available);
  btn.append(label, value);
  btn.insertAdjacentHTML('beforeend', CHEVRON_ICON);
  btn.setAttribute('aria-label', `Edit monthly amount, currently ${formatMoney(view.available)}`);
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
  wrap.append(heading, btn);
  return wrap;
}

/** Index of the period containing today, or -1 if the selected month is not the current month. @param {import('../compute.js').MonthView} view */
function currentPeriodIndex(view) {
  const todayKey = $.isoToday();
  if (todayKey.slice(0, 7) !== selectedMonthKey) { return -1; }
  const day = Number(todayKey.slice(8, 10));
  const p = view.periods.find((x) => day >= x.startDay && day <= x.endDay);
  return p ? p.index : -1;
}

/** Renders period cards and their optional funding and activity details.
 * @param {import('../compute.js').MonthView} view */
async function renderPeriods(view) {
  const container = $.html($.id('periods'));
  container.innerHTML = '';
  const activities = await Activities.listForMonth(/** @type {string} */ (selectedMonthKey));
  const current = currentPeriodIndex(view);

  for (const p of view.periods) {
    const expanded = expandedPeriods.has(p.index);
    const card = document.createElement('section');
    card.className = `period-card${p.index === current ? ' current' : ''}${expanded ? ' expanded' : ''}`;

    const top = document.createElement('div');
    top.className = 'period-top';

    const heading = document.createElement('div');
    heading.className = 'period-heading';
    const range = document.createElement('span');
    range.className = 'range';
    const rangeText = `${p.startDay}–${p.endDay}`;
    range.textContent = rangeText;
    heading.append(range);
    if (p.index === current) {
      const now = document.createElement('span');
      now.className = 'now-label';
      now.textContent = 'Current';
      heading.append(now);
    }
    card.setAttribute('aria-label', `Period ${rangeText}${p.index === current ? ' (current)' : ''}`);

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'btn small icon-btn details-toggle';
    toggle.innerHTML = CHEVRON_ICON;
    toggle.setAttribute('aria-label', expanded ? 'Hide details' : 'Show details');
    toggle.title = expanded ? 'Hide details' : 'Show details';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.addEventListener('click', () => {
      if (expandedPeriods.has(p.index)) { expandedPeriods.delete(p.index); } else { expandedPeriods.add(p.index); }
      void refresh();
    });

    const body = document.createElement('div');
    body.className = 'period-body';

    const balance = document.createElement('div');
    balance.className = `period-balance${p.remaining < 0 ? ' negative' : ''}`;
    const remaining = document.createElement('strong');
    remaining.className = 'remaining';
    remaining.textContent = formatMoney(p.remaining);
    balance.append(remaining);

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn primary small icon-btn add-expense';
    add.innerHTML = PLUS_ICON;
    add.setAttribute('aria-label', 'Add expense');
    add.title = 'Add expense';
    add.addEventListener('click', () => openActivity(p.index));

    const topActions = document.createElement('div');
    topActions.className = 'period-top-actions';
    topActions.append(add, toggle);
    top.append(heading, topActions);

    body.append(balance);

    if (p.openFunds) {
      const actions = document.createElement('div');
      actions.className = 'period-actions';
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
      actions.append(move);
      body.append(actions);
    }

    // Breakdown and expense list are detail: only shown when the period is expanded.
    if (expanded) {
      const details = document.createElement('div');
      details.className = 'period-details';
      const detailsTitle = document.createElement('h3');
      detailsTitle.textContent = 'Period details';
      const breakdown = document.createElement('dl');
      breakdown.className = 'breakdown';
      const rows = [
        ['Base allocation', formatMoney(p.allocation)],
        ['Spent', formatMoney(p.spent)],
        p.carryIn ? ['Carried deficit', formatMoney(p.carryIn)] : null,
        p.transferIn ? ['Transfers in', formatMoney(p.transferIn)] : null,
        p.out ? ['Out', formatMoney(-p.out)] : null,
        p.wholeMonthDebit ? ['Whole-month funding', formatMoney(-p.wholeMonthDebit)] : null,
      ].filter((row) => row !== null);
      for (const [label, value] of rows) {
        const term = document.createElement('dt');
        term.textContent = label;
        const description = document.createElement('dd');
        description.textContent = value;
        breakdown.append(term, description);
      }
      details.append(detailsTitle, breakdown);

      const periodActivities = activities.filter((a) => a.periodIndex === p.index);
      if (periodActivities.length) {
        const activityTitle = document.createElement('h3');
        activityTitle.textContent = 'Activity';
        const list = document.createElement('div');
        list.className = 'expense-list';
        for (const a of periodActivities) {
          const item = document.createElement('button');
          item.type = 'button';
          item.className = 'btn ghost expense-item';
          const desc = document.createElement('span');
          desc.className = 'expense-desc';
          desc.textContent = a.description || (a.destination.type === 'spent' ? 'Expense' : 'Transfer');
          const amt = document.createElement('span');
          amt.className = 'expense-amount';
          amt.textContent = formatMoney(activityTotal(a.allocations));
          item.append(desc, amt);
          item.insertAdjacentHTML('beforeend', CHEVRON_ICON);
          item.addEventListener('click', () => {
            if (lastView) { void openActivityEdit({ monthKey: /** @type {string} */ (selectedMonthKey), activity: a }); }
          });
          list.append(item);
        }
        details.append(activityTitle, list);
      } else {
        const empty = document.createElement('p');
        empty.className = 'period-empty';
        empty.textContent = 'No activity in this period yet.';
        details.append(empty);
      }
      body.append(details);
    }

    card.append(top, body);
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

  const intro = $.html($.id('monthSetupIntro'));
  intro.textContent = isFirst
    ? 'Welcome to Spend. Enter what you have to work with this month, or import a backup from Settings.'
    : '';
  intro.classList.toggle('hidden', !isFirst);

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

/**
 * Renders a friendly empty state on the Month screen when no month exists yet, so the
 * screen behind the setup sheet is not blank and the bottom nav (e.g. Settings → import)
 * stays reachable if the sheet is dismissed.
 */
function renderEmptyMonth() {
  selectedMonthKey = null;
  $.html($.id('monthTitle')).textContent = 'Spend';
  const card = $.html($.id('statusCard'));
  card.innerHTML = '';
  const msg = document.createElement('p');
  msg.className = 'empty';
  msg.textContent = 'No month set up yet. Set one up to start, or import a backup from Settings.';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn primary';
  btn.textContent = 'Set up this month';
  btn.addEventListener('click', () => { void openMonthSetup($.isoToday().slice(0, 7)); });
  card.append(msg, btn);
  $.html($.id('periods')).innerHTML = '';
}

/** Pick the initial month: current if it exists, else latest, else prompt setup. */
export async function openInitialMonth() {
  const months = await Months.list();
  if (months.length === 0) {
    renderEmptyMonth();
    await openMonthSetup($.isoToday().slice(0, 7));
    return;
  }
  const currentKey = $.isoToday().slice(0, 7);
  const target = months.find((m) => m.monthKey === currentKey) ?? months[months.length - 1];
  if (!target) { return; }
  await renderMonth(target.monthKey);
}
