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

const LOCAL_FALLBACK_RECORDS = 300;
const DEFAULT_TARGET_RECORDS = 3_560;
const DEFAULT_CANDIDATE_LIMIT = 20_000;
const MIN_ADDED_SHORT_EDGE = 2_160;
const MIN_ADDED_PIXELS = 6_000_000;
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
const ERA_KEYS = [
  "pre-1400",
  "1400s",
  "1500s",
  "1600s",
  "1700s",
  "1800s",
  "1900-plus",
];

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

function canonicalOriginalUrl(value) {
  const canonical = canonicalUrl(value, "");
  if (!canonical) return "";
  const url = new URL(canonical);
  for (const parameter of ["utm_source", "utm_campaign", "utm_content"]) {
    url.searchParams.delete(parameter);
  }
  return url.href;
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
      localFallback = index < LOCAL_FALLBACK_RECORDS,
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
  const pageSize = Math.min(2_000, limit);
  const queryBody = `SELECT DISTINCT ?item ?image ?article ?sitelinks WHERE {
  ?item wdt:P31/wdt:P279* wd:Q3305213;
        wdt:P18 ?image;
        wikibase:sitelinks ?sitelinks.
  ?article schema:about ?item;
           schema:isPartOf <https://en.wikipedia.org/>.
  FILTER(?sitelinks >= 1)
}`;
  const order = "ORDER BY ?item ?image ?article ?sitelinks";
  const query = `${queryBody}\n${order}\nLIMIT <page-size> OFFSET <offset>`;
  const candidatesByBinding = new Map();
  let bindingCount = 0;
  let complete = false;
  let offset = 0;
  let pages = 0;
  while (offset < limit) {
    const requested = Math.min(pageSize, limit - offset);
    const pageQuery = `${queryBody}\n${order}\nLIMIT ${requested}\nOFFSET ${offset}`;
    const endpoint = new URL("https://query.wikidata.org/sparql");
    endpoint.search = new URLSearchParams({
      format: "json",
      query: pageQuery,
    }).toString();
    const data = await requestJson(endpoint, {
      context: `Wikidata painting discovery page ${pages + 1}`,
    });
    const rows = data?.results?.bindings;
    if (!Array.isArray(rows) || rows.length > requested) {
      throw new CatalogError(
        `Wikidata painting discovery page ${pages + 1} returned invalid bindings`,
      );
    }
    bindingCount += rows.length;
    pages += 1;
    for (const binding of rows) {
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
        continue;
      }
      const key = JSON.stringify([qid, fallbackFile, articleTitle, sitelinks]);
      candidatesByBinding.set(key, {
        qid,
        fallbackFile,
        articleTitle,
        sitelinks,
      });
    }
    console.log(
      `Discovered Wikidata page ${pages}: ${rows.length}/${requested} bindings at offset ${offset}.`,
    );
    if (rows.length < requested) {
      complete = true;
      break;
    }
    offset += requested;
  }
  if (!complete) {
    throw new CatalogError(
      `Wikidata painting discovery reached the ${limit}-binding cap without a short terminal page`,
    );
  }
  const candidates = [...candidatesByBinding.values()];
  console.log(
    `Discovered ${candidates.length} unique painting/image candidates across ${new Set(candidates.map(({ qid }) => qid)).size} Wikidata items in ${pages} complete pages.`,
  );
  return {
    candidates,
    query,
    pagination: {
      pageSize,
      pages,
      bindingCount,
      uniqueBindingCount: candidates.length,
      order,
      complete,
    },
  };
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
    originalUrl: canonicalOriginalUrl(info?.url),
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

function eraForYear(value) {
  const text = String(value);
  const isBce = /\b(?:BC|BCE)\b/iu.test(text);
  const explicitYear = text.match(/\d{3,4}/u)?.[0];
  const century = text.match(/\b(\d{1,2})(?:st|nd|rd|th) century\b/iu)?.[1];
  const year = explicitYear
    ? isBce
      ? -Number(explicitYear)
      : Number(explicitYear)
    : century
      ? isBce
        ? -Number(century) * 100
        : (Number(century) - 1) * 100
      : null;
  if (!Number.isSafeInteger(year)) return null;
  if (year < 1400) return "pre-1400";
  if (year < 1500) return "1400s";
  if (year < 1600) return "1500s";
  if (year < 1700) return "1600s";
  if (year < 1800) return "1700s";
  if (year < 1900) return "1800s";
  return "1900-plus";
}

function countByEra(records) {
  const counts = Object.fromEntries(ERA_KEYS.map((era) => [era, 0]));
  for (const record of records) {
    const era = eraForYear(record.year);
    if (!era) {
      throw new CatalogError(
        `Could not classify ${record.qid} year ${JSON.stringify(record.year)} into an era`,
      );
    }
    counts[era] += 1;
  }
  return counts;
}

function assertEraClassification() {
  const cases = [
    ["750 BCE", "pre-1400"],
    ["15th century BCE", "pre-1400"],
    ["14th century", "pre-1400"],
    ["c. 1400", "1400s"],
    ["1535–1540", "1500s"],
    ["19th century", "1800s"],
    ["1900", "1900-plus"],
  ];
  for (const [year, expected] of cases) {
    if (eraForYear(year) !== expected) {
      throw new CatalogError(
        `Era classifier regression for ${JSON.stringify(year)}; expected ${expected}`,
      );
    }
  }
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
  node scripts/build-painting-collection.mjs --target 3560 --candidate-limit 20000

Discovers English-Wikipedia painting records, validates their Wikimedia Commons
public-domain metadata and source resolution, preserves every existing catalog
record in place, and atomically appends additions to the generated catalog and
provenance inventory.`);
}

async function main() {
  assertEraClassification();
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
    LOCAL_FALLBACK_RECORDS + 1,
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
  const currentDataSource = await readFile(DATA_FILE, "utf8");
  let currentRows = readPaintingRows(currentDataSource);
  const publishedRowCount = currentRows.length;
  if (currentRows.length < LOCAL_FALLBACK_RECORDS) {
    throw new CatalogError(
      `${basename(DATA_FILE)} contains ${currentRows.length} records; cannot preserve the original ${LOCAL_FALLBACK_RECORDS}`,
    );
  }
  let currentInventory;
  let currentInventorySource;
  try {
    currentInventorySource = await readFile(INVENTORY_FILE, "utf8");
    currentInventory = JSON.parse(currentInventorySource);
  } catch (error) {
    throw new CatalogError(
      `Could not read ${basename(INVENTORY_FILE)}: ${error.message}`,
      { cause: error },
    );
  }
  if (
    currentInventory?.version !== 1 ||
    !Array.isArray(currentInventory.records) ||
    currentInventory.records.length < LOCAL_FALLBACK_RECORDS ||
    currentInventory.count !== currentInventory.records.length
  ) {
    throw new CatalogError(
      `${basename(INVENTORY_FILE)} must contain version 1 provenance with at least ${LOCAL_FALLBACK_RECORDS} records`,
    );
  }
  const alignedInventoryCount = Math.min(
    currentRows.length,
    currentInventory.records.length,
  );
  for (const [index, record] of currentRows.slice(0, alignedInventoryCount).entries()) {
    const provenance = currentInventory.records[index];
    if (
      provenance?.qid !== record.qid ||
      (provenance.wikidataSitelinks !== null &&
        !Number.isSafeInteger(provenance.wikidataSitelinks))
    ) {
      throw new CatalogError(
        `${basename(INVENTORY_FILE)} record ${index + 1} does not align with ${record.qid}`,
      );
    }
  }
  const configuredAppendOnlyBaseCount =
    currentInventory.policy?.appendOnlyBaseCount;
  const appendOnlyBaseCount = Number.isSafeInteger(configuredAppendOnlyBaseCount)
    ? configuredAppendOnlyBaseCount
    : alignedInventoryCount;
  if (
    appendOnlyBaseCount < LOCAL_FALLBACK_RECORDS ||
    appendOnlyBaseCount > currentRows.length
  ) {
    throw new CatalogError(
      `${basename(INVENTORY_FILE)} has invalid appendOnlyBaseCount ${JSON.stringify(configuredAppendOnlyBaseCount)}`,
    );
  }
  if (currentInventory.records.length > publishedRowCount) {
    const recoveredRows = currentInventory.records
      .slice(publishedRowCount)
      .map((provenance) => ({
        qid: provenance.qid,
        articleTitle: provenance.articleTitle,
        title: provenance.title,
        artist: provenance.artist,
        year: provenance.year,
        fallbackFile: provenance.commonsFile,
        width: provenance.width,
        height: provenance.height,
        licenseUrl: provenance.commons?.licenseUrl,
        localFallback: false,
      }));
    currentRows = [...currentRows, ...recoveredRows];
    console.warn(
      `Recovering ${recoveredRows.length} append-only catalog rows from an inventory-ahead interrupted publish.`,
    );
  }
  if (target < currentRows.length) {
    throw new CatalogError(
      `Refusing to shrink the append-only catalog from ${currentRows.length} to ${target} records`,
    );
  }
  const stablePrefix = currentRows.map((record, index) => ({
    ...record,
    localFallback: index < LOCAL_FALLBACK_RECORDS,
  }));
  assertCatalog(stablePrefix, currentRows.length);
  const additionsNeeded = target - stablePrefix.length;

  const { candidates, query, pagination } = await discoverCandidates(candidateLimit);
  const candidateSitelinksByQid = new Map(
    candidates.map(({ qid, sitelinks }) => [qid, sitelinks]),
  );
  const allFiles = [
    ...stablePrefix.map(({ fallbackFile }) => fallbackFile),
    ...candidates.map(({ fallbackFile }) => fallbackFile),
  ];
  const commonsByFile = await fetchCommonsMetadata(allFiles);

  const preservedInventory = stablePrefix.map((record, index) => {
    const commons = commonsByFile.get(normaliseFileTitle(record.fallbackFile));
    if (!commons?.verifiedPublicDomain) {
      throw new CatalogError(
        `Preserved record ${record.qid} no longer has verified public-domain metadata for ${record.fallbackFile}`,
      );
    }
    if (
      index >= LOCAL_FALLBACK_RECORDS &&
      (!SUPPORTED_RASTER_MIMES.has(commons.mime) ||
        !Number.isSafeInteger(commons.width) ||
        !Number.isSafeInteger(commons.height) ||
        Math.min(commons.width, commons.height) < MIN_ADDED_SHORT_EDGE ||
        commons.width * commons.height < MIN_ADDED_PIXELS)
    ) {
      throw new CatalogError(
        `Preserved addition ${record.qid} no longer passes the strict 4K-source policy`,
      );
    }
    const previousProvenance = currentInventory.records[index];
    const wikidataSitelinks = previousProvenance?.qid === record.qid
      ? previousProvenance.wikidataSitelinks
      : candidateSitelinksByQid.get(record.qid) ?? null;
    if (
      index >= LOCAL_FALLBACK_RECORDS &&
      !Number.isSafeInteger(wikidataSitelinks)
    ) {
      throw new CatalogError(
        `Could not recover Wikidata sitelink provenance for preserved addition ${record.qid}`,
      );
    }
    return inventoryRecord(
      record,
      index < LOCAL_FALLBACK_RECORDS ? "preserved" : "selected-4k-source",
      commons,
      wikidataSitelinks,
    );
  });

  const preservedQids = new Set(stablePrefix.map(({ qid }) => qid));
  const preservedArticles = new Set(
    stablePrefix.map(({ articleTitle }) => normaliseKey(articleTitle)),
  );
  const preservedFiles = new Set(
    stablePrefix.map(({ fallbackFile }) => normaliseFileTitle(fallbackFile)),
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
      year: yearFor(entity),
      licenseUrl: candidate.commons.licenseUrl,
    }, overrides);
  });

  const articleKeys = new Set(preservedArticles);
  const fileKeys = new Set(preservedFiles);
  const candidatesByEra = new Map(ERA_KEYS.map((era) => [era, []]));
  for (const candidate of enrichedCandidates) {
    const era = eraForYear(candidate.year);
    if (era) candidatesByEra.get(era).push(candidate);
  }
  console.log(
    `Eligible candidates by era: ${JSON.stringify(Object.fromEntries(ERA_KEYS.map((era) => [era, candidatesByEra.get(era).length])))}`,
  );
  const nextCandidateByEra = new Map(ERA_KEYS.map((era) => [era, 0]));
  const rejected = { duplicateArticleOrFile: 0 };
  const selected = [];
  while (selected.length < additionsNeeded) {
    let selectedThisRound = 0;
    for (const era of ERA_KEYS) {
      const bucket = candidatesByEra.get(era);
      let nextIndex = nextCandidateByEra.get(era);
      while (nextIndex < bucket.length) {
        const candidate = bucket[nextIndex];
        nextIndex += 1;
        nextCandidateByEra.set(era, nextIndex);
        if (
          articleKeys.has(normaliseKey(candidate.articleTitle)) ||
          fileKeys.has(normaliseFileTitle(candidate.fallbackFile))
        ) {
          rejected.duplicateArticleOrFile += 1;
          continue;
        }
        selected.push(candidate);
        selectedThisRound += 1;
        articleKeys.add(normaliseKey(candidate.articleTitle));
        fileKeys.add(normaliseFileTitle(candidate.fallbackFile));
        break;
      }
      if (selected.length >= additionsNeeded) break;
    }
    if (selectedThisRound === 0) break;
  }
  console.log(`Selection rejections: ${JSON.stringify(rejected)}`);
  if (selected.length !== additionsNeeded) {
    throw new CatalogError(
      `Only ${selected.length} unique dated additions survived the strict source policy; need ${additionsNeeded}`,
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
  const records = [...stablePrefix, ...selectedRecords];
  assertCatalog(records, target);
  const additionsByEra = countByEra(records.slice(appendOnlyBaseCount));
  const selectedThisRunByEra = countByEra(selectedRecords);
  const catalogByEra = countByEra(records);
  console.log(`Selected this run by era: ${JSON.stringify(selectedThisRunByEra)}`);
  console.log(`Append-only additions by era: ${JSON.stringify(additionsByEra)}`);
  console.log(`Published catalog by era: ${JSON.stringify(catalogByEra)}`);
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
      pagination,
    },
    policy: {
      preservedRecordCount: appendOnlyBaseCount,
      appendOnlyBaseCount,
      localFallbackRecordCount: LOCAL_FALLBACK_RECORDS,
      minimumAddedShortEdge: MIN_ADDED_SHORT_EDGE,
      minimumAddedPixels: MIN_ADDED_PIXELS,
      maximumWorksPerArtist: null,
      artistDiversityRule:
        "Repeated creators are allowed; era round-robin selection provides temporal balance without an artist cap",
      supportedAddedRasterMimes: [...SUPPORTED_RASTER_MIMES],
      discoveryRule:
        "English-Wikipedia items typed as painting or a transitive painting subclass, with a Commons image and at least one sitelink",
      publicDomainRule:
        "Commons Copyrighted=False and LicenseShortName/LicenseUrl matches Public domain or CC0",
      requiredMetadata: ["English title", "creator attribution", "creation date"],
      unique: ["qid", "English Wikipedia article", "Commons file"],
      curatorOverrides: "scripts/data/painting-overrides.json",
      eraSelection: {
        order: ERA_KEYS,
        rule:
          "First explicit 3/4-digit year, otherwise Nth century mapped to (N-1)*100; BCE values are negative; additions selected round-robin with deterministic fallback when a bucket exhausts",
        additionsByEra,
        catalogByEra,
      },
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

  const generatedDataSource = renderGeneratedModule(records, generatedDate);
  const generatedInventorySource = `${JSON.stringify(inventory, null, 2)}\n`;
  await atomicWrite(INVENTORY_FILE, generatedInventorySource);
  try {
    await atomicWrite(DATA_FILE, generatedDataSource);
  } catch (error) {
    try {
      await atomicWrite(INVENTORY_FILE, currentInventorySource);
    } catch (rollbackError) {
      throw new CatalogError(
        `Could not publish ${basename(DATA_FILE)} or roll back ${basename(INVENTORY_FILE)}: ${rollbackError.message}`,
        { cause: error },
      );
    }
    throw new CatalogError(
      `Could not publish ${basename(DATA_FILE)}; restored ${basename(INVENTORY_FILE)}: ${error.message}`,
      { cause: error },
    );
  }
  console.log(
    `Published ${records.length} validated paintings (${selected.length} new 4K-source additions) and ${basename(INVENTORY_FILE)}.`,
  );
}

await main().catch((error) => {
  console.error(`${error.name ?? "Error"}: ${error.message}`);
  process.exitCode = 1;
});
