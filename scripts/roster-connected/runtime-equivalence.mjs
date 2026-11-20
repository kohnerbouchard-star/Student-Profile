#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, sha256 } from './evidence.mjs';
import { METADATA_PATHS, HARNESS_PATHS, GENERATED_DEPENDENCY_ROOTS, OVERLAY_PATHS,
  API_PATH, API_ROSTER_LINES, API_EXPORT_SEAM, MODES, MODE_API_RELATION, WORKFLOW_PATHS, classifyPath, workflowEvents } from './runtime-inputs.mjs';

const gitFor = root => (...args) => {
  try { return execFileSync('git',['-C',root,...args],{maxBuffer:200*1024*1024,stdio:['ignore','pipe','pipe']}); }
  catch { throw new Error('runtime-git-operation'); }
};
function safePath(path) {
  check(path && !path.startsWith('/') && !/[\x00-\x1f\x7f\\]/.test(path) &&
    path.split('/').every(part => part && part !== '.' && part !== '..'), 'runtime-path-format');
}
function entries(git, ref) {
  const result = new Map();
  for (const entry of String(git('ls-tree','-rz','--full-tree',ref)).split('\0').filter(Boolean)) {
    const tab = entry.indexOf('\t');
    const [mode,type,blob] = entry.slice(0,tab).split(' '), path = entry.slice(tab+1);
    safePath(path);
    check(tab > 0 && type === 'blob' && /^(?:100644|100755)$/.test(mode) && /^[a-f0-9]{40}$/.test(blob), 'runtime-tree-entry');
    check(!result.has(path),'runtime-tree-duplicate');
    result.set(path,{path,mode,blob});
  }
  return result;
}
const projected = map => [...map.values()].filter(entry => classifyPath(entry.path) === 'runtime')
  .sort((a,b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
export function verifySharedApi(backend, frontend, relation) {
  check(Object.values(MODE_API_RELATION).includes(relation), 'runtime-api-relation');
  if (relation === 'exact-equality') {
    check(Buffer.from(backend).equals(Buffer.from(frontend)), 'runtime-shared-api-drift');
    return;
  }
  const backendText = backend.toString('utf8');
  let restored = frontend.toString('utf8');
  check(Buffer.from(backendText).equals(Buffer.from(backend)) && Buffer.from(restored).equals(Buffer.from(frontend)), 'runtime-shared-api-encoding');
  check(backendText.split(API_EXPORT_SEAM).length === 2, 'runtime-shared-api-export-seam');
  const expected = API_ROSTER_LINES[0] + backendText.replace(API_EXPORT_SEAM, `    createPlayer,\n${API_ROSTER_LINES[1]}    updatePlayerSettings,\n`);
  check(expected === restored, 'runtime-shared-api-drift');
  for (const line of API_ROSTER_LINES) {
    check(restored.split(line).length === 2, 'runtime-shared-api-roster-seam');
    restored = restored.replace(line,'');
  }
  // Whole-file inverse equality preserves lifecycle and every other shared API.
  check(Buffer.from(restored).equals(Buffer.from(backend)), 'runtime-shared-api-drift');
}
export function verifyWorkflowCoverage(source) {
  const start = source.indexOf('\non:\n'), end = source.indexOf('\npermissions:\n',start);
  check(start >= 0 && end > start && source.slice(start+1,end) === workflowEvents(), 'runtime-workflow-coverage');
}
async function verifyDisk(root, git, headEntries) {
  const directories = new Set([root]);
  async function directory(path) {
    if (directories.has(path)) return;
    await directory(dirname(path));
    const state = await lstat(path);
    check(state.isDirectory() && !state.isSymbolicLink(), 'runtime-directory-replacement');
    directories.add(path);
  }
  // Hash actual bytes, bypassing index stat caches, assume-unchanged flags and
  // Git clean filters. Harness bytes must also match the attested HEAD.
  for (const entry of headEntries.values()) {
    if (classifyPath(entry.path) === 'metadata') continue;
    const path = join(root,entry.path);
    await directory(dirname(path));
    const state = await lstat(path);
    check(state.isFile() && !state.isSymbolicLink(), 'runtime-file-replacement');
    check((state.mode & 0o100 ? '100755' : '100644') === entry.mode, 'runtime-file-mode');
    const bytes = await readFile(path);
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    check(blob === entry.blob, 'runtime-dirty-input');
  }
  const staged = String(git('diff','--cached','--name-only','-z','--no-ext-diff','--no-renames','HEAD')).split('\0').filter(Boolean);
  check(staged.every(path => classifyPath(path) === 'metadata'), 'runtime-staged-input');
  // Do NOT use --exclude-standard: ignored .env/config and other possible
  // replacement inputs must fail too. Names are inspected, never their contents.
  const untracked = String(git('ls-files','--others','-z',
    ...GENERATED_DEPENDENCY_ROOTS.map(path => `--exclude=/${path}`))).split('\0').filter(Boolean);
  check(untracked.every(path => classifyPath(path) === 'metadata'), 'runtime-untracked-input');
}
export async function verifyRuntime(root) {
  try {
    root = await realpath(root);
    const git = gitFor(root);
    check(String(git('rev-parse','--show-toplevel')).trim() === root, 'runtime-repository-root');
    check(String(git('rev-parse','--show-object-format')).trim() === 'sha1', 'runtime-object-format');
    const headSha = String(git('rev-parse','HEAD')).trim();
    const headTree = String(git('rev-parse','HEAD^{tree}')).trim();
    check(/^[a-f0-9]{40}$/.test(headSha) && /^[a-f0-9]{40}$/.test(headTree), 'runtime-head-format');
    const source = JSON.parse(await readFile(join(root,'scripts/roster-connected/sources.json'),'utf8'));
    check(source.schemaVersion === 1 && JSON.stringify(Object.keys(source).sort()) === JSON.stringify(['apiRelation','backend','frontend','mode','overlay','schemaVersion']), 'runtime-source-schema');
    check(MODES.includes(source.mode), 'runtime-explicit-mode');
    check(source.apiRelation === MODE_API_RELATION[source.mode], 'runtime-api-relation');
    check(JSON.stringify(source.overlay) === JSON.stringify(OVERLAY_PATHS), 'runtime-overlay-allowlist');
    for (const pin of [source.backend,source.frontend]) {
      check(JSON.stringify(Object.keys(pin ?? {}).sort()) === JSON.stringify(['sha','tree']), 'runtime-pin-schema');
      check(/^[a-f0-9]{40}$/.test(pin?.sha) && /^[a-f0-9]{40}$/.test(pin?.tree), 'runtime-pin-format');
      check(String(git('rev-parse',`${pin.sha}^{tree}`)).trim() === pin.tree, 'runtime-pin-tree');
    }
    if (source.mode === 'integrated-composite') check(source.backend.sha === source.frontend.sha && source.backend.tree === source.frontend.tree, 'runtime-integrated-pin-identity');
    const backend = entries(git,source.backend.sha), frontend = entries(git,source.frontend.sha);
    const composite = new Map(backend);
    for (const path of OVERLAY_PATHS) {
      const entry = frontend.get(path);
      check(entry?.mode === '100644','runtime-overlay-entry');
      composite.set(path,entry);
    }
    verifySharedApi(git('show',`${source.backend.sha}:${API_PATH}`),git('show',`${source.frontend.sha}:${API_PATH}`),source.apiRelation);
    const head = entries(git,headSha);
    const expected = projected(source.mode === 'backend-owned' ? backend : composite);
    const actual = projected(head);
    check(JSON.stringify(actual) === JSON.stringify(expected), 'runtime-head-projection-drift');
    await verifyDisk(root,git,head);
    verifyWorkflowCoverage(await readFile(join(root,'.github/workflows/roster-connected-e2e.yml'),'utf8'));
    check(String(git('rev-parse','HEAD')).trim() === headSha,'runtime-head-changed');
    const policy = {defaultClassification:'runtime',metadataPaths:METADATA_PATHS,harnessPaths:HARNESS_PATHS,
      generatedDependencyRoots:GENERATED_DEPENDENCY_ROOTS,overlayPaths:OVERLAY_PATHS,apiRosterLines:API_ROSTER_LINES,apiExportSeam:API_EXPORT_SEAM,modeApiRelation:MODE_API_RELATION,workflowPaths:WORKFLOW_PATHS};
    return {mode:source.mode,apiRelation:source.apiRelation,
      runtimeBaseRole:source.mode === 'backend-owned' ? 'backend-owner' : 'integrated-backend-and-frontend',
      qualificationScope:source.mode === 'backend-owned' ? 'backend-inputs-plus-seven-frontend-overlays' : 'integrated-source-inputs',
      frontendNonOverlayInputsCovered:source.mode === 'integrated-composite',headSha,headTree,projectionSha256:sha256(JSON.stringify(actual)),
      expectedProjectionSha256:sha256(JSON.stringify(expected)),runtimeInputCount:actual.length,
      policySha256:sha256(JSON.stringify(policy)),workflowPathsSha256:sha256(JSON.stringify(WORKFLOW_PATHS)),
      diskInputsMatchHead:true,currentRuntimeMatchesSelectedProjection:true};
  } catch (error) {
    // OS/Git/JSON errors may contain filenames, raw content or local credentials.
    const label = typeof error?.message === 'string' && /^runtime-[a-z-]+$/.test(error.message)
      ? error.message : 'runtime-preflight-failed';
    throw new Error(label);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    await verifyRuntime(resolve(dirname(fileURLToPath(import.meta.url)),'../..'));
    console.log(JSON.stringify({passed:true,stage:'runtime-equivalence'}));
  } catch {
    console.log(JSON.stringify({passed:false,stage:'runtime-equivalence'}));
    process.exitCode = 1;
  }
}
