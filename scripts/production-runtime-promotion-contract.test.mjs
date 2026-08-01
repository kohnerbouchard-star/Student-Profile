#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync('.github/workflows/production-runtime-promotion-v2.yml', 'utf8');
const releaseIntegrity = readFileSync('.github/workflows/release-integrity.yml', 'utf8');

for (const marker of [
  'Production Runtime Promotion V2 (Retired)',
  'workflow_dispatch',
  'Block unsafe legacy production promotion',
  'Release Integrity live-parity workflow',
  'exit 1',
]) {
  assert.ok(workflow.includes(marker), `missing retired workflow marker: ${marker}`);
}

for (const forbidden of [
  'supabase db push',
  'supabase migration repair',
  'supabase_migrations.schema_migrations',
  'Materialize production-only migration placeholders',
  'functions deploy',
  'psql ',
  'SUPABASE_DB_URL',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
]) {
  assert.ok(!workflow.toLowerCase().includes(forbidden.toLowerCase()), `retired workflow contains forbidden behavior: ${forbidden}`);
}

for (const marker of [
  'merge_group:',
  'EXPECTED_SOURCE_SHA: ${{ github.sha }}',
  'default_transaction_read_only=on',
  'PGSSLMODE: verify-full',
  'SUPABASE_DB_CA_CERT',
  'PGSSLROOTCERT',
  'environment: production',
  'verify-source',
  'validate-db-url',
  'migration-manifest.json',
  'schema-comparison.json',
  'release-attestation.json',
  'enforce-attestation',
]) {
  assert.ok(releaseIntegrity.includes(marker), `missing release-integrity marker: ${marker}`);
}

for (const forbidden of [
  'github.event.pull_request.head.sha',
  '--allowlist',
  'release-integrity-expected-differences-v1.json',
]) {
  assert.ok(!releaseIntegrity.includes(forbidden), `release integrity contains retired behavior: ${forbidden}`);
}

console.log('production runtime promotion contract: ok');
