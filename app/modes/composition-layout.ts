import type {
  CompositionGeometry,
  CompositionRecipe,
  CompositionRect,
} from "./composition-library";

export type CompositionViewportProfile =
  | "panorama"
  | "ultrawide"
  | "landscape"
  | "portrait"
  | "short";

export type CompositionMotifAttachment = Readonly<{
  horizontal: "start" | "center" | "end";
  vertical: "start" | "center" | "end";
}>;

const CANVAS_SIZE = 100;
const MAX_MOTIF_COVERAGE = 0.22;
const MAX_ART_ATTACHMENT_GAP = 1.5;

const ART_COVERAGE_FLOORS: Readonly<Record<CompositionViewportProfile, number>> =
  Object.freeze({
    panorama: 0.68,
    ultrawide: 0.7,
    landscape: 0.6,
    portrait: 0.64,
    short: 0.76,
  });

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

/**
 * Pins the fitted motif drawing to the corner of its authored slot that faces
 * the painting. This matters because the slot and the invariant-ratio SVG are
 * not generally the same shape on real displays.
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

function growRectAxis(
  rect: CompositionRect,
  axis: "width" | "height",
  requestedSize: number,
): CompositionRect {
  const [x, y, width, height] = normalizeRect(rect);
  const horizontal = axis === "width";
  const position = horizontal ? x : y;
  const size = horizontal ? width : height;
  const nextSize = clamp(finiteOr(requestedSize, size), size, CANVAS_SIZE);
  const leadingGap = position;
  const trailingGap = CANVAS_SIZE - position - size;

  let nextPosition: number;
  if (leadingGap <= 0.001) {
    nextPosition = 0;
  } else if (trailingGap <= 0.001) {
    nextPosition = CANVAS_SIZE - nextSize;
  } else if (leadingGap < trailingGap * 0.75) {
    nextPosition = position;
  } else if (trailingGap < leadingGap * 0.75) {
    nextPosition = CANVAS_SIZE - trailingGap - nextSize;
  } else {
    nextPosition = position + size / 2 - nextSize / 2;
  }

  if (horizontal) {
    return normalizeRect([nextPosition, y, nextSize, height]);
  }
  return normalizeRect([x, nextPosition, width, nextSize]);
}

function ensureDominantAxis(rect: CompositionRect): CompositionRect {
  const normalized = normalizeRect(rect);
  if (Math.max(normalized[2], normalized[3]) >= 94) return normalized;
  return normalized[2] >= normalized[3]
    ? growRectAxis(normalized, "width", 94)
    : growRectAxis(normalized, "height", 94);
}

function ensureArtCoverage(
  rect: CompositionRect,
  minimumCoverage: number,
  requireDominantAxis: boolean,
): CompositionRect {
  let next = requireDominantAxis ? ensureDominantAxis(rect) : normalizeRect(rect);
  const targetArea = clamp(minimumCoverage, 0, 1) * CANVAS_SIZE * CANVAS_SIZE;
  if (next[2] * next[3] >= targetArea) return next;

  // Preserve an authored full-bleed axis and grow the shorter portal dimension.
  if (next[2] >= 94) {
    next = growRectAxis(next, "height", targetArea / Math.max(next[2], 0.001));
  } else if (next[3] >= 94) {
    next = growRectAxis(next, "width", targetArea / Math.max(next[3], 0.001));
  } else {
    const widthTarget = targetArea / Math.max(next[3], 0.001);
    const heightTarget = targetArea / Math.max(next[2], 0.001);
    const widthGrowth = widthTarget <= CANVAS_SIZE
      ? (widthTarget - next[2]) / Math.max(next[2], 0.001)
      : Number.POSITIVE_INFINITY;
    const heightGrowth = heightTarget <= CANVAS_SIZE
      ? (heightTarget - next[3]) / Math.max(next[3], 0.001)
      : Number.POSITIVE_INFINITY;
    next = widthGrowth <= heightGrowth
      ? growRectAxis(next, "width", widthTarget)
      : growRectAxis(next, "height", heightTarget);
  }

  // A malformed or extremely narrow source rectangle may require both axes.
  if (next[2] * next[3] < targetArea) {
    next = growRectAxis(next, "width", targetArea / Math.max(next[3], 0.001));
  }
  if (next[2] * next[3] < targetArea) {
    next = growRectAxis(next, "height", targetArea / Math.max(next[2], 0.001));
  }
  return normalizeRect(next);
}

function limitMotifCoverage(rect: CompositionRect): CompositionRect {
  const normalized = normalizeRect(rect);
  const coverage = compositionRectCoverage(normalized);
  if (coverage <= MAX_MOTIF_COVERAGE || coverage === 0) return normalized;

  const scale = Math.sqrt(MAX_MOTIF_COVERAGE / coverage);
  const nextWidth = normalized[2] * scale;
  const nextHeight = normalized[3] * scale;
  return normalizeRect([
    normalized[0] + (normalized[2] - nextWidth) / 2,
    normalized[1] + (normalized[3] - nextHeight) / 2,
    nextWidth,
    nextHeight,
  ]);
}

function attachMotifToArt(
  motifRect: CompositionRect,
  artRect: CompositionRect,
): CompositionRect {
  const motif = limitMotifCoverage(motifRect);
  const art = normalizeRect(artRect);
  const currentDistance = compositionRectDistance(motif, art);
  if (currentDistance <= MAX_ART_ATTACHMENT_GAP) return motif;

  const motifRight = motif[0] + motif[2];
  const motifBottom = motif[1] + motif[3];
  const artRight = art[0] + art[2];
  const artBottom = art[1] + art[3];
  const horizontalGap = Math.max(art[0] - motifRight, motif[0] - artRight, 0);
  const verticalGap = Math.max(art[1] - motifBottom, motif[1] - artBottom, 0);
  const targetScale = MAX_ART_ATTACHMENT_GAP / currentDistance;
  const targetHorizontalGap = horizontalGap * targetScale;
  const targetVerticalGap = verticalGap * targetScale;

  let x = motif[0];
  let y = motif[1];
  if (motifRight < art[0]) x = art[0] - motif[2] - targetHorizontalGap;
  if (motif[0] > artRight) x = artRight + targetHorizontalGap;
  if (motifBottom < art[1]) y = art[1] - motif[3] - targetVerticalGap;
  if (motif[1] > artBottom) y = artBottom + targetVerticalGap;

  let attached = normalizeRect([x, y, motif[2], motif[3]]);
  if (compositionRectDistance(attached, art) > MAX_ART_ATTACHMENT_GAP + 0.001) {
    // Clamping should rarely intervene; touching the nearest edge is a safe fallback.
    x = motif[0];
    y = motif[1];
    if (motifRight < art[0]) x = art[0] - motif[2];
    if (motif[0] > artRight) x = artRight;
    if (motifBottom < art[1]) y = art[1] - motif[3];
    if (motif[1] > artBottom) y = artBottom;
    attached = normalizeRect([x, y, motif[2], motif[3]]);
  }
  return attached;
}

function freezeGeometry(geometry: CompositionGeometry): CompositionGeometry {
  return Object.freeze({
    art: freezeRect(geometry.art),
    heading: freezeRect(geometry.heading),
    motif: freezeRect(geometry.motif),
    details: freezeRect(geometry.details),
  });
}

export function resolveCompositionGeometry(
  recipe: CompositionRecipe,
  profile: CompositionViewportProfile,
): CompositionGeometry {
  const resolvedProfile: CompositionViewportProfile =
    profile in ART_COVERAGE_FLOORS ? profile : "landscape";
  const base = resolvedProfile === "portrait" ? recipe.portrait : recipe.landscape;
  const requireDominantAxis = resolvedProfile === "panorama" || resolvedProfile === "short";
  const art = ensureArtCoverage(
    base.art,
    ART_COVERAGE_FLOORS[resolvedProfile],
    requireDominantAxis,
  );

  return freezeGeometry({
    art,
    heading: normalizeRect(base.heading),
    motif: attachMotifToArt(base.motif, art),
    details: normalizeRect(base.details),
  });
}
