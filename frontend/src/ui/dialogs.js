import { parseMoney } from '../money.js';

/**
 * Themed modal dialogs that replace the browser's prompt/confirm/alert. Each helper builds
 * a <dialog> on demand, shows it modally, resolves via a promise, and removes itself on
 * close. Escape and backdrop clicks resolve to the cancel value. Styling reuses the sheet
 * classes in styles.css.
 */

/**
 * Runs build() to populate a fresh modal dialog, then shows it. build() wires the controls
 * to done(), which closes and removes the element and resolves the promise. Escape and
 * backdrop clicks resolve to cancelValue.
 * @param {(dlg: HTMLDialogElement, done: (value: any) => void) => void} build
 * @param {any} cancelValue
 * @returns {Promise<any>}
 */
function modal(build, cancelValue) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    let settled = false;
    /** @param {any} value */
    const done = (value) => {
      if (settled) { return; }
      settled = true;
      dlg.close();
      dlg.remove();
      resolve(value);
    };
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(cancelValue); });
    dlg.addEventListener('click', (e) => { if (e.target === dlg) { done(cancelValue); } });
    build(dlg, done);
    document.body.append(dlg);
    dlg.showModal();
  });
}

/**
 * Builds the shared header shell and returns the inner container for the caller to fill.
 * @param {HTMLDialogElement} dlg @param {string} title @returns {HTMLElement}
 */
function shell(dlg, title) {
  dlg.setAttribute('aria-label', title);
  const inner = document.createElement('div');
  inner.className = 'sheet-inner';
  const header = document.createElement('div');
  header.className = 'sheet-header';
  const heading = document.createElement('span');
  heading.textContent = title;
  header.append(heading);
  inner.append(header);
  dlg.append(inner);
  return inner;
}

/** @typedef {{ name:string, label:string, kind?:'text'|'amount', value?:string|number, required?:boolean }} Field */

/**
 * A themed value-entry sheet. `amount` fields return integer minor units (cents) and gate
 * the confirm button on a valid, non-negative parse; `text` fields return the trimmed
 * string and gate on non-empty when required. Resolves the entered values keyed by field
 * name, or null if cancelled.
 * @param {{ title:string, fields:Field[], confirmLabel?:string }} opts
 * @returns {Promise<Record<string, string|number>|null>}
 */
export function inputSheet({ title, fields, confirmLabel = 'Save' }) {
  return modal((dlg, done) => {
    const inner = shell(dlg, title);
    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'dialog-body';

    /** @type {HTMLInputElement[]} */
    const inputs = fields.map((f) => {
      const label = document.createElement('label');
      label.className = 'field';
      const span = document.createElement('span');
      span.textContent = f.label;
      const input = document.createElement('input');
      input.type = 'text';
      if ((f.kind ?? 'text') === 'amount') { input.inputMode = 'decimal'; }
      input.autocomplete = 'off';
      input.value = f.value === undefined ? ''
        : f.kind === 'amount' ? (Number(f.value) / 100).toFixed(2)
        : String(f.value);
      label.append(span, input);
      form.append(label);
      return input;
    });

    /** @returns {Record<string, string|number>|null} parsed values, or null if invalid */
    const collect = () => {
      const parsed = fields.map((f, i) => readField(f, inputs[i]));
      if (parsed.some((v) => v === INVALID)) { return null; }
      /** @type {Record<string, string|number>} */
      const out = {};
      fields.forEach((f, i) => { out[f.name] = /** @type {string|number} */ (parsed[i]); });
      return out;
    };

    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const cancel = ghostButton('Cancel', () => done(null));
    const confirm = document.createElement('button');
    confirm.type = 'submit';
    confirm.className = 'btn primary';
    confirm.textContent = confirmLabel;
    actions.append(cancel, confirm);
    form.append(actions);
    inner.append(form);

    const validate = () => { confirm.disabled = collect() === null; };
    for (const input of inputs) { input.addEventListener('input', validate); }
    validate();
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const values = collect();
      if (values) { done(values); }
    });
  }, null);
}

/** Sentinel for an invalid field value (kept out of the resolved object). */
const INVALID = Symbol('invalid');

/** @param {Field} f @param {HTMLInputElement} input @returns {string|number|typeof INVALID} */
function readField(f, input) {
  const raw = input.value.trim();
  if ((f.kind ?? 'text') === 'amount') {
    if (!raw) { return f.required ? INVALID : 0; }
    const cents = parseMoney(raw);
    return cents === null || cents < 0 ? INVALID : cents;
  }
  if (f.required && !raw) { return INVALID; }
  return raw;
}

/**
 * A themed confirmation. Resolves true only when the confirm button is pressed.
 * @param {{ title:string, message:string, confirmLabel?:string, cancelLabel?:string, destructive?:boolean }} opts
 * @returns {Promise<boolean>}
 */
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false }) {
  return modal((dlg, done) => {
    const inner = shell(dlg, title);
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = `btn ${destructive ? 'destructive' : 'primary'}`;
    confirm.textContent = confirmLabel;
    confirm.addEventListener('click', () => done(true));
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.append(ghostButton(cancelLabel, () => done(false)), confirm);
    inner.append(messageEl(message), actions);
  }, false);
}

/**
 * A themed informational message with a single dismiss button.
 * @param {{ title:string, message:string, okLabel?:string }} opts
 * @returns {Promise<void>}
 */
export function messageDialog({ title, message, okLabel = 'OK' }) {
  return modal((dlg, done) => {
    const inner = shell(dlg, title);
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn primary';
    ok.textContent = okLabel;
    ok.addEventListener('click', () => done(undefined));
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    actions.append(ok);
    inner.append(messageEl(message), actions);
  }, undefined);
}

/**
 * A themed single-choice picker. Resolves the chosen option's value, or null if cancelled.
 * @param {{ title:string, options:Array<{label:string, value:any}> }} opts
 * @returns {Promise<any|null>}
 */
export function pickList({ title, options }) {
  return modal((dlg, done) => {
    const inner = shell(dlg, title);
    const list = document.createElement('div');
    list.className = 'pick-list';
    for (const opt of options) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';
      btn.textContent = opt.label;
      btn.addEventListener('click', () => done(opt.value));
      list.append(btn);
    }
    inner.append(list);
  }, null);
}

/** @param {string} text @param {() => void} onClick @returns {HTMLButtonElement} */
function ghostButton(text, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn ghost';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

/** @param {string} message @returns {HTMLElement} */
function messageEl(message) {
  const p = document.createElement('p');
  p.className = 'dialog-message';
  p.textContent = message;
  return p;
}
