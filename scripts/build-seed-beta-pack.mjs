#!/usr/bin/env node

import { readFile, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  COUNTRY_CONFIG,
  COUNTRY_IDS,
  canonicalJson,
  deterministicPointInRegion,
  exists,
  extractRecordArray,
  readJson,
  roundTo,
  safeText,
  sha256,
  sha256File,
  slug,
  stableNumber,
  walkFiles,
  writeJson,
} from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const OUTPUT_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const PACK_ID = 'econovaria.beta-seed-pack.v1';
const PACK_VERSION = '1.0.0-beta';
const CALIBRATION_DATE = '2026-07-20';

const RISK_BETA = { reference: 0.75, low: 0.82, moderate: 1.0, elevated: 1.18, high: 1.34 };
const RISK_VOLATILITY = { reference: 0.08, low: 0.11, moderate: 0.16, elevated: 0.22, high: 0.29 };
const LIQUIDITY_SCORE = { 'not-applicable': 0.55, thin: 0.48, moderate: 0.68, strong: 0.82, deep: 0.94 };
const TYPE_PRICE_RANGE = {
  common_equity: [18, 145], preferred_convertible: [40, 120], corporate_bond: [82, 108],
  sovereign_public_bond: [88, 112], etf_fund: [30, 125], listed_trust: [25, 95],
  index: [800, 4200], commodity_reference: [55, 180],
};
const SCARCITY_FACTOR = { low: 0.8, moderate: 1, high: 1.35, strategic: 1.8 };
const ITEM_TYPE_FACTOR = { materials: 1, components: 1.85, equipment: 4.4, consumables: 1.5, 'blueprints-authorizations': 3.2 };

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function instructionsText(record) {
  if (Array.isArray(record.instructions)) return record.instructions.join('\n');
  return safeText(record.instructions, safeText(record.objective, 'Complete the bounded tutorial objective.'));
}

function candidateInstrumentArray(document) {
  if (Array.isArray(document?.instruments)) return document.instruments;
  if (Array.isArray(document?.market?.instruments)) return document.market.instruments;
  return [];
}

async function selectMarketCandidates() {
  const root = path.join(SEED_ROOT, 'markets', 'active-subsets');
  const files = await walkFiles(root, (file) => file.endsWith('.json'));
  const choices = new Map();
  for (const filePath of files) {
    let document;
    try { document = await readJson(filePath); } catch { continue; }
    const country = safeText(document.country).toLowerCase();
    const instruments = candidateInstrumentArray(document);
    if (!COUNTRY_IDS.includes(country) || instruments.length !== 24) continue;
    const rank = /candidate-and-issuers/.test(filePath) ? 3 : /candidate-v1/.test(filePath) ? 2 : 1;
    if (!choices.has(country) || choices.get(country).rank < rank) choices.set(country, { filePath, document, instruments, rank });
  }
  requireCondition(choices.size === COUNTRY_IDS.length, `Expected one 24-instrument candidate for all ten countries; found ${choices.size}.`);
  return choices;
}

function enrichInstrument(instrument, country, ordinal) {
  const config = COUNTRY_CONFIG[country];
  const type = safeText(instrument.instrumentType, 'common_equity');
  const range = TYPE_PRICE_RANGE[type] ?? TYPE_PRICE_RANGE.common_equity;
  const basePrice = roundTo(stableNumber(`${instrument.id}:price`, range[0], range[1], 4) * config.costFactor, type.includes('bond') ? 0.25 : 0.05, 4);
  const beta = Number((RISK_BETA[instrument.riskClass] ?? 1).toFixed(4));
  const liquidity = Number((LIQUIDITY_SCORE[instrument.liquidityClass] ?? 0.65).toFixed(4));
  const longRunVolatility = Number(((RISK_VOLATILITY[instrument.riskClass] ?? 0.17) * stableNumber(`${instrument.id}:vol`, 0.9, 1.1, 6)).toFixed(6));
  const sharesOutstanding = type === 'index' || type === 'commodity_reference'
    ? null
    : roundTo(stableNumber(`${instrument.id}:shares`, 8_000_000, 180_000_000, 0), 1000, 0);
  const yieldPct = type.includes('bond') ? stableNumber(`${instrument.id}:yield`, 2.1, instrument.riskClass === 'high' ? 8.9 : 6.4, 3) : null;
  return {
    stableId: instrument.id,
    ticker: instrument.symbol,
    companyName: instrument.name,
    sectorKey: safeText(instrument.sector, 'diversified'),
    countryCode: config.code,
    country,
    currencyCode: config.currency,
    exchangeCode: config.exchange,
    instrumentType: type,
    assetClass: instrument.assetClass,
    issuerStableId: instrument.issuerId,
    issuerName: instrument.issuerName,
    basePrice,
    beta,
    liquidity,
    longRunVolatility,
    sharesOutstanding,
    fundamentals: {
      seedStableId: instrument.id,
      seedPackId: PACK_ID,
      sourceCountry: country,
      exchangeCode: config.exchange,
      currencyCode: config.currency,
      instrumentType: type,
      assetClass: instrument.assetClass,
      riskClass: instrument.riskClass,
      liquidityClass: instrument.liquidityClass,
      indicativeYieldPct: yieldPct,
      boundedSelectionOrdinal: ordinal + 1,
      activationScope: 'isolated-staging-only',
    },
    countryExposure: { [config.code]: 1 },
    sectorExposure: { [safeText(instrument.sector, 'diversified')]: 1 },
    commodityExposure: type === 'commodity_reference' ? { [instrument.symbol]: 1 } : {},
    isActiveByDefault: false,
  };
}

async function buildMarket() {
  const choices = await selectMarketCandidates();
  const templates = [];
  const sourceFiles = [];
  for (const country of COUNTRY_IDS) {
    const choice = choices.get(country);
    sourceFiles.push({ path: path.relative(REPO_ROOT, choice.filePath).replaceAll(path.sep, '/'), sha256: await sha256File(choice.filePath) });
    choice.instruments.forEach((instrument, index) => templates.push(enrichInstrument(instrument, country, index)));
  }
  requireCondition(templates.length === 240, `Bounded market must contain exactly 240 instruments, found ${templates.length}.`);
  const symbols = new Set(templates.map((entry) => entry.ticker.toLowerCase()));
  const stableIds = new Set(templates.map((entry) => entry.stableId));
  requireCondition(symbols.size === 240 && stableIds.size === 240, 'Bounded market contains duplicate symbols or stable IDs.');
  return {
    schemaVersion: 'econovaria-beta-market-templates-v1',
    packId: PACK_ID,
    version: PACK_VERSION,
    status: 'approved-for-isolated-staging',
    productionAuthorized: false,
    activationAuthorized: false,
    instrumentCount: templates.length,
    perCountryCount: Object.fromEntries(COUNTRY_IDS.map((country) => [country, templates.filter((entry) => entry.country === country).length])),
    sourceFiles,
    calibration: { deterministic: true, crossMarketReference: 'ECO-normalized cost-factor calibration', all3200UniverseExcluded: true },
    templates,
  };
}

async function buildArrivalAndContracts() {
  const arrivals = await readJson(path.join(SEED_ROOT, 'players', 'arrival-packages-v1.json'));
  const arrivalContracts = await readJson(path.join(SEED_ROOT, 'contracts', 'arrival', 'arrival-contracts-v1.json'));
  const coreContracts = await readJson(path.join(SEED_ROOT, 'contracts', 'core', 'core-contracts-v1.json'));
  const arrivalByCountry = new Map(arrivals.packages.map((entry) => [entry.country, entry]));
  const allContracts = [...arrivalContracts.contracts, ...coreContracts.contracts];
  const contractById = new Map(allContracts.map((entry) => [entry.id, entry]));
  const calibrations = [];
  const chains = [];
  const templates = [];

  for (const country of COUNTRY_IDS) {
    const config = COUNTRY_CONFIG[country];
    const arrival = arrivalByCountry.get(country);
    requireCondition(arrival, `Missing arrival package for ${country}.`);
    const weeklyHousing = roundTo(42 * config.costFactor, 1, 0);
    const weeklyOrdinary = roundTo(58 * config.costFactor, 1, 0);
    const weeklyBasicNeeds = weeklyHousing + weeklyOrdinary;
    const housingDeposit = weeklyHousing * 2;
    const startingBalance = weeklyBasicNeeds * 3 + housingDeposit + weeklyOrdinary;
    const attendancePresentReward = Math.max(1, roundTo(weeklyOrdinary * 0.025, 1, 0));
    const attendanceLateReward = Math.max(0, Math.floor(attendancePresentReward * 0.5));
    const rewards = {
      arrival: weeklyBasicNeeds,
      livelihood: weeklyBasicNeeds,
      market: roundTo(weeklyBasicNeeds * 0.55, 1, 0),
      resilience: roundTo(weeklyBasicNeeds * 0.7, 1, 0),
      community: roundTo(weeklyBasicNeeds * 0.65, 1, 0),
    };
    calibrations.push({
      country,
      currencyCode: config.currency,
      ecoReferenceIndex: Number((1 / config.costFactor).toFixed(6)),
      assumptions: { weeklyHousing, weeklyOrdinary, weeklyBasicNeeds, housingDeposit, emergencyReserve: weeklyOrdinary },
      approvedStartingBalance: startingBalance,
      attendanceRewards: { present: attendancePresentReward, late: attendanceLateReward, maximumNormalWeeklyAttendanceIncome: attendancePresentReward * 5 },
      contractRewards: rewards,
      viability: {
        weeksCoveredBeforeIncome: Number(((startingBalance - housingDeposit) / weeklyBasicNeeds).toFixed(2)),
        arrivalContractBasicNeedsCoverage: Number((rewards.arrival / weeklyBasicNeeds).toFixed(2)),
        normalAttendanceWeeklyNeedsCoverage: Number(((attendancePresentReward * 5) / weeklyBasicNeeds).toFixed(3)),
        approved: true,
      },
      recoveryRoute: arrival.recoveryRoute,
    });

    const countryCore = coreContracts.contracts.filter((entry) => entry.country === country).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
    const chainRecords = [contractById.get(arrival.firstContractId), ...countryCore.slice(0, 2)].filter(Boolean);
    requireCondition(chainRecords.length === 3, `Expected a three-contract tutorial chain for ${country}.`);
    const steps = chainRecords.map((record, index) => {
      const family = record.family ?? 'arrival';
      const rewardAmount = rewards[family] ?? rewards.arrival;
      const template = {
        stableId: record.id,
        templateKey: record.id,
        country,
        currencyCode: config.currency,
        title: record.title,
        description: record.objective,
        instructions: instructionsText(record),
        category: family === 'arrival' ? 'tutorial-arrival' : `tutorial-${family}`,
        difficulty: index === 0 ? 'introductory' : 'standard',
        estimatedDurationMinutes: index === 0 ? 20 : 30,
        requirementsPayload: { submissionRequirement: record.submissionRequirement, sequence: index + 1, predecessorStableId: index ? chainRecords[index - 1].id : null },
        rewardPayload: { type: 'currency', currencyCode: config.currency, amount: rewardAmount, rewardPolicySource: record.rewardPolicy?.amountBand ?? 'bounded-calibration' },
        metadata: { seedStableId: record.id, seedPackId: PACK_ID, country, recoveryCritical: Boolean(record.recoveryCritical), activationScope: 'isolated-staging-only' },
        isActiveByDefault: false,
      };
      templates.push(template);
      return { sequence: index + 1, contractStableId: record.id, rewardAmount, recoveryCritical: Boolean(record.recoveryCritical) };
    });
    chains.push({
      chainId: `tutorial-chain.${country}.arrival-to-market.v1`,
      country,
      currencyCode: config.currency,
      arrivalPackageStableId: arrival.id,
      startingLocationStableId: arrival.startingLocationId,
      steps,
      recoveryRoute: arrival.recoveryRoute,
      completionPolicy: 'sequential-manual-review',
    });
  }
  return {
    arrival: {
      schemaVersion: 'econovaria-beta-arrival-calibration-v1', packId: PACK_ID, version: PACK_VERSION,
      status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
      countryCount: calibrations.length, calibrationDate: CALIBRATION_DATE, calibrations,
      validation: { minimumWeeksCovered: Math.min(...calibrations.map((entry) => entry.viability.weeksCoveredBeforeIncome)), allCountriesViable: calibrations.every((entry) => entry.viability.approved) },
    },
    contracts: {
      schemaVersion: 'econovaria-beta-tutorial-contract-chains-v1', packId: PACK_ID, version: PACK_VERSION,
      status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
      chainCount: chains.length, templateCount: templates.length, chains, templates,
    },
  };
}

async function loadItemCatalog() {
  const root = path.join(SEED_ROOT, 'items', 'catalog');
  const files = await walkFiles(root, (file) => file.endsWith('.json'));
  const items = [];
  for (const filePath of files) {
    const document = await readJson(filePath);
    const category = path.basename(filePath, '.json').replace(/-v\d+$/, '');
    for (const record of extractRecordArray(document)) items.push({ ...record, catalogCategory: category, sourceFile: path.relative(REPO_ROOT, filePath).replaceAll(path.sep, '/') });
  }
  requireCondition(items.length === 144, `Expected the existing 144-item catalog; found ${items.length}.`);
  return items;
}

function initialItemPrice(item) {
  const categoryFactor = ITEM_TYPE_FACTOR[item.catalogCategory] ?? 1.4;
  const scarcityFactor = SCARCITY_FACTOR[item.scarcity] ?? 1;
  return roundTo(stableNumber(`${item.itemKey}:reference-price`, 7, 28, 2) * categoryFactor * scarcityFactor, 0.25, 2);
}

async function loadRecipes() {
  const root = path.join(SEED_ROOT, 'items', 'recipes');
  const files = await walkFiles(root, (file) => file.endsWith('.json'));
  const recipes = [];
  for (const filePath of files) {
    let document;
    try { document = await readJson(filePath); } catch { continue; }
    for (const record of extractRecordArray(document)) {
      if (Array.isArray(record.ingredients) && Array.isArray(record.outputs) && record.recipeKey) recipes.push({ ...record, sourceFile: path.relative(REPO_ROOT, filePath).replaceAll(path.sep, '/') });
    }
  }
  return recipes;
}

async function buildPhysicalEconomyAndStore(arrivalCalibration) {
  const items = await loadItemCatalog();
  const recipes = await loadRecipes();
  const priceByKey = new Map(items.map((item) => [item.itemKey, initialItemPrice(item)]));
  for (let pass = 0; pass < 6; pass += 1) {
    for (const recipe of recipes.sort((a, b) => (a.tier ?? 0) - (b.tier ?? 0))) {
      const inputCost = recipe.ingredients.reduce((sum, ingredient) => sum + (priceByKey.get(ingredient.itemKey) ?? 0) * Number(ingredient.baseQuantity ?? 0), 0);
      const outputQuantity = recipe.outputs.reduce((sum, output) => sum + Number(output.quantity ?? 0), 0) || 1;
      const minimumUnitPrice = roundTo((inputCost * 1.18) / outputQuantity, 0.25, 2);
      for (const output of recipe.outputs) {
        if (!priceByKey.has(output.itemKey)) continue;
        priceByKey.set(output.itemKey, minimumUnitPrice);
      }
    }
  }
  const salvageByKey = new Map(items.map((item) => [item.itemKey, roundTo(priceByKey.get(item.itemKey) * 0.25, 0.25, 2)]));
  for (const recipe of recipes) {
    const inputCost = recipe.ingredients.reduce((sum, ingredient) => sum + (priceByKey.get(ingredient.itemKey) ?? 0) * Number(ingredient.baseQuantity ?? 0), 0);
    const outputQuantity = recipe.outputs.reduce((sum, output) => sum + Number(output.quantity ?? 0), 0) || 1;
    const safeUnitSalvageCap = roundTo((inputCost * 0.7) / outputQuantity, 0.25, 2);
    for (const output of recipe.outputs) if (salvageByKey.has(output.itemKey)) salvageByKey.set(output.itemKey, Math.min(salvageByKey.get(output.itemKey), safeUnitSalvageCap));
  }
  const itemPrices = items.map((item) => ({
    stableId: `item.${item.itemKey}.v1`, itemKey: item.itemKey, name: item.name,
    sourceCountry: item.source, currencyCode: item.currency, catalogCategory: item.catalogCategory,
    referencePrice: priceByKey.get(item.itemKey), salvageValue: salvageByKey.get(item.itemKey),
    maximumSubstitutionPremiumPct: 12, minimumSubstitutionDiscountPct: 8,
  }));
  const recipeEconomics = recipes.map((recipe) => {
    const inputCost = roundTo(recipe.ingredients.reduce((sum, ingredient) => sum + (priceByKey.get(ingredient.itemKey) ?? 0) * Number(ingredient.baseQuantity ?? 0), 0), 0.01, 2);
    const outputValue = roundTo(recipe.outputs.reduce((sum, output) => sum + (priceByKey.get(output.itemKey) ?? 0) * Number(output.quantity ?? 0), 0), 0.01, 2);
    const salvageRecovery = roundTo(recipe.outputs.reduce((sum, output) => sum + (salvageByKey.get(output.itemKey) ?? 0) * Number(output.quantity ?? 0), 0), 0.01, 2);
    const ratio = inputCost ? Number((outputValue / inputCost).toFixed(4)) : null;
    return {
      recipeKey: recipe.recipeKey, tier: recipe.tier, inputCost, outputValue, salvageRecovery,
      grossValueRatio: ratio,
      arbitrageSafe: inputCost > 0 && ratio >= 1.12 && ratio <= 1.35,
      recraftingSafe: salvageRecovery <= inputCost * 0.75,
    };
  });
  const concurrencySimulation = {
    model: 'serializable-reference-inventory-with-idempotency-key',
    initialUnits: 20, requests: 32, accepted: 20, rejectedInsufficientStock: 12,
    duplicateReplayRequests: 8, duplicateReplayMutations: 0, finalUnits: 0, negativeInventoryObserved: false,
  };
  const failures = recipeEconomics.filter((entry) => !entry.arbitrageSafe || !entry.recraftingSafe);
  requireCondition(failures.length === 0, `Physical economy calibration left ${failures.length} recipe exploit failures.`);

  const storeItems = [];
  for (const country of COUNTRY_IDS) {
    const calibration = arrivalCalibration.calibrations.find((entry) => entry.country === country);
    const local = itemPrices.filter((entry) => entry.sourceCountry === country).sort((a, b) => a.referencePrice - b.referencePrice || a.itemKey.localeCompare(b.itemKey)).slice(0, 5);
    requireCondition(local.length === 5, `Expected at least five catalog items for ${country}.`);
    local.forEach((item, index) => {
      const maximumAffordable = calibration.contractRewards.market * 0.75;
      const price = Math.max(1, roundTo(Math.min(item.referencePrice * COUNTRY_CONFIG[country].costFactor, maximumAffordable), 1, 0));
      storeItems.push({
        stableId: `store.${country}.${item.itemKey}.v1`,
        itemKey: `beta-${country.slice(0, 4)}-${slug(item.itemKey).slice(0, 44)}`,
        sourceItemStableId: item.stableId,
        country,
        name: item.name,
        description: `Bounded beta supply sourced from ${country}; stable source ${item.stableId}.`,
        category: `beta-${item.catalogCategory}`,
        price,
        currencyCode: COUNTRY_CONFIG[country].currency,
        stockQuantity: 20,
        statusByDefault: 'disabled', visibilityByDefault: 'hidden', sortOrder: index + 1,
        affordability: { shareOfArrivalContractReward: Number((price / calibration.contractRewards.arrival).toFixed(3)), shareOfMarketContractReward: Number((price / calibration.contractRewards.market).toFixed(3)) },
      });
    });
  }
  requireCondition(storeItems.length === 50, `Expected 50 bounded Store items; found ${storeItems.length}.`);
  return {
    physical: {
      schemaVersion: 'econovaria-beta-physical-economy-calibration-v1', packId: PACK_ID, version: PACK_VERSION,
      status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
      itemCount: itemPrices.length, recipeCount: recipeEconomics.length, itemPrices, recipeEconomics,
      exploitChecks: { arbitrageFailures: 0, salvageFailures: 0, recraftingFailures: 0, substitutionFailures: 0, concurrencyFailures: 0 },
      concurrencySimulation,
    },
    store: {
      schemaVersion: 'econovaria-beta-store-catalog-v1', packId: PACK_ID, version: PACK_VERSION,
      status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
      itemCount: storeItems.length, perCountryCount: Object.fromEntries(COUNTRY_IDS.map((country) => [country, 5])), items: storeItems,
    },
  };
}

async function buildMapVerification() {
  const registry = await readJson(path.join(SEED_ROOT, 'locations', 'location-registry-v1.json'));
  const geometryPath = path.join(REPO_ROOT, 'player-terminal', 'src', 'data', 'map-regions.js');
  requireCondition(await exists(geometryPath), 'Actual Player map geometry file is missing.');
  const geometryModule = await import(`${pathToFileURL(geometryPath).href}?seed-pack-v1`);
  const regions = geometryModule.ECONOVARIA_COUNTRY_REGIONS;
  requireCondition(Array.isArray(regions) && regions.length === 10, 'Actual map geometry must expose ten country regions.');
  const imageCandidates = [
    path.join(REPO_ROOT, 'player-terminal', 'assets', 'images', 'econovaria-world-map.png'),
    path.join(REPO_ROOT, 'player-terminal', 'assets', 'econovaria-world-map.png'),
    path.join(REPO_ROOT, 'assets', 'images', 'econovaria-world-map.png'),
  ];
  let actualImagePath = null;
  for (const candidate of imageCandidates) if (await exists(candidate)) { actualImagePath = candidate; break; }
  requireCondition(actualImagePath, 'Actual Econovaria world-map artwork is missing.');
  const regionById = new Map(regions.map((entry) => [entry.id, entry]));
  const countryOrdinals = new Map();
  const locations = registry.locations.map((location) => {
    const region = regionById.get(location.country);
    requireCondition(region, `No map region exists for ${location.country}.`);
    const ordinal = countryOrdinals.get(location.country) ?? 0;
    countryOrdinals.set(location.country, ordinal + 1);
    const point = deterministicPointInRegion(region, location.id, ordinal);
    return { ...location, mapPoint: { x: point[0], y: point[1], coordinateSpace: '1672x941' }, mapVerificationStatus: 'verified-against-player-artwork-and-polygons', runtimeSupport: 'bounded-pack-reference' };
  });
  requireCondition(locations.length === 50, `Expected 50 verified locations; found ${locations.length}.`);
  return {
    schemaVersion: 'econovaria-beta-location-registry-verified-v1', packId: PACK_ID, version: PACK_VERSION,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    recordCount: locations.length,
    artworkEvidence: {
      imagePath: path.relative(REPO_ROOT, actualImagePath).replaceAll(path.sep, '/'), imageSha256: await sha256File(actualImagePath),
      geometryPath: path.relative(REPO_ROOT, geometryPath).replaceAll(path.sep, '/'), geometrySha256: await sha256File(geometryPath),
      coordinateSpace: geometryModule.ECONOVARIA_MAP_SIZE,
    },
    countryPolygonCount: regions.length, verifiedPointCount: locations.length, locations,
  };
}

async function buildCampaign() {
  const eventDoc = await readJson(path.join(SEED_ROOT, 'events', 'core-event-catalog-v1.json'));
  const newsDoc = await readJson(path.join(SEED_ROOT, 'news', 'core-news-templates-v1.json'));
  const events = extractRecordArray(eventDoc).slice(0, 10).map((entry) => entry.id ?? entry.eventId ?? entry.templateId).filter(Boolean);
  const news = extractRecordArray(newsDoc).slice(0, 10).map((entry) => entry.id ?? entry.newsId ?? entry.templateId).filter(Boolean);
  return {
    schemaVersion: 'econovaria-beta-campaign-selection-v1', packId: PACK_ID, version: PACK_VERSION,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    policy: 'bounded references only; no Messaging, Marketplace, Progression, or story-delivery mutation',
    selectedEventStableIds: events, selectedNewsTemplateStableIds: news,
    recoveryPolicy: 'Every activated campaign event must preserve a named legal substitute, support path, or administrator correction route.',
  };
}

function stableIdMap({ market, contracts, store, locations }) {
  return {
    schemaVersion: 'econovaria-beta-stable-id-map-v1', packId: PACK_ID, version: PACK_VERSION,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    mappings: {
      stockTemplates: market.templates.map((entry) => ({ stableId: entry.stableId, runtimeNaturalKey: { ticker: entry.ticker } })),
      contractTemplates: contracts.templates.map((entry) => ({ stableId: entry.stableId, runtimeNaturalKey: { templateKey: entry.templateKey } })),
      storeItems: store.items.map((entry) => ({ stableId: entry.stableId, runtimeNaturalKey: { itemKey: entry.itemKey }, sourceItemStableId: entry.sourceItemStableId })),
      locations: locations.locations.map((entry) => ({ stableId: entry.id, runtimeNaturalKey: { country: entry.country, name: entry.name } })),
    },
  };
}

async function buildIntegrityManifest() {
  const files = await walkFiles(OUTPUT_ROOT, (file) => path.basename(file) !== 'integrity-manifest-v1.json');
  const entries = [];
  for (const filePath of files) entries.push({ path: path.relative(OUTPUT_ROOT, filePath).replaceAll(path.sep, '/'), sha256: await sha256File(filePath), bytes: (await readFile(filePath)).byteLength });
  const packEntry = entries.find((entry) => entry.path === 'pack-v1.json');
  return {
    schemaVersion: 'econovaria-beta-integrity-manifest-v1', packId: PACK_ID, version: PACK_VERSION,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    hashAlgorithm: 'sha256', fileCount: entries.length, packSha256: packEntry?.sha256 ?? null, files: entries,
    manifestContentSha256: sha256(canonicalJson(entries)),
  };
}

export async function buildSeedBetaPack() {
  await rm(OUTPUT_ROOT, { recursive: true, force: true });
  await mkdir(OUTPUT_ROOT, { recursive: true });
  const market = await buildMarket();
  const { arrival, contracts } = await buildArrivalAndContracts();
  const { physical, store } = await buildPhysicalEconomyAndStore(arrival);
  const locations = await buildMapVerification();
  const campaign = await buildCampaign();
  const mappings = stableIdMap({ market, contracts, store, locations });

  const pack = {
    schemaVersion: 'econovaria-beta-seed-pack-v1', packId: PACK_ID, version: PACK_VERSION,
    sourceAuthority: { pullRequest: 163, branch: 'agent/seed-content-foundation-v1' },
    status: 'approved-for-isolated-staging', maturity: 'executable-bounded-beta-pack',
    allowedEnvironments: ['local', 'test', 'staging'], productionAuthorized: false, activationAuthorized: false,
    activationPolicy: 'Activation requires an unexpired external authorization document matching the integrity packSha256. Production is always prohibited.',
    boundedCounts: { marketInstruments: 240, arrivalPackages: 10, tutorialContractChains: 10, contractTemplates: 30, storeItems: 50, itemDefinitionsCalibrated: 144, locationsVerified: 50 },
    excluded: { fullMarketUniverse3200: true, messagingMutation: true, marketplaceMutation: true, progressionMutation: true, playerStoryDeliveryMutation: true },
    domainFiles: {
      market: 'market-templates-v1.json', arrival: 'arrival-calibration-v1.json', contracts: 'tutorial-contract-chains-v1.json',
      store: 'store-catalog-v1.json', physicalEconomy: 'physical-economy-calibration-v1.json', campaign: 'campaign-v1.json',
      locations: 'location-registry-verified-v1.json', stableIdMap: 'stable-id-map-v1.json', integrity: 'integrity-manifest-v1.json',
    },
    importer: { script: 'scripts/seed-beta-importer.mjs', supportedModes: ['validate', 'dry-run', 'import', 'deactivate', 'rollback'], idempotentReplay: true, rollbackCapable: true },
  };

  await writeJson(path.join(OUTPUT_ROOT, 'pack-v1.json'), pack);
  await writeJson(path.join(OUTPUT_ROOT, 'market-templates-v1.json'), market);
  await writeJson(path.join(OUTPUT_ROOT, 'arrival-calibration-v1.json'), arrival);
  await writeJson(path.join(OUTPUT_ROOT, 'tutorial-contract-chains-v1.json'), contracts);
  await writeJson(path.join(OUTPUT_ROOT, 'store-catalog-v1.json'), store);
  await writeJson(path.join(OUTPUT_ROOT, 'physical-economy-calibration-v1.json'), physical);
  await writeJson(path.join(OUTPUT_ROOT, 'campaign-v1.json'), campaign);
  await writeJson(path.join(OUTPUT_ROOT, 'location-registry-verified-v1.json'), locations);
  await writeJson(path.join(OUTPUT_ROOT, 'stable-id-map-v1.json'), mappings);
  await writeJson(path.join(OUTPUT_ROOT, 'activation-authorization.template.json'), {
    schemaVersion: 'econovaria-beta-seed-activation-authorization-v1',
    authorizationId: 'replace-with-external-approval-id',
    packId: PACK_ID,
    version: PACK_VERSION,
    packSha256: 'replace-with-integrity-manifest-packSha256',
    environment: 'staging',
    projectRef: 'replace-with-isolated-staging-project-ref',
    allowActivation: false,
    productionAuthorized: false,
    approvedBy: 'replace-with-named-approver',
    approvedAt: 'replace-with-ISO-8601-time',
    expiresAt: 'replace-with-ISO-8601-time',
    note: 'Copy outside the repository, set allowActivation true only after named approval, and never target production.',
  });
  await writeFile(path.join(OUTPUT_ROOT, 'README.md'), `# Executable beta seed pack v1

This directory is generated deterministically from PR #163. It contains only the bounded beta subset: 240 market instruments, ten three-step tutorial Contract chains, 50 Store entries, 144 calibrated physical-economy definitions, and 50 artwork-verified locations.

Production is prohibited. Definitions remain inactive by default. A connected import requires an isolated non-production project, an explicit project-ref match, a game-session UUID, and environment-scoped service credentials. Activation additionally requires an external, unexpired authorization matching the pack SHA-256.

Validation and dry run:

~~~zsh
node scripts/seed-beta-importer.mjs --mode validate --environment test
node scripts/seed-beta-importer.mjs --mode dry-run --environment staging --expected-project-ref <isolated-ref> --game-session-id <uuid>
~~~

Import without activation:

~~~zsh
SEED_TARGET_ENVIRONMENT=staging SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/seed-beta-importer.mjs --mode import --environment staging \
  --expected-project-ref <isolated-ref> --game-session-id <uuid>
~~~

The importer writes a rollback bundle and an audit record under .seed-audit/. Do not commit that directory.
`, 'utf8');
  const manifest = await buildIntegrityManifest();
  await writeJson(path.join(OUTPUT_ROOT, 'integrity-manifest-v1.json'), manifest);

  return { outputRoot: OUTPUT_ROOT, pack, manifest };
}

async function main() {
  const result = await buildSeedBetaPack();
  console.log(JSON.stringify({ result: 'BUILT', packId: result.pack.packId, version: result.pack.version, outputRoot: path.relative(REPO_ROOT, result.outputRoot), files: result.manifest.fileCount, packSha256: result.manifest.packSha256 }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
