import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
let diagnostic={kind:'unclassified'};
const mark=(kind,specifier)=>{diagnostic={kind,moduleSha256:createHash('sha256').update(specifier).digest('hex')};};
const sha=b=>createHash('sha256').update(b).digest('hex');
export async function vendor(graph,lock,out,read=readFile) {
  const imports={'https://esm.sh/tslib@2.8.1/denonext/tslib.mjs':'file:///src/backend/supabase/functions/_shared/vendor/tslib-2.8.1/tslib.mjs'},scopes={},records=[];
  const remote=graph.modules.filter(m=>/^https:/.test(m.specifier));
  assert(remote.length>0);
  for(const m of remote) {
    mark(!m.local?'unavailable-source':'unpinned-module',m.specifier);
    assert(m.local && /^[a-f0-9]{64}$/.test(lock.remote[m.specifier]));
    const bytes=await read(m.local);mark('source-integrity',m.specifier);assert.equal(sha(bytes),lock.remote[m.specifier]);
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
 try {const [g,l,o]=process.argv.slice(2);console.log(JSON.stringify(await vendor(JSON.parse(await readFile(g)),JSON.parse(await readFile(l)),o)));}
 catch {console.log(JSON.stringify({status:'FAILED',stage:'frozen-vendor',...diagnostic}));process.exitCode=1;}
}
