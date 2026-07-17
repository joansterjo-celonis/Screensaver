import {
  buildCellFlipPlan,
  cellFlipProgress,
  fitCellGrid,
  quantizeSignalTime,
  resolveBackingStore,
  resolveSignalLayout,
  signalConfidence,
  signalWeight,
  type SignalLayout,
} from "./signal-grid";
import { shuffledCycle } from "../shuffle";

const TAU = Math.PI * 2;

export const SIGNAL_STATE_INTERVAL = 160;
export const SIGNAL_FONT_FAMILY =
  '"Geist Signal", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export const SIGNAL_PALETTE = Object.freeze({
  oxblood: "#251015",
  night: "#160c0f",
  ivory: "#eadfce",
  magenta: "#e34c82",
  dimIvory: "rgba(234, 223, 206, 0.42)",
  faintIvory: "rgba(234, 223, 206, 0.12)",
  dimOxblood: "rgba(37, 16, 21, 0.48)",
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
  draw: (frame: SceneFrame) => void;
}

const DEFAULT_SCENE_DURATION = 11_500;
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

function type(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color: string = IVORY,
  align: CanvasTextAlign = "left",
  weight = 400,
) {
  const role = weight >= 620 ? "primary" : weight >= 390 ? "secondary" : "tertiary";
  const resolvedWeight = signalWeight(activeSignalConfidence, role);
  context.fillStyle = color;
  context.font = `${resolvedWeight.toFixed(1)} ${Math.max(6, size)}px ${SIGNAL_FONT_FAMILY}`;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  context.fillText(value, x, y);
}

let activeSignalConfidence = 0.72;

interface SignalCell {
  x: number;
  y: number;
  size: number;
  color?: string;
  alpha?: number;
}

function drawSignalCells(
  context: CanvasRenderingContext2D,
  cells: readonly SignalCell[],
  defaultColor = IVORY,
) {
  for (const cell of cells) {
    context.globalAlpha = cell.alpha ?? 1;
    context.fillStyle = cell.color ?? defaultColor;
    context.fillRect(cell.x, cell.y, cell.size, cell.size);
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
  const inset = Math.max(1, cellSize * 0.17);
  values.forEach((value, index) => {
    const amount = clamp(value);
    context.fillStyle = index === activeIndex ? MAGENTA : amount > 0.48 ? IVORY : FAINT;
    context.fillRect(
      x + index * cellSize + inset,
      y + inset + (1 - amount) * cellSize * 0.34,
      Math.max(1, cellSize - inset * 2),
      Math.max(1, cellSize * (0.32 + amount * 0.34)),
    );
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
        const pattern = activeSignalStateProgress >= threshold
          ? currentPattern
          : previousPattern;
        if (pattern[row][column] !== "1") continue;
        context.fillStyle = color;
        context.fillRect(
          x + characterIndex * characterWidth + column * cellSize,
          y + row * cellSize,
          dot,
          dot,
        );
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

function drawSharedGrid(frame: SceneFrame, color = "rgba(234, 223, 206, 0.055)") {
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
  const top = layout.originY + layout.cellSize * 3;
  const bottom = layout.originY + layout.gridHeight - layout.cellSize * 2;
  const tiny = Math.max(7, layout.cellSize * 0.86);
  const ink = inverse ? OXBLOOD : IVORY;
  const dim = inverse ? DIM_DARK : DIM;
  type(context, `BMS / ${code}`, padX, top, tiny, ink, "left", 600);
  type(context, title.toUpperCase(), width - padX, top, tiny, inverse ? OXBLOOD : MAGENTA, "right", 600);
  line(context, padX, top + layout.cellSize, width - padX, top + layout.cellSize, dim);
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
  type(context, "SIGNAL / NOMINAL", width - padX, bottom, tiny, ink, "right");
}

function signalContent(frame: SceneFrame) {
  const { layout } = frame;
  return {
    x: layout.originX + layout.cellSize * 2,
    y: layout.originY + layout.cellSize * 7,
    width: layout.gridWidth - layout.cellSize * 4,
    height: layout.gridHeight - layout.cellSize * 13,
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
    (stacked ? content.height * 0.54 : content.height) / layout.cellSize,
  ) * layout.cellSize;
  const cx = content.x + orbitWidth * 0.5;
  const cy = content.y + orbitHeight * 0.5;
  const radius = Math.max(layout.cellSize * 6, Math.min(orbitWidth, orbitHeight) * 0.44);
  const ringRatios = [0.32, 0.52, 0.73, 0.95];
  const activeSector = positiveModulo(stateTick, 36);
  const cells: SignalCell[] = [];

  const firstColumn = Math.floor((content.x - layout.originX) / layout.cellSize);
  const lastColumn = Math.ceil((content.x + orbitWidth - layout.originX) / layout.cellSize);
  const firstRow = Math.floor((content.y - layout.originY) / layout.cellSize);
  const lastRow = Math.ceil((content.y + orbitHeight - layout.originY) / layout.cellSize);
  for (let row = firstRow; row < lastRow; row += 1) {
    for (let column = firstColumn; column < lastColumn; column += 1) {
      const x = layout.originX + (column + 0.5) * layout.cellSize;
      const y = layout.originY + (row + 0.5) * layout.cellSize;
      const distance = Math.hypot(x - cx, y - cy);
      const ringIndex = ringRatios.findIndex(
        (ratio) => Math.abs(distance - radius * ratio) <= layout.cellSize * 0.48,
      );
      if (ringIndex < 0) continue;
      const angle = positiveModulo(Math.atan2(y - cy, x - cx), TAU);
      const sector = Math.floor((angle / TAU) * 36);
      const cellTick = propagatedStateTick(
        stateTick,
        column - firstColumn,
        row - firstRow,
        Math.max(1, lastColumn - firstColumn),
        Math.max(1, lastRow - firstRow),
      );
      const event = ringIndex === 2 && sector === positiveModulo(cellTick, 36);
      const cardinal = sector % 9 === 0;
      cells.push({
        x: x - layout.cellSize * 0.28,
        y: y - layout.cellSize * 0.28,
        size: layout.cellSize * 0.56,
        color: event ? MAGENTA : cardinal ? IVORY : DIM,
        alpha: event ? 1 : 0.55 + ringIndex * 0.1,
      });
    }
  }

  for (let index = 0; index < 96; index += 1) {
    const column = firstColumn + Math.floor(hash(index, 1, 7042) * Math.max(1, lastColumn - firstColumn));
    const row = firstRow + Math.floor(hash(index, 2, 7042) * Math.max(1, lastRow - firstRow));
    const x = layout.originX + (column + 0.5) * layout.cellSize;
    const y = layout.originY + (row + 0.5) * layout.cellSize;
    if (Math.hypot(x - cx, y - cy) > radius * 0.84 || hash(column, row, 9) < 0.38) continue;
    cells.push({
      x: x - layout.cellSize * 0.12,
      y: y - layout.cellSize * 0.12,
      size: layout.cellSize * 0.24,
      color: IVORY,
      alpha: 0.28 + hash(index, propagatedStateTick(stateTick, column - firstColumn, row - firstRow, Math.max(1, lastColumn - firstColumn), Math.max(1, lastRow - firstRow)) >> 3, 12) * 0.5,
    });
  }
  drawSignalCells(context, cells);

  const targetAngle = (activeSector / 36) * TAU;
  const targetX = snapSignalCenter(layout, cx + Math.cos(targetAngle) * radius * ringRatios[2], "x");
  const targetY = snapSignalCenter(layout, cy + Math.sin(targetAngle) * radius * ringRatios[2], "y");
  const bracket = layout.cellSize * 1.2;
  context.strokeStyle = MAGENTA;
  context.lineWidth = Math.max(1, layout.cellSize * 0.1);
  context.strokeRect(targetX - bracket / 2, targetY - bracket / 2, bracket, bracket);

  const railX = stacked ? content.x : content.x + orbitWidth + layout.cellSize * 2;
  const railY = stacked ? content.y + orbitHeight + layout.cellSize * 2 : content.y + layout.cellSize * 2;
  const railWidth = stacked ? content.width : content.width - orbitWidth - layout.cellSize * 2;
  const tiny = Math.max(7, layout.cellSize * 0.82);
  type(context, "ACQUISITION / LOCK", railX, railY, tiny, MAGENTA, "left", 650);
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
  for (let row = 0; row < 8; row += 1) {
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
  context.fillStyle = "rgba(227, 76, 130, 0.09)";
  context.fillRect(content.x, gridFit.y + scanRow * layout.cellSize * 2, content.width, layout.cellSize * 2);
  line(context, content.x, gridFit.y + scanRow * layout.cellSize * 2, content.x + content.width, gridFit.y + scanRow * layout.cellSize * 2, MAGENTA, 1.5);
  chrome(frame, "Glyph cascade", "RAIN-14");
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
      context.fillStyle = column === write && active ? MAGENTA : active ? (distance === 0 ? IVORY : DIM) : "rgba(234, 223, 206, 0.025)";
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
  const metrics = resolveLifeMetrics(stateTick);
  const previousMetrics = resolveLifeMetrics(Math.max(0, stateTick - 1));
  const {
    generation,
    alive,
    births,
    deaths,
  } = metrics;
  const availableColumns = layout.columns - 4;
  const panelCount = availableColumns >= 96 ? 3 : availableColumns >= 66 ? 2 : 1;
  const railColumns = 10;
  const panelGap = 2;
  const totalColumns = panelCount * LIFE_COLUMNS + (panelCount - 1) * panelGap + panelGap + railColumns;
  const firstColumn = Math.max(2, Math.floor((layout.columns - totalColumns) / 2));
  const firstRow = 3;
  const panelModes = panelCount === 3
    ? (["history", "live", "delta"] as const)
    : panelCount === 2
      ? (["live", "delta"] as const)
      : (["live"] as const);
  let fieldX = layout.originX + firstColumn * layout.cellSize;
  panelModes.forEach((mode) => {
    for (let row = 0; row < LIFE_ROWS; row += 1) {
      for (let column = 0; column < LIFE_COLUMNS; column += 1) {
        const index = row * LIFE_COLUMNS + column;
        const cellTick = propagatedStateTick(
          stateTick,
          column,
          row,
          LIFE_COLUMNS,
          LIFE_ROWS,
        );
        const source = cellTick === stateTick ? metrics : previousMetrics;
        const sourceHistory = LIFE_STATES[
          positiveModulo(source.generation - 1, LIFE_STATES.length)
        ];
        const changed = source.current[index] !== source.next[index];
        const propagated = positiveModulo(column * 3 + row * 2, 5) <= source.propagationStage;
        const live = changed && propagated
          ? source.next[index] === 1
          : source.current[index] === 1;
        const active = mode === "history"
          ? sourceHistory[index] === 1
          : mode === "delta"
            ? changed
            : live;
        const x = fieldX + column * layout.cellSize + layout.cellSize * 0.15;
        const y = layout.originY + (firstRow + row) * layout.cellSize + layout.cellSize * 0.15;
        const isPrimaryEvent = mode === "live" && changed && propagated;
        context.fillStyle = active
          ? isPrimaryEvent ? MAGENTA : mode === "history" ? DIM : IVORY
          : "rgba(234, 223, 206, 0.025)";
        context.fillRect(x, y, layout.cellSize * 0.7, layout.cellSize * 0.7);
      }
    }
    type(
      context,
      mode === "history" ? "T-1" : mode === "delta" ? "DELTA" : "LIVE",
      fieldX,
      layout.originY + layout.cellSize * 2.4,
      Math.max(7, layout.cellSize * 0.7),
      mode === "live" ? MAGENTA : DIM,
      "left",
      mode === "live" ? 650 : 400,
    );
    fieldX += (LIFE_COLUMNS + panelGap) * layout.cellSize;
  });
  chrome(frame, "Cellular atlas", "LIFE-32");
  const tiny = Math.max(7, layout.cellSize * 0.76);
  const statsX = fieldX;
  const statsY = layout.originY + layout.cellSize * 7;
  type(context, "GENERATION DELTA", statsX, statsY, tiny, MAGENTA, "left", 650);
  const stats = [
    ["GEN", generation, previousMetrics.generation],
    ["POP", alive, previousMetrics.alive],
    ["BIRTH", births, previousMetrics.births],
    ["DEATH", deaths, previousMetrics.deaths],
    ["DENS", metrics.density, previousMetrics.density],
    ["ENT", metrics.entropy, previousMetrics.entropy],
    ["EDGE", metrics.edge, previousMetrics.edge],
    ["SUM", metrics.checksum, previousMetrics.checksum],
  ] as const;
  stats.forEach(([label, value, previousValue], index) => {
    const y = statsY + layout.cellSize * (2 + index * 2);
    type(context, label, statsX, y, tiny, DIM);
    drawDotMatrixValue(
      context,
      String(value).padStart(4, "0"),
      statsX + layout.cellSize * 4.3,
      y - layout.cellSize * 0.92,
      layout.cellSize * 0.18,
      IVORY,
      String(previousValue).padStart(4, "0"),
    );
  });
  for (let row = 0; row < 8; row += 1) {
    const values = Array.from({ length: railColumns }, (_, column) =>
      hash(column, row, Math.floor(stateTick / 5)),
    );
    drawCellStrip(
      context,
      statsX,
      statsY + layout.cellSize * (20 + row * 2),
      values,
      layout.cellSize,
      row === stateTick % 8 ? stateTick % railColumns : -1,
    );
  }
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
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height);
  drawSharedGrid(frame);
  chrome(frame, "Vector scope", "XY-09");
  const content = signalContent(frame);
  const diameterCells = Math.max(18, Math.min(38, Math.floor(Math.min(content.width, content.height) / layout.cellSize) - 2));
  const field = fitCellGrid(layout, diameterCells, diameterCells, content);
  const centerColumn = (field.columns - 1) / 2;
  const centerRow = (field.rows - 1) / 2;
  const radiusCells = Math.min(field.columns, field.rows) * 0.47;
  const lit = new Map<string, string>();
  for (let row = 0; row < field.rows; row += 1) {
    for (let column = 0; column < field.columns; column += 1) {
      const distance = Math.hypot(column - centerColumn, row - centerRow);
      if ([0.33, 0.66, 1].some((ratio) => Math.abs(distance - radiusCells * ratio) < 0.42)) {
        lit.set(`${column}:${row}`, distance > radiusCells * 0.9 ? DIM : FAINT);
      }
    }
  }
  const buildTrace = (tick: number) => {
    const trace = new Map<string, string>();
    const phase = tick * 0.11;
    for (let sample = 0; sample < 220; sample += 1) {
      const amount = (sample / 220) * TAU;
      const column = Math.round(centerColumn + Math.sin(amount * 3 + phase) * radiusCells * 0.82);
      const row = Math.round(centerRow + Math.sin(amount * 4 + phase * 0.63 + 1.17) * radiusCells * 0.82);
      trace.set(`${column}:${row}`, IVORY);
    }
    for (let sample = 0; sample < 140; sample += 1) {
      const amount = (sample / 140) * TAU;
      const column = Math.round(centerColumn + Math.sin(amount * 2 + phase * 0.71) * radiusCells * 0.54);
      const row = Math.round(centerRow + Math.sin(amount * 5 + phase * 0.39 + 0.7) * radiusCells * 0.54);
      trace.set(`${column}:${row}`, MAGENTA);
    }
    return trace;
  };
  const currentTrace = buildTrace(stateTick);
  const previousTrace = buildTrace(Math.max(0, stateTick - 1));
  const traceKeys = new Set([...currentTrace.keys(), ...previousTrace.keys()]);
  for (const key of traceKeys) {
    const [column, row] = key.split(":").map(Number);
    const cellTick = propagatedStateTick(
      stateTick,
      column,
      row,
      field.columns,
      field.rows,
    );
    const color = cellTick === stateTick ? currentTrace.get(key) : previousTrace.get(key);
    if (color) lit.set(key, color);
  }
  for (const [key, color] of lit) {
    const [column, row] = key.split(":").map(Number);
    context.fillStyle = color;
    context.fillRect(
      field.x + column * layout.cellSize + layout.cellSize * 0.2,
      field.y + row * layout.cellSize + layout.cellSize * 0.2,
      layout.cellSize * 0.6,
      layout.cellSize * 0.6,
    );
  }
  const tiny = Math.max(7, layout.cellSize * 0.8);
  type(context, "X 03.000 HZ", content.x, content.y + content.height, tiny, DIM);
  type(context, "Y 04.000 HZ", content.x + content.width, content.y + content.height, tiny, DIM, "right");
  type(context, "PHASE / CELL LOCK", content.x + content.width / 2, content.y + content.height, tiny, MAGENTA, "center");
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
      context.fillStyle = active ? MAGENTA : value > 0.72 ? "rgba(234, 223, 206, 0.82)" : value > 0.35 ? "rgba(234, 223, 206, 0.24)" : "rgba(234, 223, 206, 0.06)";
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
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Satellite topology", "SAT-08");
  const content = signalContent(frame);
  const cx = snapSignalCenter(layout, content.x + content.width / 2, "x");
  const cy = snapSignalCenter(layout, content.y + content.height * 0.47, "y");
  const baseCells = Math.max(8, Math.floor(Math.min(content.width, content.height) / layout.cellSize * 0.42));
  const planetRadius = Math.max(3, Math.floor(baseCells * 0.28));
  for (let row = -planetRadius; row <= planetRadius; row += 1) {
    for (let column = -planetRadius; column <= planetRadius; column += 1) {
      const distance = Math.hypot(column, row);
      if (Math.abs(distance - planetRadius) > 0.65 && distance > planetRadius * 0.18) continue;
      const size = layout.cellSize * (distance < planetRadius * 0.18 ? 0.54 : 0.3);
      context.fillStyle = distance < planetRadius * 0.18 ? IVORY : DIM;
      context.fillRect(
        cx + column * layout.cellSize - size / 2,
        cy + row * layout.cellSize - size / 2,
        size,
        size,
      );
    }
  }
  const satelliteStates: boolean[] = [];
  for (let orbit = 0; orbit < 4; orbit += 1) {
    const steps = 36 + orbit * 8;
    const rx = baseCells * (0.56 + orbit * 0.18);
    const ry = baseCells * (0.24 + orbit * 0.07);
    const tilt = -0.5 + orbit * 0.34;
    for (let step = 0; step < steps; step += 1) {
      const cellTick = propagatedStateTick(stateTick, step, orbit, steps, 4);
      const activeStep = positiveModulo(cellTick * (orbit % 2 ? -1 : 1) * (orbit + 1) + orbit * 7, steps);
      const angle = (step / steps) * TAU;
      const localX = Math.cos(angle) * rx;
      const localY = Math.sin(angle) * ry;
      const column = Math.round(localX * Math.cos(tilt) - localY * Math.sin(tilt));
      const row = Math.round(localX * Math.sin(tilt) + localY * Math.cos(tilt));
      const x = cx + column * layout.cellSize;
      const y = cy + row * layout.cellSize;
      const active = step === activeStep;
      const size = layout.cellSize * (active ? 0.82 : 0.22);
      context.fillStyle = active ? (orbit === stateTick % 4 ? MAGENTA : IVORY) : FAINT;
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }
    satelliteStates.push(orbit === stateTick % 4);
  }
  const tiny = Math.max(7, layout.cellSize * 0.78);
  satelliteStates.forEach((active, index) => {
    type(context, `SAT-${index + 1} / ${active ? "TX" : "IDLE"}`, content.x, content.y + content.height - layout.cellSize * (4 - index), tiny, active ? MAGENTA : DIM);
  });
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
      context.fillStyle = eye ? MAGENTA : nose || mouth ? IVORY : edge ? DIM : `rgba(234, 223, 206, ${0.24 + hash(column, row, 4) * 0.6})`;
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
  drawSharedGrid(frame, "rgba(37, 16, 21, 0.14)");
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
      context.fillStyle = error ? MAGENTA : active ? OXBLOOD : "rgba(37, 16, 21, 0.08)";
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
  const { context, width, height, stateTick, layout } = frame;
  fill(context, width, height, NIGHT);
  drawSharedGrid(frame);
  chrome(frame, "Deep scan", "DEPTH-∞");
  const content = signalContent(frame);
  const vx = snapSignalCenter(layout, content.x + content.width * 0.5, "x");
  const vy = snapSignalCenter(layout, content.y + content.height * 0.38, "y");
  const horizon = vy + layout.cellSize;
  line(context, content.x, horizon, content.x + content.width, horizon, MAGENTA, 1.5);
  for (let ray = -9; ray <= 9; ray += 1) {
    const targetX = clamp(
      snapSignalCenter(layout, vx + ray * layout.cellSize * 5, "x"),
      content.x,
      content.x + content.width,
    );
    line(context, vx, vy, targetX, content.y + content.height, ray % 4 === 0 ? DIM : FAINT);
  }
  for (let depth = 1; depth <= 16; depth += 1) {
    const amount = depth / 16;
    const y = snapSignalCenter(layout, horizon + Math.pow(amount, 2.25) * (content.y + content.height - horizon), "y");
    line(context, content.x, y, content.x + content.width, y, depth === Math.floor(stateTick / 2) % 16 ? MAGENTA : FAINT);
  }
  for (let portal = 0; portal < 9; portal += 1) {
    const scale = Math.pow((portal + 1) / 9, 2.1);
    const widthCells = Math.max(3, Math.round(3 + scale * Math.floor(content.width / layout.cellSize) * 0.74));
    const heightCells = Math.max(2, Math.round(2 + scale * Math.floor(content.height / layout.cellSize) * 0.46));
    const firstColumn = Math.round((vx - layout.originX) / layout.cellSize - widthCells / 2);
    const firstRow = Math.round((vy - layout.originY) / layout.cellSize - heightCells * 0.38);
    for (let column = 0; column <= widthCells; column += 1) {
      for (const row of [0, heightCells]) {
        const cellTick = propagatedStateTick(
          stateTick,
          column,
          row,
          widthCells + 1,
          heightCells + 1,
        );
        const active = portal === cellTick % 9;
        const size = layout.cellSize * (active ? 0.5 : 0.28);
        context.fillStyle = active ? MAGENTA : portal % 3 === 0 ? IVORY : DIM;
        context.fillRect(
          layout.originX + (firstColumn + column + 0.5) * layout.cellSize - size / 2,
          layout.originY + (firstRow + row + 0.5) * layout.cellSize - size / 2,
          size,
          size,
        );
      }
    }
    for (let row = 1; row < heightCells; row += 1) {
      for (const column of [0, widthCells]) {
        const cellTick = propagatedStateTick(
          stateTick,
          column,
          row,
          widthCells + 1,
          heightCells + 1,
        );
        const active = portal === cellTick % 9;
        const size = layout.cellSize * (active ? 0.5 : 0.28);
        context.fillStyle = active ? MAGENTA : portal % 3 === 0 ? IVORY : DIM;
        context.fillRect(
          layout.originX + (firstColumn + column + 0.5) * layout.cellSize - size / 2,
          layout.originY + (firstRow + row + 0.5) * layout.cellSize - size / 2,
          size,
          size,
        );
      }
    }
  }
  const tiny = Math.max(7, layout.cellSize * 0.78);
  type(context, "RANGE / METERS", content.x, content.y + layout.cellSize, tiny, DIM);
  const range = positiveModulo(stateTick * 43, 9999);
  drawDotMatrixValue(
    context,
    String(range).padStart(4, "0"),
    content.x,
    content.y + layout.cellSize * 2,
    layout.cellSize * 0.55,
    IVORY,
    String(positiveModulo((stateTick - 1) * 43, 9999)).padStart(4, "0"),
  );
  type(context, "RETURN / CLEAN", content.x + content.width, content.y + content.height - layout.cellSize * 2, tiny, MAGENTA, "right");
  type(context, "VOID CONFIDENCE 99.8", content.x + content.width, content.y + content.height, tiny, DIM, "right");
}

const INTERNAL_SCENES: readonly InternalScene[] = [
  { id: "orbital-telemetry", label: "Orbital Telemetry", code: "ORBIT-07", draw: orbitalTelemetry },
  { id: "constellation-mesh", label: "Constellation Mesh", code: "NODE-42", draw: constellationMesh },
  { id: "glyph-cascade", label: "Glyph Cascade", code: "RAIN-14", draw: glyphCascade },
  { id: "barcode-cathedral", label: "Barcode Cathedral", code: "NAVE-43", draw: barcodeCathedral },
  { id: "cellular-atlas", label: "Cellular Atlas", code: "LIFE-32", draw: cellularAtlas },
  { id: "packet-river", label: "Packet River", code: "FLOW-06", draw: packetRiver },
  { id: "seismic-field", label: "Seismic Field", code: "QUAKE-12", draw: seismicField },
  { id: "clockwork-rings", label: "Clockwork Rings", code: "GEAR-05", draw: clockworkRings },
  { id: "vector-scope", label: "Vector Scope", code: "XY-09", draw: vectorScope },
  { id: "memory-map", label: "Memory Map", code: "RAM-64", draw: memoryMap },
  { id: "waveform-stack", label: "Waveform Stack", code: "WAVE-16", draw: waveformStack },
  { id: "data-loom", label: "Data Loom", code: "WARP-18", draw: dataLoom },
  { id: "hex-field", label: "Hex Field", code: "HEX-19", draw: hexField },
  { id: "satellite-topology", label: "Satellite Topology", code: "SAT-08", draw: satelliteTopology },
  { id: "archive-index", label: "Archive Index", code: "ARC-96", draw: archiveIndex },
  { id: "raster-portrait", label: "Raster Portrait", code: "FACE-01", draw: rasterPortrait },
  { id: "checker-error", label: "Checker Error", code: "ERR-77", draw: checkerError },
  { id: "deep-scan", label: "Deep Scan", code: "DEPTH-∞", draw: deepScan },
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
  activeSignalStateProgress = completePropagation
    ? 1
    : clamp((safeTime - stateTime) / SIGNAL_STATE_INTERVAL);
  context.save();
  context.globalAlpha = 1;
  context.globalCompositeOperation = "source-over";
  INTERNAL_SCENES[safeIndex].draw(frame);
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
