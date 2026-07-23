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
