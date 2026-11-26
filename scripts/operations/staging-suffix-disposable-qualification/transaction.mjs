// Disposable database test only. Never import this module in an operator workflow.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { stripOuterTransaction } from '../live-migration-reconciliation/build-phase15-forward-bundle.mjs';
import { loadBatch, pendingRows, sha256 } from '../staging-suffix-qualification/compiler.mjs';
import { renderGuardedBatch, stagedPredicates } from '../staging-suffix-apply/manual.mjs';

const nonce = '20260921044500';
const scheduler = 'econovaria-campaign-runtime-scheduler-v1';
const ledger = 'supabase_migrations.schema_migrations';
const sqlLiteral = value => "'" + String(value).replaceAll("'", "''") + "'";
const prefixDigest = "select encode(sha256(convert_to(jsonb_agg(to_jsonb(m) order by m.version collate \"C\")::text,'UTF8')),'hex') from " +
  ledger + " m where m.version <= '" + nonce + "';";
const ledgerRows = "select jsonb_agg(jsonb_build_object('version',version,'name',name,'sha256'," +
  "encode(sha256(convert_to(statements[1],'UTF8')),'hex'),'statementCount',cardinality(statements)) order by version) from " +
  ledger + " where version >= '" + nonce + "';";
const configuration = "select json_build_object('launch',current_setting('cron.launch_active_jobs')," +
  "'jobs',(select count(*) from cron.job),'runs',(select count(*) from cron.job_run_details));";

function bodyAtBoundary(text, marker, addition) {
  assert.equal(text.split(marker).length, 2, 'Exact transaction boundary changed');
  return text.replace(marker, () => marker + addition);
}

const visibleSqlStates = new Set([
  'P0001', '42501', '42P01', '42703', '42883', '42702', '23503', '23505',
  '23514', '22023', '42601', '40001', '55P03', '57014',
]);
const visibleSqlGuards = new Set([
  'CAMPAIGN_EVENT_REQUEST_INVALID', 'CAMPAIGN_PHASE_CONFLICT', 'CAMPAIGN_REVISION_CONFLICT',
  'CAMPAIGN_FENCE_REQUIRED_ROUTINE_MISSING', 'CAMPAIGN_FENCE_OWNER_MISMATCH',
  'CAMPAIGN_FENCE_GRANTOR_MISMATCH', 'CAMPAIGN_FENCE_TOKEN_IDENTITY_MISSING',
  'CAMPAIGN_FENCE_LEGACY_GRANT_REMAINS', 'CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED',
  'CAMPAIGN_FENCE_DRAIN_UNAVAILABLE', 'CAMPAIGN_FENCE_EPOCH_CHANGED',
  'CAMPAIGN_FENCE_V2_ACKNOWLEDGEMENTS_MISSING', 'CAMPAIGN_FENCE_DRAIN_REQUIRED',
]);

function sqlHeader(error) {
  // libpq verbose uses two spaces after the severity and one after SQLSTATE.
  const match = /^(?:psql:(?:<stdin>|-):[0-9]+:[ \t]*)?(ERROR|FATAL):[ \t]+([0-9A-Z]{5}):[ \t]+([^\r\n]+)$/m
    .exec(String(error?.stderr ?? ''));
  return match && { severity: match[1], state: match[2], primary: match[3].trimEnd() };
}

export function sqlFailureFacts(error) {
  const header = sqlHeader(error);
  const state = header?.state ?? error?.sqlState;
  const guard = header?.primary ?? error?.sqlGuard;
  return {
    ...(visibleSqlStates.has(state) ? { sqlState: state } : {}),
    ...(visibleSqlGuards.has(guard) ? { sqlGuard: guard } : {}),
  };
}

export function sqlError(operation, expected, sqlState = 'P0001') {
  try {
    operation();
  } catch (error) {
    const header = sqlHeader(error);
    if (error.status === 3 && header?.severity === 'ERROR' && header.state === sqlState &&
        header.primary === expected) return;
    throw Object.assign(Error('EXPECTED_SQL_REJECTION_MISMATCH'), sqlFailureFacts(error));
  }
  throw Error('EXPECTED_SQL_REJECTION_NOT_RAISED');
}

async function replayPrefix(root, sql) {
  // Same replay discipline as #1066 scripts/campaign-served/fence-acceptance.mjs.
  sql('alter system set cron.launch_active_jobs=off;', 'supabase_admin');
  sql('select pg_reload_conf();', 'supabase_admin');
  for (let attempt = 0; ; attempt += 1) {
    if (sql("select current_setting('cron.launch_active_jobs');") === 'off') break;
    assert(attempt < 10, 'DISPOSABLE_CRON_NOT_FENCED');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  sql('create schema if not exists supabase_migrations; create table if not exists ' +
    ledger + '(version text primary key,name text,statements text[]);');
  assert.equal(sql('select count(*) from ' + ledger + ';'), '0', 'DISPOSABLE_LEDGER_NOT_EMPTY');
  const directory = join(root, 'backend/supabase/migrations');
  const files = readdirSync(directory).filter(file => file.endsWith('.sql') && file.slice(0, 14) <= nonce).sort();
  assert.equal(files.length, 449, 'REPOSITORY_PREFIX_CARDINALITY');
  for (const file of files) {
    const source = readFileSync(join(directory, file), 'utf8').replaceAll('\r\n', '\n').trim();
    const body = stripOuterTransaction(source, file).body;
    sql('begin;\n' + body + '\ninsert into ' + ledger + ' values(' +
      [file.slice(0, 14), file.slice(15, -4)].map(sqlLiteral).join(',') + ',array[' + sqlLiteral(source) + ']);commit;');
  }
  assert.equal(sql('select count(*) from ' + ledger + ';'), '449');
  // The renderer binds 468 rows. These 19 marked entries represent only the
  // count difference. They provide no information about staging migration history.
  sql("insert into " + ledger + " select '200001010000'||lpad(n::text,2,'0')," +
    "'disposable_cardinality_fixture',array['select 1'] from generate_series(1,19) n;");
  assert.equal(sql("select count(*) from " + ledger + " where name='disposable_cardinality_fixture';"), '19');
  assert.equal(sql('select count(*) from ' + ledger + ';'), '468');
  assert.equal(pendingRows(JSON.parse(sql(ledgerRows))).length, 15);
}

function seedCampaign(sql, onStage) {
  // The same synthetic command enrollment as #1066's served acceptance.
  const q = sqlLiteral;
  const staff = randomUUID();
  const tokenHash = sha256(randomUUID());
  onStage('campaign-seed-identity');
  sql('insert into private.runtime_scheduler_tokens(scheduler_name,token_sha256) values(' +
    [scheduler, tokenHash].map(q).join(',') + ');' +
    'insert into public.staff_users(id,supabase_auth_user_id,email,display_name) values(' +
    [staff, randomUUID(), staff + '@example.test', 'Campaign served CI'].map(q).join(',') + ');');
  const seed = (name, packPrefix, definition) => {
    const game = randomUUID();
    const campaign = randomUUID();
    const publicId = 'cmp_' + campaign.replaceAll('-', '');
    const pack = packPrefix + randomUUID();
    const payload = { title: 'Campaign CI', summary: 'Synthetic proof', priority: 'normal',
      displayMode: 'inbox', notificationType: 'campaign' };
    const effect = [{ effectKind: 'notify_players', idempotencyKey: 'campaign-ci:' + definition + ':' + game,
      payload: { audience: 'all_players', notificationDefinitionId: definition } }];
    sql('insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status) values(' +
      [game, staff, name, 'active', 'active', 'pending'].map(q).join(',') + ');' +
      'insert into public.campaign_instances(id,public_id,game_session_id,pack_id,pack_version,definition_id,definition_digest,status,scheduled_at) values(' +
      [campaign, publicId, game, pack, '1', 'campaign-ci', 'a'.repeat(64), 'active', '2099-01-01'].map(q).join(',') + ');' +
      'insert into public.campaign_effect_definitions(pack_id,pack_version,definition_id,effect_kind,payload) values(' +
      [pack, '1', definition, 'notify_players', JSON.stringify(payload)].map(q).join(',') + ');' +
      'select * from public.execute_campaign_event_atomic_v2(' +
      [q(game), q(publicId), '(select revision from public.campaign_instances where id=' + q(campaign) + ')',
        q(definition), q('manual:' + definition), q('arrival'), q('opportunity'), 'false', "'[]'::jsonb",
        q(JSON.stringify(effect)) + '::jsonb', q('2099-01-01'), q(staff), q('Synthetic disposable verification'),
        'clock_timestamp()'].join(',') + ');');
    const command = sql('select public_id from public.campaign_effect_commands where game_session_id=' + q(game) + ';');
    assert.match(command, /^cec_[a-z0-9]+$/, 'CAMPAIGN_FIXTURE_COMMAND_INVALID');
    return { game, command };
  };
  onStage('campaign-enroll-outsider');
  const outside = seed('Campaign served CI', 'campaign-ci-', 'ci-ordinary');
  onStage('campaign-enroll-smoke');
  const smoke = seed('Campaign fence synthetic smoke', 'campaign-fence-smoke-', 'ci-smoke');
  return { tokenHash, outside, smoke };
}

function nonCampaignInterface(sql, operation) {
  // These local interfaces ensure the exact renderer still needs both calls,
  // and its seal rolls back with the ledger. They supply no live writer proof.
  sql([
    'create schema staging_writer_hold;',
    'create schema staging_writer_admission;',
    'create table staging_writer_hold.disposable_state(',
    '  singleton boolean primary key check (singleton), writer uuid not null, admission uuid not null,',
    '  held boolean not null, drained boolean not null, sealed boolean not null);',
    'insert into staging_writer_hold.disposable_state values(true,' +
      [operation.writerEpoch, operation.admissionEpoch].map(sqlLiteral).join(',') + ',true,true,false);',
    'create function staging_writer_admission.require_drained(p_epoch uuid) returns void language plpgsql as $$',
    'begin if not exists(select from staging_writer_hold.disposable_state where singleton and admission=p_epoch and held and drained and not sealed)',
    "then raise exception 'DISPOSABLE_ADMISSION_NOT_DRAINED'; end if; end $$;",
    'create function staging_writer_hold.require_apply_hold(p_epoch uuid) returns void language plpgsql as $$',
    'begin if not exists(select from staging_writer_hold.disposable_state where singleton and writer=p_epoch and held and drained and not sealed for update)',
    "then raise exception 'DISPOSABLE_WRITER_HOLD_MISSING'; end if; end $$;",
    'create function staging_writer_hold.seal_recovery(p_epoch uuid) returns void language plpgsql as $$',
    'begin perform staging_writer_hold.require_apply_hold(p_epoch);',
    'update staging_writer_hold.disposable_state set sealed=true where singleton and writer=p_epoch; end $$;',
  ].join('\n'));
}

const drainCountKeys = [
  'trackedTransactions', 'disabledActivity', 'unknownClients',
  'unlabeledOwnVirtualXid', 'idleExtensionProcesses', 'preparedTransactions',
];

const drainActivityQuery = `select pg_stat_clear_snapshot();
with boundary as materialized (select clock_timestamp() as observed),
activity as materialized (
  select a.state, a.xact_start, a.backend_type, boundary.observed,
    exists (select 1 from pg_locks l where l.pid=a.pid and l.locktype='virtualxid'
      and l.mode='ExclusiveLock' and l.granted and l.virtualxid=l.virtualtransaction) as own_virtual_xid
  from pg_stat_activity a cross join boundary
  where a.datname=current_database() and a.pid<>pg_backend_pid()
)
select json_build_object(
  'trackedTransactions',count(*) filter(where xact_start<=observed),
  'disabledActivity',count(*) filter(where state='disabled'),
  'unknownClients',count(*) filter(where state is null and backend_type='client backend'),
  'unlabeledOwnVirtualXid',count(*) filter(where state is null and own_virtual_xid),
  'idleExtensionProcesses',count(*) filter(where state is null and backend_type<>'client backend'
    and xact_start is null and not own_virtual_xid),
  'preparedTransactions',(select count(*) from pg_prepared_xacts where database=current_database())
) from activity;`

export function campaignDrainFacts(error) {
  if (error?.message !== 'DISPOSABLE_CAMPAIGN_DRAIN_TIMEOUT') return {};
  const activity = error.drainActivity;
  if (!activity || !drainCountKeys.every(key => Number.isSafeInteger(activity[key]) && activity[key] >= 0)) {
    return { drainProbe: 'UNAVAILABLE' };
  }
  return { drainActivity: Object.fromEntries(drainCountKeys.map(key => [key, activity[key]])) };
}

async function drainCampaign(sql, epoch) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (campaignCall(sql, 'attest_drain', epoch) === 't') return;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const error = Error('DISPOSABLE_CAMPAIGN_DRAIN_TIMEOUT');
  // This extra observation only diagnoses a timeout. It cannot authorize drain.
  try { error.drainActivity = JSON.parse(sql(drainActivityQuery)); } catch {}
  throw error;
}

function campaignCall(sql, operation, ...values) {
  return sql('select staging_campaign.' + operation + '(' + values.map(sqlLiteral).join(',') + ');');
}

function writeCampaign(sql, epoch, operation, args, command = null, attempt = null) {
  const parameters = [epoch, operation, JSON.stringify(args), command, attempt];
  return JSON.parse(sql('select public.write_staging_campaign_v1(' +
    parameters.map(value => value === null ? 'null' : sqlLiteral(value)).join(',') + ');', 'service_role'));
}

export async function qualifyTransaction({ root, sql, dump, install, onStage }) {
  const rows = await loadBatch(root);
  const predicates = stagedPredicates(rows);
  assert.equal(Object.keys(predicates).length, 15);
  onStage('reviewed-canonical-prefix');
  await replayPrefix(root, sql);
  const operation = { baselineSha256: sql(prefixDigest), writerEpoch: randomUUID(), admissionEpoch: randomUUID() };
  assert.match(operation.baselineSha256, /^[a-f0-9]{64}$/);

  const campaign = seedCampaign(sql, onStage);
  const legacy = () => sql('select public.verify_runtime_scheduler_token_v1(' +
    [scheduler, campaign.tokenHash].map(sqlLiteral).join(',') + ');');
  const token = () => sql('select encode(sha256(convert_to(to_jsonb(t)::text,\'UTF8\')),\'hex\') ' +
    'from private.runtime_scheduler_tokens t where scheduler_name=' + sqlLiteral(scheduler) + ';');
  const outbox = id => sql('select row_to_json(r) from (select status,attempt_count,completed_at from ' +
    'public.campaign_effect_commands where public_id=' + sqlLiteral(id) + ') r;');
  onStage('campaign-pre-hold-invariants');
  const outsideBefore = outbox(campaign.outside.command);
  const tokenBefore = token();
  assert.equal(legacy(), 't', 'CAMPAIGN_LEGACY_TOKEN_NOT_ACCEPTED_BEFORE_HOLD');
  onStage('campaign-install-hold');
  sql(install);
  onStage('campaign-post-hold-invariants');
  operation.campaignEpoch = sql('select epoch from staging_campaign.fence;');
  assert.equal(legacy(), 'f', 'CAMPAIGN_LEGACY_TOKEN_ACCEPTED_DURING_HOLD');
  onStage('campaign-reject-premature-resume');
  sqlError(() => campaignCall(sql, 'open_after_cutover', operation.campaignEpoch), 'CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED');
  onStage('campaign-attest-drain');
  await drainCampaign(sql, operation.campaignEpoch);
  onStage('non-campaign-fixture-interfaces');
  nonCampaignInterface(sql, operation);

  onStage('wrong-database');
  const exact = renderGuardedBatch(rows, operation);
  const target = 'qualification_wrong_target';
  sql('create database ' + target + ';');
  sql('create schema supabase_migrations; create table ' + ledger +
    '(version text primary key,name text,statements text[]);', 'postgres', target);
  sqlError(() => sql(exact, 'postgres', target), 'STAGING_PRIMARY_OR_OPERATOR_UNVERIFIED');
  assert.equal(sql('select count(*) from ' + ledger + ';', 'postgres', target), '0');
  sql('drop database ' + target + ';');

  onStage('stable-disposable-snapshots');
  // #1064 proved that the fixed key preserves the complete dump while making
  // PostgreSQL's outer psql nonce deterministic. Hash every emitted byte.
  const snapshots = () => ({
    whole: sha256(dump([])), schema: sha256(dump(['--schema-only'])),
    data: sha256(dump(['--data-only'])), scheduler: JSON.parse(sql(configuration, 'supabase_admin')),
  });
  const before = snapshots();
  assert.equal(before.scheduler.launch, 'off');
  assert.deepEqual(snapshots(), before, 'NO_OP_SNAPSHOT_UNSTABLE');

  onStage('held-and-ledger-guards');
  sqlError(() => sql(renderGuardedBatch(rows, { ...operation, admissionEpoch: randomUUID() })), 'DISPOSABLE_ADMISSION_NOT_DRAINED');
  sqlError(() => sql(renderGuardedBatch(rows, { ...operation, writerEpoch: randomUUID() })), 'DISPOSABLE_WRITER_HOLD_MISSING');
  sqlError(() => sql(renderGuardedBatch(rows, { ...operation, campaignEpoch: randomUUID() })), 'STAGING_CAMPAIGN_HOLD_MISSING');
  sqlError(() => sql(renderGuardedBatch(rows, { ...operation, baselineSha256: '0'.repeat(64) })), 'STAGING_SUFFIX_PREDECESSOR_CHANGED');
  assert.deepEqual(snapshots(), before);

  onStage('explicit-all15-rollback');
  assert(exact.endsWith('\ncommit;\n'));
  sql(exact.slice(0, -'commit;\n'.length) + 'rollback;\n');
  assert.deepEqual(snapshots(), before, 'ROLLBACK_SNAPSHOT_MISMATCH');
  assert.equal(pendingRows(JSON.parse(sql(ledgerRows))).length, 15);
  assert.equal(sql('select held and not sealed from staging_campaign.fence;'), 't');
  assert.equal(sql('select held and not sealed from staging_writer_hold.disposable_state;'), 't');

  onStage('forced-mid-batch-rollback');
  const failAfter = rows[6].version;
  const failing = bodyAtBoundary(exact, '$suffix_' + failAfter + '$]);\n',
    "do $forced$ begin raise exception 'QUALIFICATION_FORCED_MID_BATCH'; end $forced$;\n");
  sqlError(() => sql(failing), 'QUALIFICATION_FORCED_MID_BATCH');
  assert.deepEqual(snapshots(), before, 'FORCED_ROLLBACK_SNAPSHOT_MISMATCH');
  assert.equal(pendingRows(JSON.parse(sql(ledgerRows))).length, 15);

  onStage('exact-held-commit-and-identity');
  sql(exact);
  assert.equal(sql('select count(*) from ' + ledger + ';'), '483');
  assert.equal(sql(prefixDigest), operation.baselineSha256);
  const rowsAfter = JSON.parse(sql(ledgerRows));
  assert.equal(pendingRows(rowsAfter).length, 0);
  assert.equal(rowsAfter.length, 16);
  assert.equal(sql('select held and sealed and drained_at is null from staging_campaign.fence;'), 't');
  assert.equal(sql('select held and sealed from staging_writer_hold.disposable_state;'), 't');
  const committed = snapshots();
  sqlError(() => sql(exact), 'STAGING_SUFFIX_PREDECESSOR_CHANGED');
  assert.deepEqual(snapshots(), committed, 'RETRY_CHANGED_COMMITTED_STATE');
  assert.deepEqual(committed.scheduler, before.scheduler, 'SCHEDULER_CHANGED_BY_SUFFIX');

  onStage('resume-denied-until-smoke-and-fresh-drain');
  const epoch = operation.campaignEpoch;
  sqlError(() => campaignCall(sql, 'open_after_cutover', epoch), 'CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED');
  await drainCampaign(sql, epoch);
  sqlError(() => campaignCall(sql, 'open_after_cutover', epoch), 'CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED');

  onStage('held-campaign-smoke');
  const scope = campaignCall(sql, 'start_smoke', epoch, campaign.smoke.game, campaign.smoke.command, sha256(randomUUID()));
  const claimed = writeCampaign(sql, scope, 'claim_campaign_effect_commands_v1', {});
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].command_id, campaign.smoke.command);
  const { command_id, idempotency_key, game_session_id, attempt_count } = claimed[0];
  const time = new Date().toISOString();
  const notice = { p_game_session_id: game_session_id, p_idempotency_key: idempotency_key,
    p_title: 'Campaign CI', p_summary: 'Synthetic proof', p_priority: 'normal', p_display_mode: 'inbox',
    p_notification_type: 'campaign', p_published_at: time };
  sqlError(() => writeCampaign(sql, scope, 'publish_campaign_notification_v1', notice, campaign.outside.command, attempt_count),
    'CAMPAIGN_FENCE_SMOKE_SCOPE');
  writeCampaign(sql, scope, 'publish_campaign_notification_v1', notice, command_id, attempt_count);
  assert.equal(writeCampaign(sql, scope, 'complete_campaign_effect_command_v2', { p_completed_at: time },
    command_id, attempt_count), true);
  assert.deepEqual(writeCampaign(sql, scope, 'claim_campaign_effect_commands_v1', {}), []);
  assert.equal(outbox(campaign.outside.command), outsideBefore);
  assert.equal(campaignCall(sql, 'finish_smoke', epoch), 't');
  assert.equal(sql('select count(*) from staging_campaign.smoke_transactions;'), '0');
  assert.equal(legacy(), 'f');
  assert.equal(token(), tokenBefore);
  assert.equal(sql('select held and sealed and smoke_passed and drained_at is not null from staging_campaign.fence;'), 't');
  assert.equal(pendingRows(JSON.parse(sql(ledgerRows))).length, 0);

  onStage('separate-explicit-campaign-resume');
  campaignCall(sql, 'open_after_cutover', epoch);
  assert.equal(sql('select not held and sealed and opened_once from staging_campaign.fence;'), 't');
  assert.equal(legacy(), 'f');
  assert.equal(token(), tokenBefore);
  assert.equal(outbox(campaign.outside.command), outsideBefore);
  assert.equal(sql('select held and sealed from staging_writer_hold.disposable_state;'), 't');
  sqlError(() => campaignCall(sql, 'open_after_cutover', epoch), 'CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED');
  return { ledgerRowsBefore: 468, ledgerRowsAfter: 483, canonicalPrefixRows: 449, fixtureLedgerRows: 19,
    rollback: true, forcedMidBatchError: { afterVersion: failAfter, sqlState: 'P0001', rollback: true },
    wrongDatabase: true, exactCommit: true, committedRetryRejected: true,
    identities: rowsAfter.slice(1), postconditions: Object.fromEntries(Object.entries(predicates).map(([version, check]) =>
      [version, { sha256: check.sha256, passed: true }])),
    campaignFixtureSmoke: true, explicitCampaignResume: true, nonCampaignInterfaceOnly: true };
}
