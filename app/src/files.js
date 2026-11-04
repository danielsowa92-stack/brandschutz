// Dateien in der App speichern (Ordner "exporte") und über das Android-Teilen-Menü versenden
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export const EXPORT_DIR = 'exporte';
const native = () => Capacitor.isNativePlatform();

export async function blobToBase64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}

export function base64ToBlob(b64, type = 'application/octet-stream') {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

/** Datei speichern; liefert {name, uri}. Im Browser zusätzlich Download. */
export async function saveFile(name, blob) {
  const data = await blobToBase64(blob);
  const res = await Filesystem.writeFile({ path: `${EXPORT_DIR}/${name}`, data, directory: Directory.Data, recursive: true });
  if (!native()) downloadBlob(name, blob);
  return { name, uri: res.uri };
}

export function downloadBlob(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

export async function shareFile(name, title = name) {
  const { uri } = await Filesystem.getUri({ path: `${EXPORT_DIR}/${name}`, directory: Directory.Data });
  if (!native()) {
    const r = await Filesystem.readFile({ path: `${EXPORT_DIR}/${name}`, directory: Directory.Data });
    downloadBlob(name, base64ToBlob(r.data));
    return;
  }
  await Share.share({ title, files: [uri], dialogTitle: 'Datei senden' });
}

/** Speichern und direkt das Teilen-Menü öffnen */
export async function saveAndShare(name, blob, title) {
  await saveFile(name, blob);
  if (native()) {
    try { await shareFile(name, title); } catch (e) { /* Teilen abgebrochen */ }
  }
}

export async function listExports() {
  try {
    const r = await Filesystem.readdir({ path: EXPORT_DIR, directory: Directory.Data });
    return r.files
      .filter((f) => f.type !== 'directory')
      .map((f) => ({ name: f.name, size: f.size, mtime: f.mtime }))
      .sort((a, b) => (b.mtime || 0) - (a.mtime || 0));
  } catch (e) {
    return [];
  }
}

export async function deleteExport(name) {
  await Filesystem.deleteFile({ path: `${EXPORT_DIR}/${name}`, directory: Directory.Data });
}

/** Datei aus Dateiauswahl lesen (Text) */
export function pickFile(accept) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.onchange = () => resolve(inp.files[0] || null);
    inp.click();
  });
}

export const stamp = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

export const safeName = (s) => String(s).replace(/[^A-Za-z0-9ÄÖÜäöüß_-]+/g, '_').replace(/_+/g, '_').slice(0, 40);
