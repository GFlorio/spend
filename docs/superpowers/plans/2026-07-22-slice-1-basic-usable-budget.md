# Slice 1 — Basic Usable Budget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A locally-usable budgeting PWA that answers *how much is left this month, which bills are unpaid, how much remains in each period, and how do I record an expense* — persisted in IndexedDB, calculated deterministically.

**Architecture:** Follows the `../diet/` reference: vanilla JS + JSDoc types (TypeScript-checked, no UI framework). Pure domain modules (`periods.js`, `compute.js`, `money.js`) hold all financial math and are unit-tested with no DB/DOM. A single storage boundary (`db.js`) wraps raw IndexedDB. Thin data-access modules (`data-*.js`) orchestrate storage + domain and are proven end-to-end by fast in-memory integration tests. Per-page UI setup functions render from the derived view. Playwright covers only browser-only smoke.

**Tech Stack:** Vite, vanilla ES2023 + JSDoc, raw IndexedDB, Vitest (jsdom) + `fake-indexeddb`, Playwright, Biome, mise.

## Global Constraints

- **Money is integer minor units (cents).** Never do financial math in floating point. Divide by 100 only when formatting for display. (README §Use integer money; design §6.9)
- **Periods are never persisted** — always derived from the month key. (README §Store facts, derive views)
- **Domain modules stay framework/DB free** — no DOM, no IndexedDB imports in `periods.js`, `compute.js`, `money.js`. (README §Keep framework code at the edges)
- **Every financial record has** `id`, `createdAt`, `updatedAt` (ms epoch). (README §DAT-7)
- **Saving an activity is one atomic `put`** — allocations are embedded in the activity record. (design §Make operations atomic)
- **Prefer `mise run <task>`** over raw commands. Each task ends green on `mise run full-lint` plus its tests.
- **TDD**: write the failing test first, watch it fail, implement minimally, watch it pass, commit.
- **Biome rules in force:** no `==`, `useAwait`, `useConst`, `useBlockStatements`, no unused vars/imports, no undeclared deps, `noFloatingPromises`. Use `void promise` or `await` for promises.
- **Branch:** do all work on a feature branch (not `master`).

## Testing layers (where each test belongs)

- **Unit** `src/**/*.test.js` — pure domain, no DB/DOM. Exhaustive edge coverage.
- **Integration** `src/**/*.integration.js` — real `db.js` + `data-*.js` + `compute.js` against `fake-indexeddb`. Primary place to prove whole-system behavior. Runs inside `mise run test-unit`.
- **E2E** `tests-e2e/*.spec.js` — only browser-only concerns (rendered DOM, reload persistence). A few smoke flows; never duplicate integration coverage.

## File structure

```
frontend/
  .mise.toml is at repo root
  index.html                      # shell + Month page markup + dialogs
  vite.config.js                  # de-dieted; PWA + vitest config
  sw.js                           # minimal precache SW
  src/
    main.js                       # boot: pick initial month, wire UI
    utils.js                      # $ DOM helpers, showPage, now/randomUUID/isoToday
    money.js                      # formatMoney, parseMoney            (pure)
    periods.js                    # generatePeriods, allocate, periodsForMonthKey (pure)
    compute.js                    # computeMonth                       (pure)
    db.js                         # raw IndexedDB wrapper + __testDB
    data-months.js                # Months
    data-bills.js                 # Bills
    data-activities.js            # Activities
    data.js                       # aggregate re-exports + typedefs
    styles.css                    # design tokens + layout
    ui/
      ui.js                       # nav shell, page routing, theme
      month.js                    # Month screen render + interactions
    tests/
      money.test.js
      periods.test.js
      compute.test.js
      integration/
        setup.js                  # fake-indexeddb + navigator stub
        helpers.js                # resetTestDB + factories
        months.integration.js
        bills.integration.js
        activities.integration.js
        month-flow.integration.js # whole-system flow
        export.integration.js
  tests-e2e/
    playwright-helpers.js
    setup-and-expense.spec.js
    persistence.spec.js
```

---

## Task 1: Scaffold cleanup and booting shell

Strip diet remnants from the copied config, add mise tasks and the test dep, and stand up an empty-but-booting app.

**Files:**
- Create: `.mise.toml` (repo root)
- Modify: `frontend/vite.config.js` (rename app to Spend, fix manifest, drop `/diet/` base)
- Modify: `frontend/sw.js` (minimal precache only)
- Modify: `frontend/index.html` (real nav + empty Month/Envelopes pages; keep Settings modal)
- Modify: `frontend/package.json` (add `fake-indexeddb` dev dep; drop `workbox-background-sync`)
- Create: `frontend/src/main.js`, `frontend/src/styles.css` (minimal)

**Interfaces:**
- Produces: `mise` task set; booting app served by Vite; empty Vitest run passes.

- [ ] **Step 1: Create `.mise.toml`** (repo root)

```toml
[tools]
node = "24"

[env]
_.path = ["{{config_root}}/node_modules/.bin", "{{config_root}}/frontend/node_modules/.bin"]

[tasks.bootstrap]
run = ["npm ci", "cd frontend && npx playwright install --with-deps"]

[tasks.dev]
description = "Start Vite dev server"
run = "cd frontend && npm run dev -- --host"

[tasks.build]
description = "Build for production"
run = "npm --workspace frontend run build"

[tasks.preview]
description = "Preview the production build"
run = "cd frontend && npm run preview -- --host"

[tasks.lint]
description = "Biome linter"
run = "biome lint frontend/"

[tasks.lint-fix]
description = "Biome linter with auto-fix"
run = "biome lint --write frontend/"

[tasks.typecheck]
description = "TypeScript type check via JSDoc (no emit)"
run = "tsc -p frontend/jsconfig.json --noEmit"

[tasks.full-lint]
description = "Biome + TypeScript"
run = ["mise run lint-fix", "mise run typecheck"]

[tasks.test-unit]
description = "Vitest unit + integration (one-shot)"
run = "npm --workspace frontend run test"

[tasks.test-unit-watch]
description = "Vitest in watch mode"
run = "npm --workspace frontend run test:watch"

[tasks.test-unit-file]
description = "Single vitest file: mise run test-unit-file src/tests/foo.test.js"
run = "npm --workspace frontend run test -- {{arg(name='file')}}"

[tasks.e2e]
description = "Playwright E2E (headless)"
run = "npm --workspace frontend run e2e"

[tasks.e2e-ui]
description = "Playwright with interactive UI"
run = "npm --workspace frontend run e2e:ui"

[tasks.e2e-file]
description = "Single E2E file: mise run e2e-file tests-e2e/foo.spec.js"
run = "npm --workspace frontend run e2e -- {{arg(name='file')}}"

[tasks.test]
description = "Unit + E2E sequentially"
run = ["mise run test-unit", "mise run e2e"]
```

- [ ] **Step 2: Add the test dependency**

Run: `cd /home/gabriel/projetos/spend/frontend && npm install --save-dev fake-indexeddb`
Then remove `workbox-background-sync` from `frontend/package.json` devDependencies (unused after Step 4).
Run: `cd /home/gabriel/projetos/spend && npm install`
Expected: `node_modules` populated, `fake-indexeddb` present.

- [ ] **Step 3: De-diet `frontend/vite.config.js`** — replace the top constants and the whole `manifest` block:

```js
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = '/';

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      registerType: 'prompt',
      strategies: 'injectManifest',
      srcDir: '.',
      filename: 'sw.js',
      manifest: {
        name: 'Spend',
        short_name: 'Spend',
        start_url: base,
        scope: base,
        id: '/spend/',
        display: 'standalone',
        background_color: '#f7fafc',
        theme_color: '#f7fafc',
        description: 'Local-first household budgeting',
        icons: [
          { src: `${base}icons/app-icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/app-icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/maskable-192.png`, sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: `${base}icons/maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      includeAssets: ['/icons/*'],
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  build: { rollupOptions: { input: 'index.html' } },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{js,ts}', 'src/**/*.integration.{js,ts}'],
  },
});
```

Note: icons are copied from diet in Step 7; PWA correctness is finalized in Slice 3.

- [ ] **Step 4: Minimal `frontend/sw.js`** (drop the `/db/` + background-sync routes — no server here):

```js
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate } from 'workbox-strategies';

precacheAndRoute(self.__WB_MANIFEST);
clientsClaim();
cleanupOutdatedCaches();

registerRoute(
  ({ request, url }) => request.method === 'GET' && url.origin === self.location.origin,
  new StaleWhileRevalidate({ cacheName: 'spend-app' }),
);

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') { self.skipWaiting(); }
});
```

- [ ] **Step 5: Rewrite `frontend/index.html` body** — replace the whole `<body>` (keep `<head>` but change nothing except it already links `/src/styles.css` and `/src/main.js`). Replace the `.app` contents:

```html
<body>
<div class="app">
  <main>
    <section id="page-month" class="page">
      <button type="button" id="monthTitle" class="month-title" aria-haspopup="dialog"></button>
      <section id="statusCard" class="card status-card"></section>
      <section id="periods" class="periods"></section>
    </section>
    <section id="page-envelopes" class="page hidden">
      <p class="empty">Envelopes arrive in a later update.</p>
    </section>
  </main>

  <nav class="bottom-nav">
    <button type="button" class="tab active" data-page="month">Month</button>
    <button type="button" class="tab" data-page="envelopes">Envelopes</button>
    <button type="button" id="configBtn" class="tab" aria-label="Settings">Settings</button>
  </nav>

  <dialog id="configModal" aria-label="Settings">
    <div class="config-inner">
      <div class="config-header">
        <span class="config-title">Settings</span>
        <button type="button" class="btn ghost" id="configModalClose" aria-label="Close settings">✕</button>
      </div>
      <div class="config-section">
        <div class="config-label">Theme</div>
        <div class="config-theme-row">
          <button type="button" class="btn config-theme-btn" data-theme="auto">Auto</button>
          <button type="button" class="btn config-theme-btn" data-theme="light">Light</button>
          <button type="button" class="btn config-theme-btn" data-theme="dark">Dark</button>
        </div>
      </div>
      <p class="config-note">Data controls and app-health status arrive in a later update.</p>
    </div>
  </dialog>

  <dialog id="monthSelectSheet" aria-label="Select month">
    <div class="sheet-inner">
      <div class="sheet-header"><span>Months</span>
        <button type="button" class="btn ghost" id="monthSelectClose" aria-label="Close">✕</button></div>
      <ul id="monthList" class="month-list"></ul>
      <button type="button" class="btn primary" id="startMonthBtn">Start another month</button>
    </div>
  </dialog>

  <dialog id="monthSetupDialog" aria-label="Set up month">
    <form id="monthSetupForm" class="sheet-inner" method="dialog">
      <div class="sheet-header"><span id="monthSetupTitle">New month</span>
        <button type="button" class="btn ghost" id="monthSetupClose" aria-label="Close">✕</button></div>
      <label class="field"><span>Available this month</span>
        <input type="text" inputmode="decimal" id="monthSetupAmount" required autocomplete="off"></label>
      <label class="field copy-field hidden" id="monthSetupCopyField">
        <input type="checkbox" id="monthSetupCopy" checked>
        <span id="monthSetupCopyLabel">Copy bills</span></label>
      <button type="submit" class="btn primary">Create month</button>
    </form>
  </dialog>

  <dialog id="activityDialog" aria-label="Add expense">
    <form id="activityForm" class="sheet-inner" method="dialog">
      <div class="sheet-header"><span id="activityTitle">Add expense</span>
        <button type="button" class="btn ghost" id="activityClose" aria-label="Close">✕</button></div>
      <label class="field"><span>Amount</span>
        <input type="text" inputmode="decimal" id="activityAmount" required autocomplete="off"></label>
      <label class="field"><span>Description (optional)</span>
        <input type="text" id="activityDescription" autocomplete="off"></label>
      <p class="activity-source" id="activitySource"></p>
      <button type="submit" class="btn primary">Save</button>
    </form>
  </dialog>
</div>
<script type="module" src="/src/main.js"></script>
</body>
```

- [ ] **Step 6: Minimal `frontend/src/styles.css`** (tokens filled out in Task 12; enough to render now):

```css
:root { color-scheme: light dark; font-family: system-ui, sans-serif; }
.hidden { display: none !important; }
.app { max-width: 640px; margin: 0 auto; padding: 16px 16px 80px; }
.bottom-nav { position: fixed; inset: auto 0 0 0; display: flex; gap: 8px; padding: 8px; background: Canvas; border-top: 1px solid; }
.tab { flex: 1; min-height: 44px; }
.empty { opacity: 0.6; text-align: center; padding: 32px; }
```

- [ ] **Step 7: Copy PWA icons from diet** (so the manifest resolves):

Run: `mkdir -p /home/gabriel/projetos/spend/frontend/public && cp -r /home/gabriel/projetos/diet/frontend/public/icons /home/gabriel/projetos/spend/frontend/public/icons`

- [ ] **Step 8: Minimal `frontend/src/main.js`** (temporary boot; replaced in Task 11):

```js
document.querySelector('#monthTitle').textContent = 'Spend';
```

- [ ] **Step 9: Verify the app boots**

Run: `cd /home/gabriel/projetos/spend && mise run dev`
Expected: Vite serves at `http://localhost:5173`; page shows "Spend" and the bottom nav; no console errors. Stop the server (Ctrl-C).

- [ ] **Step 10: Verify tooling is green**

Run: `mise run full-lint`
Expected: Biome + tsc pass (no `src` type errors yet).
Run: `mise run test-unit`
Expected: Vitest reports "no test files found" and exits 0 (acceptable at this stage).

- [ ] **Step 11: Commit**

```bash
cd /home/gabriel/projetos/spend
git checkout -b slice-1-basic-budget
git add -A
git commit -m "chore: scaffold Spend app shell (de-diet config, mise tasks, booting page)"
```

---

## Task 2: Money formatting and parsing (pure)

**Files:**
- Create: `frontend/src/money.js`
- Test: `frontend/src/tests/money.test.js`

**Interfaces:**
- Produces: `formatMoney(minor: number, locale?: string) => string`; `parseMoney(str: string) => number | null` (integer minor units, or null when invalid).

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/money.test.js`:

```js
import { describe, expect, test } from 'vitest';
import { formatMoney, parseMoney } from '../money.js';

describe('formatMoney', () => {
  test('formats whole and fractional amounts with grouping (en-US)', () => {
    expect(formatMoney(184200, 'en-US')).toBe('$1,842.00');
    expect(formatMoney(1050, 'en-US')).toBe('$10.50');
    expect(formatMoney(0, 'en-US')).toBe('$0.00');
  });
  test('formats negatives with a leading minus', () => {
    expect(formatMoney(-12000, 'en-US')).toBe('-$120.00');
  });
});

describe('parseMoney', () => {
  test('parses integers, decimals, grouping, and currency symbols to cents', () => {
    expect(parseMoney('1842')).toBe(184200);
    expect(parseMoney('1,842.50')).toBe(184250);
    expect(parseMoney('$10.5')).toBe(1050);
  });
  test('returns null for blank or non-numeric input', () => {
    expect(parseMoney('')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1.2.3')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mise run test-unit-file src/tests/money.test.js`
Expected: FAIL — cannot resolve `../money.js`.

- [ ] **Step 3: Implement `frontend/src/money.js`**

```js
const MINOR_UNITS = 100;

/**
 * Formats integer minor units as a generic `$` amount using locale separators.
 * @param {number} minor integer minor units
 * @param {string} [locale] optional BCP-47 locale; defaults to device locale
 * @returns {string}
 */
export function formatMoney(minor, locale) {
  const abs = Math.abs(minor) / MINOR_UNITS;
  const body = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: 'never',
  }).format(abs);
  return `${minor < 0 ? '-' : ''}$${body}`;
}

/**
 * Parses a user-entered amount to integer minor units.
 * @param {string} str
 * @returns {number|null} integer minor units, or null when the input is not a valid amount
 */
export function parseMoney(str) {
  if (typeof str !== 'string') { return null; }
  const cleaned = str.trim().replace(/[$\s]/g, '').replace(/,/g, '');
  if (cleaned === '' || !/^-?\d*\.?\d+$/.test(cleaned)) { return null; }
  const value = Number(cleaned);
  if (!Number.isFinite(value)) { return null; }
  return Math.round(value * MINOR_UNITS);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mise run test-unit-file src/tests/money.test.js`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/money.js frontend/src/tests/money.test.js
git commit -m "feat: integer-minor-unit money formatting and parsing"
```

---

## Task 3: Period generation (pure)

**Files:**
- Create: `frontend/src/periods.js`
- Test: `frontend/src/tests/periods.test.js`

**Interfaces:**
- Produces: `Period = { index:number, startDay:number, endDay:number, days:number }`; `generatePeriods(year:number, monthIndex0:number) => Period[]`; `periodsForMonthKey(monthKey:string) => Period[]` (monthKey `"YYYY-MM"`).

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/periods.test.js`:

```js
import { describe, expect, test } from 'vitest';
import { generatePeriods, periodsForMonthKey } from '../periods.js';

describe('generatePeriods', () => {
  test('31-day month has 5 periods, last is 29-31 (3 days)', () => {
    const p = generatePeriods(2026, 6); // July 2026
    expect(p.map((x) => [x.startDay, x.endDay, x.days])).toEqual([
      [1, 7, 7], [8, 14, 7], [15, 21, 7], [22, 28, 7], [29, 31, 3],
    ]);
    expect(p.map((x) => x.index)).toEqual([0, 1, 2, 3, 4]);
  });
  test('30-day month last period is 29-30 (2 days)', () => {
    expect(generatePeriods(2026, 3).at(-1)).toMatchObject({ startDay: 29, endDay: 30, days: 2 });
  });
  test('non-leap February (28 days) omits the fifth period', () => {
    const p = generatePeriods(2026, 1);
    expect(p).toHaveLength(4);
    expect(p.at(-1)).toMatchObject({ startDay: 22, endDay: 28, days: 7 });
  });
  test('leap February (29 days) keeps a 1-day fifth period', () => {
    const p = generatePeriods(2024, 1);
    expect(p).toHaveLength(5);
    expect(p.at(-1)).toMatchObject({ startDay: 29, endDay: 29, days: 1 });
  });
  test('total days always equals the month length', () => {
    for (const [y, m, len] of [[2026, 6, 31], [2026, 3, 30], [2026, 1, 28], [2024, 1, 29]]) {
      expect(generatePeriods(y, m).reduce((s, p) => s + p.days, 0)).toBe(len);
    }
  });
});

describe('periodsForMonthKey', () => {
  test('parses YYYY-MM', () => {
    expect(periodsForMonthKey('2026-07')).toEqual(generatePeriods(2026, 6));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mise run test-unit-file src/tests/periods.test.js`
Expected: FAIL — cannot resolve `../periods.js`.

- [ ] **Step 3: Implement `frontend/src/periods.js`** (leave `allocate` for Task 4):

```js
/**
 * @typedef {{ index:number, startDay:number, endDay:number, days:number }} Period
 */

const BOUNDARIES = [1, 8, 15, 22, 29];

/**
 * Generates the fixed 7-day spending periods for a month.
 * The fifth period (29-end) is omitted when the month ends on the 28th.
 * @param {number} year
 * @param {number} monthIndex0 zero-based month (0 = January)
 * @returns {Period[]}
 */
export function generatePeriods(year, monthIndex0) {
  const lastDay = new Date(year, monthIndex0 + 1, 0).getDate();
  /** @type {Period[]} */
  const periods = [];
  for (let i = 0; i < BOUNDARIES.length; i++) {
    const startDay = BOUNDARIES[i];
    if (startDay > lastDay) { break; }
    const nextBoundary = BOUNDARIES[i + 1];
    const endDay = nextBoundary === undefined ? lastDay : Math.min(nextBoundary - 1, lastDay);
    periods.push({ index: periods.length, startDay, endDay, days: endDay - startDay + 1 });
  }
  return periods;
}

/**
 * @param {string} monthKey "YYYY-MM"
 * @returns {Period[]}
 */
export function periodsForMonthKey(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  return generatePeriods(year, month - 1);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mise run test-unit-file src/tests/periods.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/periods.js frontend/src/tests/periods.test.js
git commit -m "feat: fixed seven-day period generation"
```

---

## Task 4: Proportional allocation (pure)

**Files:**
- Modify: `frontend/src/periods.js` (add `allocate`)
- Test: `frontend/src/tests/periods.test.js` (append)

**Interfaces:**
- Consumes: `Period` from Task 3.
- Produces: `allocate(pool:number, periods:Period[]) => number[]` — integer minor units per period, proportional to days, residual assigned to the last period, summing exactly to `pool`.

- [ ] **Step 1: Append the failing test** to `frontend/src/tests/periods.test.js`:

```js
import { allocate } from '../periods.js';

describe('allocate', () => {
  const july = generatePeriods(2026, 6); // days [7,7,7,7,3], total 31

  test('allocations always sum exactly to the pool', () => {
    for (const pool of [60000, 100000, 1, 99999, 300000]) {
      expect(allocate(pool, july).reduce((s, a) => s + a, 0)).toBe(pool);
    }
  });
  test('residual lands on the last period', () => {
    // floor(60000*7/31)=13548 x4 = 54192; floor(60000*3/31)=5806; residual 2 -> last 5808
    expect(allocate(60000, july)).toEqual([13548, 13548, 13548, 13548, 5808]);
  });
  test('handles a negative pool deterministically and still sums to pool', () => {
    const result = allocate(-5000, july);
    expect(result.reduce((s, a) => s + a, 0)).toBe(-5000);
  });
  test('is deterministic (idempotent)', () => {
    expect(allocate(12345, july)).toEqual(allocate(12345, july));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mise run test-unit-file src/tests/periods.test.js`
Expected: FAIL — `allocate` is not exported.

- [ ] **Step 3: Append `allocate` to `frontend/src/periods.js`**

```js
/**
 * Distributes an integer pool across periods proportionally by day count.
 * Uses floor per period and assigns the whole residual to the last period,
 * so the result always sums exactly to `pool`. Deterministic; handles negatives.
 * @param {number} pool integer minor units (may be negative)
 * @param {Period[]} periods non-empty
 * @returns {number[]}
 */
export function allocate(pool, periods) {
  if (periods.length === 0) { throw new Error('allocate: periods must be non-empty'); }
  const totalDays = periods.reduce((sum, p) => sum + p.days, 0);
  const alloc = periods.map((p) => Math.floor((pool * p.days) / totalDays));
  const residual = pool - alloc.reduce((sum, a) => sum + a, 0);
  alloc[alloc.length - 1] += residual;
  return alloc;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mise run test-unit-file src/tests/periods.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/periods.js frontend/src/tests/periods.test.js
git commit -m "feat: deterministic proportional period allocation"
```

---

## Task 5: Monthly derived view (pure)

**Files:**
- Create: `frontend/src/compute.js`
- Test: `frontend/src/tests/compute.test.js`

**Interfaces:**
- Consumes: `periodsForMonthKey`, `allocate` from Task 3/4.
- Produces:
  - `BillInput = { paid:boolean, actual:number|null, expected:number }`
  - `ActivityInput = { periodIndex:number, amount:number, destination:'spent' }`
  - `PeriodView = Period & { allocation:number, spent:number, remaining:number }`
  - `MonthView = { available:number, billsReserved:number, paidCount:number, billCount:number, spendingPool:number, safeToSpend:number, periods:PeriodView[] }`
  - `computeMonth({ monthKey:string, available:number, bills:BillInput[], activities:ActivityInput[] }) => MonthView`

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/compute.test.js`:

```js
import { describe, expect, test } from 'vitest';
import { computeMonth } from '../compute.js';

const base = { monthKey: '2026-07', available: 300000, bills: [], activities: [] };

describe('computeMonth', () => {
  test('reserves expected for unpaid bills and actual for paid bills', () => {
    const view = computeMonth({
      ...base,
      bills: [
        { paid: true, actual: 120000, expected: 118000 },
        { paid: false, actual: null, expected: 8000 },
      ],
    });
    expect(view.billsReserved).toBe(128000);
    expect(view.paidCount).toBe(1);
    expect(view.billCount).toBe(2);
    expect(view.spendingPool).toBe(172000);
    expect(view.safeToSpend).toBe(172000);
  });

  test('period allocations sum to the spending pool', () => {
    const view = computeMonth({ ...base, bills: [{ paid: false, actual: null, expected: 100000 }] });
    expect(view.periods.reduce((s, p) => s + p.allocation, 0)).toBe(view.spendingPool);
  });

  test('expenses reduce the originating period and safe-to-spend', () => {
    const view = computeMonth({
      ...base,
      activities: [
        { periodIndex: 2, amount: 5000, destination: 'spent' },
        { periodIndex: 2, amount: 1500, destination: 'spent' },
      ],
    });
    expect(view.periods[2].spent).toBe(6500);
    expect(view.periods[2].remaining).toBe(view.periods[2].allocation - 6500);
    expect(view.safeToSpend).toBe(300000 - 6500);
  });

  test('safe-to-spend equals the sum of period remaining when there is no carry', () => {
    const view = computeMonth({
      ...base,
      bills: [{ paid: false, actual: null, expected: 40000 }],
      activities: [{ periodIndex: 0, amount: 3000, destination: 'spent' }],
    });
    expect(view.safeToSpend).toBe(view.periods.reduce((s, p) => s + p.remaining, 0));
  });

  test('is idempotent for identical inputs', () => {
    const input = { ...base, bills: [{ paid: true, actual: 9999, expected: 9000 }] };
    expect(computeMonth(input)).toEqual(computeMonth(input));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: FAIL — cannot resolve `../compute.js`.

- [ ] **Step 3: Implement `frontend/src/compute.js`**

```js
import { allocate, periodsForMonthKey } from './periods.js';

/**
 * @typedef {import('./periods.js').Period} Period
 * @typedef {{ paid:boolean, actual:number|null, expected:number }} BillInput
 * @typedef {{ periodIndex:number, amount:number, destination:'spent' }} ActivityInput
 * @typedef {Period & { allocation:number, spent:number, remaining:number }} PeriodView
 * @typedef {{
 *   available:number, billsReserved:number, paidCount:number, billCount:number,
 *   spendingPool:number, safeToSpend:number, periods:PeriodView[]
 * }} MonthView
 */

/**
 * Derives the monthly view from primary records. Pure; no carry in Slice 1.
 * @param {{ monthKey:string, available:number, bills:BillInput[], activities:ActivityInput[] }} input
 * @returns {MonthView}
 */
export function computeMonth({ monthKey, available, bills, activities }) {
  const billsReserved = bills.reduce((sum, b) => sum + (b.paid ? (b.actual ?? 0) : b.expected), 0);
  const paidCount = bills.filter((b) => b.paid).length;
  const spendingPool = available - billsReserved;

  const periods = periodsForMonthKey(monthKey);
  const allocations = allocate(spendingPool, periods);
  const spentByPeriod = periods.map(() => 0);
  let totalExpenses = 0;
  for (const a of activities) {
    if (a.destination === 'spent') {
      spentByPeriod[a.periodIndex] += a.amount;
      totalExpenses += a.amount;
    }
  }

  const periodViews = periods.map((p, i) => ({
    ...p,
    allocation: allocations[i],
    spent: spentByPeriod[i],
    remaining: allocations[i] - spentByPeriod[i],
  }));

  return {
    available,
    billsReserved,
    paidCount,
    billCount: bills.length,
    spendingPool,
    safeToSpend: available - billsReserved - totalExpenses,
    periods: periodViews,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mise run test-unit-file src/tests/compute.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/compute.js frontend/src/tests/compute.test.js
git commit -m "feat: derive monthly view (reserved bills, pool, period balances, safe-to-spend)"
```

---

## Task 6: Storage boundary + integration harness

Raw IndexedDB wrapper plus the shared integration setup, proven by a round-trip test.

**Files:**
- Create: `frontend/src/db.js`
- Create: `frontend/src/utils.js` (only the non-DOM helpers needed now; DOM helpers added in Task 11)
- Create: `frontend/src/tests/integration/setup.js`
- Create: `frontend/src/tests/integration/helpers.js`
- Create: `frontend/src/tests/integration/export.integration.js`

**Interfaces:**
- Produces (`db.js`): `get(store,key)`, `getAll(store)`, `getAllByIndex(store,index,key)`, `put(store,val)=>id`, `del(store,key)`, `resetDB()`, `exportDB()`. Stores: `months`, `billSeries`, `billOccurrences` (indexes `by_month`, `by_series`), `activities` (index `by_month`).
- Produces (`utils.js`): `now()=>number`, `randomUUID()=>string`, `isoToday()=>string`.
- Produces (`helpers.js`): `resetTestDB()`, `createMonth`, `addBill`, `payBill`, `addExpense`.

- [ ] **Step 1: Create `frontend/src/utils.js`** (non-DOM helpers; more added in Task 11):

```js
/** @returns {number} current epoch milliseconds */
export const now = () => Date.now();

/** @returns {string} a random UUID */
export const randomUUID = () => crypto.randomUUID();

/** @returns {string} today's local date as YYYY-MM-DD */
export function isoToday() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
```

- [ ] **Step 2: Create `frontend/src/db.js`**

```js
/**
 * Single storage boundary over raw IndexedDB.
 * @typedef {import('./data.js').BudgetMonth} BudgetMonth
 */

const DB_NAME = 'spend';
const DB_VERSION = 1;

/** store name -> index definitions [indexName, keyPath] */
const STORES = {
  months: [],
  billSeries: [],
  billOccurrences: [['by_month', 'monthKey'], ['by_series', 'seriesId']],
  activities: [['by_month', 'monthKey']],
};

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

function openDB() {
  if (dbPromise) { return dbPromise; }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const database = req.result;
      for (const [name, indexes] of Object.entries(STORES)) {
        if (database.objectStoreNames.contains(name)) { continue; }
        const store = database.createObjectStore(name, { keyPath: 'id' });
        for (const [indexName, keyPath] of indexes) { store.createIndex(indexName, keyPath); }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * @param {IDBRequest} req
 * @returns {Promise<any>}
 */
function toPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} store
 * @param {IDBTransactionMode} mode
 * @returns {Promise<IDBObjectStore>}
 */
async function objectStore(store, mode) {
  const database = await openDB();
  return database.transaction(store, mode).objectStore(store);
}

/**
 * @param {keyof STORES & string} store
 * @param {IDBValidKey} key
 * @returns {Promise<any>}
 */
export async function get(store, key) {
  return toPromise((await objectStore(store, 'readonly')).get(key));
}

/**
 * @param {string} store
 * @returns {Promise<any[]>}
 */
export async function getAll(store) {
  return toPromise((await objectStore(store, 'readonly')).getAll());
}

/**
 * @param {string} store
 * @param {string} index
 * @param {IDBValidKey} key
 * @returns {Promise<any[]>}
 */
export async function getAllByIndex(store, index, key) {
  return toPromise((await objectStore(store, 'readonly')).index(index).getAll(key));
}

/**
 * @param {string} store
 * @param {{ id:string }} val record with a string id
 * @returns {Promise<string>} the record id
 */
export async function put(store, val) {
  await toPromise((await objectStore(store, 'readwrite')).put(val));
  return val.id;
}

/**
 * @param {string} store
 * @param {IDBValidKey} key
 * @returns {Promise<void>}
 */
export async function del(store, key) {
  await toPromise((await objectStore(store, 'readwrite')).delete(key));
}

/** Closes and deletes the database. @returns {Promise<void>} */
export async function resetDB() {
  if (dbPromise) { (await dbPromise).close(); dbPromise = null; }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve(undefined);
  });
}

/**
 * Serialises every store. Import is added in Slice 3.
 * @returns {Promise<{version:number, exportedAt:string, months:any[], billSeries:any[], billOccurrences:any[], activities:any[]}>}
 */
export async function exportDB() {
  const [months, billSeries, billOccurrences, activities] = await Promise.all([
    getAll('months'), getAll('billSeries'), getAll('billOccurrences'), getAll('activities'),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), months, billSeries, billOccurrences, activities };
}

// Test seam for E2E: seed IndexedDB without the UI.
if (typeof window !== 'undefined') {
  /** @type {any} */ (window).__testDB = { reset: resetDB, put, getAll };
}
```

- [ ] **Step 3: Create `frontend/src/tests/integration/setup.js`**

```js
// Registers a global `indexedDB` / `IDBKeyRange` backed by an in-memory store,
// so the real db.js runs under Vitest + jsdom with no browser.
import 'fake-indexeddb/auto';

if (!globalThis.navigator.storage) {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: { persist: () => Promise.resolve(true), persisted: () => Promise.resolve(true) },
    writable: true,
  });
}
```

- [ ] **Step 4: Create `frontend/src/tests/integration/helpers.js`** (factories reference data modules built in Tasks 7-9; imports resolve once those exist — build order is Task 6 harness first, then 7-9, then the flow test in Task 10 exercises them):

```js
import * as db from '../../db.js';
import { Activities, Bills, Months } from '../../data.js';

/** Wipe the in-memory database between tests. */
export async function resetTestDB() {
  await db.resetDB();
}

/** @param {string} monthKey @param {number} available @param {{copyFromKey?:string}} [opts] */
export async function createMonth(monthKey, available, opts = {}) {
  return Months.create({ monthKey, available, ...opts });
}

/** @param {string} monthKey @param {string} name @param {number} expected */
export async function addBill(monthKey, name, expected) {
  return Bills.create({ monthKey, name, expected });
}

/** @param {string} occId */
export async function payBill(occId) {
  return Bills.markPaid(occId);
}

/** @param {string} monthKey @param {number} periodIndex @param {number} amount @param {string} [description] */
export async function addExpense(monthKey, periodIndex, amount, description = '') {
  return Activities.createExpense({ monthKey, periodIndex, amount, description });
}
```

- [ ] **Step 5: Write the failing integration test** — `frontend/src/tests/integration/export.integration.js` (proves the wrapper + setup work before the data modules exist):

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { resetTestDB } from './helpers.js';

beforeEach(resetTestDB);

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

  test('exportDB serialises every store', async () => {
    await db.put('months', { id: 'month:2026-07', monthKey: '2026-07', available: 1 });
    const dump = await db.exportDB();
    expect(dump.version).toBe(1);
    expect(dump.months).toHaveLength(1);
    expect(dump.activities).toEqual([]);
  });
});
```

Note: this file imports `./helpers.js`, which imports `../../data.js` (Task 10). To keep Task 6 self-contained and green, temporarily import only `db` in this test and `resetTestDB` inline. Replace the import line with:

```js
import { beforeEach as _be } from 'vitest';
async function resetTestDB() { await db.resetDB(); }
```

and drop the `./helpers.js` import until Task 10. (The helpers/data files are created in Tasks 7-10; this keeps each task individually green.)

- [ ] **Step 6: Run test to verify it fails, then passes**

Run: `mise run test-unit-file src/tests/integration/export.integration.js`
Expected: first FAIL (db.js missing) → after Steps 1-2 exist, PASS.

- [ ] **Step 7: Verify lint/types**

Run: `mise run full-lint`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/db.js frontend/src/utils.js frontend/src/tests/integration/
git commit -m "feat: raw IndexedDB storage boundary + integration harness"
```

---

## Task 7: Months data module

**Files:**
- Create: `frontend/src/data-months.js`
- Test: `frontend/src/tests/integration/months.integration.js`

**Interfaces:**
- Consumes: `db`, `now`, `randomUUID`.
- Produces: `BudgetMonth = { id:string, monthKey:string, available:number, createdAt:number, updatedAt:number }`; `Months.list()=>BudgetMonth[]` (id-sorted), `Months.get(monthKey)=>BudgetMonth|undefined`, `Months.create({monthKey, available, copyFromKey?})=>BudgetMonth`, `Months.setAvailable(monthKey, available)=>BudgetMonth`.
- Copy semantics: clones each source-month occurrence's `expected` into a fresh unpaid occurrence for the new month; never copies paid/actual/paidDate/expenses.

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/integration/months.integration.js`:

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Bills } from '../../data-bills.js';
import { Months } from '../../data-months.js';

beforeEach(async () => { await db.resetDB(); });

describe('Months', () => {
  test('create persists a month and get/list find it', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    expect(await Months.get('2026-07')).toMatchObject({ monthKey: '2026-07', available: 300000 });
    expect(await Months.list()).toHaveLength(1);
  });

  test('list is sorted chronologically by id', async () => {
    await Months.create({ monthKey: '2026-08', available: 1 });
    await Months.create({ monthKey: '2026-07', available: 1 });
    expect((await Months.list()).map((m) => m.monthKey)).toEqual(['2026-07', '2026-08']);
  });

  test('setAvailable updates only the amount', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const updated = await Months.setAvailable('2026-07', 250000);
    expect(updated.available).toBe(250000);
    expect((await Months.get('2026-07'))?.available).toBe(250000);
  });

  test('copyFromKey clones expected values only, not payments', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 120000 });
    await Bills.markPaid(occ.id);

    await Months.create({ monthKey: '2026-08', available: 300000, copyFromKey: '2026-07' });
    const augBills = await Bills.listForMonth('2026-08');
    expect(augBills).toHaveLength(1);
    expect(augBills[0]).toMatchObject({ name: 'Rent', expected: 120000, paid: false, actual: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mise run test-unit-file src/tests/integration/months.integration.js`
Expected: FAIL — `../../data-months.js` (and `data-bills.js`) missing. (data-bills is built in Task 8; run this test again after Task 8. For Task 7 alone, temporarily comment the copy test.)

- [ ] **Step 3: Implement `frontend/src/data-months.js`**

```js
import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ id:string, monthKey:string, available:number, createdAt:number, updatedAt:number }} BudgetMonth
 */

/** @param {string} monthKey */
const monthId = (monthKey) => `month:${monthKey}`;

/**
 * Clones the source month's occurrences into fresh unpaid occurrences.
 * @param {string} fromKey @param {string} toKey @param {number} timestamp
 */
async function copyBills(fromKey, toKey, timestamp) {
  const occurrences = await db.getAllByIndex('billOccurrences', 'by_month', fromKey);
  for (const source of occurrences) {
    await db.put('billOccurrences', {
      id: `occ:${randomUUID()}`,
      seriesId: source.seriesId,
      monthKey: toKey,
      expected: source.expected,
      paid: false,
      actual: null,
      paidDate: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }
}

export const Months = {
  /** @returns {Promise<BudgetMonth[]>} */
  async list() {
    const all = await db.getAll('months');
    return all.sort((a, b) => a.id.localeCompare(b.id));
  },
  /** @param {string} monthKey @returns {Promise<BudgetMonth|undefined>} */
  async get(monthKey) {
    return db.get('months', monthId(monthKey));
  },
  /**
   * @param {{ monthKey:string, available:number, copyFromKey?:string|null }} opts
   * @returns {Promise<BudgetMonth>}
   */
  async create({ monthKey, available, copyFromKey = null }) {
    const timestamp = now();
    /** @type {BudgetMonth} */
    const month = { id: monthId(monthKey), monthKey, available, createdAt: timestamp, updatedAt: timestamp };
    await db.put('months', month);
    if (copyFromKey) { await copyBills(copyFromKey, monthKey, timestamp); }
    return month;
  },
  /** @param {string} monthKey @param {number} available @returns {Promise<BudgetMonth>} */
  async setAvailable(monthKey, available) {
    const month = await db.get('months', monthId(monthKey));
    if (!month) { throw new Error(`Month ${monthKey} not found`); }
    const next = { ...month, available, updatedAt: now() };
    await db.put('months', next);
    return next;
  },
};
```

- [ ] **Step 4: Run test to verify it passes** (after Task 8 exists, the copy test passes too)

Run: `mise run test-unit-file src/tests/integration/months.integration.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data-months.js frontend/src/tests/integration/months.integration.js
git commit -m "feat: Months data module (create, list, setAvailable, copy bills)"
```

---

## Task 8: Bills data module

**Files:**
- Create: `frontend/src/data-bills.js`
- Test: `frontend/src/tests/integration/bills.integration.js`

**Interfaces:**
- Consumes: `db`, `now`, `randomUUID`, `isoToday`.
- Produces:
  - `BillSeries = { id:string, name:string, createdAt:number, updatedAt:number }`
  - `BillOccurrence = { id:string, seriesId:string, monthKey:string, expected:number, paid:boolean, actual:number|null, paidDate:string|null, createdAt:number, updatedAt:number }`
  - `BillView = BillOccurrence & { name:string }`
  - `Bills.listForMonth(monthKey)=>BillView[]` (sorted by series creation)
  - `Bills.create({monthKey, name, expected})=>{series, occ}`
  - `Bills.markPaid(occId, paidDate?)=>BillOccurrence` (actual←expected, paidDate←today)
  - `Bills.markUnpaid(occId)=>BillOccurrence`
  - `Bills.setActual(occId, actual)=>BillOccurrence` (keeps paid)
  - `Bills.rename(seriesId, name)=>BillSeries` (affects all months)

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/integration/bills.integration.js`:

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Bills } from '../../data-bills.js';

beforeEach(async () => { await db.resetDB(); });

describe('Bills', () => {
  test('create makes a series + unpaid occurrence, listForMonth joins the name', async () => {
    await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 120000 });
    const bills = await Bills.listForMonth('2026-07');
    expect(bills).toHaveLength(1);
    expect(bills[0]).toMatchObject({ name: 'Rent', expected: 120000, paid: false, actual: null });
  });

  test('markPaid defaults actual to expected and stamps a date', async () => {
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    const paid = await Bills.markPaid(occ.id);
    expect(paid).toMatchObject({ paid: true, actual: 8000 });
    expect(paid.paidDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('setActual overrides the paid amount, markUnpaid clears it', async () => {
    const { occ } = await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    await Bills.markPaid(occ.id);
    expect((await Bills.setActual(occ.id, 9600)).actual).toBe(9600);
    const undone = await Bills.markUnpaid(occ.id);
    expect(undone).toMatchObject({ paid: false, actual: null, paidDate: null });
  });

  test('rename changes the name across every month', async () => {
    const { series } = await Bills.create({ monthKey: '2026-07', name: 'Powr', expected: 8000 });
    await Bills.create({ monthKey: '2026-08', name: 'Powr', expected: 8000 }); // unrelated series
    await Bills.rename(series.id, 'Electricity');
    const july = await Bills.listForMonth('2026-07');
    expect(july[0].name).toBe('Electricity');
  });

  test('listForMonth sorts by series creation order', async () => {
    await Bills.create({ monthKey: '2026-07', name: 'A', expected: 1 });
    await Bills.create({ monthKey: '2026-07', name: 'B', expected: 1 });
    expect((await Bills.listForMonth('2026-07')).map((b) => b.name)).toEqual(['A', 'B']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mise run test-unit-file src/tests/integration/bills.integration.js`
Expected: FAIL — `../../data-bills.js` missing.

- [ ] **Step 3: Implement `frontend/src/data-bills.js`**

```js
import * as db from './db.js';
import { isoToday, now, randomUUID } from './utils.js';

/**
 * @typedef {{ id:string, name:string, createdAt:number, updatedAt:number }} BillSeries
 * @typedef {{ id:string, seriesId:string, monthKey:string, expected:number, paid:boolean, actual:number|null, paidDate:string|null, createdAt:number, updatedAt:number }} BillOccurrence
 * @typedef {BillOccurrence & { name:string }} BillView
 */

/** @param {string} occId */
async function loadOccurrence(occId) {
  const occ = await db.get('billOccurrences', occId);
  if (!occ) { throw new Error(`Bill occurrence ${occId} not found`); }
  return occ;
}

export const Bills = {
  /** @param {string} monthKey @returns {Promise<BillView[]>} */
  async listForMonth(monthKey) {
    const [occurrences, series] = await Promise.all([
      db.getAllByIndex('billOccurrences', 'by_month', monthKey),
      db.getAll('billSeries'),
    ]);
    const byId = new Map(series.map((s) => [s.id, s]));
    return occurrences
      .map((occ) => ({ ...occ, name: byId.get(occ.seriesId)?.name ?? '(unknown)' }))
      .sort((a, b) => (byId.get(a.seriesId)?.createdAt ?? 0) - (byId.get(b.seriesId)?.createdAt ?? 0));
  },

  /**
   * @param {{ monthKey:string, name:string, expected:number }} opts
   * @returns {Promise<{ series:BillSeries, occ:BillOccurrence }>}
   */
  async create({ monthKey, name, expected }) {
    const timestamp = now();
    /** @type {BillSeries} */
    const series = { id: `series:${randomUUID()}`, name, createdAt: timestamp, updatedAt: timestamp };
    await db.put('billSeries', series);
    /** @type {BillOccurrence} */
    const occ = {
      id: `occ:${randomUUID()}`, seriesId: series.id, monthKey, expected,
      paid: false, actual: null, paidDate: null, createdAt: timestamp, updatedAt: timestamp,
    };
    await db.put('billOccurrences', occ);
    return { series, occ };
  },

  /** @param {string} occId @param {string} [paidDate] @returns {Promise<BillOccurrence>} */
  async markPaid(occId, paidDate) {
    const occ = await loadOccurrence(occId);
    const next = { ...occ, paid: true, actual: occ.expected, paidDate: paidDate ?? isoToday(), updatedAt: now() };
    await db.put('billOccurrences', next);
    return next;
  },

  /** @param {string} occId @returns {Promise<BillOccurrence>} */
  async markUnpaid(occId) {
    const occ = await loadOccurrence(occId);
    const next = { ...occ, paid: false, actual: null, paidDate: null, updatedAt: now() };
    await db.put('billOccurrences', next);
    return next;
  },

  /** @param {string} occId @param {number} actual @returns {Promise<BillOccurrence>} */
  async setActual(occId, actual) {
    const occ = await loadOccurrence(occId);
    const next = { ...occ, paid: true, actual, paidDate: occ.paidDate ?? isoToday(), updatedAt: now() };
    await db.put('billOccurrences', next);
    return next;
  },

  /** @param {string} seriesId @param {string} name @returns {Promise<BillSeries>} */
  async rename(seriesId, name) {
    const series = await db.get('billSeries', seriesId);
    if (!series) { throw new Error(`Bill series ${seriesId} not found`); }
    const next = { ...series, name, updatedAt: now() };
    await db.put('billSeries', next);
    return next;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mise run test-unit-file src/tests/integration/bills.integration.js`
Expected: PASS. Also re-run `months.integration.js` (copy test now green).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data-bills.js frontend/src/tests/integration/bills.integration.js
git commit -m "feat: Bills data module (create, pay/unpaid, actual, rename)"
```

---

## Task 9: Activities data module

**Files:**
- Create: `frontend/src/data-activities.js`
- Test: `frontend/src/tests/integration/activities.integration.js`

**Interfaces:**
- Consumes: `db`, `now`, `randomUUID`.
- Produces:
  - `Allocation = { source:{ type:'period', periodIndex:number }, amount:number }`
  - `Activity = { id:string, monthKey:string, periodIndex:number, destination:'spent', amount:number, description:string, allocations:Allocation[], createdAt:number, updatedAt:number }`
  - `Activities.listForMonth(monthKey)=>Activity[]` (id-sorted = chronological)
  - `Activities.listForPeriod(monthKey, periodIndex)=>Activity[]`
  - `Activities.createExpense({monthKey, periodIndex, amount, description?})=>Activity`

- [ ] **Step 1: Write the failing test** — `frontend/src/tests/integration/activities.integration.js`:

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import * as db from '../../db.js';
import { Activities } from '../../data-activities.js';

beforeEach(async () => { await db.resetDB(); });

describe('Activities', () => {
  test('createExpense writes one atomic record with an embedded period allocation', async () => {
    const activity = await Activities.createExpense({ monthKey: '2026-07', periodIndex: 2, amount: 5000, description: 'Lunch' });
    expect(activity).toMatchObject({ monthKey: '2026-07', periodIndex: 2, destination: 'spent', amount: 5000, description: 'Lunch' });
    expect(activity.allocations).toEqual([{ source: { type: 'period', periodIndex: 2 }, amount: 5000 }]);

    const stored = await db.get('activities', activity.id);
    expect(stored.allocations[0].amount).toBe(5000); // single record carries its allocation
  });

  test('listForMonth and listForPeriod filter correctly', async () => {
    await Activities.createExpense({ monthKey: '2026-07', periodIndex: 0, amount: 100 });
    await Activities.createExpense({ monthKey: '2026-07', periodIndex: 2, amount: 200 });
    await Activities.createExpense({ monthKey: '2026-08', periodIndex: 0, amount: 300 });

    expect(await Activities.listForMonth('2026-07')).toHaveLength(2);
    const p2 = await Activities.listForPeriod('2026-07', 2);
    expect(p2.map((a) => a.amount)).toEqual([200]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `mise run test-unit-file src/tests/integration/activities.integration.js`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement `frontend/src/data-activities.js`**

```js
import * as db from './db.js';
import { now, randomUUID } from './utils.js';

/**
 * @typedef {{ source:{ type:'period', periodIndex:number }, amount:number }} Allocation
 * @typedef {{ id:string, monthKey:string, periodIndex:number, destination:'spent', amount:number, description:string, allocations:Allocation[], createdAt:number, updatedAt:number }} Activity
 */

export const Activities = {
  /** @param {string} monthKey @returns {Promise<Activity[]>} */
  async listForMonth(monthKey) {
    const all = await db.getAllByIndex('activities', 'by_month', monthKey);
    return all.sort((a, b) => a.id.localeCompare(b.id));
  },

  /** @param {string} monthKey @param {number} periodIndex @returns {Promise<Activity[]>} */
  async listForPeriod(monthKey, periodIndex) {
    const all = await this.listForMonth(monthKey);
    return all.filter((a) => a.periodIndex === periodIndex);
  },

  /**
   * Records a single-source period expense as one atomic record.
   * @param {{ monthKey:string, periodIndex:number, amount:number, description?:string }} opts
   * @returns {Promise<Activity>}
   */
  async createExpense({ monthKey, periodIndex, amount, description = '' }) {
    const timestamp = now();
    /** @type {Activity} */
    const activity = {
      id: `act:${monthKey}:${String(timestamp).padStart(15, '0')}-${randomUUID().slice(0, 8)}`,
      monthKey,
      periodIndex,
      destination: 'spent',
      amount,
      description,
      allocations: [{ source: { type: 'period', periodIndex }, amount }],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await db.put('activities', activity);
    return activity;
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `mise run test-unit-file src/tests/integration/activities.integration.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/data-activities.js frontend/src/tests/integration/activities.integration.js
git commit -m "feat: Activities data module (single-source period expenses)"
```

---

## Task 10: Data aggregate + whole-system flow test

**Files:**
- Create: `frontend/src/data.js`
- Modify: `frontend/src/tests/integration/export.integration.js` (restore the real `helpers.js` import from Task 6 Step 5)
- Create: `frontend/src/tests/integration/month-flow.integration.js`

**Interfaces:**
- Consumes: `Months`, `Bills`, `Activities`, `computeMonth`.
- Produces: `data.js` re-exports `Months`, `Bills`, `Activities` and re-exports typedefs. This is the single import surface for UI.

- [ ] **Step 1: Create `frontend/src/data.js`**

```js
import { Activities } from './data-activities.js';
import { Bills } from './data-bills.js';
import { Months } from './data-months.js';

/**
 * @typedef {import('./data-months.js').BudgetMonth} BudgetMonth
 * @typedef {import('./data-bills.js').BillSeries} BillSeries
 * @typedef {import('./data-bills.js').BillOccurrence} BillOccurrence
 * @typedef {import('./data-bills.js').BillView} BillView
 * @typedef {import('./data-activities.js').Activity} Activity
 */

export { Months, Bills, Activities };
```

- [ ] **Step 2: Restore `helpers.js` usage** — in `export.integration.js`, replace the temporary inline `resetTestDB` (Task 6 Step 5 note) with `import { resetTestDB } from './helpers.js';` and `beforeEach(resetTestDB);`.

- [ ] **Step 3: Write the failing whole-system test** — `frontend/src/tests/integration/month-flow.integration.js`:

```js
import './setup.js';
import { beforeEach, describe, expect, test } from 'vitest';
import { computeMonth } from '../../compute.js';
import { Bills, Months } from '../../data.js';
import { addExpense, resetTestDB } from './helpers.js';

beforeEach(resetTestDB);

/** Rebuild the derived monthly view from stored records. */
async function viewFor(monthKey) {
  const month = await Months.get(monthKey);
  const bills = await Bills.listForMonth(monthKey);
  const activities = (await import('../../data.js')).Activities.listForMonth
    ? await (await import('../../data.js')).Activities.listForMonth(monthKey)
    : [];
  return computeMonth({
    monthKey,
    available: month.available,
    bills: bills.map((b) => ({ paid: b.paid, actual: b.actual, expected: b.expected })),
    activities: activities.map((a) => ({ periodIndex: a.periodIndex, amount: a.amount, destination: a.destination })),
  });
}

describe('whole-system month flow', () => {
  test('create month -> add bills -> pay one -> record expenses -> derived view is correct', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    const rent = await Bills.create({ monthKey: '2026-07', name: 'Rent', expected: 120000 });
    await Bills.create({ monthKey: '2026-07', name: 'Power', expected: 8000 });
    await Bills.markPaid(rent.occ.id); // actual = 120000

    await addExpense('2026-07', 2, 5000);
    await addExpense('2026-07', 2, 1500);

    const view = await viewFor('2026-07');
    expect(view.billsReserved).toBe(128000);      // 120000 paid actual + 8000 unpaid expected
    expect(view.paidCount).toBe(1);
    expect(view.billCount).toBe(2);
    expect(view.spendingPool).toBe(172000);
    expect(view.periods[2].spent).toBe(6500);
    expect(view.safeToSpend).toBe(300000 - 128000 - 6500); // 165500
    expect(view.periods.reduce((s, p) => s + p.allocation, 0)).toBe(view.spendingPool);
  });

  test('changing the monthly amount recalculates allocations', async () => {
    await Months.create({ monthKey: '2026-07', available: 300000 });
    await Months.setAvailable('2026-07', 155000);
    const view = await viewFor('2026-07');
    expect(view.spendingPool).toBe(155000);
    expect(view.periods.reduce((s, p) => s + p.allocation, 0)).toBe(155000);
  });
});
```

Simplify `viewFor` — replace the awkward dynamic import with a top import once confirmed:

```js
import { Activities, Bills, Months } from '../../data.js';
// ...
const activities = await Activities.listForMonth(monthKey);
```

- [ ] **Step 4: Run test to verify it fails, then passes**

Run: `mise run test-unit-file src/tests/integration/month-flow.integration.js`
Expected: FAIL until `data.js` exists → PASS.

- [ ] **Step 5: Run the full unit+integration suite**

Run: `mise run test-unit`
Expected: all unit + integration tests pass.
Run: `mise run full-lint`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/data.js frontend/src/tests/integration/
git commit -m "feat: data aggregate + whole-system month-flow integration test"
```

---

## Task 11: UI shell, DOM helpers, and boot

**Files:**
- Modify: `frontend/src/utils.js` (add DOM helpers + `showPage`)
- Create: `frontend/src/ui/ui.js`
- Rewrite: `frontend/src/main.js`
- Create: `frontend/src/ui/month.js` (initial: state + selector + render skeleton)

**Interfaces:**
- Produces (`utils.js`): `id(id)`, `sel(sel,root?)`, `arr(sel,root?)`, `html(el)`, `input(el)`, `button(el)`, `form(el)`, `dialog(el)`, `showPage(page)`.
- Produces (`ui.js`): `setupUI()` (nav routing + theme + Settings modal close).
- Produces (`month.js`): `setupMonth()`, `renderMonth(monthKey)`, `openInitialMonth()`, `getSelectedMonthKey()`.

- [ ] **Step 1: Append DOM helpers to `frontend/src/utils.js`** (port from diet):

```js
/** @param {unknown} obj @returns {Element} */
export function assertEl(obj) {
  if (!(obj instanceof Element)) { throw new Error('Expected an Element'); }
  return obj;
}
/** @param {string} elId @returns {Element} */
export const id = (elId) => assertEl(document.getElementById(elId));
/** @param {string} selector @param {Document|Element} [root] @returns {Element} */
export const sel = (selector, root = document) => assertEl(root.querySelector(selector));
/** @param {string} selector @param {Document|Element} [root] @returns {Element[]} */
export const arr = (selector, root = document) => Array.from(root.querySelectorAll(selector));

/** @template {abstract new (...a:any)=>Element} C @param {Element|null} el @param {C} Ctor @param {string} label @returns {InstanceType<C>} */
function castEl(el, Ctor, label) {
  if (el instanceof Ctor) { return /** @type {InstanceType<C>} */ (el); }
  throw new Error(`Element is not ${label}`);
}
/** @param {Element|null} el @returns {HTMLElement} */
export const html = (el) => castEl(el, HTMLElement, 'an HTMLElement');
/** @param {Element|null} el @returns {HTMLInputElement} */
export const input = (el) => castEl(el, HTMLInputElement, 'an input');
/** @param {Element|null} el @returns {HTMLButtonElement} */
export const button = (el) => castEl(el, HTMLButtonElement, 'a button');
/** @param {Element|null} el @returns {HTMLFormElement} */
export const form = (el) => castEl(el, HTMLFormElement, 'a form');
/** @param {Element|null} el @returns {HTMLDialogElement} */
export const dialog = (el) => castEl(el, HTMLDialogElement, 'a dialog');

/** @param {'month'|'envelopes'} page */
export function showPage(page) {
  for (const el of arr('.tab')) {
    html(el).classList.toggle('active', html(el).dataset.page === page);
  }
  html(id('page-month')).classList.toggle('hidden', page !== 'month');
  html(id('page-envelopes')).classList.toggle('hidden', page !== 'envelopes');
}
```

- [ ] **Step 2: Create `frontend/src/ui/ui.js`** (nav + theme + Settings close):

```js
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

export function setupUI() {
  applyTheme(storedTheme());

  for (const tab of $.arr('.tab[data-page]')) {
    $.html(tab).addEventListener('click', () => {
      const page = /** @type {'month'|'envelopes'} */ ($.html(tab).dataset.page);
      $.showPage(page);
    });
  }

  const configModal = $.dialog($.id('configModal'));
  $.button($.id('configBtn')).addEventListener('click', () => configModal.showModal());
  $.button($.id('configModalClose')).addEventListener('click', () => configModal.close());
  configModal.addEventListener('click', (e) => { if (e.target === configModal) { configModal.close(); } });

  for (const btn of $.arr('.config-theme-btn')) {
    $.html(btn).addEventListener('click', () => {
      const theme = /** @type {'auto'|'light'|'dark'} */ ($.html(btn).dataset.theme);
      localStorage.setItem('theme', theme);
      applyTheme(theme);
    });
  }
}
```

- [ ] **Step 3: Create `frontend/src/ui/month.js`** with state, selector, and a render stub (filled by Tasks 13-15):

```js
import { computeMonth } from '../compute.js';
import { Activities, Bills, Months } from '../data.js';
import { formatMoney } from '../money.js';
import * as $ from '../utils.js';

/** @type {string|null} */
let selectedMonthKey = null;

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
      activities: activities.map((a) => ({ periodIndex: a.periodIndex, amount: a.amount, destination: a.destination })),
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
  selectedMonthKey = monthKey;
  const { view } = await buildView(monthKey);
  $.html($.id('monthTitle')).textContent = monthLabel(monthKey);
  // Status card + periods are rendered by renderStatus/renderPeriods (Tasks 14-15).
  renderStatus(view);
  renderPeriods(view);
}

// Placeholders replaced in later tasks:
/** @param {import('../compute.js').MonthView} view */
function renderStatus(view) {
  $.html($.id('statusCard')).textContent = `${formatMoney(view.safeToSpend)} available`;
}
/** @param {import('../compute.js').MonthView} view */
function renderPeriods(view) {
  $.html($.id('periods')).textContent = `${view.periods.length} periods`;
}

export function setupMonth() {
  // Month selector + setup dialog wiring is added in Task 13.
}

/** Pick the initial month: current if it exists, else latest, else prompt setup. */
export async function openInitialMonth() {
  const months = await Months.list();
  if (months.length === 0) {
    // Task 13 opens the setup dialog here.
    $.html($.id('monthTitle')).textContent = 'Start a month';
    return;
  }
  const currentKey = $.isoToday().slice(0, 7);
  const target = months.find((m) => m.monthKey === currentKey) ?? months.at(-1);
  await renderMonth(/** @type {string} */ (target.monthKey));
}
```

Note: add `isoToday` to the `$` namespace — it is already exported from `utils.js` (Task 6). Confirm `import * as $` exposes it.

- [ ] **Step 4: Rewrite `frontend/src/main.js`**

```js
import { setupUI } from './ui/ui.js';
import { openInitialMonth, setupMonth } from './ui/month.js';

void (async function init() {
  setupUI();
  setupMonth();
  await openInitialMonth();
})();
```

- [ ] **Step 5: Verify boot + lint**

Run: `mise run full-lint` → pass.
Run: `mise run dev`, open the app: with no data it shows "Start a month"; nav switches Month/Envelopes; Settings modal opens/closes; theme buttons work. Stop the server.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils.js frontend/src/ui/ui.js frontend/src/ui/month.js frontend/src/main.js
git commit -m "feat: UI shell (nav, theme, Settings modal) + Month render skeleton"
```

---

## Task 12: Design tokens and layout styling

**Files:**
- Rewrite: `frontend/src/styles.css`

**Interfaces:** none (visual). Follows design-guidelines §17-20: spacing 4/8/12/16/24/32, radii 10/12/16, color roles, hero typography, light+dark.

- [ ] **Step 1: Write `frontend/src/styles.css`**

```css
:root {
  color-scheme: light dark;
  --brand: #3b6ef5;
  --positive: #1f8a55;
  --warning: #b8860b;
  --negative: #c0392b;
  --bg: #f7fafc; --surface: #ffffff; --text: #1a1d21; --muted: #6b7280; --border: #e5e7eb;
  --r-sm: 10px; --r-md: 12px; --r-lg: 16px;
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
  font-family: system-ui, -apple-system, sans-serif;
}
:root[data-theme="dark"], :root[data-theme="auto"] {
  @media (prefers-color-scheme: dark) {
    --bg: #121214; --surface: #1c1d21; --text: #f2f3f5; --muted: #9aa1ab; --border: #2c2e33;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); }
.hidden { display: none !important; }
.app { max-width: 640px; margin: 0 auto; padding: var(--s4) var(--s4) 88px; }

.month-title { font-size: 1.25rem; font-weight: 700; background: none; border: none; color: var(--text); padding: var(--s2) 0; min-height: 44px; cursor: pointer; }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s4); margin-bottom: var(--s4); }
.status-card .hero { font-size: 2.25rem; font-weight: 800; letter-spacing: -0.02em; }
.status-card .bill-progress { color: var(--muted); margin-top: var(--s1); }

.periods { display: flex; flex-direction: column; gap: var(--s3); }
.period-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); padding: var(--s3) var(--s4); }
.period-card.current { border-color: var(--brand); }
.period-card .range { font-weight: 600; }
.period-card .remaining { font-size: 1.1rem; font-weight: 700; }
.period-card .remaining.negative { color: var(--negative); }
.period-card .secondary { color: var(--muted); font-size: 0.85rem; }

.btn { min-height: 44px; padding: 0 var(--s4); border-radius: var(--r-sm); border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; font: inherit; }
.btn.primary { background: var(--brand); border-color: var(--brand); color: #fff; }
.btn.ghost { border-color: transparent; background: none; }
.btn.small { min-height: 36px; padding: 0 var(--s3); }

.bottom-nav { position: fixed; inset: auto 0 0 0; display: flex; gap: var(--s2); padding: var(--s2); background: var(--surface); border-top: 1px solid var(--border); }
.tab { flex: 1; min-height: 44px; border: none; background: none; color: var(--muted); font: inherit; cursor: pointer; border-radius: var(--r-sm); }
.tab.active { color: var(--brand); font-weight: 600; }

dialog { border: none; border-radius: var(--r-lg) var(--r-lg) 0 0; padding: 0; width: 100%; max-width: 640px; margin: auto auto 0; background: var(--surface); color: var(--text); }
dialog::backdrop { background: rgba(0,0,0,0.4); }
.sheet-inner, .config-inner { padding: var(--s4); display: flex; flex-direction: column; gap: var(--s4); }
.sheet-header, .config-header { display: flex; justify-content: space-between; align-items: center; font-weight: 700; }
.field { display: flex; flex-direction: column; gap: var(--s1); }
.field > input[type="text"] { min-height: 44px; padding: 0 var(--s3); border: 1px solid var(--border); border-radius: var(--r-sm); background: var(--bg); color: var(--text); font: inherit; }
.copy-field { flex-direction: row; align-items: center; gap: var(--s2); }

.bill-row { display: flex; align-items: center; gap: var(--s3); padding: var(--s2) 0; border-top: 1px solid var(--border); }
.bill-row .bill-name { flex: 1; }
.bill-row .bill-amount { font-variant-numeric: tabular-nums; }
.bill-row .paid-badge { color: var(--positive); font-size: 0.8rem; }

.month-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s2); }
.month-list li button { width: 100%; text-align: left; }
.month-list li.selected button { border-color: var(--brand); }
.empty, .config-note { color: var(--muted); }
```

- [ ] **Step 2: Verify visually**

Run: `mise run dev`; confirm the shell looks styled (hero number, cards, bottom nav, dialogs slide up). Toggle dark theme. Stop the server.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles.css
git commit -m "style: design tokens and Month/dialog layout"
```

---

## Task 13: Month setup dialog and month selector

**Files:**
- Modify: `frontend/src/ui/month.js`

**Interfaces:**
- Consumes: `Months`, `renderMonth`, `monthLabel`, `parseMoney`.
- Produces: working `setupMonth()` wiring the selector sheet + setup dialog; `openMonthSetup(monthKey, {isFirst})`.

- [ ] **Step 1: Add setup + selector logic to `frontend/src/ui/month.js`** — replace the stub `setupMonth` and the `openInitialMonth` no-month branch. Add these functions and wiring:

```js
import { parseMoney } from '../money.js';

/** Next month key after the latest existing month, else the current month. */
async function nextMonthKey() {
  const months = await Months.list();
  const base = months.length ? months.at(-1).monthKey : $.isoToday().slice(0, 7);
  const [year, month] = base.split('-').map(Number);
  const d = new Date(year, month, 1); // month is 1-based -> Date month index = next month
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Open the setup dialog for a month key. @param {string} monthKey */
async function openMonthSetup(monthKey) {
  const months = await Months.list();
  const isFirst = months.length === 0;
  const prev = months.at(-1) ?? null;

  const dlg = $.dialog($.id('monthSetupDialog'));
  $.html($.id('monthSetupTitle')).textContent = `Set up ${monthLabel(monthKey)}`;
  const amount = $.input($.id('monthSetupAmount'));
  amount.value = prev ? (prev.available / 100).toFixed(2) : '';

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

export function setupMonth() {
  // Month title opens the selector sheet.
  const selectSheet = $.dialog($.id('monthSelectSheet'));
  $.button($.id('monthTitle')).addEventListener('click', () => void openSelector());
  $.button($.id('monthSelectClose')).addEventListener('click', () => selectSheet.close());
  selectSheet.addEventListener('click', (e) => { if (e.target === selectSheet) { selectSheet.close(); } });
  $.button($.id('startMonthBtn')).addEventListener('click', async () => {
    selectSheet.close();
    await openMonthSetup(await nextMonthKey());
  });

  // Setup dialog submit / cancel.
  const setupDlg = $.dialog($.id('monthSetupDialog'));
  $.button($.id('monthSetupClose')).addEventListener('click', () => setupDlg.close());
  $.form($.id('monthSetupForm')).addEventListener('submit', async (e) => {
    e.preventDefault();
    const available = parseMoney($.input($.id('monthSetupAmount')).value);
    if (available === null || available < 0) { return; } // required; invalid stays open
    const monthKey = /** @type {string} */ (setupDlg.dataset.monthKey);
    const copyFrom = setupDlg.dataset.copyFrom || null;
    const shouldCopy = $.input($.id('monthSetupCopy')).checked && !$.html($.id('monthSetupCopyField')).classList.contains('hidden');
    await Months.create({ monthKey, available, copyFromKey: shouldCopy ? copyFrom : null });
    setupDlg.close();
    await renderMonth(monthKey);
  });
}

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
    btn.addEventListener('click', async () => { selectSheet.close(); await renderMonth(m.monthKey); });
    li.append(btn);
    list.append(li);
  }
  selectSheet.showModal();
}
```

Then update `openInitialMonth`'s empty branch to call setup:

```js
export async function openInitialMonth() {
  const months = await Months.list();
  if (months.length === 0) {
    await openMonthSetup($.isoToday().slice(0, 7));
    return;
  }
  const currentKey = $.isoToday().slice(0, 7);
  const target = months.find((m) => m.monthKey === currentKey) ?? months.at(-1);
  await renderMonth(/** @type {string} */ (target.monthKey));
}
```

(Move `openMonthSetup`, `nextMonthKey`, `openSelector` above their first use, or keep as function declarations — hoisting applies.)

- [ ] **Step 2: Verify by hand**

Run: `mise run dev`. First load (empty DB) → setup dialog for the current month, no copy toggle. Enter `3000`, create → Month screen shows "$3,000.00 available" and "5 periods". Tap the title → selector lists the month; "Start another month" → setup for next month defaulting to 3000 with a "Copy …'s bills" toggle. Cancel (✕) creates nothing. Stop the server.

- [ ] **Step 3: Lint + commit**

Run: `mise run full-lint` → pass.

```bash
git add frontend/src/ui/month.js
git commit -m "feat: month setup dialog and month selector"
```

---

## Task 14: Monthly status card with bills

**Files:**
- Modify: `frontend/src/ui/month.js` (replace `renderStatus`, add bill interactions)

**Interfaces:**
- Consumes: `MonthView`, `Bills`, `formatMoney`, `parseMoney`.
- Produces: collapsible status card (STA-1/2) with bill list, one-tap pay/undo, actual edit, rename, add-bill, edit monthly amount. Re-renders via `renderMonth(getSelectedMonthKey())`.

- [ ] **Step 1: Replace `renderStatus` in `frontend/src/ui/month.js`**

```js
let statusExpanded = false;

/** @param {import('../compute.js').MonthView} view @param {import('../data.js').BillView[]} bills */
function renderStatus(view, bills) {
  const card = $.html($.id('statusCard'));
  card.innerHTML = '';

  const hero = document.createElement('div');
  hero.className = 'hero';
  hero.textContent = `${formatMoney(view.safeToSpend)} available`;

  const progress = document.createElement('div');
  progress.className = 'bill-progress';
  progress.textContent = `Bills: ${view.paidCount} of ${view.billCount} paid · ${formatMoney(view.billsReserved)} reserved`;

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn ghost small';
  toggle.textContent = statusExpanded ? 'Hide details' : 'Show bills';
  toggle.addEventListener('click', () => { statusExpanded = !statusExpanded; void refresh(); });

  card.append(hero, progress, toggle);
  if (statusExpanded) { card.append(renderBillList(bills), renderAmountEditor(view)); }
}

/** @param {import('../data.js').BillView[]} bills */
function renderBillList(bills) {
  const wrap = document.createElement('div');
  wrap.className = 'bill-list';
  for (const bill of bills) {
    const row = document.createElement('div');
    row.className = 'bill-row';

    const pay = document.createElement('input');
    pay.type = 'checkbox';
    pay.checked = bill.paid;
    pay.setAttribute('aria-label', `${bill.name} paid`);
    pay.addEventListener('change', async () => {
      if (pay.checked) { await Bills.markPaid(bill.id); } else { await Bills.markUnpaid(bill.id); }
      await refresh();
    });

    const name = document.createElement('button');
    name.type = 'button';
    name.className = 'btn ghost bill-name';
    name.textContent = bill.name;
    name.addEventListener('click', async () => {
      const next = prompt('Rename bill', bill.name);
      if (next && next.trim()) { await Bills.rename(bill.seriesId, next.trim()); await refresh(); }
    });

    const amount = document.createElement('button');
    amount.type = 'button';
    amount.className = 'btn ghost bill-amount';
    const shown = bill.paid ? (bill.actual ?? bill.expected) : bill.expected;
    amount.textContent = formatMoney(shown) + (bill.paid && bill.actual !== bill.expected ? ` (exp ${formatMoney(bill.expected)})` : '');
    amount.addEventListener('click', async () => {
      const entered = parseMoney(prompt('Actual amount', (shown / 100).toFixed(2)) ?? '');
      if (entered !== null) { await Bills.setActual(bill.id, entered); await refresh(); }
    });

    row.append(pay, name, amount);
    wrap.append(row);
  }

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'btn small';
  add.textContent = '+ Add bill';
  add.addEventListener('click', async () => {
    const name = prompt('Bill name')?.trim();
    if (!name) { return; }
    const expected = parseMoney(prompt('Expected amount') ?? '');
    if (expected === null) { return; }
    await Bills.create({ monthKey: /** @type {string} */ (selectedMonthKey), name, expected });
    await refresh();
  });
  wrap.append(add);
  return wrap;
}

/** @param {import('../compute.js').MonthView} view */
function renderAmountEditor(view) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn ghost small';
  btn.textContent = `Monthly amount: ${formatMoney(view.available)} · Edit`;
  btn.addEventListener('click', async () => {
    const entered = parseMoney(prompt('Monthly available amount', (view.available / 100).toFixed(2)) ?? '');
    if (entered !== null && entered >= 0) { await Months.setAvailable(/** @type {string} */ (selectedMonthKey), entered); await refresh(); }
  });
  return btn;
}

/** Convenience: rebuild the current month. */
async function refresh() {
  if (selectedMonthKey) { await renderMonth(selectedMonthKey); }
}
```

- [ ] **Step 2: Update `renderMonth` to pass bills to `renderStatus`** — change the body to fetch once and pass through:

```js
export async function renderMonth(monthKey) {
  selectedMonthKey = monthKey;
  const { view, bills } = await buildView(monthKey);
  $.html($.id('monthTitle')).textContent = monthLabel(monthKey);
  renderStatus(view, bills);
  renderPeriods(view);
}
```

- [ ] **Step 3: Verify by hand**

Run: `mise run dev`. Show bills → empty; "+ Add bill" (Rent 1200) → reserved updates, safe-to-spend drops. Tick paid → count `1 of 1`. Edit actual to 1250 → shows `(exp $1,200.00)`. Rename → name changes. Edit monthly amount → hero + reserved recompute. Stop the server.

- [ ] **Step 4: Lint + commit**

Run: `mise run full-lint` → pass.

```bash
git add frontend/src/ui/month.js
git commit -m "feat: monthly status card with bill pay/actual/rename/add and amount editor"
```

---

## Task 15: Period cards and expense entry

**Files:**
- Modify: `frontend/src/ui/month.js` (replace `renderPeriods`, wire activity dialog)

**Interfaces:**
- Consumes: `MonthView`, `Activities`, `parseMoney`, `formatMoney`.
- Produces: period cards (PER-3/4) with current-period emphasis, `+ Add` opening the activity dialog (TRX-1/2), expense list on the card.

- [ ] **Step 1: Replace `renderPeriods` and add the activity dialog in `frontend/src/ui/month.js`**

```js
/** Which period contains today (or null if the month is not the current one). */
function currentPeriodIndex(view) {
  const todayKey = $.isoToday();
  if (todayKey.slice(0, 7) !== selectedMonthKey) { return -1; }
  const day = Number(todayKey.slice(8, 10));
  const p = view.periods.find((x) => day >= x.startDay && day <= x.endDay);
  return p ? p.index : -1;
}

/** @param {import('../compute.js').MonthView} view */
async function renderPeriods(view) {
  const container = $.html($.id('periods'));
  container.innerHTML = '';
  const activities = await Activities.listForMonth(/** @type {string} */ (selectedMonthKey));
  const current = currentPeriodIndex(view);

  for (const p of view.periods) {
    const card = document.createElement('section');
    card.className = 'period-card' + (p.index === current ? ' current' : '');

    const range = document.createElement('div');
    range.className = 'range';
    range.textContent = `${p.startDay}–${p.endDay}`;

    const remaining = document.createElement('div');
    remaining.className = 'remaining' + (p.remaining < 0 ? ' negative' : '');
    remaining.textContent = `${formatMoney(p.remaining)} left`;

    const secondary = document.createElement('div');
    secondary.className = 'secondary';
    secondary.textContent = `${formatMoney(p.spent)} of ${formatMoney(p.allocation)}`;

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn small';
    add.textContent = '+ Add';
    add.addEventListener('click', () => openActivity(p.index));

    card.append(range, remaining, secondary, add);

    const periodActivities = activities.filter((a) => a.periodIndex === p.index);
    if (periodActivities.length) {
      const list = document.createElement('div');
      list.className = 'expense-list';
      for (const a of periodActivities) {
        const item = document.createElement('div');
        item.className = 'secondary';
        item.textContent = `${formatMoney(a.amount)} ${a.description}`.trim();
        list.append(item);
      }
      card.append(list);
    }
    container.append(card);
  }
}

/** Open the activity dialog for a source period. @param {number} periodIndex */
function openActivity(periodIndex) {
  const dlg = $.dialog($.id('activityDialog'));
  const view = $.html($.id('activitySource'));
  const period = /** @type {any} */ (null);
  dlg.dataset.periodIndex = String(periodIndex);
  $.input($.id('activityAmount')).value = '';
  $.input($.id('activityDescription')).value = '';
  $.html($.id('activitySource')).textContent = `From period ${periodIndex + 1}`;
  dlg.showModal();
  $.input($.id('activityAmount')).focus();
}
```

- [ ] **Step 2: Wire the activity form once, inside `setupMonth`** — append to the `setupMonth` body:

```js
  const activityDlg = $.dialog($.id('activityDialog'));
  $.button($.id('activityClose')).addEventListener('click', () => activityDlg.close());
  $.form($.id('activityForm')).addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseMoney($.input($.id('activityAmount')).value);
    if (amount === null || amount <= 0) { return; } // zero/blank cannot be saved
    const periodIndex = Number(activityDlg.dataset.periodIndex);
    await Activities.createExpense({
      monthKey: /** @type {string} */ (selectedMonthKey),
      periodIndex,
      amount,
      description: $.input($.id('activityDescription')).value.trim(),
    });
    activityDlg.close();
    await renderMonth(/** @type {string} */ (selectedMonthKey));
  });
```

- [ ] **Step 3: Make `renderMonth` await `renderPeriods`** (it is now async):

```js
  renderStatus(view, bills);
  await renderPeriods(view);
```

- [ ] **Step 4: Verify by hand**

Run: `mise run dev`. Period cards show ranges, `$X left of $Y`, and `+ Add`. The current period is outlined. Add an expense (50) to a period → its remaining drops by $50, the expense appears on the card, and the hero safe-to-spend drops by $50. A blank/zero amount will not save. Stop the server.

- [ ] **Step 5: Lint + full suite + commit**

Run: `mise run full-lint` → pass.
Run: `mise run test-unit` → all pass.

```bash
git add frontend/src/ui/month.js
git commit -m "feat: period cards and single-source expense entry"
```

---

## Task 16: E2E smoke tests

**Files:**
- Create: `frontend/tests-e2e/playwright-helpers.js`
- Create: `frontend/tests-e2e/setup-and-expense.spec.js`
- Create: `frontend/tests-e2e/persistence.spec.js`

**Interfaces:**
- Consumes: `window.__testDB` (from `db.js`), the rendered UI.
- Produces: browser-only smoke coverage (rendering, reload persistence). No duplication of integration coverage.

- [ ] **Step 1: Create `frontend/tests-e2e/playwright-helpers.js`**

```js
/** Reset IndexedDB before each test via the app's test seam. @param {import('@playwright/test').Page} page */
export async function resetDB(page) {
  await page.goto('/');
  await page.evaluate(async () => { await /** @type {any} */ (window).__testDB.reset(); });
  await page.reload();
}
```

- [ ] **Step 2: Create `frontend/tests-e2e/setup-and-expense.spec.js`**

```js
import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => { await resetDB(page); });

test('first run: set up a month, then record an expense', async ({ page }) => {
  await page.goto('/');

  // Setup dialog appears with no data.
  await page.getByLabel('Available this month').fill('3000');
  await page.getByRole('button', { name: 'Create month' }).click();

  // Month screen renders.
  await expect(page.locator('#statusCard .hero')).toContainText('$3,000.00 available');
  await expect(page.locator('.period-card')).toHaveCount(5); // depends on month length; see note

  // Record an expense on the first period.
  await page.locator('.period-card').first().getByRole('button', { name: '+ Add' }).click();
  await page.getByLabel('Amount').fill('50');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('#statusCard .hero')).toContainText('$2,950.00 available');
});
```

Note: period count depends on the current month; assert `>= 4` instead of exactly 5 to stay robust:
`await expect(page.locator('.period-card')).not.toHaveCount(0);` and check the hero, which is date-independent.

- [ ] **Step 3: Create `frontend/tests-e2e/persistence.spec.js`**

```js
import { expect, test } from '@playwright/test';
import { resetDB } from './playwright-helpers.js';

test.beforeEach(async ({ page }) => { await resetDB(page); });

test('created month and expense survive a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Available this month').fill('1000');
  await page.getByRole('button', { name: 'Create month' }).click();
  await page.locator('.period-card').first().getByRole('button', { name: '+ Add' }).click();
  await page.getByLabel('Amount').fill('40');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#statusCard .hero')).toContainText('$960.00 available');

  await page.reload();
  await expect(page.locator('#statusCard .hero')).toContainText('$960.00 available');
});
```

- [ ] **Step 4: Run E2E**

Run: `mise run e2e`
Expected: both specs pass (Playwright builds + previews the app automatically).

- [ ] **Step 5: Commit**

```bash
git add frontend/tests-e2e/
git commit -m "test: E2E smoke (first-run setup, expense, reload persistence)"
```

---

## Task 17: Accessibility, feedback polish, and final gate

**Files:**
- Modify: `frontend/src/ui/month.js`, `frontend/src/styles.css` as needed.

- [ ] **Step 1: Accessibility pass**
  - Every interactive control has an accessible name (the pay checkbox uses `aria-label`; verify `+ Add`, `+ Add bill`, month title, close buttons all have text or `aria-label`).
  - Touch targets ≥ 44px (buttons use `.btn`/`.tab`; verify the bill checkbox has an enlarged hit area — add `.bill-row input[type="checkbox"]{ width:22px; height:22px; }`).
  - Negative balances use a sign + `.negative` class, never color alone (already: `formatMoney` prefixes `-` and text says "left").

- [ ] **Step 2: Recalculation feedback (lightweight)** — after a bill actual differs from expected, the status card already re-renders showing `(exp …)`. No toast framework in Slice 1; keep inline re-render only. (No code change unless missing.)

- [ ] **Step 3: Final verification gate**

Run: `mise run full-lint` → pass.
Run: `mise run test-unit` → all unit + integration pass.
Run: `mise run e2e` → smoke passes.
Run: `mise run dev` and walk the four core flows once (create month, mark bill paid, record expense, change monthly amount).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "polish: accessibility hit areas and negative-balance clarity"
```

---

## Self-review notes (addressed in this plan)

- **Spec coverage:** MTH-1 (Task 11 `openInitialMonth`), MTH-2 (Task 13 selector), MTH-3/4/5 (Task 13 setup dialog + cancel-safe), MTH-6 (Task 14 amount editor); STA-1/2 (Task 14 collapse/expand); BIL-1..5 (Task 14); PER-1/2 (Tasks 3/4), PER-3/4/6 (Task 15); TRX-1/2 (Task 15); CAL-1/2/5 (Tasks 4/5); DAT-7 (record ids/timestamps throughout). Deferred stories are out of scope by decision.
- **Type consistency:** `BillView` carries `seriesId`, `id` (occurrence id), `name` — used consistently in `renderBillList` (`bill.id` for occurrence ops, `bill.seriesId` for rename). `computeMonth` input maps `{paid, actual, expected}` and `{periodIndex, amount, destination}` — matched in `buildView`/`viewFor`.
- **Known follow-ups for Slice 2/3:** expense edit/delete, envelopes, splits/move-money, deficit carry, open funds + Move leftover + attention dots, import/full Settings/PWA-status wiring, recalculation toast.
