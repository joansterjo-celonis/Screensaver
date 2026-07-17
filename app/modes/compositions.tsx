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
  type CompositionMotif,
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

function headlineFor(item: CompositionDeckItem): [string, string] {
  const { artwork, recipe } = item;
  if (recipe.headlineSource === "frame") return ["ALWAYS–ON", "FRAME"];
  if (recipe.headlineSource === "year") return [artwork.year, artwork.title];
  if (recipe.headlineSource === "artist") return balancedLines(artwork.artist);
  return balancedLines(artwork.title);
}

function artistMonogram(artwork: ArtworkSeed) {
  return artwork.artist
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toLocaleUpperCase();
}

function imageSizesFor(item: CompositionDeckItem) {
  const fullWidth =
    item.recipe.family === "horizon" ||
    item.recipe.family === "ribbon" ||
    (item.recipe.family === "bleed" && item.recipe.variant === "d");
  return fullWidth
    ? "100vw"
    : "(max-aspect-ratio: 1/1) 100vw, 70vw";
}

function CompositionDiagram({
  motif,
  signature,
  year,
}: {
  motif: CompositionMotif;
  signature: string;
  year: string;
}) {
  const seed = hashString(signature);
  const yearNumber = Number.parseInt(year.match(/\d{4}/)?.[0] ?? "1500", 10);

  if (motif === "constellation") {
    return (
      <div className="composition-constellation">
        {Array.from({ length: 8 }, (_, index) => (
          <i
            key={index}
            style={
              {
                "--constellation-angle": `${(seed % 37) + index * 45}deg`,
                "--constellation-reach": `${38 + ((seed >> (index % 12)) % 42)}%`,
              } as CSSProperties
            }
          />
        ))}
        <b />
      </div>
    );
  }

  if (motif === "orbit") {
    return (
      <div className="composition-orbit">
        <i /><i /><i />
        {Array.from({ length: 16 }, (_, index) => (
          <b key={index} style={{ transform: `rotate(${index * 22.5}deg)` }} />
        ))}
        <span>{String(yearNumber).slice(-2)}</span>
      </div>
    );
  }

  if (motif === "coordinate") {
    return (
      <div className="composition-coordinate">
        <i className="axis-x" /><i className="axis-y" />
        {Array.from({ length: 7 }, (_, index) => (
          <b
            key={index}
            style={{
              left: `${14 + ((seed >> (index % 16)) % 72)}%`,
              top: `${14 + ((seed >> ((index + 5) % 16)) % 72)}%`,
            }}
          />
        ))}
        <span>X / Y</span>
      </div>
    );
  }

  if (motif === "waveform") {
    return (
      <div className="composition-waveform">
        {Array.from({ length: 24 }, (_, index) => (
          <i
            key={index}
            style={{ height: `${18 + ((seed >> (index % 20)) % 72)}%` }}
          />
        ))}
      </div>
    );
  }

  if (motif === "timeline") {
    return (
      <div className="composition-timeline">
        {Array.from({ length: 7 }, (_, index) => {
          const century = 1300 + index * 100;
          return (
            <span key={century} className={yearNumber >= century && yearNumber < century + 100 ? "is-active" : ""}>
              <b>{String(century).slice(0, 2)}</b><i />
            </span>
          );
        })}
      </div>
    );
  }

  if (motif === "matrix") {
    return (
      <div className="composition-mini-matrix">
        {Array.from({ length: 42 }, (_, index) => (
          <i key={index} className={((seed + index * 13) >>> (index % 17)) % 5 < 2 ? "is-on" : ""} />
        ))}
      </div>
    );
  }

  return (
    <div className={`composition-bars is-${motif}`}>
      {Array.from({ length: 9 }, (_, index) => (
        <span key={index}>
          <b>.{String(index + 1).padStart(2, "0")}</b>
          <i style={{ width: `${32 + ((seed >> (index % 18)) % 64)}%` }} />
          <em>{String((seed + index * 17) % 97).padStart(2, "0")}</em>
        </span>
      ))}
    </div>
  );
}

function CompositionMatrix({ signature }: { signature: string }) {
  const seed = hashString(signature);
  return (
    <div className="composition-cell-field">
      {Array.from({ length: 96 }, (_, index) => {
        const value = hashString(`${seed}:${index}`) % 13;
        return <i key={index} className={value === 0 ? "is-accent" : value < 6 ? "is-on" : ""} />;
      })}
    </div>
  );
}

function CompositionLedger({ item, position }: { item: CompositionDeckItem; position: number }) {
  const { artwork } = item;
  const values = [
    ["QID", artwork.qid],
    ["YEAR", artwork.year],
    ["PX–W", String(artwork.width)],
    ["PX–H", String(artwork.height)],
    ["RATIO", (artwork.width / artwork.height).toFixed(3)],
    ["TITLE", String(artwork.title.length).padStart(2, "0")],
    ["ARTIST", artistMonogram(artwork)],
    ["PLATE", String(position + 1).padStart(3, "0")],
  ];
  return (
    <div className="composition-ledger-list">
      {values.map(([label, value], index) => (
        <span key={label}>
          <b>{label}</b><i /><em className={index === 1 ? "is-accent" : ""}>{value}</em>
        </span>
      ))}
    </div>
  );
}

export function CompositionsMode({ paused = false }: { paused?: boolean }) {
  const sectionRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const [daySeed] = useState(() => Math.floor(Date.now() / 86_400_000));
  const deck = useMemo(
    () => buildCompositionDeck(ARTWORK_SEEDS, `${ARTWORK_DATASET_VERSION}:${daySeed}`),
    [daySeed],
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
    if (paused) return;
    if (deck.length < 2) return;
    let disposed = false;
    const preloaders: HTMLImageElement[] = [];
    const queued = new Set<string>();
    for (const offset of [0, -1, 1]) {
      const adjacent = deck[(activeIndex + offset + deck.length) % deck.length];
      if (
        !adjacent ||
        queued.has(adjacent.artwork.qid) ||
        failedImages.has(adjacent.artwork.qid)
      ) continue;
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
      remotePreloader.srcset = `${commonsRedirect(adjacent.artwork.fallbackFile, 1200)} 1200w, ${commonsRedirect(adjacent.artwork.fallbackFile, 2000)} 2000w, ${commonsRedirect(adjacent.artwork.fallbackFile, 2800)} 2800w`;
      remotePreloader.src = commonsRedirect(adjacent.artwork.fallbackFile, 2400);
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
  const headline = headlineFor(current);
  const sourceShape = artworkShape(artwork);
  const headlineLength = headline.join(" ").length;
  const headlineClass = headlineLength > 46 ? "is-long" : headlineLength > 28 ? "is-medium" : "is-short";
  const signature = `${recipe.id}:${artwork.qid}:${artwork.year}:${artwork.width}x${artwork.height}`;
  const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(artwork.articleTitle.replace(/ /g, "_"))}`;
  const imageMissing = failedImages.has(artwork.qid);
  const measuredPortalAspect = portalMeasurement?.key === currentKey
    ? portalMeasurement.aspect
    : null;
  const measuredCropRetention = measuredPortalAspect
    ? Math.min(
        (artwork.width / artwork.height) / measuredPortalAspect,
        measuredPortalAspect / (artwork.width / artwork.height),
      )
    : 0;
  const resolvedObjectFit =
    measuredPortalAspect === null
      ? "contain"
      : resolveCompositionObjectFit(recipe, artwork, measuredPortalAspect);
  const imageSizes = imageSizesFor(current);
  const useRemoteImage = remoteReady.has(artwork.qid);
  const compositionImageUrl = useRemoteImage
    ? commonsRedirect(artwork.fallbackFile, 2400)
    : localArtworkUrl(artwork.qid);
  const style = {
    "--composition-art-accent": artwork.accent,
    "--composition-focus-x": `${current.focusX}%`,
    "--composition-focus-y": `${current.focusY}%`,
  } as CSSProperties;

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
      style={style}
    >
      <article
        key={`${recipe.id}-${artwork.qid}`}
        className={`composition-sheet composition-family-${recipe.family} composition-variant-${recipe.variant} composition-palette-${recipe.palette} composition-motif-${recipe.motif} composition-shape-${sourceShape.toLocaleLowerCase()} ${headlineClass}${resolvedObjectFit === "contain" ? " is-contained" : ""}`}
        data-composition={recipe.id}
        data-crop-retention={measuredPortalAspect ? measuredCropRetention.toFixed(3) : "measuring"}
      >
        <header className="composition-chrome composition-panel">
          <span>ALWAYS–ON / COMPOSITION ATLAS</span>
          <span>{recipe.name.toLocaleUpperCase()} / {String(activeIndex + 1).padStart(2, "0")}</span>
        </header>

        <div ref={artRef} className={`composition-art composition-panel${imageMissing ? " is-missing" : ""}`}>
          {!imageMissing && (
            <>
              {resolvedObjectFit === "contain" && (
                <img
                  className="composition-art-backdrop"
                  src={useRemoteImage ? commonsRedirect(artwork.fallbackFile, 1200) : localArtworkUrl(artwork.qid)}
                  alt=""
                  aria-hidden="true"
                  decoding="async"
                  style={{ objectPosition: `${current.focusX}% ${current.focusY}%` }}
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
                srcSet={useRemoteImage ? `${commonsRedirect(artwork.fallbackFile, 1200)} 1200w, ${commonsRedirect(artwork.fallbackFile, 2000)} 2000w, ${commonsRedirect(artwork.fallbackFile, 2800)} 2800w` : undefined}
                sizes={imageSizes}
                alt={`${artwork.title} by ${artwork.artist}, ${artwork.year}`}
                decoding="async"
                fetchPriority="high"
                style={{
                  objectFit: resolvedObjectFit,
                  objectPosition: `${current.focusX}% ${current.focusY}%`,
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
          <div className="composition-art-grid" aria-hidden="true" />
          <div className="composition-art-dissolve" aria-hidden="true" />
          <span className="composition-art-label">{artwork.qid} / {artwork.width}×{artwork.height}</span>
          {imageMissing && <span className="composition-image-status">IMAGE SIGNAL RETRYING</span>}
        </div>

        <section className="composition-heading composition-panel">
          <p>PUBLIC DOMAIN / PLATE {String(activeIndex + 1).padStart(3, "0")}</p>
          <h1 id="composition-title">
            <span>{headline[0]}</span>
            {headline[1] && <span>{headline[1]}</span>}
          </h1>
          <small>{artwork.title} · {artwork.artist}</small>
        </section>

        <div className="composition-diagram composition-panel" aria-hidden="true">
          <CompositionDiagram motif={recipe.motif} signature={signature} year={artwork.year} />
        </div>

        <div className="composition-matrix composition-panel" aria-hidden="true">
          <CompositionMatrix signature={signature} />
        </div>

        <div className="composition-ledger composition-panel" aria-hidden="true">
          <CompositionLedger item={current} position={activeIndex} />
        </div>

        <div className="composition-monogram composition-panel" aria-hidden="true">
          <strong>{artistMonogram(artwork)}</strong>
          <span>{artwork.year}</span>
        </div>

        <footer className="composition-footer composition-panel">
          <span>WIKIMEDIA COMMONS / PUBLIC DOMAIN</span>
          <a
            href={articleUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={`Read about ${artwork.title} on Wikipedia (opens in a new tab)`}
          >
            {artwork.title}
          </a>
          <span>NEXT SYSTEM / {formatCountdown(remaining)}</span>
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
