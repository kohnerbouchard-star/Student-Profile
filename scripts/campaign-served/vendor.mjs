import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
let diagnostic={kind:'unclassified'};
const mark=(kind,specifier)=>{diagnostic={kind,moduleSha256:createHash('sha256').update(specifier).digest('hex')};if(specifier.startsWith('https://esm.sh/')){const u=new URL(specifier);if(!u.username&&!u.password)diagnostic.publicModulePath=u.pathname;}};
const sha=b=>createHash('sha256').update(b).digest('hex');
// Deno2.9.3 libs/cache_dir/global/cache_file.rs: content followed by the
// final newline metadata record. Verify original locked content, never envelope.
export function lockedContent(raw,url,expected) {
  if(sha(raw)===expected)return raw;
  const split=raw.lastIndexOf(10),prefix=Buffer.from('\n// denoCacheMetadata=');
  assert(split>=0 && raw.subarray(split,split+prefix.length).equals(prefix));
  const metadata=JSON.parse(raw.subarray(split+prefix.length).toString('utf8'));
  assert.equal(metadata.url,url);assert(metadata.headers&&typeof metadata.headers==='object'&&!Array.isArray(metadata.headers));
  const content=raw.subarray(0,split);assert.equal(sha(content),expected);
  return content;
}
export async function vendor(graph,lock,out,read=readFile) {
  const imports={'https://esm.sh/tslib@2.8.1/denonext/tslib.mjs':'file:///src/backend/supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs'},scopes={},records=[];
  // Deno info also describes type-only dependencies. Traverse only executable
  // code edges from roots; every reachable remote still requires its locked hash.
  const modules=new Map(graph.modules.map(m=>[m.specifier,m])),seen=new Set();
  const redirect=s=>{for(let i=0;graph.redirects?.[s]&&i<10;i++)s=graph.redirects[s];return s;};
  function visit(input){const spec=redirect(input);if(spec.startsWith('node:')||seen.has(spec))return;
    const m=modules.get(spec);mark('missing-runtime-module',spec);assert(m);seen.add(spec);
    for(const d of m.dependencies||[])if(d.code){assert(typeof d.code.specifier==='string');visit(d.code.specifier);}}
  assert(Array.isArray(graph.roots)&&graph.roots.length>0);graph.roots.forEach(visit);
  const remote=graph.modules.filter(m=>seen.has(m.specifier)&&/^https:/.test(m.specifier));
  assert(remote.length>0);
  for(const m of remote) {
    mark(!m.local?'unavailable-source':'unpinned-module',m.specifier);
    assert(m.local && /^[a-f0-9]{64}$/.test(lock.remote[m.specifier]));
    const raw=await read(m.local);mark('source-integrity',m.specifier);const bytes=lockedContent(raw,m.specifier,lock.remote[m.specifier]);
    const file=sha(bytes)+(m.specifier.includes('.json')?'.json':m.specifier.includes('.d.ts')?'.d.ts':'.ts');
    imports[m.specifier]='file:///deps/'+file;records.push({m,bytes,file,sha256:sha(bytes)});
  }
  const resolve=s=>{if(s.startsWith('file://'+process.cwd()+'/'))return 'file:///src/'+s.slice(('file://'+process.cwd()+'/').length);let n=s;for(let i=0;graph.redirects?.[n]&&i<10;i++)n=graph.redirects[n];return imports[n];};
  for(const [a,b] of Object.entries(graph.redirects||{})){assert(resolve(b));imports[a]=resolve(b);}
  for(const {m,file} of records) {
    const map={};
    for(const d of m.dependencies||[]) {
      if(d.code?.specifier?.startsWith('node:'))continue;
      if(d.code) {mark('unmapped-dependency',d.code.specifier);assert(resolve(d.code.specifier),'Unmapped runtime dependency');map[d.specifier]=resolve(d.code.specifier);}
    }
    scopes['file:///deps/'+file]=map;
  }
  await mkdir(out,{recursive:true});
  for(const r of records)await writeFile(out+'/'+r.file,r.bytes,{mode:0o600});
  await writeFile(out+'/import-map.json',JSON.stringify({imports,scopes}));
  return {status:'PASS',moduleCount:records.length,modules:records.map(r=>({url:r.m.specifier,sha256:r.sha256}))};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try {const [g,l,o]=process.argv.slice(2);const result=await vendor(JSON.parse(await readFile(g)),JSON.parse(await readFile(l)),o);
 const config=JSON.parse(await readFile('backend/supabase/functions/campaign-orchestrator/deno.json'));
 const map=JSON.parse(await readFile(o+'/import-map.json'));
 await writeFile(o+'/runtime-deno.json',JSON.stringify({...config,imports:{...config.imports,...map.imports},scopes:map.scopes}),{mode:0o600});
 console.log(JSON.stringify(result));}
 catch {console.log(JSON.stringify({status:'FAILED',stage:'frozen-vendor',...diagnostic}));process.exitCode=1;}
}
