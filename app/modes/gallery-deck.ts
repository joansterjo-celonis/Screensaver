export type GalleryViewportOrientation = "portrait" | "landscape";

export type GalleryDeckArtwork = Readonly<{
  qid: string;
  width: number;
  height: number;
}>;

export type GalleryDeckSnapshot = Readonly<{
  cycle: number;
  deck: readonly string[];
}>;

export type GalleryDeckPosition = Readonly<{
  cycle: number;
  index: number;
  deck: readonly string[];
  history: readonly GalleryDeckSnapshot[];
  orientation: GalleryViewportOrientation;
}>;

export type GalleryDeckFactory = (
  cycle: number,
  orientation: GalleryViewportOrientation,
) => readonly string[];

const MAX_GALLERY_DECK_HISTORY = 8;

function artworkOrientation(
  artwork: GalleryDeckArtwork | undefined,
): GalleryViewportOrientation | "neutral" {
  if (
    !artwork ||
    !Number.isFinite(artwork.width) ||
    !Number.isFinite(artwork.height) ||
    artwork.width <= 0 ||
    artwork.height <= 0
  ) {
    return "neutral";
  }

  if (artwork.height > artwork.width) return "portrait";
  if (artwork.width > artwork.height) return "landscape";
  return "neutral";
}

/**
 * Stable-partition an already randomized deck for the current viewport.
 * Squares and entries without usable dimensions form a neutral middle bucket.
 * The order within all three buckets is left untouched.
 */
export function orderGalleryDeckForViewport(
  randomizedQids: readonly string[],
  artworks: readonly GalleryDeckArtwork[],
  orientation: GalleryViewportOrientation,
) {
  const artworkByQid = new Map(artworks.map((artwork) => [artwork.qid, artwork]));
  const preferred: string[] = [];
  const neutral: string[] = [];
  const opposite: string[] = [];

  for (const qid of randomizedQids) {
    const candidateOrientation = artworkOrientation(artworkByQid.get(qid));
    const bucket = candidateOrientation === orientation
      ? preferred
      : candidateOrientation === "neutral"
        ? neutral
        : opposite;
    bucket.push(qid);
  }

  return [...preferred, ...neutral, ...opposite];
}

function safeDeckIndex(position: Pick<GalleryDeckPosition, "deck" | "index">) {
  if (!position.deck.length) return 0;
  if (!Number.isFinite(position.index)) return 0;
  return Math.min(position.deck.length - 1, Math.max(0, Math.floor(position.index)));
}

export function currentGalleryDeckQid(
  position: Pick<GalleryDeckPosition, "deck" | "index">,
) {
  return position.deck[safeDeckIndex(position)];
}

/** Reorder only work that has not yet been shown in the current cycle. */
export function reorientGalleryDeckRemainder(
  position: GalleryDeckPosition,
  orientation: GalleryViewportOrientation,
  artworks: readonly GalleryDeckArtwork[],
): GalleryDeckPosition {
  if (orientation === position.orientation) return position;
  if (!position.deck.length) return { ...position, orientation };

  const index = safeDeckIndex(position);
  const visited = position.deck.slice(0, index + 1);
  const remaining = orderGalleryDeckForViewport(
    position.deck.slice(index + 1),
    artworks,
    orientation,
  );
  const deck = [...visited, ...remaining];

  const artworkByQid = new Map(artworks.map((artwork) => [artwork.qid, artwork]));
  const currentOrientation = artworkOrientation(
    artworkByQid.get(position.deck[index]),
  );
  const shouldConsumeCurrent =
    currentOrientation !== orientation && remaining.length > 0;

  return {
    ...position,
    deck,
    index: shouldConsumeCurrent ? index + 1 : index,
    orientation,
  };
}

export function advanceGalleryDeckPosition(
  position: GalleryDeckPosition,
  createDeck: GalleryDeckFactory,
): GalleryDeckPosition {
  if (!position.deck.length) {
    return {
      ...position,
      deck: [...createDeck(position.cycle, position.orientation)],
      index: 0,
    };
  }

  const index = safeDeckIndex(position);
  if (index + 1 < position.deck.length) {
    return { ...position, index: index + 1 };
  }

  const cycle = position.cycle + 1;
  const deck = [...createDeck(cycle, position.orientation)];
  if (!deck.length) return { ...position, index };

  return {
    ...position,
    cycle,
    deck,
    index: 0,
    history: [
      ...position.history,
      { cycle: position.cycle, deck: [...position.deck] },
    ].slice(-MAX_GALLERY_DECK_HISTORY),
  };
}

export function retreatGalleryDeckPosition(
  position: GalleryDeckPosition,
  createDeck: GalleryDeckFactory,
): GalleryDeckPosition {
  if (!position.deck.length) return position;

  const index = safeDeckIndex(position);
  if (index > 0) return { ...position, index: index - 1 };

  const previous = position.history.at(-1);
  if (previous?.deck.length) {
    return {
      ...position,
      cycle: previous.cycle,
      deck: [...previous.deck],
      index: previous.deck.length - 1,
      history: position.history.slice(0, -1),
    };
  }

  if (position.cycle > 0) {
    const cycle = position.cycle - 1;
    const deck = [...createDeck(cycle, position.orientation)];
    if (deck.length) return { ...position, cycle, deck, index: deck.length - 1 };
  }

  return { ...position, index: position.deck.length - 1 };
}

export function galleryDeckWindowQids(
  position: GalleryDeckPosition,
  createDeck: GalleryDeckFactory,
) {
  if (!position.deck.length) {
    return { previousQid: undefined, currentQid: undefined, nextQid: undefined };
  }

  const index = safeDeckIndex(position);
  let previousQid: string | undefined = position.deck[index - 1];
  if (!previousQid) {
    const previousSnapshot = position.history.at(-1);
    previousQid = previousSnapshot?.deck.at(-1);
    if (!previousQid && position.cycle > 0) {
      previousQid = createDeck(
        position.cycle - 1,
        position.orientation,
      ).at(-1);
    }
    previousQid ??= position.deck.at(-1);
  }

  let nextQid: string | undefined = position.deck[index + 1];
  if (!nextQid) {
    nextQid = createDeck(position.cycle + 1, position.orientation)[0];
  }

  return {
    previousQid,
    currentQid: position.deck[index],
    nextQid,
  };
}

export function resolveGalleryViewportOrientation(
  width: number,
  height: number,
  fallback: GalleryViewportOrientation = "landscape",
): GalleryViewportOrientation {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width === height
  ) {
    return fallback;
  }

  return height > width ? "portrait" : "landscape";
}
