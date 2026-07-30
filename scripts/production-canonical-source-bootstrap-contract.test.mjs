#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/production-canonical-source-bootstrap-v1.yml', 'utf8');
const script = readFileSync('scripts/production-canonical-source-bootstrap.mjs', 'utf8');
const authorization = JSON.parse(
  readFileSync('docs/operations/evidence/production-canonical-source-bootstrap-v1.json', 'utf8'),
);

assert.equal(authorization.schemaVersion, 'econovaria.production-canonical-source-bootstrap.v1');
assert.equal(authorization.action, 'BOOTSTRAP_NON_JOINABLE_CANONICAL_SOURCE');
assert.equal(authorization.targetProjectRef, 'cgiukdjwicykrmtkhudh');
assert.equal(authorization.deniedProjectRef, 'eecvbssdvarfcykcfrny');
assert.equal(authorization.mergedMainOnly, true);
assert.equal(authorization.canonicalSourceJoinable, false);
assert.equal(authorization.copyStagingAuthUsers, false);
assert.equal(authorization.copyStagingStaffUsers, false);
assert.equal(authorization.copyStagingPlayers, false);
assert.equal(authorization.mutateExistingPlayerData, false);
assert.equal(authorization.productionDataPreservationRequired, true);
assert.equal(authorization.runDisposableProvisioningProbe, true);
assert.equal(authorization.cleanupProvisioningProbe, true);
assert.equal(authorization.sourceEnvironmentLabel, 'staging');

for (const marker of [
  'environment: production',
  'refs/heads/main',
  'EXPECTED_PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh',
  'DENIED_STAGING_PROJECT_REF: eecvbssdvarfcykcfrny',
  'Bootstrap canonical source and run connected provisioning probe',
  'Verify source completeness, zero probe residue, and protected data preservation',
  "const SOURCE_NAME = '[SYSTEM] Econovaria Canonical Source'",
  "p_target_environment: 'staging'",
  'canonicalSourceJoinable: false',
  'existingPlayerDataMutated: false',
  'issues: write',
  'OBSERVABILITY_ISSUE_NUMBER: "449"',
  'Record protected job start',
  'Record pre-write checkpoint',
  'Record successful completion',
  'Record sanitized failure phase',
  'production-source-phase',
  'database-write-ready',
  'gh api --method POST',
]) {
  assert.ok(`${workflow}\n${script}`.includes(marker), `missing boundary marker: ${marker}`);
}

for (const forbidden of [
  'delete from public.players',
  'delete from auth.users',
  'truncate public.',
  'p_target_environment: \'production\'',
  'copy staging players',
]) {
  assert.ok(!script.toLowerCase().includes(forbidden.toLowerCase()), `forbidden source behavior: ${forbidden}`);
}

const diagnosticBodies = workflow
  .split(/\r?\n/)
  .filter((line) => line.trimStart().startsWith('body='))
  .join('\n');
for (const forbiddenDiagnosticValue of [
  '$SUPABASE_ACCESS_TOKEN',
  '$SUPABASE_SERVICE_ROLE_KEY',
  '$CONFIGURED_SERVICE_ROLE_KEY',
  '$DATABASE_URL',
  '$SUPABASE_DB_URL',
  '$SUPABASE_PROJECT_REF',
  'game_join_code',
]) {
  assert.ok(
    !diagnosticBodies.includes(forbiddenDiagnosticValue),
    `diagnostic body contains forbidden value: ${forbiddenDiagnosticValue}`,
  );
}

const diagnosticCommands = workflow
  .split(/\r?\n/)
  .filter((line) => line.includes('gh api --method POST'));
assert.equal(diagnosticCommands.length, 4);
assert.equal((workflow.match(/-f body="\$body" >\/dev\/null \|\| true/g) ?? []).length, 4);

assert.ok(script.includes("delete from public.game_sessions where id = ${sqlLiteral(created.gameSessionId)}::uuid"));
assert.ok(script.includes("name = ${sqlLiteral(SOURCE_NAME)}"));
assert.ok(script.includes("game_join_code_status <> 'active'"));
assert.ok(script.includes("game_join_code_status = 'active'"));
assert.ok(workflow.includes("for (const key of ['nonSystemGameCount', 'playerCount', 'activeCredentialCount', 'accountBalanceCount'])"));

console.log('production canonical source bootstrap contract: ok');
