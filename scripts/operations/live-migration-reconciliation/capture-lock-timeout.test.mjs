import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';import path from 'node:path';import {tmpdir} from 'node:os';import {spawn,spawnSync} from 'node:child_process';
const helper='scripts/operations/live-migration-reconciliation/capture-rehearsal-snapshot.sh';
test('capture keeps snapshot, read-only options and outer bound while adding initial lock bound',()=>{
 const source=readFileSync(helper,'utf8');for(const text of ['timeout 150 pg_dump --snapshot="$snapshot" --lock-wait-timeout=5000','default_transaction_read_only=on','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','read -r -t 30 ledger','rm -f "$out/schema.sql" "$out/ledger.json" "$out/SHA256SUMS"'])assert(source.includes(text));
 assert(!source.includes('cat "$out/dump-diagnostics"'));assert(!source.includes('retry'));
});
test('native pg_dump resets session lock timeout but explicit initial lock timeout wins',{skip:!(process.env.REF032_EMBEDDED_MODULE&&process.env.REF032_PG_BIN)&&'Native PostgreSQL required'},async()=>{
 const {default:PG}=await import(process.env.REF032_EMBEDDED_MODULE);const dir=mkdtempSync(path.join(tmpdir(),'capture-lock-'));const port=57677;
 const pg=new PG({databaseDir:path.join(dir,'db'),port,user:'postgres',password:'synthetic-only',persistent:false,postgresFlags:['-k','','-h','127.0.0.1'],onLog:()=>{},onError:()=>{},autoRehydrateSymlinks:true});let locker,exporter;
 const dump=(snapshot,extra=[],ms=2000)=>new Promise(resolve=>{const child=spawn(path.join(process.env.REF032_PG_BIN,'pg_dump'),['-h','127.0.0.1','-p',String(port),'-U','postgres','-d','postgres','--schema-only','--verbose','--schema=synthetic_lock',`--snapshot=${snapshot}`,...extra],{env:{PATH:process.env.PATH,LC_ALL:'C',PGPASSWORD:'synthetic-only',PGOPTIONS:'-c default_transaction_read_only=on -c lock_timeout=50'},stdio:['ignore','ignore','pipe']});let stderr='';child.stderr.on('data',x=>stderr+=x);let outerExpired=false;const timer=setTimeout(()=>{outerExpired=true;child.kill('SIGTERM')},ms);child.on('close',(code,signal)=>{clearTimeout(timer);const log=path.join(dir,'dump-private');writeFileSync(log,stderr);const progress=spawnSync('bash',['-c','source "$1"; capture_dump_progress "$2"','test','scripts/operations/live-migration-reconciliation/capture-dump-progress.sh',log],{encoding:'utf8'}).stdout;resolve({code,signal,outerExpired,progress,lockTimeout:stderr.includes('canceling statement due to statement timeout')&&/^pg_dump: detail: Query was: LOCK TABLE .+ IN ACCESS SHARE MODE$/m.test(stderr)});});});
 try{await pg.initialise();await pg.start();locker=pg.getPgClient('postgres','127.0.0.1');exporter=pg.getPgClient('postgres','127.0.0.1');await locker.connect();await exporter.connect();await locker.query('create schema synthetic_lock;create table synthetic_lock.item(id integer)');await locker.query('begin;lock table synthetic_lock.item in access exclusive mode');await exporter.query('begin isolation level repeatable read read only');const snapshot=(await exporter.query('select pg_export_snapshot() as id')).rows[0].id;
 const old=await dump(snapshot,[],400);assert.equal(old.outerExpired,true);assert.equal(old.lockTimeout,false);assert.equal(old.progress,'tables');
 const bounded=await dump(snapshot,['--lock-wait-timeout=100']);assert.equal(bounded.code,1);assert.equal(bounded.outerExpired,false);assert.equal(bounded.lockTimeout,true);assert.equal(bounded.progress,'tables');
 await locker.query('rollback');assert.equal((await dump(snapshot,['--lock-wait-timeout=100'])).code,0);await exporter.query('rollback');
 }finally{await locker?.end();await exporter?.end();if(pg.process?.exitCode===null)await pg.stop();rmSync(dir,{recursive:true,force:true});}
});

test('actual capture shell emits fixed diagnostics and removes incomplete captures',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'capture-failure-contract-'));const shim=path.join(dir,'bin');mkdirSync(shim);
 try{
 writeFileSync(path.join(shim,'psql'),`#!/bin/bash
if test "$CASE" = connection; then echo PRIVATE_CONNECTION_SECRET >&2; exit 2; fi
while IFS= read -r line; do
 case "$line" in *pg_export_snapshot*) echo 00000001-00000002-1;; *ROLLBACK*) echo '[]';; *\\q*) exit 0;; esac
done
`,{mode:0o700});
 writeFileSync(path.join(shim,'pg_dump'),`#!/bin/bash
printf 'PRIVATE_SCHEMA'
case "$CASE" in
 lock) printf 'pg_dump: error: query failed: ERROR:  canceling statement due to statement timeout\\npg_dump: detail: Query was: LOCK TABLE PRIVATE_OBJECT IN ACCESS SHARE MODE\\nPRIVATE_CREDENTIAL\\n' >&2; exit 1;;
 outer) echo PRIVATE_CREDENTIAL >&2; exit 124;;
 statement) echo 'pg_dump: error: query failed: ERROR:  canceling statement due to statement timeout' >&2; exit 1;;
 other) echo PRIVATE_CREDENTIAL >&2; exit 2;;
esac
`,{mode:0o700});
 for(const [name,stage,kind,code] of [['lock','capture-dump','initial-lock-timeout',1],['outer','capture-dump','outer-dump-timeout',124],['statement','capture-dump','command-failure',1],['other','capture-dump','command-failure',2],['connection','capture-snapshot','command-failure',1]]){
 const out=path.join(dir,name);const result=spawnSync('bash',[helper,out],{env:{PATH:shim+':'+process.env.PATH,CASE:name,PHASE15_VERSIONS:'20260920082200'},encoding:'utf8',timeout:3000});
 assert.equal(result.status,code,name);assert.equal(result.stdout,'');assert(!result.stderr.includes('PRIVATE'));const diagnostic=JSON.parse(result.stderr.trim());assert.deepEqual(diagnostic,{status:'FAILED',captureStage:stage,captureExitKind:kind,exitCode:code,captureProgress:'unobserved',captureObserver:{status:'disabled',samples:[]}});
 for(const file of ['schema.sql','ledger.json','SHA256SUMS'])assert(!existsSync(path.join(out,file)));
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('verbose progress projection accepts exact object-free messages only',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'capture-progress-'));const file=path.join(dir,'private');const project=()=>spawnSync('bash',['-c','source "$1"; capture_dump_progress "$2"','test','scripts/operations/live-migration-reconciliation/capture-dump-progress.sh',file],{encoding:'utf8'});
 try{for(const [text,expected] of [['PRIVATE_SCHEMA\nPRIVATE_CREDENTIAL','unobserved'],['pg_dump: reading schemas\nPRIVATE_SESSION','schemas'],['pg_dump: reading user-defined tables\npg_dump: reading user-defined functions','functions'],['pg_dump: reading schemas PRIVATE_OBJECT','unobserved'],['pg_dump: reading dependency data\npg_dump: saving database definition','database-definition']]){writeFileSync(file,text+'\n');const result=project();assert.equal(result.status,0);assert.equal(result.stdout,expected);assert.equal(result.stderr,'');}}
 finally{rmSync(dir,{recursive:true,force:true});}
});
