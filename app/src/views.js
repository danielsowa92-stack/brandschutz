// Alle Ansichten der App
import * as repo from './repo.js';
import {
  STATUS, MASSNAHMEN, TUERTYPEN, BEDINGUNGEN, DEFAULT_CHECKLIST,
  isoDate, addMonths, fmtDate, checklistFor, nextDoorId, parseScan, suggestKuerzel, normalizeKuerzel,
} from './logic.js';
import {
  $, $$, esc, enc, toast, dialog, confirmDialog, alertDialog, statusBadge, dueBadge, doorRow, doorLage,
  formData, setTitle, go, rerender, massnahmeLabel,
} from './ui.js';
import { scanQr, scanSupported } from './scanner.js';
import { qrDataUrl, labelSheet, reportPdf } from './pdf.js';
import { saveAndShare, saveFile, shareFile, listExports, deleteExport, pickFile, stamp, safeName, base64ToBlob } from './files.js';
import { buildExcel } from './excel.js';
import { Share } from '@capacitor/share';
import { buildBackup, restoreBackup, importLegacyData, detectFormat } from './backup.js';
import { takePhoto, photoDataUrl, deletePhotoFiles } from './photos.js';
import { refreshNotifications, notificationSettingsHtml, bindNotificationSettings } from './notify.js';

const today = () => isoDate();
const afterChange = () => refreshNotifications().catch(() => {});

// =====================================================================
// Scan-Ablauf
// =====================================================================
export async function startScanFlow() {
  if (!scanSupported()) {
    go('#/suche');
    toast('Kamera-Scan nur in der Android-App – bitte ID eingeben');
    return;
  }
  let text;
  try {
    text = await scanQr();
  } catch (e) {
    await alertDialog('Scan nicht möglich', e.message || String(e));
    return;
  }
  if (text) await openDoorById(parseScan(text));
}

export async function openDoorById(id) {
  if (!id) return;
  const door = await repo.findDoor(id);
  if (door) {
    go(`#/tuer/${enc(door.id)}`);
    return;
  }
  const ok = await dialog({
    title: 'Unbekannte Tür',
    html: `<p>Die ID <span class="tag">${esc(id)}</span> ist noch nicht angelegt.</p><p>Soll die Tür jetzt angelegt werden?</p>`,
    buttons: [{ label: 'Abbrechen', value: false }, { label: 'Tür anlegen', value: true, cls: 'btn-primary' }],
  });
  if (ok) go(`#/tuer-neu?id=${enc(id)}`);
}

// =====================================================================
// Startseite
// =====================================================================
async function homeView({ view }) {
  setTitle('Brandschutz-Prüfung', new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }), false);
  const objects = await repo.listObjects();
  const due = await repo.dueLists();
  const defects = await repo.openDefects();
  const orders = await repo.orderList();
  const tile = (href, n, label, cls) => `<a class="tile ${cls} ${n ? 'has' : ''}" href="${href}"><div class="tile-n">${n}</div><div class="tile-l">${label}</div></a>`;
  view.innerHTML = `
    <button class="hero-scan" id="home-scan"><span class="ico">⌗</span>QR-Code scannen</button>
    ${!objects.length ? `
      <div class="card">
        <div class="card-title">Willkommen!</div>
        <p class="muted">Lege zuerst ein Objekt (Gebäude/Kunde) und dessen Türen an – oder übernimm die Daten aus der alten Web-Version.</p>
        <div class="btn-row" style="margin-top:12px;margin-bottom:0">
          <a class="btn btn-primary" href="#/objekt-neu">+ Objekt anlegen</a>
          <a class="btn" href="#/mehr">Daten importieren</a>
        </div>
      </div>` : ''}
    <div class="tiles">
      ${tile('#/liste/ueberfaellig', due.ueberfaellig.length, 'Prüfung überfällig', 'da')}
      ${tile('#/liste/bald', due.bald.length, 'fällig in 30 Tagen', 'wa')}
      ${tile('#/liste/maengel', defects.length, 'offene Mängel', 'da')}
      ${tile('#/liste/bestellung', orders.length, 'Bestellliste', 'wa')}
      ${tile('#/liste/nie', due.nie.length, 'noch nie geprüft', '')}
      ${tile('#/objekte', objects.length, `Objekte · ${due.doors.length} Türen`, 'ok')}
    </div>
    <a class="btn btn-block" href="#/suche">🔎 Tür manuell suchen (QR nicht lesbar)</a>`;
  $('#home-scan').onclick = startScanFlow;
}

// =====================================================================
// Übersichtslisten
// =====================================================================
const LISTS = {
  ueberfaellig: 'Überfällige Prüfungen',
  bald: 'Fällig in den nächsten 30 Tagen',
  nie: 'Noch nie geprüft',
  maengel: 'Offene Mängel',
  bestellung: 'Bestellliste',
};

async function listView({ params, view }) {
  const typ = params[0];
  setTitle(LISTS[typ] || 'Liste');
  if (typ === 'maengel' || typ === 'bestellung') {
    const rows = typ === 'maengel' ? await repo.openDefects() : await repo.orderList();
    if (!rows.length) {
      view.innerHTML = `<div class="empty">${typ === 'maengel' ? 'Keine offenen Mängel. 👍' : 'Keine offenen Bestellpositionen.'}</div>`;
      return;
    }
    if (typ === 'bestellung') {
      view.innerHTML = `<p class="muted small" style="margin-bottom:10px">Alle offenen Mängel mit Maßnahme „bestellen“ oder eingetragenem Material.</p>
        <div class="list">${rows.map((i) => `<a class="row" href="#/pruefung/${i.id}">
          <div class="row-main">
            <div class="row-title" style="margin-top:0">${esc(i.material || '(kein Material eingetragen)')}</div>
            <div class="small"><span class="tag">${esc(i.door_id)}</span> ${esc([i.position && 'Pos. ' + i.position, i.geschoss, i.raum].filter(Boolean).join(' · '))}</div>
            <div class="muted small">${esc(i.objekt)} · ${fmtDate(i.datum)}${i.mangel ? ' · ' + esc(i.mangel) : ''}</div>
          </div></a>`).join('')}</div>
        <button class="btn btn-block" id="share-orders">Bestellliste als Text teilen</button>`;
      $('#share-orders').onclick = async () => {
        const txt = 'Bestellliste Brandschutztüren\n\n' + rows.map((i) => `- ${i.material || '?'} | Tür ${i.door_id}${i.position ? ' Pos. ' + i.position : ''} | ${[i.geschoss, i.raum].filter(Boolean).join(' / ')} | ${i.objekt}`).join('\n');
        try { await Share.share({ title: 'Bestellliste', text: txt, dialogTitle: 'Bestellliste senden' }); }
        catch (e) { try { await navigator.clipboard.writeText(txt); toast('In Zwischenablage kopiert'); } catch (e2) { /* egal */ } }
      };
      return;
    }
    view.innerHTML = `<div class="list">${rows.map((i) => `<a class="row" href="#/pruefung/${i.id}">
      <div class="row-main">
        <div><span class="tag">${esc(i.door_id)}</span> ${statusBadge(i.status)}</div>
        <div class="row-title">${esc(i.mangel || '(ohne Beschreibung)')}</div>
        <div class="muted small">${esc(i.objekt)} · ${esc([i.geschoss, i.raum].filter(Boolean).join(' · '))} · ${fmtDate(i.datum)}${i.massnahme ? ' · ' + esc(massnahmeLabel(i.massnahme)) : ''}</div>
      </div></a>`).join('')}</div>`;
    return;
  }
  const due = await repo.dueLists();
  const rows = due[typ] || [];
  view.innerHTML = rows.length
    ? `<div class="list">${rows.map((d) => doorRow(d, `<div style="margin-top:4px">${dueBadge(d.naechste)}</div>`)).join('')}</div>`
    : '<div class="empty">Keine Türen in dieser Liste.</div>';
}

// =====================================================================
// Objekte
// =====================================================================
async function objectsView({ view }) {
  setTitle('Objekte', '', false);
  const objects = await repo.listObjects();
  view.innerHTML = `
    <a class="btn btn-primary btn-block" href="#/objekt-neu" style="margin-bottom:12px">+ Neues Objekt</a>
    ${objects.length ? `<div class="list">${objects.map((o) => `<a class="row" href="#/objekt/${o.id}">
      <div class="row-main">
        <div><span class="tag">${esc(o.kuerzel)}</span></div>
        <div class="row-title">${esc(o.name)}</div>
        <div class="muted small">${esc([o.kunde, o.adresse].filter(Boolean).join(' · '))}</div>
      </div>
      <div class="row-side muted small">${o.tueren} Türen</div></a>`).join('')}</div>`
    : '<div class="empty">Noch keine Objekte angelegt.</div>'}`;
}

async function objectView({ params, view }) {
  const o = await repo.getObject(params[0]);
  if (!o) { view.innerHTML = '<div class="empty">Objekt nicht gefunden.</div>'; return; }
  setTitle(o.name, `${o.kuerzel}${o.kunde ? ' · ' + o.kunde : ''}`);
  const doors = await repo.listDoors(o.id);
  const defects = await repo.openDefects(o.id);
  view.innerHTML = `
    <div class="card">
      <dl class="kv">
        <dt>Kürzel</dt><dd><span class="tag">${esc(o.kuerzel)}</span></dd>
        <dt>Kunde</dt><dd>${esc(o.kunde || '–')}</dd>
        <dt>Adresse</dt><dd class="pre">${esc(o.adresse || '–')}</dd>
        ${o.notiz ? `<dt>Notiz</dt><dd class="pre">${esc(o.notiz)}</dd>` : ''}
        <dt>Türen</dt><dd>${doors.length}${defects.length ? ` · <span class="badge b-wa">${defects.length} offene Mängel</span>` : ''}</dd>
      </dl>
    </div>
    <a class="btn btn-primary btn-block" href="#/tuer-neu?objekt=${o.id}" style="margin-bottom:10px">+ Tür hinzufügen</a>
    <div class="actions">
      <button class="btn" id="o-qr">🏷️ QR-Etiketten (PDF)</button>
      <button class="btn" id="o-report">📄 Prüfbericht (PDF)</button>
      <button class="btn" id="o-xlsx">📊 Excel-Export</button>
      <a class="btn" href="#/objekt/${o.id}/bearbeiten">✏️ Bearbeiten</a>
    </div>
    <div class="sec">Türen</div>
    ${doors.length ? `<div class="list">${doors.map((d) => doorRow(d, `<div style="margin-top:4px">${dueBadge(d.naechste)}</div>`)).join('')}</div>`
    : '<div class="empty">Noch keine Türen in diesem Objekt.</div>'}
    <button class="btn btn-danger btn-block" id="o-del" style="margin-top:1rem">Objekt löschen</button>`;

  $('#o-qr').onclick = async () => {
    if (!doors.length) return toast('Keine Türen vorhanden');
    toast('PDF wird erstellt …');
    const blob = await labelSheet(doors, o.name);
    await saveAndShare(`QR-Etiketten_${safeName(o.kuerzel)}_${stamp()}.pdf`, blob, `QR-Etiketten ${o.name}`);
  };
  $('#o-report').onclick = () => createReport(o);
  $('#o-xlsx').onclick = async () => {
    toast('Excel wird erstellt …');
    const blob = await buildExcel(o.id);
    await saveAndShare(`Brandschutz_${safeName(o.kuerzel)}_${stamp()}.xlsx`, blob, `Export ${o.name}`);
  };
  $('#o-del').onclick = async () => {
    const n = doors.length;
    if (!(await confirmDialog('Objekt löschen?', `„${o.name}“ mit ${n} Tür(en) und allen Prüfungen wird endgültig gelöscht.`))) return;
    if (n > 0 && !(await confirmDialog('Wirklich löschen?', `Es werden ${n} Türen inkl. Prüfverlauf gelöscht. Das kann nicht rückgängig gemacht werden.`, 'Endgültig löschen'))) return;
    const photos = await repo.deleteObject(o.id);
    await deletePhotoFiles(photos);
    afterChange();
    toast('Objekt gelöscht');
    go('#/objekte', true);
  };
}

async function createReport(o) {
  const doors = await repo.listDoors(o.id);
  if (!doors.length) return toast('Keine Türen vorhanden');
  toast('Bericht wird erstellt …');
  const byDoor = new Map();
  for (const d of doors) byDoor.set(d.id, await repo.listInspections(d.id));
  const defects = await repo.openDefects(o.id);
  const photos = new Map();
  for (const i of defects) {
    const list = await repo.listPhotos(i.id);
    const urls = [];
    for (const p of list) { const u = await photoDataUrl(p.path); if (u) urls.push(u); }
    if (urls.length) photos.set(i.id, urls);
  }
  const blob = reportPdf(o, doors, byDoor, defects, {
    pruefer: await repo.getSetting('pruefer', ''),
    firma: await repo.getSetting('firma', ''),
    photos,
  });
  await saveAndShare(`Pruefbericht_${safeName(o.kuerzel)}_${isoDate()}.pdf`, blob, `Prüfbericht ${o.name}`);
}

async function objectFormView({ params, view }) {
  const isNew = !params[0];
  const o = isNew ? { name: '', kuerzel: '', kunde: '', adresse: '', notiz: '' } : await repo.getObject(params[0]);
  if (!o) { view.innerHTML = '<div class="empty">Objekt nicht gefunden.</div>'; return; }
  const all = await repo.listObjects();
  const doorCount = isNew ? 0 : all.find((x) => x.id === o.id)?.tueren || 0;
  setTitle(isNew ? 'Neues Objekt' : 'Objekt bearbeiten');
  view.innerHTML = `
    <form class="card" id="f">
      <div class="field"><label>Name *</label><input type="text" name="name" value="${esc(o.name)}" placeholder="z. B. Rathaus Musterstadt" required></div>
      <div class="field"><label>Kürzel * (für Tür-IDs)</label>
        <input type="text" name="kuerzel" value="${esc(o.kuerzel)}" placeholder="z. B. RM" maxlength="8" style="text-transform:uppercase" ${doorCount ? 'readonly' : ''}>
        <div class="hint">${doorCount ? 'Kürzel kann nicht mehr geändert werden, da bereits Türen (QR-Codes) existieren.' : 'Tür-IDs werden daraus gebildet, z. B. RM-0001. Nur Buchstaben und Ziffern.'}</div></div>
      <div class="field"><label>Kunde</label><input type="text" name="kunde" value="${esc(o.kunde)}" placeholder="z. B. Stadtverwaltung"></div>
      <div class="field"><label>Adresse</label><textarea name="adresse" rows="2" placeholder="Straße, PLZ Ort">${esc(o.adresse)}</textarea></div>
      <div class="field"><label>Notiz</label><textarea name="notiz" rows="2">${esc(o.notiz)}</textarea></div>
      <button class="btn btn-primary btn-big" type="submit">Speichern</button>
    </form>`;
  const f = $('#f');
  let kuerzelTouched = !isNew;
  f.kuerzel.oninput = () => { kuerzelTouched = true; };
  f.name.oninput = () => {
    if (!kuerzelTouched) f.kuerzel.value = suggestKuerzel(f.name.value, all.map((x) => x.kuerzel));
  };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const d = formData(f);
    d.kuerzel = normalizeKuerzel(d.kuerzel);
    if (!d.name) return toast('Bitte einen Namen eingeben');
    if (!d.kuerzel) return toast('Bitte ein Kürzel eingeben');
    if (all.some((x) => x.kuerzel === d.kuerzel && x.id !== o.id)) return toast(`Kürzel ${d.kuerzel} ist schon vergeben`);
    const id = await repo.saveObject({ ...o, ...d });
    toast('Gespeichert');
    go(`#/objekt/${id}`, true);
  };
}

// =====================================================================
// Türen
// =====================================================================
async function doorView({ params, query, view }) {
  const d = await repo.getDoor(params[0]);
  if (!d) {
    view.innerHTML = `<div class="empty">Tür „${esc(params[0])}“ nicht gefunden.<br><br><a class="btn btn-primary" href="#/tuer-neu?id=${enc(params[0])}">Tür anlegen</a></div>`;
    return;
  }
  setTitle(d.id, d.objekt);
  const insp = await repo.listInspections(d.id);
  const last = insp[0];
  const open = insp.filter((i) => i.status !== 'ok' && !i.behoben);
  const saved = query.get('gespeichert');
  const qr = await qrDataUrl(d.id, 300);
  view.innerHTML = `
    ${saved && last ? `<div class="success ${last.status}">
      <div class="success-title">${last.status === 'ok' ? '✅ Prüfung gespeichert' : last.status === 'mangel' ? '⚠️ Mangel gespeichert' : '⛔ Außer Betrieb gespeichert'}</div>
      <div class="small" style="margin-top:4px">Nächste Prüfung: ${fmtDate(last.naechste)}</div>
    </div>
    <button class="hero-scan" id="d-next"><span class="ico">⌗</span>Nächste Tür scannen</button>` : ''}
    <div class="card">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div><span class="tag tag-big">${esc(d.id)}</span></div>
        <div>${dueBadge(d.naechste)}</div>
      </div>
      <div class="row-title" style="font-size:19px;margin:8px 0 4px">${esc(doorLage(d) || 'ohne Lageangabe')}</div>
      <dl class="kv" style="margin-top:8px">
        <dt>Objekt</dt><dd><a href="#/objekt/${d.object_id}" style="text-decoration:underline">${esc(d.objekt)}</a></dd>
        ${d.position ? `<dt>Position</dt><dd>${esc(d.position)}</dd>` : ''}
        <dt>Typ</dt><dd>${esc(d.typ || '–')}${d.hersteller ? ' · ' + esc(d.hersteller) : ''}</dd>
        <dt>Ausführung</dt><dd>${d.zweifluegelig ? 'zweiflüglig' : 'einflüglig'} · ${d.feststellanlage ? 'mit' : 'ohne'} Feststellanlage</dd>
        <dt>Intervall</dt><dd>${d.intervall} Monate</dd>
        ${d.notiz ? `<dt>Notiz</dt><dd class="pre">${esc(d.notiz)}</dd>` : ''}
      </dl>
    </div>
    ${saved ? '' : `<a class="btn btn-primary btn-big" href="#/tuer/${enc(d.id)}/pruefen" style="margin-bottom:.875rem">✓ Prüfung erfassen</a>`}
    <div class="card">
      <div class="card-title">Letzte Prüfung</div>
      ${last ? `<a href="#/pruefung/${last.id}">
        <div>${statusBadge(last.status)} <b>${fmtDate(last.datum)}</b>${last.pruefer ? ' · ' + esc(last.pruefer) : ''}</div>
        ${last.mangel ? `<div style="margin-top:6px">${esc(last.mangel)}</div>` : ''}
        ${last.massnahme ? `<div class="muted small" style="margin-top:4px">Maßnahme: ${esc(massnahmeLabel(last.massnahme))}${last.material ? ' · Material: ' + esc(last.material) : ''}</div>` : ''}
      </a>` : '<div class="muted">Noch nie geprüft.</div>'}
      ${open.length ? `<div style="margin-top:10px"><span class="badge b-wa">${open.length} offene(r) Mangel</span></div>` : ''}
    </div>
    ${saved ? `<a class="btn btn-block" href="#/tuer/${enc(d.id)}/pruefen" style="margin-bottom:.875rem">Weitere Prüfung erfassen</a>` : ''}
    <div class="sec">Verlauf (${insp.length})</div>
    ${insp.length ? `<div class="list">${insp.map((i) => `<a class="row" href="#/pruefung/${i.id}">
      <div class="row-main">
        <div><b>${fmtDate(i.datum)}</b> ${statusBadge(i.status)}${i.status !== 'ok' ? (i.behoben ? ' <span class="badge b-ok">behoben</span>' : ' <span class="badge b-none">offen</span>') : ''}</div>
        ${i.mangel ? `<div class="small" style="margin-top:4px">${esc(i.mangel)}</div>` : ''}
        <div class="muted small">${esc(i.pruefer || '')}${i.massnahme ? ' · ' + esc(massnahmeLabel(i.massnahme)) : ''}</div>
      </div></a>`).join('')}</div>` : '<div class="empty">Keine Prüfungen.</div>'}
    <div class="sec">QR-Code</div>
    <div class="card qr-box">
      <img src="${qr}" alt="QR-Code ${esc(d.id)}">
      <div style="flex:1;display:flex;flex-direction:column;gap:8px">
        <button class="btn" id="d-qrpdf">🏷️ Etikett (PDF)</button>
        <button class="btn" id="d-qrpng">🖼️ QR als Bild</button>
      </div>
    </div>
    <div class="actions">
      <a class="btn" href="#/tuer/${enc(d.id)}/bearbeiten">✏️ Bearbeiten</a>
      <button class="btn btn-danger" id="d-del">Tür löschen</button>
    </div>`;
  if (saved) $('#d-next').onclick = startScanFlow;
  $('#d-qrpdf').onclick = async () => {
    const blob = await labelSheet([d], d.objekt);
    await saveAndShare(`QR_${safeName(d.id)}.pdf`, blob, `QR-Etikett ${d.id}`);
  };
  $('#d-qrpng').onclick = async () => {
    const url = await qrDataUrl(d.id, 800);
    await saveAndShare(`QR_${safeName(d.id)}.png`, base64ToBlob(url.split(',')[1], 'image/png'), `QR-Code ${d.id}`);
  };
  $('#d-del').onclick = async () => {
    if (!(await confirmDialog('Tür löschen?', `Tür ${d.id} und ${insp.length} Prüfung(en) werden endgültig gelöscht.`))) return;
    const photos = await repo.deleteDoor(d.id);
    await deletePhotoFiles(photos);
    afterChange();
    toast('Tür gelöscht');
    go(`#/objekt/${d.object_id}`, true);
  };
}

async function doorFormView({ params, query, view }) {
  const isNew = !params[0];
  const objects = await repo.listObjects();
  let d;
  if (isNew) {
    d = { id: query.get('id') || '', object_id: Number(query.get('objekt')) || null, position: '', geschoss: '', raum: '', typ: 'T30', hersteller: '',
      zweifluegelig: 0, feststellanlage: 0, intervall: 12, notiz: '' };
    // Objekt aus dem Präfix einer gescannten ID erraten (z. B. RM-0007 → Objekt RM)
    if (d.id && !d.object_id) {
      const pre = d.id.split('-')[0].toUpperCase();
      const match = objects.find((o) => o.kuerzel === pre);
      if (match) d.object_id = match.id;
    }
    if (!d.object_id && objects.length === 1) d.object_id = objects[0].id;
  } else {
    d = await repo.getDoor(params[0]);
    if (!d) { view.innerHTML = '<div class="empty">Tür nicht gefunden.</div>'; return; }
  }
  setTitle(isNew ? 'Neue Tür' : `Tür ${d.id} bearbeiten`);
  if (!objects.length) {
    view.innerHTML = `<div class="card"><p>Bitte zuerst ein Objekt anlegen.</p><br><a class="btn btn-primary" href="#/objekt-neu">+ Objekt anlegen</a></div>`;
    return;
  }
  const scannedId = isNew && !!d.id;
  view.innerHTML = `
    <form class="card" id="f">
      <div class="field"><label>Objekt *</label>
        <select name="object_id">${!d.object_id ? '<option value="">– bitte wählen –</option>' : ''}${objects.map((o) => `<option value="${o.id}" ${o.id === d.object_id ? 'selected' : ''}>${esc(o.name)} (${esc(o.kuerzel)})</option>`).join('')}</select></div>
      <div class="field"><label>Tür-ID (Inhalt des QR-Codes) *</label>
        <input type="text" name="id" value="${esc(d.id)}" ${!isNew || scannedId ? 'readonly' : ''} autocapitalize="characters">
        <div class="hint">${!isNew ? 'Die ID kann nachträglich nicht geändert werden (QR-Etikett).' : scannedId ? 'ID aus dem gescannten QR-Code.' : 'Wird automatisch vergeben, kann aber angepasst werden.'}</div></div>
      <div class="grid2">
        <div class="field"><label>Positionsnummer</label><input type="text" name="position" value="${esc(d.position)}" placeholder="z. B. 12"></div>
        <div class="field"><label>Geschoss</label><input type="text" name="geschoss" value="${esc(d.geschoss)}" placeholder="z. B. EG"></div>
      </div>
      <div class="field"><label>Raum / Lage</label><input type="text" name="raum" value="${esc(d.raum)}" placeholder="z. B. Treppenhaus Nord"></div>
      <div class="field"><span class="lbl">Typ</span>
        <div class="seg" id="typ">${TUERTYPEN.map((t) => `<button type="button" data-v="${t}" class="${d.typ === t ? 'on' : ''}">${t}</button>`).join('')}</div></div>
      <div class="field"><label>Hersteller</label><input type="text" name="hersteller" value="${esc(d.hersteller)}" placeholder="z. B. Hörmann"></div>
      <div class="field"><span class="lbl">Flügel</span>
        <div class="seg" id="fluegel"><button type="button" data-v="0" class="${!d.zweifluegelig ? 'on' : ''}">einflüglig</button><button type="button" data-v="1" class="${d.zweifluegelig ? 'on' : ''}">zweiflüglig</button></div></div>
      <label class="switch">Feststellanlage vorhanden <input type="checkbox" name="feststellanlage" ${d.feststellanlage ? 'checked' : ''}></label>
      <div class="field"><label>Prüfintervall (Monate)</label><input type="number" name="intervall" min="1" max="120" value="${esc(d.intervall)}" inputmode="numeric"></div>
      <div class="field"><label>Notiz</label><textarea name="notiz" rows="2">${esc(d.notiz)}</textarea></div>
      <button class="btn btn-primary btn-big" type="submit">Speichern</button>
      ${isNew ? '<button class="btn btn-block" type="button" id="save-check" style="margin-top:8px">Speichern & Prüfung erfassen</button>' : ''}
    </form>`;
  const f = $('#f');
  let typ = d.typ;
  let zwei = d.zweifluegelig ? 1 : 0;
  $$('#typ button').forEach((b) => (b.onclick = () => { typ = b.dataset.v; $$('#typ button').forEach((x) => x.classList.toggle('on', x === b)); }));
  $$('#fluegel button').forEach((b) => (b.onclick = () => { zwei = +b.dataset.v; $$('#fluegel button').forEach((x) => x.classList.toggle('on', x === b)); }));

  let idTouched = !isNew || scannedId;
  f.id.oninput = () => { idTouched = true; };
  const suggestId = async () => {
    if (idTouched) return;
    const o = objects.find((x) => x.id === Number(f.object_id.value));
    if (o) f.id.value = nextDoorId(o.kuerzel, await repo.allDoorIds());
  };
  f.object_id.onchange = suggestId;
  await suggestId();

  const save = async (thenCheck) => {
    const v = formData(f);
    const door = { ...d, ...v, id: (v.id || '').trim(), object_id: Number(v.object_id), typ, zweifluegelig: zwei, intervall: Number(v.intervall) || 12 };
    if (!door.object_id) return toast('Bitte ein Objekt wählen');
    if (!door.id) return toast('Bitte eine Tür-ID eingeben');
    if (isNew && (await repo.getDoor(door.id))) return toast(`ID ${door.id} existiert bereits`);
    await repo.saveDoor(door, isNew);
    afterChange();
    toast('Tür gespeichert');
    go(thenCheck ? `#/tuer/${enc(door.id)}/pruefen` : `#/tuer/${enc(door.id)}`, true);
  };
  f.onsubmit = (e) => { e.preventDefault(); save(false); };
  if (isNew) $('#save-check').onclick = () => save(true);
}

// =====================================================================
// Prüfdialog
// =====================================================================
async function inspectionFormView({ params, view }) {
  const editId = params[1] ? Number(params[1]) : null;
  const existing = editId ? await repo.getInspection(editId) : null;
  const doorId = existing ? existing.door_id : params[0];
  const d = await repo.getDoor(doorId);
  if (!d) { view.innerHTML = '<div class="empty">Tür nicht gefunden.</div>'; return; }
  setTitle(existing ? 'Prüfung bearbeiten' : 'Prüfung erfassen', `${d.id} · ${doorLage(d)}`);

  const items = existing
    ? existing.checklist.map((c) => ({ ...c }))
    : checklistFor(d, await repo.getChecklist()).map((c) => ({ label: c.label, ergebnis: 'ok' }));
  const pruefer = existing ? existing.pruefer : await repo.getSetting('pruefer', '');
  const st = {
    status: existing ? existing.status : 'ok',
    massnahme: existing ? existing.massnahme : '',
    datum: existing ? existing.datum : today(),
    naechsteManual: !!existing,
    photos: existing ? (await repo.listPhotos(existing.id)).map((p) => ({ ...p })) : [],
    newPhotos: [],
    removedPhotos: [],
  };

  view.innerHTML = `
    <div class="card" style="padding:12px 14px">
      <span class="tag">${esc(d.id)}</span> <span class="typ">${esc(d.typ || '–')}</span>
      <div class="row-title">${esc(doorLage(d) || '–')}</div>
      <div class="muted small">${esc(d.objekt)}${d.position ? ' · Pos. ' + esc(d.position) : ''} · ${d.zweifluegelig ? 'zweiflüglig' : 'einflüglig'}${d.feststellanlage ? ' · Feststellanlage' : ''}</div>
    </div>
    ${existing ? '' : `<button class="allok" id="allok"><span style="font-size:28px">✓</span>Alles in Ordnung</button>
    <div class="allok-hint">Ein Tipp: alle Punkte i.O., speichern, fertig.</div>`}
    <div class="card">
      <div class="sec" style="margin-top:0">Ergebnis</div>
      <div class="status-grid" id="status">
        <button class="sbtn ok" data-v="ok"><span class="ico">✅</span>in Ordnung</button>
        <button class="sbtn mangel" data-v="mangel"><span class="ico">⚠️</span>Mangel</button>
        <button class="sbtn ausser_betrieb" data-v="ausser_betrieb"><span class="ico">⛔</span>außer Betrieb</button>
      </div>
    </div>
    <div class="card">
      <div class="sec" style="margin-top:0">Checkliste</div>
      <div id="chk">${items.map((c, n) => `<div class="chk" data-n="${n}">
        <div class="chk-lbl">${esc(c.label)}</div>
        <div class="chk-btns">
          <button type="button" data-v="ok">i.O.</button><button type="button" data-v="mangel">Mangel</button><button type="button" data-v="na">entf.</button>
        </div></div>`).join('') || '<div class="muted">Keine Checklistenpunkte.</div>'}</div>
    </div>
    <div class="card" id="mangel-box">
      <div class="sec" style="margin-top:0">Mangel</div>
      <div class="field"><label>Mangelbeschreibung</label><textarea id="mangel" rows="3" placeholder="Was ist defekt?">${esc(existing?.mangel || '')}</textarea></div>
      <div class="field"><span class="lbl">Maßnahme</span>
        <div class="seg" id="massnahme">${Object.entries(MASSNAHMEN).map(([k, v]) => `<button type="button" data-v="${k}">${esc(v)}</button>`).join('')}</div></div>
      <div class="field"><label>Material / Bestellposition</label><input type="text" id="material" value="${esc(existing?.material || '')}" placeholder="z. B. Obentürschließer TS 4000, Dichtung 5 m"></div>
      <div class="field"><span class="lbl">Fotos</span>
        <div class="photos" id="photos"></div>
        <button class="btn btn-block" type="button" id="add-photo" style="margin-top:8px">📷 Foto aufnehmen</button></div>
    </div>
    <div class="card">
      <div class="grid2">
        <div class="field"><label>Prüfdatum</label><input type="date" id="datum" value="${esc(st.datum)}"></div>
        <div class="field"><label>Nächste Prüfung</label><input type="date" id="naechste" value="${esc(existing ? existing.naechste : addMonths(st.datum, d.intervall))}"></div>
      </div>
      <div class="hint" style="margin:-8px 0 12px">Nächste Prüfung = Prüfdatum + ${d.intervall} Monate (änderbar).</div>
      <div class="field" style="margin-bottom:0"><label>Prüfer</label><input type="text" id="pruefer" value="${esc(pruefer)}" placeholder="Name"></div>
    </div>
    <div class="sticky-save"><button class="btn btn-primary btn-big" id="save">Prüfung speichern</button></div>`;

  const paintStatus = () => {
    $$('#status .sbtn').forEach((b) => b.classList.toggle('on', b.dataset.v === st.status));
    $('#mangel-box').style.display = st.status === 'ok' ? 'none' : '';
  };
  const paintChk = () => {
    $$('#chk .chk').forEach((row) => {
      const it = items[+row.dataset.n];
      $$('button', row).forEach((b) => b.classList.toggle('on', b.dataset.v === it.ergebnis));
    });
  };
  const paintMassnahme = () => $$('#massnahme button').forEach((b) => b.classList.toggle('on', b.dataset.v === st.massnahme));
  const paintPhotos = async () => {
    const box = $('#photos');
    const list = [...st.photos.filter((p) => !st.removedPhotos.includes(p.path)).map((p) => p.path), ...st.newPhotos];
    const urls = await Promise.all(list.map(photoDataUrl));
    box.innerHTML = list.map((p, n) => `<div class="ph"><img src="${urls[n] || ''}" alt="Foto"><button type="button" class="ph-del" data-p="${esc(p)}">✕</button></div>`).join('');
    $$('.ph-del', box).forEach((b) => (b.onclick = () => {
      const p = b.dataset.p;
      if (st.newPhotos.includes(p)) { st.newPhotos = st.newPhotos.filter((x) => x !== p); deletePhotoFiles([p]); }
      else st.removedPhotos.push(p);
      paintPhotos();
    }));
  };

  $$('#status .sbtn').forEach((b) => (b.onclick = () => { st.status = b.dataset.v; paintStatus(); }));
  $$('#chk .chk').forEach((row) => $$('button', row).forEach((b) => (b.onclick = () => {
    items[+row.dataset.n].ergebnis = b.dataset.v;
    if (b.dataset.v === 'mangel' && st.status === 'ok') st.status = 'mangel';
    if (st.status === 'mangel' && !items.some((i) => i.ergebnis === 'mangel') && !$('#mangel').value.trim()) st.status = 'ok';
    paintChk(); paintStatus();
  })));
  $$('#massnahme button').forEach((b) => (b.onclick = () => { st.massnahme = st.massnahme === b.dataset.v ? '' : b.dataset.v; paintMassnahme(); }));
  $('#datum').onchange = () => {
    st.datum = $('#datum').value || today();
    if (!st.naechsteManual) $('#naechste').value = addMonths(st.datum, d.intervall);
  };
  $('#naechste').onchange = () => { st.naechsteManual = true; };
  $('#add-photo').onclick = async () => {
    const p = await takePhoto();
    if (p) { st.newPhotos.push(p); paintPhotos(); }
  };
  paintStatus(); paintChk(); paintMassnahme(); paintPhotos();

  // Verlassen ohne Speichern → neu aufgenommene Fotos verwerfen
  let saved = false;
  const cleanup = () => {
    window.removeEventListener('hashchange', cleanup);
    if (!saved && st.newPhotos.length) deletePhotoFiles(st.newPhotos);
  };
  window.addEventListener('hashchange', cleanup);

  const save = async (allOk) => {
    if (allOk) { items.forEach((i) => { if (i.ergebnis !== 'na') i.ergebnis = 'ok'; }); st.status = 'ok'; }
    const datum = $('#datum').value || today();
    const insp = {
      id: existing?.id,
      door_id: d.id,
      datum,
      pruefer: $('#pruefer').value.trim(),
      status: st.status,
      checklist: items,
      mangel: st.status === 'ok' ? '' : $('#mangel').value.trim(),
      massnahme: st.status === 'ok' ? '' : st.massnahme,
      material: st.status === 'ok' ? '' : $('#material').value.trim(),
      naechste: $('#naechste').value || addMonths(datum, d.intervall),
      behoben: existing?.behoben || 0,
      behoben_datum: existing?.behoben_datum || '',
      bemerkung: existing?.bemerkung || '',
    };
    if (insp.status !== 'ok' && !insp.mangel) {
      const failed = items.filter((i) => i.ergebnis === 'mangel').map((i) => i.label);
      if (failed.length) insp.mangel = 'Mangel: ' + failed.join(', ');
      else { toast('Bitte den Mangel beschreiben'); $('#mangel').focus(); return; }
    }
    if (insp.massnahme === 'vor_ort') { insp.behoben = 1; insp.behoben_datum = insp.behoben_datum || datum; }
    if (insp.status === 'ok') { insp.behoben = 0; insp.behoben_datum = ''; }

    // Ältere offene Mängel dieser Tür bei OK-Prüfung als behoben markieren?
    let fixIds = [];
    if (!existing && insp.status === 'ok') {
      const open = (await repo.listInspections(d.id)).filter((i) => i.status !== 'ok' && !i.behoben);
      if (open.length) {
        const ans = await dialog({
          title: 'Offene Mängel',
          html: `<p>Für diese Tür ${open.length === 1 ? 'ist 1 Mangel' : `sind ${open.length} Mängel`} offen:</p><p class="small">${open.map((i) => `• ${fmtDate(i.datum)}: ${esc(i.mangel || STATUS[i.status])}`).join('<br>')}</p><p>Als behoben markieren (${fmtDate(datum)})?</p>`,
          buttons: [{ label: 'Nein, offen lassen', value: 'no' }, { label: 'Ja, behoben', value: 'yes', cls: 'btn-ok' }],
        });
        if (ans === undefined) return;
        if (ans === 'yes') fixIds = open.map((i) => i.id);
      }
    }

    const id = await repo.saveInspection(insp);
    if (fixIds.length) await repo.markFixed(fixIds, datum);
    for (const p of st.newPhotos) await repo.addPhoto(id, p);
    for (const p of st.photos.filter((x) => st.removedPhotos.includes(x.path))) await repo.deletePhoto(p.id);
    await deletePhotoFiles(st.removedPhotos);
    saved = true;
    if (insp.pruefer) await repo.setSetting('pruefer', insp.pruefer);
    afterChange();
    if (existing) { toast('Gespeichert'); go(`#/pruefung/${id}`, true); }
    else go(`#/tuer/${enc(d.id)}?gespeichert=1`, true);
  };
  if (!existing) $('#allok').onclick = () => save(true);
  $('#save').onclick = () => save(false);
}

async function inspectionView({ params, view }) {
  const i = await repo.getInspection(Number(params[0]));
  if (!i) { view.innerHTML = '<div class="empty">Prüfung nicht gefunden.</div>'; return; }
  const d = await repo.getDoor(i.door_id);
  setTitle(`Prüfung ${fmtDate(i.datum)}`, `${i.door_id}${d ? ' · ' + doorLage(d) : ''}`);
  const photos = await repo.listPhotos(i.id);
  const resLabel = { ok: 'i.O.', mangel: 'Mangel', na: 'entfällt' };
  view.innerHTML = `
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <a class="tag tag-big" href="#/tuer/${enc(i.door_id)}">${esc(i.door_id)}</a> ${statusBadge(i.status)}
      </div>
      <dl class="kv" style="margin-top:12px">
        <dt>Datum</dt><dd>${fmtDate(i.datum)}</dd>
        <dt>Prüfer</dt><dd>${esc(i.pruefer || '–')}</dd>
        <dt>Nächste</dt><dd>${fmtDate(i.naechste)}</dd>
        ${d ? `<dt>Objekt</dt><dd>${esc(d.objekt)}</dd>` : ''}
        ${i.status !== 'ok' ? `
          <dt>Mangel</dt><dd class="pre">${esc(i.mangel || '–')}</dd>
          <dt>Maßnahme</dt><dd>${esc(massnahmeLabel(i.massnahme) || '–')}</dd>
          <dt>Material</dt><dd>${esc(i.material || '–')}</dd>
          <dt>Behoben</dt><dd>${i.behoben ? `<span class="badge b-ok">ja, ${fmtDate(i.behoben_datum)}</span>` : '<span class="badge b-wa">nein</span>'}</dd>` : ''}
        ${i.bemerkung ? `<dt>Bemerkung</dt><dd class="pre">${esc(i.bemerkung)}</dd>` : ''}
      </dl>
    </div>
    ${i.status !== 'ok' && !i.behoben ? '<button class="btn btn-ok btn-big" id="fix" style="margin-bottom:.875rem">✓ Mangel behoben</button>' : ''}
    ${i.status !== 'ok' && i.behoben ? '<button class="btn btn-block" id="unfix" style="margin-bottom:.875rem">Wieder als offen markieren</button>' : ''}
    <div class="card">
      <div class="card-title">Checkliste</div>
      ${i.checklist.length ? i.checklist.map((c) => `<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid var(--b)"><span>${esc(c.label)}</span><span class="res-${c.ergebnis}">${resLabel[c.ergebnis] || ''}</span></div>`).join('') : '<div class="muted">Keine Angaben.</div>'}
    </div>
    ${photos.length ? `<div class="card"><div class="card-title">Fotos</div><div class="photos" id="photos"></div></div>` : ''}
    <div class="actions">
      <a class="btn" href="#/pruefung/${i.id}/bearbeiten">✏️ Bearbeiten</a>
      <button class="btn btn-danger" id="del">Löschen</button>
    </div>`;
  if (photos.length) {
    const urls = await Promise.all(photos.map((p) => photoDataUrl(p.path)));
    $('#photos').innerHTML = urls.map((u, n) => `<div class="ph"><img src="${u || ''}" alt="Foto ${n + 1}" data-n="${n}"></div>`).join('');
    $$('#photos img').forEach((img) => (img.onclick = () => dialog({ html: `<img src="${img.src}" style="width:100%;border-radius:8px">`, buttons: [{ label: 'Schließen', value: true }] })));
  }
  const fix = $('#fix');
  if (fix) fix.onclick = async () => {
    const res = await dialog({
      title: 'Mangel behoben',
      html: `<div class="field"><label>Behoben am</label><input type="date" id="fix-date" value="${today()}"></div>`,
      buttons: [{ label: 'Abbrechen', value: null }, { label: 'Speichern', value: 'ok', cls: 'btn-ok' }],
      withFields: true,
    });
    if (res.value !== 'ok') return;
    const dt = res.fields['fix-date'] || today();
    await repo.markFixed([i.id], dt);
    afterChange();
    toast('Als behoben markiert');
    rerender();
  };
  const unfix = $('#unfix');
  if (unfix) unfix.onclick = async () => {
    await repo.saveInspection({ ...i, behoben: 0, behoben_datum: '' });
    afterChange();
    rerender();
  };
  $('#del').onclick = async () => {
    if (!(await confirmDialog('Prüfung löschen?', `Prüfung vom ${fmtDate(i.datum)} für Tür ${i.door_id} wird gelöscht.`))) return;
    const ph = await repo.deleteInspection(i.id);
    await deletePhotoFiles(ph);
    afterChange();
    toast('Prüfung gelöscht');
    go(`#/tuer/${enc(i.door_id)}`, true);
  };
}

// =====================================================================
// Suche
// =====================================================================
async function searchView({ view }) {
  setTitle('Tür suchen', 'ID, Positionsnummer, Geschoss oder Raum', false);
  view.innerHTML = `
    <div class="field"><input type="search" id="q" placeholder="z. B. RM-0007, 12 oder Treppenhaus" autocomplete="off"></div>
    <div id="res"></div>`;
  const q = $('#q');
  const res = $('#res');
  let t = null;
  const run = async () => {
    const v = q.value.trim();
    if (!v) { res.innerHTML = '<div class="empty">Suchbegriff eingeben.</div>'; return; }
    const rows = await repo.searchDoors(v);
    res.innerHTML = (rows.length ? `<div class="list">${rows.map((d) => doorRow(d)).join('')}</div>` : '<div class="empty">Keine Tür gefunden.</div>')
      + (!rows.length && v.length >= 3
        ? `<button class="btn btn-block" id="new-id">+ Tür mit ID „${esc(v)}“ anlegen</button>` : '');
    const n = $('#new-id');
    if (n) n.onclick = () => go(`#/tuer-neu?id=${enc(v)}`);
  };
  q.oninput = () => { clearTimeout(t); t = setTimeout(run, 150); };
  q.onkeydown = async (e) => {
    if (e.key === 'Enter') {
      const v = q.value.trim();
      const d = v && (await repo.findDoor(v));
      if (d) go(`#/tuer/${enc(d.id)}`);
    }
  };
  run();
  setTimeout(() => q.focus(), 50);
}

// =====================================================================
// Mehr: Export, Backup, Import, Einstellungen
// =====================================================================
async function moreView({ view }) {
  setTitle('Export, Backup & Einstellungen', '', false);
  const objects = await repo.listObjects();
  const files = await listExports();
  view.innerHTML = `
    <div class="card">
      <div class="card-title">📊 Excel-Export (.xlsx)</div>
      <p class="muted small" style="margin-bottom:10px">Blätter: Türen, Prüfungen, offene Mängel, Bestellliste.</p>
      <div class="field"><select id="x-obj"><option value="">Alle Objekte</option>${objects.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join('')}</select></div>
      <button class="btn btn-primary btn-block" id="x-go">Excel erstellen & teilen</button>
    </div>
    <div class="card">
      <div class="card-title">💾 Datensicherung</div>
      <p class="muted small" style="margin-bottom:10px">Backup als JSON-Datei inkl. Fotos. Regelmäßig erstellen und z. B. per Mail oder Google Drive sichern!</p>
      <button class="btn btn-primary btn-block" id="b-make" style="margin-bottom:8px">Backup erstellen & teilen</button>
      <button class="btn btn-block" id="b-restore">Backup wiederherstellen …</button>
    </div>
    <div class="card">
      <div class="card-title">⬇️ Import aus alter Web-Version</div>
      <p class="muted small" style="margin-bottom:10px">In der alten Web-App unter <b>Verwaltung → Prüfprotokoll → „Daten für Android-App exportieren“</b> eine JSON-Datei erzeugen und hier auswählen. Vorhandene Tür-IDs werden übersprungen.</p>
      <button class="btn btn-block" id="l-import">Datei der Web-Version importieren …</button>
    </div>
    <div class="card">
      <div class="card-title">📁 Gespeicherte Dateien (${files.length})</div>
      ${files.length ? `<div>${files.slice(0, 30).map((f) => `<div style="display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--b)">
        <div style="flex:1;min-width:0;font-size:14px;overflow-wrap:anywhere">${esc(f.name)}<div class="muted small">${f.size ? Math.max(1, Math.round(f.size / 1024)) + ' KB' : ''}</div></div>
        <button class="btn" data-share="${esc(f.name)}" style="min-height:40px;padding:8px 10px">Teilen</button>
        <button class="btn btn-danger" data-del="${esc(f.name)}" style="min-height:40px;padding:8px 10px">✕</button></div>`).join('')}</div>`
      : '<div class="muted small">Noch keine Dateien.</div>'}
    </div>
    <div class="card">
      <div class="card-title">⚙️ Einstellungen</div>
      <div class="field"><label>Prüfer (Vorbelegung)</label><input type="text" id="s-pruefer" value="${esc(await repo.getSetting('pruefer', ''))}"></div>
      <div class="field"><label>Firma (für Prüfbericht)</label><input type="text" id="s-firma" value="${esc(await repo.getSetting('firma', ''))}"></div>
      <a class="btn btn-block" href="#/checkliste" style="margin-bottom:8px">Checkliste bearbeiten</a>
      ${await notificationSettingsHtml()}
    </div>
    <p class="muted small" style="text-align:center;margin:1rem 0">Brandschutz-Prüfung · Version ${__APP_VERSION__}</p>`;

  $('#x-go').onclick = async () => {
    const id = Number($('#x-obj').value) || null;
    const o = objects.find((x) => x.id === id);
    toast('Excel wird erstellt …');
    const blob = await buildExcel(id);
    await saveAndShare(`Brandschutz_${o ? safeName(o.kuerzel) : 'alle'}_${stamp()}.xlsx`, blob, 'Excel-Export');
  };
  $('#b-make').onclick = async () => {
    toast('Backup wird erstellt …');
    const blob = await buildBackup();
    await saveAndShare(`Brandschutz_Backup_${stamp()}.json`, blob, 'Brandschutz-Backup');
  };
  const readJson = async () => {
    const file = await pickFile('application/json,.json,text/plain,*/*');
    if (!file) return null;
    try { return JSON.parse(await file.text()); }
    catch (e) { await alertDialog('Datei ungültig', 'Die Datei ist keine gültige JSON-Datei.'); return null; }
  };
  $('#b-restore').onclick = async () => {
    const obj = await readJson();
    if (!obj) return;
    const fmt = detectFormat(obj);
    if (fmt === 'legacy') return alertDialog('Falscher Import', 'Das ist eine Datei der alten Web-Version. Bitte „Datei der Web-Version importieren“ verwenden.');
    if (fmt !== 'backup') return alertDialog('Unbekannte Datei', 'Die Datei ist kein Backup dieser App.');
    if (!(await confirmDialog('Backup wiederherstellen?', `Backup vom ${new Date(obj.exported_at).toLocaleString('de-DE')} mit ${obj.doors.length} Türen und ${obj.inspections.length} Prüfungen. ALLE aktuellen Daten in der App werden ersetzt!`, 'Wiederherstellen'))) return;
    const r = await restoreBackup(obj);
    afterChange();
    await alertDialog('Wiederhergestellt', `${r.objekte} Objekte, ${r.tueren} Türen, ${r.pruefungen} Prüfungen, ${r.fotos} Fotos.`);
    go('#/', true);
  };
  $('#l-import').onclick = async () => {
    const obj = await readJson();
    if (!obj) return;
    const fmt = detectFormat(obj);
    if (fmt === 'backup') return alertDialog('Falscher Import', 'Das ist ein Backup dieser App. Bitte „Backup wiederherstellen“ verwenden.');
    if (fmt !== 'legacy') return alertDialog('Unbekannte Datei', 'In der Datei wurden keine Daten der alten Web-Version gefunden (bs_doors / bs_checks).');
    const r = await importLegacyData(obj);
    afterChange();
    await alertDialog('Import abgeschlossen', `${r.objekte} Objekte, ${r.tueren} Türen und ${r.pruefungen} Prüfungen übernommen.${r.uebersprungen ? ` ${r.uebersprungen} Türen übersprungen (ID bereits vorhanden).` : ''}`);
    go('#/objekte');
  };
  $$('[data-share]').forEach((b) => (b.onclick = () => shareFile(b.dataset.share).catch(() => {})));
  $$('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!(await confirmDialog('Datei löschen?', b.dataset.del))) return;
    await deleteExport(b.dataset.del);
    rerender();
  }));
  $('#s-pruefer').onchange = (e) => repo.setSetting('pruefer', e.target.value.trim()).then(() => toast('Gespeichert'));
  $('#s-firma').onchange = (e) => repo.setSetting('firma', e.target.value.trim()).then(() => toast('Gespeichert'));
  bindNotificationSettings();
}

async function checklistView({ view }) {
  setTitle('Checkliste bearbeiten');
  let items = (await repo.getChecklist()).map((c) => ({ ...c }));
  const paint = () => {
    view.innerHTML = `
      <p class="muted small" style="margin-bottom:10px">Änderungen gelten für neue Prüfungen. Bereits gespeicherte Prüfungen bleiben unverändert.</p>
      <div class="card" id="ce">${items.map((c, n) => `<div class="ce-row" data-n="${n}">
        <div><input type="text" class="ce-label" value="${esc(c.label)}">
          <select class="ce-cond" style="margin-top:6px">${Object.entries(BEDINGUNGEN).map(([k, v]) => `<option value="${k}" ${c.bedingung === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
        <div class="ce-tools" style="flex-direction:column">
          <button type="button" data-a="up" aria-label="nach oben">▲</button>
          <button type="button" data-a="down" aria-label="nach unten">▼</button>
          <button type="button" data-a="del" aria-label="löschen" style="color:var(--da)">✕</button>
        </div></div>`).join('') || '<div class="muted">Keine Punkte.</div>'}</div>
      <button class="btn btn-block" id="ce-add" style="margin-bottom:8px">+ Punkt hinzufügen</button>
      <button class="btn btn-primary btn-big" id="ce-save" style="margin-bottom:8px">Speichern</button>
      <button class="btn btn-block" id="ce-reset">Standard wiederherstellen</button>`;
    const sync = () => $$('.ce-row').forEach((r) => {
      const it = items[+r.dataset.n];
      it.label = $('.ce-label', r).value;
      it.bedingung = $('.ce-cond', r).value;
    });
    $$('.ce-row').forEach((r) => $$('button', r).forEach((b) => (b.onclick = () => {
      sync();
      const n = +r.dataset.n;
      if (b.dataset.a === 'del') items.splice(n, 1);
      if (b.dataset.a === 'up' && n > 0) [items[n - 1], items[n]] = [items[n], items[n - 1]];
      if (b.dataset.a === 'down' && n < items.length - 1) [items[n + 1], items[n]] = [items[n], items[n + 1]];
      paint();
    })));
    $('#ce-add').onclick = () => { sync(); items.push({ label: '', bedingung: 'immer' }); paint(); $$('.ce-label').pop().focus(); };
    $('#ce-save').onclick = async () => {
      sync();
      items = items.filter((i) => i.label.trim()).map((i) => ({ label: i.label.trim(), bedingung: i.bedingung }));
      await repo.setSetting('checklist', items);
      toast('Checkliste gespeichert');
      history.back();
    };
    $('#ce-reset').onclick = async () => {
      if (!(await confirmDialog('Standard wiederherstellen?', 'Die Checkliste wird auf die Standardpunkte zurückgesetzt.', 'Zurücksetzen', false))) return;
      items = DEFAULT_CHECKLIST.map((c) => ({ ...c }));
      paint();
    };
  };
  paint();
}

// =====================================================================
// Routen: [Regex, Handler, aktiver Tab]
// =====================================================================
export const routes = [
  [/^\/$/, homeView, 'home'],
  [/^\/liste\/(\w+)$/, listView, 'home'],
  [/^\/objekte$/, objectsView, 'objekte'],
  [/^\/objekt-neu$/, objectFormView, 'objekte'],
  [/^\/objekt\/(\d+)$/, objectView, 'objekte'],
  [/^\/objekt\/(\d+)\/bearbeiten$/, objectFormView, 'objekte'],
  [/^\/tuer-neu$/, doorFormView, 'objekte'],
  [/^\/tuer\/([^/]+)$/, doorView, 'objekte'],
  [/^\/tuer\/([^/]+)\/bearbeiten$/, doorFormView, 'objekte'],
  [/^\/tuer\/([^/]+)\/pruefen$/, inspectionFormView, 'objekte'],
  [/^\/pruefung\/(\d+)$/, inspectionView, 'objekte'],
  [/^\/pruefung\/(\d+)\/bearbeiten$/, (ctx) => inspectionFormView({ ...ctx, params: [null, ctx.params[0]] }), 'objekte'],
  [/^\/suche$/, searchView, 'suche'],
  [/^\/mehr$/, moreView, 'mehr'],
  [/^\/checkliste$/, checklistView, 'mehr'],
];
