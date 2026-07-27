# First-use polish: touched-only open funds + themed dialogs

Date: 2026-07-27
Status: Approved (design)

## Problem

A design review against `docs/design-guidelines.md` surfaced two issues that most
hurt the first-use experience:

1. **A brand-new month looks broken.** Because untouched period allocations count as
   positive completed balances, creating a month partway through the calendar month
   instantly flags every already-elapsed period with an orange `Open funds` line and a
   `Move leftover` button. To a first-time user this reads as "5 problems to fix" on a
   budget they just created. It contradicts the intent of §11.2 (the indicator should
   mean *pending allocation*, not an error) and §17.3 (avoid simultaneous strong
   coloring of every period). The zero-bill month also shows a noisy
   `Bills: 0 of 0 paid · $0.00 reserved` line.

2. **Native `prompt` / `confirm` / `alert` break cohesion and can't validate.** Core
   edits (add/rename bill, edit expected/actual, edit monthly amount, add funding
   source, name a new envelope) and every confirmation jump to unstyled OS dialogs. For
   a financial app this feels untrustworthy, ignores the theme, and cannot prevent
   invalid input (§6.8, §13.6).

## Scope

In scope: the two features below and their test updates.

Out of scope (raised in review, deferred): activity-form hero amount, draggable
allocation bar, bill/expense row layout, button hierarchy, envelope color, current-period
emphasis, first-run onboarding copy. These are tracked separately.

---

## Feature 1 — Open funds only on periods with activity

### Rule

A completed period shows open funds only if it took part in at least one activity.
Derive it where the period math already lives (`compute.js`) so the month card, period
cards, and the month-selector dot all stay consistent.

### `frontend/src/compute.js`

- Compute a per-period `touched` flag from values already accumulated in the function:

  ```js
  const touched = out[i] > 0 || transferIn[i] > 0 || wholeMonthDebit[i] > 0;
  ```

  Rationale: `out[i]` covers both expenses drawn from the period and transfers out of
  it; `transferIn[i]` covers money moved into it; `wholeMonthDebit[i]` covers
  whole-month-funded expenses (which legitimately debit every period). A period the user
  never used has all three at zero.

- Change the open-funds condition (currently `completed && remaining > 0`):

  ```js
  const openFunds = completed && remaining > 0 && touched;
  ```

- Add `touched:boolean` to the `PeriodView` typedef.

- `hasOpenFunds` is already derived from `openFunds`, so a brand-new untouched month
  yields `hasOpenFunds === false` — the selector dot and per-card orange both disappear
  with no further change. No other production module changes for this rule.

### `frontend/src/ui/month.js` — zero-bill progress

In `renderStatus`, when `view.billCount === 0`:

- Do not render the `bill-progress` line at all.
- Label the expand toggle `Add a bill` instead of `Show bills` (expanding still reveals
  the empty list plus `+ Add bill`).

When `billCount > 0`, behavior is unchanged.

### Behavior notes

- A transfer *into* an untouched completed period makes it touched, so `Move leftover`
  into a past period correctly re-flags it as open funds.
- A whole-month-funded expense debits every period, so every completed period becomes
  touched and may show open funds. This is intended — those periods were really debited.
- A period with only a carried-in deficit (no activity of its own) is not touched and
  shows no open funds even if its remaining balance is positive.

---

## Feature 2 — Themed dialogs replace every `prompt` / `confirm` / `alert`

### New module `frontend/src/ui/dialogs.js`

Promise-based helpers that build a `<dialog>` on demand, `showModal()` it, resolve on
the user's choice, and remove it from the DOM on close. Mirrors the existing
`chooseScope` promise pattern in `month.js`. Reuses existing CSS
(`.sheet-inner`, `.sheet-header`, `.field`, `.btn`, `.btn.primary`, `.btn.destructive`);
adds only small styles for a message paragraph and a side-by-side action row.

| Helper | Signature | Returns |
|---|---|---|
| `inputSheet` | `{ title, fields: Array<{name, label, kind:'text'\|'amount', value?, required?}>, confirmLabel? }` | `Promise<Record<name, string\|number> \| null>` |
| `confirmDialog` | `{ title, message, confirmLabel?, cancelLabel?, destructive? }` | `Promise<boolean>` |
| `messageDialog` | `{ title, message, okLabel? }` | `Promise<void>` |
| `pickList` | `{ title, options: Array<{label, value}> }` | `Promise<any \| null>` |

Contract details:

- **`inputSheet`** renders one field row per descriptor. For `kind:'amount'` the returned
  value is integer **cents** (via `parseMoney`), and Confirm is disabled until every
  amount field parses to a value `>= 0`. For `kind:'text'` the value is the trimmed
  string, and Confirm is disabled while any `required` text field is empty. Resolves to
  an object keyed by field `name`, or `null` if cancelled. The first field is focused on
  open.
- **`confirmDialog`** shows a message and Cancel / Confirm; `destructive:true` styles
  Confirm with `.btn.destructive`. Resolves `true` only on Confirm.
- **`messageDialog`** shows a message and a single OK button; resolves when dismissed.
- **`pickList`** shows a vertical list of option buttons; resolves the chosen `value`, or
  `null` if cancelled.
- All dialogs: `aria-label` set from `title`; Escape and backdrop click resolve to the
  cancel value (`null` / `false`); focus moves into the dialog on open.

### Call sites

`frontend/src/ui/month.js`

- Rename bill → `inputSheet` (one text field).
- Edit paid actual amount → `inputSheet` (one amount field).
- Edit unpaid expected amount → `inputSheet` (one amount field) → existing `chooseScope`.
- Add bill → `inputSheet` with two fields: `name` (text, required) + `expected`
  (amount, required).
- Remove a paid bill → `confirmDialog` (destructive) → existing `chooseScope`.
- Edit monthly amount → `inputSheet` (one amount field).

`frontend/src/ui/activity.js`

- `addSource` numbered picker → `pickList` of candidate sources plus a `New envelope`
  option; choosing `New envelope` chains to `inputSheet` (text) for the name.
- New-envelope name (from the picker and from the destination `<select>`'s
  `＋ New envelope` option) → `inputSheet` (text).

`frontend/src/ui/settings.js`

- Reset all data → `confirmDialog` (destructive).
- Import replace → `confirmDialog` whose message includes the per-store summary.
- Import parse/validation failure → `messageDialog`.

The existing `billScopeDialog` (static HTML, "This month only" / "This and following
months") already matches this visual language and is left unchanged.

---

## Testing

Follow the pyramid: pure rule in unit tests, cross-layer behavior in integration, themed
dialog flows in E2E.

### Feature 1

- **`frontend/src/tests/compute.test.js`** — the existing "past month: every positive
  period is completed and open" case flips (no activities ⇒ no open funds). Rewrite it and
  add a focused describe:
  - untouched completed period ⇒ `openFunds === false`, `hasOpenFunds === false`;
  - a period with an expense drawn from it ⇒ that period `openFunds === true`, untouched
    ones `false`;
  - a transfer into an untouched completed period ⇒ that period `openFunds === true`.
- **`frontend/src/tests/integration/month-flow.integration.js`** — "open funds appear…"
  seeds an activity in the past month, then asserts only the touched period is open.

### Feature 2

- **`frontend/src/tests/*`** — `dialogs.js` has no pure logic to unit-test (amount
  validation is `parseMoney`, already covered); jsdom lacks real `<dialog>.showModal`
  support, so the module is exercised through E2E rather than unit tests.
- **`frontend/tests-e2e/split-and-envelope.spec.js`** — replace
  `page.once('dialog', d => d.accept('Travel'))` with filling the themed new-envelope
  name sheet and confirming.
- **`frontend/tests-e2e/pwa-and-data.spec.js`** — remove the `page.on('dialog', accept)`
  handler; click the themed Reset and Import confirm buttons; and the selector-dot test
  seeds an activity in a completed period (not just an available amount) so the past
  month genuinely has open funds.

---

## Definition of done

- Creating a fresh month partway through the month shows no open-funds indicators and no
  selector dot until an activity touches a completed period.
- A zero-bill month shows no bill-progress line.
- No `prompt(`, `confirm(`, or `alert(` calls remain in `frontend/src` (verified by
  grep; helper names like `confirmDialog` are fine).
- `mise run full-lint`, `mise run test-unit`, and `mise run e2e` all pass.
