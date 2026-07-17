export type ArtworkCopySource = "commons" | "local";

export function classifyArtworkCopySource(
  sourceUrl: string,
  pageUrl: string,
): ArtworkCopySource | null {
  try {
    const page = new URL(pageUrl);
    const source = new URL(sourceUrl, page);
    if (source.origin === page.origin) return "local";

    const hostname = source.hostname.toLowerCase();
    if (hostname === "wikimedia.org" || hostname.endsWith(".wikimedia.org")) {
      return "commons";
    }
  } catch {
    // A source is only labelled after it resolves to a known delivery host.
  }
  return null;
}
