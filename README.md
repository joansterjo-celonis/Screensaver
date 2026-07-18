# Always-On Frame

A responsive digital frame with multiple passive display modes. It is designed for a tablet, monitor, TV, or kiosk screen that can remain open for days at a time.

## Modes

- **Signal Field** — a reference-inspired generative composition of glyphs, grids, telemetry, and checkerboard glitches rendered on one canvas.
- **Swikipedia** — a slow gallery of 300 verified public-domain paintings. Metadata and licensing are refreshed from Wikipedia and Wikimedia Commons, then cached locally.
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
npm run artworks:sync
npm run artworks:verify
npm run posterjo:sync
npm run posterjo:verify
```

## GitHub Pages

The Pages workflow builds a static export with the `/Screensaver` base path and publishes `dist/client`. Normal local builds keep the Vinext/Sites output intact.

The galleries are intentionally network-resilient: all 300 public-domain paintings and every verified Posterjo display master ship as optimized local WebP files. Wikipedia and Wikimedia Commons can enrich Swikipedia at runtime, while Posterjo remains entirely local and preserves the metadata extracted from its source shots.

The committed `scripts/data/posterjo-inventory.json` snapshot is the reproducible source inventory for the Posterjo build. It is ordered from newest to oldest and ends at `newgen posterjo #1`, inclusively.

The service worker progressively warms each archive for network outages while preserving successfully cached files on storage-constrained devices. Posterjo warming begins when that mode is selected so it does not compete with Swikipedia on devices with limited storage.
