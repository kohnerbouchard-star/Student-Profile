import test from 'node:test';import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
import {loadPhase15Migrations} from './build-phase15-forward-bundle.mjs';
import {REHEARSAL_STAGES,stageDiagnostic} from './rehearsal-stage-diagnostic.mjs';
const root=process.cwd(),script='scripts/operations/live-migration-reconciliation/rehearse-live-shaped-upgrade.sh';
test('stage sanitizer exports enums only, never unknown contents or raw stderr',()=>{
 for(const stage of REHEARSAL_STAGES)assert.equal(stageDiagnostic(stage).failureStage,stage);
 const s=JSON.stringify(stageDiagnostic('postgresql://sensitive ROW_PAYLOAD stderr'));
 assert(!s.includes('sensitive'));assert(!s.includes('ROW_PAYLOAD'));assert.equal(stageDiagnostic('other').failureSqlstate,null);
});
test('existing migration diagnostics and SQLSTATE survive stage augmentation',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'stage-preserve-'));try{
 const out=path.join(dir,'failure.json');writeFileSync(out,JSON.stringify({failedMigration:'20261004202506_reconcile_loan_liability_purge_graph_v1.sql',failureStage:'disposable-migration-apply',failureSqlstate:'P0001'}));
 execFileSync(process.execPath,['scripts/operations/live-migration-reconciliation/rehearsal-stage-diagnostic.mjs','cleanup',out]);
 const value=JSON.parse(readFileSync(out));assert.equal(value.failureStage,'disposable-migration-apply');assert.equal(value.failureSqlstate,'P0001');assert(value.failedMigration);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('actual shell pre-migration failures retain bounded stage without exposing command output',async()=>{
 const first=(await loadPhase15Migrations('staging'))[0];
 const dir=mkdtempSync(path.join(tmpdir(),'stage-shell-'));
 try{
  const shim=path.join(dir,'shim');mkdirSync(shim);
  // External commands are isolated synthetic stubs, never Docker/hosted access.
  const wrapper=`#!${process.execPath}\nconst fs=require('fs');const path=require('path');const cp=require('child_process');const name=path.basename(process.argv[1]);const args=process.argv.slice(2);const current=fs.existsSync(process.env.PHASE15_WORK_DIR+'/current-stage.txt')?fs.readFileSync(process.env.PHASE15_WORK_DIR+'/current-stage.txt','utf8').trim():'';if(current===process.env.FAIL_STAGE&&(name!=='node'||args.some(a=>(a.includes('build-phase15-')||a.includes('verify-phase15-ledger'))))){console.error('SENSITIVE_STDERR ROW_PAYLOAD postgresql://credential');if(current==='ledger-classification')process.stdout.write('{partial-private-json');process.exit(23);}if(name==='cp'||name==='sha256sum'){const r=cp.spawnSync('/usr/bin/'+name,args,{stdio:'inherit'});process.exit(r.status??1);}if(name==='node'){const r=cp.spawnSync(${JSON.stringify(process.execPath)},args,{stdio:'inherit'});process.exit(r.status??1);}if(name==='docker'){if(args[0]==='inspect')process.stdout.write('synthetic-network');else if(args.includes('select rolsuper from pg_roles where rolname = \\'supabase_admin\\''))process.stdout.write('t\\n');else if(args.some(x=>x.includes('select e.extversion')))process.stdout.write('1.6.4:pg_catalog:cron.job\\n');else if(args.includes('ps')){if(process.env.SECONDARY_CLEANUP_FAILURE==='1'){console.error('SECONDARY_SECRET');process.exit(24);}process.stdout.write('');}else if(args[0]==='exec'&&args.includes('-qAt'))process.stdout.write('{}');}process.exit(0);\n`;
  for(const name of ['node','docker','supabase','openssl','sleep','cp','sha256sum']){const file=path.join(shim,name);writeFileSync(file,wrapper,{mode:0o700});}
  const stages=['source-plan','capture-integrity','schema-capture','schema-row-boundary','ledger-capture','local-startup','local-network-isolation','local-authority-preflight','local-schema-reset','local-schema-restore','local-prerequisite-install','local-prerequisite-verify','pre-schema-export','pre-catalog-export','ledger-classification','ledger-prefix-verification'];
  for(const stage of stages){
   const run=path.join(dir,stage);mkdirSync(run);const work=path.join(run,'work'),evidence=path.join(run,'evidence'),capture=path.join(run,'capture');mkdirSync(work);mkdirSync(capture);
   writeFileSync(path.join(run,'canonical.json'),'{}');writeFileSync(path.join(capture,'schema.sql'),stage==='schema-row-boundary'?"INSERT INTO synthetic VALUES ('ROW_PAYLOAD');\n":'-- synthetic schema only\n');writeFileSync(path.join(capture,'ledger.json'),stage==='ledger-prefix-verification'?JSON.stringify([{version:first.version,name:first.name,sha256:first.sourceSha256,statementCount:1}]):'[]');
   execFileSync('/usr/bin/sha256sum',['schema.sql','ledger.json'],{cwd:capture});writeFileSync(path.join(capture,'SHA256SUMS'),execFileSync('/usr/bin/sha256sum',['schema.sql','ledger.json'],{cwd:capture}));
   const result=spawnSync('bash',[script],{cwd:root,env:{...process.env,PATH:shim+':'+process.env.PATH,FAIL_STAGE:stage,SECONDARY_CLEANUP_FAILURE:'1',PHASE15_ENVIRONMENT:'staging',PHASE15_EXPECTED_PROJECT_REF:'eecvbssdvarfcykcfrny',PHASE15_WORK_DIR:work,PHASE15_EVIDENCE_DIR:evidence,PHASE15_CAPTURE_DIR:capture,PHASE15_CANONICAL_SCHEMA:path.join(run,'canonical.json'),PHASE15_CANONICAL_CATALOG:path.join(run,'canonical.json')},encoding:'utf8',timeout:10000});
   assert.notEqual(result.status,0);
   let summary;try{summary=JSON.parse(readFileSync(path.join(evidence,'summary.json'),'utf8'));}catch(e){throw new Error(stage+': synthetic summary failed: '+result.stderr);}
   assert.equal(summary.failureStage,stage,stage);assert.equal(summary.appliedMigrationCount,0);assert.equal(summary.sourceRowsCopied,false);
   assert(!JSON.stringify(summary).includes('SENSITIVE_STDERR'));assert(!JSON.stringify(summary).includes('credential'));assert(!JSON.stringify(summary).includes('ROW_PAYLOAD'));assert(!JSON.stringify(summary).includes('SECONDARY_SECRET'));assert(summary.errorClass);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('normal Bash reproduces masked loop substitution; assigned inventory fails closed',()=>{
 const before=spawnSync('bash',['-c','set -e; for item in $(false); do :; done; printf MASKED'],{encoding:'utf8'});
 assert.equal(before.status,0);assert.equal(before.stdout,'MASKED');
 const after=spawnSync('bash',['-c','set -e; inventory="$(false)"; for item in $inventory; do :; done; printf CONTINUED'],{encoding:'utf8'});
 assert.notEqual(after.status,0);assert(!after.stdout.includes('CONTINUED'));
});
test('public workflow projects bounded class/stage only and retains private cleanup',()=>{
 const workflow=readFileSync('.github/workflows/econovaria-staging-schema-rehearsal.yml','utf8');
 assert(workflow.includes('errorClass, failedMigration, failedVersion, failureStage, failureSqlstate,'));
 assert(workflow.includes('path: ${{ runner.temp }}/u1/sanitized/result.json'));
 assert(workflow.includes('sudo rm -rf "$RUNNER_TEMP/u1"'));
 assert(!workflow.includes('path: ${{ runner.temp }}/u1/private-evidence'));
});

test('actual qualification export function fails at the first bounded export stage',()=>{
 const source=readFileSync(script,'utf8');const body=source.slice(source.indexOf('capture_local_snapshot() {'),source.indexOf('\nwrite_summary()'));
 const dir=mkdtempSync(path.join(tmpdir(),'export-stage-'));
 try{
  for(const fail of [1,2]){
   const out=path.join(dir,String(fail));mkdirSync(out);
   const harness=`set -euo pipefail\nschema_restored=true\ncontainer=synthetic\nrepo_root=${JSON.stringify(root)}\nPHASE15_EVIDENCE_DIR=${JSON.stringify(out)}\ncount=0\nset_stage(){ printf '%s' "$1" > "$PHASE15_EVIDENCE_DIR/stage"; }\ndocker(){ if test "$1" = ps; then printf synthetic; return 0; fi; cat >/dev/null; count=$((count+1)); if test "$count" -eq ${fail}; then return 23; fi; printf '{}'; }\n${body}\ncapture_local_snapshot qualification\n`;
   const r=spawnSync('bash',['-c',harness],{encoding:'utf8'});assert.notEqual(r.status,0);
   assert.equal(readFileSync(path.join(out,'stage'),'utf8'),fail===1?'post-schema-export':'post-catalog-export');
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
