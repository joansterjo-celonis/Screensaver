"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { GeistMono } from "geist/font/mono";
import {
  GeistPixelCircle,
  GeistPixelGrid,
  GeistPixelLine,
  GeistPixelSquare,
  GeistPixelTriangle,
} from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import { resolveBackingStore } from "./signal-grid";
import {
  SIGNAL_SCENE_COUNT,
  SIGNAL_SCENE_DURATION_MS,
  configureSignalFontFamilies,
  getSignalFrameInfo,
  renderSignalLibraryFrame,
} from "./signal-library";

const MOTION_FRAME_GAP = 66;
const REDUCED_MOTION_FRAME_GAP = 1_000;
const REDUCED_MOTION_SCENE_DURATION = 30_000;
const MAX_CANVAS_PIXELS = 2_200_000;

const SIGNAL_FONT_CLASSES = [
  GeistSans.variable,
  GeistMono.variable,
  GeistPixelSquare.variable,
  GeistPixelGrid.variable,
  GeistPixelCircle.variable,
  GeistPixelTriangle.variable,
  GeistPixelLine.variable,
].join(" ");

const SIGNAL_FONT_MAP = {
  display: '"Oxanium Variable", "Arial Narrow", sans-serif',
  interface: '"Rajdhani", "Arial Narrow", sans-serif',
  sans: GeistSans.style.fontFamily,
  mono: `"IBM Plex Mono", ${GeistMono.style.fontFamily}`,
  "pixel-square": GeistPixelSquare.style.fontFamily,
  "pixel-grid": GeistPixelGrid.style.fontFamily,
  "pixel-circle": GeistPixelCircle.style.fontFamily,
  "pixel-triangle": GeistPixelTriangle.style.fontFamily,
  "pixel-line": GeistPixelLine.style.fontFamily,
} as const;

type SignalSceneView = {
  code: string;
  deckPosition: number;
  id: string;
  label: string;
  sceneIndex: number;
};

function currentPlayhead(
  accumulated: number,
  runningSince: number | null,
  now: number,
) {
  return Math.max(
    0,
    accumulated + (runningSince === null ? 0 : Math.max(0, now - runningSince)),
  );
}

function resolveRenderTime(
  elapsed: number,
  duration: number,
  reducedMotion: boolean,
) {
  return reducedMotion
    ? Math.floor(elapsed / duration) * duration
    : elapsed;
}

function resolveSceneView(
  renderTime: number,
  duration: number,
  reducedMotion: boolean,
  shuffleSeed: string,
): SignalSceneView {
  const info = getSignalFrameInfo(renderTime, {
    reducedMotion,
    sceneDurationMs: duration,
    shuffleSeed,
  });
  const logicalIndex = Math.floor(Math.max(0, renderTime) / duration);
  return {
    code: info.scene.code,
    deckPosition: (logicalIndex % SIGNAL_SCENE_COUNT) + 1,
    id: info.scene.id,
    label: info.scene.label,
    sceneIndex: info.sceneIndex,
  };
}

export function SignalField({
  paused = false,
  shuffleSeed,
}: {
  paused?: boolean;
  shuffleSeed: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const accumulatedPlayheadRef = useRef(0);
  const runningSinceRef = useRef<number | null>(null);
  const sceneDurationRef = useRef(SIGNAL_SCENE_DURATION_MS);
  const reducedMotionRef = useRef(false);
  const redrawRef = useRef<() => void>(() => undefined);
  const switchTimeoutRef = useRef<number | null>(null);
  const signalShuffleSeed = `${shuffleSeed}:signal-field`;
  const [sceneView, setSceneView] = useState<SignalSceneView>(() =>
    resolveSceneView(
      0,
      SIGNAL_SCENE_DURATION_MS,
      false,
      signalShuffleSeed,
    ),
  );
  const sceneViewRef = useRef(sceneView);
  const [switchState, setSwitchState] = useState({
    active: false,
    revision: 0,
  });

  const publishSceneView = useCallback((nextView: SignalSceneView) => {
    const currentView = sceneViewRef.current;
    if (
      currentView.sceneIndex === nextView.sceneIndex &&
      currentView.deckPosition === nextView.deckPosition
    ) {
      return;
    }
    sceneViewRef.current = nextView;
    setSceneView(nextView);
  }, []);

  const triggerSwitchEffect = useCallback(() => {
    if (switchTimeoutRef.current !== null) {
      window.clearTimeout(switchTimeoutRef.current);
    }
    setSwitchState((state) => ({
      active: true,
      revision: state.revision + 1,
    }));
    switchTimeoutRef.current = window.setTimeout(() => {
      switchTimeoutRef.current = null;
      setSwitchState((state) => ({ ...state, active: false }));
    }, 480);
  }, []);

  const navigateManually = useCallback((direction: -1 | 1) => {
    const now = performance.now();
    const elapsed = currentPlayhead(
      accumulatedPlayheadRef.current,
      runningSinceRef.current,
      now,
    );
    const duration = sceneDurationRef.current;
    const currentLogicalIndex = Math.floor(elapsed / duration);
    const targetLogicalIndex = currentLogicalIndex === 0 && direction < 0
      ? SIGNAL_SCENE_COUNT - 1
      : currentLogicalIndex + direction;
    const nextElapsed = Math.max(0, targetLogicalIndex * duration);

    accumulatedPlayheadRef.current = nextElapsed;
    if (runningSinceRef.current !== null) runningSinceRef.current = now;

    const reducedMotion = reducedMotionRef.current;
    const renderTime = resolveRenderTime(nextElapsed, duration, reducedMotion);
    publishSceneView(
      resolveSceneView(
        renderTime,
        duration,
        reducedMotion,
        signalShuffleSeed,
      ),
    );
    triggerSwitchEffect();
    redrawRef.current();
  }, [publishSceneView, signalShuffleSeed, triggerSwitchEffect]);

  useEffect(() => () => {
    if (switchTimeoutRef.current !== null) {
      window.clearTimeout(switchTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        paused ||
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']",
        )
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
    if (paused) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;
    configureSignalFontFamilies(SIGNAL_FONT_MAP);

    let frame = 0;
    let disposed = false;
    let lastDraw = Number.NEGATIVE_INFINITY;
    let width = 1;
    let height = 1;
    runningSinceRef.current = performance.now();
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    const draw = (now: number) => {
      const elapsed = currentPlayhead(
        accumulatedPlayheadRef.current,
        runningSinceRef.current,
        now,
      );
      const reducedMotion = motionPreference.matches;
      const sceneDuration = reducedMotion
        ? REDUCED_MOTION_SCENE_DURATION
        : SIGNAL_SCENE_DURATION_MS;
      const renderTime = resolveRenderTime(elapsed, sceneDuration, reducedMotion);
      sceneDurationRef.current = sceneDuration;
      reducedMotionRef.current = reducedMotion;
      const info = renderSignalLibraryFrame(context, width, height, renderTime, {
        reducedMotion,
        sceneDurationMs: sceneDuration,
        shuffleSeed: signalShuffleSeed,
      });
      const logicalIndex = Math.floor(renderTime / sceneDuration);
      publishSceneView({
        code: info.scene.code,
        deckPosition: (logicalIndex % SIGNAL_SCENE_COUNT) + 1,
        id: info.scene.id,
        label: info.scene.label,
        sceneIndex: info.sceneIndex,
      });
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width);
      const nextHeight = Math.max(1, bounds.height);
      const backingStore = resolveBackingStore(
        nextWidth,
        nextHeight,
        window.devicePixelRatio || 1,
        MAX_CANVAS_PIXELS,
      );
      const changed =
        Math.abs(nextWidth - width) > 0.5 ||
        Math.abs(nextHeight - height) > 0.5 ||
        canvas.width !== backingStore.width ||
        canvas.height !== backingStore.height;
      if (!changed) return;

      width = nextWidth;
      height = nextHeight;
      canvas.width = backingStore.width;
      canvas.height = backingStore.height;
      context.setTransform(backingStore.ratio, 0, 0, backingStore.ratio, 0, 0);
      context.imageSmoothingEnabled = true;
      if (document.hidden) {
        lastDraw = Number.NEGATIVE_INFINITY;
        return;
      }
      const now = performance.now();
      draw(now);
      lastDraw = now;
    };

    const scheduleFrame = () => {
      if (disposed || document.hidden || frame !== 0) return;
      frame = requestAnimationFrame(loop);
    };

    const loop = (now: number) => {
      frame = 0;
      if (disposed || document.hidden) return;
      const frameGap = motionPreference.matches
        ? REDUCED_MOTION_FRAME_GAP
        : MOTION_FRAME_GAP;
      if (now - lastDraw >= frameGap) {
        draw(now);
        lastDraw = now;
      }
      scheduleFrame();
    };

    const redraw = () => {
      if (document.hidden) {
        lastDraw = Number.NEGATIVE_INFINITY;
        return;
      }
      const now = performance.now();
      draw(now);
      lastDraw = now;
    };
    redrawRef.current = redraw;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (frame !== 0) cancelAnimationFrame(frame);
        frame = 0;
        lastDraw = Number.NEGATIVE_INFINITY;
        return;
      }
      redraw();
      scheduleFrame();
    };

    const loadSignalFont = async () => {
      try {
        await Promise.all([
          document.fonts.load('400 12px "Geist Signal"'),
          ...Object.values(SIGNAL_FONT_MAP).map((family) =>
            document.fonts.load(`500 12px ${family}`),
          ),
        ]);
        await document.fonts.ready;
      } catch {
        // The system mono fallback keeps Signal Field usable if font loading is blocked.
      }
      if (!disposed) redraw();
    };

    const addMotionListener = () => {
      if (typeof motionPreference.addEventListener === "function") {
        motionPreference.addEventListener("change", redraw);
      } else {
        motionPreference.addListener(redraw);
      }
    };

    const removeMotionListener = () => {
      if (typeof motionPreference.removeEventListener === "function") {
        motionPreference.removeEventListener("change", redraw);
      } else {
        motionPreference.removeListener(redraw);
      }
    };

    resize();
    const observer = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    addMotionListener();
    void loadSignalFont();
    scheduleFrame();

    return () => {
      const now = performance.now();
      accumulatedPlayheadRef.current = currentPlayhead(
        accumulatedPlayheadRef.current,
        runningSinceRef.current,
        now,
      );
      runningSinceRef.current = null;
      if (redrawRef.current === redraw) {
        redrawRef.current = () => undefined;
      }
      disposed = true;
      if (frame !== 0) cancelAnimationFrame(frame);
      frame = 0;
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      removeMotionListener();
    };
  }, [paused, publishSceneView, signalShuffleSeed]);

  return (
    <section
      className={`signal-mode ${SIGNAL_FONT_CLASSES}${switchState.active ? " is-switching" : ""}`}
      aria-label={`Signal Field generative animation with ${SIGNAL_SCENE_COUNT} scenes`}
      aria-describedby="signal-field-navigation-help"
      aria-keyshortcuts="ArrowLeft ArrowRight"
      data-signal-scene={sceneView.id}
      data-signal-switch-revision={switchState.revision}
      tabIndex={0}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("a, button, input, textarea, select")
        ) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        navigateManually(
          event.clientX < bounds.left + bounds.width / 2 ? -1 : 1,
        );
      }}
    >
      <canvas ref={canvasRef} className="signal-canvas">
        A rotating library of {SIGNAL_SCENE_COUNT} generative typography and telemetry scenes.
      </canvas>
      <div className="signal-vignette" aria-hidden="true" />
      {switchState.active ? (
        <div
          key={switchState.revision}
          className="signal-switch-flash"
          aria-hidden="true"
        />
      ) : null}

      <div className="signal-scene-hud">
        <div className="signal-scene-readout">
          <span className="signal-scene-index">
            FRAME {String(sceneView.deckPosition).padStart(2, "0")} / {String(SIGNAL_SCENE_COUNT).padStart(2, "0")}
          </span>
          <strong className="signal-scene-label">{sceneView.label}</strong>
          <span className="signal-scene-code">{sceneView.code}</span>
        </div>
        <div className="signal-scene-nav" role="group" aria-label="Signal scene navigation">
          <button
            type="button"
            className="signal-scene-button signal-scene-button--previous"
            aria-label="Show previous Signal Field scene"
            onClick={() => navigateManually(-1)}
          >
            <span aria-hidden="true">←</span>
            <span>PREV</span>
          </button>
          <button
            type="button"
            className="signal-scene-button signal-scene-button--next"
            aria-label="Show next Signal Field scene"
            onClick={() => navigateManually(1)}
          >
            <span>NEXT</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Now showing Signal Field scene {sceneView.deckPosition} of {SIGNAL_SCENE_COUNT}: {sceneView.label}
      </span>
      <span id="signal-field-navigation-help" className="sr-only">
        Click or tap the left half for the previous scene and the right half for
        the next scene. You can also use the left and right arrow keys.
      </span>
    </section>
  );
}
