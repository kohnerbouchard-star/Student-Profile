// SOURCE ONLY. No capture, restore receipt, hosted URL or apply authorization.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {loadBatch,pendingRows,renderAtomicBatch,sha256} from './compiler.mjs';
import {stripOuterTransaction} from '../live-migration-reconciliation/build-phase15-forward-bundle.mjs';
import {predicates,BASELINE_PROBE} from './postconditions.mjs';
import {projectionFixture,projectionAssertions} from './manufacturing-fixture.mjs';
export const IMAGE='ghcr.io/supabase/postgres@sha256:e884cde9f5594ddb30ebec888bd236d128eaf9c9b48cc864d8fa3d27a6c6c6bc';
export const EXCLUDED='studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,gotrue,postgrest,realtime,kong,mailpit,postgres-meta';
export function context(env,event,sha){
 assert.equal(env.GITHUB_ACTIONS,'true');assert.equal(env.GITHUB_WORKFLOW,'Source-only staging suffix qualification');
 assert.equal(env.GITHUB_REPOSITORY,'kohnerbouchard-star/Student-Profile');assert.equal(env.GITHUB_RUN_ATTEMPT,'1');assert.match(sha,/^[a-f0-9]{40}$/);
 if(env.GITHUB_EVENT_NAME==='pull_request'){assert.equal(event.pull_request.base.ref,'main');assert.equal(event.pull_request.head.repo.full_name,env.GITHUB_REPOSITORY);assert.equal(event.pull_request.head.sha,sha);}
 else{assert.equal(env.GITHUB_EVENT_NAME,'push');assert.match(env.GITHUB_REF,/^refs\/heads\/fix\/staging-suffix-source-[a-z0-9-]+$/);assert.equal(env.GITHUB_SHA,sha);}
 for(const [key,value]of Object.entries(env))if(value&&(/^(?:PG|SUPABASE_|PHASE15_|STAGING_|DATABASE_URL|DOCKER_HOST|DOCKER_CONTEXT|DOCKER_TLS_VERIFY|DOCKER_CERT_PATH|GH_TOKEN|GITHUB_TOKEN)/.test(key))){if(key==='SUPABASE_INTERNAL_IMAGE_REGISTRY'&&value==='ghcr.io')continue;throw Object.assign(Error('EXTERNAL_AUTHORITY_FORBIDDEN'),{blockedVariable:key});}
}
export function container(value,project,image,created){
 assert(typeof value.HostConfig?.NetworkMode==='string'&&value.HostConfig.NetworkMode!=='host'&&!String(value.HostConfig?.NetworkMode).startsWith('container:'));
 assert.equal(value.Name,`/supabase_db_${project}`);assert.equal(value.Config.Labels['com.supabase.cli.project'],project);assert(value.State.Running);assert.equal(value.Image,image);assert(Date.parse(value.Created)>=created);assert.deepEqual(Object.keys(value.NetworkSettings.Networks),[]);assert.match(value.Id,/^[a-f0-9]{64}$/);return value.Id;
}
export function commandAllowed(command,args){
 assert(Array.isArray(args));
 if(command==='git'){assert(['rev-parse','diff','status'].includes(args[0]));return;}
 if(command==='supabase'){assert(['--version','start','stop'].includes(args[0]));return;}
 assert.equal(command,'docker','Only local source/runtime commands permitted');
 assert(['context','pull','image','inspect','network','exec'].includes(args[0]));
 if(args[0]==='context')assert.equal(args[1],'inspect');
 if(args[0]==='image')assert.equal(args[1],'inspect');
 if(args[0]==='network')assert.equal(args[1],'disconnect');
 if(args[0]==='pull')assert.deepEqual(args,['pull','--platform','linux/amd64',IMAGE]);
 if(args[0]==='exec'){
  assert(args.includes('/var/run/postgresql')&&args.includes('env')&&args.includes('-i'));
  assert(args.includes('psql')||args.includes('pg_dump'));
 }
}
export function imageFacts(meta){
 assert.match(meta.Id,/^sha256:[a-f0-9]{64}$/);
 return {imageId:meta.Id,architecture:['amd64','arm64'].includes(meta.Architecture)?meta.Architecture:'other',os:meta.Os==='linux'?'linux':'other',repoDigests:[...new Set((meta.RepoDigests??[]).filter(x=>/^(?:ghcr\.io|public\.ecr\.aws)\/supabase\/postgres@sha256:[a-f0-9]{64}$/.test(x)))].sort().slice(0,4)};
}
export async function runQualification({env=process.env,root=process.cwd(),execute}={}){
 let work,imageEvidence,started=false,stage='context',result={status:'FAILED',syntheticOnly:true,releaseQualified:false,applyAuthorized:false};
 const implementation=execute??((cmd,args,input,timeout=30000,childEnv)=>execFileSync(cmd,args,{env:childEnv,input,encoding:'utf8',timeout,maxBuffer:64*1024*1024,stdio:[input===undefined?'ignore':'pipe','pipe','pipe']}).trim());
 const raw=(cmd,args,...rest)=>{commandAllowed(cmd,args);return implementation(cmd,args,...rest);};
 const local=(cmd,args,input,timeout)=>raw(cmd,args,input,timeout,{PATH:env.PATH});
 try{
  const source=local('git',['rev-parse','HEAD']);context(env,JSON.parse(readFileSync(env.GITHUB_EVENT_PATH)),source);
  stage='source-integrity';local('git',['diff','--exit-code','b62f10ffda169fd6f884cc3a254c136fbd6b862d','--','backend/supabase/migrations']);
  assert.equal(local('git',['status','--porcelain','--untracked-files=all','--','backend/supabase/migrations']),'');
  stage='private-workspace';work=mkdtempSync(path.join(env.RUNNER_TEMP,'suffix-source-only-'));mkdirSync(path.join(work,'supabase/migrations'),{recursive:true});mkdirSync(path.join(work,'home'));mkdirSync(path.join(work,'docker'));
  const childEnv={PATH:env.PATH,SUPABASE_INTERNAL_IMAGE_REGISTRY:'ghcr.io',HOME:path.join(work,'home'),DOCKER_CONFIG:path.join(work,'docker'),DOCKER_HOST:'unix:///var/run/docker.sock'};
  const run=(cmd,args,input,timeout=30000)=>raw(cmd,args,input,timeout,childEnv);
  stage='cli-version';assert.equal(run('supabase',['--version']),'2.109.1');
  stage='docker-context';assert.equal(JSON.parse(run('docker',['context','inspect']))[0].Endpoints.docker.Host,'unix:///var/run/docker.sock');
  stage='expected-image-acquisition';run('docker',['pull','--platform','linux/amd64',IMAGE],undefined,180000);
  stage='expected-image-platform';const pinned=JSON.parse(run('docker',['image','inspect',IMAGE]))[0];imageEvidence={expected:imageFacts(pinned)};assert.equal(pinned.Architecture,'amd64');assert.equal(pinned.Os,'linux');
  const project='suffix_source_'+randomBytes(8).toString('hex');
  const config=readFileSync(path.join(root,'backend/supabase/config.toml'),'utf8').replace(/^project_id = .*$/m,`project_id = "${project}"`).replace(/^port = 54321$/m,'port = 57662').replace(/^port = 54322$/m,'port = 57660').replace(/^shadow_port = 54320$/m,'shadow_port = 57661');
  assert(config.includes('[db.seed]\nenabled = false\nsql_paths = []'));writeFileSync(path.join(work,'supabase/config.toml'),config);
  const created=Date.now();stage='empty-managed-bootstrap';started=true;run('supabase',['start','--workdir',work,'--exclude',EXCLUDED],undefined,240000);
  const inspect=id=>JSON.parse(run('docker',['inspect',id]))[0];let info=inspect(`supabase_db_${project}`);
  stage='observed-image-platform';const observed=JSON.parse(run('docker',['image','inspect',info.Image]))[0];imageEvidence.observed=imageFacts(observed);imageEvidence.canonicalCli143Tag=/^(?:ghcr\.io|public\.ecr\.aws)\/supabase\/postgres:17\.6\.1\.143$/.test(info.Config.Image);
  stage='exact-image-id-binding';assert.equal(info.Image,pinned.Id,'CLI managed bootstrap must resolve exactly the pinned image');
  stage='network-disconnect';
  for(const network of Object.keys(info.NetworkSettings.Networks))run('docker',['network','disconnect',network,info.Id]);
  stage='isolated-container-attestation';const id=container(inspect(info.Id),project,pinned.Id,created);
  const sql=(text,role='postgres',database='postgres')=>{
   assert(['postgres','qualification_manufacturing_fixture'].includes(database));
   assert.equal(container(inspect(id),project,pinned.Id,created),id);
   return run('docker',['exec','-i',id,'env','-i','PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','PGSERVICEFILE=/dev/null','psql','-h','/var/run/postgresql','-p','5432','-U',role,'-d',database,'-XqAt','-v','ON_ERROR_STOP=1'],`set statement_timeout='120s';set lock_timeout='5s';\n${text}`,180000);
  };
  stage='disable-schedulers';sql("alter system set cron.launch_active_jobs=off;select pg_reload_conf();",'supabase_admin');
  for(let attempt=0;attempt<5;attempt++){if(sql("select current_setting('cron.launch_active_jobs');")==='off')break;if(attempt===4)throw Error('CRON_NOT_FENCED');}
  stage='canonical-prefix';const rows=await loadBatch(root);
  sql('create schema if not exists supabase_migrations;create table if not exists supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);');assert.equal(sql('select count(*) from supabase_migrations.schema_migrations;'),'0');
  const literal=s=>"'"+s.replaceAll("'","''")+"'";
  let count=0;
  for(const file of readdirSync(path.join(root,'backend/supabase/migrations')).filter(f=>f.endsWith('.sql')&&f.slice(0,14)<='20260921044500').sort()){
   const sourceSQL=readFileSync(path.join(root,'backend/supabase/migrations',file),'utf8').replaceAll('\r\n','\n').trim();
   sql(`begin;${stripOuterTransaction(sourceSQL,file).body}\ninsert into supabase_migrations.schema_migrations values(${literal(file.slice(0,14))},${literal(file.slice(15,-4))},array[${literal(sourceSQL)}]);commit;`);count++;
  }
  assert.equal(count,449,'Canonical repository nonce prefix cardinality drift');
  sql(BASELINE_PROBE);
  const ledger=()=>JSON.parse(sql("select jsonb_agg(jsonb_build_object('version',version,'name',name,'sha256',encode(sha256(convert_to(statements[1],'UTF8')),'hex'),'statementCount',cardinality(statements)) order by version) from supabase_migrations.schema_migrations where version>='20260921044500';"));
  assert.equal(pendingRows(ledger()).length,15);
  const snapshot=()=>{
   container(inspect(id),project,pinned.Id,created);
   return sha256(run('docker',['exec',id,'env','-i','PATH=/usr/bin:/bin:/usr/local/bin','PGSERVICEFILE=/dev/null','pg_dump','-h','/var/run/postgresql','-U','postgres','-d','postgres','--schema=public','--schema=private','--schema=economy_private','--schema=recovery_private','--schema=supabase_migrations','--schema=qualification_probe']).replace(/^\\(?:un)?restrict .*\n/gm,''));
  };
  const checks=predicates(rows),before=snapshot();stage='all15-rollback';sql(renderAtomicBatch(rows,checks,'rollback'));assert.equal(snapshot(),before);
  stage='all15-per-migration-faults';
  for(const faultRow of rows){
   const failing=structuredClone(checks),injected="do $$ begin raise exception 'SYNTHETIC_INJECTED'; end $$;";
   failing[faultRow.version]={reviewed:true,sql:injected,sha256:sha256(injected)};
   let rejected=false;try{sql(renderAtomicBatch(rows,failing,'apply'));}catch(error){rejected=String(error.stderr??'').includes('SYNTHETIC_INJECTED');}
   assert(rejected);assert.equal(snapshot(),before);
  }
  stage='all15-commit';sql(renderAtomicBatch(rows,checks,'apply'));assert.equal(pendingRows(ledger()).length,0);assert.throws(()=>renderAtomicBatch([],checks,'apply'));
  stage='committed-retry-guard';const committed=snapshot();let duplicateRejected=false;
  try{sql(renderAtomicBatch(rows,checks,'apply'));}catch(error){duplicateRejected=String(error.stderr??'').includes('SUFFIX_LEDGER_CHANGED');}
  assert(duplicateRejected);assert.equal(snapshot(),committed);
  stage='manufacturing-projection-fixture';
  const definition=sql("select pg_get_functiondef('economy_private.refresh_manufacturing_inventory_projection_v1(uuid,uuid,uuid,uuid)'::regprocedure);");
  sql('create database qualification_manufacturing_fixture;');
  sql(projectionFixture+definition+projectionAssertions,'postgres','qualification_manufacturing_fixture');
  assert.equal(local('git',['rev-parse','HEAD']),source);
  result={status:'PASS',sourceCommit:source,syntheticOnly:true,canonicalPrefixCount:count,appliedCount:15,purgeChecked:true,manufacturingCatalogAndClaimGuardChecked:true,manufacturingProjectionPrecisionChecked:true,all15Rollback:true,all15FaultAtomicity:true,injectedFaultPositions:15,committedRetryRejected:true,fullManufacturingLifecycle:false,releaseQualified:false,applyAuthorized:false};
 }catch(error){result={status:'FAILED',stage,reason:error?.blockedVariable?'EXTERNAL_AUTHORITY_FORBIDDEN':'INPUT_OR_COMMAND',...(error?.blockedVariable?{blockedVariable:error.blockedVariable}:{}),...(imageEvidence?{imageEvidence}:{}),syntheticOnly:true,releaseQualified:false,applyAuthorized:false};}
 finally{if(started){try{raw('supabase',['stop','--workdir',work,'--no-backup'],undefined,60000,{PATH:env.PATH,SUPABASE_INTERNAL_IMAGE_REGISTRY:'ghcr.io',HOME:path.join(work,'home'),DOCKER_CONFIG:path.join(work,'docker'),DOCKER_HOST:'unix:///var/run/docker.sock'});}catch{result={status:'FAILED',stage:'cleanup',syntheticOnly:true,releaseQualified:false,applyAuthorized:false};}}if(work)rmSync(work,{recursive:true,force:true});}
 return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{const result=await runQualification();writeFileSync(path.join(process.env.RUNNER_TEMP,'suffix-source-result.json'),JSON.stringify(result)+'\n');process.stdout.write(JSON.stringify(result)+'\n');if(result.status!=='PASS')process.exitCode=1;}catch{process.stderr.write('SOURCE_ONLY_QUALIFICATION_FAILED\n');process.exitCode=1;}
}
