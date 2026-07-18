import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const subsetRoot = path.join(repoRoot, "docs", "seed-content", "markets", "active-subsets");

const files = {
  source: "solvend-active-market-candidate-and-issuers-v1.json",
  issuers: "solvend-active-issuer-enrichment-v1.json",
  equities: "solvend-active-equity-enrichment-v1.json",
  fixedIncome: "solvend-active-fixed-income-enrichment-v1.json",
  collective: "solvend-active-collective-reference-enrichment-v1.json",
};

const issues = [];

function fail(code, message) {
  issues.push(`${code}: ${message}`);
}

async function load(name) {
  const filePath = path.join(subsetRoot, files[name]);
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    fail("FILE_INVALID", `${files[name]}: ${error.message}`);
    return null;
  }
}

function closeEnough(actual, expected, tolerance = 0.011) {
  return Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual - expected) <= tolerance;
}

function uniqueIds(records, label) {
  const ids = new Set();
  for (const [index, record] of records.entries()) {
    if (typeof record?.id !== "string" || record.id === "") {
      fail("ID_MISSING", `${label}[${index}] has no stable id`);
      continue;
    }
    if (ids.has(record.id)) fail("ID_DUPLICATE", `${label} duplicates ${record.id}`);
    ids.add(record.id);
  }
  return ids;
}

function requireFalseActivation(value, location = "$") {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => requireFalseActivation(entry, `${location}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    const next = `${location}.${key}`;
    if (key === "activationAuthorized" && entry !== false) {
      fail("ACTIVATION_NOT_FAIL_CLOSED", `${next} must be false`);
    }
    requireFalseActivation(entry, next);
  }
}

function compareExactIds(actual, expected, label) {
  for (const id of expected) if (!actual.has(id)) fail("ENRICHMENT_ID_MISSING", `${label} is missing ${id}`);
  for (const id of actual) if (!expected.has(id)) fail("ENRICHMENT_ID_ORPHANED", `${label} contains orphaned ${id}`);
}

function sumWeights(weights, label) {
  if (!weights || typeof weights !== "object" || Array.isArray(weights)) {
    fail("WEIGHTS_INVALID", `${label} must be an object`);
    return;
  }
  const entries = Object.entries(weights);
  if (entries.length === 0) {
    fail("WEIGHTS_EMPTY", `${label} must not be empty`);
    return;
  }
  const sum = entries.reduce((total, [, value]) => total + value, 0);
  if (!closeEnough(sum, 1, 0.000011)) fail("WEIGHTS_NOT_NORMALIZED", `${label} sums to ${sum}`);
  for (const [key, value] of entries) {
    if (!Number.isFinite(value) || value <= 0 || value > 1) fail("WEIGHT_OUT_OF_RANGE", `${label}.${key} is ${value}`);
  }
}

const source = await load("source");
const issuerPack = await load("issuers");
const equityPack = await load("equities");
const fixedPack = await load("fixedIncome");
const collectivePack = await load("collective");

for (const document of [source, issuerPack, equityPack, fixedPack, collectivePack]) {
  if (document) requireFalseActivation(document);
}

if (source && issuerPack && equityPack && fixedPack && collectivePack) {
  const sourceInstruments = source.market?.instruments ?? [];
  const sourceIssuers = source.issuerRegistry?.issuers ?? [];
  if (source.market?.instrumentCount !== sourceInstruments.length) fail("SOURCE_INSTRUMENT_COUNT", "source instrumentCount does not match instruments");
  if (source.issuerRegistry?.issuerCount !== sourceIssuers.length) fail("SOURCE_ISSUER_COUNT", "source issuerCount does not match issuers");
  if (sourceInstruments.length !== 24) fail("SOURCE_INSTRUMENT_TOTAL", `expected 24 instruments; found ${sourceInstruments.length}`);
  if (sourceIssuers.length !== 17) fail("SOURCE_ISSUER_TOTAL", `expected 17 issuers; found ${sourceIssuers.length}`);

  const sourceInstrumentIds = uniqueIds(sourceInstruments, "source instruments");
  const sourceIssuerIds = uniqueIds(sourceIssuers, "source issuers");
  const enrichedIssuerRecords = issuerPack.issuers ?? [];
  const equityRecords = equityPack.records ?? [];
  const fixedRecords = fixedPack.records ?? [];
  const collectiveRecords = collectivePack.records ?? [];

  if (issuerPack.recordCount !== enrichedIssuerRecords.length) fail("ISSUER_ENRICHMENT_COUNT", "recordCount does not match issuer records");
  if (enrichedIssuerRecords.length !== 17) fail("ISSUER_ENRICHMENT_TOTAL", `expected 17 records; found ${enrichedIssuerRecords.length}`);
  if (equityRecords.length !== 13) fail("EQUITY_ENRICHMENT_TOTAL", `expected 13 records; found ${equityRecords.length}`);
  if (fixedRecords.length !== 6) fail("FIXED_ENRICHMENT_TOTAL", `expected 6 records; found ${fixedRecords.length}`);
  if (collectiveRecords.length !== 5) fail("COLLECTIVE_ENRICHMENT_TOTAL", `expected 5 records; found ${collectiveRecords.length}`);

  const enrichedIssuerIds = uniqueIds(enrichedIssuerRecords, "issuer enrichment");
  compareExactIds(enrichedIssuerIds, sourceIssuerIds, "issuer enrichment");

  const enrichedInstrumentRecords = [...equityRecords, ...fixedRecords, ...collectiveRecords];
  const enrichedInstrumentIds = uniqueIds(enrichedInstrumentRecords, "instrument enrichment");
  compareExactIds(enrichedInstrumentIds, sourceInstrumentIds, "instrument enrichment");

  const issuerEnrichmentById = new Map(enrichedIssuerRecords.map((record) => [record.id, record]));
  for (const instrument of enrichedInstrumentRecords) {
    if (!sourceIssuerIds.has(instrument.issuerId)) fail("INSTRUMENT_ISSUER_UNKNOWN", `${instrument.id} references ${instrument.issuerId}`);
  }

  for (const sourceIssuer of sourceIssuers) {
    const enriched = issuerEnrichmentById.get(sourceIssuer.id);
    if (!enriched) continue;
    const declared = new Set(sourceIssuer.instrumentIds ?? []);
    const active = new Set(enriched.activeInstrumentIds ?? []);
    compareExactIds(active, declared, `${sourceIssuer.id}.activeInstrumentIds`);
  }

  for (const equity of equityRecords.filter((record) => record.instrumentType === "common_equity")) {
    const issuer = issuerEnrichmentById.get(equity.issuerId);
    if (!issuer) continue;
    const marketCap = equity.startingPrice * equity.sharesOutstandingMillions;
    const eps = issuer.netIncomeMillions / equity.sharesOutstandingMillions;
    const pe = equity.startingPrice / equity.earningsPerShare;
    const dividendYield = equity.dividendPerShare / equity.startingPrice;
    const floatCap = equity.marketCapitalizationMillions * issuer.publicFloatPercent;
    if (!closeEnough(equity.marketCapitalizationMillions, marketCap, 0.11)) fail("MARKET_CAP_ARITHMETIC", equity.id);
    if (!closeEnough(equity.earningsPerShare, eps, 0.0011)) fail("EPS_ARITHMETIC", equity.id);
    if (!closeEnough(equity.priceEarnings, pe, 0.011)) fail("PE_ARITHMETIC", equity.id);
    if (!closeEnough(equity.dividendYield, dividendYield, 0.00011)) fail("DIVIDEND_YIELD_ARITHMETIC", equity.id);
    if (!closeEnough(equity.floatAdjustedMarketCapitalizationMillions, floatCap, 0.11)) fail("FLOAT_CAP_ARITHMETIC", equity.id);
    const issuerFieldByEquityField = {
      sharesOutstandingMillions: "sharesOutstandingMillions",
      startingPrice: "startingSharePrice",
      marketCapitalizationMillions: "marketCapitalizationMillions",
      earningsPerShare: "earningsPerShare",
    };
    for (const [equityField, issuerField] of Object.entries(issuerFieldByEquityField)) {
      const tolerance = equityField === "earningsPerShare" ? 0.0011 : 0.11;
      if (!closeEnough(equity[equityField], issuer[issuerField], tolerance)) {
        fail("ISSUER_INSTRUMENT_MISMATCH", `${equity.id} ${equityField}`);
      }
    }
  }

  const preferred = equityRecords.find((record) => record.instrumentType === "preferred_convertible");
  if (!preferred) fail("PREFERRED_MISSING", "convertible preferred enrichment is absent");
  else {
    if (!closeEnough(preferred.annualDividendPerUnit, preferred.parValue * preferred.annualDividendRate, 0.0011)) {
      fail("PREFERRED_DIVIDEND_ARITHMETIC", preferred.id);
    }
    if (!closeEnough(preferred.conversionReferenceCommonPrice, preferred.parValue / preferred.conversionRatio, 0.011)) {
      fail("PREFERRED_CONVERSION_ARITHMETIC", preferred.id);
    }
    if (preferred.conversionRuntimeStatus !== "definition-only") fail("PREFERRED_RUNTIME_STATUS", preferred.id);
  }

  const curve = fixedPack.referenceCurve?.points ?? [];
  const curveTerms = curve.map((point) => point.termYears);
  if (JSON.stringify(curveTerms) !== JSON.stringify([1, 3, 5, 7, 10])) fail("CURVE_TERMS", `found ${curveTerms.join(",")}`);
  for (let index = 1; index < curve.length; index += 1) {
    if (!(curve[index].yield > curve[index - 1].yield)) fail("CURVE_NOT_UPWARD", `${curve[index - 1].termYears}-${curve[index].termYears}`);
  }
  for (const bond of fixedRecords) {
    if (bond.faceValue !== 100 || bond.startingPrice <= 0 || bond.annualCouponRate <= 0 || bond.yieldToMaturityCandidate <= 0) {
      fail("BOND_VALUE_INVALID", bond.id);
    }
    if (bond.startingPrice < bond.faceValue && bond.yieldToMaturityCandidate <= bond.annualCouponRate) {
      fail("BOND_PRICE_YIELD_DIRECTION", bond.id);
    }
    if (bond.maturityTreatment !== "redeem-face-plus-final-coupon-idempotently") fail("BOND_MATURITY_POLICY", bond.id);
  }

  const sourceInstrumentById = new Map(sourceInstruments.map((record) => [record.id, record]));
  for (const record of collectiveRecords) {
    for (const [field, weights] of Object.entries(record)) {
      if (!field.endsWith("Weights")) continue;
      sumWeights(weights, `${record.id}.${field}`);
      if (["constituentWeights", "holdingsWeights"].includes(field)) {
        for (const referencedId of Object.keys(weights)) {
          if (!sourceInstrumentById.has(referencedId)) fail("COLLECTIVE_REFERENCE_UNKNOWN", `${record.id} references ${referencedId}`);
        }
      }
    }
    if (["index", "commodity_reference"].includes(record.instrumentType) && record.tradable !== false) {
      fail("REFERENCE_TRADABLE", record.id);
    }
  }

  const trust = collectiveRecords.find((record) => record.instrumentType === "listed_trust");
  if (trust) {
    if (!closeEnough(trust.netAssetValueMillions, trust.grossAssetValueMillions - trust.debtMillions, 0.011)) fail("TRUST_NAV_ARITHMETIC", trust.id);
    if (!closeEnough(trust.navPerUnit, trust.netAssetValueMillions / trust.unitsOutstandingMillions, 0.0011)) fail("TRUST_NAV_PER_UNIT", trust.id);
    if (!closeEnough(trust.distributionYield, trust.annualDistributionPerUnit / trust.startingPrice, 0.00011)) fail("TRUST_DISTRIBUTION_YIELD", trust.id);
  } else {
    fail("TRUST_MISSING", "listed trust enrichment is absent");
  }
}

if (issues.length > 0) {
  console.error(`Solvend financial audit failed with ${issues.length} issue(s):`);
  for (const entry of issues) console.error(`- ${entry}`);
  process.exitCode = 1;
} else {
  console.log("Solvend financial audit passed: 17 issuers, 24 instruments, complete enrichment coverage, normalized weights, and valid arithmetic.");
}
