#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DATA_FILE = join(REPO_ROOT, "app", "data", "paintings.generated.ts");
const ARTWORK_DIR = join(REPO_ROOT, "public", "artworks");
const MANIFEST_PATH = join(ARTWORK_DIR, "manifest.json");

const EXPECTED_RECORDS = 300;
const EXPECTED_CATALOG_RECORDS = 1_024;
const ARCHIVE_VERSION = "wikimedia-2026-07-17-4k1";
const SHORT_EDGE_TARGET = 2_160;
const STANDARD_LONG_EDGE_CAP = 4_096;
const PANORAMIC_LONG_EDGE_CAP = 8_192;
const PANORAMIC_ASPECT_RATIO = 6;
const MAX_OUTPUT_PIXELS = PANORAMIC_LONG_EDGE_CAP * SHORT_EDGE_TARGET;
const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 45_000;
const RETRY_BASE_DELAY_MS = 700;
const REQUEST_SPACING_MS = 500;
const ASPECT_RATIO_TOLERANCE = 0.01;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_RETRIES = 3;
const USER_AGENT =
  "ScreensaverArtworkSync/1.0 (https://github.com/joansterjo-celonis/Screensaver)";
const RESOLUTION_POLICY = Object.freeze({
  shortEdgeTarget: SHORT_EDGE_TARGET,
  standardLongEdgeCap: STANDARD_LONG_EDGE_CAP,
  panoramicLongEdgeCap: PANORAMIC_LONG_EDGE_CAP,
  panoramicAspectRatio: PANORAMIC_ASPECT_RATIO,
  noEnlargement: true,
});

const CONCURRENCY = boundedEnvironmentInteger(
  "ARTWORK_CONCURRENCY",
  DEFAULT_CONCURRENCY,
  1,
  2,
);
const MAX_RETRIES = boundedEnvironmentInteger(
  "ARTWORK_RETRIES",
  DEFAULT_RETRIES,
  0,
  5,
);

class PipelineError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "PipelineError";
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? 0;
  }
}

let requestPaceQueue = Promise.resolve();
let nextRequestAt = 0;
let requestsBlockedUntil = 0;

function boundedEnvironmentInteger(name, fallback, minimum, maximum) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new PipelineError(
      `${name} must be an integer from ${minimum} through ${maximum}; received ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function normaliseKey(value) {
  return value.replaceAll("_", " ").trim().toLocaleLowerCase("en-US");
}

function assertUnique(records, property, label, normalise = (value) => value) {
  const seen = new Map();
  for (const record of records) {
    const key = normalise(record[property]);
    if (seen.has(key)) {
      throw new PipelineError(
        `Duplicate ${label} in ${basename(DATA_FILE)}: ${JSON.stringify(record[property])} (${seen.get(key)} and ${record.qid})`,
      );
    }
    seen.set(key, record.qid);
  }
}

async function loadPaintingRecords() {
  const source = await readFile(DATA_FILE, "utf8");
  const startMarker = "const PAINTING_ROWS = [";
  const endMarker = "] as const satisfies readonly PaintingTuple[];";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  if (start < 0 || end < 0) {
    throw new PipelineError(
      `Could not locate PAINTING_ROWS tuple data in ${DATA_FILE}`,
    );
  }

  const tupleSource = source
    .slice(start + startMarker.length, end)
    .replace(/,\s*$/u, "");

  let tuples;
  try {
    tuples = JSON.parse(`[${tupleSource}]`);
  } catch (error) {
    throw new PipelineError(
      `PAINTING_ROWS is no longer JSON-compatible tuple data: ${error.message}`,
      { cause: error },
    );
  }

  if (!Array.isArray(tuples) || tuples.length !== EXPECTED_CATALOG_RECORDS) {
    throw new PipelineError(
      `Expected exactly ${EXPECTED_CATALOG_RECORDS} painting tuples, found ${tuples?.length ?? "invalid data"}`,
    );
  }

  const catalog = tuples.map((tuple, index) => {
    if (!Array.isArray(tuple) || tuple.length !== 10) {
      throw new PipelineError(
        `Painting tuple ${index + 1} must contain exactly 10 fields`,
      );
    }

    const [
      qid,
      articleTitle,
      title,
      artist,
      year,
      fallbackFile,
      width,
      height,
      licenseUrl,
      localFallback,
    ] = tuple;
    const stringFields = {
      qid,
      articleTitle,
      title,
      artist,
      year,
      fallbackFile,
      licenseUrl,
    };
    for (const [field, value] of Object.entries(stringFields)) {
      if (typeof value !== "string" || value.trim() === "") {
        throw new PipelineError(
          `Painting tuple ${index + 1} has an invalid ${field}`,
        );
      }
    }
    if (!/^Q\d+$/u.test(qid)) {
      throw new PipelineError(`Painting tuple ${index + 1} has invalid QID ${qid}`);
    }
    if (typeof localFallback !== "boolean") {
      throw new PipelineError(
        `Painting tuple ${index + 1} has invalid localFallback`,
      );
    }
    if (
      !Number.isSafeInteger(width) ||
      !Number.isSafeInteger(height) ||
      width < 1 ||
      height < 1
    ) {
      throw new PipelineError(
        `Painting ${qid} has invalid source dimensions ${width}×${height}`,
      );
    }

    return {
      qid,
      articleTitle,
      title,
      artist,
      year,
      fallbackFile,
      width,
      height,
      localFallback,
    };
  });

  assertUnique(catalog, "qid", "QID");
  assertUnique(catalog, "articleTitle", "article title", normaliseKey);
  assertUnique(catalog, "fallbackFile", "Commons filename", normaliseKey);
  const records = catalog.filter((record) => record.localFallback);
  if (records.length !== EXPECTED_RECORDS) {
    throw new PipelineError(
      `Expected exactly ${EXPECTED_RECORDS} local fallback records, found ${records.length}`,
    );
  }

  return records;
}

function sourceDigest(records) {
  return sha256(
    JSON.stringify(
      records.map((record) => [
        record.qid,
        record.articleTitle,
        record.title,
        record.artist,
        record.year,
        record.fallbackFile,
        record.width,
        record.height,
      ]),
    ),
  );
}

function targetDimensions(width, height) {
  const landscape = width >= height;
  const sourceShort = Math.min(width, height);
  const sourceLong = Math.max(width, height);
  const aspectRatio = sourceLong / sourceShort;
  const longEdgeCap =
    aspectRatio > PANORAMIC_ASPECT_RATIO
      ? PANORAMIC_LONG_EDGE_CAP
      : STANDARD_LONG_EDGE_CAP;

  let targetShort = sourceShort;
  let targetLong = sourceLong;
  if (targetShort > SHORT_EDGE_TARGET) {
    targetShort = SHORT_EDGE_TARGET;
    targetLong = Math.max(
      1,
      Math.round((sourceLong * SHORT_EDGE_TARGET) / sourceShort),
    );
  }
  if (targetLong > longEdgeCap) {
    targetLong = longEdgeCap;
    targetShort = Math.max(
      1,
      Math.round((sourceShort * longEdgeCap) / sourceLong),
    );
  }

  return landscape
    ? { width: targetLong, height: targetShort }
    : { width: targetShort, height: targetLong };
}

function derivativeRequestWidth(record) {
  const target = targetDimensions(record.width, record.height);
  if (target.width >= record.width) {
    return record.width;
  }

  // A small source-side margin absorbs Commons thumbnail rounding so sharp can
  // always downsample to the exact deterministic dimensions without enlarging.
  const headroom = Math.max(2, Math.ceil(target.width * 0.02));
  return Math.min(record.width, target.width + headroom);
}

function wikiTitleUrl(origin, prefix, title) {
  const underscored = title.replaceAll(" ", "_");
  return `${origin}/${prefix}${encodeURIComponent(underscored)}`;
}

function sourceUrls(record) {
  const requestedWidth = derivativeRequestWidth(record);
  const redirect = wikiTitleUrl(
    "https://commons.wikimedia.org",
    "wiki/Special:Redirect/file/",
    record.fallbackFile,
  );
  return {
    article: wikiTitleUrl("https://en.wikipedia.org", "wiki/", record.articleTitle),
    commonsFile: record.fallbackFile,
    commonsPage: wikiTitleUrl(
      "https://commons.wikimedia.org",
      "wiki/File:",
      record.fallbackFile,
    ),
    derivative: `${redirect}?width=${requestedWidth}`,
    original: redirect,
  };
}

function dimensionsAfterOrientation(metadata) {
  if (metadata.autoOrient?.width && metadata.autoOrient?.height) {
    return {
      width: metadata.autoOrient.width,
      height: metadata.autoOrient.height,
    };
  }

  const swapsAxes = [5, 6, 7, 8].includes(metadata.orientation);
  return {
    width: swapsAxes ? metadata.height : metadata.width,
    height: swapsAxes ? metadata.width : metadata.height,
  };
}

function validateSourceGeometry(record, width, height, context) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height)) {
    throw new PipelineError(`${context} for ${record.qid} has missing dimensions`);
  }
  if (width < 1 || height < 1) {
    throw new PipelineError(
      `${context} for ${record.qid} has invalid dimensions ${width}×${height}`,
    );
  }
  const outputRatio = width / height;
  const sourceRatio = record.width / record.height;
  const ratioError = Math.abs(outputRatio - sourceRatio) / sourceRatio;
  if (
    width > record.width ||
    height > record.height ||
    ratioError > ASPECT_RATIO_TOLERANCE
  ) {
    throw new PipelineError(
      `${context} for ${record.qid} does not preserve the ${record.width}×${record.height} source geometry without enlargement`,
    );
  }
}

function validateOutputGeometry(record, width, height, context) {
  validateSourceGeometry(record, width, height, context);
  const expected = targetDimensions(record.width, record.height);
  if (width !== expected.width || height !== expected.height) {
    throw new PipelineError(
      `${context} for ${record.qid} must be exactly ${expected.width}×${expected.height}; received ${width}×${height}`,
    );
  }
}

async function assertArtworkRoot({ create }) {
  const publicDirectory = dirname(ARTWORK_DIR);
  const publicStat = await lstat(publicDirectory);
  if (!publicStat.isDirectory() || publicStat.isSymbolicLink()) {
    throw new PipelineError(
      `${publicDirectory} must be a real directory before artwork assets can be managed`,
    );
  }

  const [repoReal, publicReal] = await Promise.all([
    realpath(REPO_ROOT),
    realpath(publicDirectory),
  ]);
  const expectedPublicReal = join(repoReal, "public");
  if (publicReal !== expectedPublicReal) {
    throw new PipelineError(
      `Refusing to manage artwork assets through a linked public directory: ${publicReal}`,
    );
  }

  if (create) {
    await mkdir(ARTWORK_DIR, { recursive: true });
  }

  let artworkStat;
  try {
    artworkStat = await lstat(ARTWORK_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new PipelineError(
        `${ARTWORK_DIR} does not exist; run the sync before --verify`,
        { cause: error },
      );
    }
    throw error;
  }

  if (!artworkStat.isDirectory() || artworkStat.isSymbolicLink()) {
    throw new PipelineError(`${ARTWORK_DIR} must be a real directory, not a link`);
  }

  const artworkReal = await realpath(ARTWORK_DIR);
  const expectedReal = join(repoReal, "public", "artworks");
  if (artworkReal !== expectedReal) {
    throw new PipelineError(
      `Refusing to manage artwork path outside the repository: ${artworkReal}`,
    );
  }
}

function assertInsideArtworkRoot(path) {
  const absolute = resolve(path);
  const fromRoot = relative(ARTWORK_DIR, absolute);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new PipelineError(`Refusing to remove path outside artwork root: ${path}`);
  }
  return absolute;
}

async function removeInsideArtworkRoot(path) {
  // Re-resolve the managed root immediately before destructive work so a
  // replaced public/artworks path cannot redirect cleanup elsewhere.
  await assertArtworkRoot({ create: false });
  await rm(assertInsideArtworkRoot(path), { recursive: true, force: true });
}

function retryDelay(attempt, key) {
  const stableSpread = [...key].reduce((sum, character) => sum + character.codePointAt(0), 0) % 211;
  return RETRY_BASE_DELAY_MS * 2 ** attempt + stableSpread;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function parseRetryAfter(value) {
  if (!value) {
    return 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.ceil(seconds * 1_000);
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function blockAllRequests(milliseconds) {
  if (milliseconds > 0) {
    requestsBlockedUntil = Math.max(
      requestsBlockedUntil,
      Date.now() + milliseconds,
    );
  }
}

async function waitForRequestSlot() {
  const paced = requestPaceQueue.then(async () => {
    while (true) {
      const waitUntil = Math.max(nextRequestAt, requestsBlockedUntil);
      const wait = Math.max(0, waitUntil - Date.now());
      if (wait <= 0) break;
      await delay(wait);
    }
    nextRequestAt = Date.now() + REQUEST_SPACING_MS;
  });
  requestPaceQueue = paced.catch(() => {});
  await paced;
}

async function responseBuffer(response, qid) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new PipelineError(
      `Commons response for ${qid} declares ${declaredLength} bytes, above the ${MAX_DOWNLOAD_BYTES}-byte limit`,
      { retryable: false },
    );
  }
  if (!response.body) {
    throw new PipelineError(`Commons response for ${qid} has no body`, {
      retryable: true,
    });
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    bytes += buffer.length;
    if (bytes > MAX_DOWNLOAD_BYTES) {
      await response.body.cancel().catch(() => {});
      throw new PipelineError(
        `Commons response for ${qid} exceeded the ${MAX_DOWNLOAD_BYTES}-byte limit`,
        { retryable: false },
      );
    }
    chunks.push(buffer);
  }
  if (bytes === 0) {
    throw new PipelineError(`Commons returned an empty image for ${qid}`, {
      retryable: true,
    });
  }
  return Buffer.concat(chunks, bytes);
}

async function downloadOnce(url, qid) {
  await waitForRequestSlot();
  const response = await fetch(url, {
    headers: {
      Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.8,*/*;q=0.2",
      "User-Agent": USER_AGENT,
    },
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const retryable =
      response.status === 408 || response.status === 429 || response.status >= 500;
    const retryAfterMs =
      response.status === 429 || response.status === 503
        ? parseRetryAfter(response.headers.get("retry-after"))
        : 0;
    if (response.status === 429 || response.status === 503) {
      blockAllRequests(Math.max(retryAfterMs, RETRY_BASE_DELAY_MS));
    }
    throw new PipelineError(
      `Commons returned HTTP ${response.status} for ${qid}`,
      { retryable, retryAfterMs },
    );
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (
    contentType &&
    !contentType.startsWith("image/") &&
    contentType !== "application/octet-stream"
  ) {
    throw new PipelineError(
      `Commons returned unexpected content type ${contentType} for ${qid}`,
      { retryable: true },
    );
  }

  return responseBuffer(response, qid);
}

async function runWithRetries(qid, operation) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable =
        error instanceof PipelineError ? error.retryable : true;
      if (!retryable || attempt === MAX_RETRIES) {
        break;
      }
      const wait = Math.max(
        retryDelay(attempt, qid),
        error.retryAfterMs ?? 0,
      );
      blockAllRequests(error.retryAfterMs ?? 0);
      console.warn(
        `[${qid}] attempt ${attempt + 1} failed; retrying in ${wait} ms: ${error.message}`,
      );
      await delay(wait);
    }
  }
  throw new PipelineError(
    `Unable to prepare ${qid} after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`,
    { cause: lastError },
  );
}

async function inspectWebp(path, record, expected = null) {
  const fileStat = await lstat(path);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new PipelineError(`${path} must be a regular WebP file`);
  }

  const image = sharp(path, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_OUTPUT_PIXELS,
  });
  const metadata = await image.metadata();
  if (metadata.format !== "webp") {
    throw new PipelineError(`${path} is ${metadata.format ?? "unknown"}, not WebP`);
  }
  validateOutputGeometry(record, metadata.width, metadata.height, "WebP output");

  // stats() forces a complete pixel decode, catching truncation that metadata-only
  // inspection can miss.
  await sharp(path, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_OUTPUT_PIXELS,
  }).stats();

  const digest = await sha256File(path);
  const details = {
    width: metadata.width,
    height: metadata.height,
    bytes: fileStat.size,
    sha256: digest,
  };

  if (expected) {
    for (const property of ["width", "height", "bytes", "sha256"]) {
      if (details[property] !== expected[property]) {
        throw new PipelineError(
          `${record.qid} ${property} mismatch: manifest=${expected[property]}, actual=${details[property]}`,
        );
      }
    }
  }
  return details;
}

function manifestEntryFor(record, output, input = null) {
  return {
    qid: record.qid,
    file: `${record.qid}.webp`,
    title: record.title,
    artist: record.artist,
    year: record.year,
    ...output,
    input: input ?? {
      kind: "verified-existing-output",
      sha256: output.sha256,
    },
    source: sourceUrls(record),
  };
}

async function reusableEntry(record, previousEntry = null) {
  const finalPath = join(ARTWORK_DIR, `${record.qid}.webp`);
  try {
    const output = await inspectWebp(finalPath, record);
    return manifestEntryFor(record, output, previousEntry?.input);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[${record.qid}] rebuilding unusable local WebP: ${error.message}`);
    }
    return null;
  }
}

async function publishPart(partPath, finalPath) {
  await assertArtworkRoot({ create: false });
  try {
    await rename(partPath, finalPath);
  } catch (error) {
    if (!["EEXIST", "EISDIR", "ENOTEMPTY", "EPERM"].includes(error.code)) {
      throw error;
    }

    // POSIX atomically replaces regular files. This fallback handles platforms
    // and invalid destination types that reject replacement; it runs only after
    // the new part has passed a complete decode and hash validation.
    await removeInsideArtworkRoot(finalPath);
    await assertArtworkRoot({ create: false });
    await rename(partPath, finalPath);
  }
}

async function convertRecord(record, previousEntry = null) {
  const reusable = await reusableEntry(record, previousEntry);
  if (reusable) {
    return reusable;
  }

  const urls = sourceUrls(record);
  const target = targetDimensions(record.width, record.height);
  const finalPath = join(ARTWORK_DIR, `${record.qid}.webp`);

  return runWithRetries(record.qid, async () => {
    const partPath = join(
      ARTWORK_DIR,
      `.${record.qid}.${process.pid}.${randomUUID()}.part.webp`,
    );
    assertInsideArtworkRoot(partPath);
    try {
      let input = await downloadOnce(urls.derivative, record.qid);
      let inputKind = "derivative";
      let inputMetadata = await sharp(input, {
        animated: false,
        failOn: "error",
        limitInputPixels: 180_000_000,
      }).metadata();
      let inputDimensions = dimensionsAfterOrientation(inputMetadata);
      validateSourceGeometry(
        record,
        inputDimensions.width,
        inputDimensions.height,
        "Commons derivative",
      );
      if (
        inputDimensions.width < target.width ||
        inputDimensions.height < target.height
      ) {
        console.warn(
          `[${record.qid}] Commons capped the derivative at ${inputDimensions.width}×${inputDimensions.height}; using the original for the ${target.width}×${target.height} display master.`,
        );
        input = await downloadOnce(urls.original, record.qid);
        inputKind = "original";
        inputMetadata = await sharp(input, {
          animated: false,
          failOn: "error",
          limitInputPixels: 180_000_000,
        }).metadata();
        inputDimensions = dimensionsAfterOrientation(inputMetadata);
        validateSourceGeometry(
          record,
          inputDimensions.width,
          inputDimensions.height,
          "Commons original",
        );
        if (
          inputDimensions.width < target.width ||
          inputDimensions.height < target.height
        ) {
          throw new PipelineError(
            `Commons original for ${record.qid} is ${inputDimensions.width}×${inputDimensions.height}, below required output ${target.width}×${target.height}`,
            { retryable: false },
          );
        }
      }

      await sharp(input, {
        animated: false,
        failOn: "error",
        limitInputPixels: 180_000_000,
      })
        .rotate()
        .resize({
          width: target.width,
          height: target.height,
          fit: "fill",
          kernel: sharp.kernel.lanczos3,
          withoutEnlargement: true,
        })
        .webp({
          quality: 84,
          alphaQuality: 100,
          effort: 6,
          smartSubsample: true,
          preset: "picture",
        })
        .toFile(partPath);

      const output = await inspectWebp(partPath, record);
      await publishPart(partPath, finalPath);
      return manifestEntryFor(record, output, {
        kind: inputKind,
        sha256: sha256(input),
      });
    } finally {
      await removeInsideArtworkRoot(partPath).catch(() => {});
    }
  });
}

async function mapWithConcurrency(items, concurrency, operation) {
  const results = new Array(items.length);
  let nextIndex = 0;
  let failure = null;

  async function worker() {
    while (!failure) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) {
        return;
      }
      try {
        results[index] = await operation(items[index], index);
      } catch (error) {
        failure ??= error;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  if (failure) {
    throw failure;
  }
  return results;
}

function manifestFor(records, generatedEntries) {
  const byQid = new Map(generatedEntries.map((entry) => [entry.qid, entry]));
  if (byQid.size !== records.length) {
    throw new PipelineError("Generated entries do not contain one unique file per QID");
  }

  return {
    version: ARCHIVE_VERSION,
    archiveVersion: ARCHIVE_VERSION,
    count: records.length,
    format: "webp",
    resolution: RESOLUTION_POLICY,
    sourceDigest: sourceDigest(records),
    encoder: {
      name: "sharp",
      sharp: sharp.versions.sharp,
      libvips: sharp.versions.vips,
      webp: sharp.versions.webp,
    },
    files: records.map((record) => {
      const entry = byQid.get(record.qid);
      if (!entry) {
        throw new PipelineError(`Missing generated entry for ${record.qid}`);
      }
      return entry;
    }),
  };
}

async function atomicWriteText(path, contents) {
  const temporary = join(
    ARTWORK_DIR,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  assertInsideArtworkRoot(temporary);

  let handle;
  try {
    await assertArtworkRoot({ create: false });
    handle = await open(temporary, "wx", 0o644);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await assertArtworkRoot({ create: false });
    await rename(temporary, path);
  } catch (error) {
    await handle?.close().catch(() => {});
    await removeInsideArtworkRoot(temporary).catch(() => {});
    throw error;
  }
}

async function pruneUnexpectedEntries(expectedNames) {
  const entries = await readdir(ARTWORK_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!expectedNames.has(entry.name)) {
      await removeInsideArtworkRoot(join(ARTWORK_DIR, entry.name));
    }
  }
}

function assertManifestHeader(manifest, records) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new PipelineError("manifest.json must contain an object");
  }
  const checks = [
    ["version", ARCHIVE_VERSION],
    ["archiveVersion", ARCHIVE_VERSION],
    ["count", records.length],
    ["format", "webp"],
    ["sourceDigest", sourceDigest(records)],
  ];
  for (const [property, expected] of checks) {
    if (manifest[property] !== expected) {
      throw new PipelineError(
        `manifest.json ${property} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(manifest[property])}`,
      );
    }
  }
  if (JSON.stringify(manifest.resolution) !== JSON.stringify(RESOLUTION_POLICY)) {
    throw new PipelineError(
      `manifest.json resolution policy mismatch: expected ${JSON.stringify(RESOLUTION_POLICY)}, received ${JSON.stringify(manifest.resolution)}`,
    );
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== records.length) {
    throw new PipelineError(
      `manifest.json must contain exactly ${records.length} file entries`,
    );
  }
}

function assertManifestEntry(entry, record) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new PipelineError(`Manifest entry for ${record.qid} is invalid`);
  }
  const expected = {
    qid: record.qid,
    file: `${record.qid}.webp`,
    title: record.title,
    artist: record.artist,
    year: record.year,
  };
  for (const [property, value] of Object.entries(expected)) {
    if (entry[property] !== value) {
      throw new PipelineError(
        `${record.qid} manifest ${property} mismatch: expected ${JSON.stringify(value)}, received ${JSON.stringify(entry[property])}`,
      );
    }
  }

  const expectedSource = sourceUrls(record);
  if (!entry.source || typeof entry.source !== "object") {
    throw new PipelineError(`${record.qid} manifest source is missing`);
  }
  for (const [property, value] of Object.entries(expectedSource)) {
    if (entry.source[property] !== value) {
      throw new PipelineError(
        `${record.qid} source.${property} mismatch in manifest.json`,
      );
    }
  }

  if (!Number.isSafeInteger(entry.width) || !Number.isSafeInteger(entry.height)) {
    throw new PipelineError(`${record.qid} manifest dimensions are invalid`);
  }
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1) {
    throw new PipelineError(`${record.qid} manifest byte count is invalid`);
  }
  if (typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
    throw new PipelineError(`${record.qid} manifest SHA-256 is invalid`);
  }
  if (
    !entry.input ||
    !["derivative", "original", "verified-existing-output"].includes(entry.input.kind) ||
    typeof entry.input.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(entry.input.sha256)
  ) {
    throw new PipelineError(`${record.qid} manifest input provenance is invalid`);
  }
}

async function readPreviousManifest() {
  try {
    const manifestStat = await lstat(MANIFEST_PATH);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      throw new PipelineError(`${MANIFEST_PATH} must be a regular JSON file`);
    }
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw new PipelineError(`Unable to inspect the existing archive manifest: ${error.message}`, {
      cause: error,
    });
  }
}

function assertVersionContentStable(previous, next) {
  if (previous?.archiveVersion !== ARCHIVE_VERSION) return;
  if (previous.sourceDigest !== next.sourceDigest) {
    throw new PipelineError(
      `Painting sources changed under archive ${ARCHIVE_VERSION}; bump ARCHIVE_VERSION before publishing new bytes.`,
    );
  }
  const previousHashes = new Map(
    (previous.files ?? []).map((entry) => [entry.qid, entry.sha256]),
  );
  const changed = next.files.filter(
    (entry) => previousHashes.get(entry.qid) !== entry.sha256,
  );
  if (changed.length > 0 || previousHashes.size !== next.files.length) {
    throw new PipelineError(
      `${changed.length || "Archive file set"} artwork bytes changed under ${ARCHIVE_VERSION}; bump ARCHIVE_VERSION to invalidate deployed caches.`,
    );
  }
}

async function verify(records, { quiet = false, exactSet = true } = {}) {
  await assertArtworkRoot({ create: false });

  let manifest;
  try {
    const manifestStat = await lstat(MANIFEST_PATH);
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      throw new PipelineError(`${MANIFEST_PATH} must be a regular JSON file`);
    }
    manifest = JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    throw new PipelineError(`Unable to read valid ${MANIFEST_PATH}: ${error.message}`, {
      cause: error,
    });
  }
  assertManifestHeader(manifest, records);

  const expectedNames = new Set([
    "manifest.json",
    ...records.map((record) => `${record.qid}.webp`),
  ]);
  const actualEntries = await readdir(ARTWORK_DIR, { withFileTypes: true });
  const actualNames = new Set(actualEntries.map((entry) => entry.name));
  const missing = [...expectedNames].filter((name) => !actualNames.has(name));
  const unexpected = [...actualNames].filter((name) => !expectedNames.has(name));
  if (missing.length || (exactSet && unexpected.length)) {
    throw new PipelineError(
      `Artwork file set mismatch; missing=${JSON.stringify(missing)}, unexpected=${JSON.stringify(unexpected)}`,
    );
  }

  const entriesByQid = new Map();
  const filesSeen = new Set();
  for (const entry of manifest.files) {
    if (entriesByQid.has(entry?.qid)) {
      throw new PipelineError(`Duplicate QID ${entry?.qid} in manifest.json`);
    }
    if (filesSeen.has(entry?.file)) {
      throw new PipelineError(`Duplicate file ${entry?.file} in manifest.json`);
    }
    entriesByQid.set(entry?.qid, entry);
    filesSeen.add(entry?.file);
  }

  await mapWithConcurrency(
    records,
    Math.min(CONCURRENCY, 4),
    async (record, index) => {
      const entry = entriesByQid.get(record.qid);
      assertManifestEntry(entry, record);
      await inspectWebp(join(ARTWORK_DIR, entry.file), record, entry);
      if (!quiet && ((index + 1) % 25 === 0 || index + 1 === records.length)) {
        console.log(`Verified ${index + 1}/${records.length}`);
      }
    },
  );

  if (!quiet) {
    console.log(
      `Verified ${records.length} local artworks, manifest hashes, full decodes, and exact file set.`,
    );
  }
}

async function sync(records) {
  await assertArtworkRoot({ create: true });
  const previousManifest = await readPreviousManifest();
  const previousEntries = new Map(
    (previousManifest?.files ?? []).map((entry) => [entry.qid, entry]),
  );
  console.log(
    `Syncing ${records.length} artworks at archive=${ARCHIVE_VERSION}, concurrency=${CONCURRENCY}, retries=${MAX_RETRIES}`,
  );
  let completed = 0;
  const generated = await mapWithConcurrency(
    records,
    CONCURRENCY,
    async (record) => {
      const entry = await convertRecord(record, previousEntries.get(record.qid));
      completed += 1;
      console.log(`Ready ${completed}/${records.length}: ${record.qid}`);
      return entry;
    },
  );

  const manifest = manifestFor(records, generated);
  assertVersionContentStable(previousManifest, manifest);
  await atomicWriteText(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);

  // Validate every expected file and manifest hash before pruning stale files
  // or crash-left .part files. A final exact-set pass follows the prune.
  await verify(records, { quiet: true, exactSet: false });
  const expectedNames = new Set([
    "manifest.json",
    ...records.map((record) => `${record.qid}.webp`),
  ]);
  await pruneUnexpectedEntries(expectedNames);
  await verify(records, { quiet: true, exactSet: true });
  console.log(
    `Published and verified ${records.length} WebPs in ${ARTWORK_DIR}.`,
  );
}

function printHelp() {
  console.log(`Usage:
  node scripts/sync-local-artworks.mjs           Download, convert, and publish all artworks
  node scripts/sync-local-artworks.mjs --verify  Verify local files only; performs no network access

Optional bounded environment settings:
  ARTWORK_CONCURRENCY=1..2  (default ${DEFAULT_CONCURRENCY})
  ARTWORK_RETRIES=0..5      (default ${DEFAULT_RETRIES})`);
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.length === 1 && ["--help", "-h"].includes(arguments_[0])) {
    printHelp();
    return;
  }
  if (
    arguments_.length > 1 ||
    (arguments_.length === 1 && arguments_[0] !== "--verify")
  ) {
    throw new PipelineError(`Unknown arguments: ${arguments_.join(" ")}`);
  }

  const records = await loadPaintingRecords();
  if (arguments_[0] === "--verify") {
    await verify(records);
    return;
  }
  await sync(records);
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
