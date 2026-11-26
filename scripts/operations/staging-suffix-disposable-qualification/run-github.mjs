// GitHub-hosted disposable fixture. The database container starts without a network.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualifyTransaction } from './transaction.mjs';
import { STAGING_REPOSITORY, STAGING_REPOSITORY_ID } from '../staging-recovery-evidence/owner-approval.mjs';

const source = 'f04d410fe6566e66920316ae0600f808fe4569f2';
const fixture = 'c4b8f0c86d595e34d2b676f5e63288db52f05b91';
const ref = 'refs/heads/chore/staging-suffix-disposable-ci-20261126';
const image = 'ghcr.io/supabase/postgres@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453';
const imageId = 'sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a';
const socket = '/var/run/postgresql';
const clientPath = '/usr/lib/postgresql/bin:/usr/bin:/bin';
const dir = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const baseEnv = { PATH: '/usr/bin:/bin', LC_ALL: 'C' };
const closed = { syntheticOnly: true, releaseQualified: false, applyAuthorized: false, liveEvidenceIssued: false };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const suffix = randomBytes(10).toString('hex');
const name = 'econovaria_suffix_fixture_' + suffix;
const allowedChanges = [
  '.github/workflows/staging-suffix-disposable-ci.yml',
  'docs/roadmaps/econovaria-beta-completion-roadmap-v1.md',
  'scripts/operations/staging-suffix-disposable-qualification/run-github.mjs',
  'vercel.json',
].sort();

const templates = [
  ['schema.sql', 'dee166ae58a4b1f77b650d8e72f8a249e5918ce5'],
  ['webhook.sql', '52cd0974730ae10f04cc50d5915c167cbe1b064c'],
  ['_supabase.sql', '6e5d8487bad85c83a9ebdf18629bdbf9996c376c'],
];
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
  assert.equal(git('rev-parse', 'HEAD^'), fixture);
  assert.equal(git('rev-parse', 'HEAD^^'), source);
  assert.deepEqual(git('diff', '--name-only', fixture, head).split('\n').sort(), allowedChanges);
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
  assert.equal(JSON.parse(readFileSync(join(root, 'docs/operations/evidence/staging-suffix-apply-v1/qualification.json'))).status, 'NOT_RUN');
  return head;
}

async function bootstrapSql() {
  const base = 'https://raw.githubusercontent.com/supabase/cli/v2.109.1/apps/cli-go/internal/db/start/templates/';
  const sources = [];
  for (const [file, blob] of templates) {
    const response = await fetch(base + file, { redirect: 'error', signal: AbortSignal.timeout(20_000) });
    assert.equal(response.status, 200, 'PUBLIC_CLI_TEMPLATE_UNAVAILABLE');
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length > 0 && bytes.length < 32 * 1024, 'CLI_TEMPLATE_SIZE');
    sources.push(verifyBlob(bytes, blob));
  }
  return sources.join('\n');
}

const bootstrapCheck = [
 "select current_database()='postgres'",
 "and current_user='supabase_admin'",
 "and current_setting('server_version_num')::int=170006",
 "and current_setting('listen_addresses')=''",
 "and current_setting('cron.launch_active_jobs')='off'",
 "and to_regclass('auth.users') is not null and to_regclass('auth.sessions') is not null",
 "and to_regclass('auth.mfa_factors') is not null and to_regclass('storage.objects') is not null",
 "and to_regprocedure('auth.uid()') is not null and to_regprocedure('auth.jwt()') is not null",
 "and to_regprocedure('auth.role()') is not null",
 "and (select count(*)=5 from pg_roles where rolname in ('postgres','supabase_admin','service_role','anon','authenticated'))",
 "and (select count(distinct name)=4 from pg_available_extensions where name in ('pg_cron','pg_net','pgcrypto','supabase_vault'));",
].join(' ');

let stage = 'exact-push-and-source';
const step = value => {
  stage = value;
  console.log(JSON.stringify({ stage, status: 'RUNNING', ...closed }));
};

async function run() {
  const head = githubContext();
  const privateDir = mkdtempSync(join(process.env.RUNNER_TEMP, 'suffix-db-'));
  let created = false;
  let cleaned = false;
  const dockerConfig = join(privateDir, 'docker');
  const docker = (args, input, timeout) => execute('docker',
    ['--host=unix:///var/run/docker.sock', '--config=' + dockerConfig, ...args],
    { ...baseEnv, HOME: privateDir }, input, timeout);
  try {
    mkdirSync(dockerConfig, { mode: 0o700 });
    step('verify-public-bootstrap');
    const schema = join(privateDir, 'bootstrap.sql');
    const key = join(privateDir, 'local-key');
    writeFileSync(schema, await bootstrapSql(), { mode: 0o644 });
    writeFileSync(key, randomBytes(32).toString('hex') + '\n', { mode: 0o444 });
    const install = verifyBlob(readFileSync(join(dir, 'campaign-install.fixture.sql')),
      '905a3ca4599893b41fe733151cd4a74590032168');

    step('pinned-managed-image');
    docker(['pull', '--platform=linux/amd64', image], undefined, 180_000);
    const [metadata] = JSON.parse(docker(['image', 'inspect', image]));
    assert.equal(metadata.Id, imageId);
    assert.equal(metadata.Os, 'linux');
    assert.equal(metadata.Architecture, 'amd64');

    step('start-network-none');
    // Create first to check the sandbox before the image may execute.
    const container = docker(['create', '--name', name, '--label=org.econovaria.fixture=' + suffix,
      '--platform=linux/amd64', '--network=none', '--security-opt=no-new-privileges',
      '--mount=type=bind,src=' + schema + ',dst=/etc/postgresql.schema.sql,readonly',
      '--mount=type=bind,src=' + key + ',dst=/etc/postgresql-custom/pgsodium_root.key,readonly',
      '-e', 'POSTGRES_PASSWORD=' + randomBytes(24).toString('hex'),
      '-e', 'JWT_SECRET=' + randomBytes(32).toString('hex'), '-e', 'JWT_EXP=3600',
      image, 'postgres', '-D', '/etc/postgresql', '-c', 'listen_addresses=', '-c', 'cron.launch_active_jobs=off',
    ]).trim();
    created = true;
    assert.match(container, /^[0-9a-f]{64}$/);
    function attest() {
      const [state] = JSON.parse(docker(['inspect', container]));
      assert.equal(state.Id, container);
      assert.equal(state.Name, '/' + name);
      assert.equal(state.Image, imageId);
      assert.equal(state.HostConfig.NetworkMode, 'none');
      assert.equal(state.HostConfig.Privileged, false);
      assert.equal(state.HostConfig.PublishAllPorts, false);
      assert.deepEqual(state.HostConfig.PortBindings ?? {}, {});
      assert(Object.keys(state.NetworkSettings.Networks ?? {}).every(value => value === 'none'));
      const binds = state.Mounts.filter(mount => mount.Type === 'bind');
      assert.deepEqual(binds.map(mount => [mount.Source, mount.Destination, mount.RW]).sort(),
        [[schema, '/etc/postgresql.schema.sql', false], [key, '/etc/postgresql-custom/pgsodium_root.key', false]].sort());
      return state.State.Running;
    }
    assert.equal(attest(), false);
    docker(['start', container]);
    assert.equal(attest(), true);

    function client(args, input) {
      return docker(['exec', '-i', '--user=100:101', container, 'env', '-i', 'PATH=' + clientPath,
        'PGSERVICEFILE=/dev/null', ...args], input, 180_000);
    }
    const sql = (body, role = 'postgres', database = 'postgres') => {
      assert(['postgres', 'supabase_admin', 'service_role'].includes(role));
      assert(['postgres', 'qualification_wrong_target'].includes(database));
      const asService = role === 'service_role';
      return client(['psql', '-X', '-w', '-qAt', '-h', socket, '-U', asService ? 'postgres' : role,
        '-d', database, '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-f', '-'],
      (asService ? 'set role service_role;\n' : '') + body + '\n').trim();
    };
    const dump = flags => client(['pg_dump', '-w', '-h', socket, '-U', 'postgres', '-d', 'postgres',
      '--restrict-key=SourceOnlyComparisonV1', ...flags]);

    step('managed-bootstrap');
    let ready = false;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      assert.equal(attest(), true, 'MANAGED_POSTGRES_EXITED');
      if (docker(['logs', container]).includes('PostgreSQL init process complete; ready for start up.')) {
        try { ready = sql(bootstrapCheck, 'supabase_admin') === 't'; } catch {}
      }
      if (ready) break;
      await pause(1000);
    }
    assert.equal(ready, true, 'PINNED_MANAGED_BOOTSTRAP_NOT_READY');
    const result = await qualifyTransaction({ root, sql, dump, install, onStage: step });
    assert.equal(attest(), true);
    docker(['rm', '-fv', container]);
    cleaned = true;
    console.log(JSON.stringify({ status: 'PASS', sourceCommit: source, fixtureCommit: fixture, carrierCommit: head,
      image, imageId, networkMode: 'none', ...closed, ...result }));
  } finally {
    try {
      if (created && !cleaned) docker(['rm', '-fv', name]);
    } finally {
      rmSync(privateDir, { recursive: true, force: true });
    }
  }
}

try {
  await run();
} catch (error) {
  // Use bounded stage and SQLSTATE labels, never a Docker command line or raw SQL.
  const sqlState = String(error.stderr ?? '').match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/)?.[1];
  const label = String(error.message).split('\n')[0];
  console.error(JSON.stringify({ status: 'FAILED', stage, sqlState,
    reason: /^[A-Z_]{6,80}$/.test(label) ? label : 'ASSERTION_OR_COMMAND', ...closed }));
  process.exitCode = 1;
}
