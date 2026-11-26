// GitHub-hosted fixture. The empty CLI database is disconnected before any test SQL.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualifyTransaction } from './transaction.mjs';
import { STAGING_REPOSITORY, STAGING_REPOSITORY_ID } from '../staging-recovery-evidence/owner-approval.mjs';

const source = 'f04d410fe6566e66920316ae0600f808fe4569f2';
const failedCarrier = '24f87b530bcfcbd8587ec886fb4bd9df158e42aa';
const fixture = 'c4b8f0c86d595e34d2b676f5e63288db52f05b91';
const ref = 'refs/heads/chore/staging-suffix-cli-rehearsal-20261126';
const image = 'ghcr.io/supabase/postgres@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453';
const imageId = 'sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a';
const socket = '/var/run/postgresql';
const clientPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const excluded = 'studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,gotrue,postgrest,realtime,kong,mailpit,postgres-meta';
const dir = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const baseEnv = { PATH: '/usr/bin:/bin', LC_ALL: 'C' };
const closed = { syntheticOnly: true, releaseQualified: false, applyAuthorized: false, liveEvidenceIssued: false };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const suffix = randomBytes(10).toString('hex');
const project = 'suffix_source_' + suffix;
const name = 'supabase_db_' + project;
const allowedChanges = [
  '.github/workflows/staging-suffix-disposable-ci.yml',
  'docs/roadmaps/econovaria-beta-completion-roadmap-v1.md',
  'scripts/operations/staging-suffix-disposable-qualification/run-github.mjs',
  'vercel.json',
].sort();

function verifyBlob(bytes, expected) {
  const hash = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  assert.equal(hash, expected, 'PINNED_FIXTURE_BLOB_MISMATCH');
  return bytes.toString('utf8');
}

function execute(command, args, env = baseEnv, input, timeout = 30_000) {
  return execFileSync(command, args, { env, cwd: root, input, timeout,
    encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
}

function githubContext() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true');
  assert.equal(process.env.GITHUB_EVENT_NAME, 'push');
  assert.equal(process.env.GITHUB_REPOSITORY, STAGING_REPOSITORY);
  assert.equal(process.env.GITHUB_REPOSITORY_ID, String(STAGING_REPOSITORY_ID));
  assert.equal(process.env.GITHUB_REF, ref);
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1');
  for (const [key, value] of Object.entries(process.env)) {
    if (value && /^(?:PG|SUPABASE_|PHASE15_|STAGING_|DATABASE_URL|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|GH_TOKEN|GITHUB_TOKEN)/.test(key)) {
      throw Error('EXTERNAL_AUTHORITY_FORBIDDEN');
    }
  }
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const git = (...args) => execute('git', args).trim();
  const head = git('rev-parse', 'HEAD');
  assert.equal(event.after, head);
  assert.equal(event.repository.id, STAGING_REPOSITORY_ID);
  assert.equal(event.ref, ref);
  assert.equal(event.created, true);
  assert.equal(event.deleted, false);
  assert.equal(event.forced, false);
  assert.equal(event.before, '0'.repeat(40));
  assert.equal(process.env.GITHUB_SHA, head);
  assert.equal(git('rev-parse', 'HEAD^'), failedCarrier);
  assert.equal(git('rev-parse', 'HEAD^^'), fixture);
  assert.equal(git('rev-parse', 'HEAD^^^'), source);
  assert.deepEqual(git('diff', '--name-only', failedCarrier, head).split('\n').sort(), allowedChanges);
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
  assert.equal(JSON.parse(readFileSync(join(root, 'docs/operations/evidence/staging-suffix-apply-v1/qualification.json'))).status, 'NOT_RUN');
  return head;
}

// The same prerequisite checks used by the passing #1064 bootstrap.
const bootstrapCheck = [
  "select current_database()='postgres' and current_user='postgres'",
  "and current_setting('server_version_num')::int between 170000 and 179999",
  "and to_regclass('auth.users') is not null and to_regclass('auth.sessions') is not null",
  "and to_regclass('auth.mfa_factors') is not null and to_regnamespace('storage') is not null",
  "and to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.jwt()') is not null",
  "and to_regprocedure('auth.role()') is not null",
  "and (select count(*)=5 from pg_roles where rolname in ('postgres','supabase_admin','service_role','anon','authenticated'))",
  "and (select count(distinct name)=4 from pg_available_extensions where name in ('pg_cron','pg_net','pgcrypto','supabase_vault'));",
].join(' ');

const safeReasons = new Set([
  'EXTERNAL_AUTHORITY_FORBIDDEN', 'CLI_VERSION_MISMATCH', 'LOCAL_DOCKER_CONTEXT_REQUIRED',
  'CLI_START_TIMEOUT', 'CLI_DOCKER_UNAVAILABLE', 'CLI_LOCAL_PORT_IN_USE', 'CLI_IMAGE_ACQUISITION',
  'CLI_SERVICE_UNHEALTHY', 'CLI_LOCAL_CONFIG_REJECTED', 'CLI_START_FAILED',
  'PINNED_IMAGE_PLATFORM_MISMATCH', 'CLI_IMAGE_TAG_MISMATCH', 'CLI_IMAGE_ID_MISMATCH',
  'CLI_CONTAINER_IDENTITY_MISMATCH', 'CLI_CONTAINER_NOT_RUNNING', 'CLI_UNEXPECTED_MOUNT',
  'CLI_NETWORK_NOT_DETACHED', 'MANAGED_PREREQUISITES_MISSING', 'SCHEDULER_NOT_FENCED',
  'MANAGED_SOCKET_UNAVAILABLE', 'CLI_CLEANUP_FAILED',
]);

function startupReason(error) {
  if (error.code === 'ETIMEDOUT') return 'CLI_START_TIMEOUT';
  const output = String(error.stderr ?? '') + '\n' + String(error.stdout ?? '');
  if (/cannot connect to the docker daemon|docker daemon is not running/i.test(output)) return 'CLI_DOCKER_UNAVAILABLE';
  if (/port is already allocated|address already in use/i.test(output)) return 'CLI_LOCAL_PORT_IN_USE';
  if (/failed to pull|error pulling|manifest unknown|toomanyrequests/i.test(output)) return 'CLI_IMAGE_ACQUISITION';
  if (/unhealthy|health check|not ready/i.test(output)) return 'CLI_SERVICE_UNHEALTHY';
  if (/failed to (?:load|parse) config|invalid config/i.test(output)) return 'CLI_LOCAL_CONFIG_REJECTED';
  return 'CLI_START_FAILED';
}

let stage = 'exact-push-and-source';
const step = value => {
  stage = value;
  console.log(JSON.stringify({ stage, status: 'RUNNING', ...closed }));
};

async function run() {
  const head = githubContext();
  const privateDir = mkdtempSync(join(process.env.RUNNER_TEMP, 'suffix-db-'));
  let started = false;
  let result;
  let failed = false;
  const dockerConfig = join(privateDir, 'docker');
  const home = join(privateDir, 'home');
  const work = join(privateDir, 'local');
  const childEnv = { PATH: process.env.PATH, LC_ALL: 'C', HOME: home, XDG_CONFIG_HOME: home,
    DOCKER_CONFIG: dockerConfig, DOCKER_HOST: 'unix:///var/run/docker.sock',
    SUPABASE_INTERNAL_IMAGE_REGISTRY: 'ghcr.io' };
  const docker = (args, input, timeout) => execute('docker', args, childEnv, input, timeout);
  const cli = (args, timeout) => execute('supabase', args, childEnv, undefined, timeout);
  try {
    step('cli-version');
    for (const directory of [dockerConfig, home]) mkdirSync(directory, { mode: 0o700 });
    const supabase = join(work, 'supabase');
    mkdirSync(join(supabase, 'migrations'), { recursive: true, mode: 0o700 });
    assert.equal(cli(['--version']).trim(), '2.109.1', 'CLI_VERSION_MISMATCH');

    step('local-docker-context');
    const [context] = JSON.parse(docker(['context', 'inspect']));
    assert.equal(context.Endpoints.docker.Host, childEnv.DOCKER_HOST, 'LOCAL_DOCKER_CONTEXT_REQUIRED');
    step('pinned-image-acquisition');
    docker(['pull', '--platform', 'linux/amd64', image], undefined, 180_000);
    const [metadata] = JSON.parse(docker(['image', 'inspect', image]));
    assert(metadata.Id === imageId && metadata.Architecture === 'amd64' && metadata.Os === 'linux',
      'PINNED_IMAGE_PLATFORM_MISMATCH');

    step('empty-managed-bootstrap');
    const config = readFileSync(join(root, 'backend/supabase/config.toml'), 'utf8')
      .replace(/^project_id = .*$/m, 'project_id = "' + project + '"')
      .replace(/^port = 54321$/m, 'port = 57662')
      .replace(/^port = 54322$/m, 'port = 57660')
      .replace(/^shadow_port = 54320$/m, 'shadow_port = 57661');
    assert(config.includes('[db.seed]\nenabled = false\nsql_paths = []'));
    assert(!/^\[(?:remotes|db\.vault|edge_runtime\.secrets)(?:[.\]])/m.test(config));
    writeFileSync(join(supabase, 'config.toml'), config, { mode: 0o600, flag: 'wx' });
    assert.deepEqual(readdirSync(work), ['supabase']);
    assert.deepEqual(readdirSync(supabase).sort(), ['config.toml', 'migrations']);
    assert.deepEqual(readdirSync(join(supabase, 'migrations')), []);
    const created = Date.now();
    started = true;
    try {
      cli(['start', '--workdir', work, '--exclude', excluded], 240_000);
    } catch (error) {
      throw Error(startupReason(error));
    }

    const inspect = target => JSON.parse(docker(['inspect', target]))[0];
    const info = inspect(name);
    const container = info.Id;
    step('exact-cli-image-binding');
    assert(/^(?:ghcr\.io|public\.ecr\.aws)\/supabase\/postgres:17\.6\.1\.143$/.test(info.Config.Image),
      'CLI_IMAGE_TAG_MISMATCH');
    assert.equal(info.Image, metadata.Id, 'CLI_IMAGE_ID_MISMATCH');

    function attest(state, isolated) {
      assert(/^[0-9a-f]{64}$/.test(container) && state.Id === container && state.Name === '/' + name &&
        state.Config.Labels['com.supabase.cli.project'] === project && Date.parse(state.Created) >= created &&
        state.Image === imageId, 'CLI_CONTAINER_IDENTITY_MISMATCH');
      assert(state.State.Running, 'CLI_CONTAINER_NOT_RUNNING');
      const mode = state.HostConfig.NetworkMode;
      assert(typeof mode === 'string' && mode !== 'host' && !mode.startsWith('container:') &&
        state.HostConfig.Privileged === false, 'CLI_CONTAINER_IDENTITY_MISMATCH');
      assert(state.Mounts.every(mount => mount.Type === 'volume' || mount.Type === 'tmpfs'), 'CLI_UNEXPECTED_MOUNT');
      if (isolated) assert.deepEqual(Object.keys(state.NetworkSettings.Networks), [], 'CLI_NETWORK_NOT_DETACHED');
    }
    step('disconnect-then-attest');
    attest(info, false);
    for (const network of Object.keys(info.NetworkSettings.Networks)) {
      docker(['network', 'disconnect', network, container]);
    }
    attest(inspect(container), true);

    function client(args, input) {
      attest(inspect(container), true);
      return docker(['exec', '-i', container, 'env', '-i', 'PATH=' + clientPath,
        'PGSERVICEFILE=/dev/null', ...args], input, 180_000);
    }
    const sql = (body, role = 'postgres', database = 'postgres') => {
      assert(['postgres', 'supabase_admin', 'service_role'].includes(role));
      assert(['postgres', 'qualification_wrong_target'].includes(database));
      const asService = role === 'service_role';
      return client(['psql', '-X', '-w', '-qAt', '-h', socket, '-p', '5432',
        '-U', asService ? 'postgres' : role, '-d', database, '-v', 'ON_ERROR_STOP=1',
        '-v', 'VERBOSITY=verbose', '-f', '-'],
      (asService ? 'set role service_role;\n' : '') + body + '\n').trim();
    };
    const dump = flags => client(['pg_dump', '-w', '-h', socket, '-p', '5432', '-U', 'postgres',
      '-d', 'postgres', '--restrict-key=SourceOnlyComparisonV1', ...flags]);

    step('disable-schedulers');
    try {
      sql("alter system set cron.launch_active_jobs=off;select pg_reload_conf();", 'supabase_admin');
    } catch (error) {
      if (/No such file or directory|Connection refused/.test(String(error.stderr ?? ''))) {
        throw Error('MANAGED_SOCKET_UNAVAILABLE');
      }
      throw error;
    }
    let fenced = false;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (sql("select current_setting('cron.launch_active_jobs');") === 'off') {
        fenced = true;
        break;
      }
      await pause(100);
    }
    assert(fenced, 'SCHEDULER_NOT_FENCED');
    step('managed-prerequisites');
    assert.equal(sql(bootstrapCheck), 't', 'MANAGED_PREREQUISITES_MISSING');
    const install = verifyBlob(readFileSync(join(dir, 'campaign-install.fixture.sql')),
      '905a3ca4599893b41fe733151cd4a74590032168');
    result = await qualifyTransaction({ root, sql, dump, install, onStage: step });
    attest(inspect(container), true);
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      if (started) {
        try { cli(['stop', '--workdir', work, '--no-backup'], 60_000); }
        catch {
          if (!failed) throw Error('CLI_CLEANUP_FAILED');
          console.error(JSON.stringify({ status: 'FAILED', stage: 'cleanup', reason: 'CLI_CLEANUP_FAILED', ...closed }));
        }
      }
    } finally {
      rmSync(privateDir, { recursive: true, force: true });
    }
  }
  console.log(JSON.stringify({ status: 'PASS', sourceCommit: source, fixtureCommit: fixture, carrierCommit: head,
    image, imageId, supabaseCli: '2.109.1', attachedNetworks: 0, ...closed, ...result }));
}

try {
  await run();
} catch (error) {
  // Use bounded stage and SQLSTATE labels, never a Docker command line or raw SQL.
  const state = String(error.stderr ?? '').match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];
  const sqlState = ['P0001','42501','42P01','42703','42883','42702','23514','22023','42601','55P03','57014'].includes(state)
    ? state : undefined;
  const label = String(error.message).split('\n')[0];
  console.error(JSON.stringify({ status: 'FAILED', stage, sqlState,
    reason: safeReasons.has(label) ? label : 'ASSERTION_OR_COMMAND', ...closed }));
  process.exitCode = 1;
}
