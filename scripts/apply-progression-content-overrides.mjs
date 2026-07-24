#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, readJson, sha256, sha256File, walkFiles, writeJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content');
const PACK_ROOT = path.join(SEED_ROOT, 'executable', 'beta-pack-v1');
const SOURCE_PATH = path.join(SEED_ROOT, 'progression', 'progression-content-source-v2.json');
const MIGRATION_PATH = path.join(REPO_ROOT, 'backend', 'supabase', 'migrations', '20260721160000_add_progression_reputation_runtime_v1.sql');
const SKILL_TRACKS = ['markets','enterprise','production','diplomacy'];
const REPUTATION_TYPES = ['country','career','story','relationship'];
const PLACEHOLDER_PATTERNS = [/bounded beta/i,/stable source/i,/placeholder/i,/lorem ipsum/i,/\btbd\b/i,/\btodo\b/i,/\breplace[- ]?me\b/i];

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function assertText(value, minimum, label) {
  const text = String(value ?? '').trim();
  requireCondition(text.length >= minimum, `${label} is too short.`);
  requireCondition(!PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text)), `${label} contains placeholder or internal seed language.`);
  return text;
}

function quoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function validateSkillAgainstMigration(skill, migration) {
  const identityPattern = `${quoted(skill.publicSkillId)},${quoted(skill.track)},${skill.tier},`;
  requireCondition(migration.includes(identityPattern), `${skill.publicSkillId} track or tier does not match the authoritative migration.`);
}

function validateAchievementAgainstMigration(achievement, migration) {
  const identityPattern = `${quoted(achievement.publicAchievementId)},${quoted(achievement.criterionKey)},${achievement.threshold},`;
  requireCondition(migration.includes(identityPattern), `${achievement.publicAchievementId} criterion or threshold does not match the authoritative migration.`);
}

function validateSource(source, migration) {
  requireCondition(source.schemaVersion === 'econovaria-progression-content-source-v2', 'Progression content schema is invalid.');
  requireCondition(source.skillCount === 12 && source.skills?.length === 12, 'Progression content must contain twelve skills.');
  requireCondition(source.achievementCount === 12 && source.achievements?.length === 12, 'Progression content must contain twelve achievements.');
  requireCondition(source.reputationTypeCount === 4 && source.reputationTypes?.length === 4, 'Progression content must contain four reputation types.');
  requireCondition(new Set(source.skills.map((entry) => entry.publicSkillId)).size === 12, 'Skill IDs must be unique.');
  requireCondition(new Set(source.achievements.map((entry) => entry.publicAchievementId)).size === 12, 'Achievement IDs must be unique.');
  requireCondition(new Set(source.reputationTypes.map((entry) => entry.type)).size === 4, 'Reputation types must be unique.');

  for (const skill of source.skills) {
    requireCondition(/^skl_[a-z0-9_]{3,64}_v1$/.test(skill.publicSkillId), `${skill.publicSkillId} is not a valid runtime skill ID.`);
    requireCondition(SKILL_TRACKS.includes(skill.track), `${skill.publicSkillId} has an invalid track.`);
    requireCondition(Number.isInteger(skill.tier) && skill.tier >= 1 && skill.tier <= 3, `${skill.publicSkillId} has an invalid tier.`);
    validateSkillAgainstMigration(skill, migration);
    assertText(skill.title, 8, `${skill.publicSkillId}.title`);
    assertText(skill.playerFacingDescription, 140, `${skill.publicSkillId}.description`);
    assertText(skill.practicalUnlock, 90, `${skill.publicSkillId}.unlock`);
    requireCondition(skill.evidenceExamples?.length === 3, `${skill.publicSkillId} must contain three evidence examples.`);
    skill.evidenceExamples.forEach((entry, index) => assertText(entry, 18, `${skill.publicSkillId}.evidence.${index + 1}`));
    assertText(skill.boundary, 90, `${skill.publicSkillId}.boundary`);
  }
  for (const track of SKILL_TRACKS) {
    const tiers = source.skills.filter((entry) => entry.track === track).map((entry) => entry.tier).sort();
    requireCondition(JSON.stringify(tiers) === JSON.stringify([1,2,3]), `${track} must contain exactly tiers one through three.`);
  }

  for (const achievement of source.achievements) {
    requireCondition(/^ach_[a-z0-9_]{3,64}_v1$/.test(achievement.publicAchievementId), `${achievement.publicAchievementId} is not a valid runtime achievement ID.`);
    requireCondition(/^[a-z][a-z0-9_.-]{2,80}$/.test(achievement.criterionKey), `${achievement.publicAchievementId} has an invalid criterion key.`);
    requireCondition(Number.isInteger(achievement.threshold) && achievement.threshold > 0, `${achievement.publicAchievementId} has an invalid threshold.`);
    validateAchievementAgainstMigration(achievement, migration);
    assertText(achievement.title, 8, `${achievement.publicAchievementId}.title`);
    assertText(achievement.playerFacingDescription, 100, `${achievement.publicAchievementId}.description`);
    assertText(achievement.completionEvidence, 100, `${achievement.publicAchievementId}.completionEvidence`);
    assertText(achievement.rewardDisclosure, 65, `${achievement.publicAchievementId}.rewardDisclosure`);
    assertText(achievement.antiFarmingNote, 90, `${achievement.publicAchievementId}.antiFarmingNote`);
  }

  for (const reputation of source.reputationTypes) {
    requireCondition(REPUTATION_TYPES.includes(reputation.type), `${reputation.type} is not an authoritative reputation type.`);
    const expectedVisibility = reputation.type === 'country' || reputation.type === 'career' ? 'public' : 'private';
    requireCondition(reputation.defaultVisibility === expectedVisibility, `${reputation.type} default visibility does not match the runtime profile defaults.`);
    assertText(reputation.title, 10, `${reputation.type}.title`);
    assertText(reputation.playerFacingDescription, 120, `${reputation.type}.description`);
    assertText(reputation.disclosureGuidance, 110, `${reputation.type}.disclosureGuidance`);
    assertText(reputation.recoveryGuidance, 100, `${reputation.type}.recoveryGuidance`);
  }

  requireCondition(migration.includes("country_reputation_public boolean not null default true"), 'Country reputation visibility default drifted.');
  requireCondition(migration.includes("career_reputation_public boolean not null default true"), 'Career reputation visibility default drifted.');
  requireCondition(migration.includes("story_reputation_public boolean not null default false"), 'Story reputation visibility default drifted.');
  requireCondition(migration.includes("relationship_reputation_public boolean not null default false"), 'Relationship reputation visibility default drifted.');
}

async function rebuildIntegrityManifest(pack) {
  const files = await walkFiles(PACK_ROOT, (file) => path.basename(file) !== 'integrity-manifest-v1.json');
  const entries = [];
  for (const filePath of files) {
    entries.push({ path: path.relative(PACK_ROOT, filePath).replaceAll(path.sep, '/'), sha256: await sha256File(filePath), bytes: (await readFile(filePath)).byteLength });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const packEntry = entries.find((entry) => entry.path === 'pack-v1.json');
  const manifest = {
    schemaVersion: 'econovaria-beta-integrity-manifest-v1', packId: pack.packId, version: pack.version,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    hashAlgorithm: 'sha256', fileCount: entries.length, packSha256: packEntry?.sha256 ?? null,
    files: entries, manifestContentSha256: sha256(canonicalJson(entries)),
  };
  await writeJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json'), manifest);
  return manifest;
}

export async function applyProgressionContentOverrides() {
  const [source, migration, pack] = await Promise.all([
    readJson(SOURCE_PATH), readFile(MIGRATION_PATH, 'utf8'), readJson(path.join(PACK_ROOT, 'pack-v1.json')),
  ]);
  validateSource(source, migration);
  const output = {
    schemaVersion: 'econovaria-beta-progression-content-v2', packId: pack.packId, version: pack.version,
    status: 'approved-for-isolated-staging', productionAuthorized: false, activationAuthorized: false,
    mechanicalAuthority: source.mechanicalAuthority,
    presentationAuthority: 'progression-content-v2',
    contentRevision: 'progression-content-v2',
    skillCount: source.skills.length,
    achievementCount: source.achievements.length,
    reputationTypeCount: source.reputationTypes.length,
    skills: source.skills,
    achievements: source.achievements,
    reputationTypes: source.reputationTypes,
  };
  pack.domainFiles.progressionContent = 'progression-content-v2.json';
  pack.boundedCounts.progressionSkills = source.skills.length;
  pack.boundedCounts.progressionAchievements = source.achievements.length;
  pack.boundedCounts.progressionReputationTypes = source.reputationTypes.length;
  pack.contentRevisions = { ...(pack.contentRevisions ?? {}), progression: 'progression-content-v2' };
  pack.contentQuality = {
    ...(pack.contentQuality ?? {}), authoredProgressionSkills: 12, authoredProgressionAchievements: 12,
    authoredReputationTypes: 4, progressionDefinitionsMatchedToRuntime: 24,
    progressionRecordsWithBoundaries: 24, progressionRecordsWithAntiAbuseGuidance: 12,
    placeholderProgressionContent: 0,
  };
  await writeJson(path.join(PACK_ROOT, 'progression-content-v2.json'), output);
  await writeJson(path.join(PACK_ROOT, 'pack-v1.json'), pack);
  const integrity = await rebuildIntegrityManifest(pack);
  return { skills: 12, achievements: 12, reputationTypes: 4, integrityFiles: integrity.fileCount };
}

async function main() {
  const result = await applyProgressionContentOverrides();
  console.log(JSON.stringify({ result: 'PROGRESSION_CONTENT_APPLIED', ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
