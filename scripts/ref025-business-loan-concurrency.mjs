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
  try {
    const marker = `r${randomUUID().replaceAll('-', '')}`;
    const wait = session.waitFor(`${marker}:done`, remaining());
    wait.catch(() => {});
    session.write(`${sql}\nselect '${marker}:done';`);
    await wait;
    remaining();
    assert.equal(session.errors, '', 'REF025_SQL_ERROR');
  } catch (error) { session.closed = true; throw error; }
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
export function checkedBackendCount(stdout, remaining) {
  remaining(); // execFile's timer alone cannot enforce elapsed time after event-loop stalls.
  const match = /^(0|[1-9][0-9]*)(?:\r?\n)?$/u.exec(stdout);
  assert(match && match[0] === stdout, 'REF025_BACKEND_COUNT_ROW');
  const count = Number(match[1]);
  assert(Number.isSafeInteger(count), 'REF025_BACKEND_COUNT_RANGE');
  return count;
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
async function verifyGates(session, remaining, applicationGate = true) {
  const rows = await json(session, `(select json_agg(json_build_array(c.conname,c.convalidated,pg_get_constraintdef(c.oid)) order by c.conname)
    from pg_constraint c where (c.conrelid,c.conname) in
    (('public.loan_applications'::regclass,'loan_applications_business_liability_disabled_v1'),
     ('public.player_loans'::regclass,'player_loans_business_liability_disabled_v1')))`, remaining);
  assert.deepEqual(rows, (applicationGate ? ['loan_applications', 'player_loans'] : ['player_loans']).map(t => [`${t}_business_liability_disabled_v1`, true, "CHECK ((liability_kind = 'legacy_v1'::text))"]));
  const versions = readdirSync('backend/supabase/migrations').filter(f => /^\d{14}_.+\.sql$/.test(f)).sort().map(f => f.slice(0, 14));
  assert.deepEqual(await json(session, '(select json_agg(version order by version) from supabase_migrations.schema_migrations)', remaining), versions);
  if (applicationGate) {
    assert.equal(await json(session, `(select count(*) from public.loan_applications where liability_kind<>'legacy_v1')`, remaining), 0);
    assert.equal(await json(session, `(select count(*) from public.game_sessions where name like 'REF025 concurrency %')+
      (select count(*) from public.staff_users where display_name='REF025 concurrency staff')+
      (select count(*) from public.country_profiles where country_name like 'REF025 concurrency %')`, remaining), 0);
  }
  assert.equal(await json(session, `(select count(*) from public.player_loans where liability_kind<>'legacy_v1')`, remaining), 0);
}
export function expectedRejection(statement, expected) {
  return `do $ref025$ begin begin execute ${sqlLiteral(statement)};
    exception when others then if sqlerrm=${sqlLiteral(expected)} or sqlstate=${sqlLiteral(expected)} then return; end if; raise;
    end; raise exception 'REF025_EXPECTED_REJECTION_MISSING'; end $ref025$;`;
}
export function applicationEffects(before, after, actor, key, business) {
  for (const field of ['loans', 'ledger', 'balances']) assert.deepEqual(after[field], before[field], `REF025_${field}`);
  const created = after.applications.filter(a => !before.applications.some(b => b.id === a.id));
  assert.equal(created.length, 1); const app = created[0];
  assert.deepEqual(after.applications.filter(a => a.id !== app.id), before.applications);
  assert.equal(app.initiating_operator_player_id, actor); assert.equal(app.player_id, actor);
  assert.equal(app.borrower_business_id, business); assert.equal(app.business_id, business);
  assert.equal(app.idempotency_key, key); assert.equal(app.obligation_currency_code, 'ECO');
  assert.equal(app.liability_kind, 'business_v1'); assert.equal(app.status, 'pending_review'); assert.equal(app.amount, 60);
  const added = after.audits.filter(a => !before.audits.some(b => b.id === a.id));
  assert.equal(added.length, 1); assert.equal(added[0].action, 'business.loan.application.submit');
  assert.equal(added[0].target_id, app.id); assert.equal(added[0].actor_id, actor);
  assert.equal(added[0].metadata.assessment.qualifying_income, 240);
  assert.deepEqual(after.audits.filter(a => a.id !== added[0].id), before.audits);
  assert.equal(after.profiles.filter(p => p.player_id === actor).length, 1);
  assert.deepEqual(after.profiles.filter(p => p.player_id !== actor), before.profiles.filter(p => p.player_id !== actor));
}
async function submissionRaces(observer, first, second, remaining) {
  const sql = readFileSync(new URL('./ref025-business-loan-concurrency.sql', import.meta.url), 'utf8');
  const parts = sql.split('-- REF025 session helpers'); assert.equal(parts.length, 2);
  await exchange(observer, sql, remaining);
  await verifyGates(observer, remaining, false);
  for (const session of [first, second]) await exchange(session, parts[1], remaining);
  const fixtures = await json(observer, '(select json_agg(f order by n) from ref025_fixtures f)', remaining);
  assert.equal(fixtures.length, 2); const [one, two] = fixtures;
  const state = (session, f) => json(session, `pg_temp.ref025_state(${sqlLiteral(f.g)}::uuid)`, remaining);
  const command = (f, key, actor = f.owner_id, amount = 60) => `select * from economy_private.submit_business_loan_application_v1(
    ${[f.g, actor, f.business_key, f.product_key, amount, 'REF025 race request', key].map(sqlLiteral).join(',')})`;
  const submit = (session, f, key, actor) => json(session, `(select to_jsonb(r) from (${command(f, key, actor)}) r)`, remaining);
  for (const conflict of [false, true]) {
    const key = conflict ? 'ref025-conflict' : 'ref025-duplicate', before = await state(observer, one);
    await exchange(first, 'begin;', remaining);
    const result = await submit(first, one, key), committed = await state(first, one);
    assert.equal(result.replayed, false); applicationEffects(before, committed, one.owner_id, key, one.b);
    const competing = conflict
      ? exchange(second, expectedRejection(command(one, key, one.buyer, 61), 'IDEMPOTENCY_KEY_CONFLICT'), remaining)
      : submit(second, one, key, one.buyer);
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
    await exchange(first, 'commit;', remaining);
    const replay = await competing;
    if (!conflict) assert.deepEqual(replay, { ...result, replayed: true });
    assert.deepEqual(await state(observer, one), committed);
    await verifyGates(observer, remaining, false);
  }
  const beforeFailure = await state(observer, one);
  await exchange(observer, `create trigger ref025_race_failure after insert on public.audit_log
    for each row execute function pg_temp.ref025_fail(${sqlLiteral(one.g)});`, remaining);
  await exchange(observer, expectedRejection(command(one, 'ref025-rollback', one.buyer), 'Z0255'), remaining);
  await exchange(observer, 'drop trigger ref025_race_failure on public.audit_log;', remaining);
  assert.deepEqual(await state(observer, one), beforeFailure);
  assert.equal((await submit(observer, one, 'ref025-rollback', one.buyer)).replayed, false);
  applicationEffects(beforeFailure, await state(observer, one), one.buyer, 'ref025-rollback', one.b);
  const beforeOne = await state(observer, one), beforeTwo = await state(observer, two);
  await exchange(observer, expectedRejection(command({ ...two, business_key: one.business_key }, 'ref025-isolation'), 'BUSINESS_NOT_FOUND'), remaining);
  assert.deepEqual(await state(observer, one), beforeOne); assert.deepEqual(await state(observer, two), beforeTwo);
  await exchange(first, 'begin;', remaining);
  assert.equal((await submit(first, one, 'ref025-isolation')).replayed, false);
  assert.equal((await submit(second, two, 'ref025-isolation')).replayed, false); // Must finish while game one's lock is held.
  const isolated = await state(observer, two); applicationEffects(beforeTwo, isolated, two.owner_id, 'ref025-isolation', two.b);
  assert.deepEqual(await state(observer, one), beforeOne);
  await exchange(first, 'rollback;', remaining);
  assert.deepEqual(await state(observer, one), beforeOne); assert.deepEqual(await state(observer, two), isolated);
  await verifyGates(observer, remaining, false);
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
      await submissionRaces(observer, first, second, remaining);
      await assert.rejects(exchange(second, 'select pg_sleep(0.1);', deadline(10)), /Timed out waiting|REF025_DEADLINE/);
      await verifyGates(observer, remaining, false);
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
        count = checkedBackendCount(result.stdout, cleanup);
        if (count) await new Promise(resolve => setTimeout(resolve, Math.min(20, cleanup())));
      } while (count && cleanup());
      assert.equal(count, 0, 'REF025_BACKEND_REMAINS');
    } catch (error) { errors.push(error); }
    if (errors.length) failure = new AggregateError([failure, ...errors].filter(Boolean), 'REF025_CLOSE_FAILED');
  }
  if (failure) throw failure;
  console.log(JSON.stringify({ ref025: mode, gates: mode === '--attest' ? 'not_checked' : mode === '--phase' ? 'loan_retained_application_reset_required' : 'retained', clientsAndBackends: 'closed' }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  lifecycle(process.argv[2]).catch(error => { console.error(JSON.stringify({ failure: error.message, causes: error.errors?.map(e => e.message) })); process.exitCode = 1; });
}
