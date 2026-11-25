import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { assertCapturedStagingFixture, runCapturedStagingFixture, FIXTURE_CLIENT_ENV } from './run-captured-staging-purge-fixture.mjs';
const now=Date.parse('2026-11-25T12:00:00Z');
function fixture(){return {
 env:{REF032_RECONSTRUCT_PURGE_FIXTURE:'repository-only-v1',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'kohnerbouchard-star/Student-Profile',GITHUB_WORKFLOW:'Econovaria Staging Schema Rehearsal',GITHUB_JOB:'rehearse',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/main',GITHUB_RUN_ATTEMPT:'1',GITHUB_SHA:'a'.repeat(40),PHASE15_ENVIRONMENT:'staging',PHASE15_EXPECTED_PROJECT_REF:'eecvbssdvarfcykcfrny',REF032_FIXTURE_CONTAINER_NOT_BEFORE:String(now-10000),RUNNER_TEMP:'/tmp/qualified',PHASE15_CAPTURE_DIR:'/tmp/qualified/u1/raw',PHASE15_WORK_DIR:'/tmp/qualified/u1/work'},
 context:{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}},
 container:{Id:'b'.repeat(64),Image:'sha256:'+'c'.repeat(64),Name:'/supabase_db_econovaria_phase15_staging',Created:new Date(now-5000).toISOString(),State:{Running:true},Config:{Image:'public.ecr.aws/supabase/postgres:17.6.1.147',Labels:{'com.supabase.cli.project':'econovaria_phase15_staging'}},HostConfig:{NetworkMode:'supabase_network_econovaria_phase15_staging'},NetworkSettings:{Networks:{}}}
};}
test('only exact captured staging context and fresh disconnected local Docker qualify',()=>{
 const f=fixture();assert.equal(assertCapturedStagingFixture(f.env,'a'.repeat(40),f.context,f.container,now),f.container.Id);
 const changes=[f=>f.env.REF032_RECONSTRUCT_PURGE_FIXTURE='',f=>f.env.GITHUB_WORKFLOW='Phase15 Readonly Rehearsal',f=>f.env.GITHUB_JOB='other',f=>f.env.GITHUB_EVENT_NAME='push',f=>f.env.GITHUB_RUN_ATTEMPT='2',f=>f.env.GITHUB_REF='refs/heads/feature',f=>f.env.GITHUB_SHA='d'.repeat(40),f=>f.env.PHASE15_ENVIRONMENT='production',f=>f.env.PHASE15_EXPECTED_PROJECT_REF='cgiukdjwicykrmtkhudh',f=>f.env.PHASE15_CAPTURE_DIR='/tmp/wrong',f=>f.env.PHASE15_WORK_DIR='/tmp/wrong',f=>f.env.DOCKER_HOST='tcp://remote',f=>f.env.PHASE15_REMOTE_DATABASE_URL='remote',f=>f.env.SUPABASE_ACCESS_TOKEN='fixture',f=>f.context.Endpoints.docker.Host='tcp://remote',f=>f.container.NetworkSettings.Networks={bridge:{}},f=>f.container.HostConfig.NetworkMode='host',f=>f.container.Created=new Date(now-20000).toISOString(),f=>f.container.Config.Labels['com.supabase.cli.project']='another',f=>f.container.Name='/unrelated',f=>f.container.State.Running=false];
 for(const mutate of changes){const f=fixture();mutate(f);assert.throws(()=>assertCapturedStagingFixture(f.env,'a'.repeat(40),f.context,f.container,now));}
});
test('fixture execution pins Docker ID/socket; native test prefix is literal',()=>{
 const source=readFileSync(new URL('./run-captured-staging-purge-fixture.mjs',import.meta.url),'utf8');
 assert(source.includes("'-h','/var/run/postgresql','-p','5432'"));
 assert(source.includes("'-i',id,...FIXTURE_CLIENT_ENV,'psql'"));
 assert(!source.includes("'PGHOSTADDR='"));assert(!source.includes("'PGSERVICE='"));
 const builder=readFileSync(new URL('./build-disposable-purge-control-fixture.mjs',import.meta.url),'utf8');
 assert(builder.includes("current_database() ~ '^ref032_disposable_[a-z0-9_]+$'"));
 assert(!builder.includes("like 'ref032_disposable_%'"));
 const workflow=readFileSync(new URL('../../../.github/workflows/econovaria-staging-schema-rehearsal.yml',import.meta.url),'utf8');
 assert.equal((workflow.match(/REF032_RECONSTRUCT_PURGE_FIXTURE/g)||[]).length,1);
 assert(workflow.indexOf('REF032_RECONSTRUCT_PURGE_FIXTURE')>workflow.indexOf('Restore and rehearse locally without hosted credentials'));
 const upload=workflow.slice(workflow.indexOf('Retain only bounded qualification results'));
 assert(upload.includes('/u1/sanitized/result.json'));assert(!/path:.*(?:private|raw|rehearsal.log)/.test(upload));
});

test('fixture authority failure stays before SQL; SQL failure records only apply stage',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'fixture-stage-'));
 try {
  mkdirSync(path.join(dir,'u1'));mkdirSync(path.join(dir,'u1/raw'));mkdirSync(path.join(dir,'u1/work'));
  const f=fixture();f.env.RUNNER_TEMP=dir;f.env.PHASE15_CAPTURE_DIR=path.join(dir,'u1/raw');f.env.PHASE15_WORK_DIR=path.join(dir,'u1/work');
  f.env.REF032_FIXTURE_CONTAINER_NOT_BEFORE=String(Date.now()-10000);f.container.Created=new Date(Date.now()-5000).toISOString();
  let executions=0;
  const run=(command,args)=>{
   if(command==='git')return f.env.GITHUB_SHA;
   if(args[0]==='context')return JSON.stringify([f.context]);
   if(args[0]==='inspect')return JSON.stringify([f.container]);
   executions++;assert.deepEqual(args,['exec','-e','PGSERVICEFILE=/dev/null','-e','PGOPTIONS=-c ref032.disposable_fixture=repository-only-v1','-i',f.container.Id,...FIXTURE_CLIENT_ENV,'psql','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1']);throw new Error('SYNTHETIC_PRIVATE_SQL_ERROR');
  };
  const invalid={...f.env,GITHUB_WORKFLOW:'wrong'};assert.throws(()=>runCapturedStagingFixture(invalid,run));assert.equal(executions,0);
  assert.throws(()=>runCapturedStagingFixture(f.env,run),/SYNTHETIC_PRIVATE_SQL_ERROR/);assert.equal(executions,1);
  assert.equal(readFileSync(path.join(dir,'u1/work/current-stage.txt'),'utf8').trim(),'purge-fixture-apply');
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('fixture client unsets empty service before real native client connection',{skip:!(process.env.REF032_EMBEDDED_MODULE&&process.env.REF032_PG_BIN)&&'Native PostgreSQL tooling required'},async()=>{
 const {default:EmbeddedPostgres}=await import(process.env.REF032_EMBEDDED_MODULE);const {execFileSync}=await import('node:child_process');
 const dir=mkdtempSync(path.join(tmpdir(),'fixture-client-native-'));const port=57673;
 // Native transport control only: workspace prohibits Unix server sockets. The
 // Docker invocation above remains pinned to its original Unix socket.
 const pg=new EmbeddedPostgres({databaseDir:path.join(dir,'db'),port,user:'postgres',password:'synthetic-only',persistent:false,postgresFlags:['-k','','-h','127.0.0.1'],onLog:()=>{},onError:()=>{},autoRehydrateSymlinks:true});
 try{await pg.initialise();await pg.start();
 const client=path.join(process.env.REF032_PG_BIN,'psql');const args=['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','-X','-q','-v','ON_ERROR_STOP=1','-At','-c',"select current_setting('ref032.disposable_fixture')"];
 const env={PATH:process.env.PATH,LC_ALL:'C',PGPASSWORD:'synthetic-only',PGSERVICEFILE:'/dev/null',PGOPTIONS:'-c ref032.disposable_fixture=repository-only-v1'};
 const options={encoding:'utf8',timeout:3000,stdio:['ignore','pipe','pipe']};
 assert.equal(execFileSync(client,args,{...options,env}).trim(),'repository-only-v1');
 for(const hostile of [{PGSERVICE:''},{PGSERVICE:'fixture-not-defined',PGHOSTADDR:'invalid-numeric-address'}]){
 assert.throws(()=>execFileSync(client,args,{...options,env:{...env,...hostile}}),e=>e.status===2);
 assert.equal(execFileSync('env',[...FIXTURE_CLIENT_ENV.slice(1),client,...args],{...options,env:{...env,...hostile}}).trim(),'repository-only-v1');
 }
 }finally{if(pg.process?.exitCode===null)await pg.stop();rmSync(dir,{recursive:true,force:true});}
});
