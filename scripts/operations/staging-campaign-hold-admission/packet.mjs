// Offline assembly for the standalone, reviewed pre-suffix Campaign installer.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { APPROVED_SUFFIXES } from '../live-migration-reconciliation/build-phase15-rehearsal-plan.mjs';

export const stageRef = 'eecvbssdvarfcykcfrny';
const nonce = APPROVED_SUFFIXES[0];
const ledger = 'supabase_migrations.schema_migrations';
const lit = text => "'" + text.replaceAll("'", "''") + "'";
function pinned(name, sha1) {
  const bytes = readFileSync(new URL(name, import.meta.url));
  const digest = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
  assert.equal(digest, sha1, 'PINNED_CAMPAIGN_PACKET_CHANGED');
  return bytes.toString('utf8');
}
const install = pinned('./install.sql', '905a3ca4599893b41fe733151cd4a74590032168');
const abort = pinned('./abort-before-suffix.sql', '7f46cdd2b27b101c01b383df208ed6ac2086070c');
const routineTuples = [...install.matchAll(/^ *\('(public\.[a-z0-9_]+\([^']*\))','([a-f0-9]{64})'\)/gm)]
  .slice(0, 10).map(([, name, hash]) => [name, hash]);
assert.equal(routineTuples.length, 10);
assert.equal(new Set(routineTuples.map(row=>row[0])).size, 10);
const routineValues = routineTuples.map(row => '(' + row.map(lit).join(',') + ')').join(',');
const approvedPrimary = "current_database()='postgres' and current_user='postgres' and session_user=current_user and not pg_is_in_recovery()";
const exactNonce = "exists(select 1 from " + ledger + " where version=" + lit(nonce.version) +
  " and name=" + lit(nonce.name) + " and cardinality(statements)=1 and encode(sha256(convert_to(statements[1],'UTF8')),'hex')=" +
  lit(nonce.sourceSha256) + ")";
const ledgerBoundary = '(select count(*) from ' + ledger + ")=468 and " + exactNonce +
  ' and not exists(select 1 from ' + ledger + ' where version>' + lit(nonce.version) + ')';
const absent = "to_regnamespace('staging_campaign') is null and " +
  "to_regprocedure('public.complete_campaign_effect_command_v2(text,timestamptz,integer)') is null and " +
  "to_regprocedure('public.fail_campaign_effect_command_v2(text,text,integer)') is null";
const originalRoutines = "(select count(*)=10 from (values " + routineValues +
  ") e(signature,sha) join pg_proc p on p.oid=to_regprocedure(e.signature) where p.prosecdef " +
  "and p.proowner=current_user::regrole and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=e.sha " +
  "and not exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where a.grantor<>p.proowner))";
const token = "(select count(*)=1 from private.runtime_scheduler_tokens where scheduler_name='econovaria-campaign-runtime-scheduler-v1')";
const controlsAbsent = "to_regnamespace('staging_writer_hold') is null and to_regnamespace('staging_writer_admission') is null";
export const outputs = [
  'transactionReadOnly', 'primaryOperator', 'ledgerBoundary', 'campaignAbsent',
  'originalCampaignRoutinesMatch', 'exactSchedulerTokenRow', 'drainObserverAvailable', 'nonCampaignAbsent',
];

export function readinessSql() {
  return [
    'begin transaction read only;',
    'set local search_path=pg_catalog,pg_temp;',
    "set local statement_timeout='8s';",
    "set local lock_timeout='2s';",
    "select json_build_object('transactionReadOnly',current_setting('transaction_read_only')='on', " +
      "'primaryOperator'," + approvedPrimary + ",'ledgerBoundary'," + ledgerBoundary +
      ",'campaignAbsent'," + absent + ",'originalCampaignRoutinesMatch'," + originalRoutines +
      ",'exactSchedulerTokenRow'," + token + ",'drainObserverAvailable',pg_has_role('pg_read_all_stats','USAGE')," +
      "'nonCampaignAbsent'," + controlsAbsent + ");",
    'rollback;',
  ].join('\n') + '\n';
}

const digestExpression = "(select encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(m) order by m.version collate \"C\")," +
  "'[]'::jsonb)::text,'UTF8')),'hex') from " + ledger + " m)";

export function ledgerFingerprintSql() {
  return 'begin transaction read only;\nselect ' + digestExpression + ';\nrollback;\n';
}

// Assembly only. This file never opens a database connection.
export function renderCampaignInstall(project, expectedLedgerSha256) {
  assert.equal(project, stageRef);
  assert.match(expectedLedgerSha256, /^[a-f0-9]{64}$/);
  const opening = '\nbegin;\n';
  assert.equal(install.split(opening).length, 2);
  assert(install.endsWith('\ncommit;\n'));
  const before = [
    "set local search_path=pg_catalog,pg_temp;",
    "set local lock_timeout='5s';",
    "set local statement_timeout='120s';",
    'lock table supabase_migrations.schema_migrations in share mode;',
    'do $carrier_before$ begin if (' + [approvedPrimary, ledgerBoundary, absent,
      digestExpression + '=' + lit(expectedLedgerSha256)].join(') and (') +
      ") is distinct from true then raise exception 'STAGING_CAMPAIGN_INSTALL_BASELINE_CHANGED'; end if; end $carrier_before$;",
  ].join('\n');
  const after = [
    'do $carrier_after$ begin if (' + digestExpression + '=' + lit(expectedLedgerSha256) +
      " and exists(select 1 from staging_campaign.fence where singleton and held and not sealed and not opened_once)" +
      " and (select count(*) from staging_campaign.original_rpcs)=10) is distinct from true" +
      " then raise exception 'STAGING_CAMPAIGN_INSTALL_POSTCONDITION_FAILED'; end if; end $carrier_after$;",
  ].join('\n');
  const source = install.replace(opening, opening + before + '\n');
  return '\\set ON_ERROR_STOP on\n' + source.slice(0, -'commit;\n'.length) + after + '\ncommit;\n';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length === 3 && process.argv[2] === 'inspect') console.log(readinessSql().trimEnd());
    else if (process.argv.length === 3 && process.argv[2] === 'fingerprint') console.log(ledgerFingerprintSql().trimEnd());
    else {
      assert(process.argv.length === 5 && process.argv[2] === 'assemble');
      console.log(renderCampaignInstall(process.argv[3], process.argv[4]).trimEnd());
    }
  } catch {
    console.error('STAGING_CAMPAIGN_PACKET_REJECTED');
    process.exitCode = 1;
  }
}

const attestBody = /create function staging_campaign\.attest_drain[\s\S]*?as \$\$([\s\S]*?)\$\$;/.exec(install)[1];
const attestHash = createHash('sha256').update(attestBody).digest('hex');

export function renderOperationSql(op) {
  assert.equal(op.projectRef,stageRef);
  assert(['install','abort'].includes(op.type));
  assert.match(op.ledgerSha256,/^[a-f0-9]{64}$/);
  const {startsAt,endsAt} = op.maintenance;
  for (const boundary of [startsAt,endsAt]) assert.equal(new Date(boundary).toISOString(),boundary);
  const window = 'clock_timestamp() >= ' + lit(startsAt) + '::timestamptz and clock_timestamp() < ' + lit(endsAt) + '::timestamptz';
  const unchanged = digestExpression + '=' + lit(op.ledgerSha256);
  const check = (label, conditions) => 'do $' + label + '$ begin if (' +
    conditions.map(condition=>'(' + condition + ')').join(' and ') + ') is distinct from true then ' +
    "raise exception '" + label.toUpperCase() + "'; end if; end $" + label + '$;\n';
  const setup = "set local search_path=pg_catalog,pg_temp;\nset local lock_timeout='5s';\nset local statement_timeout='120s';\n";
  const baseline = [approvedPrimary, "current_setting('transaction_read_only')='off'", window, ledgerBoundary, unchanged,
    token, "pg_has_role('pg_read_all_stats','USAGE')"];
  const guard = setup + 'lock table ' + ledger + ' in share mode;\n' +
    check('campaign_operation_baseline_changed',baseline);
  const suffixAbsent = "to_regprocedure('public.complete_campaign_effect_command_v2(text,timestamptz,integer)') is null and " +
    "to_regprocedure('public.fail_campaign_effect_command_v2(text,text,integer)') is null";
  let original, before, after, success;
  if (op.type === 'install') {
    original = renderCampaignInstall(op.projectRef,op.ledgerSha256).replace(/^\\set ON_ERROR_STOP on\n/,'');
    before = guard + check('campaign_install_source_changed',[absent, originalRoutines]);
    after = check('campaign_install_window_closed',[window]);
    success = 'CAMPAIGN_HOLD_INSTALLED';
  } else {
    assert.match(op.heldEpochSha256,/^[a-f0-9]{64}$/);
    const exactFence = 'singleton and held and not opened_once and not sealed ' +
      "and encode(sha256(convert_to(epoch::text,'UTF8')),'hex')=" + lit(op.heldEpochSha256);
    const pinnedAttest = "exists(select 1 from pg_proc p where p.oid=to_regprocedure('staging_campaign.attest_drain(uuid)')" +
      " and p.proowner=current_user::regrole and not p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=" +
      lit(attestHash) + ')';
    original = abort;
    before = guard + check('campaign_abort_setup_changed',[suffixAbsent,pinnedAttest,
      'exists(select 1 from staging_campaign.fence where ' + exactFence + ' for update)']) +
      'select epoch::text as fence_epoch from staging_campaign.fence where ' + exactFence + '\n\\gset\n' +
      check('campaign_abort_drain_unproven',['staging_campaign.attest_drain((select epoch from staging_campaign.fence))']);
    after = check('campaign_abort_postcondition_failed',[window, unchanged, absent, originalRoutines, token]);
    success = 'CAMPAIGN_HOLD_ABORTED';
  }
  assert.equal(original.split('\nbegin;\n').length,2);
  assert(original.endsWith('\ncommit;\n'));
  const guarded = original.replace('\nbegin;\n','\nbegin;\n' + before);
  return { sql:'\\set ON_ERROR_STOP on\n' + guarded.slice(0,-'commit;\n'.length) + after +
    'commit;\nselect ' + lit(success) + ';\n', success };
}
