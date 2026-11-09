import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { validateDatabaseUrlProjectRef } from '../../release-integrity/database-binding.mjs';

const root = 'scripts/operations/live-migration-reconciliation';
const helper = path.resolve(root, 'capture-rehearsal-snapshot.sh');
const workflow = readFileSync('.github/workflows/phase15-readonly-rehearsal.yml', 'utf8');
test('manual qualification cannot restore held jobs or publish release certificates', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /(?:push|pull_request|schedule|workflow_run|workflow_call):/);
  assert.match(workflow, /github.run_attempt == 1/);
  assert.match(workflow, /event=workflow_dispatch&per_page=2/);
  assert.match(workflow, /test "\$GITHUB_RUN_ATTEMPT" = 1/);
  assert.doesNotMatch(workflow, /matrix|environment: production/);
  assert.match(workflow, /environment: staging/);
  assert.match(workflow, /contents: read\n  actions: read/);
  assert.match(workflow, /secrets.SUPABASE_DB_URL/);
  assert.doesNotMatch(workflow, /secrets.(?:SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)/);
  assert.match(workflow, /releaseCertificate: false/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/u1\/sanitized\/result.json/);
  assert.match(workflow, /eecvbssdvarfcykcfrny/);
  assert.match(workflow, /cgiukdjwicykrmtkhudh/);
  for (const marker of [
    'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
    'test "$APPROVED_SHA" = "$GITHUB_SHA"',
    'test "$(gh api "repos/$GITHUB_REPOSITORY/commits/main" --jq .sha)" = "$GITHUB_SHA"',
    '.head_sha == $sha and .event == "push" and .head_branch == "main" and .conclusion == "success"',
    '.path == ".github/workflows/database-replay.yml"',
    '--name "phase15-clean-replay-$GITHUB_SHA"',
    'PHASE15_EXPECTED_PROJECT_REF: eecvbssdvarfcykcfrny',
    '-e PGSSLMODE=verify-full', 'openssl x509', 'sha256sum scripts/operations/',
    'if: always()\n        run: sudo rm -rf "$RUNNER_TEMP/u1"',
  ]) assert.ok(workflow.includes(marker), `missing safeguard: ${marker}`);
  const capture = readFileSync(helper, 'utf8');
  assert.match(capture, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(capture, /pg_dump --snapshot="\$snapshot"/);
  assert.match(capture, /idle_in_transaction_session_timeout=180000/);
});

test('additional dispatch gate executes fail-closed history and prior-outcome predicates', () => {
  const filters = [...workflow.matchAll(/jq -e(?: --argjson id "\$GITHUB_RUN_ID")? '([\s\S]*?)' "\$RUNNER_TEMP\/(manual-runs|prior-jobs)\.json"/g)];
  assert.equal(filters.length, 2);
  const evaluate = (index, value) => spawnSync('jq', ['-e', '--argjson', 'id', '40000000000', filters[index][1]], {
    input: JSON.stringify(value), encoding: 'utf8',
  }).status;
  const history = { total_count: 2, workflow_runs: [
    { id: 40000000000, run_attempt: 1 },
    { id: 36961759600, run_attempt: 1, event: 'workflow_dispatch', head_branch: 'main',
      path: '.github/workflows/phase15-readonly-rehearsal.yml', status: 'completed', conclusion: 'failure' },
  ] };
  const steps = [
    'Bind approved source and canonical evidence before accessing secrets',
    'Capture once with existing environment access',
    'Restore and rehearse locally without hosted credentials',
    'Retain only bounded qualification results',
    'Remove restricted captures and diagnostics',
  ];
  const jobs = { total_count: 2, jobs: [
    { id: 110696781286, name: 'rehearse (staging, eecvbssdvarfcykcfrny)', conclusion: 'failure' },
    { id: 110696781402, name: 'rehearse (production, cgiukdjwicykrmtkhudh)', conclusion: 'success' },
  ].map((job, index) => ({ ...job, run_id: 36961759600, status: 'completed',
    steps: steps.map((name, i) => ({ name, status: 'completed',
      conclusion: index === 0 && i === 1 ? 'failure' : index === 0 && i === 2 ? 'skipped' : 'success' })),
  })) };
  for (const [index, fixture] of [history, jobs].entries()) {
    assert.equal(evaluate(index, fixture), 0);
    // Every required scalar is independently mandatory and exact (no missing-field defaults).
    const mutate = (value, path = []) => {
      for (const [key, child] of Object.entries(value)) {
        if (child !== null && typeof child === 'object') mutate(child, [...path, key]);
        else for (const replacement of [null, 'unexpected', 3]) {
          const copy = structuredClone(fixture);
          let target = copy;
          for (const part of path) target = target[part];
          target[key] = replacement;
          assert.notEqual(evaluate(index, copy), 0, `${index}:${[...path, key].join('.')}`);
        }
      }
    };
    mutate(fixture);
    assert.notEqual(evaluate(index, {}), 0);
    for (const count of [0, 1, 3, 100]) assert.notEqual(evaluate(index, { ...fixture, total_count: count }), 0);
    const key = index === 0 ? 'workflow_runs' : 'jobs';
    for (const entries of [[], fixture[key].slice(0, 1), [...fixture[key], fixture[key][0]]]) {
      assert.notEqual(evaluate(index, { ...fixture, [key]: entries }), 0);
    }
  }
  const rerun = structuredClone(history);
  rerun.workflow_runs[0].run_attempt = 2;
  assert.notEqual(evaluate(0, rerun), 0);
  rerun.workflow_runs.reverse();
  assert.notEqual(evaluate(0, rerun), 0);
  const duplicate = structuredClone(jobs);
  duplicate.jobs[0].steps.push(duplicate.jobs[0].steps[0]);
  assert.notEqual(evaluate(1, duplicate), 0);
});

test('shared snapshot survives concurrent DDL/ledger changes and fails on exporter loss', {
  skip: !process.env.REF032_PG_BIN && 'Set REF032_PG_BIN for disposable PostgreSQL qualification',
}, () => {
  const bin = process.env.REF032_PG_BIN;
  const temp = mkdtempSync(path.join(tmpdir(), 'ref032-snapshot-'));
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PGHOST: temp,
    PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: process.env.USER,
    PGPASSWORD: 'disposable:pass\\word%42',
    PHASE15_EXPECTED_PROJECT_REF: 'eecvbssdvarfcykcfrny',
    PHASE15_VERSIONS: '20260921044500' };
  const run = (name, args, extra = {}) => execFileSync(path.join(bin, name), args, { env, ...extra });
  const sql = (query) => run('psql', ['-XqAt', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' });
  try {
    writeFileSync(`${temp}/password`, env.PGPASSWORD, { mode: 0o600 });
    run('initdb', ['-D', `${temp}/db`, '-A', 'scram-sha-256', '--pwfile', `${temp}/password`, '--no-locale']);
    run('pg_ctl', ['-D', `${temp}/db`, '-l', `${temp}/server.log`, '-o', `-k ${temp} -p 5432 -h 127.0.0.1`, '-w', 'start']);
    sql("create schema private; create schema economy_private; create schema supabase_migrations; create table public.before_snapshot(id int); create table supabase_migrations.schema_migrations(version text,name text,statements text[]); insert into supabase_migrations.schema_migrations values ('20260921044500','before',array['select 1;']);");
    const uriFailure = spawnSync(path.join(bin, 'psql'), ['-XqAt', '-c', 'select 1'], {
      env: { ...env, PGDATABASE: `postgresql://${env.PGUSER}:disposable-only@localhost:5432/postgres` }, encoding: 'utf8',
    });
    assert.notEqual(uriFailure.status, 0);
    assert.match(uriFailure.stderr, /database .*postgresql:.* does not exist/);
    mkdirSync(`${temp}/u1`);
    const converter = workflow.match(/node --input-type=module - <<'NODE'[^\n]*\n([\s\S]*?)          NODE/)[1];
    const uri = `postgresql://${encodeURIComponent(env.PGUSER)}:${encodeURIComponent(env.PGPASSWORD)}@db.eecvbssdvarfcykcfrny.supabase.co:5432/%70ostgres?host=invalid&options=unsafe`;
    const pooler = execFileSync(process.execPath, ['--input-type=module', '-'], {
      input: converter, env: { ...env, RUNNER_TEMP: temp, PHASE15_REMOTE_DATABASE_URL:
        'postgresql://postgres.eecvbssdvarfcykcfrny:encoded%3Apassword@aws-0-region.pooler.supabase.com:5432/postgres' }, encoding: 'utf8',
    });
    assert.match(pooler, /PGHOST=aws-0-region.pooler.supabase.com/);
    const converted = execFileSync(process.execPath, ['--input-type=module', '-'], {
      input: converter, env: { ...env, RUNNER_TEMP: temp, PHASE15_REMOTE_DATABASE_URL: uri }, encoding: 'utf8',
    });
    // Parse the exact workflow-generated Docker env-file, then use it for both clients.
    const captureEnv = { ...env, ...Object.fromEntries(converted.trim().split('\n').map(line => {
      const split = line.indexOf('=');
      return [line.slice(0, split), line.slice(split + 1)];
    })) };
    delete captureEnv.PGPASSWORD;
    assert.equal(captureEnv.PGHOST, 'db.eecvbssdvarfcykcfrny.supabase.co');
    // Test-only routing keeps this valid DNS identity on our local SCRAM server.
    captureEnv.PGHOSTADDR = '127.0.0.1';
    assert.equal(captureEnv.PGDATABASE, 'postgres');
    assert.equal(converted.includes(env.PGPASSWORD), false);
    assert.equal(statSync(captureEnv.PGPASSFILE).mode & 0o777, 0o600);
    const binding = { expectedProjectRef: 'eecvbssdvarfcykcfrny' };
    for (const databaseUrl of ['postgresql://user:fixture@wrong.invalid/postgres',
      'postgresql://user:fixture@db.eecvbssdvarfcykcfrny.supabase.co/postgres?sslmode=disable']) {
      assert.throws(() => validateDatabaseUrlProjectRef({ ...binding, databaseUrl }));
    }
    for (const host of ['%2Ftmp%2Ffake.pooler.supabase.com', 'db.eecvbssdvarfcykcfrny.supabase.co,evil',
      'fake%5Cname.pooler.supabase.com', 'fake%20name.pooler.supabase.com',
      'fake%0Aname.pooler.supabase.com', 'fake name.pooler.supabase.com', 'wrong.invalid']) {
      rmSync(`${temp}/u1/connection.pgpass`);
      const invalid = spawnSync(process.execPath, ['--input-type=module', '-'], {
        input: converter, env: { ...env, RUNNER_TEMP: temp,
          PHASE15_REMOTE_DATABASE_URL: `postgresql://postgres.eecvbssdvarfcykcfrny:fixture@${host}/postgres` }, encoding: 'utf8',
      });
      assert.notEqual(invalid.status, 0);
      assert.equal(existsSync(`${temp}/u1/connection.pgpass`), false);
      execFileSync(process.execPath, ['--input-type=module', '-'], {
        input: converter, env: { ...env, RUNNER_TEMP: temp, PHASE15_REMOTE_DATABASE_URL: uri },
      });
    }
    mkdirSync(`${temp}/shim`);
    const wrapper = (query) => writeFileSync(`${temp}/shim/pg_dump`, `#!/bin/bash\nset -eu\nPGOPTIONS= PGAPPNAME=fixture-writer '${bin}/psql' -XqAt -v ON_ERROR_STOP=1 -c "${query}" >/dev/null\nexec '${bin}/pg_dump' "$@"\n`, { mode: 0o700 });
    const capture = (dir) => spawnSync('bash', [helper, `${temp}/${dir}`], {
      env: { ...captureEnv, PATH: `${temp}/shim:${env.PATH}` }, encoding: 'utf8', timeout: 20000,
    });
    wrapper("create table public.after_snapshot(id int); update supabase_migrations.schema_migrations set name='after';");
    const first = capture('first');
    assert.equal(first.status, 0, first.stderr);
    const dump = readFileSync(`${temp}/first/schema.sql`, 'utf8');
    assert.match(dump, /CREATE TABLE public.before_snapshot/);
    assert.doesNotMatch(dump, /after_snapshot|^COPY /m);
    assert.equal(JSON.parse(readFileSync(`${temp}/first/ledger.json`, 'utf8'))[0].name, 'before');
    assert.equal(sql('select name from supabase_migrations.schema_migrations').trim(), 'after');
    assert.equal(sql("select count(*) from pg_stat_activity where application_name='ref032-readonly-capture'").trim(), '0');
    if (process.env.REF032_CAPTURE_IMAGE) {
      writeFileSync(`${temp}/connection.env`, converted, { mode: 0o600 });
      execFileSync('docker', ['run', '--rm', '--network=host', '--entrypoint', '/bin/bash',
        '--env-file', `${temp}/connection.env`, '-e', `PHASE15_VERSIONS=${env.PHASE15_VERSIONS}`,
        '-e', 'PATH=/bin', '-e', 'PGHOSTADDR=127.0.0.1', '-v', `${temp}:${temp}`, '-v', `${process.cwd()}:/repo:ro`,
        process.env.REF032_CAPTURE_IMAGE, `/repo/${root}/capture-rehearsal-snapshot.sh`, `${temp}/container`]);
      execFileSync('docker', ['run', '--rm', '--entrypoint', '/bin/chown', '-v', `${temp}:${temp}`,
        process.env.REF032_CAPTURE_IMAGE, '-R', `${process.getuid()}:${process.getgid()}`, `${temp}/container`]);
      assert.equal(JSON.parse(readFileSync(`${temp}/container/ledger.json`, 'utf8'))[0].name, 'after');
    }
    wrapper("select pg_terminate_backend(pid) from pg_stat_activity where application_name='ref032-readonly-capture';");
    const lost = capture('lost');
    assert.notEqual(lost.status, 0);
    assert.equal(existsSync(`${temp}/lost/SHA256SUMS`), false);
    assert.equal(existsSync(`${temp}/lost/schema.sql`), false);
    assert.doesNotMatch(lost.stderr, /FATAL|snapshot.*does not exist/);
    writeFileSync(`${temp}/shim/timeout`, '#!/bin/bash\nshift\nexec /usr/bin/timeout 0.1 "$@"\n', { mode: 0o700 });
    writeFileSync(`${temp}/shim/pg_dump`, '#!/bin/bash\nsleep 2\n', { mode: 0o700 });
    const timed = capture('timed');
    assert.equal(timed.status, 124);
    assert.equal(existsSync(`${temp}/timed/SHA256SUMS`), false);
    assert.equal(sql("select count(*) from pg_stat_activity where application_name='ref032-readonly-capture'").trim(), '0');
  } finally {
    spawnSync(path.join(bin, 'pg_ctl'), ['-D', `${temp}/db`, '-m', 'immediate', '-w', 'stop'], { env });
    rmSync(temp, { recursive: true, force: true });
  }
});
