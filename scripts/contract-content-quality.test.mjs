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
const SOURCE_PATH = path.join(SEED_ROOT, 'contracts', 'contract-content-source-v2.json');
const GENERATED_PATH = path.join(PACK_ROOT, 'contract-content-v2.json');
const TUTORIAL_PATH = path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json');
const PACK_PATH = path.join(PACK_ROOT, 'pack-v1.json');

const COUNTRIES = ['northreach','yrethia','thaloris','solvend','eldoran','valerion','lumenor','xalvoria','dravenlok','syndalis'];
const FAMILIES = ['arrival','livelihood','market','resilience','community'];
const PROFILE_FIELDS = ['city','agency','sector','arrival','livelihood_a','livelihood_b','risk','market_opportunity','dependency','substitute','community'];
const PLACEHOLDER_PATTERNS = [/bounded beta/i,/stable source/i,/placeholder/i,/lorem ipsum/i,/\btbd\b/i,/\btodo\b/i,/\breplace[- ]?me\b/i];

function key(country, family) {
  return `${country}|${family}`;
}

function assertPlayerFacingText(value, minimum, label) {
  const text = String(value ?? '').trim();
  assert.ok(text.length >= minimum, `${label} is too short`);
  assert.equal(PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)), false, `${label} contains placeholder or internal seed language`);
}

async function documents() {
  return Promise.all([
    readJson(SOURCE_PATH),
    readJson(GENERATED_PATH),
    readJson(TUTORIAL_PATH),
    readJson(PACK_PATH),
  ]);
}

test('Contract content source defines substantive profiles for all ten countries', async () => {
  const [source] = await documents();
  assert.equal(source.schemaVersion, 'econovaria-contract-content-source-v2');
  assert.equal(source.countryCount, 10);
  assert.deepEqual(source.families, FAMILIES);
  assert.deepEqual(Object.keys(source.profiles).sort(), [...COUNTRIES].sort());
  for (const country of COUNTRIES) {
    const profile = source.profiles[country];
    for (const field of PROFILE_FIELDS) {
      assertPlayerFacingText(profile[field], field === 'city' ? 4 : 12, `${country}.${field}`);
    }
  }
});

test('Generated authored Contract catalog exactly covers five families per country', async () => {
  const [, generated] = await documents();
  assert.equal(generated.schemaVersion, 'econovaria-beta-contract-content-v2');
  assert.equal(generated.contentRevision, 'contract-content-v2');
  assert.equal(generated.recordCount, 50);
  assert.equal(generated.countryCount, 10);
  assert.deepEqual(generated.families, FAMILIES);
  assert.equal(generated.records.length, 50);
  assert.equal(new Set(generated.records.map((record) => record.id)).size, 50);
  assert.equal(new Set(generated.records.map((record) => key(record.country, record.family))).size, 50);

  for (const country of COUNTRIES) {
    const countryRecords = generated.records.filter((record) => record.country === country);
    assert.equal(countryRecords.length, 5, `${country} must have five authored Contract records`);
    assert.deepEqual(countryRecords.map((record) => record.family).sort(), [...FAMILIES].sort());
  }

  for (const record of generated.records) {
    assertPlayerFacingText(record.playerFacingDescription, 120, `${record.id} description`);
    assertPlayerFacingText(record.objective, 75, `${record.id} objective`);
    assert.equal(record.instructions.length, 4, `${record.id} must have four instructions`);
    record.instructions.forEach((instruction, index) => assertPlayerFacingText(instruction, 45, `${record.id} instruction ${index + 1}`));
    assertPlayerFacingText(record.submissionRequirement, 70, `${record.id} submission requirement`);
    assert.ok(Number.isInteger(record.estimatedDurationMinutes) && record.estimatedDurationMinutes >= 20 && record.estimatedDurationMinutes <= 60);
  }
});

test('All 30 active tutorial templates consume unique authored Contract content', async () => {
  const [, generated, tutorial] = await documents();
  assert.equal(tutorial.contentRevision, 'contract-content-v2');
  assert.equal(tutorial.templateCount, 30);
  assert.equal(tutorial.authoredDefinitionCount, 50);
  assert.equal(tutorial.activeTemplateContentCount, 30);
  assert.equal(tutorial.templates.length, 30);
  assert.equal(new Set(tutorial.templates.map((template) => template.stableId)).size, 30);
  assert.equal(new Set(tutorial.templates.map((template) => template.description)).size, 30);
  assert.equal(new Set(tutorial.templates.map((template) => template.instructions)).size, 30);

  const authoredById = new Map(generated.records.map((record) => [record.id, record]));
  for (const country of COUNTRIES) {
    const templates = tutorial.templates.filter((template) => template.country === country);
    assert.equal(templates.length, 3, `${country} must have three active tutorial templates`);
    assert.deepEqual(templates.map((template) => template.metadata.authoredFamily).sort(), ['arrival','livelihood','market']);
  }

  for (const template of tutorial.templates) {
    const authored = authoredById.get(template.stableId);
    assert.ok(authored, `${template.stableId} is missing from the authored Contract catalog`);
    assert.equal(template.description, authored.playerFacingDescription);
    assert.equal(template.instructions, authored.instructions.join('\n'));
    assert.equal(template.requirementsPayload.objective, authored.objective);
    assert.equal(template.requirementsPayload.submissionRequirement, authored.submissionRequirement);
    assert.equal(template.estimatedDurationMinutes, authored.estimatedDurationMinutes);
    assert.equal(template.metadata.contentRevision, 'contract-content-v2');
    assert.equal(template.metadata.authoredFamily, authored.family);
  }
});

test('Executable pack advertises Contract content quality and preserves fail-closed activation', async () => {
  const [, , tutorial, pack] = await documents();
  assert.equal(pack.domainFiles.contractContent, 'contract-content-v2.json');
  assert.equal(pack.boundedCounts.authoredContractDefinitions, 50);
  assert.equal(pack.contentRevisions.contracts, 'contract-content-v2');
  assert.equal(pack.contentQuality.authoredContractDefinitions, 50);
  assert.equal(pack.contentQuality.activeTutorialContractDescriptions, 30);
  assert.equal(pack.contentQuality.repeatedGenericTutorialInstructions, 0);
  assert.equal(pack.contentQuality.placeholderContractDescriptions, 0);
  assert.equal(tutorial.productionAuthorized, false);
  assert.equal(tutorial.activationAuthorized, false);
  assert.ok(tutorial.templates.every((template) => template.isActiveByDefault === false));
});
