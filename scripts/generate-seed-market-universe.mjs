import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const universeRoot = path.join(repoRoot, "docs", "seed-content", "markets", "universe");
const manifestPath = path.join(universeRoot, "manifest-v1.json");
const checkOnly = process.argv.includes("--check");

const allocationPerCountry = {
  commodity_reference: 15,
  common_equity: 150,
  corporate_bond: 60,
  etf_fund: 20,
  index: 15,
  listed_trust: 15,
  preferred_convertible: 10,
  sovereign_public_bond: 35,
};

const countryPrefixes = {
  dravenlok: "DR",
  eldoran: "EL",
  lumenor: "LU",
  northreach: "NR",
  solvend: "SV",
  syndalis: "SY",
  thaloris: "TH",
  valerion: "VA",
  xalvoria: "XA",
  yrethia: "YR",
};

const sectors = {
  dravenlok: "Steel|Industrial Machinery|Vehicle Systems|Rail Engineering|Defense Manufacturing|Industrial Energy|Chemicals|Mining Equipment|Heavy Logistics|Factory Automation",
  eldoran: "Agriculture|Food Processing|Rail Logistics|Wholesale Markets|Commodity Services|Consumer Staples|Cold Storage|Farm Equipment|Packaging|Rural Finance",
  lumenor: "Education|Media|Publishing|Arbitration|Civic Technology|Research|Professional Services|Legal Services|Public Data|Creative Industries",
  northreach: "Strategic Minerals|Energy|Northern Logistics|Industrial Engineering|Hardened Infrastructure|Mining Services|Grid Systems|Cold-Climate Construction|Resource Processing|Security Technology",
  solvend: "Artificial Intelligence|Aerospace|Precision Engineering|Semiconductors|Robotics|Research Services|Advanced Materials|Photonics|Autonomous Systems|Scientific Instruments",
  syndalis: "Cybersecurity|Financial Technology|Payments|Data Centers|Cloud Infrastructure|Digital Identity|Market Data|Network Systems|Compliance Technology|Encryption Services",
  thaloris: "Ship Repair|Salvage|Re-export Commerce|Warehousing|Flexible Logistics|Marine Equipment|Port Services|Freight Brokerage|Industrial Recovery|Customs Services",
  valerion: "Hydropower|Water Infrastructure|Green Finance|Tourism|Premium Services|Clean Transit|Environmental Engineering|Renewable Equipment|Hospitality|Sustainable Construction",
  xalvoria: "Banking|Infrastructure Finance|Construction|Luxury Manufacturing|Energy Investment|Sovereign Capital|Real Estate|Asset Management|Project Finance|Premium Transport",
  yrethia: "Shipping|Port Operations|Marine Insurance|Trade Finance|Customs Technology|Maritime Services|Freight Forwarding|Ship Management|Cargo Security|Ocean Data",
};

const roots = "Capital|Northern|Southern|Eastern|Western|Central|Meridian|Frontier|Civic|National|Summit|Harbor|River|Crown|Horizon".split("|");
const publicAuthorities = "National Treasury|Infrastructure Authority|Development Bank|Energy Board|Transport Agency|Resilience Fund|Public Investment Office".split("|");
const classCodes = {
  common_equity: "E",
  preferred_convertible: "P",
  corporate_bond: "B",
  sovereign_public_bond: "G",
  etf_fund: "F",
  listed_trust: "T",
  index: "X",
  commodity_reference: "R",
};

function alphaSequence(index) {
  const value = index - 1;
  return String.fromCharCode(65 + Math.floor(value / 26), 65 + (value % 26));
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function classification(sequence) {
  return {
    riskClass: ["low", "moderate", "elevated", "high"][(sequence - 1) % 4],
    liquidityClass: ["high", "moderate", "limited"][(sequence - 1) % 3],
  };
}

function baseRecord(config, type, sequence, name, issuerId, issuerName, sector) {
  return {
    id: `instrument.${config.key}.${type}.${String(sequence).padStart(3, "0")}.v1`,
    symbol: `${config.prefix}${classCodes[type]}${alphaSequence(sequence)}`,
    name,
    country: config.key,
    currency: config.currency,
    exchange: config.exchange,
    instrumentType: type,
    assetClass: type.includes("bond") ? "fixed-income" : type === "commodity_reference" ? "reference" : type === "index" ? "index" : ["etf_fund", "listed_trust"].includes(type) ? "collective-investment" : "equity",
    sector: slug(sector),
    issuerId,
    issuerName,
    seedStatus: "design-candidate",
    runtimeSupport: "unverified",
    activationAuthorized: false,
  };
}

function buildCountry(config) {
  const records = [];
  const equityIssuers = [];
  let sequence = 0;
  for (const root of roots) {
    for (const sector of config.sectors) {
      sequence += 1;
      const issuerName = `${config.displayName} ${root} ${sector}`;
      const issuerId = `issuer.${config.key}.corporate.${String(sequence).padStart(3, "0")}.v1`;
      equityIssuers.push({ issuerId, issuerName, sector });
      records.push({
        ...baseRecord(config, "common_equity", sequence, `${issuerName} Common Shares`, issuerId, issuerName, sector),
        listingRole: sequence <= 30 ? "core-market" : sequence <= 90 ? "expanded-market" : "specialist-market",
        marketCapTier: ["large", "mid", "small"][(sequence - 1) % 3],
        ...classification(sequence),
        dividendProfile: ["growth", "balanced", "income", "variable"][(sequence - 1) % 4],
        narrativeTags: [slug(sector), `${config.key}-economy`, sequence <= 30 ? "core-issuer" : "extended-issuer"],
      });
    }
  }

  for (sequence = 1; sequence <= 10; sequence += 1) {
    const issuer = equityIssuers[sequence - 1];
    records.push({
      ...baseRecord(config, "preferred_convertible", sequence, `${issuer.issuerName} Convertible Series ${alphaSequence(sequence)}`, issuer.issuerId, issuer.issuerName, issuer.sector),
      hybridType: sequence % 2 === 0 ? "convertible-preferred" : "participating-preferred",
      conversionTermsStatus: "uncalibrated",
      ...classification(sequence + 1),
    });
  }

  const corporateTenors = [2, 3, 5, 7, 10, 12];
  for (sequence = 1; sequence <= 60; sequence += 1) {
    const issuer = equityIssuers[sequence - 1];
    const tenorYears = corporateTenors[(sequence - 1) % corporateTenors.length];
    records.push({
      ...baseRecord(config, "corporate_bond", sequence, `${issuer.issuerName} ${tenorYears}-Year Design Bond`, issuer.issuerId, issuer.issuerName, issuer.sector),
      bondType: sequence % 5 === 0 ? "secured" : sequence % 3 === 0 ? "senior-unsecured" : "general-corporate",
      tenorYears,
      creditGradeBand: ["strong", "upper-medium", "medium", "speculative"][(sequence - 1) % 4],
      couponStatus: "uncalibrated",
      ...classification(sequence + 2),
    });
  }

  const publicTenors = [1, 2, 3, 5, 7, 10, 15];
  for (sequence = 1; sequence <= 35; sequence += 1) {
    const authorityIndex = (sequence - 1) % publicAuthorities.length;
    const issuerName = `${config.displayName} ${publicAuthorities[authorityIndex]}`;
    const issuerId = `issuer.${config.key}.public.${String(authorityIndex + 1).padStart(2, "0")}.v1`;
    const tenorYears = publicTenors[authorityIndex];
    records.push({
      ...baseRecord(config, "sovereign_public_bond", sequence, `${issuerName} ${tenorYears}-Year Design Note ${Math.floor((sequence - 1) / 7) + 1}`, issuerId, issuerName, "public-finance"),
      bondType: authorityIndex === 0 ? "sovereign" : "public-agency",
      tenorYears,
      creditGradeBand: authorityIndex === 0 ? "sovereign-reference" : ["strong", "upper-medium", "medium"][(sequence - 1) % 3],
      couponStatus: "uncalibrated",
      ...classification(sequence),
    });
  }

  for (sequence = 1; sequence <= 20; sequence += 1) {
    const sector = config.sectors[(sequence - 1) % config.sectors.length];
    const issuerName = `${config.displayName} Exchange Fund Administration`;
    records.push({
      ...baseRecord(config, "etf_fund", sequence, `${config.displayName} ${sector} ${sequence <= 10 ? "Sector" : "Diversified"} Fund ${String(sequence).padStart(2, "0")}`, `issuer.${config.key}.fund-administrator.01.v1`, issuerName, sector),
      fundType: sequence <= 10 ? "sector" : sequence <= 15 ? "broad-market" : "factor",
      underlyingTheme: slug(sector),
      weightingMethod: ["market-cap-design", "equal-weight-design", "fundamental-design"][(sequence - 1) % 3],
      ...classification(sequence + 1),
    });
  }

  for (sequence = 1; sequence <= 15; sequence += 1) {
    const sector = config.sectors[(sequence - 1) % config.sectors.length];
    const issuerName = `${config.displayName} Listed Trust Administration`;
    records.push({
      ...baseRecord(config, "listed_trust", sequence, `${config.displayName} ${sector} Income Trust ${String(sequence).padStart(2, "0")}`, `issuer.${config.key}.trust-administrator.01.v1`, issuerName, sector),
      trustType: sequence % 3 === 0 ? "infrastructure" : sequence % 2 === 0 ? "property" : "operating-assets",
      underlyingTheme: slug(sector),
      ...classification(sequence + 2),
    });
  }

  const factorThemes = ["broad-market", "large-cap", "mid-cap", "income", "resilience"];
  for (sequence = 1; sequence <= 15; sequence += 1) {
    const theme = sequence <= 10 ? config.sectors[sequence - 1] : factorThemes[sequence - 11];
    const issuerName = `${config.exchange} Index Administration`;
    records.push({
      ...baseRecord(config, "index", sequence, `${config.displayName} ${theme.replaceAll("-", " ")} Index`, `issuer.${config.key}.index-administrator.01.v1`, issuerName, theme),
      indexFamily: sequence <= 10 ? "sector" : "market-factor",
      weightingMethod: ["market-cap-design", "equal-weight-design", "fundamental-design"][(sequence - 1) % 3],
      tradable: false,
      calculationStatus: "design-only",
      riskClass: "reference",
      liquidityClass: "not-applicable",
    });
  }

  const referenceThemes = ["input-cost", "freight-capacity", "energy-cost", "labor-capacity", "export-demand"];
  for (sequence = 1; sequence <= 15; sequence += 1) {
    const theme = sequence <= 10 ? config.sectors[sequence - 1] : referenceThemes[sequence - 11];
    const issuerName = `${config.displayName} Benchmark Administration`;
    records.push({
      ...baseRecord(config, "commodity_reference", sequence, `${config.displayName} ${theme.replaceAll("-", " ")} Reference`, `issuer.${config.key}.benchmark-administrator.01.v1`, issuerName, theme),
      underlyingTheme: slug(theme),
      tradable: false,
      calculationStatus: "design-only",
      unitStatus: "uncalibrated",
      riskClass: "reference",
      liquidityClass: "not-applicable",
    });
  }

  if (records.length !== 320) throw new Error(`${config.key} generated ${records.length} records instead of 320.`);
  return records;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validate(countryRecords) {
  const records = [...countryRecords.values()].flat();
  const ids = new Set();
  const symbols = new Set();
  const names = new Set();
  const issuers = new Map();
  for (const record of records) {
    for (const field of ["id", "symbol", "name", "country", "currency", "exchange", "instrumentType", "assetClass", "sector", "issuerId", "issuerName", "seedStatus", "runtimeSupport"]) {
      if (typeof record[field] !== "string" || record[field].trim() === "") throw new Error(`${record.id ?? "<unknown>"} has invalid ${field}.`);
    }
    if (record.activationAuthorized !== false) throw new Error(`${record.id} is not fail-closed.`);
    if (ids.has(record.id) || symbols.has(record.symbol) || names.has(record.name)) throw new Error(`Duplicate universe key detected at ${record.id}.`);
    ids.add(record.id);
    symbols.add(record.symbol);
    names.add(record.name);
    const knownIssuerName = issuers.get(record.issuerId);
    if (knownIssuerName && knownIssuerName !== record.issuerName) throw new Error(`${record.issuerId} maps to inconsistent issuer names.`);
    issuers.set(record.issuerId, record.issuerName);
    if (["index", "commodity_reference"].includes(record.instrumentType) && record.tradable !== false) throw new Error(`${record.id} must be non-tradable.`);
  }
  if (records.length !== 3200 || ids.size !== 3200 || symbols.size !== 3200 || names.size !== 3200) throw new Error("Universe totals or uniqueness checks failed.");
  return { uniqueIssuerIds: issuers.size, uniqueNames: names.size, uniqueStableIds: ids.size, uniqueSymbols: symbols.size };
}

const originalManifest = JSON.parse(await readFile(manifestPath, "utf8"));
const configs = Object.entries(originalManifest.countries).sort(([left], [right]) => left.localeCompare(right)).map(([key, descriptor]) => ({
  key,
  prefix: countryPrefixes[key],
  sectors: sectors[key].split("|"),
  ...descriptor,
}));
if (configs.length !== 10 || configs.some((config) => !config.prefix || config.sectors.length !== 10)) throw new Error("Country generation configuration is incomplete.");

const countryRecords = new Map(configs.map((config) => [config.key, buildCountry(config)]));
const validation = validate(countryRecords);
const countries = {};
const payloads = new Map();
for (const config of configs) {
  const content = `${countryRecords.get(config.key).map((record) => JSON.stringify(record)).join("\n")}\n`;
  payloads.set(config.key, content);
  countries[config.key] = {
    capital: config.capital,
    currency: config.currency,
    displayName: config.displayName,
    exchange: config.exchange,
    file: `universe/${config.key}.jsonl`,
    instrumentCount: 320,
    sha256: sha256(content),
  };
}

const manifest = {
  allocationPerCountry,
  countries,
  generatedAt: "2026-07-19",
  generationSeed: originalManifest.generationSeed ?? 20260718,
  generator: "scripts/generate-seed-market-universe.mjs",
  instrumentTypeCounts: Object.fromEntries(Object.entries(allocationPerCountry).map(([key, value]) => [key, value * configs.length])),
  maturity: "design-candidate",
  packId: "econovaria.market-universe.v1",
  productionAuthorized: false,
  runtimeSupportVerified: false,
  sourceFilesCommitted: true,
  totalInstrumentCount: 3200,
  validation: {
    allCountryCountsEqual: true,
    currencyCodes: [...new Set(configs.map((config) => config.currency))].sort(),
    exactly320PerCountry: true,
    ...validation,
  },
  version: "1.0.0-draft",
};

await mkdir(universeRoot, { recursive: true });
let differences = 0;
async function compareOrWrite(filePath, expected) {
  if (!checkOnly) {
    await writeFile(filePath, expected, "utf8");
    return;
  }
  let actual = null;
  try {
    actual = await readFile(filePath, "utf8");
  } catch {}
  if (actual !== expected) {
    differences += 1;
    console.error(`Universe drift: ${path.relative(repoRoot, filePath)}`);
  }
}

for (const [country, content] of payloads) await compareOrWrite(path.join(universeRoot, `${country}.jsonl`), content);
await compareOrWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (differences > 0) process.exitCode = 1;
else console.log(`${checkOnly ? "Verified" : "Generated"} 3,200 instruments across 10 country files; ${validation.uniqueIssuerIds} stable issuers or administrators.`);
