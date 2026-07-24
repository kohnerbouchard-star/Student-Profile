#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const SOURCE_PATH = path.join(SEED_ROOT, 'players', 'arrival-content-source-v2.json');
const PACKAGE_PATH = path.join(SEED_ROOT, 'players', 'arrival-packages-v1.json');
const GENERATED_PATH = path.join(PACK_ROOT, 'arrival-content-v2.json');
const CALIBRATION_PATH = path.join(PACK_ROOT, 'arrival-calibration-v1.json');
const TUTORIAL_PATH = path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json');
const PACK_PATH = path.join(PACK_ROOT, 'pack-v1.json');

const COUNTRIES = ['northreach','yrethia','thaloris','solvend','eldoran','valerion','lumenor','xalvoria','dravenlok','syndalis'];
const PLACEHOLDER_PATTERNS = [/bounded beta/i,/stable source/i,/placeholder/i,/lorem ipsum/i,/\btbd\b/i,/\btodo\b/i,/\breplace[- ]?me\b/i];

function assertPlayerFacingText(value, minimum, label) {
  const text = String(value ?? '').trim();
  assert.ok(text.length >= minimum, `${label} is too short`);
  assert.equal(PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)), false, `${label} contains placeholder or internal seed language`);
}

async function documents() {
  return Promise.all([
    readJson(SOURCE_PATH),
    readJson(PACKAGE_PATH),
    readJson(GENERATED_PATH),
    readJson(CALIBRATION_PATH),
    readJson(TUTORIAL_PATH),
    readJson(PACK_PATH),
  ]);
}

test('Arrival source contains one substantive authored brief per country', async () => {
  const [source, packages] = await documents();
  assert.equal(source.schemaVersion, 'econovaria-arrival-content-source-v2');
  assert.equal(source.countryCount, 10);
  assert.equal(source.records.length, 10);
  assert.equal(new Set(source.records.map((record) => record.stableId)).size, 10);
  assert.deepEqual(source.records.map((record) => record.country).sort(), [...COUNTRIES].sort());
  assert.equal(new Set(source.records.map((record) => record.welcomeMessage)).size, 10);
  assert.equal(new Set(source.records.map((record) => record.firstDayChecklist.join('\n'))).size, 10);

  const packageByCountry = new Map(packages.packages.map((entry) => [entry.country, entry]));
  for (const record of source.records) {
    const arrivalPackage = packageByCountry.get(record.country);
    assert.ok(arrivalPackage, `${record.country} is missing its arrival package`);
    assert.equal(record.arrivalPackageStableId, arrivalPackage.id);
    assertPlayerFacingText(record.title, 12, `${record.country} title`);
    assertPlayerFacingText(record.situationBrief, 180, `${record.country} situation brief`);
    assertPlayerFacingText(record.welcomeMessage, 220, `${record.country} welcome message`);
    assertPlayerFacingText(record.sponsorNote, 100, `${record.country} sponsor note`);
    assert.equal(record.firstDayChecklist.length, 5);
    assert.equal(record.localTradeoffs.length, 3);
    record.firstDayChecklist.forEach((step, index) => assertPlayerFacingText(step, 70, `${record.country} checklist ${index + 1}`));
    record.localTradeoffs.forEach((tradeoff, index) => assertPlayerFacingText(tradeoff, 70, `${record.country} trade-off ${index + 1}`));
  }
});

test('Generated arrival content preserves package identities and calibrated economics', async () => {
  const [, packages, generated, calibration] = await documents();
  assert.equal(generated.schemaVersion, 'econovaria-beta-arrival-content-v2');
  assert.equal(generated.contentRevision, 'arrival-content-v2');
  assert.equal(generated.recordCount, 10);
  assert.equal(generated.records.length, 10);
  assert.equal(generated.productionAuthorized, false);
  assert.equal(generated.activationAuthorized, false);

  const packageByCountry = new Map(packages.packages.map((entry) => [entry.country, entry]));
  const calibrationByCountry = new Map(calibration.calibrations.map((entry) => [entry.country, entry]));
  for (const record of generated.records) {
    const arrivalPackage = packageByCountry.get(record.country);
    const countryCalibration = calibrationByCountry.get(record.country);
    assert.ok(arrivalPackage && countryCalibration);
    assert.equal(record.arrivalPackageStableId, arrivalPackage.id);
    assert.equal(record.currencyCode, arrivalPackage.currencyCode);
    assert.equal(record.startingLocationStableId, arrivalPackage.startingLocationId);
    assert.equal(record.firstMessageStableId, arrivalPackage.firstMessageId);
    assert.equal(record.firstContractStableId, arrivalPackage.firstContractId);
    assert.equal(record.firstTutorialStableId, arrivalPackage.firstTutorialId);
    assert.equal(record.recoveryRoute, arrivalPackage.recoveryRoute);
    assert.equal(record.economicContext.approvedStartingBalance, countryCalibration.approvedStartingBalance);
    assert.equal(record.economicContext.protectedEmergencyReserve, countryCalibration.assumptions.emergencyReserve);
    assert.equal(record.economicContext.weeklyBasicNeeds, countryCalibration.assumptions.weeklyBasicNeeds);
    assert.equal(record.economicContext.housingDeposit, countryCalibration.assumptions.housingDeposit);
    assert.ok(record.economicContext.approvedStartingBalance > record.economicContext.protectedEmergencyReserve);
  }
});

test('Arrival calibration and tutorial chains reference unique authored content', async () => {
  const [, , generated, calibration, tutorial] = await documents();
  assert.equal(calibration.contentRevision, 'arrival-content-v2');
  assert.equal(calibration.playerFacingContentCount, 10);
  assert.equal(tutorial.arrivalContentRevision, 'arrival-content-v2');
  assert.equal(calibration.calibrations.length, 10);
  assert.equal(tutorial.chains.length, 10);
  assert.equal(new Set(calibration.calibrations.map((entry) => entry.playerFacingSummary)).size, 10);
  assert.equal(new Set(calibration.calibrations.map((entry) => entry.firstDayChecklist.join('\n'))).size, 10);

  const generatedByCountry = new Map(generated.records.map((record) => [record.country, record]));
  const chainByCountry = new Map(tutorial.chains.map((entry) => [entry.country, entry]));
  for (const calibrationEntry of calibration.calibrations) {
    const content = generatedByCountry.get(calibrationEntry.country);
    const chain = chainByCountry.get(calibrationEntry.country);
    assert.ok(content && chain);
    assert.equal(calibrationEntry.arrivalContentStableId, content.stableId);
    assert.equal(calibrationEntry.playerFacingSummary, content.situationBrief);
    assert.deepEqual(calibrationEntry.firstDayChecklist, content.firstDayChecklist);
    assert.equal(chain.arrivalContentStableId, content.stableId);
    assert.deepEqual(chain.firstDayChecklist, content.firstDayChecklist);
    assert.deepEqual(chain.localTradeoffs, content.localTradeoffs);
    assert.equal(chain.steps.length, 3, 'Existing economic tutorial Contract sequence must remain unchanged');
  }
});

test('Executable pack reports complete arrival content quality and remains fail closed', async () => {
  const [, , generated, calibration, tutorial, pack] = await documents();
  assert.equal(pack.domainFiles.arrivalContent, 'arrival-content-v2.json');
  assert.equal(pack.boundedCounts.authoredArrivalBriefs, 10);
  assert.equal(pack.contentRevisions.arrivals, 'arrival-content-v2');
  assert.equal(pack.contentQuality.authoredArrivalBriefs, 10);
  assert.equal(pack.contentQuality.uniqueArrivalWelcomeMessages, 10);
  assert.equal(pack.contentQuality.uniqueArrivalFirstDayChecklists, 10);
  assert.equal(pack.contentQuality.repeatedGenericArrivalTutorials, 0);
  assert.equal(pack.contentQuality.placeholderArrivalContent, 0);
  assert.equal(generated.activationAuthorized, false);
  assert.equal(calibration.activationAuthorized, false);
  assert.equal(tutorial.activationAuthorized, false);
  assert.ok(tutorial.templates.every((template) => template.isActiveByDefault === false));
});
