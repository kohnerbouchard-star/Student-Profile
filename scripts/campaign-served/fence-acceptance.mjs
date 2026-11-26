import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { APPROVED_SUFFIXES } from '../operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs';
import { stripOuterTransaction } from '../operations/live-migration-reconciliation/build-phase15-forward-bundle.mjs';
import { batchDigest, loadBatch, pendingRows, renderAtomicBatch } from '../operations/staging-suffix-qualification/compiler.mjs';
import { BASELINE_PROBE, predicates } from '../operations/staging-suffix-qualification/postconditions.mjs';

const migrations = 'backend/supabase/migrations';
const fence = 'scripts/operations/staging-campaign-fence';
const install = readFileSync(fence + '/install.sql','utf8');
const inverse = readFileSync(fence + '/abort-before-suffix.sql','utf8');
const quote = s => "'" + String(s).replaceAll("'", "''") + "'";
const digest = s => createHash('sha256').update(s).digest('hex');
const noop = () => {};
const batchSize = 15;
const nonceVersion = APPROVED_SUFFIXES[0].version;
const ledgerSql = "select jsonb_agg(jsonb_build_object('version',version,'name',name,'sha256',encode(sha256(convert_to(statements[1],'UTF8')),'hex'),'statementCount',cardinality(statements)) order by version) from supabase_migrations.schema_migrations where version>='" + nonceVersion + "';";

export function holdBoundBatch(sql, epoch) {
  assert.match(epoch, /^[a-f0-9-]{36}$/);
  const lock = 'lock table supabase_migrations.schema_migrations in exclusive mode;';
  assert.equal(sql.split(lock).length, 2);
  return sql.replace(lock, lock + "\ndo $held$ begin if not exists(" +
    "select 1 from staging_campaign.fence where held and not sealed and drained_at is not null and epoch=" +
    quote(epoch) + "::uuid for update) then raise exception 'CAMPAIGN_FENCE_NOT_DRAINED'; end if; end $held$;");
}

export async function replayPrefix(sql, onStage = noop) {
  onStage('disable-disposable-scheduler');
  sql("alter system set cron.launch_active_jobs=off; select pg_reload_conf();", 'supabase_admin');
  for (let attempt = 0; attempt < 10; attempt++) {
    if (sql("select current_setting('cron.launch_active_jobs');") === 'off') break;
    if (attempt === 9) throw Error('DISPOSABLE_CRON_NOT_FENCED');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  onStage('canonical-prefix');
  sql('create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');
  assert.equal(sql('select count(*) from supabase_migrations.schema_migrations;'),'0');
  const prefix = readdirSync(migrations).filter(f => f.endsWith('.sql') && f.slice(0,14) <= nonceVersion).sort();
  assert.equal(prefix.length,449);
  for (const file of prefix) {
    const source = readFileSync(migrations + '/' + file,'utf8').replaceAll('\r\n','\n').trim();
    const body = stripOuterTransaction(source,file).body;
    sql('begin;' + body + '\ninsert into supabase_migrations.schema_migrations values(' +
      quote(file.slice(0,14)) + ',' + quote(file.slice(15,-4)) + ',array[' + quote(source) + ']);commit;');
  }
  assert.equal(pendingRows(JSON.parse(sql(ledgerSql))).length,batchSize);
  sql(BASELINE_PROBE);
}

export async function qualifyFence({sql,invoke,tokenHash,fixtureGame,fixtureCommand,outsiderCommand,onStage = noop}) {
  const rows = await loadBatch(process.cwd());
  const checks = {};
  const call = (name,epoch) => sql('select staging_campaign.' + name + '(' + quote(epoch) + ');');
  const oldVerify = () => sql("select public.verify_runtime_scheduler_token_v1('econovaria-campaign-runtime-scheduler-v1'," + quote(tokenHash) + ");");
  const tokenRow = () => sql("select md5(to_jsonb(t)::text) from private.runtime_scheduler_tokens t where scheduler_name='econovaria-campaign-runtime-scheduler-v1';");
  const outbox = id => JSON.parse(sql("select jsonb_build_object('state',status,'attempt',attempt_count,'completedAt',completed_at) from public.campaign_effect_commands where public_id=" + quote(id) + ";"));
  const originalToken = tokenRow();
  assert.match(originalToken,/^[a-f0-9]{32}$/);
  const digestOfLedger = () => digest(sql(ledgerSql));
  const originalLedger = digestOfLedger();
  const catalog = () => sql("select encode(sha256(convert_to(jsonb_agg(jsonb_build_array(oid,pg_get_functiondef(oid),(select jsonb_agg(to_jsonb(a) order by a.grantee,a.grantor) from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) order by oid)::text,'UTF8')),'hex') from pg_proc p where pronamespace='public'::regnamespace and proname in ('verify_runtime_scheduler_token_v1','apply_world_route_state_v1','claim_campaign_effect_commands_v1','publish_campaign_notification_v1','execute_campaign_event_atomic_v2');");
  const originalCatalog = catalog();
  const drain = async epoch => {
    for (let i=0;i<24;i+=1) {
      if (call('attest_drain',epoch) === 't') return;
      await new Promise(resolve => setTimeout(resolve,500));
    }
    const activity=JSON.parse(sql("select jsonb_build_object('trackedTransactions',count(*) filter(where xact_start is not null),"+
      "'disabledActivity',count(*) filter(where state='disabled'),'unknownClients',count(*) filter(where state is null and backend_type='client backend'),"+
      "'idleExtensionProcesses',count(*) filter(where state is null and backend_type<>'client backend' and not exists("+
      "select 1 from pg_locks l where l.pid=a.pid and l.locktype='virtualxid' and l.mode='ExclusiveLock' and l.granted and l.virtualxid=l.virtualtransaction)),"+
      "'preparedTransactions',(select count(*) from pg_prepared_xacts where database=current_database())) from pg_stat_activity a "+
      "where datname=current_database() and pid<>pg_backend_pid();"));
    console.log(JSON.stringify({status:'FAILED',stage:'disposable-drain',activity,syntheticOnly:true}));
    throw Error('DISPOSABLE_DRAIN_TIMEOUT');
  };
  const expectSqlFailure = (work, code) => assert.throws(work,e => String(e.stderr ?? '').includes(code));

  onStage('held-before-suffix');
  const before = outbox(outsiderCommand);
  const fxBefore = outbox(fixtureCommand);
  assert.equal(before.state,'pending');
  assert.equal(fxBefore.state,'pending');
  assert.equal(oldVerify(),'t');
  sql(install);
  let epoch = sql('select epoch from staging_campaign.fence;');
  assert.equal(oldVerify(),'f');
  assert.equal((await invoke()).status,401);
  onStage('held-before-suffix-preserves-token-and-commands');
  assert.equal(tokenRow(),originalToken);
  assert.deepEqual(outbox(outsiderCommand),before);
  onStage('held-before-suffix-denies-premature-open');
  expectSqlFailure(() => call('open_after_cutover',epoch),'CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED');
  onStage('held-before-suffix-drain');
  await drain(epoch);
  checks.heldPreSuffix=true;

  onStage('abort-before-suffix');
  expectSqlFailure(() => sql(inverse.replace(":'fence_epoch'",quote(randomBytes(16).toString('hex')))),
    'CAMPAIGN_FENCE_ABORT_NOT_SAFE');
  sql(inverse.replace(":'fence_epoch'",quote(epoch)));
  assert.equal(oldVerify(),'t');
  assert.equal(sql("select to_regnamespace('staging_campaign') is null;"),'t');
  assert.equal(catalog(),originalCatalog);
  assert.equal(tokenRow(),originalToken);
  assert.equal(digestOfLedger(),originalLedger);
  checks.abortExactCatalogRestored=true;

  onStage('held-exact-suffix');
  const earlierEpoch=epoch;
  sql(install);
  epoch=sql('select epoch from staging_campaign.fence;');
  assert.notEqual(earlierEpoch,epoch);
  await drain(epoch);
  const review=predicates(rows);
  sql(holdBoundBatch(renderAtomicBatch(rows,review,'rollback'),epoch));
  assert.equal(digestOfLedger(),originalLedger);
  checks.heldRollback=true;
  sql(holdBoundBatch(renderAtomicBatch(rows,review,'apply'),epoch));
  assert.equal(pendingRows(JSON.parse(sql(ledgerSql))).length,0);
  assert.equal(sql('select held from staging_campaign.fence;'),'t');
  assert.equal((await invoke()).status,401);
  expectSqlFailure(() => sql(inverse.replace(":'fence_epoch'",quote(epoch))),'CAMPAIGN_FENCE_ABORT_NOT_SAFE');
  call('seal_v2',epoch);
  await drain(epoch);
  checks.exactSuffixApplied=rows.length;

  onStage('held-fixture-only-smoke');
  const smokeToken=randomBytes(32).toString('hex');
  const smokeEpoch=sql('select staging_campaign.start_smoke(' +
    [epoch,fixtureGame,fixtureCommand,digest(smokeToken)].map(quote).join(',') + ');');
  assert.notEqual(smokeEpoch,epoch);
  assert.equal((await invoke()).status,401);
  const smoked=await invoke('POST',smokeToken);
  assert.equal(smoked.status,200);
  assert.equal(smoked.body.scheduler,null);
  assert.equal(smoked.body.effects.claimedCount,1);
  assert.equal(smoked.body.effects.completedCount,1);
  assert.equal(outbox(fixtureCommand).state,'completed');
  assert.deepEqual(outbox(outsiderCommand),before);
  const replayed=await invoke('POST',smokeToken);
  assert.equal(replayed.status,200);
  assert.equal(replayed.body.effects.claimedCount,0);
  expectSqlFailure(() => call('open_after_cutover',epoch),'CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED');
  assert.equal(call('finish_smoke',epoch),'t');
  assert.equal((await invoke('POST',smokeToken)).status,401);
  assert.equal((await invoke()).status,401);
  checks.heldSmokeScopedAndClosed=true;

  onStage('held-attestation');
  assert.equal(sql("select held and sealed and smoke_passed and drained_at is not null from staging_campaign.fence;"),'t');
  assert.equal(sql('select count(*) from staging_campaign.smoke_transactions;'),'0');
  assert.equal(tokenRow(),originalToken);
  const receipt={
    sourceCommit:process.env.CAMPAIGN_HEAD_SHA, artifactSha256:process.env.CAMPAIGN_ARTIFACT_SHA256,
    batchDigest, ledgerSha256:digestOfLedger(), held:true, smokeRecorded:true,
    syntheticOnly:true, releaseQualified:false, applyAuthorized:false,
  };
  assert.match(receipt.sourceCommit,/^[a-f0-9]{40}$/);
  assert.match(receipt.artifactSha256,/^[a-f0-9]{64}$/);
  checks.receipt=receipt;
  checks.receiptSha256=digest(JSON.stringify(receipt));

  onStage('explicit-resume');
  call('open_after_cutover',epoch);
  assert.equal(sql('select not held and opened_once from staging_campaign.fence;'),'t');
  assert.equal(oldVerify(),'f');
  checks.explicitResume=true;
  return checks;
}
