"use client";

import {
  Component,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { commonsRedirect } from "./data/artworks";
import { GalleryMode } from "./modes/gallery";
import { SignalField } from "./modes/signal-field";

type ModeId = "signal" | "gallery";
type ModeDefinition = {
  id: ModeId;
  number: string;
  name: string;
  description: string;
  component: ComponentType;
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

const MODES: ModeDefinition[] = [
  {
    id: "signal",
    number: "01",
    name: "Signal Field",
    description: "Generative glyphs, telemetry and typographic systems.",
    component: SignalField,
  },
  {
    id: "gallery",
    number: "02",
    name: "Swikipedia",
    description: "A slow public-domain gallery of Renaissance painting.",
    component: GalleryMode,
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

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Keep the passive display alive even if a mode fails unexpectedly.
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="mode-fallback" role="status">
          <span>FRAME RECOVERY</span>
          <strong>Signal interrupted.</strong>
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
    void request();
    const restore = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", restore);
    return () => document.removeEventListener("visibilitychange", restore);
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

function SignalPreview() {
  return (
    <div className="signal-preview" aria-hidden="true">
      <div className="signal-preview-heading">
        <span>BMS / FRAME</span>
        <span>ORBITAL–07</span>
      </div>
      <div className="signal-preview-star">✣</div>
      <div className="signal-preview-cells">
        {Array.from({ length: 80 }, (_, index) => (
          <i key={index} className={(index * 7 + 3) % 11 < 5 ? "is-on" : ""} />
        ))}
      </div>
      <div className="signal-preview-type">A7 / FIELD</div>
    </div>
  );
}

function GalleryPreview() {
  return (
    <div className="gallery-preview" aria-hidden="true">
      <img
        src={commonsRedirect(
          "Leonardo da Vinci - Lady with an Ermine.jpg",
        )}
        alt=""
      />
      <div className="gallery-preview-wash" />
      <div className="gallery-preview-label">
        <span>PLATE 03 / 10</span>
        <strong>Lady with an Ermine</strong>
        <small>Leonardo da Vinci · c. 1489–1491</small>
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
        {MODES.map((mode) => (
          <button
            className={`mode-card ${activeMode === mode.id ? "is-current" : ""}`}
            data-testid={`mode-${mode.id}`}
            key={mode.id}
            type="button"
            onClick={() => onSelect(mode.id)}
          >
            <div className="mode-card-preview">
              {mode.id === "signal" ? <SignalPreview /> : <GalleryPreview />}
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
        ))}
      </div>

      <footer className="index-footer">
        <button type="button" onClick={onFullscreen}>ENTER FULLSCREEN</button>
        <span>1–2 SELECT / F FULLSCREEN / I INDEX</span>
        {activeMode && (
          <button type="button" onClick={onClose}>RETURN TO FRAME</button>
        )}
      </footer>
    </section>
  );
}

export default function FrameApp() {
  const [hydrated, setHydrated] = useState(false);
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
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as ModeId | null;
      if (stored && MODES.some((mode) => mode.id === stored)) {
        setActiveMode(stored);
        setIndexOpen(false);
      }
    } catch {
      // The selector remains available when local storage is blocked.
    }
    setHydrated(true);
  }, []);

  const revealControls = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    setControlsVisible(true);
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 3200);
  }, []);

  useEffect(() => {
    if (!activeMode || indexOpen) return;
    revealControls();
    return () => window.clearTimeout(hideTimer.current);
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
      if (key === "1") selectMode("signal");
      if (key === "2") selectMode("gallery");
      if (key === "i" || key === "escape") setIndexOpen((open) => !open);
      if (key === "f") enterFullscreen();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [enterFullscreen, selectMode]);

  if (!hydrated) {
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
      onPointerDown={revealControls}
    >
      <div className="portrait-frame">
        {ActiveComponent ? (
          <ModeBoundary key={activeMode}>
            <ActiveComponent />
          </ModeBoundary>
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
