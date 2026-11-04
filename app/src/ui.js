// Kleine UI-Helfer: Escaping, Toast, Dialoge
import { STATUS, MASSNAHMEN, fmtDate, dueState } from './logic.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const enc = encodeURIComponent;

export function setTitle(title, sub = '', back = true) {
  $('#bar-title').textContent = title;
  $('#bar-sub').textContent = sub;
  $('#bar-back').hidden = !back;
}

export function go(hash, replace = false) {
  if (replace) location.replace(hash);
  else location.hash = hash;
}

/** Aktuelle Ansicht neu zeichnen */
export const rerender = () => window.dispatchEvent(new Event('bs-rerender'));

export function toast(msg, ms = 2500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms);
}

/** Modaler Dialog. buttons: [{label, value, cls}] → Promise<value> */
export function dialog({ title = '', html = '', buttons = [{ label: 'OK', value: true, cls: 'btn-primary' }], withFields = false }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-bg';
    wrap.innerHTML = `<div class="modal" role="dialog">
      ${title ? `<div class="modal-title">${esc(title)}</div>` : ''}
      <div class="modal-body">${html}</div>
      <div class="modal-btns">${buttons.map((b, i) => `<button class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </div>`;
    const close = (v) => {
      const fields = {};
      wrap.querySelectorAll('input[id],textarea[id],select[id]').forEach((el) => { fields[el.id] = el.value; });
      wrap.remove();
      document.removeEventListener('bs-back', onBack);
      resolve(withFields ? { value: v, fields } : v);
    };
    const onBack = (e) => { e.preventDefault(); close(undefined); };
    document.addEventListener('bs-back', onBack);
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) return close(undefined);
      const b = e.target.closest('button[data-i]');
      if (b) close(buttons[+b.dataset.i].value);
    });
    document.body.appendChild(wrap);
    const first = wrap.querySelector('input,textarea,select');
    if (first) first.focus();
  });
}

export const confirmDialog = (title, text, okLabel = 'Löschen', danger = true) =>
  dialog({ title, html: `<p>${esc(text)}</p>`, buttons: [
    { label: 'Abbrechen', value: false },
    { label: okLabel, value: true, cls: danger ? 'btn-danger' : 'btn-primary' },
  ] });

export const alertDialog = (title, text) => dialog({ title, html: `<p>${esc(text)}</p>` });

export function statusBadge(status) {
  if (!status) return '<span class="badge b-none">nie geprüft</span>';
  const cls = { ok: 'b-ok', mangel: 'b-wa', ausser_betrieb: 'b-da' }[status] || 'b-none';
  return `<span class="badge ${cls}">${esc(STATUS[status] || status)}</span>`;
}

export function dueBadge(naechste) {
  const s = dueState(naechste);
  if (s === 'nie') return '<span class="badge b-none">noch nie geprüft</span>';
  if (s === 'ueberfaellig') return `<span class="badge b-da">überfällig seit ${fmtDate(naechste)}</span>`;
  if (s === 'bald') return `<span class="badge b-wa">fällig ${fmtDate(naechste)}</span>`;
  return `<span class="badge b-ok">fällig ${fmtDate(naechste)}</span>`;
}

export const massnahmeLabel = (m) => MASSNAHMEN[m] || '';

export function doorLage(d) {
  return [d.geschoss, d.raum].filter(Boolean).join(' · ');
}

/** Listenzeile für eine Tür */
export function doorRow(d, extra = '') {
  return `<a class="row" href="#/tuer/${enc(d.id)}">
    <div class="row-main">
      <div><span class="tag">${esc(d.id)}</span>${d.position ? ` <span class="muted">Pos. ${esc(d.position)}</span>` : ''}${d.typ ? ` <span class="typ">${esc(d.typ)}</span>` : ''}</div>
      <div class="row-title">${esc(doorLage(d) || '–')}</div>
      <div class="muted small">${esc(d.objekt || '')}</div>
      ${extra}
    </div>
    <div class="row-side">${statusBadge(d.last_status)}</div>
  </a>`;
}

/** Formularwerte als Objekt */
export function formData(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') o[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else o[el.name] = el.value.trim();
  }
  return o;
}
