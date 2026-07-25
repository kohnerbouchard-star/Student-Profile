import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  EXPECTED_TOTAL_INSTRUMENTS,
  validateFullMarketUniverse,
} from "./full-market-universe-validator.mjs";

const DEFAULT_MANIFEST_PATH =
  "docs/seed-content/markets/universe/manifest-v1.json";
const DEFAULT_MARKET_ROOT = "docs/seed-content/markets";
const PUBLIC_ID_PATTERN =
  /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)+\.v[1-9][0-9]*$/;
const TICKER_PATTERN = /^[A-Z0-9][A-Z0-9.-]{1,15}$/;
const PLACEHOLDER_ISSUER_PATTERNS = Object.freeze([
  /\bplaceholder\b/i,
  /\btbd\b/i,
  /\bto be determined\b/i,
  /\bunknown\b/i,
  /\bunnamed\b/i,
  /\btest(?:ing)?\b/i,
  /\bsample\b/i,
  /\bdummy\b/i,
  /\blorem\b/i,
]);
const GENERIC_LEXEMES = new Set([
  "capital",
  "company",
  "corporation",
  "group",
  "holdings",
  "industries",
  "international",
  "national",
  "partners",
  "services",
  "systems",
  "ventures",
]);
const CORPORATE_SUFFIXES = new Set([
  "co",
  "company",
  "corp",
  "corporation",
  "group",
  "holdings",
  "inc",
  "limited",
  "llc",
  "ltd",
  "plc",
]);
const CONFUSABLE_SYMBOL_MAP = Object.freeze({
  O: "0",
  Q: "0",
  I: "1",
  L: "1",
  S: "5",
  B: "8",
  Z: "2",
});

export async function buildFullMarketEditorialReview(options = {}) {
  const repositoryRoot = path.resolve(options.repositoryRoot ?? process.cwd());
  const manifestPath = path.resolve(
    repositoryRoot,
    options.manifestPath ?? DEFAULT_MANIFEST_PATH,
  );
  const marketRoot = path.resolve(
    repositoryRoot,
    options.marketRoot ?? DEFAULT_MARKET_ROOT,
  );

  const structuralReport = await validateFullMarketUniverse({
    repositoryRoot,
    manifestPath,
    marketRoot,
  });
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const records = await readUniverseRecords(manifest, marketRoot);
  records.sort(compareRecordIdentity);

  const issuers = buildIssuerIndex(records);
  const placeholderIssuerNames = findPlaceholderIssuers(issuers);
  const suspiciousLexicalGroups = findSuspiciousLexicalGroups(issuers);
  const duplicateOrNearDuplicateIssuers = findNearDuplicateIssuers(issuers);
  const duplicateOrConfusingSymbols = findConfusingSymbols(records);
  const concentrations = buildConcentrationReports(records);
  const unsupportedOrIncompleteMetadata = findIncompleteMetadata(records);
  const editorialWarnings = buildEditorialWarnings({
    placeholderIssuerNames,
    suspiciousLexicalGroups,
    duplicateOrNearDuplicateIssuers,
    duplicateOrConfusingSymbols,
    concentrations,
    unsupportedOrIncompleteMetadata,
    structuralReport,
  });
  const recordsRequiringHumanApproval = buildApprovalQueue({
    records,
    placeholderIssuerNames,
    suspiciousLexicalGroups,
    duplicateOrNearDuplicateIssuers,
    duplicateOrConfusingSymbols,
    unsupportedOrIncompleteMetadata,
  });
  const transformationPlan = buildTransformationPlan(
    recordsRequiringHumanApproval,
  );

  const reportBody = {
    schemaVersion: "econovaria-full-market-editorial-review-v1",
    packId: manifest.packId ?? null,
    version: manifest.version ?? null,
    sourceManifestSha256: sha256(await readFile(manifestPath)),
    structurallyValid: structuralReport.structurallyValid,
    editorialReady: recordsRequiringHumanApproval.length === 0 &&
      structuralReport.editorialReady,
    activationAuthorized: false,
    productionAuthorized: false,
    deterministicOrdering: true,
    reproducibleOutput: true,
    counts: {
      instruments: records.length,
      issuers: issuers.size,
      placeholderIssuerNames: placeholderIssuerNames.length,
      suspiciousLexicalGroups: suspiciousLexicalGroups.length,
      duplicateOrNearDuplicateIssuers: duplicateOrNearDuplicateIssuers.length,
      duplicateOrConfusingSymbols: duplicateOrConfusingSymbols.length,
      unsupportedOrIncompleteMetadata: unsupportedOrIncompleteMetadata.length,
      editorialWarnings: editorialWarnings.length,
      recordsRequiringHumanApproval: recordsRequiringHumanApproval.length,
    },
    placeholderIssuerNames,
    suspiciousLexicalGroups,
    duplicateOrNearDuplicateIssuers,
    duplicateOrConfusingSymbols,
    concentrations,
    unsupportedOrIncompleteMetadata,
    editorialWarnings,
    recordsRequiringHumanApproval,
    structuralErrors: structuralReport.errors,
    structuralEditorialFindings: structuralReport.editorialFindings,
  };
  const reviewDigestSha256 = sha256(Buffer.from(stableStringify(reportBody)));
  const report = { ...reportBody, reviewDigestSha256 };
  const plan = {
    schemaVersion: "econovaria-full-market-editorial-transformation-plan-v1",
    packId: report.packId,
    version: report.version,
    reviewDigestSha256,
    sourceMutationAuthorized: false,
    automaticActivationAuthorized: false,
    instructions: transformationPlan,
    instructionCount: transformationPlan.length,
  };

  if (records.length !== EXPECTED_TOTAL_INSTRUMENTS) {
    throw new Error(
      `Editorial review expected ${EXPECTED_TOTAL_INSTRUMENTS} instruments, found ${records.length}.`,
    );
  }
  if (options.reportPath) {
    await writeJson(repositoryRoot, options.reportPath, report);
  }
  if (options.transformationPlanPath) {
    await writeJson(repositoryRoot, options.transformationPlanPath, plan);
  }
  return { report, transformationPlan: plan };
}

async function readUniverseRecords(manifest, marketRoot) {
  const records = [];
  const countries = Object.entries(manifest.countries ?? {})
    .sort(([left], [right]) => left.localeCompare(right));
  for (const [country, definition] of countries) {
    const relativeFile = String(definition.file ?? "").trim();
    const filePath = path.resolve(marketRoot, relativeFile);
    const lines = (await readFile(filePath, "utf8"))
      .split(/\r?\n/)
      .filter((line) => line.trim());
    for (let index = 0; index < lines.length; index += 1) {
      records.push({
        ...JSON.parse(lines[index]),
        __sourceCountry: country,
        __sourceFile: relativeFile,
        __sourceLine: index + 1,
      });
    }
  }
  return records;
}

function buildIssuerIndex(records) {
  const issuers = new Map();
  for (const record of records) {
    const issuerPublicId = String(record.issuerId ?? "");
    const current = issuers.get(issuerPublicId) ?? {
      issuerPublicId,
      issuerName: String(record.issuerName ?? ""),
      countries: new Set(),
      currencies: new Set(),
      instrumentPublicIds: [],
      instrumentTypes: new Set(),
      sectors: new Set(),
    };
    current.countries.add(String(record.country ?? ""));
    current.currencies.add(String(record.currency ?? ""));
    current.instrumentPublicIds.push(String(record.id ?? ""));
    current.instrumentTypes.add(String(record.instrumentType ?? ""));
    current.sectors.add(String(record.sector ?? ""));
    issuers.set(issuerPublicId, current);
  }
  return new Map([...issuers.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function findPlaceholderIssuers(issuers) {
  const findings = [];
  for (const issuer of issuers.values()) {
    const pattern = PLACEHOLDER_ISSUER_PATTERNS.find((candidate) =>
      candidate.test(issuer.issuerName)
    );
    if (pattern) {
      findings.push({
        issuerPublicId: issuer.issuerPublicId,
        issuerName: issuer.issuerName,
        pattern: pattern.source,
        instrumentPublicIds: [...issuer.instrumentPublicIds].sort(),
      });
    }
  }
  return findings.sort(compareIssuerFinding);
}

function findSuspiciousLexicalGroups(issuers) {
  const groups = new Map();
  for (const issuer of issuers.values()) {
    const tokens = tokenizeName(issuer.issuerName);
    const genericCount = tokens.filter((token) => GENERIC_LEXEMES.has(token)).length;
    const signature = tokens
      .filter((token) => !GENERIC_LEXEMES.has(token) && !CORPORATE_SUFFIXES.has(token))
      .slice(0, 3)
      .join("-") || "generic-only";
    const key = `${signature}:${genericCount}`;
    const group = groups.get(key) ?? [];
    group.push({
      issuerPublicId: issuer.issuerPublicId,
      issuerName: issuer.issuerName,
      genericLexemeCount: genericCount,
    });
    groups.set(key, group);
  }
  return [...groups.entries()]
    .filter(([, group]) => group.length >= 5 || group.some((item) => item.genericLexemeCount >= 3))
    .map(([lexicalSignature, group]) => ({
      lexicalSignature,
      issuerCount: group.length,
      issuers: group.sort(compareIssuerFinding),
    }))
    .sort((a, b) =>
      b.issuerCount - a.issuerCount ||
      a.lexicalSignature.localeCompare(b.lexicalSignature)
    );
}

function findNearDuplicateIssuers(issuers) {
  const buckets = new Map();
  for (const issuer of issuers.values()) {
    const normalizedName = normalizeIssuerName(issuer.issuerName);
    const prefix = normalizedName.slice(0, 1);
    const bucket = buckets.get(prefix) ?? [];
    bucket.push({ ...issuer, normalizedName });
    buckets.set(prefix, bucket);
  }
  const findings = [];
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.normalizedName.localeCompare(b.normalizedName));
    for (let leftIndex = 0; leftIndex < bucket.length; leftIndex += 1) {
      const left = bucket[leftIndex];
      for (let rightIndex = leftIndex + 1; rightIndex < bucket.length; rightIndex += 1) {
        const right = bucket[rightIndex];
        if (Math.abs(left.normalizedName.length - right.normalizedName.length) > 3) {
          continue;
        }
        const distance = boundedLevenshtein(
          left.normalizedName,
          right.normalizedName,
          3,
        );
        if (distance <= 2 || tokenSignature(left.issuerName) === tokenSignature(right.issuerName)) {
          findings.push({
            leftIssuerPublicId: left.issuerPublicId,
            leftIssuerName: left.issuerName,
            rightIssuerPublicId: right.issuerPublicId,
            rightIssuerName: right.issuerName,
            normalizedDistance: distance,
            sharedTokenSignature: tokenSignature(left.issuerName),
          });
        }
      }
    }
  }
  return findings.sort((a, b) =>
    a.leftIssuerPublicId.localeCompare(b.leftIssuerPublicId) ||
    a.rightIssuerPublicId.localeCompare(b.rightIssuerPublicId)
  );
}

function findConfusingSymbols(records) {
  const exact = new Map();
  const skeletons = new Map();
  const findings = [];
  for (const record of records) {
    const exchange = String(record.exchange ?? "");
    const symbol = String(record.symbol ?? "");
    const exactKey = `${exchange}:${symbol}`;
    const priorExact = exact.get(exactKey);
    if (priorExact) {
      findings.push(symbolFinding("duplicate", priorExact, record, symbol));
    } else {
      exact.set(exactKey, record);
    }
    const skeleton = symbol.split("").map((character) =>
      CONFUSABLE_SYMBOL_MAP[character] ?? character
    ).join("");
    const skeletonKey = `${exchange}:${skeleton}`;
    const priorSkeleton = skeletons.get(skeletonKey);
    if (priorSkeleton && priorSkeleton.symbol !== symbol) {
      findings.push(symbolFinding("confusable", priorSkeleton, record, skeleton));
    } else if (!priorSkeleton) {
      skeletons.set(skeletonKey, record);
    }
  }
  return findings.sort((a, b) =>
    a.exchange.localeCompare(b.exchange) ||
    a.leftSymbol.localeCompare(b.leftSymbol) ||
    a.rightSymbol.localeCompare(b.rightSymbol)
  );
}

function buildConcentrationReports(records) {
  const total = records.length || 1;
  return {
    country: concentration(records, (record) => record.country, total),
    exchange: concentration(records, (record) => record.exchange, total),
    sector: concentration(records, (record) => record.sector, total),
    industry: concentration(records, (record) => record.industry ?? "__missing__", total),
    assetClass: concentration(records, (record) => record.assetClass, total),
    instrumentType: concentration(records, (record) => record.instrumentType, total),
  };
}

function findIncompleteMetadata(records) {
  const findings = [];
  for (const record of records) {
    const missingFields = [];
    if (!record.description || String(record.description).trim().length < 12) {
      missingFields.push("description");
    }
    if (!record.industry || !String(record.industry).trim()) {
      missingFields.push("industry");
    }
    if (!Array.isArray(record.narrativeTags) || record.narrativeTags.length === 0) {
      missingFields.push("narrativeTags");
    }
    if (!record.riskClass || !String(record.riskClass).trim()) {
      missingFields.push("riskClass");
    }
    if (!record.liquidityClass || !String(record.liquidityClass).trim()) {
      missingFields.push("liquidityClass");
    }
    if (!record.marketCapTier && record.instrumentType === "common_equity") {
      missingFields.push("marketCapTier");
    }
    if (!PUBLIC_ID_PATTERN.test(String(record.id ?? ""))) {
      missingFields.push("validInstrumentPublicId");
    }
    if (!PUBLIC_ID_PATTERN.test(String(record.issuerId ?? ""))) {
      missingFields.push("validIssuerPublicId");
    }
    if (!TICKER_PATTERN.test(String(record.symbol ?? ""))) {
      missingFields.push("validSymbol");
    }
    if (missingFields.length > 0) {
      findings.push({
        instrumentPublicId: String(record.id ?? ""),
        issuerPublicId: String(record.issuerId ?? ""),
        sourceCountry: record.__sourceCountry,
        sourceFile: record.__sourceFile,
        sourceLine: record.__sourceLine,
        missingFields: [...new Set(missingFields)].sort(),
      });
    }
  }
  return findings.sort(compareRecordFinding);
}

function buildEditorialWarnings(input) {
  const warnings = [];
  addWarning(warnings, "placeholder_issuer_names", input.placeholderIssuerNames.length);
  addWarning(warnings, "suspicious_lexical_groups", input.suspiciousLexicalGroups.length);
  addWarning(warnings, "near_duplicate_issuers", input.duplicateOrNearDuplicateIssuers.length);
  addWarning(warnings, "confusing_symbols", input.duplicateOrConfusingSymbols.length);
  addWarning(warnings, "incomplete_metadata", input.unsupportedOrIncompleteMetadata.length);
  addWarning(
    warnings,
    "structural_editorial_findings",
    input.structuralReport.editorialFindings.length,
  );
  for (const [dimension, rows] of Object.entries(input.concentrations)) {
    const top = rows[0];
    if (top && top.share > 0.35) {
      warnings.push({
        code: `${dimension}_concentration_review`,
        count: top.count,
        detail: `${top.key} represents ${(top.share * 100).toFixed(2)}% of records.`,
      });
    }
  }
  return warnings.sort((a, b) => a.code.localeCompare(b.code));
}

function buildApprovalQueue(input) {
  const reasonsByInstrument = new Map();
  const add = (instrumentPublicId, reason) => {
    if (!instrumentPublicId) return;
    const reasons = reasonsByInstrument.get(instrumentPublicId) ?? new Set();
    reasons.add(reason);
    reasonsByInstrument.set(instrumentPublicId, reasons);
  };
  for (const finding of input.unsupportedOrIncompleteMetadata) {
    for (const field of finding.missingFields) add(finding.instrumentPublicId, `metadata:${field}`);
  }
  const issuerToInstruments = new Map();
  for (const record of input.records) {
    const ids = issuerToInstruments.get(record.issuerId) ?? [];
    ids.push(record.id);
    issuerToInstruments.set(record.issuerId, ids);
  }
  const flagIssuer = (issuerPublicId, reason) => {
    for (const instrumentPublicId of issuerToInstruments.get(issuerPublicId) ?? []) {
      add(instrumentPublicId, reason);
    }
  };
  for (const finding of input.placeholderIssuerNames) {
    flagIssuer(finding.issuerPublicId, "issuer:placeholder_name");
  }
  for (const group of input.suspiciousLexicalGroups) {
    for (const issuer of group.issuers) flagIssuer(issuer.issuerPublicId, "issuer:lexical_review");
  }
  for (const finding of input.duplicateOrNearDuplicateIssuers) {
    flagIssuer(finding.leftIssuerPublicId, "issuer:near_duplicate");
    flagIssuer(finding.rightIssuerPublicId, "issuer:near_duplicate");
  }
  for (const finding of input.duplicateOrConfusingSymbols) {
    add(finding.leftInstrumentPublicId, `symbol:${finding.kind}`);
    add(finding.rightInstrumentPublicId, `symbol:${finding.kind}`);
  }
  return input.records
    .filter((record) => reasonsByInstrument.has(record.id))
    .map((record) => ({
      instrumentPublicId: record.id,
      issuerPublicId: record.issuerId,
      symbol: record.symbol,
      exchange: record.exchange,
      country: record.country,
      sourceFile: record.__sourceFile,
      sourceLine: record.__sourceLine,
      reasons: [...reasonsByInstrument.get(record.id)].sort(),
      approvalState: "human_review_required",
      activationAuthorized: false,
    }))
    .sort(compareRecordFinding);
}

function buildTransformationPlan(queue) {
  return queue.map((record) => ({
    instrumentPublicId: record.instrumentPublicId,
    issuerPublicId: record.issuerPublicId,
    sourceFile: record.sourceFile,
    sourceLine: record.sourceLine,
    proposedOperations: record.reasons.map((reason) => ({
      operation: reason.startsWith("metadata:")
        ? "supply_reviewed_metadata"
        : reason.startsWith("symbol:")
        ? "review_exchange_symbol"
        : "review_issuer_identity",
      reason,
      automaticRewriteAllowed: false,
      requiresSeedAuthorityApproval: true,
    })),
    activationAuthorized: false,
  }));
}

function concentration(records, selector, total) {
  const counts = new Map();
  for (const record of records) {
    const key = String(selector(record) ?? "__missing__");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count, share: round(count / total, 8) }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function symbolFinding(kind, left, right, skeleton) {
  return {
    kind,
    exchange: String(left.exchange ?? right.exchange ?? ""),
    skeleton,
    leftInstrumentPublicId: String(left.id ?? ""),
    leftSymbol: String(left.symbol ?? ""),
    rightInstrumentPublicId: String(right.id ?? ""),
    rightSymbol: String(right.symbol ?? ""),
  };
}

function tokenizeName(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function normalizeIssuerName(value) {
  return tokenizeName(value)
    .filter((token) => !CORPORATE_SUFFIXES.has(token))
    .join(" ");
}

function tokenSignature(value) {
  return [...new Set(tokenizeName(value).filter((token) => !CORPORATE_SUFFIXES.has(token)))]
    .sort()
    .join("|");
}

function boundedLevenshtein(left, right, maximum) {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const cost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      const value = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        previous[rightIndex - 1] + cost,
      );
      current.push(value);
      rowMinimum = Math.min(rowMinimum, value);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[right.length];
}

function addWarning(warnings, code, count) {
  if (count > 0) warnings.push({ code, count });
}

function compareRecordIdentity(left, right) {
  return String(left.id).localeCompare(String(right.id)) ||
    String(left.__sourceFile).localeCompare(String(right.__sourceFile)) ||
    Number(left.__sourceLine) - Number(right.__sourceLine);
}

function compareRecordFinding(left, right) {
  return String(left.instrumentPublicId).localeCompare(String(right.instrumentPublicId));
}

function compareIssuerFinding(left, right) {
  return String(left.issuerPublicId).localeCompare(String(right.issuerPublicId));
}

function round(value, digits) {
  return Number(value.toFixed(digits));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function writeJson(repositoryRoot, relativePath, value) {
  const outputPath = path.resolve(repositoryRoot, relativePath);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
