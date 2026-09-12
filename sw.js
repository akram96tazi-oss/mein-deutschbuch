/* MEIN DEUTSCHBUCH — service worker (GitHub Pages, repository root).
 *
 * The 38 chapters are base64 payloads embedded in index.html and mounted into
 * iframes via srcdoc, so there is nothing per-chapter to intercept: caching that
 * one document makes the whole book available offline. Only the shell is cached.
 *
 *   navigation requests -> network first, cached index.html as the fallback
 *   same-origin assets  -> cache first, then network
 *   anything else        -> not handled
 *
 * To ship a new build, bump CACHE; activation deletes this app's older caches.
 */
const CACHE = "mdb-v3";

const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // one at a time, so a single unavailable entry cannot fail the whole install
    for (const url of CORE) {
      try { await cache.add(new Request(url, { cache: "reload" })); } catch (e) { /* skip */ }
    }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // only this app's own older versions — never another app's cache on the origin
    const names = await caches.keys();
    await Promise.all(names.map((n) =>
      (n.startsWith("mdb-") && n !== CACHE) ? caches.delete(n) : Promise.resolve()));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;                       // GET only
  if (new URL(req.url).origin !== self.location.origin) return;   // same-origin only

  // navigations: network first, cached shell as the offline fallback
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        return (await caches.match(req))
            || (await caches.match("./index.html"))
            || (await caches.match("./"))
            || new Response(
                 '<!doctype html><meta charset="utf-8"><title>Offline</title>' +
                 '<p style="font:16px system-ui;padding:2rem">MEIN DEUTSCHBUCH ist offline ' +
                 'noch nicht gespeichert. Bitte einmal mit Internetverbindung öffnen.</p>',
                 { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
    return;
  }

  // static assets: cache first, then network
  event.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE);
      cache.put(req, fresh.clone());
      return fresh;
    } catch (e) {
      return new Response("", { status: 504, statusText: "offline" });
    }
  })());
});
