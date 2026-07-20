#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { COUNTRY_IDS, canonicalJson, pointInPolygon, stableNumber } from './seed-beta-pack-lib.mjs';
import { validateSeedBetaPack } from './seed-beta-pack-validator.mjs';
import { runImporter } from './seed-beta-importer.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(SCRIPT_DIR);
const PACK_ROOT = path.join(REPO_ROOT, 'docs', 'seed-content', 'executable', 'beta-pack-v1');

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
