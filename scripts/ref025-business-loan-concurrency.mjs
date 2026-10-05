import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { openPsqlSession, sqlLiteral } from './business-phase10-atomic-settlement-database-support.mjs';

export function deadline(ms) {
  const end = performance.now() + ms;
  return () => { const left = Math.floor(end - performance.now()); assert(left > 0, 'REF025_DEADLINE'); return left; };
}
export async function exchange(session, sql, remaining) {
  assert(!session.closed, 'REF025_CLOSED');
  const marker = `r${randomUUID().replaceAll('-', '')}`;
  const wait = session.waitFor(`${marker}:done`, remaining());
  wait.catch(() => {});
  session.write(`${sql}\nselect '${marker}:done';`);
  await wait;
  remaining();
  assert.equal(session.errors, '', 'REF025_SQL_ERROR');
}
export async function json(session, expression, remaining) {
  const marker = `r${randomUUID().replaceAll('-', '')}:`;
  await exchange(session, `select '${marker}' || (${expression})::text;`, remaining);
  return JSON.parse(session.output.split('\n').find(line => line.startsWith(marker))?.slice(marker.length));
}
export function intendedBlocker(row, waiter, blocker) {
  assert(row && row.pid === waiter.pid && row.start === waiter.start, 'REF025_WAITER_IDENTITY');
  assert.equal(row.blockerStart, blocker.start, 'REF025_BLOCKER_IDENTITY');
  assert.deepEqual(row.blockers, [blocker.pid], 'REF025_UNEXPECTED_BLOCKER');
  assert.equal(row.wait, 'Lock', 'REF025_NOT_BLOCKED');
}
export async function closeClient(session, remaining) {
  session.closed = true;
  if (session.child.exitCode !== null || session.child.signalCode !== null) return;
  let timer;
  const exited = new Promise((resolve, reject) => {
    session.child.once('exit', resolve);
    timer = setTimeout(() => reject(new Error('REF025_CLIENT_EXIT_TIMEOUT')), remaining());
  });
  session.close();
  try { await exited; } finally { clearTimeout(timer); }
}
function attest() {
  const env = process.env;
  assert(env.GITHUB_ACTIONS === 'true' && env.GITHUB_WORKFLOW === 'banking-fx-clearing-v1' && env.GITHUB_JOB === 'database-acceptance', 'REF025_JOB');
  assert(!env.DOCKER_HOST && !env.DOCKER_CONTEXT && !env.PGSERVICE && !env.PGOPTIONS, 'REF025_OVERRIDE');
  assert.equal(realpathSync('.'), realpathSync(env.GITHUB_WORKSPACE), 'REF025_WORKSPACE');
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH));
  assert.equal(run('git', ['rev-parse', 'HEAD']), event.pull_request?.head.sha || env.GITHUB_SHA);
  const url = new URL(env.DATABASE_URL);
  assert(url.protocol === 'postgresql:' && ['127.0.0.1', 'localhost'].includes(url.hostname) && url.port === '54322' && url.pathname === '/postgres' && !url.search && !url.hash, 'REF025_URL');
  assert.equal(JSON.parse(run('docker', ['context', 'inspect']))[0].Endpoints.docker.Host, 'unix:///var/run/docker.sock');
  const project = readFileSync('backend/supabase/config.toml', 'utf8').match(/^project_id = "([\w-]+)"$/m)?.[1];
  assert(project, 'REF025_PROJECT');
  const container = JSON.parse(run('docker', ['inspect', `supabase_db_${project}`]))[0];
  assert(container.State.Running && /^[a-f0-9]{64}$/.test(container.Id), 'REF025_CONTAINER');
  assert.equal(container.Config.Labels['com.supabase.cli.project'], project);
  assert.match(container.Config.Image, /^(public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.6\.1\.143$/);
  assert(Date.parse(container.Created) >= statSync('.git').mtimeMs, 'REF025_PREEXISTING_CONTAINER');
  assert(container.NetworkSettings.Ports['5432/tcp'].some(p => p.HostPort === '54322'), 'REF025_PORT');
  const args = ['exec', container.Id, 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-c'];
  const identity = `json_build_object('system',(pg_control_system()).system_identifier::text,'database',current_database(),'oid',(select oid from pg_database where datname=current_database()))`;
  const expected = JSON.parse(run('docker', [...args, `select ${identity};`]));
  return { args, identity, expected };
}
async function connect(binding, sessions, remaining) {
  const session = openPsqlSession(`ref025_${randomUUID()}`);
  session.child.on('error', () => {}); // Surface spawn failure through the bounded exchange.
  sessions.push(session);
  const row = await json(session, `(select json_build_object('identity',${binding.identity},'pid',pid,'start',backend_start::text) from pg_stat_activity where pid=pg_backend_pid())`, remaining);
  assert.deepEqual(row.identity, binding.expected, 'REF025_DATABASE_IDENTITY');
  Object.assign(session, { pid: row.pid, start: row.start });
  return session;
}
async function verifyGates(session, remaining) {
  const rows = await json(session, `(select json_agg(json_build_array(c.conname,c.convalidated,pg_get_constraintdef(c.oid)) order by c.conname)
    from pg_constraint c where (c.conrelid,c.conname) in
    (('public.loan_applications'::regclass,'loan_applications_business_liability_disabled_v1'),
     ('public.player_loans'::regclass,'player_loans_business_liability_disabled_v1')))`, remaining);
  assert.deepEqual(rows, ['loan_applications', 'player_loans'].map(t => [`${t}_business_liability_disabled_v1`, true, "CHECK ((liability_kind = 'legacy_v1'::text))"]));
  const versions = readdirSync('backend/supabase/migrations').filter(f => /^\d{14}_.+\.sql$/.test(f)).sort().map(f => f.slice(0, 14));
  assert.deepEqual(await json(session, '(select json_agg(version order by version) from supabase_migrations.schema_migrations)', remaining), versions);
  assert.equal(await json(session, `(select count(*) from public.loan_applications where liability_kind<>'legacy_v1')`, remaining), 0);
  assert.equal(await json(session, `(select count(*) from public.player_loans where liability_kind<>'legacy_v1')`, remaining), 0);
}
export async function lifecycle(mode = '--phase') {
  assert(['--phase', '--verify', '--attest'].includes(mode), 'REF025_MODE');
  const binding = attest(), sessions = [], remaining = deadline(15000);
  let failure;
  try {
    const observer = await connect(binding, sessions, remaining);
    if (mode !== '--attest') await verifyGates(observer, remaining);
    if (mode === '--phase') {
      const first = await connect(binding, sessions, remaining), second = await connect(binding, sessions, remaining);
      const key = Math.floor(Math.random() * 2147483647);
      await exchange(first, `begin; select pg_advisory_xact_lock(25025,${key});`, remaining);
      const competing = exchange(second, `begin; select pg_advisory_xact_lock(25025,${key}); commit;`, remaining);
      competing.catch(() => {});
      let row;
      do {
        row = await json(observer, `(select json_build_object('pid',pid,'start',backend_start::text,'wait',wait_event_type,
          'blockers',pg_blocking_pids(pid),'blockerStart',(select backend_start::text from pg_stat_activity where pid=${first.pid}))
          from pg_stat_activity where pid=${second.pid})`, remaining);
        if (row?.wait === 'Lock') break;
        await new Promise(resolve => setTimeout(resolve, Math.min(20, remaining())));
      } while (remaining());
      intendedBlocker(row, second, first);
      await exchange(first, 'rollback;', remaining);
      await competing;
      await assert.rejects(exchange(second, 'select pg_sleep(0.1);', deadline(10)), /Timed out waiting|REF025_DEADLINE/);
      await verifyGates(observer, remaining);
    }
  } catch (error) { failure = error; }
  finally {
    const cleanup = deadline(10000), errors = [];
    for (const session of sessions.toReversed()) {
      try { await closeClient(session, cleanup); } catch (error) { errors.push(error); }
    }
    try {
      assert(sessions.every(s => s.pid && s.start), 'REF025_UNATTESTED_SESSION');
      const owned = sessions.map(s => `(pid=${s.pid} and backend_start::text=${sqlLiteral(s.start)})`).join(' or ') || 'false';
      let count;
      do {
        const result = await promisify(execFile)('docker', [...binding.args, `select count(*) from pg_stat_activity where ${owned};`], { timeout: cleanup() });
        count = Number(result.stdout.trim());
        if (count) await new Promise(resolve => setTimeout(resolve, Math.min(20, cleanup())));
      } while (count && cleanup());
      assert.equal(count, 0, 'REF025_BACKEND_REMAINS');
    } catch (error) { errors.push(error); }
    if (errors.length) failure = new AggregateError([failure, ...errors].filter(Boolean), 'REF025_CLOSE_FAILED');
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ ref025: mode, gates: mode === '--attest' ? 'not_checked' : 'retained', clientsAndBackends: 'closed' }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  lifecycle(process.argv[2]).catch(error => { console.error(JSON.stringify({ failure: error.message, causes: error.errors?.map(e => e.message) })); process.exitCode = 1; });
}
