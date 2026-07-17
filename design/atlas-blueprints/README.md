# Composition Atlas blueprint boards

These four boards are internal design references for the 32 live, responsive
Composition Atlas posters. They establish the visual grammar; the website
rebuilds each diagram as accessible, code-native SVG rather than embedding the
boards.

## Shared grammar

- The painting is the primary field and always occupies most of the canvas.
- Every diagram describes a real compositional idea in its paired painting.
- One measured hairline weight is used for all stroked geometry.
- Filled shapes are flat fields; there are no rough strokes, decorative blobs,
  generic bullseyes, or unmotivated dots.
- Radial lines share one exact origin. Perspective lines share one exact
  vanishing point.
- Paper, ink, accent, and field colors are curated from the paired artwork.
- SVG view boxes preserve their aspect ratio at every display size.

## Boards

1. `board-01-foundations.png`: Torsion / Gaze, Shell Fan, Triptych,
   Convex Mirror, Vanishing Court, Rising Diagonal, Maritime Signal,
   Celestial Current.
2. `board-02-light-landscape.png`: Pearl Orbit, Anatomical Index, Final Tow,
   Fog Register, Orange Signal, Solar Fold, Winter Descent, Pressed Garden.
3. `board-03-measure-perspective.png`: Anamorphic Datum, Measured Motion,
   River Span, Screen Current, Three Measures, Mechanical Sun, Sleep Pressure,
   Perspective Proof.
4. `board-04-tension-identity.png`: Severed Baseline, Two Armies, Petal
   Avalanche, Acid Cabaret, Unstable Table, Falling Sun, Basin Rhythm,
   Name Restored.

## Generation brief

The boards were generated as eight-panel museum-poster blueprint studies: warm
archival paper, dark ink, one painting-derived accent per panel, rigorous
alignment, consistent thin technical rules, occasional solid color fields, and
no artwork reproduction. Each panel was specified by its painting-specific
semantic geometry. Generated lettering is treated only as a visual placeholder;
all production typography is rendered by the application.
