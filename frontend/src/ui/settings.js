import { exportDB, importDB, resetDB } from '../db.js';
import {
  installStatus, offlineReadiness, persistentStorage, promptInstall, requestPersist,
} from '../pwa.js';
import * as $ from '../utils.js';
import { confirmDialog, messageDialog } from './dialogs.js';

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
      try { dump = JSON.parse(await file.text()); } catch { await messageDialog({ title: 'Import failed', message: 'The file is not valid JSON.' }); return; }
      const ok = await confirmDialog({
        title: 'Replace all data?',
        message: `Replace all local data with:\n${summarize(dump)}\n\nThis cannot be undone.`,
        confirmLabel: 'Replace', destructive: true,
      });
      if (!ok) { return; }
      try { await importDB(dump); } catch (e) {
        await messageDialog({ title: 'Import failed', message: e instanceof Error ? e.message : 'The file is not a valid backup.' });
        return;
      }
      location.reload();
    })();
  });

  $.button($.id('dataReset')).addEventListener('click', () => {
    void (async () => {
      const ok = await confirmDialog({
        title: 'Reset all data',
        message: 'This erases all local financial data. It cannot be undone unless you have a backup.',
        confirmLabel: 'Reset', destructive: true,
      });
      if (!ok) { return; }
      await resetDB();
      location.reload();
    })();
  });
}
