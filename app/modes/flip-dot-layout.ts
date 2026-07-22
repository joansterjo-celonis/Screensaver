import type { DotPattern } from "./flip-dot-glyphs.ts";
import type { FlipDotDigitWeight } from "./flip-dot-weights.ts";

export type FlipDotFieldVariant = "landscape" | "portrait";

export interface FlipDotFieldRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlipDotFieldSpec {
  columns: number;
  rows: number;
  regions: Readonly<{
    time: FlipDotFieldRegion;
  }>;
}

export interface FlipDotFieldInput {
  variant: FlipDotFieldVariant;
  hours: string;
  minutes: string;
  separatorOn: boolean;
  digitWeight?: FlipDotDigitWeight;
}

export interface ComposedFlipDotField extends FlipDotFieldSpec {
  variant: FlipDotFieldVariant;
  digitWeight: FlipDotDigitWeight;
  active: readonly boolean[];
}

type SevenSegmentName = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const NORMAL_SEVEN_SEGMENT_CELLS: Readonly<Record<SevenSegmentName, readonly [number, number][]>> = {
  a: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]],
  b: [[6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6]],
  c: [[6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13]],
  d: [[1, 14], [2, 14], [3, 14], [4, 14], [5, 14]],
  e: [[0, 8], [0, 9], [0, 10], [0, 11], [0, 12], [0, 13]],
  f: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6]],
  g: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
};

const BOLD_SEVEN_SEGMENT_CELLS: Readonly<Record<SevenSegmentName, readonly [number, number][]>> = {
  a: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [2, 1], [3, 1], [4, 1]],
  b: [[6, 1], [6, 2], [6, 3], [6, 4], [6, 5], [6, 6], [5, 2], [5, 3], [5, 4], [5, 5]],
  c: [[6, 8], [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [5, 9], [5, 10], [5, 11], [5, 12]],
  d: [[1, 14], [2, 14], [3, 14], [4, 14], [5, 14], [2, 13], [3, 13], [4, 13]],
  e: [[0, 8], [0, 9], [0, 10], [0, 11], [0, 12], [0, 13], [1, 9], [1, 10], [1, 11], [1, 12]],
  f: [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 2], [1, 3], [1, 4], [1, 5]],
  g: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [2, 6], [3, 6], [4, 6], [2, 8], [3, 8], [4, 8]],
};

function sevenSegmentPattern(
  segments: readonly SevenSegmentName[],
  cells: Readonly<Record<SevenSegmentName, readonly [number, number][]>>,
): DotPattern {
  const rows = Array.from({ length: 15 }, () => Array.from({ length: 7 }, () => "0"));
  segments.forEach((segment) => {
    cells[segment].forEach(([x, y]) => {
      rows[y][x] = "1";
    });
  });
  return rows.map((row) => row.join(""));
}

const DIGIT_SEGMENTS: Readonly<Record<string, readonly SevenSegmentName[]>> = Object.freeze({
  " ": [],
  "-": ["g"],
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "d", "e", "g"],
  "3": ["a", "b", "c", "d", "g"],
  "4": ["b", "c", "f", "g"],
  "5": ["a", "c", "d", "f", "g"],
  "6": ["a", "c", "d", "e", "f", "g"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
});

function buildDigitSet(cells: Readonly<Record<SevenSegmentName, readonly [number, number][]>>) {
  return Object.freeze(Object.fromEntries(
    Object.entries(DIGIT_SEGMENTS).map(([character, segments]) => [
      character,
      sevenSegmentPattern(segments, cells),
    ]),
  )) as Readonly<Record<string, DotPattern>>;
}

export const LARGE_FLIP_DOT_DIGITS = buildDigitSet(NORMAL_SEVEN_SEGMENT_CELLS);
export const LARGE_FLIP_DOT_DIGITS_BOLD = buildDigitSet(BOLD_SEVEN_SEGMENT_CELLS);
export const LARGE_FLIP_DOT_DIGITS_BY_WEIGHT = Object.freeze({
  normal: LARGE_FLIP_DOT_DIGITS,
  bold: LARGE_FLIP_DOT_DIGITS_BOLD,
});

export const FLIP_DOT_FIELD_SPECS: Readonly<Record<FlipDotFieldVariant, FlipDotFieldSpec>> = Object.freeze({
  landscape: {
    columns: 43,
    rows: 19,
    regions: {
      time: { x: 4, y: 2, width: 35, height: 15 },
    },
  },
  portrait: {
    columns: 27,
    rows: 42,
    regions: {
      time: { x: 6, y: 2, width: 15, height: 38 },
    },
  },
});

function createPlane(columns: number, rows: number) {
  return Array.from({ length: columns * rows }, () => false);
}

function stampPattern(
  plane: boolean[],
  columns: number,
  rows: number,
  pattern: DotPattern,
  x: number,
  y: number,
) {
  pattern.forEach((patternRow, rowIndex) => {
    [...patternRow].forEach((cell, columnIndex) => {
      const targetX = x + columnIndex;
      const targetY = y + rowIndex;
      if (cell !== "1" || targetX < 0 || targetX >= columns || targetY < 0 || targetY >= rows) {
        return;
      }
      plane[targetY * columns + targetX] = true;
    });
  });
}

function stampLargeDigits(
  plane: boolean[],
  columns: number,
  rows: number,
  text: string,
  x: number,
  y: number,
  digits: Readonly<Record<string, DotPattern>>,
) {
  [...text].forEach((character, index) => {
    stampPattern(
      plane,
      columns,
      rows,
      digits[character] ?? digits["-"],
      x + index * 8,
      y,
    );
  });
}

export function formatFlipDotTemperature(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--°";
  const rounded = Math.round(value);
  if (rounded > 99) return "HI°";
  if (rounded < -99) return "LO°";
  return `${rounded}°`;
}

export function composeFlipDotField(input: FlipDotFieldInput): ComposedFlipDotField {
  const spec = FLIP_DOT_FIELD_SPECS[input.variant];
  const plane = createPlane(spec.columns, spec.rows);
  const hours = input.hours.padStart(2, "0").slice(-2);
  const minutes = input.minutes.padStart(2, "0").slice(-2);
  const digitWeight = input.digitWeight === "bold" ? "bold" : "normal";
  const bold = digitWeight === "bold";
  const digits = LARGE_FLIP_DOT_DIGITS_BY_WEIGHT[digitWeight];

  if (input.variant === "landscape") {
    stampLargeDigits(plane, spec.columns, spec.rows, hours, 4, 2, digits);
    stampLargeDigits(plane, spec.columns, spec.rows, minutes, 24, 2, digits);
    if (input.separatorOn) {
      const separator = bold ? ["1", "1"] : ["1"];
      stampPattern(plane, spec.columns, spec.rows, separator, 21, bold ? 6 : 7);
      stampPattern(plane, spec.columns, spec.rows, separator, 21, 11);
    }
  } else {
    stampLargeDigits(plane, spec.columns, spec.rows, hours, 6, 2, digits);
    stampLargeDigits(plane, spec.columns, spec.rows, minutes, 6, 25, digits);
    if (input.separatorOn) {
      const separator = bold ? ["1", "1"] : ["1"];
      stampPattern(plane, spec.columns, spec.rows, separator, 13, bold ? 18 : 19);
      stampPattern(plane, spec.columns, spec.rows, separator, 13, 22);
    }
  }

  return {
    ...spec,
    variant: input.variant,
    digitWeight,
    active: plane,
  };
}
