import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { verifyRecoveryEvidence } from './verify.mjs';

const now = Date.parse('2026-01-02T12:00:00Z');
const source = 'a'.repeat(40);
const stagingProjectRef = 's'.repeat(20);
const productionProjectRef = 'p'.repeat(20);
const batchDigest = '1cf47b07dfba61abfcf9c66a2e1315fa85495dadb0b0575bee26c436e8875183';
const reviewer = 'fixture-reviewer';
const denied = /^Error: STAGING_RECOVERY_EVIDENCE_REJECTED$/;

function receipt() {
  return {
    status: 'PASS', projectRef: stagingProjectRef, sourceCommit: source, batchDigest,
    productionModified: false, containsSecretValues: false, backupSha256: 'd'.repeat(64),
    startedAt: '2026-01-02T10:00:00Z', completedAt: '2026-01-02T10:30:00Z',
    observedRpoMinutes: 10, observedRtoMinutes: 30, rpoObjectiveMinutes: 30, rtoObjectiveMinutes: 60,
    operator: 'fixture-restore-operator', approver: reviewer,
    checks: {
      migrationLedger: 'PASS', economicInvariants: 'PASS', authMapping: 'PASS', storageInventory: 'PASS',
      edgeSource: 'PASS', adminSmoke: 'PASS', playerDesktopSmoke: 'PASS', playerMobileSmoke: 'PASS',
    },
    restoreTargetKind: 'isolated-native-supabase-postgres',
    nativeDatabaseRestore: {
      schemaVersion: 1, instanceId: '00000000-0000-4000-8000-000000000001', engine: 'supabase-postgres',
      version: '17.6.1.143', architecture: 'arm64', hosted: false, networkIsolated: true, disposable: true,
      archiveSha256: 'd'.repeat(64), restoreEvidenceSha256: 'e'.repeat(64), fullArchiveLoad: 'PASS',
      playerTablePresent: true, authUsersTablePresent: true, ledgerRowCount: 42,
    },
  };
}

function zip(entries) {
  const packed = spawnSync('python3', ['-c', `
import io, json, sys, zipfile
data = io.BytesIO()
with zipfile.ZipFile(data, "w", compression=zipfile.ZIP_DEFLATED) as archive:
    for name, value, mode in json.load(sys.stdin):
        info = zipfile.ZipInfo(name)
        info.create_system = 3
        info.external_attr = mode << 16
        archive.writestr(info, value, compress_type=zipfile.ZIP_DEFLATED)
sys.stdout.buffer.write(data.getvalue())
`], { input: JSON.stringify(entries), timeout: 10000 });
  assert.equal(packed.status, 0, 'Unable to build synthetic ZIP');
  return packed.stdout;
}

function evidence(bytes = zip([['recovery.json', JSON.stringify(receipt()), 0o100600]])) {
  const artifactDigest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const run = (id, path, actor) => ({
    id, path, event: 'workflow_dispatch', head_branch: 'main', head_sha: source,
    repository: { id: 100 }, head_repository: { id: 100 }, run_attempt: 1, actor: { login: actor, type: 'User' },
  });
  const history = runId => ({
    runId, repositoryId: 100, reviews: [
      { state: 'approved', user: { login: reviewer, type: 'User' }, environments: [{ name: 'staging' }] },
    ],
  });
  return {
    bytes,
    pins: {
      source, currentMain: source, repositoryId: 100, producerRunId: 200, applyRunId: 201, artifactId: 300,
      artifactDigest, stagingProjectRef, productionProjectRef,
    },
    producer: {
      ...run(200, '.github/workflows/econovaria-staging-recovery-evidence.yml', 'fixture-publisher'),
      status: 'completed', conclusion: 'success',
    },
    apply: {
      ...run(201, '.github/workflows/econovaria-staging-suffix-apply.yml', 'fixture-dispatcher'),
      status: 'in_progress',
    },
    artifact: {
      id: 300, name: `econovaria-staging-recovery-${source}`, digest: artifactDigest, expired: false,
      size_in_bytes: bytes.length,
      workflow_run: { id: 200, head_sha: source, head_branch: 'main', repository_id: 100, head_repository_id: 100 },
    },
    producerReview: history(200),
    applyReview: history(201),
  };
}

const pack = value => evidence(zip([['recovery.json', JSON.stringify(value), 0o100600]]));

test('accepts an external native restore receipt bound to separately reviewed exact runs', () => {
  assert.deepEqual(verifyRecoveryEvidence(evidence(), now), receipt());
});

test('keeps support for an explicitly distinct isolated managed restore target', () => {
  const managed = receipt();
  delete managed.nativeDatabaseRestore;
  managed.restoreTargetKind = 'isolated-supabase-project';
  managed.restoreTargetRef = 't'.repeat(20);
  assert.deepEqual(verifyRecoveryEvidence(pack(managed), now), managed);
  for (const ref of [stagingProjectRef, productionProjectRef]) {
    managed.restoreTargetRef = ref;
    assert.throws(() => verifyRecoveryEvidence(pack(managed), now), denied);
  }
});

test('rejects both mismatched digest pins and modified archive bytes', () => {
  const subject = evidence();
  const alternateDigest = 'sha256:' + '0'.repeat(64);
  assert.throws(() => verifyRecoveryEvidence({ ...subject, pins: { ...subject.pins, artifactDigest: alternateDigest } }, now), denied);
  const changed = Buffer.from(subject.bytes);
  changed[20] ^= 1;
  assert.throws(() => verifyRecoveryEvidence({ ...subject, bytes: changed }, now), denied);
});

test('rejects wrong source, artifact, registry, run, environment and review provenance', () => {
  const incorrect = {
    'moved main': e => e.pins.currentMain = 'b'.repeat(40),
    'wrong artifact ID': e => e.artifact.id = 301,
    'wrong name': e => e.artifact.name = 'recovery.json',
    'expired artifact': e => e.artifact.expired = true,
    'different artifact run': e => e.artifact.workflow_run.id = 202,
    'different artifact branch': e => e.artifact.workflow_run.head_branch = 'feature',
    'different artifact SHA': e => e.artifact.workflow_run.head_sha = 'b'.repeat(40),
    'artifact from fork': e => e.artifact.workflow_run.head_repository_id = 900,
    'artifact in another repo': e => e.artifact.workflow_run.repository_id = 900,
    'wrong producer': e => e.producer.path = '.github/workflows/database-replay.yml',
    'untrusted trigger': e => e.producer.event = 'pull_request',
    'producer rerun': e => e.producer.run_attempt = 2,
    'unsuccessful producer': e => e.producer.conclusion = 'failure',
    'different apply run': e => e.apply.id = 202,
    'different apply source': e => e.apply.head_sha = 'b'.repeat(40),
    'apply rerun': e => e.apply.run_attempt = 2,
    'producer review missing': e => e.producerReview.reviews = [],
    'apply review missing': e => e.applyReview.reviews = [],
    'publisher reviewed their own run': e => e.producer.actor.login = reviewer.toUpperCase(),
    'dispatcher reviewed their own run': e => e.apply.actor.login = reviewer,
    'rejected by staging reviewer': e => e.applyReview.reviews[0].state = 'rejected',
    'conflicting reviewer history': e => e.applyReview.reviews.push({ ...e.applyReview.reviews[0], state: 'rejected' }),
    'production approval': e => e.applyReview.reviews[0].environments[0].name = 'production',
    'approval from another run': e => e.applyReview.runId = e.producer.id,
    'approval from another repository': e => e.applyReview.repositoryId = 900,
    'different reviewer': e => e.applyReview.reviews[0].user.login = 'fixture-other-reviewer',
    'non-human approval': e => e.applyReview.reviews[0].user.type = 'Bot',
  };
  const fixture = evidence();
  for (const [name, change] of Object.entries(incorrect)) {
    const subject = { ...structuredClone(fixture), bytes: fixture.bytes };
    change(subject);
    assert.throws(() => verifyRecoveryEvidence(subject, now), denied, name);
  }
});

test('rejects freshly re-pinned receipts with wrong scope, missing checks, or invalid timing', () => {
  const incorrect = {
    'wrong project': r => r.projectRef = productionProjectRef,
    'wrong source': r => r.sourceCommit = 'b'.repeat(40),
    'wrong suffix batch': r => r.batchDigest = 'b'.repeat(64),
    'scope incomplete': r => delete r.checks.playerMobileSmoke,
    'Auth held': r => r.checks.authMapping = 'NOT_RUN',
    'recovery incomplete': r => r.status = 'NOT_RUN',
    'changed backup': r => r.nativeDatabaseRestore.archiveSha256 = 'b'.repeat(64),
    'networked restore': r => r.nativeDatabaseRestore.networkIsolated = false,
    'auth table missing': r => r.nativeDatabaseRestore.authUsersTablePresent = false,
    'stale recovery': r => Object.assign(r, { startedAt: '2024-01-02T10:00:00Z', completedAt: '2024-01-02T10:30:00Z' }),
    'invented timing shape': r => r.startedAt = ['2026-01-02T10:00:00Z'],
    'missed RPO': r => r.observedRpoMinutes = 31,
    'missing RTO': r => delete r.observedRtoMinutes,
    'operator self-approved': r => r.operator = reviewer.toUpperCase(),
    'pretend approval inside receipt': r => r.approval = { state: 'approved', reviewer },
    'unexpected nested field': r => r.nativeDatabaseRestore.rawDump = 'synthetic sensitive placeholder',
    'production change': r => r.productionModified = true,
  };
  for (const [name, change] of Object.entries(incorrect)) {
    const value = receipt();
    change(value);
    assert.throws(() => verifyRecoveryEvidence(pack(value), now), denied, name);
  }
});

test('rejects malformed, expanded, or ambiguous archives without leaking input', () => {
  const valid = JSON.stringify(receipt());
  const regular = 0o100600;
  for (const entries of [
    [['../recovery.json', valid, regular]],
    [['recovery.json', valid, regular], ['extra.txt', 'synthetic-data', regular]],
    [['recovery.json', valid, 0o120777]],
    [['recovery.json', valid + ' '.repeat(32768), regular]],
    [['recovery.json', 'x-secret-placeholder', regular]],
    [['recovery.json', valid.replace('"status":"PASS"', '"status":"NO","status":"PASS"'), regular]],
  ]) {
    assert.throws(() => verifyRecoveryEvidence(evidence(zip(entries)), now), denied);
  }
});
