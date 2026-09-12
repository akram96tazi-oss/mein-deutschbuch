/* MEIN DEUTSCHBUCH — service worker (GitHub Pages build).
 *
 * The 38 chapters are base64 payloads embedded in index.html and mounted into
 * iframes via srcdoc, so there is nothing per-chapter to intercept: caching that
 * one document makes the whole book available offline. This worker caches only
 * the shell — the page, the manifest and the three icons, all at the repository
 * root next to this file.
 *
 *   navigation requests -> network first, cache fallback
 *                          (an updated build wins online; the book still opens offline)
 *   same-origin assets  -> cache first, network fallback
 *   cross-origin        -> not handled at all
 *
 * To ship a new build, bump CACHE. Activation then deletes the older mdb- caches.
 */
const CACHE = 'mdb-v2';
const APP = './index.html';

const ASSETS = [
  './',
  APP,
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // One at a time, so a single unavailable entry cannot fail the whole install.
    for (const url of ASSETS) {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch (e) { /* skip */ }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Only this app's own older versions — never another app's cache on the same origin.
    const names = await caches.keys();
    await Promise.all(names.map((n) => (n.startsWith('mdb-') && n !== CACHE)
      ? caches.delete(n) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // The root URL and index.html are the same document; try both.
        const cached = (await caches.match(req))
          || (await caches.match(new URL(APP, self.location).href))
          || (await caches.match(new URL('./', self.location).href));
        if (cached) return cached;
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
          '<p style="font:16px system-ui;padding:2rem">MEIN DEUTSCHBUCH ist offline ' +
          'noch nicht gespeichert. Bitte einmal mit Internetverbindung öffnen.</p>',
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return new Response('', { status: 504, statusText: 'offline' });
    }
  })());
});
