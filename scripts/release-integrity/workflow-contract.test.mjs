import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { validateDatabaseUrlProjectRef } from './index.mjs';

const releaseWorkflow = readFileSync('.github/workflows/release-integrity.yml', 'utf8');
const retiredWorkflow = readFileSync('.github/workflows/production-runtime-promotion-v2.yml', 'utf8');
const contractWorkflow = readFileSync('.github/workflows/production-runtime-promotion-contract.yml', 'utf8');
const fingerprintSql = readFileSync('scripts/release-integrity/export-schema-fingerprint.sql', 'utf8');
const indexSource = readFileSync('scripts/release-integrity/index.mjs', 'utf8');
const bindingSource = readFileSync('scripts/release-integrity/database-binding.mjs', 'utf8');
const design = readFileSync('docs/operations/release-integrity-gates-v1.md', 'utf8');
const hardeningAmendment = readFileSync(
  'docs/operations/release-integrity-gates-v1-hardening-amendment.md',
  'utf8',
);

function assertActionsPinned(workflow, name) {
  for (const match of workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)) {
    const reference = match[1];
    if (reference.startsWith('./')) continue;
    assert.match(reference, /@[0-9a-f]{40}$/, `${name} contains an unpinned action: ${reference}`);
  }
}

test('release workflow is read-only, merge-candidate bound, TLS verified, and action pinned', () => {
  assertActionsPinned(releaseWorkflow, 'release-integrity.yml');
  for (const marker of [
    'permissions:\n  contents: read',
    'merge_group:',
    'EXPECTED_SOURCE_SHA: ${{ github.sha }}',
    'default_transaction_read_only=on',
    'statement_timeout=30000',
    'lock_timeout=5000',
    'PGSSLMODE: verify-full',
    'SUPABASE_DB_CA_CERT: ${{ secrets.SUPABASE_DB_CA_CERT }}',
    'PGSSLROOTCERT=$cert_path',
    'environment: production',
    "github.ref == 'refs/heads/main'",
    'test "$GITHUB_REF" = "refs/heads/main"',
    'persist-credentials: false',
    'verify-source',
    'validate-db-url',
    'enforce-attestation',
    'docs/operations/release-integrity-gates-v1*.md',
  ]) {
    assert.ok(releaseWorkflow.includes(marker), `missing release workflow marker: ${marker}`);
  }

  for (const forbidden of [
    'github.event.pull_request.head.sha',
    'ref: ${{ inputs.source_sha }}',
    '--allowlist',
    'release-integrity-expected-differences-v1.json',
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
    assert.ok(!releaseWorkflow.toLowerCase().includes(forbidden.toLowerCase()), `release workflow contains forbidden behavior: ${forbidden}`);
  }
});

test('legacy production workflow is an unconditional fail-closed retirement stub', () => {
  assert.ok(retiredWorkflow.includes('Production Runtime Promotion V2 (Retired)'));
  assert.ok(retiredWorkflow.includes('exit 1'));
  assert.ok(!retiredWorkflow.includes('environment: production'));
  assert.ok(!retiredWorkflow.includes('secrets.'));
  assertActionsPinned(retiredWorkflow, 'production-runtime-promotion-v2.yml');
});

test('contract workflow validates merge candidates and all release integrity tests', () => {
  assertActionsPinned(contractWorkflow, 'production-runtime-promotion-contract.yml');
  for (const marker of [
    'merge_group:',
    'ref: ${{ github.sha }}',
    'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
    'docs/operations/release-integrity-gates-v1*.md',
    'scripts/release-integrity/index.test.mjs',
    'scripts/release-integrity/workflow-contract.test.mjs',
    'scripts/production-runtime-promotion-contract.test.mjs',
    'git diff --check',
  ]) {
    assert.ok(contractWorkflow.includes(marker), `missing contract workflow marker: ${marker}`);
  }
  assert.ok(!contractWorkflow.includes('github.event.pull_request.head.sha'));
});

test('database binding has one canonical implementation', () => {
  assert.ok(bindingSource.includes('export function validateDatabaseUrlProjectRef'));
  assert.ok(indexSource.includes("export { validateDatabaseUrlProjectRef } from './database-binding.mjs';"));
  assert.ok(!indexSource.includes('export function validateDatabaseUrlProjectRef'));
});

test('schema evidence uses SHA-256, stable ownership, and relevant role authority', () => {
  for (const marker of [
    "'definitionSha256', encode(sha256(convert_to(pg_get_functiondef(p.oid), 'UTF8')), 'hex')",
    "'schemaOwners'",
    "'relationOwners'",
    "'routineOwners'",
    "'roleAttributes'",
    "'roleMemberships'",
    "'arguments', pg_get_function_identity_arguments(p.oid)",
    "aclexplode(coalesce(p.proacl, acldefault('f', p.proowner)))",
  ]) {
    assert.ok(fingerprintSql.includes(marker), `missing fingerprint marker: ${marker}`);
  }
  assert.ok(!fingerprintSql.toLowerCase().includes('md5('));
  assert.ok(!fingerprintSql.includes('specificName'));
  assert.ok(!fingerprintSql.includes('specific_name'));
});

test('database bindings reject non-Supabase hosts and TLS downgrade parameters', () => {
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

  assert.throws(() => validateDatabaseUrlProjectRef({
    databaseUrl: `postgresql://postgres.${projectRef}:secret@aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require`,
    expectedProjectRef: projectRef,
  }), /below verify-full/);

  assert.throws(() => validateDatabaseUrlProjectRef({
    databaseUrl: `postgresql://postgres.${projectRef}:secret@aws-0-region.pooler.supabase.com:5432/postgres?sslrootcert=%2Ftmp%2Funtrusted.crt`,
    expectedProjectRef: projectRef,
  }), /protected TLS root certificate/);
});

test('design authority and hardening amendment remain fail closed', () => {
  for (const invariant of ['I1.', 'I2.', 'I3.', 'I4.', 'I5.', 'I6.', 'I7.', 'I8.', 'I9.', 'I10.']) {
    assert.ok(design.includes(invariant), `missing design invariant: ${invariant}`);
  }
  for (const decision of ['A1.', 'A2.', 'A3.', 'A4.', 'A5.', 'A6.', 'A7.', 'A8.']) {
    assert.ok(hardeningAmendment.includes(decision), `missing hardening decision: ${decision}`);
  }
  assert.ok(hardeningAmendment.includes('Any structural or authorization fingerprint difference is `UNAPPROVED_DRIFT`'));
});
