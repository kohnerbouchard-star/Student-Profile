import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const universeRoot = path.join(seedRoot, "markets", "universe");
const activeRoot = path.join(seedRoot, "markets", "active-subsets");
const jsonPath = path.join(seedRoot, "reviews", "market-identity-reconciliation-audit-v1.json");
const markdownPath = path.join(seedRoot, "reviews", "market-identity-reconciliation-audit-v1.md");
const checkOnly = process.argv.includes("--check");

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadUniverse() {
  const manifest = await readJson(path.join(universeRoot, "manifest-v1.json"));
  const records = [];
  for (const [country, descriptor] of Object.entries(manifest.countries ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    const lines = (await readFile(path.join(seedRoot, "markets", descriptor.file), "utf8")).split(/\r?\n/).filter(Boolean);
    if (lines.length !== descriptor.instrumentCount) throw new Error(`${country} has ${lines.length} records; expected ${descriptor.instrumentCount}.`);
    records.push(...lines.map((line) => JSON.parse(line)));
  }
  if (records.length !== manifest.totalInstrumentCount) throw new Error(`Universe total mismatch: ${records.length}.`);
  return { manifest, records };
}

async function loadActive() {
  const fileNames = (await readdir(activeRoot)).filter((name) => name.includes("active-market-candidate") && name.endsWith(".json")).sort();
  const records = [];
  for (const fileName of fileNames) {
    const document = await readJson(path.join(activeRoot, fileName));
    const market = document.market ?? document;
    const instruments = market.instruments ?? document.instruments ?? [];
    for (const instrument of instruments) {
      records.push({
        ...instrument,
        country: instrument.country ?? market.country ?? document.country,
        currency: instrument.currency ?? market.currency ?? document.currency,
        exchange: instrument.exchange ?? market.exchange ?? document.exchange,
      });
    }
  }
  return records;
}

function counts(records, field) {
  return Object.fromEntries([...records.reduce((map, record) => {
    const key = record[field] ?? "<missing>";
    map.set(key, (map.get(key) ?? 0) + 1);
    return map;
  }, new Map()).entries()].sort(([a], [b]) => a.localeCompare(b)));
}

function buildReport(universe, active) {
  const bySymbol = new Map(universe.records.map((record) => [record.symbol, record]));
  const byId = new Map(universe.records.map((record) => [record.id, record]));
  let exact = 0;
  let conflicts = 0;
  let missing = 0;
  let idConflicts = 0;
  let exchangeMismatches = 0;
  const affectedCountries = new Set();

  for (const record of active) {
    const match = bySymbol.get(record.symbol);
    if (!match) {
      missing += 1;
      affectedCountries.add(record.country);
      continue;
    }
    const fields = ["id", "symbol", "name", "country", "currency", "exchange", "instrumentType", "issuerId", "issuerName"];
    if (fields.every((field) => (record[field] ?? null) === (match[field] ?? null))) exact += 1;
    else {
      conflicts += 1;
      affectedCountries.add(record.country);
      if ((record.exchange ?? null) !== (match.exchange ?? null)) exchangeMismatches += 1;
    }
    const idMatch = byId.get(record.id);
    if (idMatch && idMatch.symbol !== record.symbol) {
      idConflicts += 1;
      affectedCountries.add(record.country);
    }
  }

  const blockers = conflicts + missing + idConflicts;
  return {
    schemaVersion: "econovaria-market-identity-reconciliation-audit-v1",
    generatedAt: "2026-07-19",
    sourceUniversePackId: universe.manifest.packId,
    sourceUniverseVersion: universe.manifest.version,
    reviewStatus: blockers === 0 ? "canonical-identities-reconciled" : "canonicalization-required",
    productionAuthorized: false,
    decisions: {
      overlappingSymbolAuthority: "curated-active-candidate",
      publicInstitutionRoleFamilies: "approved-for-country-qualified-design-use",
      generatedCorporateRoots: "placeholder-only-not-approved-for-public-activation",
      activationRule: "No generated and curated records may coexist as separate instruments under one symbol.",
    },
    summary: {
      universeRecords: universe.records.length,
      activeCandidateRecords: active.length,
      countriesWithActiveCandidates: [...new Set(active.map((record) => record.country))].sort(),
      exactCanonicalMatches: exact,
      conflictingSymbolIdentities: conflicts,
      missingUniverseSymbols: missing,
      activeIdConflicts: idConflicts,
      exchangeMismatches,
      affectedCountries: [...affectedCountries].sort(),
      blockers,
      activeRecordsByCountry: counts(active, "country"),
      activeRecordsByInstrumentType: counts(active, "instrumentType"),
    },
    requiredResolution: [
      "Overlay curated active-candidate identities into universe records keyed by country and symbol.",
      "Preserve curated IDs referenced by enrichment and simulation evidence unless every reference is migrated atomically.",
      "Regenerate country checksums and rerun universe, issuer, editorial, preflight, and simulation-reference audits.",
      "Keep activationAuthorized false and runtimeSupport unverified.",
    ],
  };
}

function markdown(report) {
  const s = report.summary;
  const rows = Object.entries(s.activeRecordsByCountry).map(([country, count]) => `| ${country} | ${count} |`).join("\n");
  return `# Market Identity Reconciliation Audit v1\n\nStatus: **${report.reviewStatus}**  \nProduction authorization: false\n\n## Result\n\n- universe records checked: ${s.universeRecords};\n- curated active-candidate records checked: ${s.activeCandidateRecords};\n- exact canonical matches: ${s.exactCanonicalMatches};\n- conflicting reused-symbol identities: ${s.conflictingSymbolIdentities};\n- missing universe symbols: ${s.missingUniverseSymbols};\n- active-ID conflicts: ${s.activeIdConflicts};\n- exchange mismatches: ${s.exchangeMismatches};\n- blocking findings: **${s.blockers}**.\n\n## Coverage\n\n| Country | Active records |\n|---|---:|\n${rows}\n\n## Decision\n\nThe curated active-candidate identity is canonical for every overlapping symbol because enrichment and simulation evidence already reference those IDs. Generated identities are placeholders and may not coexist as separate instruments under the same symbol.\n\nThe ten country-qualified public-institution role families are approved for design use. The fifteen generated corporate roots remain placeholder taxonomy and are not approved for public activation.\n\n## Required correction\n\n1. Overlay curated active IDs, names, issuer IDs, issuer names, exchanges, and compatible identity fields into matching universe records.\n2. Preserve active enrichment and simulation references or migrate them atomically.\n3. Regenerate checksums and rerun all seed-content audits.\n4. Keep runtime activation disabled.\n`;
}

async function compareOrWrite(filePath, expected) {
  if (!checkOnly) {
    await writeFile(filePath, expected, "utf8");
    return false;
  }
  let actual = null;
  try { actual = await readFile(filePath, "utf8"); } catch {}
  if (actual !== expected) {
    console.error(`Identity reconciliation evidence drift: ${path.relative(repoRoot, filePath)}`);
    return true;
  }
  return false;
}

const [universe, active] = await Promise.all([loadUniverse(), loadActive()]);
const report = buildReport(universe, active);
const differences = [
  await compareOrWrite(jsonPath, `${JSON.stringify(report, null, 2)}\n`),
  await compareOrWrite(markdownPath, markdown(report)),
].filter(Boolean).length;
if (differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Recorded"} ${report.summary.activeCandidateRecords} active identities with ${report.summary.blockers} blockers.`);
