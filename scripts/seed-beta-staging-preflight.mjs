#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSeedBetaPack } from './seed-beta-pack-validator.mjs';
import { runImporter } from './seed-beta-importer.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');

export async function runSeedBetaStagingPreflight({ packRoot = PACK_ROOT } = {}) {
  const validation = await validateSeedBetaPack({ packRoot });
  if (!validation.valid) {
    return {
      schemaVersion: 'econovaria-beta-seed-staging-preflight-v1',
      status: 'blocked',
      structuralReady: false,
      connectedImportReady: false,
      productionAuthorized: false,
      validation,
    };
  }

  const dryRun = await runImporter({
    mode: 'dry-run',
    environment: 'staging',
    'pack-root': packRoot,
    'expected-project-ref': 'isolated-staging-required',
    'game-session-id': '11111111-1111-4111-8111-111111111111',
  });

  return {
    schemaVersion: 'econovaria-beta-seed-staging-preflight-v1',
    status: 'structurally-ready-awaiting-connected-isolated-staging',
    structuralReady: true,
    connectedImportReady: false,
    connectedBlocker: 'A distinct Chat 2 isolated project identity, game session, and credentials are required for connected import.',
    productionAuthorized: false,
    fullMarketUniverse3200Excluded: true,
    validationSummary: validation.summary,
    dryRunPlan: dryRun.plan,
  };
}

async function main() {
  const report = await runSeedBetaStagingPreflight();
  console.log(JSON.stringify(report, null, 2));
  if (!report.structuralReady) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
