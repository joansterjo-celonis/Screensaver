"use client";

/* eslint-disable @next/next/no-img-element -- Posterjo is a generated local 4K archive. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  POSTERJO_ARTWORKS,
  posterjoArtworkUrl,
} from "../data/posterjo";
import { shuffledCycle } from "../shuffle";

const CYCLE_TIME = 5 * 60 * 1000;

function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function PosterjoMode({
  paused = false,
  shuffleSeed,
}: {
  paused?: boolean;
  shuffleSeed: string;
}) {
  const [deckPosition, setDeckPosition] = useState({ cycle: 0, index: 0 });
  const [failedArtworkIds, setFailedArtworkIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [remaining, setRemaining] = useState(CYCLE_TIME);
  const [timerEpoch, setTimerEpoch] = useState(0);
  const deadlineRef = useRef<number | null>(null);
  const remainingRef = useRef(CYCLE_TIME);

  const orderedArtworks = useMemo(
    () => shuffledCycle(
      POSTERJO_ARTWORKS,
      `${shuffleSeed}:posterjo`,
      deckPosition.cycle,
      (artwork) => artwork.id,
    ),
    [deckPosition.cycle, shuffleSeed],
  );

  const activeIndex = orderedArtworks.length
    ? deckPosition.index % orderedArtworks.length
    : 0;
  const current = orderedArtworks[activeIndex] ?? null;

  const advance = useCallback(() => {
    const collectionSize = Math.max(1, orderedArtworks.length);
    setDeckPosition((position) => position.index + 1 >= collectionSize
      ? { cycle: position.cycle + 1, index: 0 }
      : { ...position, index: position.index + 1 });
  }, [orderedArtworks.length]);

  const resetTimer = useCallback(() => {
    deadlineRef.current = null;
    remainingRef.current = CYCLE_TIME;
    setRemaining(CYCLE_TIME);
    setTimerEpoch((value) => value + 1);
  }, []);

  useEffect(() => {
    if (paused) return;

    const duration = Math.max(0, remainingRef.current);
    const deadline = Date.now() + duration;
    deadlineRef.current = deadline;
    setRemaining(duration);

    let tickTimeout = 0;
    const updateCountdown = () => {
      const nextRemaining = Math.max(0, deadline - Date.now());
      remainingRef.current = nextRemaining;
      setRemaining(nextRemaining);
      if (nextRemaining > 0) {
        tickTimeout = window.setTimeout(
          updateCountdown,
          Math.min(1000, nextRemaining),
        );
      }
    };

    tickTimeout = window.setTimeout(updateCountdown, Math.min(1000, duration));
    const advanceTimeout = window.setTimeout(() => {
      deadlineRef.current = null;
      remainingRef.current = CYCLE_TIME;
      setRemaining(CYCLE_TIME);
      advance();
      setTimerEpoch((value) => value + 1);
    }, duration);

    return () => {
      window.clearTimeout(tickTimeout);
      window.clearTimeout(advanceTimeout);
      if (deadlineRef.current === deadline) {
        remainingRef.current = Math.max(0, deadline - Date.now());
        deadlineRef.current = null;
      }
    };
  }, [advance, paused, timerEpoch]);

  const navigateManually = useCallback((direction: -1 | 1) => {
    const collectionSize = Math.max(1, orderedArtworks.length);
    setDeckPosition((position) => {
      if (direction > 0 && position.index + 1 >= collectionSize) {
        return { cycle: position.cycle + 1, index: 0 };
      }
      return {
        ...position,
        index: (position.index + direction + collectionSize) % collectionSize,
      };
    });
    resetTimer();
  }, [orderedArtworks.length, resetTimer]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (paused || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (
        event.target instanceof HTMLElement &&
        event.target.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }

      event.preventDefault();
      navigateManually(event.key === "ArrowLeft" ? -1 : 1);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigateManually, paused]);

  useEffect(() => {
    if (paused || orderedArtworks.length < 2) return;

    const adjacent = [
      orderedArtworks[
        (activeIndex - 1 + orderedArtworks.length) % orderedArtworks.length
      ],
      orderedArtworks[(activeIndex + 1) % orderedArtworks.length],
    ];

    for (const artwork of adjacent) {
      if (!artwork || failedArtworkIds.has(artwork.id)) continue;
      const preloader = new Image();
      preloader.decoding = "async";
      preloader.src = posterjoArtworkUrl(artwork);
    }
  }, [activeIndex, failedArtworkIds, orderedArtworks, paused]);

  const imageFailed = current ? failedArtworkIds.has(current.id) : true;
  const imageUrl = current ? posterjoArtworkUrl(current) : "";

  return (
    <section
      className="posterjo-mode"
      aria-labelledby="posterjo-title"
      aria-describedby="posterjo-navigation-help"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      tabIndex={0}
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest("a, button")) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        navigateManually(event.clientX < bounds.left + bounds.width / 2 ? -1 : 1);
      }}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <header className="posterjo-header">
        <div className="posterjo-header-brand">
          <span>POSTERJO</span>
          <span className="posterjo-header-index">/ 03</span>
        </div>
        <div className="posterjo-header-status">
          <span>LOCAL 4K ARCHIVE</span>
          <span className="posterjo-status-dot" aria-hidden="true" />
        </div>
      </header>

      <figure
        className="posterjo-plate"
        style={{ position: "absolute", inset: 0, margin: 0 }}
      >
        <div
          className="posterjo-image-stage"
          style={{ position: "absolute", inset: 0, overflow: "hidden" }}
        >
          {!imageFailed && current ? (
            <img
              key={current.id}
              className="posterjo-artwork"
              src={imageUrl}
              alt={current.title}
              decoding="async"
              fetchPriority="high"
              draggable={false}
              onError={() => {
                setFailedArtworkIds((failed) => {
                  if (failed.has(current.id)) return failed;
                  const next = new Set(failed);
                  next.add(current.id);
                  return next;
                });
              }}
              style={{
                position: "absolute",
                inset: 0,
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center",
              }}
            />
          ) : (
            <div
              className="posterjo-image-fallback"
              role="img"
              aria-label={current
                ? `${current.title} could not be displayed`
                : "No Posterjo artwork is available"}
              style={{ position: "absolute", inset: 0 }}
            >
              <span>ARTWORK UNAVAILABLE</span>
            </div>
          )}
        </div>

        <figcaption className="posterjo-caption posterjo-footer">
          <div className="posterjo-footer-rule" aria-hidden="true" />
          <p
            className="posterjo-eyebrow"
            aria-label={`Artwork ${activeIndex + 1} of ${orderedArtworks.length}`}
          >
            ARTWORK {String(activeIndex + 1).padStart(3, "0")} /{" "}
            {String(orderedArtworks.length).padStart(3, "0")}
          </p>
          <h1 id="posterjo-title" className="posterjo-title">
            {current?.title || "Posterjo"}
          </h1>
          {current ? (
            <div className="posterjo-byline">
              <span>Joan Sterjo</span>
              <span>
                {current.width} × {current.height} px
              </span>
            </div>
          ) : null}
          {current?.description ? (
            <p className="posterjo-description">{current.description}</p>
          ) : null}
          <div className="posterjo-meta">
            <span>
              {current ? (
                <a
                  href={current.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`View ${current.title} on Dribbble (opens in a new tab)`}
                >
                  Dribbble source ↗
                </a>
              ) : (
                "Local archive"
              )}
            </span>
            <span>NEXT ARTWORK / {formatCountdown(remaining)}</span>
          </div>
        </figcaption>
      </figure>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Now showing {current?.title || "no available Posterjo artwork"}
      </span>
      <span id="posterjo-navigation-help" className="sr-only">
        Click or tap the left half for the previous artwork and the right half
        for the next artwork. You can also use the left and right arrow keys.
      </span>
    </section>
  );
}
