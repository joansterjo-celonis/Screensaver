import { PAINTINGS } from "./paintings.generated";

export type ArtworkSeed = {
  qid: string;
  articleTitle: string;
  title: string;
  artist: string;
  year: string;
  fallbackFile: string;
  width: number;
  height: number;
  accent: string;
  license: string;
  licenseUrl: string;
  descriptionUrl: string;
};

export type GalleryArtwork = ArtworkSeed & {
  imageUrl: string;
  articleUrl: string;
  description: string;
};

const MATTE_ACCENTS = [
  "#6c6550",
  "#756654",
  "#9f6a55",
  "#896349",
  "#9b7863",
  "#516347",
  "#5d5742",
  "#85775c",
  "#9c705e",
  "#514538",
  "#4d625e",
  "#635847",
] as const;

function accentFor(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return MATTE_ACCENTS[(hash >>> 0) % MATTE_ACCENTS.length];
}

export const LOCAL_ARTWORK_ARCHIVE_VERSION = "wikimedia-2026-07-17-4k1";
export const ARTWORK_DATASET_VERSION = `${LOCAL_ARTWORK_ARCHIVE_VERSION}-${PAINTINGS.length}`;

export const ARTWORK_SEEDS: ArtworkSeed[] = PAINTINGS.map((painting) => ({
  ...painting,
  accent: accentFor(`${painting.qid}:${painting.fallbackFile}`),
}));

export function commonsRedirect(fileName: string, width = 1600) {
  return `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(fileName)}?width=${width}`;
}

export function publicAssetUrl(relativePath: string) {
  return `${import.meta.env.BASE_URL}${relativePath.replace(/^\/+/, "")}`;
}

export function localArtworkUrl(qid: string) {
  return `${publicAssetUrl(`artworks/${encodeURIComponent(qid)}.webp`)}?v=${LOCAL_ARTWORK_ARCHIVE_VERSION}`;
}

export function fallbackArtwork(seed: ArtworkSeed): GalleryArtwork {
  return {
    ...seed,
    imageUrl: localArtworkUrl(seed.qid),
    articleUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(seed.articleTitle.replace(/ /g, "_"))}`,
    description: `${seed.title} is a work by ${seed.artist}, presented from a verified public-domain collection sourced through Wikidata and Wikimedia Commons.`,
  };
}
