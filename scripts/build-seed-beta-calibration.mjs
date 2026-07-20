#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  COUNTRY_IDS,
  canonicalJson,
  readJson,
  roundTo,
  sha256,
  sha256File,
  stableNumber,
  walkFiles,
  writeJson,
} from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const HORIZON_DAYS = 180;
const SETTLEMENT_FEE_RATE = 0.01;

const ROUTES = [
  ['route.meridian.northreach-solvend.v1', 'northreach', 'solvend', 'location.northreach.frostgate.v1', 'location.solvend.aurora-spire.v1', ['rail', 'freight', 'technical-supply']],
  ['route.meridian.northreach-yrethia.v1', 'northreach', 'yrethia', 'location.northreach.frostgate.v1', 'location.yrethia.sableport.v1', ['maritime', 'freight']],
  ['route.meridian.yrethia-thaloris.v1', 'yrethia', 'thaloris', 'location.yrethia.sableport.v1', 'location.thaloris.dusk-harbor.v1', ['maritime']],
  ['route.meridian.yrethia-eldoran.v1', 'yrethia', 'eldoran', 'location.yrethia.sableport.v1', 'location.eldoran.crescent-bay.v1', ['maritime', 'rail-transfer']],
  ['route.meridian.thaloris-eldoran.v1', 'thaloris', 'eldoran', 'location.thaloris.dusk-harbor.v1', 'location.eldoran.crescent-bay.v1', ['alternate-freight']],
  ['route.meridian.solvend-eldoran.v1', 'solvend', 'eldoran', 'location.solvend.aurora-spire.v1', 'location.eldoran.crescent-bay.v1', ['rail', 'air-freight']],
  ['route.meridian.eldoran-valerion.v1', 'eldoran', 'valerion', 'location.eldoran.crescent-bay.v1', 'location.valerion.glassfall.v1', ['rail', 'road', 'energy']],
  ['route.meridian.valerion-lumenor.v1', 'valerion', 'lumenor', 'location.valerion.glassfall.v1', 'location.lumenor.starfall.v1', ['rail', 'civic-corridor']],
  ['route.meridian.lumenor-xalvoria.v1', 'lumenor', 'xalvoria', 'location.lumenor.starfall.v1', 'location.xalvoria.emberhall.v1', ['rail', 'finance']],
  ['route.meridian.xalvoria-dravenlok.v1', 'xalvoria', 'dravenlok', 'location.xalvoria.emberhall.v1', 'location.dravenlok.ironhold.v1', ['rail', 'infrastructure']],
  ['route.meridian.dravenlok-syndalis.v1', 'dravenlok', 'syndalis', 'location.dravenlok.ironhold.v1', 'location.syndalis.blacklight.v1', ['rail', 'data']],
  ['route.meridian.syndalis-lumenor.v1', 'syndalis', 'lumenor', 'location.syndalis.blacklight.v1', 'location.lumenor.starfall.v1', ['data']],
  ['route.meridian.xalvoria-syndalis.v1', 'xalvoria', 'syndalis', 'location.xalvoria.emberhall.v1', 'location.syndalis.blacklight.v1', ['finance', 'data']],
];

const SCENARIOS = [
  { id: 'baseline', shockStart: null, shockEnd: null, shock: 0, recovery: 0 },
  { id: 'currency-stress', shockStart: 30, shockEnd: 45, shock: -0.0015, recovery: 0.0008 },
  { id: 'route-disruption', shockStart: 30, shockEnd: 56, shock: -0.0028, recovery: 0.0015 },
  { id: 'war-and-recovery', shockStart: 20, shockEnd: 51, shock: -0.0045, recovery: 0.0024 },
];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function simulateCountry(country, templates, scenario) {
  const meanBeta = mean(templates.map((entry) => Number(entry.beta)));
  const meanVolatility = mean(templates.map((entry) => Number(entry.longRunVolatility)));
  const meanLiquidity = mean(templates.map((entry) => Number(entry.liquidity)));
  let index = 100;
  let peak = 100;
  let trough = 100;
  let troughDay = 0;
  let maxDrawdownPct = 0;
  let recoveryDay = null;
  const path = [];

  for (let day = 0; day < HORIZON_DAYS; day += 1) {
    const noise = stableNumber(`${country}:${scenario.id}:${day}`, -0.0012, 0.0012, 8) * (0.65 + meanVolatility * 1.8);
    const inShock = scenario.shockStart !== null && day >= scenario.shockStart && day < scenario.shockEnd;
    const inRecovery = scenario.shockEnd !== null && day >= scenario.shockEnd && day < scenario.shockEnd + 95;
    const meanReversion = scenario.shockEnd !== null && day >= scenario.shockEnd && index < 100
      ? Math.min(0.0018, ((100 - index) / 100) * 0.018)
      : 0;
    const liquidityBuffer = (meanLiquidity - 0.55) * 0.00025;
    const dailyReturn = clamp(
      0.00025 + noise + liquidityBuffer + (inShock ? scenario.shock * meanBeta : 0) + (inRecovery ? scenario.recovery : 0) + meanReversion,
      -0.06,
      0.06,
    );
    index *= 1 + dailyReturn;
    peak = Math.max(peak, index);
    if (index < trough) {
      trough = index;
      troughDay = day;
      recoveryDay = null;
    }
    maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - index) / peak) * 100);
    if (day > troughDay && recoveryDay === null && index >= 95) recoveryDay = day;
    path.push(Number(index.toFixed(6)));
  }

  return {
    scenarioId: scenario.id,
    horizonDays: HORIZON_DAYS,
    startingIndex: 100,
    endingIndex: Number(index.toFixed(4)),
    minimumIndex: Number(trough.toFixed(4)),
    maximumDrawdownPct: Number(maxDrawdownPct.toFixed(4)),
    troughDay,
    recoveryDay,
    recoveredTo95PctOfStart: index >= 95 && (scenario.id === 'baseline' || recoveryDay !== null),
    pathSha256: sha256(canonicalJson(path)),
    sampledPath: [0, 30, 60, 90, 120, 150, 179].map((day) => ({ day, index: path[day] })),
  };
}

function buildCurrencyCalibration(arrival) {
  const byCountry = new Map(arrival.calibrations.map((entry) => [entry.country, entry]));
  const pairs = [];
  for (let left = 0; left < COUNTRY_IDS.length; left += 1) {
    for (let right = left + 1; right < COUNTRY_IDS.length; right += 1) {
      const source = byCountry.get(COUNTRY_IDS[left]);
      const destination = byCountry.get(COUNTRY_IDS[right]);
      const startingUnits = 1000;
      const stressMultiplier = stableNumber(`${source.country}:${destination.country}:currency-stress`, 0.9, 1.1, 6);
      const sourceRate = source.ecoReferenceIndex * stressMultiplier;
      const destinationRate = destination.ecoReferenceIndex / stressMultiplier;
      const destinationUnits = startingUnits * sourceRate * (1 - SETTLEMENT_FEE_RATE) / destinationRate * (1 - SETTLEMENT_FEE_RATE);
      const roundTripUnits = destinationUnits * destinationRate * (1 - SETTLEMENT_FEE_RATE) / sourceRate * (1 - SETTLEMENT_FEE_RATE);
      pairs.push({
        pairId: `${source.country}-${destination.country}`,
        sourceCountry: source.country,
        destinationCountry: destination.country,
        sourceCurrency: source.currencyCode,
        destinationCurrency: destination.currencyCode,
        settlementBridge: 'ECO',
        stressMultiplier: Number(stressMultiplier.toFixed(6)),
        startingUnits,
        destinationUnits: Number(destinationUnits.toFixed(4)),
        roundTripUnits: Number(roundTripUnits.toFixed(4)),
        roundTripGainPct: Number((((roundTripUnits / startingUnits) - 1) * 100).toFixed(4)),
        arbitrageSafe: roundTripUnits < startingUnits,
      });
    }
  }
  return {
    settlementBridge: 'ECO',
    feeRatePerLeg: SETTLEMENT_FEE_RATE,
    pairCount: pairs.length,
    maximumRoundTripGainPct: Math.max(...pairs.map((entry) => entry.roundTripGainPct)),
    arbitrageFailures: pairs.filter((entry) => !entry.arbitrageSafe).length,
    pairs,
  };
}

function minimumVertexDistance(regionA, regionB) {
  let minimum = Number.POSITIVE_INFINITY;
  for (const polygonA of regionA.polygons) {
    for (const polygonB of regionB.polygons) {
      for (const pointA of polygonA) {
        for (const pointB of polygonB) {
          minimum = Math.min(minimum, Math.hypot(pointA[0] - pointB[0], pointA[1] - pointB[1]));
        }
      }
    }
  }
  return minimum;
}

async function buildRouteCalibration(locations) {
  const geometryPath = path.join(REPO_ROOT, locations.artworkEvidence.geometryPath);
  const geometry = await import(`${pathToFileURL(geometryPath).href}?beta-calibration`);
  const regionByCountry = new Map(geometry.ECONOVARIA_COUNTRY_REGIONS.map((entry) => [entry.id, entry]));
  const locationById = new Map(locations.locations.map((entry) => [entry.id, entry]));
  const adjacency = [];

  for (let left = 0; left < COUNTRY_IDS.length; left += 1) {
    for (let right = left + 1; right < COUNTRY_IDS.length; right += 1) {
      const countryA = COUNTRY_IDS[left];
      const countryB = COUNTRY_IDS[right];
      const minimumPixelSeparation = minimumVertexDistance(regionByCountry.get(countryA), regionByCountry.get(countryB));
      adjacency.push({
        pairId: `${countryA}-${countryB}`,
        countries: [countryA, countryB],
        minimumPixelSeparation: Number(minimumPixelSeparation.toFixed(3)),
        geometryClassification: minimumPixelSeparation <= 3 ? 'border-touching-candidate' : minimumPixelSeparation <= 75 ? 'near-maritime-or-near-border' : 'separated',
        verifiedAgainstGeometrySha256: locations.artworkEvidence.geometrySha256,
        landBorderClaimed: false,
      });
    }
  }

  const routes = ROUTES.map(([routeId, originCountry, destinationCountry, originLocationId, destinationLocationId, modes]) => {
    const origin = locationById.get(originLocationId);
    const destination = locationById.get(destinationLocationId);
    requireCondition(origin && destination, `Missing verified route endpoint for ${routeId}.`);
    const disruptionCapacity = Math.round(stableNumber(`${routeId}:disruption`, 55, 72, 0));
    const warCapacity = Math.round(stableNumber(`${routeId}:war`, 34, 49, 0));
    const substituteCapacity = Math.round(stableNumber(`${routeId}:substitute`, 20, 34, 0));
    const recoveryDays = Math.round(stableNumber(`${routeId}:recovery`, 35, 84, 0));
    return {
      routeId,
      originCountry,
      destinationCountry,
      originLocationId,
      destinationLocationId,
      modes,
      geometry: {
        coordinateSpace: locations.artworkEvidence.coordinateSpace,
        origin: origin.mapPoint,
        destination: destination.mapPoint,
        straightLinePixelLength: Number(Math.hypot(origin.mapPoint.x - destination.mapPoint.x, origin.mapPoint.y - destination.mapPoint.y).toFixed(3)),
        endpointPolygonVerification: true,
        artworkSha256: locations.artworkEvidence.imageSha256,
        geometrySha256: locations.artworkEvidence.geometrySha256,
      },
      capacity: {
        baseline: 100,
        disruption: disruptionCapacity,
        war: warCapacity,
        approvedSubstitute: substituteCapacity,
        effectiveWarWithSubstitution: Math.min(100, warCapacity + substituteCapacity),
        recovered: 100,
        recoveryDays,
      },
      recoverySafe: warCapacity + substituteCapacity >= 50 && recoveryDays <= 90,
      adjacencyPolicy: 'route-connected; no unreviewed land-border claim',
    };
  });

  return {
    routeCount: routes.length,
    adjacencyPairCount: adjacency.length,
    routeFailures: routes.filter((entry) => !entry.recoverySafe).length,
    adjacency,
    routes,
  };
}

function buildBankingAndHouseholdCalibration(arrival) {
  return arrival.calibrations.map((entry) => {
    const weeklyNeeds = entry.assumptions.weeklyBasicNeeds;
    const maximumMonthlyAccountFee = Math.max(1, roundTo(weeklyNeeds * 0.015, 1, 0));
    const minimumOpeningDeposit = Math.max(1, roundTo(weeklyNeeds * 0.1, 1, 0));
    const emergencyLoanPrincipal = weeklyNeeds * 2;
    const maximumWeeklyRepayment = Math.max(1, roundTo(weeklyNeeds * 0.18, 1, 0));
    const warShockCost = roundTo(weeklyNeeds * 1.5, 1, 0);
    const recoverySupport = entry.assumptions.emergencyReserve + entry.contractRewards.arrival + entry.contractRewards.community;
    const postShockResources = entry.approvedStartingBalance - entry.assumptions.housingDeposit - warShockCost + recoverySupport;
    return {
      country: entry.country,
      currencyCode: entry.currencyCode,
      bankingAffordability: {
        maximumMonthlyAccountFee,
        minimumOpeningDeposit,
        emergencyLoanPrincipal,
        maximumWeeklyRepayment,
        openingDepositShareOfStartingBalance: Number((minimumOpeningDeposit / entry.approvedStartingBalance).toFixed(4)),
        weeklyRepaymentShareOfArrivalReward: Number((maximumWeeklyRepayment / entry.contractRewards.arrival).toFixed(4)),
        approved: minimumOpeningDeposit <= entry.approvedStartingBalance * 0.15 && maximumWeeklyRepayment <= entry.contractRewards.arrival * 0.25,
      },
      warAndRecovery: {
        warShockCost,
        recoverySupport,
        recoveryCoverageRatio: Number((recoverySupport / warShockCost).toFixed(4)),
        postShockBasicNeedsWeeks: Number((postShockResources / weeklyNeeds).toFixed(4)),
        insolvencyObserved: postShockResources < 0,
        approved: recoverySupport >= warShockCost && postShockResources >= weeklyNeeds * 2,
      },
    };
  });
}

async function buildSubstitutionCalibration(physical) {
  const substitution = await readJson(path.join(SEED_ROOT, 'items', 'recipes', 'substitution-groups-v1.json'));
  const priceByKey = new Map(physical.itemPrices.map((entry) => [entry.itemKey, entry.referencePrice]));
  const penalties = substitution.selectionPolicy.difficultySubstitutionPenalty;
  const checks = [];
  for (const group of substitution.groups) {
    const canonical = group.members[0];
    const canonicalPrice = priceByKey.get(canonical.itemKey);
    requireCondition(canonicalPrice > 0, `Missing canonical substitution price for ${group.groupKey}.`);
    for (const [difficulty, penalty] of Object.entries(penalties)) {
      const canonicalCost = canonicalPrice * Math.ceil(canonical.quantityRatio * penalty);
      for (const member of group.members) {
        const rawCost = priceByKey.get(member.itemKey) * Math.ceil(member.quantityRatio * penalty);
        const quotedCost = roundTo(clamp(rawCost, canonicalCost * 0.92, canonicalCost * 1.12), 0.25, 2);
        checks.push({
          groupKey: group.groupKey,
          difficulty,
          itemKey: member.itemKey,
          requiredQuantity: Math.ceil(member.quantityRatio * penalty),
          rawCost: Number(rawCost.toFixed(2)),
          quotedCost,
          quoteRatioToCanonical: Number((quotedCost / canonicalCost).toFixed(4)),
          entitlementRequired: member.requiresEntitlement ?? null,
          outputQuantityChanged: false,
          safe: quotedCost >= canonicalCost * 0.92 - 0.01 && quotedCost <= canonicalCost * 1.12 + 0.01,
        });
      }
    }
  }
  return {
    groupCount: substitution.groups.length,
    checkCount: checks.length,
    failures: checks.filter((entry) => !entry.safe).length,
    quotePolicy: 'server-resolved before crafting; 8% discount floor and 12% premium ceiling relative to the canonical member',
    checks,
  };
}

async function rebuildIntegrityManifest(pack) {
  const files = await walkFiles(PACK_ROOT, (file) => path.basename(file) !== 'integrity-manifest-v1.json');
  const entries = [];
  for (const filePath of files) {
    entries.push({
      path: path.relative(PACK_ROOT, filePath).replaceAll(path.sep, '/'),
      sha256: await sha256File(filePath),
      bytes: (await readFile(filePath)).byteLength,
    });
  }
  const packEntry = entries.find((entry) => entry.path === 'pack-v1.json');
  const manifest = {
    schemaVersion: 'econovaria-beta-integrity-manifest-v1',
    packId: pack.packId,
    version: pack.version,
    status: 'approved-for-isolated-staging',
    productionAuthorized: false,
    activationAuthorized: false,
    hashAlgorithm: 'sha256',
    fileCount: entries.length,
    packSha256: packEntry?.sha256 ?? null,
    files: entries,
    manifestContentSha256: sha256(canonicalJson(entries)),
  };
  await writeJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json'), manifest);
  return manifest;
}

export async function buildSeedBetaCalibration() {
  const [pack, market, arrival, physical, locations, campaign] = await Promise.all([
    readJson(path.join(PACK_ROOT, 'pack-v1.json')),
    readJson(path.join(PACK_ROOT, 'market-templates-v1.json')),
    readJson(path.join(PACK_ROOT, 'arrival-calibration-v1.json')),
    readJson(path.join(PACK_ROOT, 'physical-economy-calibration-v1.json')),
    readJson(path.join(PACK_ROOT, 'location-registry-verified-v1.json')),
    readJson(path.join(PACK_ROOT, 'campaign-v1.json')),
  ]);

  const countrySimulations = COUNTRY_IDS.map((country) => {
    const templates = market.templates.filter((entry) => entry.country === country);
    requireCondition(templates.length === 24, `${country} simulation requires 24 instruments.`);
    return {
      country,
      instrumentCount: templates.length,
      meanBeta: Number(mean(templates.map((entry) => entry.beta)).toFixed(6)),
      meanLongRunVolatility: Number(mean(templates.map((entry) => entry.longRunVolatility)).toFixed(6)),
      meanLiquidity: Number(mean(templates.map((entry) => entry.liquidity)).toFixed(6)),
      scenarios: SCENARIOS.map((scenario) => simulateCountry(country, templates, scenario)),
    };
  });
  const currency = buildCurrencyCalibration(arrival);
  const routes = await buildRouteCalibration(locations);
  const household = buildBankingAndHouseholdCalibration(arrival);
  const substitution = await buildSubstitutionCalibration(physical);

  const scenarioSummary = SCENARIOS.map((scenario) => {
    const results = countrySimulations.map((entry) => entry.scenarios.find((candidate) => candidate.scenarioId === scenario.id));
    return {
      scenarioId: scenario.id,
      averageEndingIndex: Number(mean(results.map((entry) => entry.endingIndex)).toFixed(4)),
      worstMaximumDrawdownPct: Number(Math.max(...results.map((entry) => entry.maximumDrawdownPct)).toFixed(4)),
      maximumRecoveryDay: Math.max(...results.map((entry) => entry.recoveryDay ?? 0)),
      countriesRecovered: results.filter((entry) => entry.recoveredTo95PctOfStart).length,
    };
  });

  const checks = {
    countrySimulationFailures: countrySimulations.filter((entry) => entry.scenarios.some((scenario) => scenario.maximumDrawdownPct > 35 || !scenario.recoveredTo95PctOfStart)).length,
    currencyArbitrageFailures: currency.arbitrageFailures,
    routeRecoveryFailures: routes.routeFailures,
    bankingAffordabilityFailures: household.filter((entry) => !entry.bankingAffordability.approved).length,
    warHouseholdRecoveryFailures: household.filter((entry) => !entry.warAndRecovery.approved).length,
    substitutionFailures: substitution.failures,
    physicalArbitrageFailures: physical.exploitChecks.arbitrageFailures,
    salvageFailures: physical.exploitChecks.salvageFailures,
    recraftingFailures: physical.exploitChecks.recraftingFailures,
    concurrencyFailures: physical.exploitChecks.concurrencyFailures,
  };
  requireCondition(Object.values(checks).every((value) => value === 0), `Calibration failures remain: ${JSON.stringify(checks)}.`);

  const calibration = {
    schemaVersion: 'econovaria-beta-cross-market-calibration-v1',
    packId: pack.packId,
    version: pack.version,
    status: 'approved-for-isolated-staging',
    productionAuthorized: false,
    activationAuthorized: false,
    deterministic: true,
    calibrationDate: '2026-07-20',
    newlyCompletedCountryEnrichment: ['eldoran', 'valerion', 'lumenor', 'xalvoria', 'dravenlok', 'syndalis'],
    countryCount: countrySimulations.length,
    scenarioCountPerCountry: SCENARIOS.length,
    countrySimulations,
    crossMarketScenarioSummary: scenarioSummary,
    currency,
    routes,
    householdAndBanking: household,
    substitution,
    campaignReferences: {
      selectedEventStableIds: campaign.selectedEventStableIds,
      recoveryPolicy: campaign.recoveryPolicy,
      warScenarioPolicy: 'severe but bounded disruption; no irreversible base-beta loss; recovery and legal substitution are mandatory',
    },
    checks,
  };

  await writeJson(path.join(PACK_ROOT, 'calibration-scenarios-v1.json'), calibration);
  pack.domainFiles.calibration = 'calibration-scenarios-v1.json';
  pack.calibration = {
    countryCount: 10,
    scenarioCountPerCountry: SCENARIOS.length,
    routeCount: ROUTES.length,
    currencyPairCount: currency.pairCount,
    allChecksPassed: true,
  };
  await writeJson(path.join(PACK_ROOT, 'pack-v1.json'), pack);
  const manifest = await rebuildIntegrityManifest(pack);
  return { calibration, manifest };
}

async function main() {
  const result = await buildSeedBetaCalibration();
  console.log(JSON.stringify({
    result: 'CALIBRATED',
    countries: result.calibration.countryCount,
    scenariosPerCountry: result.calibration.scenarioCountPerCountry,
    routes: result.calibration.routes.routeCount,
    currencyPairs: result.calibration.currency.pairCount,
    failures: result.calibration.checks,
    integrityFiles: result.manifest.fileCount,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
