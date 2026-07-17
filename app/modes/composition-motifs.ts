import type { CompositionMotif } from "./composition-library";

export type MotifPrimitiveKind =
  | "line"
  | "arc"
  | "ring"
  | "dot"
  | "disc"
  | "block"
  | "petal"
  | "triangle"
  | "cross";

export type MotifPrimitiveTone = "spot" | "accent" | "ink" | "dim" | "shadow";
export type MotifPrimitiveVariant =
  | "solid"
  | "outline"
  | "dashed"
  | "rough"
  | "ghost"
  | "heavy"
  | "open"
  | "soft";

export type MotifPrimitive = Readonly<{
  id: string;
  kind: MotifPrimitiveKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  tone: MotifPrimitiveTone;
  variant: MotifPrimitiveVariant;
}>;

export type MotifBlueprint = Readonly<{
  aspect: number;
  align: "start" | "center" | "end";
  labelEdge: "nw" | "ne" | "sw" | "se";
  parts: readonly MotifPrimitive[];
}>;

export type MotifFrame = Readonly<{ width: number; height: number }>;

export function fitMotifFrame(
  slotWidth: number,
  slotHeight: number,
  aspect: number,
): MotifFrame {
  if (
    !Number.isFinite(slotWidth) ||
    !Number.isFinite(slotHeight) ||
    !Number.isFinite(aspect) ||
    slotWidth <= 0 ||
    slotHeight <= 0 ||
    aspect <= 0
  ) {
    return Object.freeze({ width: 0, height: 0 });
  }
  const width = Math.min(slotWidth, slotHeight * aspect);
  return Object.freeze({ width, height: width / aspect });
}

function part(
  id: string,
  kind: MotifPrimitiveKind,
  x: number,
  y: number,
  width: number,
  height: number,
  rotation = 0,
  tone: MotifPrimitiveTone = "spot",
  variant: MotifPrimitiveVariant = "solid",
): MotifPrimitive {
  return Object.freeze({ id, kind, x, y, width, height, rotation, tone, variant });
}

function blueprint(
  aspect: number,
  align: MotifBlueprint["align"],
  labelEdge: MotifBlueprint["labelEdge"],
  parts: readonly MotifPrimitive[],
): MotifBlueprint {
  return Object.freeze({ aspect, align, labelEdge, parts: Object.freeze(parts) });
}

/**
 * A fixed-ratio, painting-specific drawing for every poster. Coordinates are
 * authored in each drawing's own canvas rather than inherited from a shared
 * radar/bullseye skeleton.
 */
export const MOTIF_BLUEPRINTS: Readonly<Record<CompositionMotif, MotifBlueprint>> = Object.freeze({
  "ermine-arc": blueprint(1.26, "start", "sw", [
    part("head-turn", "arc", 57, 34, 46, 42, -18, "ink", "open"),
    part("ermine-spine", "arc", 47, 62, 62, 28, 19, "spot", "open"),
    part("wrist", "line", 38, 58, 34, 2, 18, "accent", "rough"),
    part("gaze-a", "line", 60, 29, 36, 1, -9, "dim", "dashed"),
    part("gaze-b", "line", 63, 31, 29, 1, 7, "dim", "dashed"),
    part("hand", "cross", 28, 59, 8, 8, 17, "accent", "outline"),
    part("paw", "dot", 72, 69, 5, 5, 0, "ink", "solid"),
  ]),
  "sea-born": blueprint(1.48, "end", "ne", [
    part("shell-lip", "arc", 51, 71, 82, 50, 0, "spot", "open"),
    part("shell-rib-a", "line", 25, 58, 46, 1, 55, "dim", "rough"),
    part("shell-rib-b", "line", 38, 49, 54, 1, 68, "dim", "rough"),
    part("shell-rib-c", "line", 54, 47, 56, 1, 82, "accent", "rough"),
    part("shell-rib-d", "line", 70, 51, 50, 1, 101, "dim", "rough"),
    part("wind-curl", "arc", 18, 25, 31, 29, -22, "ink", "open"),
    part("foam-a", "dot", 77, 78, 4, 4, 0, "accent", "outline"),
    part("foam-b", "dot", 86, 72, 2.5, 2.5, 0, "ink", "solid"),
    part("shore", "line", 52, 86, 91, 2, -2, "shadow", "dashed"),
  ]),
  "triptych-spill": blueprint(1.08, "end", "se", [
    part("eden-seam", "line", 32, 50, 86, 1, 90, "dim", "rough"),
    part("inferno-seam", "line", 68, 50, 86, 1, 90, "accent", "rough"),
    part("fruit", "disc", 15, 21, 11, 11, 0, "spot", "soft"),
    part("leaf", "petal", 24, 37, 13, 7, -33, "ink", "outline"),
    part("body-a", "ring", 44, 30, 10, 14, 0, "ink", "outline"),
    part("body-b", "ring", 55, 47, 7, 11, 14, "spot", "outline"),
    part("body-c", "ring", 47, 66, 13, 9, -17, "dim", "outline"),
    part("music-blade", "triangle", 79, 31, 15, 19, 18, "shadow", "solid"),
    part("crack-a", "line", 81, 58, 28, 2, -52, "accent", "heavy"),
    part("crack-b", "line", 84, 70, 22, 1, 31, "ink", "dashed"),
  ]),
  "convex-witness": blueprint(1, "end", "sw", [
    part("mirror", "ring", 50, 45, 57, 57, 0, "ink", "heavy"),
    part("reflection-a", "block", 43, 47, 7, 19, -8, "spot", "outline"),
    part("reflection-b", "block", 56, 47, 7, 19, 8, "accent", "outline"),
    part("passion-1", "dot", 50, 14, 4, 4, 0, "dim", "outline"),
    part("passion-2", "dot", 68, 21, 4, 4, 0, "dim", "outline"),
    part("passion-3", "dot", 79, 38, 4, 4, 0, "dim", "outline"),
    part("passion-4", "dot", 75, 59, 4, 4, 0, "dim", "outline"),
    part("passion-5", "dot", 61, 73, 4, 4, 0, "dim", "outline"),
    part("passion-6", "dot", 39, 73, 4, 4, 0, "dim", "outline"),
    part("passion-7", "dot", 25, 59, 4, 4, 0, "dim", "outline"),
    part("passion-8", "dot", 21, 38, 4, 4, 0, "dim", "outline"),
    part("passion-9", "dot", 32, 21, 4, 4, 0, "dim", "outline"),
    part("rosary", "arc", 73, 71, 25, 31, 26, "accent", "dashed"),
  ]),
  "pearl-orbit": blueprint(1.16, "start", "se", [
    part("head-turn", "arc", 46, 42, 72, 70, -19, "dim", "open"),
    part("jaw-light", "arc", 51, 53, 53, 42, 8, "spot", "open"),
    part("ear-line", "line", 73, 45, 18, 1, 76, "accent", "rough"),
    part("pearl", "disc", 76, 68, 17, 17, 0, "ink", "soft"),
    part("pearl-glint", "dot", 73, 64, 4, 4, 0, "accent", "solid"),
    part("light-swatch-a", "block", 17, 21, 21, 6, 0, "ink", "soft"),
    part("light-swatch-b", "block", 21, 30, 29, 4, 0, "dim", "soft"),
  ]),
  "anatomical-index": blueprint(0.92, "end", "ne", [
    part("tendon-a", "arc", 35, 46, 22, 70, -8, "accent", "open"),
    part("tendon-b", "arc", 47, 46, 20, 73, 2, "spot", "open"),
    part("tendon-c", "arc", 58, 47, 18, 68, 11, "ink", "open"),
    part("tendon-d", "arc", 67, 49, 15, 59, 20, "dim", "open"),
    part("wrist-fold", "line", 50, 77, 62, 2, -4, "shadow", "rough"),
    part("folio-a", "line", 28, 17, 31, 1, 0, "dim", "dashed"),
    part("folio-b", "line", 73, 29, 25, 1, 0, "accent", "dashed"),
    part("index", "cross", 74, 53, 7, 7, 0, "ink", "outline"),
  ]),
  "vanishing-court": blueprint(1.24, "start", "nw", [
    part("doorway", "block", 52, 27, 18, 34, 0, "ink", "outline"),
    part("mirror", "block", 76, 24, 14, 11, 0, "accent", "outline"),
    part("gaze-queen", "line", 17, 70, 73, 1, -34, "spot", "dashed"),
    part("gaze-painter", "line", 27, 48, 55, 1, -18, "dim", "rough"),
    part("gaze-infant", "line", 50, 60, 37, 1, -52, "accent", "rough"),
    part("gaze-viewer", "line", 81, 68, 50, 1, 43, "ink", "dashed"),
    part("figure-a", "dot", 18, 72, 7, 7, 0, "ink", "solid"),
    part("figure-b", "dot", 42, 73, 5, 5, 0, "dim", "solid"),
    part("figure-c", "dot", 66, 66, 4, 4, 0, "spot", "solid"),
  ]),
  "rising-diagonal": blueprint(1.36, "end", "sw", [
    part("flag-blue", "line", 44, 34, 86, 6, -24, "shadow", "rough"),
    part("flag-white", "line", 49, 43, 87, 5, -24, "ink", "rough"),
    part("flag-red", "line", 54, 52, 88, 7, -24, "accent", "rough"),
    part("barricade-a", "block", 21, 76, 24, 10, -10, "dim", "solid"),
    part("barricade-b", "block", 44, 69, 22, 9, -18, "shadow", "solid"),
    part("barricade-c", "block", 67, 61, 21, 8, -25, "spot", "solid"),
    part("ascent", "triangle", 82, 42, 11, 18, -18, "ink", "outline"),
  ]),
  "signal-mast": blueprint(1.04, "end", "ne", [
    part("raft-base", "line", 49, 78, 83, 5, -3, "shadow", "rough"),
    part("human-pyramid-left", "line", 48, 52, 61, 2, 55, "spot", "rough"),
    part("human-pyramid-right", "line", 52, 52, 59, 2, -55, "dim", "rough"),
    part("mast", "line", 53, 43, 68, 2, 90, "ink", "heavy"),
    part("signal-cloth", "triangle", 64, 20, 18, 16, -4, "accent", "solid"),
    part("survivor-1", "line", 22, 73, 10, 1, 82, "spot", "rough"),
    part("survivor-2", "line", 31, 70, 12, 1, 77, "spot", "rough"),
    part("survivor-3", "line", 41, 68, 13, 1, 88, "spot", "rough"),
    part("survivor-4", "line", 59, 67, 12, 1, 94, "spot", "rough"),
    part("survivor-5", "line", 70, 70, 10, 1, 101, "spot", "rough"),
  ]),
  "final-tow": blueprint(1.57, "end", "sw", [
    part("sea-line", "line", 51, 77, 94, 1, -3, "dim", "rough"),
    part("temeraire-mast", "line", 69, 45, 56, 1, 88, "ink", "rough"),
    part("tug-stack", "block", 29, 62, 8, 25, -4, "shadow", "solid"),
    part("smoke-a", "arc", 40, 37, 35, 24, -18, "shadow", "open"),
    part("smoke-b", "arc", 54, 27, 47, 29, -8, "dim", "open"),
    part("wake-a", "line", 30, 79, 31, 1, -7, "spot", "dashed"),
    part("wake-b", "line", 58, 84, 42, 1, 5, "accent", "dashed"),
    part("edge-glow", "disc", 96, 54, 19, 19, 0, "accent", "soft"),
  ]),
  "fog-register": blueprint(1.12, "start", "se", [
    part("contour-a", "arc", 55, 22, 86, 24, 2, "dim", "open"),
    part("contour-b", "arc", 46, 38, 71, 27, -7, "spot", "open"),
    part("contour-c", "arc", 58, 53, 83, 25, 5, "ink", "open"),
    part("contour-d", "arc", 42, 69, 65, 24, -9, "dim", "open"),
    part("ridge", "line", 52, 74, 91, 2, -8, "shadow", "rough"),
    part("wanderer-void", "block", 52, 58, 8, 31, 0, "shadow", "solid"),
    part("shoulder", "triangle", 52, 61, 24, 13, 0, "shadow", "solid"),
  ]),
  "orange-signal": blueprint(0.86, "end", "nw", [
    part("sun", "disc", 48, 20, 16, 16, 0, "accent", "soft"),
    part("reflection-1", "line", 49, 38, 14, 2, 1, "accent", "rough"),
    part("reflection-2", "line", 47, 48, 24, 2, -2, "spot", "rough"),
    part("reflection-3", "line", 51, 59, 34, 3, 2, "accent", "rough"),
    part("reflection-4", "line", 48, 71, 47, 2, -1, "spot", "rough"),
    part("reflection-5", "line", 52, 83, 57, 2, 1, "dim", "rough"),
    part("crane-a", "line", 17, 53, 45, 1, 90, "shadow", "ghost"),
    part("crane-b", "line", 80, 48, 39, 1, 90, "shadow", "ghost"),
  ]),
  "celestial-current": blueprint(1.32, "end", "sw", [
    part("vortex-outer", "arc", 56, 44, 73, 62, -17, "spot", "open"),
    part("vortex-inner", "arc", 61, 43, 42, 34, 21, "accent", "open"),
    part("star-1", "disc", 19, 19, 7, 7, 0, "ink", "soft"),
    part("star-2", "dot", 43, 15, 3, 3, 0, "spot", "solid"),
    part("star-3", "disc", 72, 21, 5, 5, 0, "ink", "soft"),
    part("star-4", "dot", 84, 47, 4, 4, 0, "accent", "solid"),
    part("star-5", "dot", 62, 67, 3, 3, 0, "ink", "solid"),
    part("star-6", "dot", 36, 58, 2.5, 2.5, 0, "dim", "solid"),
    part("cypress", "triangle", 12, 72, 18, 52, -4, "shadow", "solid"),
  ]),
  "solar-fold": blueprint(1.06, "start", "ne", [
    part("body-curl", "arc", 52, 50, 76, 69, 23, "spot", "open"),
    part("knee", "arc", 63, 58, 34, 31, -34, "accent", "open"),
    part("cloth-a", "line", 28, 34, 43, 1, 57, "ink", "rough"),
    part("cloth-b", "line", 41, 26, 37, 1, 22, "dim", "rough"),
    part("cloth-c", "line", 72, 39, 39, 1, -41, "spot", "rough"),
    part("cloth-d", "line", 68, 72, 45, 1, 26, "dim", "rough"),
    part("oleander", "petal", 20, 78, 15, 8, -29, "accent", "outline"),
    part("oleander-stem", "line", 28, 70, 23, 1, -48, "shadow", "rough"),
  ]),
  "winter-descent": blueprint(1.44, "end", "ne", [
    part("descent", "line", 49, 49, 95, 2, 22, "spot", "rough"),
    part("hunter-1", "line", 21, 28, 12, 2, 70, "shadow", "rough"),
    part("hunter-2", "line", 30, 34, 11, 2, 66, "shadow", "rough"),
    part("dog-1", "dot", 38, 46, 4, 3, 0, "ink", "solid"),
    part("dog-2", "dot", 47, 53, 3, 3, 0, "ink", "solid"),
    part("dog-3", "dot", 55, 58, 3, 3, 0, "dim", "solid"),
    part("pond-a", "arc", 76, 76, 28, 12, 0, "accent", "open"),
    part("pond-b", "arc", 86, 62, 19, 9, -11, "dim", "open"),
    part("bird", "triangle", 73, 21, 7, 5, 19, "shadow", "outline"),
  ]),
  "pressed-garden": blueprint(0.88, "end", "sw", [
    part("wall", "block", 50, 49, 78, 75, 0, "dim", "outline"),
    part("gate", "arc", 50, 73, 22, 31, 0, "accent", "open"),
    part("stem-a", "line", 25, 50, 43, 1, 86, "spot", "rough"),
    part("stem-b", "line", 70, 47, 52, 1, 94, "ink", "rough"),
    part("leaf-a", "petal", 20, 31, 12, 7, -23, "spot", "solid"),
    part("leaf-b", "petal", 31, 57, 10, 6, 31, "accent", "solid"),
    part("leaf-c", "petal", 67, 28, 11, 6, -48, "ink", "outline"),
    part("flower", "cross", 76, 61, 10, 10, 11, "accent", "outline"),
    part("bird", "triangle", 38, 24, 9, 7, -16, "shadow", "outline"),
  ]),
  "anamorphic-datum": blueprint(1.64, "start", "se", [
    part("upper-shelf", "line", 52, 24, 91, 2, 0, "ink", "rough"),
    part("lower-shelf", "line", 50, 58, 88, 2, 0, "dim", "rough"),
    part("skull", "ring", 57, 76, 68, 15, -9, "spot", "heavy"),
    part("orbit", "arc", 23, 40, 26, 29, 16, "accent", "open"),
    part("lute-string", "line", 67, 44, 34, 1, -31, "accent", "dashed"),
    part("globe", "ring", 83, 31, 15, 15, 0, "ink", "outline"),
    part("datum", "cross", 15, 58, 7, 7, 0, "shadow", "outline"),
  ]),
  "measured-motion": blueprint(1.25, "end", "ne", [
    part("vertebrae", "arc", 51, 41, 77, 31, -7, "spot", "open"),
    part("chest", "arc", 37, 55, 28, 39, 13, "dim", "open"),
    part("stride", "line", 50, 75, 91, 1, -3, "ink", "dashed"),
    part("hoof-1", "block", 16, 72, 11, 4, -8, "accent", "solid"),
    part("hoof-2", "block", 39, 80, 9, 4, 5, "spot", "solid"),
    part("hoof-3", "block", 66, 77, 10, 4, -4, "spot", "solid"),
    part("hoof-4", "block", 86, 68, 12, 4, 11, "accent", "solid"),
    part("measure-a", "line", 18, 21, 25, 1, 0, "dim", "dashed"),
    part("measure-b", "line", 80, 28, 27, 1, 0, "dim", "dashed"),
  ]),
  "river-span": blueprint(1.34, "start", "sw", [
    part("distant-ridge", "arc", 52, 21, 92, 24, 1, "dim", "open"),
    part("bridge-span", "arc", 63, 47, 55, 29, -4, "spot", "open"),
    part("bridge-deck", "line", 62, 39, 58, 3, -3, "ink", "rough"),
    part("pier-a", "block", 43, 55, 8, 29, -2, "shadow", "solid"),
    part("pier-b", "block", 78, 50, 8, 28, 2, "accent", "outline"),
    part("river-bank-left", "line", 29, 67, 59, 3, 36, "shadow", "rough"),
    part("river-bank-right", "line", 76, 68, 53, 3, -41, "spot", "rough"),
    part("water-course-a", "line", 52, 71, 48, 1, 86, "accent", "dashed"),
    part("water-course-b", "line", 53, 81, 65, 1, 88, "dim", "dashed"),
    part("passage", "cross", 64, 48, 7, 7, 0, "ink", "outline"),
  ]),
  "screen-current": blueprint(1.52, "end", "se", [
    part("fold-1", "line", 18, 50, 90, 1, 90, "dim", "rough"),
    part("fold-2", "line", 34, 50, 90, 1, 90, "dim", "rough"),
    part("fold-3", "line", 50, 50, 90, 1, 90, "accent", "rough"),
    part("fold-4", "line", 66, 50, 90, 1, 90, "dim", "rough"),
    part("fold-5", "line", 82, 50, 90, 1, 90, "dim", "rough"),
    part("plum-branch-a", "arc", 34, 57, 58, 52, -16, "shadow", "open"),
    part("plum-branch-b", "arc", 70, 42, 49, 43, 18, "spot", "open"),
    part("red-blossom", "disc", 65, 24, 6, 6, 0, "accent", "soft"),
    part("white-blossom", "dot", 78, 55, 5, 5, 0, "ink", "outline"),
    part("stream", "line", 50, 78, 86, 2, -4, "spot", "rough"),
  ]),
  "three-measures": blueprint(1.08, "end", "ne", [
    part("tulip-stem", "line", 20, 56, 56, 1, 87, "spot", "rough"),
    part("tulip-a", "petal", 16, 25, 14, 19, -23, "accent", "solid"),
    part("tulip-b", "petal", 24, 24, 14, 19, 23, "accent", "outline"),
    part("hourglass-top", "triangle", 50, 36, 24, 23, 180, "ink", "outline"),
    part("hourglass-bottom", "triangle", 50, 62, 24, 23, 0, "dim", "outline"),
    part("sand", "line", 50, 50, 24, 2, 90, "accent", "dashed"),
    part("skull", "ring", 79, 48, 24, 28, 0, "shadow", "heavy"),
    part("eye-a", "dot", 74, 46, 5, 5, 0, "ink", "solid"),
    part("eye-b", "dot", 83, 46, 5, 5, 0, "ink", "solid"),
    part("jaw", "line", 79, 61, 16, 1, 0, "accent", "dashed"),
  ]),
  "mechanical-sun": blueprint(1.31, "end", "sw", [
    part("lamp-cone", "triangle", 22, 54, 42, 69, -7, "accent", "ghost"),
    part("orbit-outer", "arc", 62, 48, 70, 55, -12, "spot", "open"),
    part("orbit-inner", "arc", 66, 47, 43, 33, 19, "dim", "open"),
    part("sun", "disc", 55, 48, 12, 12, 0, "accent", "soft"),
    part("planet-a", "disc", 82, 27, 7, 7, 0, "ink", "solid"),
    part("planet-b", "dot", 73, 68, 4, 4, 0, "spot", "solid"),
    part("planet-c", "ring", 42, 36, 8, 8, 0, "ink", "outline"),
    part("hand", "line", 35, 73, 28, 2, -33, "shadow", "rough"),
  ]),
  "sleep-pressure": blueprint(1.22, "start", "ne", [
    part("torso", "arc", 53, 62, 74, 34, 7, "ink", "open"),
    part("pressure-1", "line", 24, 44, 42, 3, 90, "dim", "heavy"),
    part("pressure-2", "line", 36, 42, 57, 3, 90, "spot", "heavy"),
    part("pressure-3", "line", 49, 39, 70, 4, 90, "accent", "heavy"),
    part("pressure-4", "line", 62, 43, 53, 3, 90, "spot", "heavy"),
    part("pressure-5", "line", 74, 47, 37, 3, 90, "dim", "heavy"),
    part("curtain", "line", 87, 51, 78, 2, 90, "shadow", "rough"),
    part("mare", "triangle", 80, 22, 15, 19, -22, "shadow", "solid"),
    part("incubus", "block", 52, 49, 16, 19, -3, "accent", "ghost"),
  ]),
  "perspective-proof": blueprint(1.19, "end", "se", [
    part("threshold", "line", 50, 72, 94, 2, 0, "accent", "heavy"),
    part("vanish-left", "line", 36, 50, 87, 1, 35, "dim", "rough"),
    part("vanish-right", "line", 64, 50, 87, 1, -35, "dim", "rough"),
    part("tile-1", "line", 50, 61, 89, 1, 0, "spot", "dashed"),
    part("tile-2", "line", 50, 48, 65, 1, 0, "spot", "dashed"),
    part("tile-3", "line", 50, 37, 43, 1, 0, "spot", "dashed"),
    part("column-a", "block", 21, 36, 10, 58, 0, "ink", "outline"),
    part("column-b", "block", 79, 36, 10, 58, 0, "shadow", "outline"),
    part("sacred-room", "block", 50, 24, 31, 19, 0, "accent", "ghost"),
  ]),
  "severed-baseline": blueprint(1.37, "end", "nw", [
    part("baseline", "line", 49, 64, 93, 2, 0, "ink", "rough"),
    part("blade", "line", 53, 49, 108, 5, -31, "accent", "heavy"),
    part("judith-grip", "arc", 30, 41, 25, 23, 18, "spot", "open"),
    part("abra-grip", "arc", 71, 64, 21, 18, -27, "dim", "open"),
    part("blood-1", "petal", 64, 45, 8, 4, -54, "accent", "solid"),
    part("blood-2", "petal", 72, 35, 6, 3, -39, "accent", "solid"),
    part("blood-3", "petal", 78, 26, 4, 2, -25, "accent", "solid"),
  ]),
  "two-armies": blueprint(1.46, "start", "se", [
    part("alexander-front", "triangle", 36, 58, 55, 49, 90, "spot", "outline"),
    part("darius-front", "triangle", 66, 46, 49, 45, -90, "accent", "outline"),
    part("collision", "cross", 51, 52, 10, 10, 11, "ink", "heavy"),
    part("cavalry-a", "dot", 19, 71, 5, 5, 0, "shadow", "solid"),
    part("cavalry-b", "dot", 29, 77, 4, 4, 0, "spot", "solid"),
    part("cavalry-c", "dot", 76, 30, 4, 4, 0, "accent", "solid"),
    part("cavalry-d", "dot", 85, 37, 5, 5, 0, "shadow", "solid"),
    part("sun", "disc", 16, 18, 10, 10, 0, "accent", "soft"),
    part("moon", "ring", 84, 18, 9, 9, 0, "ink", "outline"),
    part("inscription", "line", 51, 88, 88, 2, 0, "dim", "dashed"),
  ]),
  "petal-avalanche": blueprint(1.28, "end", "ne", [
    part("canopy", "line", 50, 18, 92, 2, -4, "shadow", "rough"),
    part("petal-1", "petal", 17, 25, 12, 6, 24, "accent", "solid"),
    part("petal-2", "petal", 43, 29, 9, 5, -46, "spot", "solid"),
    part("petal-3", "petal", 72, 24, 11, 5, 61, "accent", "outline"),
    part("petal-4", "petal", 84, 39, 13, 7, -22, "ink", "solid"),
    part("petal-5", "petal", 28, 46, 14, 7, 43, "spot", "solid"),
    part("petal-6", "petal", 57, 50, 10, 5, -71, "accent", "solid"),
    part("petal-7", "petal", 75, 59, 16, 8, 18, "spot", "solid"),
    part("petal-8", "petal", 17, 66, 13, 7, -37, "ink", "outline"),
    part("petal-9", "petal", 39, 72, 17, 9, 51, "accent", "solid"),
    part("petal-10", "petal", 62, 79, 20, 10, -24, "spot", "solid"),
    part("petal-11", "petal", 86, 82, 19, 10, 38, "shadow", "solid"),
    part("banquet", "line", 50, 88, 86, 4, 0, "shadow", "rough"),
  ]),
  "acid-cabaret": blueprint(1.15, "end", "sw", [
    part("mirror-plane", "block", 50, 51, 82, 59, -9, "accent", "ghost"),
    part("mirror-cut", "line", 50, 52, 88, 3, -9, "ink", "rough"),
    part("lamp-a", "disc", 23, 22, 13, 13, 0, "spot", "soft"),
    part("lamp-b", "disc", 74, 19, 10, 10, 0, "accent", "soft"),
    part("face-a", "ring", 34, 48, 17, 22, -12, "ink", "outline"),
    part("face-b", "ring", 68, 63, 13, 18, 17, "shadow", "outline"),
    part("sightline-a", "line", 23, 71, 59, 1, -27, "spot", "dashed"),
    part("sightline-b", "line", 77, 74, 47, 1, 31, "dim", "dashed"),
  ]),
  "unstable-table": blueprint(1.22, "start", "se", [
    part("table-plane-a", "line", 49, 64, 91, 3, -8, "shadow", "heavy"),
    part("table-plane-b", "line", 52, 45, 73, 2, 5, "dim", "rough"),
    part("cloth-edge", "line", 58, 75, 59, 2, 13, "spot", "dashed"),
    part("apple-1", "disc", 23, 41, 15, 15, 0, "accent", "rough"),
    part("apple-2", "disc", 39, 34, 13, 13, 0, "spot", "rough"),
    part("apple-3", "ring", 56, 39, 17, 17, 0, "ink", "heavy"),
    part("apple-4", "disc", 72, 48, 12, 12, 0, "accent", "soft"),
    part("apple-5", "ring", 83, 58, 14, 14, 0, "spot", "outline"),
    part("checker-a", "block", 24, 80, 10, 8, 0, "ink", "outline"),
    part("checker-b", "block", 36, 82, 10, 8, 0, "accent", "solid"),
  ]),
  "falling-sun": blueprint(1.12, "start", "ne", [
    part("wing", "arc", 49, 48, 76, 65, 19, "spot", "open"),
    part("body", "line", 48, 57, 46, 3, 38, "shadow", "heavy"),
    part("feather-1", "petal", 22, 29, 12, 4, 32, "ink", "outline"),
    part("feather-2", "petal", 31, 43, 10, 4, 47, "spot", "solid"),
    part("feather-3", "petal", 43, 66, 9, 3, 59, "accent", "solid"),
    part("feather-4", "petal", 61, 73, 13, 5, -14, "dim", "outline"),
    part("feather-5", "petal", 77, 63, 11, 4, -36, "spot", "solid"),
    part("nymph-a", "arc", 23, 79, 17, 22, -18, "dim", "open"),
    part("nymph-b", "arc", 76, 80, 16, 20, 21, "ink", "open"),
    part("sunset-wash", "disc", 104, 37, 42, 42, 0, "accent", "ghost"),
  ]),
  "basin-rhythm": blueprint(1.1, "end", "nw", [
    part("basin", "ring", 52, 62, 63, 31, -4, "spot", "heavy"),
    part("mother-arm", "arc", 38, 45, 47, 46, 18, "ink", "open"),
    part("child-arm", "arc", 61, 43, 35, 33, -24, "accent", "open"),
    part("leg", "line", 55, 68, 41, 2, 31, "dim", "rough"),
    part("pitcher", "block", 81, 49, 15, 26, -4, "shadow", "outline"),
    part("floor-a", "block", 18, 82, 12, 9, 0, "ink", "outline"),
    part("floor-b", "block", 32, 82, 12, 9, 0, "accent", "solid"),
    part("floor-c", "block", 46, 82, 12, 9, 0, "ink", "outline"),
  ]),
  "name-restored": blueprint(0.94, "start", "sw", [
    part("portrait-register", "line", 30, 50, 82, 2, 90, "accent", "heavy"),
    part("name-line", "line", 57, 24, 56, 4, 0, "ink", "rough"),
    part("record-line-a", "line", 57, 38, 63, 1, 0, "dim", "dashed"),
    part("record-line-b", "line", 57, 49, 48, 1, 0, "dim", "dashed"),
    part("record-line-c", "line", 57, 60, 67, 1, 0, "spot", "dashed"),
    part("anonymous", "line", 57, 72, 54, 3, -7, "shadow", "rough"),
    part("strike", "line", 57, 72, 63, 2, 9, "accent", "heavy"),
    part("skin-swatch", "block", 22, 24, 11, 11, 0, "ink", "soft"),
    part("dress-swatch", "block", 22, 42, 11, 18, 0, "shadow", "solid"),
    part("gaze", "line", 62, 15, 36, 1, -4, "spot", "dashed"),
  ]),
});
