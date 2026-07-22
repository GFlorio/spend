// Registers a global `indexedDB` / `IDBKeyRange` backed by an in-memory store,
// so the real db.js runs under Vitest + jsdom with no browser.
//
// Deviation from the task brief: the brief specifies `import 'fake-indexeddb/auto'`,
// but that subpath has no typed entry in the package's `exports` map, so under
// `moduleResolution: "bundler"` tsc falls back to type-checking fake-indexeddb's own
// untyped implementation files, producing hundreds of errors unrelated to this repo.
// The package's main entry (`fake-indexeddb`) does ship `types.d.ts`, so importing the
// two globals actually used by db.js (`indexedDB`, `IDBKeyRange`) from there and
// assigning them to `globalThis` ourselves is functionally identical to `/auto` for our
// purposes, without pulling untyped sources into the TypeScript program.
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

Object.defineProperty(globalThis, 'indexedDB', { value: indexedDB, writable: true, configurable: true });
Object.defineProperty(globalThis, 'IDBKeyRange', { value: IDBKeyRange, writable: true, configurable: true });

if (!globalThis.navigator.storage) {
  Object.defineProperty(globalThis.navigator, 'storage', {
    value: { persist: () => Promise.resolve(true), persisted: () => Promise.resolve(true) },
    writable: true,
  });
}
