#!/usr/bin/env node
// Test-only source fixtures, never qualification pins for the current application.
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { check } from './evidence.mjs';
import { HARNESS_PATHS, OVERLAY_PATHS, MODE_API_RELATION } from './runtime-inputs.mjs';
import { verifyRuntime } from './runtime-equivalence.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const historical = Object.freeze({
  backend:{sha:'1ab7aaad04d95c020e5211d69735106a58da31ce',tree:'874af232b28f4d1a0e9ad4dfdb55dd65af3404bc'},
  frontend:{sha:'db4aec4c5203ef44618b8718f871dd400eaa4f48',tree:'b5f410f50ed25ba6f155bae731ac45d7e7bf3989'},
});
const frontendTestInputs = [
  'package.json', '.github/workflows/admin-v2-players.yml',
  ...['csv-browser-smoke.mjs','csv.test.mjs','import-browser-smoke.mjs','import.test.mjs']
    .map(suffix => `scripts/admin-v2-roster-${suffix}`),
];
const report = {kind:'test-fixture-mode-matrix',passed:false,stage:'preflight',connectedExecuted:false,modes:[]};
let temporary;
function git(cwd,...args) {
  try {return execFileSync('git',['-C',cwd,...args],{maxBuffer:200*1024*1024,stdio:['ignore','pipe','pipe']});}
  catch {throw new Error('mode-fixture-git');}
}
async function put(directory,path,bytes) {
  await mkdir(dirname(join(directory,path)),{recursive:true});
  await writeFile(join(directory,path),bytes);
}
function commit(directory) {
  git(directory,'add','-A');
  git(directory,'-c','user.name=Synthetic fixture','-c','user.email=fixture@example.test','commit','-qm','Synthetic guard fixture');
  return {sha:String(git(directory,'rev-parse','HEAD')).trim(),tree:String(git(directory,'rev-parse','HEAD^{tree}')).trim()};
}
try {
  await verifyRuntime(root);
  const tests=(await readdir(join(root,'scripts/roster-connected'))).filter(name=>name.endsWith('.test.mjs'))
    .sort().map(name=>`scripts/roster-connected/${name}`);
  check(tests.length>0 && tests.every(path=>HARNESS_PATHS.includes(path)),'mode-fixture-complete-suite');
  temporary=await mkdtemp(join(tmpdir(),'roster-complete-mode-fixtures-'));
  for(const mode of ['backend-owned','integrated-composite']) {
    report.stage=`${mode}-source-fixture`;
    const directory=join(temporary,mode);
    git(root,'clone','--shared','--no-checkout','--quiet',root,directory);
    git(directory,'checkout','--quiet','--detach',historical.backend.sha);
    let backend=historical.backend,frontend=historical.frontend;
    if(mode === 'integrated-composite') {
      // Full source fixture is frozen BEFORE its separate harness commit. Include
      // frontend package commands/test helpers, not only seven application blobs.
      for(const path of [...OVERLAY_PATHS,...frontendTestInputs]) {
        await put(directory,path,git(root,'show',`${historical.frontend.sha}:${path}`));
      }
      backend=frontend=commit(directory);
    }
    for(const path of HARNESS_PATHS) await put(directory,path,await readFile(join(root,path)));
    await put(directory,'scripts/roster-connected/sources.json',JSON.stringify({schemaVersion:1,
      mode,apiRelation:MODE_API_RELATION[mode],backend,frontend,overlay:OVERLAY_PATHS},null,2)+'\n');
    commit(directory);
    report.stage=`${mode}-complete-suite`;
    let output;
    try {output=execFileSync(process.execPath,['--test',...tests],{cwd:directory,encoding:'utf8',
      timeout:180_000,maxBuffer:16*1024*1024,stdio:['ignore','pipe','pipe']});}
    catch {throw new Error('mode-fixture-suite');}
    const count=name=>Number(output.match(new RegExp(`^# ${name} (\\d+)$`,'m'))?.[1]);
    const result={mode,tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped')};
    check(Number.isSafeInteger(result.tests) && result.tests>0 && result.passed===result.tests && result.failed===0 && result.skipped===0,'mode-fixture-results');
    report.modes.push(result);
  }
  check(report.modes[0].tests===report.modes[1].tests,'mode-fixture-matrix-count');
  report.stage='complete';report.passed=true;
} catch {
  // Test runner output is private: failures print only aggregate status.
  report.passed=false;
} finally {
  if(temporary) await rm(temporary,{recursive:true,force:true}).catch(()=>{report.passed=false;});
  console.log(JSON.stringify(report));
  process.exitCode=report.passed ? 0 : 1;
}
