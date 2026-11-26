import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {vendor,lockedContent} from './vendor.mjs';
const bytes=Buffer.from('export const synthetic = 1;');
const hash=createHash('sha256').update(bytes).digest('hex');
test('vendor validates frozen bytes and localizes remote runtime imports',async()=>{
 const out=await mkdtemp(tmpdir()+'/campaign-vendor-');try {
 const graph={roots:['https://example.test/a.mjs'],modules:[{specifier:'https://example.test/a.mjs',local:'synthetic',dependencies:[]}]};
 const result=await vendor(graph,{remote:{'https://example.test/a.mjs':hash}},out,async()=>bytes);
 assert.equal(result.moduleCount,1);assert.equal((await readFile(out+'/'+hash+'.ts')).toString(),bytes.toString());
 const map=JSON.parse(await readFile(out+'/import-map.json'));assert.equal(map.imports['https://example.test/a.mjs'],'file:///src/backend/supabase/functions/campaign-orchestrator/ci_vendor/'+hash+'.ts');
 }finally{await rm(out,{recursive:true,force:true});}
});
test('vendor rejects absent hashes, modified bytes and unresolved code dependency',async()=>{
 for(const mode of ['missing','tampered','unresolved']){
 const out=await mkdtemp(tmpdir()+'/campaign-vendor-');try{
 const graph={roots:['https://example.test/a.mjs'],modules:[{specifier:'https://example.test/a.mjs',local:'synthetic',dependencies:mode==='unresolved'?[{specifier:'./b.mjs',code:{specifier:'https://example.test/b.mjs'}}]:[]}]};
 await assert.rejects(vendor(graph,{remote:mode==='missing'?{}:{'https://example.test/a.mjs':hash}},out,async()=>mode==='tampered'?Buffer.from('changed'):bytes));
 }finally{await rm(out,{recursive:true,force:true});}}
});
test('source-only PR job and exact branch disable cannot deploy',async()=>{
 const workflow=await readFile('.github/workflows/campaign-served-worker.yml','utf8');
 assert.match(workflow,/pull_request:/);assert.doesNotMatch(workflow,/workflow_dispatch|pull_request_target|secrets\.|environment:|functions deploy|push:/);
 assert.equal(JSON.parse(await readFile('vercel.json')).git.deploymentEnabled['fix/campaign-served-worker-20261126'],false);
 const run=await readFile('scripts/campaign-served/run.sh','utf8');
 assert.match(run,/--internal/);assert.match(run,/--pull never/);assert.match(run,/--frozen/);assert.doesNotMatch(run,/deno bundle|esbuild|--use-api/);
 assert.match(run,/--platform linux\/amd64/);assert.match(run,/runtime-deno[.]json:/);assert.match(run,/--network none/);assert.match(run,/bundle --entrypoint/);assert.match(run,/--main-service \/artifact\/campaign[.]eszip/);assert.match(run,/--user/);assert.doesNotMatch(run,/ --import-map /);assert.doesNotMatch(run,/-p [0-9]/);assert.match(run,/RUNTIME_CONTAINER_ID/);
});

test('Deno cache envelope decoding preserves exact locked content',()=>{
 const url='https://example.test/a.mjs';
 const envelope=Buffer.concat([bytes,Buffer.from('\n// denoCacheMetadata='+JSON.stringify({url,headers:{'content-type':'application/javascript'},time:123}))]);
 assert.deepEqual(lockedContent(envelope,url,hash),bytes);
 assert.throws(()=>lockedContent(envelope,'https://example.test/other',hash));
 const tampered=Buffer.concat([Buffer.from('changed'),envelope.subarray(bytes.length)]);
 assert.throws(()=>lockedContent(tampered,url,hash));
 assert.throws(()=>lockedContent(Buffer.concat([bytes,Buffer.from('\n// denoCacheMetadata=invalid')]),url,hash));
});

test('code closure ignores type-only graph nodes but never an unpinned runtime import',async()=>{
 const out=await mkdtemp(tmpdir()+'/campaign-vendor-');try{
 const graph={roots:['https://example.test/a.mjs'],modules:[
  {specifier:'https://example.test/a.mjs',local:'a',dependencies:[{specifier:'./types.d.ts',type:{specifier:'https://example.test/types.d.ts'}}]},
  {specifier:'https://example.test/types.d.ts',local:'types',dependencies:[]}]};
 assert.equal((await vendor(graph,{remote:{'https://example.test/a.mjs':hash}},out,async()=>bytes)).moduleCount,1);
 graph.modules[0].dependencies[0].code={specifier:'https://example.test/types.d.ts'};
 await assert.rejects(vendor(graph,{remote:{'https://example.test/a.mjs':hash}},out,async()=>bytes));
 }finally{await rm(out,{recursive:true,force:true});}
});
