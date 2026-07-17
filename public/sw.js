const SHELL_CACHE = "always-on-frame-shell-v1";
const IMAGE_CACHE = "always-on-frame-images-v1";
const ARTWORK_CACHE = "always-on-frame-artworks-wikimedia-2026-07-17-4k1";
const MAX_IMAGES = 24;
const MAX_ARTWORKS = 48;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                key.startsWith("always-on-frame-") &&
                key !== SHELL_CACHE &&
                key !== IMAGE_CACHE &&
                key !== ARTWORK_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

async function trimCache(cache, maximum) {
  const keys = await cache.keys();
  if (keys.length <= maximum) return;
  await Promise.all(keys.slice(0, keys.length - maximum).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            try {
              const cache = await caches.open(SHELL_CACHE);
              await cache.put(request, response.clone());
            } catch {
              // A full or unavailable cache must never block a valid response.
            }
          }
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(request)) || (await cache.match(self.registration.scope));
        }),
    );
    return;
  }

  if (request.destination === "image") {
    const url = new URL(request.url);
    const isLocalArtwork =
      url.origin === self.location.origin &&
      /\/artworks\/Q\d+\.webp$/.test(url.pathname);
    event.respondWith(
      caches.open(isLocalArtwork ? ARTWORK_CACHE : IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok || response.type === "opaque") {
          try {
            await cache.put(request, response.clone());
            await trimCache(cache, isLocalArtwork ? MAX_ARTWORKS : MAX_IMAGES);
          } catch {
            // Treat image storage as an optimization on quota-limited tablets.
          }
        }
        return response;
      }),
    );
    return;
  }

  if (new URL(request.url).origin === self.location.origin) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          try {
            await cache.put(request, response.clone());
          } catch {
            // Keep serving the network response if Cache Storage is unavailable.
          }
        }
        return response;
      }),
    );
  }
});
