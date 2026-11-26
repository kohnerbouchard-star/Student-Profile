import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,writeFileSync,readFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {COUNT_CAP,GROUPS,exactDifferenceCounts} from './catalog-diagnostic.mjs';
import {normalizeSupabaseApplicationRestorePair} from './compare-schema-snapshots.mjs';
const directory='scripts/operations/live-migration-reconciliation/';
const SCHEMA='econovaria.release-integrity.raw-schema-evidence.v2',CATALOG='econovaria.phase15.catalog-supplement.v2';
const marker='PRIVATE_object_owner_role_command_token_123';
function fixture(version) {
 const value={schemaVersion:version};
 for(const [group,names] of Object.entries(GROUPS[version])) {
  const target=group==='catalog'?value:(value[group]={});for(const name of names)target[name]=[];
 }
 return value;
}
function compare(left,right,profile) {
 const temp=mkdtempSync(path.join(tmpdir(),'bounded-comparison-'));
 try {
  writeFileSync(path.join(temp,'left.json'),JSON.stringify(left));writeFileSync(path.join(temp,'right.json'),JSON.stringify(right));
  const args=[directory+'compare-schema-snapshots.mjs','--left',path.join(temp,'left.json'),'--right',path.join(temp,'right.json')];
  if(profile)args.push('--profile',profile);
  const result=spawnSync(process.execPath,args,{encoding:'utf8'});
  return {...result,comparison:result.stdout?JSON.parse(result.stdout):null};
 }finally{rmSync(temp,{recursive:true,force:true})}
}
for(const [name,version,group,key,row] of [
 ['application ownership',SCHEMA,'authorization','relationOwners',{owner:marker}],
 ['ACL',SCHEMA,'authorization','tableGrants',{privilege:marker}],
 ['RLS',SCHEMA,'authorization','rowSecurity',{forced:true}],
 ['policy',SCHEMA,'authorization','policies',{expression:marker}],
 ['managed role topology',SCHEMA,'authorization','roleMemberships',{member:marker}],
 ['managed role attributes',SCHEMA,'authorization','roleAttributes',{role:marker}],
 ['scheduler',CATALOG,'catalog','cron',{commandSha256:marker}],
 ['runtime ownership',CATALOG,'catalog','routineSecurity',{owner:marker}],
])test(`${name} is counted without changing exact mismatch exit`,()=>{
 const left=fixture(version),right=structuredClone(left);(group==='catalog'?right:right[group])[key]=[row];
 const result=compare(left,right);assert.equal(result.status,2);assert.equal(result.comparison.matched,false);
 const diagnostic=result.comparison.boundedDiagnostics;assert.equal(diagnostic.categories[`${group}.${key}`],1);
 assert.equal(Object.values(diagnostic.categories).reduce((a,b)=>a+b,0),1);assert(!JSON.stringify(diagnostic).includes(marker));
});
test('counts retain exact positional semantics, timestamps and cap lower bound',()=>{
 const left=fixture(CATALOG),right=fixture(CATALOG);left.cron=[{name:'one',active:false}];right.cron=[{name:'two',active:true},{name:'extra'}];
 assert.equal(exactDifferenceCounts(left,right).categories['catalog.cron'],3);
 left.generatedAt='left';right.generatedAt='right';assert.equal(compare(left,right).status,2);
 const equal=fixture(CATALOG);assert.equal(compare(equal,{...equal,generatedAt:marker}).status,0);
 const a=fixture(CATALOG),b=fixture(CATALOG);a.cron=Array.from({length:COUNT_CAP+5},()=>({active:false}));b.cron=Array.from({length:COUNT_CAP+5},()=>({active:true}));
 const diag=exactDifferenceCounts(a,b);assert.equal(diag.categories['catalog.cron'],COUNT_CAP);assert.equal(diag.countsAtCapAreLowerBounds,true);
});
test('malformed or unsupported evidence never produces available counts',()=>{
 for(const value of [null,[],{}, {schemaVersion:CATALOG}, {...fixture(CATALOG),cron:'bad'}, {...fixture(CATALOG),cron:[marker]}, {...fixture(CATALOG),unknown:marker}])assert.equal(exactDifferenceCounts(fixture(CATALOG),value).status,'invalid');
 const temp=mkdtempSync(path.join(tmpdir(),'bad-catalog-'));
 try{writeFileSync(path.join(temp,'bad'),'{'+marker);const r=spawnSync(process.execPath,[directory+'compare-schema-snapshots.mjs','--left',path.join(temp,'bad'),'--right',path.join(temp,'bad')],{encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stdout,'');assert(!r.stderr.includes(marker));}finally{rmSync(temp,{recursive:true,force:true})}
});
function canonical() {
 const value=fixture(SCHEMA);value.authorization.roleMemberships=['supabase_functions_admin','supabase_realtime_admin'].map(role=>({role,member:'postgres',grantor:'supabase_admin',adminOption:false}));return value;
}
test('application restore profile is canonical-to-hosted, not canonical-to-local or runtime catalog',()=>{
 const local=canonical(),hosted=canonical();hosted.authorization.roleMemberships=[{role:'postgres',member:'cli_login_postgres',grantor:'supabase_admin',adminOption:false}];
 assert.throws(()=>normalizeSupabaseApplicationRestorePair(local,structuredClone(local)),/topology mismatch/);
 assert.throws(()=>normalizeSupabaseApplicationRestorePair(fixture(CATALOG),fixture(CATALOG)));
 const normalized=normalizeSupabaseApplicationRestorePair(local,hosted);assert.deepEqual(normalized.left,normalized.right);
 for(const key of ['schemaOwners','tableGrants','rowSecurity','policies']) {
  const changed=structuredClone(hosted);changed.authorization[key]=[{synthetic:marker}];const pair=normalizeSupabaseApplicationRestorePair(local,changed);assert.notDeepEqual(pair.left,pair.right);
 }
});
function projectWithWorkflow(schemaComparison,catalogComparison,runtimeCatalogFixture) {
 const temp=mkdtempSync(path.join(tmpdir(),'protected-projection-'));const evidence=path.join(temp,'evidence'),capture=path.join(temp,'capture');mkdirSync(evidence);mkdirSync(capture);mkdirSync(path.join(temp,'u1','sanitized'),{recursive:true});
 try{
  writeFileSync(path.join(capture,'schema.sql'),marker);writeFileSync(path.join(capture,'ledger.json'),marker);
  writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({sourceCommit:'a'.repeat(40),environment:'staging',status:'PASS',exitCode:0,executionMode:'disposable',canonicalApplicationSchemaMatched:true,runtimeCatalogComparisonExit:2,runtimeCatalogFixture,sourceRowsCopied:false,rawSchemaDumpRetained:false,postBundleSuffix:{appliedMigrationCount:15,certifiedMigrationCount:16},secret:marker,releaseCertificate:true}));
  if(schemaComparison!==undefined)writeFileSync(path.join(evidence,'schema-comparison.json'),JSON.stringify(schemaComparison));
  if(catalogComparison!==undefined)writeFileSync(path.join(evidence,'catalog-comparison.json'),JSON.stringify(catalogComparison));
  const workflow=readFileSync('.github/workflows/econovaria-staging-schema-rehearsal.yml','utf8');
  const code=workflow.split('      - name: Retain only bounded qualification results')[1].split('      - if: always()')[0].split('        run: |\n')[1].split('\n').map(line=>line.slice(10)).join('\n');
  const r=spawnSync('bash',['-euo','pipefail','-c',code],{encoding:'utf8',env:{...process.env,RUNNER_TEMP:temp,PHASE15_EVIDENCE_DIR:evidence,PHASE15_CAPTURE_DIR:capture}});assert.equal(r.status,0,r.stderr);assert(!r.stdout.includes(marker));assert(!r.stderr.includes(marker));
  const raw=readFileSync(path.join(temp,'u1','sanitized','result.json'),'utf8');assert(!raw.includes(marker));return JSON.parse(raw);
 }finally{rmSync(temp,{recursive:true,force:true})}
}
test('actual protected jq-to-node projection publishes only fixed counts, never permission',()=>{
 const left=fixture(CATALOG),right=fixture(CATALOG);left.cron=[{name:'synthetic',commandSha256:'old'}];right.cron=[{name:marker,commandSha256:marker}];const comparison=compare(left,right).comparison;
 assert(JSON.stringify(comparison).includes(marker));const result=projectWithWorkflow(compare(fixture(SCHEMA),fixture(SCHEMA)).comparison,comparison);
 assert.equal(result.releaseCertificate,false);assert.equal(result.runtimeCatalogComparisonExit,2);assert.equal(result.canonicalApplicationSchemaMatched,true);
 assert.equal(result.exactComparisonDiagnostics.runtimeCatalog.categories['catalog.cron'],2);
 assert.equal(result.exactComparisonDiagnostics.applicationSchema.status,'available');
});
test('actual protected projection rejects injected diagnostic fields/counts and missing evidence',()=>{
 for(const diagnostic of [undefined,{status:'available',categories:{[marker]:1}}, {status:'available',countCap:COUNT_CAP,countsAtCapAreLowerBounds:true,categories:Object.fromEntries(GROUPS[CATALOG].catalog.map(k=>['catalog.'+k,-1]))}]) {
  const result=projectWithWorkflow(undefined,diagnostic===undefined?undefined:{boundedDiagnostics:diagnostic});assert.notEqual(result.exactComparisonDiagnostics.runtimeCatalog.status,'available');assert.equal(result.releaseCertificate,false);assert.equal(result.runtimeCatalogComparisonExit,2);
 }
});
test('protected projection accepts only the two bounded fixture fields', () => {
 const accepted = {schedulerRowsAdded:6,bootstrapHistoryAdded:true};
 const result=projectWithWorkflow(undefined,undefined,{...accepted,[marker]:marker});
 assert.deepEqual(result.runtimeCatalogFixture,accepted);
 assert.equal(result.runtimeCatalogComparisonExit,2);
 for (const receipt of [{...accepted,schedulerRowsAdded:6.5},{...accepted,schedulerRowsAdded:'6'},
   {...accepted,schedulerRowsAdded:7},{...accepted,bootstrapHistoryAdded:marker},marker]) {
  assert.equal(projectWithWorkflow(undefined,undefined,receipt).runtimeCatalogFixture,null);
 }
});
