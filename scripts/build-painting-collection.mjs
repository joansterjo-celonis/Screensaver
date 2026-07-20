#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, "..");
const DATA_FILE = join(REPO_ROOT, "app", "data", "paintings.generated.ts");
const INVENTORY_FILE = join(REPO_ROOT, "scripts", "data", "painting-inventory.json");
const OVERRIDES_FILE = join(REPO_ROOT, "scripts", "data", "painting-overrides.json");

const PRESERVED_RECORDS = 300;
const DEFAULT_TARGET_RECORDS = 2_048;
const DEFAULT_CANDIDATE_LIMIT = 20_000;
const MIN_ADDED_SHORT_EDGE = 2_160;
const MIN_ADDED_PIXELS = 6_000_000;
const MAX_WORKS_PER_ARTIST = 8;
const API_BATCH_SIZE = 50;
const API_CONCURRENCY = 2;
const WIKIDATA_ENTITY_MAX_LAG = 10;
const REQUEST_SPACING_MS = 180;
const FETCH_TIMEOUT_MS = 90_000;
const MAX_RETRIES = 4;
const USER_AGENT =
  "ScreensaverCollectionBuilder/1.0 (https://github.com/joansterjo-celonis/Screensaver)";
const PUBLIC_DOMAIN_PATTERN = /(?:public[ -]domain|\bcc0\b)/iu;
const SUPPORTED_RASTER_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

class CatalogError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "CatalogError";
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs ?? 0;
  }
}

let nextRequestAt = 0;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function parseRetryAfter(value) {
  if (!value) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}

async function waitForRequestSlot() {
  const wait = nextRequestAt - Date.now();
  if (wait > 0) await delay(wait);
  nextRequestAt = Date.now() + REQUEST_SPACING_MS;
}

async function requestJson(url, { body, context }) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    await waitForRequestSlot();
    try {
      const response = await fetch(url, {
        method: body ? "POST" : "GET",
        body,
        headers: {
          Accept: "application/json",
          ...(body
            ? { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" }
            : {}),
          "User-Agent": USER_AGENT,
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        const retryable =
          response.status === 408 || response.status === 429 || response.status >= 500;
        throw new CatalogError(
          `${context} returned HTTP ${response.status}`,
          {
            retryable,
            retryAfterMs: parseRetryAfter(response.headers.get("retry-after")),
          },
        );
      }
      const data = await response.json();
      if (data?.error) {
        const code = String(data.error.code ?? "unknown");
        const retryable =
          code === "internal_api_error" ||
          code.startsWith("internal_api_error_") ||
          ["maxlag", "ratelimited", "readonly"].includes(code);
        throw new CatalogError(
          `${context} returned API error ${code}: ${data.error.info ?? "unknown error"}`,
          {
            retryable,
            retryAfterMs: Math.max(
              parseRetryAfter(response.headers.get("retry-after")),
              code === "maxlag" ? 5_000 : 0,
            ),
          },
        );
      }
      return data;
    } catch (error) {
      lastError = error;
      const retryable = error instanceof CatalogError ? error.retryable : true;
      if (!retryable || attempt === MAX_RETRIES) break;
      const backoff = Math.max(
        error.retryAfterMs ?? 0,
        750 * 2 ** attempt + Math.floor(Math.random() * 250),
      );
      console.warn(
        `${context} attempt ${attempt + 1} failed; retrying in ${backoff}ms: ${error.message}`,
      );
      await delay(backoff);
    }
  }
  throw new CatalogError(`${context} failed: ${lastError?.message}`, {
    cause: lastError,
  });
}

function normaliseKey(value) {
  return value.replaceAll("_", " ").trim().toLocaleLowerCase("en-US");
}

function normaliseFileTitle(value) {
  return normaliseKey(value.replace(/^File:/iu, ""));
}

function cleanMetadataText(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/gu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#0?39;|&apos;/giu, "'")
    .replace(/\s+/gu, " ")
    .trim();
}

function canonicalUrl(value, fallback) {
  const cleaned = cleanMetadataText(value);
  if (!cleaned) return fallback;
  try {
    const url = new URL(cleaned, "https://commons.wikimedia.org");
    if (url.protocol === "http:") url.protocol = "https:";
    return url.href;
  } catch {
    return fallback;
  }
}

function commonsDescriptionUrl(fileName) {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(fileName.replaceAll(" ", "_"))}`;
}

function readPaintingRows(source) {
  const startMarker = "const PAINTING_ROWS = [";
  const endMarker = "] as const satisfies readonly PaintingTuple[];";
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    throw new CatalogError(`Could not locate PAINTING_ROWS in ${basename(DATA_FILE)}`);
  }
  const rowsSource = source
    .slice(start + startMarker.length, end)
    .replace(/,\s*$/u, "");
  let rows;
  try {
    rows = JSON.parse(`[${rowsSource}]`);
  } catch (error) {
    throw new CatalogError(`Could not parse ${basename(DATA_FILE)}: ${error.message}`, {
      cause: error,
    });
  }
  return rows.map((row, index) => {
    if (!Array.isArray(row) || ![8, 9, 10].includes(row.length)) {
      throw new CatalogError(`Painting row ${index + 1} must have 8, 9, or 10 fields`);
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
      licenseUrl = commonsDescriptionUrl(fallbackFile),
      localFallback = index < PRESERVED_RECORDS,
    ] = row;
    return {
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
    };
  });
}

function assertUnique(records, property, label, normalise = (value) => value) {
  const seen = new Map();
  for (const record of records) {
    const key = normalise(record[property]);
    if (seen.has(key)) {
      throw new CatalogError(
        `Duplicate ${label}: ${JSON.stringify(record[property])} (${seen.get(key)} and ${record.qid})`,
      );
    }
    seen.set(key, record.qid);
  }
}

function assertCatalog(records, expectedCount) {
  if (records.length !== expectedCount) {
    throw new CatalogError(
      `Expected ${expectedCount} records, generated ${records.length}`,
    );
  }
  for (const [index, record] of records.entries()) {
    const textFields = [
      "qid",
      "articleTitle",
      "title",
      "artist",
      "year",
      "fallbackFile",
      "licenseUrl",
    ];
    for (const property of textFields) {
      if (typeof record[property] !== "string" || !record[property].trim()) {
        throw new CatalogError(`Record ${index + 1} has invalid ${property}`);
      }
    }
    if (!/^Q\d+$/u.test(record.qid)) {
      throw new CatalogError(`Record ${index + 1} has invalid QID ${record.qid}`);
    }
    if (typeof record.localFallback !== "boolean") {
      throw new CatalogError(`Record ${index + 1} has invalid localFallback`);
    }
    if (
      !Number.isSafeInteger(record.width) ||
      !Number.isSafeInteger(record.height) ||
      record.width < 1 ||
      record.height < 1
    ) {
      throw new CatalogError(
        `${record.qid} has invalid dimensions ${record.width}×${record.height}`,
      );
    }
  }
  assertUnique(records, "qid", "QID");
  assertUnique(records, "articleTitle", "English Wikipedia article", normaliseKey);
  assertUnique(records, "fallbackFile", "Commons file", normaliseFileTitle);
}

async function loadOverrides() {
  let overrides;
  try {
    overrides = JSON.parse(await readFile(OVERRIDES_FILE, "utf8"));
  } catch (error) {
    throw new CatalogError(`Could not read ${basename(OVERRIDES_FILE)}: ${error.message}`, {
      cause: error,
    });
  }
  if (
    overrides?.version !== 1 ||
    !overrides.records ||
    typeof overrides.records !== "object" ||
    Array.isArray(overrides.records)
  ) {
    throw new CatalogError(`${basename(OVERRIDES_FILE)} must contain version 1 records`);
  }
  for (const [qid, override] of Object.entries(overrides.records)) {
    if (!/^Q\d+$/u.test(qid) || !override || typeof override !== "object") {
      throw new CatalogError(`Invalid painting override ${JSON.stringify(qid)}`);
    }
    for (const property of ["title", "artist", "year"]) {
      if (
        override[property] !== undefined &&
        (typeof override[property] !== "string" || !override[property].trim())
      ) {
        throw new CatalogError(`Override ${qid} has invalid ${property}`);
      }
    }
    if (
      typeof override.reason !== "string" ||
      !override.reason.trim() ||
      typeof override.source !== "string" ||
      !override.source.startsWith("https://")
    ) {
      throw new CatalogError(`Override ${qid} needs a reason and HTTPS source`);
    }
  }
  return overrides;
}

function applyOverride(record, overrides) {
  const override = overrides.records[record.qid];
  if (!override) return record;
  return {
    ...record,
    ...(override.title ? { title: override.title } : {}),
    ...(override.artist ? { artist: override.artist } : {}),
    ...(override.year ? { year: override.year } : {}),
  };
}

function qidFromEntityUrl(value) {
  return value.match(/\/entity\/(Q\d+)$/u)?.[1] ?? null;
}

function fileFromSpecialPath(value) {
  try {
    const pathname = new URL(value).pathname;
    const marker = "/wiki/Special:FilePath/";
    const start = pathname.indexOf(marker);
    if (start < 0) return null;
    return decodeURIComponent(pathname.slice(start + marker.length));
  } catch {
    return null;
  }
}

function articleTitleFromUrl(value) {
  try {
    const pathname = new URL(value).pathname;
    const marker = "/wiki/";
    const start = pathname.indexOf(marker);
    if (start < 0) return null;
    return decodeURIComponent(pathname.slice(start + marker.length)).replaceAll("_", " ");
  } catch {
    return null;
  }
}

async function discoverCandidates(limit) {
  const query = `SELECT ?item ?image ?article ?sitelinks WHERE {
  ?item wdt:P31 wd:Q3305213;
        wdt:P18 ?image;
        wikibase:sitelinks ?sitelinks.
  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.
  FILTER(?sitelinks >= 2)
}
LIMIT ${limit}`;
  const endpoint = new URL("https://query.wikidata.org/sparql");
  endpoint.search = new URLSearchParams({ format: "json", query }).toString();
  const data = await requestJson(endpoint, {
    context: "Wikidata painting discovery",
  });
  const rows = data?.results?.bindings;
  if (!Array.isArray(rows)) {
    throw new CatalogError("Wikidata painting discovery returned no bindings");
  }
  const candidates = rows.flatMap((binding) => {
    const qid = qidFromEntityUrl(binding.item?.value ?? "");
    const fallbackFile = fileFromSpecialPath(binding.image?.value ?? "");
    const articleTitle = articleTitleFromUrl(binding.article?.value ?? "");
    const sitelinks = Number(binding.sitelinks?.value);
    if (
      !qid ||
      !fallbackFile ||
      !articleTitle ||
      !Number.isSafeInteger(sitelinks)
    ) {
      return [];
    }
    return [{ qid, fallbackFile, articleTitle, sitelinks }];
  });
  console.log(
    `Discovered ${candidates.length} painting/image candidates across ${new Set(candidates.map(({ qid }) => qid)).size} Wikidata items.`,
  );
  return { candidates, query };
}

function resolveAlias(key, aliases) {
  let resolved = key;
  const visited = new Set();
  while (aliases.has(resolved) && !visited.has(resolved)) {
    visited.add(resolved);
    resolved = aliases.get(resolved) ?? resolved;
  }
  return resolved;
}

function publicDomainMetadata(page) {
  const info = page?.imageinfo?.[0];
  const extmetadata = info?.extmetadata ?? {};
  const licenseShortName = cleanMetadataText(
    extmetadata.LicenseShortName?.value ?? extmetadata.UsageTerms?.value,
  );
  const copyrighted = cleanMetadataText(extmetadata.Copyrighted?.value);
  const descriptionUrl = canonicalUrl(
    info?.descriptionurl,
    page?.title ? commonsDescriptionUrl(page.title.replace(/^File:/iu, "")) : "",
  );
  const licenseUrl = canonicalUrl(extmetadata.LicenseUrl?.value, descriptionUrl);
  const width = Number(info?.width);
  const height = Number(info?.height);
  const mime = String(info?.mime ?? "").toLocaleLowerCase("en-US");
  const fallbackFile = page?.title?.replace(/^File:/iu, "") ?? "";
  const verifiedPublicDomain =
    copyrighted.toLocaleLowerCase("en-US") === "false" &&
    PUBLIC_DOMAIN_PATTERN.test(`${licenseShortName} ${licenseUrl}`);
  return {
    fallbackFile,
    width,
    height,
    mime,
    sha1: String(info?.sha1 ?? ""),
    timestamp: String(info?.timestamp ?? ""),
    originalUrl: String(info?.url ?? ""),
    descriptionUrl,
    licenseShortName,
    licenseUrl,
    copyrighted,
    verifiedPublicDomain,
  };
}

async function fetchCommonsBatch(files, batchNumber, totalBatches) {
  const parameters = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    maxlag: "5",
    redirects: "1",
    prop: "imageinfo",
    iiprop: "url|size|mime|sha1|timestamp|extmetadata",
    iiextmetadatalanguage: "en",
    iiextmetadatafilter:
      "LicenseShortName|LicenseUrl|UsageTerms|AttributionRequired|Copyrighted|Restrictions",
    titles: files.map((file) => `File:${file}`).join("|"),
  });
  const data = await requestJson("https://commons.wikimedia.org/w/api.php", {
    body: parameters,
    context: `Commons metadata batch ${batchNumber}/${totalBatches}`,
  });
  const aliases = new Map();
  for (const alias of [
    ...(data?.query?.normalized ?? []),
    ...(data?.query?.redirects ?? []),
  ]) {
    aliases.set(normaliseFileTitle(alias.from), normaliseFileTitle(alias.to));
  }
  const pageByTitle = new Map(
    (data?.query?.pages ?? []).map((page) => [normaliseFileTitle(page.title), page]),
  );
  return new Map(
    files.map((file) => {
      const key = resolveAlias(normaliseFileTitle(file), aliases);
      return [normaliseFileTitle(file), publicDomainMetadata(pageByTitle.get(key))];
    }),
  );
}

async function fetchCommonsMetadata(files) {
  const uniqueFiles = [...new Map(files.map((file) => [normaliseFileTitle(file), file])).values()];
  const result = new Map();
  const totalBatches = Math.ceil(uniqueFiles.length / API_BATCH_SIZE);
  let nextBatch = 0;
  let completedBatches = 0;
  async function worker() {
    while (nextBatch < totalBatches) {
      const batchIndex = nextBatch;
      nextBatch += 1;
      const start = batchIndex * API_BATCH_SIZE;
      const batch = uniqueFiles.slice(start, start + API_BATCH_SIZE);
      const metadata = await fetchCommonsBatch(
        batch,
        batchIndex + 1,
        totalBatches,
      );
      for (const [key, value] of metadata) result.set(key, value);
      completedBatches += 1;
      if (completedBatches % 10 === 0 || completedBatches === totalBatches) {
        console.log(`Validated Commons metadata ${completedBatches}/${totalBatches} batches.`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: API_CONCURRENCY }, () => worker()),
  );
  return result;
}

async function fetchEntities(ids, props, label) {
  const result = new Map();
  const uniqueIds = [...new Set(ids)];
  const totalBatches = Math.ceil(uniqueIds.length / API_BATCH_SIZE);
  let nextBatch = 0;
  let completedBatches = 0;
  async function worker() {
    while (nextBatch < totalBatches) {
      const batchIndex = nextBatch;
      nextBatch += 1;
      const start = batchIndex * API_BATCH_SIZE;
      const batch = uniqueIds.slice(start, start + API_BATCH_SIZE);
      const data = await requestJson("https://www.wikidata.org/w/api.php", {
        body: new URLSearchParams({
          action: "wbgetentities",
          format: "json",
          maxlag: String(WIKIDATA_ENTITY_MAX_LAG),
          props,
          languages: "en",
          languagefallback: "1",
          ids: batch.join("|"),
        }),
        context: `${label} batch ${batchIndex + 1}/${totalBatches}`,
      });
      for (const [id, entity] of Object.entries(data?.entities ?? {})) {
        result.set(id, entity);
      }
      completedBatches += 1;
      if (completedBatches % 10 === 0 || completedBatches === totalBatches) {
        console.log(`Fetched ${label} ${completedBatches}/${totalBatches} batches.`);
      }
    }
  }
  await Promise.all(
    Array.from({ length: API_CONCURRENCY }, () => worker()),
  );
  return result;
}

function bestClaims(entity, property) {
  const claims = entity?.claims?.[property] ?? [];
  const preferred = claims.filter((claim) => claim.rank === "preferred");
  return preferred.length ? preferred : claims.filter((claim) => claim.rank !== "deprecated");
}

function creatorIdsFor(entity) {
  return [
    ...new Set(
      bestClaims(entity, "P170")
        .map((claim) => claim.mainsnak?.datavalue?.value?.id)
        .filter((value) => /^Q\d+$/u.test(value ?? "")),
    ),
  ];
}

function ordinal(value) {
  const mod100 = value % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${value}th`;
  if (value % 10 === 1) return `${value}st`;
  if (value % 10 === 2) return `${value}nd`;
  if (value % 10 === 3) return `${value}rd`;
  return `${value}th`;
}

function yearFor(entity) {
  const timeValue = bestClaims(entity, "P571")
    .map((claim) => claim.mainsnak?.datavalue?.value)
    .find((value) => value?.time && Number.isInteger(value.precision));
  if (!timeValue) return "Date unknown";
  const match = String(timeValue.time).match(/^([+-])(\d{1,16})-/u);
  if (!match) return "Date unknown";
  const absoluteYear = Number(match[2]);
  if (!Number.isSafeInteger(absoluteYear)) return "Date unknown";
  const suffix = match[1] === "-" ? " BCE" : "";
  if (timeValue.precision >= 9) return `${absoluteYear}${suffix}`;
  if (timeValue.precision === 8) {
    return `${Math.floor(absoluteYear / 10) * 10}s${suffix}`;
  }
  if (timeValue.precision === 7) {
    return `${ordinal(Math.floor((absoluteYear - 1) / 100) + 1)} century${suffix}`;
  }
  return "Date unknown";
}

function labelFor(entity) {
  return cleanMetadataText(entity?.labels?.en?.value);
}

function titleFor(entity, articleTitle, qid) {
  const label = labelFor(entity);
  if (label && label !== qid && label.length >= 3) return label;
  return articleTitle.replace(/\s+\([^)]*\)$/u, "").trim();
}

function compareSources(left, right) {
  const leftShort = Math.min(left.width, left.height);
  const rightShort = Math.min(right.width, right.height);
  const leftPixels = left.width * left.height;
  const rightPixels = right.width * right.height;
  return (
    rightShort - leftShort ||
    rightPixels - leftPixels ||
    left.fallbackFile.localeCompare(right.fallbackFile, "en")
  );
}

function compareCandidates(left, right) {
  return (
    right.sitelinks - left.sitelinks ||
    Math.min(right.width, right.height) - Math.min(left.width, left.height) ||
    right.width * right.height - left.width * left.height ||
    Number(left.qid.slice(1)) - Number(right.qid.slice(1)) ||
    left.fallbackFile.localeCompare(right.fallbackFile, "en")
  );
}

function inventoryRecord(record, status, commons, sitelinks = null) {
  return {
    qid: record.qid,
    articleTitle: record.articleTitle,
    title: record.title,
    artist: record.artist,
    year: record.year,
    commonsFile: record.fallbackFile,
    width: record.width,
    height: record.height,
    localFallback: record.localFallback,
    status,
    wikidataSitelinks: sitelinks,
    commons: {
      canonicalFile: commons.fallbackFile,
      mime: commons.mime,
      sha1: commons.sha1,
      timestamp: commons.timestamp,
      originalUrl: commons.originalUrl,
      descriptionUrl: commons.descriptionUrl,
      licenseShortName: commons.licenseShortName,
      licenseUrl: commons.licenseUrl,
      copyrighted: commons.copyrighted,
    },
  };
}

function renderGeneratedModule(records, generatedDate) {
  const rows = records
    .map((record) =>
      `  ${JSON.stringify([
        record.qid,
        record.articleTitle,
        record.title,
        record.artist,
        record.year,
        record.fallbackFile,
        record.width,
        record.height,
        record.licenseUrl,
        record.localFallback,
      ])},`,
    )
    .join("\n");
  return `/**
 * Generated from Wikidata and Wikimedia Commons on ${generatedDate}.
 * Every file is Copyrighted=False and public domain/CC0. New additions use
 * sources with a 2160px minimum short edge and at least 6 megapixels.
 * Full per-file provenance is recorded in scripts/data/painting-inventory.json.
 */
export type PaintingRecord = {
  qid: string;
  articleTitle: string;
  title: string;
  artist: string;
  year: string;
  fallbackFile: string;
  width: number;
  height: number;
  license: "Public domain";
  licenseUrl: string;
  descriptionUrl: string;
  localFallback: boolean;
};

type PaintingTuple = readonly [
  qid: string,
  articleTitle: string,
  title: string,
  artist: string,
  year: string,
  fallbackFile: string,
  width: number,
  height: number,
  licenseUrl: string,
  localFallback: boolean,
];

const PAINTING_ROWS = [
${rows}
] as const satisfies readonly PaintingTuple[];

function commonsDescriptionUrl(fileName: string) {
  return \`https://commons.wikimedia.org/wiki/File:\${encodeURIComponent(fileName.replace(/ /g, "_"))}\`;
}

export const PAINTINGS: readonly PaintingRecord[] = PAINTING_ROWS.map(
  ([qid, articleTitle, title, artist, year, fallbackFile, width, height, licenseUrl, localFallback]) => ({
    qid,
    articleTitle,
    title,
    artist,
    year,
    fallbackFile,
    width,
    height,
    license: "Public domain",
    licenseUrl,
    descriptionUrl: commonsDescriptionUrl(fallbackFile),
    localFallback,
  }),
);
`;
}

async function atomicWrite(path, contents) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, contents, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

function parseIntegerArgument(arguments_, name, fallback, minimum, maximum) {
  const index = arguments_.indexOf(name);
  if (index < 0) return fallback;
  const raw = arguments_[index + 1];
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new CatalogError(
      `${name} must be an integer from ${minimum} through ${maximum}; received ${JSON.stringify(raw)}`,
    );
  }
  return value;
}

function printHelp() {
  console.log(`Usage:
  node scripts/build-painting-collection.mjs
  node scripts/build-painting-collection.mjs --target 2048 --candidate-limit 20000

Discovers English-Wikipedia painting records, validates their Wikimedia Commons
public-domain metadata and source resolution, preserves the original 300 records,
and atomically rebuilds the generated catalog and provenance inventory.`);
}

async function main() {
  const arguments_ = process.argv.slice(2);
  if (arguments_.includes("--help")) {
    printHelp();
    return;
  }
  const knownArguments = new Set(["--target", "--candidate-limit"]);
  for (let index = 0; index < arguments_.length; index += 2) {
    if (!knownArguments.has(arguments_[index]) || arguments_[index + 1] === undefined) {
      throw new CatalogError(`Unknown or incomplete argument ${JSON.stringify(arguments_[index])}`);
    }
  }
  const target = parseIntegerArgument(
    arguments_,
    "--target",
    DEFAULT_TARGET_RECORDS,
    PRESERVED_RECORDS + 1,
    5_000,
  );
  const candidateLimit = parseIntegerArgument(
    arguments_,
    "--candidate-limit",
    DEFAULT_CANDIDATE_LIMIT,
    target,
    20_000,
  );

  const overrides = await loadOverrides();
  const currentRows = readPaintingRows(await readFile(DATA_FILE, "utf8"));
  if (currentRows.length < PRESERVED_RECORDS) {
    throw new CatalogError(
      `${basename(DATA_FILE)} contains ${currentRows.length} records; cannot preserve the original ${PRESERVED_RECORDS}`,
    );
  }
  const preserved = currentRows
    .slice(0, PRESERVED_RECORDS)
    .map((record) => applyOverride(record, overrides));
  assertCatalog(preserved, PRESERVED_RECORDS);

  const { candidates, query } = await discoverCandidates(candidateLimit);
  const allFiles = [
    ...preserved.map(({ fallbackFile }) => fallbackFile),
    ...candidates.map(({ fallbackFile }) => fallbackFile),
  ];
  const commonsByFile = await fetchCommonsMetadata(allFiles);

  const preservedInventory = preserved.map((record) => {
    const commons = commonsByFile.get(normaliseFileTitle(record.fallbackFile));
    if (!commons?.verifiedPublicDomain) {
      throw new CatalogError(
        `Preserved record ${record.qid} no longer has verified public-domain metadata for ${record.fallbackFile}`,
      );
    }
    return inventoryRecord(
      { ...record, licenseUrl: commons.licenseUrl },
      "preserved",
      commons,
    );
  });
  const preservedWithLicenses = preserved.map((record, index) => ({
    ...record,
    licenseUrl: preservedInventory[index].commons.licenseUrl,
    localFallback: true,
  }));

  const preservedQids = new Set(preserved.map(({ qid }) => qid));
  const preservedArticles = new Set(
    preserved.map(({ articleTitle }) => normaliseKey(articleTitle)),
  );
  const preservedFiles = new Set(
    preserved.map(({ fallbackFile }) => normaliseFileTitle(fallbackFile)),
  );
  const eligibleByQid = new Map();
  for (const candidate of candidates) {
    if (
      preservedQids.has(candidate.qid) ||
      preservedArticles.has(normaliseKey(candidate.articleTitle)) ||
      preservedFiles.has(normaliseFileTitle(candidate.fallbackFile))
    ) {
      continue;
    }
    const commons = commonsByFile.get(normaliseFileTitle(candidate.fallbackFile));
    if (
      !commons?.verifiedPublicDomain ||
      !SUPPORTED_RASTER_MIMES.has(commons.mime) ||
      !Number.isSafeInteger(commons.width) ||
      !Number.isSafeInteger(commons.height) ||
      Math.min(commons.width, commons.height) < MIN_ADDED_SHORT_EDGE ||
      commons.width * commons.height < MIN_ADDED_PIXELS
    ) {
      continue;
    }
    const enriched = {
      ...candidate,
      ...commons,
      fallbackFile: commons.fallbackFile || candidate.fallbackFile,
      commons,
    };
    const sources = eligibleByQid.get(candidate.qid) ?? [];
    sources.push(enriched);
    eligibleByQid.set(candidate.qid, sources);
  }
  const bestSources = [...eligibleByQid.values()]
    .map((sources) => sources.sort(compareSources)[0])
    .sort(compareCandidates);
  console.log(
    `${bestSources.length} unique non-seed paintings passed the strict public-domain and 4K-source policy.`,
  );

  const entities = await fetchEntities(
    bestSources.map(({ qid }) => qid),
    "labels|claims",
    "painting entities",
  );
  const creatorIds = [
    ...new Set(
      [...entities.values()].flatMap((entity) => creatorIdsFor(entity)),
    ),
  ];
  const creators = await fetchEntities(creatorIds, "labels", "creator labels");
  const enrichedCandidates = bestSources.map((candidate) => {
    const entity = entities.get(candidate.qid);
    const creatorIds = creatorIdsFor(entity);
    const creatorLabels = creatorIds
      .map((id) => labelFor(creators.get(id)))
      .filter(Boolean);
    const artist = creatorLabels.length
      ? [...new Set(creatorLabels)].join(" & ")
      : "Unknown artist";
    return applyOverride({
      ...candidate,
      title: titleFor(entity, candidate.articleTitle, candidate.qid),
      artist,
      artistKeys: creatorLabels.length
        ? [...new Set(creatorLabels.map(normaliseKey))]
        : [normaliseKey("Unknown artist")],
      year: yearFor(entity),
      licenseUrl: candidate.commons.licenseUrl,
    }, overrides);
  });

  const artistCounts = new Map();
  for (const record of preservedWithLicenses) {
    const key = normaliseKey(record.artist);
    artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
  }
  const articleKeys = new Set(preservedArticles);
  const fileKeys = new Set(preservedFiles);
  const selected = [];
  for (const candidate of enrichedCandidates) {
    if (selected.length >= target - PRESERVED_RECORDS) break;
    if (
      articleKeys.has(normaliseKey(candidate.articleTitle)) ||
      fileKeys.has(normaliseFileTitle(candidate.fallbackFile)) ||
      candidate.year === "Date unknown" ||
      candidate.artistKeys.some(
        (key) => (artistCounts.get(key) ?? 0) >= MAX_WORKS_PER_ARTIST,
      )
    ) {
      continue;
    }
    selected.push(candidate);
    articleKeys.add(normaliseKey(candidate.articleTitle));
    fileKeys.add(normaliseFileTitle(candidate.fallbackFile));
    for (const key of candidate.artistKeys) {
      artistCounts.set(key, (artistCounts.get(key) ?? 0) + 1);
    }
  }
  if (selected.length !== target - PRESERVED_RECORDS) {
    throw new CatalogError(
      `Only ${selected.length} additions survived the ${MAX_WORKS_PER_ARTIST}-works-per-artist diversity cap; need ${target - PRESERVED_RECORDS}`,
    );
  }

  const selectedRecords = selected.map((candidate) => ({
    qid: candidate.qid,
    articleTitle: candidate.articleTitle,
    title: candidate.title,
    artist: candidate.artist,
    year: candidate.year,
    fallbackFile: candidate.fallbackFile,
    width: candidate.width,
    height: candidate.height,
    licenseUrl: candidate.licenseUrl,
    localFallback: false,
  }));
  const records = [...preservedWithLicenses, ...selectedRecords];
  assertCatalog(records, target);
  const generatedDate = new Date().toISOString().slice(0, 10);
  const inventory = {
    version: 1,
    generatedAt: generatedDate,
    count: records.length,
    source: {
      wikidataQueryService: "https://query.wikidata.org/sparql",
      wikidataApi: "https://www.wikidata.org/w/api.php",
      commonsApi: "https://commons.wikimedia.org/w/api.php",
      candidateLimit,
      query,
    },
    policy: {
      preservedRecordCount: PRESERVED_RECORDS,
      minimumAddedShortEdge: MIN_ADDED_SHORT_EDGE,
      minimumAddedPixels: MIN_ADDED_PIXELS,
      maximumWorksPerArtist: MAX_WORKS_PER_ARTIST,
      supportedAddedRasterMimes: [...SUPPORTED_RASTER_MIMES],
      publicDomainRule:
        "Commons Copyrighted=False and LicenseShortName/LicenseUrl matches Public domain or CC0",
      requiredMetadata: ["English title", "creator attribution", "creation date"],
      unique: ["qid", "English Wikipedia article", "Commons file"],
      curatorOverrides: "scripts/data/painting-overrides.json",
    },
    records: [
      ...preservedInventory,
      ...selected.map((candidate, index) =>
        inventoryRecord(
          selectedRecords[index],
          "selected-4k-source",
          candidate.commons,
          candidate.sitelinks,
        ),
      ),
    ],
  };

  await atomicWrite(DATA_FILE, renderGeneratedModule(records, generatedDate));
  await atomicWrite(INVENTORY_FILE, `${JSON.stringify(inventory, null, 2)}\n`);
  console.log(
    `Published ${records.length} validated paintings (${selected.length} new 4K-source additions) and ${basename(INVENTORY_FILE)}.`,
  );
}

await main().catch((error) => {
  console.error(`${error.name ?? "Error"}: ${error.message}`);
  process.exitCode = 1;
});
