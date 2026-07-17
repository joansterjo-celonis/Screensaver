# Always-On Frame

A responsive digital frame with multiple passive display modes. It is designed for a tablet, monitor, TV, or kiosk screen that can remain open for days at a time.

## Modes

- **Signal Field** — a reference-inspired generative composition of glyphs, grids, telemetry, and checkerboard glitches rendered on one canvas.
- **Swikipedia** — a slow gallery of 300 verified public-domain paintings. Metadata and licensing are refreshed from Wikipedia and Wikimedia Commons, then cached locally.

The selected mode is remembered on the device. Press `I` to reopen the frame index, `1` or `2` to switch modes, and `F` to enter fullscreen. Swikipedia also supports left/right clicks, taps, and arrow keys.

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
```

## GitHub Pages

The Pages workflow builds a static export with the `/Screensaver` base path and publishes `dist/client`. Normal local builds keep the Vinext/Sites output intact.

The gallery is intentionally network-resilient: all 300 public-domain paintings ship as optimized local WebP files, while Wikipedia and Wikimedia Commons provide richer metadata and higher-resolution images when available. It keeps stale-good metadata when refreshes fail and only refreshes its API cache once per day.

The bundled archive remains complete whenever the static site host is reachable. The service worker progressively warms the full 300-image archive for network outages while preserving successfully cached paintings on storage-constrained devices.
