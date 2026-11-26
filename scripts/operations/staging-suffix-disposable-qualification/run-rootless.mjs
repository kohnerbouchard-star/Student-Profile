// Only for the local disposable qualification. This driver has no hosted target.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import {
  closeSync, cpSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, realpathSync,
  rmSync, statSync, writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qualifyTransaction } from './transaction.mjs';
import { loadBatch } from '../staging-suffix-qualification/compiler.mjs';
import { renderGuardedBatch } from '../staging-suffix-apply/manual.mjs';

const candidate = 'f04d410fe6566e66920316ae0600f808fe4569f2';
const platform = 'sha256:b021e96054128399f84f24e39d29c21ee7c7169515e5d9e4e99ff15d5043d1d8';
const imageConfig = 'sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a';
const extractorDigest = '4406d5ea5dff7ad92982f592e80ad665eb90318e083b1adb57083528bd19fa84';
const templates = [
  ['schema.sql', 'dee166ae58a4b1f77b650d8e72f8a249e5918ce5'],
  ['webhook.sql', '52cd0974730ae10f04cc50d5915c167cbe1b064c'],
  ['_supabase.sql', '6e5d8487bad85c83a9ebdf18629bdbf9996c376c'],
];
const sourceDir = dirname(fileURLToPath(import.meta.url));
const root = fileURLToPath(new URL('../../../', import.meta.url));
const hostEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', LC_ALL: 'C' };
const closed = { syntheticOnly: true, releaseQualified: false, applyAuthorized: false, liveEvidenceIssued: false };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const native = (file, args, { preserveBytes = false, ...opts } = {}) => {
  const output = execFileSync(file, args, {
    cwd: root, env: hostEnv, encoding: 'utf8', timeout: 30_000, maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'], ...opts,
  });
  return preserveBytes ? output : output.trim();
};
const digest = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const gitBlob = bytes => digest(Buffer.concat([Buffer.from('blob ' + bytes.length + '\0'), bytes]), 'sha1');

function readFixture(path, blob) {
  const bytes = readFileSync(path);
  assert.equal(gitBlob(bytes), blob, 'FIXTURE_BLOB_DRIFT');
  return bytes.toString('utf8');
}

function inspectImage(layout) {
  const index = JSON.parse(readFileSync(join(layout, 'index.json'), 'utf8'));
  assert.equal(index.manifests.length, 1);
  const [descriptor] = index.manifests;
  assert.equal(descriptor.digest, platform);
  assert.deepEqual(descriptor.platform, { architecture: 'amd64', os: 'linux' });
  assert.equal(descriptor.annotations['org.opencontainers.image.ref.name'], 'qualification');
  const blob = entry => {
    assert.match(entry.digest, /^sha256:[a-f0-9]{64}$/);
    const path = join(layout, 'blobs/sha256', entry.digest.slice(7));
    assert(statSync(path).isFile());
    const bytes = readFileSync(path);
    assert.equal(bytes.length, entry.size, 'OCI_BLOB_SIZE');
    assert.equal('sha256:' + digest(bytes), entry.digest, 'OCI_BLOB_DIGEST');
    return bytes;
  };
  const manifest = JSON.parse(blob(descriptor));
  assert.equal(manifest.config.digest, imageConfig);
  const image = JSON.parse(blob(manifest.config));
  assert.equal(image.architecture, 'amd64');
  assert.equal(image.os, 'linux');
  assert.deepEqual(image.config.Entrypoint, ['docker-entrypoint.sh']);
  assert.deepEqual(image.config.Cmd, ['postgres', '-D', '/etc/postgresql']);
  for (const layer of manifest.layers) blob(layer);
  return image.config.Env.flatMap(value => {
    const at = value.indexOf('=');
    assert(at > 0);
    return ['--setenv', value.slice(0, at), value.slice(at + 1)];
  });
}

const managedBootstrap = `select json_build_object(
  'server17',current_setting('server_version_num')::integer between 170000 and 179999,
  'extensionsAvailable',(select count(distinct name)=4 from pg_available_extensions
    where name in ('pg_cron','pg_net','pgcrypto','supabase_vault')),
  'authUsers',to_regclass('auth.users') is not null,'authSessions',to_regclass('auth.sessions') is not null,
  'authFactors',to_regclass('auth.mfa_factors') is not null,'authUid',to_regprocedure('auth.uid()') is not null,
  'authJwt',to_regprocedure('auth.jwt()') is not null,'authRole',to_regprocedure('auth.role()') is not null,
  'storageSchema',to_regnamespace('storage') is not null,'storageObjects',to_regclass('storage.objects') is not null,
  'roles',(select count(*)=5 from pg_roles where rolname in ('postgres','supabase_admin','service_role','anon','authenticated')),
  'noListener',current_setting('listen_addresses') = '',
  'schedulerDisabled',current_setting('cron.launch_active_jobs')='off');`;

let stage = 'local-argument-and-source-binding';
const onStage = value => {
  stage = value;
  console.log(JSON.stringify({ stage, status: 'RUNNING', ...closed }));
};

async function run() {
  assert.equal(process.platform, 'linux');
  assert.equal(process.arch, 'x64');
  assert(process.getuid() > 0);
  const guardOnly = process.argv[4] === '--guard-only';
  assert.equal(process.argv.length, guardOnly ? 5 : 4, 'Use run-rootless.mjs OCI_LAYOUT VERIFIED_UMOCI [--guard-only]');
  assert(!process.env.GITHUB_ACTIONS, 'LOCAL_DISPOSABLE_EXECUTION_ONLY');
  assert.equal(native('/usr/bin/git', ['rev-parse', candidate]), candidate);
  native('/usr/bin/git', ['diff', '--exit-code', candidate, '--', 'backend/supabase', '.github/workflows',
    'scripts/operations/staging-suffix-apply', 'scripts/operations/staging-recovery-evidence',
    'scripts/operations/staging-suffix-qualification', 'scripts/operations/live-migration-reconciliation',
    'docs/operations/evidence/staging-suffix-apply-v1']);
  const [layout, umoci] = process.argv.slice(2, 4).map(file => realpathSync(file));
  assert.equal(digest(readFileSync(umoci)), extractorDigest);
  onStage('pinned-image-identity');
  const imageEnv = inspectImage(layout);
  const install = readFixture(join(sourceDir, 'campaign-install.fixture.sql'), '905a3ca4599893b41fe733151cd4a74590032168');
  const work = mkdtempSync(join(dirname(layout), 'econovaria-suffix-managed-'));
  let db;
  let dbClosed;
  let runError;
  try {
    onStage('private-rootless-image');
    const bundle = join(work, 'bundle');
    native(umoci, ['unpack', '--rootless', '--image', layout + ':qualification', bundle], { timeout: 180_000 });
    onStage('private-runtime-mounts');
    const image = join(bundle, 'rootfs');
    const config = join(work, 'config');
    const settings = join(work, 'custom');
    const socket = join(work, 'socket');
    const data = join(work, 'data');
    for (const directory of [socket, data]) mkdirSync(directory, { mode: 0o700 });
    cpSync(join(image, 'etc/postgresql'), config, { recursive: true, verbatimSymlinks: true });
    cpSync(join(image, 'etc/postgresql-custom'), settings, { recursive: true, verbatimSymlinks: true });
    const settingsFile = join(config, 'postgresql.conf');
    writeFileSync(settingsFile, readFileSync(settingsFile, 'utf8') +
      "\nlisten_addresses = ''\ncron.launch_active_jobs = off\n");
    writeFileSync(join(settings, 'pgsodium_root.key'), randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
    // The CLI creates this path before invoking the image entry point.
    writeFileSync(join(image, 'etc/postgresql.schema.sql'), '', { flag: 'wx', mode: 0o600 });
    const bootstrap = join(work, 'postgresql.schema.sql');
    const cliPath = join(dirname(layout), 'cli-v2.109.1');
    const bootstrapText = guardOnly ? '' : templates.map(([name, blob]) => readFixture(join(cliPath, name), blob)).join('\n');
    writeFileSync(bootstrap, bootstrapText, { mode: 0o600 });
    const namespace = [
      '--user', '--map-user=100', '--map-group=101', '--net', '--',
      '/usr/bin/bwrap', '--unshare-pid', '--die-with-parent',
      '--ro-bind', image, '/', '--dev', '/dev', '--tmpfs', '/dev/shm', '--proc', '/proc',
      '--tmpfs', '/tmp', '--bind', socket, '/run/postgresql',
      '--bind', data, '/var/lib/postgresql/data', '--ro-bind', config, '/etc/postgresql',
      '--ro-bind', settings, '/etc/postgresql-custom', '--ro-bind', bootstrap, '/etc/postgresql.schema.sql',
      '--clearenv', ...imageEnv, '--setenv', 'PGSERVICEFILE', '/dev/null',
    ];
    const runInside = (args, opts) => native('/usr/bin/unshare', [...namespace, ...args], opts);
    const hostNetwork = readlinkSync('/proc/self/ns/net');
    const sandboxNetwork = runInside(['/bin/sh', '-c', 'readlink /proc/self/ns/net']);
    assert.match(sandboxNetwork, /^net:\[[0-9]+\]$/);
    assert.notEqual(sandboxNetwork, hostNetwork, 'NETWORK_NAMESPACE_NOT_ISOLATED');
    assert.equal(runInside(['/bin/sh', '-c', 'id -u; postgres --version']), '100\npostgres (PostgreSQL) 17.6');


    if (guardOnly) {
      onStage('pinned-postgresql-wrong-database-guard');
      runInside(['initdb', '--no-sync', '-D', '/var/lib/postgresql/data', '-U', 'postgres', '--auth-local=trust',
        '--auth-host=reject', '--locale-provider=icu', '--icu-locale=en_US.UTF-8', '--encoding=UTF8'], { timeout: 60_000 });
      const rows = await loadBatch(root);
      const operation = {
        baselineSha256: '0'.repeat(64), campaignEpoch: '00000000-0000-4000-8000-000000000001',
        writerEpoch: '00000000-0000-4000-8000-000000000002', admissionEpoch: '00000000-0000-4000-8000-000000000003',
      };
      const rendered = renderGuardedBatch(rows, operation);
      const boundary = 'end $stage_ledger$;';
      assert.equal(rendered.split(boundary).length, 3);
      assert(rendered.startsWith('\\set ON_ERROR_STOP on\n'));
      // The actual first transaction guard is the only SQL under test here.
      // Single-user mode has no psql directives or client/worker concurrency.
      const guardSql = rendered.slice('\\set ON_ERROR_STOP on\n'.length, rendered.indexOf(boundary) + boundary.length);
      const input = [
        'create schema supabase_migrations;',
        'create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);',
        guardSql,
        'rollback;',
        "select case when count(*)=0 then 'QUALIFICATION_WRONG_TARGET_LEDGER_UNCHANGED' else 'DIRTY_LEDGER' end from supabase_migrations.schema_migrations;",
      ].join('\n\n') + '\n\n';
      const probe = spawnSync('/usr/bin/unshare', [...namespace, 'postgres', '--single', '-D',
        '/var/lib/postgresql/data', '-j', '-c', 'log_error_verbosity=verbose', 'template1'], {
        cwd: root, env: hostEnv, encoding: 'utf8', input, timeout: 30_000, maxBuffer: 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      assert.ifError(probe.error);
      assert.equal(probe.status, 0, 'SINGLE_USER_ENGINE_FAILED');
      assert.match(probe.stderr, /ERROR:\s+P0001:\s+STAGING_PRIMARY_OR_OPERATOR_UNVERIFIED/);
      assert.equal((probe.stderr.match(/ERROR:/g) ?? []).length, 1);
      assert.match(probe.stdout, /QUALIFICATION_WRONG_TARGET_LEDGER_UNCHANGED/);
      console.log(JSON.stringify({ status: 'PASS', stage, sourceCommit: candidate, managedPlatform: platform,
        managedConfig: imageConfig, ...closed, sqlState: 'P0001', databaseGuard: true,
        wrongDatabaseLedgerUnchanged: true, fullTransaction: 'NOT_RUN' }));
      return;
    }

    const psql = ['psql', '-X', '-w', '-qAt', '-h', '/var/run/postgresql',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'];
    const sql = (text, role = 'postgres', database = 'postgres') => {
      assert(['postgres', 'supabase_admin', 'service_role'].includes(role));
      assert(['postgres', 'qualification_wrong_target'].includes(database));
      const fixtureRole = role === 'service_role';
      return runInside([...psql, '-U', fixtureRole ? 'postgres' : role, '-d', database, '-f', '-'],
        { input: (fixtureRole ? 'set role service_role;\n' : '') + text + '\n',
          stdio: ['pipe', 'pipe', 'pipe'], timeout: 180_000 });
    };
    const dump = options => {
      assert(options.length <= 1 && options.every(option => ['--schema-only', '--data-only'].includes(option)));
      return runInside(['pg_dump', '-h', '/var/run/postgresql', '-w', '-U', 'postgres', '-d', 'postgres',
        '--restrict-key=SourceOnlyComparisonV1', ...options], { timeout: 180_000, preserveBytes: true });
    };

    onStage('managed-baseline-bootstrap');
    const logPath = join(work, 'postgres.log');
    // Values are random and disposable and are kept inside the new namespace.
    const log = openSync(logPath, 'wx', 0o600);
    db = spawn('/usr/bin/unshare', [...namespace,
      '--setenv', 'POSTGRES_PASSWORD', randomBytes(24).toString('hex'),
      '--setenv', 'JWT_SECRET', randomBytes(32).toString('hex'), '--setenv', 'JWT_EXP', '3600',
      '/bin/sh', '-c', 'test "$(readlink /proc/self/ns/net)" != "$1" && exec docker-entrypoint.sh postgres -D /etc/postgresql',
      'isolated-start', hostNetwork], { env: hostEnv, stdio: ['ignore', log, log] });
    closeSync(log);
    dbClosed = new Promise(resolve => db.once('close', resolve));
    const deadline = Date.now() + 120_000;
    let ready = false;
    while (Date.now() < deadline && db.exitCode === null && db.signalCode === null) {
      if (readFileSync(logPath, 'utf8').includes('PostgreSQL init process complete; ready for start up.')) {
        try { ready = sql('select 1;') === '1'; } catch {}
        if (ready) break;
      }
      await delay(250);
    }
    if (!ready) {
      const tail = readFileSync(logPath, 'utf8').split('\n').slice(-40);
      for (const line of tail) if (/\b(?:ERROR|FATAL|PANIC|could not|failed|Permission denied)\b/i.test(line)) {
        console.error(line.replace(/["'][^"']*["']/g, '[value]').slice(0, 250));
      }
      throw Error('MANAGED_BOOTSTRAP_DID_NOT_FINISH');
    }
    const boot = JSON.parse(sql(managedBootstrap, 'supabase_admin'));
    for (const [name, passed] of Object.entries(boot)) assert.equal(passed, true, 'MANAGED_BOOTSTRAP_' + name);
    assert.equal(sql("select current_database()||'/'||current_user;"), 'postgres/postgres');
    const evidence = await qualifyTransaction({ root, sql, dump, install, onStage });
    console.log(JSON.stringify({ status: 'PASS', sourceCommit: candidate, managedPlatform: platform,
      managedConfig: imageConfig, bootstrap: boot, ...closed, ...evidence }));
  } catch (error) {
    runError = error;
    throw error;
  } finally {
    if (db && db.exitCode === null && db.signalCode === null) {
      db.kill('SIGTERM');
      const shutdown = setTimeout(() => db.kill('SIGKILL'), 5000);
      await dbClosed;
      clearTimeout(shutdown);
    }
    try {
      // The immutable Nix store inside the private unpack contains read-only directories.
      native('/usr/bin/find', [work, '-type', 'd', '-exec', '/usr/bin/chmod', 'u+wx', '{}', '+']);
      rmSync(work, { recursive: true, force: true });
    } catch (error) {
      if (!runError) throw error;
      console.error('DISPOSABLE_WORK_DIRECTORY_CLEANUP_FAILED');
    }
  }
}

try {
  await run();
} catch (error) {
  const sqlState = String(error.stderr ?? '').match(/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):\s+(.+)\n/)?.slice(1);
  const fact = String(error.message).split('\n')[0];
  const diagnostic = !sqlState ? String(error.stderr ?? '').split('\n').find(line => /^(?:bwrap:|unshare:|.*(?:permission denied|no space left on device|type: fatal))/i.test(line)) : undefined;
  console.error(JSON.stringify({ status: 'FAILED', stage, reason: fact.slice(0, 250),
    ...(sqlState ? { sqlState: sqlState[0], localError: sqlState[1].slice(0, 250) } : {}),
    ...(diagnostic ? { sandboxError: diagnostic.slice(0, 250) } : {}), ...closed }));
  process.exitCode = 1;
}
