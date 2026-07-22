import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const OG_IMAGE = Object.freeze({
  file: "public/og-always-on-frame.png",
  width: 1_200,
  height: 630,
});

export const BASE_TEMPLATE = Object.freeze({
  file: "scripts/assets/og-always-on-frame-base.png",
  sha256: "0c6500854c49a3461cc7218f597fbad04aa4eb85024eb9cb306c913cadbc9995",
});

export const LEFT_BAY = Object.freeze({
  left: 87,
  top: 109,
  width: 307,
  height: 398,
});

export const RIGHT_BAY = Object.freeze({
  left: 804,
  top: 108,
  width: 310,
  height: 406,
});

export const CENTER_BAY = Object.freeze({
  left: 464,
  top: 134,
  width: 270,
  height: 350,
});

export const SWIKIPEDIA_ARTWORK = Object.freeze({
  qid: "Q2409245",
  file: "artworks/Q2409245.webp",
  title: "Portrait of a Young Girl",
  artist: "Petrus Christus",
  sha256: "d00720921e6ed3e01b7b5052b71a96eaafe80d2b12218f20b204b8d354c4fbd8",
  fit: "cover",
  position: "centre",
});

export const POSTERJO_ARTWORK = Object.freeze({
  file: "posterjo/posterjo-27163045-487769.webp",
  title: "The monolith - 03.03.26",
  sha256: "b811ea713028021830a45b7d793bb1fc4bcc97ab0d24cfda2fdf0d3267fd048a",
  fit: "cover",
  position: "centre",
});

export const DOT_GRID = Object.freeze({
  columns: 22,
  rows: 28,
  pitch: 14,
  firstCenterX: 6.5,
  firstCenterY: 10,
  wellRadius: 5.25,
  rotorRadius: 4.6,
});

const TIME_GLYPHS = Object.freeze({
  "1": ["010", "110", "010", "010", "010", "010", "111"],
  "2": ["1110", "0001", "0001", "1110", "1000", "1000", "1111"],
  "4": ["1001", "1001", "1001", "1111", "0001", "0001", "0001"],
  "8": ["1111", "1001", "1001", "1111", "1001", "1001", "1111"],
  ":": ["0", "1", "1", "0", "1", "1", "0"],
});

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function putPattern(matrix, pattern, startColumn, startRow) {
  pattern.forEach((row, rowOffset) => {
    [...row].forEach((value, columnOffset) => {
      if (value === "1") matrix[startRow + rowOffset][startColumn + columnOffset] = true;
    });
  });
}

function composeTextPattern(text, glyphs) {
  return Array.from({ length: 7 }, (_, row) =>
    [...text].map((character) => glyphs[character][row]).join("0"),
  );
}

function scalePattern(pattern, horizontalScale = 1, verticalScale = 1) {
  return pattern.flatMap((row) =>
    Array.from(
      { length: verticalScale },
      () => [...row].map((cell) => cell.repeat(horizontalScale)).join(""),
    ),
  );
}

export function createActiveDotMatrix() {
  const matrix = Array.from({ length: DOT_GRID.rows }, () =>
    Array.from({ length: DOT_GRID.columns }, () => false),
  );

  const hours = scalePattern(composeTextPattern("12", TIME_GLYPHS), 2);
  const minutes = scalePattern(composeTextPattern("48", TIME_GLYPHS), 2);
  putPattern(matrix, hours, Math.floor((DOT_GRID.columns - hours[0].length) / 2), 2);
  putPattern(matrix, ["11", "11"], 10, 11);
  putPattern(matrix, ["11", "11"], 10, 14);
  putPattern(matrix, minutes, Math.floor((DOT_GRID.columns - minutes[0].length) / 2), 19);

  return matrix;
}

function dotMarkup(active, column, row) {
  const centerX = DOT_GRID.firstCenterX + column * DOT_GRID.pitch;
  const centerY = DOT_GRID.firstCenterY + row * DOT_GRID.pitch;
  const state = active ? "on" : "off";
  const faceStroke = active ? "#6f5115" : "#171b18";
  const seamStroke = active ? "#8f691a" : "#090b0a";

  return `
    <g data-flip-dot-cell="true" data-column="${column}" data-row="${row}" transform="translate(${centerX} ${centerY})">
      <circle data-dot-well="true" cx="0" cy="0.55" r="${DOT_GRID.wellRadius}" fill="#010201" stroke="#2d322e" stroke-width="0.7"/>
      <circle data-dot-face="true" data-state="${state}" cx="0" cy="0" r="${DOT_GRID.rotorRadius}" fill="url(#rotor-${state})" stroke="${faceStroke}" stroke-width="0.55"/>
      <path d="M -3.75 0 H 3.75" fill="none" stroke="${seamStroke}" stroke-width="0.45" opacity="0.92"/>
      <path d="M -3.2 -2.35 A 4 4 0 0 1 3.2 -2.35" fill="none" stroke="#ffffff" stroke-width="0.38" opacity="${active ? "0.24" : "0.11"}"/>
    </g>`;
}

export function createFlipDotPanelSvg() {
  const matrix = createActiveDotMatrix();
  const dots = matrix
    .flatMap((row, rowIndex) =>
      row.map((active, columnIndex) => dotMarkup(active, columnIndex, rowIndex)),
    )
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LEFT_BAY.width}" height="${LEFT_BAY.height}" viewBox="0 0 ${LEFT_BAY.width} ${LEFT_BAY.height}">
    <defs>
      <linearGradient id="panel" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#090c0a"/>
        <stop offset="0.5" stop-color="#050706"/>
        <stop offset="1" stop-color="#030504"/>
      </linearGradient>
      <radialGradient id="rotor-off" cx="34%" cy="25%" r="78%">
        <stop offset="0" stop-color="#242925"/>
        <stop offset="0.48" stop-color="#151916"/>
        <stop offset="1" stop-color="#080a09"/>
      </radialGradient>
      <radialGradient id="rotor-on" cx="34%" cy="24%" r="82%">
        <stop offset="0" stop-color="#ffe27a"/>
        <stop offset="0.46" stop-color="#e7aa22"/>
        <stop offset="1" stop-color="#8a5b08"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#panel)"/>
    <rect x="0.5" y="0.5" width="${LEFT_BAY.width - 1}" height="${LEFT_BAY.height - 1}" fill="none" stroke="#111612"/>
    ${dots}
  </svg>`;
}

export async function renderFlipDotPanel() {
  return sharp(Buffer.from(createFlipDotPanelSvg())).png({ compressionLevel: 9 }).toBuffer();
}

export async function renderPosterjoPanel() {
  const sourcePath = resolve(projectRoot, "public", POSTERJO_ARTWORK.file);
  return sharp(sourcePath)
    .resize(RIGHT_BAY.width, RIGHT_BAY.height, {
      fit: POSTERJO_ARTWORK.fit,
      position: POSTERJO_ARTWORK.position,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

export async function renderSwikipediaPanel() {
  const sourcePath = resolve(projectRoot, "public", SWIKIPEDIA_ARTWORK.file);
  return sharp(sourcePath)
    .resize(CENTER_BAY.width, CENTER_BAY.height, {
      fit: SWIKIPEDIA_ARTWORK.fit,
      position: SWIKIPEDIA_ARTWORK.position,
    })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function verifyBaseTemplate() {
  const template = await readFile(resolve(projectRoot, BASE_TEMPLATE.file));
  if (sha256(template) !== BASE_TEMPLATE.sha256) {
    throw new Error(`Social preview base template changed: ${BASE_TEMPLATE.file}`);
  }
  const metadata = await sharp(template).metadata();
  if (metadata.width !== OG_IMAGE.width || metadata.height !== OG_IMAGE.height) {
    throw new Error(`Expected a ${OG_IMAGE.width}x${OG_IMAGE.height} social preview template`);
  }
  return template;
}

async function verifySwikipediaSource() {
  const [manifestSource, artworkBuffer] = await Promise.all([
    readFile(resolve(projectRoot, "public/artworks/manifest.json"), "utf8"),
    readFile(resolve(projectRoot, "public", SWIKIPEDIA_ARTWORK.file)),
  ]);
  const manifest = JSON.parse(manifestSource);
  const record = manifest.files.find((candidate) => candidate.qid === SWIKIPEDIA_ARTWORK.qid);

  if (!record || `artworks/${record.file}` !== SWIKIPEDIA_ARTWORK.file) {
    throw new Error(`${SWIKIPEDIA_ARTWORK.qid} is not present in the local Swikipedia archive`);
  }
  if (record.sha256 !== SWIKIPEDIA_ARTWORK.sha256 || sha256(artworkBuffer) !== SWIKIPEDIA_ARTWORK.sha256) {
    throw new Error(`Swikipedia source bytes changed for ${SWIKIPEDIA_ARTWORK.qid}`);
  }
  if (record.title !== SWIKIPEDIA_ARTWORK.title || record.artist !== SWIKIPEDIA_ARTWORK.artist) {
    throw new Error(`Swikipedia source metadata changed for ${SWIKIPEDIA_ARTWORK.qid}`);
  }

  return record;
}

async function verifyPosterjoSource() {
  const [manifestSource, artworkBuffer] = await Promise.all([
    readFile(resolve(projectRoot, "public/posterjo/manifest.json"), "utf8"),
    readFile(resolve(projectRoot, "public", POSTERJO_ARTWORK.file)),
  ]);
  const manifest = JSON.parse(manifestSource);
  const manifestFile = POSTERJO_ARTWORK.file.replace(/^posterjo\//, "");
  const record = manifest.files.find((candidate) => candidate.file === manifestFile);

  if (!record) throw new Error(`${manifestFile} is not present in the Posterjo manifest`);
  if (record.sha256 !== POSTERJO_ARTWORK.sha256) {
    throw new Error(`Posterjo manifest hash changed for ${manifestFile}`);
  }
  if (sha256(artworkBuffer) !== POSTERJO_ARTWORK.sha256) {
    throw new Error(`Posterjo source bytes do not match the committed manifest for ${manifestFile}`);
  }

  return record;
}

export async function buildOgImage() {
  const outputPath = resolve(projectRoot, OG_IMAGE.file);
  const [baseImage, swikipediaRecord, posterjoRecord, leftPanel, centerPanel, rightPanel] = await Promise.all([
    verifyBaseTemplate(),
    verifySwikipediaSource(),
    verifyPosterjoSource(),
    renderFlipDotPanel(),
    renderSwikipediaPanel(),
    renderPosterjoPanel(),
  ]);

  const output = await sharp(baseImage)
    .composite([
      { input: leftPanel, left: LEFT_BAY.left, top: LEFT_BAY.top },
      { input: centerPanel, left: CENTER_BAY.left, top: CENTER_BAY.top },
      { input: rightPanel, left: RIGHT_BAY.left, top: RIGHT_BAY.top },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  const activeCount = createActiveDotMatrix().flat().filter(Boolean).length;
  const provenance = {
    version: 1,
    builder: "scripts/build-og-always-on-frame.mjs",
    output: OG_IMAGE,
    outputSha256: sha256(output),
    baseTemplate: BASE_TEMPLATE,
    flipDotPanel: {
      bay: LEFT_BAY,
      grid: DOT_GRID,
      activeCount,
      content: { time: "12:48", layout: "stacked-hours-minutes", seconds: false },
      panelSha256: sha256(leftPanel),
    },
    swikipediaPanel: {
      bay: CENTER_BAY,
      qid: SWIKIPEDIA_ARTWORK.qid,
      file: SWIKIPEDIA_ARTWORK.file,
      title: SWIKIPEDIA_ARTWORK.title,
      artist: SWIKIPEDIA_ARTWORK.artist,
      sourcePage: swikipediaRecord.source.article,
      sha256: SWIKIPEDIA_ARTWORK.sha256,
      fit: SWIKIPEDIA_ARTWORK.fit,
      position: SWIKIPEDIA_ARTWORK.position,
      panelSha256: sha256(centerPanel),
    },
    posterjoPanel: {
      bay: RIGHT_BAY,
      file: POSTERJO_ARTWORK.file,
      title: POSTERJO_ARTWORK.title,
      sourcePage: posterjoRecord.source.page,
      sha256: POSTERJO_ARTWORK.sha256,
      fit: POSTERJO_ARTWORK.fit,
      position: POSTERJO_ARTWORK.position,
      panelSha256: sha256(rightPanel),
    },
  };

  await Promise.all([
    writeFile(outputPath, output),
    writeFile(
      resolve(projectRoot, "public/og-always-on-frame.provenance.json"),
      `${JSON.stringify(provenance, null, 2)}\n`,
    ),
  ]);

  return provenance;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  const provenance = await buildOgImage();
  console.log(
    `Built ${OG_IMAGE.file} with ${DOT_GRID.columns}x${DOT_GRID.rows} equal-size rotors and ${provenance.posterjoPanel.title}`,
  );
}
