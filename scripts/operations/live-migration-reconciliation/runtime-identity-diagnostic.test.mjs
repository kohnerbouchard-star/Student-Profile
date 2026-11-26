import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runtimeIdentityDiagnostic, verifiedRuntimeIdentityProfile } from './runtime-identity-diagnostic.mjs';

const DIR = 'scripts/operations/live-migration-reconciliation/';
const WORKFLOW = '.github/workflows/econovaria-staging-schema-rehearsal.yml';
const PRIVATE = 'PRIVATE_CATALOG_FIXTURE_SENTINEL';
const empty = () => ({
  schemaVersion: 'econovaria.phase15.catalog-supplement.v2',
  schemas: [], extensions: [], views: [], routineSecurity: [], triggers: [], cron: [],
});
const verified = () => structuredClone(verifiedRuntimeIdentityProfile().profile);
const catalogFiles = (temp, left, right) => {
  const canonical = join(temp, 'canonical.json');
  const restored = join(temp, 'post-catalog.json');
  writeFileSync(canonical, JSON.stringify(left));
  writeFileSync(restored, JSON.stringify(right));
  return { canonical, restored };
};
function compare(canonical, restored) {
  const result = spawnSync(process.execPath, [
    DIR + 'compare-schema-snapshots.mjs', '--left', canonical, '--right', restored,
  ], { encoding: 'utf8' });
  return { exitCode: result.status, data: JSON.parse(result.stdout) };
}
function sameCountFixtures() {
  const profile = verified();
  const right = empty();
  const cron = profile.providerSchemaRows.find(row => row.name === 'cron');
  right.schemas = [cron, { name: 'public', owner: cron.owner }];
  const left = structuredClone(right);
  left.schemas.unshift(profile.providerSchemaRows.find(row => row.name === 'auth'));
  left.cron = profile.staticSchedulerRows;
  const unknown = structuredClone(left);
  unknown.schemas[0].name = PRIVATE;
  return { left, right, unknown };
}
function workflowProjection(left, right, options = {}) {
  const { stale, missing, catalogExit = 2 } = options;
  const temp = mkdtempSync(join(tmpdir(), PRIVATE + '-'));
  try {
    const evidence = join(temp, 'evidence');
    const capture = join(temp, 'capture');
    for (const dir of [evidence, capture]) mkdirSync(dir);
    const { canonical, restored } = catalogFiles(evidence, left, right);
    const comparison = compare(canonical, restored);
    if (!missing) writeFileSync(join(evidence, 'catalog-comparison.json'), JSON.stringify(comparison.data));
    if (stale) writeFileSync(canonical, JSON.stringify(stale));
    writeFileSync(join(capture, 'schema.sql'), PRIVATE);
    writeFileSync(join(capture, 'ledger.json'), '[]');
    // Rehearsal application status is independent of the exact runtime apply gate.
    const summary = {
      sourceCommit: 'a'.repeat(40), environment: 'staging', status: 'PASS', exitCode: 0,
      runtimeCatalogComparisonExit: catalogExit, canonicalApplicationSchemaMatched: true,
      sourceRowsCopied: false, rawSchemaDumpRetained: false,
      postBundleSuffix: { remoteLedgerPresentCount: 1, appliedMigrationCount: 15, certifiedMigrationCount: 16 },
      secret: PRIVATE,
    };
    writeFileSync(join(evidence, 'summary.json'), JSON.stringify(summary));
    const code = readFileSync(WORKFLOW, 'utf8').split('      - name: Retain only bounded qualification results')[1]
      .split('      - if: always()')[0].split('        run: |\n')[1].split('\n').map(line => line.slice(10)).join('\n');
    const run = spawnSync('bash', ['-euo', 'pipefail', '-c', code], {
      encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: temp, PHASE15_EVIDENCE_DIR: evidence,
        PHASE15_CAPTURE_DIR: capture, PHASE15_CANONICAL_CATALOG: canonical },
    });
    assert.equal(run.status, 0);
    assert(!run.stdout.includes(PRIVATE) && !run.stderr.includes(PRIVATE));
    const text = readFileSync(join(temp, 'u1', 'sanitized', 'result.json'), 'utf8');
    assert(!text.includes(PRIVATE));
    const projection = JSON.parse(text);
    assert.equal(projection.status, 'PASS');
    assert.equal(projection.runtimeCatalogComparisonExit, catalogExit);
    assert.equal(projection.releaseCertificate, false);
    assert.equal(projection.runtimeIdentityDiagnostic.parityEstablished, false);
    assert.equal(projection.runtimeIdentityDiagnostic.applyAuthorized, false);
    return { comparison, projection };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

test('the profile verifies nine schemas and six exact scheduler tuples against independent sources', () => {
  const profile = verified();
  assert.equal(profile.providerSchemaRows.length, 9);
  assert.equal(profile.staticSchedulerRows.length, 6);
  assert(profile.sources.every(row => /^[a-f0-9]{64}$/.test(row.sha256)));
  assert(!profile.providerSchemaRows.some(row =>
    ['public', 'private', 'economy_private', '_realtime', 'supabase_functions'].includes(row.name)));
});

test('identical positional counts allow known and unknown identity outcomes in the real artifact step', () => {
  const { left, right, unknown } = sameCountFixtures();
  const results = [workflowProjection(left, right), workflowProjection(unknown, right)];
  assert.deepEqual(results.map(entry => entry.comparison.exitCode), [2, 2]);
  for (const { projection } of results) {
    assert.equal(projection.exactComparisonDiagnostics.runtimeCatalog.categories['catalog.schemas'], 3);
    assert.equal(projection.exactComparisonDiagnostics.runtimeCatalog.categories['catalog.cron'], 1);
  }
  const [known, unresolved] = results.map(entry => entry.projection.runtimeIdentityDiagnostic);
  assert.equal(known.boundToExactComparison, true);
  assert.equal(known.classification, 'known-identities-only');
  assert.deepEqual(known.identityLabels.map(label => label.id), ['P01', 'S01', 'S02', 'S03', 'S04', 'S05', 'S06']);
  assert.equal(known.counts.schemas.canonicalOnlyVerifiedProvider, 1);
  assert.equal(known.counts.cron.canonicalOnlyVerifiedStatic, 6);
  assert.equal(unresolved.boundToExactComparison, true);
  assert.equal(unresolved.classification, 'unresolved');
  assert.equal(unresolved.counts.schemas.unknownIdentity, 1);
  assert.deepEqual(unresolved.identityLabels.map(label => label.id), ['S01', 'S02', 'S03', 'S04', 'S05', 'S06']);
});

test('stale substitution with the same counts, missing comparison and inapplicable exit yield no labels', () => {
  const { left, right, unknown } = sameCountFixtures();
  for (const options of [{ stale: unknown }, { missing: true }, { catalogExit: 0 }]) {
    const result = workflowProjection(left, right, options).projection.runtimeIdentityDiagnostic;
    assert.notEqual(result.status, 'available');
    assert.equal(result.boundToExactComparison, false);
    assert.equal(result.classification, 'unresolved');
    assert.equal(result.identityLabels, null);
  }
});

test('unverified owner, changed known owner and application schema remain unresolved', () => {
  const profile = verified();
  const left = empty();
  left.schemas = [
    { name: '_realtime', owner: PRIVATE },
    { ...profile.providerSchemaRows[0], owner: PRIVATE },
    { name: 'public', owner: 'postgres' },
  ];
  const result = runtimeIdentityDiagnostic(left, empty());
  assert.equal(result.classification, 'unresolved');
  assert.equal(result.counts.schemas.unverifiedProviderIdentity, 2);
  assert.equal(result.counts.schemas.unknownIdentity, 1);
  assert.deepEqual(result.identityLabels.map(label => label.confidence), ['owner-unverified', 'owner-unverified']);
  assert(!JSON.stringify(result).includes(PRIVATE));
  const right = empty();
  right.schemas = profile.providerSchemaRows.slice(0, 1);
  assert.equal(runtimeIdentityDiagnostic(left, right).counts.schemas.changedOwner, 1);
});

test('scheduler state, command, role and wrong-direction matches remain unresolved', () => {
  const profile = verified();
  const row = profile.staticSchedulerRows[0];
  const left = empty();
  const right = empty();
  left.cron = [row];
  for (const change of [{ active: false }, { schedule: PRIVATE }, { commandSha256: 'f'.repeat(64) }, { username: PRIVATE }]) {
    right.cron = [{ ...row, ...change }];
    const result = runtimeIdentityDiagnostic(left, right);
    assert.equal(result.classification, 'unresolved');
    assert(!JSON.stringify(result).includes(PRIVATE));
    assert.equal(result.applyAuthorized, false);
  }
  assert.equal(runtimeIdentityDiagnostic(empty(), left).counts.cron.restoredOnlyVerifiedStatic, 1);
  assert.equal(runtimeIdentityDiagnostic(empty(), left).classification, 'unresolved');
});

test('malformed and duplicate keys fail closed, and other categories never become known-only', () => {
  const profile = verified();
  for (const sample of [
    {}, { ...empty(), schemas: [profile.providerSchemaRows[0], profile.providerSchemaRows[0]] },
    { ...empty(), cron: [profile.staticSchedulerRows[0], profile.staticSchedulerRows[0]] },
    { ...empty(), cron: [{ ...profile.staticSchedulerRows[0], extra: PRIVATE }] },
  ]) {
    const result = runtimeIdentityDiagnostic(sample, empty());
    assert.equal(result.status, 'invalid');
    assert.equal(result.identityLabels, null);
  }
  for (const category of ['extensions', 'views', 'routineSecurity', 'triggers']) {
    const left = { ...empty(), [category]: [{ name: PRIVATE }] };
    const result = runtimeIdentityDiagnostic(left, empty());
    assert.equal(result.classification, 'unresolved');
    assert(!JSON.stringify(result).includes(PRIVATE));
  }
});

test('identity equality under reorder does not pass the ordered exact comparator', () => {
  const left = { ...empty(), schemas: verified().providerSchemaRows };
  const right = { ...empty(), schemas: [...left.schemas].reverse() };
  const { comparison, projection } = workflowProjection(left, right);
  assert.equal(comparison.exitCode, 2);
  assert.equal(projection.runtimeIdentityDiagnostic.classification, 'identity-equal');
  assert.equal(projection.runtimeIdentityDiagnostic.parityEstablished, false);
});
