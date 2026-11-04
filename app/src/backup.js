// Backup (JSON inkl. Fotos) und Import aus der alten Web-Version
import * as repo from './repo.js';
import { convertLegacy } from './logic.js';
import { readPhotoBase64, writePhoto, deletePhotoFiles } from './photos.js';

export const BACKUP_FORMAT = 'brandschutz-app-backup';

export async function buildBackup() {
  const data = await repo.dumpAll();
  const photoData = {};
  for (const p of data.photos) {
    try { photoData[p.path] = await readPhotoBase64(p.path); } catch (e) { /* Datei fehlt */ }
  }
  const json = JSON.stringify({ format: BACKUP_FORMAT, version: 1, exported_at: new Date().toISOString(), ...data, photo_data: photoData });
  return new Blob([json], { type: 'application/json' });
}

/** Art der Datei erkennen: 'backup' | 'legacy' | null */
export function detectFormat(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.format === BACKUP_FORMAT) return 'backup';
  if ('bs_doors' in obj || 'bs_checks' in obj) return 'legacy';
  if (Array.isArray(obj.doors) && Array.isArray(obj.checks)) return 'legacy';
  return null;
}

export async function restoreBackup(obj) {
  if (detectFormat(obj) !== 'backup') throw new Error('Keine Backup-Datei dieser App.');
  const old = await repo.allPhotos();
  await repo.replaceAll(obj);
  // Fotodateien ersetzen
  await deletePhotoFiles(old.map((p) => p.path));
  let fotos = 0;
  for (const [path, b64] of Object.entries(obj.photo_data || {})) {
    await writePhoto(path, b64);
    fotos++;
  }
  return { objekte: obj.objects.length, tueren: obj.doors.length, pruefungen: obj.inspections.length, fotos };
}

export async function importLegacyData(obj) {
  const existing = await repo.listObjects();
  const conv = convertLegacy(obj, existing);
  return repo.importLegacy(conv);
}
