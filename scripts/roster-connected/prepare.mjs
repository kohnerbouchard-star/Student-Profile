import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { check, sha256 } from './evidence.mjs';
import { verifyRuntime } from './runtime-equivalence.mjs';

export function verifyDependencyBaseline(harnessBytes, backendBytes) {
  check(sha256(harnessBytes) === sha256(backendBytes), 'dependency-baseline-mismatch');
}

export async function prepare(root, workspace, scratch) {
  const runtimeEquivalence = await verifyRuntime(root);
  const source = JSON.parse(await readFile(join(root,'scripts/roster-connected/sources.json'), 'utf8'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { maxBuffer: 200 * 1024 * 1024, stdio: ['ignore','pipe','pipe'] });
  for (const entry of [source.backend, source.frontend]) {
    check(/^[a-f0-9]{40}$/.test(entry.sha) && /^[a-f0-9]{40}$/.test(entry.tree), 'source-pin-format');
    check(String(git('rev-parse', `${entry.sha}^{tree}`)).trim() === entry.tree, 'source-tree-pin');
  }
  const dependencies = [];
  for (const path of ['package.json','package-lock.json']) {
    const bytes = git('show', `${source.backend.sha}:${path}`);
    verifyDependencyBaseline(await readFile(join(root,path)),bytes);
    dependencies.push({path,sha256:sha256(bytes)});
  }
  check(source.overlay.length === 7 && new Set(source.overlay).size === 7, 'overlay-count');
  const archive = join(scratch, 'source.tar');
  await writeFile(archive, git('archive', source.backend.sha), { mode: 0o600 });
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  execFileSync('tar', ['-xf', archive, '-C', workspace], { stdio: 'pipe' });
  await rm(archive);
  const files = [];
  const index = join(scratch, 'composite-index');
  const treeGit = (...args) => execFileSync('git', ['-C', root, ...args], { env: {...process.env, GIT_INDEX_FILE: index}, stdio: ['ignore','pipe','pipe'] });
  treeGit('read-tree', source.backend.sha);
  for (const path of source.overlay) {
    check(/^admin\/v2\/src\/(?:api|routes\/players)\/[A-Za-z-]+\.js$/.test(path), 'overlay-path');
    const bytes = git('show', `${source.frontend.sha}:${path}`);
    await mkdir(join(workspace, path, '..'), { recursive: true });
    await writeFile(join(workspace, path), bytes);
    const entry = String(git('ls-tree', source.frontend.sha, '--', path)).trim().split(/\s+/);
    check(entry[0] === '100644' && entry[1] === 'blob', 'overlay-mode');
    treeGit('update-index', '--add', '--cacheinfo', `${entry[0]},${entry[2]},${path}`);
    files.push({path, gitBlob:entry[2], sha256:sha256(bytes)});
  }
  const compositeTree = String(treeGit('write-tree')).trim();
  await rm(index);
  return { kind:'paired-source-integration', runtimeEquivalence, backend:source.backend, frontend:source.frontend,
    harnessSha:String(git('rev-parse','HEAD')).trim(), harnessTree:String(git('rev-parse','HEAD^{tree}')).trim(), compositeTree, files, dependencies,
    hostedCapacityQualified:false, maximumRosterCapacityQualified:false };
}
