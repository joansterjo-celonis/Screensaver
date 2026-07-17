import type { ArtworkSeed } from "../data/artworks";

export type ArtworkShape = "T" | "P" | "S" | "L" | "W";

export type CompositionPalette =
  | "oxblood"
  | "umber"
  | "carbon"
  | "parchment"
  | "indigo"
  | "verdigris";

export type CompositionSurface =
  | "dry-ink"
  | "fiber"
  | "dust"
  | "halftone"
  | "etched"
  | "washed";

export type CompositionTitleMode =
  | "monumental"
  | "overlay"
  | "margin"
  | "vertical"
  | "banner"
  | "caption";

export type CompositionArtTreatment =
  | "bleed"
  | "portrait-anchor"
  | "cinema"
  | "folio"
  | "scroll"
  | "offset";

export type CompositionMotif =
  | "ermine-arc"
  | "sea-born"
  | "triptych-spill"
  | "convex-witness"
  | "pearl-orbit"
  | "anatomical-index"
  | "vanishing-court"
  | "rising-diagonal"
  | "signal-mast"
  | "final-tow"
  | "fog-register"
  | "orange-signal"
  | "celestial-current"
  | "solar-fold"
  | "winter-descent"
  | "pressed-garden"
  | "anamorphic-datum"
  | "measured-motion"
  | "river-span"
  | "screen-current"
  | "three-measures"
  | "mechanical-sun"
  | "sleep-pressure"
  | "perspective-proof"
  | "severed-baseline"
  | "two-armies"
  | "petal-avalanche"
  | "acid-cabaret"
  | "unstable-table"
  | "falling-sun"
  | "basin-rhythm"
  | "name-restored";

/** Percentage coordinates in the form [x, y, width, height]. */
export type CompositionRect = readonly [number, number, number, number];

export type CompositionGeometry = Readonly<{
  art: CompositionRect;
  heading: CompositionRect;
  motif: CompositionRect;
  details: CompositionRect;
}>;

export type CompositionRecipe = Readonly<{
  id: string;
  name: string;
  artworkQid: string;
  theme: string;
  motif: CompositionMotif;
  motifLabel: string;
  palette: CompositionPalette;
  surface: CompositionSurface;
  titleMode: CompositionTitleMode;
  artTreatment: CompositionArtTreatment;
  focusX: number;
  focusY: number;
  minimumCropRetention: number;
  landscape: CompositionGeometry;
  portrait: CompositionGeometry;
}>;

export type CompositionDeckItem = Readonly<{
  recipe: CompositionRecipe;
  artwork: ArtworkSeed;
  cropRetention: number;
  objectFit: "cover" | "contain";
  focusX: number;
  focusY: number;
}>;

const COMPOSITION_ROWS = [
  {
    id: "ermine-arc",
    name: "Ermine Arc",
    artworkQid: "Q474338",
    theme: "Intelligence Held in Motion",
    motif: "ermine-arc",
    motifLabel: "TORSION / HAND / GAZE",
    palette: "oxblood",
    surface: "dry-ink",
    titleMode: "monumental",
    artTreatment: "portrait-anchor",
    focusX: 54,
    focusY: 35,
    minimumCropRetention: 0.6,
    landscape: { art: [32, 0, 68, 100], heading: [2, 31, 58, 44], motif: [3, 4, 26, 24], details: [2, 81, 30, 13] },
    portrait: { art: [18, 0, 82, 100], heading: [3, 58, 72, 32], motif: [3, 4, 35, 22], details: [4, 91, 76, 7] },
  },
  {
    id: "sea-born",
    name: "Sea Born",
    artworkQid: "Q151047",
    theme: "Marine Geometry",
    motif: "sea-born",
    motifLabel: "FOAM / SHELL / SHORE",
    palette: "parchment",
    surface: "fiber",
    titleMode: "overlay",
    artTreatment: "cinema",
    focusX: 50,
    focusY: 48,
    minimumCropRetention: 0.74,
    landscape: { art: [0, 8, 100, 78], heading: [3, 59, 73, 30], motif: [76, 2, 20, 27], details: [3, 88, 94, 8] },
    portrait: { art: [0, 0, 100, 70], heading: [4, 56, 91, 31], motif: [64, 72, 31, 17], details: [4, 89, 91, 7] },
  },
  {
    id: "triptych-spill",
    name: "Triptych Spill",
    artworkQid: "Q321303",
    theme: "Three Worlds, One Threshold",
    motif: "triptych-spill",
    motifLabel: "EDEN / EARTH / INFERNO",
    palette: "carbon",
    surface: "halftone",
    titleMode: "banner",
    artTreatment: "cinema",
    focusX: 50,
    focusY: 48,
    minimumCropRetention: 0.72,
    landscape: { art: [0, 0, 100, 78], heading: [2, 62, 74, 24], motif: [78, 8, 20, 55], details: [3, 88, 94, 8] },
    portrait: { art: [0, 0, 100, 70], heading: [3, 55, 94, 31], motif: [3, 4, 26, 46], details: [3, 88, 94, 8] },
  },
  {
    id: "convex-witness",
    name: "Convex Witness",
    artworkQid: "Q220859",
    theme: "Domestic Optics",
    motif: "convex-witness",
    motifLabel: "MIRROR / OATH / ROOM",
    palette: "verdigris",
    surface: "etched",
    titleMode: "margin",
    artTreatment: "portrait-anchor",
    focusX: 50,
    focusY: 43,
    minimumCropRetention: 0.62,
    landscape: { art: [0, 0, 64, 100], heading: [52, 55, 45, 32], motif: [67, 5, 29, 42], details: [66, 90, 31, 7] },
    portrait: { art: [0, 0, 82, 100], heading: [38, 61, 59, 30], motif: [67, 4, 29, 37], details: [4, 92, 92, 6] },
  },
  {
    id: "pearl-orbit",
    name: "Pearl Orbit",
    artworkQid: "Q185372",
    theme: "Light as a Satellite",
    motif: "pearl-orbit",
    motifLabel: "LIGHT / TURN / PEARL",
    palette: "indigo",
    surface: "dust",
    titleMode: "monumental",
    artTreatment: "portrait-anchor",
    focusX: 52,
    focusY: 37,
    minimumCropRetention: 0.6,
    landscape: { art: [36, 0, 64, 100], heading: [3, 55, 54, 32], motif: [3, 4, 29, 31], details: [3, 90, 94, 7] },
    portrait: { art: [12, 0, 88, 100], heading: [3, 62, 76, 28], motif: [3, 4, 34, 29], details: [4, 92, 92, 6] },
  },
  {
    id: "anatomical-index",
    name: "Anatomical Index",
    artworkQid: "Q661378",
    theme: "Body as Diagram",
    motif: "anatomical-index",
    motifLabel: "HAND / TENDON / WITNESS",
    palette: "umber",
    surface: "etched",
    titleMode: "caption",
    artTreatment: "bleed",
    focusX: 55,
    focusY: 54,
    minimumCropRetention: 0.68,
    landscape: { art: [0, 0, 100, 74], heading: [3, 57, 65, 29], motif: [69, 50, 28, 37], details: [3, 89, 94, 7] },
    portrait: { art: [0, 0, 100, 69], heading: [4, 52, 91, 34], motif: [4, 7, 37, 31], details: [4, 89, 91, 7] },
  },
  {
    id: "vanishing-court",
    name: "Vanishing Court",
    artworkQid: "Q208758",
    theme: "Witnesses in Perspective",
    motif: "vanishing-court",
    motifLabel: "MIRROR / GAZE / VANISH",
    palette: "carbon",
    surface: "washed",
    titleMode: "vertical",
    artTreatment: "portrait-anchor",
    focusX: 51,
    focusY: 43,
    minimumCropRetention: 0.64,
    landscape: { art: [38, 0, 62, 100], heading: [3, 35, 54, 40], motif: [3, 4, 31, 29], details: [3, 89, 94, 7] },
    portrait: { art: [0, 0, 82, 100], heading: [38, 57, 59, 33], motif: [68, 5, 28, 38], details: [3, 92, 94, 6] },
  },
  {
    id: "rising-diagonal",
    name: "Rising Diagonal",
    artworkQid: "Q29530",
    theme: "Revolution Ascending",
    motif: "rising-diagonal",
    motifLabel: "CROWD / FLAG / ASCENT",
    palette: "oxblood",
    surface: "dry-ink",
    titleMode: "overlay",
    artTreatment: "bleed",
    focusX: 54,
    focusY: 40,
    minimumCropRetention: 0.68,
    landscape: { art: [0, 0, 100, 78], heading: [3, 58, 64, 30], motif: [68, 2, 29, 31], details: [3, 89, 94, 7] },
    portrait: { art: [0, 0, 100, 70], heading: [4, 54, 92, 34], motif: [61, 3, 35, 32], details: [4, 90, 92, 6] },
  },
  {
    id: "signal-mast",
    name: "Signal Mast",
    artworkQid: "Q212616",
    theme: "Survival by Diagonal",
    motif: "signal-mast",
    motifLabel: "RAFT / WAVE / SIGNAL",
    palette: "umber",
    surface: "fiber",
    titleMode: "margin",
    artTreatment: "bleed",
    focusX: 60,
    focusY: 45,
    minimumCropRetention: 0.64,
    landscape: { art: [0, 0, 100, 82], heading: [2, 61, 57, 30], motif: [58, 3, 39, 47], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 100, 72], heading: [3, 53, 92, 34], motif: [52, 4, 44, 38], details: [4, 90, 91, 7] },
  },
  {
    id: "final-tow",
    name: "Final Tow",
    artworkQid: "Q257580",
    theme: "Last Light, Final Passage",
    motif: "final-tow",
    motifLabel: "EMBER / WAKE / TOW",
    palette: "indigo",
    surface: "washed",
    titleMode: "banner",
    artTreatment: "cinema",
    focusX: 57,
    focusY: 51,
    minimumCropRetention: 0.72,
    landscape: { art: [0, 13, 100, 72], heading: [2, 2, 61, 22], motif: [67, 3, 30, 27], details: [3, 88, 94, 8] },
    portrait: { art: [0, 0, 100, 68], heading: [4, 56, 91, 31], motif: [55, 71, 40, 17], details: [4, 90, 91, 7] },
  },
  {
    id: "fog-register",
    name: "Fog Register",
    artworkQid: "Q311243",
    theme: "Altitude Without Horizon",
    motif: "fog-register",
    motifLabel: "FIGURE / RIDGE / VOID",
    palette: "verdigris",
    surface: "dust",
    titleMode: "monumental",
    artTreatment: "portrait-anchor",
    focusX: 50,
    focusY: 46,
    minimumCropRetention: 0.58,
    landscape: { art: [32, 0, 68, 100], heading: [3, 51, 51, 36], motif: [3, 4, 25, 35], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 82, 100], heading: [36, 58, 61, 31], motif: [65, 4, 31, 41], details: [3, 92, 94, 6] },
  },
  {
    id: "orange-signal",
    name: "Orange Signal",
    artworkQid: "Q328523",
    theme: "A Sun Reduced to Signal",
    motif: "orange-signal",
    motifLabel: "SUN / HARBOR / TRACE",
    palette: "carbon",
    surface: "halftone",
    titleMode: "caption",
    artTreatment: "bleed",
    focusX: 34,
    focusY: 48,
    minimumCropRetention: 0.7,
    landscape: { art: [0, 0, 100, 75], heading: [3, 57, 62, 28], motif: [68, 49, 28, 36], details: [3, 88, 94, 8] },
    portrait: { art: [0, 0, 100, 68], heading: [3, 54, 93, 32], motif: [4, 4, 33, 24], details: [4, 90, 91, 7] },
  },
  {
    id: "celestial-current",
    name: "Celestial Current",
    artworkQid: "Q45585",
    theme: "Sky in Circulation",
    motif: "celestial-current",
    motifLabel: "CYPRESS / STAR / CURRENT",
    palette: "indigo",
    surface: "dry-ink",
    titleMode: "overlay",
    artTreatment: "bleed",
    focusX: 48,
    focusY: 39,
    minimumCropRetention: 0.68,
    landscape: { art: [0, 0, 100, 83], heading: [3, 60, 61, 29], motif: [69, 4, 27, 38], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 100, 72], heading: [4, 54, 91, 34], motif: [56, 3, 40, 31], details: [4, 90, 92, 6] },
  },
  {
    id: "solar-fold",
    name: "Solar Fold",
    artworkQid: "Q846213",
    theme: "Heat Folded into Form",
    motif: "solar-fold",
    motifLabel: "HEAT / CLOTH / SLEEP",
    palette: "parchment",
    surface: "fiber",
    titleMode: "vertical",
    artTreatment: "offset",
    focusX: 51,
    focusY: 49,
    minimumCropRetention: 0.76,
    landscape: { art: [26, 0, 74, 100], heading: [2, 58, 48, 31], motif: [3, 4, 20, 36], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 100, 79], heading: [4, 62, 91, 28], motif: [4, 4, 31, 27], details: [4, 92, 91, 6] },
  },
  {
    id: "winter-descent",
    name: "Winter Descent",
    artworkQid: "Q500985",
    theme: "Winter's Human Vector",
    motif: "winter-descent",
    motifLabel: "HUNTERS / SLOPE / VALLEY",
    palette: "verdigris",
    surface: "etched",
    titleMode: "banner",
    artTreatment: "bleed",
    focusX: 48,
    focusY: 48,
    minimumCropRetention: 0.72,
    landscape: { art: [0, 0, 100, 80], heading: [3, 62, 69, 26], motif: [74, 6, 23, 42], details: [3, 90, 94, 7] },
    portrait: { art: [0, 0, 100, 70], heading: [4, 54, 91, 34], motif: [58, 4, 38, 32], details: [4, 90, 92, 6] },
  },
  {
    id: "pressed-garden",
    name: "Pressed Garden",
    artworkQid: "Q463392",
    theme: "An Enclosed Living Index",
    motif: "pressed-garden",
    motifLabel: "WALL / PETAL / CREATURE",
    palette: "parchment",
    surface: "etched",
    titleMode: "margin",
    artTreatment: "folio",
    focusX: 50,
    focusY: 48,
    minimumCropRetention: 0.9,
    landscape: { art: [0, 0, 100, 79], heading: [2, 60, 65, 28], motif: [70, 4, 27, 48], details: [3, 90, 94, 7] },
    portrait: { art: [0, 0, 100, 70], heading: [3, 54, 94, 34], motif: [3, 4, 31, 37], details: [3, 90, 94, 7] },
  },
  {
    id: "anamorphic-datum",
    name: "Anamorphic Datum",
    artworkQid: "Q1212937",
    theme: "Truth at an Angle",
    motif: "anamorphic-datum",
    motifLabel: "GLOBE / STRING / SKEW",
    palette: "carbon",
    surface: "halftone",
    titleMode: "monumental",
    artTreatment: "offset",
    focusX: 50,
    focusY: 47,
    minimumCropRetention: 0.72,
    landscape: { art: [21, 0, 79, 100], heading: [3, 53, 47, 35], motif: [3, 3, 26, 44], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 100, 82], heading: [3, 63, 91, 27], motif: [4, 3, 28, 32], details: [4, 92, 91, 6] },
  },
  {
    id: "measured-motion",
    name: "Measured Motion",
    artworkQid: "Q3012259",
    theme: "Anatomy of a Horse",
    motif: "measured-motion",
    motifLabel: "WITHERS / STRIDE / AIR",
    palette: "umber",
    surface: "washed",
    titleMode: "vertical",
    artTreatment: "portrait-anchor",
    focusX: 50,
    focusY: 47,
    minimumCropRetention: 0.62,
    landscape: { art: [0, 0, 66, 100], heading: [49, 56, 48, 32], motif: [69, 3, 27, 47], details: [68, 90, 29, 7] },
    portrait: { art: [0, 0, 88, 100], heading: [40, 59, 57, 31], motif: [69, 4, 27, 41], details: [4, 92, 92, 6] },
  },
  {
    id: "river-span",
    name: "River Span",
    artworkQid: "Q24283",
    theme: "Passage Through Landscape",
    motif: "river-span",
    motifLabel: "ARCH / CURRENT / DISTANCE",
    palette: "parchment",
    surface: "fiber",
    titleMode: "banner",
    artTreatment: "cinema",
    focusX: 64,
    focusY: 55,
    minimumCropRetention: 0.58,
    landscape: { art: [0, 0, 84, 100], heading: [3, 3, 58, 25], motif: [61, 3, 36, 24], details: [84, 70, 14, 24] },
    portrait: { art: [0, 0, 100, 64], heading: [4, 61, 92, 28], motif: [64, 4, 32, 22], details: [4, 91, 92, 6] },
  },
  {
    id: "screen-current",
    name: "Screen Current",
    artworkQid: "Q28154824",
    theme: "Two Trees, One Current",
    motif: "screen-current",
    motifLabel: "PLUM / STREAM / SCREEN",
    palette: "verdigris",
    surface: "washed",
    titleMode: "caption",
    artTreatment: "scroll",
    focusX: 50,
    focusY: 48,
    minimumCropRetention: 0.94,
    landscape: { art: [0, 7, 100, 76], heading: [3, 67, 61, 22], motif: [68, 3, 29, 29], details: [3, 91, 94, 6] },
    portrait: { art: [0, 4, 100, 66], heading: [3, 58, 93, 27], motif: [4, 73, 43, 15], details: [4, 92, 91, 6] },
  },
  {
    id: "three-measures",
    name: "Three Measures",
    artworkQid: "Q3873328",
    theme: "Time, Matter, Extinction",
    motif: "three-measures",
    motifLabel: "TULIP / HOUR / BONE",
    palette: "oxblood",
    surface: "dry-ink",
    titleMode: "margin",
    artTreatment: "offset",
    focusX: 50,
    focusY: 50,
    minimumCropRetention: 0.68,
    landscape: { art: [0, 0, 70, 100], heading: [53, 57, 44, 31], motif: [73, 4, 24, 43], details: [72, 91, 25, 6] },
    portrait: { art: [0, 0, 100, 72], heading: [4, 55, 91, 34], motif: [63, 3, 33, 29], details: [4, 91, 92, 6] },
  },
  {
    id: "mechanical-sun",
    name: "Mechanical Sun",
    artworkQid: "Q1651874",
    theme: "Knowledge Illuminated",
    motif: "mechanical-sun",
    motifLabel: "ORRERY / LAMP / ORBIT",
    palette: "umber",
    surface: "dust",
    titleMode: "overlay",
    artTreatment: "bleed",
    focusX: 50,
    focusY: 47,
    minimumCropRetention: 0.66,
    landscape: { art: [0, 0, 100, 82], heading: [3, 61, 58, 28], motif: [66, 4, 31, 46], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 100, 71], heading: [4, 53, 91, 35], motif: [59, 4, 37, 34], details: [4, 91, 92, 6] },
  },
  {
    id: "sleep-pressure",
    name: "Sleep Pressure",
    artworkQid: "Q2317837",
    theme: "The Weight of Sleep",
    motif: "sleep-pressure",
    motifLabel: "MARE / CHEST / CURTAIN",
    palette: "indigo",
    surface: "halftone",
    titleMode: "monumental",
    artTreatment: "offset",
    focusX: 50,
    focusY: 50,
    minimumCropRetention: 0.64,
    landscape: { art: [30, 0, 70, 100], heading: [3, 48, 51, 40], motif: [3, 3, 24, 39], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 100, 74], heading: [4, 55, 91, 34], motif: [64, 3, 32, 34], details: [4, 91, 92, 6] },
  },
  {
    id: "perspective-proof",
    name: "Perspective Proof",
    artworkQid: "Q1212920",
    theme: "Stillness as Construction",
    motif: "perspective-proof",
    motifLabel: "TILE / COLUMN / DISTANCE",
    palette: "parchment",
    surface: "etched",
    titleMode: "caption",
    artTreatment: "folio",
    focusX: 50,
    focusY: 47,
    minimumCropRetention: 0.9,
    landscape: { art: [0, 0, 75, 100], heading: [57, 57, 40, 32], motif: [78, 4, 19, 45], details: [77, 91, 20, 6] },
    portrait: { art: [0, 0, 100, 70], heading: [4, 53, 91, 35], motif: [4, 3, 38, 29], details: [4, 91, 92, 6] },
  },
  {
    id: "severed-baseline",
    name: "Severed Baseline",
    artworkQid: "Q2247406",
    theme: "Violence Breaks the Frame",
    motif: "severed-baseline",
    motifLabel: "BLADE / ARM / BREAK",
    palette: "oxblood",
    surface: "dry-ink",
    titleMode: "vertical",
    artTreatment: "portrait-anchor",
    focusX: 52,
    focusY: 44,
    minimumCropRetention: 0.58,
    landscape: { art: [0, 0, 66, 100], heading: [48, 50, 49, 39], motif: [69, 3, 28, 40], details: [68, 91, 29, 6] },
    portrait: { art: [0, 0, 86, 100], heading: [42, 58, 55, 32], motif: [70, 3, 27, 40], details: [4, 92, 92, 6] },
  },
  {
    id: "two-armies",
    name: "Two Armies",
    artworkQid: "Q241455",
    theme: "A World Compressed to Battle",
    motif: "two-armies",
    motifLabel: "HOST / SKY / COLLISION",
    palette: "carbon",
    surface: "etched",
    titleMode: "margin",
    artTreatment: "portrait-anchor",
    focusX: 50,
    focusY: 47,
    minimumCropRetention: 0.58,
    landscape: { art: [34, 0, 66, 100], heading: [3, 53, 50, 36], motif: [3, 3, 27, 42], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 86, 100], heading: [41, 59, 56, 31], motif: [70, 3, 27, 43], details: [4, 92, 92, 6] },
  },
  {
    id: "petal-avalanche",
    name: "Petal Avalanche",
    artworkQid: "Q276174",
    theme: "Beauty Becomes Weather",
    motif: "petal-avalanche",
    motifLabel: "ROSE / FEAST / BURIAL",
    palette: "parchment",
    surface: "fiber",
    titleMode: "banner",
    artTreatment: "cinema",
    focusX: 52,
    focusY: 50,
    minimumCropRetention: 0.7,
    landscape: { art: [0, 0, 100, 78], heading: [3, 62, 61, 28], motif: [67, 3, 30, 39], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 100, 70], heading: [4, 54, 91, 35], motif: [56, 3, 40, 30], details: [4, 91, 92, 6] },
  },
  {
    id: "acid-cabaret",
    name: "Acid Cabaret",
    artworkQid: "Q3607521",
    theme: "Nightlife Under Electric Light",
    motif: "acid-cabaret",
    motifLabel: "MIRROR / GLARE / CROWD",
    palette: "verdigris",
    surface: "halftone",
    titleMode: "monumental",
    artTreatment: "offset",
    focusX: 51,
    focusY: 48,
    minimumCropRetention: 0.68,
    landscape: { art: [0, 0, 72, 100], heading: [51, 52, 46, 37], motif: [75, 3, 22, 41], details: [74, 91, 23, 6] },
    portrait: { art: [0, 0, 100, 72], heading: [4, 54, 91, 35], motif: [4, 3, 31, 31], details: [4, 91, 92, 6] },
  },
  {
    id: "unstable-table",
    name: "Unstable Table",
    artworkQid: "Q3956440",
    theme: "Balance Refuses Stillness",
    motif: "unstable-table",
    motifLabel: "TILT / APPLE / EDGE",
    palette: "umber",
    surface: "washed",
    titleMode: "vertical",
    artTreatment: "offset",
    focusX: 50,
    focusY: 51,
    minimumCropRetention: 0.66,
    landscape: { art: [28, 0, 72, 100], heading: [3, 56, 47, 33], motif: [3, 3, 21, 40], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 100, 72], heading: [4, 55, 91, 34], motif: [64, 3, 32, 30], details: [4, 91, 92, 6] },
  },
  {
    id: "falling-sun",
    name: "Falling Sun",
    artworkQid: "Q871812",
    theme: "After the Flight",
    motif: "falling-sun",
    motifLabel: "WING / BODY / SUNSET",
    palette: "indigo",
    surface: "dust",
    titleMode: "margin",
    artTreatment: "portrait-anchor",
    focusX: 51,
    focusY: 51,
    minimumCropRetention: 0.6,
    landscape: { art: [36, 0, 64, 100], heading: [3, 52, 53, 37], motif: [3, 3, 29, 40], details: [3, 91, 94, 6] },
    portrait: { art: [0, 0, 84, 100], heading: [39, 58, 58, 32], motif: [68, 3, 29, 39], details: [4, 92, 92, 6] },
  },
  {
    id: "basin-rhythm",
    name: "Basin Rhythm",
    artworkQid: "Q3172226",
    theme: "Care Drawn in Circles",
    motif: "basin-rhythm",
    motifLabel: "BASIN / ARM / EMBRACE",
    palette: "parchment",
    surface: "fiber",
    titleMode: "caption",
    artTreatment: "portrait-anchor",
    focusX: 51,
    focusY: 47,
    minimumCropRetention: 0.58,
    landscape: { art: [0, 0, 64, 100], heading: [47, 58, 50, 31], motif: [67, 3, 30, 46], details: [66, 91, 31, 6] },
    portrait: { art: [0, 0, 88, 100], heading: [41, 60, 56, 30], motif: [71, 3, 26, 40], details: [4, 92, 92, 6] },
  },
  {
    id: "name-restored",
    name: "Name Restored",
    artworkQid: "Q1923320",
    theme: "Portrait, Subject, Name",
    motif: "name-restored",
    motifLabel: "MADELEINE / GAZE / RECORD",
    palette: "oxblood",
    surface: "dry-ink",
    titleMode: "monumental",
    artTreatment: "portrait-anchor",
    focusX: 51,
    focusY: 34,
    minimumCropRetention: 0.62,
    landscape: { art: [34, 0, 66, 100], heading: [3, 48, 54, 41], motif: [3, 3, 27, 37], details: [3, 91, 94, 6] },
    portrait: { art: [10, 0, 90, 100], heading: [3, 60, 76, 30], motif: [3, 3, 31, 31], details: [4, 92, 92, 6] },
  },
] as const satisfies readonly CompositionRecipe[];

function freezeRect(rect: CompositionRect): CompositionRect {
  return Object.freeze([...rect]) as unknown as CompositionRect;
}

function freezeGeometry(geometry: CompositionGeometry): CompositionGeometry {
  return Object.freeze({
    art: freezeRect(geometry.art),
    heading: freezeRect(geometry.heading),
    motif: freezeRect(geometry.motif),
    details: freezeRect(geometry.details),
  });
}

export const COMPOSITION_RECIPES: readonly CompositionRecipe[] = Object.freeze(
  COMPOSITION_ROWS.map((recipe) =>
    Object.freeze({
      ...recipe,
      landscape: freezeGeometry(recipe.landscape),
      portrait: freezeGeometry(recipe.portrait),
    }),
  ),
);

export const COMPOSITION_COUNT = COMPOSITION_RECIPES.length;
export const COMPOSITION_CYCLE_TIME = 90_000;

export function artworkShape(artwork: ArtworkSeed): ArtworkShape {
  const aspect = artwork.width / artwork.height;
  if (aspect < 0.68) return "T";
  if (aspect < 0.9) return "P";
  if (aspect <= 1.14) return "S";
  if (aspect < 1.65) return "L";
  return "W";
}

export function compositionArtCoverage(geometry: CompositionGeometry) {
  return (geometry.art[2] * geometry.art[3]) / 10_000;
}

export function compositionCropRetention(artwork: ArtworkSeed, portalAspect: number) {
  const sourceAspect = artwork.width / artwork.height;
  return Math.min(sourceAspect / portalAspect, portalAspect / sourceAspect);
}

export function resolveCompositionObjectFit(
  recipe: CompositionRecipe,
  artwork: ArtworkSeed,
  portalAspect: number,
): "cover" | "contain" {
  if (recipe.artTreatment === "folio" || recipe.artTreatment === "scroll") {
    return "contain";
  }
  return compositionCropRetention(artwork, portalAspect) >= recipe.minimumCropRetention
    ? "cover"
    : "contain";
}

function referencePortalAspect(geometry: CompositionGeometry) {
  const [, , width, height] = geometry.art;
  return (width / height) * (16 / 9);
}

export function buildCompositionDeck(
  artworks: readonly ArtworkSeed[],
  seed = "",
): readonly CompositionDeckItem[] {
  if (!artworks.length) return [];
  void seed;

  const artworksByQid = new Map(artworks.map((artwork) => [artwork.qid, artwork]));
  return Object.freeze(
    COMPOSITION_RECIPES.map((recipe) => {
      const artwork = artworksByQid.get(recipe.artworkQid);
      if (!artwork) {
        throw new Error(`Composition ${recipe.id} requires curated artwork ${recipe.artworkQid}.`);
      }
      const portalAspect = referencePortalAspect(recipe.landscape);
      return Object.freeze({
        recipe,
        artwork,
        cropRetention: compositionCropRetention(artwork, portalAspect),
        objectFit: resolveCompositionObjectFit(recipe, artwork, portalAspect),
        focusX: recipe.focusX,
        focusY: recipe.focusY,
      });
    }),
  );
}
