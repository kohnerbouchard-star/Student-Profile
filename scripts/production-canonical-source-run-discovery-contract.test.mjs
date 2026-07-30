#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workflow = readFileSync(
  '.github/workflows/production-canonical-source-run-discovery.yml',
  'utf8',
);

for (const marker of [
  'actions: read',
  'contents: read',
  'issues: write',
  'refs/heads/main',
  'production-canonical-source-bootstrap-v1.yml',
  'Discover recent protected workflow runs',
  'Post sanitized discovery report',
  'workflow_runs',
  "run.event === 'push'",
]) {
  assert.ok(workflow.includes(marker), `missing discovery marker: ${marker}`);
}

for (const forbidden of [
  'environment: production',
  'SUPABASE_ACCESS_TOKEN',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'DATABASE_URL',
  'psql ',
  'supabase ',
  'delete from',
  'insert into',
  'update public.',
  'actions: write',
  'contents: write',
]) {
  assert.ok(!workflow.includes(forbidden), `discovery workflow contains forbidden behavior: ${forbidden}`);
}

assert.ok(workflow.includes('gh api \\\n            "repos/${GITHUB_REPOSITORY}/actions/workflows/${TARGET_WORKFLOW}/runs?per_page=10"'));
assert.ok(workflow.includes('gh api --method POST'));
assert.ok(workflow.includes('workflow metadata only'));

console.log('production canonical source run discovery contract: ok');
