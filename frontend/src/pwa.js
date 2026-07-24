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
  try { data = !!(await getAll('months')); } catch { data = false; }
  return { shell, data };
}
