import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

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
  const [page, layout, frame, signal, gallery, compositions, compositionLibrary, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/signal-field.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/compositions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/composition-library.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<FrameApp \/>/);
  assert.match(layout, /title: "Always-On Frame"/);
  assert.match(layout, /300 verified public-domain paintings/);
  assert.match(layout, /32 smart editorial compositions/);
  assert.match(frame, /Signal Field/);
  assert.match(frame, /Swikipedia/);
  assert.match(frame, /Composition Atlas/);
  assert.match(frame, /1–3 SELECT/);
  assert.match(frame, /selectMode\("compositions"\)/);
  assert.match(frame, /inert=\{indexOpen\}/);
  assert.match(frame, /paused=\{indexOpen\}/);
  assert.match(frame, /PLATE 003 \/ 300/);
  assert.match(signal, /requestAnimationFrame/);
  assert.match(signal, /cancelAnimationFrame/);
  assert.match(signal, /getBoundingClientRect/);
  assert.match(signal, /ResizeObserver/);
  assert.match(signal, /MAX_CANVAS_PIXELS/);
  assert.match(gallery, /5 \* 60 \* 1000/);
  assert.match(gallery, /clearTimeout/);
  assert.match(compositions, /buildCompositionDeck/);
  assert.match(compositions, /navigateManually/);
  assert.match(compositions, /event\.clientX/);
  assert.match(compositions, /ArrowLeft/);
  assert.match(compositions, /ArrowRight/);
  assert.match(compositions, /clearTimeout/);
  assert.match(compositions, /new Image\(\)/);
  assert.match(compositions, /ResizeObserver/);
  assert.match(compositions, /getBoundingClientRect/);
  assert.match(compositions, /measuredPortalAspect/);
  assert.match(compositions, /image\.dataset\.recovery/);
  assert.match(compositions, /30_000/);
  assert.match(compositions, /composition-art-backdrop/);
  assert.match(compositionLibrary, /COMPOSITION_CYCLE_TIME = 90_000/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});

test("ships the expanded artwork, signal and composition libraries", async () => {
  const [paintings, artworks, signal, gallery, compositions, compositionLibrary, styles] = await Promise.all([
    readFile(new URL("../app/data/paintings.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/data/artworks.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/signal-library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/compositions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/composition-library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const paintingRowLines = paintings.match(/^\s*\["Q\d+".+\],?$/gm) ?? [];
  const paintingRows = paintingRowLines.map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );
  const signalRows = signal.match(/^\s*\{ id: "[^"]+".+draw: [a-zA-Z]+ \},?$/gm) ?? [];
  const responsiveSignalUnits = signal.match(/layoutUnit\(width, height\)/g) ?? [];
  const compositionRowLines = compositionLibrary.match(
    /^\s*\["[^"]+","[^"]+","(?:crown|horizon|shrine|split|cabinet|monolith|ribbon|ledger|radial|folio|bleed)".+\],?$/gm,
  ) ?? [];
  const compositionRows = compositionRowLines.map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );

  assert.equal(paintingRows.length, 300, `expected exactly 300 paintings, found ${paintingRows.length}`);
  assert.equal(new Set(paintingRows.map((row) => row[0])).size, 300, "painting QIDs must be unique");
  assert.equal(new Set(paintingRows.map((row) => row[1])).size, 300, "Wikipedia articles must be unique");
  assert.equal(new Set(paintingRows.map((row) => row[5])).size, 300, "Commons files must be unique");
  for (const row of paintingRows) {
    assert.ok(row[6] * row[7] >= 1_000_000, `${row[0]} must be at least one megapixel`);
    assert.ok(Math.min(row[6], row[7]) >= 750, `${row[0]} must have a 750px short edge`);
  }
  assert.ok(signalRows.length >= 18, `expected at least 18 signal scenes, found ${signalRows.length}`);
  assert.ok(
    responsiveSignalUnits.length >= 18,
    `expected short-edge sizing across the signal library, found ${responsiveSignalUnits.length} uses`,
  );
  assert.match(signal, /function layoutUnit\(width: number, height: number\)/);
  assert.match(signal, /Math\.min\(width, height\)/);
  assert.equal(compositionRows.length, 32, `expected exactly 32 composition recipes, found ${compositionRows.length}`);
  assert.equal(new Set(compositionRows.map((row) => row[0])).size, 32, "composition IDs must be unique");
  assert.equal(new Set(compositionRows.map((row) => row[1])).size, 32, "composition names must be unique");
  assert.ok(new Set(compositionRows.map((row) => row[2])).size >= 10, "composition layouts must span at least ten families");
  assert.ok(new Set(compositionRows.map((row) => row[4])).size >= 8, "composition recipes must use all eight motifs");
  assert.equal(new Set(compositionRows.map((row) => row[5])).size, 4, "composition recipes must use four palettes");
  assert.equal(new Set(compositionRows.map((row) => row[6])).size, 4, "composition headlines must use four source strategies");
  for (const row of compositionRows) {
    assert.match(row[7], /^[TPSLW]+$/, `${row[0]} must declare valid artwork shapes`);
    assert.ok(row[8] > 0, `${row[0]} must declare a positive portal aspect`);
    assert.ok(row[9] >= 0.7 && row[9] <= 1, `${row[0]} must keep a sensible crop-retention floor`);
    assert.ok(row[10] >= 28, `${row[0]} must declare a usable headline limit`);
  }
  assert.match(compositionLibrary, /function candidatePool/);
  assert.match(compositionLibrary, /usedArtists/);
  assert.match(compositionLibrary, /recentArtists\.length > 6/);
  assert.match(compositionLibrary, /minimumCropRetention/);
  assert.match(compositionLibrary, /headlineLength/);
  assert.match(compositionLibrary, /resolutionTarget/);
  assert.match(compositionLibrary, /resolveCompositionObjectFit/);
  assert.match(compositions, /ARTWORK_DATASET_VERSION/);
  assert.match(compositions, /commonsRedirect\(artwork\.fallbackFile, 2400\)/);
  assert.match(compositions, /srcSet=/);
  assert.match(compositions, /composition-navigation-help/);
  assert.match(paintings, /Copyrighted=False \/ Public domain/);
  assert.match(artworks, /ARTWORK_DATASET_VERSION/);
  assert.match(gallery, /gallery-artwork-matte/);
  assert.match(gallery, /figcaption className="gallery-caption"/);
  assert.match(gallery, /current\.height \/ current\.width >= 1\.3/);
  assert.match(gallery, /navigateManually/);
  assert.match(gallery, /event\.clientX/);
  assert.match(gallery, /ArrowLeft/);
  assert.match(gallery, /ArrowRight/);
  assert.doesNotMatch(gallery, /className="gallery-next"/);
  assert.match(styles, /grid-template-rows: minmax\(0, 3fr\) minmax\(0, 2fr\)/);
  assert.match(
    styles,
    /\.portrait-frame\s*\{[\s\S]*?width: 100%;\s*height: 100%;\s*min-width: 0;\s*min-height: 0;/,
  );
  assert.doesNotMatch(styles, /calc\(100s?vh \* 9 \/ 16\)|calc\(100vw \* 16 \/ 9\)/);
  assert.doesNotMatch(styles, /min-width: 280px/);
  assert.match(styles, /@media \(min-aspect-ratio: 4 \/ 3\)/);
  assert.match(
    styles,
    /@media \(min-aspect-ratio: 4 \/ 3\)[\s\S]*?\.gallery-image-stage\s*\{[\s\S]*?position: absolute;[\s\S]*?\.gallery-caption\s*\{[\s\S]*?position: absolute;[\s\S]*?width: min\(100%, 68rem\);/,
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
    /\.gallery-artwork-matte\s*\{[\s\S]*?top: var\(--gallery-header-safe\);\s*right: 0;[\s\S]*?left: 0;[\s\S]*?overflow: visible;/,
  );
  assert.match(
    styles,
    /\.gallery-artwork\s*\{[\s\S]*?width: 100%;\s*height: auto;\s*max-width: none;\s*max-height: none;/,
  );
  assert.match(
    styles,
    /\.gallery-mode\.is-vertical-art \.gallery-artwork-matte\s*\{\s*inset: 0;/,
  );
  assert.match(styles, /\.gallery-mode\.is-vertical-art \.gallery-artwork/);
  assert.match(styles, /object-fit: cover/);
  assert.doesNotMatch(styles, /\.gallery-next/);
  assert.match(styles, /grid-template-rows: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(styles, /\.composition-mode/);
  assert.match(styles, /\.composition-sheet\s*\{[\s\S]*?grid-template-columns: repeat\(24, minmax\(0, 1fr\)\);[\s\S]*?grid-template-rows: repeat\(16, minmax\(0, 1fr\)\);/);
  assert.match(styles, /@media \(max-aspect-ratio: 1 \/ 1\)/);
  assert.match(styles, /@media \(min-aspect-ratio: 21 \/ 9\)/);
  assert.match(styles, /\.composition-shape-t > \.composition-art/);
  assert.match(styles, /\.composition-family-crown|\.composition-family-horizon/);
  assert.match(styles, /\.composition-family-bleed\.composition-variant-d/);
  assert.match(styles, /composition-art-grid/);
  assert.match(styles, /\.composition-art-backdrop/);
  assert.match(styles, /\.composition-sheet\.is-contained \.composition-art-image/);
  assert.match(styles, /composition-cell-field/);
  assert.match(styles, /\.composition-bars\.is-bars/);
  assert.match(styles, /\.composition-bars\.is-ledger/);
  assert.match(styles, /\.composition-family-horizon > \.composition-art/);
  assert.match(styles, /\.composition-family-cabinet > \.composition-art/);
});

test("builds diverse composition decks without unsafe crops or repeats", async () => {
  const [{ buildCompositionDeck, COMPOSITION_COUNT, COMPOSITION_RECIPES, compositionCropRetention, resolveCompositionObjectFit }, paintings] = await Promise.all([
    import(new URL("../app/modes/composition-library.ts", import.meta.url).href),
    readFile(new URL("../app/data/paintings.generated.ts", import.meta.url), "utf8"),
  ]);
  const paintingRows = (paintings.match(/^\s*\["Q\d+".+\],?$/gm) ?? []).map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );
  const artworks = paintingRows.map((row) => ({
    qid: row[0],
    articleTitle: row[1],
    title: row[2],
    artist: row[3],
    year: row[4],
    fallbackFile: row[5],
    width: row[6],
    height: row[7],
    accent: "#6c6550",
    license: "Public domain",
    licenseUrl: "https://commons.wikimedia.org/",
    descriptionUrl: "https://commons.wikimedia.org/",
  }));
  const circulated = new Set();

  for (let seed = 0; seed < 64; seed += 1) {
    const deck = buildCompositionDeck(artworks, `regression:${seed}`);
    assert.equal(deck.length, COMPOSITION_COUNT);
    assert.equal(new Set(deck.map((item) => item.artwork.qid)).size, COMPOSITION_COUNT);
    assert.equal(new Set(deck.map((item) => item.artwork.artist)).size, COMPOSITION_COUNT);
    for (const item of deck) {
      circulated.add(item.artwork.qid);
      assert.ok(
        item.objectFit === "contain" || item.cropRetention >= item.recipe.minimumCropRetention,
        `${item.recipe.id} must not use an unsafe cover crop`,
      );
      for (const portalAspect of [0.5, 1, 2, 4]) {
        const fit = resolveCompositionObjectFit(item.recipe, item.artwork, portalAspect);
        assert.ok(
          fit === "contain" ||
            compositionCropRetention(item.artwork, portalAspect) >= item.recipe.minimumCropRetention,
          `${item.recipe.id} must adapt its fit to the measured portal`,
        );
      }
    }
  }

  const ribbonRecipe = COMPOSITION_RECIPES.find((recipe) => recipe.id === "scanline-strip");
  const horizonRecipe = COMPOSITION_RECIPES.find((recipe) => recipe.id === "horizon-banner");
  const wideArtwork = artworks.find(
    (artwork) => artwork.width / artwork.height > 2.2 && artwork.width / artwork.height < 3,
  );
  const landscapeArtwork = artworks.find(
    (artwork) => artwork.width / artwork.height > 1.3 && artwork.width / artwork.height < 1.6,
  );
  assert.ok(ribbonRecipe && horizonRecipe && wideArtwork && landscapeArtwork);
  assert.equal(resolveCompositionObjectFit(ribbonRecipe, wideArtwork, 1.02), "contain");
  assert.equal(
    resolveCompositionObjectFit(ribbonRecipe, wideArtwork, wideArtwork.width / wideArtwork.height),
    "cover",
  );
  assert.equal(resolveCompositionObjectFit(horizonRecipe, landscapeArtwork, 4.15), "contain");

  assert.ok(circulated.size >= 160, `expected broad collection circulation, found ${circulated.size} paintings`);
});
