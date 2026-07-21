import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ACTIVE_SUBSETS_RELATIVE = path.join(
  "docs",
  "seed-content",
  "markets",
  "active-subsets",
);

function addIssue(issues, country, code, message) {
  issues.push({ country, code, message });
}

function duplicateValues(values) {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    else seen.add(value);
  }
  return [...duplicates].sort();
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadCandidate(activeSubsetsRoot, candidateFileName) {
  const candidatePath = path.join(activeSubsetsRoot, candidateFileName);
  const document = await readJson(candidatePath);

  if (document?.market && document?.issuerRegistry) {
    return {
      country: document.country,
      candidatePath,
      registryPath: candidatePath,
      market: document.market,
      issuerRegistry: document.issuerRegistry,
    };
  }

  const country = document?.country;
  const registryFileName = `${country}-active-issuer-registry-v1.json`;
  const registryPath = path.join(activeSubsetsRoot, registryFileName);
  const issuerRegistry = await readJson(registryPath);

  return {
    country,
    candidatePath,
    registryPath,
    market: document,
    issuerRegistry,
  };
}

export function auditCandidate({ country, market, issuerRegistry }) {
  const issues = [];
  const instruments = Array.isArray(market?.instruments) ? market.instruments : [];
  const issuers = Array.isArray(issuerRegistry?.issuers) ? issuerRegistry.issuers : [];

  if (!Number.isInteger(market?.instrumentCount) || market.instrumentCount !== instruments.length) {
    addIssue(
      issues,
      country,
      "INSTRUMENT_COUNT_MISMATCH",
      `instrumentCount=${market?.instrumentCount ?? "<missing>"}; actual=${instruments.length}.`,
    );
  }

  if (!Number.isInteger(issuerRegistry?.issuerCount) || issuerRegistry.issuerCount !== issuers.length) {
    addIssue(
      issues,
      country,
      "ISSUER_COUNT_MISMATCH",
      `issuerCount=${issuerRegistry?.issuerCount ?? "<missing>"}; actual=${issuers.length}.`,
    );
  }

  const instrumentIds = instruments.map((instrument) => instrument?.id);
  const issuerIds = issuers.map((issuer) => issuer?.id);

  for (const duplicate of duplicateValues(instrumentIds)) {
    addIssue(issues, country, "DUPLICATE_INSTRUMENT_ID", duplicate);
  }
  for (const duplicate of duplicateValues(issuerIds)) {
    addIssue(issues, country, "DUPLICATE_ISSUER_ID", duplicate);
  }

  const instrumentById = new Map(instruments.map((instrument) => [instrument?.id, instrument]));
  const issuerById = new Map(issuers.map((issuer) => [issuer?.id, issuer]));
  const reverseReferenceCounts = new Map(instrumentIds.map((id) => [id, 0]));

  for (const instrument of instruments) {
    if (typeof instrument?.id !== "string" || instrument.id.length === 0) {
      addIssue(issues, country, "MISSING_INSTRUMENT_ID", JSON.stringify(instrument));
      continue;
    }
    if (typeof instrument.issuerId !== "string" || !issuerById.has(instrument.issuerId)) {
      addIssue(
        issues,
        country,
        "UNKNOWN_INSTRUMENT_ISSUER",
        `${instrument.id} -> ${instrument.issuerId ?? "<missing>"}.`,
      );
      continue;
    }

    const issuer = issuerById.get(instrument.issuerId);
    const backreferences = Array.isArray(issuer?.instrumentIds)
      ? issuer.instrumentIds.filter((instrumentId) => instrumentId === instrument.id).length
      : 0;
    if (backreferences !== 1) {
      addIssue(
        issues,
        country,
        "INSTRUMENT_BACKREFERENCE_INVALID",
        `${instrument.id} appears ${backreferences} times in ${instrument.issuerId}.instrumentIds.`,
      );
    }
  }

  for (const issuer of issuers) {
    if (typeof issuer?.id !== "string" || issuer.id.length === 0) {
      addIssue(issues, country, "MISSING_ISSUER_ID", JSON.stringify(issuer));
      continue;
    }
    if (!Array.isArray(issuer.instrumentIds) || issuer.instrumentIds.length === 0) {
      addIssue(issues, country, "ORPHANED_ISSUER", `${issuer.id} has no instrumentIds.`);
      continue;
    }

    for (const duplicate of duplicateValues(issuer.instrumentIds)) {
      addIssue(
        issues,
        country,
        "DUPLICATE_ISSUER_INSTRUMENT_REFERENCE",
        `${issuer.id} repeats ${duplicate}.`,
      );
    }

    for (const instrumentId of issuer.instrumentIds) {
      if (!instrumentById.has(instrumentId)) {
        addIssue(
          issues,
          country,
          "UNKNOWN_ISSUER_INSTRUMENT",
          `${issuer.id} -> ${instrumentId}.`,
        );
        continue;
      }

      reverseReferenceCounts.set(
        instrumentId,
        (reverseReferenceCounts.get(instrumentId) ?? 0) + 1,
      );
      const instrument = instrumentById.get(instrumentId);
      if (instrument.issuerId !== issuer.id) {
        addIssue(
          issues,
          country,
          "ONE_WAY_ISSUER_REFERENCE",
          `${issuer.id} lists ${instrumentId}, but the instrument declares ${instrument.issuerId}.`,
        );
      }
    }
  }

  for (const [instrumentId, count] of reverseReferenceCounts) {
    if (count !== 1) {
      addIssue(
        issues,
        country,
        count === 0 ? "ORPHANED_INSTRUMENT" : "MULTIPLE_ISSUER_BACKREFERENCES",
        `${instrumentId} has ${count} issuer backreferences.`,
      );
    }
  }

  return {
    country,
    declaredInstrumentCount: market?.instrumentCount,
    actualInstrumentCount: instruments.length,
    declaredIssuerCount: issuerRegistry?.issuerCount,
    actualIssuerCount: issuers.length,
    uniqueInstrumentIds: new Set(instrumentIds).size,
    uniqueIssuerIds: new Set(issuerIds).size,
    issues,
  };
}

export async function auditActiveMarketCandidates(repoRoot = process.cwd()) {
  const activeSubsetsRoot = path.join(repoRoot, ACTIVE_SUBSETS_RELATIVE);
  const candidateFileNames = (await readdir(activeSubsetsRoot))
    .filter((fileName) => fileName.includes("active-market-candidate") && fileName.endsWith(".json"))
    .sort();

  const results = [];
  for (const candidateFileName of candidateFileNames) {
    const candidate = await loadCandidate(activeSubsetsRoot, candidateFileName);
    results.push(auditCandidate(candidate));
  }
  return results.sort((left, right) => left.country.localeCompare(right.country));
}

async function main() {
  const results = await auditActiveMarketCandidates();
  const issues = results.flatMap((result) => result.issues);

  console.table(results.map((result) => ({
    country: result.country,
    instruments: `${result.actualInstrumentCount}/${result.declaredInstrumentCount}`,
    uniqueInstrumentIds: result.uniqueInstrumentIds,
    issuers: `${result.actualIssuerCount}/${result.declaredIssuerCount}`,
    uniqueIssuerIds: result.uniqueIssuerIds,
    issues: result.issues.length,
  })));

  for (const entry of issues) {
    console.error(`[${entry.country}] ${entry.code}: ${entry.message}`);
  }

  if (issues.length > 0) {
    process.exitCode = 1;
    return;
  }

  console.log(`Issuer audit passed for ${results.length} active-market candidates.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
