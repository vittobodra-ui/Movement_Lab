// Rende l'app apribile senza rete. I file dell'app si aggiornano in background;
// riconoscimento e modelli, una volta scaricati, restano nel dispositivo.
const VERSION = 'lab-0a3127f99818';
const ENGINE = 'lab-engine-0.10.14';
const SHELL = ["./", "asym.js", "corsa-main.js", "corsa-metrics.js", "corsa-report.js", "corsa-ruota.js", "corsa-sim.js", "corsa-store.js", "corsa-styles.css", "corsa-telefono.css", "corsa-telefono.html", "corsa-telefono.js", "corsa.html", "data.js", "engine.js", "icon-192.png", "icon-512.png", "index.html", "manifest.webmanifest", "movimento-analysis.js", "movimento-app.js", "movimento-errori.js", "movimento-measure.js", "movimento-overlay.js", "movimento-report.js", "movimento-review.js", "movimento-sim.js", "movimento-station.js", "movimento-store.js", "movimento-styles.css", "movimento.html", "stabilometria-app.js", "stabilometria-board.js", "stabilometria-figure.js", "stabilometria-report.js", "stabilometria-signal.js", "stabilometria-sim.js", "stabilometria-store.js", "stabilometria-styles.css", "stabilometria.html", "suite.css", "suite.js", "suitebar.css", "suitebar.js", "sw.js"];
const ENGINE_HOSTS = ['cdn.jsdelivr.net', 'storage.googleapis.com'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== ENGINE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (ENGINE_HOSTS.includes(url.hostname)) {
    e.respondWith(caches.open(ENGINE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok || r.type === 'opaque') c.put(e.request, r.clone());
      return r;
    }));
  } else if (url.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; });
      if (hit) { net.catch(() => {}); return hit; }
      return net;
    }));
  }
});
