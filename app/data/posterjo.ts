import {
  POSTERJO_ARCHIVE_VERSION,
  POSTERJO_ARTWORKS,
} from "./posterjo.generated";

export { POSTERJO_ARCHIVE_VERSION, POSTERJO_ARTWORKS };

export type PosterjoArtwork = (typeof POSTERJO_ARTWORKS)[number];

export const POSTERJO_DATASET_VERSION =
  `${POSTERJO_ARCHIVE_VERSION}-${POSTERJO_ARTWORKS.length}`;

/** Resolve an archived artwork without assuming the site is hosted at `/`. */
export function posterjoArtworkUrl(
  artwork: Pick<PosterjoArtwork, "file">,
) {
  const base = import.meta.env.BASE_URL || "/";
  const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
  const relativeFile = artwork.file.replace(/^\/+/, "");
  const separator = relativeFile.includes("?") ? "&" : "?";

  return `${baseWithSlash}${relativeFile}${separator}v=${encodeURIComponent(POSTERJO_ARCHIVE_VERSION)}`;
}
