// PR-only disposable qualification. Not a recovery or remote database tool.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,statSync,readdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export function assertFxRaceEnvironment(env,sha,event,context,container,project,checkoutTime){
 assert.equal(env.GITHUB_ACTIONS,'true');
 assert.equal(env.GITHUB_EVENT_NAME,'pull_request');
 assert.equal(env.GITHUB_REPOSITORY,'kohnerbouchard-star/Student-Profile');
 const pr=event.pull_request;
 assert.equal(pr.number,1005);assert.equal(pr.draft,true);
 assert.equal(pr.head.ref,'fix/fx-bootstrap-temporal-provenance');
 assert.equal(pr.base.ref,'main');
 assert.equal(pr.head.repo.full_name,env.GITHUB_REPOSITORY);
 assert.equal(pr.base.repo.full_name,env.GITHUB_REPOSITORY);
 assert.match(sha,/^[a-f0-9]{40}$/);assert.equal(sha,pr.head.sha);
 for(const key of ['DATABASE_URL','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','DOCKER_HOST','DOCKER_CONTEXT'])assert(!env[key],`External connection forbidden: ${key}`);
 assert.equal(context.Endpoints.docker.Host,'unix:///var/run/docker.sock');
 assert.equal(container.State.Running,true);
 assert.match(container.Id,/^[a-f0-9]{64}$/);
 assert.match(container.Image,/^sha256:[a-f0-9]{64}$/);
 assert.equal(container.Config.Labels['com.supabase.cli.project'],project);
 assert.match(container.Config.Image,/^(public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.6\.1\.143$/);
 assert(Number.isFinite(checkoutTime)&&Date.parse(container.Created)>=checkoutTime,'Preexisting database forbidden');
 return container.Id;
}
// Reuse the reviewed neutral fixture renderer, not invented fixing rows.
// The real apply RPC recomputes and validates the complete lease-bound result.
export function renderFxRaceApply(source,game){
 assert.match(game,/^[a-f0-9-]{36}$/);
 const start=source.indexOf('create temporary table fx_apply_request on commit drop as');
 const end=source.indexOf('create temporary table fx_apply_before on commit drop as',start);
 assert(start>0&&end>start,'Canonical renderer markers missing');
 const rendered=source.slice(start,end).replaceAll('fx_story_claim','fx_race_claim').replaceAll('fx_loaded_input','fx_race_input')
  .replaceAll('${sqlLiteral(fixture.gameOneId)}',`'${game}'`);
 assert(!rendered.includes('${'),'Unresolved renderer interpolation');
 return rendered;
}
export function readFxResumeBoundary(output){
 const values=output.split('\n').filter(line=>line.startsWith('{')).map(line=>JSON.parse(line));
 assert.equal(values.length,1,'Expected exactly one tagged resume boundary');
 assert.equal(typeof values[0].resumeDue,'string');
 assert(values[0].resumeDue.length>0,'Resume must restore a due boundary');
 return values[0].resumeDue;
}
export async function runFxRaces(){
 const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:30000}).trim();
 const sha=run('git',['rev-parse','HEAD']);
 assert.equal(run('git',['status','--porcelain','--untracked-files=all']),'','Exact-head source must be clean');
 const head=statSync(run('git',['rev-parse','--git-path','HEAD']));assert(head.isFile());
 const project=readFileSync('backend/supabase/config.toml','utf8').match(/^project_id = "([\w-]+)"$/m)?.[1];assert(project);
 const id=assertFxRaceEnvironment(process.env,sha,JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),
  JSON.parse(run('docker',['context','inspect']))[0],JSON.parse(run('docker',['inspect',`supabase_db_${project}`]))[0],project,head.mtimeMs);
 const args=['exec','-i',id,'psql','-U','supabase_admin','-d','postgres','-X','-q','-t','-A','-v','ON_ERROR_STOP=1'];
 const sql=input=>execFileSync('docker',args,{input:`set statement_timeout='15s';set lock_timeout='10s';\n${input}`,encoding:'utf8',timeout:20000}).trim();
 const versions=readdirSync('backend/supabase/migrations').filter(n=>/^\d+_.+\.sql$/.test(n)).map(n=>n.split('_')[0]).sort();
 assert.deepEqual(sql('select version from supabase_migrations.schema_migrations order by version').split('\n').filter(Boolean),versions);
 const sessions=new Set();
 function session(name){
  const child=spawn('docker',args,{stdio:['pipe','pipe','pipe']});sessions.add(child);
  let output='',errors='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>errors+=b);
  const done=new Promise(resolve=>child.once('close',code=>{sessions.delete(child);resolve({code,output,errors});}));
  child.stdin.write(`set application_name='${name}';set statement_timeout='20s';set lock_timeout='15s';set idle_in_transaction_session_timeout='30s';\n`);
  return {child,done,get output(){return output;},write:s=>child.stdin.write(s+'\n'),end:()=>child.stdin.end()};
 }
 async function until(test,label){const end=Date.now()+10000;while(Date.now()<end){if(test())return;await new Promise(r=>setTimeout(r,25));}throw Error(`Timed out: ${label}`);}
 async function contend(first,second,afterBlocked=''){
  const tag=`fx_race_${randomUUID().replaceAll('-','')}`,a=session(`${tag}_a`),b=session(`${tag}_b`);
  try{
   a.write(`begin;\n${first}\n\\echo HOLDER_READY`);
   await until(()=>a.output.includes('HOLDER_READY'),'holder ready');
   b.write(second);b.end();
   await until(()=>sql(`select count(*) from pg_stat_activity where application_name='${tag}_b' and wait_event_type='Lock'`) === '1','contender blocked');
   a.write(afterBlocked+'\ncommit;');a.end();let timer;
   const results=await Promise.race([Promise.all([a.done,b.done]),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Completion timeout')),25000);})]).finally(()=>clearTimeout(timer));
   for(const result of results)assert.equal(result.code,0,result.errors);
   return results;
  }finally{
   try{sql(`select pg_terminate_backend(pid) from pg_stat_activity where application_name in('${tag}_a','${tag}_b') and pid<>pg_backend_pid()`);}
   finally{for(const s of [a,b]){s.child.stdin.destroy();s.child.kill();}}
  }
 }
 const staff=randomUUID(),game=randomUUID();
 // Committed synthetic rows are confined to the verified disposable stack.
 // Immutable economic rows are never deleted or modified for cleanup: CI
 // destroys the whole stack without backup, including on assertion failure.
 try{
  sql(`begin;
   insert into public.staff_users(id,supabase_auth_user_id,email,display_name) values('${staff}','${randomUUID()}','fx-race-${staff}@example.invalid','FX concurrency fixture');
   insert into public.game_sessions(id,owner_staff_user_id,name,lifecycle_state,provisioning_status,created_at,started_at) values('${game}','${staff}','FX concurrency fixture','active','pending',clock_timestamp()-interval '3 days',clock_timestamp()-interval '3 days');
   insert into public.game_settings(game_session_id,stock_market_window) values('${game}','{"timezone":"UTC"}');
   insert into public.country_economic_snapshots(game_session_id,country_profile_id,snapshot_sequence,effective_at,snapshot_label,difficulty_policy_profile_id,difficulty_preset,metadata,created_at)
   select '${game}',c.id,0,now()-interval '2 days','FX concurrency fixture',d.id,d.preset_key,'{}',now()-interval '2 days'
   from public.country_profiles c join public.difficulty_policy_profiles d on d.preset_key='standard' where c.status='active';
   commit;`);
  const pausedGame=randomUUID();
  sql(`begin;
   insert into public.game_sessions(id,owner_staff_user_id,name,lifecycle_state,provisioning_status) values('${pausedGame}','${staff}','FX initially paused fixture','paused','pending');
   insert into public.game_settings(game_session_id,stock_market_window) values('${pausedGame}','{"timezone":"UTC"}');
   insert into public.country_economic_snapshots(game_session_id,country_profile_id,snapshot_sequence,effective_at,snapshot_label,difficulty_policy_profile_id,difficulty_preset,metadata,created_at)
   select '${pausedGame}',country_profile_id,snapshot_sequence,effective_at,snapshot_label,difficulty_policy_profile_id,difficulty_preset,metadata,created_at
   from public.country_economic_snapshots where game_session_id='${game}';
   commit;`);
  const initialPaused=JSON.parse(sql(`select public.initialize_fx_authority_for_game_v1('${pausedGame}',clock_timestamp(),true);`));
  assert.equal(initialPaused.outcome,'initialized');
  assert.equal(sql(`select next_due_at is null and current_fixing_id is not null from private.fx_runtime_state where game_session_id='${pausedGame}'`),'t','initial paused bootstrap must not schedule');
  const bootstrap=`select public.initialize_fx_authority_for_game_v1('${game}',clock_timestamp(),true);`;
  const results=await contend(bootstrap,bootstrap);
  const result=s=>JSON.parse(s.output.split('\n').find(line=>line.startsWith('{')));
  assert.equal(result(results[0]).outcome,'initialized');assert.equal(result(results[1]).outcome,'replayed');
  assert.equal(result(results[0]).fixingPublicId,result(results[1]).fixingPublicId);
  assert.equal(sql(`select count(*) from public.fx_fixings where game_session_id='${game}'`),'1');
  assert.equal(sql(`select count(*) from public.fx_fixing_currency_values v join public.fx_fixings f on f.id=v.fixing_id where f.game_session_id='${game}'`),'11');
  assert.equal(sql(`select count(*) from public.fx_fixing_macro_snapshots where game_session_id='${game}'`),'10');
  assert.equal(sql(`select count(*) from public.currency_exchange_rates where game_session_id='${game}'`),'0');
  sql(`update public.game_sessions set provisioning_status='ready',provisioning_pack_id='econovaria.beta-seed-pack.v1',provisioning_pack_version='1.0.0-beta',provisioning_pack_sha256=repeat('a',64),provisioning_source_game_session_id=id,provisioned_at=clock_timestamp(),provisioning_failure_code=null where id='${game}';`);
  const pointer=sql(`select current_fixing_id from private.fx_runtime_state where game_session_id='${game}'`);
  const pause=`update public.game_sessions set lifecycle_state='paused',status='disabled' where id='${game}';`;
  const resume=`update public.game_sessions set lifecycle_state='active',status='active' where id='${game}';`;
  // Both orderings exercise the actual canonical lifecycle trigger, not a
  // manufactured runtime-row update. The real ready-game resume trigger must
  // restore scheduling without replacing the canonical pointer.
  await contend(bootstrap,pause);
  assert.equal(sql(`select next_due_at is null from private.fx_runtime_state where game_session_id='${game}'`),'t','pause after replay must stop scheduling');
  sql(resume);
  await contend(pause,bootstrap);
  assert.equal(sql(`select next_due_at is null from private.fx_runtime_state where game_session_id='${game}'`),'t','replay after pause must not reschedule paused game');
  await contend(bootstrap,resume);
  const due=sql(`select next_due_at from private.fx_runtime_state where game_session_id='${game}'`);
  assert(due,'resume after replay must restore scheduling');
  sql(pause);
  const resumed=await contend(resume+`select json_build_object('resumeDue',next_due_at::text) from private.fx_runtime_state where game_session_id='${game}';`,bootstrap);
  assert.equal(sql(`select next_due_at from private.fx_runtime_state where game_session_id='${game}'`),readFxResumeBoundary(resumed[0].output),'replay must preserve resume boundary');
  assert.equal(sql(`select current_fixing_id from private.fx_runtime_state where game_session_id='${game}'`),pointer);
  // Two independent baseline games allow both worker orderings at a real
  // already elapsed fixing boundary, without future clock or immutable edits.
  for(const order of ['worker-first','bootstrap-first']){
   const workerGame=randomUUID(),purchase=randomUUID();
   sql(`begin;
    insert into public.game_sessions(id,owner_staff_user_id,name,lifecycle_state,provisioning_status,created_at,started_at) values('${workerGame}','${staff}','FX worker concurrency fixture','active','pending',now()-interval '4 days',now()-interval '4 days');
    insert into public.game_settings(game_session_id,stock_market_window) values('${workerGame}','{"timezone":"UTC"}');
    insert into public.country_economic_snapshots(game_session_id,country_profile_id,snapshot_sequence,effective_at,snapshot_label,difficulty_policy_profile_id,difficulty_preset,metadata,created_at)
    select '${workerGame}',country_profile_id,snapshot_sequence,now()-interval '3 days',snapshot_label,difficulty_policy_profile_id,difficulty_preset,metadata,now()-interval '3 days'
    from public.country_economic_snapshots where game_session_id='${game}';
    insert into public.purchase_codes(id,code_hash,status,max_redemptions,redeemed_count) values('${purchase}',encode(extensions.digest('${purchase}','sha256'),'hex'),'active',1,1);
    insert into public.entitlements(purchase_code_id,staff_user_id,game_session_id,status) values('${purchase}','${staff}','${workerGame}','active');
    select public.initialize_fx_authority_for_game_v1('${workerGame}',now()-interval '2 days',true);
    update public.game_sessions set provisioning_status='ready',provisioning_pack_id='econovaria.beta-seed-pack.v1',provisioning_pack_version='1.0.0-beta',provisioning_pack_sha256=repeat('a',64),provisioning_source_game_session_id=id,provisioned_at=clock_timestamp(),provisioning_failure_code=null where id='${workerGame}';
    -- Scheduling-only synthetic fixture setup; never touches fixing evidence,
    -- authorization time, lease ownership, or immutable exchange history.
    update private.fx_runtime_state set next_due_at=clock_timestamp()-interval '1 day' where game_session_id='${workerGame}';
    commit;`);
   const bootstrapPointer=sql(`select current_fixing_id from private.fx_runtime_state where game_session_id='${workerGame}'`);
   const replay=`select public.initialize_fx_authority_for_game_v1('${workerGame}',clock_timestamp(),false);`;
   const lock=`select 1 from private.fx_runtime_state where game_session_id='${workerGame}' for update;`;
   const worker=`
    create temporary table fx_race_claim on commit drop as select * from public.claim_due_fx_games_v1(clock_timestamp(),100,'fx-race-${order}',120) where game_session_id='${workerGame}';
    do $guard$ begin if (select count(*) from fx_race_claim)<>1 then raise exception 'FX_RACE_CLAIM_MISSING'; end if; end $guard$;
    create temporary table fx_race_input on commit drop as select loaded.* from fx_race_claim c cross join lateral public.load_fx_fixing_input_v1(c.game_session_id,c.fixing_local_date,c.lease_token) loaded;
    ${renderFxRaceApply(readFileSync('scripts/canonical-fx-authority-database.mjs','utf8'),workerGame)}
    create temporary table fx_race_applied on commit drop as select applied.* from fx_apply_request r cross join lateral public.apply_fx_fixing_v1(r.game_session_id,r.fixing_local_date,r.fixing_effective_at,r.lease_token,r.input_hash,r.calculated_at,r.fixing_result) applied;
    do $guard$ begin if not exists(select 1 from fx_race_applied where outcome='applied' and currency_values_inserted=11 and shocks_consumed=0) then raise exception 'FX_RACE_APPLY_MISSING'; end if; end $guard$;
    create temporary table fx_race_replayed on commit drop as select applied.* from fx_apply_request r cross join lateral public.apply_fx_fixing_v1(r.game_session_id,r.fixing_local_date,r.fixing_effective_at,r.lease_token,r.input_hash,r.calculated_at,r.fixing_result) applied;
    do $guard$ begin if not exists(select 1 from fx_race_replayed where outcome='replayed') then raise exception 'FX_RACE_APPLY_NOT_IDEMPOTENT'; end if; end $guard$;
    select json_build_object('pointer',current_fixing_id,'nextDue',next_due_at) from private.fx_runtime_state where game_session_id='${workerGame}';`;
   // Worker-first publishes only after replay is demonstrably blocked on the
   // runtime lock. Reverse order waits on that same row before actual claim.
   const raced=order==='worker-first'?await contend(lock,replay,worker):await contend(replay,`begin;${lock}${worker}commit;`);
   const workerResult=raced[order==='worker-first'?0:1];
   const published=JSON.parse(workerResult.output.split('\n').find(line=>line.startsWith('{')));
   assert.notEqual(published.pointer,bootstrapPointer,'worker must advance bootstrap pointer');
   const runtime=JSON.parse(sql(`select json_build_object('pointer',current_fixing_id,'nextDue',next_due_at,'lease',lease_token) from private.fx_runtime_state where game_session_id='${workerGame}'`));
   assert.equal(runtime.pointer,published.pointer,'bootstrap replay must not rewind daily pointer');
   assert.equal(runtime.nextDue,published.nextDue,'bootstrap replay must preserve worker schedule');
   assert.equal(runtime.lease,null,'successful worker must release its lease');
   if(order==='worker-first'){
    const replayResult=JSON.parse(raced[1].output.split('\n').find(line=>line.startsWith('{')));
    assert.equal(replayResult.fixingPublicId,sql(`select public_key from public.fx_fixings where id='${runtime.pointer}'`));
   }
   assert.equal(sql(`select count(*) from public.fx_fixings where game_session_id='${workerGame}' and fixing_kind='daily'`),'1','exactly one daily fixing');
   assert.equal(sql(`select count(*) from public.fx_fixing_currency_values where game_session_id='${workerGame}'`),'22');
   assert.equal(sql(`select count(*) from public.fx_fixing_macro_snapshots where game_session_id='${workerGame}'`),'20');
   assert.equal(sql(`select count(*) from public.currency_exchange_rates where game_session_id='${workerGame}'`),'0');
  }
  console.log('FX_BOOTSTRAP_AND_PAUSE_RACES_PASSED');
 }finally{for(const child of sessions)child.kill();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runFxRaces();
