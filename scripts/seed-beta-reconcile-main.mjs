#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const SEED_SCRIPT_PATTERN = /(^|\/)(seed|apply-seed|generate-seed|generate-remaining-active-market|generate-arrival-foundation|generate-core-gameplay|build-northreach|reconcile-seed|build-seed-beta)/;

function git(args, options = {}) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'] });
}

function readStage(stage, filePath) {
  try { return git(['show', `:${stage}:${filePath}`]); } catch { return null; }
}

function parseJson(text, label) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (error) { throw new Error(`Could not parse ${label}: ${error.message}`); }
}

function isSeedOwned(filePath) {
  return filePath.startsWith('docs/seed-content/')
    || /^\.github\/workflows\/seed-/.test(filePath)
    || (filePath.startsWith('scripts/') && SEED_SCRIPT_PATTERN.test(filePath));
}

async function mergePackageJson(conflicted) {
  let ours = null;
  let theirs = null;
  if (conflicted) {
    ours = parseJson(readStage(2, 'package.json'), 'ours package.json');
    theirs = parseJson(readStage(3, 'package.json'), 'main package.json');
  } else {
    const current = parseJson(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'), 'working package.json');
    ours = current;
    theirs = current;
  }
  const output = structuredClone(theirs ?? ours);
  output.scripts ??= {};
  for (const [name, command] of Object.entries(ours?.scripts ?? {})) {
    if (name.includes('seed-content') || name.includes('seed-beta') || command.includes('seed-content')) output.scripts[name] = command;
  }
  Object.assign(output.scripts, {
    'build:seed-beta-pack': 'node scripts/build-seed-beta-pack.mjs',
    'validate:seed-beta-pack': 'node scripts/seed-beta-pack-validator.mjs',
    'test:seed-beta-pack': 'node --test scripts/seed-beta-pack.test.mjs',
    'seed:beta:validate': 'node scripts/seed-beta-importer.mjs --mode validate --environment test',
    'seed:beta:dry-run': 'node scripts/seed-beta-importer.mjs --mode dry-run --environment staging',
  });
  output.devDependencies = { ...(ours?.devDependencies ?? {}), ...(theirs?.devDependencies ?? {}) };
  await writeFile(path.join(REPO_ROOT, 'package.json'), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  git(['add', 'package.json']);
}

async function ensureAuditIgnore() {
  const ignorePath = path.join(REPO_ROOT, '.gitignore');
  let content = '';
  try { content = await readFile(ignorePath, 'utf8'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  if (!content.split(/\r?\n/).includes('.seed-audit/')) {
    const separator = content && !content.endsWith('\n') ? '\n' : '';
    await writeFile(ignorePath, `${content}${separator}.seed-audit/\n`, 'utf8');
  }
  git(['add', '.gitignore']);
}

export async function reconcileMainMerge() {
  const conflicted = git(['diff', '--name-only', '--diff-filter=U']).trim().split('\n').filter(Boolean);
  for (const filePath of conflicted) {
    if (filePath === 'package.json') continue;
    const side = isSeedOwned(filePath) ? '--ours' : '--theirs';
    try {
      git(['checkout', side, '--', filePath]);
      git(['add', '--', filePath]);
    } catch (error) {
      const oursExists = readStage(2, filePath) !== null;
      const theirsExists = readStage(3, filePath) !== null;
      if (side === '--ours' && !oursExists) git(['rm', '--ignore-unmatch', '--', filePath], { stdio: 'ignore' });
      else if (side === '--theirs' && !theirsExists) git(['rm', '--ignore-unmatch', '--', filePath], { stdio: 'ignore' });
      else throw error;
    }
  }
  await mergePackageJson(conflicted.includes('package.json'));
  if (conflicted.includes('package-lock.json')) {
    git(['checkout', '--theirs', '--', 'package-lock.json']);
    git(['add', 'package-lock.json']);
  }
  await ensureAuditIgnore();
  const remaining = git(['diff', '--name-only', '--diff-filter=U']).trim();
  if (remaining) throw new Error(`Unresolved merge conflicts remain:\n${remaining}`);
  return { resolvedConflictCount: conflicted.length, seedOwnedConflictCount: conflicted.filter(isSeedOwned).length, mainOwnedConflictCount: conflicted.filter((entry) => !isSeedOwned(entry) && entry !== 'package.json').length };
}

async function main() {
  const report = await reconcileMainMerge();
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack ?? error.message); process.exitCode = 1; });
}
