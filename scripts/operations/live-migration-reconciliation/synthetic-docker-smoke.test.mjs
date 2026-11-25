import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,readdirSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {assertSyntheticContext,assertSyntheticContainer,runSyntheticDockerSmoke,SYNTHETIC_GUARD,classifySyntheticFailure,CONNECTION_CONTEXT,validateConnectionContext} from './synthetic-docker-smoke.mjs';
const sha='a'.repeat(40);
function context(temp){return {env:{GITHUB_ACTIONS:'true',GITHUB_WORKFLOW:'Database Replay',GITHUB_JOB:'replay',GITHUB_EVENT_NAME:'pull_request',GITHUB_REPOSITORY:'kohnerbouchard-star/Student-Profile',REF032_SYNTHETIC_DOCKER_SMOKE:'1',RUNNER_TEMP:temp},event:{pull_request:{base:{ref:'main'},head:{sha,repo:{full_name:'kohnerbouchard-star/Student-Profile'}}}}};}
function stub(fail){
 const calls=[];let metadata,restored=false;
 const run=(command,args,input)=>{
  calls.push({command,args,input});
  if(command==='git')return sha;
  if(args[0]==='--version')return '2.109.1';
  if(args[0]==='context')return JSON.stringify([{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}}]);
  if(args[0]==='start'){
   const config=readFileSync(path.join(args[2],'supabase/config.toml'),'utf8');const project=config.match(/^project_id = "([^"]+)"/m)[1];
   assert.deepEqual(readdirSync(path.join(args[2],'supabase/migrations')),[]);
   metadata={Name:'/supabase_db_'+project,Id:'b'.repeat(64),Image:'sha256:'+'c'.repeat(64),Config:{Image:'public.ecr.aws/supabase/postgres:17.6.1.147',Labels:{'com.supabase.cli.project':project}},State:{Running:true},Created:new Date().toISOString(),HostConfig:{NetworkMode:'synthetic_network'},NetworkSettings:{Networks:{synthetic_network:{}}}};
   if(fail==='startup')throw new Error('PRIVATE_STARTUP');return '';
  }
  if(args[0]==='inspect'){if(fail==='inventory')throw new Error('PRIVATE_INVENTORY');return JSON.stringify([metadata]);}
  if(args[0]==='network'){if(fail==='disconnect')throw new Error('PRIVATE_NETWORK');if(fail!=='retained-network')metadata.NetworkSettings.Networks={};return '';}
  if(args[0]==='stop'){if(['cleanup','restore-cleanup','create-cleanup'].includes(fail))throw new Error('PRIVATE_CLEANUP');return '';}
  if(args.includes('pg_dump')){if(fail==='dump')throw Object.assign(new Error('PRIVATE'),{status:1,stderr:'PRIVATE'});if(fail==='dump-boundary')return 'INSERT INTO private values(1);';return '-- synthetic schema-only dump\ncreate schema synthetic_probe;create schema synthetic_ledger;';}
  if(args[0]==='exec'){
   assert(args.includes('/var/run/postgresql'));assert.equal(Object.keys(metadata.NetworkSettings.Networks).length,0);
   if(input.includes(CONNECTION_CONTEXT)){if(fail==='socket')throw Object.assign(new Error('PRIVATE'),{status:2,stderr:'connection to server on socket PRIVATE failed: No such file or directory'});return JSON.stringify({unixSocket:true,roleMatches:true,databaseMatches:true,requestedDirectoryConfigured:true});}
   if(input.includes('create schema')&&['create','create-cleanup'].includes(fail))throw Object.assign(new Error('PRIVATE'),{status:3,stderr:'ERROR: 42501\nPRIVATE'});
   if(input.includes('drop schema')){restored=true;if(['restore','restore-cleanup'].includes(fail))throw new Error('PRIVATE_RESTORE');}
   if(input.includes('coalesce(json_agg')&&fail==='ledger')return 'PRIVATE';
   if(input.includes('coalesce(json_agg'))return '["synthetic-v1"]';
   if(input.includes('to_regclass')){assert(restored);return 't';}
   if(input.includes(SYNTHETIC_GUARD)){if(fail==='guard-success')return '';const e=new Error('PRIVATE_GUARD');e.status=1;e.stderr='ERROR: P0001\nPRIVATE_ROW_PAYLOAD';throw e;}
   if(input.includes('count(*) from synthetic_probe.item'))return '0';
   if(input.includes('count(*) from synthetic_ledger.migrations'))return restored&&calls.some(c=>c.input?.includes("insert into synthetic_ledger.migrations values('synthetic-v1')")&&!c.input?.includes('create schema'))?'1':'0';
   return '';
  }
  throw new Error('Unexpected synthetic test command');
 };return {run,calls};
}
test('synthetic PR context rejects protected main impersonation, forks and external settings',()=>{
 const f=context('/tmp/test');assertSyntheticContext(f.env,f.event,sha);
 for(const key of ['DOCKER_HOST','SUPABASE_ACCESS_TOKEN','PHASE15_CAPTURE_DIR','PGHOST','SUPABASE_DB_PASSWORD'])assert.throws(()=>assertSyntheticContext({...f.env,[key]:'PRIVATE'},f.event,sha));
 for(const patch of [{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_WORKFLOW:'Econovaria Staging Schema Rehearsal'},{GITHUB_JOB:'other'}])assert.throws(()=>assertSyntheticContext({...f.env,...patch},f.event,sha));
 const foreign=structuredClone(f.event);foreign.pull_request.head.repo.full_name='other/repo';assert.throws(()=>assertSyntheticContext(f.env,foreign,sha));
});
test('synthetic lifecycle orders real-command plan and rejects unsafe boundaries',()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'synthetic-plan-'));
 try{
  for(const failure of [undefined,'startup','inventory','disconnect','restore','guard-success','cleanup','restore-cleanup','retained-network']){
   const f=context(temp),s=stub(failure);const result=runSyntheticDockerSmoke({...f,run:s.run});
   assert.equal(result.status,failure?'FAILED':'PASS',failure);
   assert.equal(result.fullStagingQualification,false);assert(!JSON.stringify(result).includes('PRIVATE'));
   if(!failure){assert(result.guardRejected);assert(s.calls.some(c=>c.args.includes('pg_dump')));assert(s.calls.some(c=>c.input?.includes('drop schema')));}
   if(['inventory','disconnect','retained-network'].includes(failure))assert(!s.calls.some(c=>c.args[0]==='exec'));
   assert(s.calls.some(c=>c.args[0]==='stop'));
   if(failure==='restore-cleanup')assert.equal(result.stage,'synthetic-schema-restore');
  }
 }finally{rmSync(temp,{recursive:true,force:true});}
});
test('existing Database Replay PR trigger invokes smoke without live authority or hold change',()=>{
 const workflow=readFileSync('.github/workflows/database-replay.yml','utf8');
 assert(workflow.includes('      - "scripts/operations/live-migration-reconciliation/**"'));
 assert(workflow.includes("if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository"));
 assert(workflow.indexOf('Synthetic Docker startup isolation and restore smoke')<workflow.indexOf('Start disposable Postgres service'));
 assert.match(workflow,/live-shaped-rehearsal:[\s\S]*?if: >-\n      false &&/);
 const source=readFileSync('scripts/operations/live-migration-reconciliation/synthetic-docker-smoke.mjs','utf8');
 assert(!source.includes('run-captured-staging-purge-fixture'));assert(!source.includes('eecvbssdvarfcykcfrny'));assert(!source.includes('cgiukdjwicykrmtkhudh'));
 assert(!source.includes('PHASE15_RECONSTRUCT_PURGE_FIXTURE'));
});

test('native synthetic schema dump/restore reaches its own guard (not Docker)',{skip:!(process.env.REF032_EMBEDDED_MODULE&&process.env.REF032_PG_BIN)&&'Portable PostgreSQL server/client tools required'},async()=>{
 const {default:EmbeddedPostgres}=await import(process.env.REF032_EMBEDDED_MODULE);
 const {execFileSync}=await import('node:child_process');
 const {SYNTHETIC_SCHEMA}=await import('./synthetic-docker-smoke.mjs');
 const dir=mkdtempSync(path.join(tmpdir(),'synthetic-native-'));const port=57663;
 const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'db'),port,user:'postgres',password:'synthetic-only',persistent:false,postgresFlags:['-k','','-h','127.0.0.1'],onLog:()=>{},onError:()=>{},autoRehydrateSymlinks:true});
 let client;
 try{
  await pg.initialise();await pg.start();client=pg.getPgClient('postgres','127.0.0.1');await client.connect();await client.query(SYNTHETIC_SCHEMA);
  const env={PATH:process.env.PATH,PGPASSWORD:'synthetic-only'};
  const dump=execFileSync(path.join(process.env.REF032_PG_BIN,'pg_dump'),['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','--schema-only','--schema=synthetic_probe','--schema=synthetic_ledger','--no-publications','--no-subscriptions'],{env,encoding:'utf8',timeout:10000});
  assert(!/^(COPY|INSERT INTO) /m.test(dump));await client.query('drop schema synthetic_probe cascade;drop schema synthetic_ledger cascade');
  execFileSync(path.join(process.env.REF032_PG_BIN,'psql'),['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-Xq','-v','ON_ERROR_STOP=1'],{env,input:dump,encoding:'utf8',timeout:10000,stdio:['pipe','pipe','pipe']});
  assert.equal((await client.query('select count(*)::int as n from synthetic_ledger.migrations')).rows[0].n,0);
  await client.query("insert into synthetic_ledger.migrations values('synthetic-v1')");
  await assert.rejects(client.query(SYNTHETIC_GUARD),e=>e.code==='P0001'&&e.message==='SYNTHETIC_RESTORE_GUARD');
  assert.equal((await client.query('select count(*)::int as n from synthetic_probe.item')).rows[0].n,0);
  assert.equal((await client.query('select count(*)::int as n from synthetic_ledger.migrations')).rows[0].n,1);
 }finally{await client?.end();if(pg.process?.exitCode===null)await pg.stop();rmSync(dir,{recursive:true,force:true});}
});

test('container identity, ownership, image, freshness and egress must all match',()=>{
 const project='ref032_synthetic_'+'a'.repeat(16),time=Date.now();
 const good={Name:'/supabase_db_'+project,Id:'b'.repeat(64),Image:'sha256:'+'c'.repeat(64),State:{Running:true},Created:new Date(time).toISOString(),Config:{Image:'public.ecr.aws/supabase/postgres:17.6.1.147',Labels:{'com.supabase.cli.project':project}},HostConfig:{NetworkMode:'synthetic_network'},NetworkSettings:{Networks:{}}};
 assert.equal(assertSyntheticContainer(good,project,time,true),good.Id);
 for(const change of [c=>c.Name='/other',c=>c.Config.Labels['com.supabase.cli.project']='other',c=>c.Config.Image='untrusted/image',c=>c.HostConfig.NetworkMode='host',c=>c.HostConfig.NetworkMode='container:other',c=>c.NetworkSettings.Networks={bridge:{}},c=>c.Created=new Date(time-1).toISOString(),c=>c.Id='invalid']){const value=structuredClone(good);change(value);assert.throws(()=>assertSyntheticContainer(value,project,time,true));}
});

test('capture boundaries retain fixed primary stage and never expose command payloads',()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'synthetic-boundaries-'));
 try{for(const [failure,stage,kind] of [['socket','synthetic-socket-context','socket-unavailable'],['create','synthetic-schema-create','command'],['create-cleanup','synthetic-schema-create','command'],['dump','synthetic-schema-dump','command'],['dump-boundary','synthetic-dump-boundary','assertion'],['ledger','synthetic-ledger-read','structured-output']]){
 const s=stub(failure),result=runSyntheticDockerSmoke({...context(temp),run:s.run});assert.equal(result.status,'FAILED');assert.equal(result.stage,stage);assert.equal(result.exitKind,kind);assert(!JSON.stringify(result).includes('PRIVATE'));if(failure==='create')assert.equal(result.sqlState,'42501');
 }}finally{rmSync(temp,{recursive:true,force:true});}
});
test('diagnostic projection is allowlisted and context is boolean-only',()=>{
 for(const error of [new Error('PRIVATE'),Object.assign(new Error('PRIVATE'),{status:3,stderr:'ERROR: XX999\nPRIVATE'}),Object.assign(new Error('PRIVATE'),{code:'ETIMEDOUT',status:-1})]){const result=classifySyntheticFailure(error);assert(!JSON.stringify(result).includes('PRIVATE'));assert.equal(result.sqlState,null);}
 assert.throws(()=>validateConnectionContext('{"unixSocket":"PRIVATE"}'));
 assert.throws(()=>validateConnectionContext('{"unixSocket":true,"roleMatches":true,"databaseMatches":true,"requestedDirectoryConfigured":true,"payload":"PRIVATE"}'));
});

test('real local missing-socket attempt stays bounded even with empty client diagnostics',{skip:!process.env.REF032_PG_BIN&&'Portable client required'},async()=>{
 const {execFileSync}=await import('node:child_process');const dir=mkdtempSync(path.join(tmpdir(),'synthetic-no-socket-'));
 try{let error;try{execFileSync(path.join(process.env.REF032_PG_BIN,'psql'),['-h',dir,'-p','57663','-U','postgres','-d','postgres','-XqAt','-c','select 1'],{timeout:3000,encoding:'utf8',env:{PATH:process.env.PATH,LC_ALL:'C'},stdio:['ignore','pipe','pipe']});}catch(e){error=e;}
 assert(error);const result=classifySyntheticFailure(error);assert(['socket-unavailable','command'].includes(result.exitKind));assert.equal(result.exitCode,2);assert(!JSON.stringify(result).includes(dir));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
