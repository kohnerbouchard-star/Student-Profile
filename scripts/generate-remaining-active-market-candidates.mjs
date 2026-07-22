import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const universeRoot = path.join(seedRoot, "markets", "universe");
const activeRoot = path.join(seedRoot, "markets", "active-subsets");
const rolloutPath = path.join(activeRoot, "active-market-rollout-status-v1.json");
const checkOnly = process.argv.includes("--check");

const countries = ["dravenlok", "eldoran", "lumenor", "syndalis", "valerion", "xalvoria"];
const allocation = {
  common_equity: 12,
  preferred_convertible: 1,
  corporate_bond: 4,
  sovereign_public_bond: 2,
  etf_fund: 2,
  listed_trust: 1,
  index: 1,
  commodity_reference: 1,
};

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function issuerType(record) {
  if (record.instrumentType === "index") return "exchange-administrator";
  if (record.instrumentType === "commodity_reference") return "benchmark-administrator";
  if (record.instrumentType === "etf_fund") return "fund-manager";
  if (record.instrumentType === "listed_trust") return "listed-trust";
  if (record.instrumentType === "sovereign_public_bond") return "sovereign-or-public-agency";
  return "corporation";
}

function select(records) {
  const selected = [];
  for (const [instrumentType, count] of Object.entries(allocation)) {
    const candidates = records
      .filter((record) => record.instrumentType === instrumentType)
      .sort((left, right) => left.id.localeCompare(right.id));
    if (candidates.length < count) throw new Error(`${instrumentType} has ${candidates.length} records; ${count} are required.`);
    selected.push(...candidates.slice(0, count));
  }
  selected.sort((left, right) => left.symbol.localeCompare(right.symbol));
  return selected;
}

function buildIssuers(instruments, country, currency, exchange) {
  const byId = new Map();
  for (const instrument of instruments) {
    const current = byId.get(instrument.issuerId) ?? {
      id: instrument.issuerId,
      name: instrument.issuerName,
      issuerType: issuerType(instrument),
      reportingCurrency: currency,
      primaryExchange: exchange,
      sectorIds: [],
      instrumentIds: [],
      financialProfileStatus: "not-started",
      activationAuthorized: false,
    };
    if (current.name !== instrument.issuerName) throw new Error(`${instrument.issuerId} has inconsistent names in ${country}.`);
    if (!current.sectorIds.includes(instrument.sector)) current.sectorIds.push(instrument.sector);
    current.instrumentIds.push(instrument.id);
    byId.set(instrument.issuerId, current);
  }
  return [...byId.values()].map((issuer) => ({
    ...issuer,
    sectorIds: issuer.sectorIds.sort(),
    instrumentIds: issuer.instrumentIds.sort(),
  })).sort((left, right) => left.id.localeCompare(right.id));
}

async function compareOrWrite(filePath, expected) {
  let current = null;
  try { current = await readFile(filePath, "utf8"); } catch {}
  if (current === expected) return false;
  if (checkOnly) {
    console.error(`Active-candidate drift: ${path.relative(repoRoot, filePath)}`);
    return true;
  }
  await writeFile(filePath, expected, "utf8");
  return true;
}

const manifest = await readJson(path.join(universeRoot, "manifest-v1.json"));
let differences = 0;
const generated = [];

for (const country of countries) {
  const descriptor = manifest.countries?.[country];
  if (!descriptor) throw new Error(`Universe manifest does not define ${country}.`);
  const sourcePath = path.join(seedRoot, "markets", descriptor.file);
  const records = (await readFile(sourcePath, "utf8")).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
  const instruments = select(records);
  const issuers = buildIssuers(instruments, country, descriptor.currency, descriptor.exchange);
  const candidate = {
    packId: `econovaria.active-market-candidate-and-issuers.${country}.v1`,
    status: "selection-complete-enrichment-pending",
    identityAuthority: "universe-derived-selection",
    activationAuthorized: false,
    country,
    market: {
      packId: `econovaria.active-market-subset.${country}.candidate.v1`,
      status: "selection-complete-enrichment-pending",
      identityAuthority: "universe-derived-selection",
      activationAuthorized: false,
      country,
      currency: descriptor.currency,
      exchange: descriptor.exchange,
      instrumentCount: instruments.length,
      allocation,
      selectionPolicy: "deterministic first-by-stable-ID within the approved 24-instrument allocation",
      financialEnrichmentStatus: "not-started",
      simulationStatus: "not-run",
      instruments,
    },
    issuerRegistry: {
      registryId: `econovaria.active-market-issuer-registry.${country}.candidate.v1`,
      status: "selection-complete-enrichment-pending",
      activationAuthorized: false,
      country,
      issuerCount: issuers.length,
      issuers,
    },
  };
  if (instruments.length !== 24) throw new Error(`${country} selected ${instruments.length} instruments; expected 24.`);
  const fileName = `${country}-active-market-candidate-and-issuers-v1.json`;
  if (await compareOrWrite(path.join(activeRoot, fileName), `${JSON.stringify(candidate)}\n`)) differences += 1;
  generated.push({ country, fileName, instrumentCount: instruments.length, issuerCount: issuers.length });
}

const rollout = await readJson(rolloutPath);
const generatedCountries = new Set(countries);
rollout.status = "all-country-selection-complete-enrichment-in-progress";
rollout.countries = rollout.countries.map((entry) => generatedCountries.has(entry.country) ? {
  ...entry,
  selectionStatus: "complete-universe-derived",
  issuerRegistryStatus: "complete-selection-layer",
  financialEnrichmentStatus: "not-started",
  structuralValidationStatus: "candidate-generated-pending-audit",
  simulationStatus: "not-run",
  activationAuthorized: false,
} : entry);
rollout.selectionSummary = {
  generatedAt: "2026-07-19",
  selectedCountries: 10,
  selectedInstruments: 240,
  curatedCountries: 4,
  universeDerivedCountries: 6,
  activationAuthorized: false,
};
if (await compareOrWrite(rolloutPath, `${JSON.stringify(rollout)}\n`)) differences += 1;

if (checkOnly && differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Generated"} six remaining candidates: ${generated.map((entry) => `${entry.country}:${entry.instrumentCount}/${entry.issuerCount}`).join(", ")}.`);
