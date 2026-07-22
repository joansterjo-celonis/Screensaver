import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

const EXPECTED_PAINTING_COUNT = 2_048;

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the always-on frame shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Always-On Frame<\/title>/i);
  assert.match(html, /FRAME \/ INITIALIZING/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("keeps the product modes explicit and the starter removed", async () => {
  const [page, layout, frame, clock, glyphs, weatherData, gallery, posterjo, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/flip-dot-clock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/flip-dot-glyphs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/weather-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/posterjo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<FrameApp \/>/);
  assert.match(layout, /title: "Always-On Frame"/);
  assert.match(layout, /physical flip-dot clock with selectable live weather/i);
  assert.match(layout, /2,048 verified public-domain paintings/);
  assert.match(frame, /Flip Dot Weather/);
  assert.match(frame, /Swikipedia/);
  assert.match(frame, /Posterjo/);
  assert.match(frame, /type ModeId = [^;]*"clock"[^;]*"posterjo"/);
  assert.match(frame, /id: "clock"/);
  assert.match(frame, /id: "posterjo"/);
  assert.match(frame, /1–3 SELECT/);
  assert.match(
    frame,
    /if \(key === "1"\)\s*(?:\{\s*)?selectMode\("clock"\)/,
  );
  assert.match(frame, /stored === "signal" \? "clock" : stored/);
  assert.doesNotMatch(layout, /editorial compositions|Composition Atlas/i);
  assert.doesNotMatch(frame, /Composition Atlas|selectMode\("compositions"\)/);
  assert.match(frame, /inert=\{indexOpen\}/);
  assert.match(frame, /paused=\{indexOpen\}/);
  assert.match(frame, /createPageLoadSeed\(\)/);
  assert.match(frame, /shuffleSeed=\{shuffleSeed\}/);
  assert.match(frame, /PLATE 003 \/ 2048/);
  assert.match(frame, /<FlipDotText/);
  assert.match(clock, /export function FlipDotClock/);
  assert.match(clock, /export function FlipDotText/);
  assert.match(clock, /className="flip-dot__face flip-dot__face--off"/);
  assert.match(clock, /className="flip-dot__face flip-dot__face--on"/);
  assert.match(clock, /className="flip-dot__edge"/);
  assert.match(glyphs, /export const FLIP_DOT_GLYPHS/);
  assert.match(weatherData, /export function buildForecastUrl/);
  assert.match(weatherData, /export function parseForecastResponse/);
  assert.equal(JSON.parse(packageJson).dependencies.geist, "^1.7.2");
  assert.match(gallery, /5 \* 60 \* 1000/);
  assert.match(gallery, /clearTimeout/);
  assert.match(posterjo, /5 \* 60 \* 1000/);
  assert.match(posterjo, /shuffledCycle\(/);
  assert.match(posterjo, /navigateManually/);
  assert.match(posterjo, /event\.clientX/);
  assert.match(posterjo, /ArrowLeft/);
  assert.match(posterjo, /ArrowRight/);
  assert.match(posterjo, /posterjoArtworkUrl\(current\)/);
  assert.doesNotMatch(posterjo, /\bfetch\s*\(/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
  await assert.rejects(
    access(new URL("../app/modes/compositions.tsx", import.meta.url)),
  );
  for (const oldSignalFile of [
    "../app/modes/signal-field.tsx",
    "../app/modes/signal-library.ts",
    "../app/modes/signal-grid.ts",
  ]) {
    await assert.rejects(
      access(new URL(oldSignalFile, import.meta.url)),
      `${oldSignalFile} must be removed after Flip Dot Weather replaces the legacy mode`,
    );
  }
});

test("uses one tri-mode social image across metadata and the README", async () => {
  const [layout, readme, image, sharpModule] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../public/og-always-on-frame.png", import.meta.url)),
    import("sharp"),
  ]);
  const metadata = await sharpModule.default(image).metadata();

  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.match(layout, /og-always-on-frame\.png/g);
  assert.doesNotMatch(layout, /og-(?:flip-dot|posterjo)\.png/);
  assert.match(layout, /Flip Dot Weather, Swikipedia, and Posterjo/);
  assert.match(readme, /public\/og-always-on-frame\.png/);
});

test("ships the expanded artwork libraries and weather frame", async () => {
  const [paintings, inventorySource, overridesSource, artworks, frame, clock, gallery, styles, serviceWorker] = await Promise.all([
    readFile(new URL("../app/data/paintings.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/data/painting-inventory.json", import.meta.url), "utf8"),
    readFile(new URL("../scripts/data/painting-overrides.json", import.meta.url), "utf8"),
    readFile(new URL("../app/data/artworks.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/flip-dot-clock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  const paintingRowLines = paintings.match(/^\s*\["Q\d+".+\],?$/gm) ?? [];
  const paintingRows = paintingRowLines.map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );
  const inventory = JSON.parse(inventorySource);
  const overrides = JSON.parse(overridesSource);
  assert.equal(paintingRows.length, EXPECTED_PAINTING_COUNT, `expected exactly 2,048 paintings, found ${paintingRows.length}`);
  assert.equal(new Set(paintingRows.map((row) => row[0])).size, EXPECTED_PAINTING_COUNT, "painting QIDs must be unique");
  assert.equal(new Set(paintingRows.map((row) => row[1])).size, EXPECTED_PAINTING_COUNT, "Wikipedia articles must be unique");
  assert.equal(new Set(paintingRows.map((row) => row[5])).size, EXPECTED_PAINTING_COUNT, "Commons files must be unique");
  assert.equal(paintingRows.filter((row) => row[9]).length, 300, "exactly 300 paintings must have local fallbacks");
  for (const [index, row] of paintingRows.entries()) {
    assert.equal(row.length, 10, `${row[0]} must use the complete catalog tuple`);
    assert.equal(row[9], index < 300, `${row[0]} must have the expected fallback policy`);
    assert.ok(row[6] * row[7] >= 1_000_000, `${row[0]} must be at least one megapixel`);
    assert.ok(Math.min(row[6], row[7]) >= 750, `${row[0]} must have a 750px short edge`);
    assert.match(row[8], /^https:\/\//, `${row[0]} must include its verified license URL`);
    if (index >= 300) {
      assert.ok(row[6] * row[7] >= 6_000_000, `${row[0]} addition must be at least six megapixels`);
      assert.ok(Math.min(row[6], row[7]) >= 2_160, `${row[0]} addition must have a 2160px short edge`);
    }
  }
  assert.equal(inventory.count, EXPECTED_PAINTING_COUNT);
  assert.equal(inventory.records.length, EXPECTED_PAINTING_COUNT);
  assert.equal(inventory.policy.minimumAddedShortEdge, 2_160);
  assert.equal(inventory.policy.minimumAddedPixels, 6_000_000);
  assert.equal(inventory.policy.maximumWorksPerArtist, 8);
  assert.equal(inventory.policy.curatorOverrides, "scripts/data/painting-overrides.json");
  assert.ok(inventory.records.every((record) => /^[a-f0-9]{40}$/.test(record.commons.sha1)));
  assert.ok(inventory.records.every((record) => record.commons.copyrighted.toLowerCase() === "false"));
  assert.ok(paintingRows.slice(300).every((row) => row[4] !== "Date unknown"));
  assert.equal(overrides.version, 1);
  for (const [qid, override] of Object.entries(overrides.records)) {
    const row = paintingRows.find((candidate) => candidate[0] === qid);
    const record = inventory.records.find((candidate) => candidate.qid === qid);
    assert.ok(row && record, `${qid} override must target a selected record`);
    if (override.title) assert.equal(row[2], override.title);
    if (override.artist) assert.equal(row[3], override.artist);
    if (override.year) assert.equal(row[4], override.year);
    assert.equal(record.title, row[2]);
    assert.equal(record.artist, row[3]);
    assert.equal(record.year, row[4]);
  }
  assert.match(paintings, /Copyrighted=False and public domain\/CC0/);
  assert.match(artworks, /ARTWORK_DATASET_VERSION/);
  assert.match(artworks, /LOCAL_ARTWORK_ARCHIVE_VERSION = "wikimedia-2026-07-17-4k1"/);
  assert.match(artworks, /seed\.localFallback[\s\S]*?localArtworkUrl\(seed\.qid\)[\s\S]*?commonsArtworkUrl\(seed\)/);
  assert.match(artworks, /import\.meta\.env\.BASE_URL/);
  assert.match(frame, /localArtworkUrl\("Q474338"\)/);
  assert.match(frame, /component: FlipDotClock/);
  assert.match(clock, /DEFAULT_WEATHER_LOCATION/);
  assert.match(clock, /WEATHER_PRESETS/);
  assert.match(frame, /serviceWorker[\s\S]*?register\(publicAssetUrl\("sw\.js"\), \{ scope: import\.meta\.env\.BASE_URL \}\)/);
  assert.match(gallery, /const metadataWindowQids = useMemo/);
  assert.match(gallery, /fetchGallery\(seeds, controller\.signal\)/);
  assert.doesNotMatch(gallery, /commons\.wikimedia\.org\/w\/api\.php/);
  assert.match(gallery, /current\.localFallback[\s\S]*?localArtworkUrl\(current\.qid\)/);
  assert.match(serviceWorker, /isLocalArtwork \? ARTWORK_CACHE : IMAGE_CACHE/);
  assert.doesNotMatch(serviceWorker, /composition-atlas|composition-overlays/i);
  assert.match(gallery, /gallery-artwork-matte/);
  assert.match(gallery, /figcaption className="gallery-caption"/);
  assert.match(
    styles,
    /\.gallery-caption h1\s*\{[\s\S]*?line-height: 1\.08;/,
  );
  assert.match(gallery, /current\.height \/ current\.width >= 1\.3/);
  assert.match(gallery, /navigateManually/);
  assert.match(gallery, /event\.clientX/);
  assert.match(gallery, /ArrowLeft/);
  assert.match(gallery, /ArrowRight/);
  assert.doesNotMatch(gallery, /className="gallery-next"/);
  assert.match(gallery, /resolveGalleryArtPlacement/);
  assert.match(gallery, /--gallery-art-center-y/);
  assert.match(styles, /--gallery-info-height:/);
  assert.match(
    styles,
    /\.gallery-caption\s*\{[\s\S]*?top: calc\(100% - var\(--gallery-info-height\)\);[\s\S]*?height: var\(--gallery-info-height\);/,
  );
  assert.match(
    styles,
    /\.portrait-frame\s*\{[\s\S]*?width: 100%;\s*height: 100%;\s*min-width: 0;\s*min-height: 0;/,
  );
  assert.doesNotMatch(styles, /calc\(100s?vh \* 9 \/ 16\)|calc\(100vw \* 16 \/ 9\)/);
  assert.doesNotMatch(styles, /min-width: 280px/);
  assert.match(styles, /@media \(min-aspect-ratio: 4 \/ 3\)/);
  const landscapeMediaStart = styles.indexOf("@media (min-aspect-ratio: 4 / 3)");
  const landscapeMediaEnd = styles.indexOf("@media ", landscapeMediaStart + 1);
  const landscapeMedia = styles.slice(
    landscapeMediaStart,
    landscapeMediaEnd < 0 ? styles.length : landscapeMediaEnd,
  );
  assert.doesNotMatch(
    landscapeMedia,
    /\.gallery-caption\s*\{[^}]*\bposition:/,
    "caption anchoring must not change with artwork or viewport aspect ratio",
  );
  assert.match(styles, /safe-area-inset-left/);
  assert.match(styles, /safe-area-inset-right/);
  assert.match(styles, /--gallery-header-safe:/);
  assert.match(
    styles,
    /\.gallery-header\s*\{[\s\S]*?position: absolute;[\s\S]*?pointer-events: none;[\s\S]*?background: linear-gradient\(/,
  );
  assert.match(
    styles,
    /\.gallery-artwork-matte\s*\{[\s\S]*?inset: 0;[\s\S]*?overflow: hidden;/,
  );
  assert.match(
    styles,
    /\.gallery-artwork\s*\{[\s\S]*?top: var\(--gallery-art-center-y, 50%\);[\s\S]*?width: 100%;\s*height: auto;\s*max-width: none;\s*max-height: none;/,
  );
  assert.match(
    styles,
    /\.gallery-mode\.is-vertical-art \.gallery-artwork-matte\s*\{\s*inset: 0;/,
  );
  assert.match(styles, /\.gallery-mode\.is-vertical-art \.gallery-artwork/);
  assert.match(styles, /object-fit: cover/);
  assert.doesNotMatch(styles, /\.gallery-next/);
  assert.doesNotMatch(styles, /\.composition-/);
  assert.match(styles, /\.mode-list\s*\{[\s\S]*?grid-template-rows: repeat\(3, minmax\(0, 1fr\)\);/);
  assert.match(styles, /@media \(min-aspect-ratio: 4 \/ 3\)[\s\S]*?\.mode-list\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
});

test("keeps Posterjo local, cover-fitted and richly footered", async () => {
  const [posterjo, posterjoData, generatedData, styles] = await Promise.all([
    readFile(new URL("../app/modes/posterjo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/data/posterjo.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/data/posterjo.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(posterjoData, /POSTERJO_ARCHIVE_VERSION/);
  assert.match(posterjoData, /POSTERJO_ARTWORKS/);
  assert.match(posterjoData, /import\.meta\.env\.BASE_URL/);
  assert.match(generatedData, /readonly title: string/);
  assert.match(generatedData, /readonly description: string/);
  assert.match(
    posterjo,
    /figcaption className="posterjo-caption posterjo-footer"/,
  );
  assert.match(posterjo, /className="posterjo-title"/);
  assert.match(posterjo, /className="posterjo-description"/);
  assert.match(posterjo, /src=\{imageUrl\}/);
  assert.doesNotMatch(posterjo, /\bfetch\s*\(/);
  assert.doesNotMatch(posterjo, /originalFileName/);

  const headerStart = posterjo.indexOf('<header className="posterjo-header">');
  const headerEnd = posterjo.indexOf("</header>", headerStart);
  assert.ok(headerStart >= 0 && headerEnd > headerStart);
  const headerMarkup = posterjo.slice(headerStart, headerEnd);
  assert.doesNotMatch(
    headerMarkup,
    /formatCountdown|remaining|NEXT ARTWORK/i,
    "the top Posterjo header must not carry the countdown",
  );

  const footerStart = posterjo.indexOf(
    '<figcaption className="posterjo-caption posterjo-footer">',
  );
  const footerEnd = posterjo.indexOf("</figcaption>", footerStart);
  assert.ok(footerStart >= 0 && footerEnd > footerStart);
  const footerMarkup = posterjo.slice(footerStart, footerEnd);
  assert.match(footerMarkup, /className="posterjo-footer-rule"/);
  assert.match(footerMarkup, /className="posterjo-eyebrow"/);
  assert.match(footerMarkup, /className="posterjo-byline"/);
  assert.match(footerMarkup, /className="posterjo-meta"/);
  assert.match(footerMarkup, /current\?\.title/);
  assert.match(footerMarkup, /current\?\.description\s*(?:\?|&&)/);
  assert.doesNotMatch(footerMarkup, /current\?\.description\s*\|\|/);
  assert.match(posterjo, /activeIndex\s*\+\s*1/);
  assert.match(footerMarkup, /ARTWORK/i);
  assert.match(footerMarkup, /orderedArtworks\.length/);
  assert.match(footerMarkup, /Joan Sterjo/i);
  assert.match(footerMarkup, /current\??\.width/);
  assert.match(footerMarkup, /current\??\.height/);
  assert.match(footerMarkup, /href=\{current\??\.sourceUrl\}/);
  assert.match(footerMarkup, /Dribbble/i);
  assert.match(footerMarkup, /target="_blank"/);
  assert.match(footerMarkup, /rel="[^"]*(?:noopener|noreferrer)[^"]*"/);
  assert.match(footerMarkup, /formatCountdown\(remaining\)/);
  assert.match(footerMarkup, /NEXT(?: ARTWORK)?/i);
  assert.doesNotMatch(
    footerMarkup,
    /originalFileName|\.title\.(?:slice|substring)\(|(?:Webkit)?LineClamp|overflow:\s*"hidden"/,
    "the Posterjo footer must show the full human-facing title, never a filename",
  );

  const artworkRule = styles.match(/\.posterjo-artwork\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(artworkRule, /\bwidth:\s*100%;/);
  assert.match(artworkRule, /\bheight:\s*100%;/);
  assert.match(artworkRule, /\bobject-fit:\s*cover;/);
  assert.doesNotMatch(styles, /\.posterjo-artwork[^\{]*\{[^}]*\bobject-fit:\s*(?:contain|scale-down)\b/);

  const declarationsFor = (className) => [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, selectors]) => selectors.includes(`.${className}`))
    .map(([, , declarations]) => declarations);
  const titleRules = declarationsFor("posterjo-title");
  assert.ok(titleRules.length > 0, "Posterjo title styling must remain explicit");
  for (const declarations of titleRules) {
    assert.doesNotMatch(
      declarations,
      /(?:-webkit-)?line-clamp|overflow:\s*hidden|text-overflow:\s*ellipsis/,
      "Posterjo titles must remain fully visible rather than clamped",
    );
  }

  const footerRule = declarationsFor("posterjo-footer-rule").join("\n");
  const eyebrowRule = declarationsFor("posterjo-eyebrow").join("\n");
  const bylineRule = declarationsFor("posterjo-byline").join("\n");
  const metaRule = declarationsFor("posterjo-meta").join("\n");
  assert.match(footerRule, /\b(?:background|border(?:-top)?):/);
  assert.match(eyebrowRule, /\b(?:letter-spacing|text-transform|font-size):/);
  assert.match(bylineRule, /\b(?:font-family|font-size|font-weight|letter-spacing):/);
  assert.doesNotMatch(bylineRule, /display:\s*none|visibility:\s*hidden|opacity:\s*0(?:\D|$)/);
  assert.match(metaRule, /\bdisplay:\s*(?:flex|grid);/);
});

test("anchors every Swikipedia caption and vertically centers full-width artwork", async () => {
  const [galleryLayoutModule, paintingsSource] = await Promise.all([
    import(new URL("../app/modes/gallery-layout.ts", import.meta.url).href),
    readFile(new URL("../app/data/paintings.generated.ts", import.meta.url), "utf8"),
  ]);
  const {
    resolveGalleryArtPlacement,
    resolveGalleryLayoutMetrics,
  } = galleryLayoutModule.default ?? galleryLayoutModule;
  const paintings = (paintingsSource.match(/^\s*\["Q\d+".+\],?$/gm) ?? []).map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );
  const viewports = [
    [3440, 1440],
    [1920, 1080],
    [1080, 1920],
    [1280, 480],
  ];

  assert.equal(paintings.length, EXPECTED_PAINTING_COUNT);
  for (const [viewportWidth, viewportHeight] of viewports) {
    const metrics = resolveGalleryLayoutMetrics(viewportHeight);
    assert.ok(metrics.headerSafe > 0);
    assert.ok(metrics.infoHeight > 0 && metrics.infoHeight < viewportHeight);
    assert.ok(metrics.artworkGap >= 0);
    for (const painting of paintings) {
      const placement = resolveGalleryArtPlacement(
        viewportWidth,
        viewportHeight,
        painting[6],
        painting[7],
      );
      for (const value of Object.values(placement)) {
        if (typeof value === "number") assert.ok(Number.isFinite(value));
      }
      assert.ok(placement.renderedHeight > 0);
      assert.ok(placement.centerY >= 0 && placement.centerY <= viewportHeight);
      if (placement.canAvoidCaption) {
        assert.ok(
          placement.centerY - placement.renderedHeight / 2 >= placement.headerSafe - 0.001,
          `${painting[0]} must clear the header on ${viewportWidth}×${viewportHeight}`,
        );
        assert.ok(
          placement.centerY + placement.renderedHeight / 2 <= placement.captionTop + 0.001,
          `${painting[0]} must clear the fixed caption on ${viewportWidth}×${viewportHeight}`,
        );
      } else {
        assert.ok(
          Math.abs(placement.centerY - viewportHeight / 2) < 0.001,
          `${painting[0]} must stay vertically centered when overlap is unavoidable`,
        );
      }
    }
  }
});

test("prioritizes randomized Swikipedia decks for the viewport orientation", async () => {
  const [galleryDeckModule, shuffleModule] = await Promise.all([
    import(new URL("../app/modes/gallery-deck.ts", import.meta.url).href),
    import(new URL("../app/shuffle.ts", import.meta.url).href),
  ]);
  const {
    advanceGalleryDeckPosition,
    currentGalleryDeckQid,
    galleryDeckWindowQids,
    orderGalleryDeckForViewport,
    reorientGalleryDeckRemainder,
    resolveGalleryViewportOrientation,
    retreatGalleryDeckPosition,
  } = galleryDeckModule.default ?? galleryDeckModule;
  const { shuffledCycle } = shuffleModule.default ?? shuffleModule;
  const artworks = [
    { qid: "portrait-a", width: 800, height: 1_200 },
    { qid: "portrait-b", width: 900, height: 1_600 },
    { qid: "portrait-c", width: 1_000, height: 1_400 },
    { qid: "landscape-a", width: 1_200, height: 800 },
    { qid: "landscape-b", width: 1_600, height: 900 },
    { qid: "landscape-c", width: 1_400, height: 1_000 },
    { qid: "square-a", width: 1_000, height: 1_000 },
    { qid: "square-b", width: 800, height: 800 },
  ];
  const qids = [...artworks.map(({ qid }) => qid), "unmeasured"];
  const expectedQids = [...qids].sort();
  const orientationByQid = new Map(
    artworks.map(({ qid, width, height }) => [
      qid,
      height > width ? "portrait" : width > height ? "landscape" : "neutral",
    ]),
  );
  const bucketFor = (qid) => orientationByQid.get(qid) ?? "neutral";

  assert.equal(resolveGalleryViewportOrientation(1_080, 1_920), "portrait");
  assert.equal(resolveGalleryViewportOrientation(1_920, 1_080), "landscape");
  assert.equal(resolveGalleryViewportOrientation(1_200, 1_200), "landscape");
  assert.equal(
    resolveGalleryViewportOrientation(1_200, 1_200, "portrait"),
    "portrait",
    "a square viewport must retain its previous orientation",
  );

  for (const viewportOrientation of ["portrait", "landscape"]) {
    const oppositeOrientation = viewportOrientation === "portrait"
      ? "landscape"
      : "portrait";
    const decks = [];

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const randomized = shuffledCycle(
        qids,
        "gallery:orientation-contract",
        cycle,
      );
      const randomizedSnapshot = [...randomized];
      const deck = orderGalleryDeckForViewport(
        randomized,
        artworks,
        viewportOrientation,
      );
      const expectedBucketOrder = [
        ...randomized.filter((qid) => bucketFor(qid) === viewportOrientation),
        ...randomized.filter((qid) => bucketFor(qid) === "neutral"),
        ...randomized.filter((qid) => bucketFor(qid) === oppositeOrientation),
      ];

      assert.deepEqual(randomized, randomizedSnapshot, "orientation ordering must not mutate the shuffled cycle");
      assert.deepEqual(deck, expectedBucketOrder, "bucket ordering must retain randomized order within each orientation");
      assert.equal(new Set(deck).size, qids.length, "every ordered cycle must remain unique");
      assert.deepEqual([...deck].sort(), expectedQids, "every ordered cycle must retain the full catalog");
      assert.deepEqual(
        orderGalleryDeckForViewport(randomized, artworks, viewportOrientation),
        deck,
        "the same shuffled cycle and viewport must produce the same deck",
      );

      if (cycle > 0) {
        assert.notDeepEqual(deck, decks[cycle - 1], "successive cycles must retain their reshuffle");
        assert.notEqual(
          deck[0],
          decks[cycle - 1].at(-1),
          "orientation partitioning must not reintroduce a cycle-boundary repeat",
        );
      }
      decks.push(deck);
    }
  }

  const createDeck = (cycle, orientation) => orderGalleryDeckForViewport(
    shuffledCycle(qids, "gallery:rotation-contract", cycle),
    artworks,
    orientation,
  );
  let position = {
    cycle: 0,
    index: 0,
    deck: createDeck(0, "portrait"),
    history: [],
    orientation: "portrait",
  };
  const shown = [currentGalleryDeckQid(position)];
  for (let step = 0; step < qids.length * 4 && shown.length < qids.length; step += 1) {
    const orientation = step % 2 === 0 ? "landscape" : "portrait";
    const visitedPrefix = position.deck.slice(0, position.index + 1);
    const previousQid = currentGalleryDeckQid(position);
    position = reorientGalleryDeckRemainder(position, orientation, artworks);
    const currentQid = currentGalleryDeckQid(position);

    assert.deepEqual(
      position.deck.slice(0, visitedPrefix.length),
      visitedPrefix,
      "rotation must never reorder the already visited prefix",
    );
    if (currentQid !== previousQid) {
      assert.ok(!shown.includes(currentQid), "rotation must not replay a consumed bucket head");
      shown.push(currentQid);
    }
  }
  assert.deepEqual(
    [...shown].sort(),
    expectedQids,
    "alternating viewport orientations must eventually consume every work exactly once",
  );

  const boundaryFactory = (cycle, orientation) => [
    `${orientation}-${cycle}-first`,
    `${orientation}-${cycle}-tail`,
  ];
  const cycleZero = {
    cycle: 0,
    index: 1,
    deck: boundaryFactory(0, "portrait"),
    history: [],
    orientation: "portrait",
  };
  assert.equal(
    galleryDeckWindowQids(cycleZero, boundaryFactory).nextQid,
    "portrait-1-first",
    "the forward metadata/preload slot at a boundary must target cycle + 1 index zero",
  );

  const cycleOne = advanceGalleryDeckPosition(cycleZero, boundaryFactory);
  assert.equal(cycleOne.cycle, 1);
  assert.equal(cycleOne.index, 0);
  assert.equal(currentGalleryDeckQid(cycleOne), "portrait-1-first");
  assert.equal(
    galleryDeckWindowQids(cycleOne, boundaryFactory).previousQid,
    "portrait-0-tail",
    "the backward metadata/preload slot must retain the actual prior-cycle tail",
  );

  const returned = retreatGalleryDeckPosition(cycleOne, boundaryFactory);
  assert.equal(returned.cycle, 0);
  assert.equal(returned.index, 1);
  assert.equal(
    currentGalleryDeckQid(returned),
    "portrait-0-tail",
    "previous at a cycle boundary must return to the work that was actually shown last",
  );
});

test("ships complete deterministic flip-dot glyph and weather-icon matrices", async () => {
  const glyphModule = await import(
    new URL("../app/modes/flip-dot-glyphs.ts", import.meta.url).href
  );
  const {
    FLIP_DOT_GLYPHS,
    flipDotGlyph,
    normalizeFlipDotText,
    weatherDotPattern,
  } = glyphModule.default ?? glyphModule;
  const requiredCharacters = [
    " ", "-", ".", ":", "°", "?",
    ..."0123456789",
    ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ];

  assert.deepEqual(Object.keys(FLIP_DOT_GLYPHS).sort(), requiredCharacters.sort());
  for (const character of requiredCharacters) {
    const pattern = FLIP_DOT_GLYPHS[character];
    assert.equal(pattern.length, 7, `${JSON.stringify(character)} must be seven dots tall`);
    for (const row of pattern) {
      assert.equal(row.length, 5, `${JSON.stringify(character)} must be five dots wide`);
      assert.match(row, /^[01]{5}$/);
    }
  }
  assert.equal(normalizeFlipDotText("München 21°c"), "MUNCHEN 21°C");
  assert.equal(normalizeFlipDotText("A/B!"), "A B ");
  assert.equal(flipDotGlyph("☃"), FLIP_DOT_GLYPHS["?"]);

  const weatherIcons = [
    "clear-day",
    "clear-night",
    "partly-cloudy-day",
    "partly-cloudy-night",
    "cloudy",
    "fog",
    "drizzle",
    "rain",
    "snow",
    "storm",
    "unknown",
  ];
  for (const icon of weatherIcons) {
    const pattern = weatherDotPattern(icon);
    assert.equal(pattern.length, 9, `${icon} must be nine dots tall`);
    for (const row of pattern) {
      assert.equal(row.length, 9, `${icon} must be nine dots wide`);
      assert.match(row, /^[01]{9}$/);
    }
  }
  assert.equal(weatherDotPattern("not-a-weather-icon"), weatherDotPattern("unknown"));
});

test("composes one equal-pitch flip-dot field for landscape and portrait", async () => {
  const layoutModule = await import(
    new URL("../app/modes/flip-dot-layout.ts", import.meta.url).href
  );
  const {
    COMPACT_FLIP_DOT_GLYPHS,
    FLIP_DOT_FIELD_SPECS,
    LARGE_FLIP_DOT_DIGITS,
    composeFlipDotField,
    formatFlipDotTemperature,
  } = layoutModule.default ?? layoutModule;

  assert.deepEqual(
    Object.keys(COMPACT_FLIP_DOT_GLYPHS).sort(),
    [" ", "-", ":", "°", "?", ..."0123456789HILO"].sort(),
  );
  for (const pattern of Object.values(COMPACT_FLIP_DOT_GLYPHS)) {
    assert.equal(pattern.length, 5);
    assert.ok(pattern.every((row) => /^[01]{3}$/.test(row)));
  }
  assert.deepEqual(Object.keys(LARGE_FLIP_DOT_DIGITS).sort(), [" ", "-", ..."0123456789"].sort());
  for (const pattern of Object.values(LARGE_FLIP_DOT_DIGITS)) {
    assert.equal(pattern.length, 11);
    assert.ok(pattern.every((row) => /^[01]{7}$/.test(row)));
  }

  const expectedDimensions = {
    landscape: [43, 19],
    portrait: [27, 42],
  };
  for (const variant of ["landscape", "portrait"]) {
    const field = composeFlipDotField({
      variant,
      hours: "12",
      minutes: "48",
      seconds: "36",
      separatorOn: true,
      temperature: "-12°",
      weatherIcon: "clear-day",
    });
    assert.deepEqual([field.columns, field.rows], expectedDimensions[variant]);
    assert.equal(field.active.length, field.columns * field.rows);
    assert.ok(field.active.every((cell) => typeof cell === "boolean"));
    assert.ok(field.active.some(Boolean));

    const regions = Object.values(FLIP_DOT_FIELD_SPECS[variant].regions);
    for (const region of regions) {
      assert.ok(region.x >= 0 && region.y >= 0);
      assert.ok(region.x + region.width <= field.columns);
      assert.ok(region.y + region.height <= field.rows);
    }
    for (let left = 0; left < regions.length; left += 1) {
      for (let right = left + 1; right < regions.length; right += 1) {
        const a = regions[left];
        const b = regions[right];
        const overlaps = a.x < b.x + b.width && a.x + a.width > b.x &&
          a.y < b.y + b.height && a.y + a.height > b.y;
        assert.equal(overlaps, false, `${variant} field regions must not overlap`);
      }
    }
  }

  const colonOn = composeFlipDotField({
    variant: "landscape",
    hours: "12",
    minutes: "48",
    seconds: "36",
    separatorOn: true,
    temperature: "14°",
    weatherIcon: "cloudy",
  });
  const colonOff = composeFlipDotField({
    variant: "landscape",
    hours: "12",
    minutes: "48",
    seconds: "36",
    separatorOn: false,
    temperature: "14°",
    weatherIcon: "cloudy",
  });
  assert.ok(colonOn.active.some((cell, index) => cell !== colonOff.active[index]));
  assert.equal(formatFlipDotTemperature(14.4), "14°");
  assert.equal(formatFlipDotTemperature(-7.6), "-8°");
  assert.equal(formatFlipDotTemperature(100), "HI°");
  assert.equal(formatFlipDotTemperature(-100), "LO°");
  assert.equal(formatFlipDotTemperature(null), "--°");
});

test("renders the live clock through one shared-size mechanical grid", async () => {
  const [clock, globalStyles, clockStyles] = await Promise.all([
    readFile(new URL("../app/modes/flip-dot-clock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/flip-clock.css", import.meta.url), "utf8"),
  ]);
  const source = `${clock}\n${globalStyles}\n${clockStyles}`;

  assert.equal(clock.match(/<UnifiedFlipDotField/g)?.length, 1);
  assert.match(clock, /field\.active\.map\(\(active, index\) =>/);
  assert.match(clock, /key=\{index\}/);
  assert.match(clock, /data-layout=\{field\.variant\}/);
  assert.match(clockStyles, /\.flip-dot-field\s*\{[\s\S]*?grid-template-columns: repeat\(var\(--field-columns\), var\(--dot-size\)\);/);
  assert.match(clockStyles, /\.flip-dot-field \.flip-dot\s*\{\s*width: var\(--dot-size\);\s*height: var\(--dot-size\);/);
  assert.doesNotMatch(source, /flip-dot-matrix--(?:time|seconds|temperature)|flip-dot-weather-icon/);
  assert.doesNotMatch(clock, /<FlipDotText[\s\S]*?className="flip-dot-matrix--(?:time|seconds|temperature)"/);
});

test("builds static-client Open-Meteo URLs without credentials", async () => {
  const weatherModule = await import(
    new URL("../app/modes/weather-data.ts", import.meta.url).href
  );
  const { buildForecastUrl, buildGeocodingUrl } = weatherModule.default ?? weatherModule;
  const location = {
    id: "test-location",
    name: "São Paulo",
    admin: "São Paulo",
    country: "Brazil",
    countryCode: "BR",
    latitude: -23.55052,
    longitude: -46.633308,
    timezone: "America/Sao_Paulo",
  };
  const forecast = new URL(buildForecastUrl(location));

  assert.equal(forecast.protocol, "https:");
  assert.equal(forecast.host, "api.open-meteo.com");
  assert.equal(forecast.pathname, "/v1/forecast");
  assert.equal(forecast.searchParams.get("latitude"), String(location.latitude));
  assert.equal(forecast.searchParams.get("longitude"), String(location.longitude));
  assert.deepEqual(forecast.searchParams.get("current")?.split(","), [
    "temperature_2m",
    "relative_humidity_2m",
    "apparent_temperature",
    "is_day",
    "precipitation",
    "weather_code",
    "wind_speed_10m",
    "wind_direction_10m",
  ]);
  assert.equal(forecast.searchParams.get("daily"), "temperature_2m_max,temperature_2m_min");
  assert.equal(forecast.searchParams.get("temperature_unit"), "celsius");
  assert.equal(forecast.searchParams.get("wind_speed_unit"), "kmh");
  assert.equal(forecast.searchParams.get("precipitation_unit"), "mm");
  assert.equal(forecast.searchParams.get("timezone"), "auto");
  assert.equal(forecast.searchParams.get("forecast_days"), "1");
  assert.equal(forecast.searchParams.has("apikey"), false);

  const geocoding = new URL(buildGeocodingUrl("  São Paulo & region  ", 99));
  assert.equal(geocoding.protocol, "https:");
  assert.equal(geocoding.host, "geocoding-api.open-meteo.com");
  assert.equal(geocoding.pathname, "/v1/search");
  assert.equal(geocoding.searchParams.get("name"), "São Paulo & region");
  assert.equal(geocoding.searchParams.get("count"), "10");
  assert.equal(geocoding.searchParams.get("language"), "en");
  assert.equal(geocoding.searchParams.get("format"), "json");
  assert.equal(geocoding.searchParams.has("apikey"), false);
  assert.equal(new URL(buildGeocodingUrl("Berlin", -5)).searchParams.get("count"), "1");
});

test("parses Open-Meteo location and current-weather payloads defensively", async () => {
  const weatherModule = await import(
    new URL("../app/modes/weather-data.ts", import.meta.url).href
  );
  const { parseForecastResponse, parseGeocodingResponse } = weatherModule.default ?? weatherModule;
  const locations = parseGeocodingResponse({
    results: [
      {
        id: 2950159,
        name: " Berlin ",
        admin1: "Berlin",
        country: "Germany",
        country_code: "DE",
        latitude: 52.52437,
        longitude: 13.41053,
        timezone: "Europe/Berlin",
      },
      { name: "Outside", latitude: 91, longitude: 0, timezone: "UTC" },
      {
        name: "Fallback country",
        country_code: "FR",
        latitude: 48.85,
        longitude: 2.35,
        timezone: "Europe/Paris",
      },
      null,
    ],
  });

  assert.deepEqual(locations, [
    {
      id: "2950159",
      name: "Berlin",
      admin: "Berlin",
      country: "Germany",
      countryCode: "DE",
      latitude: 52.52437,
      longitude: 13.41053,
      timezone: "Europe/Berlin",
    },
    {
      id: "48.85:2.35:2",
      name: "Fallback country",
      admin: "",
      country: "FR",
      countryCode: "FR",
      latitude: 48.85,
      longitude: 2.35,
      timezone: "Europe/Paris",
    },
  ]);
  assert.deepEqual(parseGeocodingResponse({}), []);
  assert.deepEqual(parseGeocodingResponse({ results: "not-an-array" }), []);

  const payload = {
    timezone: "Europe/Berlin",
    timezone_abbreviation: "CEST",
    current_units: {
      temperature_2m: "°C",
      relative_humidity_2m: "%",
      precipitation: "mm",
      wind_speed_10m: "km/h",
    },
    current: {
      time: "2026-07-22T14:45",
      temperature_2m: 24.6,
      apparent_temperature: 25.2,
      relative_humidity_2m: 61,
      precipitation: 0.1,
      weather_code: 2,
      is_day: 1,
      wind_speed_10m: 12.4,
      wind_direction_10m: 225,
    },
    daily: {
      temperature_2m_max: [27.1],
      temperature_2m_min: [16.2],
    },
  };
  assert.deepEqual(parseForecastResponse(payload), {
    observedAt: "2026-07-22T14:45",
    timezone: "Europe/Berlin",
    timezoneAbbreviation: "CEST",
    temperature: 24.6,
    apparentTemperature: 25.2,
    relativeHumidity: 61,
    precipitation: 0.1,
    weatherCode: 2,
    isDay: true,
    windSpeed: 12.4,
    windDirection: 225,
    temperatureMax: 27.1,
    temperatureMin: 16.2,
    units: {
      temperature: "°C",
      humidity: "%",
      precipitation: "mm",
      windSpeed: "km/h",
    },
  });
  assert.equal(parseForecastResponse({}), null);
  assert.equal(parseForecastResponse({ ...payload, current: { ...payload.current, temperature_2m: null } }), null);

  const fallbackUnits = parseForecastResponse({
    ...payload,
    current_units: undefined,
    daily: undefined,
  });
  assert.deepEqual(fallbackUnits?.units, {
    temperature: "°C",
    humidity: "%",
    precipitation: "mm",
    windSpeed: "km/h",
  });
  assert.equal(fallbackUnits?.temperatureMax, null);
  assert.equal(fallbackUnits?.temperatureMin, null);
});

test("maps every documented WMO current-weather code and wind direction", async () => {
  const weatherModule = await import(
    new URL("../app/modes/weather-data.ts", import.meta.url).href
  );
  const { weatherDescriptor, windCompass } = weatherModule.default ?? weatherModule;
  const groups = [
    { codes: [3], label: "Overcast", icon: "cloudy" },
    { codes: [45, 48], label: "Fog", icon: "fog" },
    { codes: [51, 53, 55, 56, 57], label: "Drizzle", icon: "drizzle" },
    { codes: [61, 63, 65, 66, 67, 80, 81, 82], label: "Rain", icon: "rain" },
    { codes: [71, 73, 75, 77, 85, 86], label: "Snow", icon: "snow" },
    { codes: [95, 96, 99], label: "Thunderstorm", icon: "storm" },
  ];
  const coveredCodes = new Set([0, 1, 2]);

  assert.deepEqual(weatherDescriptor(0, true), { label: "Clear", icon: "clear-day" });
  assert.deepEqual(weatherDescriptor(0, false), { label: "Clear night", icon: "clear-night" });
  assert.deepEqual(weatherDescriptor(1, true), { label: "Mainly clear", icon: "partly-cloudy-day" });
  assert.deepEqual(weatherDescriptor(1, false), { label: "Mainly clear", icon: "partly-cloudy-night" });
  assert.deepEqual(weatherDescriptor(2, true), { label: "Partly cloudy", icon: "partly-cloudy-day" });
  assert.deepEqual(weatherDescriptor(2, false), { label: "Partly cloudy", icon: "partly-cloudy-night" });

  for (const { codes, label, icon } of groups) {
    for (const code of codes) {
      coveredCodes.add(code);
      assert.deepEqual(weatherDescriptor(code, true), { label, icon });
      assert.deepEqual(weatherDescriptor(code, false), { label, icon });
    }
  }
  assert.equal(coveredCodes.size, 28, "the complete Open-Meteo WMO table must stay covered");
  assert.deepEqual(weatherDescriptor(-1, true), {
    label: "Conditions unavailable",
    icon: "unknown",
  });
  assert.deepEqual(weatherDescriptor(100, false), {
    label: "Conditions unavailable",
    icon: "unknown",
  });

  assert.deepEqual(
    [0, 45, 90, 135, 180, 225, 270, 315, 360, -45].map(windCompass),
    ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "N", "NW"],
  );
});

test("keeps Flip Dot Weather cached, abortable, pause-safe and accessible", async () => {
  const [clock, weatherData] = await Promise.all([
    readFile(new URL("../app/modes/flip-dot-clock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/weather-data.ts", import.meta.url), "utf8"),
  ]);

  assert.match(clock, /LOCATION_STORAGE_KEY = "always-on-frame\.weather-location\.v1"/);
  assert.match(clock, /WEATHER_CACHE_KEY = "always-on-frame\.weather-cache\.v1"/);
  assert.match(clock, /WEATHER_REFRESH_MS = 15 \* 60 \* 1000/);
  assert.match(clock, /WEATHER_STALE_MS = 30 \* 60 \* 1000/);
  assert.match(clock, /readStoredJson\(LOCATION_STORAGE_KEY\)/);
  assert.match(clock, /isCachedWeather\(storedWeather\) && storedWeather\.locationId === nextLocation\.id/);
  assert.match(clock, /storeJson\(WEATHER_CACHE_KEY,[\s\S]*?fetchedAt: nextFetchedAt,[\s\S]*?locationId: location\.id,[\s\S]*?snapshot/);
  assert.match(clock, /Showing saved conditions while refreshing/);
  assert.match(clock, /showing the last saved conditions/);

  assert.match(clock, /if \(!preferencesReady \|\| paused\) return;/);
  assert.match(clock, /const controller = new AbortController\(\)/);
  assert.match(clock, /fetch\(buildForecastUrl\(location\), \{[\s\S]*?signal: controller\.signal/);
  assert.match(clock, /window\.setInterval\(\(\) => void refresh\(\), WEATHER_REFRESH_MS\)/);
  assert.match(clock, /document\.addEventListener\("visibilitychange", handleVisibility\)/);
  assert.match(clock, /controller\.abort\(\);[\s\S]*?window\.clearInterval\(refreshTimer\);[\s\S]*?document\.removeEventListener\("visibilitychange", handleVisibility\)/);
  assert.match(clock, /if \(paused\) return;[\s\S]*?setNow\(new Date\(\)\)/);
  assert.match(clock, /searchControllerRef\.current\?\.abort\(\)/);
  assert.match(clock, /useEffect\(\(\) => \(\) => searchControllerRef\.current\?\.abort\(\), \[\]\)/);
  assert.match(clock, /normalizedQuery\.length < 3/);
  assert.match(clock, /fetch\(buildGeocodingUrl\(normalizedQuery\), \{[\s\S]*?signal: controller\.signal/);

  assert.match(clock, /aria-label=\{`Flip-dot clock and weather for \$\{location\.name\}`\}/);
  assert.match(clock, /role="dialog"/);
  assert.match(clock, /aria-modal="true"/);
  assert.match(clock, /<form onSubmit=\{runLocationSearch\} className="flip-clock-search" role="search">/);
  assert.match(clock, /htmlFor="flip-clock-location-search"/);
  assert.match(clock, /id="flip-clock-search-status"[\s\S]*?aria-live="polite"/);
  assert.match(clock, /aria-label="Location search results"/);
  assert.match(clock, /WEATHER_PRESETS\.map/);
  assert.match(clock, /href="https:\/\/open-meteo\.com\/"/);
  assert.match(clock, /Weather data by Open–Meteo/);
  assert.match(clock, /href="https:\/\/www\.geonames\.org\/"/);
  assert.match(clock, /Location data by GeoNames/);
  assert.doesNotMatch(`${clock}\n${weatherData}`, /\bapikey\b/i);
});

test("renders physical front, back and edge surfaces for every flip dot", async () => {
  const [clock, glyphs, styles] = await Promise.all([
    readFile(new URL("../app/modes/flip-dot-clock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/flip-dot-glyphs.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(clock, /active=\{ready && cell === "1"\}/);
  assert.match(clock, /className="flip-dot__rotor"/);
  assert.match(clock, /className="flip-dot__edge"/);
  assert.match(clock, /className="flip-dot__face flip-dot__face--off"/);
  assert.match(clock, /className="flip-dot__face flip-dot__face--on"/);
  assert.match(styles, /\.flip-dot\s*\{[\s\S]*?perspective: calc\(var\(--dot-size\) \* 8\.5\);/);
  assert.match(styles, /\.flip-dot__rotor\s*\{[\s\S]*?transform-style: preserve-3d;[\s\S]*?transition: transform 430ms/);
  assert.match(styles, /\.flip-dot\[data-on="true"\] \.flip-dot__rotor\s*\{\s*transform: rotateX\(180deg\);/);
  assert.match(styles, /\.flip-dot__face\s*\{[\s\S]*?backface-visibility: hidden;/);
  assert.match(styles, /\.flip-dot__face--off\s*\{[\s\S]*?transform: translateZ\(calc\(var\(--dot-depth\) \/ 2\)\);/);
  assert.match(styles, /\.flip-dot__face--on\s*\{[\s\S]*?transform: rotateX\(180deg\) translateZ\(calc\(var\(--dot-depth\) \/ 2\)\);/);
  assert.match(styles, /\.flip-dot__edge\s*\{[\s\S]*?transform: translateY\(-50%\) rotateX\(90deg\);/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.flip-dot__rotor\s*\{[\s\S]*?transition-duration: 0s;/);
  assert.doesNotMatch(glyphs, /\bfetch\s*\(|\bXMLHttpRequest\b|https?:\/\//i);
});

test("ships the free local type system used by Flip Dot Weather", async () => {
  const [layout, packageSource, packageLockSource, clock, styles] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../package-lock.json", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/flip-dot-clock.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);
  const packageLock = JSON.parse(packageLockSource);
  const fontPackages = [
    ["@fontsource-variable/oxanium", "Oxanium Variable"],
    ["@fontsource/rajdhani", "Rajdhani"],
    ["@fontsource/ibm-plex-mono", "IBM Plex Mono"],
  ];

  for (const [packageName, family] of fontPackages) {
    assert.ok(packageJson.dependencies?.[packageName], `${packageName} must be a production dependency`);
    assert.ok(
      layout.includes(`"${packageName}/`),
      `${packageName} must be imported so its local font files ship with the app`,
    );
    assert.ok(
      clock.includes(`"${family}"`) || styles.includes(`"${family}"`),
      `${family} must be assigned to Flip Dot Weather typography`,
    );
    assert.equal(
      packageLock.packages?.[`node_modules/${packageName}`]?.license,
      "OFL-1.1",
      `${family} must retain its free SIL Open Font License metadata`,
    );
  }
  assert.doesNotMatch(layout, /https?:\/\/(?:fonts\.googleapis|fonts\.gstatic)\.com/i);
});

test("warms the complete local archive and labels the copy that actually rendered", async () => {
  const [frame, gallery, serviceWorker, manifestSource, artworkSourceModule] = await Promise.all([
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/artworks/manifest.json", import.meta.url), "utf8"),
    import(new URL("../app/data/artwork-copy-source.ts", import.meta.url).href),
  ]);
  const manifest = JSON.parse(manifestSource);
  const versionMatch = serviceWorker.match(
    /const ARTWORK_ARCHIVE_VERSION = "([^"]+)";/,
  );
  const countMatch = serviceWorker.match(/const ARTWORK_ARCHIVE_COUNT = (\d+);/);
  const batchSizeMatch = serviceWorker.match(/const ARTWORK_BATCH_SIZE = (\d+);/);

  assert.ok(versionMatch, "service worker must pin an artwork archive version");
  assert.ok(countMatch, "service worker must pin the complete artwork count");
  assert.ok(batchSizeMatch, "service worker must use an explicit bounded batch size");
  assert.equal(versionMatch[1], manifest.archiveVersion);
  assert.equal(Number(countMatch[1]), 300);
  assert.equal(Number(countMatch[1]), manifest.count);
  assert.equal(manifest.files.length, 300);
  assert.ok(
    Number(batchSizeMatch[1]) >= 1 && Number(batchSizeMatch[1]) <= 8,
    `archive warm batch must stay bounded, received ${batchSizeMatch[1]}`,
  );

  assert.match(serviceWorker, /const MAX_IMAGES = 24;/);
  assert.match(serviceWorker, /manifest\.archiveVersion !== ARTWORK_ARCHIVE_VERSION/);
  assert.match(serviceWorker, /manifest\.count !== ARTWORK_ARCHIVE_COUNT/);
  assert.match(serviceWorker, /manifest\.files\.length !== ARTWORK_ARCHIVE_COUNT/);
  assert.ok(
    serviceWorker.includes('!/^Q\\d+\\.webp$/.test(file)'),
    "service worker must reject malformed artwork filenames",
  );
  assert.match(serviceWorker, /new Set\(files\)\.size !== ARTWORK_ARCHIVE_COUNT/);
  assert.match(serviceWorker, /files\.slice\(index, index \+ ARTWORK_BATCH_SIZE\)/);
  assert.match(serviceWorker, /index \+= ARTWORK_BATCH_SIZE/);
  assert.match(
    serviceWorker,
    /new URL\(`artworks\/\$\{file\}`, self\.registration\.scope\)/,
  );
  assert.match(
    serviceWorker,
    /artworkUrl\.searchParams\.set\("v", ARTWORK_ARCHIVE_VERSION\)/,
  );
  assert.match(
    serviceWorker,
    /self\.addEventListener\("message", \(event\) => \{[\s\S]*?event\.data\?\.type !== FULL_ARCHIVE_CACHE_MESSAGE[\s\S]*?event\.waitUntil\(requestFullArtworkArchiveWarm\(\)\)/,
  );
  assert.match(serviceWorker, /if \(!isLocalArtwork\) await trimCache\(cache, MAX_IMAGES\);/);
  assert.doesNotMatch(serviceWorker, /MAX_ARTWORKS/);
  assert.doesNotMatch(
    serviceWorker,
    /trimCache\(cache,\s*(?:ARTWORK_ARCHIVE_COUNT|isLocalArtwork)/,
  );

  assert.match(
    frame,
    /navigator\.serviceWorker\.ready[\s\S]*?registration\.active\?\.postMessage\(\{ type: FULL_ARCHIVE_CACHE_MESSAGE \}\)/,
  );
  assert.match(frame, /typeof navigator\.storage\?\.persist === "function"/);
  assert.match(frame, /navigator\.storage\.persist\(\)/);
  assert.match(
    frame,
    /navigator\.serviceWorker\.addEventListener\("controllerchange", handleControllerChange\)/,
  );
  assert.match(
    frame,
    /navigator\.serviceWorker\.removeEventListener\("controllerchange", handleControllerChange\)/,
  );

  assert.match(gallery, /if \(cached\) \{[\s\S]*?setArtworks\(cached\.artworks\)/);
  assert.doesNotMatch(gallery, /cached\.artworks\.map/);
  assert.match(gallery, /visibleCopy\.key === visibleCopyKey/);
  assert.match(
    gallery,
    /key=\{visibleCopyKey\}[\s\S]*?onLoad=\{\(event\) => \{[\s\S]*?event\.currentTarget\.currentSrc[\s\S]*?setVisibleCopy\(\{\s*key: visibleCopyKey/,
  );
  const copyLabels = (gallery.match(/"[^"\n]*COPY[^"\n]*"/g) ?? [])
    .map((label) => JSON.parse(label))
    .sort();
  assert.deepEqual(copyLabels, [
    "COMMONS COPY",
    "COPY LOADING",
    "COPY UNAVAILABLE",
    "LOCAL COPY",
  ]);
  assert.doesNotMatch(gallery, /COMMONS LIVE|LOCAL ARCHIVE|HYBRID ARCHIVE/);

  const { classifyArtworkCopySource } = artworkSourceModule;
  const pageUrl = "https://joansterjo-celonis.github.io/Screensaver/";
  assert.equal(
    classifyArtworkCopySource(
      `artworks/Q12418.webp?v=${manifest.archiveVersion}`,
      pageUrl,
    ),
    "local",
  );
  assert.equal(
    classifyArtworkCopySource(
      `/Screensaver/artworks/Q12418.webp?v=${manifest.archiveVersion}`,
      pageUrl,
    ),
    "local",
  );
  assert.equal(
    classifyArtworkCopySource(
      `https://joansterjo-celonis.github.io/Screensaver/artworks/Q12418.webp?v=${manifest.archiveVersion}`,
      pageUrl,
    ),
    "local",
  );
  assert.equal(
    classifyArtworkCopySource(
      "https://commons.wikimedia.org/wiki/Special:Redirect/file/Mona_Lisa.jpg?width=2800",
      pageUrl,
    ),
    "commons",
  );
  assert.equal(
    classifyArtworkCopySource(
      "https://upload.wikimedia.org/wikipedia/commons/6/6a/Mona_Lisa.jpg",
      pageUrl,
    ),
    "commons",
  );
  assert.equal(
    classifyArtworkCopySource("https://example.com/Mona_Lisa.webp", pageUrl),
    null,
  );
});

test("pins and warms the complete Posterjo archive in its own cache", async () => {
  const [frame, serviceWorker, manifestSource] = await Promise.all([
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/posterjo/manifest.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  const versionMatch = serviceWorker.match(
    /const POSTERJO_ARCHIVE_VERSION = "([^"]+)";/,
  );
  const countMatch = serviceWorker.match(/const POSTERJO_ARCHIVE_COUNT = (\d+);/);
  const batchSizeMatch = serviceWorker.match(/const POSTERJO_BATCH_SIZE = (\d+);/);

  assert.ok(versionMatch, "service worker must pin a Posterjo archive version");
  assert.ok(countMatch, "service worker must pin the complete Posterjo count");
  assert.ok(batchSizeMatch, "service worker must bound Posterjo warming batches");
  assert.equal(versionMatch[1], manifest.archiveVersion);
  assert.equal(Number(countMatch[1]), manifest.count);
  assert.ok(manifest.count > 0, "Posterjo must ship at least one qualifying 4K attachment");
  assert.equal(manifest.files.length, manifest.count);
  assert.equal(String(manifest.cutoff?.shotId), "9201225");
  assert.equal(manifest.cutoff?.inclusive, true);
  assert.ok(
    Number(batchSizeMatch[1]) >= 1 && Number(batchSizeMatch[1]) <= 8,
    `Posterjo archive warm batch must stay bounded, received ${batchSizeMatch[1]}`,
  );

  assert.ok(
    serviceWorker.includes(
      'const POSTERJO_CACHE = `always-on-frame-posterjo-${POSTERJO_ARCHIVE_VERSION}`;',
    ),
    "Posterjo must have an archive-versioned cache independent from Swikipedia",
  );
  assert.match(serviceWorker, /manifest\.archiveVersion !== POSTERJO_ARCHIVE_VERSION/);
  assert.match(serviceWorker, /manifest\.count !== POSTERJO_ARCHIVE_COUNT/);
  assert.match(serviceWorker, /manifest\.files\.length !== POSTERJO_ARCHIVE_COUNT/);
  const strictPosterjoPattern =
    '/^posterjo-\\d+-\\d+(?:-[a-f0-9]{12})?\\.webp$/';
  assert.ok(
    serviceWorker.includes(`!${strictPosterjoPattern}.test(file)`),
    "service worker must reject malformed Posterjo filenames",
  );
  assert.ok(
    serviceWorker.split(strictPosterjoPattern).length - 1 >= 2,
    "manifest validation and local-request routing must share the strict Posterjo filename pattern",
  );
  assert.match(serviceWorker, /new Set\(files\)\.size !== POSTERJO_ARCHIVE_COUNT/);
  assert.match(serviceWorker, /files\.slice\(index, index \+ POSTERJO_BATCH_SIZE\)/);
  assert.match(serviceWorker, /index \+= POSTERJO_BATCH_SIZE/);
  assert.match(
    serviceWorker,
    /new URL\(`posterjo\/\$\{file\}`, self\.registration\.scope\)/,
  );
  assert.match(
    serviceWorker,
    /posterjoUrl\.searchParams\.set\("v", POSTERJO_ARCHIVE_VERSION\)/,
  );
  assert.match(
    serviceWorker,
    /event\.data\?\.type !== POSTERJO_ARCHIVE_CACHE_MESSAGE[\s\S]*?event\.waitUntil\(requestPosterjoArchiveWarm\(\)\)/,
  );
  assert.match(
    serviceWorker,
    /if \(isLocalPosterjoUrl\(url\)\)[\s\S]*?caches\.open\(POSTERJO_CACHE\)/,
  );
  assert.match(
    frame,
    /registration\.active\?\.postMessage\(\{\s*type:\s*POSTERJO_ARCHIVE_CACHE_MESSAGE\s*\}\)/,
  );
});

test("resumes the full service-worker archive after a transient artwork failure", async () => {
  const [serviceWorker, manifestSource] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/artworks/manifest.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  const cacheStores = new Map();
  const networkRequests = [];
  const failingFile = manifest.files[Math.floor(manifest.files.length / 2)].file;
  let failOnce = true;

  const requestUrl = (request) =>
    typeof request === "string" ? request : request.url;
  const caches = {
    async open(name) {
      if (!cacheStores.has(name)) {
        const entries = new Map();
        cacheStores.set(name, {
          entries,
          async match(request) {
            return entries.get(requestUrl(request))?.clone();
          },
          async put(request, response) {
            entries.set(requestUrl(request), response.clone());
          },
          async keys() {
            return [...entries.keys()].map((url) => new Request(url));
          },
          async delete(request) {
            return entries.delete(requestUrl(request));
          },
        });
      }
      return cacheStores.get(name);
    },
    async keys() {
      return [...cacheStores.keys()];
    },
    async delete(name) {
      return cacheStores.delete(name);
    },
  };
  const listeners = new Map();
  const scope = "https://example.test/Screensaver/";
  const context = createContext({
    caches,
    fetch: async (request) => {
      const url = requestUrl(request);
      networkRequests.push(url);
      if (url.endsWith("/artworks/manifest.json")) {
        return new Response(manifestSource, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (failOnce && url.includes(`/${failingFile}?`)) {
        return new Response("temporary failure", { status: 503 });
      }
      return new Response("verified artwork bytes", { status: 200 });
    },
    Request,
    Response,
    URL,
    self: {
      registration: { scope },
      location: { origin: new URL(scope).origin },
      clients: { claim: async () => undefined },
      skipWaiting() {},
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
    },
  });

  runInContext(serviceWorker, context);
  await runInContext("requestFullArtworkArchiveWarm()", context);

  const artworkCacheName = `always-on-frame-artworks-${manifest.archiveVersion}`;
  const artworkCache = cacheStores.get(artworkCacheName);
  assert.ok(artworkCache, "the dedicated local artwork cache must be created");
  assert.equal(artworkCache.entries.size, 299, "one failed artwork must not discard 299 successes");

  failOnce = false;
  networkRequests.length = 0;
  await runInContext("requestFullArtworkArchiveWarm()", context);

  assert.equal(artworkCache.entries.size, 300, "a later warm must fill the single remaining gap");
  assert.deepEqual(
    networkRequests.filter((url) => /\/artworks\/Q\d+\.webp\?/.test(url)),
    [`${scope}artworks/${failingFile}?v=${manifest.archiveVersion}`],
    "a resumed warm must download only the missing artwork",
  );
  for (const entry of manifest.files) {
    assert.ok(
      artworkCache.entries.has(`${scope}artworks/${entry.file}?v=${manifest.archiveVersion}`),
      `${entry.qid} must be present under the exact app request URL`,
    );
  }
});

test("resumes the Posterjo service-worker archive after a transient file failure", async () => {
  const [serviceWorker, manifestSource] = await Promise.all([
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/posterjo/manifest.json", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);
  const cacheStores = new Map();
  const networkRequests = [];
  const failingFile = manifest.files[Math.floor(manifest.files.length / 2)].file;
  let failOnce = true;

  const requestUrl = (request) =>
    typeof request === "string" ? request : request.url;
  const caches = {
    async open(name) {
      if (!cacheStores.has(name)) {
        const entries = new Map();
        cacheStores.set(name, {
          entries,
          async match(request) {
            return entries.get(requestUrl(request))?.clone();
          },
          async put(request, response) {
            entries.set(requestUrl(request), response.clone());
          },
          async keys() {
            return [...entries.keys()].map((url) => new Request(url));
          },
          async delete(request) {
            return entries.delete(requestUrl(request));
          },
        });
      }
      return cacheStores.get(name);
    },
    async keys() {
      return [...cacheStores.keys()];
    },
    async delete(name) {
      return cacheStores.delete(name);
    },
  };
  const listeners = new Map();
  const scope = "https://example.test/Screensaver/";
  const context = createContext({
    caches,
    fetch: async (request) => {
      const url = requestUrl(request);
      networkRequests.push(url);
      if (url.endsWith("/posterjo/manifest.json")) {
        return new Response(manifestSource, {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (failOnce && url.includes(`/${failingFile}?`)) {
        return new Response("temporary failure", { status: 503 });
      }
      return new Response("verified Posterjo bytes", { status: 200 });
    },
    Request,
    Response,
    URL,
    self: {
      registration: { scope },
      location: { origin: new URL(scope).origin },
      clients: { claim: async () => undefined },
      skipWaiting() {},
      addEventListener(type, listener) {
        listeners.set(type, listener);
      },
    },
  });

  runInContext(serviceWorker, context);
  await runInContext("requestPosterjoArchiveWarm()", context);

  const posterjoCacheName = `always-on-frame-posterjo-${manifest.archiveVersion}`;
  const posterjoCache = cacheStores.get(posterjoCacheName);
  assert.ok(posterjoCache, "the dedicated Posterjo cache must be created");
  assert.equal(
    posterjoCache.entries.size,
    manifest.count - 1,
    "one failed Posterjo file must not discard successful cache writes",
  );

  failOnce = false;
  networkRequests.length = 0;
  await runInContext("requestPosterjoArchiveWarm()", context);

  assert.equal(
    posterjoCache.entries.size,
    manifest.count,
    "a later Posterjo warm must fill the single remaining gap",
  );
  assert.deepEqual(
    networkRequests.filter((url) =>
      /\/posterjo\/posterjo-\d+-\d+(?:-[a-f0-9]{12})?\.webp\?/.test(url),
    ),
    [`${scope}posterjo/${failingFile}?v=${manifest.archiveVersion}`],
    "a resumed Posterjo warm must download only the missing file",
  );
  for (const entry of manifest.files) {
    assert.ok(
      posterjoCache.entries.has(
        `${scope}posterjo/${entry.file}?v=${manifest.archiveVersion}`,
      ),
      `${entry.id} must be cached under the exact app request URL`,
    );
  }
});

test("bundles an exact high-resolution local fallback for the offline core", async () => {
  const [paintings, manifestSource, builtManifestSource, publicEntries, builtEntries] = await Promise.all([
    readFile(new URL("../app/data/paintings.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/artworks/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/client/artworks/manifest.json", import.meta.url), "utf8"),
    readdir(new URL("../public/artworks/", import.meta.url)),
    readdir(new URL("../dist/client/artworks/", import.meta.url)),
  ]);
  const rows = (paintings.match(/^\s*\["Q\d+".+\],?$/gm) ?? []).map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );
  const manifest = JSON.parse(manifestSource);
  const builtManifest = JSON.parse(builtManifestSource);
  const expectedFiles = rows.filter((row) => row[9]).map((row) => `${row[0]}.webp`).sort();
  const publicFiles = publicEntries.filter((name) => /^Q\d+\.webp$/.test(name)).sort();
  const builtFiles = builtEntries.filter((name) => /^Q\d+\.webp$/.test(name)).sort();

  assert.equal(manifest.version, "wikimedia-2026-07-17-4k1");
  assert.equal(manifest.count, 300);
  assert.equal(manifest.resolution.shortEdgeTarget, 2160);
  assert.equal(manifest.resolution.standardLongEdgeCap, 4096);
  assert.equal(manifest.resolution.panoramicLongEdgeCap, 8192);
  assert.deepEqual(builtManifest, manifest, "built artwork manifest must match its verified source");
  assert.deepEqual(publicFiles, expectedFiles);
  assert.deepEqual(builtFiles, expectedFiles);
  assert.equal(manifest.files.length, 300);
  assert.deepEqual(manifest.files.map((entry) => entry.file).sort(), expectedFiles);
  assert.equal(new Set(manifest.files.map((entry) => entry.sha256)).size, 300);
  assert.ok(
    manifest.files.reduce((total, entry) => total + entry.bytes, 0) < 600 * 1024 * 1024,
    "the local archive must stay below its 600 MiB deployment budget",
  );
  for (const entry of manifest.files) {
    assert.ok(entry.width > 0 && entry.height > 0, `${entry.qid} must have valid dimensions`);
    assert.ok(
      entry.width * entry.height >= 1_000_000,
      `${entry.qid} must retain at least one megapixel locally`,
    );
    assert.ok(entry.bytes > 0, `${entry.qid} must not be empty`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);

    const builtBytes = await readFile(
      new URL(`../dist/client/artworks/${entry.file}`, import.meta.url),
    );
    assert.equal(
      builtBytes.byteLength,
      entry.bytes,
      `${entry.qid} built byte count must match the verified manifest`,
    );
    assert.equal(
      createHash("sha256").update(builtBytes).digest("hex"),
      entry.sha256,
      `${entry.qid} built bytes must match the verified local master`,
    );
  }
});

test("bundles every verified Posterjo 4K file and its generated metadata", async () => {
  const [generatedSource, manifestSource, builtManifestSource, publicEntries, builtEntries] = await Promise.all([
    readFile(new URL("../app/data/posterjo.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/posterjo/manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../dist/client/posterjo/manifest.json", import.meta.url), "utf8"),
    readdir(new URL("../public/posterjo/", import.meta.url)),
    readdir(new URL("../dist/client/posterjo/", import.meta.url)),
  ]);
  const recordsMatch = generatedSource.match(
    /export const POSTERJO_ARTWORKS = (\[[\s\S]*\]) as const satisfies readonly PosterjoArtworkRecord\[\];/,
  );
  const generatedVersionMatch = generatedSource.match(
    /export const POSTERJO_ARCHIVE_VERSION = "([^"]+)";/,
  );
  assert.ok(recordsMatch, "generated Posterjo records must remain machine-verifiable JSON");
  assert.ok(generatedVersionMatch, "generated Posterjo data must pin its archive version");
  const records = JSON.parse(recordsMatch[1]);
  const manifest = JSON.parse(manifestSource);
  const builtManifest = JSON.parse(builtManifestSource);
  const expectedFiles = records.map((record) => {
    assert.match(
      record.file,
      /^posterjo\/posterjo-\d+-\d+(?:-[a-f0-9]{12})?\.webp$/,
    );
    return record.file.slice("posterjo/".length);
  }).sort();
  const publicFiles = publicEntries
    .filter((name) => /^posterjo-\d+-\d+(?:-[a-f0-9]{12})?\.webp$/.test(name))
    .sort();
  const builtFiles = builtEntries
    .filter((name) => /^posterjo-\d+-\d+(?:-[a-f0-9]{12})?\.webp$/.test(name))
    .sort();

  assert.equal(manifest.archiveVersion, generatedVersionMatch[1]);
  assert.equal(manifest.version, manifest.archiveVersion);
  assert.equal(String(manifest.cutoff?.shotId), "9201225");
  assert.equal(manifest.cutoff?.inclusive, true);
  assert.ok(manifest.count > 0);
  assert.equal(manifest.count, records.length);
  assert.equal(manifest.files.length, records.length);
  assert.equal(manifest.resolution.minimumSourceLongEdge, 3_840);
  assert.equal(manifest.resolution.minimumSourcePixels, 3_840 * 2_160);
  assert.equal(manifest.resolution.outputLongEdgeCap, 4_096);
  assert.deepEqual(builtManifest, manifest, "built Posterjo manifest must match its verified source");
  assert.deepEqual(publicFiles, expectedFiles);
  assert.deepEqual(builtFiles, expectedFiles);
  assert.deepEqual(manifest.files.map((entry) => entry.file).sort(), expectedFiles);
  assert.equal(new Set(records.map((record) => record.id)).size, records.length);
  assert.equal(new Set(records.map((record) => record.file)).size, records.length);

  const recordsById = new Map(records.map((record) => [record.id, record]));
  const manifestArchiveBytes = manifest.files.reduce(
    (total, entry) => total + entry.bytes,
    0,
  );
  let builtArchiveBytes = 0;
  assert.ok(manifestArchiveBytes > 0, "Posterjo archive byte total must be positive");

  for (const entry of manifest.files) {
    const record = recordsById.get(entry.id);
    assert.ok(record, `${entry.id} must exist in generated Posterjo data`);
    assert.equal(record.shotId, entry.shotId);
    assert.equal(record.fileId, entry.fileId);
    assert.equal(record.title, entry.title);
    assert.equal(record.description, entry.description);
    assert.equal(record.file, `posterjo/${entry.file}`);
    assert.equal(record.width, entry.width);
    assert.equal(record.height, entry.height);
    assert.equal(record.sourceUrl, entry.source.page);
    assert.equal(record.originalFileName, entry.source.originalFileName);
    assert.ok(record.title.trim().length > 0, `${entry.id} must retain its title`);
    assert.equal(typeof record.description, "string", `${entry.id} must retain its description`);

    assert.match(entry.file, /^posterjo-\d+-\d+(?:-[a-f0-9]{12})?\.webp$/);
    assert.ok(entry.width > 0 && entry.height > 0, `${entry.id} must have valid dimensions`);
    assert.ok(
      Math.max(entry.source.width, entry.source.height) >= 3_840,
      `${entry.id} source must retain a 4K-class long edge`,
    );
    assert.ok(
      entry.source.width * entry.source.height >= 3_840 * 2_160,
      `${entry.id} source must retain at least 4K UHD pixel area`,
    );
    assert.ok(
      Math.max(entry.width, entry.height) >= 3_840 &&
        Math.max(entry.width, entry.height) <= 4_096,
      `${entry.id} output must retain its capped 4K-class long edge`,
    );
    assert.ok(
      Math.abs(
        entry.width / entry.height - entry.source.width / entry.source.height,
      ) <= 0.001,
      `${entry.id} output must preserve its source aspect ratio`,
    );
    assert.ok(entry.bytes > 0, `${entry.id} must not be empty`);
    assert.ok(entry.bytes < 25 * 1024 * 1024, `${entry.id} must stay below 25 MiB`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);

    const builtBytes = await readFile(
      new URL(`../dist/client/posterjo/${entry.file}`, import.meta.url),
    );
    builtArchiveBytes += builtBytes.byteLength;
    assert.equal(
      builtBytes.byteLength,
      entry.bytes,
      `${entry.id} built byte count must match the verified manifest`,
    );
    assert.equal(
      createHash("sha256").update(builtBytes).digest("hex"),
      entry.sha256,
      `${entry.id} built bytes must match the verified local master`,
    );
  }

  assert.equal(
    builtArchiveBytes,
    manifestArchiveBytes,
    "the built Posterjo archive total must exactly match its manifest",
  );
});

test("builds deterministic non-repeating shuffled cycles", async () => {
  const { shuffleWithSeed, shuffledCycle } = await import(
    new URL("../app/shuffle.ts", import.meta.url).href
  );
  const values = Array.from({ length: 300 }, (_, index) => `painting-${index}`);
  const original = [...values];
  const first = shuffleWithSeed(values, "gallery:first");
  const repeated = shuffleWithSeed(values, "gallery:first");
  const different = shuffleWithSeed(values, "gallery:second");

  assert.deepEqual(values, original, "shuffling must not mutate the source collection");
  assert.deepEqual(first, repeated, "the same seed must reproduce the same deck");
  assert.notDeepEqual(first, different, "different page seeds must produce different decks");
  assert.equal(first.length, 300);
  assert.equal(new Set(first).size, 300);
  assert.deepEqual([...first].sort(), [...values].sort());

  const cycles = Array.from({ length: 4 }, (_, cycle) =>
    shuffledCycle(values, "gallery:page-load", cycle),
  );
  for (const [cycle, deck] of cycles.entries()) {
    assert.equal(new Set(deck).size, values.length, `cycle ${cycle} must be a full permutation`);
    assert.deepEqual([...deck].sort(), [...values].sort());
    if (cycle > 0) {
      assert.notDeepEqual(deck, cycles[cycle - 1], "successive cycles must reshuffle");
      assert.notEqual(
        deck[0],
        cycles[cycle - 1].at(-1),
        "a cycle boundary must never repeat the same item immediately",
      );
    }
  }

  assert.deepEqual(shuffleWithSeed([], "empty"), []);
  assert.deepEqual(shuffledCycle(["only"], "single", 9), ["only"]);
});
