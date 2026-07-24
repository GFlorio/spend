# Slice 3 — Durable PWA prototype + deferred fixes — Design

Date: 2026-07-24
Epics: MTH-2, PER-8, SET-1..5, DAT-2/4/5/6, UX-1/2/3 (Slice 3 in `docs/prototype-epics.md`)
Predecessors: Slice 1 (basic budget), Slice 2 (full financial behavior) — both complete.

## 1. Goal

Turn the working budget app into a durable, installable, offline PWA and pay down the
Slice 1/2 deferred backlog. The slice adds no new financial behavior; it hardens the
core against untrusted (imported) data, exposes data portability and app-health status,
and finishes UI polish.

Standing constraints (from README/CLAUDE.md): derive-don't-store, integer minor units,
pure domain modules, atomic writes, a single `db.js` store boundary, brevity, less code,
tests pushed down the pyramid.

### Already in place (do not rebuild)
- Theme selection (SET-1) — `src/ui/ui.js` persists + applies `data-theme`.
- PWA shell — `vite-plugin-pwa` (injectManifest) + `src/../sw.js` + manifest in `vite.config.js`.
- `db.exportDB()` — serialises every store (no UI yet).
- `db.resetDB()` — closes + deletes the database (no UI yet).

## 2. Deferred correctness fixes (Phase A — done first)

Importing untrusted data (§4) is what makes these guards load-bearing, so they land
before the import path. All are carried from the Slice 1/2 ledger (`.superpowers/sdd/progress.md`).

1. **`compute.js` periodIndex bounds.** For every `destination.periodIndex`,
   `source.periodIndex`, and each activity, assert the index is an integer in `[0, n)`
   where `n = periods.length`. Throw a clear `Error` on violation rather than silently
   producing `NaN`/sparse arrays. Rationale: the UI always passes valid indices and
   import is validated (§4), so fail-loud surfaces real bugs ("assert assumptions").
2. **Data-layer conservation assertion.** `Activities.create` and `Activities.update`
   assert `amount === Σ allocations.amount` and that every allocation amount is a
   non-negative integer; throw otherwise. Extract a shared `assertConserved(amount, allocations)`
   helper (co-located in `data-activities.js`, exported for tests).
3. **`split.js removeProportional`** guards an out-of-range `indexToRemove` (throw).
4. **Whole-month-funded *expense* populates `spent[]`.** In `computeMonth`, when an
   allocation's source is `wholeMonth` **and** the destination is `spent`, distribute the
   allocation into `spent[]` using the same proportional `allocate(...)` shares already
   computed for `wholeMonthDebit`. Today only `period` sources feed `spent[]`, so a
   whole-month-funded expense under-reports "spent vs allocated".
5. **Bill scope validation.** `data-bills` `setExpected`/`remove` throw on an unknown
   scope string instead of silently falling through to `thisMonth`. Valid scopes:
   `'thisMonth'`, `'forward'`.
6. **`computeEnvelopes` cleanup.** The in-loop `?? 0` when the counterparty is a *listed*
   envelope is redundant (the balance map is pre-seeded from `envelopes`). Simplify by
   only mutating the map for ids it already contains, dropping the redundant coalesces;
   keep the final `.map` return's `?? 0` for TS `Map.get` type-narrowing. Cover with a
   test that an activity referencing an unlisted envelope id does not affect any listed
   balance.
7. **Expanded-state month leak.** `renderMonth` resets `expandedPeriods` and
   `statusExpanded` when the selected month changes, so index-keyed expand/collapse
   state does not bleed across months.

## 3. Deferred test coverage (Phase A)

Add the carried missing cases plus one test per §2 fix:
- `data-envelopes`/`data-bills` `get()`/`rename()` missing-id paths.
- Multi-source `'in'` counterparty array in `computeEnvelopeHistory`.
- Proportional residual branch(es) in allocation/`split`.
- `computeMonth` `billCount` assertion (re-add).
- `Activities.listForMonth`/`listForPeriod` multi-record filtering (re-add dropped test).

## 4. Data portability — export / import / reset (Phase B)

### `validateDump(dump)` — pure, in `db.js` (or a sibling `data-portability` helper), unit-testable
Validate **before** any write; on any failure throw a typed error and leave local data
untouched. Checks:
- `dump.version === DB_VERSION` (currently `2`). Unknown/absent version → reject.
- Each expected store key (`envelopes`, `months`, `billSeries`, `billOccurrences`,
  `activities`) is present and an array.
- Every record has a string `id`.
- Every activity's `periodIndex` is an integer in range for its month's period count
  (uses `periodsForMonthKey(monthKey)`), matching the §2.1 compute guard.

### `db.importDB(dump)`
Call `validateDump` first. If valid: clear all object stores and bulk-put every record.
Replace, never merge (DAT-5). Prefer a single read-write transaction over all stores so a
mid-import failure cannot leave a partial dataset.

### UI wiring lives in Settings (§5). `exportDB`/`resetDB` already exist.

## 5. Settings modal build-out (Phase C) — kept as the `<dialog id="configModal">`

Structure (chosen: keep the modal, not a new page):
- **`src/ui/settings.js`** owns the config modal end to end: theme (moved out of `ui.js`),
  status rows, and the data section. `ui.js` keeps bottom-nav routing, `showPage`, and the
  `onEnvelopesShown` hook only.
- **`src/pwa.js`** — framework-free browser-API adapter, keeps browser APIs out of the
  domain. Exposes:
  - `installStatus()` → `'installed' | 'available' | 'unsupported'`; captures
    `beforeinstallprompt`; `promptInstall()` triggers the deferred prompt.
  - `persistentStorage()` → queries `navigator.storage.persisted()`; `requestPersist()`
    calls `navigator.storage.persist()`. `'unsupported'` when the API is absent.
  - `offlineReadiness()` → reports app-shell availability (SW controller/registration)
    and data-layer availability (db opens); a failure state exposes a concise retry.

### Settings sections
- **Appearance (SET-1):** existing three theme buttons. Behavior unchanged.
- **Installation (SET-2):** row shows *Installed* / *Installation available* + Install
  button / *Not supported in this browser*.
- **Persistent storage (SET-3):** *Granted* / *Not granted* + Request button /
  *Unsupported*. Denial does not block use.
- **Offline readiness (SET-4):** shell + data-layer status; concise failure/retry.
  Separate from any future sync status.
- **Data section (SET-5):**
  - **Export** (most prominent, least destructive): download the `exportDB()` JSON as a
    single versioned file, offline-capable.
  - **Import:** file picker → parse → `validateDump` → show a concise summary of what will
    be restored (per-store counts) → explicit confirm → `importDB` → reload the view.
    Invalid/unsupported files leave data untouched with a clear message.
  - **Reset:** clearly destructive; explicit confirm → `resetDB` → reload.

Every status is conveyed with **text + icon, never color alone** (UX-2).

## 6. Month-selector attention dots (Phase D — MTH-2 / PER-8)

In `openSelector()` (`src/ui/month.js`), for each listed month build its view via
`computeMonth({..., todayKey: isoToday()})` and render an attention dot on the list item
when `view.hasOpenFunds`. Semantics are already correct in `compute.js`: past months treat
all periods as completed; the current month only counts periods whose end date has passed;
the dot disappears when no completed period has a positive balance and can reappear after
later edits. The dot carries an accessible label (e.g. "open funds"), never color-only.
Fully derived; nothing stored.

## 7. Cosmetic tokens + responsive & a11y (Phase E — Task 17 minors + UX-1/2/3)

- Replace hardcoded px with `--sN` spacing tokens; fix the `.month-list` gap de-sync;
  remove dead `var()` fallback hexes that don't match `:root`.
- Desktop breakpoint: widen the container/cards; keep the existing bottom nav (no full
  sidebar rebuild — YAGNI). Add `focus-visible` outlines, ensure min touch-target sizing,
  confirm split-allocation exact-amount inputs are keyboard-usable and screen-reader
  labeled with source names + amounts. Scoped polish, not a redesign.

## 8. Testing strategy

- **Unit:** `validateDump` (valid / wrong-version / non-array store / missing `id` /
  out-of-range `periodIndex`); compute periodIndex bounds guard; conservation assertion;
  whole-month-expense `spent[]`; `removeProportional` guard; bill scope validation; plus
  all §3 gaps.
- **Integration (fake-indexeddb):** export → import round-trip preserves the full dataset
  (README invariant "import followed by export preserves the financial dataset"); reset
  wipes every store; import replaces rather than merges.
- **E2E (Playwright, thin):** one data-controls smoke (export download + import restore +
  reset clears) and attention-dot visible in the month selector. No duplication of
  integration coverage.

## 9. Plan phasing (for the SDD ledger)

Sequenced A→F; each phase reviewed per the existing per-task rhythm:

- **A** — deferred correctness fixes (§2) + carried test coverage (§3).
- **B** — `validateDump` + `importDB` + data-portability integration tests (§4).
- **C** — `src/pwa.js` + `src/ui/settings.js` status rows and data controls (§5).
- **D** — month-selector attention dots (§6).
- **E** — CSS token cleanup + responsive/a11y refinement (§7).
- **F** — E2E smoke (§8) + final whole-slice review and branch finish.

## 10. Out of scope

Multi-budget, DumbSync/sync status, conflict attribution (deferred epics FUT-1..3).
No new financial operations. No Settings-as-page rebuild. No desktop sidebar.
