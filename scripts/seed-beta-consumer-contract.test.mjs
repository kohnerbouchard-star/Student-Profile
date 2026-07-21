#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const CONTRACT_PATH = path.join(
  REPO_ROOT,
  'docs',
  'operations',
  'contracts',
  'beta-seed-downstream-consumer-contract-v1.json',
);
const PACK_ROOT = path.join(
  REPO_ROOT,
  'docs',
  'seed-content',
  'executable',
  'beta-pack-v1',
);
const ARRIVAL_PACKAGES_PATH = path.join(
  REPO_ROOT,
  'docs',
  'seed-content',
  'players',
  'arrival-packages-v1.json',
);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex');
}

test('downstream Seed contract binds the accepted immutable pack identity', async () => {
  const [contract, pack, integrity] = await Promise.all([
    readJson(CONTRACT_PATH),
    readJson(path.join(PACK_ROOT, 'pack-v1.json')),
    readJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json')),
  ]);

  assert.equal(
    contract.schemaVersion,
    'econovaria-beta-seed-downstream-consumer-contract-v1',
  );
  assert.match(contract.acceptedImplementationSourceSha, /^[0-9a-f]{40}$/);
  assert.equal(contract.packId, pack.packId);
  assert.equal(contract.packVersion, pack.version);
  assert.equal(contract.packDigest, integrity.packSha256);
  assert.equal(contract.packDigest, await sha256File(path.join(PACK_ROOT, 'pack-v1.json')));
  assert.equal(contract.productionAuthorized, false);
  assert.equal(contract.boundedRelease.marketTemplates, 240);
  assert.equal(contract.boundedRelease.gameMarketAssets, 240);
  assert.equal(contract.boundedRelease.contractTemplates, 30);
  assert.equal(contract.boundedRelease.gameContracts, 30);
  assert.equal(contract.boundedRelease.storeItems, 50);
  assert.equal(contract.boundedRelease.arrivalPackages, 10);
  assert.equal(contract.boundedRelease.calibrationPaths, 40);
  assert.equal(contract.boundedRelease.currencyPairChecks, 45);
  assert.equal(contract.boundedRelease.routeCalibrations, 13);
  assert.equal(contract.boundedRelease.locations, 50);
  assert.equal(contract.boundedRelease.stableReleaseMembers, 590);
  assert.equal(contract.boundedRelease.fullMarketUniverse3200Excluded, true);
});

test('downstream Seed contract file bindings match the frozen executable files', async () => {
  const contract = await readJson(CONTRACT_PATH);
  const integrity = await readJson(path.join(PACK_ROOT, 'integrity-manifest-v1.json'));
  const manifestByPath = new Map(integrity.files.map((entry) => [entry.path, entry]));

  for (const binding of Object.values(contract.fileBindings)) {
    const relativePackPath = path.relative(PACK_ROOT, path.join(REPO_ROOT, binding.path));
    const manifestEntry = manifestByPath.get(relativePackPath);
    assert.ok(manifestEntry, `Missing manifest binding for ${binding.path}`);
    assert.equal(binding.sha256, manifestEntry.sha256);
    assert.equal(binding.sha256, await sha256File(path.join(REPO_ROOT, binding.path)));
  }
});

test('downstream Seed contract exposes exact stable identifier sources without copied catalogs', async () => {
  const [contract, market, contracts, store, locations, calibration, arrivals] =
    await Promise.all([
      readJson(CONTRACT_PATH),
      readJson(path.join(PACK_ROOT, 'market-templates-v1.json')),
      readJson(path.join(PACK_ROOT, 'tutorial-contract-chains-v1.json')),
      readJson(path.join(PACK_ROOT, 'store-catalog-v1.json')),
      readJson(path.join(PACK_ROOT, 'location-registry-verified-v1.json')),
      readJson(path.join(PACK_ROOT, 'calibration-scenarios-v1.json')),
      readJson(ARRIVAL_PACKAGES_PATH),
    ]);

  assert.equal(new Set(market.templates.map((entry) => entry.stableId)).size, 240);
  assert.equal(new Set(contracts.templates.map((entry) => entry.templateKey)).size, 30);
  assert.equal(new Set(store.items.map((entry) => entry.stableId)).size, 50);
  assert.equal(new Set(locations.locations.map((entry) => entry.id)).size, 50);
  assert.deepEqual(
    arrivals.packages.map((entry) => entry.id),
    contract.contentIdentifiers.arrivalPackages.identifiers,
  );
  assert.deepEqual(
    calibration.routes.routes.map((entry) => entry.routeId),
    contract.contentIdentifiers.routes.identifiers,
  );
  assert.equal(calibration.countrySimulations.length, 10);
  assert.equal(
    calibration.countrySimulations.reduce(
      (total, country) => total + country.scenarios.length,
      0,
    ),
    40,
  );
  assert.equal(contract.consumerRules.copySeedCatalogFiles, false);
  assert.equal(contract.consumerRules.failClosedWhenDefinitionMissingOrInactive, true);
  assert.equal(contract.consumerRules.requireExactDigest, true);
  assert.equal(contract.consumerRules.treatDeploymentAsActivation, false);
});

test('downstream Seed contract freezes activation, rollback, and migration reconciliation semantics', async () => {
  const contract = await readJson(CONTRACT_PATH);
  const bindings = contract.activationApproval.requiredBindings;

  for (const field of [
    'authorizationId',
    'allowActivation',
    'productionAuthorized',
    'environment',
    'projectRef',
    'gameSessionId',
    'packId',
    'version',
    'packSha256',
    'sourceSha',
    'approvedBy',
    'approvedAt',
    'expiresAt',
  ]) {
    assert.ok(Object.hasOwn(bindings, field), `Missing activation binding ${field}`);
  }

  assert.equal(
    contract.activationApproval.legacyConvenienceTemplateAtAcceptedHeadIsSufficient,
    false,
  );
  assert.equal(contract.lifecycleSemantics.inactiveImport.gameMarketAssets.isActive, false);
  assert.equal(contract.lifecycleSemantics.inactiveImport.gameContracts.visibility, 'hidden');
  assert.equal(contract.lifecycleSemantics.inactiveImport.storeItems.visibility, 'hidden');
  assert.equal(contract.lifecycleSemantics.rollback.playerOwnedHistoryPreserved, true);
  assert.equal(contract.lifecycleSemantics.rollback.auditMembershipRetained, true);
  assert.deepEqual(contract.canonicalMigrations, [
    '20260721093000_add_transactional_seed_content_release_v1',
    '20260721094000_harden_transactional_seed_release_rollback_v1',
    '20260721095000_accept_current_service_role_claims_for_seed_release_v1',
  ]);
  assert.equal(
    contract.stagingMigrationHistory.precursorAlias.version,
    '20260721015504',
  );
  assert.equal(
    contract.stagingMigrationHistory.precursorAlias.scope,
    'synthetic-staging-only-audited-history',
  );
});
