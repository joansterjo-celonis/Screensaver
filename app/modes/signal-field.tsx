"use client";

import { useEffect, useRef } from "react";
import {
  SIGNAL_SCENE_COUNT,
  renderSignalLibraryFrame,
} from "./signal-library";

const MOTION_FRAME_GAP = 66;
const REDUCED_MOTION_FRAME_GAP = 1_000;
const REDUCED_MOTION_SCENE_DURATION = 30_000;
const MAX_CANVAS_PIXELS = 2_200_000;

export function SignalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    let frame = 0;
    let lastDraw = Number.NEGATIVE_INFINITY;
    let width = 1;
    let height = 1;
    const startedAt = performance.now();
    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

    const draw = (now: number) => {
      const elapsed = Math.max(0, now - startedAt);
      const reducedMotion = motionPreference.matches;
      const renderTime = reducedMotion
        ? Math.floor(elapsed / REDUCED_MOTION_SCENE_DURATION) * REDUCED_MOTION_SCENE_DURATION
        : elapsed;
      renderSignalLibraryFrame(context, width, height, renderTime, {
        reducedMotion,
        sceneDurationMs: reducedMotion ? REDUCED_MOTION_SCENE_DURATION : undefined,
      });
    };

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, bounds.width);
      const nextHeight = Math.max(1, bounds.height);
      const pixelBudgetRatio = Math.sqrt(MAX_CANVAS_PIXELS / (nextWidth * nextHeight));
      const ratio = Math.max(
        0.25,
        Math.min(window.devicePixelRatio || 1, 2, pixelBudgetRatio),
      );
      const backingWidth = Math.max(1, Math.round(nextWidth * ratio));
      const backingHeight = Math.max(1, Math.round(nextHeight * ratio));
      const changed =
        Math.abs(nextWidth - width) > 0.5 ||
        Math.abs(nextHeight - height) > 0.5 ||
        canvas.width !== backingWidth ||
        canvas.height !== backingHeight;
      if (!changed) return;

      width = nextWidth;
      height = nextHeight;
      canvas.width = backingWidth;
      canvas.height = backingHeight;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.imageSmoothingEnabled = true;
      const now = performance.now();
      draw(now);
      lastDraw = now;
    };

    const loop = (now: number) => {
      const frameGap = motionPreference.matches
        ? REDUCED_MOTION_FRAME_GAP
        : MOTION_FRAME_GAP;
      if (!document.hidden && now - lastDraw >= frameGap) {
        draw(now);
        lastDraw = now;
      }
      frame = requestAnimationFrame(loop);
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
    document.addEventListener("visibilitychange", redraw);
    addMotionListener();
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
      document.removeEventListener("visibilitychange", redraw);
      removeMotionListener();
    };
  }, []);

  return (
    <section
      className="signal-mode"
      aria-label={`Signal Field generative animation with ${SIGNAL_SCENE_COUNT} scenes`}
    >
      <canvas ref={canvasRef} className="signal-canvas">
        A rotating library of {SIGNAL_SCENE_COUNT} generative typography and telemetry scenes.
      </canvas>
      <div className="signal-vignette" aria-hidden="true" />
    </section>
  );
}
