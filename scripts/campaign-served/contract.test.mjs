import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {vendor} from './vendor.mjs';
const bytes=Buffer.from('export const synthetic = 1;');
const hash=createHash('sha256').update(bytes).digest('hex');
test('vendor validates frozen bytes and localizes remote runtime imports',async()=>{
 const out=await mkdtemp(tmpdir()+'/campaign-vendor-');try {
 const graph={modules:[{specifier:'https://example.test/a.mjs',local:'synthetic',dependencies:[]}]};
 const result=await vendor(graph,{remote:{'https://example.test/a.mjs':hash}},out,async()=>bytes);
 assert.equal(result.moduleCount,1);assert.equal((await readFile(out+'/'+hash+'.ts')).toString(),bytes.toString());
 const map=JSON.parse(await readFile(out+'/import-map.json'));assert.equal(map.imports['https://example.test/a.mjs'],'file:///deps/'+hash+'.ts');
 }finally{await rm(out,{recursive:true,force:true});}
});
test('vendor rejects absent hashes, modified bytes and unresolved code dependency',async()=>{
 for(const mode of ['missing','tampered','unresolved']){
 const out=await mkdtemp(tmpdir()+'/campaign-vendor-');try{
 const graph={modules:[{specifier:'https://example.test/a.mjs',local:'synthetic',dependencies:mode==='unresolved'?[{specifier:'./b.mjs',code:{specifier:'https://example.test/b.mjs'}}]:[]}]};
 await assert.rejects(vendor(graph,{remote:mode==='missing'?{}:{'https://example.test/a.mjs':hash}},out,async()=>mode==='tampered'?Buffer.from('changed'):bytes));
 }finally{await rm(out,{recursive:true,force:true});}}
});
test('source-only PR job and exact branch disable cannot deploy',async()=>{
 const workflow=await readFile('.github/workflows/campaign-served-worker.yml','utf8');
 assert.match(workflow,/pull_request:/);assert.doesNotMatch(workflow,/workflow_dispatch|pull_request_target|secrets\.|environment:|functions deploy|push:/);
 assert.equal(JSON.parse(await readFile('vercel.json')).git.deploymentEnabled['fix/campaign-served-worker-20261126'],false);
 const run=await readFile('scripts/campaign-served/run.sh','utf8');
 assert.match(run,/--internal/);assert.match(run,/--pull never/);assert.match(run,/--frozen/);assert.doesNotMatch(run,/deno bundle|esbuild|--use-api/);
 assert.match(run,/--platform linux\/amd64/);assert.match(run,/127\.0\.0\.1:9091:9000/);
});
