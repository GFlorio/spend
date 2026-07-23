# Slice 2 — Full Financial Behavior Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Slice 1 budget with split funding, envelopes, the universal move-money form, whole-month funding, period deficit carry, open funds + *Move leftover*, envelope history, and editing/deletion of activities and recurring bills — all derived deterministically from primary records.

**Architecture:** Continues the Slice 1 layering. Pure domain modules (`money`, `periods`, `split`, `compute`) hold all financial math with no DOM/DB and are unit-tested. A single `db.js` boundary wraps IndexedDB. Thin `data-*` modules orchestrate storage + domain and are proven by in-memory integration tests. Per-screen UI modules render from the derived view. The `Activity` record is generalised into a discriminated `destination` + `allocations[{source,amount}]` shape that expresses every expense and transfer.

**Tech Stack:** Vite, vanilla ES2023 + JSDoc (tsc-checked), raw IndexedDB, Vitest (jsdom) + `fake-indexeddb`, Playwright, Biome, mise.

## Global Constraints

- **Money is integer minor units (cents).** Never do financial math in floating point; divide by 100 only when formatting. (README §Use integer money)
- **Periods are never persisted** — always derived from the month key. Domain modules (`money`, `periods`, `split`, `compute`) contain **no** DOM or IndexedDB imports.
- **Every financial record has** `id`, `createdAt`, `updatedAt` (from `now()`, which is strictly monotonic — ordering by id is stable).
- **Saving/editing/deleting an activity is one atomic `put`/`delete`** — allocations are embedded in the activity record.
- **Balances are always derived** from primary records — never stored totals. (CAL-1)
- **`amount === Σ allocations.amount`** for every activity. (CAL-4)
- **DB v2 is a clean wipe** — no data-preserving migration.
- **Prefer `mise run <task>`.** Each task ends green on `mise run full-lint` plus its tests.
- **TDD**: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **Biome rules in force:** no `==`, `useConst`, `useBlockStatements` (always braces), no unused vars/imports, `noFloatingPromises` (use `void promise` or `await`).
- **Branch:** work on `slice-2-full-financial-behavior` (already created; the spec commit lives there).

## Testing layers

- **Unit** `src/**/*.test.js` — pure domain (`split`, `compute`), no DB/DOM. Exhaustive edge coverage.
- **Integration** `src/**/*.integration.js` — real `db.js` + `data-*.js` + `compute.js` against `fake-indexeddb`. Primary proof of whole-system behavior. Runs inside `mise run test-unit`.
- **E2E** `tests-e2e/*.spec.js` — browser-only smoke (rendered DOM, reload). Thin; never duplicates integration coverage.

## File structure (created / modified in this slice)

```
frontend/
  index.html                       # MODIFY: richer activity dialog; envelope detail + bill-scope dialogs
  src/
    split.js                       # NEW (pure): redistributeEqual, removeProportional
    compute.js                     # MODIFY: carry, whole-month, transfers, open funds, envelopes
    db.js                          # MODIFY: DB v2 wipe + envelopes store + export envelopes
    data-activities.js             # MODIFY: generalised create/update/remove
    data-envelopes.js              # NEW: Envelopes CRUD + withBalances/history
    data-bills.js                  # MODIFY: setExpected(scope), remove(scope)
    data.js                        # MODIFY: re-export Envelopes + shared typedefs
    styles.css                     # MODIFY: source rows, allocation bar, envelopes, dialogs
    ui/
      labels.js                    # NEW (pure-ish): describeSource / describeDestination / periodRange
      activity.js                  # NEW: universal transaction form
      envelopes.js                 # NEW: envelopes overview + detail
      month.js                     # MODIFY: use activity form, move-leftover, open funds, breakdown, bill edits
    tests/
      split.test.js                # NEW
      compute.test.js              # MODIFY: rewrite for new shape + carry/envelopes
      labels.test.js               # NEW
      integration/
        helpers.js                 # MODIFY: envelope + generalised-activity factories
        activities.integration.js  # MODIFY: split / transfer / edit / delete
        envelopes.integration.js   # NEW
        bills.integration.js       # MODIFY: setExpected/remove scope
        month-flow.integration.js  # MODIFY: carry + whole-month + move-leftover flows
        export.integration.js      # MODIFY: envelopes in export
  tests-e2e/
    split-and-envelope.spec.js     # NEW smoke
```

---

# Phase A — Model & storage foundation

## Task 1: DB v2 clean wipe + envelopes store + export

**Files:**
- Modify: `frontend/src/db.js`
- Modify: `frontend/src/tests/integration/export.integration.js`

**Interfaces:**
- Produces: `envelopes` object store (`keyPath:'id'`, no indexes); `exportDB()` result gains an `envelopes:any[]` array. Existing `get/getAll/getAllByIndex/put/del/resetDB` signatures unchanged.

- [ ] **Step 1: Update `export.integration.js` to assert the new store + export shape**

Replace the file body with:

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';

beforeEach(async () => { await db.resetDB(); });

describe('db.js raw IndexedDB wrapper', () => {
  test('put/get/getAll round-trip and index query', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 300000 });
    await db.put('billOccurrences', { id: 'occ:a', seriesId: 's1', monthKey: '2026-07', expected: 8000 });
    await db.put('billOccurrences', { id: 'occ:b', seriesId: 's2', monthKey: '2026-08', expected: 9000 });

    expect(await db.get('months', 'month:2026-07')).toMatchObject({ available: 300000 });
    expect(await db.getAll('billOccurrences')).toHaveLength(2);
    const july = await db.getAllByIndex('billOccurrences', 'by_month', '2026-07');
    expect(july.map((o) => o.id)).toEqual(['occ:a']);
  });

  test('envelopes store round-trips', async () => {
    await db.put('envelopes', { id: 'env:1', name: 'Travel' });
    expect(await db.getAll('envelopes')).toHaveLength(1);
    expect(await db.get('envelopes', 'env:1')).toMatchObject({ name: 'Travel' });
  });

  test('exportDB serialises every store including envelopes', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 1 });
    await db.put('envelopes', { id: 'env:1', name: 'Travel' });
    const dump = await db.exportDB();
    expect(dump.version).toBe(2);
    expect(dump.months).toHaveLength(1);
    expect(dump.envelopes).toHaveLength(1);
    expect(dump.activities).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test-unit-file src/tests/integration/export.integration.js`
Expected: FAIL — `envelopes` store does not exist / `dump.version` is 1 / `dump.envelopes` is undefined.

- [ ] **Step 3: Edit `frontend/src/db.js`** — bump the version, add the store, wipe on upgrade, export envelopes.

Change the version constant:

```js
const DB_VERSION = 2;
```

Add `envelopes` to `STORES` (place it first):

```js
const STORES = {
  envelopes: [],
  months: [],
  billSeries: [],
  billOccurrences: [['by_month', 'monthKey'], ['by_series', 'seriesId']],
  activities: [['by_month', 'monthKey']],
};
```

Replace the `onupgradeneeded` handler with a clean wipe-and-recreate (no user data to preserve):

```js
    req.onupgradeneeded = () => {
      const database = req.result;
      for (const name of Array.from(database.objectStoreNames)) {
        database.deleteObjectStore(name);
      }
      for (const [name, indexes] of Object.entries(STORES)) {
        const store = database.createObjectStore(name, { keyPath: 'id' });
        for (const [indexName, keyPath] of indexes) { store.createIndex(indexName, keyPath); }
      }
    };
```

Replace `exportDB` to include envelopes and report version 2:

```js
/**
 * Serialises every store. Import is added in Slice 3.
 * @returns {Promise<{version:number, exportedAt:string, envelopes:any[], months:any[], billSeries:any[], billOccurrences:any[], activities:any[]}>}
 */
export async function exportDB() {
  const [envelopes, months, billSeries, billOccurrences, activities] = await Promise.all([
    getAll('envelopes'), getAll('months'), getAll('billSeries'), getAll('billOccurrences'), getAll('activities'),
  ]);
  return { version: 2, exportedAt: new Date().toISOString(), envelopes, months, billSeries, billOccurrences, activities };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mise run test-unit-file src/tests/integration/export.integration.js`
Expected: PASS.

- [ ] **Step 5: Run the full unit+integration suite** (the wipe changes the schema; ensure nothing else broke)

Run: `mise run test-unit`
Expected: PASS (existing suites still green).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/db.js frontend/src/tests/integration/export.integration.js
git commit -m "db: DB v2 clean wipe, envelopes store, export envelopes"
```

---

## Task 2: Generalised Activity model (create / update / remove)

**Files:**
- Modify: `frontend/src/data-activities.js`
- Modify: `frontend/src/tests/integration/activities.integration.js`

**Interfaces:**
- Produces:
  - `Destination = {type:'spent'} | {type:'period', periodIndex:number} | {type:'envelope', envelopeId:string}`
  - `Source = {type:'period', periodIndex:number} | {type:'wholeMonth'} | {type:'envelope', envelopeId:string} | {type:'outside'}`
  - `Allocation = {source:Source, amount:number}`
  - `Activity = {id, monthKey, periodIndex, destination:Destination, amount, description, allocations:Allocation[], createdAt, updatedAt}`
  - `Activities.create({monthKey, periodIndex, destination, amount, description?, allocations})=>Activity`
  - `Activities.createExpense({monthKey, periodIndex, amount, description?})=>Activity` (convenience: `destination:{type:'spent'}`, one period source)
  - `Activities.get(id)=>Activity|undefined`
  - `Activities.update(id, {destination, amount, description, allocations, periodIndex?})=>Activity`
  - `Activities.remove(id)=>void`
  - `Activities.listForMonth(monthKey)=>Activity[]`, `Activities.listForPeriod(monthKey, periodIndex)=>Activity[]` (unchanged)

- [ ] **Step 1: Write the failing test** — replace the body of `frontend/src/tests/integration/activities.integration.js`:

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Activities } from '../../data-activities.js';

beforeEach(async () => { await db.resetDB(); });

describe('Activities', () => {
  test('createExpense makes a single-period spent activity', async () => {
    const a = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 2, amount: 5000 });
    expect(a.destination).toEqual({ type: 'spent' });
    expect(a.allocations).toEqual([{ source: { type: 'period', periodIndex: 2 }, amount: 5000 }]);
    expect(a.amount).toBe(5000);
  });

  test('create persists a split expense (period + envelope)', async () => {
    const a = await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'spent' }, amount: 10000,
      allocations: [
        { source: { type: 'period', periodIndex: 2 }, amount: 6000 },
        { source: { type: 'envelope', envelopeId: 'env:g' }, amount: 4000 },
      ],
    });
    expect((await Activities.get(a.id))?.allocations).toHaveLength(2);
    expect(await Activities.listForMonth('2026-07')).toHaveLength(1);
  });

  test('update replaces amount, destination and allocations in place', async () => {
    const a = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 0, amount: 5000 });
    const updated = await Activities.update(a.id, {
      destination: { type: 'envelope', envelopeId: 'env:t' }, amount: 3000, description: 'moved',
      allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 3000 }],
    });
    expect(updated.id).toBe(a.id);
    expect(updated.createdAt).toBe(a.createdAt);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(a.createdAt);
    expect(updated.destination).toEqual({ type: 'envelope', envelopeId: 'env:t' });
    expect((await Activities.get(a.id))?.amount).toBe(3000);
  });

  test('remove deletes the record', async () => {
    const a = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 0, amount: 5000 });
    await Activities.remove(a.id);
    expect(await Activities.get(a.id)).toBeUndefined();
    expect(await Activities.listForMonth('2026-07')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test-unit-file src/tests/integration/activities.integration.js`
Expected: FAIL — `Activities.create/get/update/remove` not defined.

- [ ] **Step 3: Rewrite `frontend/src/data-activities.js`**

```js
import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ type:'spent' } | { type:'period', periodIndex:number } | { type:'envelope', envelopeId:string }} Destination
 * @typedef {{ type:'period', periodIndex:number } | { type:'wholeMonth' } | { type:'envelope', envelopeId:string } | { type:'outside' }} Source
 * @typedef {{ source:Source, amount:number }} Allocation
 * @typedef {{ id:string, monthKey:string, periodIndex:number, destination:Destination, amount:number, description:string, allocations:Allocation[], createdAt:number, updatedAt:number }} Activity
 */

/** @param {string} monthKey @param {number} timestamp */
const activityId = (monthKey, timestamp) => `act:${monthKey}:${String(timestamp).padStart(15, '0')}-${randomUUID().slice(0, 8)}`;

export const Activities = {
  /** @param {string} monthKey @returns {Promise<Activity[]>} */
  async listForMonth(monthKey) {
    const all = await db.getAllByIndex('activities', 'by_month', monthKey);
    return all.sort((a, b) => a.id.localeCompare(b.id));
  },

  /** @param {string} monthKey @param {number} periodIndex @returns {Promise<Activity[]>} */
  async listForPeriod(monthKey, periodIndex) {
    const all = await Activities.listForMonth(monthKey);
    return all.filter((a) => a.periodIndex === periodIndex);
  },

  /** @param {string} id @returns {Promise<Activity|undefined>} */
  async get(id) {
    return await db.get('activities', id);
  },

  /**
   * Persists an activity as one atomic record. `amount` must equal the sum of allocations.
   * @param {{ monthKey:string, periodIndex:number, destination:Destination, amount:number, description?:string, allocations:Allocation[] }} opts
   * @returns {Promise<Activity>}
   */
  async create({ monthKey, periodIndex, destination, amount, description = '', allocations }) {
    const timestamp = now();
    /** @type {Activity} */
    const activity = {
      id: activityId(monthKey, timestamp),
      monthKey, periodIndex, destination, amount, description, allocations,
      createdAt: timestamp, updatedAt: timestamp,
    };
    await db.put('activities', activity);
    return activity;
  },

  /**
   * Convenience for the common one-source period expense.
   * @param {{ monthKey:string, periodIndex:number, amount:number, description?:string }} opts
   * @returns {Promise<Activity>}
   */
  async createExpense({ monthKey, periodIndex, amount, description = '' }) {
    return await Activities.create({
      monthKey, periodIndex, amount, description,
      destination: { type: 'spent' },
      allocations: [{ source: { type: 'period', periodIndex }, amount }],
    });
  },

  /**
   * Replaces the mutable fields of an existing activity, preserving id/createdAt.
   * @param {string} id
   * @param {{ destination:Destination, amount:number, description:string, allocations:Allocation[], periodIndex?:number }} patch
   * @returns {Promise<Activity>}
   */
  async update(id, patch) {
    const existing = await db.get('activities', id);
    if (!existing) { throw new Error(`Activity ${id} not found`); }
    /** @type {Activity} */
    const next = {
      ...existing,
      destination: patch.destination,
      amount: patch.amount,
      description: patch.description,
      allocations: patch.allocations,
      periodIndex: patch.periodIndex ?? existing.periodIndex,
      updatedAt: now(),
    };
    await db.put('activities', next);
    return next;
  },

  /** @param {string} id @returns {Promise<void>} */
  async remove(id) {
    await db.del('activities', id);
  },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mise run test-unit-file src/tests/integration/activities.integration.js`
Expected: PASS.

- [ ] **Step 5: Verify lint/types**

Run: `mise run full-lint`
Expected: PASS. (Existing `helpers.js`/`month.js` still call `createExpense`, which remains.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data-activities.js frontend/src/tests/integration/activities.integration.js
git commit -m "data: generalise Activity (destination union, allocations, update/remove)"
```

---

## Task 3: Envelopes data module (CRUD)

**Files:**
- Create: `frontend/src/data-envelopes.js`
- Modify: `frontend/src/data.js`
- Create: `frontend/src/tests/integration/envelopes.integration.js`

**Interfaces:**
- Produces:
  - `Envelope = {id:string, name:string, createdAt:number, updatedAt:number}`
  - `Envelopes.list()=>Envelope[]` (creation-ordered), `Envelopes.get(id)=>Envelope|undefined`
  - `Envelopes.create({name})=>Envelope`, `Envelopes.rename(id, name)=>Envelope`
  - (`withBalances`/`history` are added in Task 6 once `computeEnvelopes` exists.)
- Consumes: `db`, `now`, `randomUUID`.

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/integration/envelopes.integration.js`:

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Envelopes } from '../../data-envelopes.js';

beforeEach(async () => { await db.resetDB(); });

describe('Envelopes', () => {
  test('create + get + list', async () => {
    const e = await Envelopes.create({ name: 'Travel' });
    expect(await Envelopes.get(e.id)).toMatchObject({ name: 'Travel' });
    expect(await Envelopes.list()).toHaveLength(1);
  });

  test('list is creation-ordered', async () => {
    await Envelopes.create({ name: 'A' });
    await Envelopes.create({ name: 'B' });
    expect((await Envelopes.list()).map((e) => e.name)).toEqual(['A', 'B']);
  });

  test('rename changes the name and keeps identity', async () => {
    const e = await Envelopes.create({ name: 'Emergancy' });
    const renamed = await Envelopes.rename(e.id, 'Emergency');
    expect(renamed.id).toBe(e.id);
    expect((await Envelopes.get(e.id))?.name).toBe('Emergency');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test-unit-file src/tests/integration/envelopes.integration.js`
Expected: FAIL — `../../data-envelopes.js` missing.

- [ ] **Step 3: Implement `frontend/src/data-envelopes.js`**

```js
import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ id:string, name:string, createdAt:number, updatedAt:number }} Envelope
 */

export const Envelopes = {
  /** @returns {Promise<Envelope[]>} */
  async list() {
    const all = await db.getAll('envelopes');
    return all.sort((a, b) => a.createdAt - b.createdAt);
  },

  /** @param {string} id @returns {Promise<Envelope|undefined>} */
  async get(id) {
    return await db.get('envelopes', id);
  },

  /** @param {{ name:string }} opts @returns {Promise<Envelope>} */
  async create({ name }) {
    const timestamp = now();
    /** @type {Envelope} */
    const envelope = { id: `env:${randomUUID()}`, name, createdAt: timestamp, updatedAt: timestamp };
    await db.put('envelopes', envelope);
    return envelope;
  },

  /** @param {string} id @param {string} name @returns {Promise<Envelope>} */
  async rename(id, name) {
    const envelope = await db.get('envelopes', id);
    if (!envelope) { throw new Error(`Envelope ${id} not found`); }
    const next = { ...envelope, name, updatedAt: now() };
    await db.put('envelopes', next);
    return next;
  },
};
```

- [ ] **Step 4: Re-export from `frontend/src/data.js`** — replace the file:

```js
import { Activities } from './data-activities.js';
import { Bills } from './data-bills.js';
import { Envelopes } from './data-envelopes.js';
import { Months } from './data-months.js';

/**
 * @typedef {import('./data-months.js').BudgetMonth} BudgetMonth
 * @typedef {import('./data-bills.js').BillSeries} BillSeries
 * @typedef {import('./data-bills.js').BillOccurrence} BillOccurrence
 * @typedef {import('./data-bills.js').BillView} BillView
 * @typedef {import('./data-activities.js').Activity} Activity
 * @typedef {import('./data-activities.js').Destination} Destination
 * @typedef {import('./data-activities.js').Source} Source
 * @typedef {import('./data-activities.js').Allocation} Allocation
 * @typedef {import('./data-envelopes.js').Envelope} Envelope
 */

export { Months, Bills, Activities, Envelopes };
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `mise run test-unit-file src/tests/integration/envelopes.integration.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data-envelopes.js frontend/src/data.js frontend/src/tests/integration/envelopes.integration.js
git commit -m "data: Envelopes module (create, list, get, rename)"
```

---

# Phase B — Pure domain

## Task 4: Split allocation math (pure)

**Files:**
- Create: `frontend/src/split.js`
- Test: `frontend/src/tests/split.test.js`

**Interfaces:**
- Produces:
  - `redistributeEqual(total:number, count:number)=>number[]` — equal integer split; last entry absorbs residual; sums to `total`.
  - `removeProportional(amounts:number[], indexToRemove:number, total:number)=>number[]` — drops one entry, keeps the remaining entries' proportions, last entry absorbs residual; sums to `total`.

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/split.test.js`:

```js
import { describe, expect, test } from 'vitest';
import { redistributeEqual, removeProportional } from '../split.js';

describe('redistributeEqual', () => {
  test('splits evenly and sums to total', () => {
    expect(redistributeEqual(9000, 3)).toEqual([3000, 3000, 3000]);
  });
  test('residual lands on the last entry', () => {
    expect(redistributeEqual(10000, 3)).toEqual([3333, 3333, 3334]);
  });
  test('count of 1 returns the whole total', () => {
    expect(redistributeEqual(4200, 1)).toEqual([4200]);
  });
});

describe('removeProportional', () => {
  test('drops an entry and redistributes proportionally, summing to total', () => {
    // remove index 0 from [2000,2000,6000]; kept proportions 2000:6000 of 10000 -> 2500,7500
    expect(removeProportional([2000, 2000, 6000], 0, 10000)).toEqual([2500, 7500]);
  });
  test('residual lands on the last kept entry', () => {
    const out = removeProportional([1000, 1000, 1000], 2, 10000);
    expect(out.reduce((s, a) => s + a, 0)).toBe(10000);
    expect(out).toHaveLength(2);
  });
  test('when kept entries are all zero, splits equally', () => {
    expect(removeProportional([0, 0, 5000], 2, 6000)).toEqual([3000, 3000]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test-unit-file src/tests/split.test.js`
Expected: FAIL — `../split.js` missing.

- [ ] **Step 3: Implement `frontend/src/split.js`**

```js
/**
 * Splits an integer total into `count` near-equal parts; the last part absorbs the residual.
 * @param {number} total integer minor units (>= 0)
 * @param {number} count number of parts (>= 1)
 * @returns {number[]}
 */
export function redistributeEqual(total, count) {
  if (count < 1) { throw new Error('redistributeEqual: count must be >= 1'); }
  const each = Math.floor(total / count);
  const parts = Array.from({ length: count }, () => each);
  parts[count - 1] += total - each * count;
  return parts;
}

/**
 * Removes one entry and redistributes so the remaining entries keep their relative
 * proportions and still sum to `total`. The last kept entry absorbs the residual.
 * @param {number[]} amounts current per-source amounts (length >= 2)
 * @param {number} indexToRemove index being removed
 * @param {number} total the activity total the result must sum to
 * @returns {number[]}
 */
export function removeProportional(amounts, indexToRemove, total) {
  const kept = amounts.filter((_, i) => i !== indexToRemove);
  if (kept.length === 0) { throw new Error('removeProportional: cannot remove the last source'); }
  const keptTotal = kept.reduce((sum, a) => sum + a, 0);
  if (keptTotal === 0) { return redistributeEqual(total, kept.length); }
  const parts = kept.map((a) => Math.floor((total * a) / keptTotal));
  parts[parts.length - 1] += total - parts.reduce((sum, a) => sum + a, 0);
  return parts;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mise run test-unit-file src/tests/split.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/split.js frontend/src/tests/split.test.js
git commit -m "split: deterministic equal + proportional allocation helpers"
```

---

## Task 5: `computeMonth` — carry, whole-month, transfers, open funds

**Files:**
- Modify: `frontend/src/compute.js`
- Modify: `frontend/src/tests/compute.test.js` (rewrite)
- Modify: `frontend/src/tests/integration/month-flow.integration.js` (update the `viewFor` mapping)
- Modify: `frontend/src/ui/month.js` (update `buildView` mapping — keep the screen compiling)

**Interfaces:**
- Consumes: `periodsForMonthKey`, `allocate` (periods.js); `Destination`, `Source`, `Allocation` (data-activities.js) for typedefs.
- Produces:
  - `ActivityInput = { destination:Destination, amount:number, allocations:Allocation[] }`
  - `PeriodView = Period & { allocation:number, carryIn:number, transferIn:number, out:number, spent:number, remaining:number, completed:boolean, openFunds:boolean }`
  - `MonthView = { available, billsReserved, paidCount, billCount, spendingPool, safeToSpend, hasOpenFunds, periods:PeriodView[] }`
  - `computeMonth({ monthKey, available, bills, activities, todayKey })=>MonthView` (`todayKey` optional `"YYYY-MM-DD"`; when omitted, no period is treated as completed).

- [ ] **Step 1: Rewrite `frontend/src/tests/compute.test.js`**

```js
import { describe, expect, test } from 'vitest';
import { computeMonth } from '../compute.js';

const base = { monthKey: '2026-07', available: 300000, bills: [], activities: [] };
/** @param {number} periodIndex @param {number} amount */
const expense = (periodIndex, amount) => ({
  destination: { type: 'spent' }, amount,
  allocations: [{ source: { type: 'period', periodIndex }, amount }],
});

describe('computeMonth — bills + pool', () => {
  test('reserves expected for unpaid and actual for paid bills', () => {
    const view = computeMonth({
      ...base,
      bills: [
        { paid: true, actual: 120000, expected: 118000 },
        { paid: false, actual: null, expected: 8000 },
      ],
    });
    expect(view.billsReserved).toBe(128000);
    expect(view.paidCount).toBe(1);
    expect(view.spendingPool).toBe(172000);
    expect(view.safeToSpend).toBe(172000);
    expect(view.periods.reduce((s, p) => s + p.allocation, 0)).toBe(172000);
  });
});

describe('computeMonth — expenses', () => {
  test('period-sourced expenses reduce that period and safe-to-spend', () => {
    const view = computeMonth({ ...base, activities: [expense(2, 5000), expense(2, 1500)] });
    expect(view.periods[2].spent).toBe(6500);
    expect(view.periods[2].remaining).toBe(view.periods[2].allocation - 6500);
    expect(view.safeToSpend).toBe(300000 - 6500);
  });
});

describe('computeMonth — deficit carry (PER-5/6)', () => {
  test('a negative balance reduces the next period only (positives do not carry)', () => {
    // July base per period ~ [67741,67741,67741,67741,29036] for 300000 pool.
    const view = computeMonth({ ...base, activities: [expense(0, 80000)] });
    expect(view.periods[0].remaining).toBeLessThan(0);
    const deficit = view.periods[0].remaining; // negative
    expect(view.periods[1].carryIn).toBe(deficit);
    expect(view.periods[1].remaining).toBe(view.periods[1].allocation + deficit);
    // period 2 is positive and does NOT carry into period 3
    expect(view.periods[3].carryIn).toBe(0);
  });

  test('safe-to-spend is the sum of pre-carry nets, NOT the sum of displayed balances', () => {
    const view = computeMonth({ ...base, activities: [expense(0, 80000)] });
    const sumDisplayed = view.periods.reduce((s, p) => s + p.remaining, 0);
    expect(view.safeToSpend).toBe(300000 - 80000);
    expect(view.safeToSpend).not.toBe(sumDisplayed); // carry double-counts the deficit
  });

  test('final-period deficit remains as a month-end overrun', () => {
    const view = computeMonth({ ...base, activities: [expense(4, 60000)] });
    expect(view.periods[4].remaining).toBeLessThan(0);
  });
});

describe('computeMonth — transfers between periods', () => {
  test('period-to-period transfer moves money without changing safe-to-spend', () => {
    const view = computeMonth({
      ...base,
      activities: [{
        destination: { type: 'period', periodIndex: 1 }, amount: 10000,
        allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 10000 }],
      }],
    });
    expect(view.periods[0].out).toBe(10000);
    expect(view.periods[1].transferIn).toBe(10000);
    expect(view.safeToSpend).toBe(300000); // internal move
  });
});

describe('computeMonth — whole-month envelope funding (TRX-6)', () => {
  test('debits every period proportionally and is not counted as spending', () => {
    const view = computeMonth({
      ...base,
      activities: [{
        destination: { type: 'envelope', envelopeId: 'env:t' }, amount: 31000,
        allocations: [{ source: { type: 'wholeMonth' }, amount: 31000 }],
      }],
    });
    const debited = view.periods.reduce((s, p) => s + p.allocation - p.remaining - p.spent, 0);
    // whole-month debit removed 31000 from the pool across periods
    expect(view.safeToSpend).toBe(300000 - 31000);
    expect(view.periods.every((p) => p.spent === 0)).toBe(true); // funding is not spending
    expect(debited).toBe(31000);
  });
});

describe('computeMonth — open funds (PER-8)', () => {
  test('past month: every positive period is completed and open', () => {
    const view = computeMonth({ ...base, monthKey: '2026-05', todayKey: '2026-07-10', available: 300000 });
    expect(view.periods.every((p) => p.completed)).toBe(true);
    expect(view.hasOpenFunds).toBe(true);
  });
  test('current month: only periods that have ended are completed', () => {
    const view = computeMonth({ ...base, monthKey: '2026-07', todayKey: '2026-07-10' });
    // day 10 -> periods ending before day 10 are completed (1-7 done; 8-14 not yet)
    expect(view.periods[0].completed).toBe(true);
    expect(view.periods[1].completed).toBe(false);
  });
  test('without todayKey no period is completed', () => {
    const view = computeMonth({ ...base });
    expect(view.periods.some((p) => p.completed)).toBe(false);
    expect(view.hasOpenFunds).toBe(false);
  });
});

describe('computeMonth — determinism', () => {
  test('idempotent for identical inputs', () => {
    const input = { ...base, activities: [expense(1, 4200)] };
    expect(computeMonth(input)).toEqual(computeMonth(input));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: FAIL — new fields (`carryIn`, `transferIn`, `out`, `completed`, `openFunds`, `hasOpenFunds`) and whole-month handling not present.

- [ ] **Step 3: Rewrite `frontend/src/compute.js`** — keep `computeMonth` the only export for now (`computeEnvelopes` is added in Task 6):

```js
import { allocate, periodsForMonthKey } from './periods.js';

/**
 * @typedef {import('./periods.js').Period} Period
 * @typedef {import('./data-activities.js').Destination} Destination
 * @typedef {import('./data-activities.js').Source} Source
 * @typedef {import('./data-activities.js').Allocation} Allocation
 * @typedef {{ paid:boolean, actual:number|null, expected:number }} BillInput
 * @typedef {{ destination:Destination, amount:number, allocations:Allocation[] }} ActivityInput
 * @typedef {Period & { allocation:number, carryIn:number, transferIn:number, out:number, spent:number, remaining:number, completed:boolean, openFunds:boolean }} PeriodView
 * @typedef {{ available:number, billsReserved:number, paidCount:number, billCount:number, spendingPool:number, safeToSpend:number, hasOpenFunds:boolean, periods:PeriodView[] }} MonthView
 */

/**
 * @param {Period} period @param {string} monthKey @param {string|undefined} todayKey
 * @returns {boolean} whether the period's end date has passed
 */
function isCompleted(period, monthKey, todayKey) {
  if (!todayKey) { return false; }
  const todayMonth = todayKey.slice(0, 7);
  if (monthKey < todayMonth) { return true; }
  if (monthKey > todayMonth) { return false; }
  return period.endDay < Number(todayKey.slice(8, 10));
}

/**
 * Derives the monthly view from primary records: proportional allocation, whole-month
 * debits, transfers, deficit carry (negatives only), safe-to-spend, and open funds.
 * @param {{ monthKey:string, available:number, bills:BillInput[], activities:ActivityInput[], todayKey?:string }} input
 * @returns {MonthView}
 */
export function computeMonth({ monthKey, available, bills, activities, todayKey }) {
  const billsReserved = bills.reduce((sum, b) => sum + (b.paid ? (b.actual ?? 0) : b.expected), 0);
  const paidCount = bills.filter((b) => b.paid).length;
  const spendingPool = available - billsReserved;

  const periods = periodsForMonthKey(monthKey);
  const base = allocate(spendingPool, periods);
  const n = periods.length;
  const out = periods.map(() => 0);
  const spent = periods.map(() => 0);
  const transferIn = periods.map(() => 0);
  const wholeMonthDebit = periods.map(() => 0);

  for (const a of activities) {
    if (a.destination.type === 'period') { transferIn[a.destination.periodIndex] += a.amount; }
    for (const alloc of a.allocations) {
      const source = alloc.source;
      if (source.type === 'period') {
        out[source.periodIndex] += alloc.amount;
        if (a.destination.type === 'spent') { spent[source.periodIndex] += alloc.amount; }
      } else if (source.type === 'wholeMonth') {
        const shares = allocate(alloc.amount, periods);
        for (let i = 0; i < n; i++) { wholeMonthDebit[i] += shares[i]; }
      }
      // 'envelope' and 'outside' sources do not touch period balances
    }
  }

  let carryIn = 0;
  let safeToSpend = 0;
  let hasOpenFunds = false;
  /** @type {PeriodView[]} */
  const periodViews = periods.map((p, i) => {
    const net = base[i] + transferIn[i] - out[i] - wholeMonthDebit[i];
    safeToSpend += net;
    const remaining = net + carryIn;
    const thisCarryIn = carryIn;
    carryIn = Math.min(0, remaining);
    const completed = isCompleted(p, monthKey, todayKey);
    const openFunds = completed && remaining > 0;
    if (openFunds) { hasOpenFunds = true; }
    return {
      ...p,
      allocation: base[i],
      carryIn: thisCarryIn,
      transferIn: transferIn[i],
      out: out[i],
      spent: spent[i],
      remaining,
      completed,
      openFunds,
    };
  });

  return {
    available,
    billsReserved,
    paidCount,
    billCount: bills.length,
    spendingPool,
    safeToSpend,
    hasOpenFunds,
    periods: periodViews,
  };
}
```

- [ ] **Step 4: Run the compute test to verify it passes**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: PASS.

- [ ] **Step 5: Fix the two callers that map activities into the old shape.**

In `frontend/src/tests/integration/month-flow.integration.js`, replace the `viewFor` body so it passes full activities and `todayKey`:

```js
async function viewFor(monthKey) {
  const month = await Months.get(monthKey);
  if (!month) { throw new Error(`Month ${monthKey} not found`); }
  const bills = await Bills.listForMonth(monthKey);
  const activities = await Activities.listForMonth(monthKey);
  return computeMonth({
    monthKey,
    available: month.available,
    bills: bills.map((b) => ({ paid: b.paid, actual: b.actual, expected: b.expected })),
    activities,
  });
}
```

In `frontend/src/ui/month.js`, replace the `computeMonth(...)` call inside `buildView` so it passes full activities plus `todayKey`:

```js
    view: computeMonth({
      monthKey,
      available: month.available,
      bills: bills.map((b) => ({ paid: b.paid, actual: b.actual, expected: b.expected })),
      activities,
      todayKey: $.isoToday(),
    }),
```

- [ ] **Step 6: Run the full unit+integration suite**

Run: `mise run test-unit`
Expected: PASS (compute, month-flow, and the rest stay green).

- [ ] **Step 7: Verify lint/types**

Run: `mise run full-lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/compute.js frontend/src/tests/compute.test.js frontend/src/tests/integration/month-flow.integration.js frontend/src/ui/month.js
git commit -m "compute: deficit carry, whole-month debit, transfers, open funds, correct safe-to-spend"
```

---

## Task 6: Envelope balances + history (pure) and data wiring

**Files:**
- Modify: `frontend/src/compute.js` (add `computeEnvelopes`, `computeEnvelopeHistory`)
- Modify: `frontend/src/data-envelopes.js` (add `withBalances`, `history`)
- Modify: `frontend/src/tests/compute.test.js` (append envelope cases)
- Modify: `frontend/src/tests/integration/envelopes.integration.js` (append balance/history flow)

**Interfaces:**
- Produces:
  - `EnvelopeView = Envelope & { balance:number }`
  - `HistoryRow = { activityId:string, direction:'in'|'out', amount:number, counterparty:Source[]|Destination, monthKey:string, periodIndex:number, description:string }`
  - `computeEnvelopes(envelopes:Envelope[], allActivities:Activity[])=>EnvelopeView[]`
  - `computeEnvelopeHistory(envelopeId:string, allActivities:Activity[])=>HistoryRow[]` (ordered by activity id)
  - `Envelopes.withBalances()=>EnvelopeView[]`, `Envelopes.history(id)=>HistoryRow[]`

- [ ] **Step 1: Append envelope tests to `frontend/src/tests/compute.test.js`**

```js
import { computeEnvelopeHistory, computeEnvelopes } from '../compute.js';

const env = (id, name) => ({ id, name, createdAt: 0, updatedAt: 0 });
/** minimal activity records for envelope math */
const fundFromPeriod = (envelopeId, amount) => ({
  id: 'act:1', monthKey: '2026-07', periodIndex: 2, description: 'fund',
  destination: { type: 'envelope', envelopeId }, amount,
  allocations: [{ source: { type: 'period', periodIndex: 2 }, amount }],
});
const spendFromEnvelope = (envelopeId, amount) => ({
  id: 'act:2', monthKey: '2026-07', periodIndex: 2, description: 'buy',
  destination: { type: 'spent' }, amount,
  allocations: [{ source: { type: 'envelope', envelopeId }, amount }],
});

describe('computeEnvelopes', () => {
  test('funding increases and spending decreases the balance', () => {
    const balances = computeEnvelopes([env('env:t', 'Travel')], [fundFromPeriod('env:t', 10000), spendFromEnvelope('env:t', 3000)]);
    expect(balances[0].balance).toBe(7000);
  });

  test('balance may go negative', () => {
    const balances = computeEnvelopes([env('env:t', 'Travel')], [spendFromEnvelope('env:t', 5000)]);
    expect(balances[0].balance).toBe(-5000);
  });

  test('envelope-to-envelope transfer conserves total', () => {
    const transfer = {
      id: 'act:3', monthKey: '2026-07', periodIndex: 0, description: '',
      destination: { type: 'envelope', envelopeId: 'env:a' }, amount: 4000,
      allocations: [{ source: { type: 'envelope', envelopeId: 'env:b' }, amount: 4000 }],
    };
    const balances = computeEnvelopes([env('env:a', 'A'), env('env:b', 'B')], [transfer]);
    expect(balances.find((e) => e.id === 'env:a')?.balance).toBe(4000);
    expect(balances.find((e) => e.id === 'env:b')?.balance).toBe(-4000);
  });
});

describe('computeEnvelopeHistory', () => {
  test('produces in/out rows that reconcile to the balance', () => {
    const acts = [fundFromPeriod('env:t', 10000), spendFromEnvelope('env:t', 3000)];
    const rows = computeEnvelopeHistory('env:t', acts);
    expect(rows.map((r) => r.direction)).toEqual(['in', 'out']);
    const net = rows.reduce((s, r) => s + (r.direction === 'in' ? r.amount : -r.amount), 0);
    expect(net).toBe(7000);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: FAIL — `computeEnvelopes` / `computeEnvelopeHistory` not exported.

- [ ] **Step 3: Append to `frontend/src/compute.js`**

```js
/**
 * @typedef {import('./data-activities.js').Activity} Activity
 * @typedef {import('./data-envelopes.js').Envelope} Envelope
 * @typedef {Envelope & { balance:number }} EnvelopeView
 * @typedef {{ activityId:string, direction:'in'|'out', amount:number, counterparty:Source[]|Destination, monthKey:string, periodIndex:number, description:string }} HistoryRow
 */

/**
 * Derives every envelope's balance from all activities: +amount when the envelope is the
 * destination, -allocation for each allocation sourced from the envelope. Balances may be negative.
 * @param {Envelope[]} envelopes @param {Activity[]} allActivities @returns {EnvelopeView[]}
 */
export function computeEnvelopes(envelopes, allActivities) {
  /** @type {Map<string, number>} */
  const balance = new Map(envelopes.map((e) => [e.id, 0]));
  for (const a of allActivities) {
    if (a.destination.type === 'envelope') {
      balance.set(a.destination.envelopeId, (balance.get(a.destination.envelopeId) ?? 0) + a.amount);
    }
    for (const alloc of a.allocations) {
      if (alloc.source.type === 'envelope') {
        balance.set(alloc.source.envelopeId, (balance.get(alloc.source.envelopeId) ?? 0) - alloc.amount);
      }
    }
  }
  return envelopes.map((e) => ({ ...e, balance: balance.get(e.id) ?? 0 }));
}

/**
 * Derives one envelope's transaction history. An 'in' row's counterparty is the activity's
 * sources; an 'out' row's counterparty is the activity's destination. Ordered by activity id.
 * @param {string} envelopeId @param {Activity[]} allActivities @returns {HistoryRow[]}
 */
export function computeEnvelopeHistory(envelopeId, allActivities) {
  /** @type {HistoryRow[]} */
  const rows = [];
  for (const a of allActivities) {
    if (a.destination.type === 'envelope' && a.destination.envelopeId === envelopeId) {
      rows.push({
        activityId: a.id, direction: 'in', amount: a.amount,
        counterparty: a.allocations.map((al) => al.source),
        monthKey: a.monthKey, periodIndex: a.periodIndex, description: a.description,
      });
    }
    for (const alloc of a.allocations) {
      if (alloc.source.type === 'envelope' && alloc.source.envelopeId === envelopeId) {
        rows.push({
          activityId: a.id, direction: 'out', amount: alloc.amount,
          counterparty: a.destination,
          monthKey: a.monthKey, periodIndex: a.periodIndex, description: a.description,
        });
      }
    }
  }
  return rows.sort((x, y) => x.activityId.localeCompare(y.activityId));
}
```

- [ ] **Step 4: Add `withBalances` / `history` to `frontend/src/data-envelopes.js`**

Add the import at the top:

```js
import { computeEnvelopeHistory, computeEnvelopes } from './compute.js';
```

Add these two methods inside the `Envelopes` object (after `rename`):

```js
  /** @returns {Promise<import('./compute.js').EnvelopeView[]>} */
  async withBalances() {
    const [envelopes, activities] = await Promise.all([Envelopes.list(), db.getAll('activities')]);
    return computeEnvelopes(envelopes, activities);
  },

  /** @param {string} id @returns {Promise<import('./compute.js').HistoryRow[]>} */
  async history(id) {
    const activities = await db.getAll('activities');
    return computeEnvelopeHistory(id, activities);
  },
```

- [ ] **Step 5: Append an integration flow to `frontend/src/tests/integration/envelopes.integration.js`**

```js
import { Activities } from '../../data-activities.js';

describe('Envelopes — derived balances', () => {
  test('fund from a period then spend, balance reconciles', async () => {
    const travel = await Envelopes.create({ name: 'Travel' });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'envelope', envelopeId: travel.id }, amount: 10000,
      allocations: [{ source: { type: 'period', periodIndex: 2 }, amount: 10000 }],
    });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'spent' }, amount: 3000,
      allocations: [{ source: { type: 'envelope', envelopeId: travel.id }, amount: 3000 }],
    });
    const balances = await Envelopes.withBalances();
    expect(balances.find((e) => e.id === travel.id)?.balance).toBe(7000);
    expect((await Envelopes.history(travel.id)).map((r) => r.direction)).toEqual(['in', 'out']);
  });
});
```

- [ ] **Step 6: Run compute + envelopes tests to verify they pass**

Run: `mise run test-unit-file src/tests/compute.test.js`
Then: `mise run test-unit-file src/tests/integration/envelopes.integration.js`
Expected: PASS for both.

- [ ] **Step 7: Verify lint/types**

Run: `mise run full-lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/compute.js frontend/src/data-envelopes.js frontend/src/tests/compute.test.js frontend/src/tests/integration/envelopes.integration.js
git commit -m "compute: derive envelope balances and transaction history"
```

---

# Phase C — Universal transaction form

## Task 7: Label helpers (pure-ish)

**Files:**
- Create: `frontend/src/ui/labels.js`
- Test: `frontend/src/tests/labels.test.js`

**Interfaces:**
- Produces:
  - `periodRange(periods:Period[], index:number)=>string` (e.g. `"15–21"`)
  - `describeSource(source:Source, envName:(id:string)=>string, periods:Period[])=>string`
  - `describeDestination(dest:Destination, envName:(id:string)=>string, periods:Period[])=>string`
- Consumes: `Source`, `Destination` (data-activities.js), `Period` (periods.js).

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/labels.test.js`:

```js
import { describe, expect, test } from 'vitest';
import { generatePeriods } from '../periods.js';
import { describeDestination, describeSource, periodRange } from '../ui/labels.js';

const july = generatePeriods(2026, 6);
const envName = (id) => (id === 'env:t' ? 'Travel' : '(unknown)');

describe('labels', () => {
  test('periodRange formats the day span', () => {
    expect(periodRange(july, 2)).toBe('15–21');
  });
  test('describeSource covers every source type', () => {
    expect(describeSource({ type: 'period', periodIndex: 2 }, envName, july)).toBe('15–21');
    expect(describeSource({ type: 'wholeMonth' }, envName, july)).toBe('Whole month');
    expect(describeSource({ type: 'envelope', envelopeId: 'env:t' }, envName, july)).toBe('Travel');
    expect(describeSource({ type: 'outside' }, envName, july)).toBe('Outside budget');
  });
  test('describeDestination covers every destination type', () => {
    expect(describeDestination({ type: 'spent' }, envName, july)).toBe('Spent');
    expect(describeDestination({ type: 'period', periodIndex: 0 }, envName, july)).toBe('1–7');
    expect(describeDestination({ type: 'envelope', envelopeId: 'env:t' }, envName, july)).toBe('Travel');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test-unit-file src/tests/labels.test.js`
Expected: FAIL — `../ui/labels.js` missing.

- [ ] **Step 3: Implement `frontend/src/ui/labels.js`**

```js
/**
 * @typedef {import('../periods.js').Period} Period
 * @typedef {import('../data-activities.js').Source} Source
 * @typedef {import('../data-activities.js').Destination} Destination
 */

/** @param {Period[]} periods @param {number} index @returns {string} */
export function periodRange(periods, index) {
  const p = periods[index];
  return p ? `${p.startDay}–${p.endDay}` : `Period ${index + 1}`;
}

/** @param {Source} source @param {(id:string)=>string} envName @param {Period[]} periods @returns {string} */
export function describeSource(source, envName, periods) {
  switch (source.type) {
    case 'period': return periodRange(periods, source.periodIndex);
    case 'wholeMonth': return 'Whole month';
    case 'envelope': return envName(source.envelopeId);
    case 'outside': return 'Outside budget';
  }
}

/** @param {Destination} dest @param {(id:string)=>string} envName @param {Period[]} periods @returns {string} */
export function describeDestination(dest, envName, periods) {
  switch (dest.type) {
    case 'spent': return 'Spent';
    case 'period': return periodRange(periods, dest.periodIndex);
    case 'envelope': return envName(dest.envelopeId);
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mise run test-unit-file src/tests/labels.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/labels.js frontend/src/tests/labels.test.js
git commit -m "ui: source/destination/period label helpers"
```

---

## Task 8: Universal activity dialog markup

**Files:**
- Modify: `frontend/index.html`

**Interfaces:**
- Produces DOM ids consumed by Task 9: `#activityDialog`, `#activityForm`, `#activityTitle`, `#activityClose`, `#activityAmount`, `#activityDescription`, `#activityDestination` (select), `#activitySources` (rows container), `#activityAddSource` (button), `#activityBar` (read-only bar), `#activityProjection` (line), `#activityError` (validity note), submit button.

- [ ] **Step 1: Replace the `#activityDialog` block** in `frontend/index.html` (the whole `<dialog id="activityDialog">…</dialog>`) with:

```html
  <dialog id="activityDialog" aria-label="Add expense">
    <form id="activityForm" class="sheet-inner" method="dialog">
      <div class="sheet-header"><span id="activityTitle">Add expense</span>
        <button type="button" class="btn ghost" id="activityClose" aria-label="Close">✕</button></div>
      <label class="field"><span>Amount</span>
        <input type="text" inputmode="decimal" id="activityAmount" required autocomplete="off"></label>
      <label class="field"><span>Description (optional)</span>
        <input type="text" id="activityDescription" autocomplete="off"></label>
      <label class="field"><span>To</span>
        <select id="activityDestination"></select></label>
      <div class="sources-head"><span>From</span>
        <button type="button" class="btn ghost small" id="activityAddSource">+ Add source</button></div>
      <div id="activitySources" class="sources"></div>
      <div id="activityBar" class="alloc-bar" aria-hidden="true"></div>
      <p id="activityProjection" class="activity-projection"></p>
      <p id="activityError" class="activity-error" role="alert"></p>
      <button type="submit" class="btn primary" id="activitySave">Save</button>
    </form>
  </dialog>
```

- [ ] **Step 2: Verify the app still boots** (markup only; wiring is Task 9)

Run: `cd /home/gabriel/projetos/spend && mise run dev`
Expected: page loads with no console errors; opening a period's `+ Add` still shows the (old-wired) dialog. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add frontend/index.html
git commit -m "ui: expand activity dialog markup (destination, sources, bar, projection)"
```

---

## Task 9: Universal activity form module

**Files:**
- Create: `frontend/src/ui/activity.js`
- Modify: `frontend/src/ui/month.js` (delegate the activity dialog to the new module)

**Interfaces:**
- Consumes: `Activities`, `Envelopes` (data.js); `computeEnvelopes` (compute.js); `redistributeEqual`, `removeProportional` (split.js); `describeSource`, `describeDestination`, `periodRange` (labels.js); `formatMoney`, `parseMoney` (money.js); `MonthView` (compute.js).
- Produces:
  - `setupActivity(onSaved:()=>Promise<void>)` — wires the dialog once.
  - `openActivityCreate({monthKey, periodIndex, view, preset?})` where `preset?={destination:Destination, amount:number}` (for Move leftover).
  - `openActivityEdit({monthKey, view, activity})`.

**Behavior contract (implemented below):**
- Single source ⇒ its amount always mirrors the total (so "enter amount → Save" works).
- Multiple sources ⇒ each non-last source is editable and clamped so the running sum never exceeds the total; the **last** source is derived (`total − Σ others`) and always ≥ 0 — allocations therefore always sum to the total (validity by construction).
- Adding a source ⇒ `redistributeEqual`. Removing ⇒ `removeProportional`. Last source cannot be removed.
- Destination options: Spent, each period, each envelope, `＋ New envelope`. Title = *Add expense* when Spent, else *Move money*.
- Source options: each period, `Whole month`, each envelope, `＋ New envelope`, and `Outside budget` **only** when the destination is an envelope. A source equal to the destination is excluded; duplicate sources are prevented.
- New envelopes are created (via `prompt`) only on **Save**, then referenced by id — cancel leaves nothing behind.
- Projected envelope balance is shown when any source or the destination is an existing envelope.
- Save is disabled when total ≤ 0.

- [ ] **Step 1: Implement `frontend/src/ui/activity.js`**

```js
import { Activities, Envelopes } from '../data.js';
import { formatMoney, parseMoney } from '../money.js';
import { periodsForMonthKey } from '../periods.js';
import { redistributeEqual, removeProportional } from '../split.js';
import * as $ from '../utils.js';
import { describeDestination, describeSource } from './labels.js';

/** @typedef {import('../data.js').Source} Source */
/** @typedef {import('../data.js').Destination} Destination */
/** @typedef {import('../compute.js').MonthView} MonthView */

/** @type {() => Promise<void>} */
let onSaved = async () => {};

const state = {
  /** @type {'create'|'edit'} */ mode: 'create',
  /** @type {string|null} */ editingId: null,
  monthKey: '',
  periodIndex: 0,
  total: 0,
  /** @type {Destination} */ destination: { type: 'spent' },
  /** @type {{ source:Source, amount:number }[]} */ rows: [],
  /** @type {{ id:string, name:string, balance:number }[]} */ envelopes: [],
  /** @type {Map<string,string>} tempId -> name for envelopes created on save */ pending: new Map(),
};

/** @param {string} id */
function envName(id) {
  const found = state.envelopes.find((e) => e.id === id);
  if (found) { return found.name; }
  return state.pending.get(id) ?? '(new envelope)';
}

function periods() { return periodsForMonthKey(state.monthKey); }

/** @param {Source} a @param {Source} b */
function sameRef(a, b) {
  if (a.type !== b.type) { return false; }
  if (a.type === 'period' && b.type === 'period') { return a.periodIndex === b.periodIndex; }
  if (a.type === 'envelope' && b.type === 'envelope') { return a.envelopeId === b.envelopeId; }
  return true; // wholeMonth / outside are singletons
}

/** Keep allocations valid: single source mirrors total; last source absorbs the remainder. */
function normalize() {
  const rows = state.rows;
  const n = rows.length;
  if (n === 1) { rows[0].amount = state.total; return; }
  let acc = 0;
  for (let i = 0; i < n - 1; i++) {
    rows[i].amount = Math.max(0, Math.min(rows[i].amount, state.total - acc));
    acc += rows[i].amount;
  }
  rows[n - 1].amount = state.total - acc;
}

/** @returns {boolean} whether the destination is an envelope that also appears as a source */
function destinationConflicts() {
  if (state.destination.type !== 'envelope' && state.destination.type !== 'period') { return false; }
  /** @type {Source} */
  const asSource = state.destination.type === 'envelope'
    ? { type: 'envelope', envelopeId: state.destination.envelopeId }
    : { type: 'period', periodIndex: state.destination.periodIndex };
  return state.rows.some((r) => sameRef(r.source, asSource));
}

function isValid() {
  return state.total > 0 && !destinationConflicts();
}

function render() {
  renderDestination();
  renderSources();
  renderBar();
  renderProjection();
  $.html($.id('activityTitle')).textContent = state.destination.type === 'spent' ? 'Add expense' : 'Move money';
  const error = destinationConflicts() ? 'A source cannot equal the destination.' : '';
  $.html($.id('activityError')).textContent = error;
  $.button($.id('activitySave')).disabled = !isValid();
}

function renderDestination() {
  const select = /** @type {HTMLSelectElement} */ ($.id('activityDestination'));
  select.innerHTML = '';
  /** @param {string} value @param {string} label @param {boolean} selected */
  const add = (value, label, selected) => {
    const opt = document.createElement('option');
    opt.value = value; opt.textContent = label; opt.selected = selected;
    select.append(opt);
  };
  add('spent', 'Spent', state.destination.type === 'spent');
  periods().forEach((_, i) => add(`period:${i}`, describeDestination({ type: 'period', periodIndex: i }, envName, periods()), state.destination.type === 'period' && state.destination.periodIndex === i));
  for (const e of state.envelopes) { add(`envelope:${e.id}`, e.name, state.destination.type === 'envelope' && state.destination.envelopeId === e.id); }
  add('new-envelope', '＋ New envelope', false);
}

function renderSources() {
  const container = $.html($.id('activitySources'));
  container.innerHTML = '';
  state.rows.forEach((row, i) => {
    const isLast = i === state.rows.length - 1;
    const rowEl = document.createElement('div');
    rowEl.className = 'source-row';

    const label = document.createElement('span');
    label.className = 'source-name';
    label.textContent = describeSource(row.source, envName, periods());

    const amount = document.createElement('input');
    amount.type = 'text';
    amount.inputMode = 'decimal';
    amount.className = 'source-amount';
    amount.value = (row.amount / 100).toFixed(2);
    amount.disabled = isLast && state.rows.length > 1; // last is derived
    amount.setAttribute('aria-label', `${label.textContent} amount`);
    amount.addEventListener('input', () => {
      const parsed = parseMoney(amount.value);
      row.amount = parsed === null ? 0 : Math.max(0, parsed);
      normalize();
      render();
    });

    rowEl.append(label, amount);
    if (state.rows.length > 1) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn ghost small source-remove';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `Remove ${label.textContent}`);
      remove.addEventListener('click', () => {
        const amounts = state.rows.map((r) => r.amount);
        const next = removeProportional(amounts, i, state.total);
        state.rows.splice(i, 1);
        state.rows.forEach((r, j) => { r.amount = next[j]; });
        normalize();
        render();
      });
      rowEl.append(remove);
    }
    container.append(rowEl);
  });
}

function renderBar() {
  const bar = $.html($.id('activityBar'));
  bar.innerHTML = '';
  const total = state.total || 1;
  state.rows.forEach((row, i) => {
    const seg = document.createElement('div');
    seg.className = `alloc-seg alloc-seg-${i % 4}`;
    seg.style.width = `${Math.max(0, (row.amount / total) * 100)}%`;
    bar.append(seg);
  });
}

function renderProjection() {
  const el = $.html($.id('activityProjection'));
  /** @type {string[]} */
  const lines = [];
  if (state.destination.type === 'envelope') {
    const e = state.envelopes.find((x) => x.id === state.destination.envelopeId);
    if (e) { lines.push(`${e.name}: ${formatMoney(e.balance)} → ${formatMoney(e.balance + state.total)}`); }
  }
  for (const row of state.rows) {
    if (row.source.type === 'envelope') {
      const e = state.envelopes.find((x) => x.id === row.source.envelopeId);
      if (e) { lines.push(`${e.name}: ${formatMoney(e.balance)} → ${formatMoney(e.balance - row.amount)}`); }
    }
  }
  el.textContent = lines.join('  ·  ');
}

/** @returns {Source|null} prompt for a new envelope, returning a pending source */
function newEnvelopeSource() {
  const name = prompt('New envelope name')?.trim();
  if (!name) { return null; }
  const tempId = `new:${state.pending.size}:${name}`;
  state.pending.set(tempId, name);
  return { type: 'envelope', envelopeId: tempId };
}

function addSource() {
  const used = state.rows.map((r) => r.source);
  /** @type {Source[]} */
  const candidates = [];
  periods().forEach((_, i) => candidates.push({ type: 'period', periodIndex: i }));
  candidates.push({ type: 'wholeMonth' });
  for (const e of state.envelopes) { candidates.push({ type: 'envelope', envelopeId: e.id }); }
  if (state.destination.type === 'envelope') { candidates.push({ type: 'outside' }); }
  const available = candidates.filter((c) => !used.some((u) => sameRef(u, c)) && !(state.destination.type === 'period' && c.type === 'period' && c.periodIndex === state.destination.periodIndex));

  // Build a tiny picker via prompt of numbered options plus new-envelope.
  const labels = available.map((c, i) => `${i + 1}. ${describeSource(c, envName, periods())}`);
  const choice = prompt(`Add source:\n${labels.join('\n')}\n\nEnter a number, or "new" for a new envelope`);
  if (!choice) { return; }
  /** @type {Source|null} */
  let source = null;
  if (choice.trim().toLowerCase() === 'new') { source = newEnvelopeSource(); }
  else { const idx = Number(choice) - 1; source = available[idx] ?? null; }
  if (!source) { return; }
  state.rows.push({ source, amount: 0 });
  const even = redistributeEqual(state.total, state.rows.length);
  state.rows.forEach((r, i) => { r.amount = even[i]; });
  normalize();
  render();
}

/** @param {string} value the destination <select> value */
function onDestinationChange(value) {
  if (value === 'new-envelope') {
    const name = prompt('New envelope name')?.trim();
    if (!name) { render(); return; }
    const tempId = `new:${state.pending.size}:${name}`;
    state.pending.set(tempId, name);
    state.destination = { type: 'envelope', envelopeId: tempId };
  } else if (value === 'spent') {
    state.destination = { type: 'spent' };
  } else if (value.startsWith('period:')) {
    state.destination = { type: 'period', periodIndex: Number(value.slice('period:'.length)) };
  } else if (value.startsWith('envelope:')) {
    state.destination = { type: 'envelope', envelopeId: value.slice('envelope:'.length) };
  }
  // Drop any source that now equals the destination (keep at least one).
  if (destinationConflicts() && state.rows.length > 1) {
    const asSource = state.destination.type === 'envelope'
      ? { type: 'envelope', envelopeId: state.destination.envelopeId }
      : state.destination;
    const idx = state.rows.findIndex((r) => sameRef(r.source, /** @type {Source} */ (asSource)));
    if (idx >= 0) {
      const amounts = state.rows.map((r) => r.amount);
      const next = removeProportional(amounts, idx, state.total);
      state.rows.splice(idx, 1);
      state.rows.forEach((r, j) => { r.amount = next[j]; });
    }
  }
  normalize();
  render();
}

async function save() {
  if (!isValid()) { return; }
  // Materialise pending new envelopes, then rewrite temp ids.
  /** @type {Map<string,string>} tempId -> realId */
  const idMap = new Map();
  for (const [tempId, name] of state.pending) {
    const created = await Envelopes.create({ name });
    idMap.set(tempId, created.id);
  }
  /** @param {Source} s @returns {Source} */
  const fixSource = (s) => (s.type === 'envelope' && idMap.has(s.envelopeId) ? { type: 'envelope', envelopeId: idMap.get(s.envelopeId) ?? s.envelopeId } : s);
  /** @type {Destination} */
  let destination = state.destination;
  if (destination.type === 'envelope' && idMap.has(destination.envelopeId)) { destination = { type: 'envelope', envelopeId: idMap.get(destination.envelopeId) ?? destination.envelopeId }; }
  const allocations = state.rows.map((r) => ({ source: fixSource(r.source), amount: r.amount }));
  const description = $.input($.id('activityDescription')).value.trim();

  if (state.mode === 'edit' && state.editingId) {
    await Activities.update(state.editingId, { destination, amount: state.total, description, allocations });
  } else {
    await Activities.create({ monthKey: state.monthKey, periodIndex: state.periodIndex, destination, amount: state.total, description, allocations });
  }
  $.dialog($.id('activityDialog')).close();
  await onSaved();
}

async function loadEnvelopes() {
  state.envelopes = await Envelopes.withBalances();
}

/** @param {{ monthKey:string, periodIndex:number, view:MonthView, preset?:{destination:Destination, amount:number} }} opts */
export async function openActivityCreate({ monthKey, periodIndex, preset }) {
  state.mode = 'create';
  state.editingId = null;
  state.monthKey = monthKey;
  state.periodIndex = periodIndex;
  state.pending = new Map();
  state.destination = preset?.destination ?? { type: 'spent' };
  state.total = preset?.amount ?? 0;
  state.rows = [{ source: { type: 'period', periodIndex }, amount: state.total }];
  await loadEnvelopes();
  $.input($.id('activityAmount')).value = state.total > 0 ? (state.total / 100).toFixed(2) : '';
  $.input($.id('activityDescription')).value = '';
  render();
  $.dialog($.id('activityDialog')).showModal();
  $.input($.id('activityAmount')).focus();
}

/** @param {{ monthKey:string, view:MonthView, activity:import('../data.js').Activity }} opts */
export async function openActivityEdit({ monthKey, activity }) {
  state.mode = 'edit';
  state.editingId = activity.id;
  state.monthKey = monthKey;
  state.periodIndex = activity.periodIndex;
  state.pending = new Map();
  state.destination = activity.destination;
  state.total = activity.amount;
  state.rows = activity.allocations.map((a) => ({ source: a.source, amount: a.amount }));
  await loadEnvelopes();
  $.input($.id('activityAmount')).value = (state.total / 100).toFixed(2);
  $.input($.id('activityDescription')).value = activity.description;
  render();
  $.dialog($.id('activityDialog')).showModal();
  $.input($.id('activityAmount')).focus();
}

/** @param {() => Promise<void>} saved */
export function setupActivity(saved) {
  onSaved = saved;
  const dlg = $.dialog($.id('activityDialog'));
  $.button($.id('activityClose')).addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) { dlg.close(); } });

  $.input($.id('activityAmount')).addEventListener('input', () => {
    const parsed = parseMoney($.input($.id('activityAmount')).value);
    state.total = parsed === null ? 0 : Math.max(0, parsed);
    normalize();
    render();
  });

  $.id('activityDestination').addEventListener('change', (e) => {
    onDestinationChange(/** @type {HTMLSelectElement} */ (e.target).value);
  });

  $.button($.id('activityAddSource')).addEventListener('click', () => addSource());

  $.form($.id('activityForm')).addEventListener('submit', (e) => {
    e.preventDefault();
    void save();
  });
}
```

- [ ] **Step 2: Delegate the dialog from `frontend/src/ui/month.js`.**

Add the import near the top:

```js
import { openActivityCreate, openActivityEdit, setupActivity } from './activity.js';
```

Replace the `openActivity` function (the one that manually filled the old dialog) with a call into the new form:

```js
/** Opens the universal form for a new expense from a source period. @param {number} periodIndex */
function openActivity(periodIndex) {
  const view = lastView;
  if (!view) { return; }
  void openActivityCreate({ monthKey: /** @type {string} */ (selectedMonthKey), periodIndex, view });
}
```

Add a module-level cache of the latest view near `selectedMonthKey`:

```js
/** @type {import('../compute.js').MonthView|null} */
let lastView = null;
```

In `renderMonth`, store the view after building it:

```js
export async function renderMonth(monthKey) {
  selectedMonthKey = monthKey;
  const { view, bills } = await buildView(monthKey);
  lastView = view;
  $.html($.id('monthTitle')).textContent = monthLabel(monthKey);
  renderStatus(view, bills);
  await renderPeriods(view);
}
```

In `setupMonth`, delete the old activity-dialog wiring block (the `const activityDlg = …` through its `submit` handler) and instead register the form once:

```js
  setupActivity(async () => { await refresh(); });
```

Make period expense items open the editor. In `renderPeriods`, where each activity item is created, replace the plain `div` item with a button that opens the editor:

```js
      for (const a of periodActivities) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'btn ghost expense-item';
        item.textContent = `${formatMoney(a.amount)} ${a.description}`.trim();
        item.addEventListener('click', () => {
          const view = lastView;
          if (view) { void openActivityEdit({ monthKey: /** @type {string} */ (selectedMonthKey), view, activity: a }); }
        });
        list.append(item);
      }
```

- [ ] **Step 3: Verify boot + manual flow**

Run: `mise run dev`
Manually: create a month; on a period tap `+ Add`; enter an amount; add a source (pick a period or `new` envelope); confirm the amounts always sum to the total and the last source is non-editable; save; tap the saved item to reopen it in edit mode. Stop the server.

- [ ] **Step 4: Verify lint/types + existing suites**

Run: `mise run full-lint`
Then: `mise run test-unit`
Expected: PASS. (The E2E in `setup-and-expense.spec.js` still targets Amount + Save, which remain — it stays green.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/activity.js frontend/src/ui/month.js
git commit -m "ui: universal activity form (split sources, destinations, edit, inline envelope)"
```

---

## Task 10: Delete from the activity form

**Files:**
- Modify: `frontend/index.html` (add a Delete button, edit-mode only)
- Modify: `frontend/src/ui/activity.js` (wire delete)

**Interfaces:**
- Consumes: `Activities.remove` (data.js).
- Produces: a `#activityDelete` button shown only in edit mode.

- [ ] **Step 1: Add the Delete button** to the activity form in `frontend/index.html`, immediately before the Save button:

```html
      <button type="button" class="btn destructive hidden" id="activityDelete">Delete</button>
      <button type="submit" class="btn primary" id="activitySave">Save</button>
```

- [ ] **Step 2: Wire delete in `frontend/src/ui/activity.js`.**

In `render()`, toggle the button's visibility by mode — add at the end of `render()`:

```js
  $.button($.id('activityDelete')).classList.toggle('hidden', state.mode !== 'edit');
```

In `setupActivity`, register the handler (after the submit listener):

```js
  $.button($.id('activityDelete')).addEventListener('click', () => {
    void (async () => {
      if (state.mode !== 'edit' || !state.editingId) { return; }
      await Activities.remove(state.editingId);
      $.dialog($.id('activityDialog')).close();
      await onSaved();
    })();
  });
```

- [ ] **Step 3: Add a delete/reversal integration test** — append to `frontend/src/tests/integration/activities.integration.js`:

```js
import { computeMonth } from '../../compute.js';

describe('Activities — edit/delete reverse effects', () => {
  test('reducing an expense amount is a partial refund; deleting is a full refund', async () => {
    const a = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 0, amount: 5000 });
    const acts1 = await Activities.listForMonth('2026-07');
    const v1 = computeMonth({ monthKey: '2026-07', available: 300000, bills: [], activities: acts1 });
    expect(v1.safeToSpend).toBe(295000);

    await Activities.update(a.id, {
      destination: { type: 'spent' }, amount: 2000, description: '',
      allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 2000 }],
    });
    const acts2 = await Activities.listForMonth('2026-07');
    expect(computeMonth({ monthKey: '2026-07', available: 300000, bills: [], activities: acts2 }).safeToSpend).toBe(298000);

    await Activities.remove(a.id);
    const acts3 = await Activities.listForMonth('2026-07');
    expect(computeMonth({ monthKey: '2026-07', available: 300000, bills: [], activities: acts3 }).safeToSpend).toBe(300000);
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mise run test-unit-file src/tests/integration/activities.integration.js`
Expected: PASS.

- [ ] **Step 5: Verify lint/types**

Run: `mise run full-lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/src/ui/activity.js frontend/src/tests/integration/activities.integration.js
git commit -m "ui: delete an activity from the form; prove edit/delete reversal"
```

---

# Phase D — Envelopes screen, move-leftover, open funds

## Task 11: Envelopes overview + detail screen

**Files:**
- Modify: `frontend/index.html` (envelopes page containers)
- Create: `frontend/src/ui/envelopes.js`
- Modify: `frontend/src/main.js` (render envelopes on boot + on tab switch)
- Modify: `frontend/src/ui/ui.js` (re-render envelopes when its tab is shown)

**Interfaces:**
- Consumes: `Envelopes.withBalances`, `Envelopes.history` (data.js); `describeSource`, `describeDestination`, `periodRange` (labels.js); `monthLabel` (month.js); `periodsForMonthKey` (periods.js); `formatMoney` (money.js).
- Produces: `renderEnvelopes()`; `setupEnvelopes()` (back-button wiring).

- [ ] **Step 1: Replace the `#page-envelopes` section** in `frontend/index.html`:

```html
    <section id="page-envelopes" class="page hidden">
      <div id="envelopeOverview">
        <h2 class="screen-title">Envelopes</h2>
        <ul id="envelopeList" class="envelope-list"></ul>
        <p id="envelopeEmpty" class="empty hidden">No envelopes yet. Fund one from a period's + Add.</p>
      </div>
      <div id="envelopeDetail" class="hidden">
        <button type="button" class="btn ghost small" id="envelopeBack">← All envelopes</button>
        <h2 id="envelopeDetailName" class="screen-title"></h2>
        <div id="envelopeDetailBalance" class="hero"></div>
        <ul id="envelopeHistory" class="history-list"></ul>
      </div>
    </section>
```

- [ ] **Step 2: Implement `frontend/src/ui/envelopes.js`**

```js
import { Envelopes } from '../data.js';
import { formatMoney } from '../money.js';
import { periodsForMonthKey } from '../periods.js';
import * as $ from '../utils.js';
import { describeDestination, describeSource, periodRange } from './labels.js';
import { monthLabel } from './month.js';

/** @param {(id:string)=>string} nameOf @param {import('../compute.js').HistoryRow} row */
function counterpartyText(nameOf, row) {
  const periods = periodsForMonthKey(row.monthKey);
  if (row.direction === 'in') {
    const sources = /** @type {import('../data.js').Source[]} */ (row.counterparty);
    return sources.map((s) => describeSource(s, nameOf, periods)).join(' + ');
  }
  return describeDestination(/** @type {import('../data.js').Destination} */ (row.counterparty), nameOf, periods);
}

/** Render the envelope overview list (hides the detail view). */
export async function renderEnvelopes() {
  const envelopes = await Envelopes.withBalances();
  $.html($.id('envelopeDetail')).classList.add('hidden');
  $.html($.id('envelopeOverview')).classList.remove('hidden');
  const list = $.html($.id('envelopeList'));
  list.innerHTML = '';
  $.html($.id('envelopeEmpty')).classList.toggle('hidden', envelopes.length > 0);
  for (const e of envelopes) {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn envelope-row';
    const sign = e.balance < 0 ? 'negative' : e.balance === 0 ? 'zero' : 'positive';
    btn.innerHTML = `<span class="envelope-name">${e.name}</span>`;
    const bal = document.createElement('span');
    bal.className = `envelope-balance ${sign}`;
    bal.textContent = e.balance < 0 ? `−${formatMoney(-e.balance)}` : formatMoney(e.balance);
    btn.append(bal);
    btn.addEventListener('click', () => { void renderEnvelopeDetail(e.id); });
    li.append(btn);
    list.append(li);
  }
}

/** @param {string} envelopeId */
async function renderEnvelopeDetail(envelopeId) {
  const [envelopes, rows] = await Promise.all([Envelopes.withBalances(), Envelopes.history(envelopeId)]);
  const env = envelopes.find((e) => e.id === envelopeId);
  if (!env) { return; }
  const nameOf = (id) => envelopes.find((e) => e.id === id)?.name ?? '(unknown)';

  $.html($.id('envelopeOverview')).classList.add('hidden');
  $.html($.id('envelopeDetail')).classList.remove('hidden');
  $.html($.id('envelopeDetailName')).textContent = env.name;
  $.html($.id('envelopeDetailBalance')).textContent = env.balance < 0 ? `−${formatMoney(-env.balance)}` : formatMoney(env.balance);

  const list = $.html($.id('envelopeHistory'));
  list.innerHTML = '';
  for (const row of rows) {
    const li = document.createElement('li');
    li.className = 'history-row';
    const sign = row.direction === 'in' ? '+' : '−';
    const context = `${monthLabel(row.monthKey)} · ${periodRange(periodsForMonthKey(row.monthKey), row.periodIndex)}`;
    const label = row.direction === 'in' ? `From ${counterpartyText(nameOf, row)}` : `To ${counterpartyText(nameOf, row)}`;
    li.innerHTML = `<span class="history-amount ${row.direction}">${sign}${formatMoney(row.amount)}</span>` +
      `<span class="history-label">${label}${row.description ? ` — ${row.description}` : ''}</span>` +
      `<span class="history-context">${context}</span>`;
    list.append(li);
  }
}

/** Wire the back button once. */
export function setupEnvelopes() {
  $.button($.id('envelopeBack')).addEventListener('click', () => { void renderEnvelopes(); });
}
```

- [ ] **Step 3: Add an injectable "envelopes shown" hook to `frontend/src/ui/ui.js`** so it re-renders on tab switch without importing `envelopes.js` directly (which would cycle through `month.js`).

Add near the top of `ui.js` (after the imports):

```js
/** @type {() => Promise<void>} */
let refreshEnvelopes = async () => {};
/** @param {() => Promise<void>} fn */
export function onEnvelopesShown(fn) { refreshEnvelopes = fn; }
```

Replace the tab loop inside `setupUI` so switching to Envelopes refreshes balances:

```js
  for (const tab of $.arr('.tab[data-page]')) {
    $.html(tab).addEventListener('click', () => {
      const page = /** @type {'month'|'envelopes'} */ ($.html(tab).dataset.page);
      $.showPage(page);
      if (page === 'envelopes') { void refreshEnvelopes(); }
    });
  }
```

- [ ] **Step 4: Rewrite `frontend/src/main.js`** to wire the envelopes screen (final form, using the hook exported in Step 3):

```js
import { renderEnvelopes, setupEnvelopes } from './ui/envelopes.js';
import { openInitialMonth, setupMonth } from './ui/month.js';
import { onEnvelopesShown, setupUI } from './ui/ui.js';

void (async function init() {
  setupUI();
  setupMonth();
  setupEnvelopes();
  onEnvelopesShown(async () => { await renderEnvelopes(); });
  await openInitialMonth();
  await renderEnvelopes();
})();
```

- [ ] **Step 5: Verify boot + manual flow**

Run: `mise run dev`
Manually: fund a new envelope from a period via `+ Add` (destination → New envelope); switch to the Envelopes tab; confirm the balance appears; open the envelope and see one `in` history row with month/period context; use back. Stop the server.

- [ ] **Step 6: Verify lint/types + suites**

Run: `mise run full-lint`
Then: `mise run test-unit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/index.html frontend/src/ui/envelopes.js frontend/src/main.js frontend/src/ui/ui.js
git commit -m "ui: envelopes overview and transaction-history detail screen"
```

---

## Task 12: Move leftover + open-funds treatment + period breakdown

**Files:**
- Modify: `frontend/src/ui/month.js`

**Interfaces:**
- Consumes: `openActivityCreate` (activity.js); `PeriodView.openFunds`, `.completed`, `.remaining`, `.carryIn`, `.transferIn`, `.out`, `.spent`, `.allocation` (compute.js).
- Produces: a `Move leftover` button on completed positive period cards; an open-funds status line; an expanded per-period breakdown.

- [ ] **Step 1: Add Move-leftover + open-funds status to each period card.** In `renderPeriods`, after the `add` button is appended, insert:

```js
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
          view,
          preset: { destination, amount: p.remaining },
        });
      });
      card.append(move);
    }
```

Note: when the period is the last one (`nextIndex === null`), the preset destination is a placeholder; the user picks an envelope in the form (§11.4 — final-period funds go to an envelope). The amount defaults to the full positive balance and remains editable (PER-7).

- [ ] **Step 2: Add the expanded breakdown.** Add a per-card expand toggle. Near the top of `month.js` add:

```js
/** @type {Set<number>} indices of expanded period cards */
const expandedPeriods = new Set();
```

In `renderPeriods`, after appending `secondary`, add a details toggle and (when expanded) a breakdown block:

```js
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
        `Remaining ${formatMoney(p.remaining)}`,
      ].filter(Boolean);
      breakdown.innerHTML = rows.map((r) => `<div>${r}</div>`).join('');
      card.append(breakdown);
    }
```

- [ ] **Step 3: Verify boot + manual flow**

Run: `mise run dev`
Manually: create a *past* month (via "Start another month" → pick an earlier key is not possible in-UI, so instead) — simpler: create the current month, overspend period 0 so a later period stays positive and is completed only if its end date has passed. For a deterministic check, use the integration test in Task 14 for open-funds; here just confirm the Details toggle shows the breakdown and no errors. Stop the server.

- [ ] **Step 4: Verify lint/types + suites**

Run: `mise run full-lint`
Then: `mise run test-unit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/ui/month.js
git commit -m "ui: move-leftover action, open-funds status, period breakdown"
```

---

# Phase E — Bill lifecycle (BIL-4 / BIL-6 / BIL-7)

## Task 13: Scoped expected-value change and bill removal (data)

**Files:**
- Modify: `frontend/src/data-bills.js`
- Modify: `frontend/src/tests/integration/bills.integration.js`

**Interfaces:**
- Produces:
  - `Bills.setExpected(occId, expected, scope:'thisMonth'|'forward')=>BillOccurrence` — `forward` also updates later-month occurrences of the same series; earlier months are never touched.
  - `Bills.remove(occId, scope:'thisMonth'|'forward')=>void` — deletes this occurrence (and, for `forward`, later-month occurrences of the same series).

- [ ] **Step 1: Append the failing tests** to `frontend/src/tests/integration/bills.integration.js`:

```js
describe('Bills — scoped expected change and removal', () => {
  test('setExpected "thisMonth" changes only the selected month', async () => {
    const { occ, series } = await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    // create an August occurrence of the same series
    await db.put('billOccurrences', { id: 'occ:aug', seriesId: series.id, monthKey: '2026-08', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 1, updatedAt: 1 });
    await Bills.setExpected(occ.id, 9000, 'thisMonth');
    expect((await Bills.listForMonth('2026-07'))[0].expected).toBe(9000);
    expect((await Bills.listForMonth('2026-08'))[0].expected).toBe(8000);
  });

  test('setExpected "forward" changes this and later months, never earlier', async () => {
    const june = await Bills.create({ monthKey: '2026-06', name: 'Power', expected: 8000 });
    const seriesId = june.series.id;
    await db.put('billOccurrences', { id: 'occ:jul', seriesId, monthKey: '2026-07', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 2, updatedAt: 2 });
    await db.put('billOccurrences', { id: 'occ:aug', seriesId, monthKey: '2026-08', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 3, updatedAt: 3 });
    await Bills.setExpected('occ:jul', 9500, 'forward');
    expect((await Bills.listForMonth('2026-06'))[0].expected).toBe(8000); // earlier untouched
    expect((await Bills.listForMonth('2026-07'))[0].expected).toBe(9500);
    expect((await Bills.listForMonth('2026-08'))[0].expected).toBe(9500);
  });

  test('remove "thisMonth" deletes only the selected occurrence', async () => {
    const { occ, series } = await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    await db.put('billOccurrences', { id: 'occ:aug', seriesId: series.id, monthKey: '2026-08', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 4, updatedAt: 4 });
    await Bills.remove(occ.id, 'thisMonth');
    expect(await Bills.listForMonth('2026-07')).toHaveLength(0);
    expect(await Bills.listForMonth('2026-08')).toHaveLength(1);
  });

  test('remove "forward" deletes this and later occurrences', async () => {
    const june = await Bills.create({ monthKey: '2026-06', name: 'Power', expected: 8000 });
    const seriesId = june.series.id;
    await db.put('billOccurrences', { id: 'occ:jul', seriesId, monthKey: '2026-07', expected: 8000, paid: false, actual: null, paidDate: null, createdAt: 5, updatedAt: 5 });
    await Bills.remove('occ:jul', 'forward');
    expect(await Bills.listForMonth('2026-06')).toHaveLength(1);
    expect(await Bills.listForMonth('2026-07')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `mise run test-unit-file src/tests/integration/bills.integration.js`
Expected: FAIL — `Bills.setExpected` / `Bills.remove` not defined.

- [ ] **Step 3: Add both methods to `frontend/src/data-bills.js`** (inside the `Bills` object, after `rename`):

```js
  /**
   * @param {string} occId @param {number} expected @param {'thisMonth'|'forward'} scope
   * @returns {Promise<BillOccurrence>}
   */
  async setExpected(occId, expected, scope) {
    const occ = await loadOccurrence(occId);
    const targets = scope === 'forward'
      ? (await db.getAllByIndex('billOccurrences', 'by_series', occ.seriesId)).filter((o) => o.monthKey >= occ.monthKey)
      : [occ];
    const timestamp = now();
    for (const target of targets) {
      await db.put('billOccurrences', { ...target, expected, updatedAt: timestamp });
    }
    return { ...occ, expected, updatedAt: timestamp };
  },

  /**
   * @param {string} occId @param {'thisMonth'|'forward'} scope
   * @returns {Promise<void>}
   */
  async remove(occId, scope) {
    const occ = await loadOccurrence(occId);
    const targets = scope === 'forward'
      ? (await db.getAllByIndex('billOccurrences', 'by_series', occ.seriesId)).filter((o) => o.monthKey >= occ.monthKey)
      : [occ];
    for (const target of targets) {
      await db.del('billOccurrences', target.id);
    }
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `mise run test-unit-file src/tests/integration/bills.integration.js`
Expected: PASS.

- [ ] **Step 5: Verify lint/types**

Run: `mise run full-lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data-bills.js frontend/src/tests/integration/bills.integration.js
git commit -m "data: scoped bill expected-value change and removal"
```

---

## Task 14: Bill-scope dialog + wiring (UI)

**Files:**
- Modify: `frontend/index.html` (scope dialog)
- Modify: `frontend/src/ui/month.js` (expected-edit scope, remove with paid confirm, payment edit)

**Interfaces:**
- Consumes: `Bills.setExpected`, `Bills.remove`, `Bills.setActual`, `Bills.markUnpaid` (data.js).
- Produces: a reusable `#billScopeDialog` and bill-row controls for edit/remove.

- [ ] **Step 1: Add the scope dialog** to `frontend/index.html`, after the `#activityDialog` dialog:

```html
  <dialog id="billScopeDialog" aria-label="Apply to which months">
    <div class="sheet-inner">
      <div class="sheet-header"><span id="billScopeTitle">Apply change</span>
        <button type="button" class="btn ghost" id="billScopeClose" aria-label="Close">✕</button></div>
      <button type="button" class="btn" id="billScopeThis">This month only</button>
      <button type="button" class="btn" id="billScopeForward">This and following months</button>
    </div>
  </dialog>
```

- [ ] **Step 2: Add a scope-prompt helper** near the top of `frontend/src/ui/month.js`:

```js
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
    /** @param {'thisMonth'|'forward'|null} value */
    function finish(value) {
      thisBtn.removeEventListener('click', onThis);
      fwdBtn.removeEventListener('click', onFwd);
      closeBtn.removeEventListener('click', onClose);
      done(value);
    }
    thisBtn.addEventListener('click', onThis);
    fwdBtn.addEventListener('click', onFwd);
    closeBtn.addEventListener('click', onClose);
    dlg.showModal();
  });
}
```

- [ ] **Step 3: Extend the bill row** in `renderBillList`. Replace the amount-button click handler so it edits the **expected** value with a scope choice, and add a Remove control.

Replace the existing `amount.addEventListener('click', …)` block with an expected-value editor:

```js
    amount.addEventListener('click', () => {
      void (async () => {
        if (bill.paid) {
          const entered = parseMoney(prompt('Actual amount', ((bill.actual ?? bill.expected) / 100).toFixed(2)) ?? '');
          if (entered !== null && entered >= 0) { await Bills.setActual(bill.id, entered); await refresh(); }
          return;
        }
        const entered = parseMoney(prompt('Expected amount', (bill.expected / 100).toFixed(2)) ?? '');
        if (entered === null || entered < 0) { return; }
        const scope = await chooseScope('Change expected amount');
        if (!scope) { return; }
        await Bills.setExpected(bill.id, entered, scope);
        await refresh();
      })();
    });
```

Add a Remove button in the same row (append after `amount`):

```js
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'btn ghost small bill-remove';
    remove.textContent = '🗑';
    remove.setAttribute('aria-label', `Remove ${bill.name}`);
    remove.addEventListener('click', () => {
      void (async () => {
        if (bill.paid && !confirm(`${bill.name} is paid. Remove it anyway?`)) { return; }
        const scope = await chooseScope('Remove bill');
        if (!scope) { return; }
        await Bills.remove(bill.id, scope);
        await refresh();
      })();
    });
    row.append(pay, name, amount, remove);
```

(Remove the old `row.append(pay, name, amount);` line — replaced above.)

- [ ] **Step 4: Verify boot + manual flow**

Run: `mise run dev`
Manually: expand monthly status; on an unpaid bill tap the amount → enter a new expected → pick "This month only"; add a second month and repeat with "This and following"; confirm earlier month unchanged; remove a paid bill and confirm the extra confirmation appears. Stop the server.

- [ ] **Step 5: Verify lint/types + suites**

Run: `mise run full-lint`
Then: `mise run test-unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/index.html frontend/src/ui/month.js
git commit -m "ui: scoped expected-value edit and bill removal with paid confirmation"
```

---

# Phase F — Integration flows, E2E smoke, styles

## Task 15: Whole-system integration flows

**Files:**
- Modify: `frontend/src/tests/integration/month-flow.integration.js` (append flows)

**Interfaces:**
- Consumes: all data modules + `computeMonth`, `computeEnvelopes` (data.js/compute.js).

- [ ] **Step 1: Append the flows** to `frontend/src/tests/integration/month-flow.integration.js` (the file already imports `computeMonth`, `Activities`, `Bills`, `Months`; add `Envelopes` and `computeEnvelopes`):

Add to the imports at the top:

```js
import { computeEnvelopes } from '../../compute.js';
import { Envelopes } from '../../data.js';
```

Append:

```js
describe('whole-system — envelopes, transfers, carry (invariants)', () => {
  test('split expense: period + envelope, funding is not double-counted', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const groceries = await Envelopes.create({ name: 'Groceries' });
    // fund the envelope from period 2, then spend split across period 2 + envelope
    await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'envelope', envelopeId: groceries.id }, amount: 20000,
      allocations: [{ source: { type: 'period', periodIndex: 2 }, amount: 20000 }],
    });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 2, destination: { type: 'spent' }, amount: 15000,
      allocations: [
        { source: { type: 'period', periodIndex: 2 }, amount: 9000 },
        { source: { type: 'envelope', envelopeId: groceries.id }, amount: 6000 },
      ],
    });
    const view = await viewFor('2026-07');
    // month loses only the period-sourced money: 20000 funding + 9000 expense
    expect(view.safeToSpend).toBe(300000 - 20000 - 9000);
    const balances = computeEnvelopes([groceries], await Activities.listForMonth('2026-07'));
    expect(balances[0].balance).toBe(20000 - 6000); // 14000
  });

  test('period-to-period positive move leaves the month total unchanged', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 0, destination: { type: 'period', periodIndex: 1 }, amount: 10000,
      allocations: [{ source: { type: 'period', periodIndex: 0 }, amount: 10000 }],
    });
    const view = await viewFor('2026-07');
    expect(view.safeToSpend).toBe(300000);
    expect(view.periods[1].transferIn).toBe(10000);
  });

  test('whole-month envelope funding debits periods but is not spending', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const travel = await Envelopes.create({ name: 'Travel' });
    await Activities.create({
      monthKey: '2026-07', periodIndex: 0, destination: { type: 'envelope', envelopeId: travel.id }, amount: 31000,
      allocations: [{ source: { type: 'wholeMonth' }, amount: 31000 }],
    });
    const view = await viewFor('2026-07');
    expect(view.safeToSpend).toBe(300000 - 31000);
    expect(view.periods.every((p) => p.spent === 0)).toBe(true);
    const balances = computeEnvelopes([travel], await Activities.listForMonth('2026-07'));
    expect(balances[0].balance).toBe(31000);
  });

  test('open funds appear on completed positive periods of a past month', async () => {
    await Months.create({ monthKey: '2026-05', available: 300000 });
    const view = computeMonth({
      monthKey: '2026-05', available: 300000, bills: [],
      activities: await Activities.listForMonth('2026-05'), todayKey: '2026-07-15',
    });
    expect(view.hasOpenFunds).toBe(true);
    expect(view.periods.every((p) => p.completed)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the file to verify it passes**

Run: `mise run test-unit-file src/tests/integration/month-flow.integration.js`
Expected: PASS.

- [ ] **Step 3: Run the whole unit+integration suite**

Run: `mise run test-unit`
Expected: PASS (all unit + integration).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/tests/integration/month-flow.integration.js
git commit -m "e2e: integration flows for split, transfers, whole-month funding, open funds"
```

---

## Task 16: E2E smoke — split expense + fund envelope

**Files:**
- Create: `frontend/tests-e2e/split-and-envelope.spec.js`

**Interfaces:**
- Consumes: the running app + `window.__testDB.reset` (playwright-helpers.js).

- [ ] **Step 1: Write the smoke spec** — `frontend/tests-e2e/split-and-envelope.spec.js`:

```js
import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => {
  await resetDB(page);
});

test('fund a new envelope from a period and see it on the Envelopes screen', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');

  // Open the universal form from the first period, move money to a new envelope.
  await page.locator('.period-card').first().getByRole('button', { name: '+ Add' }).click();
  await page.getByLabel('Amount').fill('100');

  // Create a new envelope as the destination (prompt-driven).
  page.once('dialog', (d) => d.accept('Travel'));
  await page.getByLabel('To').selectOption('new-envelope');
  await expect(page.locator('#activityTitle')).toContainText('Move money');
  await page.getByRole('button', { name: 'Save' }).click();

  // Switch to Envelopes and confirm the balance.
  await page.getByRole('button', { name: 'Envelopes' }).click();
  await expect(page.locator('#envelopeList')).toContainText('Travel');
  await expect(page.locator('#envelopeList')).toContainText('$100.00');
});
```

- [ ] **Step 2: Run the E2E spec**

Run: `mise run e2e-file tests-e2e/split-and-envelope.spec.js`
Expected: PASS. If the destination `selectOption('new-envelope')` fires the prompt before the option registers, ensure the `page.once('dialog')` is set immediately before the `selectOption` call (as written).

- [ ] **Step 3: Run the existing E2E to confirm no regressions**

Run: `mise run e2e`
Expected: PASS (setup-and-expense, persistence, and the new smoke).

- [ ] **Step 4: Commit**

```bash
git add frontend/tests-e2e/split-and-envelope.spec.js
git commit -m "e2e: smoke — fund a new envelope from a period"
```

---

## Task 17: Styles for the new components

**Files:**
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Produces: styling for source rows, allocation bar, projection/error lines, envelopes overview + history, open-funds/breakdown, and the scope dialog. No behavior change.

- [ ] **Step 1: Append component styles** to `frontend/src/styles.css`:

```css
/* Universal activity form */
.sources-head { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
.sources { display: flex; flex-direction: column; gap: 8px; }
.source-row { display: flex; align-items: center; gap: 8px; }
.source-name { flex: 1; }
.source-amount { width: 8rem; min-height: 44px; }
.source-remove { min-width: 44px; }
.alloc-bar { display: flex; height: 10px; border-radius: 10px; overflow: hidden; margin: 12px 0; background: color-mix(in srgb, Canvas 85%, GrayText); }
.alloc-seg { height: 100%; }
.alloc-seg-0 { background: var(--brand, #4f7cff); }
.alloc-seg-1 { background: var(--positive, #2fa36b); }
.alloc-seg-2 { background: var(--warning, #c98a00); }
.alloc-seg-3 { background: color-mix(in srgb, var(--brand, #4f7cff) 60%, GrayText); }
.activity-projection { font-size: 0.9rem; opacity: 0.85; margin: 4px 0; }
.activity-error { color: var(--negative, #c0392b); font-size: 0.9rem; min-height: 1.2em; margin: 0; }

/* Envelopes */
.screen-title { font-size: 1.25rem; margin: 8px 0 16px; }
.envelope-list, .history-list, .month-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.envelope-row { display: flex; justify-content: space-between; align-items: center; width: 100%; min-height: 48px; }
.envelope-balance.negative { color: var(--negative, #c0392b); }
.envelope-balance.positive { color: var(--positive, #2fa36b); }
.history-row { display: grid; grid-template-columns: auto 1fr; gap: 2px 12px; padding: 8px 0; border-bottom: 1px solid color-mix(in srgb, Canvas 80%, GrayText); }
.history-amount { font-weight: 600; }
.history-amount.out { color: var(--negative, #c0392b); }
.history-context { grid-column: 1 / -1; font-size: 0.8rem; opacity: 0.7; }

/* Period open funds + breakdown */
.open-funds { color: var(--warning, #c98a00); font-size: 0.9rem; margin-top: 8px; }
.move-leftover { margin-top: 4px; }
.breakdown { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }

/* Buttons + dialogs reused by Slice 2 */
.btn.destructive { color: var(--negative, #c0392b); }
.expense-item { text-align: left; width: 100%; }
```

- [ ] **Step 2: Verify boot + visual check**

Run: `mise run dev`
Manually: confirm source rows, allocation bar, envelopes list, history rows, open-funds text, and the scope dialog all render legibly in light and dark themes. Stop the server.

- [ ] **Step 3: Verify lint/types**

Run: `mise run full-lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/styles.css
git commit -m "ui: styles for sources, allocation bar, envelopes, open funds, scope dialog"
```

---

## Task 18: Full green + finish the branch

**Files:** none (verification only).

- [ ] **Step 1: Run the full verification suite**

Run: `mise run full-lint`
Then: `mise run test`
Expected: Biome + tsc pass; all unit, integration, and E2E pass.

- [ ] **Step 2: Manual acceptance pass against the Slice 2 story list**

Run: `mise run dev`. Confirm, end to end:
- Record a split expense across a period and an envelope; balances update.
- Fund an envelope from the whole month; period balances drop; not counted as spending.
- Envelope→envelope and envelope→period transfers; both histories reconcile.
- Overspend a period; the deficit reduces the next period only; safe-to-spend is correct.
- A completed positive period shows *Move leftover*; moving to the next period leaves it at zero.
- Edit an expense (partial refund) and delete one (full refund).
- Change a bill's expected value "this month" vs "this and following"; remove a bill by scope with paid confirmation.
Stop the server.

- [ ] **Step 3: Finish the branch**

Invoke the `superpowers:finishing-a-development-branch` skill to choose how to integrate `slice-2-full-financial-behavior` (merge to `master` mirroring the Slice 1 merge commit, or open a PR).

---

## Self-review notes (coverage map)

- **Split funding** → Tasks 4 (math), 9 (form), 15 (flow).
- **Envelopes** → Tasks 1 (store), 3 (CRUD), 6 (balances/history), 11 (screen).
- **Universal move-money** → Tasks 7–10 (labels, markup, form, delete).
- **Whole-month funding** → Tasks 5 (compute), 9 (source), 15 (flow).
- **Deficit carry** → Task 5 (compute + tests), 12 (breakdown), 15 (flow).
- **Open funds / Move leftover** → Tasks 5 (compute), 12 (UI), 15 (flow).
- **Envelope history** → Tasks 6 (derivation), 11 (detail screen).
- **Editing & deletion (activities)** → Tasks 9–10; **(bills, BIL-4/6/7)** → Tasks 13–14.
- **Conservation invariants (CAL-4)** → Tasks 4/5/6 unit + Task 15 integration.
- **Export includes envelopes** → Task 1.
