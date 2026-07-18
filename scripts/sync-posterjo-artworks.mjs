#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
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
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import sharp from "sharp";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const INVENTORY_PATH = join(
  REPO_ROOT,
  "scripts",
  "data",
  "posterjo-inventory.json",
);
const RAW_CACHE_DIR = "/private/tmp/posterjo-raw";
const DATA_PATH = join(REPO_ROOT, "app", "data", "posterjo.generated.ts");
const OUTPUT_DIR = join(REPO_ROOT, "public", "posterjo");
const MANIFEST_PATH = join(OUTPUT_DIR, "manifest.json");

const CUTOFF_SHOT_ID = "9201225";
const CUTOFF_TITLE = "newgen posterjo #1";
const ARCHIVE_VERSION = "posterjo-2026-07-18-4k1";
const MINIMUM_SOURCE_LONG_EDGE = 3_840;
const MINIMUM_SOURCE_PIXELS = 3_840 * 2_160;
const OUTPUT_LONG_EDGE_CAP = 4_096;
const MAX_SOURCE_PIXELS = 268_435_456;
const MAX_OUTPUT_PIXELS = OUTPUT_LONG_EDGE_CAP ** 2;
const MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024;
const MAX_ARCHIVE_MEMBERS = 2_000;
const MAX_ARCHIVE_LIST_BYTES = 4 * 1024 * 1024;
const MAX_ARCHIVE_EXPANDED_BYTES = 2 * 1024 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 180_000;
const REQUEST_SPACING_MS = 150;
const RETRY_BASE_DELAY_MS = 700;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_RETRIES = 3;
const ASPECT_RATIO_TOLERANCE = 0.001;
const USER_AGENT = "ScreensaverPosterjoSync/1.0";
const WEBP_OPTIONS = Object.freeze({
  quality: 90,
  alphaQuality: 100,
  effort: 6,
  smartSubsample: true,
  preset: "picture",
});
const RESOLUTION_POLICY = Object.freeze({
  minimumSourceLongEdge: MINIMUM_SOURCE_LONG_EDGE,
  minimumSourcePixels: MINIMUM_SOURCE_PIXELS,
  outputLongEdgeCap: OUTPUT_LONG_EDGE_CAP,
  autoOrient: true,
  preserveAspectRatio: true,
  noEnlargement: true,
});
const RASTER_FORMATS = new Set([
  "avif",
  "gif",
  "heif",
  "jp2",
  "jpeg",
  "jxl",
  "png",
  "tiff",
  "webp",
]);
const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".heic",
  ".heif",
  ".jp2",
  ".jpeg",
  ".jpg",
  ".jxl",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);
const ARCHIVE_EXTENSIONS = new Set([".7z", ".zip"]);
const ARCHIVE_MEDIA_TYPES = new Set([
  "application/7z-compressed",
  "application/x-7z-compressed",
  "application/x-zip-compressed",
  "application/zip",
]);
const execFileAsync = promisify(execFile);

const CONCURRENCY = boundedEnvironmentInteger(
  "POSTERJO_CONCURRENCY",
  DEFAULT_CONCURRENCY,
  1,
  4,
);
const MAX_RETRIES = boundedEnvironmentInteger(
  "POSTERJO_RETRIES",
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
  if (raw === undefined || raw === "") return fallback;

  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new PipelineError(
      `${name} must be an integer from ${minimum} through ${maximum}; received ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function sha256File(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

function normaliseText(value, label, { allowEmpty = false } = {}) {
  if (typeof value !== "string") {
    throw new PipelineError(`${label} must be a string`);
  }
  const normalised = value.replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
  if (!allowEmpty && normalised === "") {
    throw new PipelineError(`${label} must not be empty`);
  }
  if (normalised.includes("\0")) {
    throw new PipelineError(`${label} must not contain null bytes`);
  }
  return normalised;
}

function validatedDribbbleUrl(value, label) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new PipelineError(`${label} is missing a resolved URL`);
  }

  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new PipelineError(`${label} is not a valid URL`, { cause: error });
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    (host !== "dribbble.com" && !host.endsWith(".dribbble.com"))
  ) {
    throw new PipelineError(
      `${label} must be a credential-free HTTPS URL on dribbble.com`,
    );
  }
  return url.href;
}

function outputId(shotId, fileId) {
  return `posterjo-${shotId}-${fileId}`;
}

function outputFileName(attachment) {
  return `${attachment.id}.webp`;
}

function inventoryDigest(shots) {
  return sha256(
    JSON.stringify(
      shots.map((shot) => ({
        profileIndex: shot.profileIndex,
        shotId: shot.shotId,
        sourceUrl: shot.sourceUrl,
        title: shot.title,
        description: shot.description,
        attachments: shot.attachments.map((attachment) => ({
          fileId: attachment.fileId,
          originalFileName: attachment.originalFileName,
          declaredFormat: attachment.declaredFormat,
          downloadUrl: attachment.downloadUrl,
        })),
      })),
    ),
  );
}

async function loadInventory() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(INVENTORY_PATH, "utf8"));
  } catch (error) {
    throw new PipelineError(
      `Unable to read valid inventory JSON at ${INVENTORY_PATH}: ${error.message}`,
      { cause: error },
    );
  }
  if (!Array.isArray(parsed)) {
    throw new PipelineError(`${INVENTORY_PATH} must contain a JSON array`);
  }

  const cutoffIndex = parsed.findIndex(
    (record) => isObject(record) && String(record.shotId) === CUTOFF_SHOT_ID,
  );
  if (cutoffIndex < 0) {
    throw new PipelineError(
      `Inventory is incomplete: inclusive cutoff shot ${CUTOFF_SHOT_ID} was not found`,
    );
  }

  const seenShotIds = new Set();
  const seenFileIds = new Set();
  let previousProfileIndex = -1;
  let ordinal = 0;
  const shots = parsed.slice(0, cutoffIndex + 1).map((record, arrayIndex) => {
    if (!isObject(record)) {
      throw new PipelineError(`Inventory record ${arrayIndex} is missing or invalid`);
    }
    if (record.ok !== true) {
      throw new PipelineError(
        `Inventory record ${arrayIndex} failed before the cutoff: ${record.error ?? "unknown extraction error"}`,
      );
    }

    const profileIndex = Number(record.profileIndex);
    if (!Number.isSafeInteger(profileIndex) || profileIndex < 0) {
      throw new PipelineError(`Inventory record ${arrayIndex} has an invalid profileIndex`);
    }
    if (profileIndex !== arrayIndex) {
      throw new PipelineError(
        `Inventory is incomplete or out of order: record ${arrayIndex} has profileIndex ${profileIndex}`,
      );
    }
    if (profileIndex <= previousProfileIndex) {
      throw new PipelineError(
        `Inventory profileIndex values must be strictly increasing through the cutoff`,
      );
    }
    previousProfileIndex = profileIndex;

    const shotId = String(record.shotId ?? "");
    if (!/^\d+$/u.test(shotId) || seenShotIds.has(shotId)) {
      throw new PipelineError(
        `Inventory record ${arrayIndex} has an invalid or duplicate shotId ${JSON.stringify(shotId)}`,
      );
    }
    seenShotIds.add(shotId);

    const sourceUrl = validatedDribbbleUrl(
      record.sourceUrl,
      `Shot ${shotId} sourceUrl`,
    );
    const sourcePathMatch = new URL(sourceUrl).pathname.match(/^\/shots\/(\d+)(?:-|\/|$)/u);
    if (sourcePathMatch?.[1] !== shotId) {
      throw new PipelineError(`Shot ${shotId} sourceUrl does not identify that shot`);
    }

    const titleValue =
      typeof record.title === "string" && record.title.trim() !== ""
        ? record.title
        : record.profileTitle;
    const title = normaliseText(titleValue, `Shot ${shotId} title`);
    const description = normaliseText(
      record.description ?? "",
      `Shot ${shotId} description`,
      { allowEmpty: true },
    );

    if (!Array.isArray(record.attachments)) {
      throw new PipelineError(`Shot ${shotId} attachments must be an array`);
    }
    const attachments = record.attachments.map((attachment, attachmentIndex) => {
      if (!isObject(attachment)) {
        throw new PipelineError(
          `Shot ${shotId} attachment ${attachmentIndex} is invalid`,
        );
      }
      const fileId = String(attachment.fileId ?? "");
      if (!/^\d+$/u.test(fileId) || seenFileIds.has(fileId)) {
        throw new PipelineError(
          `Shot ${shotId} has invalid or duplicate attachment fileId ${JSON.stringify(fileId)}`,
        );
      }
      seenFileIds.add(fileId);

      const originalFileName = normaliseText(
        attachment.fileName,
        `Attachment ${fileId} fileName`,
      );
      const declaredFormat = normaliseText(
        attachment.format ?? "",
        `Attachment ${fileId} format`,
        { allowEmpty: true },
      ).toLowerCase();
      const downloadUrl = validatedDribbbleUrl(
        attachment.downloadUrl ?? attachment.resolvedUrl,
        `Attachment ${fileId} downloadUrl`,
      );

      const id = outputId(shotId, fileId);
      const item = {
        ordinal,
        id,
        attachmentId: id,
        profileIndex,
        attachmentIndex,
        shotId,
        fileId,
        title,
        description,
        sourceUrl,
        originalFileName,
        declaredFormat,
        downloadUrl,
      };
      ordinal += 1;
      return item;
    });

    return {
      profileIndex,
      shotId,
      sourceUrl,
      title,
      description,
      attachments,
    };
  });

  const attachments = shots.flatMap((shot) => shot.attachments);
  if (shots.at(-1)?.shotId !== CUTOFF_SHOT_ID) {
    throw new PipelineError(`The selected inventory does not end at the cutoff shot`);
  }
  return {
    shots,
    attachments,
    sourceDigest: inventoryDigest(shots),
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

function assertDimensions(width, height, context) {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 1 ||
    height < 1
  ) {
    throw new PipelineError(`${context} has invalid dimensions ${width}×${height}`);
  }
}

function isFourKClass(width, height) {
  return (
    Math.max(width, height) >= MINIMUM_SOURCE_LONG_EDGE &&
    width * height >= MINIMUM_SOURCE_PIXELS
  );
}

function targetDimensions(width, height) {
  assertDimensions(width, height, "Source image");
  const sourceLongEdge = Math.max(width, height);
  if (sourceLongEdge <= OUTPUT_LONG_EDGE_CAP) return { width, height };

  const scale = OUTPUT_LONG_EDGE_CAP / sourceLongEdge;
  return width >= height
    ? {
        width: OUTPUT_LONG_EDGE_CAP,
        height: Math.max(1, Math.round(height * scale)),
      }
    : {
        width: Math.max(1, Math.round(width * scale)),
        height: OUTPUT_LONG_EDGE_CAP,
      };
}

function validateOutputGeometry(source, width, height, context) {
  assertDimensions(width, height, context);
  const expected = targetDimensions(source.width, source.height);
  if (width !== expected.width || height !== expected.height) {
    throw new PipelineError(
      `${context} must be ${expected.width}×${expected.height}; received ${width}×${height}`,
    );
  }
  if (width > source.width || height > source.height) {
    throw new PipelineError(`${context} enlarged its ${source.width}×${source.height} source`);
  }
  const sourceRatio = source.width / source.height;
  const outputRatio = width / height;
  const ratioError = Math.abs(outputRatio - sourceRatio) / sourceRatio;
  if (ratioError > ASPECT_RATIO_TOLERANCE) {
    throw new PipelineError(
      `${context} does not preserve the source aspect ratio (relative error ${ratioError})`,
    );
  }
}

function assertInside(root, path, label) {
  const absolute = resolve(path);
  const fromRoot = relative(root, absolute);
  if (
    fromRoot === "" ||
    fromRoot === ".." ||
    fromRoot.startsWith(`..${sep}`) ||
    isAbsolute(fromRoot)
  ) {
    throw new PipelineError(`${label} is outside its managed directory: ${path}`);
  }
  return absolute;
}

async function assertOutputRoot({ create }) {
  const publicDirectory = dirname(OUTPUT_DIR);
  const publicStat = await lstat(publicDirectory);
  if (!publicStat.isDirectory() || publicStat.isSymbolicLink()) {
    throw new PipelineError(`${publicDirectory} must be a real directory`);
  }

  const [repoReal, publicReal] = await Promise.all([
    realpath(REPO_ROOT),
    realpath(publicDirectory),
  ]);
  if (publicReal !== join(repoReal, "public")) {
    throw new PipelineError(`Refusing to manage assets through a linked public directory`);
  }

  if (create) await mkdir(OUTPUT_DIR, { recursive: true });

  let outputStat;
  try {
    outputStat = await lstat(OUTPUT_DIR);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new PipelineError(`${OUTPUT_DIR} does not exist; run the sync first`, {
        cause: error,
      });
    }
    throw error;
  }
  if (!outputStat.isDirectory() || outputStat.isSymbolicLink()) {
    throw new PipelineError(`${OUTPUT_DIR} must be a real directory`);
  }
  if ((await realpath(OUTPUT_DIR)) !== join(repoReal, "public", "posterjo")) {
    throw new PipelineError(`Refusing to manage Posterjo assets outside the repository`);
  }
}

async function removeManagedOutput(path) {
  await assertOutputRoot({ create: false });
  await rm(assertInside(OUTPUT_DIR, path, "Output path"), {
    recursive: true,
    force: true,
  });
}

function rawCachePath(attachment) {
  const urlKey = sha256(attachment.downloadUrl).slice(0, 16);
  return join(RAW_CACHE_DIR, `${attachment.id}-${urlKey}.source`);
}

async function readRawCache(attachment) {
  const path = rawCachePath(attachment);
  let fileStat;
  try {
    fileStat = await lstat(path);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new PipelineError(`${path} must be a regular cached source file`);
  }
  if (fileStat.size < 1 || fileStat.size > MAX_DOWNLOAD_BYTES) {
    throw new PipelineError(`${path} has an invalid cached byte length`);
  }
  return { buffer: await readFile(path), cachePath: path, fromCache: true };
}

async function writeRawCache(attachment, buffer) {
  await mkdir(RAW_CACHE_DIR, { recursive: true });
  const path = rawCachePath(attachment);
  const temporary = join(
    RAW_CACHE_DIR,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  assertInside(RAW_CACHE_DIR, temporary, "Raw cache temporary path");

  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(buffer);
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, path);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
  return path;
}

function retryDelay(attempt, key) {
  const spread =
    [...key].reduce((sum, character) => sum + character.codePointAt(0), 0) % 211;
  return RETRY_BASE_DELAY_MS * 2 ** attempt + spread;
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

function blockAllRequests(milliseconds) {
  if (milliseconds > 0) {
    requestsBlockedUntil = Math.max(requestsBlockedUntil, Date.now() + milliseconds);
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

async function responseBuffer(response, attachment) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_DOWNLOAD_BYTES) {
    throw new PipelineError(
      `${attachment.id} declares ${declaredLength} bytes, above the ${MAX_DOWNLOAD_BYTES}-byte limit`,
    );
  }
  if (!response.body) {
    throw new PipelineError(`${attachment.id} download has no response body`, {
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
        `${attachment.id} exceeded the ${MAX_DOWNLOAD_BYTES}-byte download limit`,
      );
    }
    chunks.push(buffer);
  }
  if (bytes === 0) {
    throw new PipelineError(`${attachment.id} returned an empty download`, {
      retryable: true,
    });
  }
  return Buffer.concat(chunks, bytes);
}

async function downloadOnce(attachment) {
  await waitForRequestSlot();
  const response = await fetch(attachment.downloadUrl, {
    headers: {
      Accept: "image/avif,image/webp,image/jpeg,image/png,image/*;q=0.9,*/*;q=0.2",
      "User-Agent": USER_AGENT,
    },
    credentials: "omit",
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
    blockAllRequests(retryAfterMs);
    throw new PipelineError(
      `Dribbble returned HTTP ${response.status} for ${attachment.id}`,
      { retryable, retryAfterMs },
    );
  }

  validatedDribbbleUrl(response.url, `${attachment.id} final download URL`);
  const contentType = (response.headers.get("content-type") ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    throw new PipelineError(
      `${attachment.id} returned ${contentType} instead of a downloadable file`,
    );
  }
  return responseBuffer(response, attachment);
}

async function sourceBytes(attachment) {
  const cached = await readRawCache(attachment);
  if (cached) return cached;

  const buffer = await downloadOnce(attachment);
  const cachePath = await writeRawCache(attachment, buffer);
  return { buffer, cachePath, fromCache: false };
}

async function runWithRetries(key, operation) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      const retryable = error instanceof PipelineError ? error.retryable : true;
      if (!retryable || attempt === MAX_RETRIES) break;
      const wait = Math.max(retryDelay(attempt, key), error.retryAfterMs ?? 0);
      blockAllRequests(error.retryAfterMs ?? 0);
      console.warn(
        `[${key}] attempt ${attempt + 1} failed; retrying in ${wait} ms: ${error.message}`,
      );
      await delay(wait);
    }
  }
  throw new PipelineError(
    `Unable to prepare ${key} after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`,
    { cause: lastError },
  );
}

function attachmentLooksLikeImage(attachment) {
  return (
    attachment.declaredFormat.startsWith("image/") ||
    IMAGE_EXTENSIONS.has(extname(attachment.originalFileName).toLowerCase())
  );
}

function isArchiveAttachment(attachment) {
  return (
    ARCHIVE_MEDIA_TYPES.has(attachment.declaredFormat) ||
    ARCHIVE_EXTENSIONS.has(extname(attachment.originalFileName).toLowerCase())
  );
}

function archiveFailure(attachment, action, error) {
  if (error.code === "ENOENT") {
    return new PipelineError(
      `${attachment.id} is a ZIP/7z archive, but bsdtar is unavailable. Install libarchive/bsdtar with ZIP and 7z support, then rerun the sync.`,
      { cause: error },
    );
  }
  const detail = String(error.stderr ?? error.message ?? "unknown archive error")
    .trim()
    .slice(0, 800);
  return new PipelineError(
    `Unable to ${action} ${attachment.id} with bsdtar. The archive may be corrupt, encrypted, or use an unsupported 7z method: ${detail}`,
    { cause: error },
  );
}

function validateArchiveMemberPath(memberPath, attachment) {
  if (
    memberPath === "" ||
    memberPath.length > 1_024 ||
    memberPath.includes("\0") ||
    memberPath.startsWith("/") ||
    memberPath.startsWith("\\") ||
    /^[a-z]:[\\/]/iu.test(memberPath) ||
    memberPath.split(/[\\/]/u).includes("..")
  ) {
    throw new PipelineError(
      `${attachment.id} contains an unsafe archive member path ${JSON.stringify(memberPath)}`,
    );
  }
}

async function listArchiveMembers(cachePath, attachment) {
  let stdout;
  try {
    ({ stdout } = await execFileAsync("bsdtar", ["-tf", cachePath], {
      encoding: "utf8",
      maxBuffer: MAX_ARCHIVE_LIST_BYTES,
      timeout: FETCH_TIMEOUT_MS,
    }));
  } catch (error) {
    throw archiveFailure(attachment, "list", error);
  }

  const listed = stdout.split(/\r?\n/u).filter((memberPath) => memberPath !== "");
  if (listed.length > MAX_ARCHIVE_MEMBERS) {
    throw new PipelineError(
      `${attachment.id} contains ${listed.length} archive members, above the ${MAX_ARCHIVE_MEMBERS}-member safety limit`,
    );
  }

  const seen = new Set();
  const files = [];
  for (const memberPath of listed) {
    validateArchiveMemberPath(memberPath, attachment);
    if (seen.has(memberPath)) {
      throw new PipelineError(
        `${attachment.id} contains duplicate archive member ${JSON.stringify(memberPath)}`,
      );
    }
    seen.add(memberPath);
    if (memberPath === "." || memberPath.endsWith("/")) continue;
    files.push(memberPath);
  }
  if (files.length === 0) {
    throw new PipelineError(`${attachment.id} archive contains no files`);
  }
  return files;
}

async function extractArchiveMember(cachePath, memberPath, attachment) {
  try {
    const { stdout } = await execFileAsync(
      "bsdtar",
      ["-xOf", cachePath, "--", memberPath],
      {
        encoding: null,
        maxBuffer: MAX_DOWNLOAD_BYTES,
        timeout: FETCH_TIMEOUT_MS,
      },
    );
    return Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout);
  } catch (error) {
    throw archiveFailure(
      attachment,
      `extract member ${JSON.stringify(memberPath)} from`,
      error,
    );
  }
}

function archiveMemberAttachment(attachment, archiveInput, memberPath, memberIndex) {
  const memberHash = sha256(memberPath).slice(0, 12);
  return {
    ...attachment,
    id: `${attachment.id}-${memberHash}`,
    originalFileName: memberPath,
    declaredFormat: "",
    archive: {
      originalFileName: attachment.originalFileName,
      declaredFormat: attachment.declaredFormat,
      bytes: archiveInput.bytes,
      sha256: archiveInput.sha256,
      memberPath,
      memberIndex,
      memberHash,
    },
  };
}

async function inspectSource(buffer, attachment) {
  const baseDetails = {
    declaredFormat: attachment.declaredFormat,
    bytes: buffer.length,
    sha256: sha256(buffer),
  };

  let metadata;
  try {
    metadata = await sharp(buffer, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_SOURCE_PIXELS,
    }).metadata();
  } catch (error) {
    if (!attachmentLooksLikeImage(attachment)) {
      return {
        accepted: false,
        reason: "not-raster",
        input: { ...baseDetails, format: null, width: null, height: null },
      };
    }
    throw new PipelineError(
      `${attachment.id} is labelled as an image but cannot be decoded: ${error.message}`,
      { cause: error, retryable: true },
    );
  }

  const dimensions = dimensionsAfterOrientation(metadata);
  const input = {
    ...baseDetails,
    format: metadata.format ?? null,
    width: dimensions.width ?? null,
    height: dimensions.height ?? null,
  };
  if (!metadata.format || !RASTER_FORMATS.has(metadata.format)) {
    return { accepted: false, reason: "not-raster", input };
  }
  if ((metadata.pages ?? 1) !== 1) {
    return { accepted: false, reason: "animated-or-multipage", input };
  }

  assertDimensions(dimensions.width, dimensions.height, `${attachment.id} source`);
  await sharp(buffer, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_SOURCE_PIXELS,
  }).stats();

  if (!isFourKClass(dimensions.width, dimensions.height)) {
    return { accepted: false, reason: "below-4k", input };
  }
  return { accepted: true, input };
}

async function inspectWebp(path, source, expected = null) {
  const fileStat = await lstat(path);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
    throw new PipelineError(`${path} must be a regular WebP file`);
  }

  const metadata = await sharp(path, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_OUTPUT_PIXELS,
  }).metadata();
  if (metadata.format !== "webp" || (metadata.pages ?? 1) !== 1) {
    throw new PipelineError(`${path} must be a single-frame WebP`);
  }
  validateOutputGeometry(source, metadata.width, metadata.height, path);
  await sharp(path, {
    animated: false,
    failOn: "error",
    limitInputPixels: MAX_OUTPUT_PIXELS,
  }).stats();

  const details = {
    width: metadata.width,
    height: metadata.height,
    bytes: fileStat.size,
    sha256: await sha256File(path),
  };
  if (expected) {
    for (const property of ["width", "height", "bytes", "sha256"]) {
      if (details[property] !== expected[property]) {
        throw new PipelineError(
          `${basename(path)} ${property} mismatch: manifest=${expected[property]}, actual=${details[property]}`,
        );
      }
    }
  }
  return details;
}

function sourceManifest(attachment, input) {
  return {
    page: attachment.sourceUrl,
    download: attachment.downloadUrl,
    originalFileName: attachment.originalFileName,
    declaredFormat: attachment.declaredFormat,
    format: input.format,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    sha256: input.sha256,
    ...(attachment.archive ? { archive: attachment.archive } : {}),
  };
}

function fileManifestEntry(attachment, input, output) {
  return {
    ordinal: attachment.ordinal,
    id: attachment.id,
    attachmentId: attachment.attachmentId,
    shotId: attachment.shotId,
    fileId: attachment.fileId,
    file: outputFileName(attachment),
    title: attachment.title,
    description: attachment.description,
    width: output.width,
    height: output.height,
    bytes: output.bytes,
    sha256: output.sha256,
    source: sourceManifest(attachment, input),
  };
}

function excludedManifestEntry(attachment, inspection) {
  return {
    ordinal: attachment.ordinal,
    id: attachment.id,
    attachmentId: attachment.attachmentId,
    shotId: attachment.shotId,
    fileId: attachment.fileId,
    title: attachment.title,
    description: attachment.description,
    reason: inspection.reason,
    source: sourceManifest(attachment, inspection.input),
  };
}

async function reusableFile(attachment, input, previousEntry) {
  if (
    !previousEntry ||
    previousEntry.source?.sha256 !== input.sha256 ||
    previousEntry.source?.width !== input.width ||
    previousEntry.source?.height !== input.height
  ) {
    return null;
  }
  const path = join(OUTPUT_DIR, outputFileName(attachment));
  try {
    const output = await inspectWebp(path, input, previousEntry);
    return fileManifestEntry(attachment, input, output);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.warn(`[${attachment.id}] rebuilding local output: ${error.message}`);
    }
    return null;
  }
}

async function publishPart(partPath, finalPath) {
  await assertOutputRoot({ create: false });
  try {
    await rename(partPath, finalPath);
  } catch (error) {
    if (!["EEXIST", "EISDIR", "ENOTEMPTY", "EPERM"].includes(error.code)) {
      throw error;
    }
    await removeManagedOutput(finalPath);
    await assertOutputRoot({ create: false });
    await rename(partPath, finalPath);
  }
}

async function convertAttachment(attachment, input, previousEntry, stableVersion) {
  const reusable = await reusableFile(attachment, input, previousEntry);
  if (reusable) return reusable;

  const finalPath = join(OUTPUT_DIR, outputFileName(attachment));
  const partPath = join(
    OUTPUT_DIR,
    `.${attachment.id}.${process.pid}.${randomUUID()}.part.webp`,
  );
  assertInside(OUTPUT_DIR, partPath, "Output temporary path");

  try {
    let pipeline = sharp(input.buffer, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_SOURCE_PIXELS,
    }).rotate();
    if (Math.max(input.width, input.height) > OUTPUT_LONG_EDGE_CAP) {
      pipeline =
        input.width >= input.height
          ? pipeline.resize({
              width: OUTPUT_LONG_EDGE_CAP,
              kernel: sharp.kernel.lanczos3,
              withoutEnlargement: true,
            })
          : pipeline.resize({
              height: OUTPUT_LONG_EDGE_CAP,
              kernel: sharp.kernel.lanczos3,
              withoutEnlargement: true,
            });
    }
    await pipeline.webp(WEBP_OPTIONS).toFile(partPath);

    const output = await inspectWebp(partPath, input);
    if (
      stableVersion &&
      previousEntry?.sha256 &&
      previousEntry.sha256 !== output.sha256
    ) {
      throw new PipelineError(
        `${attachment.id} output bytes changed under ${ARCHIVE_VERSION}; bump ARCHIVE_VERSION before publishing`,
      );
    }
    await publishPart(partPath, finalPath);
    return fileManifestEntry(attachment, input, output);
  } finally {
    await removeManagedOutput(partPath).catch(() => {});
  }
}

async function prepareDecodedCandidate(
  candidate,
  buffer,
  previousEntry,
  stableVersion,
) {
  const inspection = await inspectSource(buffer, candidate);
  if (!inspection.accepted) {
    return { kind: "excluded", entry: excludedManifestEntry(candidate, inspection) };
  }
  const input = { ...inspection.input, buffer };
  const entry = await convertAttachment(
    candidate,
    input,
    previousEntry,
    stableVersion,
  );
  return { kind: "file", entry };
}

async function prepareAttachment(attachment, previousEntries, stableVersion) {
  return runWithRetries(attachment.id, async () => {
    const loaded = await sourceBytes(attachment);
    if (!isArchiveAttachment(attachment)) {
      try {
        return [
          await prepareDecodedCandidate(
            attachment,
            loaded.buffer,
            previousEntries.get(attachment.id),
            stableVersion,
          ),
        ];
      } catch (error) {
        if (loaded.fromCache || error.retryable) {
          await rm(loaded.cachePath, { force: true }).catch(() => {});
        }
        throw error;
      }
    }

    const archiveInput = {
      bytes: loaded.buffer.length,
      sha256: sha256(loaded.buffer),
    };
    const memberPaths = await listArchiveMembers(loaded.cachePath, attachment);
    const results = [];
    const memberIds = new Set();
    let expandedBytes = 0;
    for (let memberIndex = 0; memberIndex < memberPaths.length; memberIndex += 1) {
      const memberPath = memberPaths[memberIndex];
      const candidate = archiveMemberAttachment(
        attachment,
        archiveInput,
        memberPath,
        memberIndex,
      );
      if (memberIds.has(candidate.id)) {
        throw new PipelineError(
          `${attachment.id} has a member-hash collision at ${JSON.stringify(memberPath)}`,
        );
      }
      memberIds.add(candidate.id);

      const memberBuffer = await extractArchiveMember(
        loaded.cachePath,
        memberPath,
        attachment,
      );
      expandedBytes += memberBuffer.length;
      if (expandedBytes > MAX_ARCHIVE_EXPANDED_BYTES) {
        throw new PipelineError(
          `${attachment.id} expanded beyond the ${MAX_ARCHIVE_EXPANDED_BYTES}-byte archive safety limit`,
        );
      }
      try {
        results.push(
          await prepareDecodedCandidate(
            candidate,
            memberBuffer,
            previousEntries.get(candidate.id),
            stableVersion,
          ),
        );
      } catch (error) {
        throw new PipelineError(
          `${attachment.id} member ${JSON.stringify(memberPath)} failed validation: ${error.message}`,
          { cause: error },
        );
      }
    }
    return results;
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
      if (index >= items.length) return;
      try {
        results[index] = await operation(items[index], index);
      } catch (error) {
        failure ??= error;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length || 1) }, () => worker()),
  );
  if (failure) throw failure;
  return results;
}

function currentEncoder() {
  return {
    name: "sharp",
    format: "webp",
    quality: WEBP_OPTIONS.quality,
    sharp: sharp.versions.sharp,
    libvips: sharp.versions.vips,
    webp: sharp.versions.webp,
  };
}

function buildManifest(inventory, results) {
  const files = results
    .filter((result) => result.kind === "file")
    .map((result) => result.entry);
  const excluded = results
    .filter((result) => result.kind === "excluded")
    .map((result) => result.entry);
  if (files.length === 0) {
    throw new PipelineError(`No decoded 4K-class raster attachments were accepted`);
  }

  return {
    version: ARCHIVE_VERSION,
    archiveVersion: ARCHIVE_VERSION,
    cutoff: {
      shotId: CUTOFF_SHOT_ID,
      title: CUTOFF_TITLE,
      inclusive: true,
    },
    shotCount: inventory.shots.length,
    attachmentCount: inventory.attachments.length,
    candidateCount: results.length,
    count: files.length,
    excludedCount: excluded.length,
    format: "webp",
    resolution: RESOLUTION_POLICY,
    sourceDigest: inventory.sourceDigest,
    encoder: currentEncoder(),
    files,
    excluded,
  };
}

function generatedDataSource(manifest) {
  const records = manifest.files.map((entry) => ({
    id: entry.id,
    shotId: entry.shotId,
    fileId: entry.fileId,
    title: entry.title,
    description: entry.description,
    file: `posterjo/${entry.file}`,
    width: entry.width,
    height: entry.height,
    sourceUrl: entry.source.page,
    originalFileName: entry.source.originalFileName,
  }));

  return `/**
 * Generated by scripts/sync-posterjo-artworks.mjs.
 * Includes Dribbble attachments through shot ${CUTOFF_SHOT_ID}, inclusively.
 * Do not edit by hand.
 */
export type PosterjoArtworkRecord = {
  readonly id: string;
  readonly shotId: string;
  readonly fileId: string;
  readonly title: string;
  readonly description: string;
  readonly file: string;
  readonly width: number;
  readonly height: number;
  readonly sourceUrl: string;
  readonly originalFileName: string;
};

export const POSTERJO_ARCHIVE_VERSION = ${JSON.stringify(ARCHIVE_VERSION)};

export const POSTERJO_ARTWORKS = ${JSON.stringify(records, null, 2)} as const satisfies readonly PosterjoArtworkRecord[];
`;
}

async function atomicWriteText(path, contents) {
  const parent = dirname(path);
  const temporary = join(
    parent,
    `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  try {
    await mkdir(parent, { recursive: true });
    handle = await open(temporary, "wx", 0o644);
    await handle.writeFile(contents, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(temporary, path);
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function readManifest() {
  try {
    const fileStat = await lstat(MANIFEST_PATH);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) {
      throw new PipelineError(`${MANIFEST_PATH} must be a regular JSON file`);
    }
    return JSON.parse(await readFile(MANIFEST_PATH, "utf8"));
  } catch (error) {
    throw new PipelineError(`Unable to read valid ${MANIFEST_PATH}: ${error.message}`, {
      cause: error,
    });
  }
}

async function readPreviousManifest() {
  try {
    return await readManifest();
  } catch (error) {
    if (error.cause?.code === "ENOENT") return null;
    throw error;
  }
}

function assertPreviousVersion(previous, inventory) {
  if (previous?.archiveVersion !== ARCHIVE_VERSION) return false;
  if (previous.sourceDigest !== inventory.sourceDigest) {
    throw new PipelineError(
      `Inventory content changed under ${ARCHIVE_VERSION}; bump ARCHIVE_VERSION before publishing`,
    );
  }
  return true;
}

function expectedAttachmentFields(attachment) {
  return {
    ordinal: attachment.ordinal,
    attachmentId: attachment.id,
    shotId: attachment.shotId,
    fileId: attachment.fileId,
    title: attachment.title,
    description: attachment.description,
  };
}

function assertExpectedFields(entry, attachment, context) {
  for (const [property, expected] of Object.entries(
    expectedAttachmentFields(attachment),
  )) {
    if (entry[property] !== expected) {
      throw new PipelineError(
        `${context} ${property} mismatch for ${attachment.id}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(entry[property])}`,
      );
    }
  }
  if (!isObject(entry.source)) {
    throw new PipelineError(`${context} source is missing for ${attachment.id}`);
  }
  const expectedSource = {
    page: attachment.sourceUrl,
    download: attachment.downloadUrl,
  };
  for (const [property, expected] of Object.entries(expectedSource)) {
    if (entry.source[property] !== expected) {
      throw new PipelineError(
        `${context} source.${property} mismatch for ${attachment.id}`,
      );
    }
  }
  if (entry.source.archive) {
    const archive = entry.source.archive;
    const expectedArchive = {
      originalFileName: attachment.originalFileName,
      declaredFormat: attachment.declaredFormat,
    };
    for (const [property, expected] of Object.entries(expectedArchive)) {
      if (archive[property] !== expected) {
        throw new PipelineError(
          `${context} source.archive.${property} mismatch for ${attachment.id}`,
        );
      }
    }
    if (
      !Number.isSafeInteger(archive.memberIndex) ||
      archive.memberIndex < 0 ||
      typeof archive.memberPath !== "string" ||
      archive.memberPath === "" ||
      archive.memberPath !== entry.source.originalFileName ||
      archive.memberHash !== sha256(archive.memberPath).slice(0, 12) ||
      entry.id !== `${attachment.id}-${archive.memberHash}` ||
      !Number.isSafeInteger(archive.bytes) ||
      archive.bytes < 1 ||
      !/^[a-f0-9]{64}$/u.test(archive.sha256 ?? "")
    ) {
      throw new PipelineError(`${context} archive member metadata is invalid for ${entry.id}`);
    }
  } else if (
    entry.id !== attachment.id ||
    entry.source.originalFileName !== attachment.originalFileName ||
    entry.source.declaredFormat !== attachment.declaredFormat
  ) {
    throw new PipelineError(`${context} direct-source metadata mismatch for ${attachment.id}`);
  }
  if (!Number.isSafeInteger(entry.source.bytes) || entry.source.bytes < 0) {
    throw new PipelineError(`${context} source byte count is invalid for ${attachment.id}`);
  }
  if (!/^[a-f0-9]{64}$/u.test(entry.source.sha256 ?? "")) {
    throw new PipelineError(`${context} source SHA-256 is invalid for ${attachment.id}`);
  }
}

function assertManifestCandidate(entry, attachment, isFile) {
  const context = isFile ? "Manifest file" : "Manifest exclusion";
  assertExpectedFields(entry, attachment, context);

  if (isFile) {
    const expectedFile = `${entry.id}.webp`;
    if (
      entry.file !== expectedFile ||
      !/^posterjo-\d+-\d+(?:-[a-f0-9]{12})?\.webp$/u.test(entry.file)
    ) {
      throw new PipelineError(`${entry.id} has an invalid output filename`);
    }
    if (!RASTER_FORMATS.has(entry.source.format)) {
      throw new PipelineError(`${entry.id} source is not an accepted raster format`);
    }
    assertDimensions(entry.source.width, entry.source.height, `${entry.id} manifest source`);
    if (!isFourKClass(entry.source.width, entry.source.height)) {
      throw new PipelineError(`${entry.id} manifest source is below 4K class`);
    }
    validateOutputGeometry(
      entry.source,
      entry.width,
      entry.height,
      `${entry.id} manifest output`,
    );
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1) {
      throw new PipelineError(`${entry.id} output byte count is invalid`);
    }
    if (!/^[a-f0-9]{64}$/u.test(entry.sha256 ?? "")) {
      throw new PipelineError(`${entry.id} output SHA-256 is invalid`);
    }
    return;
  }

  if (
    !["animated-or-multipage", "below-4k", "not-raster"].includes(entry.reason)
  ) {
    throw new PipelineError(`${entry.id} has an invalid exclusion reason`);
  }
  if (entry.reason === "below-4k") {
    assertDimensions(
      entry.source.width,
      entry.source.height,
      `${entry.id} excluded source`,
    );
    if (isFourKClass(entry.source.width, entry.source.height)) {
      throw new PipelineError(`${entry.id} is incorrectly excluded as below-4k`);
    }
  }
}

function compareManifestOrder(previous, entry) {
  const memberIndex = entry.source?.archive?.memberIndex ?? -1;
  if (
    entry.ordinal < previous.ordinal ||
    (entry.ordinal === previous.ordinal && memberIndex <= previous.memberIndex)
  ) {
    throw new PipelineError(`manifest.json candidate entries are out of inventory order`);
  }
  return { ordinal: entry.ordinal, memberIndex };
}

function assertManifest(manifest, inventory) {
  if (!isObject(manifest)) throw new PipelineError(`manifest.json must be an object`);
  const header = {
    version: ARCHIVE_VERSION,
    archiveVersion: ARCHIVE_VERSION,
    shotCount: inventory.shots.length,
    attachmentCount: inventory.attachments.length,
    format: "webp",
    sourceDigest: inventory.sourceDigest,
  };
  for (const [property, expected] of Object.entries(header)) {
    if (manifest[property] !== expected) {
      throw new PipelineError(
        `manifest.json ${property} mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(manifest[property])}`,
      );
    }
  }
  const expectedCutoff = {
    shotId: CUTOFF_SHOT_ID,
    title: CUTOFF_TITLE,
    inclusive: true,
  };
  if (JSON.stringify(manifest.cutoff) !== JSON.stringify(expectedCutoff)) {
    throw new PipelineError(`manifest.json cutoff metadata mismatch`);
  }
  if (JSON.stringify(manifest.resolution) !== JSON.stringify(RESOLUTION_POLICY)) {
    throw new PipelineError(`manifest.json resolution policy mismatch`);
  }
  if (JSON.stringify(manifest.encoder) !== JSON.stringify(currentEncoder())) {
    throw new PipelineError(`manifest.json encoder metadata mismatch`);
  }
  if (!Array.isArray(manifest.files) || !Array.isArray(manifest.excluded)) {
    throw new PipelineError(`manifest.json files and excluded must be arrays`);
  }
  if (
    manifest.count !== manifest.files.length ||
    manifest.excludedCount !== manifest.excluded.length ||
    !Number.isSafeInteger(manifest.candidateCount) ||
    manifest.candidateCount < inventory.attachments.length ||
    manifest.count + manifest.excludedCount !== manifest.candidateCount
  ) {
    throw new PipelineError(`manifest.json attachment counts are inconsistent`);
  }

  const includedById = new Map();
  const excludedById = new Map();
  let previousIncluded = { ordinal: -1, memberIndex: -1 };
  let previousExcluded = { ordinal: -1, memberIndex: -1 };
  for (const entry of manifest.files) {
    if (!isObject(entry) || includedById.has(entry.id)) {
      throw new PipelineError(`manifest.json has an invalid or duplicate file entry`);
    }
    previousIncluded = compareManifestOrder(previousIncluded, entry);
    includedById.set(entry.id, entry);
  }
  for (const entry of manifest.excluded) {
    if (!isObject(entry) || excludedById.has(entry.id) || includedById.has(entry.id)) {
      throw new PipelineError(`manifest.json has an invalid or duplicate excluded entry`);
    }
    previousExcluded = compareManifestOrder(previousExcluded, entry);
    excludedById.set(entry.id, entry);
  }

  const attachmentsById = new Map(
    inventory.attachments.map((attachment) => [attachment.id, attachment]),
  );
  const candidatesByAttachment = new Map();
  for (const [id, entry] of [...includedById, ...excludedById]) {
    const attachment = attachmentsById.get(entry.attachmentId);
    if (!attachment) {
      throw new PipelineError(`${id} refers to an unknown inventory attachment`);
    }
    const group = candidatesByAttachment.get(attachment.id) ?? [];
    group.push({ entry, isFile: includedById.has(id) });
    candidatesByAttachment.set(attachment.id, group);
  }

  for (const attachment of inventory.attachments) {
    const candidates = candidatesByAttachment.get(attachment.id) ?? [];
    if (candidates.length === 0) {
      throw new PipelineError(
        `${attachment.id} is not represented by any manifest candidate`,
      );
    }
    if (isArchiveAttachment(attachment)) {
      const memberIndexes = new Set();
      for (const candidate of candidates) {
        const memberIndex = candidate.entry.source?.archive?.memberIndex;
        if (!Number.isSafeInteger(memberIndex) || memberIndexes.has(memberIndex)) {
          throw new PipelineError(
            `${attachment.id} has missing or duplicate archive member indexes`,
          );
        }
        memberIndexes.add(memberIndex);
      }
      for (let index = 0; index < candidates.length; index += 1) {
        if (!memberIndexes.has(index)) {
          throw new PipelineError(`${attachment.id} archive member indexes are not contiguous`);
        }
      }
    } else {
      if (candidates.length !== 1 || candidates[0].entry.source?.archive) {
        throw new PipelineError(
          `${attachment.id} direct attachment must have exactly one manifest candidate`,
        );
      }
    }
    for (const candidate of candidates) {
      assertManifestCandidate(candidate.entry, attachment, candidate.isFile);
    }
  }
}

function assertStableOutput(previous, next) {
  if (previous?.archiveVersion !== ARCHIVE_VERSION) return;
  const previousHashes = new Map(
    (previous.files ?? []).map((entry) => [entry.id, entry.sha256]),
  );
  const changed = next.files.filter(
    (entry) => previousHashes.get(entry.id) !== entry.sha256,
  );
  if (changed.length > 0 || previousHashes.size !== next.files.length) {
    throw new PipelineError(
      `Posterjo output bytes changed under ${ARCHIVE_VERSION}; bump ARCHIVE_VERSION before publishing`,
    );
  }
}

async function verify(inventory, { quiet = false, exactSet = true } = {}) {
  await assertOutputRoot({ create: false });
  const manifest = await readManifest();
  assertManifest(manifest, inventory);

  const expectedNames = new Set([
    "manifest.json",
    ...manifest.files.map((entry) => entry.file),
  ]);
  const directoryEntries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  const actualNames = new Set(directoryEntries.map((entry) => entry.name));
  const missing = [...expectedNames].filter((name) => !actualNames.has(name));
  const unexpected = [...actualNames].filter((name) => !expectedNames.has(name));
  if (missing.length > 0 || (exactSet && unexpected.length > 0)) {
    throw new PipelineError(
      `Posterjo file set mismatch; missing=${JSON.stringify(missing)}, unexpected=${JSON.stringify(unexpected)}`,
    );
  }

  await mapWithConcurrency(
    manifest.files,
    Math.min(CONCURRENCY, 4),
    async (entry, index) => {
      await inspectWebp(join(OUTPUT_DIR, entry.file), entry.source, entry);
      if (!quiet && ((index + 1) % 25 === 0 || index + 1 === manifest.files.length)) {
        console.log(`Verified ${index + 1}/${manifest.files.length}`);
      }
    },
  );

  let generated;
  try {
    const dataStat = await lstat(DATA_PATH);
    if (!dataStat.isFile() || dataStat.isSymbolicLink()) {
      throw new PipelineError(`${DATA_PATH} must be a regular generated TypeScript file`);
    }
    generated = await readFile(DATA_PATH, "utf8");
  } catch (error) {
    throw new PipelineError(`Unable to read ${DATA_PATH}: ${error.message}`, {
      cause: error,
    });
  }
  const expectedGenerated = generatedDataSource(manifest);
  if (generated !== expectedGenerated) {
    throw new PipelineError(
      `${DATA_PATH} does not exactly match manifest.json; run the Posterjo sync`,
    );
  }

  if (!quiet) {
    console.log(
      `Verified ${manifest.files.length} Posterjo WebPs, hashes, dimensions, exact file set, and generated-data parity.`,
    );
  }
}

async function pruneUnexpectedEntries(expectedNames) {
  const entries = await readdir(OUTPUT_DIR, { withFileTypes: true });
  for (const entry of entries) {
    if (!expectedNames.has(entry.name)) {
      await removeManagedOutput(join(OUTPUT_DIR, entry.name));
    }
  }
}

async function sync(inventory) {
  await assertOutputRoot({ create: true });
  const previous = await readPreviousManifest();
  const stableVersion = assertPreviousVersion(previous, inventory);
  const previousEntries = new Map(
    (stableVersion ? previous?.files ?? [] : []).map((entry) => [entry.id, entry]),
  );

  console.log(
    `Syncing ${inventory.attachments.length} Posterjo attachments through shot ${CUTOFF_SHOT_ID} (inclusive), concurrency=${CONCURRENCY}, retries=${MAX_RETRIES}`,
  );
  let completed = 0;
  const resultGroups = await mapWithConcurrency(
    inventory.attachments,
    CONCURRENCY,
    async (attachment) => {
      const attachmentResults = await prepareAttachment(
        attachment,
        previousEntries,
        stableVersion,
      );
      completed += 1;
      const ready = attachmentResults.filter((result) => result.kind === "file").length;
      const skipped = attachmentResults.length - ready;
      console.log(
        `Prepared ${completed}/${inventory.attachments.length}: ${attachment.id} (${ready} ready, ${skipped} excluded)`,
      );
      return attachmentResults;
    },
  );
  const results = resultGroups.flat();

  const manifest = buildManifest(inventory, results);
  assertStableOutput(previous, manifest);
  await atomicWriteText(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  await atomicWriteText(DATA_PATH, generatedDataSource(manifest));

  await verify(inventory, { quiet: true, exactSet: false });
  const expectedNames = new Set([
    "manifest.json",
    ...manifest.files.map((entry) => entry.file),
  ]);
  await pruneUnexpectedEntries(expectedNames);
  await verify(inventory, { quiet: true, exactSet: true });
  console.log(
    `Published and verified ${manifest.files.length} Posterjo WebPs; excluded ${manifest.excluded.length} non-qualifying attachments.`,
  );
}

function printHelp() {
  console.log(`Usage:
  node scripts/sync-posterjo-artworks.mjs           Import, convert, and publish qualifying attachments
  node scripts/sync-posterjo-artworks.mjs --verify  Verify outputs without network access

Inventory:
  ${INVENTORY_PATH}
  Records are consumed in profile order through shot ${CUTOFF_SHOT_ID}, inclusively.

Optional bounded environment settings:
  POSTERJO_CONCURRENCY=1..4  (default ${DEFAULT_CONCURRENCY})
  POSTERJO_RETRIES=0..5      (default ${DEFAULT_RETRIES})`);
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

  const inventory = await loadInventory();
  if (arguments_[0] === "--verify") {
    await verify(inventory);
  } else {
    await sync(inventory);
  }
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
