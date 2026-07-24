#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJson, writeJson } from './seed-beta-pack-lib.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');
const CONTRACT_PATH = path.join(REPO_ROOT, 'docs', 'operations', 'contracts', 'beta-seed-downstream-consumer-contract-v1.json');
const INTEGRITY_FILENAME = 'integrity-manifest-v1.json';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function sourceShaFromArgs() {
  const index = process.argv.indexOf('--source-sha');
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function bindingKey(domainKey, existingBindings) {
  if (!Object.hasOwn(existingBindings, domainKey)) return domainKey;
  let suffix = 2;
  while (Object.hasOwn(existingBindings, `${domainKey}${suffix}`)) suffix += 1;
  return `${domainKey}${suffix}`;
}

export async function refreshSeedConsumerContract({ sourceSha = null } = {}) {
  const [contract, pack, integrity] = await Promise.all([
    readJson(CONTRACT_PATH),
    readJson(path.join(PACK_ROOT, 'pack-v1.json')),
    readJson(path.join(PACK_ROOT, INTEGRITY_FILENAME)),
  ]);

  requireCondition(contract.schemaVersion === 'econovaria-beta-seed-downstream-consumer-contract-v1', 'Unexpected downstream Seed contract schema.');
  requireCondition(pack.packId === integrity.packId && pack.version === integrity.version, 'Pack and integrity identities do not match.');
  requireCondition(/^[a-f0-9]{64}$/.test(String(integrity.packSha256 ?? '')), 'Integrity manifest lacks a valid pack digest.');
  if (sourceSha !== null) requireCondition(/^[a-f0-9]{40}$/.test(sourceSha), 'Accepted implementation source SHA must be a 40-character lowercase Git SHA.');

  const manifestByPath = new Map(integrity.files.map((entry) => [entry.path, entry]));
  const fileBindings = structuredClone(contract.fileBindings ?? {});

  for (const [key, binding] of Object.entries(fileBindings)) {
    const relativePath = path.relative(PACK_ROOT, path.join(REPO_ROOT, binding.path)).replaceAll(path.sep, '/');
    requireCondition(relativePath !== INTEGRITY_FILENAME, `Downstream binding ${key} must not hash the self-referential integrity manifest.`);
    const entry = manifestByPath.get(relativePath);
    requireCondition(entry, `Downstream binding ${key} points outside the immutable pack: ${binding.path}`);
    fileBindings[key] = { ...binding, sha256: entry.sha256 };
  }

  const boundPaths = new Set(Object.values(fileBindings).map((binding) => binding.path));
  for (const [domainKey, relativePath] of Object.entries(pack.domainFiles ?? {})) {
    if (relativePath === INTEGRITY_FILENAME) continue;
    const repositoryPath = `docs/seed-content/executable/beta-pack-v1/${relativePath}`;
    if (boundPaths.has(repositoryPath)) continue;
    const entry = manifestByPath.get(relativePath);
    requireCondition(entry, `Pack domain ${domainKey} is absent from the integrity manifest: ${relativePath}`);
    const key = bindingKey(domainKey, fileBindings);
    fileBindings[key] = { path: repositoryPath, sha256: entry.sha256 };
    boundPaths.add(repositoryPath);
  }

  const refreshed = {
    ...contract,
    acceptedImplementationSourceSha: sourceSha ?? contract.acceptedImplementationSourceSha,
    activationApproval: {
      ...contract.activationApproval,
      requiredBindings: {
        ...contract.activationApproval.requiredBindings,
        packId: pack.packId,
        packSha256: integrity.packSha256,
        version: pack.version,
      },
    },
    fileBindings,
    packDigest: integrity.packSha256,
    packId: pack.packId,
    packVersion: pack.version,
    productionAuthorized: false,
  };

  await writeJson(CONTRACT_PATH, refreshed);
  return {
    packId: pack.packId,
    version: pack.version,
    packDigest: integrity.packSha256,
    acceptedImplementationSourceSha: refreshed.acceptedImplementationSourceSha,
    fileBindingCount: Object.keys(fileBindings).length,
  };
}

async function main() {
  const result = await refreshSeedConsumerContract({ sourceSha: sourceShaFromArgs() });
  console.log(JSON.stringify({ result: 'SEED_CONSUMER_CONTRACT_REFRESHED', ...result }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
