"use client";

/* eslint-disable @next/next/no-img-element -- Wikimedia Commons images are dynamic cross-origin assets. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  ARTWORK_DATASET_VERSION,
  ARTWORK_SEEDS,
  commonsRedirect,
  localArtworkUrl,
  type ArtworkSeed,
} from "../data/artworks";
import {
  artworkShape,
  buildCompositionDeck,
  COMPOSITION_COUNT,
  COMPOSITION_CYCLE_TIME,
  resolveCompositionObjectFit,
  type CompositionDeckItem,
  type CompositionRecipe,
  type CompositionRect,
} from "./composition-library";

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function balancedLines(value: string): [string, string] {
  const words = value.trim().split(/\s+/).filter(Boolean);
  if (words.length < 2) return [value, ""];
  let split = 1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const left = words.slice(0, index).join(" ");
    const right = words.slice(index).join(" ");
    const delta = Math.abs(left.length - right.length);
    if (delta < bestDelta) {
      bestDelta = delta;
      split = index;
    }
  }
  return [words.slice(0, split).join(" "), words.slice(split).join(" ")];
}

function imageSizesFor(item: CompositionDeckItem) {
  if (item.recipe.artTreatment === "portrait-anchor") {
    return "(max-aspect-ratio: 5/4) 100vw, 72vw";
  }
  return "100vw";
}

function rectVariables(prefix: string, rect: CompositionRect) {
  const [x, y, width, height] = rect;
  return {
    [`--${prefix}-x`]: `${x}%`,
    [`--${prefix}-y`]: `${y}%`,
    [`--${prefix}-w`]: `${width}%`,
    [`--${prefix}-h`]: `${height}%`,
  };
}

function compositionStyle(recipe: CompositionRecipe, artwork: ArtworkSeed) {
  const signature = `${recipe.id}:${artwork.qid}`;
  const seed = hashString(signature);
  return {
    ...rectVariables("art", recipe.landscape.art),
    ...rectVariables("heading", recipe.landscape.heading),
    ...rectVariables("motif", recipe.landscape.motif),
    ...rectVariables("details", recipe.landscape.details),
    ...rectVariables("portrait-art", recipe.portrait.art),
    ...rectVariables("portrait-heading", recipe.portrait.heading),
    ...rectVariables("portrait-motif", recipe.portrait.motif),
    ...rectVariables("portrait-details", recipe.portrait.details),
    "--composition-art-accent": artwork.accent,
    "--composition-focus-x": `${recipe.focusX}%`,
    "--composition-focus-y": `${recipe.focusY}%`,
    "--composition-grain": String(0.14 + (seed % 8) / 100),
    "--composition-wear-x": `${12 + (seed % 77)}%`,
    "--composition-wear-y": `${10 + ((seed >> 8) % 79)}%`,
    "--composition-register": `${(seed % 3) + 1}px`,
  } as CSSProperties;
}

function CompositionMark({ recipe, signature }: { recipe: CompositionRecipe; signature: string }) {
  const seed = hashString(signature);
  return (
    <div className="composition-mark">
      <span className="mark-axis-a" />
      <span className="mark-axis-b" />
      {Array.from({ length: 14 }, (_, index) => {
        const value = hashString(`${seed}:${recipe.motif}:${index}`);
        return (
          <i
            key={index}
            style={
              {
                "--mark-index": index,
                "--mark-value": value % 100,
                "--mark-angle": `${(value + index * 29) % 360}deg`,
                "--mark-x": `${7 + (value % 86)}%`,
                "--mark-y": `${8 + ((value >> 7) % 84)}%`,
                "--mark-size": `${2 + ((value >> 13) % 7)}px`,
              } as CSSProperties
            }
          />
        );
      })}
      <b />
      <small>{recipe.motifLabel}</small>
    </div>
  );
}

export function CompositionsMode({ paused = false }: { paused?: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const deck = useMemo(
    () => buildCompositionDeck(ARTWORK_SEEDS, ARTWORK_DATASET_VERSION),
    [],
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timerReset, setTimerReset] = useState(0);
  const [remaining, setRemaining] = useState(COMPOSITION_CYCLE_TIME);
  const [failedImages, setFailedImages] = useState<ReadonlyMap<string, number>>(() => new Map());
  const [remoteReady, setRemoteReady] = useState<ReadonlySet<string>>(() => new Set());
  const [portalMeasurement, setPortalMeasurement] = useState<{
    key: string;
    aspect: number;
  } | null>(null);

  const activeIndex = deck.length ? currentIndex % deck.length : 0;
  const current = deck[activeIndex];
  const currentKey = current ? `${current.recipe.id}:${current.artwork.qid}` : "";
  const failedAt = current ? failedImages.get(current.artwork.qid) : undefined;

  useEffect(() => {
    if (paused) return;
    sectionRef.current?.focus({ preventScroll: true });
  }, [paused]);

  useEffect(() => {
    if (paused || !currentKey) return;
    const element = artRef.current;
    if (!element) return;
    let initialMeasure = 0;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const aspect = bounds.width / bounds.height;
      setPortalMeasurement((previous) =>
        previous?.key === currentKey && Math.abs(previous.aspect - aspect) < 0.01
          ? previous
          : { key: currentKey, aspect },
      );
    };
    const observer = "ResizeObserver" in window ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    initialMeasure = window.setTimeout(measure, 0);
    return () => {
      window.clearTimeout(initialMeasure);
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
  }, [currentKey, paused]);

  const advance = useCallback(() => {
    setCurrentIndex((index) => (index + 1) % Math.max(1, deck.length));
  }, [deck.length]);

  useEffect(() => {
    if (paused) return;
    let disposed = false;
    const target = Date.now() + COMPOSITION_CYCLE_TIME;
    let tickTimeout = 0;
    const tick = () => {
      if (disposed) return;
      setRemaining(target - Date.now());
      tickTimeout = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tickTimeout = window.setTimeout(tick, 0);
    const advanceTimeout = window.setTimeout(() => {
      if (!disposed) advance();
    }, COMPOSITION_CYCLE_TIME);
    return () => {
      disposed = true;
      window.clearTimeout(tickTimeout);
      window.clearTimeout(advanceTimeout);
    };
  }, [advance, paused, timerReset, currentIndex]);

  useEffect(() => {
    if (paused || deck.length < 2) return;
    let disposed = false;
    const preloaders: HTMLImageElement[] = [];
    const queued = new Set<string>();
    for (const offset of [0, -1, 1]) {
      const adjacent = deck[(activeIndex + offset + deck.length) % deck.length];
      if (!adjacent || queued.has(adjacent.artwork.qid) || failedImages.has(adjacent.artwork.qid)) continue;
      queued.add(adjacent.artwork.qid);

      const localPreloader = new Image();
      localPreloader.decoding = "async";
      localPreloader.src = localArtworkUrl(adjacent.artwork.qid);
      preloaders.push(localPreloader);

      const remotePreloader = new Image();
      remotePreloader.decoding = "async";
      remotePreloader.sizes = imageSizesFor(adjacent);
      remotePreloader.onload = () => {
        if (disposed) return;
        setRemoteReady((ready) => {
          if (ready.has(adjacent.artwork.qid)) return ready;
          const next = new Set(ready);
          next.add(adjacent.artwork.qid);
          return next;
        });
      };
      remotePreloader.srcset = `${commonsRedirect(adjacent.artwork.fallbackFile, 1600)} 1600w, ${commonsRedirect(adjacent.artwork.fallbackFile, 2400)} 2400w, ${commonsRedirect(adjacent.artwork.fallbackFile, 3200)} 3200w, ${commonsRedirect(adjacent.artwork.fallbackFile, 4096)} 4096w`;
      remotePreloader.src = commonsRedirect(adjacent.artwork.fallbackFile, 3200);
      preloaders.push(remotePreloader);
    }
    return () => {
      disposed = true;
      for (const preloader of preloaders) {
        preloader.onload = null;
        preloader.onerror = null;
      }
    };
  }, [activeIndex, deck, failedImages, paused]);

  useEffect(() => {
    if (paused || !currentKey || failedAt === undefined) return;
    const retryDelay = Math.max(1_000, 30_000 - (Date.now() - failedAt));
    const retry = window.setTimeout(() => {
      setFailedImages((failed) => {
        const next = new Map(failed);
        next.delete(current?.artwork.qid ?? "");
        return next;
      });
    }, retryDelay);
    return () => window.clearTimeout(retry);
  }, [current?.artwork.qid, currentKey, failedAt, paused]);

  const navigateManually = useCallback((direction: -1 | 1) => {
    setCurrentIndex((index) => (index + direction + Math.max(1, deck.length)) % Math.max(1, deck.length));
    setTimerReset((value) => value + 1);
  }, [deck.length]);

  if (!current) {
    return <section className="composition-mode" aria-label="Composition Atlas is unavailable" />;
  }

  const { artwork, recipe } = current;
  const headline = balancedLines(artwork.title);
  const sourceShape = artworkShape(artwork);
  const headlineLength = artwork.title.length;
  const headlineClass = headlineLength > 46 ? "is-long" : headlineLength > 28 ? "is-medium" : "is-short";
  const signature = `${recipe.id}:${artwork.qid}:${artwork.year}:${artwork.width}x${artwork.height}`;
  const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(artwork.articleTitle.replace(/ /g, "_"))}`;
  const imageMissing = failedImages.has(artwork.qid);
  const measuredPortalAspect = portalMeasurement?.key === currentKey ? portalMeasurement.aspect : null;
  const measuredCropRetention = measuredPortalAspect
    ? Math.min(
        (artwork.width / artwork.height) / measuredPortalAspect,
        measuredPortalAspect / (artwork.width / artwork.height),
      )
    : 0;
  const resolvedObjectFit = measuredPortalAspect === null
    ? "contain"
    : resolveCompositionObjectFit(recipe, artwork, measuredPortalAspect);
  const imageSizes = imageSizesFor(current);
  const useRemoteImage = remoteReady.has(artwork.qid);
  const compositionImageUrl = useRemoteImage
    ? commonsRedirect(artwork.fallbackFile, 3200)
    : localArtworkUrl(artwork.qid);

  return (
    <section
      ref={sectionRef}
      className="composition-mode"
      aria-labelledby="composition-title"
      aria-describedby="composition-navigation-help"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      tabIndex={0}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a, button")) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        navigateManually(event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
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
    >
      <article
        key={`${recipe.id}-${artwork.qid}`}
        className={`composition-sheet composition-palette-${recipe.palette} composition-surface-${recipe.surface} composition-title-${recipe.titleMode} composition-treatment-${recipe.artTreatment} composition-motif-${recipe.motif} composition-shape-${sourceShape.toLocaleLowerCase()} ${headlineClass}${resolvedObjectFit === "contain" ? " is-contained" : ""}`}
        data-composition={recipe.id}
        data-artwork={artwork.qid}
        data-theme={recipe.theme}
        data-crop-retention={measuredPortalAspect ? measuredCropRetention.toFixed(3) : "measuring"}
        style={compositionStyle(recipe, artwork)}
      >
        <header className="composition-chrome">
          <span>SWIKIPEDIA / COMPOSITION ATLAS</span>
          <span>{String(activeIndex + 1).padStart(2, "0")} / {String(COMPOSITION_COUNT).padStart(2, "0")}</span>
          <span>{recipe.name.toLocaleUpperCase()}</span>
        </header>

        <div ref={artRef} className={`composition-art${imageMissing ? " is-missing" : ""}`}>
          {!imageMissing && (
            <>
              {resolvedObjectFit === "contain" && (
                <img
                  className="composition-art-backdrop"
                  src={useRemoteImage ? commonsRedirect(artwork.fallbackFile, 1600) : localArtworkUrl(artwork.qid)}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  style={{ objectPosition: `${recipe.focusX}% ${recipe.focusY}%` }}
                  onError={(event) => {
                    const image = event.currentTarget;
                    if (image.dataset.recovery === "local") {
                      image.style.display = "none";
                      return;
                    }
                    image.dataset.recovery = "local";
                    image.src = localArtworkUrl(artwork.qid);
                  }}
                />
              )}
              <img
                className="composition-art-image"
                src={compositionImageUrl}
                srcSet={useRemoteImage ? `${commonsRedirect(artwork.fallbackFile, 1600)} 1600w, ${commonsRedirect(artwork.fallbackFile, 2400)} 2400w, ${commonsRedirect(artwork.fallbackFile, 3200)} 3200w, ${commonsRedirect(artwork.fallbackFile, 4096)} 4096w` : undefined}
                sizes={imageSizes}
                alt={`${artwork.title} by ${artwork.artist}, ${artwork.year}`}
                decoding="async"
                fetchPriority="high"
                style={{
                  objectFit: resolvedObjectFit,
                  objectPosition: `${recipe.focusX}% ${recipe.focusY}%`,
                }}
                onError={() => {
                  if (useRemoteImage) {
                    setRemoteReady((ready) => {
                      const next = new Set(ready);
                      next.delete(artwork.qid);
                      return next;
                    });
                    return;
                  }
                  setFailedImages((failed) => {
                    const next = new Map(failed);
                    next.set(artwork.qid, Date.now());
                    return next;
                  });
                }}
              />
            </>
          )}
          <div className="composition-art-wash" aria-hidden="true" />
          <span className="composition-art-label">{artwork.qid} / {artwork.width}×{artwork.height}</span>
          {imageMissing && <span className="composition-image-status">LOCAL IMAGE SIGNAL RETRYING</span>}
        </div>

        <section className="composition-heading">
          <p>{recipe.theme} / {artwork.year}</p>
          <h1 id="composition-title">
            <span>{headline[0]}</span>
            {headline[1] && <span>{headline[1]}</span>}
          </h1>
          <small>{artwork.artist} · {recipe.motifLabel}</small>
        </section>

        <div className="composition-motif" aria-hidden="true">
          <CompositionMark recipe={recipe} signature={signature} />
        </div>

        <aside className="composition-details" aria-label="Artwork details">
          <span>PLATE {String(activeIndex + 1).padStart(3, "0")}</span>
          <strong>{artwork.artist}</strong>
          <span>{artwork.year} · {artwork.width}×{artwork.height}</span>
          <span>{recipe.motifLabel}</span>
        </aside>

        <footer className="composition-footer">
          <span>WIKIMEDIA COMMONS / PUBLIC DOMAIN</span>
          <a
            href={articleUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Read about ${artwork.title} on Wikipedia (opens in a new tab)`}
          >
            {artwork.title}
          </a>
          <span>NEXT POSTER / {formatCountdown(remaining)}</span>
        </footer>
      </article>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Composition {activeIndex + 1} of {COMPOSITION_COUNT}: {recipe.name}, featuring {artwork.title} by {artwork.artist}.
      </span>
      <span id="composition-navigation-help" className="sr-only">
        Click or tap the left half for the previous composition and the right half for the next composition. You can also use the left and right arrow keys.
      </span>
    </section>
  );
}
