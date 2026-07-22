export const FLIP_DOT_WEIGHT_STORAGE_KEY = "always-on-frame.flip-dot-weight.v1";

export type FlipDotDigitWeight = "normal" | "bold";

export interface FlipDotWeightOption {
  id: FlipDotDigitWeight;
  label: string;
  shortLabel: string;
}

export const FLIP_DOT_WEIGHTS: readonly FlipDotWeightOption[] = Object.freeze([
  { id: "normal", label: "Normal numerals", shortLabel: "NORM" },
  { id: "bold", label: "Bold numerals", shortLabel: "BOLD" },
]);

export const DEFAULT_FLIP_DOT_WEIGHT: FlipDotDigitWeight = "normal";

export function isFlipDotDigitWeight(value: unknown): value is FlipDotDigitWeight {
  return FLIP_DOT_WEIGHTS.some((weight) => weight.id === value);
}

export function resolveFlipDotWeight(value: unknown) {
  return FLIP_DOT_WEIGHTS.find((weight) => weight.id === value) ?? FLIP_DOT_WEIGHTS[0];
}

export function toggleFlipDotWeight(current: FlipDotDigitWeight): FlipDotDigitWeight {
  return current === "bold" ? "normal" : "bold";
}
