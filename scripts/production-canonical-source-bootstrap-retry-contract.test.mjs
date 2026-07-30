#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync('scripts/production-canonical-source-bootstrap-runner.mjs', 'utf8');
const workflow = readFileSync(
  '.github/workflows/production-canonical-source-bootstrap-retry-v1.yml',
  'utf8',
);

for (const marker of [
  "const parsed = new URL(originalDatabaseUrl)",
  "const username = decodeURIComponent(parsed.username || '')",
  "const direct = parsed.hostname === `db.${projectRef}.supabase.co`",
  "const pooler = username === `postgres.${projectRef}` || username.endsWith(`.${projectRef}`)",
  "projectRef !== expectedProjectRef || projectRef === deniedProjectRef",
  "decodeURIComponent(parsed.password || '')",
  "parsed.searchParams.set('application_name', `db.${projectRef}.supabase.co`)",
  "process.once('beforeExit'",
  "await import('./production-canonical-source-bootstrap.mjs')",
  "const SOURCE_NAME = '[SYSTEM] Econovaria Canonical Source'",
  "const PROBE_NAME = '[SYNTHETIC] Production Provisioning Probe'",
  "const SOURCE_STAFF_EMAIL = 'canonical-source@econovaria.internal'",
  "select public.verify_provisioned_game_v1(probe.id,probe.owner_staff_user_id)",
  "delete from public.audit_log where game_session_id=v_probe_id",
  "delete from public.game_feature_activation_evidence where game_session_id=v_probe_id",
  "delete from public.store_items where game_session_id=v_probe_id",
  "delete from public.currency_exchange_rates where game_session_id=v_probe_id",
  "delete from public.seed_content_releases where game_session_id=v_probe_id",
  "delete from public.game_creation_provisioning_requests where game_session_id=v_probe_id",
  "delete from public.game_settings where game_session_id=v_probe_id",
  "delete from public.game_sessions where id=v_probe_id",
  "state.releaseMembers === 590",
  "state.worldLocations === 50",
  "state.worldRoutes === 13",
  "state.worldCountries === 10",
  "state.arrivalClassGrants === 8",
  "state.activeCraftingPacks === 1",
  "state.probeGames === 0",
  "state.probeRequests === 0",
  "state.unreadyJoinableGames === 0",
  "writeSuccessEvidence(sourceCommit, state)",
  "process.exitCode = 0",
  "credentialsRecorded: false",
  "rawInternalIdentifiersRecorded: false",
  'environment: production',
  'refs/heads/main',
  'EXPECTED_PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh',
  'DENIED_STAGING_PROJECT_REF: eecvbssdvarfcykcfrny',
  'Run corrected production canonical-source bootstrap',
  'node scripts/production-canonical-source-bootstrap-runner.mjs',
  'Verify source completeness and protected data preservation',
  "for (const key of ['nonSystemGameCount', 'playerCount', 'activeCredentialCount', 'accountBalanceCount'])",
]) {
  assert.ok(`${runner}\n${workflow}`.includes(marker), `missing corrected binding/finalizer marker: ${marker}`);
}

assert.ok(
  runner.indexOf("parsed.searchParams.set('application_name'")
    > runner.indexOf("if (!decodeURIComponent(parsed.password || ''))"),
  'compatibility marker must be applied only after password validation',
);
assert.ok(
  runner.indexOf("parsed.searchParams.set('application_name'")
    > runner.indexOf("if (!['postgres:', 'postgresql:'].includes(parsed.protocol)"),
  'compatibility marker must be applied only after endpoint binding validation',
);
assert.ok(
  runner.indexOf("process.once('beforeExit'")
    < runner.indexOf("await import('./production-canonical-source-bootstrap.mjs')"),
  'probe finalizer must be registered before bootstrap execution',
);
assert.ok(
  runner.indexOf('writeSuccessEvidence(sourceCommit, state)')
    < runner.lastIndexOf('process.exitCode = 0'),
  'success evidence must be written before exit code is cleared',
);

for (const assignmentPattern of [
  /parsed\.hostname\s*=(?!=)/,
  /parsed\.username\s*=(?!=)/,
  /parsed\.password\s*=(?!=)/,
]) {
  assert.ok(!assignmentPattern.test(runner), `runner mutates protected URL identity: ${assignmentPattern}`);
}

for (const forbidden of [
  'delete from public.players',
  'delete from public.player_access_credentials',
  'delete from public.account_balances',
  'delete from auth.users',
  'truncate public.',
  'copy staging players',
  'SUPABASE_PROJECT_REF: eecvbssdvarfcykcfrny',
  "delete from public.game_sessions where name='[SYSTEM] Econovaria Canonical Source'",
]) {
  assert.ok(!`${runner}\n${workflow}`.includes(forbidden), `forbidden retry behavior: ${forbidden}`);
}

assert.equal((runner.match(/process\.once\('beforeExit'/g) ?? []).length, 1);
assert.equal((workflow.match(/node scripts\/production-canonical-source-bootstrap-runner\.mjs/g) ?? []).length, 1);
assert.ok(runner.includes("if (state.probeGames > 1)"));
assert.ok(runner.includes("if (state.probeGames === 1)"));
assert.ok(runner.includes("source.name=${sqlLiteral(SOURCE_NAME)}"));
assert.ok(runner.includes("owner.email=${sqlLiteral(SOURCE_STAFF_EMAIL)}"));
assert.ok(runner.includes("source.game_join_code_status<>'active'"));
assert.ok(runner.includes("probe.game_join_code_status='active'"));
assert.ok(runner.includes("probe.provisioning_status='ready'"));
assert.ok(workflow.includes("after.sourceCount !== 1 || after.sourceJoinable !== false"));
assert.ok(workflow.includes('after.releaseMembers !== 590'));
assert.ok(workflow.includes('after.probeResidue !== 0'));

console.log('production canonical source bootstrap retry contract: ok');
