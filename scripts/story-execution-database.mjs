import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function assertStoryDatabaseEnvironment(env, actualSha, event) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Hosted disposable runner required');
  assert.equal(env.GITHUB_EVENT_NAME, 'pull_request', 'Only PR acceptance allowed');
  assert.equal(env.GITHUB_REPOSITORY, 'kohnerbouchard-star/Student-Profile');
  assert.match(actualSha, /^[a-f0-9]{40}$/);
  assert.equal(actualSha, event.pull_request?.head.sha, 'Exact proposed source required');
  assert.equal(event.pull_request?.base.ref, 'main');
  for (const key of ['DATABASE_URL', 'SUPABASE_DB_URL', 'SUPABASE_ACCESS_TOKEN', 'DOCKER_HOST', 'DOCKER_CONTEXT']) {
    assert(!env[key], `Unexpected external connection setting: ${key}`);
  }
}

export function runStoryDatabaseAcceptance() {
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  assertStoryDatabaseEnvironment(process.env, run('git', ['rev-parse', 'HEAD']), event);
  const context = JSON.parse(run('docker', ['context', 'inspect']))[0];
  assert.equal(context.Endpoints.docker.Host, 'unix:///var/run/docker.sock');
  const project = readFileSync('backend/supabase/config.toml', 'utf8').match(/^project_id = "([\w-]+)"$/m)?.[1];
  assert(project);
  const container = JSON.parse(run('docker', ['inspect', `supabase_db_${project}`]))[0];
  assert(container.State.Running);
  assert.match(container.Id, /^[a-f0-9]{64}$/);
  assert.equal(container.Config.Labels['com.supabase.cli.project'], project);
  assert.match(container.Config.Image, /^(public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.6\.1\.143$/);
  assert(Date.parse(container.Created) >= statSync('.git').mtimeMs, 'Preexisting database forbidden');
  const sql = readFileSync('scripts/story-execution-database.sql', 'utf8');
  assert(sql.includes('rollback;'));
  const output = execFileSync('docker', ['exec', '-i', container.Id, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-X', '-v', 'ON_ERROR_STOP=1'],
    { input: sql, encoding: 'utf8', timeout: 60000, stdio: ['pipe', 'pipe', 'pipe'] });
  assert(output.includes('STORY_EXECUTION_DATABASE_ACCEPTANCE_PASSED'));
  console.log('Story execution real PostgreSQL claim/retry/finalize/game-isolation/privilege acceptance passed; fixtures rolled back.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runStoryDatabaseAcceptance();
