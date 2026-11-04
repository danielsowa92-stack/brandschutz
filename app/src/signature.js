// Unterschrift per Finger auf dem Bildschirm
import { esc } from './ui.js';

/**
 * Öffnet ein Unterschriftenfeld.
 * Liefert { dataUrl, name } oder null (abgebrochen).
 */
export function captureSignature({ title = 'Unterschrift', nameLabel = 'Name', name = '', hint = '' } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sig-bg';
    wrap.innerHTML = `
      <div class="sig-box">
        <div class="modal-title">${esc(title)}</div>
        ${hint ? `<p class="small muted" style="margin-bottom:8px">${esc(hint)}</p>` : ''}
        <div class="sig-pad"><canvas></canvas><div class="sig-line">✕ ________________________</div></div>
        <div class="field" style="margin:10px 0"><label>${esc(nameLabel)}</label><input type="text" id="sig-name" value="${esc(name)}"></div>
        <div class="modal-btns">
          <button class="btn" data-a="cancel">Abbrechen</button>
          <button class="btn" data-a="clear">Löschen</button>
          <button class="btn btn-primary" data-a="ok">Übernehmen</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const canvas = wrap.querySelector('canvas');
    const pad = wrap.querySelector('.sig-pad');
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const resize = () => {
      canvas.width = pad.clientWidth * ratio;
      canvas.height = pad.clientHeight * ratio;
      const ctx = canvas.getContext('2d');
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0a1a5c';
    };
    resize();
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let empty = true;
    let last = null;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      last = pos(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 1.1, 0, Math.PI * 2);
      ctx.fillStyle = '#0a1a5c';
      ctx.fill();
      empty = false;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
    });
    const end = () => { drawing = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    const onBack = (e) => { e.preventDefault(); close(null); };
    document.addEventListener('bs-back', onBack);
    const close = (v) => {
      document.removeEventListener('bs-back', onBack);
      wrap.remove();
      resolve(v);
    };
    wrap.addEventListener('click', (e) => {
      const a = e.target.closest('button[data-a]')?.dataset.a;
      if (a === 'cancel') close(null);
      if (a === 'clear') { ctx.clearRect(0, 0, canvas.width, canvas.height); empty = true; }
      if (a === 'ok') {
        if (empty) { canvas.classList.add('sig-err'); setTimeout(() => canvas.classList.remove('sig-err'), 600); return; }
        close({ dataUrl: trimmed(canvas), name: wrap.querySelector('#sig-name').value.trim() });
      }
    });
  });
}

/** Leeren Rand entfernen, damit die Unterschrift im PDF gut skaliert */
function trimmed(canvas) {
  const ctx = canvas.getContext('2d');
  const { width: w, height: h } = canvas;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return canvas.toDataURL('image/png');
  const m = 8;
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(w, x1 + m); y1 = Math.min(h, y1 + m);
  const out = document.createElement('canvas');
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext('2d').drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
