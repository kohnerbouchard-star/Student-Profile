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
const V1_PATH = path.join(SEED_ROOT, 'interactions', 'core-interactions-v1.json');
const V2_PATH = path.join(PACK_ROOT, 'interactions-v2.json');
const PACK_PATH = path.join(PACK_ROOT, 'pack-v1.json');

const COUNTRIES = ['northreach','yrethia','thaloris','solvend','eldoran','valerion','lumenor','xalvoria','dravenlok','syndalis'];
const FAMILIES = ['employment','support','banking','supplier','crisis'];
const EXPECTED_INTENTS = ['faster-progress-with-reviewed-cost','balanced-information-and-delay','lower-immediate-risk-with-opportunity-cost'];
const PLACEHOLDER_PATTERNS = [/bounded beta/i,/stable source/i,/placeholder/i,/lorem ipsum/i,/\btbd\b/i,/\btodo\b/i,/\breplace[- ]?me\b/i];

function assertPlayerFacingText(value, minimum, label) {
  const text = String(value ?? '').trim();
  assert.ok(text.length >= minimum, `${label} is too short`);
  assert.equal(PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)), false, `${label} contains placeholder or internal seed language`);
}

async function documents() {
  return Promise.all([readJson(V1_PATH), readJson(V2_PATH), readJson(PACK_PATH)]);
}

test('Authored interaction output preserves all 50 identities and original consequence semantics', async () => {
  const [v1, v2] = await documents();
  assert.equal(v2.schemaVersion, 'econovaria-beta-interactions-v2');
  assert.equal(v2.contentRevision, 'interaction-content-v2');
  assert.equal(v2.interactionCount, 50);
  assert.equal(v2.countryCount, 10);
  assert.deepEqual(v2.families, FAMILIES);
  assert.equal(v2.interactions.length, 50);
  assert.deepEqual(v2.interactions.map((entry) => entry.id).sort(), v1.interactions.map((entry) => entry.id).sort());

  const v1ById = new Map(v1.interactions.map((entry) => [entry.id, entry]));
  for (const interaction of v2.interactions) {
    const original = v1ById.get(interaction.id);
    assert.ok(original, `${interaction.id} is missing from v1`);
    assert.equal(interaction.country, original.country);
    assert.equal(interaction.actorType, original.actorType);
    assert.equal(interaction.runtimeSupport, original.runtimeSupport);
    assert.equal(interaction.activationAuthorized, false);
    assert.deepEqual(interaction.options.map((entry) => entry.key), original.options.map((entry) => entry.key));
    assert.deepEqual(interaction.options.map((entry) => entry.consequenceIntent), EXPECTED_INTENTS);
    assert.deepEqual(interaction.options.map((entry) => entry.consequenceIntent), original.options.map((entry) => entry.consequenceIntent));
  }
});

test('Every country has five substantive evidence-aware decision families', async () => {
  const [, v2] = await documents();
  for (const country of COUNTRIES) {
    const records = v2.interactions.filter((entry) => entry.country === country);
    assert.equal(records.length, 5, `${country} must have five interactions`);
    assert.deepEqual(records.map((entry) => entry.id.split('.').at(-2)).sort(), [...FAMILIES].sort());
  }

  for (const interaction of v2.interactions) {
    assertPlayerFacingText(interaction.title, 20, `${interaction.id}.title`);
    assertPlayerFacingText(interaction.prompt, 150, `${interaction.id}.prompt`);
    assertPlayerFacingText(interaction.decisionContext, 120, `${interaction.id}.decisionContext`);
    assert.equal(interaction.materialRisks.length, 3);
    assert.equal(interaction.recommendedEvidence.length, 3);
    interaction.materialRisks.forEach((entry, index) => assertPlayerFacingText(entry, 12, `${interaction.id}.risk.${index + 1}`));
    interaction.recommendedEvidence.forEach((entry, index) => assertPlayerFacingText(entry, 18, `${interaction.id}.evidence.${index + 1}`));
    assertPlayerFacingText(interaction.recoveryRoute, 80, `${interaction.id}.recoveryRoute`);
    assert.equal(interaction.disclosurePolicy, 'show-material-cost-risk-evidence-tradeoff-and-recovery-before-choice');
    assert.equal(interaction.options.length, 3);
    for (const [index, option] of interaction.options.entries()) {
      assertPlayerFacingText(option.label, 16, `${interaction.id}.option.${index + 1}.label`);
      assertPlayerFacingText(option.description, 100, `${interaction.id}.option.${index + 1}.description`);
      assertPlayerFacingText(option.tradeoff, 85, `${interaction.id}.option.${index + 1}.tradeoff`);
      assertPlayerFacingText(option.evidenceToReview, 55, `${interaction.id}.option.${index + 1}.evidence`);
    }
  }
});

test('Interaction copy is unique at the decision and option-description levels', async () => {
  const [, v2] = await documents();
  assert.equal(new Set(v2.interactions.map((entry) => entry.title)).size, 50);
  assert.equal(new Set(v2.interactions.map((entry) => entry.prompt)).size, 50);
  assert.equal(new Set(v2.interactions.map((entry) => entry.decisionContext)).size, 50);
  assert.equal(new Set(v2.interactions.flatMap((entry) => entry.options.map((option) => option.description))).size, 150);
  assert.equal(new Set(v2.interactions.flatMap((entry) => entry.options.map((option) => option.tradeoff))).size, 150);
});

test('Executable pack reports complete authored interactions and remains fail closed', async () => {
  const [, v2, pack] = await documents();
  assert.equal(pack.domainFiles.interactions, 'interactions-v2.json');
  assert.equal(pack.boundedCounts.authoredInteractions, 50);
  assert.equal(pack.contentRevisions.interactions, 'interaction-content-v2');
  assert.equal(pack.contentQuality.authoredInteractions, 50);
  assert.equal(pack.contentQuality.uniqueInteractionPrompts, 50);
  assert.equal(pack.contentQuality.uniqueInteractionOptionDescriptions, 150);
  assert.equal(pack.contentQuality.interactionsWithRecovery, 50);
  assert.equal(pack.contentQuality.interactionsWithEvidenceRequirements, 50);
  assert.equal(pack.contentQuality.placeholderInteractionContent, 0);
  assert.equal(v2.productionAuthorized, false);
  assert.equal(v2.activationAuthorized, false);
  assert.ok(v2.interactions.every((entry) => entry.activationAuthorized === false));
});
