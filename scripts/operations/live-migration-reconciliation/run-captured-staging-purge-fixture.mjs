import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { defaultRun } from '../../loan-review-transition-binding.mjs';
import { buildDisposablePurgeControlFixture, seedFile } from './build-disposable-purge-control-fixture.mjs';

export function assertCapturedStagingFixture(env, actualSha, context, container, now = Date.now()) {
  assert.equal(env.REF032_RECONSTRUCT_PURGE_FIXTURE, 'repository-only-v1');
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_REPOSITORY, 'kohnerbouchard-star/Student-Profile');
  assert.equal(env.GITHUB_WORKFLOW, 'Econovaria Staging Schema Rehearsal');
  assert.equal(env.GITHUB_JOB, 'rehearse');
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.GITHUB_RUN_ATTEMPT, '1');
  assert.match(actualSha, /^[a-f0-9]{40}$/); assert.equal(env.GITHUB_SHA, actualSha);
  assert.equal(env.PHASE15_ENVIRONMENT, 'staging');
  assert.equal(env.PHASE15_EXPECTED_PROJECT_REF, 'eecvbssdvarfcykcfrny');
  for (const key of ['DOCKER_HOST','DOCKER_CONTEXT','DATABASE_URL','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','PHASE15_REMOTE_DATABASE_URL','PGHOST','PGHOSTADDR','PGSERVICE','PGOPTIONS']) assert(!env[key], `External connection setting forbidden: ${key}`);
  assert.equal(context.Endpoints.docker.Host, 'unix:///var/run/docker.sock');
  assert.equal(container.Name, '/supabase_db_econovaria_phase15_staging');
  assert.equal(container.Config.Labels['com.supabase.cli.project'], 'econovaria_phase15_staging');
  assert.equal(container.State.Running, true);
  assert.match(container.Id, /^[a-f0-9]{64}$/); assert.match(container.Image, /^sha256:[a-f0-9]{64}$/);
  assert.match(container.Config.Image, /^(?:public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.[a-zA-Z0-9.]+$/);
  assert(!['host','none'].includes(container.HostConfig.NetworkMode) && !container.HostConfig.NetworkMode.startsWith('container:'));
  assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [], 'Disposable egress must be disconnected');
  assert.match(env.REF032_FIXTURE_CONTAINER_NOT_BEFORE, /^\d{13}$/);
  const created = Date.parse(container.Created);
  assert(created >= Number(env.REF032_FIXTURE_CONTAINER_NOT_BEFORE) && created <= now, 'Fresh disposable container required');
  assert.equal(path.resolve(env.PHASE15_CAPTURE_DIR), path.resolve(env.RUNNER_TEMP,'u1/raw'));
  assert.equal(path.resolve(env.PHASE15_WORK_DIR), path.resolve(env.RUNNER_TEMP,'u1/work'));
  return container.Id;
}

export function runCapturedStagingFixture(env = process.env, run = defaultRun) {
  assert.equal(env.REF032_RECONSTRUCT_PURGE_FIXTURE,'repository-only-v1');
  for(const key of ['DOCKER_HOST','DOCKER_CONTEXT']) assert(!env[key], 'Local Docker required');
  const context = JSON.parse(run('docker',['context','inspect']))[0];
  const container = JSON.parse(run('docker',['inspect','supabase_db_econovaria_phase15_staging']))[0];
  const id = assertCapturedStagingFixture(env, run('git',['rev-parse','HEAD']), context, container);
  assert.equal(realpathSync(env.PHASE15_CAPTURE_DIR), path.resolve(env.RUNNER_TEMP,'u1/raw'));
  assert.equal(realpathSync(env.PHASE15_WORK_DIR), path.resolve(env.RUNNER_TEMP,'u1/work'));
  // The caller checks relative SHA256SUMS in the exact capture directory.
  const source = readFileSync(`backend/supabase/migrations/${seedFile}`,'utf8');
  const sql = buildDisposablePurgeControlFixture(source);
  const args = ['exec','-e','PGHOSTADDR=','-e','PGSERVICE=','-e','PGSERVICEFILE=/dev/null','-e','PGOPTIONS=-c ref032.disposable_fixture=repository-only-v1','-i',id,'psql','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1'];
  // Re-attest the exact container immediately before executing over its Unix socket.
  const again=JSON.parse(run('docker',['inspect',id]))[0];
  assert.equal(assertCapturedStagingFixture(env,run('git',['rev-parse','HEAD']),context,again),id);
  run('docker',args,sql);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runCapturedStagingFixture();
