import * as $ from '../utils.js';

/** @type {() => Promise<void>} */
let refreshEnvelopes = async () => {};
/** @param {() => Promise<void>} fn */
export function onEnvelopesShown(fn) { refreshEnvelopes = fn; }

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
      if (page === 'envelopes') { void refreshEnvelopes(); }
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
