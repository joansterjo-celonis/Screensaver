import assert from "node:assert/strict";
import { access, readFile, readdir } from "node:fs/promises";
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
  assert.match(compositions, /remoteReady/);
  assert.match(compositions, /30_000/);
  assert.match(compositions, /composition-art-backdrop/);
  assert.match(compositionLibrary, /COMPOSITION_CYCLE_TIME = 90_000/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});

test("ships the expanded artwork, signal and composition libraries", async () => {
  const [paintings, artworks, frame, signal, gallery, compositions, compositionLibrary, compositionModule, styles, serviceWorker] = await Promise.all([
    readFile(new URL("../app/data/paintings.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/data/artworks.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/signal-library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/compositions.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/composition-library.ts", import.meta.url), "utf8"),
    import(new URL("../app/modes/composition-library.ts", import.meta.url).href),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  const paintingRowLines = paintings.match(/^\s*\["Q\d+".+\],?$/gm) ?? [];
  const paintingRows = paintingRowLines.map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );
  const signalRows = signal.match(/^\s*\{ id: "[^"]+".+draw: [a-zA-Z]+ \},?$/gm) ?? [];
  const responsiveSignalUnits = signal.match(/layoutUnit\(width, height\)/g) ?? [];
  const { COMPOSITION_RECIPES } = compositionModule;

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
  assert.equal(COMPOSITION_RECIPES.length, 32, `expected exactly 32 composition recipes, found ${COMPOSITION_RECIPES.length}`);
  for (const [property, label] of [
    ["id", "IDs"],
    ["name", "names"],
    ["artworkQid", "artwork QIDs"],
    ["motif", "semantic motifs"],
  ]) {
    assert.equal(
      new Set(COMPOSITION_RECIPES.map((recipe) => recipe[property])).size,
      32,
      `composition ${label} must be unique`,
    );
  }
  const paintingQids = new Set(paintingRows.map((row) => row[0]));
  for (const recipe of COMPOSITION_RECIPES) {
    assert.ok(paintingQids.has(recipe.artworkQid), `${recipe.id} must reference a bundled artwork`);
  }
  assert.equal(new Set(COMPOSITION_RECIPES.map((recipe) => recipe.palette)).size, 6, "compositions must use all six palettes");
  assert.equal(new Set(COMPOSITION_RECIPES.map((recipe) => recipe.surface)).size, 6, "compositions must use all six print surfaces");
  assert.equal(new Set(COMPOSITION_RECIPES.map((recipe) => recipe.titleMode)).size, 6, "compositions must use all six title treatments");
  assert.equal(new Set(COMPOSITION_RECIPES.map((recipe) => recipe.artTreatment)).size, 6, "compositions must use all six artwork treatments");
  assert.match(compositionLibrary, /artworkQid/);
  assert.match(compositionLibrary, /CompositionGeometry/);
  assert.match(compositionLibrary, /compositionArtCoverage/);
  assert.match(compositionLibrary, /minimumCropRetention/);
  assert.match(compositionLibrary, /resolveCompositionObjectFit/);
  assert.match(compositions, /ARTWORK_DATASET_VERSION/);
  assert.match(compositions, /const compositionImageUrl = useRemoteImage/);
  assert.match(compositions, /srcSet=/);
  assert.match(
    compositions,
    /const localPreloader = new Image\(\);[\s\S]*?localPreloader\.src = localArtworkUrl\(adjacent\.artwork\.qid\);[\s\S]*?const remotePreloader = new Image\(\);/,
  );
  assert.match(compositions, /commonsRedirect\(adjacent\.artwork\.fallbackFile, 4096\)/);
  assert.match(compositions, /commonsRedirect\(artwork\.fallbackFile, 4096\)/);
  assert.match(compositions, /remotePreloader\.onload/);
  assert.match(compositions, /function CompositionMark/);
  assert.match(compositions, /composition-motif-\$\{recipe\.motif\}/);
  assert.match(compositions, /data-theme=\{recipe\.theme\}/);
  assert.match(compositions, /recipe\.motifLabel/);
  assert.match(compositions, /composition-navigation-help/);
  assert.match(paintings, /Copyrighted=False \/ Public domain/);
  assert.match(artworks, /ARTWORK_DATASET_VERSION/);
  assert.match(artworks, /LOCAL_ARTWORK_ARCHIVE_VERSION = "wikimedia-2026-07-17-4k1"/);
  assert.match(artworks, /imageUrl: localArtworkUrl\(seed\.qid\)/);
  assert.match(artworks, /import\.meta\.env\.BASE_URL/);
  assert.equal(frame.match(/localArtworkUrl\("Q474338"\)/g)?.length, 2);
  assert.match(frame, /serviceWorker[\s\S]*?register\(publicAssetUrl\("sw\.js"\), \{ scope: import\.meta\.env\.BASE_URL \}\)/);
  assert.match(gallery, /const sourceFiles = resolvedPages\.map\(\(\{ seed \}\) => seed\.fallbackFile\)/);
  assert.match(gallery, /cached\.artworks\.map\(\(artwork\) => \(\{[\s\S]*?imageUrl: localArtworkUrl\(artwork\.qid\)/);
  assert.match(gallery, /const fallbackUrl = localArtworkUrl\(current\.qid\)/);
  assert.match(gallery, /HYBRID ARCHIVE/);
  assert.match(serviceWorker, /always-on-frame-artworks-wikimedia-2026-07-17-4k1/);
  assert.match(serviceWorker, /const MAX_ARTWORKS = 48/);
  assert.match(serviceWorker, /isLocalArtwork \? ARTWORK_CACHE : IMAGE_CACHE/);
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
  assert.match(styles, /\.composition-art-backdrop/);
  assert.doesNotMatch(styles, /\.composition-panel\b/);
  assert.doesNotMatch(compositions, /composition-panel\b/);
  assert.match(styles, /\.composition-sheet::before/);
  assert.match(styles, /\.composition-sheet::after/);
  assert.match(styles, /repeating-radial-gradient/);
  assert.match(styles, /repeating-linear-gradient/);
  assert.match(styles, /mix-blend-mode: soft-light/);
  assert.match(styles, /--composition-grain/);
  for (const surface of new Set(COMPOSITION_RECIPES.map((recipe) => recipe.surface))) {
    assert.match(styles, new RegExp(`\\.composition-surface-${surface}\\b`));
  }
  for (const motif of COMPOSITION_RECIPES.map((recipe) => recipe.motif)) {
    const contextualSelectors = styles.match(
      new RegExp(`\\.composition-motif-${motif}\\b`, "g"),
    ) ?? [];
    assert.ok(
      contextualSelectors.length >= 3,
      `${motif} must have multiple contextual mark treatments`,
    );
  }
  const portraitMediaStart = styles.indexOf("@media (max-aspect-ratio: 5 / 4)");
  assert.notEqual(portraitMediaStart, -1, "compositions must switch to authored portrait geometry at 5:4");
  const nextMediaStart = styles.indexOf("@media", portraitMediaStart + 7);
  const portraitMedia = styles.slice(
    portraitMediaStart,
    nextMediaStart === -1 ? styles.length : nextMediaStart,
  );
  for (const region of ["art", "heading", "motif", "details"]) {
    for (const axis of ["x", "y", "w", "h"]) {
      assert.match(
        portraitMedia,
        new RegExp(`var\\(--portrait-${region}-${axis},\\s*var\\(--${region}-${axis}\\)\\)`),
        `portrait ${region} geometry must resolve its ${axis} coordinate`,
      );
    }
  }
});

test("bundles an exact high-resolution local fallback for every painting", async () => {
  const [paintings, manifestSource, publicEntries, builtEntries] = await Promise.all([
    readFile(new URL("../app/data/paintings.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/artworks/manifest.json", import.meta.url), "utf8"),
    readdir(new URL("../public/artworks/", import.meta.url)),
    readdir(new URL("../dist/client/artworks/", import.meta.url)),
  ]);
  const rows = (paintings.match(/^\s*\["Q\d+".+\],?$/gm) ?? []).map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );
  const manifest = JSON.parse(manifestSource);
  const expectedFiles = rows.map((row) => `${row[0]}.webp`).sort();
  const publicFiles = publicEntries.filter((name) => /^Q\d+\.webp$/.test(name)).sort();
  const builtFiles = builtEntries.filter((name) => /^Q\d+\.webp$/.test(name)).sort();

  assert.equal(manifest.version, "wikimedia-2026-07-17-4k1");
  assert.equal(manifest.count, 300);
  assert.equal(manifest.resolution.shortEdgeTarget, 2160);
  assert.equal(manifest.resolution.standardLongEdgeCap, 4096);
  assert.equal(manifest.resolution.panoramicLongEdgeCap, 8192);
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
    assert.ok(entry.bytes > 0, `${entry.qid} must not be empty`);
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
  }
});

test("builds the fixed curated composition deck with bounded geometry and safe crops", async () => {
  const [{ buildCompositionDeck, COMPOSITION_COUNT, COMPOSITION_RECIPES, compositionArtCoverage, compositionCropRetention, resolveCompositionObjectFit }, paintings] = await Promise.all([
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
  const expectedPairings = COMPOSITION_RECIPES.map((recipe) => [recipe.id, recipe.artworkQid]);
  for (const seed of ["first-light", "midday", "after-dark", "another-year"]) {
    const deck = buildCompositionDeck(artworks, seed);
    assert.equal(deck.length, COMPOSITION_COUNT);
    assert.equal(new Set(deck.map((item) => item.artwork.qid)).size, COMPOSITION_COUNT);
    assert.deepEqual(
      deck.map((item) => [item.recipe.id, item.artwork.qid]),
      expectedPairings,
      "curated recipe-to-artwork pairings must not change with the daily seed",
    );
    for (const item of deck) {
      assert.equal(item.artwork.qid, item.recipe.artworkQid);
      assert.equal(item.focusX, item.recipe.focusX);
      assert.equal(item.focusY, item.recipe.focusY);
      assert.ok(
        item.objectFit === "contain" || item.cropRetention >= item.recipe.minimumCropRetention,
        `${item.recipe.id} must not use an unsafe cover crop`,
      );
      for (const portalAspect of [0.35, 0.5, 0.75, 1, 1.25, 16 / 9, 2.5, 4, 8]) {
        const fit = resolveCompositionObjectFit(item.recipe, item.artwork, portalAspect);
        assert.ok(
          fit === "contain" ||
            compositionCropRetention(item.artwork, portalAspect) >= item.recipe.minimumCropRetention,
          `${item.recipe.id} must adapt its fit to the measured portal`,
        );
        if (item.recipe.artTreatment === "folio" || item.recipe.artTreatment === "scroll") {
          assert.equal(fit, "contain", `${item.recipe.id} must preserve the full composition`);
        }
      }
    }
  }

  const geometryValues = (recipe) =>
    ["landscape", "portrait"].flatMap((orientation) =>
      ["art", "heading", "motif", "details"].flatMap((region) => recipe[orientation][region]),
    );
  const geometrySignatures = new Set(
    COMPOSITION_RECIPES.map((recipe) => geometryValues(recipe).join(",")),
  );
  assert.equal(geometrySignatures.size, 32, "every composition must have a unique authored geometry signature");
  assert.ok(
    new Set(COMPOSITION_RECIPES.map((recipe) => recipe.landscape.art.join(","))).size >= 20,
    "landscape artwork placement must materially vary",
  );
  assert.ok(
    new Set(COMPOSITION_RECIPES.map((recipe) => recipe.portrait.art.join(","))).size >= 16,
    "portrait artwork placement must materially vary",
  );
  let nearestGeometryDistance = Number.POSITIVE_INFINITY;
  for (let leftIndex = 0; leftIndex < COMPOSITION_RECIPES.length; leftIndex += 1) {
    const left = geometryValues(COMPOSITION_RECIPES[leftIndex]);
    for (let rightIndex = leftIndex + 1; rightIndex < COMPOSITION_RECIPES.length; rightIndex += 1) {
      const right = geometryValues(COMPOSITION_RECIPES[rightIndex]);
      const distance = left.reduce((total, value, index) => total + Math.abs(value - right[index]), 0);
      nearestGeometryDistance = Math.min(nearestGeometryDistance, distance);
    }
  }
  assert.ok(nearestGeometryDistance >= 16, `geometry signatures are too similar (${nearestGeometryDistance})`);

  for (const recipe of COMPOSITION_RECIPES) {
    assert.ok(recipe.focusX >= 0 && recipe.focusX <= 100, `${recipe.id} must have a valid horizontal focus`);
    assert.ok(recipe.focusY >= 0 && recipe.focusY <= 100, `${recipe.id} must have a valid vertical focus`);
    assert.ok(
      recipe.minimumCropRetention >= 0.5 && recipe.minimumCropRetention <= 1,
      `${recipe.id} must have a valid crop-retention floor`,
    );
    for (const [orientation, minimumCoverage] of [["landscape", 0.6], ["portrait", 0.64]]) {
      const geometry = recipe[orientation];
      assert.ok(
        compositionArtCoverage(geometry) >= minimumCoverage,
        `${recipe.id} must keep the artwork dominant in ${orientation}`,
      );
      for (const region of ["art", "heading", "motif", "details"]) {
        const [x, y, width, height] = geometry[region];
        assert.ok([x, y, width, height].every(Number.isFinite), `${recipe.id} ${orientation} ${region} must be finite`);
        assert.ok(x >= 0 && y >= 0 && width > 0 && height > 0, `${recipe.id} ${orientation} ${region} must have positive bounds`);
        assert.ok(x + width <= 100 && y + height <= 100, `${recipe.id} ${orientation} ${region} must stay on canvas`);
      }
    }
  }
});
