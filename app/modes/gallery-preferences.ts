import {
  ALL_GALLERY_ERA_IDS,
  resolveGalleryEraIds,
  type GalleryEraId,
} from "./gallery-eras.ts";

export type GalleryOrderMode =
  | "random"
  | "aspect-priority"
  | "compatible-only";

export type GalleryPreferences = Readonly<{
  version: 2;
  durationMs: number;
  orderMode: GalleryOrderMode;
  selectedEraIds: readonly GalleryEraId[];
}>;

export type GalleryDurationOption = Readonly<{
  durationMs: number;
  label: string;
  shortLabel: string;
}>;

export type GalleryOrderOption = Readonly<{
  value: GalleryOrderMode;
  label: string;
  shortLabel: string;
  description: string;
}>;

export const GALLERY_PREFERENCES_STORAGE_KEY =
  "always-on-frame.gallery.settings.v1";

export const GALLERY_DURATION_OPTIONS: readonly GalleryDurationOption[] =
  Object.freeze([
    Object.freeze({ durationMs: 30_000, label: "30 seconds", shortLabel: "00:30" }),
    Object.freeze({ durationMs: 60_000, label: "1 minute", shortLabel: "01 MIN" }),
    Object.freeze({ durationMs: 2 * 60_000, label: "2 minutes", shortLabel: "02 MIN" }),
    Object.freeze({ durationMs: 5 * 60_000, label: "5 minutes", shortLabel: "05 MIN" }),
    Object.freeze({ durationMs: 10 * 60_000, label: "10 minutes", shortLabel: "10 MIN" }),
    Object.freeze({ durationMs: 30 * 60_000, label: "30 minutes", shortLabel: "30 MIN" }),
  ]);

export const GALLERY_ORDER_OPTIONS: readonly GalleryOrderOption[] =
  Object.freeze([
    Object.freeze({
      value: "aspect-priority" as const,
      label: "Screen fit first",
      shortLabel: "FIT FIRST",
      description:
        "Shuffle every painting, with works shaped like this screen shown first.",
    }),
    Object.freeze({
      value: "random" as const,
      label: "Pure shuffle",
      shortLabel: "SHUFFLE",
      description:
        "Mix the complete collection without grouping paintings by screen shape.",
    }),
    Object.freeze({
      value: "compatible-only" as const,
      label: "Screen fit only",
      shortLabel: "FIT ONLY",
      description:
        "Skip portrait or landscape paintings that do not suit this screen.",
    }),
  ]);

export const DEFAULT_GALLERY_PREFERENCES: GalleryPreferences = Object.freeze({
  version: 2,
  durationMs: 5 * 60_000,
  orderMode: "aspect-priority",
  selectedEraIds: ALL_GALLERY_ERA_IDS,
});

const VALID_DURATIONS = new Set(
  GALLERY_DURATION_OPTIONS.map(({ durationMs }) => durationMs),
);
const VALID_ORDER_MODES = new Set<GalleryOrderMode>(
  GALLERY_ORDER_OPTIONS.map(({ value }) => value),
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function resolveGalleryPreferences(value: unknown): GalleryPreferences {
  if (!isRecord(value) || (value.version !== 1 && value.version !== 2)) {
    return DEFAULT_GALLERY_PREFERENCES;
  }

  const durationMs =
    typeof value.durationMs === "number" &&
    Number.isFinite(value.durationMs) &&
    VALID_DURATIONS.has(value.durationMs)
      ? value.durationMs
      : DEFAULT_GALLERY_PREFERENCES.durationMs;
  const orderMode =
    typeof value.orderMode === "string" &&
    VALID_ORDER_MODES.has(value.orderMode as GalleryOrderMode)
      ? (value.orderMode as GalleryOrderMode)
      : DEFAULT_GALLERY_PREFERENCES.orderMode;
  const selectedEraIds = value.version === 2
    ? resolveGalleryEraIds(value.selectedEraIds)
    : ALL_GALLERY_ERA_IDS;

  if (
    durationMs === DEFAULT_GALLERY_PREFERENCES.durationMs &&
    orderMode === DEFAULT_GALLERY_PREFERENCES.orderMode &&
    selectedEraIds === ALL_GALLERY_ERA_IDS
  ) {
    return DEFAULT_GALLERY_PREFERENCES;
  }

  return Object.freeze({
    version: 2,
    durationMs,
    orderMode,
    selectedEraIds,
  });
}

export function parseGalleryPreferences(
  serialized: string | null | undefined,
): GalleryPreferences {
  if (!serialized) return DEFAULT_GALLERY_PREFERENCES;
  try {
    return resolveGalleryPreferences(JSON.parse(serialized));
  } catch {
    return DEFAULT_GALLERY_PREFERENCES;
  }
}

export function serializeGalleryPreferences(preferences: GalleryPreferences) {
  return JSON.stringify(resolveGalleryPreferences(preferences));
}

export function galleryDurationOption(durationMs: number) {
  return (
    GALLERY_DURATION_OPTIONS.find(
      (option) => option.durationMs === durationMs,
    ) ??
    GALLERY_DURATION_OPTIONS.find(
      (option) =>
        option.durationMs === DEFAULT_GALLERY_PREFERENCES.durationMs,
    )!
  );
}

export function galleryOrderOption(orderMode: GalleryOrderMode) {
  return (
    GALLERY_ORDER_OPTIONS.find((option) => option.value === orderMode) ??
    GALLERY_ORDER_OPTIONS.find(
      (option) =>
        option.value === DEFAULT_GALLERY_PREFERENCES.orderMode,
    )!
  );
}
