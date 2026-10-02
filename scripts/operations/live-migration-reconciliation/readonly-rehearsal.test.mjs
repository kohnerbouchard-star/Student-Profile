import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = 'scripts/operations/live-migration-reconciliation';
const helper = path.resolve(root, 'capture-rehearsal-snapshot.sh');
const workflow = readFileSync('.github/workflows/phase15-readonly-rehearsal.yml', 'utf8');
test('manual qualification cannot restore held jobs or publish release certificates', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /(?:push|pull_request|schedule|workflow_run|workflow_call):/);
  assert.match(workflow, /github.run_attempt == 1/);
  assert.match(workflow, /event=workflow_dispatch&per_page=2/);
  assert.match(workflow, /\.total_count == 1 and \.workflow_runs\[0\].id == \$id/);
  assert.match(workflow, /contents: read\n  actions: read/);
  assert.match(workflow, /secrets.SUPABASE_DB_URL/);
  assert.doesNotMatch(workflow, /secrets.(?:SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD)/);
  assert.match(workflow, /releaseCertificate: false/);
  assert.match(workflow, /path: \$\{\{ runner.temp \}\}\/u1\/sanitized\/result.json/);
  assert.match(workflow, /eecvbssdvarfcykcfrny/);
  assert.match(workflow, /cgiukdjwicykrmtkhudh/);
  const capture = readFileSync(helper, 'utf8');
  assert.match(capture, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(capture, /pg_dump --snapshot="\$snapshot"/);
  assert.match(capture, /idle_in_transaction_session_timeout=180000/);
});

test('shared snapshot survives concurrent DDL/ledger changes and fails on exporter loss', {
  skip: !process.env.REF032_PG_BIN && 'Set REF032_PG_BIN for disposable PostgreSQL qualification',
}, () => {
  const bin = process.env.REF032_PG_BIN;
  const temp = mkdtempSync(path.join(tmpdir(), 'ref032-snapshot-'));
  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, PGHOST: temp,
    PGPORT: '55438', PGDATABASE: 'postgres', PGUSER: process.env.USER,
    PHASE15_VERSIONS: '20260921044500' };
  const run = (name, args, extra = {}) => execFileSync(path.join(bin, name), args, { env, ...extra });
  const sql = (query) => run('psql', ['-XqAt', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' });
  try {
    run('initdb', ['-D', `${temp}/db`, '-A', 'trust', '--no-locale']);
    run('pg_ctl', ['-D', `${temp}/db`, '-l', `${temp}/server.log`, '-o', `-k ${temp} -p 55438 -h ''`, '-w', 'start']);
    sql("create schema private; create schema economy_private; create schema supabase_migrations; create table public.before_snapshot(id int); create table supabase_migrations.schema_migrations(version text,name text,statements text[]); insert into supabase_migrations.schema_migrations values ('20260921044500','before',array['select 1;']);");
    mkdirSync(`${temp}/shim`);
    const wrapper = (query) => writeFileSync(`${temp}/shim/pg_dump`, `#!/bin/bash\nset -eu\nPGOPTIONS= PGAPPNAME=fixture-writer '${bin}/psql' -XqAt -v ON_ERROR_STOP=1 -c "${query}" >/dev/null\nexec '${bin}/pg_dump' "$@"\n`, { mode: 0o700 });
    const capture = (dir) => spawnSync('bash', [helper, `${temp}/${dir}`], {
      env: { ...env, PATH: `${temp}/shim:${env.PATH}` }, encoding: 'utf8', timeout: 20000,
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
