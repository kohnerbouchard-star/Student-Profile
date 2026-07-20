#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  COUNTRY_IDS,
  exists,
  pointInRegion,
  readJson,
  sha256File,
} from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const DEFAULT_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');

function add(issues, severity, code, message, file = null) { issues.push({ severity, code, message, file }); }
function unique(values) { return new Set(values).size === values.length; }

export async function validateSeedBetaPack({ packRoot = DEFAULT_ROOT } = {}) {
  const issues = [];
  const required = [
    'pack-v1.json', 'market-templates-v1.json', 'arrival-calibration-v1.json', 'tutorial-contract-chains-v1.json',
    'store-catalog-v1.json', 'physical-economy-calibration-v1.json', 'campaign-v1.json',
    'location-registry-verified-v1.json', 'stable-id-map-v1.json', 'integrity-manifest-v1.json',
  ];
  for (const name of required) if (!(await exists(path.join(packRoot, name)))) add(issues, 'error', 'REQUIRED_FILE_MISSING', `Missing ${name}.`, name);
  if (issues.some((entry) => entry.severity === 'error')) return { valid: false, issues, summary: { errors: issues.length, warnings: 0 } };

  const [pack, market, arrival, contracts, store, physical, campaign, locations, mappings, integrity] = await Promise.all(required.map((name) => readJson(path.join(packRoot, name))));
  const documents = { pack, market, arrival, contracts, store, physical, campaign, locations, mappings, integrity };
  for (const [name, document] of Object.entries(documents)) {
    if (document.productionAuthorized !== false) add(issues, 'error', 'PRODUCTION_AUTHORIZATION_NOT_FALSE', `${name} must fail closed for production.`);
    if (document.activationAuthorized !== false) add(issues, 'error', 'ACTIVATION_AUTHORIZATION_NOT_FALSE', `${name} must not embed activation authorization.`);
  }
  if (!Array.isArray(pack.allowedEnvironments) || pack.allowedEnvironments.includes('production')) add(issues, 'error', 'PRODUCTION_ENVIRONMENT_ALLOWED', 'Pack allowed environments must exclude production.');
  if (pack.boundedCounts?.marketInstruments !== 240 || market.instrumentCount !== 240 || market.templates?.length !== 240) add(issues, 'error', 'MARKET_COUNT_INVALID', 'Bounded market must contain exactly 240 templates.');
  if (pack.excluded?.fullMarketUniverse3200 !== true || market.calibration?.all3200UniverseExcluded !== true) add(issues, 'error', 'FULL_UNIVERSE_NOT_EXCLUDED', 'The 3,200-instrument universe must be explicitly excluded.');
  if (!unique(market.templates.map((entry) => entry.stableId)) || !unique(market.templates.map((entry) => String(entry.ticker).toLowerCase()))) add(issues, 'error', 'MARKET_IDENTITIES_NOT_UNIQUE', 'Market stable IDs and symbols must be unique.');
  for (const country of COUNTRY_IDS) {
    const subset = market.templates.filter((entry) => entry.country === country);
    if (subset.length !== 24) add(issues, 'error', 'COUNTRY_MARKET_COUNT_INVALID', `${country} must contain exactly 24 selected instruments.`);
    if (subset.some((entry) => !(entry.basePrice > 0 && entry.beta >= 0 && entry.liquidity >= 0 && entry.longRunVolatility > 0))) add(issues, 'error', 'COUNTRY_MARKET_NUMERIC_INVALID', `${country} has invalid numeric enrichment.`);
  }

  if (arrival.countryCount !== 10 || arrival.calibrations?.length !== 10) add(issues, 'error', 'ARRIVAL_COUNT_INVALID', 'Arrival calibration must cover ten countries.');
  for (const entry of arrival.calibrations ?? []) {
    if (!(entry.approvedStartingBalance > 0 && entry.assumptions?.weeklyBasicNeeds > 0 && entry.viability?.weeksCoveredBeforeIncome >= 3)) add(issues, 'error', 'ARRIVAL_VIABILITY_INVALID', `${entry.country} does not preserve a three-week basic-needs buffer.`);
    if (!(entry.contractRewards?.arrival >= entry.assumptions?.weeklyBasicNeeds)) add(issues, 'error', 'ARRIVAL_REWARD_RELATION_INVALID', `${entry.country} arrival Contract must cover at least one week of basic needs.`);
    if (!(entry.attendanceRewards?.present > entry.attendanceRewards?.late && entry.attendanceRewards?.maximumNormalWeeklyAttendanceIncome < entry.assumptions?.weeklyBasicNeeds)) add(issues, 'error', 'ATTENDANCE_REWARD_RELATION_INVALID', `${entry.country} Attendance rewards are not bounded relative to ordinary expenses.`);
  }

  if (contracts.chainCount !== 10 || contracts.templateCount !== 30 || contracts.chains?.length !== 10 || contracts.templates?.length !== 30) add(issues, 'error', 'CONTRACT_CHAIN_COUNT_INVALID', 'Expected ten three-step tutorial Contract chains.');
  for (const chain of contracts.chains ?? []) {
    if (chain.steps?.length !== 3 || chain.steps.some((step, index) => step.sequence !== index + 1)) add(issues, 'error', 'CONTRACT_CHAIN_SEQUENCE_INVALID', `${chain.chainId} must contain three ordered steps.`);
  }
  if (!unique(contracts.templates.map((entry) => entry.templateKey))) add(issues, 'error', 'CONTRACT_KEY_DUPLICATE', 'Contract template keys must be unique.');

  if (store.itemCount !== 50 || store.items?.length !== 50) add(issues, 'error', 'STORE_COUNT_INVALID', 'Bounded Store catalog must contain exactly 50 entries.');
  if (!unique(store.items.map((entry) => entry.itemKey))) add(issues, 'error', 'STORE_KEY_DUPLICATE', 'Store item keys must be unique.');
  for (const item of store.items ?? []) {
    if (!(item.price > 0 && item.stockQuantity >= 0 && item.statusByDefault === 'disabled' && item.visibilityByDefault === 'hidden')) add(issues, 'error', 'STORE_ITEM_FAIL_CLOSED_INVALID', `${item.stableId} must have an approved price and remain disabled/hidden by default.`);
    if (!(item.affordability?.shareOfArrivalContractReward > 0 && item.affordability.shareOfArrivalContractReward <= 0.75)) add(issues, 'error', 'STORE_ITEM_UNAFFORDABLE', `${item.stableId} exceeds the bounded affordability ratio.`);
  }

  if (physical.itemCount !== 144 || physical.itemPrices?.length !== 144) add(issues, 'error', 'PHYSICAL_ITEM_COUNT_INVALID', 'Physical calibration must cover the existing 144 definitions.');
  if (Object.values(physical.exploitChecks ?? {}).some((value) => value !== 0)) add(issues, 'error', 'PHYSICAL_EXPLOIT_FAILURE', 'Physical economy exploit checks must have zero failures.');
  if ((physical.recipeEconomics ?? []).some((entry) => !entry.arbitrageSafe || !entry.recraftingSafe || entry.grossValueRatio < 1.12)) add(issues, 'error', 'RECIPE_ECONOMICS_UNSAFE', 'Recipe economics contain arbitrage or recrafting failures.');
  const concurrency = physical.concurrencySimulation ?? {};
  if (concurrency.negativeInventoryObserved || concurrency.finalUnits < 0 || concurrency.duplicateReplayMutations !== 0 || concurrency.accepted + concurrency.rejectedInsufficientStock !== concurrency.requests) add(issues, 'error', 'CONCURRENCY_SIMULATION_UNSAFE', 'Reference concurrency/idempotency simulation is unsafe.');

  if (locations.recordCount !== 50 || locations.locations?.length !== 50 || locations.verifiedPointCount !== 50) add(issues, 'error', 'LOCATION_COUNT_INVALID', 'All 50 locations must be verified.');
  const geometryPath = path.join(REPO_ROOT, locations.artworkEvidence?.geometryPath ?? '');
  const imagePath = path.join(REPO_ROOT, locations.artworkEvidence?.imagePath ?? '');
  if (!(await exists(geometryPath)) || await sha256File(geometryPath) !== locations.artworkEvidence?.geometrySha256) add(issues, 'error', 'MAP_GEOMETRY_DRIFT', 'Map geometry evidence is missing or has drifted.');
  if (!(await exists(imagePath)) || await sha256File(imagePath) !== locations.artworkEvidence?.imageSha256) add(issues, 'error', 'MAP_ARTWORK_DRIFT', 'Map artwork evidence is missing or has drifted.');
  if (await exists(geometryPath)) {
    const geometry = await import(`${pathToFileURL(geometryPath).href}?validate-beta-pack`);
    const regionById = new Map(geometry.ECONOVARIA_COUNTRY_REGIONS.map((entry) => [entry.id, entry]));
    for (const location of locations.locations ?? []) {
      const region = regionById.get(location.country);
      const point = [location.mapPoint?.x, location.mapPoint?.y];
      if (!region || !point.every(Number.isFinite) || !pointInRegion(point, region.polygons)) add(issues, 'error', 'LOCATION_OUTSIDE_COUNTRY', `${location.id} is not inside the actual ${location.country} artwork polygon.`);
    }
  }

  const mappedStableIds = [
    ...(mappings.mappings?.stockTemplates ?? []).map((entry) => entry.stableId),
    ...(mappings.mappings?.contractTemplates ?? []).map((entry) => entry.stableId),
    ...(mappings.mappings?.storeItems ?? []).map((entry) => entry.stableId),
    ...(mappings.mappings?.locations ?? []).map((entry) => entry.stableId),
  ];
  if (!unique(mappedStableIds)) add(issues, 'error', 'STABLE_ID_MAPPING_DUPLICATE', 'Stable-ID map contains duplicate identities.');

  for (const entry of integrity.files ?? []) {
    const filePath = path.join(packRoot, entry.path);
    if (!(await exists(filePath))) add(issues, 'error', 'INTEGRITY_FILE_MISSING', `${entry.path} is missing from the pack.`, entry.path);
    else if (await sha256File(filePath) !== entry.sha256) add(issues, 'error', 'INTEGRITY_DIGEST_MISMATCH', `${entry.path} checksum does not match.`, entry.path);
    else if ((await readFile(filePath)).byteLength !== entry.bytes) add(issues, 'error', 'INTEGRITY_SIZE_MISMATCH', `${entry.path} byte size does not match.`, entry.path);
  }
  if (integrity.fileCount !== integrity.files?.length || integrity.packSha256 !== integrity.files?.find((entry) => entry.path === 'pack-v1.json')?.sha256) add(issues, 'error', 'INTEGRITY_MANIFEST_INVALID', 'Integrity manifest count or pack digest is invalid.');

  const errors = issues.filter((entry) => entry.severity === 'error').length;
  const warnings = issues.filter((entry) => entry.severity === 'warning').length;
  return {
    schemaVersion: 'econovaria-beta-pack-validation-report-v1', packId: pack.packId, version: pack.version,
    valid: errors === 0, stagingStructurallyReady: errors === 0,
    summary: { errors, warnings, marketInstruments: market.templates.length, storeItems: store.items.length, contractChains: contracts.chains.length, locations: locations.locations.length, physicalItems: physical.itemPrices.length, campaignEvents: campaign.selectedEventStableIds?.length ?? 0 },
    issues,
  };
}

async function main() {
  const report = await validateSeedBetaPack();
  console.log(JSON.stringify(report, null, 2));
  if (!report.valid) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
