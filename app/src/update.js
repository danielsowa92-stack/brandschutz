// Update-Prüfung über GitHub Releases (nur mit Internet; offline passiert nichts)
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import * as repo from './repo.js';

export const REPO = 'danielsowa92-stack/brandschutz';
export const DOWNLOAD_URL = `https://github.com/${REPO}/releases/latest/download/Brandschutz-Pruefung.apk`;
export const RELEASES_URL = `https://github.com/${REPO}/releases/latest`;

/** Installierte Version: { name: '1.0.12', code: 12 } */
export async function installedVersion() {
  if (!Capacitor.isNativePlatform()) return { name: `${__APP_VERSION__} (Browser)`, code: 0 };
  const info = await App.getInfo();
  return { name: info.version, code: Number(info.build) || 0 };
}

/**
 * Prüft höchstens alle 12 Stunden (force = sofort), ob es eine neuere Version gibt.
 * Liefert { name, code } der neuen Version oder null.
 */
export async function checkForUpdate(force = false) {
  if (!Capacitor.isNativePlatform() && !force) return null;
  const cache = await repo.getSetting('update_check', null);
  const now = Date.now();
  let latest = cache?.latest || null;
  if (force || !cache || now - cache.ts > 12 * 3600 * 1000) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { signal: ctrl.signal, headers: { Accept: 'application/vnd.github+json' } });
      clearTimeout(t);
      if (r.ok) {
        const j = await r.json();
        const m = /(\d+)$/.exec(j.tag_name || '');
        latest = m ? { name: String(j.tag_name).replace(/^v/, ''), code: Number(m[1]) } : null;
        await repo.setSetting('update_check', { ts: now, latest });
      } else if (r.status === 404) {
        latest = null;
        await repo.setSetting('update_check', { ts: now, latest: null });
      }
    } catch (e) {
      if (force) throw new Error('Keine Verbindung zu GitHub. Bitte Internet prüfen.');
    }
  }
  const inst = await installedVersion();
  return latest && latest.code > inst.code ? latest : null;
}

export async function openDownload() {
  if (Capacitor.isNativePlatform()) await Browser.open({ url: DOWNLOAD_URL });
  else window.open(DOWNLOAD_URL, '_blank');
}
