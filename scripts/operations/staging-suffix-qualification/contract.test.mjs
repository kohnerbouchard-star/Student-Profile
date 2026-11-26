import {execFileSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {context,container,IMAGE,IMAGE_ID,runQualification,commandAllowed,imageFacts,verifyBootstrap,failureFacts,lastMigrationVersion,normalizeOuterDumpNonce,legacySnapshotDigest,verifyNoOpControls} from './run.mjs';
import {loadBatch,renderAtomicBatch} from './compiler.mjs';
import {predicates} from './postconditions.mjs';
const wf=readFileSync(new URL('../../../.github/workflows/staging-suffix-source-qualification.yml',import.meta.url),'utf8');
const sha='a'.repeat(40),trustedEvent={pull_request:{base:{ref:'main'},head:{sha:'a'.repeat(40),repo:{full_name:'kohnerbouchard-star/Student-Profile'}}}},env={GITHUB_ACTIONS:'true',GITHUB_WORKFLOW:'Source-only staging suffix qualification',GITHUB_REPOSITORY:'kohnerbouchard-star/Student-Profile',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_NAME:'pull_request',GITHUB_REF:'refs/heads/fix/staging-suffix-source-test',GITHUB_SHA:sha};
test('workflow schedules source-only exact-head checks, never dispatch, protected environment or secrets',()=>{
 for(const token of ['pull_request:','branches: [main]','persist-credentials: false','github.event.pull_request.head.sha || github.sha','contents: read','contract.test.mjs','staging-suffix-qualification/run.mjs','backend/supabase/migrations/**'])assert(wf.includes(token));
 assert(!/^  push:/m.test(wf));
 assert(!/workflow_dispatch|workflow_run|workflow_call|pull_request_target|secrets\.|environment:|actions: write|contents: write|gh run|supabase link|deploy/.test(wf));
 assert(!/download-artifact|\.sql\s*$|rehearsal\.log/m.test(wf));
});
test('source identity and all external authority overrides reject before Docker',()=>{
 context(env,trustedEvent,sha);
 for(const key of ['PGHOST','PGPASSWORD','SUPABASE_DB_URL','SUPABASE_ACCESS_TOKEN','STAGING_APPLY_AUTHORIZED','DATABASE_URL','DOCKER_HOST','GH_TOKEN'])assert.throws(()=>context({...env,[key]:'synthetic-denied'}, trustedEvent,sha));
 for(const mutation of [{GITHUB_EVENT_NAME:'workflow_dispatch'},{GITHUB_EVENT_NAME:'push'},{GITHUB_REPOSITORY:'untrusted/fork'},{GITHUB_RUN_ATTEMPT:'2'}])assert.throws(()=>context({...env,...mutation},trustedEvent,sha));
 const pr={pull_request:{base:{ref:'main'},head:{sha,repo:{full_name:env.GITHUB_REPOSITORY}}}};context({...env,GITHUB_EVENT_NAME:'pull_request'},pr,sha);pr.pull_request.head.repo.full_name='untrusted/fork';assert.throws(()=>context({...env,GITHUB_EVENT_NAME:'pull_request'},pr,sha));
});
test('container must be fresh owned exact-image and fully disconnected',()=>{
 const c={HostConfig:{NetworkMode:'synthetic_bridge'},Name:'/supabase_db_suffix_source_123',Config:{Labels:{'com.supabase.cli.project':'suffix_source_123'}},State:{Running:true},Image:'sha256:expected',Created:new Date().toISOString(),NetworkSettings:{Networks:{}},Id:'1'.repeat(64)};
 container(c,'suffix_source_123','sha256:expected',0);
 for(const mutate of [x=>x.Image='wrong',x=>x.NetworkSettings.Networks={bridge:{}},x=>x.Name='/other',x=>x.State.Running=false]){const n=structuredClone(c);mutate(n);assert.throws(()=>container(n,'suffix_source_123','sha256:expected',0));}
 assert(IMAGE.endsWith('80d7b27c3e8d77cfa7226eee9508671796da214781ff15a35b3670d7ad5ee453'));
});
test('all15 exact source bodies have nonempty safe predicates; no unconditional true check',async()=>{
 const rows=await loadBatch(process.cwd()),checks=predicates(rows);assert.equal(rows.length,15);assert.equal(Object.keys(checks).length,15);
 assert(!Object.values(checks).some(c=>/^select true;?$/i.test(c.sql.trim())));
 const sql=renderAtomicBatch(rows,checks,'rollback');assert(sql.endsWith('rollback;\n'));assert(sql.includes('REF025_UNEXPECTED_PURGE_GRAPH'));assert(sql.includes('BUSINESS_MANUFACTURING_COMPLETION_CLAIM_INVALID'));assert(sql.includes('SUFFIX_POST_LEDGER_MISMATCH'));
});
test('failure output remains bounded and non-authorizing',async()=>{
 const result=await runQualification({env:{...env,GITHUB_RUN_ATTEMPT:'2'},execute:()=>sha});
 assert.deepEqual(result,{status:'FAILED',stage:'context',reason:'INPUT_OR_COMMAND',syntheticOnly:true,releaseQualified:false,applyAuthorized:false});
 assert(!JSON.stringify(result).includes('password'));
});

test('failed external image acquisition is attempted once and exposes no raw diagnostic',async()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'suffix-contract-'));const eventPath=path.join(temp,'event.json');writeFileSync(eventPath,JSON.stringify(trustedEvent));let pulls=0;
 try{
 const execute=(command,args)=>{
  if(command==='git')return args[0]==='rev-parse'?sha:'';
  if(command==='supabase'&&args[0]==='--version')return '2.109.1';
  if(command==='docker'&&args[0]==='context')return JSON.stringify([{Endpoints:{docker:{Host:'unix:///var/run/docker.sock'}}}]);
  if(command==='docker'&&args[0]==='pull'){pulls++;throw Object.assign(Error('SYNTHETIC_PRIVATE_DIAGNOSTIC'),{stderr:'SYNTHETIC_PRIVATE_DIAGNOSTIC'});}
  throw Error('UNEXPECTED_COMMAND');
 };
 const result=await runQualification({env:{...env,RUNNER_TEMP:temp,GITHUB_EVENT_PATH:eventPath},execute});
 assert.equal(pulls,1);assert.deepEqual(result,{status:'FAILED',stage:'expected-image-acquisition',reason:'INPUT_OR_COMMAND',syntheticOnly:true,releaseQualified:false,applyAuthorized:false});
 assert(!JSON.stringify(result).includes('PRIVATE'));
 }finally{rmSync(temp,{recursive:true,force:true});}
});

test('canonical repository prefix count is independently derived, never inferred from a live archive',()=>{
 const files=readdirSync('backend/supabase/migrations').filter(f=>f.endsWith('.sql')&&f.slice(0,14)<='20260921044500');
 assert.equal(files.length,449);assert(files.includes('20260921044500_reconcile_internal_runner_nonce_service_role_authority_v1.sql'));
});

test('runtime command boundary rejects dispatch, deployment, linking and external DB clients',()=>{
 for(const [cmd,args]of [['gh',['workflow','run']],['supabase',['link']],['supabase',['db','push']],['vercel',['deploy']],['psql',['postgres://hosted']],['docker',['run']],['docker',['exec','id','psql','-h','hosted']]])assert.throws(()=>commandAllowed(cmd,args));
 commandAllowed('docker',['pull','--platform','linux/amd64',IMAGE]);
 commandAllowed('supabase',['start','--workdir','synthetic']);
});

test('exact publication branch alone is excluded from Vercel, all other base config preserved',()=>{
 const current=JSON.parse(readFileSync('vercel.json'));
 const original=JSON.parse(execFileSync('git',['show','b62f10ffda169fd6f884cc3a254c136fbd6b862d:vercel.json'],{encoding:'utf8'}));
 assert.equal(current.git.deploymentEnabled['fix/staging-suffix-source-full15-20261126'],false);
 assert.equal(current.git.deploymentEnabled['release/production'],true);
 delete current.git.deploymentEnabled['fix/staging-suffix-source-full15-20261126'];assert.deepEqual(current,original);
});

test('only pinned setup-cli public ghcr registry metadata is accepted, never arbitrary registry authority',()=>{
 context({...env,SUPABASE_INTERNAL_IMAGE_REGISTRY:'ghcr.io'},trustedEvent,sha);
 assert.throws(()=>context({...env,SUPABASE_INTERNAL_IMAGE_REGISTRY:'untrusted.invalid'},trustedEvent,sha));
 assert.throws(()=>context({...env,SUPABASE_INTERNAL_IMAGE_REGISTRY:'ghcr.io',SUPABASE_ACCESS_TOKEN:'synthetic-denied'},trustedEvent,sha));
});

test('image diagnostics emit only immutable IDs, approved registry digests and bounded platform values',()=>{
 const id='sha256:'+'1'.repeat(64),digest='ghcr.io/supabase/postgres@sha256:'+'2'.repeat(64);
 assert.deepEqual(imageFacts({Id:id,Architecture:'arm64',Os:'linux',RepoDigests:[digest,'untrusted.invalid/private'],Config:{Env:['SYNTHETIC_SECRET']}}),{imageId:id,architecture:'arm64',os:'linux',repoDigests:[digest]});
 assert.throws(()=>imageFacts({Id:'untrusted-text'}));
 const source=readFileSync('scripts/operations/staging-suffix-qualification/run.mjs','utf8');
 for(const stage of ['expected-image-acquisition','expected-image-platform','observed-image-platform','exact-image-id-binding','network-disconnect','isolated-container-attestation'])assert(source.includes(stage));
 assert(source.includes("assert.equal(info.Image,pinned.Id"));
});

test('canonical replay pin binds two actual diagnostic acquisitions, frozen CLI selector and exact config ID',()=>{
 const proof=JSON.parse(readFileSync('docs/operations/evidence/staging-suffix-source-qualification-v1/image-identity.json'));
 assert.equal(proof.canonicalImage,IMAGE);assert.equal(proof.canonicalConfigId,IMAGE_ID);assert.equal(proof.platform,'linux/amd64');assert.equal(proof.cliVersion,'2.109.1');
 assert.equal(proof.cliSourceCommit,'6d4c19870ed213ba7f682f117d0345c8a40bfa94');
 assert.equal(new Set(proof.diagnosticRuns.map(r=>r.jobId)).size,2);
 assert(proof.diagnosticRuns.every(r=>r.canonicalImage===IMAGE&&r.canonicalConfigId===IMAGE_ID&&r.canonicalCli143Tag===true&&r.stage==='exact-image-id-binding'));
 assert(readFileSync('scripts/operations/staging-suffix-qualification/run.mjs','utf8').includes('assert.equal(pinned.Id,IMAGE_ID)'));
});

test('bootstrap proof requires managed Auth/schema/role and available extension prerequisites, not fake schemas',()=>{
 const required=['server17','extensionsAvailable','authUsers','authSessions','authFactors','authUid','authJwt','authRole','storageSchema','roles'];
 const facts=Object.fromEntries(required.map(k=>[k,true]));facts.storageObjects=false;facts.installedExtensions={};verifyBootstrap(facts);
 for(const key of required)assert.throws(()=>verifyBootstrap({...facts,[key]:false}));
 assert(wf.includes("if: github.event_name == 'pull_request' &&"));
});

test('rollback diagnostics whitelist migration, SQLSTATE, predicate ordinal and comparison class, never raw data',()=>{
 const version='20261004202506';
 assert.equal(lastMigrationVersion('PRIVATE\nQUALIFICATION_MIGRATION_'+version+'\n'),version);
 assert.equal(lastMigrationVersion('QUALIFICATION_MIGRATION_99999999999999'),undefined);
 assert.deepEqual(failureFacts({status:3,stdout:'QUALIFICATION_MIGRATION_'+version,stderr:'ERROR:  P0001: SYNTHETIC_POSTCONDITION_'+version+'_2 PRIVATE_DATA'}),{reason:'INPUT_OR_COMMAND',commandExit:3,sqlState:'P0001',postcondition:{version,ordinal:2},lastMigrationVersion:version});
 assert.equal(failureFacts({code:'ERR_ASSERTION',actual:'a'.repeat(64),expected:'b'.repeat(64)}).reason,'ROLLBACK_SNAPSHOT_MISMATCH');
 assert(!JSON.stringify(failureFacts({stderr:'PRIVATE_DATA'})).includes('PRIVATE_DATA'));
});

test('nonce diagnostic handles trimmed EOF and preserves every interior SQL/data byte; acceptance hashes full deterministic dump',()=>{
 const body="-- header\nCREATE TABLE sample(v text);\nCOPY sample FROM stdin;\ntrailing space \n\\.\n-- footer\n";
 const dump=k=>'\\restrict '+k+'\n'+body+'\\unrestrict '+k;
 assert.notEqual(legacySnapshotDigest(dump('AAA')),legacySnapshotDigest(dump('BBB')));
 assert.equal(normalizeOuterDumpNonce(dump('AAA')),body);
 assert.equal(normalizeOuterDumpNonce(dump('BBB')+'\n'),body);
 assert.notEqual(normalizeOuterDumpNonce(dump('AAA')),normalizeOuterDumpNonce(dump('AAA').replace('trailing space ','changed')));
 assert.throws(()=>normalizeOuterDumpNonce('\\restrict AAA\nSQL;\n\\unrestrict BBB'));
 assert(readFileSync('scripts/operations/staging-suffix-qualification/run.mjs','utf8').includes("const snapshot=()=>sha256(dump(['--restrict-key='+TEST_DUMP_KEY]))"));
});

test('no-op acceptance fails closed for schema, data, whole-dump or scheduler changes',()=>{
 const scheduler={launchActiveJobs:'off',jobCount:6,runDetailsCount:0};
 const evidence={onlyOuterNonceDiff:true,fixedWholeEqual:true,fixedSchemaEqual:true,fixedDataEqual:true,schedulerBefore:scheduler,schedulerAfter:{...scheduler}};
 verifyNoOpControls(evidence);
 for(const key of ['onlyOuterNonceDiff','fixedWholeEqual','fixedSchemaEqual','fixedDataEqual'])assert.throws(()=>verifyNoOpControls({...evidence,[key]:false}));
 assert.throws(()=>verifyNoOpControls({...evidence,schedulerAfter:{...scheduler,runDetailsCount:1}}));
 assert.throws(()=>verifyNoOpControls({...evidence,schedulerBefore:{...scheduler,launchActiveJobs:'on'},schedulerAfter:{...scheduler,launchActiveJobs:'on'}}));
});
