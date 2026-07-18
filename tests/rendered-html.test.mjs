import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

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
  const [page, layout, frame, signal, gallery, posterjo, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/signal-field.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/posterjo.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /<FrameApp \/>/);
  assert.match(layout, /title: "Always-On Frame"/);
  assert.match(layout, /300 verified public-domain paintings/);
  assert.match(frame, /Signal Field/);
  assert.match(frame, /Swikipedia/);
  assert.match(frame, /Posterjo/);
  assert.match(frame, /type ModeId = [^;]*"posterjo"/);
  assert.match(frame, /id: "posterjo"/);
  assert.match(frame, /1–3 SELECT/);
  assert.match(
    frame,
    /if \(key === "3"\)\s*(?:\{\s*)?selectMode\("posterjo"\)/,
  );
  assert.doesNotMatch(layout, /editorial compositions|Composition Atlas/i);
  assert.doesNotMatch(frame, /Composition Atlas|selectMode\("compositions"\)/);
  assert.match(frame, /inert=\{indexOpen\}/);
  assert.match(frame, /paused=\{indexOpen\}/);
  assert.match(frame, /createPageLoadSeed\(\)/);
  assert.match(frame, /shuffleSeed=\{shuffleSeed\}/);
  assert.match(frame, /PLATE 003 \/ 300/);
  assert.match(signal, /requestAnimationFrame/);
  assert.match(signal, /cancelAnimationFrame/);
  assert.match(signal, /getBoundingClientRect/);
  assert.match(signal, /ResizeObserver/);
  assert.match(signal, /MAX_CANVAS_PIXELS/);
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
});

test("ships the expanded artwork and signal libraries", async () => {
  const [paintings, artworks, frame, signal, gallery, styles, serviceWorker] = await Promise.all([
    readFile(new URL("../app/data/paintings.generated.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/data/artworks.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/signal-library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/gallery.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);

  const paintingRowLines = paintings.match(/^\s*\["Q\d+".+\],?$/gm) ?? [];
  const paintingRows = paintingRowLines.map((line) =>
    JSON.parse(line.trim().replace(/,$/, "")),
  );
  const signalRows = signal.match(/^\s*\{ id: "[^"]+".+draw: [a-zA-Z]+ \},?$/gm) ?? [];

  assert.equal(paintingRows.length, 300, `expected exactly 300 paintings, found ${paintingRows.length}`);
  assert.equal(new Set(paintingRows.map((row) => row[0])).size, 300, "painting QIDs must be unique");
  assert.equal(new Set(paintingRows.map((row) => row[1])).size, 300, "Wikipedia articles must be unique");
  assert.equal(new Set(paintingRows.map((row) => row[5])).size, 300, "Commons files must be unique");
  for (const row of paintingRows) {
    assert.ok(row[6] * row[7] >= 1_000_000, `${row[0]} must be at least one megapixel`);
    assert.ok(Math.min(row[6], row[7]) >= 750, `${row[0]} must have a 750px short edge`);
  }
  assert.ok(signalRows.length >= 18, `expected at least 18 signal scenes, found ${signalRows.length}`);
  assert.match(paintings, /Copyrighted=False \/ Public domain/);
  assert.match(artworks, /ARTWORK_DATASET_VERSION/);
  assert.match(artworks, /LOCAL_ARTWORK_ARCHIVE_VERSION = "wikimedia-2026-07-17-4k1"/);
  assert.match(artworks, /imageUrl: localArtworkUrl\(seed\.qid\)/);
  assert.match(artworks, /import\.meta\.env\.BASE_URL/);
  assert.match(frame, /localArtworkUrl\("Q474338"\)/);
  assert.match(frame, /serviceWorker[\s\S]*?register\(publicAssetUrl\("sw\.js"\), \{ scope: import\.meta\.env\.BASE_URL \}\)/);
  assert.match(gallery, /const sourceFiles = resolvedPages\.map\(\(\{ seed \}\) => seed\.fallbackFile\)/);
  assert.match(gallery, /const fallbackUrl = localArtworkUrl\(current\.qid\)/);
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
  assert.doesNotMatch(
    styles,
    /@media \(min-aspect-ratio: 4 \/ 3\)[\s\S]*?\.gallery-caption\s*\{[\s\S]*?position:/,
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

  assert.equal(paintings.length, 300);
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

test("keeps Signal Field geometry deterministic across display shapes", async () => {
  const signalGridModule = await import(
    new URL("../app/modes/signal-grid.ts", import.meta.url).href
  );
  const {
    buildCellFlipPlan,
    cellFlipProgress,
    classifySignalViewport,
    fitCellGrid,
    quantizeSignalCellState,
    quantizeSignalTime,
    resolveBackingStore,
    resolveSignalHeaderLayout,
    resolveSignalLayout,
    signalConfidence,
    signalWeight,
  } = signalGridModule.default ?? signalGridModule;
  const viewports = [
    { width: 3440, height: 1440, profile: "wide" },
    { width: 1920, height: 1080, profile: "standard" },
    { width: 1080, height: 1920, profile: "portrait" },
    { width: 1280, height: 480, profile: "short" },
  ];
  const epsilon = 0.000_001;

  for (const viewport of viewports) {
    const { width, height, profile } = viewport;
    assert.equal(classifySignalViewport(width, height), profile);
    const layout = resolveSignalLayout(width, height);
    assert.equal(layout.profile, profile);
    assert.equal(layout.viewportWidth, width);
    assert.equal(layout.viewportHeight, height);
    assert.equal(layout.shortAxisCells, 48);
    assert.equal(Math.min(layout.columns, layout.rows), 48);
    for (const value of [
      layout.cellSize,
      layout.gridWidth,
      layout.gridHeight,
      layout.originX,
      layout.originY,
      layout.bounds.x,
      layout.bounds.y,
      layout.bounds.width,
      layout.bounds.height,
    ]) {
      assert.ok(Number.isFinite(value), `${width}×${height} layout values must be finite`);
    }
    assert.ok(layout.cellSize > 0);
    assert.ok(layout.columns >= 48 && layout.rows >= 48);
    assert.ok(Math.abs(layout.gridWidth - layout.columns * layout.cellSize) <= epsilon);
    assert.ok(Math.abs(layout.gridHeight - layout.rows * layout.cellSize) <= epsilon);
    assert.ok(
      Math.abs(Math.min(layout.gridWidth, layout.gridHeight) - Math.min(width, height)) <= epsilon,
    );
    assert.ok(Math.abs(layout.originX * 2 + layout.gridWidth - width) <= epsilon);
    assert.ok(Math.abs(layout.originY * 2 + layout.gridHeight - height) <= epsilon);
    assert.ok(layout.originX >= -epsilon && layout.originY >= -epsilon);
    assert.ok(layout.originX + layout.gridWidth <= width + epsilon);
    assert.ok(layout.originY + layout.gridHeight <= height + epsilon);
    assert.ok(layout.bounds.width > 0 && layout.bounds.height > 0);
    assert.ok(layout.bounds.x >= -epsilon && layout.bounds.y >= -epsilon);
    assert.ok(layout.bounds.x + layout.bounds.width <= width + epsilon);
    assert.ok(layout.bounds.y + layout.bounds.height <= height + epsilon);

    const singleHeader = resolveSignalHeaderLayout(
      layout,
      layout.cellSize * 8,
      layout.cellSize * 10,
    );
    assert.equal(singleHeader.mode, "single-row");
    assert.ok(singleHeader.left.x < singleHeader.right.x);
    assert.ok(singleHeader.rule.y1 > singleHeader.left.y);
    assert.ok(singleHeader.contentTop > singleHeader.rule.y1);
    const stackedHeader = resolveSignalHeaderLayout(
      layout,
      singleHeader.availableWidth * 0.72,
      singleHeader.availableWidth * 0.72,
    );
    assert.equal(stackedHeader.mode, "stacked");
    assert.ok(stackedHeader.right.y > stackedHeader.left.y);
    assert.ok(stackedHeader.rule.y1 > stackedHeader.right.y);
    assert.ok(stackedHeader.contentTop > stackedHeader.rule.y1);

    for (const column of [0, Math.floor(layout.columns / 2), layout.columns]) {
      const snappedX = layout.originX + column * layout.cellSize;
      assert.ok(Number.isFinite(snappedX));
      assert.ok(snappedX >= -epsilon && snappedX <= width + epsilon);
    }
    for (const row of [0, Math.floor(layout.rows / 2), layout.rows]) {
      const snappedY = layout.originY + row * layout.cellSize;
      assert.ok(Number.isFinite(snappedY));
      assert.ok(snappedY >= -epsilon && snappedY <= height + epsilon);
    }

    for (const [columns, rows] of [[26, 42], [12, 8]]) {
      const fitted = fitCellGrid(layout, columns, rows);
      assert.equal(fitted.columns, columns);
      assert.equal(fitted.rows, rows);
      assert.ok(Number.isInteger(fitted.column) && Number.isInteger(fitted.row));
      for (const value of [
        fitted.x,
        fitted.y,
        fitted.width,
        fitted.height,
        fitted.cellSize,
      ]) {
        assert.ok(Number.isFinite(value), `${columns}×${rows} fitted values must be finite`);
      }
      assert.ok(fitted.cellSize > 0 && fitted.width > 0 && fitted.height > 0);
      assert.ok(Math.abs(fitted.width / columns - fitted.cellSize) <= epsilon);
      assert.ok(Math.abs(fitted.height / rows - fitted.cellSize) <= epsilon);
      assert.ok(Math.abs(fitted.x - (layout.originX + fitted.column * layout.cellSize)) <= epsilon);
      assert.ok(Math.abs(fitted.y - (layout.originY + fitted.row * layout.cellSize)) <= epsilon);
      assert.ok(fitted.x >= layout.bounds.x - epsilon);
      assert.ok(fitted.y >= layout.bounds.y - epsilon);
      assert.ok(fitted.x + fitted.width <= layout.bounds.x + layout.bounds.width + epsilon);
      assert.ok(fitted.y + fitted.height <= layout.bounds.y + layout.bounds.height + epsilon);
      const horizontalSlack = layout.bounds.width - fitted.width;
      const verticalSlack = layout.bounds.height - fitted.height;
      assert.ok(
        Math.abs((fitted.x - layout.bounds.x) * 2 - horizontalSlack) <= layout.cellSize + epsilon,
        `${columns}×${rows} grid must remain horizontally centered on ${width}×${height}`,
      );
      assert.ok(
        Math.abs((fitted.y - layout.bounds.y) * 2 - verticalSlack) <= layout.cellSize + epsilon,
        `${columns}×${rows} grid must remain vertically centered on ${width}×${height}`,
      );
    }

    const backing = resolveBackingStore(width, height, 2, 2_200_000);
    assert.ok(Number.isInteger(backing.width) && backing.width > 0);
    assert.ok(Number.isInteger(backing.height) && backing.height > 0);
    assert.ok(Number.isFinite(backing.ratio) && backing.ratio > 0);
    assert.equal(backing.pixelCount, backing.width * backing.height);
    assert.ok(
      backing.pixelCount <= 2_200_000,
      `${width}×${height} backing store exceeds the strict pixel budget`,
    );

    const flipPlan = buildCellFlipPlan(width, height, 73, 240);
    assert.deepEqual(flipPlan, buildCellFlipPlan(width, height, 73, 240));
    assert.notDeepEqual(
      flipPlan.map((cell) => cell.id),
      buildCellFlipPlan(width, height, 74, 240).map((cell) => cell.id),
    );
    assert.ok(flipPlan.length > 1 && flipPlan.length <= 240);
    assert.equal(new Set(flipPlan.map((cell) => cell.id)).size, flipPlan.length);
    assert.equal(new Set(flipPlan.map((cell) => cell.order)).size, flipPlan.length);
    for (const [index, cell] of flipPlan.entries()) {
      assert.ok(Number.isInteger(cell.column) && Number.isInteger(cell.row));
      for (const value of [cell.x, cell.y, cell.width, cell.height, cell.order, cell.threshold]) {
        assert.ok(Number.isFinite(value), `${cell.id} transition geometry must be finite`);
      }
      assert.equal(cell.order, index);
      assert.ok(cell.width > 0 && cell.height > 0);
      assert.ok(Math.abs(cell.width - cell.height) <= epsilon);
      const widthInMasterCells = cell.width / layout.cellSize;
      const columnOnMasterGrid = (cell.x - layout.originX) / layout.cellSize;
      const rowOnMasterGrid = (cell.y - layout.originY) / layout.cellSize;
      assert.ok(
        Math.abs(widthInMasterCells - Math.round(widthInMasterCells)) <= epsilon,
        `${cell.id} width must remain an integer multiple of the shared grid`,
      );
      assert.ok(
        Math.abs(columnOnMasterGrid - Math.round(columnOnMasterGrid)) <= epsilon,
        `${cell.id} x coordinate must align to the shared grid`,
      );
      assert.ok(
        Math.abs(rowOnMasterGrid - Math.round(rowOnMasterGrid)) <= epsilon,
        `${cell.id} y coordinate must align to the shared grid`,
      );
      assert.ok(cell.x >= layout.originX - layout.cellSize - epsilon);
      assert.ok(cell.y >= layout.originY - layout.cellSize - epsilon);
      assert.ok(cell.x <= layout.originX + layout.gridWidth + layout.cellSize + epsilon);
      assert.ok(cell.y <= layout.originY + layout.gridHeight + layout.cellSize + epsilon);
      assert.ok(cell.x < width && cell.x + cell.width > 0);
      assert.ok(cell.y < height && cell.y + cell.height > 0);
      assert.ok(cell.threshold >= 0 && cell.threshold <= 1);
      assert.equal(cellFlipProgress(0, cell), 0);
      assert.equal(cellFlipProgress(1, cell), 1);
      const early = cellFlipProgress(0.25, cell);
      const middle = cellFlipProgress(0.5, cell);
      const late = cellFlipProgress(0.75, cell);
      assert.ok(early >= 0 && early <= middle && middle <= late && late <= 1);
    }
    assert.ok(Math.min(...flipPlan.map((cell) => cell.x)) <= 0);
    assert.ok(Math.min(...flipPlan.map((cell) => cell.y)) <= 0);
    assert.ok(Math.max(...flipPlan.map((cell) => cell.x + cell.width)) >= width);
    assert.ok(Math.max(...flipPlan.map((cell) => cell.y + cell.height)) >= height);
    const middleStates = flipPlan.map((cell) => cellFlipProgress(0.5, cell));
    assert.deepEqual(new Set(middleStates), new Set([0, 1]));
  }

  assert.equal(quantizeSignalTime(0), 0);
  assert.equal(quantizeSignalTime(1), 0);
  assert.equal(quantizeSignalTime(159), 0);
  assert.equal(quantizeSignalTime(160), 160);
  assert.equal(quantizeSignalTime(319), 160);
  assert.equal(quantizeSignalTime(320), 320);
  assert.equal(quantizeSignalTime(Number.NaN), 0);
  assert.equal(quantizeSignalTime(-1), 0);
  let previousConfidence = 1;
  for (const time of [0, 160, 320, 800, 1_600]) {
    const confidence = signalConfidence(time, 1_600);
    assert.ok(Number.isFinite(confidence) && confidence >= 0 && confidence <= 1);
    assert.ok(confidence <= previousConfidence);
    previousConfidence = confidence;
    for (const role of ["primary", "secondary", "tertiary"]) {
      const weight = signalWeight(confidence, role);
      assert.ok(Number.isFinite(weight) && weight >= 100 && weight <= 900);
    }
  }
  for (const role of ["primary", "secondary", "tertiary"]) {
    assert.ok(signalWeight(0, role) < signalWeight(1, role));
  }
  assert.deepEqual(
    [0, 0.2, 0.5, 0.9].map((level) => quantizeSignalCellState(level)),
    ["off", "low", "mid", "on"],
  );
  assert.equal(quantizeSignalCellState(0.5, true), "pattern");
  assert.equal(quantizeSignalCellState(0, true), "outline");
  assert.equal(quantizeSignalCellState(0.7, false, -0.4), "outline");
  assert.equal(quantizeSignalCellState(0.4, false, 0.4), "pattern");
});

test("shuffles every Signal Field scene once per cycle", async () => {
  const [{ shuffledCycle }, signalLibrary, signalField] = await Promise.all([
    import(new URL("../app/shuffle.ts", import.meta.url).href),
    readFile(new URL("../app/modes/signal-library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/signal-field.tsx", import.meta.url), "utf8"),
  ]);
  const SIGNAL_SCENE_COUNT = 18;
  const shuffleSeed = "signal:page-load";
  const sceneIndices = Array.from({ length: SIGNAL_SCENE_COUNT }, (_, index) => index);
  const cycles = Array.from({ length: 4 }, (_, cycle) =>
    shuffledCycle(sceneIndices, shuffleSeed, cycle),
  );

  for (const [cycle, order] of cycles.entries()) {
    assert.equal(order.length, SIGNAL_SCENE_COUNT);
    assert.equal(new Set(order).size, SIGNAL_SCENE_COUNT, `signal cycle ${cycle} must not repeat`);
    assert.deepEqual(
      [...order].sort((left, right) => left - right),
      Array.from({ length: SIGNAL_SCENE_COUNT }, (_, index) => index),
    );
    if (cycle > 0) {
      assert.notDeepEqual(order, cycles[cycle - 1], "successive Signal Field cycles must reshuffle");
      assert.notEqual(order[0], cycles[cycle - 1].at(-1), "Signal Field must not repeat at a cycle boundary");
    }
  }

  assert.match(signalLibrary, /export function resolveSignalSceneIndex\(/);
  assert.match(signalLibrary, /shuffledCycle\(SIGNAL_SCENE_INDICES, shuffleSeed, cycleIndex\)/);
  assert.match(
    signalLibrary,
    /const logicalIndex = rawIndex \+ offset;[\s\S]*?resolveSignalSceneIndex\(logicalIndex, options\.shuffleSeed\)[\s\S]*?resolveSignalSceneIndex\(logicalIndex \+ 1, options\.shuffleSeed\)/,
    "current and next Signal scenes must resolve independent logical deck positions",
  );
  assert.match(signalField, /shuffleSeed: signalShuffleSeed/);
});

test("keeps Signal Field on its discrete grid, typography and transition language", async () => {
  const [signalField, signalLibrary, frame, styles] = await Promise.all([
    readFile(new URL("../app/modes/signal-field.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/modes/signal-library.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/frame-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  const variableFace = [...styles.matchAll(/@font-face\s*\{([^}]+)\}/g)]
    .map((match) => match[1])
    .find((face) => /font-weight:\s*100\s+900\s*;/.test(face));
  assert.ok(variableFace, "Signal Field must declare a 100–900 variable font face");
  const variableFontSource = variableFace.match(
    /src:\s*url\(\s*["']?([^"')]+\.woff2(?:[?#][^"')]*)?)/i,
  )?.[1];
  assert.ok(variableFontSource, "the variable font face must load a local WOFF2 asset");
  assert.doesNotMatch(variableFontSource, /^(?:https?:|data:)/i);
  assert.doesNotMatch(variableFontSource, /(?:^|\/)\.\.(?:\/|$)/);
  const variableFontPath = variableFontSource.split(/[?#]/, 1)[0];
  const variableFontUrl = variableFontPath.startsWith("/")
    ? new URL(`../public/${variableFontPath.slice(1)}`, import.meta.url)
    : new URL(variableFontPath, new URL("../app/globals.css", import.meta.url));
  await access(variableFontUrl);
  const variableFontFamily = variableFace.match(/font-family:\s*["']([^"']+)["']\s*;/)?.[1];
  assert.ok(variableFontFamily, "the variable face must have an explicit family name");
  assert.match(signalLibrary, /\bSIGNAL_FONT_FAMILY\b/);
  assert.ok(
    signalLibrary.includes(variableFontFamily),
    "canvas typography must select the locally declared variable family",
  );
  assert.match(signalField, /document\.fonts\.load\(/);
  assert.match(signalField, /document\.fonts\.ready/);
  for (const face of [
    "GeistSans",
    "GeistMono",
    "GeistPixelSquare",
    "GeistPixelGrid",
    "GeistPixelCircle",
    "GeistPixelTriangle",
    "GeistPixelLine",
  ]) {
    assert.ok(signalField.includes(face), `Signal Field must load ${face}`);
  }
  assert.match(signalField, /configureSignalFontFamilies\(SIGNAL_FONT_MAP\)/);
  assert.doesNotMatch(signalLibrary, /#e34c82|rgba\(227,\s*76,\s*130/);
  assert.match(signalLibrary, /"pixel-square"/);
  assert.match(signalLibrary, /"pixel-grid"/);
  assert.match(signalLibrary, /"pixel-circle"/);
  assert.match(signalLibrary, /"pixel-triangle"/);
  assert.match(signalLibrary, /"pixel-line"/);
  assert.match(signalLibrary, /activeSignalTime/);
  assert.match(signalLibrary, /trackedText/);

  assert.match(signalLibrary, /\bSIGNAL_STATE_INTERVAL\s*=\s*160\b/);
  for (const helper of ["drawSignalCells", "drawDotMatrixValue", "drawCellStrip"]) {
    assert.match(
      signalLibrary,
      new RegExp(`\\b(?:function\\s+|const\\s+)${helper}\\b`),
      `${helper} must make state changes out of discrete cells`,
    );
  }
  assert.match(signalLibrary, /quantizeSignalCellState/);
  assert.match(signalLibrary, /resolveSignalHeaderLayout/);
  assert.match(signalLibrary, /state\?: SignalCellState/);
  for (const state of ["off", "low", "mid", "on", "pattern", "outline"]) {
    assert.ok(signalLibrary.includes(`"${state}"`), `missing Signal cell state: ${state}`);
  }
  assert.ok(
    (signalLibrary.match(/drawSignalCircle\(/g)?.length ?? 0) >= 3,
    "semantic circle instruments must use shared ratio-safe circle geometry",
  );
  assert.ok(
    (signalLibrary.match(/drawSignalEllipse\(/g)?.length ?? 0) >= 2,
    "planetary paths must use shared ratio-safe ellipse geometry",
  );
  for (const marker of [
    "ACQUISITION / LOCK",
    "AMPLITUDE MATRIX / 43",
    "GENERATION DELTA",
    "ESCAPEMENT / COHERENCE",
  ]) {
    assert.ok(signalLibrary.includes(marker), `missing targeted Signal Field marker: ${marker}`);
  }

  assert.match(signalLibrary, /\bbuildCellFlipPlan\b/);
  assert.match(signalLibrary, /\.drawImage\(/);
  const sharedGridCalls = signalLibrary.match(/^\s*drawSharedGrid\(frame\b/gm) ?? [];
  assert.ok(
    sharedGridCalls.length >= 18,
    `all 18 Signal Field scenes must draw the shared grid; found ${sharedGridCalls.length} calls`,
  );
  assert.match(signalLibrary, /\bTRANSITION_PIXEL_BUDGET\s*=\s*2_200_000\b/);
  assert.match(
    signalLibrary,
    /const transitionBufferCache = new WeakMap<CanvasRenderingContext2D, TransitionBuffer>\(\);/,
  );
  assert.equal(
    signalLibrary.match(/\bbuildCellFlipPlan\(/g)?.length,
    1,
    "the flip plan must be built once in the cached transition buffer",
  );
  assert.match(
    signalLibrary,
    /flipPlan:\s*buildCellFlipPlan\(width,\s*height,\s*seed\)[\s\S]*?transitionBufferCache\.set\(context,\s*result\)/,
  );
  assert.match(signalLibrary, /for \(const cell of buffer\.flipPlan\)/);
  assert.match(
    signalLibrary,
    /const switchesOff = cellFlipProgress\([\s\S]*?const switchesOn = cellFlipProgress\(/,
  );
  assert.match(
    signalLibrary,
    /if \(switchesOff === 0\) continue;[\s\S]*?fillRect\([\s\S]*?if \(switchesOn === 0\) continue;[\s\S]*?drawImage\(/,
  );
  assert.match(
    signalLibrary,
    /resolveBackingStore\([\s\S]*?TRANSITION_PIXEL_BUDGET,[\s\S]*?\)\.ratio/,
  );
  assert.match(
    signalLibrary,
    /drawScene\([\s\S]*?context,[\s\S]*?width,[\s\S]*?height,[\s\S]*?info\.sceneIndex,[\s\S]*?localTime,[\s\S]*?duration,[\s\S]*?Boolean\(options\.reducedMotion\),[\s\S]*?\)/,
  );
  assert.match(
    signalLibrary,
    /drawScene\(bufferContext,\s*width,\s*height,\s*sceneIndex,\s*0,\s*duration,\s*true\)/,
  );
  assert.match(signalLibrary, /activeSignalStateProgress = completePropagation[\s\S]*?\? 1/);
  assert.match(signalLibrary, /function propagatedStateTick\(/);
  assert.match(signalLibrary, /signalConfidence\(safeTime,\s*sceneDurationMs\)/);
  assert.doesNotMatch(signalLibrary, /\bsmoothStep\b/);
  assert.doesNotMatch(signalLibrary, /\.clip\(/);
  assert.doesNotMatch(signalLibrary, /\bdrawTransitionBoundary\b/);
  assert.doesNotMatch(signalLibrary, /\browProgress\b/);

  const sceneTableStart = signalLibrary.indexOf("const INTERNAL_SCENES");
  const sceneTableEnd = signalLibrary.indexOf("export const SIGNAL_SCENES", sceneTableStart);
  assert.ok(sceneTableStart >= 0 && sceneTableEnd > sceneTableStart, "signal scene table must remain explicit");
  const sceneIds = [...signalLibrary
    .slice(sceneTableStart, sceneTableEnd)
    .matchAll(/\bid:\s*"([^"]+)"/g)]
    .map((match) => match[1]);
  assert.deepEqual(sceneIds, [
    "orbital-telemetry",
    "constellation-mesh",
    "glyph-cascade",
    "barcode-cathedral",
    "cellular-atlas",
    "packet-river",
    "seismic-field",
    "clockwork-rings",
    "vector-scope",
    "memory-map",
    "waveform-stack",
    "data-loom",
    "hex-field",
    "satellite-topology",
    "archive-index",
    "raster-portrait",
    "checker-error",
    "deep-scan",
  ]);

  const lifeStart = signalLibrary.indexOf("function cellularAtlas");
  const lifeEnd = signalLibrary.indexOf("function packetRiver", lifeStart);
  const lifeScene = signalLibrary.slice(lifeStart, lifeEnd);
  assert.ok(lifeScene.indexOf("chrome(frame") < lifeScene.indexOf("signalContent(frame"));
  assert.doesNotMatch(lifeScene, /const firstRow = 3/);
  assert.match(lifeScene, /"pattern"|quantizeSignalCellState/);
  const voidStart = signalLibrary.indexOf("function deepScan");
  const voidEnd = signalLibrary.indexOf("const INTERNAL_SCENES", voidStart);
  const voidScene = signalLibrary.slice(voidStart, voidEnd);
  assert.match(voidScene, /"VOID"/);
  assert.match(voidScene, /drawDotMatrixValue/);

  const signalPreviewStar = styles.match(/\.signal-preview-star\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.doesNotMatch(signalPreviewStar, /\banimation\s*:/);
  assert.doesNotMatch(styles, /@keyframes\s+rotor\b/);
  assert.doesNotMatch(frame, /signal-preview-rotor/);
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

test("bundles an exact high-resolution local fallback for every painting", async () => {
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
  const expectedFiles = rows.map((row) => `${row[0]}.webp`).sort();
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
