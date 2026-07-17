const TAU = Math.PI * 2;

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
}

interface InternalScene extends SignalSceneDescriptor {
  draw: (frame: SceneFrame) => void;
}

const DEFAULT_SCENE_DURATION = 11_500;
const DEFAULT_TRANSITION_DURATION = 1_050;
const MONO = "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
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

function smoothStep(value: number) {
  const amount = clamp(value);
  return amount * amount * (3 - 2 * amount);
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

function hash(x: number, y = 0, seed = 0) {
  let value = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function randomFrom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
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

function circle(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string = DIM,
  lineWidth = 1,
  fillColor?: string,
) {
  context.beginPath();
  context.arc(x, y, Math.max(0.1, radius), 0, TAU);
  if (fillColor) {
    context.fillStyle = fillColor;
    context.fill();
  }
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
  context.fillStyle = color;
  context.font = `${weight} ${Math.max(6, size)}px ${MONO}`;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  context.fillText(value, x, y);
}

function grid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  spacing: number,
  color: string = FAINT,
  xOffset = 0,
  yOffset = 0,
) {
  const step = Math.max(8, spacing);
  context.beginPath();
  for (let x = positiveModulo(xOffset, step); x <= width; x += step) {
    context.moveTo(x, 0);
    context.lineTo(x, height);
  }
  for (let y = positiveModulo(yOffset, step); y <= height; y += step) {
    context.moveTo(0, y);
    context.lineTo(width, y);
  }
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.stroke();
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
  const { context, width, height, time } = frame;
  const pad = width * 0.058;
  const tiny = Math.max(7, width * 0.022);
  const ink = inverse ? OXBLOOD : IVORY;
  const dim = inverse ? DIM_DARK : DIM;
  type(context, `BMS / ${code}`, pad, pad * 1.05, tiny, ink, "left", 600);
  type(context, title.toUpperCase(), width - pad, pad * 1.05, tiny, inverse ? OXBLOOD : MAGENTA, "right", 600);
  line(context, pad, pad * 1.45, width - pad, pad * 1.45, dim);
  type(context, `FRAME ${String(Math.floor(time / 1000)).padStart(4, "0")}`, pad, height - pad * 0.72, tiny, dim);
  type(context, "SIGNAL / NOMINAL", width - pad, height - pad * 0.72, tiny, ink, "right");
}

function orbitalTelemetry(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height);
  grid(context, width, height, Math.max(20, width / 17));
  chrome(frame, "Orbital telemetry", "ORBIT-07");

  const cx = width * 0.5;
  const cy = height * 0.29;
  const radius = Math.min(width * 0.32, height * 0.16);
  const rotation = time * 0.00008;
  for (let ring = 0; ring < 4; ring += 1) {
    context.save();
    context.translate(cx, cy);
    context.rotate(rotation * (ring % 2 ? -1.4 : 1) + ring * 0.38);
    const ringRadius = radius * (0.33 + ring * 0.22);
    context.beginPath();
    context.arc(0, 0, ringRadius, ring * 0.67, ring * 0.67 + Math.PI * 1.42);
    context.strokeStyle = ring === 2 ? MAGENTA : DIM;
    context.lineWidth = ring === 2 ? 2 : 1;
    context.stroke();
    for (let tick = 0; tick < 18 + ring * 5; tick += 1) {
      const angle = (tick / (18 + ring * 5)) * TAU;
      const length = tick % 4 === 0 ? radius * 0.045 : radius * 0.02;
      line(
        context,
        Math.cos(angle) * ringRadius,
        Math.sin(angle) * ringRadius,
        Math.cos(angle) * (ringRadius + length),
        Math.sin(angle) * (ringRadius + length),
        tick % 9 === 0 ? IVORY : DIM,
      );
    }
    context.restore();
  }

  const random = randomFrom(7042);
  context.save();
  context.translate(cx, cy);
  context.rotate(rotation);
  for (let index = 0; index < 180; index += 1) {
    const arm = index % 7;
    const distance = radius * (0.12 + random() * 0.8);
    const angle = (arm / 7) * TAU + (random() - 0.5) * 0.56;
    const point = Math.max(1, width * (0.002 + random() * 0.0025));
    context.fillStyle = index % 23 === phase % 23 ? MAGENTA : IVORY;
    context.globalAlpha = 0.45 + random() * 0.55;
    context.fillRect(Math.cos(angle) * distance, Math.sin(angle) * distance, point, point);
  }
  context.restore();
  context.globalAlpha = 1;

  const pad = width * 0.058;
  const inner = width - pad * 2;
  const top = height * 0.49;
  const gap = width * 0.025;
  const moduleWidth = (inner - gap) / 2;
  panel(context, pad, top, moduleWidth, height * 0.22);
  panel(context, pad + moduleWidth + gap, top, moduleWidth, height * 0.22);
  const tiny = Math.max(7, width * 0.022);
  type(context, "ACT / DISTRIBUTION", pad + tiny, top + tiny * 1.6, tiny, DIM);
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const cell = moduleWidth * 0.085;
      const x = pad + tiny + column * cell * 1.35;
      const y = top + tiny * 2.55 + row * cell * 1.13;
      const active = hash(column, row, phase >> 1) > 0.58;
      context.fillStyle = active ? ((row + column + phase) % 13 === 0 ? MAGENTA : IVORY) : FAINT;
      context.fillRect(x, y, cell * 0.72, cell * 0.72);
    }
  }
  type(context, "PHASE REGISTER", pad + moduleWidth + gap + tiny, top + tiny * 1.6, tiny, DIM);
  for (let row = 0; row < 9; row += 1) {
    const y = top + tiny * (2.9 + row * 1.32);
    const value = String(Math.floor(hash(row, phase >> 2, 91) * 65535)).padStart(5, "0");
    type(context, `${String(row + 1).padStart(2, "0")} / ${value}`, pad + moduleWidth + gap + tiny, y, tiny, row === phase % 9 ? IVORY : DIM);
    context.fillStyle = row === phase % 9 ? MAGENTA : DIM;
    context.fillRect(width - pad - tiny - moduleWidth * 0.3, y - tiny * 0.72, moduleWidth * 0.27 * hash(row, 7, phase >> 2), tiny * 0.34);
  }
}

function constellationMesh(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height, NIGHT);
  grid(context, width, height, Math.max(24, width / 12), "rgba(234, 223, 206, 0.07)");
  chrome(frame, "Constellation mesh", "NODE-42");
  const pad = width * 0.07;
  const top = height * 0.14;
  const fieldHeight = height * 0.67;
  const nodes: Array<{ x: number; y: number; r: number }> = [];
  for (let index = 0; index < 38; index += 1) {
    nodes.push({
      x: pad + hash(index, 1, 73) * (width - pad * 2) + Math.sin(time * 0.00015 + index) * width * 0.008,
      y: top + hash(index, 2, 19) * fieldHeight + Math.cos(time * 0.00011 + index * 1.7) * width * 0.008,
      r: Math.max(1.4, width * (0.003 + hash(index, 3, 7) * 0.005)),
    });
  }
  for (let a = 0; a < nodes.length; a += 1) {
    for (let b = a + 1; b < nodes.length; b += 1) {
      const dx = nodes[a].x - nodes[b].x;
      const dy = nodes[a].y - nodes[b].y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < width * 0.19 && hash(a, b, 22) > 0.45) {
        const alpha = 0.08 + (1 - distance / (width * 0.19)) * 0.3;
        line(context, nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y, `rgba(234, 223, 206, ${alpha})`);
      }
    }
  }
  const route = [2, 8, 19, 31, 23, 35];
  context.beginPath();
  route.forEach((nodeIndex, index) => {
    const node = nodes[nodeIndex];
    if (index === 0) context.moveTo(node.x, node.y);
    else context.lineTo(node.x, node.y);
  });
  context.strokeStyle = MAGENTA;
  context.lineWidth = Math.max(1.4, width * 0.003);
  context.stroke();
  nodes.forEach((node, index) => {
    circle(context, node.x, node.y, node.r, index % 11 === phase % 11 ? MAGENTA : IVORY, 1, NIGHT);
    if (route.includes(index)) {
      circle(context, node.x, node.y, node.r * 2.8, MAGENTA);
    }
  });
  const tiny = Math.max(7, width * 0.021);
  type(context, "ROUTE / 02-08-19-31-23-35", pad, height * 0.84, tiny, IVORY);
  type(context, `${nodes.length} PEERS / ${String(phase % 999).padStart(3, "0")} ms`, width - pad, height * 0.84, tiny, DIM, "right");
}

function glyphCascade(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height);
  const columns = 14;
  const cellWidth = width / columns;
  const cellHeight = Math.max(18, width * 0.075);
  const rows = Math.ceil(height / cellHeight) + 3;
  const alphabet = "AEFHKMNPRSTVX0123456789:/";
  for (let column = 0; column < columns; column += 1) {
    const speed = 0.008 + hash(column, 8, 13) * 0.013;
    const offset = positiveModulo(time * speed + hash(column, 5, 44) * cellHeight * 4, cellHeight);
    for (let row = -2; row < rows; row += 1) {
      const y = row * cellHeight + offset;
      const glyphIndex = Math.floor(hash(column, row + (phase >> 2), 61) * alphabet.length);
      const head = positiveModulo(row + Math.floor(time / 180) + column * 3, 23) === 0;
      const color = head ? MAGENTA : hash(column, row, 90) > 0.76 ? IVORY : DIM;
      type(context, alphabet[glyphIndex], column * cellWidth + cellWidth * 0.5, y, cellWidth * 0.45, color, "center", head ? 700 : 400);
      if (hash(row, column, phase >> 3) > 0.88) {
        context.fillStyle = color;
        context.fillRect(column * cellWidth + cellWidth * 0.17, y + cellHeight * 0.18, cellWidth * 0.66, Math.max(1, cellWidth * 0.035));
      }
    }
  }
  const scanY = positiveModulo(time * 0.06, height * 1.15) - height * 0.1;
  context.fillStyle = "rgba(227, 76, 130, 0.12)";
  context.fillRect(0, scanY - cellHeight, width, cellHeight * 2);
  line(context, 0, scanY, width, scanY, MAGENTA, 2);
  context.fillStyle = "rgba(37, 16, 21, 0.88)";
  context.fillRect(0, 0, width, width * 0.13);
  context.fillRect(0, height - width * 0.13, width, width * 0.13);
  chrome(frame, "Glyph cascade", "RAIN-14");
}

function barcodeCathedral(frame: SceneFrame) {
  const { context, width, height, time } = frame;
  fill(context, width, height, NIGHT);
  const pad = width * 0.055;
  const base = height * 0.8;
  const count = 43;
  const available = width - pad * 2;
  const unit = available / count;
  for (let index = 0; index < count; index += 1) {
    const fromCenter = Math.abs(index - (count - 1) / 2) / (count / 2);
    const noise = hash(index, 4, 81);
    const arch = Math.pow(1 - fromCenter, 1.8);
    const barHeight = height * (0.13 + arch * 0.49 + noise * 0.11);
    const barWidth = unit * (0.28 + hash(index, 7, 12) * 0.52);
    const x = pad + index * unit + (unit - barWidth) / 2;
    context.fillStyle = index === Math.floor(positiveModulo(time * 0.007, count)) ? MAGENTA : index % 5 === 0 ? IVORY : DIM;
    context.fillRect(x, base - barHeight, barWidth, barHeight);
    if (index % 4 === 0) line(context, x, base + unit, x, height * 0.88, FAINT);
  }
  context.strokeStyle = DIM;
  context.lineWidth = 1;
  context.beginPath();
  context.arc(width / 2, base, width * 0.34, Math.PI, TAU);
  context.arc(width / 2, base, width * 0.24, Math.PI, TAU);
  context.arc(width / 2, base, width * 0.14, Math.PI, TAU);
  context.stroke();
  const vanishingX = width / 2;
  const vanishingY = height * 0.48;
  for (let index = -7; index <= 7; index += 1) {
    line(context, vanishingX, vanishingY, width / 2 + index * width * 0.09, height, FAINT);
  }
  for (let row = 0; row < 8; row += 1) {
    const amount = row / 8;
    const y = vanishingY + Math.pow(amount, 1.75) * (height - vanishingY);
    line(context, 0, y, width, y, FAINT);
  }
  type(context, "DATA / NAVE", width / 2, height * 0.19, width * 0.055, IVORY, "center", 700);
  type(context, "43 CHANNELS // HARMONIC LOCK", width / 2, height * 0.225, width * 0.022, DIM, "center");
  chrome(frame, "Barcode cathedral", "NAVE-43");
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

function cellularAtlas(frame: SceneFrame) {
  const { context, width, height, time } = frame;
  fill(context, width, height);
  chrome(frame, "Cellular atlas", "LIFE-32");
  const columns = LIFE_COLUMNS;
  const rows = LIFE_ROWS;
  const pad = width * 0.06;
  const top = height * 0.13;
  const fieldHeight = height * 0.72;
  const gap = Math.max(1, width * 0.0045);
  const cell = Math.min((width - pad * 2 - gap * (columns - 1)) / columns, (fieldHeight - gap * (rows - 1)) / rows);
  const state = LIFE_STATES[Math.floor(time / 700) % LIFE_STATES.length];
  let alive = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const active = state[y * columns + x] === 1;
      if (active) alive += 1;
      context.fillStyle = active ? ((x * 3 + y * 7) % 29 === 0 ? MAGENTA : IVORY) : "rgba(234, 223, 206, 0.035)";
      context.fillRect(pad + x * (cell + gap), top + y * (cell + gap), cell, cell);
    }
  }
  const tiny = Math.max(7, width * 0.022);
  type(context, `POP ${String(alive).padStart(4, "0")}`, pad, height * 0.88, tiny, IVORY);
  type(context, "RULE B3/S23 / TOROIDAL", width - pad, height * 0.88, tiny, DIM, "right");
}

function packetRiver(frame: SceneFrame) {
  const { context, width, height, time } = frame;
  fill(context, width, height, NIGHT);
  grid(context, width, height, Math.max(22, width / 15), "rgba(234, 223, 206, 0.055)", time * -0.004, 0);
  chrome(frame, "Packet river", "FLOW-06");
  const top = height * 0.15;
  const bottom = height * 0.82;
  const lanes = 7;
  for (let lane = 0; lane < lanes; lane += 1) {
    const startX = width * (0.08 + lane * 0.14);
    const amplitude = width * (0.035 + hash(lane, 3, 44) * 0.05);
    context.beginPath();
    for (let sample = 0; sample <= 50; sample += 1) {
      const amount = sample / 50;
      const y = top + amount * (bottom - top);
      const x = startX + Math.sin(amount * TAU * (1.2 + lane * 0.08) + lane) * amplitude + Math.sin(time * 0.00018 + amount * 8) * width * 0.012;
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = lane === 3 ? MAGENTA : lane % 2 === 0 ? IVORY : DIM;
    context.lineWidth = lane === 3 ? 2 : 1;
    context.stroke();
    for (let packet = 0; packet < 5; packet += 1) {
      const amount = positiveModulo(time * (0.000055 + lane * 0.000004) + packet / 5 + hash(lane, packet, 4), 1);
      const y = top + amount * (bottom - top);
      const x = startX + Math.sin(amount * TAU * (1.2 + lane * 0.08) + lane) * amplitude + Math.sin(time * 0.00018 + amount * 8) * width * 0.012;
      const size = Math.max(3, width * (0.009 + hash(lane, packet, 33) * 0.01));
      context.fillStyle = packet === 0 ? MAGENTA : IVORY;
      context.fillRect(x - size / 2, y - size / 2, size, size);
    }
  }
  const tiny = Math.max(7, width * 0.021);
  for (let lane = 0; lane < lanes; lane += 1) {
    type(context, String(lane + 1).padStart(2, "0"), width * (0.08 + lane * 0.14), height * 0.86, tiny, lane === 3 ? MAGENTA : DIM, "center");
  }
}

function seismicField(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height);
  chrome(frame, "Seismic field", "QUAKE-12");
  const pad = width * 0.06;
  const top = height * 0.15;
  const trackHeight = height * 0.052;
  const epicenter = pad + positiveModulo(time * 0.024, width - pad * 2);
  for (let track = 0; track < 12; track += 1) {
    const baseline = top + track * trackHeight;
    line(context, pad, baseline, width - pad, baseline, FAINT);
    context.beginPath();
    for (let sample = 0; sample <= 110; sample += 1) {
      const x = pad + (sample / 110) * (width - pad * 2);
      const distance = Math.abs(x - epicenter) / width;
      const envelope = Math.exp(-distance * 19);
      const noise = Math.sin(sample * (0.66 + track * 0.017) + track * 1.8 + time * 0.004) * envelope;
      const drift = Math.sin(sample * 0.16 + track + time * 0.0005) * trackHeight * 0.08;
      const y = baseline + noise * trackHeight * (0.54 + (track % 4) * 0.12) + drift;
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = track === phase % 12 ? MAGENTA : IVORY;
    context.lineWidth = track === phase % 12 ? 2 : 1;
    context.stroke();
    type(context, `S${String(track + 1).padStart(2, "0")}`, pad, baseline - 4, Math.max(7, width * 0.017), DIM);
  }
  const focalY = top + trackHeight * 5.5;
  for (let ring = 1; ring <= 4; ring += 1) {
    circle(context, epicenter, focalY, ring * width * 0.025 + positiveModulo(time * 0.012, width * 0.025), ring === 4 ? MAGENTA : DIM);
  }
  type(context, `EPICENTER / ${String(Math.floor(epicenter)).padStart(4, "0")}`, pad, height * 0.84, width * 0.022, IVORY);
}

function clockworkRings(frame: SceneFrame) {
  const { context, width, height, time } = frame;
  fill(context, width, height, NIGHT);
  grid(context, width, height, Math.max(23, width / 14), "rgba(234, 223, 206, 0.05)");
  chrome(frame, "Clockwork rings", "GEAR-05");
  const cx = width / 2;
  const cy = height * 0.45;
  const maximum = Math.min(width * 0.43, height * 0.27);
  for (let ring = 0; ring < 5; ring += 1) {
    const radius = maximum * (0.24 + ring * 0.18);
    const ticks = 16 + ring * 9;
    const rotation = time * 0.00012 * (ring % 2 === 0 ? 1 : -0.72) + ring;
    circle(context, cx, cy, radius, ring === 2 ? MAGENTA : DIM, ring === 2 ? 2 : 1);
    for (let tick = 0; tick < ticks; tick += 1) {
      const angle = rotation + (tick / ticks) * TAU;
      const tooth = tick % 3 === 0 ? width * 0.018 : width * 0.008;
      const inner = radius - tooth * 0.25;
      const outer = radius + tooth;
      line(context, cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner, cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer, tick % 11 === 0 ? IVORY : DIM, tick % 11 === 0 ? 2 : 1);
    }
  }
  for (let blade = 0; blade < 6; blade += 1) {
    const angle = time * -0.0002 + (blade / 6) * TAU;
    context.beginPath();
    context.moveTo(cx, cy);
    context.lineTo(cx + Math.cos(angle - 0.13) * maximum * 0.23, cy + Math.sin(angle - 0.13) * maximum * 0.23);
    context.lineTo(cx + Math.cos(angle + 0.13) * maximum * 0.23, cy + Math.sin(angle + 0.13) * maximum * 0.23);
    context.closePath();
    context.fillStyle = blade === 0 ? MAGENTA : IVORY;
    context.fill();
  }
  circle(context, cx, cy, width * 0.028, IVORY, 2, OXBLOOD);
  const tiny = Math.max(7, width * 0.022);
  type(context, "ESCAPEMENT / 0.972", width * 0.06, height * 0.79, tiny, DIM);
  type(context, "PHASE LOCKED", width * 0.94, height * 0.79, tiny, MAGENTA, "right");
}

function vectorScope(frame: SceneFrame) {
  const { context, width, height, time } = frame;
  fill(context, width, height);
  chrome(frame, "Vector scope", "XY-09");
  const cx = width / 2;
  const cy = height * 0.43;
  const radius = Math.min(width * 0.39, height * 0.25);
  circle(context, cx, cy, radius, DIM);
  circle(context, cx, cy, radius * 0.66, FAINT);
  circle(context, cx, cy, radius * 0.33, FAINT);
  line(context, cx - radius, cy, cx + radius, cy, FAINT);
  line(context, cx, cy - radius, cx, cy + radius, FAINT);
  for (let tick = 0; tick < 36; tick += 1) {
    const angle = (tick / 36) * TAU;
    line(context, cx + Math.cos(angle) * radius * 0.95, cy + Math.sin(angle) * radius * 0.95, cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius, tick % 9 === 0 ? IVORY : DIM);
  }
  context.beginPath();
  for (let sample = 0; sample <= 300; sample += 1) {
    const amount = (sample / 300) * TAU;
    const x = cx + Math.sin(amount * 3 + time * 0.00037) * radius * 0.82;
    const y = cy + Math.sin(amount * 4 + time * 0.00023 + 1.17) * radius * 0.82;
    if (sample === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = IVORY;
  context.lineWidth = Math.max(1.2, width * 0.003);
  context.stroke();
  context.beginPath();
  for (let sample = 0; sample <= 160; sample += 1) {
    const amount = (sample / 160) * TAU;
    const x = cx + Math.sin(amount * 2 + time * 0.00029) * radius * 0.55;
    const y = cy + Math.sin(amount * 5 + time * 0.00019 + 0.7) * radius * 0.55;
    if (sample === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = MAGENTA;
  context.lineWidth = 2;
  context.stroke();
  const tiny = Math.max(7, width * 0.022);
  type(context, "X 03.000 Hz", width * 0.08, height * 0.77, tiny, DIM);
  type(context, "Y 04.000 Hz", width * 0.92, height * 0.77, tiny, DIM, "right");
  type(context, "PHASE +067 DEG", width / 2, height * 0.82, tiny, MAGENTA, "center");
}

function memoryMap(frame: SceneFrame) {
  const { context, width, height, phase } = frame;
  fill(context, width, height, NIGHT);
  chrome(frame, "Memory map", "RAM-64");
  const pad = width * 0.06;
  const top = height * 0.14;
  const mapHeight = height * 0.66;
  const columns = 8;
  const rows = 14;
  const gap = width * 0.009;
  const cellWidth = (width - pad * 2 - gap * (columns - 1)) / columns;
  const cellHeight = (mapHeight - gap * (rows - 1)) / rows;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = pad + column * (cellWidth + gap);
      const y = top + row * (cellHeight + gap);
      const value = hash(column, row, 304);
      const active = positiveModulo(row * columns + column + (phase >> 2), 31) < 3;
      context.fillStyle = active ? MAGENTA : value > 0.72 ? "rgba(234, 223, 206, 0.82)" : value > 0.35 ? "rgba(234, 223, 206, 0.24)" : "rgba(234, 223, 206, 0.06)";
      context.fillRect(x, y, cellWidth, cellHeight);
      if (value > 0.84) {
        context.fillStyle = NIGHT;
        context.fillRect(x + cellWidth * 0.18, y + cellHeight * 0.25, cellWidth * 0.64, Math.max(1, cellHeight * 0.14));
      }
    }
  }
  const tiny = Math.max(7, width * 0.02);
  type(context, "0000", pad, height * 0.84, tiny, IVORY);
  type(context, "FFFF", width - pad, height * 0.84, tiny, IVORY, "right");
  line(context, pad + width * 0.09, height * 0.835, width - pad - width * 0.09, height * 0.835, DIM);
  type(context, "64 KB / 87.2% ALLOCATED", width / 2, height * 0.885, tiny, MAGENTA, "center");
}

function waveformStack(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height);
  chrome(frame, "Waveform stack", "WAVE-16");
  const pad = width * 0.06;
  const top = height * 0.14;
  const tracks = 16;
  const trackHeight = height * 0.043;
  for (let track = 0; track < tracks; track += 1) {
    const baseline = top + track * trackHeight;
    type(context, String(track + 1).padStart(2, "0"), pad, baseline + 3, Math.max(7, width * 0.017), DIM);
    line(context, pad + width * 0.06, baseline, width - pad, baseline, FAINT);
    context.beginPath();
    for (let sample = 0; sample <= 90; sample += 1) {
      const amount = sample / 90;
      const x = pad + width * 0.06 + amount * (width - pad * 2 - width * 0.06);
      const carrier = Math.sin(amount * TAU * (2 + track * 0.18) + time * (0.0005 + track * 0.000013));
      const modulator = Math.sin(amount * TAU * 7 + track * 0.81 + time * 0.0002);
      const gate = Math.sin(amount * Math.PI * (3 + track % 3)) > -0.45 ? 1 : 0.15;
      const y = baseline + carrier * modulator * gate * trackHeight * 0.33;
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = track === phase % tracks ? MAGENTA : track % 5 === 0 ? IVORY : DIM;
    context.lineWidth = track === phase % tracks ? 2 : 1;
    context.stroke();
  }
  type(context, "16 BUS / COHERENCE 0.9984", pad, height * 0.86, width * 0.021, IVORY);
}

function dataLoom(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height, NIGHT);
  chrome(frame, "Data loom", "WARP-18");
  const pad = width * 0.055;
  const top = height * 0.14;
  const bottom = height * 0.82;
  const warps = 18;
  const wefts = 24;
  for (let warp = 0; warp < warps; warp += 1) {
    const baseX = pad + (warp / (warps - 1)) * (width - pad * 2);
    context.beginPath();
    for (let sample = 0; sample <= 40; sample += 1) {
      const amount = sample / 40;
      const x = baseX + Math.sin(amount * TAU * 1.5 + warp * 0.42 + time * 0.00022) * width * 0.014;
      const y = top + amount * (bottom - top);
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.strokeStyle = warp === phase % warps ? MAGENTA : warp % 3 === 0 ? IVORY : DIM;
    context.lineWidth = warp === phase % warps ? 2 : 1;
    context.stroke();
  }
  for (let weft = 0; weft < wefts; weft += 1) {
    const y = top + (weft / (wefts - 1)) * (bottom - top);
    const direction = weft % 2 === 0 ? 1 : -1;
    const travel = positiveModulo(time * 0.018 * direction + weft * width * 0.13, width * 0.22) - width * 0.11;
    context.beginPath();
    for (let sample = 0; sample <= 36; sample += 1) {
      const amount = sample / 36;
      const x = pad + amount * (width - pad * 2);
      const localY = y + Math.sin(amount * TAU * 2 + weft + time * 0.00015) * width * 0.008;
      if (sample === 0) context.moveTo(x, localY);
      else context.lineTo(x, localY);
    }
    context.strokeStyle = weft % 6 === 0 ? IVORY : FAINT;
    context.lineWidth = 1;
    context.stroke();
    context.fillStyle = weft % 7 === 0 ? MAGENTA : IVORY;
    context.fillRect(width / 2 + travel - width * 0.025, y - 1, width * 0.05, 3);
  }
  type(context, "WARP 18 / WEFT 24", pad, height * 0.86, width * 0.021, DIM);
}

function hexPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
) {
  context.beginPath();
  for (let side = 0; side < 6; side += 1) {
    const angle = (side / 6) * TAU - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (side === 0) context.moveTo(px, py);
    else context.lineTo(px, py);
  }
  context.closePath();
}

function hexField(frame: SceneFrame) {
  const { context, width, height, time } = frame;
  fill(context, width, height);
  chrome(frame, "Hex field", "HEX-19");
  const radius = Math.max(8, width * 0.037);
  const xStep = radius * Math.sqrt(3);
  const yStep = radius * 1.5;
  const centerX = width / 2;
  const centerY = height * 0.46;
  const pulse = positiveModulo(time * 0.045, width * 0.72);
  let row = 0;
  for (let y = height * 0.13; y < height * 0.82; y += yStep) {
    let column = 0;
    for (let x = -radius + (row % 2) * xStep * 0.5; x < width + radius; x += xStep) {
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);
      const active = Math.abs(distance - pulse) < radius * 0.8;
      hexPath(context, x, y, radius * 0.9);
      context.strokeStyle = active ? MAGENTA : hash(column, row, 55) > 0.72 ? IVORY : FAINT;
      context.lineWidth = active ? 2 : 1;
      context.stroke();
      if (hash(column, row, Math.floor(time / 900)) > 0.91) {
        hexPath(context, x, y, radius * 0.54);
        context.fillStyle = active ? MAGENTA : "rgba(234, 223, 206, 0.18)";
        context.fill();
      }
      column += 1;
    }
    row += 1;
  }
  type(context, `RADIUS ${String(Math.floor(pulse)).padStart(3, "0")}`, width * 0.06, height * 0.86, width * 0.021, IVORY);
  type(context, "CELL LINK / ACTIVE", width * 0.94, height * 0.86, width * 0.021, MAGENTA, "right");
}

function satelliteTopology(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height, NIGHT);
  grid(context, width, height, Math.max(23, width / 14), "rgba(234, 223, 206, 0.05)");
  chrome(frame, "Satellite topology", "SAT-08");
  const cx = width / 2;
  const cy = height * 0.42;
  const base = Math.min(width * 0.35, height * 0.23);
  circle(context, cx, cy, base * 0.28, IVORY, 1.5, OXBLOOD);
  for (let longitude = -2; longitude <= 2; longitude += 1) {
    context.beginPath();
    context.ellipse(cx, cy, base * 0.28 * Math.cos(longitude * 0.25), base * 0.28, 0, 0, TAU);
    context.strokeStyle = FAINT;
    context.stroke();
  }
  line(context, cx - base * 0.28, cy, cx + base * 0.28, cy, FAINT);
  const satellites: Array<{ x: number; y: number }> = [];
  for (let orbit = 0; orbit < 4; orbit += 1) {
    const rx = base * (0.56 + orbit * 0.18);
    const ry = base * (0.24 + orbit * 0.07);
    const tilt = -0.5 + orbit * 0.34;
    context.save();
    context.translate(cx, cy);
    context.rotate(tilt);
    context.beginPath();
    context.ellipse(0, 0, rx, ry, 0, 0, TAU);
    context.strokeStyle = orbit === 2 ? MAGENTA : DIM;
    context.stroke();
    const angle = time * (0.00014 + orbit * 0.000025) * (orbit % 2 ? -1 : 1) + orbit * 1.5;
    const localX = Math.cos(angle) * rx;
    const localY = Math.sin(angle) * ry;
    const cos = Math.cos(tilt);
    const sin = Math.sin(tilt);
    satellites.push({ x: cx + localX * cos - localY * sin, y: cy + localX * sin + localY * cos });
    context.restore();
  }
  satellites.forEach((satellite, index) => {
    line(context, cx, cy, satellite.x, satellite.y, index === phase % 4 ? MAGENTA : FAINT);
    const size = width * 0.018;
    context.fillStyle = index === phase % 4 ? MAGENTA : IVORY;
    context.fillRect(satellite.x - size / 2, satellite.y - size / 2, size, size);
    line(context, satellite.x - size * 1.2, satellite.y, satellite.x + size * 1.2, satellite.y, context.fillStyle as string);
  });
  const tiny = Math.max(7, width * 0.021);
  satellites.forEach((_, index) => {
    type(context, `SAT-${index + 1} / ${index === phase % 4 ? "TX" : "IDLE"}`, width * 0.08, height * (0.72 + index * 0.035), tiny, index === phase % 4 ? MAGENTA : DIM);
  });
}

function archiveIndex(frame: SceneFrame) {
  const { context, width, height, phase } = frame;
  fill(context, width, height);
  chrome(frame, "Archive index", "ARC-96");
  const pad = width * 0.06;
  const top = height * 0.14;
  const columnGap = width * 0.035;
  const columnWidth = (width - pad * 2 - columnGap) / 2;
  const rowHeight = height * 0.031;
  const labels = ["FIELD", "ORBIT", "GLYPH", "MEMORY", "VECTOR", "PACKET", "SIGNAL", "FRAME"];
  for (let column = 0; column < 2; column += 1) {
    const x = pad + column * (columnWidth + columnGap);
    panel(context, x, top, columnWidth, height * 0.59);
    for (let row = 0; row < 19; row += 1) {
      const y = top + rowHeight * (row + 1.45);
      const index = column * 19 + row;
      const selected = index === (phase >> 1) % 38;
      if (selected) {
        context.fillStyle = MAGENTA;
        context.fillRect(x + width * 0.01, y - rowHeight * 0.72, columnWidth - width * 0.02, rowHeight * 0.9);
      }
      type(context, String(index + 1).padStart(3, "0"), x + width * 0.018, y, width * 0.019, selected ? OXBLOOD : IVORY);
      type(context, labels[index % labels.length], x + width * 0.095, y, width * 0.019, selected ? OXBLOOD : DIM);
      type(context, String(Math.floor(hash(index, 2, 88) * 9999)).padStart(4, "0"), x + columnWidth - width * 0.018, y, width * 0.019, selected ? OXBLOOD : DIM, "right");
    }
  }
  type(context, "A", pad, height * 0.82, width * 0.095, IVORY, "left", 700);
  type(context, "96", width / 2, height * 0.82, width * 0.095, MAGENTA, "center", 700);
  type(context, "Z", width - pad, height * 0.82, width * 0.095, IVORY, "right", 700);
}

function rasterPortrait(frame: SceneFrame) {
  const { context, width, height, time } = frame;
  fill(context, width, height, NIGHT);
  chrome(frame, "Raster portrait", "FACE-01");
  const columns = 25;
  const rows = 35;
  const cell = Math.min(width * 0.032, height * 0.018);
  const gap = cell * 0.22;
  const gridWidth = columns * cell + (columns - 1) * gap;
  const startX = (width - gridWidth) / 2;
  const startY = height * 0.13;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const nx = (column - (columns - 1) / 2) / (columns * 0.42);
      const ny = (row - rows * 0.45) / (rows * 0.49);
      const face = nx * nx + Math.pow(ny * 0.88, 2) < 1;
      const eye = Math.abs(ny + 0.19) < 0.085 && (Math.abs(nx - 0.37) < 0.15 || Math.abs(nx + 0.37) < 0.15);
      const nose = Math.abs(nx) < 0.09 && ny > -0.1 && ny < 0.36;
      const mouth = Math.abs(ny - 0.48) < 0.055 && Math.abs(nx) < 0.42;
      const edge = face && nx * nx + Math.pow(ny * 0.88, 2) > 0.77;
      const dropout = hash(column, row, Math.floor(time / 850)) > 0.94;
      if (!face || dropout) continue;
      const x = startX + column * (cell + gap);
      const y = startY + row * (cell + gap);
      context.fillStyle = eye ? MAGENTA : nose || mouth ? IVORY : edge ? DIM : `rgba(234, 223, 206, ${0.24 + hash(column, row, 4) * 0.6})`;
      if (edge || hash(column, row, 7) > 0.72) {
        context.strokeStyle = context.fillStyle as string;
        context.strokeRect(x, y, cell, cell);
      } else {
        context.fillRect(x, y, cell, cell);
      }
    }
  }
  const tiny = Math.max(7, width * 0.021);
  line(context, width * 0.08, height * 0.79, width * 0.92, height * 0.79, DIM);
  type(context, "SUBJECT / UNKNOWN", width * 0.08, height * 0.83, tiny, IVORY);
  type(context, "MATCH 00.13%", width * 0.92, height * 0.83, tiny, MAGENTA, "right");
  type(context, "FEATURE VECTOR 025 x 035 / LOCAL ONLY", width * 0.08, height * 0.87, tiny, DIM);
}

function checkerError(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height, IVORY);
  grid(context, width, height, Math.max(18, width / 17), "rgba(37, 16, 21, 0.14)");
  chrome(frame, "Checker error", "ERR-77", true);
  const size = Math.max(11, width * 0.046);
  const bandTop = height * 0.2;
  const bandRows = 7;
  const columns = Math.ceil(width / size) + 2;
  for (let row = 0; row < bandRows; row += 1) {
    const shift = Math.floor(time * (row % 2 ? -0.008 : 0.012) / size);
    for (let column = -1; column < columns; column += 1) {
      if ((column + row + shift) % 2 !== 0) continue;
      context.fillStyle = (column + phase) % 17 === 0 ? MAGENTA : OXBLOOD;
      context.fillRect(column * size + positiveModulo(time * (row % 2 ? -0.008 : 0.012), size), bandTop + row * size, size, size);
    }
  }
  type(context, "SYNC", width * 0.06, height * 0.59, width * 0.15, OXBLOOD, "left", 700);
  type(context, "LOST", width * 0.94, height * 0.68, width * 0.15, MAGENTA, "right", 700);
  const random = randomFrom(920 + (phase >> 1));
  for (let row = 0; row < 10; row += 1) {
    const y = height * 0.72 + row * width * 0.025;
    const barWidth = width * (0.12 + random() * 0.68);
    context.fillStyle = row % 4 === 0 ? MAGENTA : OXBLOOD;
    context.fillRect(width * 0.06, y, barWidth, Math.max(2, width * 0.008));
    type(context, String(Math.floor(random() * 65535)).padStart(5, "0"), width * 0.94, y + width * 0.009, width * 0.018, OXBLOOD, "right");
  }
}

function deepScan(frame: SceneFrame) {
  const { context, width, height, time, phase } = frame;
  fill(context, width, height, NIGHT);
  chrome(frame, "Deep scan", "DEPTH-∞");
  const vx = width * (0.5 + Math.sin(time * 0.00013) * 0.04);
  const vy = height * 0.42;
  const horizon = height * 0.43;
  line(context, 0, horizon, width, horizon, MAGENTA, 1.5);
  for (let ray = -9; ray <= 9; ray += 1) {
    line(context, vx, vy, width / 2 + ray * width * 0.09, height, ray % 4 === 0 ? DIM : FAINT);
  }
  for (let depth = 1; depth <= 16; depth += 1) {
    const amount = depth / 16;
    const y = horizon + Math.pow(amount, 2.25) * (height - horizon);
    line(context, 0, y, width, y, depth === (phase >> 1) % 16 ? MAGENTA : FAINT);
  }
  for (let portal = 0; portal < 9; portal += 1) {
    const travel = positiveModulo(time * 0.00009 + portal / 9, 1);
    const scale = Math.pow(travel, 2.25);
    const portalWidth = width * (0.04 + scale * 0.78);
    const portalHeight = height * (0.035 + scale * 0.48);
    const x = vx - portalWidth / 2;
    const y = vy - portalHeight * 0.38;
    context.strokeStyle = portal === phase % 9 ? MAGENTA : portal % 3 === 0 ? IVORY : DIM;
    context.lineWidth = portal === phase % 9 ? 2 : 1;
    context.strokeRect(x, y, portalWidth, portalHeight);
  }
  const tiny = Math.max(7, width * 0.021);
  panel(context, width * 0.07, height * 0.16, width * 0.28, height * 0.14, DIM);
  type(context, "RANGE", width * 0.09, height * 0.205, tiny, DIM);
  type(context, `${String(Math.floor(positiveModulo(time * 0.043, 9999))).padStart(4, "0")} M`, width * 0.09, height * 0.26, width * 0.045, IVORY, "left", 700);
  panel(context, width * 0.65, height * 0.67, width * 0.28, height * 0.12, DIM);
  type(context, "RETURN / CLEAN", width * 0.91, height * 0.72, tiny, MAGENTA, "right");
  type(context, "VOID CONFIDENCE 99.8", width * 0.91, height * 0.755, tiny, DIM, "right");
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

function drawTransitionBoundary(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  progress: number,
) {
  const rows = 18;
  const rowHeight = height / rows;
  const block = Math.max(6, width * 0.026);
  for (let row = 0; row < rows; row += 1) {
    const jitter = (hash(row, 3, 71) - 0.5) * width * 0.12;
    const edge = width * (1 - progress) + jitter;
    for (let column = -1; column <= 1; column += 1) {
      if ((row + column) % 2 !== 0) continue;
      context.fillStyle = column === 0 ? MAGENTA : row % 3 === 0 ? IVORY : OXBLOOD;
      context.fillRect(edge + column * block, row * rowHeight, block, rowHeight + 1);
    }
  }
}

function drawScene(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  sceneIndex: number,
  time: number,
) {
  const safeIndex = positiveModulo(Math.floor(sceneIndex), INTERNAL_SCENES.length);
  const safeTime = Number.isFinite(time) ? Math.max(0, time) : 0;
  const frame: SceneFrame = {
    context,
    width: Math.max(1, width),
    height: Math.max(1, height),
    time: safeTime,
    phase: Math.floor(safeTime / 240),
  };
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
  const sceneIndex = positiveModulo(rawIndex + offset, SIGNAL_SCENE_COUNT);
  const nextSceneIndex = (sceneIndex + 1) % SIGNAL_SCENE_COUNT;
  const localTime = positiveModulo(safeTime, duration);
  const transitionStart = duration - transition;
  const transitionProgress = options.reducedMotion || transition === 0
    ? 0
    : smoothStep((localTime - transitionStart) / transition);
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
  drawScene(context, width, height, info.sceneIndex, localTime);

  if (info.transitionProgress > 0) {
    const rows = 18;
    const rowHeight = height / rows;
    context.save();
    context.beginPath();
    for (let row = 0; row < rows; row += 1) {
      const stagger = (hash(row, 6, 912) - 0.5) * 0.2;
      const rowProgress = clamp(info.transitionProgress * 1.18 + stagger);
      const edge = width * (1 - rowProgress);
      context.rect(edge, row * rowHeight, width - edge, rowHeight + 1);
    }
    context.clip();
    drawScene(context, width, height, info.nextSceneIndex, 0);
    context.restore();
    context.save();
    drawTransitionBoundary(context, width, height, info.transitionProgress);
    context.restore();
  }

  return info;
}
