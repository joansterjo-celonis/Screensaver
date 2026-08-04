import { shuffledCycle, type ShuffleSeed } from "../shuffle.ts";
import type { GalleryOrderMode } from "./gallery-preferences.ts";

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
  orderMode: GalleryOrderMode;
}>;

export type GalleryDeckFactory = (
  cycle: number,
  orientation: GalleryViewportOrientation,
  orderMode: GalleryOrderMode,
  previousQid?: string,
) => readonly string[];

const MAX_GALLERY_DECK_HISTORY = 8;

export type GalleryArtworkOrientation =
  | GalleryViewportOrientation
  | "neutral";

export function resolveGalleryArtworkOrientation(
  artwork: GalleryDeckArtwork | undefined,
): GalleryArtworkOrientation {
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

export function isGalleryArtworkCompatible(
  artwork: GalleryDeckArtwork | undefined,
  orientation: GalleryViewportOrientation,
) {
  const candidateOrientation = resolveGalleryArtworkOrientation(artwork);
  return (
    candidateOrientation === orientation ||
    candidateOrientation === "neutral"
  );
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
    const candidateOrientation = resolveGalleryArtworkOrientation(
      artworkByQid.get(qid),
    );
    const bucket = candidateOrientation === orientation
      ? preferred
      : candidateOrientation === "neutral"
        ? neutral
        : opposite;
    bucket.push(qid);
  }

  return [...preferred, ...neutral, ...opposite];
}

export function avoidGalleryDeckBoundaryRepeat(
  deck: readonly string[],
  previousQid: string | undefined,
) {
  const next = [...deck];
  if (!previousQid || next.length < 2 || next[0] !== previousQid) return next;
  const swapIndex = next.findIndex(
    (qid, index) => index > 0 && qid !== previousQid,
  );
  if (swapIndex > 0) {
    [next[0], next[swapIndex]] = [next[swapIndex], next[0]];
  }
  return next;
}

export function buildGalleryCycleDeck({
  qids,
  artworks,
  seed,
  cycle,
  orientation,
  orderMode,
  previousQid,
}: {
  qids: readonly string[];
  artworks: readonly GalleryDeckArtwork[];
  seed: ShuffleSeed;
  cycle: number;
  orientation: GalleryViewportOrientation;
  orderMode: GalleryOrderMode;
  previousQid?: string;
}) {
  const uniqueQids = [...new Set(qids)];
  const artworkByQid = new Map(
    artworks.map((artwork) => [artwork.qid, artwork]),
  );
  let candidates = uniqueQids;
  let effectiveMode = orderMode;

  if (orderMode === "compatible-only") {
    candidates = uniqueQids.filter((qid) =>
      isGalleryArtworkCompatible(artworkByQid.get(qid), orientation),
    );
    if (!candidates.length && uniqueQids.length) {
      candidates = uniqueQids;
      effectiveMode = "aspect-priority";
    }
  }

  const randomized = shuffledCycle(
    candidates,
    seed,
    cycle,
    (qid) => qid,
  );
  const ordered = effectiveMode === "aspect-priority"
    ? orderGalleryDeckForViewport(randomized, artworks, orientation)
    : randomized;
  return avoidGalleryDeckBoundaryRepeat(ordered, previousQid);
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
  const currentOrientation = resolveGalleryArtworkOrientation(
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

export function reorientGalleryDeckPosition(
  position: GalleryDeckPosition,
  orientation: GalleryViewportOrientation,
  artworks: readonly GalleryDeckArtwork[],
  createDeck: GalleryDeckFactory,
): GalleryDeckPosition {
  if (orientation === position.orientation) return position;
  if (position.orderMode === "random") {
    return { ...position, orientation };
  }
  if (position.orderMode === "aspect-priority") {
    return reorientGalleryDeckRemainder(position, orientation, artworks);
  }

  const deck = [
    ...createDeck(0, orientation, position.orderMode),
  ];
  const currentQid = currentGalleryDeckQid(position);
  const currentIndex = currentQid ? deck.indexOf(currentQid) : -1;
  const anchoredDeck = currentIndex >= 0
    ? [currentQid, ...deck.filter((qid) => qid !== currentQid)]
    : deck;

  return {
    ...position,
    cycle: 0,
    deck: anchoredDeck,
    index: 0,
    history: [],
    orientation,
  };
}

export function changeGalleryDeckOrderMode(
  position: GalleryDeckPosition,
  orderMode: GalleryOrderMode,
  createDeck: GalleryDeckFactory,
): GalleryDeckPosition {
  if (orderMode === position.orderMode) return position;
  return changeGalleryDeckConfiguration(position, orderMode, createDeck);
}

export function changeGalleryDeckConfiguration(
  position: GalleryDeckPosition,
  orderMode: GalleryOrderMode,
  createDeck: GalleryDeckFactory,
): GalleryDeckPosition {
  const deck = [...createDeck(0, position.orientation, orderMode)];
  const currentQid = currentGalleryDeckQid(position);
  const currentIndex = currentQid ? deck.indexOf(currentQid) : -1;
  const anchoredDeck = currentIndex >= 0
    ? [currentQid, ...deck.filter((qid) => qid !== currentQid)]
    : deck;

  return {
    ...position,
    cycle: 0,
    deck: anchoredDeck,
    index: 0,
    history: [],
    orderMode,
  };
}

/**
 * Start a fresh cycle after the eligible catalog changes. The current work is
 * anchored only when it still exists in the new deck; history from the prior
 * filter is deliberately discarded so backwards navigation cannot escape it.
 */
export function changeGalleryDeckCollection(
  position: GalleryDeckPosition,
  createDeck: GalleryDeckFactory,
): GalleryDeckPosition {
  return changeGalleryDeckConfiguration(
    position,
    position.orderMode,
    createDeck,
  );
}

export function advanceGalleryDeckPosition(
  position: GalleryDeckPosition,
  createDeck: GalleryDeckFactory,
): GalleryDeckPosition {
  if (!position.deck.length) {
    return {
      ...position,
      deck: [
        ...createDeck(
          position.cycle,
          position.orientation,
          position.orderMode,
        ),
      ],
      index: 0,
    };
  }

  const index = safeDeckIndex(position);
  if (index + 1 < position.deck.length) {
    return { ...position, index: index + 1 };
  }

  const cycle = position.cycle + 1;
  const deck = [
    ...createDeck(
      cycle,
      position.orientation,
      position.orderMode,
      position.deck[index],
    ),
  ];
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
    const deck = [
      ...createDeck(cycle, position.orientation, position.orderMode),
    ];
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
        position.orderMode,
      ).at(-1);
    }
    previousQid ??= position.deck.at(-1);
  }

  let nextQid: string | undefined = position.deck[index + 1];
  if (!nextQid) {
    nextQid = createDeck(
      position.cycle + 1,
      position.orientation,
      position.orderMode,
      position.deck[index],
    )[0];
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
