import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import { createStagingCampaignRpc, stagingFenceEnabled } from '../../../backend/supabase/functions/campaign-orchestrator/infrastructure/stagingFenceClient.ts';

const sourceRef = 'b62f10ffda169fd6f884cc3a254c136fbd6b862d';
const supportPath = process.argv[2];
assert(supportPath && process.env.STAGING_SUFFIX_SYNTHETIC_PG_BIN, 'Pass the reviewed #1064 native helper and verified PG17 bin path');
assert.equal(createHash('sha256').update(readFileSync(supportPath)).digest('hex'),
  '3088df576ac77bb412feb458c50ad729faf961f25f9191dec49a4dc510ed355e');
const { withSyntheticPostgres } = await import(pathToFileURL(supportPath).href);
const readMigration = filename => execFileSync('git', ['show', sourceRef + ':backend/supabase/migrations/' + filename], {
  encoding: 'utf8', env: { PATH: '/usr/bin:/bin', GIT_NO_LAZY_FETCH: '1' }, timeout: 10000,
});
function routine(filename, name) {
  const sql = readMigration(filename);
  const start = sql.indexOf('create or replace function public.' + name + '(');
  const body = sql.indexOf('$function$', start);
  const end = sql.indexOf('$function$;', body + '$function$'.length);
  assert(start >= 0 && body > start && end > body, name);
  return sql.slice(start, end + '$function$;'.length);
}

const inputs = {
  verify_runtime_scheduler_token_v1: '20260813090000_add_durable_license_issuance_queue_v1.sql',
  configure_campaign_runtime_scheduler_v1: '20260920081800_phase15_reassert_campaign_market_routines_v1.sql',
  claim_campaign_effect_commands_v1: '20260721107000_add_campaign_control_and_outbox_v1.sql',
  complete_campaign_effect_command_v1: '20260721107000_add_campaign_control_and_outbox_v1.sql',
  fail_campaign_effect_command_v1: '20260721107000_add_campaign_control_and_outbox_v1.sql',
  publish_campaign_market_event_v1: '20260920081800_phase15_reassert_campaign_market_routines_v1.sql',
  publish_campaign_notification_v1: '20260920081800_phase15_reassert_campaign_market_routines_v1.sql',
  apply_campaign_store_scarcity_v1: '20260920081800_phase15_reassert_campaign_market_routines_v1.sql',
  apply_world_route_state_v1: '20260812114500_fix_world_runtime_revision_ambiguity_v1.sql',
  execute_campaign_event_atomic_v2: '20260818121200_fix_campaign_event_trigger_key_v2.sql',
};
const seedSQL = readFileSync(new URL('native-fixture.sql', import.meta.url), 'utf8');
const install = readFileSync(new URL('install.sql', import.meta.url), 'utf8');
const inverse = readFileSync(new URL('abort-before-suffix.sql', import.meta.url), 'utf8');
const nonce = readMigration('20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1.sql').replaceAll('\r\n', '\n').trim();
const ack = readMigration('20261009000000_fence_campaign_effect_acknowledgements_v2.sql');
const eventRepair = readMigration('20260818121300_fix_campaign_event_revision_ambiguity_v2.sql');
const text = value => "'" + String(value).replaceAll("'", "''") + "'";
const json = value => text(JSON.stringify(value)) + '::jsonb';
const game = '00000000-0000-4000-8000-000000000001';
const otherGame = '00000000-0000-4000-8000-000000000002';
const campaign = '00000000-0000-4000-8000-000000000003';
const campaignId = 'cmp_' + '3'.repeat(32);
const player = '00000000-0000-4000-8000-000000000004';
const smokeGame = '00000000-0000-4000-8000-000000000005';
const smokeCampaign = '00000000-0000-4000-8000-000000000006';
const smokeCommand = 'cec_' + '7'.repeat(32);
const smokeHash = '2'.repeat(64);
const token = '1'.repeat(64);
const time = '2026-11-26T05:00:00Z';
const later = '2026-11-26T05:06:01Z';
const worker = 'econovaria-campaign-runtime-scheduler-v1';
const role = "set role service_role; ";
const oldVerify = scheduler => role + "select public.verify_runtime_scheduler_token_v1(" + text(scheduler) + "," + text(token) + ");";
const authorize = role + "select public.authorize_staging_campaign_worker_v1(" + text(token) + ");";
const notifyV1 = key => role + "select public.publish_campaign_notification_v1(" +
  text(game) + "," + text(key) + ",'Synthetic','Synthetic','normal','inbox','notice'," + text(time) + ");";
const routeV1 = (key, revision) => role + "select command_outcome from public.apply_world_route_state_v1(" +
  text(game) + "," + revision + "," + text(key) + ",'[\"rte_synthetic\"]','restricted','shortage',10000,10000," + text(time) + ");";
const eventArgs = (staff, revision = 0, phase = 'arrival', next = 'opportunity') => ({
  p_game_session_id: game, p_campaign_public_id: campaignId, p_expected_revision: revision,
  p_event_key: 'synthetic.event.' + revision, p_trigger_key: staff ? 'manual:synthetic' : 'scheduler:synthetic',
  p_expected_phase: phase, p_next_phase: next, p_complete_campaign: false, p_prerequisite_event_keys: [],
  p_effect_commands: [{ effectKind: 'notify_players', idempotencyKey: 'synthetic:event:' + revision, payload: {} }],
  p_next_scheduled_at: later, p_actor_staff_user_id: staff, p_reason: 'synthetic', p_occurred_at: time,
});
const eventV1 = args => role + 'select execution_outcome from public.execute_campaign_event_atomic_v2(' +
  Object.entries(args).map(([key, value]) => {
    if (value === null) return 'null';
    if (key === 'p_effect_commands' || key === 'p_prerequisite_event_keys') return json(value);
    return typeof value === 'string' ? text(value) : String(value);
  }).join(',') + ');';
const write = (epoch, op, args, id = null, attempt = null, actor = role) => actor + 'select public.write_staging_campaign_v1(' +
  text(epoch) + ',' + text(op) + ',' + json(args) + ',' + (id === null ? 'null' : text(id)) + ',' + (attempt ?? 'null') + ');';
const claim = (epoch, now = time) => write(epoch, 'claim_campaign_effect_commands_v1', { p_limit: 100, p_claimed_at: now });

function psql(port, name) {
  const bin = process.env.STAGING_SUFFIX_SYNTHETIC_PG_BIN;
  const env = {
    PATH: bin + ':/usr/bin:/bin', LC_ALL: 'C', PGCONNECT_TIMEOUT: '3',
    PGOPTIONS: '-c statement_timeout=15000', PGAPPNAME: name,
    ...(process.env.LD_LIBRARY_PATH ? { LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH } : {}),
  };
  const child = spawn(bin + '/psql', ['-h','127.0.0.1','-p',port,'-U','postgres','-d','postgres','-XqAt','-v','ON_ERROR_STOP=1'],
    { env, stdio: ['pipe','pipe','pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.resume();
  child.stdin.on('error', () => {});
  const done = new Promise(resolve => {
    child.on('error', () => resolve(99));
    child.on('close', exit => resolve(exit));
  });
  return { child, done, stdout: () => output.trim() };
}
async function waitFor(check) {
  for (let i = 0; i < 100; i += 1) {
    if (check()) return;
    await delay(25);
  }
  throw Error('Synthetic transaction synchronization failed');
}

await withSyntheticPostgres(async ({ sql }) => {
  const run = query => sql('postgres', query).trim();
  const reject = (query, why) => sql('postgres', query, true, why);
  run(seedSQL);
  run(Object.entries(inputs).map(([name, file]) => routine(file, name)).join('\n'));
  run(eventRepair);
  run("insert into supabase_migrations.schema_migrations values ('20260921044500',array[" + text(nonce) + "]);");
  run("insert into private.runtime_scheduler_tokens(scheduler_name, token_sha256) values (" + text(worker) + "," + text(token) + "),('other-scheduler'," + text(token) + ");" +
    "insert into public.game_sessions values (" + text(game) + ",'active','active','ready');" +
    "insert into public.campaign_instances values (" + text(campaign) + "," + text(campaignId) + "," + text(game) + ",'active','arrival',0,0);" +
    "insert into public.players values (" + text(player) + "," + text(game) + ",'active');" +
    "insert into public.game_session_item_supply values (" + text(game) + ",'*','item-example','available',1,null,null,null,1);" +
    "insert into public.world_runtime_instances values (" + text(game) + ",0);" +
    "insert into public.world_route_states values (" + text(game) + ",'rte_synthetic','open','normal',10000,10000,0,null);");
  run("insert into public.game_sessions values ("+text(smokeGame)+",'active','active','pending','Campaign fence synthetic smoke');"+
    "insert into public.campaign_instances(id,public_id,game_session_id,status,pack_id) values ("+text(smokeCampaign)+","+text('cmp_'+'6'.repeat(32))+","+text(smokeGame)+",'active','campaign-fence-smoke-local');"+
    "insert into public.campaign_effect_commands(public_id,game_session_id,campaign_instance_id,idempotency_key,effect_kind,payload,status,attempt_count) values("+
    [text(smokeCommand),text(smokeGame),text(smokeCampaign),"'campaign:fixture'","'notify_players'","'{}'","'pending'",'0'].join(',')+");");
  const keys = new Map([
    ['publish_news','campaign:market'], ['apply_market_shock','campaign:shock'], ['notify_players','campaign:notify'],
    ['set_store_scarcity','campaign:scarcity'], ['set_route_state','admin:older-campaign-route'],
  ]);
  for (const [kind, key] of keys) {
    run("insert into public.campaign_effect_commands(game_session_id,campaign_instance_id,idempotency_key,effect_kind,payload,status,attempt_count) values(" +
      text(game) + "," + text(campaign) + "," + text(key) + "," + text(kind) + ",'{}','pending',0);");
  }
  assert.equal(run(oldVerify(worker)), 't');
  const catalog = () => run("select jsonb_agg(jsonb_build_array(oid,proname,md5(pg_get_functiondef(oid)),(select jsonb_agg(to_jsonb(grant_row) order by grant_row.grantee,grant_row.grantor) from aclexplode(coalesce(proacl,acldefault('f',proowner))) grant_row)) order by oid) from pg_proc where pronamespace='public'::regnamespace and proname in (" +
    Object.keys(inputs).map(text).join(',') + ');');
  const tokenRow = () => run("select md5(to_jsonb(tokens)::text) from private.runtime_scheduler_tokens tokens where scheduler_name=" + text(worker) + ";");
  const originalCatalog = catalog();
  const originalToken = tokenRow();
  const abort = epoch => inverse.replace(":'fence_epoch'",text(epoch));

  const port = run('show port;');
  assert(/^\d+$/.test(port) && Number(port) >= 20000);
  const blocker = psql(port, 'stage-fence-test-blocker');
  let entered;
  try {
    blocker.child.stdin.write("begin; lock table public.notifications in share mode; select 'READY';\n");
    await waitFor(() => blocker.stdout() === 'READY');
    entered = psql(port, 'stage-fence-test-admitted');
    entered.child.stdin.end(notifyV1('synthetic:already-entered') + '\n');
    await waitFor(() => run("select exists(select 1 from pg_locks l join pg_stat_activity a using(pid) " +
      "where a.application_name='stage-fence-test-admitted' and l.relation='public.notifications'::regclass " +
      "and l.mode='RowExclusiveLock' and not l.granted);") === 't');
    run(install);
    let epoch = run('select epoch from staging_campaign.fence;');
    assert.equal(run(oldVerify(worker)), 'f');
    assert.equal(tokenRow(), originalToken);
    assert.equal(run(oldVerify('other-scheduler')), 't');
    assert.equal(run(authorize), '');
    assert.equal(run('select staging_campaign.attest_drain(' + text(epoch) + ');'), 'f');
    assert.equal(run('select held and drained_at is null from staging_campaign.fence;'), 't');
    reject(notifyV1('synthetic:late-old-worker'), 'permission denied');
    reject(routeV1('admin:held', 0), 'CAMPAIGN_STAGING_HELD');
    reject(eventV1(eventArgs(player)), 'CAMPAIGN_STAGING_HELD');
    reject('update public.campaign_instances set revision=9;', 'CAMPAIGN_STAGING_HELD');
    reject(claim(epoch), 'CAMPAIGN_STAGING_HELD');
    blocker.child.stdin.end('commit;\n');
    assert.equal(await blocker.done, 0);
    assert.equal(await entered.done, 0);
    assert.equal(JSON.parse(entered.stdout()).outcome, 'applied');
    assert.equal(run('select staging_campaign.attest_drain(' + text(epoch) + ');'), 't');
    reject(role + 'select staging_campaign.open_after_cutover(' + text(epoch) + ');', 'permission denied');
    reject(abort('00000000-0000-4000-8000-000000000099'), 'CAMPAIGN_FENCE_ABORT_NOT_SAFE');
    run("insert into supabase_migrations.schema_migrations values ('20261004145731', array['synthetic partial suffix']);");
    reject(abort(epoch), 'CAMPAIGN_FENCE_ABORT_NOT_SAFE');
    run("delete from supabase_migrations.schema_migrations where version='20261004145731';");
    run(abort(epoch));
    assert.equal(catalog(), originalCatalog);
    assert.equal(tokenRow(), originalToken);
    assert.equal(run(oldVerify(worker)), 't');
    assert.equal(run("select to_regnamespace('staging_campaign') is null;"), 't');
    run(install);
    const previousEpoch = epoch;
    epoch = run('select epoch from staging_campaign.fence;');
    assert.notEqual(epoch, previousEpoch);
    assert.equal(run('select staging_campaign.attest_drain(' + text(epoch) + ');'), 't');
    reject('select staging_campaign.seal_v2(' + text(epoch) + ');', 'CAMPAIGN_FENCE_V2_ACKNOWLEDGEMENTS_MISSING');
    run(ack);
    reject(abort(epoch), 'CAMPAIGN_FENCE_ABORT_NOT_SAFE');
    run('select staging_campaign.seal_v2(' + text(epoch) + ');');
    assert.equal(run('select staging_campaign.attest_drain(' + text(epoch) + ');'), 't');
    const scoped=run("select staging_campaign.start_smoke("+[epoch,smokeGame,smokeCommand,smokeHash].map(text).join(',')+");");
    assert.equal(run(authorize),'');
    assert.deepEqual(JSON.parse(run(role+"select public.authorize_staging_campaign_worker_v1("+text(smokeHash)+");")),{epoch:scoped,smoke:true});
    assert.equal(JSON.parse(run(claim(scoped))).length,1);
    assert.equal(run("select count(*) from public.campaign_effect_commands where game_session_id="+text(game)+" and status='pending';"),'5');
    const notify={p_game_session_id:smokeGame,p_idempotency_key:'campaign:fixture',p_title:'Synthetic',p_summary:'Synthetic',
      p_priority:'normal',p_display_mode:'inbox',p_notification_type:'notice',p_published_at:time};
    reject(write(scoped,'publish_campaign_notification_v1',{...notify,p_game_session_id:game},smokeCommand,1),'CAMPAIGN_FENCE_CLAIM_LOST');
    run(write(scoped,'publish_campaign_notification_v1',notify,smokeCommand,1));
    assert.equal(run(write(scoped,'complete_campaign_effect_command_v2',{p_completed_at:time},smokeCommand,1)),'true');
    reject('select staging_campaign.open_after_cutover('+text(epoch)+');','CAMPAIGN_FENCE_SMOKE_OR_DRAIN_REQUIRED');
    assert.equal(run('select staging_campaign.finish_smoke('+text(epoch)+');'),'t');
    assert.equal(run(role+"select public.authorize_staging_campaign_worker_v1("+text(smokeHash)+");"),'');
    run('select staging_campaign.open_after_cutover(' + text(epoch) + ');');
    assert.deepEqual(JSON.parse(run(authorize)),{epoch,smoke:false});
    assert.equal(run(oldVerify(worker)), 'f');

    reject(role + "select * from public.claim_campaign_effect_commands_v1(1," + text(time) + ");", 'permission denied');
    reject(notifyV1('synthetic:late-old-worker'), 'permission denied');
    reject(role + "select public.publish_campaign_market_event_v1(" + text(game) + ",'legacy:key','Synthetic','Synthetic','policy','global',null,'neutral',0,2," + text(time) + ");", 'permission denied');
    reject(role + "select public.apply_campaign_store_scarcity_v1(" + text(game) + ",'legacy:key','effect.example',array['item-example'],'scarce',1.5,null," + text(time) + ");", 'permission denied');
    reject(routeV1(keys.get('set_route_state'), 0), 'CAMPAIGN_FENCE_GENERATION_REQUIRED');
    reject(eventV1(eventArgs(null)), 'CAMPAIGN_FENCE_GENERATION_REQUIRED');
    assert.equal(run(routeV1('admin:local-proof', 0)), 'applied');
    assert.equal(run(routeV1('story_route:local-proof', 1)), 'applied');
    assert.equal(run(eventV1(eventArgs(player))), 'executed');
    assert.equal(JSON.parse(run(write(epoch, 'execute_campaign_event_atomic_v2', eventArgs(null, 1, 'opportunity','rivalry'))))[0].execution_outcome, 'executed');

    const initial = JSON.parse(run(claim(epoch)));
    assert.equal(initial.length, 7);
    const claims = new Map(initial.map(row => [row.effect_kind + ':' + row.idempotency_key, row]));
    const argsByKind = {
      publish_news: ['publish_campaign_market_event_v1', { p_headline:'Synthetic',p_explanation:'Synthetic',p_category:'policy',p_scope:'global',p_sentiment:'neutral',p_magnitude_basis_points:0,p_duration_ticks:2,p_published_at:time }],
      apply_market_shock: ['publish_campaign_market_event_v1', { p_headline:'Synthetic',p_explanation:'Synthetic',p_category:'policy',p_scope:'global',p_sentiment:'negative',p_magnitude_basis_points:-100,p_duration_ticks:2,p_published_at:time }],
      notify_players: ['publish_campaign_notification_v1', { p_title:'Synthetic',p_summary:'Synthetic',p_priority:'normal',p_display_mode:'inbox',p_notification_type:'notice',p_published_at:time }],
      set_store_scarcity: ['apply_campaign_store_scarcity_v1', { p_definition_id:'effect.example',p_item_keys:['item-example'],p_scarcity_band:'scarce',p_event_multiplier:1.5,p_expires_at:null,p_applied_at:time }],
      set_route_state: ['apply_world_route_state_v1', { p_expected_revision:2,p_public_route_ids:['rte_synthetic'],p_status:'closed',p_reason:'shortage',p_cost_multiplier_basis_points:10000,p_duration_multiplier_basis_points:10000,p_applied_at:time }],
    };
    const newEpoch = run('select staging_campaign.hold(' + text(epoch) + ');');
    assert.notEqual(newEpoch, epoch);
    assert.equal(run('select staging_campaign.attest_drain(' + text(newEpoch) + ');'), 't');
    run('select staging_campaign.open_after_cutover(' + text(newEpoch) + ');');
    assert.deepEqual(JSON.parse(run(authorize)),{epoch:newEpoch,smoke:false});
    const first = initial[0];
    reject(write(newEpoch, argsByKind[first.effect_kind][0], {
      p_game_session_id: game, p_idempotency_key: first.idempotency_key,
    }, first.command_id, 1), 'CAMPAIGN_FENCE_CLAIM_LOST');
    assert.equal(stagingFenceEnabled(undefined, 'https://unchanged.example', undefined), false);
    assert.throws(() => stagingFenceEnabled('v1', 'https://cgiukdjwicykrmtkhudh.supabase.co/', 'cgiukdjwicykrmtkhudh_example_1'));
    assert.throws(() => stagingFenceEnabled('v1', 'https://eecvbssdvarfcykcfrny.supabase.co/', undefined));
    assert.equal(stagingFenceEnabled('v1', 'https://eecvbssdvarfcykcfrny.supabase.co/', 'eecvbssdvarfcykcfrny_example_1'), true);
    const adapter = createStagingCampaignRpc(newEpoch, async (name, args) => {
      assert.equal(name, 'write_staging_campaign_v1');
      return { error: null, data: JSON.parse(run(write(
        args.p_epoch, args.p_operation, args.p_args, args.p_command_id, args.p_attempt,
      ))) };
    });
    await assert.rejects(adapter('unsupported_rpc', {}), /outside the staging fence/);
    const claimed = await adapter('claim_campaign_effect_commands_v1', { p_limit: 100, p_claimed_at: later });
    const retried = new Map(claimed.data.map(row => [row.effect_kind + ':' + row.idempotency_key, row]));
    assert.equal(retried.size, claims.size);
    for (const [kind, key] of keys) {
      const row = retried.get(kind + ':' + key);
      assert.equal(row.attempt_count, 2);
      const [op, fields] = argsByKind[kind];
      const args = { ...fields, p_game_session_id: game, [kind === 'set_route_state' ? 'p_command_key' : 'p_idempotency_key']: key };
      reject(write(epoch, op, args, row.command_id, 2), 'CAMPAIGN_FENCE_EPOCH_CHANGED');
      reject(write(newEpoch, op, args, row.command_id, 1), 'CAMPAIGN_FENCE_CLAIM_LOST');
      reject(write(newEpoch, op, { ...args, p_game_session_id: otherGame }, row.command_id, 2), 'CAMPAIGN_FENCE_CLAIM_LOST');
      reject(write(newEpoch, op, args, row.command_id, 2, 'set role authenticated; '), 'permission denied');
      const delivered = (await adapter(op, args)).data;
      assert.equal(Array.isArray(delivered) ? delivered[0].command_outcome : delivered.outcome, 'applied');
      const replay = (await adapter(op, args)).data;
      assert.equal(Array.isArray(replay) ? replay[0].command_outcome : replay.outcome, 'replayed');
      const done = 'complete_campaign_effect_command_v2';
      assert.equal(run(write(newEpoch, done, { p_completed_at: time }, row.command_id, 1)), 'false');
      assert.equal(run(write(newEpoch, done, { p_completed_at: time }, row.command_id, 2)), 'true');
      assert.equal(run(write(newEpoch, done, { p_completed_at: later }, row.command_id, 2)), 'true');
      assert.equal(run("select completed_at=" + text(time) + "::timestamptz from public.campaign_effect_commands where public_id=" + text(row.command_id) + ';'), 't');
    }
    const failRow = [...retried.values()].find(row => row.idempotency_key === 'synthetic:event:0');
    assert.equal(run(write(newEpoch,'fail_campaign_effect_command_v2',{p_error_code:'synthetic.failure'},failRow.command_id,1)), 'false');
    assert.equal(run(write(newEpoch,'fail_campaign_effect_command_v2',{p_error_code:'synthetic.failure'},failRow.command_id,2)), 'true');
    run("delete from public.campaign_effect_commands where idempotency_key='admin:older-campaign-route';");
    reject(routeV1('admin:older-campaign-route', 3), 'CAMPAIGN_FENCE_GENERATION_REQUIRED');
    assert.equal(run("select count(*) from public.stock_market_events;"), '2');
    assert.equal(run("select count(*) from public.notifications;"), '3');
    assert.equal(run("select version from public.game_session_item_supply;"), '2');
    assert.equal(run("select revision from public.world_runtime_instances;"), '3');
    console.log(JSON.stringify({
      source: sourceRef, actualEffectRpcs: 4, actualEffectKinds: 5, heldScopedSmoke: true, stagingClientRoutesNativeEffects: true, heldDrainRejectedActiveRpc: true,
      drainObservedAfterOldTransaction: true, oldAdmissionAndWritesRejected: true,
      explicitResumeWithImmutableV2: true, staleEpochAndAttemptRejected: true, duplicateDeliveryAndAckPreserved: true,
      manualAndScheduledEventStillWork: true, adminAndStorylineRouteKeysStillWork: true,
      deletedCampaignRouteKeyStillFenced: true, abortRestoresExactRoutineCatalog: true, untouchedTokenRow: true, syntheticOnly: true,
    }));
  } finally {
    if (blocker.child.exitCode === null) blocker.child.kill();
    if (entered?.child.exitCode === null) entered.child.kill();
  }
});
