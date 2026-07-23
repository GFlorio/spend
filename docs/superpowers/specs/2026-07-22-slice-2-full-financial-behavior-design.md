# Slice 2 — Full Financial Behavior: Design

**Status:** Approved for planning
**Date:** 2026-07-22
**Predecessor:** Slice 1 (basic usable budget) — merged at `0f1d873`.

## Goal

Extend the Slice 1 budget into the full financial model from `docs/prototype-epics.md`:
split funding, envelopes, the universal move-money form, whole-month envelope funding,
period deficit carry, open funds and *Move leftover*, envelope transaction history, and
editing/deletion of both activities and recurring bills.

After Slice 2 the app answers: *How do I split an expense? Where did an envelope balance
come from? What happens to money I overspend or leave behind? How do I fix a mistake?*

## Scope decisions (settled during brainstorming)

- **One spec, one phased plan** (A–F below), matching how Slice 1 was executed.
- **Split-allocation UI:** per-source exact-amount inputs with add/remove/redistribute plus a
  **read-only** proportion bar. Draggable dividers (§13.4 of the design guidelines) are
  **deferred**; the accessible exact-amount path (§13.5) is delivered now.
- **Bill lifecycle included:** BIL-4 (edit/undo payment), BIL-6 (scoped expected-value change),
  BIL-7 (scoped removal with paid-confirmation) are part of Slice 2.

Out of scope (Slice 3): month-selector attention dots (the *computed* open-funds flag lands in
Slice 2; the dot rendering does not), import, reset, offline shell, PWA/storage status,
responsive/a11y refinement, draggable allocation bar.

## Global constraints (carried from Slice 1)

- Money is integer minor units; never float math. (README §Use integer money)
- Periods are derived, never persisted. Domain modules (`money`, `periods`, `split`, `compute`)
  stay free of DOM and IndexedDB.
- Every financial record has `id`, `createdAt`, `updatedAt`.
- Saving/editing/deleting an activity is one atomic `put`/`delete`; allocations are embedded in
  the activity record. (CAL-4)
- Balances are always derived from primary records — never stored totals. (CAL-1)
- TDD: failing test first. Each phase ends green on `mise run full-lint` plus its tests.
- Work on a feature branch, not `master`.

---

## 1. Data model

### 1.1 New store: `envelopes`

```
Envelope = { id:string, name:string, createdAt:number, updatedAt:number }
```

Balance is **derived**, never stored (CAL-1). Envelopes exist independently of any month
(§14.1). Balances may go negative (TRX-10, §6.7).

### 1.2 Generalized `Activity`

The Slice 1 record already carries `allocations:[{source,amount}]`. Slice 2 widens `source`
and turns `destination` into a discriminated object:

```
Destination =
  | { type:'spent' }                      // an expense
  | { type:'period',   periodIndex }      // money moved into a period
  | { type:'envelope', envelopeId }       // money moved into an envelope

Source =
  | { type:'period',   periodIndex }      // a specific period of this activity's month
  | { type:'wholeMonth' }                 // debited proportionally across all periods
  | { type:'envelope', envelopeId }
  | { type:'outside' }                    // external money (only when destination is envelope)

Activity = {
  id, monthKey,
  periodIndex,                            // originating period: temporal/ordering context only
  destination:  Destination,
  amount:       number,                   // === Σ allocations.amount  (CAL-4)
  description:  string,
  allocations:  [{ source: Source, amount: number }],
  createdAt, updatedAt,
}
```

`periodIndex` remains the originating period even for `wholeMonth`/`outside` sources
(TRX-6/7 keep the activity associated with a period for ordering and display).

### 1.3 Source/destination validity (§12.4/12.5, TRX-11)

- At least one source always; the **last** source cannot be removed.
- A source cannot equal the destination (no self-transfer).
- No duplicate sources.
- No negative allocations; zero-total activities cannot be saved.
- `outside` is a **source** only, and only when the destination is an envelope.
- `wholeMonth` is a source only (funds a destination proportionally from the month).

### 1.4 DB migration v1 → v2 (complete wipe)

There are no real users, so v2 is a **clean wipe** — no data-preserving migration and no
activity-normalization step. Bump `DB_VERSION` to 2. In `onupgradeneeded`, delete any existing
object stores and recreate all stores fresh (now including `envelopes`, `keyPath:'id'`, no
indexes). Because the store shapes are created from scratch, all new records use the generalized
`Activity` shape from the start; there is no legacy `destination:'spent'` string to normalize.

### 1.5 Export

`exportDB()` gains the `envelopes` store. Import remains Slice 3.

---

## 2. Pure domain

### 2.1 `split.js` (new, pure)

Keeps allocation math out of the DOM so it is exhaustively unit-tested (§13.2/13.3).

- `redistributeEqual(total, count) => number[]` — equal split, last entry absorbs residual.
- `removeProportional(amounts, indexToRemove, total) => number[]` — drop one source, preserve
  relative proportions of the rest, last entry absorbs residual so the sum stays `total`.
- Residual rule is deterministic (last source), consistent with `periods.allocate`.

### 2.2 `compute.js` — `computeMonth` extended

Signature becomes:

```
computeMonth({ monthKey, available, bills, activities, todayKey }) => MonthView
```

For each period `i`, in order:

- `base[i]` = proportional allocation of `spendingPool` (`allocate`, unchanged).
- `out[i]` = Σ of `allocation.amount` for every allocation sourced from `{period, i}` — this
  covers **both** expenses (`destination.type==='spent'`) and transfers out
  (`destination.type` is `period`/`envelope`).
- `wholeMonthDebit[i]` = period `i`'s proportional share (by day count) of every
  `wholeMonth`-sourced allocation across all activities.
- `transferIn[i]` = Σ `activity.amount` for activities whose `destination` is `{period, i}`.
- `net[i]  = base[i] + transferIn[i] − out[i] − wholeMonthDebit[i]`
- `spent[i]` = the expense-only portion of `out[i]` (for display; `out` includes transfers).

**Deficit carry (PER-5/6):**

```
carryIn[0] = 0
balance[i]  = net[i] + carryIn[i]
carryIn[i+1] = min(0, balance[i])     // only negatives cascade; positives stay put
```

Displayed period "remaining" = `balance[i]`.

**Safe-to-spend (CAL-2 — the subtle invariant):**

```
safeToSpend = Σ net[i]     // pre-carry nets, NOT Σ balance[i]
```

Summing post-carry balances would double-count carried deficits. `Σ net[i]` is provably equal
to `available − billsReserved − periodFundedExpenses − monthToEnvelopeFunding
+ envelopeToPeriodTransfers` (period↔period transfers cancel). Tests assert both forms agree.

**Open funds (PER-8, §11.1):** a period is *completed* when the month is fully in the past, or
— for the current month — its `endDay < today`'s day. A completed period with `balance[i] > 0`
has open funds. `todayKey` is passed in (pure/testable). `MonthView.hasOpenFunds` = any
completed period with a positive balance (feeds the Slice 3 attention dot; used now by
*Move leftover*).

**`PeriodView`** exposes the breakdown for the expanded card (PER-4): `base`, `carryIn`,
`transferIn`, `out`, `spent`, `remaining`(=`balance`), `completed`, `openFunds`.

### 2.3 `computeEnvelopes(envelopes, allActivities) => EnvelopeView[]`

Per envelope: `balance = Σ (+amount when destination is this envelope)
− Σ (allocation.amount for each allocation sourced from this envelope)`, over **all** activities
in **all** months. History (ENV-3) is derived the same way: each referencing activity yields a
row with amount, direction (in/out), counterparty (`Spent`, a period, another envelope, or
`Outside`), month + period context, and description. Rows reconcile to the balance.

---

## 3. Data modules

### 3.1 `data-activities.js`

- Replace `createExpense` with general `create({ monthKey, periodIndex, destination, amount,
  description, allocations })`.
- Add `update(id, patch)` and `remove(id)` (TRX-12). Edit/delete is replace/remove of one atomic
  record; balances re-derive. Partial refund = reduce amount; full refund = delete.
- Retain a thin `createExpense` convenience (single period source, `destination:{type:'spent'}`)
  if it keeps callers/tests simple.

### 3.2 `data-envelopes.js` (new)

- `list()`, `get(id)`, `create({name})`, `rename(id, name)`.
- `withBalances()` and `history(id)` derive via `computeEnvelopes` over `getAll('activities')`.
- Inline **New envelope** (ENV-1) is persisted only when the enclosing activity is **saved**, so
  cancelling leaves no empty envelope. (UI creates the envelope, then the activity, at save time.)

### 3.3 `data-bills.js`

- `setExpected(occId, expected, scope)` and `remove(occId, scope)` with
  `scope ∈ {'thisMonth','forward'}`. `forward` touches this occurrence plus later **existing**
  months' occurrences of the same series; months created later inherit via the copy step.
  Previous months are never changed (BIL-6). Removing the last occurrence may leave the series
  record orphaned — acceptable; or delete the series when it has no occurrences.
- BIL-4 payment edit reuses existing `setActual` / `markUnpaid`; the UI exposes them on paid bills.

---

## 4. UI

### 4.1 `ui/activity.js` (new — `month.js` is already ~370 lines)

The universal transaction form (§12–13):

- Fields: amount (focused on open), optional description.
- **Destination** picker: Spent / a period / an envelope / New envelope. Title flips
  *Add expense* (Spent) ↔ *Move money* (period/envelope) — §12.2.
- **Source** rows, each: source picker (period / whole month / envelope / New envelope /
  Outside — *Outside* only when destination is an envelope), an editable exact-amount input, and
  a remove control (disabled on the last source).
- Add-source redistributes equally (`redistributeEqual`); remove redistributes proportionally
  (`removeProportional`); the last source absorbs residual so allocations always equal the total.
- **Read-only** proportion bar reflecting the amounts (no dragging in Slice 2).
- Validity by construction (§1.3): blocks negatives/dups/self-transfer, keeps the sum equal to
  the total, disables Save on zero total.
- Shows the **projected envelope balance** before saving when a source or destination is an
  envelope (TRX-10), with sign/status text (not color alone).
- Modes: create, **edit** (reopen an existing activity in the same form), **delete** (reverses
  all effects — TRX-12).

### 4.2 `ui/envelopes.js` (new)

- Overview: every envelope with name + current balance; positive/zero/negative visually
  distinct via sign + text, not color alone (§14.2, ENV-2).
- Detail: transaction history for one envelope (ENV-3).
- **No** Add/Remove/Transfer actions on either view (ENV-4); movement starts from a period.

### 4.3 `ui/month.js` changes

- Period expense/transfer items become tappable → open the form in **edit** mode.
- **Move leftover** button on completed periods with a positive balance (PER-7): opens the form
  in *Move money* mode prefilled with source = that period, amount = full positive balance,
  destination selectable (next period in the month, or an envelope). Amount stays editable.
- Expanded period card shows the breakdown: base / carried deficit / transfers in-out / spent
  (PER-4).
- Bill rows gain scope-aware **expected-value edit** and **remove** via a small scope dialog
  (*This month* / *This and following*); removing a **paid** bill requires confirmation (BIL-7).
- Open-funds treatment on completed positive period cards (text/status, not color alone).

### 4.4 `index.html`

- Expand the activity dialog markup (destination select, dynamic source rows container,
  proportion bar, projected-balance line).
- Add an envelope-detail container and a bill-scope dialog.

---

## 5. Testing (down the pyramid)

Per `CLAUDE.md`: pick the lowest layer that expresses each test.

### Unit (`src/**/*.test.js`)

- `split.js`: equal redistribution, proportional removal, residual on last, sum invariants.
- `compute.js`: deficit cascade through multiple periods; final-period deficit stays as a
  month-end overrun; positive balances contained (do not increase the next period); whole-month
  debit proportional and summing to the funded amount; open-funds detection vs `todayKey`
  (past month = all completed; current month = only elapsed periods); `safeToSpend === Σ net[i]`
  **and** `!== Σ balance[i]` when a deficit is displayed; idempotence.
- `computeEnvelopes`: funding/spending/transfer effects; negative balances; history reconciles.

### Integration (`src/**/*.integration.js`) — primary proof of whole-system behavior

Split expense (period + envelope); whole-month envelope funding (period balances drop, not
counted as spending); envelope→envelope transfer (both histories, total preserved);
envelope→period; period→period carry/positive move; **Move leftover** to next period and to an
envelope; **edit** = partial refund; **delete** = full reversal; bill expected-value **forward**
propagation across existing later months (earlier months untouched); bill **removal** by scope.
Invariants (CAL-4): allocations sum to total; internal transfers conserve money; envelope funding
is not spending; envelope-funded expense does not reduce a period twice; recompute is
deterministic; **export includes envelopes** and round-trips.

### E2E (`tests-e2e/*.spec.js`) — thin, browser-only

One split-expense flow (enter amount, add an envelope source, save, see balances update); one
fund-an-envelope flow (fund from a period, switch to Envelopes screen, see the balance). No
duplication of integration coverage.

---

## 6. Phased implementation order

Each phase is TDD and ends green on `mise run full-lint` + its tests.

- **A. Model & storage.** DB v2 + migration; `envelopes` store; generalized `Activity` typedefs
  and `data-activities` (`create`/`update`/`remove`); `data-envelopes`; export includes envelopes.
- **B. Pure domain.** `split.js`; `computeMonth` extended (whole-month debit, transfers,
  deficit carry, correct safe-to-spend, open funds, per-period breakdown); `computeEnvelopes`.
- **C. Universal form.** `index.html` markup; `ui/activity.js` (pickers, exact amounts,
  redistribution, read-only bar, validity, projected balance, inline new-envelope, create/edit/
  delete); wire period **+ Add** and item-tap-to-edit.
- **D. Envelopes screen + move-leftover + open funds.** `ui/envelopes.js` overview + detail;
  Move-leftover button and open-funds treatment on period cards.
- **E. Bill lifecycle.** `data-bills` `setExpected(scope)` / `remove(scope)`; scope dialog UI;
  paid-removal confirmation; payment editor (BIL-4).
- **F. Integration + E2E + polish.** Full integration suite and thin E2E smoke; `styles.css` for
  the new components; final `full-lint`.

## Resolved decisions

- **Global recalculation cost:** deriving envelope balances scans all activities. Accepted as
  fine at prototype scale; revisit only if profiling ever shows otherwise.
- **`forward` bill edits** touch only *existing* later months by design. Months created later
  inherit the new value through the month-creation copy step, not through retroactive writes.
- **DB v2 is a clean wipe** (see §1.4) — no user data to preserve.
