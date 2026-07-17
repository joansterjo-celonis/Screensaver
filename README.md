# Always-On Frame

A responsive digital frame with multiple passive display modes. It is designed for a tablet, monitor, TV, or kiosk screen that can remain open for days at a time.

## Modes

- **Signal Field** — a reference-inspired generative composition of glyphs, grids, telemetry, and checkerboard glitches rendered on one canvas.
- **Swikipedia** — a slow gallery of 300 verified public-domain paintings. Metadata and licensing are refreshed from Wikipedia and Wikimedia Commons, then cached locally.
- **Composition Atlas** — 32 responsive editorial systems that intelligently pair paintings with typography, grids, constellations, timelines, and artwork-derived archival data.

The selected mode is remembered on the device. Press `I` to reopen the frame index, `1`, `2`, or `3` to switch modes, and `F` to enter fullscreen. Swikipedia and Composition Atlas also support left/right clicks, taps, and arrow keys.

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

## GitHub Pages

The Pages workflow builds a static export with the `/Screensaver` base path and publishes `dist/client`. Normal local builds keep the Vinext/Sites output intact.

The gallery is intentionally network-resilient: it ships with a curated public-domain manifest, keeps stale-good metadata when refreshes fail, and only refreshes its API cache once per day.
