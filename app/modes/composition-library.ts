import type { ArtworkSeed } from "../data/artworks";

export type CompositionFamily =
  | "crown"
  | "horizon"
  | "shrine"
  | "split"
  | "cabinet"
  | "monolith"
  | "ribbon"
  | "ledger"
  | "radial"
  | "folio"
  | "bleed";

export type CompositionVariant = "a" | "b" | "c" | "d";
export type CompositionMotif =
  | "constellation"
  | "bars"
  | "coordinate"
  | "waveform"
  | "ledger"
  | "matrix"
  | "orbit"
  | "timeline";
export type CompositionPalette = "oxblood" | "umber" | "carbon" | "parchment";
export type CompositionHeadlineSource = "title" | "artist" | "frame" | "year";
export type ArtworkShape = "T" | "P" | "S" | "L" | "W";

type CompositionTuple = readonly [
  id: string,
  name: string,
  family: CompositionFamily,
  variant: CompositionVariant,
  motif: CompositionMotif,
  palette: CompositionPalette,
  headlineSource: CompositionHeadlineSource,
  preferredShapes: string,
  portalAspect: number,
  minimumCropRetention: number,
  maximumHeadlineLength: number,
];

const COMPOSITION_ROWS = [
  ["crown-ledger","Crown Ledger","crown","a","constellation","oxblood","frame","TP",0.62,0.82,32],
  ["horizon-banner","Horizon Banner","horizon","a","bars","umber","title","LW",2.2,0.86,48],
  ["offset-shrine","Offset Shrine","shrine","a","coordinate","carbon","title","PS",0.82,0.9,42],
  ["double-decker","Double Decker","horizon","b","waveform","parchment","title","LW",1.8,0.84,42],
  ["left-archive","Left Archive","split","a","ledger","oxblood","title","TP",0.72,0.84,50],
  ["right-margin","Right Margin","split","b","bars","umber","artist","PL",1,0.82,40],
  ["center-seam","Center Seam","shrine","b","constellation","carbon","title","PS",0.75,0.86,44],
  ["quadrant-lock","Quadrant Lock","cabinet","a","matrix","oxblood","year","SL",1.3,0.8,44],
  ["initial-monolith","Initial Monolith","monolith","a","orbit","umber","title","TP",0.72,0.82,32],
  ["title-lattice","Title Lattice","ribbon","a","coordinate","carbon","frame","LW",2.3,0.74,40],
  ["vertical-register","Vertical Register","split","c","ledger","parchment","artist","TP",0.7,0.86,42],
  ["caption-avalanche","Caption Avalanche","ledger","a","bars","oxblood","title","LS",1.3,0.8,44],
  ["pixel-dissolve","Pixel Dissolve","bleed","a","matrix","carbon","title","PL",0.9,0.78,46],
  ["contact-matrix","Contact Matrix","cabinet","b","matrix","umber","title","LW",1.65,0.84,50],
  ["module-cabinet","Module Cabinet","cabinet","c","constellation","oxblood","title","SL",1.25,0.82,42],
  ["scanline-strip","Scanline Strip","ribbon","b","waveform","carbon","artist","LW",2.2,0.72,46],
  ["golden-measure","Golden Measure","shrine","c","orbit","parchment","title","PS",0.82,0.86,46],
  ["radial-registry","Radial Registry","radial","a","orbit","oxblood","title","PS",1,0.8,38],
  ["constellation-gate","Constellation Gate","crown","b","constellation","carbon","title","PL",0.9,0.82,46],
  ["coordinate-plate","Coordinate Plate","shrine","d","coordinate","umber","title","SPL",1.05,0.88,52],
  ["century-dial","Century Dial","radial","b","orbit","parchment","year","PS",1,0.82,46],
  ["chronology-rail","Chronology Rail","ribbon","c","timeline","oxblood","title","LW",2.2,0.72,50],
  ["era-columns","Era Columns","ledger","b","timeline","carbon","year","SL",1.35,0.8,48],
  ["year-stack","Year Stack","monolith","b","matrix","umber","year","TP",0.7,0.82,42],
  ["museum-folio","Museum Folio","folio","a","coordinate","parchment","title","TPSL",1,0.96,56],
  ["specimen-drawer","Specimen Drawer","cabinet","d","ledger","oxblood","title","SP",1.05,0.84,54],
  ["paper-inversion","Paper Inversion","split","d","bars","parchment","title","PL",0.95,0.82,46],
  ["negative-field","Negative Field","folio","b","constellation","carbon","artist","PS",0.9,0.86,38],
  ["edge-bleed","Edge Bleed","bleed","b","matrix","umber","title","LW",1.4,0.72,48],
  ["diagonal-relay","Diagonal Relay","bleed","c","waveform","oxblood","title","LP",1.1,0.76,38],
  ["halo-portrait","Halo Portrait","radial","c","orbit","carbon","artist","TP",0.68,0.8,42],
  ["full-field-cartouche","Full-Field Cartouche","bleed","d","constellation","oxblood","frame","LS",1.55,0.72,34],
] as const satisfies readonly CompositionTuple[];

export type CompositionRecipe = {
  id: string;
  name: string;
  family: CompositionFamily;
  variant: CompositionVariant;
  motif: CompositionMotif;
  palette: CompositionPalette;
  headlineSource: CompositionHeadlineSource;
  preferredShapes: readonly ArtworkShape[];
  portalAspect: number;
  minimumCropRetention: number;
  maximumHeadlineLength: number;
};

export type CompositionDeckItem = {
  recipe: CompositionRecipe;
  artwork: ArtworkSeed;
  cropRetention: number;
  objectFit: "cover" | "contain";
  focusX: number;
  focusY: number;
};

const SHAPES = new Set<ArtworkShape>(["T", "P", "S", "L", "W"]);

export const COMPOSITION_RECIPES: readonly CompositionRecipe[] = Object.freeze(
  COMPOSITION_ROWS.map(
    ([
      id,
      name,
      family,
      variant,
      motif,
      palette,
      headlineSource,
      preferredShapes,
      portalAspect,
      minimumCropRetention,
      maximumHeadlineLength,
    ]) =>
      Object.freeze({
        id,
        name,
        family,
        variant,
        motif,
        palette,
        headlineSource,
        preferredShapes: [...preferredShapes].filter((shape): shape is ArtworkShape =>
          SHAPES.has(shape as ArtworkShape),
        ),
        portalAspect,
        minimumCropRetention,
        maximumHeadlineLength,
      }),
  ),
);

export const COMPOSITION_COUNT = COMPOSITION_RECIPES.length;
export const COMPOSITION_CYCLE_TIME = 90_000;

function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function artworkShape(artwork: ArtworkSeed): ArtworkShape {
  const aspect = artwork.width / artwork.height;
  if (aspect < 0.68) return "T";
  if (aspect < 0.9) return "P";
  if (aspect <= 1.14) return "S";
  if (aspect < 1.65) return "L";
  return "W";
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
  if (recipe.family === "folio") return "contain";
  return compositionCropRetention(artwork, portalAspect) >= recipe.minimumCropRetention
    ? "cover"
    : "contain";
}

function headlineLength(recipe: CompositionRecipe, artwork: ArtworkSeed) {
  if (recipe.headlineSource === "frame") return 15;
  if (recipe.headlineSource === "artist") return artwork.artist.length;
  if (recipe.headlineSource === "year") return artwork.year.length + artwork.title.length + 1;
  return artwork.title.length;
}

function resolutionTarget(recipe: CompositionRecipe) {
  if (
    recipe.family === "horizon" ||
    recipe.family === "ribbon" ||
    recipe.family === "bleed"
  ) {
    return 1_800;
  }
  if (
    recipe.family === "cabinet" ||
    recipe.family === "ledger" ||
    recipe.family === "monolith"
  ) {
    return 1_400;
  }
  return 1_100;
}

function scoreCandidate(
  recipe: CompositionRecipe,
  artwork: ArtworkSeed,
  recentArtists: readonly string[],
) {
  const retention = compositionCropRetention(artwork, recipe.portalAspect);
  const shapePenalty = recipe.preferredShapes.includes(artworkShape(artwork)) ? 0 : 9;
  const cropPenalty = Math.abs(Math.log((artwork.width / artwork.height) / recipe.portalAspect)) * 5;
  const overflowPenalty = Math.max(
    0,
    headlineLength(recipe, artwork) - recipe.maximumHeadlineLength,
  ) * 0.38;
  const artistPenalty = recentArtists.includes(artwork.artist) ? 12 : 0;
  const retentionPenalty = retention < recipe.minimumCropRetention ? 8 : 0;
  const target = resolutionTarget(recipe);
  const resolutionPenalty = Math.max(0, (target - Math.min(artwork.width, artwork.height)) / target) * 18;
  return shapePenalty + cropPenalty + overflowPenalty + artistPenalty + retentionPenalty + resolutionPenalty;
}

function candidatePool(
  recipe: CompositionRecipe,
  artworks: readonly ArtworkSeed[],
  used: ReadonlySet<string>,
  usedArtists: ReadonlySet<string>,
  recentArtists: readonly string[],
) {
  const unused = artworks.filter((artwork) => !used.has(artwork.qid));
  const artistFresh = unused.filter((artwork) => !usedArtists.has(artwork.artist));
  const strict = artistFresh.filter(
    (artwork) =>
      recipe.preferredShapes.includes(artworkShape(artwork)) &&
      headlineLength(recipe, artwork) <= recipe.maximumHeadlineLength &&
      compositionCropRetention(artwork, recipe.portalAspect) >=
        recipe.minimumCropRetention &&
      Math.min(artwork.width, artwork.height) >= resolutionTarget(recipe) &&
      !recentArtists.includes(artwork.artist),
  );
  if (strict.length) return strict;

  const portalReady = artistFresh.filter(
    (artwork) =>
      recipe.preferredShapes.includes(artworkShape(artwork)) &&
      compositionCropRetention(artwork, recipe.portalAspect) >=
        recipe.minimumCropRetention,
  );
  const resolutionSafe = portalReady.filter(
    (artwork) => Math.min(artwork.width, artwork.height) >= resolutionTarget(recipe),
  );
  if (resolutionSafe.length) return resolutionSafe;
  return portalReady.length ? portalReady : unused;
}

export function buildCompositionDeck(
  artworks: readonly ArtworkSeed[],
  seed: string,
): readonly CompositionDeckItem[] {
  if (!artworks.length) return [];
  const used = new Set<string>();
  const usedArtists = new Set<string>();
  const recentArtists: string[] = [];

  return COMPOSITION_RECIPES.map((recipe) => {
    const candidates = candidatePool(recipe, artworks, used, usedArtists, recentArtists)
      .map((artwork) => ({
        artwork,
        score: scoreCandidate(recipe, artwork, recentArtists),
      }))
      .sort((left, right) => left.score - right.score || left.artwork.qid.localeCompare(right.artwork.qid));
    const shortlist = candidates.slice(0, Math.min(COMPOSITION_COUNT, candidates.length));
    const selected = shortlist[hashString(`${seed}:${recipe.id}`) % shortlist.length]?.artwork ??
      artworks[hashString(recipe.id) % artworks.length];
    const retention = compositionCropRetention(selected, recipe.portalAspect);
    const shape = artworkShape(selected);
    const focusX = 50 + ((hashString(`${selected.qid}:x`) % 9) - 4);
    const focusY = shape === "T" || shape === "P" ? 38 : 50;

    used.add(selected.qid);
    usedArtists.add(selected.artist);
    recentArtists.push(selected.artist);
    if (recentArtists.length > 6) recentArtists.shift();

    return Object.freeze({
      recipe,
      artwork: selected,
      cropRetention: retention,
      objectFit: resolveCompositionObjectFit(recipe, selected, recipe.portalAspect),
      focusX,
      focusY,
    });
  });
}
