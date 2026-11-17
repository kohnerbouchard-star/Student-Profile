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
 async function contend(first,second){
  const tag=`fx_race_${randomUUID().replaceAll('-','')}`,a=session(`${tag}_a`),b=session(`${tag}_b`);
  try{
   a.write(`begin;\n${first}\n\\echo HOLDER_READY`);
   await until(()=>a.output.includes('HOLDER_READY'),'holder ready');
   b.write(second);b.end();
   await until(()=>sql(`select count(*) from pg_stat_activity where application_name='${tag}_b' and wait_event_type='Lock'`) === '1','contender blocked');
   a.write('commit;');a.end();let timer;
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
  sql(`update public.game_sessions set provisioning_status='ready',provisioned_at=clock_timestamp() where id='${game}';`);
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
  const resumed=await contend(resume+`select next_due_at from private.fx_runtime_state where game_session_id='${game}';`,bootstrap);
  assert.equal(sql(`select next_due_at from private.fx_runtime_state where game_session_id='${game}'`),resumed[0].output.trim(),'replay must preserve resume boundary');
  assert.equal(sql(`select current_fixing_id from private.fx_runtime_state where game_session_id='${game}'`),pointer);
  console.log('FX_BOOTSTRAP_AND_PAUSE_RACES_PASSED');
 }finally{for(const child of sessions)child.kill();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runFxRaces();
