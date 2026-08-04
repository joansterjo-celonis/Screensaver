export const GALLERY_ERA_OPTIONS = Object.freeze([
  Object.freeze({
    value: "pre-1400" as const,
    label: "Before 1400",
    shortLabel: "< 1400",
  }),
  Object.freeze({ value: "1400s" as const, label: "1400–1499", shortLabel: "1400s" }),
  Object.freeze({ value: "1500s" as const, label: "1500–1599", shortLabel: "1500s" }),
  Object.freeze({ value: "1600s" as const, label: "1600–1699", shortLabel: "1600s" }),
  Object.freeze({ value: "1700s" as const, label: "1700–1799", shortLabel: "1700s" }),
  Object.freeze({ value: "1800s" as const, label: "1800–1899", shortLabel: "1800s" }),
  Object.freeze({
    value: "1900-plus" as const,
    label: "1900 and later",
    shortLabel: "1900+",
  }),
]);

export type GalleryEraId = (typeof GALLERY_ERA_OPTIONS)[number]["value"];

export type GalleryEraArtwork = Readonly<{
  qid: string;
  year: string;
}>;

export const ALL_GALLERY_ERA_IDS: readonly GalleryEraId[] = Object.freeze(
  GALLERY_ERA_OPTIONS.map(({ value }) => value),
);

const VALID_GALLERY_ERA_IDS = new Set<GalleryEraId>(ALL_GALLERY_ERA_IDS);

/**
 * Resolve a representative start year from the catalog's display copy.
 * Exact years, decades, ranges, circa dates, and named centuries all map
 * deterministically to the first year represented by the text.
 */
export function parseGalleryYearStart(value: string): number | null {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFKC").trim();
  if (!normalized) return null;
  const isBce = /\b(?:BCE?|BC)\b/i.test(normalized);

  const centuryMatch = normalized.match(
    /\b(\d{1,2})(?:st|nd|rd|th)\s+century\b/i,
  );
  if (centuryMatch) {
    const century = Number(centuryMatch[1]);
    return Number.isInteger(century) && century > 0
      ? isBce
        ? -century * 100
        : (century - 1) * 100
      : null;
  }

  const yearMatch = normalized.match(/\b(\d{3,4})(?:s\b)?/i);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  return Number.isInteger(year) ? (isBce ? -year : year) : null;
}

export function galleryEraIdForYear(value: string): GalleryEraId | null {
  const year = parseGalleryYearStart(value);
  if (year === null) return null;
  if (year < 1400) return "pre-1400";
  if (year < 1500) return "1400s";
  if (year < 1600) return "1500s";
  if (year < 1700) return "1600s";
  if (year < 1800) return "1700s";
  if (year < 1900) return "1800s";
  return "1900-plus";
}

export function resolveGalleryEraIds(value: unknown): readonly GalleryEraId[] {
  if (!Array.isArray(value)) return ALL_GALLERY_ERA_IDS;
  const requested = new Set(
    value.filter(
      (candidate): candidate is GalleryEraId =>
        typeof candidate === "string" &&
        VALID_GALLERY_ERA_IDS.has(candidate as GalleryEraId),
    ),
  );
  if (!requested.size) return ALL_GALLERY_ERA_IDS;

  const resolved = ALL_GALLERY_ERA_IDS.filter((id) => requested.has(id));
  if (resolved.length === ALL_GALLERY_ERA_IDS.length) {
    return ALL_GALLERY_ERA_IDS;
  }
  return Object.freeze(resolved);
}

export function toggleGalleryEraId(
  selectedEraIds: unknown,
  eraId: GalleryEraId,
  selected: boolean,
) {
  const current = resolveGalleryEraIds(selectedEraIds);
  if (selected) {
    return resolveGalleryEraIds([...current, eraId]);
  }
  if (current.length === 1 && current[0] === eraId) return current;
  return resolveGalleryEraIds(current.filter((id) => id !== eraId));
}

export function galleryEraSelectionLabel(selectedEraIds: unknown) {
  const selected = resolveGalleryEraIds(selectedEraIds);
  if (selected.length === ALL_GALLERY_ERA_IDS.length) return "All eras";
  if (selected.length === 1) {
    return (
      GALLERY_ERA_OPTIONS.find(({ value }) => value === selected[0])?.label ??
      "All eras"
    );
  }
  return `${selected.length} eras`;
}

/**
 * Preserve catalog order while filtering. Selecting every era includes future
 * records with unrecognized dates, and an impossible filter fails soft to the
 * complete catalog so the passive display never gets stuck on an empty deck.
 */
export function galleryArtworkQidsForEras(
  artworks: readonly GalleryEraArtwork[],
  selectedEraIds: unknown,
) {
  const seenQids = new Set<string>();
  const uniqueArtworks = artworks.filter((artwork) => {
    if (!artwork.qid || seenQids.has(artwork.qid)) return false;
    seenQids.add(artwork.qid);
    return true;
  });
  const allQids = uniqueArtworks.map(({ qid }) => qid);
  const selected = resolveGalleryEraIds(selectedEraIds);
  if (selected.length === ALL_GALLERY_ERA_IDS.length) return allQids;

  const selectedSet = new Set(selected);
  const filtered = uniqueArtworks
    .filter((artwork) => {
      const eraId = galleryEraIdForYear(artwork.year);
      return eraId !== null && selectedSet.has(eraId);
    })
    .map(({ qid }) => qid);
  return filtered.length ? filtered : allQids;
}
