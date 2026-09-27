// Keeps the whole app on the phone so it opens with no internet.
// Online: always fetch the latest files, so updates arrive at once.
// Offline: use the saved copy.
const CACHE = "aathvan-v4";
const FILES = ["./", "index.html", "style.css", "app.js", "brain.js", "manifest.webmanifest", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  // cache: "reload" skips the browser's short-term cache, so stale files are never saved.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const fresh = await Promise.race([
        fetch(req, { cache: "no-cache" }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 4000)),
      ]);
      if (fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (err) {
      return (await cache.match(req, { ignoreSearch: true })) || (await cache.match("index.html")) || Response.error();
    }
  })());
});
