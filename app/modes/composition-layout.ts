import type {
  CompositionGeometry,
  CompositionMotif,
  CompositionRecipe,
  CompositionRect,
} from "./composition-library";

export type CompositionViewportProfile =
  | "panorama"
  | "ultrawide"
  | "landscape"
  | "portrait"
  | "short";

export type CompositionAtlasBoard =
  | "foundations"
  | "light-landscape"
  | "measure-perspective"
  | "tension-identity";

export type CompositionMotifAttachment = Readonly<{
  horizontal: "start" | "center" | "end";
  vertical: "start" | "center" | "end";
}>;

type AtlasLayoutProfile = "wide" | "landscape" | "portrait";

const CANVAS_SIZE = 100;

const ATLAS_BOARD_BY_MOTIF: Readonly<Record<CompositionMotif, CompositionAtlasBoard>> = Object.freeze({
  "ermine-arc": "foundations",
  "sea-born": "foundations",
  "triptych-spill": "foundations",
  "convex-witness": "foundations",
  "vanishing-court": "foundations",
  "rising-diagonal": "foundations",
  "signal-mast": "foundations",
  "celestial-current": "foundations",
  "pearl-orbit": "light-landscape",
  "anatomical-index": "light-landscape",
  "final-tow": "light-landscape",
  "fog-register": "light-landscape",
  "orange-signal": "light-landscape",
  "solar-fold": "light-landscape",
  "winter-descent": "light-landscape",
  "pressed-garden": "light-landscape",
  "anamorphic-datum": "measure-perspective",
  "measured-motion": "measure-perspective",
  "river-span": "measure-perspective",
  "screen-current": "measure-perspective",
  "three-measures": "measure-perspective",
  "mechanical-sun": "measure-perspective",
  "sleep-pressure": "measure-perspective",
  "perspective-proof": "measure-perspective",
  "severed-baseline": "tension-identity",
  "two-armies": "tension-identity",
  "petal-avalanche": "tension-identity",
  "acid-cabaret": "tension-identity",
  "unstable-table": "tension-identity",
  "falling-sun": "tension-identity",
  "basin-rhythm": "tension-identity",
  "name-restored": "tension-identity",
} as const);

const ATLAS_BOARD_LAYOUTS: Readonly<
  Record<CompositionAtlasBoard, Readonly<Record<AtlasLayoutProfile, CompositionGeometry>>>
> = Object.freeze({
  foundations: Object.freeze({
    wide: freezeGeometry({
      art: [62, 7, 35, 86],
      heading: [3, 8, 17, 26],
      motif: [23, 7, 36, 86],
      details: [3, 38, 17, 45],
    }),
    landscape: freezeGeometry({
      art: [58, 7, 39, 86],
      heading: [3, 8, 51, 20],
      motif: [3, 30, 51, 54],
      details: [3, 85, 51, 8],
    }),
    portrait: freezeGeometry({
      art: [5, 21, 90, 32],
      heading: [5, 6, 90, 13],
      motif: [5, 56, 90, 34],
      details: [5, 91, 90, 6],
    }),
  }),
  "light-landscape": Object.freeze({
    wide: freezeGeometry({
      art: [3, 7, 35, 86],
      heading: [41, 8, 17, 26],
      motif: [61, 7, 36, 86],
      details: [41, 38, 17, 45],
    }),
    landscape: freezeGeometry({
      art: [3, 7, 39, 86],
      heading: [46, 8, 51, 20],
      motif: [46, 30, 51, 54],
      details: [46, 85, 51, 8],
    }),
    portrait: freezeGeometry({
      art: [5, 58, 90, 32],
      heading: [5, 6, 90, 13],
      motif: [5, 21, 90, 34],
      details: [5, 91, 90, 6],
    }),
  }),
  "measure-perspective": Object.freeze({
    wide: freezeGeometry({
      art: [61, 7, 36, 86],
      heading: [3, 8, 18, 27],
      motif: [24, 7, 34, 86],
      details: [3, 40, 18, 43],
    }),
    landscape: freezeGeometry({
      art: [3, 57, 94, 36],
      heading: [3, 8, 41, 20],
      motif: [48, 8, 49, 45],
      details: [3, 31, 41, 22],
    }),
    portrait: freezeGeometry({
      art: [5, 58, 90, 32],
      heading: [5, 6, 90, 13],
      motif: [5, 21, 90, 34],
      details: [5, 91, 90, 6],
    }),
  }),
  "tension-identity": Object.freeze({
    wide: freezeGeometry({
      art: [3, 7, 35, 86],
      heading: [80, 8, 17, 26],
      motif: [41, 7, 36, 86],
      details: [80, 38, 17, 45],
    }),
    landscape: freezeGeometry({
      art: [3, 7, 42, 86],
      heading: [49, 8, 48, 20],
      motif: [49, 30, 48, 54],
      details: [49, 85, 48, 8],
    }),
    portrait: freezeGeometry({
      art: [5, 21, 90, 32],
      heading: [5, 6, 90, 13],
      motif: [5, 56, 90, 34],
      details: [5, 91, 90, 6],
    }),
  }),
} as const);

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function finiteOr(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function freezeRect(rect: CompositionRect): CompositionRect {
  return Object.freeze([...rect]) as CompositionRect;
}

function normalizeRect(rect: CompositionRect): CompositionRect {
  const width = clamp(finiteOr(rect[2], 0), 0, CANVAS_SIZE);
  const height = clamp(finiteOr(rect[3], 0), 0, CANVAS_SIZE);
  const x = clamp(finiteOr(rect[0], 0), 0, CANVAS_SIZE - width);
  const y = clamp(finiteOr(rect[1], 0), 0, CANVAS_SIZE - height);
  return freezeRect([x, y, width, height]);
}

function freezeGeometry(geometry: CompositionGeometry): CompositionGeometry {
  return Object.freeze({
    art: normalizeRect(geometry.art),
    heading: normalizeRect(geometry.heading),
    motif: normalizeRect(geometry.motif),
    details: normalizeRect(geometry.details),
  });
}

/** Area occupied by a percentage-based rectangle, expressed from 0 to 1. */
export function compositionRectCoverage(rect: CompositionRect) {
  const normalized = normalizeRect(rect);
  return (normalized[2] * normalized[3]) / (CANVAS_SIZE * CANVAS_SIZE);
}

/** Shortest percentage-point distance between two rectangles. */
export function compositionRectDistance(
  first: CompositionRect,
  second: CompositionRect,
) {
  const a = normalizeRect(first);
  const b = normalizeRect(second);
  const horizontalGap = Math.max(
    a[0] - (b[0] + b[2]),
    b[0] - (a[0] + a[2]),
    0,
  );
  const verticalGap = Math.max(
    a[1] - (b[1] + b[3]),
    b[1] - (a[1] + a[3]),
    0,
  );
  return Math.hypot(horizontalGap, verticalGap);
}

export function resolveCompositionAtlasBoard(
  motif: CompositionMotif,
): CompositionAtlasBoard {
  return ATLAS_BOARD_BY_MOTIF[motif];
}

/**
 * Pins the fitted motif drawing to the side of its authored slot that faces
 * the artwork plate. The diagram remains optically connected without being
 * reduced to a decorative badge.
 */
export function resolveCompositionMotifAttachment(
  geometry: CompositionGeometry,
): CompositionMotifAttachment {
  const art = normalizeRect(geometry.art);
  const motif = normalizeRect(geometry.motif);
  const artCenterX = art[0] + art[2] / 2;
  const artCenterY = art[1] + art[3] / 2;
  const motifCenterX = motif[0] + motif[2] / 2;
  const motifCenterY = motif[1] + motif[3] / 2;
  const epsilon = 0.001;

  return Object.freeze({
    horizontal: motifCenterX < artCenterX - epsilon
      ? "end"
      : motifCenterX > artCenterX + epsilon
        ? "start"
        : "center",
    vertical: motifCenterY < artCenterY - epsilon
      ? "end"
      : motifCenterY > artCenterY + epsilon
        ? "start"
        : "center",
  });
}

export function resolveCompositionViewportProfile(
  width: number,
  height: number,
): CompositionViewportProfile {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return "portrait";
  }

  const aspect = width / height;
  if (height <= 540 && aspect >= 2) return "short";
  if (aspect >= 3) return "panorama";
  if (aspect >= 2.05) return "ultrawide";
  if (aspect >= 1.25) return "landscape";
  return "portrait";
}

export function resolveCompositionGeometry(
  recipe: CompositionRecipe,
  profile: CompositionViewportProfile,
): CompositionGeometry {
  const layoutProfile: AtlasLayoutProfile = profile === "portrait"
    ? "portrait"
    : profile === "landscape"
      ? "landscape"
      : "wide";
  const board = resolveCompositionAtlasBoard(recipe.motif);
  return freezeGeometry(ATLAS_BOARD_LAYOUTS[board][layoutProfile]);
}
