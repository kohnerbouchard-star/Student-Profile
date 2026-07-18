import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedRoot = path.join(repoRoot, "docs", "seed-content");
const universeRoot = path.join(seedRoot, "markets", "universe");
const activeRoot = path.join(seedRoot, "markets", "active-subsets");
const jsonReportPath = path.join(seedRoot, "reviews", "market-universe-editorial-collision-review-v1.json");
const markdownReportPath = path.join(seedRoot, "reviews", "market-universe-editorial-collision-review-v1.md");
const checkOnly = process.argv.includes("--check");

const highRiskBrandTerms = "airbus|amazon|apple|blackrock|boeing|coinbase|disney|facebook|fidelity|goldman sachs|google|hyundai|jpmorgan|lockheed martin|mastercard|meta|microsoft|netflix|nvidia|openai|paypal|samsung|sony|spacex|stripe|tesla|tiktok|toyota|visa|walmart|youtube".split("|");
const inappropriateTerms = "apartheid|ethnic cleansing|genocide|nazi|racial supremacy|slave labor|terrorist".split("|");
const suffixPattern = /\b(common shares|convertible series [a-z]{2}|\d+-year design bond|\d+-year design note \d+|sector fund \d+|diversified fund \d+|income trust \d+|index|reference)\b/gi;

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(suffixPattern, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function containsTerm(value, term) {
  return ` ${normalize(value)} `.includes(` ${normalize(term)} `);
}

function sortFinding(left, right) {
  return String(left.country ?? "").localeCompare(String(right.country ?? "")) || String(left.name ?? left.normalizedName ?? "").localeCompare(String(right.name ?? right.normalizedName ?? "")) || String(left.id ?? "").localeCompare(String(right.id ?? ""));
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
  const files = (await readdir(activeRoot)).filter((name) => name.includes("active-market-candidate") && name.endsWith(".json")).sort();
  const issuerMap = new Map();
  const inconsistencies = [];
  for (const file of files) {
    const document = await readJson(path.join(activeRoot, file));
    const country = document.country;
    const declaredIssuers = document.issuerRegistry?.issuers ?? document.issuers ?? [];
    const instruments = document.market?.instruments ?? document.instruments ?? [];
    const candidates = [
      ...declaredIssuers.map((issuer) => ({ id: issuer?.id, name: issuer?.name, country, file })),
      ...instruments.map((instrument) => ({ id: instrument?.issuerId, name: instrument?.issuerName, country, file })),
    ];
    for (const candidate of candidates) {
      if (typeof candidate.id !== "string" || typeof candidate.name !== "string") continue;
      const known = issuerMap.get(candidate.id);
      if (known && known.name !== candidate.name) inconsistencies.push({ issuerId: candidate.id, country, names: [known.name, candidate.name].sort(), files: [known.file, file].sort() });
      else issuerMap.set(candidate.id, candidate);
    }
  }
  return { issuers: [...issuerMap.values()].sort(sortFinding), inconsistencies: inconsistencies.sort(sortFinding) };
}

function buildReport(manifest, records, activeData) {
  const exactNames = new Map();
  const symbols = new Map();
  const issuerNames = new Map();
  const currencyCodes = new Set(Object.values(manifest.countries).map((entry) => entry.currency));
  const exactDuplicateNames = [];
  const duplicateSymbols = [];
  const symbolCurrencyCollisions = [];
  const highRiskBrandTermHits = [];
  const inappropriateTermHits = [];
  const longDisplayNames = [];
  const issuerNameInconsistencies = [];

  for (const record of records) {
    if (exactNames.has(record.name)) exactDuplicateNames.push({ name: record.name, ids: [exactNames.get(record.name), record.id].sort() });
    else exactNames.set(record.name, record.id);
    if (symbols.has(record.symbol)) duplicateSymbols.push({ symbol: record.symbol, ids: [symbols.get(record.symbol), record.id].sort() });
    else symbols.set(record.symbol, record.id);
    if (currencyCodes.has(record.symbol)) symbolCurrencyCollisions.push({ id: record.id, country: record.country, symbol: record.symbol });
    if (record.name.length > 78) longDisplayNames.push({ id: record.id, country: record.country, name: record.name, length: record.name.length });
    for (const term of highRiskBrandTerms) if (containsTerm(record.name, term) || containsTerm(record.issuerName, term)) highRiskBrandTermHits.push({ id: record.id, country: record.country, term, name: record.name, issuerName: record.issuerName });
    for (const term of inappropriateTerms) if (containsTerm(record.name, term) || containsTerm(record.issuerName, term)) inappropriateTermHits.push({ id: record.id, country: record.country, term, name: record.name, issuerName: record.issuerName });
    const knownIssuerName = issuerNames.get(record.issuerId);
    if (knownIssuerName && knownIssuerName !== record.issuerName) issuerNameInconsistencies.push({ issuerId: record.issuerId, names: [knownIssuerName, record.issuerName].sort() });
    else issuerNames.set(record.issuerId, record.issuerName);
  }

  const generatedIssuers = [...issuerNames.entries()].map(([id, name]) => {
    const country = id.split(".")[1] ?? "unknown";
    const countryName = manifest.countries[country]?.displayName ?? country;
    const withoutCountry = normalize(name).replace(new RegExp(`^${normalize(countryName)}\\s+`), "");
    return { country, id, name, normalized: withoutCountry };
  }).sort(sortFinding);

  const normalizedGroups = new Map();
  for (const issuer of generatedIssuers) {
    const group = normalizedGroups.get(issuer.normalized) ?? [];
    group.push(issuer);
    normalizedGroups.set(issuer.normalized, group);
  }
  const crossCountryNearDuplicates = [...normalizedGroups.entries()]
    .filter(([, issuers]) => new Set(issuers.map((entry) => entry.country)).size > 1)
    .map(([normalizedName, issuers]) => ({ normalizedName, issuers: issuers.map(({ normalized, ...entry }) => entry) }))
    .sort(sortFinding);

  const generatedByCountryAndName = new Map(generatedIssuers.map((entry) => [`${entry.country}:${normalize(entry.name)}`, entry]));
  const activeCandidateIdentityConflicts = [];
  for (const activeIssuer of activeData.issuers) {
    const generated = generatedByCountryAndName.get(`${activeIssuer.country}:${normalize(activeIssuer.name)}`);
    if (generated && generated.id !== activeIssuer.id) activeCandidateIdentityConflicts.push({ country: activeIssuer.country, name: activeIssuer.name, generatedId: generated.id, activeId: activeIssuer.id, activeFile: activeIssuer.file });
  }

  const rootCounts = new Map();
  for (const issuer of generatedIssuers.filter((entry) => entry.id.includes(".corporate."))) {
    const countryName = normalize(manifest.countries[issuer.country].displayName);
    const words = normalize(issuer.name).split(" ");
    const root = words[0] === countryName ? words[1] : words[0];
    rootCounts.set(root, (rootCounts.get(root) ?? 0) + 1);
  }
  const templateDensity = [...rootCounts.entries()].map(([root, issuerCount]) => ({ root, issuerCount })).sort((left, right) => right.issuerCount - left.issuerCount || left.root.localeCompare(right.root));

  const blockers = exactDuplicateNames.length + duplicateSymbols.length + symbolCurrencyCollisions.length + inappropriateTermHits.length + issuerNameInconsistencies.length + activeData.inconsistencies.length + activeCandidateIdentityConflicts.length;
  const warnings = highRiskBrandTermHits.length + longDisplayNames.length + crossCountryNearDuplicates.length;
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
      activeCandidateIssuersCompared: activeData.issuers.length,
      blockers,
      warnings,
      exactDuplicateNames: exactDuplicateNames.length,
      duplicateSymbols: duplicateSymbols.length,
      symbolCurrencyCollisions: symbolCurrencyCollisions.length,
      inappropriateTermHits: inappropriateTermHits.length,
      highRiskBrandTermHits: highRiskBrandTermHits.length,
      universeIssuerNameInconsistencies: issuerNameInconsistencies.length,
      activeCandidateIssuerInconsistencies: activeData.inconsistencies.length,
      activeCandidateIdentityConflicts: activeCandidateIdentityConflicts.length,
      crossCountryNearDuplicateGroups: crossCountryNearDuplicates.length,
      longDisplayNames: longDisplayNames.length,
    },
    findings: {
      exactDuplicateNames: exactDuplicateNames.sort(sortFinding),
      duplicateSymbols: duplicateSymbols.sort(sortFinding),
      symbolCurrencyCollisions: symbolCurrencyCollisions.sort(sortFinding),
      inappropriateTermHits: inappropriateTermHits.sort(sortFinding),
      highRiskBrandTermHits: highRiskBrandTermHits.sort(sortFinding),
      universeIssuerNameInconsistencies: issuerNameInconsistencies.sort(sortFinding),
      activeCandidateIssuerInconsistencies: activeData.inconsistencies,
      activeCandidateIdentityConflicts: activeCandidateIdentityConflicts.sort(sortFinding),
      crossCountryNearDuplicates,
      longDisplayNames: longDisplayNames.sort(sortFinding),
      templateDensity,
    },
    limitations: [
      "This deterministic lexical screen is not legal trademark clearance.",
      "Cultural, linguistic, pronunciation, and market-confusion review still requires human editorial judgment.",
      "A zero-hit brand screen does not prove that a fictional name is safe for public commercial use.",
      "Generated definition-library issuers remain separate from curated active-market issuers until explicit reconciliation is approved.",
    ],
  };
}

function markdown(report) {
  const summary = report.summary;
  return `# Market Universe Editorial Collision Review v1\n\nStatus: automated lexical screen complete; human editorial approval pending  \nProduction authorization: false\n\n## Scope\n\n- ${summary.universeRecords} universe records;\n- ${summary.generatedIssuerIds} generated issuer or administrator IDs;\n- ${summary.activeCandidateIssuersCompared} curated active-candidate issuers compared.\n\n## Automated result\n\n- blocking structural or identity findings: **${summary.blockers}**;\n- warning groups requiring human review: **${summary.warnings}**;\n- exact duplicate names: ${summary.exactDuplicateNames};\n- duplicate symbols: ${summary.duplicateSymbols};\n- symbol/currency collisions: ${summary.symbolCurrencyCollisions};\n- inappropriate-term hits: ${summary.inappropriateTermHits};\n- high-risk real-brand term hits: ${summary.highRiskBrandTermHits};\n- universe issuer ID/name inconsistencies: ${summary.universeIssuerNameInconsistencies};\n- active-candidate issuer inconsistencies: ${summary.activeCandidateIssuerInconsistencies};\n- active-candidate identity conflicts: ${summary.activeCandidateIdentityConflicts};\n- cross-country normalized near-duplicate groups: ${summary.crossCountryNearDuplicateGroups};\n- display names longer than 78 characters: ${summary.longDisplayNames}.\n\n## Interpretation\n\nThis report closes the deterministic collision-screening step only. It does not approve names for production or public commercial use. Reviewers must still evaluate pronunciation, country voice, cultural associations, unintended resemblance, confusion risk, and trademark exposure.\n\nThe complete machine-readable findings are in \`market-universe-editorial-collision-review-v1.json\`.\n`;
}

const { manifest, records } = await loadUniverse();
const activeData = await loadActiveCandidates();
const report = buildReport(manifest, records, activeData);
const expectedJson = `${JSON.stringify(report, null, 2)}\n`;
const expectedMarkdown = markdown(report);

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

const drift = (await compareOrWrite(jsonReportPath, expectedJson)) || (await compareOrWrite(markdownReportPath, expectedMarkdown));
if (drift || report.summary.blockers > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Generated"} editorial screen: ${report.summary.blockers} blockers and ${report.summary.warnings} warning groups.`);
