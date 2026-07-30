#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/production-runtime-promotion-v1.yml', 'utf8');
const authorization = JSON.parse(
  readFileSync('docs/operations/evidence/production-runtime-promotion-v1.json', 'utf8'),
);

assert.equal(authorization.schemaVersion, 'econovaria.production-runtime-promotion.v1');
assert.equal(authorization.action, 'PROMOTE_STAGING_RUNTIME_TO_PRODUCTION');
assert.equal(authorization.targetProjectRef, 'cgiukdjwicykrmtkhudh');
assert.equal(authorization.deniedProjectRef, 'eecvbssdvarfcykcfrny');
assert.equal(authorization.mergedMainOnly, true);
assert.equal(authorization.productionDataPreservationRequired, true);
assert.equal(authorization.stagingUserDataImportAllowed, false);
assert.equal(authorization.seedContentActivationAllowed, false);
assert.equal(authorization.destructiveTableOperationsAllowed, false);

for (const marker of [
  'environment: production',
  'refs/heads/main',
  'EXPECTED_PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh',
  'DENIED_STAGING_PROJECT_REF: eecvbssdvarfcykcfrny',
  'Apply missing canonical migrations atomically',
  'Deploy canonical Edge Functions',
  'Restore readable Game Codes where permitted',
  'productionDataPreservationRequired',
  'stagingUserDataImportAllowed',
  'seedContentActivationAllowed',
]) {
  assert.ok(workflow.includes(marker), `missing workflow marker: ${marker}`);
}

for (const forbidden of [
  'supabase db reset',
  'drop database',
  'truncate public.',
  'delete from public.players',
  'delete from auth.users',
  'SEED_TARGET_ENVIRONMENT: production',
]) {
  assert.ok(!workflow.toLowerCase().includes(forbidden.toLowerCase()), `forbidden workflow behavior: ${forbidden}`);
}

console.log('production runtime promotion contract: ok');
