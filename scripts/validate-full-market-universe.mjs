#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKET_UNIVERSE_PACK_ID = "econovaria.market-universe.v1";
export const MARKET_UNIVERSE_VERSION = "1.0.0-draft";
export const EXPECTED_TOTAL_INSTRUMENTS = 3_200;
export const EXPECTED_COUNTRY_COUNT = 10;
export const EXPECTED_INSTRUMENTS_PER_COUNTRY = 320;

export const SUPPORTED_INSTRUMENT_TYPES = Object.freeze([
  "common_equity",
  "corporate_bond",
  "sovereign_public_bond",
  "preferred_convertible",
  "etf_fund",
  "listed_trust",
  "index",
  "commodity_reference",
]);

export const EXPECTED_ASSET_CLASS_BY_TYPE = Object.freeze({
  common_equity: "equity",
  corporate_bond: "fixed_income",
  sovereign_public_bond: "fixed_income",
  preferred_convertible: "equity",
  etf_fund: "fund",
  listed_trust: "trust",
  index: "index",
  commodity_reference: "commodity_reference",
});

export const EXPECTED_ALLOCATION_PER_COUNTRY = Object.freeze({
  common_equity: 150,
  corporate_bond: 60,
  sovereign_public_bond: 35,
  preferred_convertible: 10,
  etf_fund: 20,
  listed_trust: 15,
  index: 15,
  commodity_reference: 15,
});

const PUBLIC_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+\.v[1-9][0-9]*$/;
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.-]{1,15}$/;
const CURRENCY_PATTERN = /^[A-Z]{3,16}$/;
const EXCHANGE_PATTERN = /^[A-Z0-9]{2,12}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const PLACEHOLDER_PATTERNS = Object.freeze([
  /\bplaceholder\b/i,
  /\btbd\b/i,
  /\bto be determined\b/i,
  /\bunknown issuer\b/i,
  /\bunnamed\b/i,
  /\btest company\b/i,
  /\blorem ipsum\b/i,
  /\bcompany\s*\d{3,}\b/i,
]);

const INAPPROPRIATE_TEXT_PATTERNS = Object.freeze([
  /\bslur\b/i,
  /\bhate group\b/i,
  /\bsexual exploitation\b/i,
  /\bgenocide celebration\b/i,
]);

const DEFAULT_MANIFEST_PATH =
  "docs/seed-content/markets/universe/manifest-v1.json";
const DEFAULT_MARKET_ROOT = "docs/seed-content/markets";

export async function validateFullMarketUniverse(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const manifestPath = path.resolve(
    repositoryRoot,
    options.manifestPath ?? DEFAULT_MANIFEST_PATH,
  );
  const marketRoot = path.resolve(
    repositoryRoot,
    options.marketRoot ?? DEFAULT_MARKET_ROOT,
  );

  const manifestText = await readFile(manifestPath, "utf8");
  const manifest = parseJson(manifestText, manifestPath);
  const errors = [];
  const warnings = [];
  const records = [];
  const countryReports = {};

  validateManifestEnvelope(manifest, errors);

  const countryEntries = Object.entries(manifest.countries ?? {})
    .sort(([left], [right]) => left.localeCompare(right));

  if (countryEntries.length !== EXPECTED_COUNTRY_COUNT) {
    errors.push(
      issue(
        "country_count_mismatch",
        `Expected ${EXPECTED_COUNTRY_COUNT} countries, found ${countryEntries.length}.`,
      ),
    );
  }

  for (const [countryKey, countryDefinition] of countryEntries) {
    const relativeFile = requiredText(
      countryDefinition?.file,
      `manifest.countries.${countryKey}.file`,
      errors,
    );
    if (!relativeFile) continue;

    const filePath = path.resolve(marketRoot, relativeFile);
    if (!isPathInside(marketRoot, filePath)) {
      errors.push(
        issue(
          "country_file_path_escape",
          `${countryKey} file escapes the market root.`,
          { country: countryKey, file: relativeFile },
        ),
      );
      continue;
    }

    let fileBytes;
    try {
      fileBytes = await readFile(filePath);
    } catch (error) {
      errors.push(
        issue(
          "country_file_unreadable",
          `${countryKey} source could not be read.`,
          { country: countryKey, file: relativeFile, detail: safeError(error) },
        ),
      );
      continue;
    }

    const actualSha256 = sha256Hex(fileBytes);
    const expectedSha256 = String(countryDefinition.sha256 ?? "").trim();
    if (!SHA256_PATTERN.test(expectedSha256)) {
      errors.push(
        issue(
          "manifest_country_checksum_invalid",
          `${countryKey} manifest checksum is not a SHA-256 digest.`,
          { country: countryKey },
        ),
      );
    } else if (actualSha256 !== expectedSha256) {
      errors.push(
        issue(
          "country_checksum_mismatch",
          `${countryKey} source checksum does not match the manifest.`,
          { country: countryKey, expectedSha256, actualSha256 },
        ),
      );
    }

    const fileText = fileBytes.toString("utf8");
    const lines = fileText.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const expectedCount = Number(countryDefinition.instrumentCount);

    if (expectedCount !== EXPECTED_INSTRUMENTS_PER_COUNTRY) {
      errors.push(
        issue(
          "manifest_country_instrument_count_invalid",
          `${countryKey} manifest count must be ${EXPECTED_INSTRUMENTS_PER_COUNTRY}.`,
          { country: countryKey, actual: expectedCount },
        ),
      );
    }

    if (lines.length !== EXPECTED_INSTRUMENTS_PER_COUNTRY) {
      errors.push(
        issue(
          "country_record_count_mismatch",
          `${countryKey} must contain exactly ${EXPECTED_INSTRUMENTS_PER_COUNTRY} records.`,
          { country: countryKey, actual: lines.length },
        ),
      );
    }

    const countryRecords = [];
    for (let index = 0; index < lines.length; index += 1) {
      const sourceLine = index + 1;
      let record;
      try {
        record = JSON.parse(lines[index]);
      } catch (error) {
        errors.push(
          issue(
            "malformed_jsonl_record",
            `${countryKey} line ${sourceLine} is not valid JSON.`,
            { country: countryKey, sourceLine, detail: safeError(error) },
          ),
        );
        continue;
      }

      const decorated = {
        ...record,
        __sourceCountry: countryKey,
        __sourceLine: sourceLine,
        __sourceFile: relativeFile,
      };
      validateInstrumentRecord(
        decorated,
        countryKey,
        countryDefinition,
        errors,
        warnings,
      );
      countryRecords.push(decorated);
      records.push(decorated);
    }

    countryReports[countryKey] = buildCountryReport(
      countryKey,
      countryDefinition,
      countryRecords,
      actualSha256,
    );
  }

  validateCollectionInvariants(records, manifest, errors, warnings);

  const report = buildReport({
    manifest,
    records,
    errors,
    warnings,
    countryReports,
    manifestSha256: sha256Hex(Buffer.from(manifestText, "utf8")),
  });

  if (options.reportPath) {
    const reportPath = path.resolve(repositoryRoot, options.reportPath);
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  return report;
}

export function validateInstrumentRecord(
  record,
  countryKey,
  countryDefinition,
  errors,
  warnings,
) {
  const context = {
    country: countryKey,
    sourceFile: record.__sourceFile,
    sourceLine: record.__sourceLine,
    instrumentPublicId: record.id ?? null,
  };

  if (!isPlainObject(record)) {
    errors.push(issue("record_not_object", "Instrument record must be an object.", context));
    return;
  }

  const id = requiredText(record.id, "id", errors, context);
  const symbol = requiredText(record.symbol, "symbol", errors, context);
  const name = requiredText(record.name, "name", errors, context);
  const issuerId = requiredText(record.issuerId, "issuerId", errors, context);
  const issuerName = requiredText(record.issuerName, "issuerName", errors, context);
  const sector = requiredText(record.sector, "sector", errors, context);

  if (id && !PUBLIC_ID_PATTERN.test(id)) {
    errors.push(issue("invalid_instrument_public_id", "Instrument ID is invalid.", context));
  }
  if (issuerId && !PUBLIC_ID_PATTERN.test(issuerId)) {
    errors.push(issue("invalid_issuer_public_id", "Issuer ID is invalid.", context));
  }
  if (symbol && !SYMBOL_PATTERN.test(symbol)) {
    errors.push(issue("invalid_symbol", "Symbol format is invalid.", context));
  }
  if (name && name.length > 180) {
    errors.push(issue("instrument_name_too_long", "Instrument name exceeds 180 characters.", context));
  }
  if (issuerName && issuerName.length > 160) {
    errors.push(issue("issuer_name_too_long", "Issuer name exceeds 160 characters.", context));
  }
  if (sector && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(sector)) {
    errors.push(issue("invalid_sector_key", "Sector key must be lowercase kebab-case.", context));
  }

  if (record.country !== countryKey) {
    errors.push(
      issue("country_mismatch", "Instrument country does not match its source file.", {
        ...context,
        actual: record.country,
        expected: countryKey,
      }),
    );
  }

  const expectedCurrency = String(countryDefinition.currency ?? "").trim();
  if (!CURRENCY_PATTERN.test(String(record.currency ?? ""))) {
    errors.push(issue("invalid_currency", "Instrument currency is invalid.", context));
  } else if (record.currency !== expectedCurrency) {
    errors.push(
      issue("currency_mismatch", "Instrument currency does not match country allocation.", {
        ...context,
        actual: record.currency,
        expected: expectedCurrency,
      }),
    );
  }

  const expectedExchange = String(countryDefinition.exchange ?? "").trim();
  if (!EXCHANGE_PATTERN.test(String(record.exchange ?? ""))) {
    errors.push(issue("invalid_exchange", "Instrument exchange code is invalid.", context));
  } else if (record.exchange !== expectedExchange) {
    errors.push(
      issue("exchange_mismatch", "Instrument exchange does not match country allocation.", {
        ...context,
        actual: record.exchange,
        expected: expectedExchange,
      }),
    );
  }

  if (!SUPPORTED_INSTRUMENT_TYPES.includes(record.instrumentType)) {
    errors.push(
      issue("unsupported_instrument_type", "Instrument type is unsupported.", {
        ...context,
        actual: record.instrumentType,
      }),
    );
  } else {
    const expectedAssetClass = EXPECTED_ASSET_CLASS_BY_TYPE[record.instrumentType];
    if (record.assetClass !== expectedAssetClass) {
      errors.push(
        issue("asset_class_mismatch", "Asset class does not match instrument type.", {
          ...context,
          actual: record.assetClass,
          expected: expectedAssetClass,
        }),
      );
    }
  }

  if (record.activationAuthorized !== false) {
    errors.push(
      issue(
        "activation_not_disabled",
        "Every full-universe definition must remain inactive by default.",
        context,
      ),
    );
  }
  if (record.seedStatus !== "design-candidate") {
    errors.push(
      issue("seed_status_not_design_candidate", "Unexpected seed status.", {
        ...context,
        actual: record.seedStatus,
      }),
    );
  }
  if (record.runtimeSupport !== "unverified") {
    errors.push(
      issue("runtime_support_not_unverified", "Runtime support must remain unverified.", {
        ...context,
        actual: record.runtimeSupport,
      }),
    );
  }

  const textFields = [name, issuerName, record.description]
    .filter((value) => typeof value === "string")
    .join(" ");
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(textFields)) {
      errors.push(
        issue("placeholder_editorial_text", "Placeholder editorial text detected.", {
          ...context,
          pattern: pattern.source,
        }),
      );
    }
  }
  for (const pattern of INAPPROPRIATE_TEXT_PATTERNS) {
    if (pattern.test(textFields)) {
      errors.push(
        issue("inappropriate_editorial_text", "Inappropriate editorial text detected.", {
          ...context,
          pattern: pattern.source,
        }),
      );
    }
  }

  if (record.description === undefined) {
    warnings.push(
      issue(
        "description_missing",
        "Instrument has no editorial description; review required before activation.",
        context,
      ),
    );
  } else if (
    typeof record.description !== "string" ||
    record.description.trim().length < 12 ||
    record.description.length > 600
  ) {
    errors.push(
      issue(
        "malformed_description",
        "Description must be 12-600 nonblank characters when present.",
        context,
      ),
    );
  }

  if (!Array.isArray(record.narrativeTags) || record.narrativeTags.length === 0) {
    errors.push(issue("narrative_tags_missing", "At least one narrative tag is required.", context));
  } else {
    const normalizedTags = new Set();
    for (const tag of record.narrativeTags) {
      if (typeof tag !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tag)) {
        errors.push(issue("invalid_narrative_tag", "Narrative tags must be kebab-case.", context));
      } else if (normalizedTags.has(tag)) {
        errors.push(issue("duplicate_narrative_tag", "Narrative tags must be unique.", context));
      }
      normalizedTags.add(tag);
    }
  }
}

export function validateCollectionInvariants(records, manifest, errors, warnings) {
  if (records.length !== EXPECTED_TOTAL_INSTRUMENTS) {
    errors.push(
      issue(
        "total_instrument_count_mismatch",
        `Expected ${EXPECTED_TOTAL_INSTRUMENTS} records, found ${records.length}.`,
      ),
    );
  }

  const uniqueFields = [
    ["id", "duplicate_instrument_public_id"],
    ["name", "duplicate_instrument_name"],
  ];
  for (const [field, code] of uniqueFields) {
    reportDuplicates(records, field, code, errors);
  }

  const exchangeSymbols = new Map();
  const issuerNamesById = new Map();
  const issuerInstrumentCounts = new Map();
  const typeCounts = new Map();
  const countryTypeCounts = new Map();

  for (const record of records) {
    const exchangeSymbolKey = `${record.exchange}:${record.symbol}`;
    const priorSymbol = exchangeSymbols.get(exchangeSymbolKey);
    if (priorSymbol) {
      errors.push(
        issue(
          "duplicate_symbol_within_exchange",
          `Duplicate symbol ${record.symbol} on ${record.exchange}.`,
          {
            instrumentPublicId: record.id,
            priorInstrumentPublicId: priorSymbol.id,
            exchange: record.exchange,
            symbol: record.symbol,
          },
        ),
      );
    } else {
      exchangeSymbols.set(exchangeSymbolKey, record);
    }

    if (typeof record.issuerId === "string") {
      const normalizedIssuerName = normalizeHumanText(record.issuerName);
      const priorIssuerName = issuerNamesById.get(record.issuerId);
      if (priorIssuerName && priorIssuerName !== normalizedIssuerName) {
        errors.push(
          issue(
            "issuer_identity_name_conflict",
            `Issuer ${record.issuerId} has conflicting names.`,
            {
              instrumentPublicId: record.id,
              issuerPublicId: record.issuerId,
              expectedName: priorIssuerName,
              actualName: normalizedIssuerName,
            },
          ),
        );
      } else {
        issuerNamesById.set(record.issuerId, normalizedIssuerName);
      }
      issuerInstrumentCounts.set(
        record.issuerId,
        (issuerInstrumentCounts.get(record.issuerId) ?? 0) + 1,
      );
    }

    typeCounts.set(
      record.instrumentType,
      (typeCounts.get(record.instrumentType) ?? 0) + 1,
    );
    const countryTypeKey = `${record.country}:${record.instrumentType}`;
    countryTypeCounts.set(
      countryTypeKey,
      (countryTypeCounts.get(countryTypeKey) ?? 0) + 1,
    );
  }

  for (const [country] of Object.entries(manifest.countries ?? {})) {
    for (const [instrumentType, expectedCount] of Object.entries(
      EXPECTED_ALLOCATION_PER_COUNTRY,
    )) {
      const actualCount = countryTypeCounts.get(`${country}:${instrumentType}`) ?? 0;
      if (actualCount !== expectedCount) {
        errors.push(
          issue(
            "country_type_allocation_mismatch",
            `${country} ${instrumentType} allocation must be ${expectedCount}.`,
            { country, instrumentType, expectedCount, actualCount },
          ),
        );
      }
    }
  }

  const manifestTypeCounts = manifest.instrumentTypeCounts ?? {};
  for (const [instrumentType, perCountry] of Object.entries(
    EXPECTED_ALLOCATION_PER_COUNTRY,
  )) {
    const expectedTotal = perCountry * EXPECTED_COUNTRY_COUNT;
    const actualTotal = typeCounts.get(instrumentType) ?? 0;
    if (actualTotal !== expectedTotal) {
      errors.push(
        issue(
          "instrument_type_total_mismatch",
          `${instrumentType} total must be ${expectedTotal}.`,
          { instrumentType, expectedTotal, actualTotal },
        ),
      );
    }
    if (Number(manifestTypeCounts[instrumentType]) !== expectedTotal) {
      errors.push(
        issue(
          "manifest_instrument_type_total_mismatch",
          `Manifest ${instrumentType} total must be ${expectedTotal}.`,
          {
            instrumentType,
            expectedTotal,
            actualTotal: manifestTypeCounts[instrumentType],
          },
        ),
      );
    }
  }

  const concentrationThreshold = 80;
  for (const [issuerPublicId, instrumentCount] of [...issuerInstrumentCounts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))) {
    if (instrumentCount > concentrationThreshold) {
      warnings.push(
        issue(
          "issuer_concentration_review_required",
          `Issuer has ${instrumentCount} instruments, above the editorial review threshold.`,
          { issuerPublicId, instrumentCount, concentrationThreshold },
        ),
      );
    }
  }

  const expectedUniqueIssuers = Number(manifest.validation?.uniqueIssuerIds);
  if (
    Number.isInteger(expectedUniqueIssuers) &&
    issuerNamesById.size !== expectedUniqueIssuers
  ) {
    errors.push(
      issue(
        "unique_issuer_count_mismatch",
        "Unique issuer count does not match the manifest.",
        { expected: expectedUniqueIssuers, actual: issuerNamesById.size },
      ),
    );
  }
}

export function buildReport({
  manifest,
  records,
  errors,
  warnings,
  countryReports,
  manifestSha256,
}) {
  const issuerIds = new Set(records.map((record) => record.issuerId).filter(Boolean));
  const typeCounts = countBy(records, (record) => record.instrumentType);
  const assetClassCounts = countBy(records, (record) => record.assetClass);
  const exchangeCounts = countBy(records, (record) => record.exchange);
  const sectorCounts = countBy(records, (record) => record.sector);

  return {
    schemaVersion: "econovaria-full-market-universe-validation-v1",
    packId: manifest.packId ?? null,
    version: manifest.version ?? null,
    manifestSha256,
    valid: errors.length === 0,
    activationAuthorized: false,
    productionAuthorized: false,
    counts: {
      instruments: records.length,
      countries: Object.keys(countryReports).length,
      issuers: issuerIds.size,
      types: sortObject(typeCounts),
      assetClasses: sortObject(assetClassCounts),
      exchanges: sortObject(exchangeCounts),
      sectors: sortObject(sectorCounts),
    },
    countryReports: sortObject(countryReports),
    errors: sortIssues(errors),
    warnings: sortIssues(warnings),
  };
}

function validateManifestEnvelope(manifest, errors) {
  if (manifest.packId !== MARKET_UNIVERSE_PACK_ID) {
    errors.push(
      issue("manifest_pack_id_mismatch", "Unexpected market universe pack ID.", {
        expected: MARKET_UNIVERSE_PACK_ID,
        actual: manifest.packId,
      }),
    );
  }
  if (manifest.version !== MARKET_UNIVERSE_VERSION) {
    errors.push(
      issue("manifest_version_mismatch", "Unexpected market universe version.", {
        expected: MARKET_UNIVERSE_VERSION,
        actual: manifest.version,
      }),
    );
  }
  if (Number(manifest.totalInstrumentCount) !== EXPECTED_TOTAL_INSTRUMENTS) {
    errors.push(
      issue(
        "manifest_total_instrument_count_mismatch",
        `Manifest total must be ${EXPECTED_TOTAL_INSTRUMENTS}.`,
        { actual: manifest.totalInstrumentCount },
      ),
    );
  }
  if (manifest.productionAuthorized !== false) {
    errors.push(
      issue("manifest_production_authorized", "Production authorization must be false."),
    );
  }
  if (manifest.runtimeSupportVerified !== false) {
    errors.push(
      issue("manifest_runtime_support_verified", "Runtime support must remain unverified."),
    );
  }
  if (manifest.curatedActiveOverlay?.activationAuthorized !== false) {
    errors.push(
      issue("manifest_overlay_activation_authorized", "Overlay activation must be false."),
    );
  }

  for (const [instrumentType, expectedCount] of Object.entries(
    EXPECTED_ALLOCATION_PER_COUNTRY,
  )) {
    if (Number(manifest.allocationPerCountry?.[instrumentType]) !== expectedCount) {
      errors.push(
        issue(
          "manifest_country_allocation_mismatch",
          `Manifest allocation for ${instrumentType} must be ${expectedCount}.`,
          { instrumentType, actual: manifest.allocationPerCountry?.[instrumentType] },
        ),
      );
    }
  }
}

function buildCountryReport(country, definition, records, actualSha256) {
  return {
    country,
    displayName: definition.displayName,
    currency: definition.currency,
    exchange: definition.exchange,
    sourceFile: definition.file,
    sourceSha256: actualSha256,
    instrumentCount: records.length,
    issuerCount: new Set(records.map((record) => record.issuerId).filter(Boolean)).size,
    typeCounts: sortObject(countBy(records, (record) => record.instrumentType)),
    sectorCounts: sortObject(countBy(records, (record) => record.sector)),
  };
}

function reportDuplicates(records, field, code, errors) {
  const seen = new Map();
  for (const record of records) {
    const value = record[field];
    if (typeof value !== "string" || !value.trim()) continue;
    const normalized = normalizeHumanText(value);
    const prior = seen.get(normalized);
    if (prior) {
      errors.push(
        issue(code, `Duplicate ${field} detected.`, {
          field,
          value,
          instrumentPublicId: record.id,
          priorInstrumentPublicId: prior.id,
        }),
      );
    } else {
      seen.set(normalized, record);
    }
  }
}

function requiredText(value, field, errors, context = {}) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(issue("required_text_missing", `${field} is required.`, { ...context, field }));
    return null;
  }
  return value.trim();
}

function countBy(records, keyReader) {
  const counts = {};
  for (const record of records) {
    const key = keyReader(record);
    if (typeof key !== "string" || !key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

function sortObject(value) {
  return Object.fromEntries(
    Object.entries(value ?? {}).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function sortIssues(issues) {
  return [...issues].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right))
  );
}

function normalizeHumanText(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${safeError(error)}`);
  }
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function issue(code, message, details = {}) {
  return { code, message, ...details };
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--repository-root") {
      options.repositoryRoot = argv[++index];
    } else if (token === "--manifest") {
      options.manifestPath = argv[++index];
    } else if (token === "--market-root") {
      options.marketRoot = argv[++index];
    } else if (token === "--report") {
      options.reportPath = argv[++index];
    } else if (token === "--help") {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${token}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/validate-full-market-universe.mjs [options]\n\n` +
    `Options:\n` +
    `  --repository-root <path>  Repository root (default: current directory)\n` +
    `  --manifest <path>         Manifest path relative to repository root\n` +
    `  --market-root <path>      Market content root relative to repository root\n` +
    `  --report <path>           Write deterministic JSON report\n` +
    `  --help                    Show this help\n`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const report = await validateFullMarketUniverse(options);
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
