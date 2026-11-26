// PR-only synthetic Docker substrate smoke. Never a staging/release certificate.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {randomBytes} from 'node:crypto';import path from 'node:path';import {pathToFileURL} from 'node:url';
import { disposableRuntimeCatalogFixture, readDisposableRuntimeCatalogOutput } from './disposable-runtime-catalog-fixture.mjs';
// Immutable amd64 config identity for the Supabase CLI 2.109.1 Postgres image.
export const SYNTHETIC_IMAGE='ghcr.io/supabase/postgres@sha256:80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453';
export const SYNTHETIC_IMAGE_TAG='ghcr.io/supabase/postgres:17.6.1.143';
export const SYNTHETIC_IMAGE_ID='sha256:2d3ac69ad5c95d81458cc93a6cc6c31a98dfa00cd28f88a0a9358d315e1c357a';
export const EXCLUDED='studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,gotrue,postgrest,realtime,kong,mailpit,postgres-meta';
export const SYNTHETIC_SCHEMA="create schema synthetic_probe;create schema synthetic_ledger;create table synthetic_probe.item(id integer primary key);create table synthetic_ledger.migrations(version text primary key);insert into synthetic_ledger.migrations values('synthetic-v1');";
export const SYNTHETIC_GUARD="do $$ begin if not exists(select 1 from synthetic_ledger.migrations where version='never-authorized') then raise exception using errcode='P0001',message='SYNTHETIC_RESTORE_GUARD';end if;end $$;";
export function assertSyntheticContext(env,event,sha){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_WORKFLOW,'Database Replay');assert.equal(env.GITHUB_JOB,'replay');
 assert.equal(env.GITHUB_EVENT_NAME,'pull_request');assert.equal(env.GITHUB_REPOSITORY,'kohnerbouchard-star/Student-Profile');
 assert.equal(env.REF032_SYNTHETIC_DOCKER_SMOKE,'1');assert.equal(event.pull_request?.base.ref,'main');
 assert.equal(event.pull_request?.head.repo.full_name,env.GITHUB_REPOSITORY);
 assert.match(sha,/^[a-f0-9]{40}$/);assert.equal(event.pull_request.head.sha,sha);
 for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','DATABASE_URL','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_SECRET_KEY','PHASE15_REMOTE_DATABASE_URL','PHASE15_CAPTURE_DIR','PGHOST','PGHOSTADDR','PGPORT','PGUSER','PGPASSWORD','PGDATABASE','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGPASSFILE'])assert(!env[key],`External setting forbidden: ${key}`);
}
export function assertSyntheticContainer(container,project,notBefore,isolated=false){
 assert.match(project,/^ref032_synthetic_[a-f0-9]{16}$/);
 assert.equal(container.Name,`/supabase_db_${project}`);assert.equal(container.Config.Labels['com.supabase.cli.project'],project);
 assert(container.State.Running);assert.match(container.Id,/^[a-f0-9]{64}$/);assert.equal(container.Image,SYNTHETIC_IMAGE_ID);
 assert.equal(container.Config.Image,SYNTHETIC_IMAGE_TAG);
 assert(Date.parse(container.Created)>=notBefore&&Date.parse(container.Created)<=Date.now());
 assert(!['host','none'].includes(container.HostConfig.NetworkMode)&&!container.HostConfig.NetworkMode.startsWith('container:'));
 if(isolated)assert.deepEqual(Object.keys(container.NetworkSettings.Networks),[],'Synthetic egress must be disconnected');
 return container.Id;
}
// Only fixed classifications leave this process; never serialize command errors.
export function classifySyntheticFailure(error){
 const stderr=String(error?.stderr??'');
 const state=stderr.match(/(?:^|\n)(?:psql:[^\n]*?: )?ERROR:\s+([A-Z0-9]{5})(?:\s|$)/)?.[1];
 const sqlState=['P0001','42501','42P01','42601','28P01','28000','3F000','57014','55P03'].includes(state)?state:null;
 let exitKind=error?.code==='ERR_ASSERTION'?'assertion':error instanceof SyntaxError?'structured-output':'command';
 if(error?.code==='ENOENT')exitKind='command-missing';
 else if(error?.code==='ETIMEDOUT')exitKind='command-timeout';
 else if(/connection to server on socket .* failed:\s+No such file or directory/.test(stderr))exitKind='socket-unavailable';
 else if(/connection to server on socket .* failed:\s+Permission denied/.test(stderr))exitKind='socket-permission';
 else if(/connection to server on socket .* failed:\s+Connection refused/.test(stderr))exitKind='socket-refused';
 else if(/(?:Peer|password) authentication failed/.test(stderr))exitKind='authentication';
 return {exitKind,exitCode:Number.isInteger(error?.status)&&error.status>=0&&error.status<=255?error.status:null,sqlState};
}
export const NATIVE_PG_CRON_VERSION=`select e.extversion
  from pg_extension e join pg_namespace n on n.oid=e.extnamespace
  join pg_depend d on d.refclassid='pg_extension'::regclass and d.refobjid=e.oid
    and d.classid='pg_proc'::regclass and d.deptype='e'
  join pg_proc p on p.oid=d.objid join pg_language l on l.oid=p.prolang
  where e.extname='pg_cron' and n.nspname='pg_catalog' and l.lanname='c'
    and p.oid=to_regprocedure('cron.schedule(text,text,text)');`;
export const CONNECTION_CONTEXT="select json_build_object('unixSocket',inet_server_addr() is null,'roleMatches',current_user='postgres','databaseMatches',current_database()='postgres','requestedDirectoryConfigured','/var/run/postgresql'=any(string_to_array(current_setting('unix_socket_directories'),',')))";
export function validateConnectionContext(text){
 const value=JSON.parse(text);assert.deepEqual(Object.keys(value).sort(),['databaseMatches','requestedDirectoryConfigured','roleMatches','unixSocket']);
 for(const key of Object.keys(value))assert.equal(typeof value[key],'boolean');
 return value;
}
// Read-only discriminator: fixed local Unix sockets only; never selects a target.
export const SOCKET_PROBE_SCRIPT="for d in /var/run/postgresql /tmp; do if test -S \"$d/.s.PGSQL.5432\"; then printf '1 '; else printf '0 '; fi; pg_isready -h \"$d\" -p 5432 -U postgres -d postgres -t 2 >/dev/null 2>&1; printf '%s\\n' \"$?\"; done";
export function validateSocketProbe(text){
 assert.match(text,/^[01] [0123]\n[01] [0123]$/);
 const rows=text.split('\n').map(row=>row.split(' ').map(Number));
 return {requestedSocketPresent:rows[0][0]===1,requestedReadiness:rows[0][1],alternateSocketPresent:rows[1][0]===1,alternateReadiness:rows[1][1]};
}
export const CLIENT_ENV=['env','-u','PGSERVICE','-u','PGHOSTADDR'];
const defaultRun=(command,args,input,timeout=30000,env=process.env)=>execFileSync(command,args,{input,timeout,env,maxBuffer:1024*1024,encoding:'utf8',stdio:[input===undefined?'ignore':'pipe','pipe','pipe']}).trim();
export function runSyntheticDockerSmoke({env=process.env,event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8')),run=defaultRun,root=process.cwd()}={}){
 let stage='synthetic-input-preflight',work,cli,attempted=false,result,connectionContext,socketProbe,imageContext;
 try{
  const sha=run('git',['rev-parse','HEAD']);assertSyntheticContext(env,event,sha);
  assert.equal(JSON.parse(run('docker',['context','inspect']))[0].Endpoints.docker.Host,'unix:///var/run/docker.sock');
  cli=path.join(root,'node_modules/.bin/supabase');assert.equal(run(cli,['--version']),'2.109.1');
  const project='ref032_synthetic_'+randomBytes(8).toString('hex');
  work=mkdtempSync(path.join(env.RUNNER_TEMP,'ref032-synthetic-'));mkdirSync(path.join(work,'supabase/migrations'),{recursive:true});
  const config=readFileSync(path.join(root,'backend/supabase/config.toml'),'utf8').replace(/^project_id = .*$/m,`project_id = "${project}"`).replace(/^port = 54321$/m,'port = 57582').replace(/^port = 54322$/m,'port = 57580').replace(/^shadow_port = 54320$/m,'shadow_port = 57581');
  assert(config.includes('[db.seed]\nenabled = false\nsql_paths = []'));writeFileSync(path.join(work,'supabase/config.toml'),config,{mode:0o600});
  stage='synthetic-image-acquisition';
  run('docker',['pull','--platform','linux/amd64',SYNTHETIC_IMAGE],undefined,180000);
  const pinned=JSON.parse(run('docker',['image','inspect',SYNTHETIC_IMAGE]))[0];
  assert.equal(pinned.Id,SYNTHETIC_IMAGE_ID);
  assert.equal(pinned.Architecture,'amd64');assert.equal(pinned.Os,'linux');
  // Pin the CLI selector to the verified cached image in this ephemeral runner.
  run('docker',['tag',SYNTHETIC_IMAGE,SYNTHETIC_IMAGE_TAG]);
  stage='synthetic-startup';const started=Date.now();attempted=true;
  run(cli,['start','--workdir',work,'--exclude',EXCLUDED],undefined,180000,
    {...env,SUPABASE_INTERNAL_IMAGE_REGISTRY:'ghcr.io'});
  stage='synthetic-image-attestation';
  const name=`supabase_db_${project}`;
  let metadata=JSON.parse(run('docker',['inspect',name]))[0];
  imageContext={selectorMatched:metadata.Config?.Image===SYNTHETIC_IMAGE_TAG,pinMatched:metadata.Image===SYNTHETIC_IMAGE_ID};
  const id=assertSyntheticContainer(metadata,project,started);
  stage='synthetic-isolation';
  // Inventory failure throws before a loop can silently skip isolation.
  for(const network of Object.keys(metadata.NetworkSettings.Networks))run('docker',['network','disconnect',network,id]);
  metadata=JSON.parse(run('docker',['inspect',id]))[0];assert.equal(assertSyntheticContainer(metadata,project,started,true),id);
  const sql=(text, role='postgres')=>{
   const current=JSON.parse(run('docker',['inspect',id]))[0];assert.equal(assertSyntheticContainer(current,project,started,true),id);
   return run('docker',['exec','-e','LC_ALL=C','-e','PGCONNECT_TIMEOUT=3','-e','PGSERVICEFILE=/dev/null','-i',id,...CLIENT_ENV,'psql','-h','/var/run/postgresql','-p','5432','-U',role,'-d','postgres','-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],`set statement_timeout='10s';set lock_timeout='2s';\n${text}`);
  };
  stage='synthetic-socket-transport';
  socketProbe=validateSocketProbe(run('docker',['exec','-e','LC_ALL=C','-e','PGCONNECT_TIMEOUT=3','-e','PGSERVICEFILE=/dev/null',id,...CLIENT_ENV,'sh','-c',SOCKET_PROBE_SCRIPT],undefined,10000));
  stage='synthetic-socket-context';connectionContext=validateConnectionContext(sql(CONNECTION_CONTEXT));
  assert(connectionContext.unixSocket&&connectionContext.roleMatches&&connectionContext.databaseMatches);
  stage='synthetic-schema-create';sql(SYNTHETIC_SCHEMA);
  stage='synthetic-schema-dump';
  const dump=run('docker',['exec',id,...CLIENT_ENV,'pg_dump','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','postgres','--schema-only','--schema=synthetic_probe','--schema=synthetic_ledger','--no-publications','--no-subscriptions']);
  stage='synthetic-dump-boundary';assert(dump.length>0&&dump.length<262144);assert(!/^(COPY|INSERT INTO) /m.test(dump));
  stage='synthetic-ledger-read';const ledger=JSON.parse(sql("select coalesce(json_agg(version order by version),'[]'::json) from synthetic_ledger.migrations"));assert.deepEqual(ledger,['synthetic-v1']);
  stage='synthetic-schema-restore';sql('drop schema synthetic_probe cascade;drop schema synthetic_ledger cascade;');sql(dump);
  assert.equal(sql("select to_regclass('synthetic_probe.item') is not null and to_regclass('synthetic_ledger.migrations') is not null"),'t');
  assert.equal(sql('select count(*) from synthetic_ledger.migrations'),'0');
  sql("insert into synthetic_ledger.migrations values('synthetic-v1')");
  stage='synthetic-guard';let rejected=false;
  try{sql(SYNTHETIC_GUARD);}catch(error){rejected=error.status!==0&&/^.*ERROR:\s+P0001\s*$/m.test(String(error.stderr));}
  assert(rejected,'Expected synthetic restore guard rejection');
  assert.equal(sql('select count(*) from synthetic_probe.item'),'0');assert.equal(sql('select count(*) from synthetic_ledger.migrations'),'1');
  stage='synthetic-native-pg-cron';
  sql('create extension if not exists pg_cron with schema pg_catalog;', 'supabase_admin');
  const pgCronVersion=sql(NATIVE_PG_CRON_VERSION);
  assert.equal(pgCronVersion,'1.6.4');
  stage='synthetic-runtime-catalog-fixture';
  const { sql: fixture, jobs } = disposableRuntimeCatalogFixture();
  const { receipt } = readDisposableRuntimeCatalogOutput(
    sql("set ref032.runtime_catalog_fixture = 'rollback-only-repository-v1';\n" + fixture), jobs,
  );
  assert.deepEqual(receipt, {schedulerRowsAdded: 6, bootstrapHistoryAdded: true});
  assert.equal(sql("select not exists (select from cron.job) and not exists (select from cron.job_run_details) and to_regnamespace('supabase_migrations') is null"), 't');
  assert.equal(run('git',['rev-parse','HEAD']),sha);
  result={status:'PASS',stage,image:SYNTHETIC_IMAGE,imageId:SYNTHETIC_IMAGE_ID,pgCronVersion,runtimeCatalogFixtureRolledBack:true,sourceCommit:sha,syntheticOnly:true,guardRejected:true,fullStagingQualification:false};
 }catch(error){result={status:'FAILED',stage,...classifySyntheticFailure(error),...(connectionContext?{connectionContext}:{}),...(socketProbe?{socketProbe}:{}),...(imageContext?{imageContext}:{}),syntheticOnly:true,fullStagingQualification:false};}
 finally{
  if(attempted){try{run(cli,['stop','--workdir',work,'--no-backup'],undefined,60000);}catch{if(result?.status==='PASS')result={status:'FAILED',stage:'synthetic-cleanup',syntheticOnly:true,fullStagingQualification:false};}}
  if(work){try{rmSync(work,{recursive:true,force:true});}catch{if(result?.status==='PASS')result={status:'FAILED',stage:'synthetic-cleanup',syntheticOnly:true,fullStagingQualification:false};}}
 }
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 let result;try{result=runSyntheticDockerSmoke();}catch{result={status:'FAILED',stage:'synthetic-input-preflight',syntheticOnly:true,fullStagingQualification:false};}
 process.stdout.write(JSON.stringify(result)+'\n');if(result.status!=='PASS')process.exitCode=1;
}
