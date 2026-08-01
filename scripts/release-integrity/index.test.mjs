import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildMigrationManifest,
  compareMigrationLedger,
  compareSchemaFingerprints,
  createReleaseAttestation,
  normalizeSchemaFingerprint,
  validateDatabaseUrlProjectRef,
  verifyRuntimeContract,
} from './index.mjs';

const SOURCE_SHA = '0123456789abcdef0123456789abcdef01234567';

async function createRuntimeFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'econovaria-runtime-'));
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    engines: { node: '>=22.22.2 <23', npm: '>=10.9.7 <11' },
    packageManager: 'npm@10.9.8',
  }));
  await writeFile(path.join(root, '.nvmrc'), '22.23.1\n');
  await writeFile(path.join(root, '.npmrc'), 'engine-strict=true\n');
  return root;
}

test('runtime contract distinguishes exact CI from compatible deploy runtimes', async () => {
  const repoRoot = await createRuntimeFixture();
  const exact = await verifyRuntimeContract({
    repoRoot,
    mode: 'exact',
    currentNode: '22.23.1',
    currentNpm: '10.9.8',
  });
  assert.equal(exact.status, 'PASS');

  const verifiedVercelFloor = await verifyRuntimeContract({
    repoRoot,
    mode: 'compatible',
    currentNode: '22.22.2',
    currentNpm: '10.9.7',
  });
  assert.equal(verifiedVercelFloor.status, 'PASS');

  const newerCompatiblePatch = await verifyRuntimeContract({
    repoRoot,
    mode: 'compatible',
    currentNode: '22.24.0',
    currentNpm: '10.10.0',
  });
  assert.equal(newerCompatiblePatch.status, 'PASS');

  for (const [currentNode, currentNpm] of [
    ['22.22.1', '10.9.7'],
    ['22.22.2', '10.9.6'],
    ['23.0.0', '10.9.8'],
    ['22.23.1', '11.0.0'],
  ]) {
    await assert.rejects(
      verifyRuntimeContract({ repoRoot, mode: 'compatible', currentNode, currentNpm }),
      /Runtime contract failed/,
    );
  }
});

test('runtime contract requires engine-strict', async () => {
  const repoRoot = await createRuntimeFixture();
  await writeFile(path.join(repoRoot, '.npmrc'), 'fund=false\n');
  await assert.rejects(
    verifyRuntimeContract({
      repoRoot,
      currentNode: '22.23.1',
      currentNpm: '10.9.8',
    }),
    /engine-strict=true/,
  );
});

test('migration manifest is deterministic and content-addressed', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'econovaria-manifest-'));
  const migrationRoot = path.join(repoRoot, 'backend/supabase/migrations');
  await mkdir(migrationRoot, { recursive: true });
  await writeFile(path.join(migrationRoot, '20260101000000_create_alpha.sql'), 'begin;\nselect 1;\ncommit;\n');
  await writeFile(path.join(migrationRoot, '20260102000000_create_beta.sql'), 'begin;\nselect 2;\ncommit;\n');

  const first = await buildMigrationManifest({ repoRoot, sourceSha: SOURCE_SHA });
  const second = await buildMigrationManifest({ repoRoot, sourceSha: SOURCE_SHA });
  assert.deepEqual(first, second);
  assert.equal(first.migrations.length, 2);
  assert.match(first.manifestSha256, /^[0-9a-f]{64}$/);

  await writeFile(path.join(migrationRoot, '20260101000000_duplicate.sql'), 'select 3;\n');
  await assert.rejects(
    buildMigrationManifest({ repoRoot, sourceSha: SOURCE_SHA }),
    /duplicate migration version/,
  );
});

test('ledger comparison classifies every ordered identity failure', () => {
  const manifest = {
    schemaVersion: 'econovaria.release-integrity.migration-manifest.v1',
    manifestSha256: 'a'.repeat(64),
    migrations: [
      { version: '20260101000000', name: 'alpha', filename: '20260101000000_alpha.sql' },
      { version: '20260102000000', name: 'beta', filename: '20260102000000_beta.sql' },
      { version: '20260103000000', name: 'gamma', filename: '20260103000000_gamma.sql' },
    ],
  };
  const report = compareMigrationLedger({
    manifest,
    environment: 'staging',
    liveLedger: [
      { version: '20260102000000', name: 'wrong_beta' },
      { version: '20260101000000', name: 'alpha' },
      { version: '20260102000000', name: 'wrong_beta' },
      { version: '20260104000000', name: 'live_only' },
    ],
  });
  assert.equal(report.status, 'UNAPPROVED_DRIFT');
  assert.deepEqual(report.missingFromLive.map((row) => row.version), ['20260103000000']);
  assert.deepEqual(report.liveOnly.map((row) => row.version), ['20260104000000']);
  assert.equal(report.nameMismatches.length, 1);
  assert.equal(report.duplicateLiveVersions.length, 1);
  assert.ok(report.orderingViolations.length >= 1);
});

test('schema normalization is stable across key and array order', () => {
  const left = normalizeSchemaFingerprint({
    capturedAt: 'ignored',
    structural: { columns: [{ name: 'b' }, { name: 'a' }], tables: { z: 1, a: 2 } },
    authorization: { grants: [{ role: 'service_role' }, { role: 'anon' }] },
  });
  const right = normalizeSchemaFingerprint({
    authorization: { grants: [{ role: 'anon' }, { role: 'service_role' }] },
    structural: { tables: { a: 2, z: 1 }, columns: [{ name: 'a' }, { name: 'b' }] },
  });
  assert.equal(left.structuralSha256, right.structuralSha256);
  assert.equal(left.authorizationSha256, right.authorizationSha256);
  assert.equal(left.overallSha256, right.overallSha256);
});

test('authorization-only drift is isolated and requires an exact allowlist pair', () => {
  const staging = normalizeSchemaFingerprint({
    structural: { tables: ['a'] },
    authorization: { grants: ['service_role'] },
  });
  const production = normalizeSchemaFingerprint({
    structural: { tables: ['a'] },
    authorization: { grants: ['service_role', 'anon'] },
  });
  const blocked = compareSchemaFingerprints({ staging, production });
  assert.equal(blocked.status, 'UNAPPROVED_DRIFT');
  assert.equal(blocked.differences[0].scope, 'authorization');

  const allowed = compareSchemaFingerprints({
    staging,
    production,
    allowlist: {
      allowedDifferences: [{
        scope: 'authorization',
        stagingSha256: staging.authorizationSha256,
        productionSha256: production.authorizationSha256,
        reason: 'Temporary exact authorization fingerprint exception under reviewed incident control.',
      }],
    },
  });
  assert.equal(allowed.status, 'EXPECTED_DIFFERENCE');
});

test('database URL binding validates direct and pooler identities without returning credentials', () => {
  const projectRef = 'abcdefghijklmnopqrst';
  const direct = validateDatabaseUrlProjectRef({
    databaseUrl: `postgresql://postgres:secret@db.${projectRef}.supabase.co:5432/postgres`,
    expectedProjectRef: projectRef,
  });
  assert.equal(direct.connectionType, 'direct');
  assert.ok(!JSON.stringify(direct).includes('secret'));

  const pooler = validateDatabaseUrlProjectRef({
    databaseUrl: `postgresql://postgres.${projectRef}:secret@aws-0-region.pooler.supabase.com:5432/postgres`,
    expectedProjectRef: projectRef,
  });
  assert.equal(pooler.connectionType, 'pooler');

  assert.throws(() => validateDatabaseUrlProjectRef({
    databaseUrl: 'postgresql://postgres:secret@db.wrongprojectrefxxxxx.supabase.co:5432/postgres',
    expectedProjectRef: projectRef,
  }), /not bound/);
});

test('attestation passes only when every required component passes', () => {
  const base = {
    sourceSha: SOURCE_SHA,
    workflowRunId: '123',
    workflowRunAttempt: '1',
    runtimeContract: { status: 'PASS' },
    migrationManifest: { manifestSha256: 'a'.repeat(64) },
    stagingLedger: { status: 'PASS' },
    productionLedger: { status: 'PASS' },
    schemaComparison: {
      status: 'PASS',
      staging: { structuralSha256: 'b'.repeat(64), authorizationSha256: 'c'.repeat(64) },
      production: { structuralSha256: 'b'.repeat(64), authorizationSha256: 'c'.repeat(64) },
    },
  };
  assert.equal(createReleaseAttestation(base).status, 'PASS');
  assert.equal(createReleaseAttestation({
    ...base,
    productionLedger: { status: 'UNAPPROVED_DRIFT' },
  }).status, 'BLOCKED');
});
