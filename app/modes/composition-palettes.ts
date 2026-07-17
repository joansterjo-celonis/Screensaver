export type HexColor = `#${string}`;

export type PosterPalette = Readonly<{
  artworkQid: string;
  sourceSwatches: readonly HexColor[];
  paper: HexColor;
  ink: HexColor;
  accent: HexColor;
  field: HexColor;
}>;

const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

function definePalette(
  artworkQid: string,
  paper: HexColor,
  ink: HexColor,
  accent: HexColor,
  field: HexColor,
): PosterPalette {
  const sourceSwatches = Object.freeze([paper, ink, accent, field]);

  for (const color of sourceSwatches) {
    if (!HEX_COLOR_PATTERN.test(color)) {
      throw new Error(`Composition palette ${artworkQid} contains invalid color ${color}.`);
    }
  }

  for (const [role, color] of Object.entries({ paper, ink, accent, field })) {
    if (!sourceSwatches.includes(color)) {
      throw new Error(`Composition palette ${artworkQid} ${role} is not a source swatch.`);
    }
  }

  return Object.freeze({
    artworkQid,
    sourceSwatches,
    paper,
    ink,
    accent,
    field,
  });
}

export const COMPOSITION_PALETTES = Object.freeze({
  Q474338: definePalette("Q474338", "#121311", "#E6D9C1", "#4B6E87", "#7E2F31"),
  Q151047: definePalette("Q151047", "#D9D1B4", "#263B36", "#7DADA5", "#B8746B"),
  Q321303: definePalette("Q321303", "#0D1210", "#DED4BA", "#6E8A39", "#7D2731"),
  Q220859: definePalette("Q220859", "#162014", "#E3D6B8", "#507A2D", "#7C2F27"),
  Q185372: definePalette("Q185372", "#121713", "#E8D8BB", "#2F6287", "#C59A3E"),
  Q661378: definePalette("Q661378", "#171310", "#E8E1D1", "#7B2E27", "#6F665B"),
  Q208758: definePalette("Q208758", "#17120E", "#D9D0C2", "#9B4A36", "#8A7254"),
  Q29530: definePalette("Q29530", "#313A45", "#E7E0D1", "#A83B33", "#314C75"),
  Q212616: definePalette("Q212616", "#101513", "#D8D0BB", "#9A6C3F", "#6B302B"),
  Q257580: definePalette("Q257580", "#111827", "#E5D4B6", "#C76332", "#6E576C"),
  Q311243: definePalette("Q311243", "#1C2523", "#D6D3C6", "#6F7F78", "#6C4030"),
  Q328523: definePalette("Q328523", "#465D64", "#E7DED0", "#D96A31", "#263F48"),
  Q45585: definePalette("Q45585", "#08152D", "#E6D39A", "#D7B43E", "#182B50"),
  Q846213: definePalette("Q846213", "#351A17", "#F0D4B3", "#D96A2E", "#6C3430"),
  Q500985: definePalette("Q500985", "#D4D1C4", "#222C25", "#647A7B", "#394439"),
  Q463392: definePalette("Q463392", "#D6C9A7", "#303B22", "#657A37", "#9A5843"),
  Q1212937: definePalette("Q1212937", "#14221D", "#E0CEAA", "#B18A49", "#703F32"),
  Q3012259: definePalette("Q3012259", "#C6A982", "#2F2117", "#7A4128", "#E0C8A6"),
  Q24283: definePalette("Q24283", "#B8A67E", "#2B3127", "#6B8491", "#7A6E40"),
  Q28154824: definePalette("Q28154824", "#B89A55", "#1E1B17", "#A6372D", "#E6DEBE"),
  Q3873328: definePalette("Q3873328", "#171311", "#DED2BD", "#7B3C32", "#A58E65"),
  Q1651874: definePalette("Q1651874", "#17110B", "#E8D4AA", "#D8953C", "#593B25"),
  Q2317837: definePalette("Q2317837", "#140D13", "#E0D5CF", "#7E2630", "#3C2B48"),
  Q1212920: definePalette("Q1212920", "#D5C8A9", "#303436", "#A77D50", "#856B68"),
  Q2247406: definePalette("Q2247406", "#130D0C", "#E7D8C1", "#7A1F19", "#3D302A"),
  Q241455: definePalette("Q241455", "#152732", "#DFCDA3", "#B58A3D", "#7C2E26"),
  Q276174: definePalette("Q276174", "#EEE0C9", "#332218", "#A94F58", "#C7A05C"),
  Q3607521: definePalette("Q3607521", "#182117", "#D9D0A7", "#A8B53B", "#B57A3F"),
  Q3956440: definePalette("Q3956440", "#BFD0C7", "#2B342F", "#A85430", "#6D8E69"),
  Q871812: definePalette("Q871812", "#211817", "#E0C9A6", "#C88C3D", "#6E4040"),
  Q3172226: definePalette("Q3172226", "#D6C5A8", "#22313A", "#526A87", "#A66D5C"),
  Q1923320: definePalette("Q1923320", "#27211D", "#EFE2CC", "#6D7C86", "#B08A4D"),
} as const satisfies Readonly<Record<string, PosterPalette>>);

const paletteSignatures = new Set<string>();

for (const [qid, palette] of Object.entries(COMPOSITION_PALETTES)) {
  if (palette.artworkQid !== qid) {
    throw new Error(`Composition palette key ${qid} does not match ${palette.artworkQid}.`);
  }

  const signature = [palette.paper, palette.ink, palette.accent, palette.field].join(":");
  if (paletteSignatures.has(signature)) {
    throw new Error(`Composition palette ${qid} duplicates another curated palette.`);
  }
  paletteSignatures.add(signature);
}

export function getCompositionPalette(qid: string): PosterPalette {
  const palette = (COMPOSITION_PALETTES as Readonly<Record<string, PosterPalette>>)[qid];
  if (!palette) {
    throw new Error(`No curated composition palette exists for ${qid}.`);
  }
  return palette;
}
