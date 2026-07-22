export const FLIP_DOT_THEME_STORAGE_KEY = "always-on-frame.flip-dot-theme.v1";

export type FlipDotThemeId = "amber" | "ivory" | "vermilion" | "mint";

export interface FlipDotTheme {
  id: FlipDotThemeId;
  pigment: string;
  chassis: string;
  label: string;
}

export const FLIP_DOT_THEMES: readonly FlipDotTheme[] = Object.freeze([
  { id: "amber", pigment: "Amber", chassis: "Graphite", label: "Amber and graphite" },
  { id: "ivory", pigment: "Ivory", chassis: "Navy", label: "Ivory and navy" },
  { id: "vermilion", pigment: "Vermilion", chassis: "Bakelite", label: "Vermilion and bakelite" },
  { id: "mint", pigment: "Mint", chassis: "Gunmetal", label: "Mint and gunmetal" },
]);

export const DEFAULT_FLIP_DOT_THEME: FlipDotThemeId = "amber";

export function isFlipDotThemeId(value: unknown): value is FlipDotThemeId {
  return FLIP_DOT_THEMES.some((theme) => theme.id === value);
}

export function resolveFlipDotTheme(value: unknown) {
  return FLIP_DOT_THEMES.find((theme) => theme.id === value) ?? FLIP_DOT_THEMES[0];
}

export function stepFlipDotTheme(current: FlipDotThemeId, direction: -1 | 1) {
  const currentIndex = FLIP_DOT_THEMES.findIndex((theme) => theme.id === current);
  const nextIndex = (currentIndex + direction + FLIP_DOT_THEMES.length) % FLIP_DOT_THEMES.length;
  return FLIP_DOT_THEMES[nextIndex];
}
