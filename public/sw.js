const SHELL_CACHE = "always-on-frame-shell-v1";
const IMAGE_CACHE = "always-on-frame-images-v1";
const MAX_IMAGES = 18;

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
                key !== IMAGE_CACHE,
            )
            .map((key) => caches.delete(key)),
        ),
      ),
    ]),
  );
});

async function trimImages(cache) {
  const keys = await cache.keys();
  if (keys.length <= MAX_IMAGES) return;
  await Promise.all(keys.slice(0, keys.length - MAX_IMAGES).map((key) => cache.delete(key)));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(SHELL_CACHE);
            await cache.put(request, response.clone());
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
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok || response.type === "opaque") {
          await cache.put(request, response.clone());
          await trimImages(cache);
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
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
