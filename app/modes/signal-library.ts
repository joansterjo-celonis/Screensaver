import {
  buildCellFlipPlan,
  cellFlipProgress,
  fitCellGrid,
  quantizeSignalCellState,
  quantizeSignalTime,
  resolveBackingStore,
  resolveSignalHeaderLayout,
  resolveSignalLayout,
  signalConfidence,
  signalWeight,
  type SignalCellState,
  type SignalLayout,
} from "./signal-grid";
import { shuffledCycle } from "../shuffle";

const TAU = Math.PI * 2;

export const SIGNAL_STATE_INTERVAL = 160;
export const SIGNAL_FONT_FAMILY =
  '"Geist Signal", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const SIGNAL_PALETTE = Object.freeze({
  oxblood: "#080808",
  night: "#050506",
  ivory: "#e1e1dc",
  magenta: "#e60170",
  orange: "#f04e1b",
  red: "#dc3a3a",
  amber: "#db9d5c",
  clay: "#a55246",
  sage: "#658863",
  slate: "#8e8d8b",
  navy: "#171a38",
  bone: "#e5d4b7",
  acid: "#d9f15f",
  dimIvory: "rgba(225, 225, 220, 0.52)",
  faintIvory: "rgba(225, 225, 220, 0.13)",
  dimOxblood: "rgba(8, 8, 8, 0.54)",
});

export interface SignalSceneDescriptor {
  id: string;
  label: string;
  code: string;
}

export interface SignalRenderOptions {
  sceneDurationMs?: number;
  transitionMs?: number;
  reducedMotion?: boolean;
  sceneOffset?: number;
  shuffleSeed?: string;
}

export interface SignalFrameInfo {
  sceneIndex: number;
  nextSceneIndex: number;
  scene: SignalSceneDescriptor;
  nextScene: SignalSceneDescriptor;
  sceneProgress: number;
  transitionProgress: number;
}

interface SceneFrame {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  time: number;
  phase: number;
  stateTick: number;
  confidence: number;
  layout: SignalLayout;
}

interface InternalScene extends SignalSceneDescriptor {
  typeface: SignalTypeface;
  draw: (frame: SceneFrame) => void;
}

export const SIGNAL_SCENE_DURATION_MS = 11_500;
const DEFAULT_SCENE_DURATION = SIGNAL_SCENE_DURATION_MS;
const DEFAULT_TRANSITION_DURATION = 1_050;
const TRANSITION_PIXEL_BUDGET = 2_200_000;
const {
  oxblood: OXBLOOD,
  night: NIGHT,
  ivory: IVORY,
  magenta: MAGENTA,
  dimIvory: DIM,
  faintIvory: FAINT,
  dimOxblood: DIM_DARK,
} = SIGNAL_PALETTE;
const {
  orange: ORANGE,
  red: RED,
  amber: AMBER,
  clay: CLAY,
  sage: SAGE,
  slate: SLATE,
  navy: NAVY,
  bone: BONE,
  acid: ACID,
} = SIGNAL_PALETTE;

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function hash(x: number, y = 0, seed = 0) {
  let value = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function fill(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color: string = OXBLOOD,
) {
  context.fillStyle = color;
  context.fillRect(0, 0, width, height);
}

function line(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string = DIM,
  lineWidth = 1,
) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.stroke();
}

function drawSignalRule(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string = DIM,
) {
  line(context, x1, y1, x2, y2, color, 1);
}

function drawSignalCircle(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string = DIM,
) {
  context.beginPath();
  context.arc(cx, cy, Math.max(0, radius), 0, TAU);
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();
}

function drawSignalEllipse(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radiusX: number,
  radiusY: number,
  rotation = 0,
  color: string = DIM,
) {
  context.beginPath();
  context.ellipse(
    cx,
    cy,
    Math.max(0, radiusX),
    Math.max(0, radiusY),
    rotation,
    0,
    TAU,
  );
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();
}

export type SignalTypeface =
  | "signal"
  | "display"
  | "interface"
  | "sans"
  | "mono"
  | "pixel-square"
  | "pixel-grid"
  | "pixel-circle"
  | "pixel-triangle"
  | "pixel-line";

type SignalFontFamilies = Record<SignalTypeface, string>;

const signalFontFamilies: SignalFontFamilies = {
  signal: SIGNAL_FONT_FAMILY,
  display: '"Oxanium Variable", "Arial Narrow", sans-serif',
  interface: '"Rajdhani", "Arial Narrow", sans-serif',
  sans: '"Geist Signal", Arial, sans-serif',
  mono: SIGNAL_FONT_FAMILY,
  "pixel-square": SIGNAL_FONT_FAMILY,
  "pixel-grid": SIGNAL_FONT_FAMILY,
  "pixel-circle": SIGNAL_FONT_FAMILY,
  "pixel-triangle": SIGNAL_FONT_FAMILY,
  "pixel-line": SIGNAL_FONT_FAMILY,
};

export function configureSignalFontFamilies(
  families: Partial<SignalFontFamilies>,
) {
  for (const key of Object.keys(families) as SignalTypeface[]) {
    const family = families[key]?.trim();
    if (family) signalFontFamilies[key] = family;
  }
}

type SignalTextOptions = Readonly<{
  family?: SignalTypeface;
  maxWidth?: number;
  tracking?: number;
  motion?: number;
  strength?: number;
}>;

function textWidth(
  context: CanvasRenderingContext2D,
  value: string,
  tracking: number,
) {
  return context.measureText(value).width + Math.max(0, value.length - 1) * tracking;
}

function trackedText(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  tracking: number,
  align: CanvasTextAlign,
) {
  const width = textWidth(context, value, tracking);
  let cursor = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
  context.textAlign = "left";
  for (const character of value) {
    context.fillText(character, cursor, y);
    cursor += context.measureText(character).width + tracking;
  }
}

function type(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string = IVORY,
  align: CanvasTextAlign = "left",
  weight = 400,
  options: SignalTextOptions = {},
) {
  const role = weight >= 620 ? "primary" : weight >= 390 ? "secondary" : "tertiary";
  const kineticPhase = activeSignalTime / 720 + value.length * 0.23;
  const motion = clamp(options.motion ?? (role === "primary" ? 0.32 : 0), 0, 1);
  const pulse = 0.5 + Math.sin(kineticPhase) * 0.5;
  const strength = clamp(
    (options.strength ?? activeSignalConfidence) * (role === "tertiary" ? 0.86 : 0.74) +
      pulse * (role === "primary" ? 0.26 : 0.08),
  );
  const resolvedWeight = signalWeight(strength, role);
  const defaultFamily: SignalTypeface = role === "primary" ? "display" : "mono";
  const family = signalFontFamilies[options.family ?? defaultFamily];
  let resolvedSize = Math.max(6, size);
  let tracking = Math.max(0, options.tracking ?? 0) * (0.82 + pulse * 0.28);
  const setFont = () => {
    context.font = `${resolvedWeight.toFixed(1)} ${resolvedSize}px ${family}`;
  };
  setFont();
  if (options.maxWidth && options.maxWidth > 0) {
    const width = textWidth(context, value, tracking);
    if (width > options.maxWidth) {
      const scale = Math.max(0.42, options.maxWidth / width);
      resolvedSize *= scale;
      tracking *= scale;
      setFont();
    }
  }
  const xShift = Math.sin(kineticPhase * 0.71) * resolvedSize * 0.13 * motion;
  const yShift = Math.cos(kineticPhase * 0.43) * resolvedSize * 0.05 * motion;
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  if (tracking > 0) {
    trackedText(context, value, x + xShift, y + yShift, tracking, align);
  } else {
    context.fillText(value, x + xShift, y + yShift);
  }
}

let activeSignalConfidence = 0.72;
let activeSignalTime = 0;
let activeSignalTypeface: SignalTypeface = "mono";
let activeSignalContentTop: number | null = null;

interface SignalCell {
  x: number;
  y: number;
  size: number;
  color?: string;
  alpha?: number;
  state?: SignalCellState;
  shape?: "square" | "dot" | "ring" | "line" | "cross";
  rotation?: number;
}

function drawSignalCellMark(
  context: CanvasRenderingContext2D,
  cell: SignalCell,
  defaultColor = IVORY,
) {
  const state = cell.state ?? "on";
  if (state === "off" || cell.size <= 0) return;
  const stateScale = state === "low" ? 0.28 : state === "mid" ? 0.5 : 0.76;
  const markSize = cell.size * (state === "pattern" || state === "outline" ? 0.76 : stateScale);
  const x = cell.x + (cell.size - markSize) / 2;
  const y = cell.y + (cell.size - markSize) / 2;
  const color = cell.color ?? defaultColor;
  context.globalAlpha = (cell.alpha ?? 1) * (state === "low" ? 0.44 : state === "mid" ? 0.72 : 1);
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = 1;

  if (cell.shape === "ring" || state === "outline") {
    if (cell.shape === "ring") {
      context.beginPath();
      context.arc(cell.x + cell.size / 2, cell.y + cell.size / 2, markSize / 2, 0, TAU);
      context.stroke();
    } else {
      context.strokeRect(x, y, markSize, markSize);
    }
    context.globalAlpha = 1;
    return;
  }

  if (cell.shape === "dot") {
    context.beginPath();
    context.arc(cell.x + cell.size / 2, cell.y + cell.size / 2, markSize / 2, 0, TAU);
    context.fill();
  } else if (cell.shape === "line" || cell.shape === "cross") {
    const cx = cell.x + cell.size / 2;
    const cy = cell.y + cell.size / 2;
    const rotation = cell.rotation ?? 0;
    context.beginPath();
    context.moveTo(cx - Math.cos(rotation) * markSize / 2, cy - Math.sin(rotation) * markSize / 2);
    context.lineTo(cx + Math.cos(rotation) * markSize / 2, cy + Math.sin(rotation) * markSize / 2);
    if (cell.shape === "cross") {
      context.moveTo(cx - Math.cos(rotation + Math.PI / 2) * markSize / 2, cy - Math.sin(rotation + Math.PI / 2) * markSize / 2);
      context.lineTo(cx + Math.cos(rotation + Math.PI / 2) * markSize / 2, cy + Math.sin(rotation + Math.PI / 2) * markSize / 2);
    }
    context.stroke();
  } else if (state === "pattern") {
    context.strokeRect(x, y, markSize, markSize);
    const step = Math.max(2, markSize / 3);
    for (let offset = -markSize; offset <= markSize; offset += step) {
      const startX = Math.max(x, x + offset);
      const startY = Math.min(y + markSize, y + markSize + offset);
      const endX = Math.min(x + markSize, x + markSize + offset);
      const endY = Math.max(y, y + offset);
      if (endX >= startX && startY >= endY) {
        context.beginPath();
        context.moveTo(startX, startY);
        context.lineTo(endX, endY);
        context.stroke();
      }
    }
  } else {
    context.fillRect(x, y, markSize, markSize);
  }
  context.globalAlpha = 1;
}

function drawSignalCells(
  context: CanvasRenderingContext2D,
  cells: readonly SignalCell[],
  defaultColor = IVORY,
) {
  for (const cell of cells) {
    drawSignalCellMark(context, cell, defaultColor);
  }
  context.globalAlpha = 1;
}

function drawCellStrip(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  values: readonly number[],
  cellSize: number,
  activeIndex = -1,
) {
  values.forEach((value, index) => {
    const amount = clamp(value);
    const state = quantizeSignalCellState(amount, index === activeIndex);
    drawSignalCellMark(context, {
      x: x + index * cellSize,
      y,
      size: cellSize,
      state,
      shape: amount < 0.42 ? "dot" : "square",
      color: IVORY,
    });
  });
}

const DOT_MATRIX: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "010", "010", "010"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ".": ["000", "000", "000", "000", "010"],
  "%": ["101", "001", "010", "100", "101"],
  "-": ["000", "000", "111", "000", "000"],
  "+": ["000", "010", "111", "010", "000"],
});

function drawDotMatrixValue(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  cellSize: number,
  color: string = IVORY,
  previousValue?: string,
) {
  const dot = Math.max(1, cellSize * 0.58);
  const characterWidth = cellSize * 4;
  const previous = (previousValue ?? value).padStart(value.length, "0").slice(-value.length);
  const propagationSpan = Math.max(1, value.length * 3 + 4);
  for (let characterIndex = 0; characterIndex < value.length; characterIndex += 1) {
    const currentPattern = DOT_MATRIX[value[characterIndex]] ?? DOT_MATRIX["-"];
    const previousPattern = DOT_MATRIX[previous[characterIndex]] ?? DOT_MATRIX["-"];
    for (let row = 0; row < currentPattern.length; row += 1) {
      for (let column = 0; column < currentPattern[row].length; column += 1) {
        const threshold = (characterIndex * 3 + column + row * 0.35) / propagationSpan;
        const currentIsVisible = activeSignalStateProgress >= threshold;
        const pattern = currentIsVisible
          ? currentPattern
          : previousPattern;
        if (pattern[row][column] !== "1") continue;
        const changed = currentPattern[row][column] !== previousPattern[row][column];
        drawSignalCellMark(context, {
          x: x + characterIndex * characterWidth + column * cellSize,
          y: y + row * cellSize,
          size: dot,
          color,
          state: changed && !currentIsVisible ? "outline" : changed ? "pattern" : "on",
        });
      }
    }
  }
}

let activeSignalStateProgress = 1;

function propagatedStateTick(
  stateTick: number,
  column: number,
  row: number,
  columns: number,
  rows: number,
) {
  const span = Math.max(1, columns + rows * 0.4);
  const threshold = clamp((column + row * 0.4) / span);
  return activeSignalStateProgress >= threshold
    ? stateTick
    : Math.max(0, stateTick - 1);
}

function drawSharedGrid(frame: SceneFrame, color = "rgba(207, 204, 198, 0.06)") {
  const { context, layout } = frame;
  context.beginPath();
  for (let column = 0; column <= layout.columns; column += 1) {
    const x = layout.originX + column * layout.cellSize;
    context.moveTo(x, layout.originY);
    context.lineTo(x, layout.originY + layout.gridHeight);
  }
  for (let row = 0; row <= layout.rows; row += 1) {
    const y = layout.originY + row * layout.cellSize;
    context.moveTo(layout.originX, y);
    context.lineTo(layout.originX + layout.gridWidth, y);
  }
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();
}

function snapSignalCenter(layout: SignalLayout, value: number, axis: "x" | "y") {
  const origin = axis === "x" ? layout.originX : layout.originY;
  return origin + (Math.round((value - origin) / layout.cellSize - 0.5) + 0.5) * layout.cellSize;
}

function panel(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string = DIM,
) {
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.strokeRect(x, y, width, height);
  const notch = Math.min(width, height) * 0.08;
  line(context, x, y + notch, x + notch, y, color);
  line(context, x + width - notch, y + height, x + width, y + height - notch, color);
}

function chrome(
  frame: SceneFrame,
  title: string,
  code: string,
  inverse = false,
) {
  const { context, width, time, layout } = frame;
  const padX = Math.max(layout.originX + layout.cellSize * 2, layout.cellSize * 2);
  const bottom = layout.originY + layout.gridHeight - layout.cellSize * 2;
  const tiny = Math.max(7, layout.cellSize * 0.86);
  const ink = inverse ? OXBLOOD : IVORY;
  const dim = inverse ? DIM_DARK : DIM;
  const leftLabel = `BMS / ${code}`;
  const rightLabel = title.toUpperCase();
  const gutter = layout.cellSize * 2;
  context.font = `${signalWeight(frame.confidence, "primary")} ${tiny}px ${signalFontFamilies.mono}`;
  const leftWidth = context.measureText(leftLabel).width;
  context.font = `${signalWeight(frame.confidence, "primary")} ${tiny}px ${signalFontFamilies.sans}`;
  const rightWidth = context.measureText(rightLabel).width;
  const header = resolveSignalHeaderLayout(layout, leftWidth, rightWidth);
  const stacked = header.mode === "stacked";
  const textMaxWidth = stacked
    ? header.availableWidth
    : Math.max(layout.cellSize * 5, (header.availableWidth - gutter) / 2);
  activeSignalContentTop = header.contentTop;
  type(context, leftLabel, header.left.x, header.left.y, tiny, ink, "left", 600, {
    family: "mono",
    maxWidth: textMaxWidth,
    tracking: layout.cellSize * 0.025,
  });
  type(context, rightLabel, header.right.x, header.right.y, tiny, ink, "right", 650, {
    family: "sans",
    maxWidth: textMaxWidth,
    tracking: layout.cellSize * 0.07,
    motion: 0.72,
  });
  drawSignalRule(context, header.rule.x1, header.rule.y1, header.rule.x2, header.rule.y2, dim);
  type(context, "STATE", padX, bottom, tiny, dim);
  drawDotMatrixValue(
    context,
    String(Math.floor(time / SIGNAL_STATE_INTERVAL)).padStart(4, "0"),
    padX + layout.cellSize * 4.4,
    bottom - layout.cellSize * 0.86,
    layout.cellSize * 0.2,
    dim,
    String(Math.max(0, Math.floor(time / SIGNAL_STATE_INTERVAL) - 1)).padStart(4, "0"),
  );
  type(context, "SIGNAL / NOMINAL", width - padX, bottom, tiny, ink, "right", 400, {
    family: activeSignalTypeface,
    tracking: layout.cellSize * 0.04,
    motion: 0.35,
  });
}

function signalContent(frame: SceneFrame) {
  const { layout } = frame;
  const y = activeSignalContentTop ?? layout.originY + layout.cellSize * 7;
  const footerTop = layout.originY + layout.gridHeight - layout.cellSize * 6;
  return {
    x: layout.originX + layout.cellSize * 2,
    y,
    width: layout.gridWidth - layout.cellSize * 4,
    height: Math.max(layout.cellSize * 4, footerTop - y),
  };
}

function orbitalTelemetry(frame: SceneFrame) {
  const { context, width, height, stateTick, layout, confidence } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Orbital telemetry", "ORBIT-07");

  const content = signalContent(frame);
  const stacked = layout.profile === "portrait";
  const orbitWidth = Math.floor(
    (stacked ? content.width : content.width * 0.58) / layout.cellSize,
  ) * layout.cellSize;
  const orbitHeight = Math.floor(
    (stacked ? content.height * 0.46 : content.height) / layout.cellSize,
  ) * layout.cellSize;
  const cx = snapSignalCenter(layout, content.x + orbitWidth * 0.5, "x");
  const cy = snapSignalCenter(layout, content.y + orbitHeight * 0.5, "y");
  const radius = Math.max(layout.cellSize * 6, Math.min(orbitWidth, orbitHeight) * 0.44);
  const ringRatios = [0.32, 0.52, 0.73, 0.95];
  const activeSector = positiveModulo(stateTick, 36);
  const cells: SignalCell[] = [];
  ringRatios.forEach((ratio, ringIndex) => {
    drawSignalCircle(context, cx, cy, radius * ratio, ringIndex === 2 ? DIM : FAINT);
  });
  drawSignalRule(context, cx - radius, cy, cx + radius, cy, FAINT);
  drawSignalRule(context, cx, cy - radius, cx, cy + radius, FAINT);
  for (let sector = 0; sector < 36; sector += 1) {
    const angle = (sector / 36) * TAU;
    const distance = positiveModulo(sector - activeSector, 36);
    const level = distance === 0 ? 1 : distance <= 2 || distance >= 34 ? 0.58 : 0.18;
    const x = cx + Math.cos(angle) * radius * ringRatios[2];
    const y = cy + Math.sin(angle) * radius * ringRatios[2];
    cells.push({
      x: x - layout.cellSize * 0.5,
      y: y - layout.cellSize * 0.5,
      size: layout.cellSize,
      color: IVORY,
      state: quantizeSignalCellState(level, distance === 0),
      shape: sector % 9 === 0 ? "line" : distance === 0 ? "square" : "dot",
      rotation: angle + Math.PI / 2,
    });
  }
  drawSignalCells(context, cells);

  const targetAngle = (activeSector / 36) * TAU;
  const targetX = snapSignalCenter(layout, cx + Math.cos(targetAngle) * radius * ringRatios[2], "x");
  const targetY = snapSignalCenter(layout, cy + Math.sin(targetAngle) * radius * ringRatios[2], "y");
  const bracket = layout.cellSize * 1.2;
  context.strokeStyle = IVORY;
  context.lineWidth = 1;
  context.strokeRect(targetX - bracket / 2, targetY - bracket / 2, bracket, bracket);

  const railX = stacked ? content.x : content.x + orbitWidth + layout.cellSize * 2;
  const railY = stacked ? content.y + orbitHeight + layout.cellSize * 2 : content.y + layout.cellSize * 2;
  const railWidth = stacked ? content.width : content.width - orbitWidth - layout.cellSize * 2;
  const tiny = Math.max(7, layout.cellSize * 0.82);
  type(context, "ACQUISITION / LOCK", railX, railY, tiny, IVORY, "left", 650, {
    family: "pixel-circle",
    maxWidth: railWidth,
    tracking: layout.cellSize * 0.05,
    motion: 0.6,
    strength: confidence,
  });
  const lockValue = `${Math.round(86 + confidence * 13)}.${stateTick % 10}`;
  drawDotMatrixValue(
    context,
    lockValue,
    railX,
    railY + layout.cellSize * 2,
    Math.max(2, layout.cellSize * 0.72),
    IVORY,
    `${Math.round(86 + confidence * 13)}.${positiveModulo(stateTick - 1, 10)}`,
  );
  type(context, "CONFIDENCE", railX, railY + layout.cellSize * 7, tiny, DIM);
  const availableRailRows = Math.max(
    2,
    Math.min(8, Math.floor((content.y + content.height - railY) / (layout.cellSize * 2)) - 5),
  );
  for (let row = 0; row < availableRailRows; row += 1) {
    const values = Array.from({ length: Math.max(5, Math.floor(railWidth / layout.cellSize) - 2) }, (_, column) =>
      hash(column, row, Math.floor(stateTick / 4)),
    );
    drawCellStrip(
      context,
      railX,
      railY + layout.cellSize * (9 + row * 2),
      values,
      layout.cellSize,
      row === stateTick % 8 ? stateTick % values.length : -1,
    );
  }
}

function constellationMesh(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Constellation mesh", "NODE-42");
  const content = signalContent(frame);
  const nodes = Array.from({ length: 38 }, (_, index) => {
    const column = Math.floor(hash(index, 1, 73) * Math.max(2, content.width / layout.cellSize - 2)) + 1;
    const row = Math.floor(hash(index, 2, 19) * Math.max(2, content.height / layout.cellSize - 4)) + 1;
    return {
      x: content.x + (column + 0.5) * layout.cellSize,
      y: content.y + (row + 0.5) * layout.cellSize,
      active: hash(
        index,
        Math.floor(
          propagatedStateTick(stateTick, column, row, Math.max(1, Math.floor(content.width / layout.cellSize)), Math.max(1, Math.floor(content.height / layout.cellSize))) / 4,
        ),
        91,
      ) > 0.15,
    };
  });
  const route = [2, 8, 19, 31, 23, 35];
  const connectionRadius = layout.cellSize * 10;
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      if (!nodes[a].active || !nodes[b].active) continue;
      const distance = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].y - nodes[b].y);
      if (distance > connectionRadius || hash(a, b, 22) <= 0.54) continue;
      line(context, nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y, FAINT);
    }
  }
  for (let index = 0; index < route.length - 1; index += 1) {
    const from = nodes[route[index]];
    const to = nodes[route[index + 1]];
    if (index <= positiveModulo(Math.floor(stateTick / 3), route.length - 1)) {
      line(context, from.x, from.y, to.x, to.y, index === stateTick % (route.length - 1) ? MAGENTA : IVORY, 2);
    }
  }
  nodes.forEach((node, index) => {
    const size = route.includes(index) ? layout.cellSize * 0.82 : layout.cellSize * 0.5;
    context.fillStyle = index === route[stateTick % route.length] ? MAGENTA : node.active ? IVORY : FAINT;
    context.fillRect(node.x - size / 2, node.y - size / 2, size, size);
  });
  const tiny = Math.max(7, layout.cellSize * 0.82);
  type(context, "ROUTE / 02-08-19-31-23-35", content.x, content.y + content.height - layout.cellSize, tiny, IVORY);
  type(context, "38 PEERS / DISCRETE HANDSHAKE", content.x + content.width, content.y + content.height - layout.cellSize, tiny, DIM, "right");
}

function glyphCascade(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Glyph cascade", "RAIN-14");
  const content = signalContent(frame);
  const columns = Math.min(18, Math.max(10, Math.floor(content.width / (layout.cellSize * 3))));
  const rows = Math.max(8, Math.floor(content.height / (layout.cellSize * 2)));
  const alphabet = "AEFHKMNPRSTVX0123456789:/";
  const gridFit = fitCellGrid(layout, columns * 3, rows * 2, content);
  const scanRow = positiveModulo(stateTick, rows);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = gridFit.x + (column * 3 + 1.5) * layout.cellSize;
      const y = gridFit.y + (row * 2 + 1.35) * layout.cellSize;
      const cellTick = propagatedStateTick(stateTick, column, row, columns, rows);
      const glyphEpoch = Math.floor(cellTick / (2 + (column % 4)));
      const glyphIndex = Math.floor(hash(column, row, glyphEpoch) * alphabet.length);
      const head = row === positiveModulo(positiveModulo(cellTick, rows) + column * 3, rows);
      type(context, alphabet[glyphIndex], x, y, layout.cellSize * 1.35, head ? MAGENTA : hash(column, row, 90) > 0.7 ? IVORY : DIM, "center", head ? 700 : 400);
      if (hash(row, column, glyphEpoch >> 2) > 0.87) {
        context.fillStyle = head ? MAGENTA : IVORY;
        context.fillRect(x - layout.cellSize, y + layout.cellSize * 0.28, layout.cellSize * 2, layout.cellSize * 0.18);
      }
    }
  }
  context.fillStyle = "rgba(240, 237, 231, 0.09)";
  context.fillRect(content.x, gridFit.y + scanRow * layout.cellSize * 2, content.width, layout.cellSize * 2);
  line(context, content.x, gridFit.y + scanRow * layout.cellSize * 2, content.x + content.width, gridFit.y + scanRow * layout.cellSize * 2, MAGENTA, 1.5);
}

function barcodeCathedral(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Amplitude matrix", "NAVE-43");
  const content = signalContent(frame);
  const count = 43;
  const matrixRows = Math.max(14, Math.floor(content.height / layout.cellSize) - 4);
  const availableColumns = Math.floor(content.width / layout.cellSize);
  const channelStride = Math.max(1, Math.floor(availableColumns / count));
  const matrix = fitCellGrid(layout, count * channelStride, matrixRows, {
    x: content.x,
    y: content.y + layout.cellSize * 3,
    width: content.width,
    height: content.height - layout.cellSize * 4,
  });
  const write = positiveModulo(stateTick, count);
  for (let column = 0; column < count; column += 1) {
    const sampleEpoch = stateTick - positiveModulo(write - column, count);
    const wave = Math.sin(sampleEpoch * 0.36 + column * 0.22) * 0.5 + 0.5;
    const amplitude = clamp(wave * 0.64 + hash(column, sampleEpoch, 81) * 0.36);
    const centerRow = Math.max(1, Math.min(matrix.rows - 2, Math.round((1 - amplitude) * (matrix.rows - 3)) + 1));
    for (let row = 0; row < matrix.rows; row += 1) {
      const distance = Math.abs(row - centerRow);
      const active = distance <= 1;
      const x = matrix.x + column * channelStride * layout.cellSize + layout.cellSize * 0.18;
      const y = matrix.y + row * layout.cellSize + layout.cellSize * 0.18;
      context.fillStyle = column === write && active ? MAGENTA : active ? (distance === 0 ? IVORY : DIM) : "rgba(207, 204, 198, 0.025)";
      context.fillRect(
        x,
        y,
        layout.cellSize * channelStride - layout.cellSize * 0.36,
        layout.cellSize * 0.64,
      );
    }
  }
  const tiny = Math.max(7, layout.cellSize * 0.82);
  type(context, "AMPLITUDE MATRIX / 43", matrix.x, content.y + layout.cellSize, tiny, IVORY, "left", 650);
  type(context, "WRITE / SAMPLE HOLD", matrix.x + matrix.width, content.y + layout.cellSize, tiny, MAGENTA, "right", 520);
  drawDotMatrixValue(
    context,
    String(write).padStart(2, "0"),
    matrix.x + matrix.width - layout.cellSize * 8,
    content.y - layout.cellSize * 0.1,
    layout.cellSize * 0.64,
    MAGENTA,
    String(positiveModulo(write - 1, count)).padStart(2, "0"),
  );
}

function buildLifeStates(columns: number, rows: number, generations: number) {
  let state = new Uint8Array(columns * rows);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      state[y * columns + x] = hash(x, y, 177) > 0.71 ? 1 : 0;
    }
  }
  const states = [state];
  for (let step = 1; step < generations; step += 1) {
    const next = new Uint8Array(columns * rows);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        let neighbors = 0;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            if (ox === 0 && oy === 0) continue;
            const nx = positiveModulo(x + ox, columns);
            const ny = positiveModulo(y + oy, rows);
            neighbors += state[ny * columns + nx];
          }
        }
        const alive = state[y * columns + x] === 1;
        next[y * columns + x] = neighbors === 3 || (alive && neighbors === 2) ? 1 : 0;
      }
    }
    state = next;
    states.push(state);
  }
  return states;
}

const LIFE_COLUMNS = 26;
const LIFE_ROWS = 42;
const LIFE_STATES = buildLifeStates(LIFE_COLUMNS, LIFE_ROWS, 13);

function resolveLifeMetrics(stateTick: number) {
  const tick = Math.max(0, Math.floor(stateTick));
  const generation = Math.floor(tick / 5) % LIFE_STATES.length;
  const nextGeneration = (generation + 1) % LIFE_STATES.length;
  const propagationStage = tick % 5;
  const current = LIFE_STATES[generation];
  const next = LIFE_STATES[nextGeneration];
  let alive = 0;
  let births = 0;
  let deaths = 0;
  for (let row = 0; row < LIFE_ROWS; row += 1) {
    for (let column = 0; column < LIFE_COLUMNS; column += 1) {
      const index = row * LIFE_COLUMNS + column;
      const changed = current[index] !== next[index];
      const propagated = positiveModulo(column * 3 + row * 2, 5) <= propagationStage;
      const active = changed && propagated ? next[index] === 1 : current[index] === 1;
      if (active) alive += 1;
      if (current[index] === 0 && next[index] === 1) births += 1;
      if (current[index] === 1 && next[index] === 0) deaths += 1;
    }
  }
  return {
    generation,
    nextGeneration,
    propagationStage,
    current,
    next,
    alive,
    births,
    deaths,
    density: Math.round((alive / (LIFE_COLUMNS * LIFE_ROWS)) * 100),
    entropy: Math.round((births + deaths) * 0.71),
    edge: positiveModulo(alive + births * 3, 997),
    checksum: positiveModulo(alive * 17 + deaths * 31, 4096),
  };
}

function cellularAtlas(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Cellular atlas", "LIFE-32");

  const content = signalContent(frame);
  const metrics = resolveLifeMetrics(stateTick);
  const previousMetrics = resolveLifeMetrics(Math.max(0, stateTick - 1));
  const cellSize = layout.cellSize;
  const tiny = Math.max(7, layout.cellSize * 0.76);
  const sideStats = layout.profile !== "portrait" &&
    layout.profile !== "short" &&
    content.width >= cellSize * 58 &&
    content.width / Math.max(1, content.height) > 1.35;
  const labelHeight = Math.min(cellSize * 2.2, content.height * 0.12);
  const statsWidth = sideStats
    ? Math.min(cellSize * 18, content.width * 0.25)
    : content.width;
  const bottomStatsHeight = sideStats
    ? 0
    : Math.min(cellSize * 6, content.height * 0.27);
  const matrixWidth = Math.max(
    cellSize * 4,
    content.width - (sideStats ? statsWidth + cellSize * 2 : 0),
  );
  const matrixHeight = Math.max(
    cellSize * 4,
    content.height - labelHeight - bottomStatsHeight - cellSize,
  );
  const visibleColumns = Math.max(
    1,
    Math.min(LIFE_COLUMNS, Math.floor(matrixWidth / cellSize)),
  );
  const visibleRows = Math.max(
    1,
    Math.min(LIFE_ROWS, Math.floor(matrixHeight / cellSize)),
  );
  const scrollColumn = visibleColumns < LIFE_COLUMNS
    ? positiveModulo(Math.floor(stateTick / 4), LIFE_COLUMNS)
    : 0;
  const scrollRow = visibleRows < LIFE_ROWS
    ? positiveModulo(Math.floor(stateTick / 3), LIFE_ROWS)
    : 0;
  const fieldWidth = visibleColumns * cellSize;
  const fieldHeight = visibleRows * cellSize;
  const fieldX = content.x + Math.max(0, (matrixWidth - fieldWidth) / 2);
  const fieldY = content.y + labelHeight + Math.max(0, (matrixHeight - fieldHeight) / 2);

  type(
    context,
    `GENERATION DELTA / GEN ${String(metrics.generation).padStart(2, "0")} / VIEW ${visibleColumns}x${visibleRows}`,
    content.x,
    content.y + tiny,
    tiny,
    IVORY,
    "left",
    620,
    {
      family: "pixel-grid",
      maxWidth: matrixWidth,
      tracking: cellSize * 0.035,
      motion: 0.42,
    },
  );
  panel(context, fieldX, fieldY, fieldWidth, fieldHeight, DIM);
  for (let viewportRow = 0; viewportRow < visibleRows; viewportRow += 1) {
    for (let viewportColumn = 0; viewportColumn < visibleColumns; viewportColumn += 1) {
      const column = positiveModulo(scrollColumn + viewportColumn, LIFE_COLUMNS);
      const row = positiveModulo(scrollRow + viewportRow, LIFE_ROWS);
      const index = row * LIFE_COLUMNS + column;
      const cellTick = propagatedStateTick(
        stateTick,
        column,
        row,
        LIFE_COLUMNS,
        LIFE_ROWS,
      );
      const source = cellTick === stateTick ? metrics : previousMetrics;
      const history = LIFE_STATES[
        positiveModulo(source.generation - 1, LIFE_STATES.length)
      ][index] === 1;
      const current = source.current[index] === 1;
      const next = source.next[index] === 1;
      const state = !current && next
        ? quantizeSignalCellState(0.58, true, 1)
        : current && !next
          ? quantizeSignalCellState(0.58, false, -1)
          : current && next
            ? quantizeSignalCellState(1)
            : history
              ? quantizeSignalCellState(0.2)
              : quantizeSignalCellState(0);
      drawSignalCellMark(context, {
        x: fieldX + viewportColumn * cellSize + cellSize * 0.05,
        y: fieldY + viewportRow * cellSize + cellSize * 0.05,
        size: cellSize * 0.9,
        state,
        shape: state === "low" ? "dot" : "square",
        color: IVORY,
      });
    }
  }

  const stats = [
    ["GEN", metrics.generation],
    ["POP", metrics.alive],
    ["BIRTH", metrics.births],
    ["DEATH", metrics.deaths],
    ["DENS", `${metrics.density}%`],
    ["ENT", metrics.entropy],
  ] as const;
  const statsX = sideStats ? content.x + content.width - statsWidth : content.x;
  const statsY = sideStats ? content.y : content.y + content.height - bottomStatsHeight;
  const statsColumns = sideStats ? 1 : content.width >= cellSize * 42 ? 6 : 3;
  const statsRows = Math.ceil(stats.length / statsColumns);
  const statWidth = statsWidth / statsColumns;
  const statHeight = Math.max(
    tiny * 1.35,
    (sideStats ? content.height : bottomStatsHeight) / statsRows,
  );
  drawSignalRule(
    context,
    statsX,
    statsY,
    sideStats ? statsX : statsX + statsWidth,
    sideStats ? statsY + content.height : statsY,
    DIM,
  );
  stats.forEach(([label, value], index) => {
    const column = index % statsColumns;
    const row = Math.floor(index / statsColumns);
    const x = statsX + column * statWidth + (sideStats ? cellSize : cellSize * 0.2);
    const y = statsY + row * statHeight + statHeight * 0.68;
    type(
      context,
      `${label} ${String(value).padStart(3, "0")}`,
      x,
      y,
      tiny,
      IVORY,
      "left",
      label === "BIRTH" || label === "DEATH" ? 620 : 420,
      {
        family: label === "BIRTH" || label === "DEATH" ? "pixel-square" : "mono",
        maxWidth: Math.max(cellSize * 2, statWidth - cellSize * 0.4),
        tracking: cellSize * 0.025,
      },
    );
  });
}

function packetRiver(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Packet river", "FLOW-06");
  const content = signalContent(frame);
  const lanes = 7;
  const pathRows = Math.max(12, Math.floor(content.height / layout.cellSize) - 2);
  const laneSpacing = content.width / lanes;
  const tiny = Math.max(7, layout.cellSize * 0.78);
  for (let lane = 0; lane < lanes; lane += 1) {
    const centerColumn = Math.floor((content.x + laneSpacing * (lane + 0.5) - layout.originX) / layout.cellSize);
    const path: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < pathRows; row += 1) {
      const bend = Math.round(Math.sin(row * 0.58 + lane * 1.7) * (1 + lane % 3));
      const x = layout.originX + (centerColumn + bend + 0.5) * layout.cellSize;
      const y = content.y + (row + 0.5) * layout.cellSize;
      path.push({ x, y });
      context.fillStyle = row % 5 === 0 ? DIM : FAINT;
      context.fillRect(x - layout.cellSize * 0.2, y - layout.cellSize * 0.2, layout.cellSize * 0.4, layout.cellSize * 0.4);
      if (row > 0) line(context, path[row - 1].x, path[row - 1].y, x, y, lane === 3 ? DIM : FAINT);
    }
    for (let packet = 0; packet < 4; packet += 1) {
      const packetTick = propagatedStateTick(stateTick, lane, packet, lanes, 4);
      const hop = positiveModulo(packetTick + packet * 9 + lane * 5, path.length);
      const node = path[hop];
      const size = layout.cellSize * (packet === 0 ? 0.88 : 0.62);
      context.fillStyle = lane === 3 && packet === 0 ? MAGENTA : IVORY;
      context.fillRect(node.x - size / 2, node.y - size / 2, size, size);
    }
    type(
      context,
      String(lane + 1).padStart(2, "0"),
      layout.originX + (centerColumn + 0.5) * layout.cellSize,
      content.y + content.height,
      tiny,
      lane === 3 ? MAGENTA : DIM,
      "center",
    );
  }
}

function seismicField(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Seismic field", "QUAKE-12");
  const content = signalContent(frame);
  const tracks = 12;
  const columns = Math.max(24, Math.floor(content.width / layout.cellSize) - 4);
  const trackStep = Math.max(2, Math.floor(content.height / layout.cellSize / tracks));
  const epicenterColumn = positiveModulo(stateTick, columns);
  const firstColumn = Math.floor((content.x - layout.originX) / layout.cellSize) + 2;
  const firstRow = Math.floor((content.y - layout.originY) / layout.cellSize) + 1;
  for (let track = 0; track < tracks; track += 1) {
    const baselineRow = firstRow + track * trackStep;
    const baseline = layout.originY + (baselineRow + 0.5) * layout.cellSize;
    line(context, layout.originX + firstColumn * layout.cellSize, baseline, layout.originX + (firstColumn + columns) * layout.cellSize, baseline, FAINT);
    for (let sample = 0; sample < columns; sample += 1) {
      const sampleTick = propagatedStateTick(stateTick, sample, track, columns, tracks);
      const sampleEpicenter = positiveModulo(sampleTick, columns);
      const envelope = Math.max(0, 1 - Math.abs(sample - sampleEpicenter) / 10);
      const raw = Math.sin(sample * 0.73 + track * 1.81 + Math.floor(sampleTick / 2)) * envelope;
      const amplitude = Math.round(raw * Math.min(2, Math.max(1, trackStep - 1)));
      const x = layout.originX + (firstColumn + sample + 0.5) * layout.cellSize;
      const y = baseline + amplitude * layout.cellSize;
      const event = sample === sampleEpicenter && track === sampleTick % tracks;
      context.fillStyle = event ? MAGENTA : Math.abs(amplitude) > 0 ? IVORY : DIM;
      context.fillRect(x - layout.cellSize * 0.26, y - layout.cellSize * 0.26, layout.cellSize * 0.52, layout.cellSize * 0.52);
    }
  }
  const focalX = layout.originX + (firstColumn + epicenterColumn + 0.5) * layout.cellSize;
  const focalY = layout.originY + (firstRow + Math.floor(tracks * trackStep * 0.48)) * layout.cellSize;
  for (let radius = 1; radius <= 5; radius += 1) {
    const distance = radius + positiveModulo(Math.floor(stateTick / 2), 3);
    const ringCells: SignalCell[] = [];
    for (let dy = -distance; dy <= distance; dy += 1) {
      for (let dx = -distance; dx <= distance; dx += 1) {
        if (Math.abs(dx) + Math.abs(dy) !== distance) continue;
        const size = layout.cellSize * 0.28;
        const x = focalX + dx * layout.cellSize - size / 2;
        const y = focalY + dy * layout.cellSize - size / 2;
        if (x < 0 || y < 0 || x + size > width || y + size > height) continue;
        ringCells.push({
          x,
          y,
          size,
          color: radius === 5 ? MAGENTA : DIM,
        });
      }
    }
    drawSignalCells(context, ringCells);
  }
  const epicenterY = content.y + content.height;
  type(context, "EPICENTER / COLUMN", content.x, epicenterY, Math.max(7, layout.cellSize * 0.8), IVORY);
  drawDotMatrixValue(
    context,
    String(epicenterColumn).padStart(3, "0"),
    content.x + layout.cellSize * 14,
    epicenterY - layout.cellSize * 0.9,
    layout.cellSize * 0.18,
    MAGENTA,
    String(positiveModulo(epicenterColumn - 1, columns)).padStart(3, "0"),
  );
}

function clockworkRings(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Clockwork rings", "GEAR-05");
  const content = signalContent(frame);
  const stacked = layout.profile === "portrait";
  const mechanismWidth = stacked ? content.width : content.width * 0.64;
  const cx = snapSignalCenter(layout, content.x + mechanismWidth * 0.5, "x");
  const cy = snapSignalCenter(layout, content.y + content.height * (stacked ? 0.38 : 0.5), "y");
  const maximum = Math.floor(
    Math.min(mechanismWidth, content.height * (stacked ? 0.62 : 0.9)) * 0.48 / layout.cellSize,
  ) * layout.cellSize;
  const ratios = [1, -2, 3, -5, 8];
  for (let ring = 0; ring < ratios.length; ring += 1) {
    const radius = maximum * (0.25 + ring * 0.17);
    const teeth = 18 + ring * 8;
    for (let tooth = 0; tooth < teeth; tooth += 1) {
      const toothTick = propagatedStateTick(stateTick, tooth, ring, teeth, ratios.length);
      const activeTooth = positiveModulo(toothTick * ratios[ring], teeth);
      const angle = (tooth / teeth) * TAU + ring * 0.11;
      const x = snapSignalCenter(layout, cx + Math.cos(angle) * radius, "x");
      const y = snapSignalCenter(layout, cy + Math.sin(angle) * radius, "y");
      const cardinal = tooth % Math.max(1, Math.floor(teeth / 4)) === 0;
      const size = layout.cellSize * (cardinal ? 0.72 : 0.46);
      context.fillStyle = tooth === activeTooth ? MAGENTA : cardinal ? IVORY : DIM;
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
  context.fillStyle = IVORY;
  context.fillRect(cx - layout.cellSize * 0.65, cy - layout.cellSize * 0.65, layout.cellSize * 1.3, layout.cellSize * 1.3);
  const railX = snapSignalCenter(layout, stacked ? content.x : content.x + mechanismWidth + layout.cellSize * 2, "x") - layout.cellSize * 0.5;
  const railY = snapSignalCenter(layout, stacked ? content.y + content.height * 0.72 : content.y + layout.cellSize * 4, "y") + layout.cellSize * 0.5;
  const tiny = Math.max(7, layout.cellSize * 0.78);
  type(context, "ESCAPEMENT / COHERENCE", railX, railY, tiny, MAGENTA, "left", 650);
  ratios.forEach((ratio, index) => {
    const y = railY + layout.cellSize * (2 + index * 2);
    type(context, `R${index + 1} / ${ratio > 0 ? "+" : ""}${ratio}`, railX, y, tiny, DIM);
    const values = Array.from({ length: 9 }, (_, column) =>
      positiveModulo(stateTick * Math.abs(ratio) - column, 9) === 0 ? 1 : hash(index, column, 5) * 0.32,
    );
    drawCellStrip(context, railX + layout.cellSize * 5, y - layout.cellSize, values, layout.cellSize, positiveModulo(stateTick * ratio, values.length));
  });
  type(context, "PHASE LOCKED / ERROR 00.03", railX, railY + layout.cellSize * 14, tiny, IVORY);
}

function vectorScope(frame: SceneFrame) {
  const { context, width, height, stateTick, phase, layout } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Vector scope", "XY-09");

  const content = signalContent(frame);
  const cellSize = layout.cellSize;
  const railHeight = Math.min(cellSize * 6, content.height * 0.3);
  const instrumentHeight = Math.max(cellSize * 4, content.height - railHeight - cellSize);
  const cx = snapSignalCenter(layout, content.x + content.width / 2, "x");
  const cy = snapSignalCenter(layout, content.y + instrumentHeight / 2, "y");
  const radius = Math.max(
    cellSize * 2,
    Math.min(content.width - cellSize * 2, instrumentHeight - cellSize * 2) * 0.47,
  );

  drawSignalCircle(context, cx, cy, radius, DIM);
  drawSignalRule(context, cx - radius, cy, cx + radius, cy, FAINT);
  drawSignalRule(context, cx, cy - radius, cx, cy + radius, FAINT);
  for (let tick = 0; tick < 24; tick += 1) {
    const angle = (tick / 24) * TAU;
    const length = cellSize * (tick % 6 === 0 ? 0.72 : tick % 3 === 0 ? 0.5 : 0.3);
    drawSignalRule(
      context,
      cx + Math.cos(angle) * (radius - length),
      cy + Math.sin(angle) * (radius - length),
      cx + Math.cos(angle) * radius,
      cy + Math.sin(angle) * radius,
      tick % 6 === 0 ? IVORY : DIM,
    );
  }
  drawSignalCellMark(context, {
    x: cx - cellSize * 0.42,
    y: cy - cellSize * 0.42,
    size: cellSize * 0.84,
    state: "outline",
    shape: "cross",
    color: IVORY,
  });

  const sampleCount = Math.max(72, Math.min(160, Math.floor(radius / cellSize) * 8));
  const tracePhase = phase * TAU * 1.35 + stateTick * 0.025;
  const traceHead = positiveModulo(stateTick * 3, sampleCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const amount = (sample / sampleCount) * TAU;
    const previousAmount = ((sample - 1) / sampleCount) * TAU;
    const x = cx + Math.sin(amount * 2 + tracePhase) * radius * 0.76;
    const y = cy + Math.sin(amount * 3 + tracePhase * 0.61 + 0.82) * radius * 0.76;
    const level = clamp(0.48 + Math.sin(amount * 5 + tracePhase * 0.72) * 0.48);
    const previousLevel = clamp(
      0.48 + Math.sin(previousAmount * 5 + tracePhase * 0.72) * 0.48,
    );
    const state = quantizeSignalCellState(
      level,
      sample === traceHead,
      (level - previousLevel) * 3.4,
    );
    drawSignalCellMark(context, {
      x: x - cellSize * 0.42,
      y: y - cellSize * 0.42,
      size: cellSize * 0.84,
      state,
      shape: state === "low" || state === "mid" ? "dot" : "square",
      color: IVORY,
      alpha: sample === traceHead ? 1 : 0.78,
    });
  }

  const errorAngle = tracePhase * 0.37 - Math.PI / 5;
  const errorMagnitude = radius * (0.28 + hash(stateTick, 9, 41) * 0.24);
  const errorX = cx + Math.cos(errorAngle) * errorMagnitude;
  const errorY = cy + Math.sin(errorAngle) * errorMagnitude;
  drawSignalRule(context, cx, cy, errorX, errorY, IVORY);
  const arrowSize = cellSize * 0.72;
  drawSignalRule(
    context,
    errorX,
    errorY,
    errorX - Math.cos(errorAngle - 0.55) * arrowSize,
    errorY - Math.sin(errorAngle - 0.55) * arrowSize,
    IVORY,
  );
  drawSignalRule(
    context,
    errorX,
    errorY,
    errorX - Math.cos(errorAngle + 0.55) * arrowSize,
    errorY - Math.sin(errorAngle + 0.55) * arrowSize,
    IVORY,
  );
  drawSignalCellMark(context, {
    x: errorX - cellSize * 0.5,
    y: errorY - cellSize * 0.5,
    size: cellSize,
    state: "outline",
    color: IVORY,
  });

  const railY = content.y + content.height - railHeight;
  drawSignalRule(context, content.x, railY, content.x + content.width, railY, DIM);
  const railCount = Math.max(10, Math.floor(content.width / (cellSize * 1.2)));
  const railStep = content.width / railCount;
  const railMarkSize = Math.min(cellSize * 0.7, railHeight * 0.16);
  for (let index = 0; index < railCount; index += 1) {
    const amount = clamp(0.5 + Math.sin(index * 0.72 - tracePhase * 1.8) * 0.5);
    drawSignalCellMark(context, {
      x: content.x + index * railStep + (railStep - railMarkSize) / 2,
      y: railY + railHeight * 0.08,
      size: railMarkSize,
      state: quantizeSignalCellState(amount, index === traceHead % railCount),
      shape: amount < 0.45 ? "dot" : "line",
      rotation: 0,
      color: IVORY,
    });
  }
  const tiny = Math.max(7, layout.cellSize * 0.8);
  type(
    context,
    "PHASE / CELL LOCK",
    content.x,
    railY + railHeight * 0.58,
    Math.max(tiny, cellSize * 1.45),
    IVORY,
    "left",
    700,
    {
      family: "pixel-line",
      maxWidth: content.width,
      tracking: cellSize * 0.16,
      motion: 1,
    },
  );
  const footerWidth = Math.max(cellSize * 4, (content.width - cellSize) / 2);
  type(
    context,
    `PHASE ${(positiveModulo(tracePhase, TAU) / TAU).toFixed(3)}`,
    content.x,
    railY + railHeight * 0.9,
    tiny,
    DIM,
    "left",
    420,
    { family: "mono", maxWidth: footerWidth },
  );
  type(
    context,
    `ERR ${(errorMagnitude / Math.max(1, radius)).toFixed(3)} / X 02 Y 03`,
    content.x + content.width,
    railY + railHeight * 0.9,
    tiny,
    IVORY,
    "right",
    520,
    { family: "mono", maxWidth: footerWidth },
  );
}

function memoryMap(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Memory map", "RAM-64");
  const content = signalContent(frame);
  const columns = 8;
  const rows = 14;
  const availableColumns = Math.floor(content.width / layout.cellSize);
  const availableRows = Math.floor(content.height / layout.cellSize) - 3;
  const moduleColumns = Math.max(1, Math.floor(availableColumns / columns));
  const moduleRows = Math.max(1, Math.floor(availableRows / rows));
  const map = fitCellGrid(layout, moduleColumns * columns, moduleRows * rows, content);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = map.x + column * moduleColumns * layout.cellSize + layout.cellSize * 0.15;
      const y = map.y + row * moduleRows * layout.cellSize + layout.cellSize * 0.15;
      const cellWidth = moduleColumns * layout.cellSize - layout.cellSize * 0.3;
      const cellHeight = moduleRows * layout.cellSize - layout.cellSize * 0.3;
      const value = hash(column, row, 304);
      const cellTick = propagatedStateTick(stateTick, column, row, columns, rows);
      const active = positiveModulo(row * columns + column + Math.floor(cellTick / 3), 31) < 3;
      context.fillStyle = active ? MAGENTA : value > 0.72 ? "rgba(207, 204, 198, 0.82)" : value > 0.35 ? "rgba(207, 204, 198, 0.24)" : "rgba(207, 204, 198, 0.06)";
      context.fillRect(x, y, cellWidth, cellHeight);
      if (value > 0.84) {
        context.fillStyle = NIGHT;
        context.fillRect(x + cellWidth * 0.18, y + cellHeight * 0.25, cellWidth * 0.64, Math.max(1, cellHeight * 0.14));
      }
    }
  }
  const tiny = Math.max(7, layout.cellSize * 0.78);
  const footerY = content.y + content.height;
  type(context, "0000", content.x, footerY, tiny, IVORY);
  type(context, "FFFF", content.x + content.width, footerY, tiny, IVORY, "right");
  type(context, "64 KB / CELL ALLOCATION 87.2", content.x + content.width / 2, footerY, tiny, MAGENTA, "center");
}

function waveformStack(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Waveform stack", "WAVE-16");
  const content = signalContent(frame);
  const tracks = 16;
  const trackStep = Math.max(2, Math.floor(content.height / layout.cellSize / tracks));
  const firstColumn = Math.floor((content.x - layout.originX) / layout.cellSize) + 5;
  const columns = Math.max(16, Math.floor(content.width / layout.cellSize) - 6);
  const firstRow = Math.floor((content.y - layout.originY) / layout.cellSize);
  const tiny = Math.max(7, layout.cellSize * 0.7);
  for (let track = 0; track < tracks; track += 1) {
    const baselineRow = firstRow + track * trackStep + Math.floor(trackStep / 2);
    const baseline = layout.originY + (baselineRow + 0.5) * layout.cellSize;
    type(context, String(track + 1).padStart(2, "0"), content.x, baseline + layout.cellSize * 0.25, tiny, DIM);
    for (let sample = 0; sample < columns; sample += 1) {
      const sampleTick = propagatedStateTick(
        stateTick,
        sample,
        track,
        columns,
        tracks,
      );
      const amount = sample / Math.max(1, columns - 1);
      const carrier = Math.sin(amount * TAU * (2 + track * 0.18) + sampleTick * (0.12 + track * 0.004));
      const modulator = Math.sin(amount * TAU * 7 + track * 0.81 + sampleTick * 0.08);
      const gate = Math.sin(amount * Math.PI * (3 + track % 3)) > -0.45 ? 1 : 0.15;
      const amplitude = Math.round(carrier * modulator * gate * Math.max(1, trackStep * 0.42));
      const x = layout.originX + (firstColumn + sample + 0.5) * layout.cellSize;
      const y = baseline + amplitude * layout.cellSize;
      context.fillStyle = track === sampleTick % tracks && sample === sampleTick % columns
        ? MAGENTA
        : Math.abs(amplitude) > 0 ? (track % 5 === 0 ? IVORY : DIM) : FAINT;
      context.fillRect(x - layout.cellSize * 0.23, y - layout.cellSize * 0.23, layout.cellSize * 0.46, layout.cellSize * 0.46);
    }
  }
  type(context, "16 BUS / COHERENCE 0.9984", content.x, content.y + content.height, tiny, IVORY);
}

function dataLoom(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Data loom", "WARP-18");
  const content = signalContent(frame);
  const warps = 18;
  const wefts = Math.max(16, Math.min(24, Math.floor(content.height / layout.cellSize) - 3));
  const firstColumn = Math.floor((content.x - layout.originX) / layout.cellSize) + 1;
  const firstRow = Math.floor((content.y - layout.originY) / layout.cellSize) + 1;
  const columnSpan = Math.max(warps, Math.floor(content.width / layout.cellSize) - 2);
  const rowSpan = Math.max(wefts, Math.floor(content.height / layout.cellSize) - 3);
  const warpColumns = Array.from({ length: warps }, (_, index) =>
    firstColumn + Math.round((index / (warps - 1)) * (columnSpan - 1)),
  );
  const weftRows = Array.from({ length: wefts }, (_, index) =>
    firstRow + Math.round((index / Math.max(1, wefts - 1)) * (rowSpan - 1)),
  );
  for (let warp = 0; warp < warps; warp += 1) {
    const x = layout.originX + (warpColumns[warp] + 0.5) * layout.cellSize;
    line(
      context,
      x,
      layout.originY + (firstRow + 0.5) * layout.cellSize,
      x,
      layout.originY + (firstRow + rowSpan - 0.5) * layout.cellSize,
      warp === stateTick % warps ? DIM : FAINT,
    );
  }
  for (let weft = 0; weft < wefts; weft += 1) {
    const y = layout.originY + (weftRows[weft] + 0.5) * layout.cellSize;
    for (let warp = 0; warp < warps; warp += 1) {
      const x = layout.originX + (warpColumns[warp] + 0.5) * layout.cellSize;
      const cellTick = propagatedStateTick(stateTick, warp, weft, warps, wefts);
      const shuttle = positiveModulo(cellTick * (weft % 2 === 0 ? 1 : -1) + weft * 3, warps);
      const active = warp === shuttle;
      const woven = positiveModulo(warp * 3 + weft * 5 + Math.floor(cellTick / 6), 11) < 4;
      const size = layout.cellSize * (active ? 0.78 : woven ? 0.48 : 0.24);
      context.fillStyle = active && weft === stateTick % wefts ? MAGENTA : active ? IVORY : woven ? DIM : FAINT;
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
  type(context, `WARP 18 / WEFT ${String(wefts).padStart(2, "0")} / SHUTTLE CELL`, content.x, content.y + content.height, Math.max(7, layout.cellSize * 0.78), DIM);
}

function hexField(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Hex field", "HEX-19");
  const content = signalContent(frame);
  const firstColumn = Math.floor((content.x - layout.originX) / layout.cellSize) + 1;
  const firstRow = Math.floor((content.y - layout.originY) / layout.cellSize) + 1;
  const columns = Math.max(12, Math.floor(content.width / layout.cellSize) - 2);
  const rows = Math.max(12, Math.floor(content.height / layout.cellSize) - 3);
  const centerColumn = Math.floor(columns / 2);
  const centerRow = Math.floor(rows / 2);
  const maximumRadius = Math.max(3, Math.floor(Math.min(columns, rows) / 2));
  const pulse = positiveModulo(Math.floor(stateTick / 2), maximumRadius + 1);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      if (positiveModulo(column + row * 2, 3) !== 0) continue;
      const q = column - centerColumn;
      const r = row - centerRow;
      const hexDistance = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
      const cellTick = propagatedStateTick(stateTick, column, row, columns, rows);
      const cellPulse = positiveModulo(Math.floor(cellTick / 2), maximumRadius + 1);
      const active = Math.abs(hexDistance - cellPulse) <= 1;
      const x = layout.originX + (firstColumn + column + 0.5) * layout.cellSize;
      const y = layout.originY + (firstRow + row + 0.5) * layout.cellSize;
      context.strokeStyle = active ? MAGENTA : hash(column, row, 55) > 0.72 ? IVORY : DIM;
      context.lineWidth = active ? 2 : 1;
      context.strokeRect(
        x - layout.cellSize * 0.34,
        y - layout.cellSize * 0.34,
        layout.cellSize * 0.68,
        layout.cellSize * 0.68,
      );
      if (active || hash(column, row, Math.floor(cellTick / 6)) > 0.9) {
        const size = layout.cellSize * (active ? 0.42 : 0.24);
        context.fillStyle = active ? MAGENTA : IVORY;
        context.fillRect(x - size / 2, y - size / 2, size, size);
      }
    }
  }
  const tiny = Math.max(7, layout.cellSize * 0.78);
  type(context, "RADIUS CELL", content.x, content.y + content.height, tiny, IVORY);
  drawDotMatrixValue(
    context,
    String(pulse).padStart(3, "0"),
    content.x + layout.cellSize * 9,
    content.y + content.height - layout.cellSize * 0.9,
    layout.cellSize * 0.18,
    IVORY,
    String(positiveModulo(Math.floor(Math.max(0, stateTick - 1) / 2), maximumRadius + 1)).padStart(3, "0"),
  );
  type(context, "SIX-LINK / ACTIVE", content.x + content.width, content.y + content.height, tiny, MAGENTA, "right");
}

function satelliteTopology(frame: SceneFrame) {
  const { context, width, height, stateTick, confidence, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Satellite topology", "SAT-08");
  const content = signalContent(frame);
  const cell = layout.cellSize;
  const stackedRail = layout.profile === "portrait" || content.width / content.height < 1.45;
  const visualWidth = stackedRail
    ? content.width
    : Math.max(cell, Math.floor((content.width * 0.7) / cell) * cell);
  const visualHeight = stackedRail
    ? Math.max(cell, Math.floor((content.height * 0.7) / cell) * cell)
    : content.height;
  const railGap = cell * 2;
  const railX = stackedRail ? content.x : content.x + visualWidth + railGap;
  const railY = stackedRail ? content.y + visualHeight + railGap : content.y + cell * 2;
  const railWidth = stackedRail
    ? content.width
    : Math.max(cell, content.width - visualWidth - railGap);
  const cx = snapSignalCenter(layout, content.x + visualWidth * 0.5, "x");
  const cy = snapSignalCenter(layout, content.y + visualHeight * 0.5, "y");
  const shortDimension = Math.min(content.width, content.height);
  const planetRadius = shortDimension * 0.24;
  const planetRadiusCells = planetRadius / cell;
  const hairline = Math.max(0.75, cell * 0.055);
  const orbitSpecs = [
    { rx: planetRadius * 1.42, ry: planetRadius * 0.72, rotation: -0.34, speed: 1 },
    { rx: planetRadius * 1.72, ry: planetRadius * 0.9, rotation: 0.14, speed: -2 },
    { rx: planetRadius * 2.02, ry: planetRadius * 1.08, rotation: 0.42, speed: 3 },
  ] as const;
  const activeOrbit = positiveModulo(Math.floor(stateTick / 6), orbitSpecs.length);
  const satellites = orbitSpecs.map((orbit, index) => {
    const steps = 48 + index * 12;
    const step = positiveModulo(stateTick * orbit.speed + index * 13, steps);
    const angle = (step / steps) * TAU;
    const localX = Math.cos(angle) * orbit.rx;
    const localY = Math.sin(angle) * orbit.ry;
    return {
      x: cx + localX * Math.cos(orbit.rotation) - localY * Math.sin(orbit.rotation),
      y: cy + localX * Math.sin(orbit.rotation) + localY * Math.cos(orbit.rotation),
      active: index === activeOrbit,
    };
  });

  for (const orbit of orbitSpecs) {
    drawSignalEllipse(context, cx, cy, orbit.rx, orbit.ry, orbit.rotation, DIM);
  }
  const activeSatellite = satellites[activeOrbit];
  line(
    context,
    cx,
    cy,
    activeSatellite.x,
    activeSatellite.y,
    IVORY,
    hairline,
  );

  const planetExtent = Math.ceil(planetRadiusCells);
  for (let row = -planetExtent; row <= planetExtent; row += 1) {
    for (let column = -planetExtent; column <= planetExtent; column += 1) {
      const nx = column / planetRadiusCells;
      const ny = row / planetRadiusCells;
      const radialDistance = Math.hypot(nx, ny);
      if (radialDistance > 1) continue;
      const cellTick = propagatedStateTick(
        stateTick,
        column + planetExtent,
        row + planetExtent,
        planetExtent * 2 + 1,
        planetExtent * 2 + 1,
      );
      const sphereDepth = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lightingState = Math.floor(cellTick / 6) % 4;
      const lightAngle = -0.92 + lightingState * 0.46;
      const lightLevel = nx * Math.cos(lightAngle) - ny * Math.sin(lightAngle) + sphereDepth * 0.72;
      const rotation = (Math.floor(cellTick / 9) % 18) / 18 * TAU;
      const longitude = Math.atan2(nx, sphereDepth) + rotation;
      const latitude = Math.asin(clamp(ny, -1, 1));
      const continentBand =
        Math.sin(longitude * 2.35 + Math.sin(latitude * 3.2)) +
        Math.cos(latitude * 5.4 - longitude * 0.72) * 0.72 +
        Math.sin(longitude * 4.8 + latitude * 1.6) * 0.28 +
        (hash(column, row, 804) - 0.5) * 0.62;
      const land = continentBand > 0.4;
      const signalCell = positiveModulo(cellTick + column * 3 + row * 5, 17) === 0;
      context.fillStyle = signalCell && lightLevel > 0.3
        ? IVORY
        : land
          ? lightLevel > 0.56 ? IVORY : DIM
          : lightLevel > 0.7 ? DIM : FAINT;
      const size = cell * (radialDistance > 0.94 ? 0.66 : 0.9);
      context.fillRect(cx + column * cell - size / 2, cy + row * cell - size / 2, size, size);
    }
  }
  drawSignalCircle(context, cx, cy, planetRadius, IVORY);

  satellites.forEach((satellite) => {
    const size = cell * (satellite.active ? 0.72 : 0.48);
    context.fillStyle = satellite.active ? IVORY : DIM;
    context.fillRect(satellite.x - size / 2, satellite.y - size / 2, size, size);
    if (!satellite.active) return;
    const lockSize = cell * 1.55;
    context.strokeStyle = IVORY;
    context.lineWidth = hairline;
    context.strokeRect(
      satellite.x - lockSize / 2,
      satellite.y - lockSize / 2,
      lockSize,
      lockSize,
    );
  });

  const tiny = Math.max(7, layout.cellSize * 0.78);
  type(context, "ORBIT / SHARED CENTER", railX, railY, tiny, IVORY, "left", 650);
  if (stackedRail) {
    satellites.forEach((satellite, index) => {
      const x = railX + (railWidth / satellites.length) * index;
      type(context, `SAT-${index + 1} / ${satellite.active ? "LINK" : "HOLD"}`, x, railY + cell * 2, tiny, satellite.active ? IVORY : DIM);
    });
  } else {
    satellites.forEach((satellite, index) => {
      type(
        context,
        `SAT-${index + 1} / ${satellite.active ? "LINK" : "HOLD"}`,
        railX,
        railY + cell * (3 + index * 2),
        tiny,
        satellite.active ? IVORY : DIM,
      );
    });
  }
  const confidenceValue = (confidence * 99.8).toFixed(1).padStart(4, "0");
  const previousConfidence = Math.min(99.8, confidence * 99.8 + 0.8).toFixed(1).padStart(4, "0");
  const lockY = railY + cell * (stackedRail ? 4.2 : 11);
  type(context, "LINK CONFIDENCE", railX, lockY, tiny, DIM);
  drawDotMatrixValue(
    context,
    confidenceValue,
    railX,
    lockY + cell,
    Math.max(1, cell * 0.24),
    IVORY,
    previousConfidence,
  );
}

function archiveIndex(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Archive index", "ARC-96");
  const content = signalContent(frame);
  const contentColumns = Math.floor(content.width / layout.cellSize);
  const columnGap = layout.cellSize * 2;
  const columnCells = Math.max(8, Math.floor((contentColumns - 2) / 2));
  const columnWidth = columnCells * layout.cellSize;
  const rowHeight = layout.cellSize * Math.max(1, Math.floor((content.height / layout.cellSize - 7) / 19));
  const rowTypeSize = Math.max(7, layout.cellSize * 0.72);
  const labels = ["FIELD", "ORBIT", "GLYPH", "MEMORY", "VECTOR", "PACKET", "SIGNAL", "FRAME"];
  for (let column = 0; column < 2; column += 1) {
    const x = content.x + column * (columnWidth + columnGap);
    panel(context, x, content.y, columnWidth, rowHeight * 20);
    for (let row = 0; row < 19; row += 1) {
      const y = content.y + rowHeight * (row + 1.35);
      const index = column * 19 + row;
      const cellTick = propagatedStateTick(stateTick, column, row, 2, 19);
      const selected = index === Math.floor(cellTick / 2) % 38;
      if (selected) {
        context.fillStyle = MAGENTA;
        context.fillRect(x + layout.cellSize * 0.15, y - rowHeight * 0.78, columnWidth - layout.cellSize * 0.3, rowHeight * 0.9);
      }
      type(context, String(index + 1).padStart(3, "0"), x + layout.cellSize, y, rowTypeSize, selected ? OXBLOOD : IVORY);
      type(context, labels[index % labels.length], x + layout.cellSize * 6, y, rowTypeSize, selected ? OXBLOOD : DIM);
      type(context, String(Math.floor(hash(index, 2, 88) * 9999)).padStart(4, "0"), x + columnWidth - layout.cellSize, y, rowTypeSize, selected ? OXBLOOD : DIM, "right");
    }
  }
  const footerY = content.y + content.height;
  type(context, "A", content.x, footerY, layout.cellSize * 3.2, IVORY, "left", 700);
  type(context, "96", content.x + content.width / 2, footerY, layout.cellSize * 3.2, MAGENTA, "center", 700);
  type(context, "Z", content.x + content.width, footerY, layout.cellSize * 3.2, IVORY, "right", 700);
}

function rasterPortrait(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Raster portrait", "FACE-01");
  const content = signalContent(frame);
  const columns = 25;
  const rows = 35;
  const portrait = fitCellGrid(layout, columns, rows, content);
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const nx = (column - (columns - 1) / 2) / (columns * 0.42);
      const ny = (row - rows * 0.45) / (rows * 0.49);
      const face = nx * nx + Math.pow(ny * 0.88, 2) < 1;
      const eye = Math.abs(ny + 0.19) < 0.085 && (Math.abs(nx - 0.37) < 0.15 || Math.abs(nx + 0.37) < 0.15);
      const nose = Math.abs(nx) < 0.09 && ny > -0.1 && ny < 0.36;
      const mouth = Math.abs(ny - 0.48) < 0.055 && Math.abs(nx) < 0.42;
      const edge = face && nx * nx + Math.pow(ny * 0.88, 2) > 0.77;
      const cellTick = propagatedStateTick(stateTick, column, row, columns, rows);
      const dropout = hash(column, row, Math.floor(cellTick / 5)) > 0.94;
      if (!face || dropout) continue;
      const x = portrait.x + column * layout.cellSize + layout.cellSize * 0.12;
      const y = portrait.y + row * layout.cellSize + layout.cellSize * 0.12;
      const cell = layout.cellSize * 0.76;
      context.fillStyle = eye ? MAGENTA : nose || mouth ? IVORY : edge ? DIM : `rgba(207, 204, 198, ${0.24 + hash(column, row, 4) * 0.6})`;
      if (edge || hash(column, row, 7) > 0.72) {
        context.strokeStyle = context.fillStyle as string;
        context.strokeRect(x, y, cell, cell);
      } else {
        context.fillRect(x, y, cell, cell);
      }
    }
  }
  const tiny = Math.max(7, layout.cellSize * 0.78);
  const footerY = content.y + content.height;
  type(context, "SUBJECT / UNKNOWN", content.x, footerY - layout.cellSize * 2, tiny, IVORY);
  type(context, "MATCH 00.13%", content.x + content.width, footerY - layout.cellSize * 2, tiny, MAGENTA, "right");
  type(context, "FEATURE VECTOR 025 x 035 / LOCAL ONLY", content.x, footerY, tiny, DIM);
}

function checkerError(frame: SceneFrame) {
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, IVORY);
  drawSharedGrid(frame, "rgba(18, 17, 19, 0.14)");
  chrome(frame, "Checker error", "ERR-77", true);
  const content = signalContent(frame);
  const blockCells = layout.profile === "wide" || layout.profile === "short" ? 3 : 2;
  const size = layout.cellSize * blockCells;
  const bandTop = content.y + layout.cellSize * 2;
  const bandRows = 7;
  const columns = Math.ceil(content.width / size);
  for (let row = 0; row < bandRows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellTick = propagatedStateTick(stateTick, column, row, columns, bandRows);
      const active = positiveModulo(column + row + Math.floor(cellTick / 3), 2) === 0;
      const error = positiveModulo(column * 5 + row * 7 + cellTick, 29) === 0;
      context.fillStyle = error ? MAGENTA : active ? OXBLOOD : "rgba(18, 17, 19, 0.08)";
      context.fillRect(content.x + column * size, bandTop + row * size, size - layout.cellSize * 0.12, size - layout.cellSize * 0.12);
    }
  }
  type(context, "SYNC", content.x, content.y + content.height * 0.62, layout.cellSize * 5, OXBLOOD, "left", 700);
  type(context, "LOST", content.x + content.width, content.y + content.height * 0.75, layout.cellSize * 5, MAGENTA, "right", 700);
  for (let row = 0; row < 8; row += 1) {
    const y = content.y + content.height - layout.cellSize * (9 - row);
    const values = Array.from({ length: Math.max(12, Math.floor(content.width / layout.cellSize) - 8) }, (_, column) =>
      hash(column, row, Math.floor(stateTick / 4)),
    );
    drawCellStrip(context, content.x, y, values, layout.cellSize, row === stateTick % 8 ? stateTick % values.length : -1);
  }
}

function deepScan(frame: SceneFrame) {
  const { context, width, height, stateTick, confidence, layout } = frame;
  fill(context, width, height, IVORY);
  drawSharedGrid(frame, "rgba(18, 17, 19, 0.08)");
  chrome(frame, "Deep scan", "DEPTH-∞", true);
  const content = signalContent(frame);
  const cell = layout.cellSize;
  const stackedInfo = content.width / content.height < 1.55;
  const field = stackedInfo
    ? {
        x: content.x,
        y: content.y,
        width: content.width,
        height: Math.floor((content.height * 0.62) / cell) * cell,
      }
    : {
        x: content.x + Math.ceil((content.width * 0.38) / cell) * cell,
        y: content.y,
        width: content.x + content.width - (content.x + Math.ceil((content.width * 0.38) / cell) * cell),
        height: content.height,
      };
  const infoX = content.x;
  const infoY = stackedInfo ? field.y + field.height + cell * 2 : content.y;
  const infoHeight = stackedInfo
    ? Math.max(cell, content.y + content.height - infoY)
    : content.height;
  const voidX = snapSignalCenter(layout, field.x + field.width * 0.56, "x");
  const voidY = snapSignalCenter(layout, field.y + field.height * 0.48, "y");
  const voidRadius = Math.max(cell, Math.floor((Math.min(field.width, field.height) * 0.22) / cell) * cell);
  const rayTargets = [
    [field.x, field.y],
    [field.x + field.width * 0.5, field.y],
    [field.x + field.width, field.y],
    [field.x + field.width, field.y + field.height * 0.5],
    [field.x + field.width, field.y + field.height],
    [field.x + field.width * 0.5, field.y + field.height],
    [field.x, field.y + field.height],
    [field.x, field.y + field.height * 0.5],
  ] as const;
  const hairline = Math.max(0.75, cell * 0.055);

  for (let rail = 1; rail <= 4; rail += 1) {
    const amount = rail / 5;
    const y = snapSignalCenter(layout, field.y + field.height * amount, "y");
    line(
      context,
      field.x,
      y,
      field.x + field.width,
      y,
      rail === positiveModulo(Math.floor(stateTick / 4), 4) + 1 ? DIM_DARK : "rgba(18, 17, 19, 0.14)",
      hairline,
    );
  }
  for (const [targetX, targetY] of rayTargets) {
    line(context, voidX, voidY, targetX, targetY, "rgba(18, 17, 19, 0.22)", hairline);
  }

  const firstColumn = Math.ceil((field.x - layout.originX) / cell);
  const lastColumn = Math.floor((field.x + field.width - layout.originX) / cell);
  const firstRow = Math.ceil((field.y - layout.originY) / cell);
  const lastRow = Math.floor((field.y + field.height - layout.originY) / cell);
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = firstColumn; column < lastColumn; column += 1) {
      const x = layout.originX + (column + 0.5) * cell;
      const y = layout.originY + (row + 0.5) * cell;
      const distance = Math.hypot(x - voidX, y - voidY);
      if (distance <= voidRadius * 1.02) continue;
      const normalizedDistance = distance / Math.max(cell, voidRadius);
      const density = normalizedDistance < 1.65
        ? 0.72
        : normalizedDistance < 2.7
          ? 0.28
          : 0.065;
      const cellTick = propagatedStateTick(
        stateTick,
        column - firstColumn,
        row - firstRow,
        Math.max(1, lastColumn - firstColumn),
        Math.max(1, lastRow - firstRow),
      );
      if (hash(column, row, Math.floor(cellTick / 5) + 601) > density) continue;
      const nearVoid = normalizedDistance < 1.65;
      const size = cell * (nearVoid ? 0.58 : normalizedDistance < 2.7 ? 0.34 : 0.2);
      context.fillStyle = nearVoid ? OXBLOOD : normalizedDistance < 2.7 ? DIM_DARK : "rgba(18, 17, 19, 0.2)";
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }

  context.beginPath();
  context.arc(voidX, voidY, voidRadius, 0, TAU);
  context.fillStyle = NIGHT;
  context.fill();

  const tiny = Math.max(7, cell * 0.78);
  const voidTypeSize = Math.max(
    cell * 3.2,
    Math.min(cell * (stackedInfo ? 4.4 : 6.2), infoHeight * 0.3),
  );
  const voidBaseline = infoY + voidTypeSize;
  const infoWidth = stackedInfo
    ? content.width
    : Math.max(cell * 6, field.x - infoX - cell * 2);
  type(context, "VOID", infoX, voidBaseline, voidTypeSize, OXBLOOD, "left", 700, {
    family: "sans",
    maxWidth: infoWidth,
    motion: 0.58,
    strength: confidence,
  });
  const voidMetrics = context.measureText("VOID");
  context.font = `${signalWeight(confidence, "secondary")} ${tiny}px ${signalFontFamilies.mono}`;
  const confidenceMetrics = context.measureText("CONFIDENCE / FIELD LOCK");
  const confidenceLabelY = voidBaseline +
    Math.max(0, voidMetrics.actualBoundingBoxDescent || voidTypeSize * 0.08) +
    Math.max(tiny, confidenceMetrics.actualBoundingBoxAscent || tiny * 0.75) +
    cell * 0.65;
  type(context, "CONFIDENCE / FIELD LOCK", infoX, confidenceLabelY, tiny, DIM_DARK, "left", 600, {
    family: "mono",
    maxWidth: infoWidth,
  });
  const confidenceValue = `${(confidence * 99.8).toFixed(1).padStart(4, "0")}%`;
  const previousConfidence = `${Math.min(99.8, confidence * 99.8 + 0.8).toFixed(1).padStart(4, "0")}%`;
  const confidenceY = confidenceLabelY + cell;
  drawDotMatrixValue(
    context,
    confidenceValue,
    infoX,
    confidenceY,
    Math.max(1, cell * (stackedInfo ? 0.4 : 0.52)),
    OXBLOOD,
    previousConfidence,
  );
  const confidenceCell = Math.max(1, cell * (stackedInfo ? 0.4 : 0.52));
  const lockY = confidenceY + confidenceCell * 5 + cell * 1.8;
  const lockState = confidence > 0.62 ? "HARD" : confidence > 0.24 ? "TRACK" : "DRIFT";
  context.fillStyle = lockState === "DRIFT" ? DIM_DARK : OXBLOOD;
  context.fillRect(infoX, lockY - cell * 0.58, cell * 0.42, cell * 0.42);
  type(context, `LOCK / ${lockState}`, infoX + cell, lockY, tiny, OXBLOOD, "left", 650);
  type(
    context,
    "DENSITY / LOW-MID-ON",
    infoX,
    Math.min(content.y + content.height, lockY + cell * 2.2),
    tiny,
    DIM_DARK,
  );
}

type CyberPanel = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

function roundedPanelPath(
  context: CanvasRenderingContext2D,
  panelBounds: CyberPanel,
  radius: number,
) {
  const { x, y, width, height } = panelBounds;
  const resolvedRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  context.beginPath();
  context.moveTo(x + resolvedRadius, y);
  context.lineTo(x + width - resolvedRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + resolvedRadius);
  context.lineTo(x + width, y + height - resolvedRadius);
  context.quadraticCurveTo(
    x + width,
    y + height,
    x + width - resolvedRadius,
    y + height,
  );
  context.lineTo(x + resolvedRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - resolvedRadius);
  context.lineTo(x, y + resolvedRadius);
  context.quadraticCurveTo(x, y, x + resolvedRadius, y);
  context.closePath();
}

function cyberPanel(
  context: CanvasRenderingContext2D,
  panelBounds: CyberPanel,
  fillColor: string,
  radius: number,
  strokeColor = "rgba(8, 8, 8, 0.78)",
) {
  roundedPanelPath(context, panelBounds, radius);
  context.fillStyle = fillColor;
  context.fill();
  context.strokeStyle = strokeColor;
  context.lineWidth = 1;
  context.stroke();
}

function drawBarcode(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string = OXBLOOD,
  seed = 17,
) {
  let cursor = x;
  let index = 0;
  context.fillStyle = color;
  while (cursor < x + width) {
    const unit = Math.max(1, width / 92);
    const barWidth = unit * (hash(index, seed, 719) > 0.68 ? 3 : hash(index, seed, 331) > 0.4 ? 2 : 1);
    if (hash(index, seed, 811) > 0.27) {
      context.fillRect(cursor, y, Math.min(barWidth, x + width - cursor), height);
    }
    cursor += barWidth + unit;
    index += 1;
  }
}

function drawCyberStar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
) {
  context.beginPath();
  context.moveTo(x, y - radius);
  context.bezierCurveTo(x + radius * 0.16, y - radius * 0.22, x + radius * 0.22, y - radius * 0.16, x + radius, y);
  context.bezierCurveTo(x + radius * 0.22, y + radius * 0.16, x + radius * 0.16, y + radius * 0.22, x, y + radius);
  context.bezierCurveTo(x - radius * 0.16, y + radius * 0.22, x - radius * 0.22, y + radius * 0.16, x - radius, y);
  context.bezierCurveTo(x - radius * 0.22, y - radius * 0.16, x - radius * 0.16, y - radius * 0.22, x, y - radius);
  context.fillStyle = color;
  context.fill();
}

function drawReticle(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string,
  phase = 0,
) {
  drawSignalCircle(context, cx, cy, radius, color);
  drawSignalCircle(context, cx, cy, radius * 0.58, color);
  const angle = phase * 0.035;
  line(context, cx - radius * 1.28, cy, cx - radius * 0.36, cy, color);
  line(context, cx + radius * 0.36, cy, cx + radius * 1.28, cy, color);
  line(context, cx, cy - radius * 1.28, cx, cy - radius * 0.36, color);
  line(context, cx, cy + radius * 0.36, cx, cy + radius * 1.28, color);
  context.beginPath();
  context.arc(cx, cy, radius * 0.78, angle, angle + Math.PI * 0.72);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
}

function drawPerspectiveCage(
  context: CanvasRenderingContext2D,
  bounds: CyberPanel,
  color: string,
  phase: number,
) {
  const cx = bounds.x + bounds.width * 0.5;
  const cy = bounds.y + bounds.height * 0.46;
  context.beginPath();
  for (let column = 0; column <= 10; column += 1) {
    const x = bounds.x + (column / 10) * bounds.width;
    context.moveTo(cx, cy);
    context.lineTo(x, bounds.y + bounds.height);
  }
  for (let row = 0; row <= 9; row += 1) {
    const amount = row / 9;
    const eased = amount * amount;
    const y = cy + eased * bounds.height * 0.54;
    const inset = (1 - eased) * bounds.width * 0.5;
    context.moveTo(bounds.x + inset, y);
    context.lineTo(bounds.x + bounds.width - inset, y);
  }
  const drift = Math.sin(phase * 0.06) * bounds.width * 0.012;
  context.moveTo(bounds.x + drift, bounds.y);
  context.lineTo(cx, cy);
  context.lineTo(bounds.x + bounds.width + drift, bounds.y);
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();
}

function drawWireBust(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  height: number,
  color: string,
  accent: string,
  phase: number,
  filled = false,
) {
  const pulse = Math.sin(phase * 0.08) * width * 0.012;
  const headTop = cy - height * 0.49;
  const headBottom = cy + height * 0.08;
  if (filled) {
    context.beginPath();
    context.ellipse(cx + pulse, cy - height * 0.22, width * 0.24, height * 0.29, -0.08, 0, TAU);
    context.fillStyle = color;
    context.fill();
  }
  for (let row = 0; row < 42; row += 1) {
    const amount = row / 41;
    const y = headTop + amount * (headBottom - headTop);
    const curve = Math.sqrt(Math.max(0, 1 - Math.pow((amount - 0.5) / 0.52, 2)));
    const nose = amount > 0.42 && amount < 0.59 ? width * 0.055 : 0;
    const jaw = amount > 0.72 ? (amount - 0.72) * width * 0.14 : 0;
    const half = width * 0.235 * curve - jaw;
    const glitch = hash(row, Math.floor(phase / 7), 401) > 0.88
      ? (hash(row, 2, 612) - 0.5) * width * 0.18
      : 0;
    line(
      context,
      cx - half + pulse + glitch,
      y,
      cx + half + nose + pulse + glitch,
      y,
      hash(row, 0, 23) > 0.82 ? accent : color,
      hash(row, 1, 91) > 0.84 ? 2 : 1,
    );
  }
  context.beginPath();
  context.moveTo(cx - width * 0.12, headBottom - height * 0.02);
  context.lineTo(cx - width * 0.16, cy + height * 0.2);
  context.bezierCurveTo(
    cx - width * 0.48,
    cy + height * 0.27,
    cx - width * 0.5,
    cy + height * 0.46,
    cx - width * 0.53,
    cy + height * 0.5,
  );
  context.moveTo(cx + width * 0.11, headBottom - height * 0.02);
  context.lineTo(cx + width * 0.16, cy + height * 0.2);
  context.bezierCurveTo(
    cx + width * 0.48,
    cy + height * 0.27,
    cx + width * 0.5,
    cy + height * 0.46,
    cx + width * 0.53,
    cy + height * 0.5,
  );
  context.strokeStyle = color;
  context.lineWidth = filled ? 2 : 1.2;
  context.stroke();
  for (let index = 0; index < 14; index += 1) {
    const amount = index / 13;
    const y = cy + height * (0.21 + amount * 0.28);
    const span = width * (0.18 + Math.sin(amount * Math.PI) * 0.36);
    line(context, cx - span, y, cx + span, y, color, 1);
  }
}

function drawMechanicalHand(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  width: number,
  height: number,
  color: string,
  detail: string,
  phase: number,
) {
  const palmWidth = width * 0.38;
  const palmHeight = height * 0.36;
  const wristTop = cy + palmHeight * 0.35;
  const palm = [
    [cx - palmWidth * 0.48, cy + palmHeight * 0.26],
    [cx - palmWidth * 0.56, cy - palmHeight * 0.28],
    [cx - palmWidth * 0.28, cy - palmHeight * 0.5],
    [cx + palmWidth * 0.34, cy - palmHeight * 0.46],
    [cx + palmWidth * 0.55, cy - palmHeight * 0.12],
    [cx + palmWidth * 0.42, cy + palmHeight * 0.42],
    [cx - palmWidth * 0.2, cy + palmHeight * 0.54],
  ] as const;
  context.beginPath();
  context.moveTo(palm[0][0], palm[0][1]);
  for (let index = 1; index < palm.length; index += 1) {
    context.lineTo(palm[index][0], palm[index][1]);
  }
  context.closePath();
  context.fillStyle = "rgba(8, 8, 8, 0.66)";
  context.fill();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
  const fingers = [
    { baseX: -0.36, baseY: -0.36, angle: -2.52, length: 0.39 },
    { baseX: -0.18, baseY: -0.49, angle: -2.08, length: 0.52 },
    { baseX: 0.02, baseY: -0.51, angle: -1.8, length: 0.58 },
    { baseX: 0.2, baseY: -0.47, angle: -1.55, length: 0.52 },
    { baseX: 0.37, baseY: -0.33, angle: -1.31, length: 0.42 },
  ];
  for (const [fingerIndex, finger] of fingers.entries()) {
    let x = cx + palmWidth * finger.baseX;
    let y = cy + palmHeight * finger.baseY;
    const bend = Math.sin(phase * 0.025 + fingerIndex) * 0.07;
    for (let joint = 0; joint < 3; joint += 1) {
      const segmentLength = height * finger.length * (0.38 - joint * 0.035);
      const angle = finger.angle + bend + joint * (0.07 + fingerIndex * 0.012);
      const nextX = x + Math.cos(angle) * segmentLength;
      const nextY = y + Math.sin(angle) * segmentLength;
      line(context, x, y, nextX, nextY, color, Math.max(1.4, width * 0.012));
      line(
        context,
        x + width * 0.018,
        y,
        nextX + width * 0.014,
        nextY,
        detail,
        1,
      );
      drawSignalCircle(context, x, y, Math.max(2, width * 0.025), detail);
      x = nextX;
      y = nextY;
    }
    drawSignalCircle(context, x, y, Math.max(2, width * 0.018), color);
  }
  context.beginPath();
  context.moveTo(cx - palmWidth * 0.2, wristTop);
  context.lineTo(cx - width * 0.12, cy + height * 0.49);
  context.lineTo(cx + width * 0.12, cy + height * 0.49);
  context.lineTo(cx + palmWidth * 0.28, wristTop);
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.stroke();
  for (let row = 0; row < 9; row += 1) {
    const y = cy - palmHeight * 0.34 + row * palmHeight * 0.09;
    line(context, cx - palmWidth * 0.34, y, cx + palmWidth * 0.36, y, detail, 1);
  }
}

function drawCyberFinish(frame: SceneFrame, accent: string) {
  const { context, width, height, phase, layout } = frame;
  const cell = layout.cellSize;
  const scanStep = Math.max(6, cell * 0.55);
  context.save();
  context.globalCompositeOperation = "source-over";
  context.fillStyle = "rgba(0, 0, 0, 0.065)";
  for (let y = positiveModulo(phase, 2) * 2; y < height; y += scanStep) {
    context.fillRect(0, y, width, Math.max(1, scanStep * 0.14));
  }
  const edge = Math.max(2, cell * 0.22);
  context.fillStyle = accent;
  context.globalAlpha = 0.78;
  context.fillRect(0, 0, Math.min(width * 0.14, cell * 8), edge);
  context.fillRect(width - Math.min(width * 0.08, cell * 5), height - edge, Math.min(width * 0.08, cell * 5), edge);
  context.globalAlpha = 0.18;
  const glitchY = positiveModulo(phase * 17, Math.max(1, Math.floor(height)));
  context.fillRect(width * 0.08, glitchY, width * (0.08 + hash(phase, 1, 101) * 0.22), Math.max(1, cell * 0.14));
  context.globalAlpha = 1;
  context.restore();
}

const SIGNAL_SCENE_ACCENTS = [
  AMBER,
  ORANGE,
  MAGENTA,
  RED,
  SAGE,
  ORANGE,
  RED,
  MAGENTA,
  RED,
  SAGE,
  MAGENTA,
  AMBER,
  ACID,
  ORANGE,
  AMBER,
  MAGENTA,
  RED,
  ORANGE,
] as const;

function cyberIndustrialId(frame: SceneFrame) {
  const { context, width, height, phase, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame, "rgba(225, 225, 220, 0.025)");
  const cell = layout.cellSize;
  const pad = Math.max(cell * 1.7, 14);
  const gap = Math.max(cell * 0.65, 7);
  const radius = Math.max(10, cell * 1.25);
  const portrait = layout.profile === "portrait";
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  let hero: CyberPanel;
  let masthead: CyberPanel;
  let registry: CyberPanel;
  let scope: CyberPanel;
  if (portrait) {
    const heroHeight = innerHeight * 0.48;
    const mastheadHeight = innerHeight * 0.22;
    const lowerY = pad + heroHeight + mastheadHeight + gap * 2;
    const lowerHeight = Math.max(cell * 8, pad + innerHeight - lowerY);
    hero = { x: pad, y: pad, width: innerWidth, height: heroHeight };
    masthead = { x: pad, y: hero.y + hero.height + gap, width: innerWidth, height: mastheadHeight };
    registry = { x: pad, y: lowerY, width: (innerWidth - gap) * 0.56, height: lowerHeight };
    scope = { x: registry.x + registry.width + gap, y: lowerY, width: innerWidth - registry.width - gap, height: lowerHeight };
  } else {
    const heroWidth = innerWidth * 0.38;
    const rightX = pad + heroWidth + gap;
    const rightWidth = width - pad - rightX;
    const mastheadHeight = innerHeight * 0.48;
    const lowerY = pad + mastheadHeight + gap;
    const lowerHeight = innerHeight - mastheadHeight - gap;
    hero = { x: pad, y: pad, width: heroWidth, height: innerHeight };
    masthead = { x: rightX, y: pad, width: rightWidth, height: mastheadHeight };
    registry = { x: rightX, y: lowerY, width: (rightWidth - gap) * 0.56, height: lowerHeight };
    scope = { x: registry.x + registry.width + gap, y: lowerY, width: rightWidth - registry.width - gap, height: lowerHeight };
  }

  cyberPanel(context, hero, CLAY, radius);
  cyberPanel(context, masthead, AMBER, radius);
  cyberPanel(context, registry, SAGE, radius);
  cyberPanel(context, scope, SLATE, radius);

  type(context, "01", hero.x + cell * 1.25, hero.y + cell * 2.1, cell * 0.95, OXBLOOD, "left", 700, {
    family: "display",
    tracking: cell * 0.08,
  });
  type(context, "独創", hero.x + cell * 1.2, hero.y + hero.height - cell * 1.5, Math.min(cell * 3.3, hero.width * 0.13), OXBLOOD, "left", 700, {
    family: "interface",
    maxWidth: hero.width * 0.28,
  });
  drawMechanicalHand(
    context,
    hero.x + hero.width * 0.6,
    hero.y + hero.height * 0.56,
    hero.width * 0.7,
    hero.height * 0.9,
    OXBLOOD,
    BONE,
    phase,
  );
  drawBarcode(
    context,
    hero.x + cell * 1.2,
    hero.y + hero.height - cell * 0.75,
    hero.width * 0.2,
    Math.max(2, cell * 0.22),
    OXBLOOD,
    91,
  );

  const mastheadSize = Math.min(masthead.height * 0.34, masthead.width * 0.105);
  type(context, "CBRPNK", masthead.x + cell * 1.25, masthead.y + mastheadSize + cell * 0.7, mastheadSize, OXBLOOD, "left", 800, {
    family: "display",
    maxWidth: masthead.width * 0.67,
    tracking: -mastheadSize * 0.035,
    motion: 0.15,
  });
  context.fillStyle = RED;
  context.beginPath();
  context.arc(masthead.x + masthead.width * 0.64, masthead.y + cell * 1.3, Math.max(2, cell * 0.28), 0, TAU);
  context.fill();
  const arrowX = masthead.x + masthead.width - cell * 5.6;
  const arrowY = masthead.y + cell * 1.35;
  const arrowSize = Math.min(cell * 4, masthead.height * 0.38);
  line(context, arrowX, arrowY + arrowSize, arrowX + arrowSize, arrowY, OXBLOOD, Math.max(4, cell * 0.72));
  line(context, arrowX + arrowSize * 0.38, arrowY, arrowX + arrowSize, arrowY, OXBLOOD, Math.max(4, cell * 0.72));
  line(context, arrowX + arrowSize, arrowY, arrowX + arrowSize, arrowY + arrowSize * 0.62, OXBLOOD, Math.max(4, cell * 0.72));
  const dataY = masthead.y + masthead.height * 0.58;
  const dataX = masthead.x + cell * 1.25;
  const dataWidth = masthead.width * 0.54;
  panel(context, dataX, dataY, dataWidth, masthead.height * 0.25, "rgba(8, 8, 8, 0.72)");
  type(context, "ADSR", dataX + cell * 0.5, dataY + cell * 0.9, cell * 0.62, OXBLOOD, "left", 700, { family: "interface" });
  for (let index = 0; index < 5; index += 1) {
    const barX = dataX + dataWidth * 0.32 + index * dataWidth * 0.105;
    const barHeight = masthead.height * (0.07 + hash(index, stateTick, 771) * 0.13);
    context.fillStyle = index === positiveModulo(stateTick, 5) ? RED : OXBLOOD;
    context.fillRect(barX, dataY + masthead.height * 0.21 - barHeight, dataWidth * 0.055, barHeight);
  }
  type(context, `UA 570-B / ${String(571 + positiveModulo(stateTick, 19)).padStart(3, "0")}`, masthead.x + masthead.width - cell * 1.2, dataY + cell * 0.9, cell * 0.58, OXBLOOD, "right", 700, {
    family: "mono",
    maxWidth: masthead.width * 0.36,
  });

  type(context, "DPM SYSTM", registry.x + cell, registry.y + cell * 2.25, Math.min(cell * 1.45, registry.width * 0.09), OXBLOOD, "left", 700, {
    family: "display",
    maxWidth: registry.width - cell * 2,
  });
  line(context, registry.x + cell, registry.y + cell * 2.8, registry.x + registry.width - cell, registry.y + cell * 2.8, OXBLOOD);
  type(context, "SORT / BEFORE SENDING", registry.x + cell, registry.y + registry.height * 0.57, cell * 0.58, OXBLOOD, "left", 700, { family: "interface" });
  type(context, "TS26", registry.x + cell, registry.y + registry.height - cell * 0.75, Math.min(cell * 2.6, registry.width * 0.21), OXBLOOD, "left", 800, {
    family: "display",
    maxWidth: registry.width * 0.64,
  });
  drawReticle(
    context,
    registry.x + registry.width - cell * 2,
    registry.y + registry.height - cell * 1.7,
    Math.min(cell * 0.75, registry.width * 0.06),
    OXBLOOD,
    phase,
  );

  const scopeRadius = Math.min(scope.width, scope.height) * 0.25;
  type(context, "25", scope.x + cell, scope.y + scope.height - cell * 0.75, Math.min(cell * 4, scope.width * 0.42), OXBLOOD, "left", 800, {
    family: "display",
    maxWidth: scope.width - cell * 2,
    motion: 0.08,
  });
  drawReticle(
    context,
    scope.x + scope.width * 0.7,
    scope.y + scope.height * 0.38,
    scopeRadius,
    OXBLOOD,
    phase,
  );
}

function cyberLabRegistry(frame: SceneFrame) {
  const { context, width, height, phase, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame, "rgba(225, 225, 220, 0.028)");
  const cell = layout.cellSize;
  const pad = Math.max(14, cell * 1.7);
  const gap = Math.max(7, cell * 0.65);
  const radius = Math.max(10, cell * 1.25);
  const portrait = layout.profile === "portrait";
  const innerWidth = width - pad * 2;
  const innerHeight = height - pad * 2;
  let header: CyberPanel;
  let specimen: CyberPanel;
  let record: CyberPanel;
  let scope: CyberPanel;
  if (portrait) {
    header = { x: pad, y: pad, width: innerWidth, height: innerHeight * 0.23 };
    specimen = { x: pad, y: header.y + header.height + gap, width: innerWidth, height: innerHeight * 0.44 };
    const lowerY = specimen.y + specimen.height + gap;
    const lowerHeight = pad + innerHeight - lowerY;
    record = { x: pad, y: lowerY, width: (innerWidth - gap) * 0.52, height: lowerHeight };
    scope = { x: record.x + record.width + gap, y: lowerY, width: innerWidth - record.width - gap, height: lowerHeight };
  } else {
    header = { x: pad, y: pad, width: innerWidth * 0.68, height: innerHeight * 0.48 };
    specimen = { x: header.x + header.width + gap, y: pad, width: width - pad - header.x - header.width - gap, height: innerHeight };
    const lowerY = header.y + header.height + gap;
    const lowerHeight = innerHeight - header.height - gap;
    record = { x: pad, y: lowerY, width: (header.width - gap) * 0.5, height: lowerHeight };
    scope = { x: record.x + record.width + gap, y: lowerY, width: header.width - record.width - gap, height: lowerHeight };
  }
  cyberPanel(context, header, NAVY, radius, "rgba(225, 225, 220, 0.12)");
  cyberPanel(context, specimen, ORANGE, radius);
  cyberPanel(context, record, BONE, radius);
  cyberPanel(context, scope, SLATE, radius);

  const headerSize = Math.min(header.height * 0.32, header.width * 0.105);
  type(context, "CBRPNK", header.x + cell * 1.25, header.y + headerSize + cell * 0.72, headerSize, IVORY, "left", 800, {
    family: "display",
    maxWidth: header.width * 0.7,
    tracking: -headerSize * 0.03,
    motion: 0.12,
  });
  context.fillStyle = ORANGE;
  context.beginPath();
  context.arc(header.x + header.width * 0.64, header.y + cell * 1.15, Math.max(2, cell * 0.25), 0, TAU);
  context.fill();
  type(context, "9", header.x + cell * 1.25, header.y + header.height * 0.67, cell * 2.25, IVORY, "left", 800, { family: "display" });
  type(context, "産業と技術革新の\n基盤をつくろう".replace("\n", " / "), header.x + cell * 4.2, header.y + header.height * 0.59, cell * 0.82, IVORY, "left", 700, {
    family: "interface",
    maxWidth: header.width * 0.45,
  });
  type(context, "ELEMENTARY\nCONCEPT 001".replace("\n", " / "), header.x + header.width - cell * 1.2, header.y + header.height * 0.67, cell * 0.62, IVORY, "right", 700, {
    family: "interface",
    maxWidth: header.width * 0.28,
  });
  line(context, header.x + cell * 1.2, header.y + header.height - cell * 2.15, header.x + header.width - cell * 1.2, header.y + header.height - cell * 2.15, "rgba(225, 225, 220, 0.48)");
  type(context, `#FAC659 / DATASET ${String(positiveModulo(stateTick, 999)).padStart(3, "0")}`, header.x + cell * 1.2, header.y + header.height - cell, cell * 0.6, IVORY, "left", 700, {
    family: "mono",
    maxWidth: header.width * 0.62,
  });
  drawBarcode(context, header.x + header.width * 0.76, header.y + header.height - cell * 1.7, header.width * 0.18, cell * 0.65, IVORY, 42);

  type(context, "wave", specimen.x + cell, specimen.y + cell * 2.2, Math.min(cell * 2.6, specimen.width * 0.24), OXBLOOD, "left", 800, {
    family: "display",
    maxWidth: specimen.width - cell * 2,
  });
  type(context, "C5-01", specimen.x + cell * 0.7, specimen.y + specimen.height * 0.58, cell * 0.68, OXBLOOD, "left", 700, { family: "mono" });
  drawWireBust(
    context,
    specimen.x + specimen.width * 0.58,
    specimen.y + specimen.height * 0.54,
    specimen.width * 0.92,
    specimen.height * 0.92,
    OXBLOOD,
    IVORY,
    phase,
    true,
  );
  type(context, "狂宴", specimen.x + cell * 0.8, specimen.y + specimen.height - cell * 1.1, Math.min(cell * 2.7, specimen.width * 0.18), OXBLOOD, "left", 800, {
    family: "interface",
    maxWidth: specimen.width * 0.3,
  });

  type(context, "RAD", record.x + cell, record.y + cell * 1.55, Math.min(cell * 1.4, record.width * 0.14), OXBLOOD, "left", 800, { family: "display" });
  type(context, "実験室", record.x + record.width - cell, record.y + cell * 1.55, cell * 0.78, OXBLOOD, "right", 700, { family: "interface" });
  context.fillStyle = OXBLOOD;
  context.fillRect(record.x + cell, record.y + cell * 2.1, record.width - cell * 2, cell * 1.15);
  type(context, "INTERNAL-559", record.x + cell * 1.4, record.y + cell * 2.95, cell * 0.65, BONE, "left", 700, { family: "mono" });
  type(context, "MODEL / NONE 23", record.x + cell, record.y + record.height * 0.58, cell * 0.58, OXBLOOD, "left", 700, { family: "mono" });
  drawBarcode(context, record.x + cell, record.y + record.height - cell * 2, record.width - cell * 2, cell * 0.9, OXBLOOD, 559);

  const scopeRadius = Math.min(scope.width, scope.height) * 0.28;
  drawReticle(context, scope.x + scope.width * 0.54, scope.y + scope.height * 0.54, scopeRadius, OXBLOOD, phase);
  type(context, "LTO/R", scope.x + cell, scope.y + cell * 1.4, cell * 0.55, OXBLOOD, "left", 700, { family: "mono" });
  type(context, "5020", scope.x + cell, scope.y + cell * 2.7, cell * 0.52, OXBLOOD, "left", 700, { family: "mono" });
  type(context, "4490", scope.x + scope.width - cell, scope.y + cell * 2.7, cell * 0.52, OXBLOOD, "right", 700, { family: "mono" });
}

function cyberNeuralRelic(frame: SceneFrame) {
  const { context, width, height, phase, stateTick, layout } = frame;
  fill(context, width, height, "#1c1b1b");
  drawSharedGrid(frame, "rgba(225, 235, 212, 0.022)");
  const cell = layout.cellSize;
  const portrait = layout.profile === "portrait";
  const pad = Math.max(16, cell * 2.1);
  const heroX = portrait ? width * 0.5 : width * 0.47;
  const heroY = portrait ? height * 0.47 : height * 0.52;
  const heroWidth = portrait ? width * 0.9 : Math.min(width * 0.66, height * 0.92);
  const heroHeight = portrait ? height * 0.6 : height * 0.9;
  type(context, "NEURAL / RELIC", pad, pad + cell * 1.15, cell * 0.84, BONE, "left", 700, {
    family: "interface",
    tracking: cell * 0.09,
  });
  type(context, "XAI–9", width - pad, pad + cell * 1.15, cell * 0.84, RED, "right", 700, {
    family: "display",
    tracking: cell * 0.1,
  });
  line(context, pad, pad + cell * 1.8, width - pad, pad + cell * 1.8, "rgba(232, 235, 212, 0.28)");
  drawMechanicalHand(context, heroX, heroY, heroWidth, heroHeight, BONE, "rgba(143, 143, 139, 0.78)", phase);

  const capsules = portrait
    ? [
        [0.17, 0.29, "A"], [0.81, 0.27, "✣"], [0.15, 0.53, "09"],
        [0.82, 0.55, "+"], [0.2, 0.76, "X"], [0.76, 0.78, "∆"],
      ] as const
    : [
        [0.13, 0.3, "A"], [0.76, 0.24, "✣"], [0.17, 0.52, "09"],
        [0.79, 0.49, "+"], [0.24, 0.75, "X"], [0.72, 0.76, "∆"],
      ] as const;
  const pillWidth = Math.max(cell * 2.5, Math.min(width, height) * 0.075);
  const pillHeight = pillWidth * 1.45;
  for (const [index, capsule] of capsules.entries()) {
    const [xAmount, yAmount, label] = capsule;
    const drift = Math.sin(phase * 0.035 + index * 1.7) * cell * 0.35;
    const pill: CyberPanel = {
      x: width * xAmount - pillWidth / 2 + drift,
      y: height * yAmount - pillHeight / 2,
      width: pillWidth,
      height: pillHeight,
    };
    roundedPanelPath(context, pill, pillWidth * 0.42);
    context.fillStyle = "rgba(28, 27, 27, 0.76)";
    context.fill();
    context.strokeStyle = index === positiveModulo(Math.floor(stateTick / 3), capsules.length) ? BONE : RED;
    context.lineWidth = Math.max(1, cell * 0.12);
    context.stroke();
    drawSignalCircle(context, pill.x + pill.width / 2, pill.y + pill.height / 2, pill.width * 0.24, "rgba(232, 235, 212, 0.56)");
    type(context, label, pill.x + pill.width / 2, pill.y + pill.height * 0.59, cell * 0.76, BONE, "center", 700, {
      family: "display",
      maxWidth: pill.width * 0.65,
    });
  }

  const brand: CyberPanel = portrait
    ? { x: width * 0.54, y: height - pad - cell * 4.2, width: width * 0.34, height: cell * 3.2 }
    : { x: width - pad - cell * 10, y: height - pad - cell * 3.3, width: cell * 10, height: cell * 2.8 };
  panel(context, brand.x, brand.y, brand.width, brand.height, RED);
  context.fillStyle = RED;
  context.fillRect(brand.x, brand.y, brand.width, Math.max(3, cell * 0.32));
  type(context, "XAI", brand.x + brand.width / 2, brand.y + brand.height * 0.72, Math.min(brand.height * 0.6, brand.width * 0.24), BONE, "center", 800, {
    family: "display",
    tracking: cell * 0.18,
  });
  type(context, "BIO-MECHANICAL MEMORY / UNIT 04", pad, height - pad, cell * 0.56, "rgba(232, 235, 212, 0.58)", "left", 700, {
    family: "mono",
    maxWidth: width * 0.48,
  });
}

function cyberVoidMesh(frame: SceneFrame) {
  const { context, width, height, phase, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame, "rgba(225, 225, 220, 0.025)");
  const cell = layout.cellSize;
  const pad = Math.max(14, cell * 1.65);
  const gap = Math.max(7, cell * 0.65);
  const portrait = layout.profile === "portrait";
  const left: CyberPanel = portrait
    ? { x: pad, y: pad + cell * 4, width: width - pad * 2, height: height * 0.48 }
    : { x: pad, y: pad + cell * 3, width: width * 0.45, height: height - pad * 2 - cell * 3 };
  const rightX = portrait ? pad : left.x + left.width + gap;
  const rightY = portrait ? left.y + left.height + gap : left.y;
  const rightWidth = portrait ? width - pad * 2 : width - pad - rightX;
  const rightHeight = portrait ? height - pad - rightY : left.height;
  type(context, "VOID MESH", pad, pad + cell * 1.35, Math.min(cell * 1.35, width * 0.035), IVORY, "left", 800, {
    family: "display",
    tracking: cell * 0.11,
  });
  type(context, `FRAME ${String(positiveModulo(stateTick, 999)).padStart(3, "0")} / SPECTRAL`, width - pad, pad + cell * 1.25, cell * 0.58, MAGENTA, "right", 700, {
    family: "mono",
  });

  panel(context, left.x, left.y, left.width, left.height, "rgba(225, 225, 220, 0.72)");
  drawPerspectiveCage(context, left, "rgba(225, 225, 220, 0.18)", phase);
  drawWireBust(
    context,
    left.x + left.width * 0.5,
    left.y + left.height * 0.5,
    left.width * 0.84,
    left.height * 0.88,
    IVORY,
    MAGENTA,
    phase,
  );
  drawCyberStar(context, left.x + left.width * 0.15, left.y + left.height * 0.15, Math.min(cell * 1.2, left.width * 0.04), MAGENTA);
  drawCyberStar(context, left.x + left.width * 0.86, left.y + left.height * 0.64, Math.min(cell * 0.9, left.width * 0.03), MAGENTA);

  const brandHeight = rightHeight * 0.24;
  const brand: CyberPanel = { x: rightX, y: rightY, width: rightWidth, height: brandHeight };
  const instrumentsY = brand.y + brand.height + gap;
  const instrumentsHeight = rightHeight - brand.height - gap;
  const instrumentLeft: CyberPanel = { x: rightX, y: instrumentsY, width: (rightWidth - gap) * 0.42, height: instrumentsHeight };
  const instrumentRight: CyberPanel = { x: instrumentLeft.x + instrumentLeft.width + gap, y: instrumentsY, width: rightWidth - instrumentLeft.width - gap, height: instrumentsHeight };
  panel(context, brand.x, brand.y, brand.width, brand.height, "rgba(225, 225, 220, 0.42)");
  type(context, "SIGNAL", brand.x + cell, brand.y + brand.height * 0.48, Math.min(brand.height * 0.43, brand.width * 0.14), IVORY, "left", 800, {
    family: "display",
    maxWidth: brand.width - cell * 2,
    tracking: -cell * 0.04,
    motion: 0.16,
  });
  type(context, "SYSTEM", brand.x + brand.width - cell, brand.y + brand.height * 0.88, Math.min(brand.height * 0.36, brand.width * 0.11), IVORY, "right", 800, {
    family: "display",
    maxWidth: brand.width - cell * 2,
    tracking: cell * 0.08,
  });
  drawCyberStar(context, brand.x + brand.width - cell * 1.2, brand.y + cell, cell * 0.5, MAGENTA);

  panel(context, instrumentLeft.x, instrumentLeft.y, instrumentLeft.width, instrumentLeft.height, "rgba(225, 225, 220, 0.38)");
  const ringRadius = Math.min(instrumentLeft.width, instrumentLeft.height) * 0.28;
  const ringX = instrumentLeft.x + instrumentLeft.width * 0.5;
  const ringY = instrumentLeft.y + instrumentLeft.height * 0.27;
  for (let index = 0; index < 6; index += 1) {
    drawSignalEllipse(context, ringX, ringY, ringRadius, ringRadius * (0.18 + index * 0.14), 0, index === 3 ? MAGENTA : "rgba(225, 225, 220, 0.52)");
  }
  drawCyberStar(context, ringX, ringY, ringRadius * 0.86, MAGENTA);
  const terrainTop = instrumentLeft.y + instrumentLeft.height * 0.56;
  for (let row = 0; row < 10; row += 1) {
    context.beginPath();
    for (let column = 0; column <= 20; column += 1) {
      const amount = column / 20;
      const x = instrumentLeft.x + amount * instrumentLeft.width;
      const wave = Math.sin(amount * TAU * 2.2 + row * 0.37 + phase * 0.035);
      const y = terrainTop + row * instrumentLeft.height * 0.035 - Math.abs(wave) * instrumentLeft.height * (0.12 - row * 0.006);
      if (column === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = row === positiveModulo(Math.floor(stateTick / 2), 10) ? MAGENTA : "rgba(225, 225, 220, 0.32)";
    context.lineWidth = 1;
    context.stroke();
  }

  panel(context, instrumentRight.x, instrumentRight.y, instrumentRight.width, instrumentRight.height, "rgba(225, 225, 220, 0.38)");
  const torusX = instrumentRight.x + instrumentRight.width * 0.5;
  const torusY = instrumentRight.y + instrumentRight.height * 0.48;
  const torusRadius = Math.min(instrumentRight.width, instrumentRight.height) * 0.34;
  for (let index = 0; index < 34; index += 1) {
    const amount = index / 34;
    drawSignalEllipse(
      context,
      torusX + Math.sin(amount * TAU + phase * 0.012) * torusRadius * 0.28,
      torusY,
      torusRadius * (0.3 + Math.abs(Math.cos(amount * TAU)) * 0.72),
      torusRadius * 0.34,
      amount * Math.PI,
      index % 9 === 0 ? MAGENTA : "rgba(225, 225, 220, 0.42)",
    );
  }
  type(context, "WE SHAPE SIGNALS THAT LIVE BEYOND TRENDS.", instrumentRight.x + cell, instrumentRight.y + cell * 1.4, cell * 0.54, IVORY, "left", 500, {
    family: "mono",
    maxWidth: instrumentRight.width - cell * 2,
  });
}

function cyberMachineProtocol(frame: SceneFrame) {
  const { context, width, height, phase, stateTick, layout } = frame;
  fill(context, width, height, "#8f9695");
  const cell = layout.cellSize;
  const pad = Math.max(12, cell * 1.45);
  type(context, "POST", pad, Math.min(height * 0.18, cell * 7), Math.min(height * 0.18, width * 0.17), OXBLOOD, "left", 800, {
    family: "display",
    maxWidth: width - pad * 2,
    tracking: -cell * 0.32,
    motion: 0.1,
  });
  type(context, "HUMAN", width - pad, height - pad, Math.min(height * 0.2, width * 0.16), OXBLOOD, "right", 800, {
    family: "display",
    maxWidth: width - pad * 2,
    tracking: -cell * 0.28,
    motion: 0.1,
  });
  drawBarcode(context, pad, height * 0.34, width - pad * 2, Math.max(cell * 1.1, 12), OXBLOOD, 2088);
  const card: CyberPanel = {
    x: width * (layout.profile === "portrait" ? 0.08 : 0.17),
    y: height * 0.2,
    width: width * (layout.profile === "portrait" ? 0.84 : 0.68),
    height: height * 0.62,
  };
  cyberPanel(context, card, "rgba(146, 153, 152, 0.97)", Math.max(12, cell * 1.15), OXBLOOD);
  line(context, card.x, card.y + cell * 2.4, card.x + card.width, card.y + cell * 2.4, OXBLOOD, 2);
  type(context, "INDEX", card.x + cell, card.y + cell * 1.55, cell * 0.56, OXBLOOD, "left", 700, { family: "mono" });
  type(context, "SPLICE", card.x + card.width * 0.36, card.y + cell * 1.55, cell * 0.56, OXBLOOD, "center", 700, { family: "mono" });
  type(context, "CONTROL / CONNECTIVITY", card.x + card.width - cell, card.y + cell * 1.55, cell * 0.56, OXBLOOD, "right", 700, { family: "mono" });
  drawWireBust(
    context,
    card.x + card.width * 0.68,
    card.y + card.height * 0.54,
    card.width * 0.6,
    card.height * 0.92,
    OXBLOOD,
    ORANGE,
    phase,
  );
  const badge: CyberPanel = {
    x: card.x + cell * 1.8,
    y: card.y + card.height * 0.43,
    width: card.width * 0.33,
    height: card.height * 0.15,
  };
  panel(context, badge.x, badge.y, badge.width, badge.height, OXBLOOD);
  type(context, "MADE BY SIGNALS", badge.x + cell, badge.y + badge.height * 0.64, cell * 0.9, OXBLOOD, "left", 700, {
    family: "interface",
    maxWidth: badge.width - cell * 2,
  });
  const arrowX = card.x + cell * 2;
  const arrowY = card.y + card.height * 0.66;
  const arrowSize = Math.min(cell * 4.6, card.width * 0.14);
  line(context, arrowX, arrowY + arrowSize, arrowX + arrowSize, arrowY, IVORY, Math.max(5, cell * 0.8));
  line(context, arrowX + arrowSize * 0.38, arrowY, arrowX + arrowSize, arrowY, IVORY, Math.max(5, cell * 0.8));
  line(context, arrowX + arrowSize, arrowY, arrowX + arrowSize, arrowY + arrowSize * 0.62, IVORY, Math.max(5, cell * 0.8));
  drawCyberStar(context, card.x + cell * 3, card.y + card.height - cell * 3.2, cell * 1.15, OXBLOOD);
  type(context, "MACHINE", card.x + cell * 5, card.y + card.height - cell * 3.25, cell * 1.15, OXBLOOD, "left", 800, {
    family: "display",
    maxWidth: card.width * 0.38,
  });
  type(context, `PROTOCOL / ML-${String(positiveModulo(stateTick, 99)).padStart(2, "0")}`, card.x + cell * 5, card.y + card.height - cell * 1.95, cell * 0.58, OXBLOOD, "left", 700, {
    family: "mono",
    maxWidth: card.width * 0.42,
  });
}

const INTERNAL_SCENES: readonly InternalScene[] = [
  { id: "orbital-telemetry", label: "Industrial ID", code: "UA-570", typeface: "display", draw: cyberIndustrialId },
  { id: "constellation-mesh", label: "Lab Registry", code: "FAC-659", typeface: "interface", draw: cyberLabRegistry },
  { id: "glyph-cascade", label: "Glyph Cascade", code: "RAIN-14", typeface: "pixel-line", draw: glyphCascade },
  { id: "barcode-cathedral", label: "Barcode Cathedral", code: "NAVE-43", typeface: "pixel-square", draw: barcodeCathedral },
  { id: "cellular-atlas", label: "Cellular Atlas", code: "LIFE-32", typeface: "pixel-square", draw: cellularAtlas },
  { id: "packet-river", label: "Packet River", code: "FLOW-06", typeface: "mono", draw: packetRiver },
  { id: "seismic-field", label: "Seismic Field", code: "QUAKE-12", typeface: "pixel-line", draw: seismicField },
  { id: "clockwork-rings", label: "Clockwork Rings", code: "GEAR-05", typeface: "pixel-circle", draw: clockworkRings },
  { id: "vector-scope", label: "Neural Relic", code: "XAI-09", typeface: "display", draw: cyberNeuralRelic },
  { id: "memory-map", label: "Memory Map", code: "RAM-64", typeface: "pixel-square", draw: memoryMap },
  { id: "waveform-stack", label: "Waveform Stack", code: "WAVE-16", typeface: "pixel-line", draw: waveformStack },
  { id: "data-loom", label: "Data Loom", code: "WARP-18", typeface: "pixel-triangle", draw: dataLoom },
  { id: "hex-field", label: "Hex Field", code: "HEX-19", typeface: "pixel-grid", draw: hexField },
  { id: "satellite-topology", label: "Satellite Topology", code: "SAT-08", typeface: "pixel-circle", draw: satelliteTopology },
  { id: "archive-index", label: "Archive Index", code: "ARC-96", typeface: "mono", draw: archiveIndex },
  { id: "raster-portrait", label: "Void Mesh", code: "VOID-01", typeface: "display", draw: cyberVoidMesh },
  { id: "checker-error", label: "Checker Error", code: "ERR-77", typeface: "pixel-triangle", draw: checkerError },
  { id: "deep-scan", label: "Machine Protocol", code: "ML-88", typeface: "display", draw: cyberMachineProtocol },
];

export const SIGNAL_SCENES: readonly SignalSceneDescriptor[] = Object.freeze(
  INTERNAL_SCENES.map(({ id, label, code }) => Object.freeze({ id, label, code })),
);

export const SIGNAL_SCENE_COUNT = SIGNAL_SCENES.length;

const SIGNAL_SCENE_INDICES = Object.freeze(
  Array.from({ length: SIGNAL_SCENE_COUNT }, (_, index) => index),
);
const SIGNAL_CYCLE_CACHE_LIMIT = 64;
const signalCycleCache = new Map<string, readonly number[]>();

function resolveSignalCycle(shuffleSeed: string, cycleIndex: number) {
  const cacheKey = `${shuffleSeed}\u0000${cycleIndex}`;
  const cached = signalCycleCache.get(cacheKey);
  if (cached) return cached;

  const cycle = Object.freeze(
    shuffledCycle(SIGNAL_SCENE_INDICES, shuffleSeed, cycleIndex),
  );
  if (signalCycleCache.size >= SIGNAL_CYCLE_CACHE_LIMIT) {
    const oldestKey = signalCycleCache.keys().next().value;
    if (oldestKey !== undefined) signalCycleCache.delete(oldestKey);
  }
  signalCycleCache.set(cacheKey, cycle);
  return cycle;
}

export function resolveSignalSceneIndex(
  logicalIndex: number,
  shuffleSeed?: string,
) {
  const safeLogicalIndex = Number.isFinite(logicalIndex)
    ? Math.max(0, Math.floor(logicalIndex))
    : 0;
  if (!shuffleSeed) {
    return positiveModulo(safeLogicalIndex, SIGNAL_SCENE_COUNT);
  }

  const cycleIndex = Math.floor(safeLogicalIndex / SIGNAL_SCENE_COUNT);
  const cyclePosition = positiveModulo(safeLogicalIndex, SIGNAL_SCENE_COUNT);
  return resolveSignalCycle(shuffleSeed, cycleIndex)[cyclePosition] ?? 0;
}

interface TransitionBuffer {
  canvas: HTMLCanvasElement;
  flipPlan: ReturnType<typeof buildCellFlipPlan>;
  seed: string;
  sceneIndex: number;
  width: number;
  height: number;
  ratio: number;
  duration: number;
}

const transitionBufferCache = new WeakMap<CanvasRenderingContext2D, TransitionBuffer>();

function resolveTransitionBuffer(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneIndex: number,
  ratio: number,
  seed: string,
  duration: number,
) {
  const cached = transitionBufferCache.get(context);
  if (
    cached &&
    cached.sceneIndex === sceneIndex &&
    cached.seed === seed &&
    cached.width === width &&
    cached.height === height &&
    cached.ratio === ratio &&
    cached.duration === duration
  ) {
    return cached;
  }

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * ratio));
  canvas.height = Math.max(1, Math.ceil(height * ratio));
  const bufferContext = canvas.getContext("2d", { alpha: false });
  if (!bufferContext) return null;
  bufferContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawScene(bufferContext, width, height, sceneIndex, 0, duration, true);
  const result = {
    canvas,
    flipPlan: buildCellFlipPlan(width, height, seed),
    seed,
    sceneIndex,
    width,
    height,
    ratio,
    duration,
  };
  transitionBufferCache.set(context, result);
  return result;
}

function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneIndex: number,
  time: number,
  sceneDurationMs = DEFAULT_SCENE_DURATION,
  completePropagation = false,
) {
  const safeIndex = positiveModulo(Math.floor(sceneIndex), INTERNAL_SCENES.length);
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const stateTime = quantizeSignalTime(safeTime, SIGNAL_STATE_INTERVAL);
  const confidence = signalConfidence(safeTime, sceneDurationMs);
  const frame: SceneFrame = {
    context,
    width: Math.max(1, width),
    height: Math.max(1, height),
    time: stateTime,
    phase: Math.floor(stateTime / SIGNAL_STATE_INTERVAL),
    stateTick: Math.floor(stateTime / SIGNAL_STATE_INTERVAL),
    confidence,
    layout: resolveSignalLayout(width, height),
  };
  activeSignalConfidence = confidence;
  activeSignalTime = safeTime;
  activeSignalTypeface = INTERNAL_SCENES[safeIndex].typeface;
  activeSignalContentTop = null;
  activeSignalStateProgress = completePropagation
    ? 1
    : clamp((safeTime - stateTime) / SIGNAL_STATE_INTERVAL);
  context.save();
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  INTERNAL_SCENES[safeIndex].draw(frame);
  drawCyberFinish(frame, SIGNAL_SCENE_ACCENTS[safeIndex] ?? MAGENTA);
  context.restore();
}

export function renderSignalScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneIndex: number,
  elapsedMs: number,
) {
  drawScene(context, width, height, sceneIndex, elapsedMs);
  return SIGNAL_SCENES[positiveModulo(Math.floor(sceneIndex), SIGNAL_SCENE_COUNT)];
}

export function getSignalFrameInfo(
  elapsedMs: number,
  options: SignalRenderOptions = {},
): SignalFrameInfo {
  const duration = Math.max(4_000, options.sceneDurationMs ?? DEFAULT_SCENE_DURATION);
  const transition = clamp(options.transitionMs ?? DEFAULT_TRANSITION_DURATION, 0, duration * 0.3);
  const offset = positiveModulo(Math.floor(options.sceneOffset ?? 0), SIGNAL_SCENE_COUNT);
  const safeTime = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const rawIndex = Math.floor(safeTime / duration);
  const logicalIndex = rawIndex + offset;
  const sceneIndex = resolveSignalSceneIndex(logicalIndex, options.shuffleSeed);
  const nextSceneIndex = resolveSignalSceneIndex(logicalIndex + 1, options.shuffleSeed);
  const localTime = positiveModulo(safeTime, duration);
  const transitionStart = duration - transition;
  const transitionProgress = options.reducedMotion || transition === 0
    ? 0
    : clamp((localTime - transitionStart) / transition);
  return {
    sceneIndex,
    nextSceneIndex,
    scene: SIGNAL_SCENES[sceneIndex],
    nextScene: SIGNAL_SCENES[nextSceneIndex],
    sceneProgress: localTime / duration,
    transitionProgress,
  };
}

export function renderSignalLibraryFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  elapsedMs: number,
  options: SignalRenderOptions = {},
): SignalFrameInfo {
  const info = getSignalFrameInfo(elapsedMs, options);
  const duration = Math.max(4_000, options.sceneDurationMs ?? DEFAULT_SCENE_DURATION);
  const localTime = positiveModulo(Math.max(0, elapsedMs), duration);
  drawScene(
    context,
    width,
    height,
    info.sceneIndex,
    localTime,
    duration,
    Boolean(options.reducedMotion),
  );

  if (
    info.transitionProgress > 0 &&
    typeof document !== "undefined" &&
    typeof context.drawImage === "function"
  ) {
    const requestedRatio = Math.max(
      0.1,
      Number.isFinite(context.canvas?.width / Math.max(1, width))
        ? context.canvas.width / Math.max(1, width)
        : 1,
    );
    const sourceRatio = resolveBackingStore(
      width,
      height,
      requestedRatio,
      TRANSITION_PIXEL_BUDGET,
    ).ratio;
    const transitionSeed = `${info.sceneIndex}:${info.nextSceneIndex}`;
    const buffer = resolveTransitionBuffer(
      context,
      width,
      height,
      info.nextSceneIndex,
      sourceRatio,
      transitionSeed,
      duration,
    );
    if (buffer) {
      for (const cell of buffer.flipPlan) {
        const switchesOff = cellFlipProgress(
          clamp(info.transitionProgress / 0.82),
          cell,
        );
        const switchesOn = cellFlipProgress(
          clamp((info.transitionProgress - 0.12) / 0.88),
          cell,
        );
        if (switchesOff === 0) continue;
        const x = Math.max(0, cell.x);
        const y = Math.max(0, cell.y);
        const right = Math.min(width, cell.x + cell.width);
        const bottom = Math.min(height, cell.y + cell.height);
        const cellWidth = right - x;
        const cellHeight = bottom - y;
        if (cellWidth <= 0 || cellHeight <= 0) continue;
        context.fillStyle = NIGHT;
        context.fillRect(x, y, cellWidth, cellHeight);
        if (switchesOn === 0) continue;
        context.drawImage(
          buffer.canvas,
          x * sourceRatio,
          y * sourceRatio,
          cellWidth * sourceRatio,
          cellHeight * sourceRatio,
          x,
          y,
          cellWidth,
          cellHeight,
        );
      }
    }
  }

  return info;
}
