import type { WeatherIconName } from "./weather-data";
import {
  flipDotGlyph,
  weatherDotPattern,
  type DotPattern,
} from "./flip-dot-glyphs.ts";

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
    seconds: FlipDotFieldRegion;
    weather: FlipDotFieldRegion;
    temperature: FlipDotFieldRegion;
  }>;
}

export interface FlipDotFieldInput {
  variant: FlipDotFieldVariant;
  hours: string;
  minutes: string;
  seconds: string;
  separatorOn: boolean;
  temperature: string;
  weatherIcon: WeatherIconName;
}

export interface ComposedFlipDotField extends FlipDotFieldSpec {
  variant: FlipDotFieldVariant;
  active: readonly boolean[];
}

const C = (rows: readonly string[]) => rows;

export const COMPACT_FLIP_DOT_GLYPHS: Readonly<Record<string, DotPattern>> = Object.freeze({
  " ": C(["000", "000", "000", "000", "000"]),
  "-": C(["000", "000", "111", "000", "000"]),
  ":": C(["000", "010", "000", "010", "000"]),
  "°": C(["110", "110", "000", "000", "000"]),
  "?": C(["110", "001", "010", "000", "010"]),
  "0": C(["111", "101", "101", "101", "111"]),
  "1": C(["010", "110", "010", "010", "111"]),
  "2": C(["110", "001", "010", "100", "111"]),
  "3": C(["110", "001", "010", "001", "110"]),
  "4": C(["101", "101", "111", "001", "001"]),
  "5": C(["111", "100", "110", "001", "110"]),
  "6": C(["011", "100", "111", "101", "111"]),
  "7": C(["111", "001", "010", "100", "100"]),
  "8": C(["111", "101", "111", "101", "111"]),
  "9": C(["111", "101", "111", "001", "110"]),
  H: C(["101", "101", "111", "101", "101"]),
  I: C(["111", "010", "010", "010", "111"]),
  L: C(["100", "100", "100", "100", "111"]),
  O: C(["111", "101", "101", "101", "111"]),
});

type SevenSegmentName = "a" | "b" | "c" | "d" | "e" | "f" | "g";

const SEVEN_SEGMENT_CELLS: Readonly<Record<SevenSegmentName, readonly [number, number][]>> = {
  a: [[1, 0], [2, 0], [3, 0], [4, 0], [5, 0]],
  b: [[6, 1], [6, 2], [6, 3], [6, 4]],
  c: [[6, 6], [6, 7], [6, 8], [6, 9]],
  d: [[1, 10], [2, 10], [3, 10], [4, 10], [5, 10]],
  e: [[0, 6], [0, 7], [0, 8], [0, 9]],
  f: [[0, 1], [0, 2], [0, 3], [0, 4]],
  g: [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5]],
};

function sevenSegmentPattern(segments: readonly SevenSegmentName[]): DotPattern {
  const rows = Array.from({ length: 11 }, () => Array.from({ length: 7 }, () => "0"));
  segments.forEach((segment) => {
    SEVEN_SEGMENT_CELLS[segment].forEach(([x, y]) => {
      rows[y][x] = "1";
    });
  });
  return rows.map((row) => row.join(""));
}

export const LARGE_FLIP_DOT_DIGITS: Readonly<Record<string, DotPattern>> = Object.freeze({
  " ": sevenSegmentPattern([]),
  "-": sevenSegmentPattern(["g"]),
  "0": sevenSegmentPattern(["a", "b", "c", "d", "e", "f"]),
  "1": sevenSegmentPattern(["b", "c"]),
  "2": sevenSegmentPattern(["a", "b", "d", "e", "g"]),
  "3": sevenSegmentPattern(["a", "b", "c", "d", "g"]),
  "4": sevenSegmentPattern(["b", "c", "f", "g"]),
  "5": sevenSegmentPattern(["a", "c", "d", "f", "g"]),
  "6": sevenSegmentPattern(["a", "c", "d", "e", "f", "g"]),
  "7": sevenSegmentPattern(["a", "b", "c"]),
  "8": sevenSegmentPattern(["a", "b", "c", "d", "e", "f", "g"]),
  "9": sevenSegmentPattern(["a", "b", "c", "d", "f", "g"]),
});

export const FLIP_DOT_FIELD_SPECS: Readonly<Record<FlipDotFieldVariant, FlipDotFieldSpec>> = Object.freeze({
  landscape: {
    columns: 43,
    rows: 19,
    regions: {
      time: { x: 7, y: 1, width: 29, height: 7 },
      weather: { x: 2, y: 9, width: 9, height: 9 },
      temperature: { x: 15, y: 11, width: 15, height: 5 },
      seconds: { x: 34, y: 11, width: 7, height: 5 },
    },
  },
  portrait: {
    columns: 27,
    rows: 42,
    regions: {
      time: { x: 6, y: 0, width: 15, height: 29 },
      seconds: { x: 10, y: 30, width: 7, height: 5 },
      weather: { x: 1, y: 32, width: 9, height: 9 },
      temperature: { x: 11, y: 36, width: 15, height: 5 },
    },
  },
});

function compactGlyph(character: string) {
  return COMPACT_FLIP_DOT_GLYPHS[character] ?? COMPACT_FLIP_DOT_GLYPHS["?"];
}

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

function measureText(text: string, glyphWidth: number, tracking = 1) {
  return text.length === 0 ? 0 : text.length * glyphWidth + (text.length - 1) * tracking;
}

function stampText(
  plane: boolean[],
  columns: number,
  rows: number,
  text: string,
  x: number,
  y: number,
  compact = false,
  tracking = 1,
) {
  const glyphWidth = compact ? 3 : 5;
  [...text].forEach((character, index) => {
    stampPattern(
      plane,
      columns,
      rows,
      compact ? compactGlyph(character) : flipDotGlyph(character),
      x + index * (glyphWidth + tracking),
      y,
    );
  });
}

function stampLargeDigits(
  plane: boolean[],
  columns: number,
  rows: number,
  text: string,
  x: number,
  y: number,
) {
  [...text].forEach((character, index) => {
    stampPattern(
      plane,
      columns,
      rows,
      LARGE_FLIP_DOT_DIGITS[character] ?? LARGE_FLIP_DOT_DIGITS["-"],
      x + index * 8,
      y,
    );
  });
}

function rightAlignedX(region: FlipDotFieldRegion, text: string) {
  return region.x + region.width - measureText(text, 3);
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
  const seconds = input.seconds.padStart(2, "0").slice(-2);

  if (input.variant === "landscape") {
    const time = `${hours}${input.separatorOn ? ":" : " "}${minutes}`;
    stampText(plane, spec.columns, spec.rows, time, spec.regions.time.x, spec.regions.time.y);
  } else {
    stampLargeDigits(plane, spec.columns, spec.rows, hours, spec.regions.time.x, spec.regions.time.y);
    stampText(
      plane,
      spec.columns,
      spec.rows,
      input.separatorOn ? ":" : " ",
      12,
      12,
      true,
    );
    stampLargeDigits(plane, spec.columns, spec.rows, minutes, spec.regions.time.x, 18);
  }

  stampPattern(
    plane,
    spec.columns,
    spec.rows,
    weatherDotPattern(input.weatherIcon),
    spec.regions.weather.x,
    spec.regions.weather.y,
  );
  stampText(
    plane,
    spec.columns,
    spec.rows,
    input.temperature,
    rightAlignedX(spec.regions.temperature, input.temperature),
    spec.regions.temperature.y,
    true,
  );
  stampText(
    plane,
    spec.columns,
    spec.rows,
    seconds,
    spec.regions.seconds.x,
    spec.regions.seconds.y,
    true,
  );

  return {
    ...spec,
    variant: input.variant,
    active: plane,
  };
}
