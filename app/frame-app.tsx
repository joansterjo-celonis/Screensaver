"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { publicAssetUrl } from "./data/artworks";
import { GalleryMode } from "./modes/gallery";
import { PosterjoMode } from "./modes/posterjo";
import { FlipDotClock } from "./modes/flip-dot-clock";
import { createPageLoadSeed } from "./shuffle";

type ModeId = "clock" | "gallery" | "posterjo";
type ModeDefinition = {
  id: ModeId;
  number: string;
  name: string;
  description: string;
  component: ComponentType<{ paused?: boolean; shuffleSeed: string }>;
  poster: {
    metric: string;
    label: string;
    kicker: string;
    status: string;
    tags: readonly string[];
  };
};

type WakeLockHandle = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockHandle> };
};

const STORAGE_KEY = "always-on-frame.mode.v1";
const FULL_ARCHIVE_CACHE_MESSAGE = "CACHE_FULL_ARTWORK_ARCHIVE";
const POSTERJO_ARCHIVE_CACHE_MESSAGE = "CACHE_POSTERJO_ARCHIVE";

const MODES: ModeDefinition[] = [
  {
    id: "clock",
    number: "01",
    name: "Flip Dot Weather",
    description: "24-hour mechanical time, live conditions, and selectable cities.",
    component: FlipDotClock,
    poster: {
      metric: "24:00",
      label: "MECHANICAL TIME",
      kicker: "LIVE WEATHER / ANY CITY",
      status: "LOCAL DATA",
      tags: ["TACTILE", "24 HOUR", "LIVE"],
    },
  },
  {
    id: "gallery",
    number: "02",
    name: "Swikipedia",
    description: "2,048 verified public-domain works across six centuries.",
    component: GalleryMode,
    poster: {
      metric: "2,048",
      label: "PAINTINGS",
      kicker: "SIX CENTURIES / ONE SLOW GALLERY",
      status: "PUBLIC DOMAIN",
      tags: ["1400—2026", "5 MIN EACH", "VERIFIED"],
    },
  },
  {
    id: "posterjo",
    number: "03",
    name: "Posterjo",
    description: "269 original Joan Sterjo works from a local 4K archive.",
    component: PosterjoMode,
    poster: {
      metric: "269",
      label: "ARTWORKS",
      kicker: "JOAN STERJO / LOCAL 4K ARCHIVE",
      status: "ARTIST EDITION",
      tags: ["ORIGINALS", "FULL BLEED", "4K"],
    },
  },
];

class ModeBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    // Keep the passive display alive even if a mode fails unexpectedly.
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="mode-fallback" role="status">
          <span>FRAME RECOVERY</span>
          <strong>Display interrupted.</strong>
          <small>Open the index to restart a display mode.</small>
        </div>
      );
    }
    return this.props.children;
  }
}

function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockHandle | null>(null);
  const [state, setState] = useState<"idle" | "active" | "unsupported">("idle");

  const request = useCallback(async () => {
    const kioskNavigator = navigator as WakeLockNavigator;
    if (!kioskNavigator.wakeLock) {
      setState("unsupported");
      return;
    }
    if (lockRef.current && !lockRef.current.released) return;
    try {
      const lock = await kioskNavigator.wakeLock.request("screen");
      lockRef.current = lock;
      setState("active");
      lock.addEventListener("release", () => setState("idle"));
    } catch {
      setState("idle");
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const requestTimer = window.setTimeout(() => void request(), 0);
    const restore = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", restore);
    return () => {
      window.clearTimeout(requestTimer);
      document.removeEventListener("visibilitychange", restore);
    };
  }, [active, request]);

  useEffect(
    () => () => {
      if (lockRef.current && !lockRef.current.released) {
        void lockRef.current.release();
      }
    },
    [],
  );

  return { state, request };
}

function TypographyPreview({ mode }: { mode: ModeDefinition }) {
  return (
    <div className={`type-preview type-preview--${mode.id}`} aria-hidden="true">
      <header className="type-preview-header">
        <span>FIELD / {mode.number}</span>
        <em>{mode.poster.status}</em>
      </header>
      <div className="type-preview-main">
        <strong>{mode.poster.metric}</strong>
        <span>{mode.poster.label}</span>
        <p>{mode.poster.kicker}</p>
      </div>
      <div className="type-preview-tags">
        {mode.poster.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
    </div>
  );
}

function ModeIndex({
  activeMode,
  onSelect,
  onClose,
  onFullscreen,
}: {
  activeMode: ModeId | null;
  onSelect: (id: ModeId) => void;
  onClose: () => void;
  onFullscreen: () => void;
}) {
  return (
    <section className="mode-index" aria-label="Choose a display mode">
      <header className="index-header">
        <p>ALWAYS–ON / DIGITAL FRAME</p>
        <div className="index-status">
          <span className="index-status-dot" aria-hidden="true" />
          READY FOR DISPLAY
        </div>
      </header>

      <div className="index-title-block">
        <p>SELECT A FIELD</p>
        <h1>Frame<br />Index</h1>
        <span>BERLIN / {new Date().getFullYear()}</span>
      </div>

      <div className="mode-list">
        {MODES.map((mode) => {
          return (
            <button
              className={`mode-card ${activeMode === mode.id ? "is-current" : ""}`}
              data-mode={mode.id}
              data-testid={`mode-${mode.id}`}
              key={mode.id}
              type="button"
              autoFocus={activeMode ? activeMode === mode.id : mode.id === "clock"}
              onClick={() => onSelect(mode.id)}
            >
              <div className="mode-card-preview">
                <TypographyPreview mode={mode} />
              </div>
              <div className="mode-card-copy">
                <span className="mode-number">/{mode.number}</span>
                <div>
                  <strong>{mode.name}</strong>
                  <small>{mode.description}</small>
                </div>
                <span className="mode-arrow" aria-hidden="true">↗</span>
              </div>
            </button>
          );
        })}
      </div>

      <footer className="index-footer">
        <button type="button" onClick={onFullscreen}>ENTER FULLSCREEN</button>
        <span>1–3 SELECT / F FULLSCREEN / I INDEX</span>
        {activeMode && (
          <button type="button" onClick={onClose}>RETURN TO FRAME</button>
        )}
      </footer>
    </section>
  );
}

export default function FrameApp() {
  const [hydrated, setHydrated] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState("");
  const [activeMode, setActiveMode] = useState<ModeId | null>(null);
  const [indexOpen, setIndexOpen] = useState(true);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideTimer = useRef(0);
  const { state: wakeState, request: requestWakeLock } = useWakeLock(
    hydrated && Boolean(activeMode) && !indexOpen,
  );

  const currentMode = useMemo(
    () => MODES.find((mode) => mode.id === activeMode) ?? null,
    [activeMode],
  );
  const ActiveComponent = currentMode?.component;

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setShuffleSeed(createPageLoadSeed());
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY) as ModeId | "signal" | null;
        const migratedMode = stored === "signal" ? "clock" : stored;
        if (migratedMode && MODES.some((mode) => mode.id === migratedMode)) {
          setActiveMode(migratedMode);
          if (stored === "signal") window.localStorage.setItem(STORAGE_KEY, "clock");
          setIndexOpen(false);
        }
      } catch {
        // The selector remains available when local storage is blocked.
      }
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    if (
      (activeMode !== "gallery" && activeMode !== "posterjo") ||
      !("serviceWorker" in navigator) ||
      window.location.protocol !== "https:"
    ) {
      return;
    }

    let disposed = false;
    const requestActiveArchiveWarm = () => {
      void navigator.serviceWorker.ready
        .then((registration) => {
          if (disposed) return;
          if (activeMode === "gallery") {
            registration.active?.postMessage({ type: FULL_ARCHIVE_CACHE_MESSAGE });
          } else {
            registration.active?.postMessage({ type: POSTERJO_ARCHIVE_CACHE_MESSAGE });
          }
        })
        .catch(() => undefined);
    };
    const handleControllerChange = () => requestActiveArchiveWarm();

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    requestActiveArchiveWarm();

    return () => {
      disposed = true;
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
    };
  }, [activeMode]);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      window.location.protocol !== "https:"
    ) {
      return;
    }

    if (typeof navigator.storage?.persist === "function") {
      void navigator.storage.persist().catch(() => undefined);
    }
    void navigator.serviceWorker
      .register(publicAssetUrl("sw.js"), { scope: import.meta.env.BASE_URL })
      .catch(() => undefined);
  }, []);

  const revealControls = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setControlsVisible(true);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 3200);
  }, []);

  useEffect(() => {
    if (!activeMode || indexOpen) return;
    const revealTimer = window.setTimeout(revealControls, 0);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(hideTimer.current);
    };
  }, [activeMode, indexOpen, revealControls]);

  const selectMode = useCallback(
    (id: ModeId) => {
      setActiveMode(id);
      setIndexOpen(false);
      try {
        window.localStorage.setItem(STORAGE_KEY, id);
      } catch {
        // Persistence is an enhancement; the display still works without it.
      }
      void requestWakeLock();
    },
    [requestWakeLock],
  );

  const enterFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const key = event.key.toLocaleLowerCase();
      if (event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='dialog']",
        )
      ) {
        return;
      }
      if (key === "1") selectMode("clock");
      if (key === "2") selectMode("gallery");
      if (key === "3") selectMode("posterjo");
      if (key === "i" || key === "escape") setIndexOpen((open) => !open);
      if (key === "f") enterFullscreen();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enterFullscreen, selectMode]);

  if (!hydrated || !shuffleSeed) {
    return (
      <main className="frame-root frame-boot" aria-label="Starting digital frame">
        <span>FRAME / INITIALIZING</span>
      </main>
    );
  }

  return (
    <main
      className="frame-root"
      onPointerMove={revealControls}
      onPointerDown={() => {
        revealControls();
        void requestWakeLock();
      }}
    >
      <div className="portrait-frame">
        {ActiveComponent ? (
          <div className="mode-stage" inert={indexOpen} aria-hidden={indexOpen}>
            <ModeBoundary key={activeMode}>
              <ActiveComponent paused={indexOpen} shuffleSeed={shuffleSeed} />
            </ModeBoundary>
          </div>
        ) : (
          <div className="empty-frame" aria-hidden="true" />
        )}

        {activeMode && !indexOpen && (
          <div className={`frame-controls ${controlsVisible ? "is-visible" : ""}`}>
            <button type="button" onClick={() => setIndexOpen(true)}>
              INDEX / {currentMode?.number}
            </button>
            <span className={`wake-state wake-${wakeState}`}>
              {wakeState === "active" ? "DISPLAY AWAKE" : "PASSIVE DISPLAY"}
            </span>
          </div>
        )}

        {indexOpen && (
          <ModeIndex
            activeMode={activeMode}
            onSelect={selectMode}
            onClose={() => activeMode && setIndexOpen(false)}
            onFullscreen={enterFullscreen}
          />
        )}
      </div>
    </main>
  );
}
