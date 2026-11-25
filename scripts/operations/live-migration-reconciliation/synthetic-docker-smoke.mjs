// PR-only synthetic Docker substrate smoke. Never a staging/release certificate.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {randomBytes} from 'node:crypto';import path from 'node:path';import {pathToFileURL} from 'node:url';
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
 assert(container.State.Running);assert.match(container.Id,/^[a-f0-9]{64}$/);assert.match(container.Image,/^sha256:[a-f0-9]{64}$/);
 assert.match(container.Config.Image,/^(public\.ecr\.aws|ghcr\.io)\/supabase\/postgres:17\.[a-zA-Z0-9.]+$/);
 assert(Date.parse(container.Created)>=notBefore&&Date.parse(container.Created)<=Date.now());
 assert(!['host','none'].includes(container.HostConfig.NetworkMode)&&!container.HostConfig.NetworkMode.startsWith('container:'));
 if(isolated)assert.deepEqual(Object.keys(container.NetworkSettings.Networks),[],'Synthetic egress must be disconnected');
 return container.Id;
}
const defaultRun=(command,args,input,timeout=30000)=>execFileSync(command,args,{input,timeout,maxBuffer:1024*1024,encoding:'utf8',stdio:[input===undefined?'ignore':'pipe','pipe','pipe']}).trim();
export function runSyntheticDockerSmoke({env=process.env,event=JSON.parse(readFileSync(env.GITHUB_EVENT_PATH,'utf8')),run=defaultRun,root=process.cwd()}={}){
 let stage='synthetic-input-preflight',work,cli,attempted=false,result;
 try{
  const sha=run('git',['rev-parse','HEAD']);assertSyntheticContext(env,event,sha);
  assert.equal(JSON.parse(run('docker',['context','inspect']))[0].Endpoints.docker.Host,'unix:///var/run/docker.sock');
  cli=path.join(root,'node_modules/.bin/supabase');assert.equal(run(cli,['--version']),'2.109.1');
  const project='ref032_synthetic_'+randomBytes(8).toString('hex');
  work=mkdtempSync(path.join(env.RUNNER_TEMP,'ref032-synthetic-'));mkdirSync(path.join(work,'supabase/migrations'),{recursive:true});
  const config=readFileSync(path.join(root,'backend/supabase/config.toml'),'utf8').replace(/^project_id = .*$/m,`project_id = "${project}"`).replace(/^port = 54321$/m,'port = 57582').replace(/^port = 54322$/m,'port = 57580').replace(/^shadow_port = 54320$/m,'shadow_port = 57581');
  assert(config.includes('[db.seed]\nenabled = false\nsql_paths = []'));writeFileSync(path.join(work,'supabase/config.toml'),config,{mode:0o600});
  stage='synthetic-startup';const started=Date.now();attempted=true;
  run(cli,['start','--workdir',work,'--exclude',EXCLUDED],undefined,180000);
  stage='synthetic-isolation';
  const name=`supabase_db_${project}`;
  let metadata=JSON.parse(run('docker',['inspect',name]))[0];const id=assertSyntheticContainer(metadata,project,started);
  stage='synthetic-isolation';
  // Inventory failure throws before a loop can silently skip isolation.
  for(const network of Object.keys(metadata.NetworkSettings.Networks))run('docker',['network','disconnect',network,id]);
  metadata=JSON.parse(run('docker',['inspect',id]))[0];assert.equal(assertSyntheticContainer(metadata,project,started,true),id);
  const sql=text=>{
   const current=JSON.parse(run('docker',['inspect',id]))[0];assert.equal(assertSyntheticContainer(current,project,started,true),id);
   return run('docker',['exec','-e','PGHOSTADDR=','-e','PGSERVICE=','-e','PGSERVICEFILE=/dev/null','-i',id,'psql','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','postgres','-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=sqlstate'],`set statement_timeout='10s';set lock_timeout='2s';\n${text}`);
  };
  stage='synthetic-schema-capture';sql(SYNTHETIC_SCHEMA);
  const dump=run('docker',['exec',id,'pg_dump','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','postgres','--schema-only','--schema=synthetic_probe','--schema=synthetic_ledger','--no-publications','--no-subscriptions']);
  assert(dump.length>0&&dump.length<262144);assert(!/^(COPY|INSERT INTO) /m.test(dump));
  const ledger=JSON.parse(sql("select coalesce(json_agg(version order by version),'[]'::json) from synthetic_ledger.migrations"));assert.deepEqual(ledger,['synthetic-v1']);
  stage='synthetic-schema-restore';sql('drop schema synthetic_probe cascade;drop schema synthetic_ledger cascade;');sql(dump);
  assert.equal(sql("select to_regclass('synthetic_probe.item') is not null and to_regclass('synthetic_ledger.migrations') is not null"),'t');
  assert.equal(sql('select count(*) from synthetic_ledger.migrations'),'0');
  sql("insert into synthetic_ledger.migrations values('synthetic-v1')");
  stage='synthetic-guard';let rejected=false;
  try{sql(SYNTHETIC_GUARD);}catch(error){rejected=error.status!==0&&/^.*ERROR:\s+P0001\s*$/m.test(String(error.stderr));}
  assert(rejected,'Expected synthetic restore guard rejection');
  assert.equal(sql('select count(*) from synthetic_probe.item'),'0');assert.equal(sql('select count(*) from synthetic_ledger.migrations'),'1');
  assert.equal(run('git',['rev-parse','HEAD']),sha);
  result={status:'PASS',stage:'synthetic-guard',sourceCommit:sha,syntheticOnly:true,guardRejected:true,fullStagingQualification:false};
 }catch{result={status:'FAILED',stage,syntheticOnly:true,fullStagingQualification:false};}
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
