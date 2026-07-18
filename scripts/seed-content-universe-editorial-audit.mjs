import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const universeRoot = path.join(seedRoot, "markets", "universe");
const activeRoot = path.join(seedRoot, "markets", "active-subsets");
const reportJsonPath = path.join(seedRoot, "reviews", "market-universe-editorial-collision-review-v1.json");
const reportMarkdownPath = path.join(seedRoot, "reviews", "market-universe-editorial-collision-review-v1.md");
const checkOnly = process.argv.includes("--check");

const highRiskBrandTerms = [
  "airbus", "amazon", "apple", "blackrock", "boeing", "coinbase", "disney", "facebook", "fidelity",
  "goldman sachs", "google", "hyundai", "jpmorgan", "lockheed martin", "mastercard", "meta", "microsoft",
  "netflix", "nvidia", "openai", "paypal", "samsung", "sony", "spacex", "stripe", "tesla", "tiktok",
  "toyota", "visa", "walmart", "youtube",
];
const inappropriateTerms = [
  "apartheid", "ethnic cleansing", "genocide", "nazi", "racial supremacy", "slave labor", "terrorist",
];
const suffixPattern = /\b(common shares|convertible series [a-z]{2}|\d+-year design bond|\d+-year design note \d+|sector fund \d+|diversified fund \d+|income trust \d+|index|reference)\b/gi;

function normalize(value) {
  return value.toLowerCase().replace(suffixPattern, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function wordMatch(value, term) {
  const normalizedValue = ` ${normalize(value)} `;
  const normalizedTerm = ` ${normalize(term)} `;
  return normalizedValue.includes(normalizedTerm);
}

function compareRecords(left, right) {
  return left.country.localeCompare(right.country) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function loadUniverse() {
  const manifest = await readJson(path.join(universeRoot, "manifest-v1.json"));
  const records = [];
  for (const [country, descriptor] of Object.entries(manifest.countries ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
    const filePath = path.join(seedRoot, "markets", descriptor.file);
    const lines = (await readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean);
    if (lines.length !== descriptor.instrumentCount) throw new Error(`${country} has ${lines.length} records; expected ${descriptor.instrumentCount}.`);
    records.push(...lines.map((line) => JSON.parse(line)));
  }
  if (records.length !== manifest.totalInstrumentCount) throw new Error(`Loaded ${records.length} universe records; expected ${manifest.totalInstrumentCount}.`);
  return { manifest, records };
}

async function loadActiveCandidates() {
  const entries = (await readdir(activeRoot)).filter((name) => name.includes("active-market-candidate") && name.endsWith(".json")).sort();
  const issuers = [];
  for (const fileName of entries) {
    const document = await readJson(path.join(activeRoot, fileName));
    const country = document.country;
    const candidateIssuers = document.issuerRegistry?.issuers ?? document.issuers ?? [];
    for (const issuer of candidateIssuers) {
      if (typeof issuer?.id === "string" && typeof issuer?.name === "string") issuers.push({ country, id: issuer.id, name: issuer.name, file: fileName });
    }
  }
  return issuers.sort(compareRecords);
}

function buildReport(manifest, records, activeIssuers) {
  const exactNameOwners = new Map();
  const normalizedIssuerOwners = new Map();
  const symbolOwners = new Map();
  const currencyCodes = new Set(Object.values(manifest.countries).map((entry) => entry.currency));
  const exactDuplicateNames = [];
  const duplicateSymbols = [];
  const symbolCurrencyCollisions = [];
  const brandTermHits = [];
  const inappropriateTermHits = [];
  const longDisplayNames = [];
  const issuerNameInconsistencies = [];
  const issuerNames = new Map();

  for (const record of records) {
    const exactOwner = exactNameOwners.get(record.name);
    if (exactOwner) exactDuplicateNames.push({ name: record.name, ids: [exactOwner.id, record.id].sort() });
    else exactNameOwners.set(record.name, record);

    const symbolOwner = symbolOwners.get(record.symbol);
    if (symbolOwner) duplicateSymbols.push({ symbol: record.symbol, ids: [symbolOwner.id, record.id].sort() });
    else symbolOwners.set(record.symbol, record);

    if (currencyCodes.has(record.symbol)) symbolCurrencyCollisions.push({ id: record.id, symbol: record.symbol, country: record.country });
    if (record.name.length > 78) longDisplayNames.push({ id: record.id, country: record.country, name: record.name, length: record.name.length });

    for (const term of highRiskBrandTerms) if (wordMatch(record.name, term) || wordMatch(record.issuerName, term)) brandTermHits.push({ id: record.id, country: record.country, term, name: record.name, issuerName: record.issuerName });
    for (const term of inappropriateTerms) if (wordMatch(record.name, term) || wordMatch(record.issuerName, term)) inappropriateTermHits.push({ id: record.id, country: record.country, term, name: record.name, issuerName: record.issuerName });

    const knownIssuerName = issuerNames.get(record.issuerId);
    if (knownIssuerName && knownIssuerName !== record.issuerName) issuerNameInconsistencies.push({ issuerId: record.issuerId, names: [knownIssuerName, record.issuerName].sort() });
    else issuerNames.set(record.issuerId, record.issuerName);
  }

  const generatedIssuers = [...issuerNames.entries()].map(([id, name]) => {
    const country = id.split(".")[1] ?? "unknown";
    const countryName = manifest.countries[country]?.displayName ?? country;
    const normalized = normalize(name).replace(new RegExp(`^${normalize(countryName)}\\s+`), "");
    return { country, id, name, normalized };
  }).sort(compareRecords);

  for (const issuer of generatedIssuers) {
    const owners = normalizedIssuerOwners.get(issuer.normalized) ?? [];
    owners.push(issuer);
    normalizedIssuerOwners.set(issuer.normalized, owners);
  }
  const crossCountryNearDuplicates = [...normalizedIssuerOwners.entries()]
    .filter(([, owners]) => new Set(owners.map((entry) => entry.country)).size > 1)
    .map(([normalizedName, owners]) => ({ normalizedName, issuers: owners.map(({ normalized, ...entry }) => entry) }))
    .sort((left, right) => left.normalizedName.localeCompare(right.normalizedName));

  const generatedByCountryAndNormalized = new Map(generatedIssuers.map((entry) => [`${entry.country}:${normalize(entry.name)}`, entry]));
  const activeCandidateIdentityConflicts = [];
  for (const activeIssuer of activeIssuers) {
    const generated = generatedByCountryAndNormalized.get(`${activeIssuer.country}:${normalize(activeIssuer.name)}`);
    if (generated && generated.id !== activeIssuer.id) activeCandidateIdentityConflicts.push({ country: activeIssuer.country, name: activeIssuer.name, generatedId: generated.id, activeId: activeIssuer.id, activeFile: activeIssuer.file });
  }

  const templateRootCounts = new Map();
  for (const issuer of generatedIssuers.filter((entry) => entry.id.includes(".corporate."))) {
    const countryName = normalize(manifest.countries[issuer.country].displayName);
    const words = normalize(issuer.name).split(" ");
    const root = words[0] === countryName ? words[1] : words[0];
    templateRootCounts.set(root, (templateRootCounts.get(root) ?? 0) + 1);
  }
  const templateDensity = [...templateRootCounts.entries()].map(([root, issuerCount]) => ({ root, issuerCount })).sort((left, right) => right.issuerCount - left.issuerCount || left.root.localeCompare(right.root));

  const blockers = exactDuplicateNames.length + duplicateSymbols.length + symbolCurrencyCollisions.length + inappropriateTermHits.length + issuerNameInconsistencies.length + activeCandidateIdentityConflicts.length;
  const warnings = brandTermHits.length + longDisplayNames.length + crossCountryNearDuplicates.length;

  return {
    schemaVersion: "econovaria-market-universe-editorial-review-v1",
    generatedAt: "2026-07-19",
    sourcePackId: manifest.packId,
    sourceVersion: manifest.version,
    reviewStatus: "automated-screen-complete-human-editorial-review-pending",
    productionAuthorized: false,
    summary: {
      universeRecords: records.length,
      generatedIssuerIds: generatedIssuers.length,
      activeCandidateIssuersCompared: activeIssuers.length,
      blockers,
      warnings,
      exactDuplicateNames: exactDuplicateNames.length,
      duplicateSymbols: duplicateSymbols.length,
      symbolCurrencyCollisions: symbolCurrencyCollisions.length,
      inappropriateTermHits: inappropriateTermHits.length,
      highRiskBrandTermHits: brandTermHits.length,
      issuerNameInconsistencies: issuerNameInconsistencies.length,
      activeCandidateIdentityConflicts: activeCandidateIdentityConflicts.length,
      crossCountryNearDuplicateGroups: crossCountryNearDuplicates.length,
      longDisplayNames: longDisplayNames.length,
    },
    findings: {
      exactDuplicateNames,
      duplicateSymbols,
      symbolCurrencyCollisions,
      inappropriateTermHits,
      highRiskBrandTermHits: brandTermHits.sort(compareRecords),
      issuerNameInconsistencies,
      activeCandidateIdentityConflicts,
      crossCountryNearDuplicates,
      longDisplayNames: longDisplayNames.sort(compareRecords),
      templateDensity,
    },
    limitations: [
      "This is a deterministic lexical screen, not legal trademark clearance.",
      "Cultural, linguistic, pronunciation, and market-confusion review still requires human editorial judgment.",
      "A zero-hit brand screen does not prove that a fictional name is safe for public commercial use.",
      "Generated definition-library issuers remain separate from curated active-market issuers until explicit reconciliation is approved.",
    ],
  };
}

function markdown(report) {
  const summary = report.summary;
  return `# Market Universe Editorial Collision Review v1\n\nStatus: automated lexical screen complete; human editorial approval pending  \nProduction authorization: false\n\n## Scope\n\n- ${summary.universeRecords} universe records;\n- ${summary.generatedIssuerIds} generated issuer or administrator IDs;\n- ${summary.activeCandidateIssuersCompared} curated active-candidate issuers compared.\n\n## Automated result\n\n- blocking structural or identity findings: **${summary.blockers}**;\n- warning groups requiring human review: **${summary.warnings}**;\n- exact duplicate names: ${summary.exactDuplicateNames};\n- duplicate symbols: ${summary.duplicateSymbols};\n- symbol/currency collisions: ${summary.symbolCurrencyCollisions};\n- inappropriate-term hits: ${summary.inappropriateTermHits};\n- high-risk real-brand term hits: ${summary.highRiskBrandTermHits};\n- issuer ID/name inconsistencies: ${summary.issuerNameInconsistencies};\n- active-candidate identity conflicts: ${summary.activeCandidateIdentityConflicts};\n- cross-country normalized near-duplicate groups: ${summary.crossCountryNearDuplicateGroups};\n- display names longer than 78 characters: ${summary.longDisplayNames}.\n\n## Interpretation\n\nThis report closes the deterministic collision-screening step only. It does not approve names for production or public commercial use. Reviewers must still evaluate pronunciation, country voice, cultural associations, unintended resemblance, confusion risk, and trademark exposure.\n\nThe complete machine-readable findings are in \`market-universe-editorial-collision-review-v1.json\`.\n`;
}

const { manifest, records } = await loadUniverse();
const activeIssuers = await loadActiveCandidates();
const report = buildReport(manifest, records, activeIssuers);
const jsonContent = `${JSON.stringify(report, null, 2)}\n`;
const markdownContent = markdown(report);

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
    console.error(`Editorial audit drift: ${path.relative(repoRoot, filePath)}`);
    return true;
  }
  return false;
}

const drift = (await compareOrWrite(reportJsonPath, jsonContent)) || (await compareOrWrite(reportMarkdownPath, markdownContent));
if (drift || report.summary.blockers > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Generated"} editorial screen: ${report.summary.blockers} blockers and ${report.summary.warnings} warning groups.`);
