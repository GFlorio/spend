# Spend

Spend is a small, local-first budgeting app for tracking household bills, ordinary
spending, and savings envelopes with as little friction as possible.

It is built around a narrow daily loop:

1. Check how much is available this month and in each spending period.
2. Mark bills as paid.
3. Record an expense from the period where it happened.
4. Move leftover money somewhere purposeful.

It runs as a responsive Progressive Web App entirely on one device — no accounts,
no server, no bank integration, no sync. All data lives in the browser's IndexedDB
and can be exported, imported, or reset from Settings.

## Getting started

The repo uses [mise](https://mise.jdx.dev/) for tooling and tasks.

```bash
mise run bootstrap   # install deps + Playwright browsers + git hooks
mise run dev         # start the Vite dev server
```

Common tasks:

```bash
mise run build       # production build
mise run full-lint   # Biome + TypeScript (JSDoc) checks
mise run test-unit   # Vitest unit + integration
mise run e2e         # Playwright end-to-end
```

## Tech stack

- **Vanilla JavaScript**, type-checked through JSDoc with TypeScript (`--noEmit`).
- **Vite** for the build and dev server; **vite-plugin-pwa** / **Workbox** for the
  service worker and offline support.
- **IndexedDB** as the single local store.
- **Vitest** (unit + jsdom/`fake-indexeddb` integration) and **Playwright** (E2E).

## Interface

The app has three top-level destinations.

### Month

The operational center. It shows a month selector, a compact monthly status card
(expandable to individual bill progress), and one card per spending period. Every
period card has a persistent `+ Add` action; completed periods with a positive
balance also offer `Move leftover`.

The normal expense flow is: tap `+ Add` on a period → enter an amount → save. The
selected period is the initial source and `Spent` is the default destination.

### Envelopes

Informational: shows all envelope balances independently of the selected month.
Selecting an envelope opens its transaction history. Money movement is normally
started from a period card rather than here.

### Settings

Operational controls, not budget configuration: appearance (system / light / dark),
PWA install status, offline readiness, persistent-storage permission, and data
export / import / reset.

## Financial model

### Months

A month has a user-assigned available amount. Creating a month is explicit, so
opening a future month never silently copies incomplete data. For later months the
creation dialog defaults the available amount to the previous month's value and
offers a `Copy previous month` toggle (on by default) that copies **recurring bill
setup only** — never payments, expenses, transfers, or balances. Unused money does
not roll into the next month.

### Bills

A bill has a recurring identity and a per-month occurrence. Users see one concept;
the model distinguishes a **bill series** (stable identity and name across months)
from a **bill occurrence** (expected value, paid status, actual value, and payment
date for one month).

- Renaming a bill applies to every month.
- Changing an expected value can apply to the selected month only, or to that month
  and following months.
- Paid bills use the actual value; unpaid bills reserve the expected value.
- Paying or editing a bill recalculates all period allocations.

### Spending periods

Each month is divided into fixed ranges — 1–7, 8–14, 15–21, 22–28, and 29–end. The
final period may be shorter and receives a proportional allocation. Rounding is
deterministic and all period allocations sum exactly to the monthly spending pool.

- A negative period balance reduces the next period's available amount, and deficits
  can cascade through later periods.
- Positive balances stay in their original period.
- A completed period with a positive balance has **open funds**, which can be moved to
  the next period in the same month or to an envelope.
- Previous months with open funds are flagged in the month selector.

### Activities

One activity form covers both expenses and transfers. An activity has an amount, an
optional description, an originating month/period for context and ordering, one
destination, and one or more funding sources.

The destination sets the meaning:

- `Spent` — an expense.
- A period — money moved into that period.
- An envelope — money moved into that envelope.

Sources may be a specific period, the whole month (distributed proportionally across
periods), an envelope, or outside the budget.

```text
Expense                 Split expense           Envelope funding
To: Spent               To: Spent               To: Travel
From: 15-21 July  $100   From: 15-21 July  $60   From: 15-21 July  $100
                              Groceries    $40
```

Source allocations always sum exactly to the activity amount, with the final source
absorbing rounding residuals. Saving, editing, or deleting an activity updates its
whole record atomically. Envelope balances are allowed to go negative.

### Envelopes

Envelopes are persistent balances independent of any single month. Funding an
envelope is a transfer, not an expense — the source decreases, the envelope
increases, and monthly spending reports do not count it as spending. Spending from an
envelope reduces that envelope without reducing a period a second time.

## How it's built

- **Store facts, derive views.** Source records (months, bills, payments, activities,
  allocations, envelopes) are persisted; monthly and period totals are derived, never
  stored. Safe-to-spend, bill progress, allocations, deficit carry, open-funds flags,
  and envelope balances are all computed from the records, so recalculating the same
  inputs always produces the same result.
- **Money is integer minor units.** No binary floating point in financial math. The UI
  shows a generic `$` and uses the device locale for separators.
- **Domain logic stays independent.** Calculations (`compute.js`, `periods.js`,
  `money.js`, `split.js`) are pure and take records as input — no UI framework, DOM,
  or IndexedDB access — so they're tested directly. Framework and storage code stay
  at the edges (`ui/`, `db.js`, `data-*.js`).

## Testing

The calculation layer is the highest-risk part of the app and carries most of the
coverage. Tests are pushed down the pyramid: exhaustive pure-logic **unit** tests,
**integration** tests that exercise the real store + data + compute layers against an
in-memory IndexedDB, and a thin set of **E2E** smoke flows for what genuinely needs a
browser. See [CLAUDE.md](./CLAUDE.md) for layer conventions.

## Roadmap

Not in scope today: user accounts and sharing, multiple budget workspaces, bank /
credit-card integration, categories and analytics, bill due dates, and multiple
currencies. The local-first model is designed to stay the source of truth if
synchronization is added later — stable record IDs, atomic writes, and derived
balances are meant to make that possible without moving financial logic into a server.
