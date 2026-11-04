import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { initDb } from './db.js';
import { $, $$, toast } from './ui.js';
import { routes, startScanFlow } from './views.js';
import { refreshNotifications } from './notify.js';

const view = $('#view');

function parseHash() {
  const h = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = h.split('?');
  return { path, query: new URLSearchParams(qs || '') };
}

let renderId = 0;
async function render() {
  const { path, query } = parseHash();
  const id = ++renderId;
  for (const [re, handler, tab] of routes) {
    const m = re.exec(path);
    if (!m) continue;
    $$('#tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
    const params = m.slice(1).map(decodeURIComponent);
    try {
      view.innerHTML = '';
      await handler({ params, query, view, isCurrent: () => id === renderId });
    } catch (e) {
      console.error(e);
      view.innerHTML = `<div class="card"><b>Fehler:</b> ${String(e.message || e)}</div>`;
    }
    if (id === renderId) window.scrollTo(0, 0);
    return;
  }
  location.replace('#/');
}

window.addEventListener('bs-rerender', () => render());

function goBack() {
  const ev = new Event('bs-back', { cancelable: true });
  document.dispatchEvent(ev);
  if (ev.defaultPrevented) return;
  const { path } = parseHash();
  if (path === '/' || path === '') App.exitApp();
  else history.back();
}

async function start() {
  try {
    await initDb();
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><b>Datenbank konnte nicht geöffnet werden.</b><br>${String(e.message || e)}</div>`;
    return;
  }
  $('#bar-back').onclick = goBack;
  $('#tab-scan').onclick = () => startScanFlow();
  if (Capacitor.isNativePlatform()) {
    App.addListener('backButton', goBack);
    App.addListener('resume', () => refreshNotifications().catch(() => {}));
  }
  window.addEventListener('hashchange', render);
  await render();
  refreshNotifications().catch((e) => console.warn(e));
}

window.addEventListener('unhandledrejection', (e) => {
  console.error(e.reason);
  toast('Fehler: ' + (e.reason?.message || e.reason));
});

start();
