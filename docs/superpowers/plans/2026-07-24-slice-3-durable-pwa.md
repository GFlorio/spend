# Slice 3 — Durable PWA Prototype + Deferred Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the budget app a durable, installable, offline PWA — data export/import/reset, app-health status, month-selector attention dots — while paying down the Slice 1/2 correctness and test backlog.

**Architecture:** Harden the pure domain/data layer first (import makes previously-unreachable guards load-bearing), then add a validated full-replace import path on the single `db.js` boundary, then build the Settings modal out with a framework-free `pwa.js` browser-API adapter, then attention dots, then CSS/a11y polish, then E2E + final review.

**Tech Stack:** Vanilla ES modules + JSDoc-typed JS, Vite + `vite-plugin-pwa` (Workbox injectManifest), IndexedDB via `db.js`, Vitest (+ jsdom + fake-indexeddb), Playwright, Biome.

Spec: `docs/superpowers/specs/2026-07-24-slice-3-durable-pwa-design.md`

## Global Constraints

- All money is **integer minor units**; never binary floating point. (README/CAL-5)
- **Pure domain modules** (`compute.js`, `periods.js`, `split.js`, `money.js`) never import the UI, browser APIs, or `db.js`.
- **Single store boundary:** all IndexedDB access goes through `db.js`.
- **Derive, don't store:** balances/open-funds are computed from primary records, never persisted.
- **Atomic writes:** a save/import must not leave a partially-written dataset visible.
- **Import validates before writing** and **replaces** the dataset (no merge). Invalid input leaves data untouched.
- **`DB_VERSION` is `2`**; `exportDB()` stamps `version: 2`; import rejects any other version.
- **Status is text + icon, never color alone.** (UX-2)
- All commands run from the `frontend/` directory (mise tasks set that cwd). Working paths below are relative to `frontend/`.
- Gate every task with `mise run full-lint` (Biome + tsc) — it must stay green.
- **Commits:** scoped Conventional style (`scope: description`); **no** `Co-Authored-By` / AI attribution.

---

## File Structure

- `src/compute.js` — MODIFY: guard out-of-range period indices; feed whole-month-funded expenses into `spent[]`; simplify `computeEnvelopes`.
- `src/split.js` — MODIFY: guard `removeProportional` index.
- `src/data-activities.js` — MODIFY: export + apply `assertConserved`.
- `src/data-bills.js` — MODIFY: validate the recurrence scope string.
- `src/db.js` — MODIFY: add pure `validateDump` + `importDB`.
- `src/pwa.js` — CREATE: browser-API status adapters (install / persistent-storage / offline).
- `src/ui/settings.js` — CREATE: owns the config modal (theme + status rows + data controls).
- `src/ui/ui.js` — MODIFY: shrink to nav routing + envelopes hook (theme/config move to `settings.js`).
- `src/main.js` — MODIFY: wire `initPwa()` + `setupSettings()`.
- `index.html` — MODIFY: build out the config modal markup.
- `src/ui/month.js` — MODIFY: attention dots in the selector; reset expanded state on month change.
- `src/styles.css` — MODIFY: token cleanup, status/dot styles, responsive + focus-visible.
- Tests: new `src/tests/*.test.js`, additions to `src/tests/integration/*.integration.js`, new `tests-e2e/pwa-and-data.spec.js`.

---

# Phase A — Deferred correctness fixes + carried tests

### Task 1: Guard out-of-range period indices in `computeMonth`

**Files:**
- Modify: `src/compute.js` (activity loop, ~lines 49-62)
- Test: `src/tests/compute.test.js`

**Interfaces:**
- Consumes: existing `computeMonth({ monthKey, available, bills, activities, todayKey })`.
- Produces: `computeMonth` throws `Error(/out of range/)` when any destination/source `periodIndex` is not an integer in `[0, periods.length)`.

- [ ] **Step 1: Write the failing tests**

Add to `src/tests/compute.test.js`:

```js
describe('computeMonth — periodIndex bounds (Slice 1 deferral)', () => {
  test('throws on an out-of-range source periodIndex', () => {
    expect(() => computeMonth({ ...base, activities: [expense(99, 100)] })).toThrow(/out of range/);
  });
  test('throws on an out-of-range destination periodIndex', () => {
    expect(() => computeMonth({
      ...base,
      activities: [{
        destination: { type: 'period', periodIndex: 99 }, amount: 100,
        allocations: [{ source: { type: 'wholeMonth' }, amount: 100 }],
      }],
    })).toThrow(/out of range/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: FAIL — no error thrown (writes `NaN`/sparse entries instead).

- [ ] **Step 3: Implement the guard**

In `src/compute.js`, add a helper above `computeMonth`:

```js
/** @param {number} idx @param {number} n @param {string} what */
function assertPeriodIndex(idx, n, what) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= n) {
    throw new Error(`computeMonth: ${what} periodIndex ${idx} out of range [0,${n})`);
  }
}
```

Inside the `for (const a of activities)` loop, guard the destination and each period source:

```js
  for (const a of activities) {
    if (a.destination.type === 'period') {
      assertPeriodIndex(a.destination.periodIndex, n, 'destination');
      transferIn[a.destination.periodIndex] += a.amount;
    }
    for (const alloc of a.allocations) {
      const source = alloc.source;
      if (source.type === 'period') {
        assertPeriodIndex(source.periodIndex, n, 'source');
        out[source.periodIndex] += alloc.amount;
        if (a.destination.type === 'spent') { spent[source.periodIndex] += alloc.amount; }
      } else if (source.type === 'wholeMonth') {
```

(Leave the `wholeMonth`/envelope/outside branches as-is for now; Task 2 edits the `wholeMonth` branch.)

- [ ] **Step 4: Run to verify they pass**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: PASS (all compute tests green).

- [ ] **Step 5: Commit**

```bash
git add src/compute.js src/tests/compute.test.js
git commit -m "compute: guard out-of-range period indices"
```

---

### Task 2: Whole-month-funded expense feeds `spent[]`

**Files:**
- Modify: `src/compute.js` (`wholeMonth` source branch)
- Test: `src/tests/compute.test.js`

**Interfaces:**
- Consumes: `computeMonth`, `allocate` (already imported).
- Produces: when a `wholeMonth`-sourced allocation belongs to a `spent` activity, its proportional shares are added to `spent[]` (display only — balances/`safeToSpend` unchanged).

- [ ] **Step 1: Write the failing test**

Add to `src/tests/compute.test.js`:

```js
describe('computeMonth — whole-month-funded expense (Slice 2 deferral)', () => {
  test('feeds spent[] proportionally and leaves safe-to-spend as the net debit', () => {
    const view = computeMonth({
      ...base,
      activities: [{
        destination: { type: 'spent' }, amount: 10000,
        allocations: [{ source: { type: 'wholeMonth' }, amount: 10000 }],
      }],
    });
    expect(view.periods.reduce((s, p) => s + p.spent, 0)).toBe(10000);
    expect(view.safeToSpend).toBe(300000 - 10000);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: FAIL — `spent` sum is `0` (only period sources feed `spent[]`).

- [ ] **Step 3: Implement**

In the `wholeMonth` branch of the activity loop:

```js
      } else if (source.type === 'wholeMonth') {
        const shares = allocate(alloc.amount, periods);
        for (let i = 0; i < n; i++) {
          wholeMonthDebit[i] += shares[i];
          if (a.destination.type === 'spent') { spent[i] += shares[i]; }
        }
      }
```

- [ ] **Step 4: Run to verify it passes**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/compute.js src/tests/compute.test.js
git commit -m "compute: whole-month-funded expense feeds spent[]"
```

---

### Task 3: Simplify `computeEnvelopes` + carried compute tests

**Files:**
- Modify: `src/compute.js` (`computeEnvelopes`)
- Test: `src/tests/compute.test.js`

**Interfaces:**
- Consumes: `computeEnvelopes(envelopes, allActivities)`, `computeEnvelopeHistory(envelopeId, allActivities)`.
- Produces: `computeEnvelopes` only mutates balances for **listed** envelope ids (unlisted counterparties are ignored, not created). No behavior change for listed envelopes.

- [ ] **Step 1: Write the failing / carried tests**

Add to `src/tests/compute.test.js`:

```js
describe('computeEnvelopes / history — carried cases', () => {
  const env = (id, name) => ({ id, name, createdAt: 1, updatedAt: 1 });
  const act = (over) => ({
    id: 'act:1', monthKey: '2026-07', periodIndex: 0, description: '',
    amount: 0, destination: { type: 'spent' }, allocations: [], createdAt: 1, updatedAt: 1, ...over,
  });

  test('an activity referencing an unlisted envelope id does not affect listed balances', () => {
    const acts = [act({
      amount: 500, destination: { type: 'envelope', envelopeId: 'env:ghost' },
      allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 500 }],
    })];
    const [v] = computeEnvelopes([env('env:1', 'A')], acts);
    expect(v.balance).toBe(0);
  });

  test('an in-row counterparty lists every source of the funding activity', () => {
    const acts = [act({
      amount: 300, destination: { type: 'envelope', envelopeId: 'env:1' },
      allocations: [
        { source: { type: 'period', periodIndex: 0 }, amount: 200 },
        { source: { type: 'outside' }, amount: 100 },
      ],
    })];
    const rows = computeEnvelopeHistory('env:1', acts);
    expect(rows).toHaveLength(1);
    expect(rows[0].direction).toBe('in');
    expect(rows[0].counterparty).toEqual([{ type: 'period', periodIndex: 0 }, { type: 'outside' }]);
  });

  test('billCount counts all bills regardless of paid state', () => {
    const view = computeMonth({
      ...base,
      bills: [{ paid: true, actual: 100, expected: 100 }, { paid: false, actual: null, expected: 200 }],
    });
    expect(view.billCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify status**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: the unlisted-envelope test FAILS (a phantom `env:ghost` entry is created but not read, so `env:1` is still `0` — actually passes today); the in-row and billCount tests PASS. Confirm all three run; keep them as regression coverage.

- [ ] **Step 3: Implement the simplification**

Replace the body of `computeEnvelopes` loop with a listed-id-only update:

```js
  for (const a of allActivities) {
    const dest = a.destination;
    if (dest.type === 'envelope') {
      const cur = balance.get(dest.envelopeId);
      if (cur !== undefined) { balance.set(dest.envelopeId, cur + a.amount); }
    }
    for (const alloc of a.allocations) {
      if (alloc.source.type === 'envelope') {
        const cur = balance.get(alloc.source.envelopeId);
        if (cur !== undefined) { balance.set(alloc.source.envelopeId, cur - alloc.amount); }
      }
    }
  }
```

Keep the final `return envelopes.map((e) => ({ ...e, balance: balance.get(e.id) ?? 0 }));` (the `?? 0` narrows `Map.get`'s `number | undefined` for tsc).

- [ ] **Step 4: Run to verify they pass**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add src/compute.js src/tests/compute.test.js
git commit -m "compute: ignore unlisted envelope counterparties in balance derivation"
```

---

### Task 4: `assertConserved` on activity writes + carried filter test

**Files:**
- Modify: `src/data-activities.js`
- Test: `src/tests/data-activities.test.js` (create), `src/tests/integration/activities.integration.js` (append)

**Interfaces:**
- Consumes: existing `Activities.create` / `Activities.update`.
- Produces: `export function assertConserved(amount, allocations)` — throws unless `amount` is a non-negative integer, every allocation amount is a non-negative integer, and the allocations sum exactly to `amount`. `create`/`update` call it before persisting.

- [ ] **Step 1: Write the failing unit test**

Create `src/tests/data-activities.test.js`:

```js
import { describe, expect, test } from 'vitest';
import { assertConserved } from '../data-activities.js';

describe('assertConserved (CAL-4 conservation)', () => {
  test('accepts an exact split', () => {
    expect(() => assertConserved(100, [
      { source: { type: 'period', periodIndex: 0 }, amount: 40 },
      { source: { type: 'outside' }, amount: 60 },
    ])).not.toThrow();
  });
  test('rejects a sum that differs from the amount', () => {
    expect(() => assertConserved(100, [{ source: { type: 'outside' }, amount: 60 }])).toThrow(/sum/i);
  });
  test('rejects a negative allocation', () => {
    expect(() => assertConserved(100, [
      { source: { type: 'outside' }, amount: -100 },
      { source: { type: 'outside' }, amount: 200 },
    ])).toThrow(/non-negative/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `mise run test-unit-file src/tests/data-activities.test.js`
Expected: FAIL — `assertConserved` is not exported.

- [ ] **Step 3: Implement in `src/data-activities.js`**

Add the exported helper (after the typedefs, before `export const Activities`):

```js
/**
 * Enforces CAL-4 conservation: amount is a non-negative integer and equals the sum of
 * non-negative integer allocation amounts.
 * @param {number} amount @param {Allocation[]} allocations
 */
export function assertConserved(amount, allocations) {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Activity amount ${amount} must be a non-negative integer`);
  }
  let sum = 0;
  for (const a of allocations) {
    if (!Number.isInteger(a.amount) || a.amount < 0) {
      throw new Error(`Allocation amount ${a.amount} must be a non-negative integer`);
    }
    sum += a.amount;
  }
  if (sum !== amount) { throw new Error(`Allocations sum ${sum} !== amount ${amount}`); }
}
```

Call it at the top of `create` (first line of the method body) and `update`:

```js
  async create({ monthKey, periodIndex, destination, amount, description = '', allocations }) {
    assertConserved(amount, allocations);
    const timestamp = now();
```

```js
  async update(id, patch) {
    assertConserved(patch.amount, patch.allocations);
    const existing = await db.get('activities', id);
```

- [ ] **Step 4: Run to verify unit test passes**

Run: `mise run test-unit-file src/tests/data-activities.test.js`
Expected: PASS.

- [ ] **Step 5: Add the carried multi-record filter test**

Append to `src/tests/integration/activities.integration.js` (inside its top-level `describe`):

```js
  test('listForMonth / listForPeriod filter to the right records', async () => {
    await createMonth('2026-07', 300000);
    await addExpense('2026-07', 0, 1000);
    await addExpense('2026-07', 2, 2000);
    await addExpense('2026-07', 2, 500);
    expect(await Activities.listForMonth('2026-07')).toHaveLength(3);
    expect(await Activities.listForPeriod('2026-07', 2)).toHaveLength(2);
    expect(await Activities.listForPeriod('2026-07', 0)).toHaveLength(1);
  });
```

Ensure the file imports what it uses: `Activities` from `../../data.js`, and `createMonth`/`addExpense` from `./helpers.js` (add to existing imports if missing).

- [ ] **Step 6: Run the full unit suite**

Run: `mise run test-unit`
Expected: PASS (all).

- [ ] **Step 7: Commit**

```bash
git add src/data-activities.js src/tests/data-activities.test.js src/tests/integration/activities.integration.js
git commit -m "data: assert activity allocations conserve the amount"
```

---

### Task 5: Guard `removeProportional` index + residual coverage

**Files:**
- Modify: `src/split.js`
- Test: `src/tests/split.test.js`

**Interfaces:**
- Consumes: `removeProportional(amounts, indexToRemove, total)`, `redistributeEqual(total, count)`.
- Produces: `removeProportional` throws `Error(/out of range/)` for a non-integer or out-of-bounds `indexToRemove`.

- [ ] **Step 1: Write the failing / coverage tests**

Add to `src/tests/split.test.js`:

```js
describe('removeProportional — index guard + residual (Slice 2 deferral)', () => {
  test('throws on an out-of-range index', () => {
    expect(() => removeProportional([100, 200], 5, 300)).toThrow(/out of range/);
  });
  test('keeps proportions and sums to total', () => {
    expect(removeProportional([10, 20, 30], 0, 100)).toEqual([40, 60]);
  });
  test('assigns the flooring residual to the last kept entry', () => {
    expect(removeProportional([5, 1, 1, 1], 0, 100)).toEqual([33, 33, 34]);
  });
});
```

(If `removeProportional`/`redistributeEqual` are not already imported at the top of the file, add them.)

- [ ] **Step 2: Run to verify the guard test fails**

Run: `mise run test-unit-file src/tests/split.test.js`
Expected: the guard test FAILS (no throw; `filter` silently keeps all entries); the two residual tests PASS.

- [ ] **Step 3: Implement the guard**

At the top of `removeProportional` in `src/split.js`:

```js
export function removeProportional(amounts, indexToRemove, total) {
  if (!Number.isInteger(indexToRemove) || indexToRemove < 0 || indexToRemove >= amounts.length) {
    throw new Error(`removeProportional: indexToRemove ${indexToRemove} out of range [0,${amounts.length})`);
  }
  const kept = amounts.filter((_, i) => i !== indexToRemove);
```

- [ ] **Step 4: Run to verify all pass**

Run: `mise run test-unit-file src/tests/split.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/split.js src/tests/split.test.js
git commit -m "split: guard removeProportional index range"
```

---

### Task 6: Bill scope validation + missing-id tests

**Files:**
- Modify: `src/data-bills.js`
- Test: `src/tests/integration/bills.integration.js`, `src/tests/integration/envelopes.integration.js`

**Interfaces:**
- Consumes: `Bills.setExpected(occId, expected, scope)`, `Bills.remove(occId, scope)`, `Bills.rename`, `Envelopes.get`, `Envelopes.rename`.
- Produces: `setExpected`/`remove` throw `Error(/scope/i)` on any scope other than `'thisMonth'` or `'forward'`.

- [ ] **Step 1: Write the failing / carried tests**

Append to `src/tests/integration/bills.integration.js`:

```js
  test('setExpected rejects an unknown scope', async () => {
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 100000 });
    await expect(Bills.setExpected(occ.id, 90000, /** @type {any} */ ('bogus'))).rejects.toThrow(/scope/i);
  });
  test('remove rejects an unknown scope', async () => {
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 100000 });
    await expect(Bills.remove(occ.id, /** @type {any} */ ('bogus'))).rejects.toThrow(/scope/i);
  });
  test('rename throws for a missing series', async () => {
    await expect(Bills.rename('series:nope', 'X')).rejects.toThrow(/not found/i);
  });
```

Append to `src/tests/integration/envelopes.integration.js`:

```js
  test('get returns undefined for a missing id', async () => {
    expect(await Envelopes.get('env:nope')).toBeUndefined();
  });
  test('rename throws for a missing id', async () => {
    await expect(Envelopes.rename('env:nope', 'X')).rejects.toThrow(/not found/i);
  });
```

(Confirm each file imports `Bills` / `Envelopes` from `../../data.js`; add if missing.)

- [ ] **Step 2: Run to verify the scope tests fail**

Run: `mise run test-unit-file src/tests/integration/bills.integration.js`
Expected: the two scope tests FAIL (unknown scope silently falls through to `thisMonth`, no throw); missing-id tests PASS.

- [ ] **Step 3: Implement scope validation in `src/data-bills.js`**

Add a guard as the first line of both `setExpected` and `remove` method bodies:

```js
  async setExpected(occId, expected, scope) {
    if (scope !== 'thisMonth' && scope !== 'forward') { throw new Error(`Unknown scope ${scope}`); }
    const occ = await loadOccurrence(occId);
```

```js
  async remove(occId, scope) {
    if (scope !== 'thisMonth' && scope !== 'forward') { throw new Error(`Unknown scope ${scope}`); }
    const occ = await loadOccurrence(occId);
```

- [ ] **Step 4: Run to verify all pass**

Run: `mise run test-unit-file src/tests/integration/bills.integration.js && mise run test-unit-file src/tests/integration/envelopes.integration.js`
Expected: PASS (both files).

- [ ] **Step 5: Gate + commit**

Run: `mise run full-lint && mise run test-unit`
Expected: PASS (Biome + tsc + all unit/integration tests).

```bash
git add src/data-bills.js src/tests/integration/bills.integration.js src/tests/integration/envelopes.integration.js
git commit -m "data: validate bill recurrence scope"
```

---

# Phase B — Data portability (export / import / reset)

### Task 7: `validateDump` — pure dump validator

**Files:**
- Modify: `src/db.js`
- Test: `src/tests/validate-dump.test.js` (create)

**Interfaces:**
- Consumes: `periodsForMonthKey(monthKey)` from `periods.js`; module constants `DB_VERSION` (2) and `STORES`.
- Produces: `export function validateDump(dump)` — returns `void`, throws `Error` on any invalidity. Checks: object; `version === DB_VERSION`; each store key present and an array; every record has a string `id`; every activity has a string `monthKey` and a `periodIndex` (plus any `period`-typed destination/source index) that is an integer in range for that month.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/validate-dump.test.js`:

```js
import { describe, expect, test } from 'vitest';
import { validateDump } from '../db.js';

const good = {
  version: 2, exportedAt: 'x',
  envelopes: [], months: [], billSeries: [], billOccurrences: [], activities: [],
};

describe('validateDump (DAT-5)', () => {
  test('accepts a well-formed empty dump', () => {
    expect(() => validateDump(good)).not.toThrow();
  });
  test('rejects a non-object', () => {
    expect(() => validateDump(null)).toThrow();
  });
  test('rejects a wrong version', () => {
    expect(() => validateDump({ ...good, version: 1 })).toThrow(/version/i);
  });
  test('rejects a non-array store', () => {
    expect(() => validateDump({ ...good, months: {} })).toThrow(/array/i);
  });
  test('rejects a record without a string id', () => {
    expect(() => validateDump({ ...good, envelopes: [{ name: 'x' }] })).toThrow(/id/i);
  });
  test('rejects an activity with an out-of-range periodIndex', () => {
    const act = { id: 'act:1', monthKey: '2026-02', periodIndex: 9 }; // Feb 2026 has 4 periods
    expect(() => validateDump({ ...good, activities: [act] })).toThrow(/out of range/i);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `mise run test-unit-file src/tests/validate-dump.test.js`
Expected: FAIL — `validateDump` is not exported.

- [ ] **Step 3: Implement in `src/db.js`**

Add the import at the top:

```js
import { periodsForMonthKey } from './periods.js';
```

Add below the `STORES` definition:

```js
const STORE_KEYS = Object.keys(STORES);

/**
 * Validates an exported dump before any write. Throws on the first problem; returns void
 * when the dump is safe to import. Pure — no IndexedDB access.
 * @param {any} dump
 */
export function validateDump(dump) {
  if (!dump || typeof dump !== 'object') { throw new Error('Import: dump is not an object'); }
  if (dump.version !== DB_VERSION) {
    throw new Error(`Import: unsupported version ${dump.version} (expected ${DB_VERSION})`);
  }
  for (const key of STORE_KEYS) {
    if (!Array.isArray(dump[key])) { throw new Error(`Import: "${key}" must be an array`); }
    for (const rec of dump[key]) {
      if (!rec || typeof rec.id !== 'string') { throw new Error(`Import: a "${key}" record is missing a string id`); }
    }
  }
  for (const act of dump.activities) {
    if (typeof act.monthKey !== 'string') { throw new Error(`Import: activity ${act.id} is missing monthKey`); }
    const n = periodsForMonthKey(act.monthKey).length;
    const indices = [act.periodIndex];
    if (act.destination?.type === 'period') { indices.push(act.destination.periodIndex); }
    for (const alloc of act.allocations ?? []) {
      if (alloc?.source?.type === 'period') { indices.push(alloc.source.periodIndex); }
    }
    for (const idx of indices) {
      if (!Number.isInteger(idx) || idx < 0 || idx >= n) {
        throw new Error(`Import: activity ${act.id} periodIndex ${idx} out of range for ${act.monthKey}`);
      }
    }
  }
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `mise run test-unit-file src/tests/validate-dump.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db.js src/tests/validate-dump.test.js
git commit -m "db: validate exported dumps before import"
```

---

### Task 8: `importDB` — validated full-replace import

**Files:**
- Modify: `src/db.js`
- Test: `src/tests/integration/portability.integration.js` (create)

**Interfaces:**
- Consumes: `validateDump`, `openDB`, `STORES`, existing `exportDB`/`resetDB`/`put`/`getAll`.
- Produces: `export async function importDB(dump)` — validates, then in a single read-write transaction over all stores, clears each store and puts every record. Rejects (leaving data untouched) on invalid input.

- [ ] **Step 1: Write the failing tests**

Create `src/tests/integration/portability.integration.js`:

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';

beforeEach(async () => { await db.resetDB(); });

describe('importDB (DAT-4/5)', () => {
  test('import replaces the dataset and export round-trips it', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 300000, createdAt: 1, updatedAt: 1 });
    await db.put('envelopes', { id: 'env:1', name: 'Travel', createdAt: 1, updatedAt: 1 });
    const dump = await db.exportDB();

    await db.resetDB();
    await db.put('months', { id: 'month:2099-01', monthKey: '2099-01', available: 1, createdAt: 1, updatedAt: 1 });

    await db.importDB(dump);
    const after = await db.exportDB();
    expect(after.months).toHaveLength(1);
    expect(after.months[0].id).toBe('month:2026-07');
    expect(after.envelopes).toHaveLength(1);
  });

  test('rejects an invalid dump and leaves data untouched', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 300000, createdAt: 1, updatedAt: 1 });
    await expect(db.importDB({ version: 1 })).rejects.toThrow();
    expect(await db.getAll('months')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `mise run test-unit-file src/tests/integration/portability.integration.js`
Expected: FAIL — `db.importDB is not a function`.

- [ ] **Step 3: Implement in `src/db.js`**

Add after `exportDB`:

```js
/**
 * Validates then replaces the entire dataset in one atomic transaction. Never merges.
 * @param {any} dump @returns {Promise<void>}
 */
export async function importDB(dump) {
  validateDump(dump);
  const database = await openDB();
  const names = Object.keys(STORES);
  await new Promise((resolve, reject) => {
    const tx = database.transaction(names, 'readwrite');
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    for (const name of names) {
      const store = tx.objectStore(name);
      store.clear();
      for (const rec of dump[name]) { store.put(rec); }
    }
  });
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `mise run test-unit-file src/tests/integration/portability.integration.js`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `mise run full-lint && mise run test-unit`
Expected: PASS.

```bash
git add src/db.js src/tests/integration/portability.integration.js
git commit -m "db: import backup dumps as an atomic full replace"
```

---

# Phase C — Settings modal build-out + PWA status

### Task 9: `pwa.js` — browser-API status adapters

**Files:**
- Create: `src/pwa.js`
- Test: `src/tests/pwa.test.js` (create)

**Interfaces:**
- Consumes: `window`, `navigator.storage`, `navigator.serviceWorker`, and `db.getAll` (offline data probe).
- Produces:
  - `initPwa(): void` — capture `beforeinstallprompt` / `appinstalled`.
  - `installStatus(): 'installed'|'available'|'unsupported'`
  - `promptInstall(): Promise<boolean>`
  - `persistentStorage(): Promise<'granted'|'denied'|'unsupported'>`
  - `requestPersist(): Promise<boolean>`
  - `offlineReadiness(): Promise<{ shell: boolean, data: boolean }>`

- [ ] **Step 1: Write the failing tests**

Create `src/tests/pwa.test.js`:

```js
import { afterEach, describe, expect, test } from 'vitest';
import { installStatus, persistentStorage } from '../pwa.js';

afterEach(() => { /* each test restores what it changed */ });

describe('pwa status adapters', () => {
  test('persistentStorage reports unsupported when the API is absent', async () => {
    const orig = navigator.storage;
    Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true });
    expect(await persistentStorage()).toBe('unsupported');
    Object.defineProperty(navigator, 'storage', { value: orig, configurable: true });
  });

  test('persistentStorage reports granted when persisted() resolves true', async () => {
    Object.defineProperty(navigator, 'storage', {
      value: { persisted: () => Promise.resolve(true) }, configurable: true,
    });
    expect(await persistentStorage()).toBe('granted');
  });

  test('installStatus is installed under a standalone display-mode', () => {
    window.matchMedia = /** @type {any} */ ((q) => ({ matches: String(q).includes('standalone') }));
    expect(installStatus()).toBe('installed');
  });

  test('installStatus is unsupported without a prompt or standalone', () => {
    window.matchMedia = /** @type {any} */ (() => ({ matches: false }));
    expect(installStatus()).toBe('unsupported');
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `mise run test-unit-file src/tests/pwa.test.js`
Expected: FAIL — `src/pwa.js` does not exist.

- [ ] **Step 3: Implement `src/pwa.js`**

```js
/**
 * Browser-API adapters for PWA status. Framework-free; the only module allowed to read
 * install/storage/service-worker globals. Kept out of the domain layer.
 */
import { getAll } from './db.js';

/** @type {any} the deferred beforeinstallprompt event, when the browser offers one */
let deferredPrompt = null;
let installed = false;

/** Wire the install lifecycle listeners. Call once at startup. */
export function initPwa() {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; });
  window.addEventListener('appinstalled', () => { installed = true; deferredPrompt = null; });
}

/** @returns {'installed'|'available'|'unsupported'} */
export function installStatus() {
  if (installed || window.matchMedia?.('(display-mode: standalone)')?.matches) { return 'installed'; }
  if (deferredPrompt) { return 'available'; }
  return 'unsupported';
}

/** @returns {Promise<boolean>} whether the user accepted the install prompt */
export async function promptInstall() {
  if (!deferredPrompt) { return false; }
  deferredPrompt.prompt();
  const choice = await deferredPrompt.userChoice;
  deferredPrompt = null;
  return choice?.outcome === 'accepted';
}

/** @returns {Promise<'granted'|'denied'|'unsupported'>} */
export async function persistentStorage() {
  if (!navigator.storage?.persisted) { return 'unsupported'; }
  return (await navigator.storage.persisted()) ? 'granted' : 'denied';
}

/** @returns {Promise<boolean>} whether persistence is granted after the request */
export async function requestPersist() {
  if (!navigator.storage?.persist) { return false; }
  return await navigator.storage.persist();
}

/** @returns {Promise<{ shell:boolean, data:boolean }>} */
export async function offlineReadiness() {
  let shell = false;
  if ('serviceWorker' in navigator) {
    shell = !!navigator.serviceWorker.controller || !!(await navigator.serviceWorker.getRegistration?.());
  }
  let data = false;
  try { await getAll('months'); data = true; } catch { data = false; }
  return { shell, data };
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `mise run test-unit-file src/tests/pwa.test.js`
Expected: PASS.

- [ ] **Step 5: Gate + commit**

Run: `mise run full-lint`
Expected: PASS.

```bash
git add src/pwa.js src/tests/pwa.test.js
git commit -m "pwa: browser-API status adapters"
```

---

### Task 10: Settings modal build-out (`settings.js`, `index.html`, `ui.js`, `main.js`)

**Files:**
- Modify: `index.html` (config modal markup)
- Create: `src/ui/settings.js`
- Modify: `src/ui/ui.js` (remove theme/config; keep nav + hook)
- Modify: `src/main.js` (wire `initPwa` + `setupSettings`)

**Interfaces:**
- Consumes: `exportDB`/`importDB`/`resetDB` from `db.js`; `installStatus`/`promptInstall`/`persistentStorage`/`requestPersist`/`offlineReadiness`/`initPwa` from `pwa.js`; `$` utils.
- Produces: `export function setupSettings(): void` (wires the modal end to end, applies stored theme on load). `ui.js` keeps `setupUI` + `onEnvelopesShown` only.

- [ ] **Step 1: Update the config modal markup in `index.html`**

Replace this line inside `.config-inner`:

```html
      <p class="config-note">Data controls and app-health status arrive in a later update.</p>
```

with:

```html
      <div class="config-section">
        <div class="config-label">App status</div>
        <div class="config-status" id="statusInstall"></div>
        <div class="config-status" id="statusOffline"></div>
        <div class="config-status" id="statusStorage"></div>
      </div>
      <div class="config-section">
        <div class="config-label">Data</div>
        <button type="button" class="btn primary" id="dataExport">Export backup</button>
        <button type="button" class="btn" id="dataImport">Import backup…</button>
        <input type="file" id="dataImportFile" accept="application/json,.json" class="hidden" aria-label="Backup file">
        <button type="button" class="btn destructive" id="dataReset">Reset all data</button>
      </div>
```

- [ ] **Step 2: Create `src/ui/settings.js`**

```js
import { exportDB, importDB, resetDB } from '../db.js';
import {
  installStatus, offlineReadiness, persistentStorage, promptInstall, requestPersist,
} from '../pwa.js';
import * as $ from '../utils.js';

/** @returns {'auto'|'light'|'dark'} */
function storedTheme() {
  const v = localStorage.getItem('theme');
  return v === 'light' || v === 'dark' ? v : 'auto';
}
/** @param {'auto'|'light'|'dark'} theme */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  for (const btn of $.arr('.config-theme-btn')) {
    $.html(btn).classList.toggle('active', $.html(btn).dataset.theme === theme);
  }
}

/**
 * @param {HTMLElement} el @param {string} icon @param {string} text
 * @param {{ label:string, run:() => void }} [action]
 */
function setStatus(el, icon, text, action) {
  el.innerHTML = '';
  const glyph = document.createElement('span');
  glyph.className = 'status-icon';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = icon;
  const label = document.createElement('span');
  label.className = 'status-text';
  label.textContent = text;
  el.append(glyph, label);
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn small';
    btn.textContent = action.label;
    btn.addEventListener('click', action.run);
    el.append(btn);
  }
}

async function renderStatuses() {
  const inst = installStatus();
  setStatus(
    $.html($.id('statusInstall')),
    inst === 'installed' ? '✓' : inst === 'available' ? '⤓' : '—',
    inst === 'installed' ? 'Installed'
      : inst === 'available' ? 'Installation available'
      : 'Installation not supported in this browser',
    inst === 'available' ? { label: 'Install', run: () => { void promptInstall().then(renderStatuses); } } : undefined,
  );

  const { shell, data } = await offlineReadiness();
  const ready = shell && data;
  setStatus(
    $.html($.id('statusOffline')),
    ready ? '✓' : '!',
    ready ? 'Ready to work offline'
      : `Offline readiness: app shell ${shell ? 'ok' : 'unavailable'}, data ${data ? 'ok' : 'unavailable'}`,
    ready ? undefined : { label: 'Retry', run: () => { void renderStatuses(); } },
  );

  const store = await persistentStorage();
  setStatus(
    $.html($.id('statusStorage')),
    store === 'granted' ? '✓' : store === 'denied' ? '!' : '—',
    store === 'granted' ? 'Persistent storage granted'
      : store === 'denied' ? 'Persistent storage not granted'
      : 'Persistent storage not supported',
    store === 'denied' ? { label: 'Request', run: () => { void requestPersist().then(renderStatuses); } } : undefined,
  );
}

/** @param {string} filename @param {string} text */
function download(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** @param {any} dump @returns {string} a human summary of per-store counts */
function summarize(dump) {
  const keys = ['months', 'billSeries', 'billOccurrences', 'activities', 'envelopes'];
  return keys.map((k) => `${Array.isArray(dump?.[k]) ? dump[k].length : 0} ${k}`).join('\n');
}

export function setupSettings() {
  applyTheme(storedTheme());

  const modal = $.dialog($.id('configModal'));
  $.button($.id('configBtn')).addEventListener('click', () => { modal.showModal(); void renderStatuses(); });
  $.button($.id('configModalClose')).addEventListener('click', () => modal.close());
  modal.addEventListener('click', (e) => { if (e.target === modal) { modal.close(); } });

  for (const btn of $.arr('.config-theme-btn')) {
    $.html(btn).addEventListener('click', () => {
      const theme = /** @type {'auto'|'light'|'dark'} */ ($.html(btn).dataset.theme);
      localStorage.setItem('theme', theme);
      applyTheme(theme);
    });
  }

  $.button($.id('dataExport')).addEventListener('click', () => {
    void (async () => { download('spend-backup.json', JSON.stringify(await exportDB(), null, 2)); })();
  });

  const fileInput = $.input($.id('dataImportFile'));
  $.button($.id('dataImport')).addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    void (async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) { return; }
      /** @type {any} */
      let dump;
      try { dump = JSON.parse(await file.text()); } catch { alert('Import failed: the file is not valid JSON.'); return; }
      if (!confirm(`Replace all local data with:\n${summarize(dump)}\n\nThis cannot be undone.`)) { return; }
      try { await importDB(dump); } catch (e) {
        alert(`Import failed: ${e instanceof Error ? e.message : 'invalid file'}`);
        return;
      }
      location.reload();
    })();
  });

  $.button($.id('dataReset')).addEventListener('click', () => {
    void (async () => {
      if (!confirm('Erase ALL local financial data? This cannot be undone.')) { return; }
      await resetDB();
      location.reload();
    })();
  });
}
```

- [ ] **Step 3: Slim `src/ui/ui.js`** to nav + envelopes hook only

```js
import * as $ from '../utils.js';

/** @type {() => Promise<void>} */
let refreshEnvelopes = async () => {};
/** @param {() => Promise<void>} fn */
export function onEnvelopesShown(fn) { refreshEnvelopes = fn; }

export function setupUI() {
  for (const tab of $.arr('.tab[data-page]')) {
    $.html(tab).addEventListener('click', () => {
      const page = /** @type {'month'|'envelopes'} */ ($.html(tab).dataset.page);
      $.showPage(page);
      if (page === 'envelopes') { void refreshEnvelopes(); }
    });
  }
}
```

- [ ] **Step 4: Wire startup in `src/main.js`**

```js
import { initPwa } from './pwa.js';
import { renderEnvelopes, setupEnvelopes } from './ui/envelopes.js';
import { openInitialMonth, setupMonth } from './ui/month.js';
import { setupSettings } from './ui/settings.js';
import { onEnvelopesShown, setupUI } from './ui/ui.js';

void (async function init() {
  initPwa();
  setupUI();
  setupSettings();
  setupMonth();
  setupEnvelopes();
  onEnvelopesShown(async () => { await renderEnvelopes(); });
  await openInitialMonth();
  await renderEnvelopes();
})();
```

- [ ] **Step 5: Gate (lint + typecheck + existing suite)**

Run: `mise run full-lint && mise run test-unit`
Expected: PASS (no test touches the moved DOM wiring; the E2E smoke in Task 13 exercises it).

- [ ] **Step 6: Manual verification**

Run: `mise run dev`, open the app, open Settings. Confirm: theme buttons still switch and persist across reload; the three status rows render with an icon + text; Export downloads a `spend-backup.json`; Reset asks for confirmation then returns to the setup dialog. Stop the dev server when done.

- [ ] **Step 7: Commit**

```bash
git add index.html src/ui/settings.js src/ui/ui.js src/main.js
git commit -m "settings: data controls and app-health status"
```

---

# Phase D — Month-selector attention dots + expanded-state fix

### Task 11: Attention dots + reset expanded state on month change

**Files:**
- Modify: `src/ui/month.js`

**Interfaces:**
- Consumes: `buildView(monthKey)` (returns `{ view }` where `view.hasOpenFunds:boolean`), `renderMonth`, module `expandedPeriods:Set<number>` and `statusExpanded:boolean`.
- Produces: the month selector renders an accessible attention dot on months with open funds; switching months clears expanded state.

- [ ] **Step 1: Reset expanded state on month change**

In `renderMonth`, add the reset as the first statements (before `selectedMonthKey = monthKey;`):

```js
export async function renderMonth(monthKey) {
  if (monthKey !== selectedMonthKey) { expandedPeriods.clear(); statusExpanded = false; }
  selectedMonthKey = monthKey;
  const { view, bills } = await buildView(monthKey);
```

- [ ] **Step 2: Render attention dots in `openSelector`**

Inside the `for (const m of months)` loop, after `btn.textContent = monthLabel(m.monthKey);` and before appending the click handler, add:

```js
    const { view } = await buildView(m.monthKey);
    if (view.hasOpenFunds) {
      const dot = document.createElement('span');
      dot.className = 'attention-dot';
      dot.textContent = '●';
      dot.setAttribute('aria-label', 'has open funds');
      dot.title = 'Has open funds';
      btn.append(dot);
    }
```

- [ ] **Step 3: Gate**

Run: `mise run full-lint && mise run test-unit`
Expected: PASS (behavioral coverage is the Task 13 E2E; this step confirms nothing regressed).

- [ ] **Step 4: Manual verification**

Run: `mise run dev`. Create the current month; expand a period's Details, switch to another month via the selector, switch back — Details should be collapsed (no leaked state). Stop the dev server.

- [ ] **Step 5: Commit**

```bash
git add src/ui/month.js
git commit -m "ui: month-selector attention dots; reset expanded state on month change"
```

---

# Phase E — Style tokens + responsive / a11y polish

### Task 12: CSS token cleanup, status/dot styles, responsive + focus

**Files:**
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: existing `--sN` spacing tokens, `--brand`/`--warning`/`--negative`/`--positive`, `.config-*`, `.month-list`, new `.config-status`/`.status-icon`/`.status-text`/`.attention-dot`.
- Produces: no dead `var()` fallback hexes; spacing via tokens; status rows, attention dot, `:focus-visible`, and a ≥720px responsive layout styled.

- [ ] **Step 1: Replace hardcoded px with tokens in the Slice-2 sections**

In the "Universal activity form", "Envelopes", and "Period open funds + breakdown" blocks, replace literal pixel spacings with tokens using this mapping: `4px → var(--s1)`, `8px → var(--s2)`, `12px → var(--s3)`, `16px → var(--s4)`, `24px → var(--s5)`. For example:

```css
.sources-head { display: flex; justify-content: space-between; align-items: center; margin-top: var(--s3); }
.sources { display: flex; flex-direction: column; gap: var(--s2); }
.source-row { display: flex; align-items: center; gap: var(--s2); }
.alloc-bar { display: flex; height: 10px; border-radius: 10px; overflow: hidden; margin: var(--s3) 0; background: color-mix(in srgb, Canvas 85%, GrayText); }
.activity-projection { font-size: 0.9rem; opacity: 0.85; margin: var(--s1) 0; }
.open-funds { color: var(--warning); font-size: 0.9rem; margin-top: var(--s2); }
.move-leftover { margin-top: var(--s1); }
.breakdown { display: flex; flex-direction: column; gap: 2px; margin-top: var(--s2); }
```

- [ ] **Step 2: Remove dead `var()` fallback hexes and fix the `.month-list` de-sync**

Drop the `, #hex` fallbacks (the tokens always exist in `:root`), and remove the duplicate `.month-list` gap override in the Envelopes rule so it keeps the token gap from its own rule:

```css
.alloc-seg-0 { background: var(--brand); }
.alloc-seg-1 { background: var(--positive); }
.alloc-seg-2 { background: var(--warning); }
.alloc-seg-3 { background: color-mix(in srgb, var(--brand) 60%, GrayText); }
.activity-error { color: var(--negative); font-size: 0.9rem; min-height: 1.2em; margin: 0; }
.envelope-list, .history-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--s2); }
.envelope-balance.negative { color: var(--negative); }
.envelope-balance.positive { color: var(--positive); }
.history-amount.out { color: var(--negative); }
.btn.destructive { color: var(--negative); }
```

Keep the single `.month-list { ...; gap: var(--s2); }` rule near the top (line ~67) and delete `month-list` from the combined Envelopes selector so its gap is not re-set.

- [ ] **Step 3: Add status, attention-dot, focus, and responsive rules** (append near the end):

```css
/* Settings status rows + attention dot (Slice 3) */
.config-theme-row { display: flex; gap: var(--s2); }
.config-theme-btn.active { border-color: var(--brand); color: var(--brand); }
.config-status { display: flex; align-items: center; gap: var(--s2); min-height: 44px; }
.config-status .status-icon { width: 1.5rem; text-align: center; }
.config-status .status-text { flex: 1; }
.attention-dot { color: var(--warning); margin-left: var(--s2); font-size: 0.7rem; vertical-align: middle; }

:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

@media (min-width: 720px) {
  .app { max-width: 760px; }
  .periods { display: grid; grid-template-columns: repeat(2, 1fr); }
}
```

- [ ] **Step 4: Gate**

Run: `mise run full-lint && mise run test-unit`
Expected: PASS.

- [ ] **Step 5: Manual verification**

Run: `mise run dev`. Check light/dark and a ≥720px width: period cards form two columns; status rows, attention dot, and keyboard focus outlines look right; nothing relies on color alone. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/styles.css
git commit -m "ui: spacing tokens, status/dot styles, responsive + focus-visible"
```

---

# Phase F — E2E smoke + final review

### Task 13: E2E — data controls round-trip + attention dot

**Files:**
- Create: `tests-e2e/pwa-and-data.spec.js`

**Interfaces:**
- Consumes: `resetDB(page)` from `./playwright-helpers.js`; the app's `window.__testDB` seam (`reset`/`put`); the Settings modal (`configBtn` = "Settings"), `#dataExport`, `#dataImportFile`, `#dataReset`, `#monthSetupClose`.
- Produces: two deterministic smoke tests.

- [ ] **Step 1: Write the spec**

Create `tests-e2e/pwa-and-data.spec.js`:

```js
import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDB(page);
});

test('export, reset, then re-import restores the dataset', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');

  // Create a month.
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');

  // Export a backup.
  await page.getByRole('button', { name: 'Settings' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ]);
  expect(download.suggestedFilename()).toContain('spend-backup');
  const filePath = await download.path();

  // Reset wipes everything → the setup dialog returns.
  await page.getByRole('button', { name: 'Reset all data' }).click();
  await expect(page.getByLabel('Available this month')).toBeVisible();

  // Cancel setup so the nav is reachable, then re-import the backup.
  await page.locator('#monthSetupClose').click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.setInputFiles('#dataImportFile', filePath);

  // Import reloads the app; the month is restored.
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');
});

test('the month selector marks a past month with open funds', async ({ page }) => {
  // Seed a clearly-past month (all periods completed) with an unspent pool.
  await page.evaluate(async () => {
    await /** @type {any} */ (window).__testDB.put('months', {
      id: 'month:2000-01', monthKey: '2000-01', available: 300000, createdAt: 1, updatedAt: 1,
    });
  });
  await page.reload();

  await page.getByRole('button', { name: /January 2000/ }).click();
  await expect(page.locator('#monthList .attention-dot')).toBeVisible();
});
```

- [ ] **Step 2: Run the spec**

Run: `mise run e2e-file tests-e2e/pwa-and-data.spec.js`
Expected: PASS (2 tests). Playwright builds + previews the production bundle first.

- [ ] **Step 3: Run the full E2E + unit suites**

Run: `mise run test`
Expected: PASS — all unit/integration + all E2E specs.

- [ ] **Step 4: Final gate**

Run: `mise run full-lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests-e2e/pwa-and-data.spec.js
git commit -m "e2e: data controls round-trip and attention dot"
```

- [ ] **Step 6: Final whole-slice review**

Use `superpowers:requesting-code-review` on the whole `slice-3-durable-pwa` branch against the spec. Verify: conservation still holds; import truly leaves data untouched on failure; status is never color-only; no domain module imports browser/db; `exportDB`↔`importDB` round-trips. Record the outcome in `.superpowers/sdd/progress.md`, then use `superpowers:finishing-a-development-branch`.

---

## Self-Review

**Spec coverage:**
- §2.1 compute periodIndex bounds → Task 1. §2.2 conservation assertion → Task 4. §2.3 `removeProportional` guard → Task 5. §2.4 whole-month expense `spent[]` → Task 2. §2.5 scope validation → Task 6. §2.6 `computeEnvelopes` cleanup → Task 3. §2.7 expanded-state leak → Task 11.
- §3 carried tests → Tasks 3 (billCount, in-row counterparty, unlisted envelope), 4 (multi-record filter), 5 (residual), 6 (missing-id).
- §4 `validateDump` + `importDB` → Tasks 7, 8.
- §5 Settings/`pwa.js` (install/offline/storage + export/import/reset, theme moved) → Tasks 9, 10.
- §6 attention dots → Task 11.
- §7 tokens + responsive/a11y → Task 12.
- §8 tests → distributed (unit/integration in A/B, E2E in Task 13).
- §9 phasing → A–F headers.

**Placeholder scan:** none — every code/test step carries full content and exact commands.

**Type consistency:** `validateDump(dump)`, `importDB(dump)`, `assertConserved(amount, allocations)`, `installStatus()`, `persistentStorage()`, `offlineReadiness()→{shell,data}`, `setupSettings()`, `onEnvelopesShown`/`setupUI` are used identically wherever referenced. `buildView` returns `{ view, bills }` as in the existing source; Task 11 destructures `{ view }`.
