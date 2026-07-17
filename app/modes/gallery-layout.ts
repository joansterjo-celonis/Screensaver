export type GalleryArtPlacement = Readonly<{
  centerY: number;
  renderedHeight: number;
  headerSafe: number;
  captionTop: number;
  canAvoidCaption: boolean;
}>;

function finiteDimension(value: number) {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

function clamp(value: number, minimum: number, maximum: number) {
  if (maximum < minimum) return (minimum + maximum) / 2;
  return Math.max(minimum, Math.min(maximum, value));
}

function cssClamp(minimum: number, ideal: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, ideal));
}

export function resolveGalleryLayoutMetrics(viewportHeight: number) {
  const height = finiteDimension(viewportHeight);
  let headerSafe = cssClamp(54, height * 0.075, 82);
  let infoHeight = cssClamp(300, height * 0.4, 440);
  let artworkGap = cssClamp(10, height * 0.018, 24);

  if (height <= 640) {
    headerSafe = cssClamp(44, height * 0.07, 62);
    infoHeight = cssClamp(238, height * 0.44, 292);
    artworkGap = cssClamp(8, height * 0.015, 14);
  }

  if (height <= 540) {
    infoHeight = cssClamp(158, height * 0.38, 198);
    artworkGap = 8;
  }

  return Object.freeze({ headerSafe, infoHeight, artworkGap });
}

/**
 * Full-width gallery art is centered on the display first. When the complete
 * image fits between the header and fixed caption rail, it moves only as far
 * as needed to stay clear of both. Larger works remain centered beneath the
 * fades instead of being pushed into an arbitrary top-aligned crop.
 */
export function resolveGalleryArtPlacement(
  viewportWidth: number,
  viewportHeight: number,
  artworkWidth: number,
  artworkHeight: number,
): GalleryArtPlacement {
  const width = finiteDimension(viewportWidth);
  const height = finiteDimension(viewportHeight);
  const sourceWidth = finiteDimension(artworkWidth);
  const sourceHeight = finiteDimension(artworkHeight);
  const { headerSafe, infoHeight, artworkGap } = resolveGalleryLayoutMetrics(height);
  const renderedHeight = width * (sourceHeight / sourceWidth);
  const captionTop = Math.max(headerSafe, height - infoHeight - artworkGap);
  const safeHeight = Math.max(0, captionTop - headerSafe);
  const canAvoidCaption = renderedHeight <= safeHeight;
  const viewportCenter = height / 2;
  const centerY = canAvoidCaption
    ? clamp(
      viewportCenter,
      headerSafe + renderedHeight / 2,
      captionTop - renderedHeight / 2,
    )
    : viewportCenter;

  return Object.freeze({
    centerY,
    renderedHeight,
    headerSafe,
    captionTop,
    canAvoidCaption,
  });
}
