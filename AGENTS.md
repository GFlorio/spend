# Code Agent Guidance

This file provides guidance to Coding Agents when working with code in this repository.

## General Guidelines

- Be brief.
- Strongly bias towards simplicity.
- Strongly bias towards asking for clarification.
- Less code is better code.
- Be concrete, then refactor if necessary.
- Flat is better than nested.
- Look for root causes.
- Descriptive names.
- Assert assumptions.
- Aggressively remove dead code, no "just in case" compatibility.

## Commits

- Use *Scoped Commits*: `<scope>: <description>` (e.g. `net/http/cookiejar: add godoc links`, `i2c: virtio: mark device ready before registering the adapter`). Scope names the touched area (`money`, `periods`, `compute`, `db`, `data`, `ui`, `e2e`, `scaffold`, `repo`).
- Do not add `Co-Authored-By` trailers or any AI attribution. The repository owner is solely responsible for all commits.

## Mise Tasks

Prefer `mise run <task>` over running raw commands directly. Key tasks:

```bash
mise run dev           # Start Vite dev server
mise run build         # Build for production
mise run lint          # Biome linter
mise run lint-fix      # Biome linter with auto-fix
mise run typecheck     # TypeScript type check via JSDoc (no emit)
mise run full-lint     # Biome + TypeScript (prefer this)
mise run test-unit     # Vitest unit tests (one-shot)
mise run test-unit-watch  # Vitest in watch mode
mise run test-unit-file src/tests/foo.test.js  # single unit test file
mise run e2e           # Playwright E2E tests (headless)
mise run e2e-ui        # Playwright with interactive UI
mise run e2e-file tests-e2e/foo.spec.js        # single E2E test file
mise run test          # Unit + E2E sequentially
```

## Testing

E2E is slow. Push coverage **down the pyramid** and keep Playwright thin. Write the
failing test first; structure tests Arrange / Act / Assert.

- **Unit** (`src/**/*.test.js`, Vitest): pure domain logic — period generation,
  allocation, monthly calculations, money formatting. No IndexedDB, no DOM. Fastest;
  exhaustive edge coverage lives here.
- **Integration** (`src/**/*.integration.js`, Vitest + jsdom + `fake-indexeddb`):
  exercise the real `db.js` + `data-*.js` + calculation layer together against an
  in-memory IndexedDB. **This is the primary place to prove the system works as a
  whole** — full flows like create month → add bill → pay → record expense → assert
  derived balances. Reset with `resetTestDB()` in `beforeEach`; seed via the shared
  helpers. Runs inside `mise run test-unit`.
- **E2E** (`tests-e2e/*.spec.js`, Playwright): only what needs a real browser —
  rendered UI, persistence across reload, PWA/offline. Keep to a few smoke flows; do
  not duplicate integration coverage.

When adding a test, pick the lowest layer that can express it. Before writing a
Playwright spec, check whether an integration test can cover it instead — it usually can.
