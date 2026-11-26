import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { disposableRuntimeCatalogFixture, readDisposableRuntimeCatalogOutput, verifyDisposableRuntimeCatalogPair } from './disposable-runtime-catalog-fixture.mjs';
import { runCapturedStagingRuntimeFixture } from './run-captured-staging-runtime-fixture.mjs';

const catalog = {
  schemaVersion: 'econovaria.phase15.catalog-supplement.v2',
  schemas: [{name:'public',owner:'pg_database_owner'}],
  extensions: [], views: [], routineSecurity: [], triggers: [], cron: [],
};
const history = { name: 'supabase_migrations', owner: 'postgres' };
const { jobs } = disposableRuntimeCatalogFixture();
const canonical = { ...catalog, schemas: [...catalog.schemas, history], cron: jobs };
const twoExports = (before, after) => [before, after].map(row => JSON.stringify(row)).join('\n');

test('canonical fixture identities and literal scheduler bodies are checked before SQL', () => {
  const { sql } = disposableRuntimeCatalogFixture(canonical);
  const exporter = readFileSync(new URL('./export-runtime-catalog-v2.sql', import.meta.url), 'utf8');
  const [query] = exporter.split('begin transaction read only;\n')[1].split('\nrollback;');
  assert.equal(sql.split(query).length, 3);
  assert.match(sql, /^begin isolation level repeatable read;[\s\S]+\nrollback;\n$/u);
  assert.doesNotMatch(sql, /^\s*(?:commit|end);/imu);
  assert.equal((sql.match(/perform cron\.schedule\(/gu) ?? []).length, 6);
  for (const reject of [
    { ...canonical, cron: jobs.slice(1) },
    { ...canonical, cron: [...jobs, jobs[0]] },
    { ...canonical, cron: [{ ...jobs[0], active: false }, ...jobs.slice(1)] },
    { ...canonical, schemas: [...catalog.schemas, { ...history, owner: 'other' }] },
  ]) assert.throws(() => disposableRuntimeCatalogFixture(reject));
});

test('exact comparator keeps every unexplained schema and scheduler difference', () => {
  const temp = mkdtempSync(join(tmpdir(), 'ref032-runtime-fixture-contract-'));
  try {
    const left = join(temp, 'canonical.json');
    const right = join(temp, 'disposable.json');
    writeFileSync(left, JSON.stringify(canonical));
    const compare = snapshot => {
      writeFileSync(right, JSON.stringify(snapshot));
      return spawnSync(process.execPath, [
        new URL('./compare-schema-snapshots.mjs', import.meta.url).pathname, '--left', left, '--right', right,
      ], { encoding: 'utf8', timeout: 3000 }).status;
    };
    assert.equal(compare(catalog), 2);
    assert.equal(compare(canonical), 0);
    assert.deepEqual(readDisposableRuntimeCatalogOutput(twoExports(catalog, canonical), jobs).receipt,
      { schedulerRowsAdded: 6, bootstrapHistoryAdded: true });
    assert.deepEqual(verifyDisposableRuntimeCatalogPair(canonical, canonical, jobs),
      { schedulerRowsAdded: 0, bootstrapHistoryAdded: false });
    const unknown = { name: 'unrelated_synthetic_schema', owner: 'postgres' };
    const before = { ...catalog, schemas: [...catalog.schemas, unknown] };
    const after = { ...canonical, schemas: [...canonical.schemas, unknown] };
    assert.equal(compare(after), 2);
    assert.deepEqual(verifyDisposableRuntimeCatalogPair(before, after, jobs),
      { schedulerRowsAdded: 6, bootstrapHistoryAdded: true });
    assert.throws(() => verifyDisposableRuntimeCatalogPair(before, canonical, jobs));
    const drifted = { ...jobs[0], active: false };
    const preexisting = { ...canonical, schemas: [...catalog.schemas, { ...history, owner: 'other' }],
      cron: [drifted, ...jobs.slice(1)] };
    assert.equal(compare(preexisting), 2);
    assert.deepEqual(verifyDisposableRuntimeCatalogPair(preexisting, preexisting, jobs),
      { schedulerRowsAdded: 0, bootstrapHistoryAdded: false });
    assert.throws(() => verifyDisposableRuntimeCatalogPair(preexisting, canonical, jobs));
    assert.throws(() => readDisposableRuntimeCatalogOutput(twoExports(catalog, canonical) + '\nPRIVATE', jobs));
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test('protected runner uses the inspected local ID and socket and checks exact source before SQL', () => {
  const temp = mkdtempSync(join(tmpdir(), 'ref032-captured-runtime-fixture-'));
  try {
    for (const dir of ['raw', 'work', 'canonical']) mkdirSync(join(temp, 'u1', dir), { recursive: true });
    const sha = 'a'.repeat(40);
    const id = 'b'.repeat(64);
    const catalogFile = join(temp, 'u1/canonical/catalog-1.json');
    const sourceFile = join(temp, 'u1/canonical/source-commit.txt');
    writeFileSync(catalogFile, JSON.stringify(canonical));
    writeFileSync(sourceFile, sha + '\n');
    const env = {
      REF032_RECONSTRUCT_STATIC_SCHEDULER: 'rollback-only-repository-v1',
      REF032_RECONSTRUCT_PURGE_FIXTURE: 'repository-only-v1', GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'kohnerbouchard-star/Student-Profile', GITHUB_WORKFLOW: 'Econovaria Staging Schema Rehearsal',
      GITHUB_JOB: 'rehearse', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_RUN_ATTEMPT: '1',
      GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, PHASE15_ENVIRONMENT: 'staging',
      PHASE15_EXPECTED_PROJECT_REF: 'eecvbssdvarfcykcfrny', RUNNER_TEMP: temp,
      PHASE15_CAPTURE_DIR: join(temp, 'u1/raw'), PHASE15_WORK_DIR: join(temp, 'u1/work'),
      PHASE15_CANONICAL_CATALOG: catalogFile, REF032_FIXTURE_CONTAINER_NOT_BEFORE: String(Date.now() - 10000),
    };
    const container = {
      Id: id, Image: 'sha256:' + 'c'.repeat(64), Name: '/supabase_db_econovaria_phase15_staging',
      Created: new Date(Date.now() - 5000).toISOString(), State: {Running: true},
      Config: {Image:'public.ecr.aws/supabase/postgres:17.6.1.143',
        Labels: {'com.supabase.cli.project':'econovaria_phase15_staging'}},
      HostConfig: {NetworkMode:'supabase_network_econovaria_phase15_staging'}, NetworkSettings: {Networks:{}},
    };
    let executions = 0;
    const run = (command, args, input) => {
      if (command === 'git') return sha;
      assert.equal(command, 'docker');
      if (args[0] === 'context') return JSON.stringify([{ Endpoints: { docker: { Host: 'unix:///var/run/docker.sock' } } }]);
      if (args[0] === 'inspect') return JSON.stringify([container]);
      assert.deepEqual(args, ['exec','-i',id,'env','-u','PGSERVICE','-u','PGHOSTADDR','-u','PGPASSWORD',
        'PGCONNECT_TIMEOUT=3','PGSERVICEFILE=/dev/null','PGPASSFILE=/dev/null',
        'PGOPTIONS=-c ref032.runtime_catalog_fixture=rollback-only-repository-v1',
        'psql','-w','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','postgres',
        '-XqAt','-v','ON_ERROR_STOP=1']);
      assert.equal(input, disposableRuntimeCatalogFixture(canonical).sql);
      executions++;
      return twoExports(catalog, canonical);
    };
    for (const patch of [
      { REF032_RECONSTRUCT_STATIC_SCHEDULER: '' }, { PHASE15_ENVIRONMENT: 'production' },
      { PHASE15_REMOTE_DATABASE_URL: 'forbidden' }, { PGPASSWORD: 'forbidden' },
      { GITHUB_RUN_ATTEMPT: '2' }, { PHASE15_CANONICAL_CATALOG: sourceFile },
    ]) assert.throws(() => runCapturedStagingRuntimeFixture({ ...env, ...patch }, run));
    writeFileSync(sourceFile, 'd'.repeat(40) + '\n');
    assert.throws(() => runCapturedStagingRuntimeFixture(env, run));
    writeFileSync(sourceFile, sha + '\n');
    container.NetworkSettings.Networks.bridge = {};
    assert.throws(() => runCapturedStagingRuntimeFixture(env, run));
    delete container.NetworkSettings.Networks.bridge;
    assert.equal(executions, 0);
    const result = runCapturedStagingRuntimeFixture(env, run);
    assert.equal(executions, 1);
    assert.deepEqual(result.receipt, { schedulerRowsAdded: 6, bootstrapHistoryAdded: true });
    assert.deepEqual(JSON.parse(result.catalog), canonical);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});
