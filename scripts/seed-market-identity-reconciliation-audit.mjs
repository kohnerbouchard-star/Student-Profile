import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const universeRoot = path.join(seedRoot, "markets", "universe");
const activeRoot = path.join(seedRoot, "markets", "active-subsets");
const jsonReportPath = path.join(seedRoot, "reviews", "market-identity-reconciliation-audit-v1.json");
const markdownReportPath = path.join(seedRoot, "reviews", "market-identity-reconciliation-audit-v1.md");
const checkOnly = process.argv.includes("--check");

function compare(left, right) {
  return left.country.localeCompare(right.country) || left.symbol.localeCompare(right.symbol);
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadUniverse() {
  const manifest = await readJson(path.join(universeRoot, "manifest-v1.json"));
  const records = [];
  for (const [country, descriptor] of Object.entries(manifest.countries ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    const filePath = path.join(seedRoot, "markets", descriptor.file);
    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/).filter((line) => line.trim() !== "");
    if (lines.length !== descriptor.instrumentCount) {
      throw new Error(`${country} has ${lines.length} universe records; expected ${descriptor.instrumentCount}.`);
    }
    records.push(...lines.map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${descriptor.file}:${index + 1}: ${error.message}`);
      }
    }));
  }
  if (records.length !== manifest.totalInstrumentCount) {
    throw new Error(`Loaded ${records.length} universe records; expected ${manifest.totalInstrumentCount}.`);
  }
  return { manifest, records };
}

function candidateShape(document) {
  if (document?.market && Array.isArray(document.market.instruments)) {
    return { country: document.country ?? document.market.country, instruments: document.market.instruments };
  }
  return { country: document?.country, instruments: document?.instruments };
}

async function loadActiveCandidates() {
  const fileNames = (await readdir(activeRoot))
    .filter((name) => name.includes("active-market-candidate") && name.endsWith(".json"))
    .sort();
  const instruments = [];
  for (const fileName of fileNames) {
    const document = await readJson(path.join(activeRoot, fileName));
    const candidate = candidateShape(document);
    if (!candidate.country || !Array.isArray(candidate.instruments)) continue;
    for (const instrument of candidate.instruments) {
      instruments.push({ ...instrument, country: instrument.country ?? candidate.country, sourceFile: fileName });
    }
  }
  return instruments.sort(compare);
}

function identitySnapshot(record) {
  return {
    id: record?.id ?? null,
    symbol: record?.symbol ?? null,
    name: record?.name ?? null,
    country: record?.country ?? null,
    currency: record?.currency ?? null,
    exchange: record?.exchange ?? null,
    instrumentType: record?.instrumentType ?? null,
    issuerId: record?.issuerId ?? null,
    issuerName: record?.issuerName ?? null,
  };
}

function sameIdentity(active, universe) {
  return ["id", "symbol", "name", "country", "currency", "exchange", "instrumentType", "issuerId", "issuerName"]
    .every((field) => (active?.[field] ?? null) === (universe?.[field] ?? null));
}

function countBy(records, field) {
  return Object.fromEntries([...records.reduce((map, record) => {
    const key = record[field] ?? "<missing>";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

function buildReport(universe, active) {
  const universeBySymbol = new Map();
  const universeById = new Map();
  for (const record of universe.records) {
    if (universeBySymbol.has(record.symbol)) throw new Error(`Universe symbol ${record.symbol} is duplicated.`);
    if (universeById.has(record.id)) throw new Error(`Universe ID ${record.id} is duplicated.`);
    universeBySymbol.set(record.symbol, record);
    universeById.set(record.id, record);
  }

  const activeSymbols = new Set();
  const activeIds = new Set();
  const exactCanonicalMatches = [];
  const conflictingSymbolIdentities = [];
  const missingUniverseSymbols = [];
  const activeIdConflicts = [];
  const exchangeMismatches = [];

  for (const record of active) {
    if (activeSymbols.has(record.symbol)) throw new Error(`Active candidate symbol ${record.symbol} is duplicated.`);
    if (activeIds.has(record.id)) throw new Error(`Active candidate ID ${record.id} is duplicated.`);
    activeSymbols.add(record.symbol);
    activeIds.add(record.id);

    const symbolMatch = universeBySymbol.get(record.symbol);
    if (!symbolMatch) {
      missingUniverseSymbols.push({ active: identitySnapshot(record), sourceFile: record.sourceFile });
      continue;
    }
    if (sameIdentity(record, symbolMatch)) {
      exactCanonicalMatches.push({ active: identitySnapshot(record), universe: identitySnapshot(symbolMatch), sourceFile: record.sourceFile });
    } else {
      const differingFields = ["id", "name", "country", "currency", "exchange", "instrumentType", "issuerId", "issuerName"]
        .filter((field) => (record?.[field] ?? null) !== (symbolMatch?.[field] ?? null));
      conflictingSymbolIdentities.push({
        symbol: record.symbol,
        country: record.country,
        differingFields,
        active: identitySnapshot(record),
        universe: identitySnapshot(symbolMatch),
        sourceFile: record.sourceFile,
      });
      if ((record.exchange ?? null) !== (symbolMatch.exchange ?? null)) {
        exchangeMismatches.push({
          symbol: record.symbol,
          country: record.country,
          activeExchange: record.exchange ?? null,
          universeExchange: symbolMatch.exchange ?? null,
          sourceFile: record.sourceFile,
        });
      }
    }

    const idMatch = universeById.get(record.id);
    if (idMatch && idMatch.symbol !== record.symbol) {
      activeIdConflicts.push({ active: identitySnapshot(record), universe: identitySnapshot(idMatch), sourceFile: record.sourceFile });
    }
  }

  const blockers = conflictingSymbolIdentities.length + missingUniverseSymbols.length + activeIdConflicts.length;
  const affectedCountries = [...new Set([
    ...conflictingSymbolIdentities.map((entry) => entry.country),
    ...missingUniverseSymbols.map((entry) => entry.active.country),
    ...activeIdConflicts.map((entry) => entry.active.country),
  ])].sort();

  return {
    schemaVersion: "econovaria-market-identity-reconciliation-audit-v1",
    generatedAt: "2026-07-19",
    sourceUniversePackId: universe.manifest.packId,
    sourceUniverseVersion: universe.manifest.version,
    reviewStatus: blockers === 0 ? "canonical-identities-reconciled" : "canonicalization-required",
    productionAuthorized: false,
    decision: {
      canonicalLayer: "curated-active-candidate-identities-for-overlapping-symbols",
      generatedLayerRule: "A generated universe record that reuses an active-candidate symbol must adopt the curated active instrument ID, name, issuer ID, issuer name, exchange, and compatible identity fields before either layer can be activated.",
      sharedInstitutionalNames: "approved-as-functional-role-families-for-design-use; country-qualified display names remain required",
      generatedCorporateRoots: "definition-library placeholders only; not approved for public commercial activation",
    },
    summary: {
      universeRecords: universe.records.length,
      activeCandidateRecords: active.length,
      countriesWithActiveCandidates: [...new Set(active.map((record) => record.country))].sort(),
      exactCanonicalMatches: exactCanonicalMatches.length,
      conflictingSymbolIdentities: conflictingSymbolIdentities.length,
      missingUniverseSymbols: missingUniverseSymbols.length,
      activeIdConflicts: activeIdConflicts.length,
      exchangeMismatches: exchangeMismatches.length,
      affectedCountries,
      blockers,
      activeRecordsByCountry: countBy(active, "country"),
      activeRecordsByInstrumentType: countBy(active, "instrumentType"),
    },
    findings: {
      exactCanonicalMatches,
      conflictingSymbolIdentities,
      missingUniverseSymbols,
      activeIdConflicts,
      exchangeMismatches,
    },
    requiredResolution: [
      "Overlay curated active-candidate identities into the universe records keyed by country and symbol.",
      "Preserve curated IDs referenced by enrichment and simulation evidence unless an explicit migration updates every reference atomically.",
      "Regenerate country JSONL checksums and rerun uniqueness, issuer-consistency, editorial, and simulation-reference audits.",
      "Keep all records activationAuthorized false and runtimeSupport unverified.",
      "Do not activate both the generated and curated identities as separate instruments for the same symbol.",
    ],
  };
}

function markdown(report) {
  const summary = report.summary;
  const countryRows = Object.entries(summary.activeRecordsByCountry)
    .map(([country, count]) => `| ${country} | ${count} |`)
    .join("\n");
  return `# Market Identity Reconciliation Audit v1\n\nStatus: **${report.reviewStatus}**  \nProduction authorization: false\n\n## Result\n\n- universe records checked: ${summary.universeRecords};\n- curated active-candidate records checked: ${summary.activeCandidateRecords};\n- exact canonical identity matches: ${summary.exactCanonicalMatches};\n- conflicting reused-symbol identities: ${summary.conflictingSymbolIdentities};\n- active symbols missing from the universe: ${summary.missingUniverseSymbols};\n- active-ID conflicts: ${summary.activeIdConflicts};\n- exchange mismatches: ${summary.exchangeMismatches};\n- blocking findings: **${summary.blockers}**.\n\n## Active candidate coverage\n\n| Country | Records |\n|---|---:|\n${countryRows}\n\n## Decision\n\nFor every overlapping symbol, the curated active-candidate identity is the canonical identity because it is already referenced by enrichment and simulation evidence. Generated universe identities are definition-library placeholders and may not coexist as separate instruments under the same symbol.\n\nThe ten country-qualified public-institution role families are approved for design use. The fifteen generated corporate roots remain placeholder taxonomy and are not approved for public commercial activation.\n\n## Required correction\n\n1. Overlay curated active IDs, names, issuer IDs, issuer names, exchanges, and compatible identity fields into the matching universe records.\n2. Preserve all active enrichment and simulation references or migrate them atomically.\n3. Regenerate checksums and rerun all universe, issuer, editorial, preflight, and simulation-reference audits.\n4. Keep activation and runtime support disabled.\n\nThe complete record-level evidence is in \`market-identity-reconciliation-audit-v1.json\`.\n`;
}

async function compareOrWrite(filePath, expected) {
  if (!checkOnly) {
    await writeFile(filePath, expected, "utf8");
    return false;
  }
  let actual = null;
  try {
    actual = await readFile(filePath, "utf8");
  } catch {}
  if (actual !== expected) {
    console.error(`Identity reconciliation evidence drift: ${path.relative(repoRoot, filePath)}`);
    return true;
  }
  return false;
}

const [universe, active] = await Promise.all([loadUniverse(), loadActiveCandidates()]);
const report = buildReport(universe, active);
const differences = [
  await compareOrWrite(jsonReportPath, stableJson(report)),
  await compareOrWrite(markdownReportPath, markdown(report)),
].filter(Boolean).length;

if (differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Recorded"} market identity reconciliation: ${report.summary.activeCandidateRecords} active records, ${report.summary.blockers} blockers.`);
