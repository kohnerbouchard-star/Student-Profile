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
  await exchange(session, `select '${marker}' || (${expression})::text || '${marker}';`, remaining);
  return decodeRow(session.output, marker);
}
export function decodeRow(output, marker) {
  const parts = output.split(marker);
  assert(parts.length === 3 && (!parts[0] || parts[0].endsWith('\n')) && /^\r?\n/u.test(parts[2]), 'REF025_JSON_FRAMING');
  return JSON.parse(parts[1]); // JSON aggregates of composite rows can contain literal newlines.
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
async function prepareFixtures(observer, first, second, remaining, income = false) {
  const sql = readFileSync(new URL('./ref025-business-loan-concurrency.sql', import.meta.url), 'utf8');
  const parts = sql.split('-- REF025 session helpers'); assert.equal(parts.length, 2);
  await exchange(observer, `create temporary table ref025_phase(income boolean not null);
    insert into ref025_phase values(${income ? 'true' : 'false'});`, remaining);
  await exchange(observer, sql, remaining);
  await verifyGates(observer, remaining, false);
  for (const session of [first, second]) await exchange(session, parts[1], remaining);
}
async function submissionRaces(observer, first, second, remaining) {
  await prepareFixtures(observer, first, second, remaining);
  const fixtures = await json(observer, '(select json_agg(f order by n) from ref025_fixtures f where n<=2)', remaining);
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
      ? exchange(second, `select pg_temp.ref025_reject(${sqlLiteral(command(one, key, one.buyer, 61))},'IDEMPOTENCY_KEY_CONFLICT');`, remaining)
      : submit(second, one, key, one.buyer);
    competing.catch(() => {});
    for (;;) {
      const row = await json(observer, `pg_temp.ref025_blocker(${second.pid},${first.pid})`, remaining);
      if (row?.wait === 'Lock') { intendedBlocker(row, second, first); break; }
      await new Promise(resolve => setTimeout(resolve, Math.min(20, remaining())));
    }
    await exchange(first, 'commit;', remaining);
    const replay = await competing;
    if (!conflict) assert.deepEqual(replay, { ...result, replayed: true });
    assert.deepEqual(await state(observer, one), committed);
    await verifyGates(observer, remaining, false);
  }
  const beforeFailure = await state(observer, one);
  await exchange(observer, `select pg_temp.ref025_rollback(${sqlLiteral(one.g)},${sqlLiteral(command(one, 'ref025-rollback', one.buyer))});`, remaining);
  assert.deepEqual(await state(observer, one), beforeFailure);
  assert.equal((await submit(observer, one, 'ref025-rollback', one.buyer)).replayed, false);
  applicationEffects(beforeFailure, await state(observer, one), one.buyer, 'ref025-rollback', one.b);
  const beforeOne = await state(observer, one), beforeTwo = await state(observer, two);
  await exchange(observer, `select pg_temp.ref025_reject(${sqlLiteral(command({ ...two, business_key: one.business_key }, 'ref025-isolation'))},'BUSINESS_NOT_FOUND');`, remaining);
  assert.deepEqual(await state(observer, one), beforeOne); assert.deepEqual(await state(observer, two), beforeTwo);
  await exchange(first, 'begin;', remaining);
  assert.equal((await submit(first, one, 'ref025-isolation')).replayed, false);
  assert.equal((await submit(second, two, 'ref025-isolation')).replayed, false); // Must finish while game one's lock is held.
  const isolated = await state(observer, two); applicationEffects(beforeTwo, isolated, two.owner_id, 'ref025-isolation', two.b);
  assert.deepEqual(await state(observer, one), beforeOne);
  await exchange(first, 'rollback;', remaining);
  assert.deepEqual(await state(observer, one), beforeOne); assert.deepEqual(await state(observer, two), isolated);
}
export function authorityEffects(before, after, fixture, committed) {
  assert.deepEqual(before.mandates, [], 'REF025_EXPECTED_OWNER_FALLBACK');
  assert.deepEqual(after.business, before.business, 'REF025_BUSINESS_CHANGED');
  assert.deepEqual(after.proposal, before.proposal, 'REF025_PROPOSAL_CHANGED');
  if (!committed) { assert.deepEqual(after, before); return; }
  assert.equal(after.mandates.length, 1);
  const mandate = after.mandates[0];
  assert.equal(mandate.game_session_id, fixture.g); assert.equal(mandate.business_id, fixture.b);
  assert.equal(mandate.player_id, fixture.buyer); assert.equal(mandate.source_proposal_id, fixture.proposal_id);
}
async function authorityRaces(observer, first, second, remaining) {
  const fixtures = await json(observer, '(select json_agg(f order by n) from ref025_fixtures f where n between 3 and 6)', remaining);
  assert.deepEqual(fixtures.map(f => f.n), [3, 4, 5, 6]);
  for (const f of fixtures) {
    const committed = f.n % 2 === 1, replay = f.n >= 5, key = `ref025-authority-${f.n}`;
    const command = (actor = f.owner_id) => `select * from economy_private.submit_business_loan_application_v1(
      ${[f.g, actor, f.business_key, f.product_key, 60, 'REF025 authority request', key].map(sqlLiteral).join(',')})`;
    const submit = (session, actor) => json(session, `(select to_jsonb(r) from (${command(actor)}) r)`, remaining);
    const economic = session => json(session, `pg_temp.ref025_state(${sqlLiteral(f.g)})`, remaining);
    const authority = session => json(session, `pg_temp.ref025_authority(${[f.g, f.b, f.proposal_id].map(sqlLiteral).join(',')})`, remaining);
    const resolve = actor => `(select to_jsonb(business_id) from public.resolve_player_business_v2(${sqlLiteral(f.g)},${sqlLiteral(actor)}))`;
    assert.equal(await json(observer, resolve(f.owner_id), remaining), f.b);
    const original = replay ? await submit(observer) : null;
    if (replay) assert.equal(original.replayed, false);
    const before = await economic(observer), priorAuthority = await authority(observer);
    await exchange(first, `begin; select pg_temp.ref025_handoff(${[f.g, f.b, f.buyer, f.proposal_id].map(sqlLiteral).join(',')});`, remaining);
    const granted = await authority(first); authorityEffects(priorAuthority, granted, f, true);
    const competing = committed
      ? exchange(second, `select pg_temp.ref025_reject(${sqlLiteral(command())},'BUSINESS_NOT_FOUND');`, remaining)
      : submit(second);
    competing.catch(() => {});
    for (;;) {
      const row = await json(observer, `pg_temp.ref025_blocker(${second.pid},${first.pid})`, remaining);
      if (row?.wait === 'Lock') { intendedBlocker(row, second, first); break; }
      await new Promise(resolve => setTimeout(resolve, Math.min(20, remaining())));
    }
    await exchange(first, committed ? 'commit;' : 'rollback;', remaining);
    const result = await competing, after = await economic(observer), currentAuthority = await authority(observer);
    authorityEffects(priorAuthority, currentAuthority, f, committed);
    assert.deepEqual(currentAuthority, committed ? granted : priorAuthority);
    if (committed || replay) assert.deepEqual(after, before);
    else { assert.equal(result.replayed, false); applicationEffects(before, after, f.owner_id, key, f.b); }
    if (!committed && replay) assert.deepEqual(result, { ...original, replayed: true });
    assert.equal(await json(observer, resolve(committed ? f.buyer : f.owner_id), remaining), f.b);
    if (committed) await exchange(observer, `select pg_temp.ref025_reject(${sqlLiteral(`select ${resolve(f.owner_id)}`)},'BUSINESS_NOT_FOUND');`, remaining);
    if (committed && replay) {
      assert.deepEqual(await submit(observer, f.buyer), { ...original, replayed: true });
      assert.deepEqual(await economic(observer), before);
    }
    await verifyGates(observer, remaining, false);
  }
}
export function eligibilityEffects(before, after, target, status, transactionTime) {
  assert(['product', 'party', 'account'].includes(target), 'REF025_ELIGIBILITY_TARGET');
  assert.equal(typeof transactionTime, 'string');
  assert(Number.isFinite(Date.parse(transactionTime)), 'REF025_STATUS_TIMESTAMP');
  const expected = structuredClone(before);
  expected[target].status = status;
  expected[target].updated_at = transactionTime;
  assert.deepEqual(after, expected, 'REF025_ELIGIBILITY_EFFECTS');
}
async function eligibilityRaces(observer, first, second, remaining) {
  const fixtures = await json(observer, '(select json_agg(f order by n) from ref025_fixtures f where n>=7)', remaining);
  assert.deepEqual(fixtures.map(f => f.n), [7, 8, 9]);
  for (const f of fixtures) {
    const [target, status] = [['product', 'paused'], ['party', 'disabled'], ['account', 'restricted']][f.n - 7];
    const args = [f.g, f.b, f.product_key].map(sqlLiteral).join(',');
    const economic = session => json(session, `pg_temp.ref025_state(${sqlLiteral(f.g)})`, remaining);
    const eligibility = session => json(session, `pg_temp.ref025_eligibility(${args})`, remaining);
    const change = (session, value) => json(session, `to_jsonb(pg_temp.ref025_status(${args},${sqlLiteral(target)},${sqlLiteral(value)}))`, remaining);
    const sentinels = () => json(observer, `(select jsonb_agg(jsonb_build_array(n,pg_temp.ref025_state(g),
      pg_temp.ref025_eligibility(g,b,product_key)) order by n) from ref025_fixtures where n<>${f.n})`, remaining);
    const command = key => `select * from economy_private.submit_business_loan_application_v1(
      ${[f.g, f.owner_id, f.business_key, f.product_key, 60, 'REF025 eligibility request', key].map(sqlLiteral).join(',')})`;
    const submit = (session, key) => json(session, `(select to_jsonb(r) from (${command(key)}) r)`, remaining);
    for (const mode of ['creation', 'replay', 'retention']) for (const committed of [true, false]) {
      const started = performance.now(), cpu = process.cpuUsage(), bytes = observer.output.length;
      const key = `ref025-${target}-${mode}-${committed}`;
      const seed = await economic(observer), original = mode === 'replay' ? await submit(observer, key) : null;
      if (original) {
        assert.equal(original.replayed, false);
        applicationEffects(seed, await economic(observer), f.owner_id, key, f.b);
      }
      const before = await economic(observer), prior = await eligibility(observer), isolated = await sentinels();
      assert.equal(prior[target].status, 'active');
      let changed, staged, competing;
      await exchange(first, 'begin;', remaining);
      if (mode === 'retention') {
        assert.equal((await submit(first, key)).replayed, false);
        staged = await economic(first);
        applicationEffects(before, staged, f.owner_id, key, f.b);
        competing = change(second, status);
      } else {
        // Replay deliberately bypasses eligibility locks; synchronize it on its borrower lock.
        if (mode === 'replay') await exchange(first, `select id from public.business_entities where game_session_id=${sqlLiteral(f.g)} and id=${sqlLiteral(f.b)} for update;`, remaining);
        const time = await change(first, status);
        changed = await eligibility(first);
        eligibilityEffects(prior, changed, target, status, time);
        const error = target === 'product' ? 'BUSINESS_LOAN_ASSESSMENT_PRODUCT_INVALID' : 'LOAN_REPAYMENT_ACCOUNT_UNAVAILABLE';
        competing = mode === 'creation' && committed
          ? exchange(second, `select pg_temp.ref025_reject(${sqlLiteral(command(key))},${sqlLiteral(error)});`, remaining)
          : submit(second, key);
      }
      competing.catch(() => {});
      const lockStarted = performance.now();
      for (;;) {
        const row = await json(observer, `pg_temp.ref025_blocker(${second.pid},${first.pid})`, remaining);
        if (row?.wait === 'Lock') { intendedBlocker(row, second, first); break; }
        await new Promise(resolve => setTimeout(resolve, Math.min(20, remaining())));
      }
      const lockMs = performance.now() - lockStarted;
      assert.deepEqual(await economic(observer), before);
      assert.deepEqual(await eligibility(observer), prior);
      assert.deepEqual(await sentinels(), isolated);
      await exchange(first, committed ? 'commit;' : 'rollback;', remaining);
      const result = await competing, after = await economic(observer), current = await eligibility(observer);
      if (mode === 'retention') {
        assert.deepEqual(after, committed ? staged : before);
        eligibilityEffects(prior, current, target, status, result);
      } else {
        assert.deepEqual(current, committed ? changed : prior);
        if (mode === 'creation' && !committed) {
          assert.equal(result.replayed, false);
          applicationEffects(before, after, f.owner_id, key, f.b);
        } else assert.deepEqual(after, before);
        if (mode === 'replay') assert.deepEqual(result, { ...original, replayed: true });
      }
      if (current[target].status !== 'active') {
        const time = await change(observer, 'active');
        eligibilityEffects(current, await eligibility(observer), target, 'active', time);
      }
      assert.deepEqual(await economic(observer), after);
      assert.deepEqual(await sentinels(), isolated);
      await verifyGates(observer, remaining, false);
      console.log(JSON.stringify({ ref025Eligibility: key, elapsedMs: performance.now() - started, lockMs, cpuUs: process.cpuUsage(cpu), observerBytes: observer.output.length, addedBytes: observer.output.length - bytes }));
    }
  }
}
export function incomeAssessment(row, income) {
  const paymentIncome = income / 6;
  assert.deepEqual(row, { obligation_currency_code: 'ECO', assessed_at: row.assessed_at,
    qualifying_income: income, income_per_payment: paymentIncome, projected_payment: 20,
    affordability_ratio: Math.round(20 / paymentIncome * 1e6) / 1e6,
    maximum_payment_to_income: 0.45, minimum_credit_score: 600, affordable: income >= 360 });
  assert(Number.isFinite(Date.parse(row.assessed_at)), 'REF025_ASSESSMENT_TIME');
}
export function incomeApplicationEffects(before, after, f, key, income = 360) {
  const original = structuredClone(before), expected = structuredClone(after);
  const added = after.economic.applications.filter(a => !before.economic.applications.some(b => b.id === a.id));
  assert.equal(added.length, 1); const app = added[0];
  for (const [field, value] of Object.entries({ amount: 120, liability_kind: 'business_v1', status: 'pending_review',
    initiating_operator_player_id: f.owner_id, player_id: f.owner_id, borrower_business_id: f.b, business_id: f.b,
    idempotency_key: key, obligation_currency_code: 'ECO', projected_payment: 20, affordability_ratio: Math.round(120 / income * 1e6) / 1e6, repayment_source: `business:${f.business_key}` })) assert.equal(app[field], value);
  const audits = after.economic.audits.filter(a => !before.economic.audits.some(b => b.id === a.id));
  assert.equal(audits.length, 1); assert.equal(audits[0].action, 'business.loan.application.submit');
  assert.equal(audits[0].actor_id, f.owner_id); assert.equal(audits[0].target_id, app.id);
  incomeAssessment(audits[0].metadata.assessment, income);
  expected.economic.applications = expected.economic.applications.filter(a => a.id !== app.id);
  expected.economic.audits = expected.economic.audits.filter(a => a.id !== audits[0].id);
  const prior = original.economic.profiles.filter(p => p.player_id === f.owner_id), current = expected.economic.profiles.filter(p => p.player_id === f.owner_id);
  assert.equal(prior.length, 1); assert.equal(current.length, 1); assert.equal(app.credit_score, prior[0].score);
  assert(Number.isFinite(Date.parse(app.created_at)), 'REF025_APPLICATION_TIME');
  for (const field of ['calculated_at', 'updated_at']) { assert.equal(current[0][field], app.created_at); current[0][field] = prior[0][field]; }
  assert.deepEqual(expected, original, 'REF025_INCOME_APPLICATION_EFFECTS');
}
async function incomeRaces(observer, first, second, remaining) {
  const fixtures = await json(observer, '(select json_agg(f order by n) from ref025_fixtures f)', remaining);
  const state = (session, f) => json(session, `pg_temp.ref025_income_state(${sqlLiteral(f.g)})`, remaining);
  const blocked = async blocker => {
    for (;;) {
      const row = await json(observer, `pg_temp.ref025_blocker(${second.pid},${blocker.pid})`, remaining);
      if (row?.wait === 'Lock') { intendedBlocker(row, second, blocker); return; }
      await new Promise(resolve => setTimeout(resolve, Math.min(20, remaining())));
    }
  };
  for (const f of fixtures) {
    const other = fixtures.find(x => x.g !== f.g), isolated = await state(observer, other), funded = f.n === 2;
    const assess = async (session, at, barrier = null) => {
      const row = await json(session, `pg_temp.ref025_income(${[f.g, f.b, f.product_key, at, barrier].map(sqlLiteral)})`, remaining);
      assert.equal(row.assessed_at, at, 'REF025_CAPTURED_TIME'); return row;
    };
    const sale = (key, saved = null) => json(first, `pg_temp.ref025_sale(${[f.g, f.b, f.buyer, key, funded, saved && JSON.stringify(saved)].map(sqlLiteral)})`, remaining);
    const command = (actor, key = 'ref025-income-application') => `select * from economy_private.submit_business_loan_application_v1(${[f.g, actor, f.business_key, f.product_key, 120, 'REF025 income request', key].map(sqlLiteral)})`;
    const submit = (session, actor = f.owner_id, key) => json(session, `(select to_jsonb(r) from (${command(actor, key)}) r)`, remaining);
    const effects = (before, after, at) => exchange(observer, `select pg_temp.ref025_sale_effects(${[JSON.stringify(before), JSON.stringify(after), f.b, f.buyer, funded, at].map(sqlLiteral)});`, remaining);
    let original;
    for (const commit of [false, true]) {
      const before = await state(observer, f);
      await exchange(first, 'begin;', remaining);
      const sold = await sale('ref025-income-wait'), written = await state(first, f);
      assert.equal(sold.result.replayed, false); await effects(before, written, sold.asOf);
      incomeAssessment(await assess(first, sold.asOf), 360); incomeAssessment(await assess(observer, sold.asOf), 240);
      assert.deepEqual(await state(observer, f), before);
      const waiting = commit ? submit(second) : exchange(second, `select pg_temp.ref025_reject(${sqlLiteral(command(f.owner_id))},'LOAN_UNAFFORDABLE');`, remaining);
      waiting.catch(() => {}); await blocked(first);
      const independent = await json(observer, `pg_temp.ref025_other_income(${[other.g, other.b, other.buyer, other.product_key, other.n === 2].map(sqlLiteral)})`, remaining);
      incomeAssessment(independent.before, f.n === 1 ? 240 : 480); incomeAssessment(independent.after, f.n === 1 ? 360 : 600);
      await blocked(first); // The original writer and waiting submission still overlap the other game's settlement.
      assert.deepEqual(await state(observer, other), isolated);
      await exchange(first, commit ? 'commit;' : 'rollback;', remaining);
      const result = await waiting, after = await state(observer, f);
      if (commit) { original = result; assert.equal(result.replayed, false); incomeApplicationEffects(written, after, f, 'ref025-income-application'); }
      else assert.deepEqual(after, before);
      incomeAssessment(await assess(observer, sold.asOf), commit ? 360 : 240);
      assert.deepEqual(await state(observer, other), isolated);
    }
    const before = await state(observer, f), key = 'ref025-income-snapshot', barrier = 2500500 + f.n;
    await exchange(first, 'begin;', remaining);
    const sold = await sale(key), written = await state(first, f);
    await effects(before, written, sold.asOf); incomeAssessment(await assess(observer, sold.asOf), 360);
    await exchange(observer, `select pg_advisory_lock(${barrier});`, remaining);
    const snapshot = assess(second, sold.asOf, barrier); snapshot.catch(() => {}); await blocked(observer);
    await exchange(first, 'commit;', remaining);
    await exchange(observer, `select pg_advisory_unlock(${barrier});`, remaining);
    incomeAssessment(await snapshot, 360); incomeAssessment(await assess(second, sold.asOf), 480);
    assert.deepEqual(await state(observer, f), written);
    const replay = await sale(key, sold);
    assert.deepEqual(replay.result, { ...sold.result, replayed: true });
    incomeAssessment(await assess(observer, sold.asOf), 480);
    assert.deepEqual(await submit(second, f.buyer), { ...original, replayed: true });
    assert.deepEqual(await state(observer, f), written); assert.deepEqual(await state(observer, other), isolated);
    assert.equal((await submit(second, f.owner_id, 'ref025-income-fresh')).replayed, false);
    const fresh = await state(observer, f); incomeApplicationEffects(written, fresh, f, 'ref025-income-fresh', 480);
    assert.deepEqual(await submit(second, f.buyer), { ...original, replayed: true }); assert.deepEqual(await state(observer, f), fresh);
    await verifyGates(observer, remaining, false);
    console.log(JSON.stringify({ ref025Income: funded ? 'funded' : 'retained', waitingSubmission: ['rollback', 'commit'], statementSnapshot: 'verified', saleReplay: 'unchanged', applicationReplay: 'original', freshApplicationIncome: 480, otherGame: 'settled-assessed-rolled-back' }));
  }
}
export async function lifecycle(mode = '--phase') {
  assert(['--phase', '--income-phase', '--verify', '--attest'].includes(mode), 'REF025_MODE');
  const binding = attest(), sessions = [], remaining = deadline(15000);
  let failure;
  try {
    const observer = await connect(binding, sessions, remaining);
    if (mode !== '--attest') await verifyGates(observer, remaining);
    if (mode === '--phase' || mode === '--income-phase') {
      const first = await connect(binding, sessions, remaining), second = await connect(binding, sessions, remaining);
      if (mode === '--phase') {
        console.log(JSON.stringify({ ref025Stage: 'submission-start' }));
        await submissionRaces(observer, first, second, remaining);
        console.log(JSON.stringify({ ref025Stage: 'authority-start' }));
        await authorityRaces(observer, first, second, remaining);
        console.log(JSON.stringify({ ref025Stage: 'eligibility-start' }));
        await eligibilityRaces(observer, first, second, remaining);
        console.log(JSON.stringify({ ref025Stage: 'original-races-complete' }));
      } else {
        await prepareFixtures(observer, first, second, remaining, true);
        assert.deepEqual(await json(observer, '(select json_agg(n order by n) from ref025_fixtures)', remaining), [1, 2]);
        assert.equal(await json(observer, `(select count(*) from public.loan_applications where liability_kind<>'legacy_v1')`, remaining), 0);
        await incomeRaces(observer, first, second, remaining);
      }
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
  console.log(JSON.stringify({ ref025: mode, gates: mode === '--attest' ? 'not_checked' : mode.endsWith('phase') ? 'loan_retained_application_reset_required' : 'retained', clientsAndBackends: 'closed' }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  lifecycle(process.argv[2]).catch(error => { console.error(JSON.stringify({ failure: error.message, causes: error.errors?.map(e => e.message) })); process.exitCode = 1; });
}
