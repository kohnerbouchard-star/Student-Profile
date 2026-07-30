#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/production-canonical-content-bootstrap-v1.yml', 'utf8');
const bootstrap = readFileSync('scripts/production-canonical-content-bootstrap.mjs', 'utf8');
const migration = readFileSync(
  'backend/supabase/migrations/20260730123000_add_production_content_promotion_ledger_v1.sql',
  'utf8',
);
const authorization = JSON.parse(
  readFileSync('docs/operations/evidence/production-content-promotion-v1.json', 'utf8'),
);

assert.equal(authorization.schemaVersion, 'econovaria.production-content-promotion.v1');
assert.equal(authorization.allowProductionContentPromotion, true);
assert.equal(authorization.productionAuthorized, true);
assert.equal(authorization.projectRef, 'cgiukdjwicykrmtkhudh');
assert.equal(authorization.deniedProjectRef, 'eecvbssdvarfcykcfrny');
assert.equal(authorization.packId, 'econovaria.beta-seed-pack.v1');
assert.equal(authorization.packVersion, '1.0.0-beta');
assert.equal(
  authorization.packSha256,
  '31f2f8e60c61b18eeab5cdac6e2930ae2f92a695b74e889a24129304e76547b7',
);
assert.equal(
  authorization.physicalEconomyContentDigest,
  '749e1c4c9bb8464ce1574ebd73218690e9837a8328b815fe5d36d2d71987d3e7',
);
assert.equal(
  authorization.physicalEconomySourceCommit,
  '04824da5ed8ea47bbabd893ab27f7ac285f050f2',
);
assert.equal(authorization.preserveLegacyGame, true);
assert.equal(authorization.copyStagingUserRows, false);
assert.equal(authorization.recordPlaintextJoinCode, false);

for (const marker of [
  'environment: production',
  'refs/heads/main',
  'EXPECTED_PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh',
  'DENIED_STAGING_PROJECT_REF: eecvbssdvarfcykcfrny',
  'Promote exact canonical content and provision production game',
  'production_content_promotions',
  'Econovaria Production',
  'Test game',
]) {
  assert.ok(workflow.includes(marker), `missing workflow marker: ${marker}`);
}

for (const marker of [
  'validateSeedBetaPack',
  'apply_seed_content_release_v1',
  "'staging'",
  'initialize_world_runtime_v1',
  'initialize_world_country_runtime_v2',
  'import_physical_economy_pack_v1',
  'activate_physical_economy_pack_v1',
  'create_provisioned_game_v2',
  'verify_provisioned_game_v1',
  'preservedLegacyGameDeleted: false',
  'stagingUserRowsCopied: false',
  'plaintextJoinCodeRecorded: false',
]) {
  assert.ok(bootstrap.includes(marker), `missing bootstrap marker: ${marker}`);
}

for (const marker of [
  'create table if not exists public.production_content_promotions',
  'enable row level security',
  'revoke all privileges',
  'grant select, insert, update',
]) {
  assert.ok(migration.toLowerCase().includes(marker.toLowerCase()), `missing migration marker: ${marker}`);
}

for (const [label, text] of [
  ['workflow', workflow],
  ['bootstrap', bootstrap],
  ['migration', migration],
]) {
  for (const forbidden of [
    'delete from public.players',
    'delete from auth.users',
    'truncate public.',
    'drop table public.players',
    'drop table public.game_sessions',
    'supabase db reset',
  ]) {
    assert.ok(!text.toLowerCase().includes(forbidden.toLowerCase()), `${label} contains forbidden behavior: ${forbidden}`);
  }
}

console.log('production content promotion contract: ok');
