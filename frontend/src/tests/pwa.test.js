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
    window.matchMedia = /** @type {(q: any) => any} */ ((q) => ({ matches: String(q).includes('standalone') }));
    expect(installStatus()).toBe('installed');
  });

  test('installStatus is unsupported without a prompt or standalone', () => {
    window.matchMedia = /** @type {any} */ (() => ({ matches: false }));
    expect(installStatus()).toBe('unsupported');
  });
});
