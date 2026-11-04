// Fotos zu Prüfungen: Dateien im App-Speicher (Ordner "fotos"), Pfad in der Datenbank
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Filesystem, Directory } from '@capacitor/filesystem';

export const PHOTO_DIR = 'fotos';

/** Foto aufnehmen (oder aus Galerie wählen) und speichern → relativer Pfad oder null */
export async function takePhoto() {
  let p;
  try {
    p = await Camera.getPhoto({
      quality: 60,
      width: 1600,
      correctOrientation: true,
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,
      promptLabelHeader: 'Foto',
      promptLabelPhoto: 'Aus Galerie',
      promptLabelPicture: 'Kamera',
      promptLabelCancel: 'Abbrechen',
      webUseInput: true,
    });
  } catch (e) {
    return null; // abgebrochen
  }
  const path = `${PHOTO_DIR}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${p.format || 'jpeg'}`;
  await writePhoto(path, p.base64String);
  return path;
}

export async function writePhoto(path, base64) {
  await Filesystem.writeFile({ path, data: base64, directory: Directory.Data, recursive: true });
}

export async function readPhotoBase64(path) {
  const r = await Filesystem.readFile({ path, directory: Directory.Data });
  return typeof r.data === 'string' ? r.data : await blobB64(r.data);
}

export async function photoDataUrl(path) {
  try {
    const mime = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${await readPhotoBase64(path)}`;
  } catch (e) {
    return null;
  }
}

export async function deletePhotoFiles(paths) {
  for (const path of paths) {
    try { await Filesystem.deleteFile({ path, directory: Directory.Data }); } catch (e) { /* bereits weg */ }
  }
}

async function blobB64(blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
