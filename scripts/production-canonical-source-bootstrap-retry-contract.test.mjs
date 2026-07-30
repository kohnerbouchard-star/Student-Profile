#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runner = readFileSync('scripts/production-canonical-source-bootstrap-runner.mjs', 'utf8');
const workflow = readFileSync(
  '.github/workflows/production-canonical-source-bootstrap-retry-v1.yml',
  'utf8',
);

for (const marker of [
  "const parsed = new URL(databaseUrl)",
  "const username = decodeURIComponent(parsed.username || '')",
  "const direct = parsed.hostname === `db.${projectRef}.supabase.co`",
  "const pooler = username === `postgres.${projectRef}` || username.endsWith(`.${projectRef}`)",
  "projectRef !== expectedProjectRef || projectRef === deniedProjectRef",
  "decodeURIComponent(parsed.password || '')",
  "parsed.searchParams.set('application_name', `db.${projectRef}.supabase.co`)",
  "await import('./production-canonical-source-bootstrap.mjs')",
  'environment: production',
  'refs/heads/main',
  'EXPECTED_PRODUCTION_PROJECT_REF: cgiukdjwicykrmtkhudh',
  'DENIED_STAGING_PROJECT_REF: eecvbssdvarfcykcfrny',
  'Run corrected production canonical-source bootstrap',
  'node scripts/production-canonical-source-bootstrap-runner.mjs',
  'Verify source completeness and protected data preservation',
  "for (const key of ['nonSystemGameCount', 'playerCount', 'activeCredentialCount', 'accountBalanceCount'])",
]) {
  assert.ok(`${runner}\n${workflow}`.includes(marker), `missing corrected binding marker: ${marker}`);
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

for (const assignmentPattern of [
  /parsed\.hostname\s*=(?!=)/,
  /parsed\.username\s*=(?!=)/,
  /parsed\.password\s*=(?!=)/,
]) {
  assert.ok(!assignmentPattern.test(runner), `runner mutates protected URL identity: ${assignmentPattern}`);
}

for (const forbidden of [
  'delete from public.players',
  'delete from auth.users',
  'truncate public.',
  'copy staging players',
  'SUPABASE_PROJECT_REF: eecvbssdvarfcykcfrny',
]) {
  assert.ok(!`${runner}\n${workflow}`.includes(forbidden), `forbidden retry behavior: ${forbidden}`);
}

assert.equal((workflow.match(/node scripts\/production-canonical-source-bootstrap-runner\.mjs/g) ?? []).length, 1);
assert.ok(workflow.includes("after.sourceCount !== 1 || after.sourceJoinable !== false"));
assert.ok(workflow.includes('after.releaseMembers !== 590'));
assert.ok(workflow.includes('after.probeResidue !== 0'));

console.log('production canonical source bootstrap retry contract: ok');
