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
