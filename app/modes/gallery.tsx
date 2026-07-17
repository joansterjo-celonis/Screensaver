"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ARTWORK_SEEDS,
  commonsRedirect,
  fallbackArtwork,
  type GalleryArtwork,
} from "../data/artworks";

const CACHE_KEY = "always-on-frame.gallery.v2";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const CYCLE_TIME = 5 * 60 * 1000;

type WikiPage = {
  title: string;
  extract?: string;
  fullurl?: string;
  pageimage?: string;
  thumbnail?: { source: string };
};

type WikiResponse = {
  query?: {
    pages?: WikiPage[];
    redirects?: Array<{ from: string; to: string }>;
    normalized?: Array<{ from: string; to: string }>;
  };
};

type CommonsMetadata = Record<string, { value?: string }>;

type CommonsResponse = {
  query?: {
    pages?: Array<{
      title: string;
      imageinfo?: Array<{
        thumburl?: string;
        url?: string;
        descriptionurl?: string;
        extmetadata?: CommonsMetadata;
      }>;
    }>;
  };
};

type CachedGallery = {
  version: 2;
  savedAt: number;
  artworks: GalleryArtwork[];
};

function normalizeTitle(value: string) {
  return value.replace(/^File:/i, "").replace(/_/g, " ").trim().toLocaleLowerCase();
}

function shorten(value: string, limit = 330) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  const clipped = compact.slice(0, limit);
  const sentence = clipped.lastIndexOf(". ");
  const boundary = sentence > limit * 0.58 ? sentence + 1 : clipped.lastIndexOf(" ");
  return `${clipped.slice(0, boundary)}…`;
}

function readCache(): CachedGallery | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedGallery;
    if (parsed.version !== 2 || !Array.isArray(parsed.artworks) || !parsed.artworks.length) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(artworks: GalleryArtwork[]) {
  try {
    const payload: CachedGallery = { version: 2, savedAt: Date.now(), artworks };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Storage can be unavailable in private or tightly managed kiosk browsers.
  }
}

async function fetchGallery(signal: AbortSignal): Promise<GalleryArtwork[]> {
  const wikipedia = new URL("https://en.wikipedia.org/w/api.php");
  wikipedia.search = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    origin: "*",
    redirects: "1",
    prop: "extracts|pageimages|info",
    exintro: "1",
    explaintext: "1",
    exsentences: "3",
    exlimit: "max",
    inprop: "url",
    piprop: "thumbnail|original|name",
    pithumbsize: "1800",
    pilicense: "free",
    maxage: "86400",
    smaxage: "86400",
    titles: ARTWORK_SEEDS.map((item) => item.articleTitle).join("|"),
  }).toString();

  const wikiResult = await fetch(wikipedia, { signal, headers: { Accept: "application/json" } });
  if (!wikiResult.ok) throw new Error(`Wikipedia responded ${wikiResult.status}`);
  const wikiData = (await wikiResult.json()) as WikiResponse;
  const pages = wikiData.query?.pages ?? [];
  const aliases = new Map<string, string>();
  for (const item of wikiData.query?.normalized ?? []) aliases.set(item.from, item.to);
  for (const item of wikiData.query?.redirects ?? []) aliases.set(item.from, item.to);

  const resolvedPages = ARTWORK_SEEDS.map((seed) => {
    const resolved = aliases.get(seed.articleTitle) ?? seed.articleTitle;
    const page = pages.find(
      (candidate) => candidate.title.toLocaleLowerCase() === resolved.toLocaleLowerCase(),
    );
    return { seed, page };
  });

  const pageImages = resolvedPages.flatMap(({ page }) =>
    page?.pageimage ? [page.pageimage] : [],
  );
  const licenseByFile = new Map<
    string,
    { imageUrl?: string; license?: string; licenseUrl?: string; copyrighted?: string }
  >();

  if (pageImages.length) {
    const commons = new URL("https://commons.wikimedia.org/w/api.php");
    commons.search = new URLSearchParams({
      action: "query",
      format: "json",
      formatversion: "2",
      origin: "*",
      prop: "imageinfo",
      iiprop: "url|dimensions|mime|extmetadata",
      iiurlwidth: "1800",
      iiextmetadatalanguage: "en",
      iiextmetadatafilter:
        "LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|Copyrighted",
      maxage: "86400",
      smaxage: "86400",
      titles: pageImages.map((file) => `File:${file}`).join("|"),
    }).toString();

    const commonsResult = await fetch(commons, {
      signal,
      headers: { Accept: "application/json" },
    });
    if (commonsResult.ok) {
      const commonsData = (await commonsResult.json()) as CommonsResponse;
      for (const filePage of commonsData.query?.pages ?? []) {
        const info = filePage.imageinfo?.[0];
        const meta = info?.extmetadata;
        licenseByFile.set(normalizeTitle(filePage.title), {
          imageUrl: info?.thumburl ?? info?.url,
          license: meta?.LicenseShortName?.value ?? meta?.UsageTerms?.value,
          licenseUrl: meta?.LicenseUrl?.value ?? info?.descriptionurl,
          copyrighted: meta?.Copyrighted?.value,
        });
      }
    }
  }

  return resolvedPages.flatMap(({ seed, page }) => {
    if (!page) return [fallbackArtwork(seed)];
    const license = page.pageimage
      ? licenseByFile.get(normalizeTitle(page.pageimage))
      : undefined;
    const licenseName = license?.license ?? "Public domain";
    const explicitlyRestricted =
      license?.copyrighted?.toLocaleLowerCase() === "true" &&
      !/public domain|cc0/i.test(licenseName);
    if (explicitlyRestricted) return [];

    return [
      {
        ...seed,
        imageUrl:
          license?.imageUrl ?? page.thumbnail?.source ?? commonsRedirect(seed.fallbackFile),
        articleUrl:
          page.fullurl ??
          `https://en.wikipedia.org/wiki/${encodeURIComponent(seed.articleTitle.replace(/ /g, "_"))}`,
        description: page.extract
          ? shorten(page.extract)
          : fallbackArtwork(seed).description,
        license: licenseName,
        licenseUrl: license?.licenseUrl,
      },
    ];
  });
}

function formatCountdown(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function GalleryMode() {
  const fallbackCollection = useMemo(
    () => ARTWORK_SEEDS.map(fallbackArtwork),
    [],
  );
  const [artworks, setArtworks] = useState<GalleryArtwork[]>(fallbackCollection);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nextAt, setNextAt] = useState(() => Date.now() + CYCLE_TIME);
  const [remaining, setRemaining] = useState(CYCLE_TIME);
  const [timerReset, setTimerReset] = useState(0);
  const [sourceState, setSourceState] = useState<"seed" | "cache" | "live">("seed");
  const [imageSource, setImageSource] = useState(fallbackCollection[0].imageUrl);

  useEffect(() => {
    const controller = new AbortController();
    const cached = readCache();
    if (cached) {
      setArtworks(cached.artworks);
      setSourceState("cache");
    }
    const cacheFresh = cached && Date.now() - cached.savedAt < CACHE_TTL;
    if (cacheFresh) return () => controller.abort();

    fetchGallery(controller.signal)
      .then((collection) => {
        if (!collection.length) return;
        setArtworks(collection);
        setSourceState("live");
        writeCache(collection);
      })
      .catch(() => {
        // The seeded or cached collection remains fully usable offline.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    setCurrentIndex((index) => (artworks.length ? index % artworks.length : 0));
  }, [artworks.length]);

  const advance = useCallback(() => {
    setCurrentIndex((index) => (index + 1) % Math.max(1, artworks.length));
  }, [artworks.length]);

  useEffect(() => {
    let timeout = 0;
    let disposed = false;
    const schedule = () => {
      const target = Date.now() + CYCLE_TIME;
      setNextAt(target);
      timeout = window.setTimeout(() => {
        if (disposed) return;
        advance();
        schedule();
      }, CYCLE_TIME);
    };
    schedule();
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
    };
  }, [advance, timerReset]);

  useEffect(() => {
    let timeout = 0;
    const tick = () => {
      setRemaining(nextAt - Date.now());
      timeout = window.setTimeout(tick, 1000 - (Date.now() % 1000));
    };
    tick();
    return () => window.clearTimeout(timeout);
  }, [nextAt]);

  const current = artworks[currentIndex] ?? fallbackCollection[0];
  const fallbackUrl = commonsRedirect(current.fallbackFile);

  useEffect(() => {
    setImageSource(current.imageUrl);
    const following = artworks[(currentIndex + 1) % Math.max(1, artworks.length)];
    if (!following) return;
    const preloader = new Image();
    preloader.decoding = "async";
    preloader.src = following.imageUrl;
  }, [artworks, current.imageUrl, currentIndex]);

  const showNext = () => {
    advance();
    setTimerReset((value) => value + 1);
  };

  return (
    <section
      className="gallery-mode"
      aria-label={`Swikipedia gallery: ${current.title} by ${current.artist}`}
      style={{ "--art-accent": current.accent } as React.CSSProperties}
    >
      <div className="gallery-image-stage">
        <img
          key={`backdrop-${current.articleTitle}`}
          className="gallery-backdrop"
          src={imageSource}
          alt=""
          aria-hidden="true"
        />
        <img
          key={`${current.articleTitle}-${imageSource}`}
          className="gallery-artwork"
          src={imageSource}
          alt={`${current.title} by ${current.artist}, ${current.year}`}
          onError={() => {
            if (imageSource !== fallbackUrl) setImageSource(fallbackUrl);
          }}
        />
        <div className="gallery-shade" aria-hidden="true" />
      </div>

      <header className="gallery-header">
        <div>
          <span>SWIKIPEDIA</span>
          <span className="gallery-header-index">/ 02</span>
        </div>
        <div className="gallery-header-status">
          <span>{sourceState === "live" ? "COMMONS LIVE" : sourceState === "cache" ? "LOCAL ARCHIVE" : "CURATED SET"}</span>
          <span className="gallery-pulse" aria-hidden="true" />
        </div>
      </header>

      <div className="gallery-caption" aria-live="polite">
        <div className="gallery-caption-rule" aria-hidden="true" />
        <p className="gallery-eyebrow">
          PLATE {String(currentIndex + 1).padStart(2, "0")} / {String(artworks.length).padStart(2, "0")}
        </p>
        <h1>{current.title}</h1>
        <div className="gallery-byline">
          <span>{current.artist}</span>
          <span>{current.year}</span>
        </div>
        <p className="gallery-description">{current.description}</p>
        <div className="gallery-meta">
          <span>
            <a href={current.articleUrl} target="_blank" rel="noreferrer">Wikipedia text</a>
            {" / "}
            <a href={current.licenseUrl} target="_blank" rel="noreferrer">{current.license}</a>
          </span>
          <span>Next plate / {formatCountdown(remaining)}</span>
        </div>
      </div>

      <button className="gallery-next" type="button" onClick={showNext} aria-label="Show next artwork">
        NEXT
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
