#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, readJson, sha256, sha256File, walkFiles, writeJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const SOURCE_PATH = path.join(SEED_ROOT, 'players', 'arrival-content-source-v2.json');
const ARRIVAL_PACKAGES_PATH = path.join(SEED_ROOT, 'players', 'arrival-packages-v1.json');
const COUNTRY_IDS = ['northreach','yrethia','thaloris','solvend','eldoran','valerion','lumenor','xalvoria','dravenlok','syndalis'];
const PLACEHOLDER_PATTERNS = [/bounded beta/i,/stable source/i,/placeholder/i,/lorem ipsum/i,/\btbd\b/i,/\btodo\b/i,/\breplace[- ]?me\b/i];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertPlayerFacingText(value, minimum, label) {
  const text = String(value ?? '').trim();
  requireCondition(text.length >= minimum, `${label} is too short.`);
  requireCondition(!PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)), `${label} contains placeholder or internal seed language.`);
  return text;
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
  entries.sort((left, right) => left.path.localeCompare(right.path));
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

function validateSource(source, packages) {
  requireCondition(source.schemaVersion === 'econovaria-arrival-content-source-v2', 'Arrival content source schema is invalid.');
  requireCondition(source.countryCount === 10, 'Arrival content source must declare ten countries.');
  requireCondition(source.records?.length === 10, 'Arrival content source must contain ten records.');
  requireCondition(new Set(source.records.map((record) => record.stableId)).size === 10, 'Arrival content stable IDs must be unique.');
  requireCondition(new Set(source.records.map((record) => record.country)).size === 10, 'Arrival content countries must be unique.');
  requireCondition(new Set(source.records.map((record) => record.welcomeMessage)).size === 10, 'Arrival welcome messages must be unique.');
  requireCondition(new Set(source.records.map((record) => record.firstDayChecklist.join('\n'))).size === 10, 'Arrival first-day checklists must be unique.');

  const packageByCountry = new Map(packages.packages.map((entry) => [entry.country, entry]));
  for (const country of COUNTRY_IDS) {
    const record = source.records.find((entry) => entry.country === country);
    const arrivalPackage = packageByCountry.get(country);
    requireCondition(record, `Missing arrival content for ${country}.`);
    requireCondition(arrivalPackage, `Missing arrival package for ${country}.`);
    requireCondition(record.arrivalPackageStableId === arrivalPackage.id, `${country} arrival content package identity drifted.`);
    assertPlayerFacingText(record.title, 12, `${country} title`);
    assertPlayerFacingText(record.situationBrief, 180, `${country} situation brief`);
    assertPlayerFacingText(record.welcomeMessage, 220, `${country} welcome message`);
    assertPlayerFacingText(record.sponsorNote, 100, `${country} sponsor note`);
    requireCondition(record.firstDayChecklist?.length === 5, `${country} must have five first-day checklist steps.`);
    requireCondition(record.localTradeoffs?.length === 3, `${country} must have three local trade-offs.`);
    record.firstDayChecklist.forEach((step, index) => assertPlayerFacingText(step, 70, `${country} checklist ${index + 1}`));
    record.localTradeoffs.forEach((tradeoff, index) => assertPlayerFacingText(tradeoff, 70, `${country} trade-off ${index + 1}`));
  }
}

export async function applyArrivalContentOverrides() {
  const [source, packages, calibration, tutorial, pack] = await Promise.all([
    readJson(SOURCE_PATH),
    readJson(ARRIVAL_PACKAGES_PATH),
    readJson(path.join(PACK_ROOT, 'arrival-calibration-v1.json')),
    readJson(path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json')),
    readJson(path.join(PACK_ROOT, 'pack-v1.json')),
  ]);
  validateSource(source, packages);
  requireCondition(calibration.countryCount === 10 && calibration.calibrations?.length === 10, 'Generated arrival calibration must contain ten countries.');
  requireCondition(tutorial.chainCount === 10 && tutorial.chains?.length === 10, 'Generated tutorial chains must contain ten countries.');

  const sourceByCountry = new Map(source.records.map((record) => [record.country, record]));
  const packageByCountry = new Map(packages.packages.map((entry) => [entry.country, entry]));
  const calibrationByCountry = new Map(calibration.calibrations.map((entry) => [entry.country, entry]));
  const chainByCountry = new Map(tutorial.chains.map((entry) => [entry.country, entry]));

  const generatedRecords = COUNTRY_IDS.map((country) => {
    const content = sourceByCountry.get(country);
    const arrivalPackage = packageByCountry.get(country);
    const countryCalibration = calibrationByCountry.get(country);
    const chain = chainByCountry.get(country);
    requireCondition(countryCalibration && chain, `Generated arrival artifacts are incomplete for ${country}.`);
    requireCondition(chain.arrivalPackageStableId === arrivalPackage.id, `${country} tutorial chain package identity drifted.`);
    requireCondition(countryCalibration.recoveryRoute === arrivalPackage.recoveryRoute, `${country} recovery route drifted during calibration.`);
    return {
      ...content,
      currencyCode: arrivalPackage.currencyCode,
      startingLocationStableId: arrivalPackage.startingLocationId,
      firstMessageStableId: arrivalPackage.firstMessageId,
      firstContractStableId: arrivalPackage.firstContractId,
      firstTutorialStableId: arrivalPackage.firstTutorialId,
      recoveryRoute: arrivalPackage.recoveryRoute,
      economicContext: {
        approvedStartingBalance: countryCalibration.approvedStartingBalance,
        protectedEmergencyReserve: countryCalibration.assumptions.emergencyReserve,
        weeklyBasicNeeds: countryCalibration.assumptions.weeklyBasicNeeds,
        housingDeposit: countryCalibration.assumptions.housingDeposit,
      },
    };
  });

  const generatedByCountry = new Map(generatedRecords.map((record) => [record.country, record]));
  const enrichedCalibration = {
    ...calibration,
    contentRevision: 'arrival-content-v2',
    playerFacingContentCount: 10,
    calibrations: calibration.calibrations.map((entry) => {
      const content = generatedByCountry.get(entry.country);
      return {
        ...entry,
        arrivalContentStableId: content.stableId,
        playerFacingSummary: content.situationBrief,
        firstDayChecklist: content.firstDayChecklist,
      };
    }),
  };
  const enrichedTutorial = {
    ...tutorial,
    arrivalContentRevision: 'arrival-content-v2',
    chains: tutorial.chains.map((chain) => {
      const content = generatedByCountry.get(chain.country);
      return {
        ...chain,
        arrivalContentStableId: content.stableId,
        firstDayChecklist: content.firstDayChecklist,
        localTradeoffs: content.localTradeoffs,
      };
    }),
  };
  const generatedContent = {
    schemaVersion: 'econovaria-beta-arrival-content-v2',
    packId: pack.packId,
    version: pack.version,
    status: 'approved-for-isolated-staging',
    productionAuthorized: false,
    activationAuthorized: false,
    contentRevision: 'arrival-content-v2',
    recordCount: generatedRecords.length,
    records: generatedRecords,
  };

  pack.domainFiles.arrivalContent = 'arrival-content-v2.json';
  pack.boundedCounts.authoredArrivalBriefs = generatedRecords.length;
  pack.contentRevisions = { ...(pack.contentRevisions ?? {}), arrivals: 'arrival-content-v2' };
  pack.contentQuality = {
    ...(pack.contentQuality ?? {}),
    authoredArrivalBriefs: generatedRecords.length,
    uniqueArrivalWelcomeMessages: generatedRecords.length,
    uniqueArrivalFirstDayChecklists: generatedRecords.length,
    repeatedGenericArrivalTutorials: 0,
    placeholderArrivalContent: 0,
  };

  await writeJson(path.join(PACK_ROOT, 'arrival-content-v2.json'), generatedContent);
  await writeJson(path.join(PACK_ROOT, 'arrival-calibration-v1.json'), enrichedCalibration);
  await writeJson(path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json'), enrichedTutorial);
  await writeJson(path.join(PACK_ROOT, 'pack-v1.json'), pack);
  const integrity = await rebuildIntegrityManifest(pack);
  return { authoredArrivalBriefs: generatedRecords.length, enrichedCalibrations: 10, enrichedTutorialChains: 10, integrityFiles: integrity.fileCount };
}

async function main() {
  const result = await applyArrivalContentOverrides();
  console.log(JSON.stringify({ result: 'ARRIVAL_CONTENT_APPLIED', ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
