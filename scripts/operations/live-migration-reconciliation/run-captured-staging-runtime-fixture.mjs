import assert from 'node:assert/strict';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultRun } from '../../loan-review-transition-binding.mjs';
import { assertCapturedStagingFixture, FIXTURE_CLIENT_ENV } from './run-captured-staging-purge-fixture.mjs';
import { disposableRuntimeCatalogFixture, readDisposableRuntimeCatalogOutput } from './disposable-runtime-catalog-fixture.mjs';

export function runCapturedStagingRuntimeFixture(env = process.env, run = defaultRun) {
  assert.equal(env.REF032_RECONSTRUCT_STATIC_SCHEDULER, 'rollback-only-repository-v1');
  for (const key of ['DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH',
    'PGPASSWORD', 'PGPASSFILE', 'PGSERVICEFILE', 'SUPABASE_DB_PASSWORD', 'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_SECRET_KEY']) assert(!env[key]);
  for (const [key, leaf] of [['PHASE15_CAPTURE_DIR', 'raw'], ['PHASE15_WORK_DIR', 'work'],
    ['PHASE15_CANONICAL_CATALOG', 'canonical/catalog-1.json']]) {
    assert.equal(realpathSync(env[key]), path.resolve(env.RUNNER_TEMP, 'u1', leaf));
  }
  const context = JSON.parse(run('docker', ['context', 'inspect']))[0];
  const sha = run('git', ['rev-parse', 'HEAD']);
  const inspect = target => JSON.parse(run('docker', ['inspect', target]))[0];
  const container = inspect('supabase_db_econovaria_phase15_staging');
  const id = assertCapturedStagingFixture(env, sha, context, container);
  assert.match(container.Config.Image, /^(?:public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.6\.1\.143$/);
  assert.equal(readFileSync(path.join(env.RUNNER_TEMP, 'u1/canonical/source-commit.txt'), 'utf8').trim(), sha);
  const { sql, jobs } = disposableRuntimeCatalogFixture(JSON.parse(readFileSync(env.PHASE15_CANONICAL_CATALOG, 'utf8')));
  const current = inspect(id);
  assert.equal(assertCapturedStagingFixture(env, sha, context, current), id);
  assert.equal(current.Image, container.Image);
  const output = run('docker', ['exec', '-i', id, ...FIXTURE_CLIENT_ENV, '-u', 'PGPASSWORD',
    'PGCONNECT_TIMEOUT=3', 'PGSERVICEFILE=/dev/null', 'PGPASSFILE=/dev/null',
    'PGOPTIONS=-c ref032.runtime_catalog_fixture=rollback-only-repository-v1',
    'psql', '-w', '-h', '/var/run/postgresql', '-p', '5432', '-U', 'postgres', '-d', 'postgres',
    '-XqAt', '-v', 'ON_ERROR_STOP=1'], sql);
  return readDisposableRuntimeCatalogOutput(output, jobs);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { catalog, receipt } = runCapturedStagingRuntimeFixture();
    writeFileSync(path.join(process.env.PHASE15_WORK_DIR, 'runtime-fixture.json'),
      JSON.stringify(receipt) + '\n', { mode: 0o600, flag: 'wx' });
    process.stdout.write(catalog + '\n');
  } catch {
    // The caller projects only the bounded stage. Keep SQL and catalogs private.
    process.stderr.write('Disposable runtime catalog fixture failed.\n');
    process.exitCode = 1;
  }
}
