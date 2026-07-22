import { setupUI } from './ui/ui.js';
import { openInitialMonth, setupMonth } from './ui/month.js';

void (async function init() {
  setupUI();
  setupMonth();
  await openInitialMonth();
})();
