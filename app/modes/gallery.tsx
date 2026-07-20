"use client";

/* eslint-disable @next/next/no-img-element -- Wikimedia Commons images are dynamic cross-origin assets. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { classifyArtworkCopySource } from "../data/artwork-copy-source";
import {
  ARTWORK_DATASET_VERSION,
  ARTWORK_SEEDS,
  commonsRedirect,
  fallbackArtwork,
  localArtworkUrl,
  type ArtworkSeed,
  type GalleryArtwork,
} from "../data/artworks";
import { shuffledCycle } from "../shuffle";
import {
  advanceGalleryDeckPosition,
  currentGalleryDeckQid,
  galleryDeckWindowQids,
  orderGalleryDeckForViewport,
  reorientGalleryDeckRemainder,
  resolveGalleryViewportOrientation,
  retreatGalleryDeckPosition,
  type GalleryDeckPosition,
  type GalleryViewportOrientation,
} from "./gallery-deck";
import { resolveGalleryArtPlacement } from "./gallery-layout";

const CACHE_KEY = "always-on-frame.gallery.v4";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CYCLE_TIME = 5 * 60 * 1000;
const ARTWORK_QIDS = ARTWORK_SEEDS.map(({ qid }) => qid);
const ARTWORK_SEEDS_BY_QID = new Map(ARTWORK_SEEDS.map((seed) => [seed.qid, seed]));

type WikiPage = {
  title: string;
  extract?: string;
  fullurl?: string;
};

type WikiResponse = {
  query?: {
    pages?: WikiPage[];
    redirects?: Array<{ from: string; to: string }>;
    normalized?: Array<{ from: string; to: string }>;
  };
};

type CachedGallery = {
  version: 4;
  datasetVersion: string;
  savedAt: number;
  artworks: GalleryArtwork[];
};

type VisibleCopySource = "loading" | "commons" | "local" | "unavailable";

type VisibleCopyState = {
  key: string;
  source: VisibleCopySource;
};

type GalleryDeckState = GalleryDeckPosition & {
  viewportMeasured: boolean;
  timerRevision: number;
};

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
      parsed.version !== 4 ||
      parsed.datasetVersion !== ARTWORK_DATASET_VERSION ||
      !Array.isArray(parsed.artworks) ||
      parsed.artworks.length !== ARTWORK_SEEDS.length ||
      Date.now() - parsed.savedAt >= CACHE_TTL
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
      version: 4,
      datasetVersion: ARTWORK_DATASET_VERSION,
      savedAt: Date.now(),
      artworks,
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable in private or tightly managed kiosk browsers.
  }
}

async function fetchGallery(
  seeds: readonly ArtworkSeed[],
  signal: AbortSignal,
): Promise<GalleryArtwork[]> {
  if (!seeds.length) return [];
  const wikipedia = new URL("https://en.wikipedia.org/w/api.php");
  wikipedia.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    redirects: "1",
    prop: "extracts|info",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    exlimit: "max",
    inprop: "url",
    maxage: "86400",
    smaxage: "86400",
    titles: seeds.map((item) => item.articleTitle).join("|"),
  }).toString();
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
    const fallback = fallbackArtwork(seed);
    if (!page) return fallback;
    const description = page.extract ? shorten(page.extract) : fallback.description;
    const articleUrl = page.fullurl ?? fallback.articleUrl;
    return { ...fallback, articleUrl, description };
  });
}

function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function GalleryMode({
  paused = false,
  shuffleSeed,
}: {
  paused?: boolean;
  shuffleSeed: string;
}) {
  const galleryRef = useRef<HTMLElement>(null);
  const fallbackCollection = useMemo(
    () => ARTWORK_SEEDS.map(fallbackArtwork),
    [],
  );
  const [artworks, setArtworks] = useState<GalleryArtwork[]>(fallbackCollection);
  const [deckState, setDeckState] = useState<GalleryDeckState>({
    cycle: 0,
    index: 0,
    deck: [],
    history: [],
    orientation: "landscape",
    viewportMeasured: false,
    timerRevision: 0,
  });
  const [nextAt, setNextAt] = useState(() => Date.now() + CYCLE_TIME);
  const [remaining, setRemaining] = useState(CYCLE_TIME);
  const [failedRemoteRequests, setFailedRemoteRequests] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [visibleCopy, setVisibleCopy] = useState<VisibleCopyState>({
    key: "",
    source: "loading",
  });
  const metadataRequestsRef = useRef(new Set<string>());
  const timerGenerationRef = useRef(0);

  useEffect(() => {
    let cacheHydration = 0;
    const cached = readCache();
    if (cached) {
      cacheHydration = window.setTimeout(() => {
        setArtworks(cached.artworks);
      }, 0);
    }
    return () => window.clearTimeout(cacheHydration);
  }, []);

  const buildArtworkDeck = useCallback(
    (cycle: number, viewportOrientation: GalleryViewportOrientation) =>
      orderGalleryDeckForViewport(
        shuffledCycle(
          ARTWORK_QIDS,
          `${shuffleSeed}:gallery`,
          cycle,
          (qid) => qid,
        ),
        ARTWORK_SEEDS,
        viewportOrientation,
      ),
    [shuffleSeed],
  );

  useLayoutEffect(() => {
    const updateViewportOrientation = () => {
      setDeckState((state) => {
        const viewportOrientation = resolveGalleryViewportOrientation(
          window.innerWidth,
          window.innerHeight,
          state.orientation,
        );

        if (!state.viewportMeasured) {
          return {
            ...state,
            deck: [...buildArtworkDeck(state.cycle, viewportOrientation)],
            index: 0,
            orientation: viewportOrientation,
            viewportMeasured: true,
          };
        }
        if (viewportOrientation === state.orientation) return state;

        const previousQid = currentGalleryDeckQid(state);
        const nextPosition = reorientGalleryDeckRemainder(
          state,
          viewportOrientation,
          ARTWORK_SEEDS,
        );
        const artworkChanged =
          currentGalleryDeckQid(nextPosition) !== previousQid;

        return {
          ...state,
          ...nextPosition,
          timerRevision: artworkChanged
            ? state.timerRevision + 1
            : state.timerRevision,
        };
      });
    };

    updateViewportOrientation();
    window.addEventListener("resize", updateViewportOrientation);
    window.addEventListener("orientationchange", updateViewportOrientation);
    return () => {
      window.removeEventListener("resize", updateViewportOrientation);
      window.removeEventListener("orientationchange", updateViewportOrientation);
    };
  }, [buildArtworkDeck]);

  const artworkDeck = deckState.deck;
  const artworksByQid = useMemo(() => {
    const artworksByQid = new Map(
      fallbackCollection.map((artwork) => [artwork.qid, artwork]),
    );
    for (const artwork of artworks) {
      if (artworksByQid.has(artwork.qid)) {
        artworksByQid.set(artwork.qid, artwork);
      }
    }
    return artworksByQid;
  }, [artworks, fallbackCollection]);
  const orderedArtworks = useMemo(
    () => artworkDeck.flatMap((qid) => {
      const artwork = artworksByQid.get(qid);
      return artwork ? [artwork] : [];
    }),
    [artworkDeck, artworksByQid],
  );

  const advance = useCallback(() => {
    setDeckState((state) => {
      if (!state.viewportMeasured) return state;
      const nextPosition = advanceGalleryDeckPosition(state, buildArtworkDeck);
      return { ...state, ...nextPosition };
    });
  }, [buildArtworkDeck]);

  useLayoutEffect(() => {
    if (paused || !deckState.viewportMeasured) return;
    const generation = timerGenerationRef.current + 1;
    timerGenerationRef.current = generation;
    let timeout = 0;
    const schedule = () => {
      const target = Date.now() + CYCLE_TIME;
      setNextAt(target);
      setRemaining(CYCLE_TIME);
      timeout = window.setTimeout(() => {
        if (timerGenerationRef.current !== generation) return;
        advance();
      }, CYCLE_TIME);
    };
    schedule();
    return () => {
      if (timerGenerationRef.current === generation) {
        timerGenerationRef.current += 1;
      }
      window.clearTimeout(timeout);
    };
  }, [
    advance,
    deckState.cycle,
    deckState.index,
    deckState.timerRevision,
    deckState.viewportMeasured,
    paused,
  ]);

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

  const activeIndex = orderedArtworks.length
    ? deckState.index % orderedArtworks.length
    : 0;
  const current = orderedArtworks[activeIndex] ?? fallbackCollection[0];
  const isVerticalArtwork = current.height / current.width >= 1.3;
  const deckWindow = useMemo(
    () => deckState.viewportMeasured
      ? galleryDeckWindowQids(deckState, buildArtworkDeck)
      : { previousQid: undefined, currentQid: undefined, nextQid: undefined },
    [buildArtworkDeck, deckState],
  );
  const metadataWindowQids = useMemo(() => {
    if (!deckState.viewportMeasured) return [];
    return [...new Set([
      deckWindow.previousQid,
      deckWindow.currentQid,
      deckWindow.nextQid,
    ].filter((qid): qid is string => Boolean(qid)))];
  }, [deckState.viewportMeasured, deckWindow]);
  const metadataWindowKey = metadataWindowQids.join("|");

  useEffect(() => {
    if (paused || !deckState.viewportMeasured) return;
    const metadataRequests = metadataRequestsRef.current;
    const qids = metadataWindowKey.split("|").filter(
      (qid) => qid && !metadataRequests.has(qid),
    );
    if (!qids.length) return;
    for (const qid of qids) metadataRequests.add(qid);
    const seeds = qids
      .map((qid) => ARTWORK_SEEDS_BY_QID.get(qid))
      .filter((seed): seed is ArtworkSeed => Boolean(seed));
    const controller = new AbortController();
    let completed = false;
    fetchGallery(seeds, controller.signal)
      .then((enriched) => {
        completed = true;
        if (!enriched.length) return;
        const byQid = new Map(enriched.map((artwork) => [artwork.qid, artwork]));
        setArtworks((existing) => {
          const next = existing.map((artwork) => byQid.get(artwork.qid) ?? artwork);
          window.setTimeout(() => writeCache(next), 0);
          return next;
        });
      })
      .catch(() => {
        for (const qid of qids) metadataRequests.delete(qid);
      });
    return () => {
      controller.abort();
      if (!completed) {
        for (const qid of qids) metadataRequests.delete(qid);
      }
    };
  }, [deckState.viewportMeasured, metadataWindowKey, paused]);

  const recoveryUrl = current.localFallback
    ? localArtworkUrl(current.qid)
    : commonsRedirect(current.fallbackFile, 1_600);
  const remoteRequestKey = `${current.qid}:${current.imageUrl}`;
  const imageSource = failedRemoteRequests.has(remoteRequestKey)
    ? recoveryUrl
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

  useLayoutEffect(() => {
    const gallery = galleryRef.current;
    if (!gallery) return;

    const placeArtwork = () => {
      const bounds = gallery.getBoundingClientRect();
      const placement = resolveGalleryArtPlacement(
        bounds.width,
        bounds.height,
        current.width,
        current.height,
      );
      gallery.style.setProperty("--gallery-art-center-y", `${placement.centerY}px`);
      gallery.dataset.artAvoidsCaption = String(placement.canAvoidCaption);
    };

    placeArtwork();
    const observer = "ResizeObserver" in window
      ? new ResizeObserver(placeArtwork)
      : null;
    observer?.observe(gallery);
    window.addEventListener("resize", placeArtwork);
    window.addEventListener("orientationchange", placeArtwork);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", placeArtwork);
      window.removeEventListener("orientationchange", placeArtwork);
    };
  }, [current.height, current.width]);

  useEffect(() => {
    if (paused || !deckState.viewportMeasured) return;
    const adjacentQids = new Set([
      deckWindow.previousQid,
      deckWindow.nextQid,
    ]);
    adjacentQids.delete(undefined);
    for (const qid of adjacentQids) {
      const adjacent = qid ? artworksByQid.get(qid) : undefined;
      if (!adjacent) continue;
      const preloader = new Image();
      preloader.decoding = "async";
      preloader.onerror = () => {
        if (preloader.dataset.recovery) return;
        preloader.dataset.recovery = adjacent.localFallback ? "local" : "commons";
        preloader.src = adjacent.localFallback
          ? localArtworkUrl(adjacent.qid)
          : commonsRedirect(adjacent.fallbackFile, 1_600);
      };
      preloader.src = adjacent.imageUrl;
    }
  }, [
    artworksByQid,
    deckState.viewportMeasured,
    deckWindow.nextQid,
    deckWindow.previousQid,
    paused,
  ]);

  const navigateManually = useCallback((direction: -1 | 1) => {
    setDeckState((state) => {
      if (!state.viewportMeasured) return state;
      const nextPosition = direction > 0
        ? advanceGalleryDeckPosition(state, buildArtworkDeck)
        : retreatGalleryDeckPosition(state, buildArtworkDeck);
      return {
        ...state,
        ...nextPosition,
        timerRevision: state.timerRevision + 1,
      };
    });
  }, [buildArtworkDeck]);

  return (
    <section
      ref={galleryRef}
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
      style={{
        "--art-accent": current.accent,
        "--gallery-art-center-y": "50%",
      } as React.CSSProperties}
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
          {deckState.viewportMeasured && (
            <img
              key={`backdrop-${current.articleTitle}`}
              className="gallery-backdrop"
              src={imageSource}
              alt=""
              aria-hidden="true"
            />
          )}
          <div className="gallery-shade" aria-hidden="true" />
          <div className="gallery-artwork-matte">
            {deckState.viewportMeasured && (
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
                  if (failedSource !== "local" && imageSource === current.imageUrl) {
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
            )}
          </div>
        </div>

        <figcaption className="gallery-caption">
          <div className="gallery-caption-rule" aria-hidden="true" />
          <p className="gallery-eyebrow">
            PLATE {String(activeIndex + 1).padStart(3, "0")} / {String(orderedArtworks.length).padStart(3, "0")}
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
