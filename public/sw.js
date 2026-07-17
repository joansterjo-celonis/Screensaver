const SHELL_CACHE = "always-on-frame-shell-v1";
const IMAGE_CACHE = "always-on-frame-images-v1";
const ARTWORK_ARCHIVE_VERSION = "wikimedia-2026-07-17-4k1";
const ARTWORK_CACHE = `always-on-frame-artworks-${ARTWORK_ARCHIVE_VERSION}`;
const MAX_IMAGES = 24;
const ARTWORK_ARCHIVE_COUNT = 300;
const ARTWORK_BATCH_SIZE = 4;
const FULL_ARCHIVE_CACHE_MESSAGE = "CACHE_FULL_ARTWORK_ARCHIVE";

let artworkWarmPromise = null;

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

function validateArtworkManifest(manifest) {
  if (
    !manifest ||
    manifest.archiveVersion !== ARTWORK_ARCHIVE_VERSION ||
    manifest.count !== ARTWORK_ARCHIVE_COUNT ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== ARTWORK_ARCHIVE_COUNT
  ) {
    throw new Error("The local artwork manifest does not match this service worker.");
  }

  const files = manifest.files.map((entry) => entry?.file);
  if (
    files.some((file) => typeof file !== "string" || !/^Q\d+\.webp$/.test(file)) ||
    new Set(files).size !== ARTWORK_ARCHIVE_COUNT
  ) {
    throw new Error("The local artwork manifest contains invalid or duplicate files.");
  }

  return files;
}

async function parseArtworkManifest(response) {
  return validateArtworkManifest(await response.json());
}

async function loadArtworkManifest() {
  const manifestUrl = new URL("artworks/manifest.json", self.registration.scope);
  const manifestRequest = new Request(manifestUrl, { credentials: "same-origin" });
  const shellCache = await caches.open(SHELL_CACHE);

  try {
    const response = await fetch(manifestRequest);
    if (!response.ok) throw new Error(`Artwork manifest responded ${response.status}.`);
    const files = await parseArtworkManifest(response.clone());
    try {
      await shellCache.put(manifestRequest, response.clone());
    } catch {
      // The archive can still warm if storage for the small manifest is unavailable.
    }
    return files;
  } catch (error) {
    const cached = await shellCache.match(manifestRequest);
    if (!cached) throw error;
    return parseArtworkManifest(cached);
  }
}

function isQuotaExceeded(error) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "QuotaExceededError",
  );
}

async function warmFullArtworkArchive() {
  const files = await loadArtworkManifest();
  const cache = await caches.open(ARTWORK_CACHE);
  let storageFull = false;

  for (let index = 0; index < files.length && !storageFull; index += ARTWORK_BATCH_SIZE) {
    const batch = files.slice(index, index + ARTWORK_BATCH_SIZE);
    await Promise.all(
      batch.map(async (file) => {
        const artworkUrl = new URL(`artworks/${file}`, self.registration.scope);
        artworkUrl.searchParams.set("v", ARTWORK_ARCHIVE_VERSION);
        const request = new Request(artworkUrl, { credentials: "same-origin" });

        try {
          if (await cache.match(request)) return;
          const response = await fetch(request);
          if (!response.ok) return;
          await cache.put(request, response.clone());
        } catch (error) {
          if (isQuotaExceeded(error)) storageFull = true;
          // Preserve the successfully cached files and resume from the gaps later.
        }
      }),
    );
  }
}

function requestFullArtworkArchiveWarm() {
  if (!artworkWarmPromise) {
    artworkWarmPromise = warmFullArtworkArchive()
      .catch(() => undefined)
      .finally(() => {
        artworkWarmPromise = null;
      });
  }
  return artworkWarmPromise;
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== FULL_ARCHIVE_CACHE_MESSAGE) return;
  event.waitUntil(requestFullArtworkArchiveWarm());
});

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
            if (!isLocalArtwork) await trimCache(cache, MAX_IMAGES);
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
