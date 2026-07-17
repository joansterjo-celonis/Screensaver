"use client";

import { useEffect, useRef } from "react";

const INK = "#eadfce";
const DIM = "rgba(234, 223, 206, 0.42)";
const FAINT = "rgba(234, 223, 206, 0.12)";
const PAPER = "#251015";
const ACCENT = "#e34c82";

const GLYPHS = [
  ["11110", "10001", "10011", "10101", "11001", "10001", "01110"],
  ["00100", "01100", "10100", "00100", "00100", "00100", "11111"],
  ["11110", "00001", "00001", "11110", "10000", "10000", "11111"],
  ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  ["10010", "10010", "10010", "11111", "00010", "00010", "00010"],
  ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  ["01111", "10000", "10000", "11110", "10001", "10001", "01110"],
  ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  ["01110", "10001", "10001", "01111", "00001", "00001", "11110"],
];

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

function text(
  context: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size: number,
  color = INK,
  align: CanvasTextAlign = "left",
) {
  context.fillStyle = color;
  context.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
  context.textAlign = align;
  context.textBaseline = "alphabetic";
  context.fillText(value, x, y);
}

function line(
  context: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color = DIM,
  width = 1,
) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.strokeStyle = color;
  context.lineWidth = width;
  context.stroke();
}

function drawGrid(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  color = FAINT,
) {
  context.strokeStyle = color;
  context.lineWidth = 1;
  const unit = Math.max(18, width / 18);
  for (let x = 0; x <= width; x += unit) {
    line(context, x, 0, x, height, color);
  }
  for (let y = 0; y <= height; y += unit) {
    line(context, 0, y, width, y, color);
  }
}

function drawRotor(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  time: number,
  phase: number,
) {
  const random = randomFrom(7042);
  const arms = 7;
  context.save();
  context.translate(cx, cy);
  context.rotate(time * 0.00008);

  for (let index = 0; index < 250; index += 1) {
    const arm = index % arms;
    const distance = radius * (0.08 + random() * 0.86);
    const wobble = (random() - 0.5) * 0.48 * (distance / radius);
    const angle = (arm / arms) * Math.PI * 2 + wobble;
    const jitter = 0.72 + Math.sin(index * 2.43 + phase * 0.42) * 0.28;
    const x = Math.cos(angle) * distance * jitter;
    const y = Math.sin(angle) * distance * jitter;
    const point = Math.max(0.7, radius * (0.007 + random() * 0.008));
    context.fillStyle = index % 17 === 0 ? ACCENT : INK;
    context.globalAlpha = 0.48 + random() * 0.52;
    context.fillRect(x, y, point, point);
  }

  context.globalAlpha = 1;
  context.strokeStyle = DIM;
  context.lineWidth = 1;
  context.strokeRect(-radius * 1.08, -radius * 1.08, radius * 2.16, radius * 2.16);
  context.restore();
}

function drawPixelGlyph(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  phase: number,
  seed: number,
) {
  const random = randomFrom(seed + phase * 97);
  const pattern = GLYPHS[(seed + phase) % GLYPHS.length];
  const columns = 13;
  const rows = 17;
  const gap = Math.max(1.5, width * 0.012);
  const cell = Math.min(
    (width - gap * (columns - 1)) / columns,
    (height - gap * (rows - 1)) / rows,
  );

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const glyphX = Math.floor((column / columns) * 5);
      const glyphY = Math.floor((row / rows) * 7);
      const on = pattern[glyphY]?.[glyphX] === "1";
      const noise = random();
      if (!on && noise < 0.56) continue;
      const px = x + column * (cell + gap);
      const py = y + row * (cell + gap);
      context.fillStyle = on
        ? noise > 0.18
          ? INK
          : ACCENT
        : noise > 0.82
          ? DIM
          : FAINT;
      if (noise > 0.72) {
        context.strokeStyle = context.fillStyle;
        context.strokeRect(px, py, cell, cell);
      } else {
        context.fillRect(px, py, cell, cell);
      }
    }
  }
}

function drawCodeStrip(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  rows: number,
  phase: number,
  seed: number,
) {
  const random = randomFrom(seed + phase * 113);
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789";
  const size = Math.max(7, width * 0.043);
  for (let row = 0; row < rows; row += 1) {
    let value = "";
    const length = Math.max(4, Math.floor(width / (size * 0.69)));
    for (let index = 0; index < length; index += 1) {
      value += alphabet[Math.floor(random() * alphabet.length)];
    }
    text(context, value, x, y + row * size * 1.18, size, row === 0 ? INK : DIM);
  }
}

function drawBars(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  phase: number,
) {
  const count = 18;
  const gap = width * 0.012;
  const barWidth = (width - gap * (count - 1)) / count;
  for (let index = 0; index < count; index += 1) {
    const value =
      0.18 +
      Math.abs(Math.sin(index * 0.77 + phase * 0.31)) *
        (0.34 + ((index * 7) % 9) / 18);
    context.fillStyle = index % 7 === phase % 7 ? ACCENT : INK;
    context.fillRect(
      x + index * (barWidth + gap),
      y + height * (1 - value),
      barWidth,
      height * value,
    );
  }
}

function drawDashboard(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  phase: number,
) {
  const pad = width * 0.062;
  const inner = width - pad * 2;
  const tiny = Math.max(7, width * 0.023);
  const small = Math.max(9, width * 0.029);

  text(context, "BMS / FRAME", pad, pad * 1.1, small, INK);
  text(context, ":: ORBITAL–07", width - pad, pad * 1.1, small, ACCENT, "right");
  line(context, pad, pad * 1.52, width - pad, pad * 1.52, DIM);
  text(context, "FIELD CONTROL / PASSIVE DISPLAY", pad, pad * 2.03, tiny, DIM);
  text(
    context,
    `UP ${String(Math.floor(time / 1000)).padStart(6, "0")}`,
    width - pad,
    pad * 2.03,
    tiny,
    DIM,
    "right",
  );

  const rotorRadius = inner * 0.235;
  const rotorY = height * 0.225;
  drawRotor(context, width / 2, rotorY, rotorRadius, time, phase);
  text(context, "ACT DISTRIBUTION", pad, rotorY - rotorRadius * 0.84, tiny, DIM);
  text(context, "ROTATION: NOMINAL", pad, rotorY - rotorRadius * 0.84 + tiny * 1.5, tiny, DIM);

  const cellY = height * 0.405;
  const cellSize = inner / 19;
  for (let index = 0; index < 19; index += 1) {
    context.strokeStyle = DIM;
    context.strokeRect(pad + index * cellSize, cellY, cellSize * 0.72, cellSize * 0.72);
    if ((index + phase) % 5 === 0 || (index * 3 + phase) % 11 === 0) {
      context.fillStyle = (index + phase) % 13 === 0 ? ACCENT : INK;
      context.fillRect(pad + index * cellSize, cellY, cellSize * 0.72, cellSize * 0.72);
    }
  }

  const moduleTop = height * 0.465;
  const gap = inner * 0.04;
  const moduleWidth = (inner - gap) / 2;
  const moduleHeight = height * 0.225;
  line(context, pad, moduleTop - tiny * 1.8, width - pad, moduleTop - tiny * 1.8, DIM);
  text(context, "GLYPH ARRAY / MUTATING", pad, moduleTop - tiny * 2.2, tiny, INK);
  text(context, `PHASE ${String(phase % 99).padStart(2, "0")}`, width - pad, moduleTop - tiny * 2.2, tiny, DIM, "right");
  drawPixelGlyph(context, pad, moduleTop, moduleWidth, moduleHeight, phase, 31);
  drawCodeStrip(
    context,
    pad + moduleWidth + gap,
    moduleTop + tiny,
    moduleWidth,
    9,
    phase,
    919,
  );

  const barY = height * 0.735;
  text(context, "SENSOR SEC / PID", pad, barY - tiny * 1.5, tiny, DIM);
  drawBars(context, pad, barY, inner, height * 0.085, phase);

  const telemetryY = height * 0.86;
  const random = randomFrom(304 + phase * 3);
  const labels = ["AIR", "ION", "VNT", "FAN"];
  labels.forEach((label, index) => {
    text(
      context,
      `${label}: SENSOR ${String(Math.floor(random() * 9999)).padStart(4, "0")}`,
      pad,
      telemetryY + index * tiny * 1.48,
      tiny,
      index === phase % 4 ? INK : DIM,
    );
    text(
      context,
      `${Math.floor(18 + random() * 81)}%`,
      width - pad,
      telemetryY + index * tiny * 1.48,
      tiny,
      index === phase % 4 ? ACCENT : DIM,
      "right",
    );
  });

  line(context, pad, height - pad * 1.6, width - pad, height - pad * 1.6, DIM);
  text(context, "PURITY / PARTICULATES LOW", pad, height - pad * 0.96, tiny, INK);
  text(context, "FRAME ACTIVE", width - pad, height - pad * 0.96, tiny, ACCENT, "right");
}

function drawErrorState(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  phase: number,
) {
  const pad = width * 0.062;
  const tiny = Math.max(7, width * 0.023);
  context.fillStyle = INK;
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height, "rgba(37, 16, 21, 0.16)");
  text(context, "[ ONLINE ]", pad, pad * 1.15, tiny * 1.35, PAPER);
  text(context, "FRAME / RECLOCK", width - pad, pad * 1.15, tiny, PAPER, "right");
  line(context, pad, pad * 1.6, width - pad, pad * 1.6, PAPER);

  context.save();
  context.beginPath();
  context.rect(0, height * 0.18, width, height * 0.18);
  context.clip();
  text(
    context,
    `${String(phase % 99).padStart(2, "0")}_LEVEL_ERROR / `,
    width * 0.5 - ((phase * 21) % Math.floor(width)),
    height * 0.31,
    width * 0.12,
    PAPER,
  );
  context.restore();

  const random = randomFrom(1200 + phase * 41);
  const columns = 16;
  const rows = 20;
  const gap = width * 0.009;
  const cell = (width - pad * 2 - gap * (columns - 1)) / columns;
  const top = height * 0.43;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = pad + column * (cell + gap);
      const y = top + row * (cell + gap);
      const filled = random() > 0.6;
      context.strokeStyle = "rgba(37, 16, 21, 0.55)";
      context.strokeRect(x, y, cell, cell);
      if (filled) {
        context.fillStyle = random() > 0.92 ? ACCENT : PAPER;
        context.fillRect(x, y, cell, cell);
      }
    }
  }
  text(context, "SEARCH / LOCAL ARRAY", pad, height * 0.79, tiny, PAPER);
  line(context, pad, height * 0.81, width - pad, height * 0.81, PAPER);
  drawCodeStrip(context, pad, height * 0.85, width - pad * 2, 4, phase, 83);
}

function drawCheckerBoundary(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  coverage: number,
) {
  if (coverage <= 0 || coverage >= 1) return;
  const edge = width * (1 - coverage);
  const size = Math.max(6, width * 0.028);
  for (let row = 0; row < Math.ceil(height / size); row += 1) {
    for (let column = -2; column <= 2; column += 1) {
      if ((row + column) % 2 !== 0) continue;
      context.fillStyle = column % 2 === 0 ? INK : PAPER;
      context.fillRect(edge + column * size, row * size, size, size);
    }
  }
}

function renderFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
) {
  const phase = Math.floor(time / 240);
  context.fillStyle = PAPER;
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height);
  drawDashboard(context, width, height, time, phase);

  const cycle = (time / 1000) % 12;
  let coverage = 0;
  if (cycle >= 4 && cycle < 4.75) coverage = (cycle - 4) / 0.75;
  if (cycle >= 4.75 && cycle < 6.2) coverage = 1;
  if (cycle >= 6.2 && cycle < 7) coverage = 1 - (cycle - 6.2) / 0.8;
  if (coverage > 0) {
    context.save();
    context.beginPath();
    context.rect(width * (1 - coverage), 0, width * coverage, height);
    context.clip();
    drawErrorState(context, width, height, phase);
    context.restore();
    drawCheckerBoundary(context, width, height, coverage);
  }

  if (cycle >= 9.35 && cycle < 10.05) {
    const amount = Math.sin(((cycle - 9.35) / 0.7) * Math.PI);
    context.fillStyle = `rgba(234, 223, 206, ${amount * 0.93})`;
    context.fillRect(width * 0.09, height * 0.39, width * 0.82, height * 0.22);
    text(context, "··· REBUILDING FIELD ···", width / 2, height * 0.505, width * 0.035, PAPER, "center");
  }
}

export function SignalField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return;

    let frame = 0;
    let lastDraw = 0;
    let width = 0;
    let height = 0;
    const startedAt = performance.now();
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frameGap = reducedMotion ? 700 : 84;

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      renderFrame(context, width, height, performance.now() - startedAt);
    };

    const loop = (now: number) => {
      if (now - lastDraw >= frameGap) {
        renderFrame(context, width, height, now - startedAt);
        lastDraw = now;
      }
      frame = requestAnimationFrame(loop);
    };

    resize();
    const observer =
      "ResizeObserver" in window ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    frame = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, []);

  return (
    <section className="signal-mode" aria-label="Signal Field generative typographic animation">
      <canvas ref={canvasRef} className="signal-canvas">
        A generative field of glyphs, telemetry, and geometric data.
      </canvas>
      <div className="signal-vignette" aria-hidden="true" />
    </section>
  );
}
