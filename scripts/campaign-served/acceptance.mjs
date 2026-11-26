import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
const DB='postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const runtimeId=process.env.RUNTIME_CONTAINER_ID||'',databaseId=process.env.DATABASE_CONTAINER_ID||'';
assert(/^[a-f0-9]{64}$/.test(runtimeId)&&/^[a-f0-9]{64}$/.test(databaseId));
const inspect=id=>JSON.parse(execFileSync('docker',['inspect',id],{encoding:'utf8'}))[0];
const runtime=inspect(runtimeId),database=inspect(databaseId);
assert.equal(runtime.Config.Labels['campaign-ci-owner'],process.env.GITHUB_RUN_ID+'-'+process.env.GITHUB_RUN_ATTEMPT);
assert.equal(database.Config.Labels['com.supabase.cli.project'],'econovaria');assert.equal(database.Name,'/supabase_db_econovaria');
const nets=Object.values(runtime.NetworkSettings.Networks);assert.equal(nets.length,1);
assert.equal(JSON.parse(execFileSync('docker',['network','inspect',nets[0].NetworkID],{encoding:'utf8'}))[0].Internal,true);
assert(Object.values(database.NetworkSettings.Networks).some(n=>n.NetworkID===nets[0].NetworkID));
assert(/^172\.(1[6-9]|2[0-9]|3[01])\.[0-9]+\.[0-9]+$/.test(nets[0].IPAddress));
const ENDPOINT='http://'+nets[0].IPAddress+':9000/';
assert.equal(process.env.CAMPAIGN_DISPOSABLE,'1');
assert.equal(process.env.DATABASE_URL,DB);
const q=s=>"'"+String(s).replaceAll("'","''")+"'";
const sql=s=>execFileSync('docker',['exec',databaseId,'env','-u','PGSERVICE','-u','PGHOSTADDR','PGOPTIONS=-c statement_timeout=15000 -c lock_timeout=5000','psql','-U','postgres','-d','postgres','-X','-qAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-c',s],{env:{PATH:process.env.PATH},encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
const json=s=>JSON.parse(sql(s));
const uid=()=>randomUUID(),staff=uid(),game=uid(),campaign=uid(),publicId='cmp_'+campaign.replaceAll('-','');
const pack='campaign-ci-'+uid(),scheduler='econovaria-campaign-runtime-scheduler-v1';
const token=uid().replaceAll('-','')+uid().replaceAll('-','');
const tokenHash=createHash('sha256').update(token).digest('hex');
const checks={};let seeded=false,failed=false;let stage='seed';
async function invoke(method='POST',authorized=true) {
 const response=await fetch(ENDPOINT,{method,headers:authorized?{'x-econovaria-scheduler-token':token}:{},redirect:'error',signal:AbortSignal.timeout(15000)});
 return {status:response.status,body:await response.json()};
}
const command=()=>json(`select row_to_json(r) from (select public_id,status,attempt_count,last_error_code,completed_at from public.campaign_effect_commands where game_session_id=${q(game)} order by created_at desc,public_id desc limit 1)r`);
function event(name,definition){
 const effect=[{effectKind:'notify_players',idempotencyKey:'campaign-ci:'+name+':'+game,payload:{audience:'all_players',notificationDefinitionId:definition}}];
 sql(`select * from public.execute_campaign_event_atomic_v2(${q(game)},${q(publicId)},(select revision from public.campaign_instances where id=${q(campaign)}),${q(name)},${q(name)},(select current_phase from public.campaign_instances where id=${q(campaign)}),'opportunity',false,'[]'::jsonb,${q(JSON.stringify(effect))}::jsonb,'2099-01-01',null,null,clock_timestamp());`);
}
function definition(id){sql(`insert into public.campaign_effect_definitions(pack_id,pack_version,definition_id,effect_kind,payload) values(${q(pack)},'1',${q(id)},'notify_players','{"title":"Campaign CI","summary":"Synthetic proof","priority":"normal","displayMode":"inbox","notificationType":"campaign"}');`);}
try {
 assert.equal(sql('select count(*) from public.campaign_effect_commands'),'0');
 assert.equal(sql(`select count(*) from private.runtime_scheduler_tokens where scheduler_name=${q(scheduler)}`),'0');
 seeded=true;
 sql(`begin; insert into private.runtime_scheduler_tokens(scheduler_name,token_sha256) values(${q(scheduler)},${q(tokenHash)});
 insert into public.staff_users(id,supabase_auth_user_id,email,display_name) values(${q(staff)},${q(uid())},${q(staff+'@example.test')},'Campaign served CI');
 insert into public.game_sessions(id,owner_staff_user_id,name,status,lifecycle_state,provisioning_status) values(${q(game)},${q(staff)},'Campaign served CI','active','active','pending');
 insert into public.campaign_instances(id,public_id,game_session_id,pack_id,pack_version,definition_id,definition_digest,status,scheduled_at) values(${q(campaign)},${q(publicId)},${q(game)},${q(pack)},'1','campaign-ci',repeat('a',64),'active','2099-01-01'); commit;`);
 assert.equal((await invoke('GET',false)).status,405);assert.equal((await invoke('POST',false)).status,401);checks.authorization=true;
 stage='v2-complete';definition('ci-success');event('ci-success','ci-success');
 let r=await invoke();assert.equal(r.status,200);assert.equal(r.body.effects.completedCount,1);assert.equal(command().status,'completed');checks.v2Complete=true;
 const completed=command().completed_at;r=await invoke();assert.equal(r.body.effects.claimedCount,0);assert.equal(command().completed_at,completed);checks.completionReplay=true;
 stage='v2-fail';event('ci-retry','ci-missing');r=await invoke();assert.equal(r.body.effects.failedCount,1);assert.equal(command().status,'failed');assert.equal(command().attempt_count,1);checks.v2Fail=true;
 stage='retry';definition('ci-missing');r=await invoke();assert.equal(r.body.effects.completedCount,1);assert.equal(command().status,'completed');assert.equal(command().attempt_count,2);checks.retry=true;
 // Deterministic synthetic generation replacement at the real destination transaction.
 // This tests real worker stale acknowledgement, not a real overlapping cloud invocation.
 stage='stale-generation';sql(`create function public.campaign_ci_generation_probe() returns trigger language plpgsql as $$ begin
 if new.game_session_id=${q(game)}::uuid then update public.campaign_effect_commands set attempt_count=attempt_count+1 where game_session_id=new.game_session_id and status='processing'; end if; return new; end $$;
 create trigger campaign_ci_generation_probe before insert on public.notifications for each row execute function public.campaign_ci_generation_probe();`);
 event('ci-stale','ci-success');r=await invoke();assert.equal(r.body.effects.completedCount,0);assert.equal(r.body.effects.failures[0].errorCode,'campaign_effect_lease_lost');
 assert.equal(command().status,'processing');assert.equal(command().attempt_count,2);checks.staleGeneration=true;
 sql('drop trigger campaign_ci_generation_probe on public.notifications; drop function public.campaign_ci_generation_probe();');
 stage='stale-retry';const before=sql(`select count(*) from public.notifications where game_session_id=${q(game)}`);
 sql(`update public.campaign_effect_commands set claimed_at=clock_timestamp()-interval '6 minutes' where game_session_id=${q(game)} and status='processing';`);
 r=await invoke();assert.equal(r.body.effects.completedCount,1);assert.equal(command().attempt_count,3);
 assert.equal(sql(`select count(*) from public.notifications where game_session_id=${q(game)}`),before);checks.staleRetryIdempotency=true;
 } catch(error) {failed=true;const text=String(error.stderr||'');
 checks.failureClass=/ERROR:\s+([0-9A-Z]{5}):/.exec(text)?.[1]||(text.includes('could not connect')?'local-connection':'assertion-or-runtime');
}
finally {
 try {if(seeded){sql(`begin; drop trigger if exists campaign_ci_generation_probe on public.notifications; drop function if exists public.campaign_ci_generation_probe();
 delete from public.currency_exchange_rates where game_session_id=${q(game)};
 delete from public.game_sessions where id=${q(game)} and owner_staff_user_id=${q(staff)} and name='Campaign served CI';
 delete from public.campaign_effect_definitions where pack_id=${q(pack)};
 delete from private.runtime_scheduler_tokens where scheduler_name=${q(scheduler)} and token_sha256=${q(tokenHash)};
 delete from public.staff_users where id=${q(staff)} and email=${q(staff+'@example.test')} and display_name='Campaign served CI';commit;`);
 assert.equal(sql(`select count(*) from public.campaign_effect_commands where game_session_id=${q(game)}`),'0');checks.fixtureCleanup=true;}}
 catch{failed=true;}
 console.log(JSON.stringify({status:failed?'FAILED':'PASS',stage,syntheticOnly:true,checks,hostedModified:false,providerBundleAttested:false,releaseCertificate:false}));
}
if(failed)process.exitCode=1;
