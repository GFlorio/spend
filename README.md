# Spend

Spend is a small, local-first budgeting application for tracking household bills, ordinary spending, and savings envelopes with as little friction as possible.

It is designed around a narrow daily loop:

1. Check how much is available this month and in each spending period.
2. Mark bills as paid.
3. Record an expense from the period where it occurred.
4. Move leftover money somewhere purposeful.

The initial prototype is a responsive Progressive Web App that works entirely on one device. It has no accounts, server, bank integration, or synchronization. A future version may use DumbSync, with each budget workspace mapped to a sync channel.

## Product goals

- Make the common operations require as few decisions and taps as possible.
- Show the current financial state at a glance.
- Keep advanced detail available without making it part of the default workflow.
- Store primary financial records and derive balances from them.
- Work reliably offline and update the interface immediately.
- Keep the codebase small, explicit, and easy to maintain.
- Make invalid financial inputs difficult to construct in the UI.

## Prototype scope

The prototype contains one implicit local budget workspace. The user can:

- Create months with an explicit available amount.
- Optionally copy the previous month's bill setup.
- Add recurring monthly bills with expected values.
- Mark bills as paid with actual values.
- Divide ordinary spending into fixed seven-day periods.
- Record expenses against a period, one or more envelopes, or both.
- Move money between periods and envelopes using the same activity form.
- Create and inspect persistent envelope balances.
- Identify completed periods that still contain open funds.
- Browse prior months through the month selector.
- Export, import, and reset all local data.
- Inspect PWA installation, offline, and persistent-storage status.
- Select system, light, or dark appearance.

The prototype deliberately excludes:

- User accounts, sharing, and synchronization.
- Multiple budget workspaces.
- Bank or credit-card integration.
- Expense categories, analytics, and forecasting.
- Bill due dates.
- Multiple currencies.
- User-entered dates for ordinary expenses and transfers.
- A dedicated history screen.

## Core interface

The application has three top-level destinations.

### Month

The Month screen is the operational center of the application.

It contains:

- A month selector.
- A compact monthly status card.
- Bill progress, with individual bills available by expanding the status card.
- One card for each spending period.
- A persistent `+ Add` action on every period card.
- A `Move leftover` action on completed periods with positive balances.

The normal expense flow should be:

1. Tap `+ Add` on a period.
2. Enter an amount.
3. Save.

The selected period is initially the sole source. The destination defaults to `Spent`.

### Envelopes

The Envelopes screen is primarily informational. It shows all current envelope balances independently of the selected month.

Selecting an envelope opens its transaction history. Money movement is normally initiated from a period card rather than from the envelope screen.

### Settings

Settings contains operational application controls rather than budget configuration:

- Appearance: system, light, or dark.
- PWA installation status.
- Offline readiness.
- Persistent-storage permission.
- Data export.
- Data import.
- Full data reset.

## Financial model

### Months

A month has an available amount assigned by the user. Creating a month is explicit so that opening a future month cannot accidentally copy incomplete data.

For subsequent months, the creation prompt:

- Defaults the available amount to the previous month's value.
- Offers a `Copy previous month` toggle, enabled by default.
- Copies recurring bill setup only.
- Never copies payments, expenses, transfers, or balances.

Unused money does not automatically roll into the following month.

### Bills

A bill has a recurring identity and a month-specific occurrence.

Users see a single concept, but the code distinguishes:

- **Bill series:** stable identity and name across months.
- **Bill occurrence:** expected value, paid status, actual value, and payment date for one month.

Rules:

- Renaming a bill applies to every month.
- Changing an expected value can apply to the selected month only or to that month and following months.
- Paid bills use the actual value.
- Unpaid bills reserve the expected value.
- Paying or editing a bill triggers a global recalculation of all period allocations.

### Spending periods

Months are divided into these ranges:

- 1-7
- 8-14
- 15-21
- 22-28
- 29-end of month

The final period may be shorter and receives a proportional allocation. Rounding must be deterministic, and all period allocations must sum exactly to the monthly spending pool.

Rules:

- A negative period balance reduces the next period's available amount.
- Deficits can cascade through later periods.
- Positive balances remain in their original period.
- A completed positive period is considered to have **open funds**.
- Open funds can be moved to the next period in the same month or to an envelope.
- Previous months with open funds are marked in the month selector.

### Activities

The application uses one activity form for both expenses and transfers.

An activity has:

- An amount.
- An optional description.
- An originating month and period for context and ordering.
- One destination.
- One or more funding sources.

The destination determines the meaning of the activity:

- `Spent`: an expense.
- A period: money moved into that period.
- An envelope: money moved into that envelope.

Valid sources may include:

- A specific period.
- The whole month, distributed proportionally across all periods.
- An envelope.
- Outside the budget.

Examples:

```text
Expense
To: Spent
From: 15-21 July     $100
```

```text
Split expense
To: Spent
From: 15-21 July      $60
      Groceries        $40
```

```text
Envelope funding
To: Travel
From: 15-21 July     $100
```

```text
Envelope transfer
To: Travel
From: Emergency      $100
```

```text
Positive carry
To: 15-21 July
From: 8-14 July      $100
```

All source allocations must sum exactly to the activity amount. The final source absorbs rounding residuals. Envelope balances are allowed to become negative.

### Envelopes

Envelopes are persistent balances that exist independently of any one month.

Funding an envelope is a transfer, not an expense:

- The source decreases.
- The envelope increases.
- Monthly spending reports do not count the transfer as spending.

Spending from an envelope reduces that envelope without reducing a period a second time.

## Architecture principles

### Keep domain rules independent

Budget calculations must not live inside UI components or IndexedDB callbacks. Domain modules should be pure TypeScript wherever practical and accept records as input rather than reading global state.

### Store facts, derive views

Persist source records such as months, bills, payments, activities, allocations, and envelopes. Do not persist independently editable monthly or period totals.

Derived values include:

- Monthly safe-to-spend amount.
- Bill progress.
- Period allocations and balances.
- Deficit carry.
- Open-funds indicators.
- Envelope balances.

This keeps calculations reproducible and makes future synchronization safer.

### Use integer money

Money must be stored as integer minor units. Do not use binary floating-point arithmetic for financial calculations.

The UI may display a generic `$` symbol and use the device locale for decimal and grouping separators.

### Make operations atomic

Saving, editing, or deleting an activity must update its complete record atomically. Partially saved source allocations must never become visible.

### Prefer one local store boundary

The prototype does not need a repository class for every entity. A single local data-store interface keeps imports, resets, migrations, and future sync integration simpler.

### Keep framework code at the edges

The domain and application modules should not depend on the UI framework, browser APIs, or IndexedDB implementation. This allows calculations to be tested directly and permits the storage layer to evolve later.


## Suggested data records

The exact schema can evolve, but the prototype will likely need records equivalent to:

- `Workspace`
- `BudgetMonth`
- `BillSeries`
- `BillOccurrence`
- `Period`
- `Envelope`
- `Activity`
- `Allocation`
- `AppPreferences`

Every financial record should have a stable unique ID. Internal creation and update timestamps are useful for ordering, debugging, import/export, and eventual synchronization, even though ordinary activities have no user-editable date.

## Testing strategy

The calculation layer is the highest-risk part of the application and should receive most of the early test coverage.

### Domain tests

Cover at least:

- Period generation for all month lengths.
- Proportional allocation and rounding residuals.
- Paid actual versus unpaid expected bill values.
- Global bill-variance recalculation.
- Cascading period deficits.
- Contained period surpluses.
- Open-funds detection.
- Whole-month envelope funding.
- Split expenses.
- Envelope-to-envelope transfers.
- Negative envelope balances.
- Editing and deleting activities.

### Invariant tests

Assert that:

- Activity allocations always sum exactly to the activity total.
- Internal transfers preserve total money.
- Envelope funding is not counted as spending.
- Envelope-funded expenses do not reduce period money twice.
- Recalculating the same source records produces the same result.
- Import followed by export preserves the financial dataset.

### Feature tests

Focus on the shortest workflows:

- Create a month.
- Mark a bill paid with its expected amount.
- Record a one-source expense.
- Add and remove allocation sources.
- Move all leftover funds.
- Export and restore data.

## Future synchronization

The local-first model should remain the source of truth when DumbSync is introduced.

The current stable IDs, atomic records, and derived balances are intended to make this addition possible without moving financial calculations into the server or sync protocol.

Synchronization is not part of the initial prototype and should not complicate the first implementation beyond preserving clean record identities and deterministic calculations.
