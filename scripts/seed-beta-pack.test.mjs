#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRY_IDS, canonicalJson, pointInPolygon, readJson, stableNumber } from './seed-beta-pack-lib.mjs';
import { validateSeedBetaPack } from './seed-beta-pack-validator.mjs';
import { runImporter } from './seed-beta-importer.mjs';
import { runSeedBetaStagingPreflight } from './seed-beta-staging-preflight.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');

async function calibration() {
  return readJson(path.join(PACK_ROOT, 'calibration-scenarios-v1.json'));
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
  assert.equal(report.summary.countrySimulations, 10);
  assert.equal(report.summary.simulationScenarios, 40);
  assert.equal(report.summary.currencyPairs, 45);
  assert.equal(report.summary.routes, 13);
  assert.equal(report.summary.adjacencyPairs, 45);
});

test('all countries have deterministic baseline, currency, route, and war recovery paths', async () => {
  const evidence = await calibration();
  assert.deepEqual(evidence.countrySimulations.map((entry) => entry.country), COUNTRY_IDS);
  for (const country of evidence.countrySimulations) {
    assert.equal(country.instrumentCount, 24);
    assert.deepEqual(country.scenarios.map((entry) => entry.scenarioId), ['baseline', 'currency-stress', 'route-disruption', 'war-and-recovery']);
    for (const scenario of country.scenarios) {
      assert.equal(scenario.pathSha256.length, 64);
      assert.ok(scenario.maximumDrawdownPct <= 35);
      assert.equal(scenario.recoveredTo95PctOfStart, true);
    }
  }
});

test('currency, route, banking, war recovery, and substitution gates have zero failures', async () => {
  const evidence = await calibration();
  assert.equal(evidence.currency.pairCount, 45);
  assert.equal(evidence.currency.arbitrageFailures, 0);
  assert.ok(evidence.currency.maximumRoundTripGainPct < 0);
  assert.equal(evidence.routes.routeCount, 13);
  assert.equal(evidence.routes.adjacencyPairCount, 45);
  assert.equal(evidence.routes.routeFailures, 0);
  assert.ok(evidence.routes.routes.every((entry) => entry.recoverySafe && entry.capacity.effectiveWarWithSubstitution >= 50));
  assert.ok(evidence.householdAndBanking.every((entry) => entry.bankingAffordability.approved && entry.warAndRecovery.approved && !entry.warAndRecovery.insolvencyObserved));
  assert.equal(evidence.substitution.groupCount, 12);
  assert.equal(evidence.substitution.failures, 0);
  assert.ok(Object.values(evidence.checks).every((value) => value === 0));
});

test('executable staging preflight is structurally ready but remains connected-environment gated', async () => {
  const report = await runSeedBetaStagingPreflight({ packRoot: PACK_ROOT });
  assert.equal(report.structuralReady, true);
  assert.equal(report.connectedImportReady, false);
  assert.equal(report.productionAuthorized, false);
  assert.equal(report.fullMarketUniverse3200Excluded, true);
});

test('importer dry run is credential-free and bounded', async () => {
  const result = await runImporter({ mode: 'dry-run', environment: 'staging', 'pack-root': PACK_ROOT, 'expected-project-ref': 'isolatedstagingref', 'game-session-id': '11111111-1111-4111-8111-111111111111' });
  assert.equal(result.result, 'DRY_RUN_COMPLETE');
  assert.equal(result.plan.operations.stockTemplates, 240);
  assert.equal(result.plan.safety.productionProhibited, true);
});

test('importer rejects production before any network write', async () => {
  await assert.rejects(
    () => runImporter({ mode: 'dry-run', environment: 'production', 'pack-root': PACK_ROOT }),
    /Production is prohibited/,
  );
});

test('importer rejects the known live Supabase project before any network write', async () => {
  const previous = {
    target: process.env.SEED_TARGET_ENVIRONMENT,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  process.env.SEED_TARGET_ENVIRONMENT = 'staging';
  process.env.SUPABASE_URL = 'https://cgiukdjwicykrmtkhudh.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-only-not-a-real-key'; // secret-scan: allow — reviewed non-secret fixture
  try {
    await assert.rejects(
      () => runImporter({
        mode: 'import',
        environment: 'staging',
        'pack-root': PACK_ROOT,
        'expected-project-ref': 'cgiukdjwicykrmtkhudh',
        'game-session-id': '11111111-1111-4111-8111-111111111111',
      }),
      /Refusing known production\/live project/,
    );
  } finally {
    if (previous.target === undefined) delete process.env.SEED_TARGET_ENVIRONMENT; else process.env.SEED_TARGET_ENVIRONMENT = previous.target;
    if (previous.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previous.url;
    if (previous.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = previous.key;
  }
});
