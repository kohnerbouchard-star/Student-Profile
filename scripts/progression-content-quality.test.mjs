#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const SOURCE_PATH = path.join(SEED_ROOT, 'progression', 'progression-content-source-v2.json');
const GENERATED_PATH = path.join(PACK_ROOT, 'progression-content-v2.json');
const PACK_PATH = path.join(PACK_ROOT, 'pack-v1.json');
const MIGRATION_PATH = path.join(REPO_ROOT, 'backend', 'supabase', 'migrations', '20260721160000_add_progression_reputation_runtime_v1.sql');

const TRACKS = ['markets','enterprise','production','diplomacy'];
const REPUTATIONS = ['country','career','story','relationship'];
const PLACEHOLDER_PATTERNS = [/bounded beta/i,/stable source/i,/placeholder/i,/lorem ipsum/i,/\btbd\b/i,/\btodo\b/i,/\breplace[- ]?me\b/i];

function assertPlayerFacingText(value, minimum, label) {
  const text = String(value ?? '').trim();
  assert.ok(text.length >= minimum, `${label} is too short`);
  assert.equal(PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)), false, `${label} contains placeholder or internal seed language`);
}

async function documents() {
  return Promise.all([readJson(SOURCE_PATH), readJson(GENERATED_PATH), readJson(PACK_PATH), readFile(MIGRATION_PATH, 'utf8')]);
}

test('Progression presentation source exactly covers authoritative skill, achievement, and reputation identities', async () => {
  const [source, , , migration] = await documents();
  assert.equal(source.schemaVersion, 'econovaria-progression-content-source-v2');
  assert.equal(source.skillCount, 12);
  assert.equal(source.achievementCount, 12);
  assert.equal(source.reputationTypeCount, 4);
  assert.equal(source.skills.length, 12);
  assert.equal(source.achievements.length, 12);
  assert.equal(source.reputationTypes.length, 4);
  assert.equal(new Set(source.skills.map((entry) => entry.publicSkillId)).size, 12);
  assert.equal(new Set(source.achievements.map((entry) => entry.publicAchievementId)).size, 12);
  assert.deepEqual(source.reputationTypes.map((entry) => entry.type).sort(), [...REPUTATIONS].sort());

  for (const skill of source.skills) {
    assert.match(skill.publicSkillId, /^skl_[a-z0-9_]{3,64}_v1$/);
    assert.ok(migration.includes(`'${skill.publicSkillId}'`), `${skill.publicSkillId} is absent from the authoritative migration`);
    assert.ok(TRACKS.includes(skill.track));
    assert.ok(skill.tier >= 1 && skill.tier <= 3);
  }
  for (const achievement of source.achievements) {
    assert.match(achievement.publicAchievementId, /^ach_[a-z0-9_]{3,64}_v1$/);
    assert.ok(migration.includes(`'${achievement.publicAchievementId}'`), `${achievement.publicAchievementId} is absent from the authoritative migration`);
    assert.ok(migration.includes(`'${achievement.criterionKey}'`), `${achievement.criterionKey} is absent from the authoritative migration`);
  }
});

test('All progression skills explain practical use, evidence, and non-guaranteed boundaries', async () => {
  const [source] = await documents();
  for (const track of TRACKS) {
    const records = source.skills.filter((entry) => entry.track === track);
    assert.equal(records.length, 3, `${track} must contain three skills`);
    assert.deepEqual(records.map((entry) => entry.tier).sort(), [1,2,3]);
  }
  for (const skill of source.skills) {
    assertPlayerFacingText(skill.title, 8, `${skill.publicSkillId}.title`);
    assertPlayerFacingText(skill.playerFacingDescription, 140, `${skill.publicSkillId}.description`);
    assertPlayerFacingText(skill.practicalUnlock, 90, `${skill.publicSkillId}.practicalUnlock`);
    assert.equal(skill.evidenceExamples.length, 3);
    skill.evidenceExamples.forEach((entry, index) => assertPlayerFacingText(entry, 18, `${skill.publicSkillId}.evidence.${index + 1}`));
    assertPlayerFacingText(skill.boundary, 90, `${skill.publicSkillId}.boundary`);
  }
});

test('All achievements disclose authoritative evidence, rewards, and anti-farming rules', async () => {
  const [source] = await documents();
  for (const achievement of source.achievements) {
    assertPlayerFacingText(achievement.title, 8, `${achievement.publicAchievementId}.title`);
    assertPlayerFacingText(achievement.playerFacingDescription, 100, `${achievement.publicAchievementId}.description`);
    assertPlayerFacingText(achievement.completionEvidence, 100, `${achievement.publicAchievementId}.completionEvidence`);
    assertPlayerFacingText(achievement.rewardDisclosure, 65, `${achievement.publicAchievementId}.rewardDisclosure`);
    assertPlayerFacingText(achievement.antiFarmingNote, 90, `${achievement.publicAchievementId}.antiFarmingNote`);
    assert.ok(Number.isInteger(achievement.threshold) && achievement.threshold > 0);
  }
});

test('Reputation guidance preserves runtime privacy defaults and recovery history', async () => {
  const [source, , , migration] = await documents();
  const expectedVisibility = { country: 'public', career: 'public', story: 'private', relationship: 'private' };
  for (const reputation of source.reputationTypes) {
    assert.equal(reputation.defaultVisibility, expectedVisibility[reputation.type]);
    assertPlayerFacingText(reputation.title, 10, `${reputation.type}.title`);
    assertPlayerFacingText(reputation.playerFacingDescription, 120, `${reputation.type}.description`);
    assertPlayerFacingText(reputation.disclosureGuidance, 110, `${reputation.type}.disclosureGuidance`);
    assertPlayerFacingText(reputation.recoveryGuidance, 100, `${reputation.type}.recoveryGuidance`);
  }
  assert.ok(migration.includes('country_reputation_public boolean not null default true'));
  assert.ok(migration.includes('career_reputation_public boolean not null default true'));
  assert.ok(migration.includes('story_reputation_public boolean not null default false'));
  assert.ok(migration.includes('relationship_reputation_public boolean not null default false'));
});

test('Generated progression content and pack metadata remain presentation-only and fail closed', async () => {
  const [source, generated, pack] = await documents();
  assert.equal(generated.schemaVersion, 'econovaria-beta-progression-content-v2');
  assert.equal(generated.mechanicalAuthority, source.mechanicalAuthority);
  assert.equal(generated.presentationAuthority, 'progression-content-v2');
  assert.equal(generated.contentRevision, 'progression-content-v2');
  assert.equal(generated.skillCount, 12);
  assert.equal(generated.achievementCount, 12);
  assert.equal(generated.reputationTypeCount, 4);
  assert.deepEqual(generated.skills, source.skills);
  assert.deepEqual(generated.achievements, source.achievements);
  assert.deepEqual(generated.reputationTypes, source.reputationTypes);
  assert.equal(generated.productionAuthorized, false);
  assert.equal(generated.activationAuthorized, false);
  assert.equal(pack.domainFiles.progressionContent, 'progression-content-v2.json');
  assert.equal(pack.boundedCounts.progressionSkills, 12);
  assert.equal(pack.boundedCounts.progressionAchievements, 12);
  assert.equal(pack.boundedCounts.progressionReputationTypes, 4);
  assert.equal(pack.contentRevisions.progression, 'progression-content-v2');
  assert.equal(pack.contentQuality.authoredProgressionSkills, 12);
  assert.equal(pack.contentQuality.authoredProgressionAchievements, 12);
  assert.equal(pack.contentQuality.authoredReputationTypes, 4);
  assert.equal(pack.contentQuality.progressionDefinitionsMatchedToRuntime, 24);
  assert.equal(pack.contentQuality.progressionRecordsWithBoundaries, 24);
  assert.equal(pack.contentQuality.progressionRecordsWithAntiAbuseGuidance, 12);
  assert.equal(pack.contentQuality.placeholderProgressionContent, 0);
});
