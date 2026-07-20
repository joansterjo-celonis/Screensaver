# Always-On Frame

A responsive digital frame with multiple passive display modes. It is designed for a tablet, monitor, TV, or kiosk screen that can remain open for days at a time.

## Modes

- **Signal Field** — a reference-inspired generative composition of glyphs, grids, telemetry, and checkerboard glitches rendered on one canvas.
- **Swikipedia** — a slow gallery of 2,048 verified public-domain paintings. Per-file licensing and source quality are validated against Wikidata and Wikimedia Commons; Wikipedia descriptions are refreshed lazily and cached locally.
- **Posterjo** — Joan Sterjo’s high-resolution artwork archive. Every composition fills the display edge to edge, with a restrained title and description overlay.

The selected mode is remembered on the device. Press `I` to reopen the frame index, `1`, `2`, or `3` to switch modes, and `F` to enter fullscreen. Swikipedia and Posterjo also support left/right clicks, taps, and arrow keys.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
```

The committed high-resolution artwork archive can be regenerated and integrity-checked with:

```bash
npm run artworks:catalog
npm run artworks:sync
npm run artworks:verify
npm run posterjo:sync
npm run posterjo:verify
```

## GitHub Pages

The Pages workflow builds a static export with the `/Screensaver` base path and publishes `dist/client`. Normal local builds keep the Vinext/Sites output intact.

The galleries are intentionally network-resilient: Swikipedia ships with its original 300-painting offline core as optimized local WebPs, while 1,748 additional paintings use strictly validated high-resolution Commons masters on demand. Viewed remote works are cached progressively without pushing the GitHub Pages deployment beyond its size limit. Posterjo remains entirely local and preserves the metadata extracted from its source shots.

The committed `scripts/data/painting-inventory.json` records the Commons revision, source dimensions, MIME type, SHA-1, public-domain evidence, and selection policy for every Swikipedia work. New additions must have at least a 2,160px short edge and six megapixels, and the catalog builder caps any artist at eight works.

The committed `scripts/data/posterjo-inventory.json` snapshot is the reproducible source inventory for the Posterjo build. It is ordered from newest to oldest and ends at `newgen posterjo #1`, inclusively.

The service worker progressively warms Swikipedia’s 300-work offline core while caching the expanded catalog as it is viewed. It preserves successfully cached files on storage-constrained devices. Posterjo warming begins when that mode is selected so it does not compete with Swikipedia on devices with limited storage.
