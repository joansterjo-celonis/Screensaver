"use client";

/* eslint-disable @next/next/no-img-element -- Wikimedia Commons images are dynamic cross-origin assets. */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import {
  MOTIF_BLUEPRINTS,
  type DiagramElement,
  type Point,
} from "./composition-motifs";
import {
  resolveCompositionGeometry,
  resolveCompositionMotifAttachment,
  resolveCompositionViewportProfile,
  type CompositionViewportProfile,
} from "./composition-layout";
import {
  getCompositionPalette,
  type PosterPalette,
} from "./composition-palettes";

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

function compositionStyle(
  recipe: CompositionRecipe,
  artwork: ArtworkSeed,
  palette: PosterPalette,
  geometry: ReturnType<typeof resolveCompositionGeometry>,
) {
  const signature = `${recipe.id}:${artwork.qid}`;
  const seed = hashString(signature);
  return {
    ...rectVariables("layout-art", geometry.art),
    ...rectVariables("layout-heading", geometry.heading),
    ...rectVariables("layout-motif", geometry.motif),
    ...rectVariables("layout-details", geometry.details),
    "--composition-bg": palette.paper,
    "--composition-ink": palette.ink,
    "--composition-accent": palette.accent,
    "--composition-accent-readable": `color-mix(in srgb, ${palette.accent} 15%, ${palette.ink})`,
    "--composition-field": palette.field,
    "--composition-spot": palette.accent,
    "--composition-art-accent": palette.accent,
    "--composition-dim": `color-mix(in srgb, ${palette.ink} 62%, transparent)`,
    "--composition-line": `color-mix(in srgb, ${palette.ink} 30%, transparent)`,
    "--composition-focus-x": `${recipe.focusX}%`,
    "--composition-focus-y": `${recipe.focusY}%`,
    "--composition-grain-variation": String(0.015 + (seed % 7) / 200),
    "--composition-wear-x": `${12 + (seed % 77)}%`,
    "--composition-wear-y": `${10 + ((seed >> 8) % 79)}%`,
  } as CSSProperties;
}

function pathData(
  points: readonly Point[],
  curve: "linear" | "smooth",
  closed: boolean,
) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0][0]} ${points[0][1]}`;
  if (curve === "linear") {
    const segments = points.slice(1).map(([x, y]) => `L ${x} ${y}`).join(" ");
    return `M ${points[0][0]} ${points[0][1]} ${segments}${closed ? " Z" : ""}`;
  }

  const segmentCount = closed ? points.length : points.length - 1;
  let data = `M ${points[0][0]} ${points[0][1]}`;
  for (let index = 0; index < segmentCount; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const start = points[index % points.length];
    const end = points[(index + 1) % points.length];
    const next = points[(index + 2) % points.length];
    const p0 = closed || index > 0 ? previous : start;
    const p3 = closed || index + 2 < points.length ? next : end;
    const controlA: Point = [
      start[0] + (end[0] - p0[0]) / 6,
      start[1] + (end[1] - p0[1]) / 6,
    ];
    const controlB: Point = [
      end[0] - (p3[0] - start[0]) / 6,
      end[1] - (p3[1] - start[1]) / 6,
    ];
    data += ` C ${controlA[0]} ${controlA[1]}, ${controlB[0]} ${controlB[1]}, ${end[0]} ${end[1]}`;
  }
  return `${data}${closed ? " Z" : ""}`;
}

function pointList(points: readonly Point[]) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}

function diagramClass(element: DiagramElement, mode: "stroke" | "fill") {
  return `composition-diagram-element tone-${element.tone} mode-${mode}`;
}

function DiagramElementView({ element }: { element: DiagramElement }) {
  if (element.kind === "line") {
    return (
      <line
        className={diagramClass(element, "stroke")}
        data-element={element.id}
        x1={element.from[0]}
        y1={element.from[1]}
        x2={element.to[0]}
        y2={element.to[1]}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (element.kind === "rayFan") {
    return (
      <g
        className={diagramClass(element, "stroke")}
        data-element={element.id}
        data-origin={`${element.origin[0]},${element.origin[1]}`}
      >
        {element.targets.map((target, index) => (
          <line
            key={`${element.id}-${index}`}
            x1={element.origin[0]}
            y1={element.origin[1]}
            x2={target[0]}
            y2={target[1]}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </g>
    );
  }
  if (element.kind === "path") {
    return (
      <path
        className={diagramClass(element, element.mode)}
        data-element={element.id}
        d={pathData(element.points, element.curve, element.closed)}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (element.kind === "rect") {
    return (
      <rect
        className={diagramClass(element, element.mode)}
        data-element={element.id}
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rx={element.radius}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  if (element.kind === "polygon") {
    return (
      <polygon
        className={diagramClass(element, element.mode)}
        data-element={element.id}
        points={pointList(element.points)}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  return (
    <ellipse
      className={diagramClass(element, element.mode)}
      data-element={element.id}
      data-role={element.role}
      cx={element.cx}
      cy={element.cy}
      rx={element.rx}
      ry={element.ry}
      transform={element.rotation ? `rotate(${element.rotation} ${element.cx} ${element.cy})` : undefined}
      vectorEffect="non-scaling-stroke"
    />
  );
}

function CompositionBlueprint({ recipe }: { recipe: CompositionRecipe }) {
  const blueprint = MOTIF_BLUEPRINTS[recipe.motif];
  const [, , width, height] = blueprint.viewBox;
  const preserveAspectRatio = blueprint.align === "start"
    ? "xMinYMid meet"
    : blueprint.align === "end"
      ? "xMaxYMid meet"
      : "xMidYMid meet";
  return (
    <div
      className="composition-blueprint"
      data-align={blueprint.align}
      data-label-edge={blueprint.labelEdge}
      data-semantic-tags={blueprint.semanticTags.join(" ")}
      style={{ "--motif-aspect": String(width / height) } as CSSProperties}
    >
      <svg
        className="composition-diagram"
        viewBox={blueprint.viewBox.join(" ")}
        preserveAspectRatio={preserveAspectRatio}
        role="presentation"
      >
        {blueprint.elements.map((element) => (
          <DiagramElementView key={element.id} element={element} />
        ))}
      </svg>
      <small>{recipe.motifLabel}</small>
    </div>
  );
}

export function CompositionsMode({
  paused = false,
  shuffleSeed,
}: {
  paused?: boolean;
  shuffleSeed: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const artRef = useRef<HTMLDivElement>(null);
  const [cycle, setCycle] = useState(0);
  const compositionSeed = shuffleSeed
    ? `${ARTWORK_DATASET_VERSION}:composition-atlas:${shuffleSeed}`
    : "";
  const deck = useMemo(
    () => buildCompositionDeck(ARTWORK_SEEDS, compositionSeed, cycle),
    [compositionSeed, cycle],
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
  const [viewportMeasurement, setViewportMeasurement] = useState<{
    profile: CompositionViewportProfile;
    width: number;
    height: number;
  }>({ profile: "landscape", width: 0, height: 0 });
  const viewportProfile = viewportMeasurement.profile;

  const activeIndex = deck.length ? currentIndex % deck.length : 0;
  const current = deck[activeIndex];
  const currentKey = current ? `${current.recipe.id}:${current.artwork.qid}` : "";
  const failedAt = current ? failedImages.get(current.artwork.qid) : undefined;

  useEffect(() => {
    if (paused) return;
    sectionRef.current?.focus({ preventScroll: true });
  }, [paused]);

  useLayoutEffect(() => {
    if (paused) return;
    const element = sectionRef.current;
    if (!element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const next = resolveCompositionViewportProfile(bounds.width, bounds.height);
      setViewportMeasurement((previous) =>
        previous.profile === next &&
        Math.abs(previous.width - bounds.width) < 0.5 &&
        Math.abs(previous.height - bounds.height) < 0.5
          ? previous
          : { profile: next, width: bounds.width, height: bounds.height },
      );
    };
    const observer = "ResizeObserver" in window ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    measure();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
    };
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
    if (!deck.length) return;
    if (activeIndex === deck.length - 1) {
      setCycle((value) => value + 1);
      setCurrentIndex(0);
      return;
    }
    setCurrentIndex((index) => index + 1);
  }, [activeIndex, deck.length]);

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
    if (!deck.length) return;
    if (direction === 1 && activeIndex === deck.length - 1) {
      setCycle((value) => value + 1);
      setCurrentIndex(0);
    } else {
      setCurrentIndex((index) =>
        direction === -1 && index === 0
          ? deck.length - 1
          : index + direction,
      );
    }
    setTimerReset((value) => value + 1);
  }, [activeIndex, deck.length]);

  if (!current) {
    return <section className="composition-mode" aria-label="Composition Atlas is unavailable" />;
  }

  const { artwork, recipe } = current;
  const palette = getCompositionPalette(artwork.qid);
  const resolvedGeometry = resolveCompositionGeometry(recipe, viewportProfile);
  const motifAttachment = resolveCompositionMotifAttachment(resolvedGeometry);
  const headline = balancedLines(artwork.title);
  const sourceShape = artworkShape(artwork);
  const headlineLength = artwork.title.length;
  const headlineClass = headlineLength > 46 ? "is-long" : headlineLength > 28 ? "is-medium" : "is-short";
  const articleUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(artwork.articleTitle.replace(/ /g, "_"))}`;
  const imageMissing = failedImages.has(artwork.qid);
  const measuredPortalAspect = portalMeasurement?.key === currentKey ? portalMeasurement.aspect : null;
  const estimatedPortalAspect = viewportMeasurement.width > 0 && viewportMeasurement.height > 0
    ? (viewportMeasurement.width * resolvedGeometry.art[2]) /
      (viewportMeasurement.height * resolvedGeometry.art[3])
    : null;
  const effectivePortalAspect = measuredPortalAspect ?? estimatedPortalAspect;
  const measuredCropRetention = effectivePortalAspect
    ? Math.min(
        (artwork.width / artwork.height) / effectivePortalAspect,
        effectivePortalAspect / (artwork.width / artwork.height),
      )
    : 0;
  const resolvedObjectFit = effectivePortalAspect === null
    ? "contain"
    : resolveCompositionObjectFit(recipe, artwork, effectivePortalAspect);
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
        data-viewport-profile={viewportProfile}
        data-crop-retention={effectivePortalAspect ? measuredCropRetention.toFixed(3) : "measuring"}
        style={compositionStyle(recipe, artwork, palette, resolvedGeometry)}
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
                  src={useRemoteImage ? commonsRedirect(artwork.fallbackFile, 2400) : localArtworkUrl(artwork.qid)}
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

        <div
          className="composition-motif"
          data-attach-x={motifAttachment.horizontal}
          data-attach-y={motifAttachment.vertical}
          aria-hidden="true"
        >
          <CompositionBlueprint recipe={recipe} />
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
