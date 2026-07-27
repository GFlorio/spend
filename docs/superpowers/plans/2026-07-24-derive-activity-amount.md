# Derive `Activity.amount` from allocations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop storing the redundant `Activity.amount`; derive it from `Σ allocations.amount` so conservation is true by construction.

**Architecture:** Add one pure helper `activityTotal(allocations)` in `split.js`. First switch every reader of `activity.amount` to it (behavior-preserving; records still store `amount`). Then remove `amount` from the stored record, the `Activity`/`ActivityInput` types, the write path, and `assertConserved`. Finally move the now-orphaned allocation-validity checks to the untrusted import boundary (`validateDump`).

**Tech Stack:** Vanilla JSDoc-typed ES modules, IndexedDB via `db.js`, Vitest (+ jsdom + fake-indexeddb), Playwright, Biome + strict tsc.

Spec: `docs/superpowers/specs/2026-07-24-derive-activity-amount-design.md`

## Global Constraints

- Money is **integer minor units**; no binary floating point.
- **Pure domain modules** (`compute.js`, `periods.js`, `split.js`, `money.js`) import no UI, browser APIs, or `db.js`. (`split.js` may use a **type-only** `import('./data-activities.js').Allocation` — erased at runtime, no cycle.)
- **Single store boundary:** all IndexedDB access through `db.js`.
- **Derive, don't store:** `Activity` no longer carries a stored `amount`; the total is always `activityTotal(allocations)`. There is exactly one definition of "the total."
- Import **validates before any write** and leaves data untouched on invalid input.
- All commands run from `frontend/` (mise cwd). Gate every task with `mise run full-lint` (Biome + tsc) — must stay green.
- **Commits:** scoped Conventional style; **no** `Co-Authored-By` / AI attribution.

---

## File Structure

- `src/split.js` — ADD `activityTotal(allocations)`.
- `src/compute.js` — read totals via `activityTotal`; `ActivityInput` typedef drops `amount`.
- `src/ui/activity.js` — read totals via `activityTotal`; `save()` stops passing `amount`.
- `src/ui/month.js` — expense-item label via `activityTotal`.
- `src/data-activities.js` — `Activity` typedef + `create`/`update` drop stored `amount`; `createExpense` keeps `amount` as input only; delete `assertConserved`.
- `src/db.js` — `validateDump` validates allocations (non-empty array, non-negative integer amounts).
- Tests: `split.test.js` (+activityTotal), `compute.test.js` (fixtures drop `amount`), delete `data-activities.test.js`, integration fixtures updated, `validate-dump.test.js` (+allocation cases, fix one existing fixture).

---

### Task 1: `activityTotal` helper

**Files:**
- Modify: `src/split.js`
- Test: `src/tests/split.test.js`

**Interfaces:**
- Produces: `export const activityTotal = (allocations) => number` — sum of `allocation.amount`, integer minor units; `[]` → `0`.

- [ ] **Step 1: Write the failing tests**

Append to `src/tests/split.test.js` (and add `activityTotal` to the existing `import { ... } from '../split.js';` line):

```js
describe('activityTotal (CAL-1: derive the total from allocations)', () => {
  test('a single source mirrors that source amount', () => {
    expect(activityTotal([{ source: { type: 'period', periodIndex: 0 }, amount: 5000 }])).toBe(5000);
  });
  test('multiple sources sum exactly', () => {
    expect(activityTotal([
      { source: { type: 'period', periodIndex: 0 }, amount: 6000 },
      { source: { type: 'envelope', envelopeId: 'env:1' }, amount: 4000 },
    ])).toBe(10000);
  });
  test('empty allocations total zero', () => {
    expect(activityTotal([])).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `mise run test-unit-file src/tests/split.test.js`
Expected: FAIL — `activityTotal` is not exported.

- [ ] **Step 3: Implement in `src/split.js`**

At the top of the file add the type-only import, and append the helper at the end:

```js
/** @typedef {import('./data-activities.js').Allocation} Allocation */
```

```js
/**
 * Total of an activity's allocations, in integer minor units.
 * @param {Allocation[]} allocations
 * @returns {number}
 */
export const activityTotal = (allocations) => allocations.reduce((sum, a) => sum + a.amount, 0);
```

- [ ] **Step 4: Run to verify they pass**

Run: `mise run test-unit-file src/tests/split.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/split.js src/tests/split.test.js
git commit -m "split: add activityTotal helper"
```

---

### Task 2: Switch readers to `activityTotal` (behavior-preserving)

**Files:**
- Modify: `src/compute.js`, `src/ui/activity.js`, `src/ui/month.js`

**Interfaces:**
- Consumes: `activityTotal` from `src/split.js`.
- Produces: no external signature change. Every read of a stored `activity.amount` now derives from `allocations`. Records still store `amount` (removed in Task 3), so behavior is identical.

This is a **behavior-preserving refactor**: `amount === Σ allocations.amount` still holds (records store it and `assertConserved` still guards it), so the existing tests that exercise these paths — `compute.test.js` period-destination `transferIn`, envelope-destination balance, and `computeEnvelopeHistory` in-row amount — are the regression coverage. No new test; the gate is the existing suite staying green.

- [ ] **Step 1: Edit `src/compute.js`**

Add the import (extend the existing `./periods.js` import line region):

```js
import { activityTotal } from './split.js';
```

Replace the three reads of `a.amount`:
- In `computeMonth`, the `period` destination branch:
  `transferIn[a.destination.periodIndex] += activityTotal(a.allocations);`
- In `computeEnvelopes`, the envelope-destination credit:
  `if (cur !== undefined) { balance.set(dest.envelopeId, cur + activityTotal(a.allocations)); }`
- In `computeEnvelopeHistory`, the in-row `amount`:
  `activityId: a.id, direction: 'in', amount: activityTotal(a.allocations),`

- [ ] **Step 2: Edit `src/ui/activity.js`**

Add `activityTotal` to the existing `import { redistributeEqual, removeProportional } from '../split.js';` line →
`import { activityTotal, redistributeEqual, removeProportional } from '../split.js';`

Replace the two reads of a stored activity's `amount`:
- In `originalContribution`, the envelope-destination term:
  `contribution += activityTotal(original.allocations);`
- In `openActivityEdit`:
  `state.total = activityTotal(activity.allocations);`

(Leave `state.total`, `row.amount`, `preset.amount`, and all allocation-`amount` logic unchanged — those are the in-memory working total and per-source amounts, not the stored field.)

- [ ] **Step 3: Edit `src/ui/month.js`**

Add the import:

```js
import { activityTotal } from '../split.js';
```

Replace the expense-item label (in `renderPeriods`):
`item.textContent = \`${formatMoney(activityTotal(a.allocations))} ${a.description}\`.trim();`

- [ ] **Step 4: Run the full unit suite + lint**

Run: `mise run test-unit && mise run full-lint`
Expected: PASS — all 104 tests green (behavior unchanged), Biome + tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/compute.js src/ui/activity.js src/ui/month.js
git commit -m "compute: derive activity totals from allocations at read sites"
```

---

### Task 3: Remove the stored `amount` (record, types, write path, assertion)

**Files:**
- Modify: `src/data-activities.js`, `src/compute.js` (typedef only), `src/ui/activity.js` (`save()` only)
- Test: `src/tests/compute.test.js`, `src/tests/integration/activities.integration.js`, `src/tests/integration/month-flow.integration.js`, `src/tests/integration/envelopes.integration.js`
- Delete: `src/tests/data-activities.test.js`

**Interfaces:**
- Produces:
  - `Activity` = `{ id, monthKey, periodIndex, destination, description, allocations, createdAt, updatedAt }` (no `amount`).
  - `Activities.create({ monthKey, periodIndex, destination, description?, allocations })` — no `amount` param.
  - `Activities.createExpense({ monthKey, periodIndex, amount, description? })` — keeps `amount` as an **input** (builds the single allocation); does not store it.
  - `Activities.update(id, { destination, description, allocations, periodIndex? })` — no `amount`; rebuilds the record explicitly (drops any legacy stored `amount`).
  - `assertConserved` removed.
  - `compute.js` `ActivityInput` = `{ destination, allocations }`.

- [ ] **Step 1: Write the failing test** (derivation works with no stored `amount`)

Append to `src/tests/integration/activities.integration.js` (inside the top-level describe). Add `activityTotal` to imports: `import { activityTotal } from '../../split.js';`

```js
  test('a created activity stores no amount field; its total derives from allocations', async () => {
    const a = await Activities.create({
      monthKey: '2026-07', periodIndex: 0, destination: { type: 'spent' },
      allocations: [
        { source: { type: 'period', periodIndex: 0 }, amount: 6000 },
        { source: { type: 'outside' }, amount: 4000 },
      ],
    });
    const stored = await Activities.get(a.id);
    expect(stored).toBeDefined();
    expect('amount' in /** @type {object} */ (stored)).toBe(false);
    expect(activityTotal(/** @type {any} */ (stored).allocations)).toBe(10000);
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise run test-unit-file src/tests/integration/activities.integration.js`
Expected: FAIL — `create` currently requires `amount` (tsc/`assertConserved`) and stores an `amount` field, so `'amount' in stored` is `true`.

- [ ] **Step 3: Rewrite `src/data-activities.js`**

Drop `amount` from the `Activity` typedef:

```js
 * @typedef {{ id:string, monthKey:string, periodIndex:number, destination:Destination, description:string, allocations:Allocation[], createdAt:number, updatedAt:number }} Activity
```

Delete the entire `assertConserved` function (the `export function assertConserved(...) { ... }` block).

Replace `create`:

```js
  /**
   * Persists an activity as one atomic record. Its total is derived from `allocations`.
   * @param {{ monthKey:string, periodIndex:number, destination:Destination, description?:string, allocations:Allocation[] }} opts
   * @returns {Promise<Activity>}
   */
  async create({ monthKey, periodIndex, destination, description = '', allocations }) {
    const timestamp = now();
    /** @type {Activity} */
    const activity = {
      id: activityId(monthKey, timestamp),
      monthKey, periodIndex, destination, description, allocations,
      createdAt: timestamp, updatedAt: timestamp,
    };
    await db.put('activities', activity);
    return activity;
  },
```

Replace `createExpense` (keep the `amount` input, stop passing it to `create`):

```js
  /**
   * Convenience for the common one-source period expense.
   * @param {{ monthKey:string, periodIndex:number, amount:number, description?:string }} opts
   * @returns {Promise<Activity>}
   */
  async createExpense({ monthKey, periodIndex, amount, description = '' }) {
    return await Activities.create({
      monthKey, periodIndex, description,
      destination: { type: 'spent' },
      allocations: [{ source: { type: 'period', periodIndex }, amount }],
    });
  },
```

Replace `update` (rebuild explicitly so a legacy `amount` is not carried forward):

```js
  /**
   * Replaces the mutable fields of an existing activity, preserving id/createdAt/monthKey.
   * @param {string} id
   * @param {{ destination:Destination, description:string, allocations:Allocation[], periodIndex?:number }} patch
   * @returns {Promise<Activity>}
   */
  async update(id, patch) {
    const existing = await db.get('activities', id);
    if (!existing) { throw new Error(`Activity ${id} not found`); }
    /** @type {Activity} */
    const next = {
      id: existing.id,
      monthKey: existing.monthKey,
      createdAt: existing.createdAt,
      periodIndex: patch.periodIndex ?? existing.periodIndex,
      destination: patch.destination,
      description: patch.description,
      allocations: patch.allocations,
      updatedAt: now(),
    };
    await db.put('activities', next);
    return next;
  },
```

- [ ] **Step 4: Edit `src/compute.js` — drop `amount` from `ActivityInput`**

```js
 * @typedef {{ destination:Destination, allocations:Allocation[] }} ActivityInput
```

- [ ] **Step 5: Edit `src/ui/activity.js` — `save()` stops passing `amount`**

In `save()`, the two calls become:

```js
  if (state.mode === 'edit' && state.editingId) {
    await Activities.update(state.editingId, { destination, description, allocations });
  } else {
    await Activities.create({ monthKey: state.monthKey, periodIndex: state.periodIndex, destination, description, allocations });
  }
```

(`state.total` still drives the form and the projection — unchanged.)

- [ ] **Step 6: Delete the obsolete assertion test**

```bash
git rm src/tests/data-activities.test.js
```

- [ ] **Step 7: Drop `amount:` from test fixtures** (tsc excess-property check now requires this)

In `src/tests/compute.test.js`:
- The `expense` helper — remove the top-level `amount` property (keep the `amount` parameter feeding the allocation):
  `const expense = (periodIndex, amount) => ({ destination: { type: 'spent' }, allocations: [{ source: { type: 'period', periodIndex }, amount }] });`
- The envelope `act` helper — remove `amount: 0` from its base object and remove any `amount: ...` from each `act({ ... })` override.
- Remove the top-level `amount: ...` line from every inline activity object literal passed to `computeMonth`/`computeEnvelopes` (the ones at the whole-month expense test, the period-destination test, the envelope-destination test, the periodIndex-guard tests, and the envelope-history test). The allocations already carry the amounts.

In `src/tests/integration/month-flow.integration.js`: remove `amount: ...,` from each `Activities.create({ ... })` call (four of them).

In `src/tests/integration/envelopes.integration.js`: remove `amount: ...,` from each `Activities.create({ ... })` call (two of them).

In `src/tests/integration/activities.integration.js`:
- Add `import { activityTotal } from '../../split.js';` (if not already added in Step 1).
- Remove `amount: 10000,` from the `Activities.create({ ... })` call.
- Remove `amount: 3000,` and `amount: 2000,` from the two `Activities.update(...)` patch objects.
- Rewrite the two assertions that read `.amount`:
  - `expect(a.amount).toBe(5000);` → `expect(activityTotal(a.allocations)).toBe(5000);`
  - `expect((await Activities.get(a.id))?.amount).toBe(3000);` →
    ```js
    const updated = await Activities.get(a.id);
    expect(updated).toBeDefined();
    expect(activityTotal(/** @type {any} */ (updated).allocations)).toBe(3000);
    ```

- [ ] **Step 8: Run the full unit suite + lint**

Run: `mise run test-unit && mise run full-lint`
Expected: PASS — all tests green (one fewer file after the delete; the new Step-1 test passes), Biome + tsc clean (no excess-property or missing-property errors).

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "data: stop storing derived activity amount"
```

---

### Task 4: Validate allocations on import

**Files:**
- Modify: `src/db.js` (`validateDump`)
- Test: `src/tests/validate-dump.test.js`

**Interfaces:**
- Consumes: `validateDump(dump)`.
- Produces: `validateDump` additionally rejects an activity whose `allocations` is not a non-empty array, or any allocation whose `amount` is not a non-negative integer. Order of activity checks: `monthKey` → `allocations` shape/amounts → period-index ranges.

- [ ] **Step 1: Write the failing / adjusted tests**

In `src/tests/validate-dump.test.js`:

First, **fix the existing out-of-range test** so its fixture has valid allocations (otherwise the new allocations check fires first). Change its `act` to:
```js
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 9, allocations: [{ source: { type: 'outside' }, amount: 1 }] };
```
(It must still `toThrow(/out of range/i)` — `periodIndex: 9` for Feb 2026's 4 periods.)

Then add:
```js
  test('rejects an activity whose allocations is not an array', () => {
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 0, allocations: {} };
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/allocations/i);
  });
  test('rejects an activity with empty allocations', () => {
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 0, allocations: [] };
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/allocations/i);
  });
  test('rejects a negative allocation amount', () => {
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 0, allocations: [{ source: { type: 'outside' }, amount: -5 }] };
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/allocation amount/i);
  });
```

- [ ] **Step 2: Run to verify status**

Run: `mise run test-unit-file src/tests/validate-dump.test.js`
Expected: the three new tests FAIL (no allocations validation yet); the adjusted out-of-range test PASS.

- [ ] **Step 3: Implement in `src/db.js` `validateDump`**

In the `for (const act of dump.activities)` loop, immediately after the `monthKey` check and before computing `const n = periodsForMonthKey(...)`, insert:

```js
    if (!Array.isArray(act.allocations) || act.allocations.length === 0) {
      throw new Error(`Import: activity ${act.id} must have a non-empty allocations array`);
    }
    for (const alloc of act.allocations) {
      if (!alloc || !Number.isInteger(alloc.amount) || alloc.amount < 0) {
        throw new Error(`Import: activity ${act.id} has an invalid allocation amount`);
      }
    }
```

Since `allocations` is now guaranteed an array, simplify the existing period-source index loop from `for (const alloc of act.allocations ?? [])` to `for (const alloc of act.allocations)`.

- [ ] **Step 4: Run to verify they pass**

Run: `mise run test-unit-file src/tests/validate-dump.test.js`
Expected: PASS (all).

- [ ] **Step 5: Full gate + commit**

Run: `mise run full-lint && mise run test`
Expected: PASS — Biome + tsc clean; all unit/integration + all E2E green.

```bash
git add src/db.js src/tests/validate-dump.test.js
git commit -m "db: validate activity allocations on import"
```

---

## Self-Review

**Spec coverage:**
- §3 `activityTotal` helper → Task 1. §4 record/write path + delete `assertConserved` → Task 3. §5 domain + UI reads → Tasks 2 (reads) and 3 (`save()` write + `ActivityInput`). §6 import validation → Task 4. §7 migration (rebuild-not-spread in `update`, readers derive) → Task 3 Step 3. §8 tests → distributed (Task 1 split, Task 3 fixtures + delete, Task 4 validate-dump). §9 out-of-scope respected (only `Activity.amount`).

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `activityTotal(allocations)` signature identical across Tasks 1–3. `Activity`/`ActivityInput` drop `amount` together in Task 3 (Steps 3–4) alongside every fixture (Step 7), so no excess/missing-property tsc error survives the task. `createExpense` keeps its `amount` input; `create`/`update` drop it. `validateDump` check order (monthKey → allocations → periodIndex) is stated and the existing out-of-range fixture is adjusted to match (Task 4 Step 1).

**Ordering:** Task 2 is green because records still store a conserved `amount` while readers derive; Task 3 flips storage + types + fixtures atomically; nothing is left reading `a.amount` before storage is removed.
