// Lokale Benachrichtigungen bei fälligen Prüfungen
import { Capacitor } from '@capacitor/core';
import * as repo from './repo.js';
import { isoDate, addDays, parseIso, fmtDate } from './logic.js';
import { $, esc, toast } from './ui.js';

const native = () => Capacitor.isNativePlatform();
const DEFAULTS = { enabled: false, hour: 7, vorlauf: 7 };
let listenerAdded = false;

export const getNotifySettings = async () => ({ ...DEFAULTS, ...(await repo.getSetting('notify', {})) });

async function plugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  if (!listenerAdded) {
    listenerAdded = true;
    LocalNotifications.addListener('localNotificationActionPerformed', (ev) => {
      const route = ev.notification?.extra?.route;
      if (route) location.hash = route;
    });
    try {
      await LocalNotifications.createChannel({ id: 'faellig', name: 'Fällige Prüfungen', importance: 4, description: 'Erinnerung an fällige Brandschutztür-Prüfungen' });
    } catch (e) { /* ältere Android-Versionen */ }
  }
  return LocalNotifications;
}

function at(iso, hour) {
  const d = parseIso(iso);
  d.setHours(hour, 0, 0, 0);
  return d;
}

/**
 * Plant die Benachrichtigungen neu:
 *  - am Fälligkeitstag ("x Türen heute fällig")
 *  - x Tage vorher ("x Türen in 7 Tagen fällig")
 *  - bei überfälligen Türen eine Erinnerung am nächsten Morgen
 */
export async function refreshNotifications() {
  if (!native()) return;
  const s = await getNotifySettings();
  const LN = await plugin();
  const pending = await LN.getPending();
  if (pending.notifications.length) await LN.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  if (!s.enabled) return;
  const perm = await LN.checkPermissions();
  if (perm.display !== 'granted') return;

  const today = isoDate();
  const doors = await repo.listDoors();
  const byDate = new Map();
  let overdue = 0;
  for (const d of doors) {
    if (!d.naechste) continue;
    if (d.naechste < today) { overdue++; continue; }
    byDate.set(d.naechste, (byDate.get(d.naechste) || 0) + 1);
  }
  const now = new Date();
  const list = [];
  let id = 1;
  const push = (when, title, body, route) => {
    if (when <= now) return;
    list.push({ id: id++, title, body, schedule: { at: when, allowWhileIdle: true }, channelId: 'faellig', extra: { route }});
  };
  if (overdue) {
    let when = at(today, s.hour);
    if (when <= now) when = at(addDays(today, 1), s.hour);
    push(when, 'Brandschutz: Prüfungen überfällig', `${overdue} Tür(en) sind überfällig.`, '#/liste/ueberfaellig');
  }
  const dates = [...byDate.keys()].sort().slice(0, 40);
  for (const date of dates) {
    const n = byDate.get(date);
    push(at(date, s.hour), 'Brandschutz: Prüfung fällig', `Heute fällig: ${n} Tür(en).`, '#/liste/bald');
    if (s.vorlauf > 0) push(at(addDays(date, -s.vorlauf), s.hour), 'Brandschutz: Prüfung bald fällig', `${n} Tür(en) fällig am ${fmtDate(date)}.`, '#/liste/bald');
  }
  if (list.length) await LN.schedule({ notifications: list.slice(0, 60) });
}

export async function notificationSettingsHtml() {
  const s = await getNotifySettings();
  return `<div style="border-top:1px solid var(--b);margin-top:8px;padding-top:8px">
    <label class="switch">Benachrichtigung bei fälligen Prüfungen <input type="checkbox" id="n-on" ${s.enabled ? 'checked' : ''}></label>
    <div class="grid2" id="n-opts" style="${s.enabled ? '' : 'display:none'}">
      <div class="field"><label>Uhrzeit</label><select id="n-hour">${[6, 7, 8, 9, 10, 12, 14, 16, 18].map((h) => `<option value="${h}" ${h === s.hour ? 'selected' : ''}>${h}:00 Uhr</option>`).join('')}</select></div>
      <div class="field"><label>Vorwarnung</label><select id="n-vor">${[0, 3, 7, 14, 30].map((v) => `<option value="${v}" ${v === s.vorlauf ? 'selected' : ''}>${v ? v + ' Tage vorher' : 'keine'}</option>`).join('')}</select></div>
    </div>
    ${native() ? '' : `<div class="hint">${esc('Benachrichtigungen funktionieren nur in der Android-App.')}</div>`}
  </div>`;
}

export function bindNotificationSettings() {
  const on = $('#n-on');
  if (!on) return;
  const save = async () => {
    const s = { enabled: on.checked, hour: Number($('#n-hour').value), vorlauf: Number($('#n-vor').value) };
    if (s.enabled && native()) {
      const LN = await plugin();
      let p = await LN.checkPermissions();
      if (p.display !== 'granted') p = await LN.requestPermissions();
      if (p.display !== 'granted') {
        on.checked = false;
        s.enabled = false;
        toast('Benachrichtigungen wurden nicht erlaubt');
      }
    }
    $('#n-opts').style.display = s.enabled ? '' : 'none';
    await repo.setSetting('notify', s);
    await refreshNotifications();
    toast(s.enabled ? 'Benachrichtigungen aktiv' : 'Benachrichtigungen aus');
  };
  on.onchange = save;
  $('#n-hour').onchange = save;
  $('#n-vor').onchange = save;
}
