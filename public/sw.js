const CACHE = 'alerts-v1';
let lastTimestamp = 0;

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      await clients.claim();
      checkForUpdates();
      setInterval(checkForUpdates, 60000);
    })(),
  );
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'CHECK_NOW') checkForUpdates();
});

async function checkForUpdates() {
  try {
    const r = await fetch('./cache/index.json', { cache: 'no-cache' });
    const index = await r.json();
    if (index.timestamp && index.timestamp > lastTimestamp) {
      lastTimestamp = index.timestamp;
      const ar = await fetch('./cache/alerts.json', { cache: 'no-cache' });
      const alerts = await ar.json();
      const cache = await caches.open(CACHE);
      cache.put('./cache/alerts.json', new Response(JSON.stringify(alerts)));
      const all = await clients.matchAll();
      for (const c of all) c.postMessage({ type: 'ALERTS_UPDATED', alerts: alerts.entity ?? [] });
    }
  } catch {}
}
