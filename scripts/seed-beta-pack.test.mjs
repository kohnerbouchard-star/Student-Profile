#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import os from 'node:os';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { COUNTRY_IDS, canonicalJson, pointInPolygon, stableNumber } from './seed-beta-pack-lib.mjs';
import { validateSeedBetaPack } from './seed-beta-pack-validator.mjs';
import { runImporter } from './seed-beta-importer.mjs';
import { runSeedBetaStagingPreflight } from './seed-beta-staging-preflight.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');
const GAME_ONE = '11111111-1111-4111-8111-111111111111';
const GAME_TWO = '22222222-2222-4222-8222-222222222222';
const STAGING_REF = 'eecvbssdvarfcykcfrny';

async function withTempDirectory(callback) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'econovaria-seed-test-'));
  try {
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function rpcClient(handler) {
  const calls = [];
  return {
    calls,
    async callRpc(name, payload) {
      calls.push({ name, payload });
      return handler(name, payload, calls.length);
    },
  };
}

function writeOptions(client, overrides = {}) {
  return {
    mode: 'import',
    environment: 'staging',
    'pack-root': PACK_ROOT,
    'expected-project-ref': STAGING_REF,
    'game-session-id': GAME_ONE,
    __client: client,
    __projectRef: STAGING_REF,
    __testBypassEnvironment: true,
    ...overrides,
  };
}

test('canonical JSON is key-order deterministic', () => {
  assert.equal(canonicalJson({ z: 1, a: { d: 2, b: 1 } }), canonicalJson({ a: { b: 1, d: 2 }, z: 1 }));
});

test('stable numeric calibration is deterministic and bounded', () => {
  const first = stableNumber('econovaria-seed', 10, 20, 4);
  const second = stableNumber('econovaria-seed', 10, 20, 4);
  assert.equal(first, second);
  assert.ok(first >= 10 && first <= 20);
});

test('polygon containment reference handles inside and outside points', () => {
  const polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
  assert.equal(pointInPolygon([5, 5], polygon), true);
  assert.equal(pointInPolygon([15, 5], polygon), false);
});

test('generated bounded pack passes the executable validator', async () => {
  const report = await validateSeedBetaPack({ packRoot: PACK_ROOT });
  assert.equal(report.valid, true, JSON.stringify(report.issues, null, 2));
  assert.equal(report.summary.marketInstruments, 240);
  assert.equal(report.summary.storeItems, 50);
  assert.equal(report.summary.contractChains, COUNTRY_IDS.length);
});

test('executable staging preflight is structurally ready but remains production-disabled', async () => {
  const report = await runSeedBetaStagingPreflight({ packRoot: PACK_ROOT });
  assert.equal(report.structuralReady, true);
  assert.equal(report.productionAuthorized, false);
  assert.equal(report.fullMarketUniverse3200Excluded, true);
});

test('importer dry run is credential-free, bounded, and includes runtime market assets', async () => {
  const result = await runImporter({
    mode: 'dry-run',
    environment: 'staging',
    'pack-root': PACK_ROOT,
    'expected-project-ref': STAGING_REF,
    'game-session-id': GAME_ONE,
  });
  assert.equal(result.result, 'DRY_RUN_COMPLETE');
  assert.equal(result.plan.operations.stockTemplates, 240);
  assert.equal(result.plan.operations.gameStockAssets, 240);
  assert.equal(result.plan.totalOperations, 590);
  assert.equal(result.plan.safety.transactionBacked, true);
  assert.equal(result.plan.safety.productionProhibited, true);
});

test('importer rejects production before any network write', async () => {
  await assert.rejects(
    () => runImporter({ mode: 'dry-run', environment: 'production', 'pack-root': PACK_ROOT }),
    /Production is prohibited/,
  );
});

test('importer rejects the known live Supabase project before any network write', async () => {
  const client = rpcClient(() => ({ outcome: 'applied' }));
  await assert.rejects(
    () => runImporter(writeOptions(client, {
      'expected-project-ref': 'cgiukdjwicykrmtkhudh',
      __projectRef: 'cgiukdjwicykrmtkhudh',
    })),
    /Refusing known production\/live project/,
  );
  assert.equal(client.calls.length, 0);
});

test('importer rejects a project-ref mismatch before any network write', async () => {
  const client = rpcClient(() => ({ outcome: 'applied' }));
  await assert.rejects(
    () => runImporter(writeOptions(client, { __projectRef: 'differentstagingref' })),
    /must exactly match SUPABASE_URL/,
  );
  assert.equal(client.calls.length, 0);
});

test('clean import sends the complete release through one transactional RPC', async () => {
  await withTempDirectory(async (auditRoot) => {
    const client = rpcClient((name, payload) => ({
      outcome: 'applied',
      releaseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      operationCount: payload.p_market_templates.length * 2
        + payload.p_contract_templates.length * 2
        + payload.p_store_items.length,
    }));
    const result = await runImporter(writeOptions(client, { 'audit-root': auditRoot }));
    assert.equal(result.result, 'WRITE_COMPLETE');
    assert.equal(result.outcome.outcome, 'applied');
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].name, 'apply_seed_content_release_v1');
    assert.equal(client.calls[0].payload.p_market_templates.length, 240);
    assert.equal(client.calls[0].payload.p_contract_templates.length, 30);
    assert.equal(client.calls[0].payload.p_store_items.length, 50);
    assert.equal(client.calls[0].payload.p_activate, false);
    assert.equal(client.calls[0].payload.p_target_environment, 'staging');
  });
});

test('repeated import is accepted as an idempotent replay with stable release identity', async () => {
  await withTempDirectory(async (auditRoot) => {
    const releaseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const client = rpcClient((_name, _payload, callNumber) => ({
      outcome: callNumber === 1 ? 'applied' : 'replayed',
      releaseId,
      operationCount: 590,
    }));
    const options = writeOptions(client, { 'audit-root': auditRoot });
    const first = await runImporter(options);
    const second = await runImporter(options);
    assert.equal(first.outcome.releaseId, releaseId);
    assert.equal(second.outcome.releaseId, releaseId);
    assert.equal(second.outcome.outcome, 'replayed');
    assert.equal(client.calls.length, 2);
    assert.deepEqual(client.calls[0].payload.p_market_templates, client.calls[1].payload.p_market_templates);
  });
});

test('conflicting release version is surfaced without a fallback write path', async () => {
  const client = rpcClient(() => {
    const error = new Error('Supabase RPC apply_seed_content_release_v1 failed with 409.');
    error.status = 409;
    error.payload = { message: 'SEED_RELEASE_CONFLICTING_VERSION_OR_DIGEST' };
    throw error;
  });
  await assert.rejects(
    () => runImporter(writeOptions(client)),
    /failed with 409/,
  );
  assert.equal(client.calls.length, 1);
});

test('partial transaction failure is fail-closed and exposes rollback evidence', async () => {
  const client = rpcClient(() => ({
    outcome: 'failed',
    failureCode: 'P0001',
    failureMessage: 'SEED_TEST_PARTIAL_FAILURE',
    transactionRolledBack: true,
  }));
  await assert.rejects(
    () => runImporter(writeOptions(client)),
    /SEED_TEST_PARTIAL_FAILURE/,
  );
  assert.equal(client.calls.length, 1);
});

test('connected staging failure injection is prohibited before RPC execution', async () => {
  const client = rpcClient(() => ({ outcome: 'failed' }));
  await assert.rejects(
    () => runImporter(writeOptions(client, { 'fail-after-operations': '10' })),
    /Failure injection is prohibited against connected staging/,
  );
  assert.equal(client.calls.length, 0);
});

test('cross-game imports preserve separate game scopes', async () => {
  await withTempDirectory(async (auditRoot) => {
    const client = rpcClient((_name, payload) => ({
      outcome: 'applied',
      releaseId: payload.p_game_session_id === GAME_ONE
        ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
        : 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      gameSessionId: payload.p_game_session_id,
    }));
    const first = await runImporter(writeOptions(client, { 'audit-root': auditRoot }));
    const second = await runImporter(writeOptions(client, {
      'audit-root': auditRoot,
      'game-session-id': GAME_TWO,
    }));
    assert.notEqual(first.outcome.releaseId, second.outcome.releaseId);
    assert.equal(client.calls[0].payload.p_game_session_id, GAME_ONE);
    assert.equal(client.calls[1].payload.p_game_session_id, GAME_TWO);
  });
});

test('deactivate, rollback, and re-import use one immutable release identity', async () => {
  await withTempDirectory(async (auditRoot) => {
    const releaseId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const outcomes = ['applied', 'deactivated', 'rolled_back', 'replayed'];
    const client = rpcClient((name, _payload, callNumber) => ({
      outcome: outcomes[callNumber - 1],
      releaseId,
      playerHistoryPreserved: name === 'rollback_seed_content_release_v1' ? true : undefined,
    }));
    const base = writeOptions(client, { 'audit-root': auditRoot });
    const imported = await runImporter(base);
    const deactivated = await runImporter({ ...base, mode: 'deactivate' });
    const rolledBack = await runImporter({ ...base, mode: 'rollback', 'allow-soft-rollback': true });
    const reimported = await runImporter(base);
    assert.equal(imported.outcome.releaseId, releaseId);
    assert.equal(deactivated.outcome.outcome, 'deactivated');
    assert.equal(rolledBack.outcome.playerHistoryPreserved, true);
    assert.equal(reimported.outcome.releaseId, releaseId);
    assert.deepEqual(client.calls.map((call) => call.name), [
      'apply_seed_content_release_v1',
      'deactivate_seed_content_release_v1',
      'rollback_seed_content_release_v1',
      'apply_seed_content_release_v1',
    ]);
  });
});

test('malformed duplicate market content fails validation before any write', async () => {
  await withTempDirectory(async (directory) => {
    const packRoot = path.join(directory, 'pack');
    await cp(PACK_ROOT, packRoot, { recursive: true });
    const marketPath = path.join(packRoot, 'market-templates-v1.json');
    const market = JSON.parse(await readFile(marketPath, 'utf8'));
    market.templates[1].ticker = market.templates[0].ticker;
    await writeFile(marketPath, `${JSON.stringify(market, null, 2)}\n`);
    const client = rpcClient(() => ({ outcome: 'applied' }));
    await assert.rejects(
      () => runImporter(writeOptions(client, { 'pack-root': packRoot })),
      /Pack validation failed/,
    );
    assert.equal(client.calls.length, 0);
  });
});

test('staging activation requires a current external authorization bound to digest and project', async () => {
  await withTempDirectory(async (directory) => {
    const integrity = JSON.parse(await readFile(path.join(PACK_ROOT, 'integrity-manifest-v1.json'), 'utf8'));
    const authorizationPath = path.join(directory, 'authorization.json');
    const authorization = {
      authorizationId: 'chat3-staging-activation-test',
      allowActivation: true,
      productionAuthorized: false,
      environment: 'staging',
      projectRef: STAGING_REF,
      packId: integrity.packId,
      version: integrity.version,
      packSha256: integrity.packSha256,
      approvedBy: 'test-operator',
      approvedAt: new Date(Date.now() - 60_000).toISOString(),
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    };
    await writeFile(authorizationPath, `${JSON.stringify(authorization, null, 2)}\n`);
    const client = rpcClient((_name, payload) => ({
      outcome: 'applied',
      activated: payload.p_activate,
      authorizationId: payload.p_authorization_id,
    }));
    const result = await runImporter(writeOptions(client, {
      activate: true,
      authorization: authorizationPath,
      'audit-root': directory,
    }));
    assert.equal(result.outcome.activated, true);
    assert.equal(client.calls[0].payload.p_authorization_id, authorization.authorizationId);
    assert.equal(client.calls[0].payload.p_approved_by, authorization.approvedBy);
  });
});

test('expired activation authorization is rejected before any RPC write', async () => {
  await withTempDirectory(async (directory) => {
    const integrity = JSON.parse(await readFile(path.join(PACK_ROOT, 'integrity-manifest-v1.json'), 'utf8'));
    const authorizationPath = path.join(directory, 'authorization.json');
    await writeFile(authorizationPath, `${JSON.stringify({
      authorizationId: 'expired-authorization',
      allowActivation: true,
      productionAuthorized: false,
      environment: 'staging',
      projectRef: STAGING_REF,
      packId: integrity.packId,
      version: integrity.version,
      packSha256: integrity.packSha256,
      approvedBy: 'test-operator',
      approvedAt: new Date(Date.now() - 7_200_000).toISOString(),
      expiresAt: new Date(Date.now() - 3_600_000).toISOString(),
    }, null, 2)}\n`);
    const client = rpcClient(() => ({ outcome: 'applied' }));
    await assert.rejects(
      () => runImporter(writeOptions(client, {
        activate: true,
        authorization: authorizationPath,
      })),
      /invalid or expired/,
    );
    assert.equal(client.calls.length, 0);
  });
});
