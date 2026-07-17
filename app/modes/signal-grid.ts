const SHORT_AXIS_CELLS = 48;
const SHORT_VIEWPORT_HEIGHT = 560;
const WIDE_ASPECT_RATIO = 1.9;
const PORTRAIT_ASPECT_RATIO = 0.9;
const DEFAULT_TIME_INTERVAL = 160;
const DEFAULT_MAX_FLIP_CELLS = 240;
const HARD_MAX_FLIP_CELLS = 4_096;

export type SignalViewportProfile = "short" | "wide" | "portrait" | "standard";

type SignalBounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type SignalLayout = Readonly<{
  profile: SignalViewportProfile;
  viewportWidth: number;
  viewportHeight: number;
  shortAxisCells: number;
  cellSize: number;
  columns: number;
  rows: number;
  gridWidth: number;
  gridHeight: number;
  originX: number;
  originY: number;
  bounds: SignalBounds;
}>;

export type SignalWeightRole = "primary" | "secondary" | "tertiary";

export type SignalFlipCell = Readonly<{
  id: string;
  column: number;
  row: number;
  x: number;
  y: number;
  width: number;
  height: number;
  order: number;
  threshold: number;
}>;

function finiteDimension(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(value, Number.MAX_SAFE_INTEGER);
}

function finiteNonNegative(value: number, fallback = 0) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, value);
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothStep(value: number) {
  const amount = clamp(value);
  return amount * amount * (3 - 2 * amount);
}

export function classifySignalViewport(
  width: number,
  height: number,
): SignalViewportProfile {
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
    return "standard";
  }

  const aspect = width / height;
  if (aspect <= PORTRAIT_ASPECT_RATIO) return "portrait";
  if (height <= SHORT_VIEWPORT_HEIGHT) return "short";
  if (aspect >= WIDE_ASPECT_RATIO) return "wide";
  return "standard";
}

export function resolveSignalLayout(width: number, height: number): SignalLayout {
  const viewportWidth = finiteDimension(width);
  const viewportHeight = finiteDimension(height);
  const cellSize = Math.min(viewportWidth, viewportHeight) / SHORT_AXIS_CELLS;
  const columns = Math.max(SHORT_AXIS_CELLS, Math.floor(viewportWidth / cellSize));
  const rows = Math.max(SHORT_AXIS_CELLS, Math.floor(viewportHeight / cellSize));
  const gridWidth = columns * cellSize;
  const gridHeight = rows * cellSize;
  const originX = (viewportWidth - gridWidth) / 2;
  const originY = (viewportHeight - gridHeight) / 2;
  const bounds = Object.freeze({
    x: originX,
    y: originY,
    width: gridWidth,
    height: gridHeight,
  });

  return Object.freeze({
    profile: classifySignalViewport(width, height),
    viewportWidth,
    viewportHeight,
    shortAxisCells: SHORT_AXIS_CELLS,
    cellSize,
    columns,
    rows,
    gridWidth,
    gridHeight,
    originX,
    originY,
    bounds,
  });
}

function clipBounds(layout: SignalLayout, bounds?: Partial<SignalBounds>): SignalBounds {
  const gridRight = layout.originX + layout.gridWidth;
  const gridBottom = layout.originY + layout.gridHeight;
  const requestedX = Number.isFinite(bounds?.x) ? (bounds?.x as number) : layout.originX;
  const requestedY = Number.isFinite(bounds?.y) ? (bounds?.y as number) : layout.originY;
  const requestedWidth = Number.isFinite(bounds?.width)
    ? Math.max(0, bounds?.width as number)
    : layout.gridWidth;
  const requestedHeight = Number.isFinite(bounds?.height)
    ? Math.max(0, bounds?.height as number)
    : layout.gridHeight;
  const x = clamp(requestedX, layout.originX, gridRight);
  const y = clamp(requestedY, layout.originY, gridBottom);
  const right = clamp(requestedX + requestedWidth, x, gridRight);
  const bottom = clamp(requestedY + requestedHeight, y, gridBottom);

  return Object.freeze({ x, y, width: right - x, height: bottom - y });
}

export function fitCellGrid(
  layout: SignalLayout,
  columns: number,
  rows: number,
  bounds?: Partial<SignalBounds>,
) {
  const safeBounds = clipBounds(layout, bounds);
  const epsilon = layout.cellSize * 1e-7;
  const firstColumn = Math.max(
    0,
    Math.ceil((safeBounds.x - layout.originX - epsilon) / layout.cellSize),
  );
  const firstRow = Math.max(
    0,
    Math.ceil((safeBounds.y - layout.originY - epsilon) / layout.cellSize),
  );
  const columnEnd = Math.min(
    layout.columns,
    Math.floor(
      (safeBounds.x + safeBounds.width - layout.originX + epsilon) / layout.cellSize,
    ),
  );
  const rowEnd = Math.min(
    layout.rows,
    Math.floor(
      (safeBounds.y + safeBounds.height - layout.originY + epsilon) / layout.cellSize,
    ),
  );
  const availableColumns = Math.max(0, columnEnd - firstColumn);
  const availableRows = Math.max(0, rowEnd - firstRow);
  const requestedColumns = Number.isFinite(columns) ? Math.max(0, Math.floor(columns)) : 0;
  const requestedRows = Number.isFinite(rows) ? Math.max(0, Math.floor(rows)) : 0;
  const fittedColumns = Math.min(requestedColumns, availableColumns);
  const fittedRows = Math.min(requestedRows, availableRows);
  const column = firstColumn + Math.floor((availableColumns - fittedColumns) / 2);
  const row = firstRow + Math.floor((availableRows - fittedRows) / 2);

  return Object.freeze({
    column,
    row,
    columns: fittedColumns,
    rows: fittedRows,
    x: layout.originX + column * layout.cellSize,
    y: layout.originY + row * layout.cellSize,
    width: fittedColumns * layout.cellSize,
    height: fittedRows * layout.cellSize,
    cellSize: layout.cellSize,
  });
}

export function quantizeSignalTime(elapsedMs: number, intervalMs = DEFAULT_TIME_INTERVAL) {
  const elapsed = finiteNonNegative(elapsedMs);
  const interval = Number.isFinite(intervalMs) && intervalMs > 0
    ? intervalMs
    : DEFAULT_TIME_INTERVAL;
  return Math.floor(elapsed / interval) * interval;
}

export function signalConfidence(elapsedMs: number, sceneDurationMs: number) {
  const elapsed = finiteNonNegative(elapsedMs);
  if (!Number.isFinite(sceneDurationMs) || sceneDurationMs <= 0) return 1;
  return 1 - smoothStep(elapsed / sceneDurationMs);
}

export function signalWeight(confidence: number, role: SignalWeightRole) {
  const amount = smoothStep(Number.isFinite(confidence) ? confidence : 0);
  const range = role === "primary"
    ? [420, 780]
    : role === "secondary"
      ? [300, 620]
      : [220, 460];
  return range[0] + (range[1] - range[0]) * amount;
}

export function resolveBackingStore(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  maxPixels: number,
) {
  const safeWidth = finiteDimension(cssWidth);
  const safeHeight = finiteDimension(cssHeight);
  const requestedRatio = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? Math.min(devicePixelRatio, 8)
    : 1;
  const pixelCap = Number.isFinite(maxPixels) && maxPixels > 0
    ? Math.max(1, Math.floor(maxPixels))
    : 1;
  const desiredWidth = Math.max(1, Math.round(safeWidth * requestedRatio));
  const desiredHeight = Math.max(1, Math.round(safeHeight * requestedRatio));

  let width = desiredWidth;
  let height = desiredHeight;
  if (
    !Number.isSafeInteger(desiredWidth) ||
    !Number.isSafeInteger(desiredHeight) ||
    desiredWidth > Math.floor(pixelCap / desiredHeight)
  ) {
    const aspect = safeWidth / safeHeight;
    if (aspect >= 1) {
      height = Math.max(1, Math.floor(Math.sqrt(pixelCap / aspect)));
      width = Math.max(1, Math.min(Math.floor(height * aspect), Math.floor(pixelCap / height)));
    } else {
      width = Math.max(1, Math.floor(Math.sqrt(pixelCap * aspect)));
      height = Math.max(1, Math.min(Math.floor(width / aspect), Math.floor(pixelCap / width)));
    }
  }

  while (width * height > pixelCap) {
    if (width >= height && width > 1) width -= 1;
    else if (height > 1) height -= 1;
    else break;
  }

  const ratio = Math.min(width / safeWidth, height / safeHeight);
  return Object.freeze({ width, height, ratio, pixelCount: width * height });
}

function hashSeed(seed: string | number) {
  const value = String(seed);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unitHash(column: number, row: number, seed: number) {
  let value = Math.imul(column + 1, 374761393);
  value = (value + Math.imul(row + 1, 668265263) + Math.imul(seed, 1442695041)) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function buildCellFlipPlan(
  width: number,
  height: number,
  seed: string | number,
  maxCells = DEFAULT_MAX_FLIP_CELLS,
): readonly SignalFlipCell[] {
  const safeWidth = finiteDimension(width);
  const safeHeight = finiteDimension(height);
  const maximum = Number.isFinite(maxCells) && maxCells > 0
    ? Math.min(HARD_MAX_FLIP_CELLS, Math.max(1, Math.floor(maxCells)))
    : DEFAULT_MAX_FLIP_CELLS;
  const layout = resolveSignalLayout(safeWidth, safeHeight);
  let groupSize = 1;
  let columns = Math.ceil((layout.columns + 2) / groupSize);
  let rows = Math.ceil((layout.rows + 2) / groupSize);
  while (columns * rows > maximum) {
    groupSize += 1;
    columns = Math.ceil((layout.columns + 2) / groupSize);
    rows = Math.ceil((layout.rows + 2) / groupSize);
  }
  const seedValue = hashSeed(seed);
  const sourceColumn = seedValue % columns;
  const sourceRow = (seedValue >>> 16) % rows;
  const maximumDistance = Math.max(
    1,
    Math.hypot(
      Math.max(sourceColumn, columns - sourceColumn - 1),
      Math.max(sourceRow, rows - sourceRow - 1),
    ),
  );
  const cellSize = layout.cellSize * groupSize;
  const originX = layout.originX - layout.cellSize;
  const originY = layout.originY - layout.cellSize;
  const ranked: Array<SignalFlipCell & { score: number }> = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const distance = Math.hypot(column - sourceColumn, row - sourceRow) / maximumDistance;
      ranked.push({
        id: `${column}:${row}`,
        column,
        row,
        x: originX + column * cellSize,
        y: originY + row * cellSize,
        width: cellSize,
        height: cellSize,
        order: 0,
        threshold: 0,
        score: distance + unitHash(column, row, seedValue) * 0.045,
      });
    }
  }

  ranked.sort((left, right) =>
    left.score - right.score || left.row - right.row || left.column - right.column,
  );

  const count = ranked.length;
  return Object.freeze(
    ranked.map((cell, order) => Object.freeze({
      id: cell.id,
      column: cell.column,
      row: cell.row,
      x: cell.x,
      y: cell.y,
      width: cell.width,
      height: cell.height,
      order,
      threshold: (order + 1) / (count + 1),
    })),
  );
}

export function cellFlipProgress(progress: number, cell: SignalFlipCell): 0 | 1 {
  const amount = clamp(Number.isFinite(progress) ? progress : 0);
  const threshold = clamp(Number.isFinite(cell.threshold) ? cell.threshold : 1);
  return amount >= threshold ? 1 : 0;
}
