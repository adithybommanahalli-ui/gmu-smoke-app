const CACHE_NAME = "gmu-smoke-v2";

const FILES_TO_CACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.json",
  "./logo.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(FILES_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => (key !== CACHE_NAME ? caches.delete(key) : null)))
    )
  );
  self.clients.claim();
});

// Network-first for our own app files (HTML/CSS/JS) so a rebuilt UI always
// wins when online, falling back to cache only when offline. Requests to the
// Google Apps Script API (different origin) and any non-GET requests are left
// alone so live sensor data is never cached or served stale.
self.addEventListener("fetch", event => {
  const req = event.request;

  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) {
    return; // let the browser handle it normally (e.g. the sensor API)
  }

  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req))
  );
});
