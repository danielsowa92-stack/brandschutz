// QR-Codes und PDF-Erzeugung (Etikettenbogen, Prüfbericht)
import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { STATUS, MASSNAHMEN, fmtDate, isoDate, dueState } from './logic.js';

export const qrDataUrl = (text, width = 480) =>
  QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width, color: { dark: '#000000', light: '#ffffff' } });

const lage = (d) => [d.geschoss, d.raum].filter(Boolean).join(' / ');

// Etikettenformat: A4, 3 × 8 Etiketten à 70 × 37 mm (z. B. Avery Zweckform 3474)
const LABEL = { cols: 3, rows: 8, w: 70, h: 37, left: 0, top: 0.5 };

/** Druckbogen mit QR-Etiketten für mehrere Türen → Blob */
export async function labelSheet(doors, objekt) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const perPage = LABEL.cols * LABEL.rows;
  for (let i = 0; i < doors.length; i++) {
    if (i > 0 && i % perPage === 0) doc.addPage();
    const n = i % perPage;
    const x = LABEL.left + (n % LABEL.cols) * LABEL.w;
    const y = LABEL.top + Math.floor(n / LABEL.cols) * LABEL.h;
    await drawLabel(doc, doors[i], x, y, objekt);
  }
  return doc.output('blob');
}

async function drawLabel(doc, d, x, y, objekt) {
  const qr = await qrDataUrl(d.id, 360);
  const q = 29;
  doc.addImage(qr, 'PNG', x + 3, y + (LABEL.h - q) / 2, q, q);
  // dünner Schnittrahmen
  doc.setDrawColor(220);
  doc.setLineWidth(0.1);
  doc.rect(x + 0.5, y + 0.5, LABEL.w - 1, LABEL.h - 1);
  const tx = x + q + 5;
  const tw = LABEL.w - q - 7;
  let ty = y + 8;
  doc.setTextColor(0);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(doc.splitTextToSize(d.id, tw).slice(0, 2), tx, ty);
  ty += d.id.length > 14 ? 9 : 5;
  doc.setFontSize(9);
  if (d.position) { doc.text(`Pos. ${d.position}`, tx, ty); ty += 4.5; }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const l = doc.splitTextToSize(lage(d), tw).slice(0, 3);
  if (l.length) { doc.text(l, tx, ty); ty += l.length * 3.5; }
  if (d.typ) { doc.text(d.typ, tx, ty); ty += 3.5; }
  doc.setFontSize(6.5);
  doc.setTextColor(110);
  doc.text(doc.splitTextToSize(objekt || d.objekt || '', tw).slice(0, 1), tx, y + LABEL.h - 4);
}

/** Einzeletikett (eine Seite, 1 Etikett links oben) */
export const singleLabel = (door) => labelSheet([door]);

// ---------- Prüfbericht für den Kunden ----------
/**
 * object: Objekt, doors: Türen (mit last_* und naechste), inspectionsByDoor: Map(doorId → Prüfungen absteigend),
 * defects: offene Mängel, opts: { pruefer, firma, photos: Map(inspectionId → [dataUrl]) }
 */
export function reportPdf(object, doors, inspectionsByDoor, defects, opts = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const red = [200, 56, 30];
  const today = isoDate();

  doc.setFillColor(...red);
  doc.rect(0, 0, W, 22, 'F');
  doc.setTextColor(255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Prüfbericht Feuer- und Rauchschutztüren', 14, 14);
  doc.setTextColor(0);
  doc.setFontSize(11);
  let y = 32;
  const line = (label, val) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 14, y);
    doc.setFont('helvetica', 'normal');
    const t = doc.splitTextToSize(String(val || '–'), 140);
    doc.text(t, 52, y);
    y += 6 * t.length;
  };
  line('Objekt:', `${object.name} (${object.kuerzel})`);
  line('Kunde:', object.kunde);
  line('Adresse:', object.adresse);
  if (opts.firma) line('Prüfbetrieb:', opts.firma);
  line('Berichtsdatum:', fmtDate(today));

  const counts = { ok: 0, mangel: 0, ausser_betrieb: 0, nie: 0 };
  doors.forEach((d) => { counts[d.last_status || 'nie']++; });
  const ueber = doors.filter((d) => dueState(d.naechste, today) === 'ueberfaellig').length;
  y += 2;
  line('Zusammenfassung:', `${doors.length} Türen · ${counts.ok} in Ordnung · ${counts.mangel} mit Mangel · ${counts.ausser_betrieb} außer Betrieb · ${counts.nie} noch nicht geprüft · ${ueber} überfällig · ${defects.length} offene Mängel`);

  autoTable(doc, {
    startY: y + 4,
    head: [['Tür-ID', 'Pos.', 'Lage', 'Typ', 'Letzte Prüfung', 'Ergebnis', 'Prüfer', 'Nächste Prüfung']],
    body: doors.map((d) => {
      const last = (inspectionsByDoor.get(d.id) || [])[0];
      return [d.id, d.position || '', lage(d), d.typ || '', last ? fmtDate(last.datum) : '–',
        last ? STATUS[last.status] + (last.status !== 'ok' && last.behoben ? ` (behoben ${fmtDate(last.behoben_datum)})` : '') : 'nicht geprüft', last?.pruefer || '', d.naechste ? fmtDate(d.naechste) : '–'];
    }),
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: red },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 5) {
        const v = data.cell.raw;
        if (String(v).startsWith(STATUS.mangel) && !String(v).includes('behoben')) data.cell.styles.textColor = [124, 74, 10];
        if (String(v).startsWith(STATUS.ausser_betrieb) && !String(v).includes('behoben')) data.cell.styles.textColor = [163, 45, 45];
      }
    },
  });

  let photosAdded = false;
  if (defects.length) {
    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Offene Mängel', 14, 18);
    autoTable(doc, {
      startY: 23,
      head: [['Tür-ID', 'Lage', 'Datum', 'Status', 'Mangel', 'Maßnahme', 'Material']],
      body: defects.map((i) => [i.door_id, lage(i), fmtDate(i.datum), STATUS[i.status], i.mangel || '', MASSNAHMEN[i.massnahme] || '', i.material || '']),
      styles: { fontSize: 8, cellPadding: 1.5 },
      headStyles: { fillColor: red },
      columnStyles: { 4: { cellWidth: 55 } },
    });
    const photos = opts.photos || new Map();
    const withPhotos = defects.filter((i) => (photos.get(i.id) || []).length);
    if (withPhotos.length) {
      photosAdded = true;
      doc.addPage();
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Fotos zu den Mängeln', 14, 18);
      let py = 26;
      for (const i of withPhotos) {
        if (py > 230) { doc.addPage(); py = 18; }
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(`${i.door_id} – ${fmtDate(i.datum)}: ${String(i.mangel || '').slice(0, 90)}`, 14, py);
        py += 3;
        let px = 14;
        for (const src of photos.get(i.id).slice(0, 3)) {
          try { doc.addImage(src, 'JPEG', px, py, 58, 43.5); } catch (e) { /* Bild nicht lesbar */ }
          px += 61;
        }
        py += 50;
      }
    }
  }

  // Unterschriften (Prüfer / Auftraggeber)
  if (opts.sigPruefer || opts.sigKunde) {
    // direkt unter der letzten Tabelle, sonst (Fotoseite oder zu wenig Platz) auf neuer Seite
    let y0 = photosAdded ? 0 : (doc.lastAutoTable?.finalY || 0) + 14;
    if (!y0 || y0 > 225) { doc.addPage(); y0 = 24; }
    doc.setTextColor(0);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text('Bestätigung', 14, y0);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(doc.splitTextToSize(`Die Prüfung der oben aufgeführten Türen im Objekt ${object.name} wurde durchgeführt. Festgestellte Mängel sind im Bericht aufgeführt.`, 182), 14, y0 + 6);
    const box = (x, label, sig) => {
      const by = y0 + 16;
      if (sig?.dataUrl) {
        try {
          const p = doc.getImageProperties(sig.dataUrl);
          const maxW = 75, maxH = 26;
          const k = Math.min(maxW / p.width, maxH / p.height);
          doc.addImage(sig.dataUrl, 'PNG', x, by + (maxH - p.height * k), p.width * k, p.height * k);
        } catch (e) { /* Bild fehlerhaft */ }
      }
      doc.setDrawColor(80);
      doc.setLineWidth(0.3);
      doc.line(x, by + 28, x + 80, by + 28);
      doc.setFontSize(8);
      doc.setTextColor(90);
      doc.text(`${label}${sig?.name ? ': ' + sig.name : ''}`, x, by + 32);
      doc.text(`Datum: ${fmtDate(today)}`, x, by + 36);
      doc.setTextColor(0);
    };
    box(14, 'Prüfer', opts.sigPruefer);
    box(112, 'Auftraggeber / Kunde', opts.sigKunde);
  }

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(120);
    doc.text(`${object.name} · Prüfbericht vom ${fmtDate(today)}${opts.pruefer ? ' · Prüfer: ' + opts.pruefer : ''}`, 14, 290);
    doc.text(`Seite ${p} von ${pages}`, W - 14, 290, { align: 'right' });
  }
  return doc.output('blob');
}
