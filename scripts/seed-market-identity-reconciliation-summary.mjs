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
  const authorities = new Map();
  for (const fileName of fileNames) {
    const document = await readJson(path.join(activeRoot, fileName));
    const market = document.market ?? document;
    const instruments = market.instruments ?? document.instruments ?? [];
    const authority = document.identityAuthority ?? market.identityAuthority ?? "curated-active-candidate";
    authorities.set(authority, (authorities.get(authority) ?? 0) + instruments.length);
    for (const instrument of instruments) {
      records.push({
        ...instrument,
        country: instrument.country ?? market.country ?? document.country,
        currency: instrument.currency ?? market.currency ?? document.currency,
        exchange: instrument.exchange ?? market.exchange ?? document.exchange,
        identityAuthority: authority,
      });
    }
  }
  return { records, authorities };
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

  for (const record of active.records) {
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
    reviewStatus: blockers === 0 ? "active-identities-reconciled" : "canonicalization-required",
    productionAuthorized: false,
    decisions: {
      curatedPackAuthority: "Curated active candidates override generated identity fields for their overlapping symbols.",
      universeDerivedPackAuthority: "Universe-derived selections inherit canonical universe identity without remapping.",
      publicInstitutionRoleFamilies: "approved-for-country-qualified-design-use",
      generatedCorporateRoots: "placeholder-only-not-approved-for-public-activation",
      activationRule: "No candidate may diverge from its canonical universe identity or coexist as a second instrument under one symbol.",
    },
    summary: {
      universeRecords: universe.records.length,
      activeCandidateRecords: active.records.length,
      recordsByIdentityAuthority: Object.fromEntries([...active.authorities.entries()].sort(([a], [b]) => a.localeCompare(b))),
      countriesWithActiveCandidates: [...new Set(active.records.map((record) => record.country))].sort(),
      exactCanonicalMatches: exact,
      conflictingSymbolIdentities: conflicts,
      missingUniverseSymbols: missing,
      activeIdConflicts: idConflicts,
      exchangeMismatches,
      affectedCountries: [...affectedCountries].sort(),
      blockers,
      activeRecordsByCountry: counts(active.records, "country"),
      activeRecordsByInstrumentType: counts(active.records, "instrumentType"),
    },
    requiredInvariants: [
      "Preserve curated IDs referenced by enrichment and simulation evidence unless every reference is migrated atomically.",
      "Require universe-derived candidates to remain byte-equivalent on canonical identity fields.",
      "Regenerate country checksums and rerun universe, issuer, editorial, preflight, and simulation-reference audits after identity changes.",
      "Keep activationAuthorized false and runtimeSupport unverified until runtime capability and calibration gates pass.",
    ],
  };
}

function markdown(report) {
  const s = report.summary;
  const rows = Object.entries(s.activeRecordsByCountry).map(([country, count]) => `| ${country} | ${count} |`).join("\n");
  const authorityRows = Object.entries(s.recordsByIdentityAuthority).map(([authority, count]) => `| ${authority} | ${count} |`).join("\n");
  return `# Market Identity Reconciliation Audit v1\n\nStatus: **${report.reviewStatus}**\nProduction authorization: false\n\n## Result\n\n- universe records checked: ${s.universeRecords};\n- active-candidate records checked: ${s.activeCandidateRecords};\n- exact canonical matches: ${s.exactCanonicalMatches};\n- conflicting reused-symbol identities: ${s.conflictingSymbolIdentities};\n- missing universe symbols: ${s.missingUniverseSymbols};\n- active-ID conflicts: ${s.activeIdConflicts};\n- exchange mismatches: ${s.exchangeMismatches};\n- blocking findings: **${s.blockers}**.\n\n## Identity authority\n\n| Authority | Records |\n|---|---:|\n${authorityRows}\n\nCurated active candidates override generated identity fields for their symbols because enrichment and simulation evidence already references those IDs. Universe-derived selections inherit canonical identity directly and do not override the universe.\n\n## Coverage\n\n| Country | Active records |\n|---|---:|\n${rows}\n\n## Required invariants\n\n1. Preserve curated IDs or migrate every reference atomically.\n2. Keep universe-derived selections identical on canonical identity fields.\n3. Regenerate checksums and rerun all seed-content audits after identity changes.\n4. Keep runtime activation disabled until capability, enrichment, simulation, and release gates pass.\n`;
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
