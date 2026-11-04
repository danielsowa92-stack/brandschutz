// QR-Scan nativ über ML Kit (gebündeltes Modell → funktioniert offline)
import { Capacitor } from '@capacitor/core';
import { esc } from './ui.js';

let active = null;

export const scanSupported = () => Capacitor.isNativePlatform();

/**
 * Startet den Scanner mit eigener Oberfläche (Rahmen, Taschenlampe, Abbrechen).
 * Liefert den gelesenen Text oder null bei Abbruch.
 */
export async function scanQr() {
  if (!scanSupported()) return null;
  const { BarcodeScanner, BarcodeFormat } = await import('@capacitor-mlkit/barcode-scanning');

  let perm = await BarcodeScanner.checkPermissions();
  if (perm.camera !== 'granted') perm = await BarcodeScanner.requestPermissions();
  if (perm.camera !== 'granted') throw new Error('Kamera-Berechtigung fehlt. Bitte in den Android-Einstellungen erlauben.');

  return new Promise(async (resolve, reject) => {
    const ui = document.createElement('div');
    ui.id = 'scanner-ui';
    ui.innerHTML = `
      <div class="scan-top">QR-Code der Tür in den Rahmen halten</div>
      <div class="scan-frame"></div>
      <div class="scan-bottom">
        <button class="scan-btn" id="scan-torch" aria-label="Taschenlampe">🔦<span>Licht</span></button>
        <button class="scan-btn" id="scan-cancel" aria-label="Abbrechen">✕<span>Abbrechen</span></button>
      </div>`;
    document.body.appendChild(ui);
    document.documentElement.classList.add('scanner-active');

    let done = false;
    const finish = async (value, err) => {
      if (done) return;
      done = true;
      active = null;
      document.removeEventListener('bs-back', onBack);
      try { await BarcodeScanner.removeAllListeners(); } catch (e) { /* egal */ }
      try { await BarcodeScanner.disableTorch(); } catch (e) { /* egal */ }
      try { await BarcodeScanner.stopScan(); } catch (e) { /* egal */ }
      document.documentElement.classList.remove('scanner-active');
      ui.remove();
      if (err) reject(err); else resolve(value);
    };
    const onBack = (e) => { e.preventDefault(); finish(null); };
    document.addEventListener('bs-back', onBack);
    active = () => finish(null);

    ui.querySelector('#scan-cancel').onclick = () => finish(null);
    const torchBtn = ui.querySelector('#scan-torch');
    torchBtn.onclick = async () => {
      try {
        await BarcodeScanner.toggleTorch();
        const { enabled } = await BarcodeScanner.isTorchEnabled();
        torchBtn.classList.toggle('on', enabled);
      } catch (e) { /* Gerät ohne Licht */ }
    };
    try {
      const { available } = await BarcodeScanner.isTorchAvailable();
      if (!available) torchBtn.style.display = 'none';
    } catch (e) { /* ignorieren */ }

    try {
      await BarcodeScanner.addListener('barcodesScanned', (ev) => {
        const code = ev.barcodes && ev.barcodes[0];
        if (code && (code.rawValue || code.displayValue)) finish(code.rawValue || code.displayValue);
      });
      await BarcodeScanner.addListener('scanError', (ev) => finish(null, new Error(ev.message || 'Scanfehler')));
      await BarcodeScanner.startScan({ formats: [BarcodeFormat.QrCode] });
    } catch (e) {
      finish(null, e);
    }
  });
}

export function cancelScan() {
  if (active) active();
}

export const scanUnsupportedHtml = () => `<div class="card muted">${esc('Kamera-Scan ist nur in der Android-App verfügbar. Bitte die Tür-ID unten eingeben.')}</div>`;
