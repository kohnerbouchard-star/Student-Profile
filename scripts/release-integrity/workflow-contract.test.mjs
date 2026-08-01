import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateDatabaseUrlProjectRef } from './database-binding.mjs';

const releaseWorkflow = readFileSync('.github/workflows/release-integrity.yml', 'utf8');
const retiredWorkflow = readFileSync('.github/workflows/production-runtime-promotion-v2.yml', 'utf8');
const contractWorkflow = readFileSync('.github/workflows/production-runtime-promotion-contract.yml', 'utf8');
const fingerprintSql = readFileSync('scripts/release-integrity/export-schema-fingerprint.sql', 'utf8');
const design = readFileSync('docs/operations/release-integrity-gates-v1.md', 'utf8');
const expectedDifferences = JSON.parse(
  readFileSync('docs/operations/contracts/release-integrity-expected-differences-v1.json', 'utf8'),
);

function assertActionsPinned(workflow, name) {
  for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    assert.match(reference, /@[0-9a-f]{40}$/, `${name} contains an unpinned action: ${reference}`);
  }
}

test('release workflow is read-only, exact-source bound, and action pinned', () => {
  assertActionsPinned(releaseWorkflow, 'release-integrity.yml');
  for (const marker of [
    'permissions:\n  contents: read',
    'default_transaction_read_only=on',
    'statement_timeout=30000',
    'lock_timeout=5000',
    'PGSSLMODE: require',
    'environment: production',
    "github.ref == 'refs/heads/main'",
    'test "$GITHUB_REF" = "refs/heads/main"',
    'persist-credentials: false',
    'verify-source',
    'validate-db-url',
    'enforce-attestation',
  ]) {
    assert.ok(releaseWorkflow.includes(marker), `missing release workflow marker: ${marker}`);
  }

  assert.ok(!releaseWorkflow.includes('ref: ${{ inputs.source_sha }}'), 'workflow must not execute code from a user-supplied SHA');

  for (const forbidden of [
    'supabase db push',
    'supabase db pull',
    'supabase migration repair',
    'insert into supabase_migrations',
    'update supabase_migrations',
    'delete from supabase_migrations',
    'functions deploy',
    'truncate ',
    'drop database',
  ]) {
    assert.ok(!releaseWorkflow.toLowerCase().includes(forbidden), `release workflow contains forbidden mutation: ${forbidden}`);
  }
});

test('legacy production workflow is an unconditional fail-closed retirement stub', () => {
  assert.ok(retiredWorkflow.includes('Production Runtime Promotion V2 (Retired)'));
  assert.ok(retiredWorkflow.includes('exit 1'));
  assert.ok(!retiredWorkflow.includes('environment: production'));
  assert.ok(!retiredWorkflow.includes('secrets.'));
  assertActionsPinned(retiredWorkflow, 'production-runtime-promotion-v2.yml');
});

test('contract workflow is pinned and exercises all release integrity tests', () => {
  assertActionsPinned(contractWorkflow, 'production-runtime-promotion-contract.yml');
  for (const marker of [
    'scripts/release-integrity/index.test.mjs',
    'scripts/release-integrity/workflow-contract.test.mjs',
    'scripts/production-runtime-promotion-contract.test.mjs',
    'git diff --check',
  ]) {
    assert.ok(contractWorkflow.includes(marker), `missing contract workflow marker: ${marker}`);
  }
});

test('schema authorization evidence uses stable routine signatures', () => {
  assert.ok(fingerprintSql.includes("'arguments', pg_get_function_identity_arguments(p.oid)"));
  assert.ok(fingerprintSql.includes("aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))"));
  assert.ok(!fingerprintSql.includes('specificName'));
  assert.ok(!fingerprintSql.includes('specific_name'));
});

test('database bindings reject non-Supabase hosts even with a matching username', () => {
  const projectRef = 'abcdefghijklmnopqrst';
  const accepted = validateDatabaseUrlProjectRef({
    databaseUrl: `postgresql://postgres.${projectRef}:secret@aws-0-region.pooler.supabase.com:5432/postgres`,
    expectedProjectRef: projectRef,
  });
  assert.equal(accepted.connectionType, 'pooler');

  assert.throws(() => validateDatabaseUrlProjectRef({
    databaseUrl: `postgresql://postgres.${projectRef}:secret@attacker.example:5432/postgres`,
    expectedProjectRef: projectRef,
  }), /expected Supabase project and host/);
});

test('design authority and expected-difference contract remain fail closed', () => {
  for (const invariant of ['I1.', 'I2.', 'I3.', 'I4.', 'I5.', 'I6.', 'I7.', 'I8.', 'I9.', 'I10.']) {
    assert.ok(design.includes(invariant), `missing design invariant: ${invariant}`);
  }
  assert.equal(expectedDifferences.schemaVersion, 'econovaria.release-integrity.expected-differences.v1');
  assert.deepEqual(expectedDifferences.allowedDifferences, []);
});
