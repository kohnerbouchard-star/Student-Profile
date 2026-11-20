import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifyRuntime, verifySharedApi, verifyWorkflowCoverage } from './runtime-equivalence.mjs';
import { prepare } from './prepare.mjs';
import { API_PATH, API_ROSTER_LINES, API_EXPORT_SEAM, OVERLAY_PATHS, METADATA_PATHS, HARNESS_PATHS,
  classifyPath, workflowEvents, workflowSelects, MODE_API_RELATION } from './runtime-inputs.mjs';

const api = `export function createClient() {\n  const readGameLifecycle = () => true;\n  return {\n    readGameLifecycle,\n${API_EXPORT_SEAM}  };\n}\n`;
const rosterApi = API_ROSTER_LINES[0]+api.replace(API_EXPORT_SEAM, `    createPlayer,\n${API_ROSTER_LINES[1]}    updatePlayerSettings,\n`);
const workflow = `name: Roster Connected E2E\n\n${workflowEvents()}\npermissions:\n  contents: read\n`;
async function fixture(mode = 'backend-owned') {
  const root = await mkdtemp(join(tmpdir(),'roster-runtime-proof-'));
  const git = (...args) => execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
  const put = async (path, text) => {await mkdir(dirname(join(root,path)),{recursive:true});await writeFile(join(root,path),text);};
  const commit = () => {git('add','-A');git('-c','user.name=Synthetic fixture','-c','user.email=fixture@example.test','commit','-qm','Synthetic runtime snapshot');return {sha:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}')};};
  try {
    git('init','-q');
    for (const [path,text] of Object.entries({[API_PATH]:api,
      'admin/v2/src/routes/players/PlayersController.js':'native controller\n',
      'admin/v2/src/routes/players/PlayersRoute.js':'native route\n',
      'backend/src/application.ts':'runtime\n','backend/executable.sh':'#!/bin/sh\nexit 0\n','backend/supabase/migrations/001.sql':'select 1;\n',
      'scripts/econovaria-local-gateway.py':'runtime\n','scripts/game-creation-provisioning-local-acceptance.mjs':'runtime\n',
      'docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json':'{}\n',
      'docs/seed-content/input.json':'{}\n','assets/runtime.svg':'<svg/>\n',
      'package.json':'{}\n','package-lock.json':'{}\n','.gitignore':'.env\n',
      [METADATA_PATHS[0]]:'{}\n'})) await put(path,text);
    await chmod(join(root,'backend/executable.sh'),0o755);
    const backend = commit();
    for (const path of OVERLAY_PATHS) await put(path,path===API_PATH ? rosterApi : 'roster runtime\n');
    const frontend = commit();
    git('checkout','-q',mode === 'integrated-composite' ? frontend.sha : backend.sha);
    const source = {schemaVersion:1,mode,apiRelation:MODE_API_RELATION[mode],backend:mode === 'integrated-composite' ? frontend : backend,frontend,overlay:OVERLAY_PATHS};
    await put('scripts/roster-connected/sources.json',JSON.stringify(source));
    await put('.github/workflows/roster-connected-e2e.yml',workflow);
    await put('scripts/roster-connected/README.md','Harness qualification limits.\n');
    commit();
    return {root,git,put,commit,source,close:()=>rm(root,{recursive:true,force:true})};
  } catch(error) {await rm(root,{recursive:true,force:true});throw error;}
}
async function withFixture(mode, run) {
  const f = await fixture(mode);
  try {await run(f);} finally {await f.close();}
}
const rejects = (f,label) => assert.rejects(verifyRuntime(f.root), error => error.message===label && !error.message.includes('PRIVATE-CANARY'));

test('backend-owned mode binds HEAD, full pre-overlay state and real disk bytes', async () => {
  await withFixture('backend-owned',async f => {
    const result = await verifyRuntime(f.root);
    assert.equal(result.mode,'backend-owned');assert.equal(result.headSha,f.git('rev-parse','HEAD'));
    assert.equal(result.headTree,f.git('rev-parse','HEAD^{tree}'));assert.equal(result.projectionSha256,result.expectedProjectionSha256);
    assert.match(result.policySha256,/^[a-f0-9]{64}$/);assert.equal(result.diskInputsMatchHead,true);assert.equal(result.frontendNonOverlayInputsCovered,false);
    for(const path of OVERLAY_PATHS) {
      await f.put(path,'PRIVATE-CANARY');f.commit();
      await rejects(f,'runtime-head-projection-drift');f.git('reset','--hard','HEAD~1');
    }
  });
});

test('integrated-composite mode binds every full frontend overlay, including lifecycle bytes', async () => {
  await withFixture('integrated-composite',async f => {
    const result=await verifyRuntime(f.root);assert.equal(result.mode,'integrated-composite');
    assert.equal(result.frontendNonOverlayInputsCovered,true);assert.equal(result.runtimeBaseRole,'integrated-backend-and-frontend');
    for(const path of OVERLAY_PATHS) {
      await f.put(path,'PRIVATE-CANARY');f.commit();
      await rejects(f,'runtime-head-projection-drift');f.git('reset','--hard','HEAD~1');
    }
  });
});

test('explicit modes never fall back to whichever projection happens to pass', async () => {
  for(const mode of ['backend-owned','integrated-composite']) await withFixture(mode,async f => {
    f.source.mode = mode === 'backend-owned' ? 'integrated-composite' : 'backend-owned';
    await f.put('scripts/roster-connected/sources.json',JSON.stringify(f.source));f.commit();
    await rejects(f,'runtime-api-relation');
    f.source.apiRelation=MODE_API_RELATION[f.source.mode];await f.put('scripts/roster-connected/sources.json',JSON.stringify(f.source));f.commit();
    await rejects(f,mode === 'backend-owned' ? 'runtime-integrated-pin-identity' : 'runtime-shared-api-export-seam');
    for(const invalid of [null,'auto','backend','']) {
      f.source.mode=invalid;await f.put('scripts/roster-connected/sources.json',JSON.stringify(f.source));f.commit();
      await rejects(f,'runtime-explicit-mode');
    }
  });
});

test('backend, migration, helper, canonical contract, seed, asset and lock drift fails', async () => {
  await withFixture('backend-owned',async f => {
    for(const path of ['backend/src/application.ts','backend/supabase/migrations/001.sql',
      'scripts/econovaria-local-gateway.py','scripts/game-creation-provisioning-local-acceptance.mjs',
      'docs/operations/contracts/beta-seed-downstream-consumer-contract-v1.json',
      'docs/seed-content/input.json','assets/runtime.svg','package-lock.json']) {
      await f.put(path,'PRIVATE-CANARY');f.commit();
      await rejects(f,'runtime-head-projection-drift');f.git('reset','--hard','HEAD~1');
    }
  });
});

test('tracked additions, deletions and renames fail closed, including new roots', async () => {
  await withFixture('backend-owned',async f => {
    await f.put('new-runtime/input.mjs','PRIVATE-CANARY');f.commit();
    await rejects(f,'runtime-head-projection-drift');f.git('reset','--hard','HEAD~1');
    await rm(join(f.root,'backend/src/application.ts'));f.commit();
    await rejects(f,'runtime-head-projection-drift');f.git('reset','--hard','HEAD~1');
    f.git('mv','backend/src/application.ts','backend/src/renamed.ts');f.commit();
    await rejects(f,'runtime-head-projection-drift');
  });
});

test('dirty actual bytes fail even with assume-unchanged; staged replacements also fail', async () => {
  await withFixture('backend-owned',async f => {
    const path='backend/src/application.ts';
    f.git('update-index','--assume-unchanged',path);await f.put(path,'PRIVATE-CANARY');
    await rejects(f,'runtime-dirty-input');f.git('update-index','--no-assume-unchanged',path);f.git('reset','--hard','HEAD');
    await f.put(path,'PRIVATE-CANARY');f.git('add',path);await f.put(path,'runtime\n');
    await rejects(f,'runtime-staged-input');f.git('reset','--hard','HEAD');
    await chmod(join(f.root,path),0o755);await rejects(f,'runtime-file-mode');
  });
});

test('untracked and ignored inputs cannot replace or extend the runtime silently', async () => {
  await withFixture('backend-owned',async f => {
    for(const path of ['backend/src/untracked.ts','.env','runtime-config.env.js','scripts/.roster-canonical-provisioning-stdin.mjs']) {
      await f.put(path,'PRIVATE-CANARY');await rejects(f,'runtime-untracked-input');await rm(join(f.root,path));
    }
    await rm(join(f.root,'backend/src/application.ts'));
    await rejects(f,'runtime-preflight-failed');
  });
});

test('file and directory symlink replacements are rejected before following them', async () => {
  await withFixture('backend-owned',async f => {
    await rm(join(f.root,'backend/src/application.ts'));
    await symlink('/unreadable-private-target',join(f.root,'backend/src/application.ts'));
    await rejects(f,'runtime-file-replacement');f.git('reset','--hard','HEAD');
    await rm(join(f.root,'backend/src'),{recursive:true});
    await symlink('/unreadable-private-target',join(f.root,'backend/src'));
    await rejects(f,'runtime-directory-replacement');
  });
});

test('only exact installed-dependency roots are ignored; nested impostors fail', async () => {
  await withFixture('backend-owned',async f => {
    await symlink('/unreadable-installed-tools',join(f.root,'node_modules'));
    await symlink('/unreadable-installed-tools',join(f.root,'backend/node_modules'));
    await verifyRuntime(f.root);
    await f.put('assets/node_modules/runtime.js','PRIVATE-CANARY');
    await rejects(f,'runtime-untracked-input');
  });
});

test('reviewed metadata-only commits and dirty metadata preserve the runtime digest', async () => {
  await withFixture('backend-owned',async f => {
    const before = await verifyRuntime(f.root);
    for(const path of METADATA_PATHS) await f.put(path,'Metadata only.\n');
    f.commit();const after=await verifyRuntime(f.root);
    assert.notEqual(before.headSha,after.headSha);assert.equal(before.projectionSha256,after.projectionSha256);
    await f.put(METADATA_PATHS[0],'Uncommitted metadata.\n');await verifyRuntime(f.root);
    await f.put('docs/operations/contracts/unreviewed-contract.json','PRIVATE-CANARY');f.commit();
    await rejects(f,'runtime-head-projection-drift');
  });
});

test('harness-only commits are attested separately, but dirty harness and pins fail', async () => {
  await withFixture('backend-owned',async f => {
    const before=await verifyRuntime(f.root);
    await f.put('scripts/roster-connected/README.md','New harness documentation.\n');f.commit();
    const after=await verifyRuntime(f.root);
    assert.notEqual(before.headTree,after.headTree);assert.equal(before.projectionSha256,after.projectionSha256);
    await f.put('scripts/roster-connected/README.md','PRIVATE-CANARY');await rejects(f,'runtime-dirty-input');f.git('reset','--hard','HEAD');
    await f.put('scripts/roster-connected/sources.json',JSON.stringify(f.source)+'\n');await rejects(f,'runtime-dirty-input');
  });
});

test('full API inverse equality rejects lost, changed or extra lifecycle content and malformed roster seams', () => {
  assert.doesNotThrow(()=>verifySharedApi(Buffer.from(api),Buffer.from(rosterApi),'roster-two-line-inverse'));
  for(const source of [rosterApi.replaceAll('readGameLifecycle','obsolete'),rosterApi+'export const extra = true;\n']) {
    assert.throws(()=>verifySharedApi(Buffer.from(api),Buffer.from(source),'roster-two-line-inverse'),/runtime-shared-api-drift/);
  }
  for(const source of [api,rosterApi+API_ROSTER_LINES[0]]) {
    assert.throws(()=>verifySharedApi(Buffer.from(api),Buffer.from(source),'roster-two-line-inverse'),/runtime-shared-api-(?:roster-seam|drift)/);
  }
});

test('a repinned frontend that silently drops lifecycle API bytes fails in backend mode', async () => {
  await withFixture('backend-owned',async f => {
    const harness=f.git('rev-parse','HEAD');f.git('checkout','-q',f.source.frontend.sha);
    await f.put(API_PATH,rosterApi.replaceAll('readGameLifecycle','removedLifecycle'));const changed=f.commit();
    f.git('checkout','-q',harness);f.source.frontend=changed;
    await f.put('scripts/roster-connected/sources.json',JSON.stringify(f.source));f.commit();
    await rejects(f,'runtime-shared-api-drift');
  });
});

test('bad pins, changed overlay allowlist and unclean configuration fail without value disclosure', async () => {
  await withFixture('backend-owned',async f => {
    const good=structuredClone(f.source);
    for(const change of [source=>{source.backend.sha='PRIVATE-CANARY';},source=>{source.frontend.tree='0'.repeat(40);},source=>{source.overlay=source.overlay.slice(1);},source=>{source.backend.privateValue='PRIVATE-CANARY';}]) {
      const source=structuredClone(good);change(source);await f.put('scripts/roster-connected/sources.json',JSON.stringify(source));f.commit();
      await assert.rejects(verifyRuntime(f.root),error=>/^runtime-(pin-format|pin-tree|pin-schema|overlay-allowlist)$/.test(error.message));
    }
  });
});

test('central trigger coverage includes all runtime/harness paths and explicit owner authority wakes', async () => {
  assert.doesNotThrow(()=>verifyWorkflowCoverage(workflow));
  for(const path of [...OVERLAY_PATHS,'backend/new-entry.ts','backend/supabase/functions/.env',
    'scripts/provision.mjs','docs/operations/contracts/runtime.json','docs/seed-content/new.json','assets/new.png','new-root/runtime.config','package-lock.json',...HARNESS_PATHS]) {
    assert.notEqual(classifyPath(path),'metadata');assert.equal(workflowSelects(path),true);
  }
  for(const path of METADATA_PATHS) assert.equal(classifyPath(path),'metadata');
  assert.equal(workflowSelects(METADATA_PATHS[0]),false);
  assert.equal(workflowSelects('docs/operations/contracts/player-cross-cutting/pr-938.json'),true);
  assert.equal(workflowSelects('docs/operations/contracts/player-cross-cutting/pr-933.json'),true);
  assert.throws(()=>verifyWorkflowCoverage(workflow.replace("      - '**'\n",'')),/runtime-workflow-coverage/);
  await withFixture('backend-owned',async f=>{
    await f.put('.github/workflows/roster-connected-e2e.yml',workflow.replace("      - '**'\n","      - 'scripts/roster-connected/**'\n"));f.commit();
    await rejects(f,'runtime-workflow-coverage');
  });
});

test('workflow preflight precedes tool install and runtime; prepare revalidates before archive', async () => {
  const read=path=>readFile(new URL(path,import.meta.url),'utf8');
  const actual=await read('../../.github/workflows/roster-connected-e2e.yml');verifyWorkflowCoverage(actual);
  const preflight=actual.indexOf('run: node scripts/roster-connected/runtime-equivalence.mjs');
  assert.ok(preflight>0 && preflight<actual.indexOf('uses: actions/setup-node@'));
  assert.ok(preflight<actual.indexOf('npm ci') && preflight<actual.indexOf('run: node scripts/roster-connected/run.mjs'));
  const matrix=actual.indexOf('run: node scripts/roster-connected/mode-fixtures.mjs');
  assert.ok(matrix>preflight && matrix<actual.indexOf('run: node scripts/roster-connected/run.mjs'));
  const prepare=await read('./prepare.mjs');assert.ok(prepare.indexOf('await verifyRuntime(root)')<prepare.indexOf("git('archive'"));
  const runner=await read('./run.mjs');assert.ok(runner.indexOf('await verifyRuntime(root)')<runner.indexOf("await execute('docker'"));
});


test('integrated mode requires one identical source commit, not equivalent trees or independently pinned hybrids', async () => {
  await withFixture('integrated-composite',async f => {
    const harness=f.git('rev-parse','HEAD');f.git('checkout','-q',f.source.frontend.sha);
    f.git('-c','user.name=Synthetic fixture','-c','user.email=fixture@example.test','commit','--allow-empty','-qm','Same tree, different source');
    const distinct={sha:f.git('rev-parse','HEAD'),tree:f.git('rev-parse','HEAD^{tree}')};
    assert.equal(distinct.tree,f.source.backend.tree);assert.notEqual(distinct.sha,f.source.backend.sha);
    f.git('checkout','-q',harness);f.source.frontend=distinct;
    await f.put('scripts/roster-connected/sources.json',JSON.stringify(f.source));f.commit();
    await rejects(f,'runtime-integrated-pin-identity');
  });
});

test('integrated mode covers package commands and non-overlay test/helper inputs without exemptions', async () => {
  await withFixture('integrated-composite',async f => {
    for(const path of ['package-lock.json','package.json','scripts/admin-v2-roster-import.test.mjs',
      'scripts/admin-v2-roster-csv-browser-smoke.mjs','.github/workflows/admin-v2-players.yml']) {
      await f.put(path,'PRIVATE-CANARY');f.commit();
      await rejects(f,'runtime-head-projection-drift');f.git('reset','--hard','HEAD~1');
    }
  });
});

test('API relations are explicit: exact equality never falls back to inverse normalization', () => {
  assert.doesNotThrow(()=>verifySharedApi(Buffer.from(rosterApi),Buffer.from(rosterApi),'exact-equality'));
  assert.throws(()=>verifySharedApi(Buffer.from(api),Buffer.from(rosterApi),'exact-equality'),/runtime-shared-api-drift/);
  assert.throws(()=>verifySharedApi(Buffer.from(api),Buffer.from(rosterApi),undefined),/runtime-api-relation/);
  assert.throws(()=>verifySharedApi(Buffer.from(api),Buffer.concat([Buffer.from(rosterApi),Buffer.from([255])]),'roster-two-line-inverse'),/runtime-shared-api-encoding/);
});


test('integrated prepare produces an identical base/composite tree and complete source coverage', async () => {
  await withFixture('integrated-composite',async f => {
    const scratch=await mkdtemp(join(tmpdir(),'roster-integrated-manifest-'));
    try {
      const manifest=await prepare(f.root,join(scratch,'runtime'),scratch);
      assert.equal(manifest.runtimeEquivalence.mode,'integrated-composite');
      assert.equal(manifest.runtimeEquivalence.apiRelation,'exact-equality');
      assert.equal(manifest.runtimeEquivalence.frontendNonOverlayInputsCovered,true);
      assert.equal(manifest.runtimeEquivalence.currentRuntimeMatchesSelectedProjection,true);
      assert.equal(manifest.runtimeEquivalence.headSha,manifest.harnessSha);
      assert.equal(manifest.backend.sha,manifest.frontend.sha);
      assert.equal(manifest.compositeTree,manifest.backend.tree);
      assert.equal(manifest.files.length,7);assert.equal(manifest.dependencies.length,2);
      assert.equal(f.git('diff-tree','--no-commit-id','--name-only','-r',manifest.backend.tree,manifest.compositeTree),'');
      for(const path of OVERLAY_PATHS) assert.deepEqual(await readFile(join(scratch,'runtime',path)),await readFile(join(f.root,path)));
      assert.equal(manifest.hostedCapacityQualified,false);assert.equal(manifest.maximumRosterCapacityQualified,false);
    } finally {await rm(scratch,{recursive:true,force:true});}
  });
});


test('Git executable mode uses owner execute, even when stat caching is disabled', async () => {
  await withFixture('backend-owned',async f => {
    const path='backend/executable.sh';
    f.git('update-index','--assume-unchanged',path);
    await chmod(join(f.root,path),0o654); // Group executable cannot replace owner execute.
    await rejects(f,'runtime-file-mode');
    await chmod(join(f.root,path),0o754);
    assert.equal((await verifyRuntime(f.root)).diskInputsMatchHead,true);
  });
});
