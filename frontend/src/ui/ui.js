import * as $ from '../utils.js';

/** @type {() => Promise<void>} */
let refreshEnvelopes = async () => {};
/** @param {() => Promise<void>} fn */
export function onEnvelopesShown(fn) { refreshEnvelopes = fn; }

export function setupUI() {
  for (const tab of $.arr('.tab[data-page]')) {
    $.html(tab).addEventListener('click', () => {
      const page = /** @type {'month'|'envelopes'} */ ($.html(tab).dataset.page);
      $.showPage(page);
      if (page === 'envelopes') { void refreshEnvelopes(); }
    });
  }
}
