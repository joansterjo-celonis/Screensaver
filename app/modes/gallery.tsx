"use client";

/* eslint-disable @next/next/no-img-element -- Wikimedia Commons images are dynamic cross-origin assets. */

import { useCallback, useEffect, useMemo, useState } from "react";
import { classifyArtworkCopySource } from "../data/artwork-copy-source";
import {
  ARTWORK_DATASET_VERSION,
  ARTWORK_SEEDS,
  fallbackArtwork,
  localArtworkUrl,
  type GalleryArtwork,
} from "../data/artworks";

const CACHE_KEY = "always-on-frame.gallery.v3";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CYCLE_TIME = 5 * 60 * 1000;
const API_BATCH_SIZE = 20;

type WikiPage = {
  title: string;
  extract?: string;
  fullurl?: string;
  pageimage?: string;
  thumbnail?: { source: string };
};

type WikiResponse = {
  query?: {
    pages?: WikiPage[];
    redirects?: Array<{ from: string; to: string }>;
    normalized?: Array<{ from: string; to: string }>;
  };
};

type CommonsMetadata = Record<string, { value?: string }>;

type CommonsResponse = {
  query?: {
    pages?: Array<{
      title: string;
      imageinfo?: Array<{
        thumburl?: string;
        url?: string;
        descriptionurl?: string;
        extmetadata?: CommonsMetadata;
      }>;
    }>;
  };
};

type CachedGallery = {
  version: 3;
  datasetVersion: string;
  savedAt: number;
  artworks: GalleryArtwork[];
};

type VisibleCopySource = "loading" | "commons" | "local" | "unavailable";

type VisibleCopyState = {
  key: string;
  source: VisibleCopySource;
};

function inBatches<T>(items: T[], size = API_BATCH_SIZE) {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function normalizeTitle(value: string) {
  return value.replace(/^File:/i, "").replace(/_/g, " ").trim().toLocaleLowerCase();
}

function resolveAlias(title: string, aliases: Map<string, string>) {
  let resolved = title;
  const visited = new Set<string>();
  while (aliases.has(resolved) && !visited.has(resolved)) {
    visited.add(resolved);
    resolved = aliases.get(resolved) ?? resolved;
  }
  return resolved;
}

function shorten(value: string, limit = 330) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  const clipped = compact.slice(0, limit);
  const sentence = clipped.lastIndexOf(". ");
  const boundary = sentence > limit * 0.58 ? sentence + 1 : clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary)}…`;
}

function readCache(): CachedGallery | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGallery;
    if (
      parsed.version !== 3 ||
      parsed.datasetVersion !== ARTWORK_DATASET_VERSION ||
      !Array.isArray(parsed.artworks) ||
      parsed.artworks.length !== ARTWORK_SEEDS.length
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(artworks: GalleryArtwork[]) {
  try {
    const payload: CachedGallery = {
      version: 3,
      datasetVersion: ARTWORK_DATASET_VERSION,
      savedAt: Date.now(),
      artworks,
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable in private or tightly managed kiosk browsers.
  }
}

async function fetchGallery(signal: AbortSignal): Promise<GalleryArtwork[]> {
  const resolvedPages = (
    await Promise.all(
      inBatches(ARTWORK_SEEDS).map(async (seeds) => {
        const wikipedia = new URL("https://en.wikipedia.org/w/api.php");
        wikipedia.search = new URLSearchParams({
          action: "query",
          format: "json",
          formatversion: "2",
          origin: "*",
          redirects: "1",
          prop: "extracts|pageimages|info",
          exintro: "1",
          explaintext: "1",
          exsentences: "3",
          exlimit: "max",
          inprop: "url",
          piprop: "thumbnail|original|name",
          pithumbsize: "1800",
          pilicense: "free",
          maxage: "86400",
          smaxage: "86400",
          titles: seeds.map((item) => item.articleTitle).join("|"),
        }).toString();

        try {
          const result = await fetch(wikipedia, {
            signal,
            headers: { Accept: "application/json" },
          });
          if (!result.ok) throw new Error(`Wikipedia responded ${result.status}`);
          const data = (await result.json()) as WikiResponse;
          const pages = data.query?.pages ?? [];
          const aliases = new Map<string, string>();
          for (const item of data.query?.normalized ?? []) aliases.set(item.from, item.to);
          for (const item of data.query?.redirects ?? []) aliases.set(item.from, item.to);

          return seeds.map((seed) => {
            const resolved = resolveAlias(seed.articleTitle, aliases);
            const page = pages.find(
              (candidate) => candidate.title.toLocaleLowerCase() === resolved.toLocaleLowerCase(),
            );
            return { seed, page };
          });
        } catch (error) {
          if (signal.aborted) throw error;
          return seeds.map((seed) => ({ seed, page: undefined }));
        }
      }),
    )
  ).flat();

  const sourceFiles = resolvedPages.map(({ seed }) => seed.fallbackFile);
  if (!resolvedPages.some(({ page }) => page)) {
    throw new Error("Wikipedia metadata was unavailable");
  }
  const licenseByFile = new Map<
    string,
    { imageUrl?: string; license?: string; licenseUrl?: string; copyrighted?: string }
  >();

  if (sourceFiles.length) {
    const metadataBatches = await Promise.all(
      inBatches(sourceFiles).map(async (files) => {
        const commons = new URL("https://commons.wikimedia.org/w/api.php");
        commons.search = new URLSearchParams({
          action: "query",
          format: "json",
          formatversion: "2",
          origin: "*",
          prop: "imageinfo",
          iiprop: "url|dimensions|mime|extmetadata",
          iiurlwidth: "2800",
          iiextmetadatalanguage: "en",
          iiextmetadatafilter:
            "LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|Copyrighted",
          maxage: "86400",
          smaxage: "86400",
          titles: files.map((file) => `File:${file}`).join("|"),
        }).toString();

        try {
          const result = await fetch(commons, {
            signal,
            headers: { Accept: "application/json" },
          });
          if (!result.ok) return [];
          const data = (await result.json()) as CommonsResponse;
          return data.query?.pages ?? [];
        } catch (error) {
          if (signal.aborted) throw error;
          return [];
        }
      }),
    );

    for (const filePage of metadataBatches.flat()) {
      const info = filePage.imageinfo?.[0];
      const meta = info?.extmetadata;
      licenseByFile.set(normalizeTitle(filePage.title), {
        imageUrl: info?.thumburl ?? info?.url,
        license: meta?.LicenseShortName?.value ?? meta?.UsageTerms?.value,
        licenseUrl: meta?.LicenseUrl?.value ?? info?.descriptionurl,
        copyrighted: meta?.Copyrighted?.value,
      });
    }
  }

  return resolvedPages.flatMap(({ seed, page }) => {
    const fallback = fallbackArtwork(seed);
    if (!page) return [fallback];
    const license = licenseByFile.get(normalizeTitle(seed.fallbackFile));
    const licenseName = license?.license ?? "";
    const verifiedPublicDomain =
      Boolean(license?.imageUrl) &&
      license?.copyrighted?.toLocaleLowerCase() === "false" &&
      /public domain|cc0|public domain mark/i.test(licenseName);
    const description = page.extract ? shorten(page.extract) : fallback.description;
    const articleUrl = page.fullurl ?? fallback.articleUrl;

    if (!verifiedPublicDomain) {
      return [{ ...fallback, articleUrl, description }];
    }

    return [
      {
        ...seed,
        imageUrl: license?.imageUrl ?? fallback.imageUrl,
        articleUrl,
        description,
        license: licenseName,
        licenseUrl: license?.licenseUrl ?? fallback.licenseUrl,
      },
    ];
  });
}

function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function GalleryMode({ paused = false }: { paused?: boolean }) {
  const fallbackCollection = useMemo(
    () => ARTWORK_SEEDS.map(fallbackArtwork),
    [],
  );
  const [artworks, setArtworks] = useState<GalleryArtwork[]>(fallbackCollection);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextAt, setNextAt] = useState(() => Date.now() + CYCLE_TIME);
  const [remaining, setRemaining] = useState(CYCLE_TIME);
  const [timerReset, setTimerReset] = useState(0);
  const [failedRemoteRequests, setFailedRemoteRequests] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [visibleCopy, setVisibleCopy] = useState<VisibleCopyState>({
    key: "",
    source: "loading",
  });

  useEffect(() => {
    const controller = new AbortController();
    let cacheHydration = 0;
    const cached = readCache();
    if (cached) {
      cacheHydration = window.setTimeout(() => {
        if (controller.signal.aborted) return;
        setArtworks(cached.artworks);
      }, 0);
    }
    const cacheFresh = cached && Date.now() - cached.savedAt < CACHE_TTL;
    if (cacheFresh) {
      return () => {
        controller.abort();
        window.clearTimeout(cacheHydration);
      };
    }

    fetchGallery(controller.signal)
      .then((collection) => {
        if (!collection.length) return;
        setArtworks(collection);
        writeCache(collection);
      })
      .catch(() => {
        // The seeded or cached collection remains fully usable offline.
      });

    return () => {
      controller.abort();
      window.clearTimeout(cacheHydration);
    };
  }, []);

  const advance = useCallback(() => {
    setCurrentIndex((index) => (index + 1) % Math.max(1, artworks.length));
  }, [artworks.length]);

  useEffect(() => {
    if (paused) return;
    let timeout = 0;
    let disposed = false;
    const schedule = () => {
      const target = Date.now() + CYCLE_TIME;
      setNextAt(target);
      timeout = window.setTimeout(() => {
        if (disposed) return;
        advance();
        schedule();
      }, CYCLE_TIME);
    };
    schedule();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
    };
  }, [advance, paused, timerReset]);

  useEffect(() => {
    if (paused) return;
    let timeout = 0;
    const tick = () => {
      setRemaining(nextAt - Date.now());
      timeout = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    return () => window.clearTimeout(timeout);
  }, [nextAt, paused]);

  const activeIndex = artworks.length ? currentIndex % artworks.length : 0;
  const current = artworks[activeIndex] ?? fallbackCollection[0];
  const isVerticalArtwork = current.height / current.width >= 1.3;
  const fallbackUrl = localArtworkUrl(current.qid);
  const remoteRequestKey = `${current.qid}:${current.imageUrl}`;
  const imageSource = failedRemoteRequests.has(remoteRequestKey)
    ? fallbackUrl
    : current.imageUrl;
  const visibleCopyKey = `${current.qid}:${imageSource}`;
  const visibleCopySource = visibleCopy.key === visibleCopyKey
    ? visibleCopy.source
    : "loading";
  const visibleCopyLabel = visibleCopySource === "commons"
    ? "COMMONS COPY"
    : visibleCopySource === "local"
      ? "LOCAL COPY"
      : visibleCopySource === "unavailable"
        ? "COPY UNAVAILABLE"
        : "COPY LOADING";

  useEffect(() => {
    if (paused) return;
    if (artworks.length < 2) return;
    for (const offset of [-1, 1]) {
      const adjacent = artworks[(activeIndex + offset + artworks.length) % artworks.length];
      if (!adjacent) continue;
      const preloader = new Image();
      preloader.decoding = "async";
      preloader.onerror = () => {
        if (preloader.dataset.recovery === "local") return;
        preloader.dataset.recovery = "local";
        preloader.src = localArtworkUrl(adjacent.qid);
      };
      preloader.src = adjacent.imageUrl;
    }
  }, [activeIndex, artworks, paused]);

  const navigateManually = useCallback((direction: -1 | 1) => {
    const collectionSize = Math.max(1, artworks.length);
    setCurrentIndex((index) => (index + direction + collectionSize) % collectionSize);
    setTimerReset((value) => value + 1);
  }, [artworks.length]);

  return (
    <section
      className={`gallery-mode${isVerticalArtwork ? " is-vertical-art" : ""}`}
      aria-labelledby="gallery-title"
      aria-describedby="gallery-navigation-help"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      tabIndex={0}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a, button")) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const direction = event.clientX < bounds.left + bounds.width / 2 ? -1 : 1;
        navigateManually(direction);
      }}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          navigateManually(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          navigateManually(1);
        }
      }}
      style={{ "--art-accent": current.accent } as React.CSSProperties}
    >
      <header className="gallery-header">
        <div className="gallery-header-brand">
          <span>SWIKIPEDIA</span>
          <span className="gallery-header-index">/ 02</span>
        </div>
        <div className="gallery-header-actions">
          <div
            className="gallery-header-status"
            aria-live="polite"
            aria-atomic="true"
            data-copy-source={visibleCopySource}
          >
            <span>{visibleCopyLabel}</span>
            <span className="gallery-pulse" aria-hidden="true" />
          </div>
        </div>
      </header>

      <figure className="gallery-plate">
        <div className="gallery-image-stage">
          <img
            key={`backdrop-${current.articleTitle}`}
            className="gallery-backdrop"
            src={imageSource}
            alt=""
            aria-hidden="true"
          />
          <div className="gallery-shade" aria-hidden="true" />
          <div className="gallery-artwork-matte">
            <img
              key={visibleCopyKey}
              className="gallery-artwork"
              src={imageSource}
              alt={`${current.title} by ${current.artist}, ${current.year}`}
              decoding="async"
              fetchPriority="high"
              onLoad={(event) => {
                const renderedSource = classifyArtworkCopySource(
                  event.currentTarget.currentSrc,
                  window.location.href,
                );
                setVisibleCopy({
                  key: visibleCopyKey,
                  source: renderedSource ?? "unavailable",
                });
              }}
              onError={(event) => {
                const failedSource = classifyArtworkCopySource(
                  event.currentTarget.currentSrc || imageSource,
                  window.location.href,
                );
                if (failedSource !== "local") {
                  setFailedRemoteRequests((failed) => {
                    if (failed.has(remoteRequestKey)) return failed;
                    const next = new Set(failed);
                    next.add(remoteRequestKey);
                    return next;
                  });
                  return;
                }
                setVisibleCopy({ key: visibleCopyKey, source: "unavailable" });
              }}
            />
          </div>
        </div>

        <figcaption className="gallery-caption">
          <div className="gallery-caption-rule" aria-hidden="true" />
          <p className="gallery-eyebrow">
            PLATE {String(activeIndex + 1).padStart(3, "0")} / {String(artworks.length).padStart(3, "0")}
          </p>
          <h1 id="gallery-title">{current.title}</h1>
          <div className="gallery-byline">
            <span>{current.artist}</span>
            <span>{current.year}</span>
          </div>
          <p className="gallery-description">{current.description}</p>
          <div className="gallery-meta">
            <span>
              <a
                href={current.articleUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`Read about ${current.title} on Wikipedia (opens in a new tab)`}
              >
                Wikipedia text
              </a>
              {" / "}
              <a
                href={current.licenseUrl}
                target="_blank"
                rel="noreferrer"
                aria-label={`View the ${current.license} license details (opens in a new tab)`}
              >
                {current.license}
              </a>
            </span>
            <span>Next plate / {formatCountdown(remaining)}</span>
          </div>
        </figcaption>
      </figure>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Now showing {current.title} by {current.artist}
      </span>
      <span id="gallery-navigation-help" className="sr-only">
        Click or tap the left half for the previous painting and the right half for the next painting. You can also use the left and right arrow keys.
      </span>
    </section>
  );
}
