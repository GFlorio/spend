# Derive `Activity.amount` from allocations — Design

Date: 2026-07-24
Relates to: CAL-1 ("store facts, derive views"), CAL-4/CAL-5 (conservation, deterministic money).
Follows: Slice 3 (merged, `c14903c`). Prompted by the Slice 3 final review's "conservation not
enforced on import" finding — subsumed by this change.

## 1. Problem

`Activity.amount` is a stored total that must always equal `Σ allocations.amount`. The activity
form builds allocations to sum to it, and `assertConserved` (added in Slice 3) polices the
equality on every write. That makes `amount` a redundant, independently-editable stored total —
exactly what "store facts, derive views" (CAL-1, README "Architecture principles") says not to
persist. Storing it creates an invariant to enforce (write path) and to re-validate on untrusted
import (the Slice 3 review gap).

## 2. Approach

Stop storing `amount`. Derive it as `Σ allocations.amount` via one pure helper. The conservation
invariant becomes **true by construction**, eliminating the "amount disagrees with allocations"
failure class and letting `assertConserved` be deleted. This is a net code *removal*.

Chosen exposure model: **derive in the domain + shared helper** (not a read-boundary normalizer).
Domain functions sum allocations directly; a shared pure helper serves the few non-domain call
sites. The `Activity` type no longer carries `amount`.

## 3. The helper — `src/split.js`

```js
/** Total of an activity's allocations, in integer minor units. @param {Allocation[]} allocations @returns {number} */
export const activityTotal = (allocations) => allocations.reduce((sum, a) => sum + a.amount, 0);
```

Pure; lives with the existing allocation math. Imported by `compute.js`, `data-activities.js`,
`activity.js`, `month.js`. `split.js` imports nothing, so no import cycle is introduced.
`split.js` will need the `Allocation` typedef available (import-type from `data-activities.js`
for JSDoc, or a local `@typedef`); use whichever keeps tsc green without a runtime import.

## 4. Record + write path — `src/data-activities.js`

- `Activity` typedef drops `amount`:
  `{ id, monthKey, periodIndex, destination, description, allocations, createdAt, updatedAt }`.
- `create(opts)` drops the `amount` parameter and stores a record with no `amount` field.
- `createExpense({ monthKey, periodIndex, amount, description })` keeps `amount` as an **input**
  (it constructs the single `{ source:{type:'period',periodIndex}, amount }` allocation) but passes
  only `allocations` to `create`.
- `update(id, patch)` drops `amount` from `patch`; it rebuilds the stored record explicitly
  (preserving `id`/`createdAt`/`monthKey`) so a legacy `amount` on an existing record is **not**
  carried forward by spread. Mutable fields: `destination`, `description`, `allocations`,
  `periodIndex` (optional), `updatedAt`.
- **Delete `assertConserved`** and both call sites. Rationale: the sum-equality half is now
  definitional; the non-negative-allocation half moves to the untrusted import boundary (§6),
  which is where invalid data can actually enter — within-app writes come from the activity form,
  which already clamps allocations to non-negative and guarantees a non-empty source list.

## 5. Reads

### Domain — `src/compute.js`
Import `activityTotal`. Replace the three `a.amount` reads:
- `computeMonth`: `transferIn[a.destination.periodIndex] += activityTotal(a.allocations)` for a
  `period` destination.
- `computeEnvelopes`: envelope-destination credit `+ activityTotal(a.allocations)`.
- `computeEnvelopeHistory`: the in-row `amount: activityTotal(a.allocations)`.
- The `ActivityInput` typedef drops `amount` → `{ destination, allocations }`.

### UI — `src/ui/activity.js`, `src/ui/month.js`
- `activity.js`: import `activityTotal`. `openActivityEdit` sets
  `state.total = activityTotal(activity.allocations)`; `originalContribution` uses
  `activityTotal(original.allocations)` for the envelope-destination term; `save()` calls
  `Activities.create`/`update` **without** `amount`. `state.total` remains the in-memory working
  total driving the form (unchanged); the projection reads `state.total`.
- `month.js`: import `activityTotal`. The expense-item label renders
  `formatMoney(activityTotal(a.allocations))` instead of `formatMoney(a.amount)`. Move-leftover's
  `preset.amount` is a UI input value, not a stored field — untouched.

## 6. Import validation — `src/db.js` `validateDump`

With `assertConserved` removed, add the remaining meaningful checks at the untrusted boundary so a
malformed backup is still rejected before any write:
- each activity's `allocations` is a **non-empty array**;
- each allocation's `amount` is a **non-negative integer**.

Existing period-index and `monthKey`-format checks stay. There is no `amount` field to validate;
the Slice 3 "conservation on import" finding is fully subsumed.

## 7. Migration

None required. Readers always derive the total, so the stale `amount` on records written before
this change is simply never read. New writes omit it; `update` does not reintroduce it. Export
serialises whatever is stored (legacy records may still carry `amount`; harmless) and import
ignores it. `DB_VERSION` is unchanged (no stored-shape validation depends on `amount`).

## 8. Testing

- `split.test.js`: add `activityTotal` cases — single-source mirrors the amount; multi-source sums
  exactly; empty guarded by callers (helper itself returns 0 on `[]`).
- `compute.test.js`: drop `amount` from the `expense` and envelope `act` fixture helpers; existing
  assertions on derived totals (`spent`, `safeToSpend`, history in-row amount) remain valid.
- **Delete `data-activities.test.js`** — it only exercised `assertConserved`.
- `validate-dump.test.js`: add rejection cases for a non-array `allocations` and a negative
  allocation amount.
- Integration fixtures that construct activities with `amount:` or assert `activity.amount`
  (`activities`, `envelopes`, `month-flow`, `export`, `portability`) switch to omitting `amount`
  on construction and asserting via `activityTotal(allocations)` (or the known sum).
- E2E unaffected: specs assert derived hero/period text produced by `computeMonth`.

## 9. Out of scope

Only `Activity.amount`. Bill `expected`/`actual` are user-entered facts (not derivable); envelope
balances are already derived (no stored balance). No behavior change beyond removing the redundant
stored field and the now-unnecessary write-path assertion.
