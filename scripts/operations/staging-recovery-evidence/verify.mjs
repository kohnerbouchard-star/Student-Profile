// Offline verifier. Run metadata and review histories must come from the trusted
// same-repository GitHub API transport, never from the recovery archive.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { APPROVED_SUFFIXES } from '../live-migration-reconciliation/build-phase15-rehearsal-plan.mjs';

const recoveryWorkflow = '.github/workflows/econovaria-staging-recovery-evidence.yml';
const applyWorkflow = '.github/workflows/econovaria-staging-suffix-apply.yml';
const maxArchiveBytes = 64 * 1024;
const maxPayloadBytes = 32 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^[a-f0-9]{64}$/;
const refPattern = /^[a-z0-9]{20}$/;
const timestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const batchDigest = sha256(JSON.stringify(APPROVED_SUFFIXES.slice(1)));

const recoveryChecks = [
  'migrationLedger', 'economicInvariants', 'authMapping', 'storageInventory', 'edgeSource',
  'adminSmoke', 'playerDesktopSmoke', 'playerMobileSmoke',
];
const recoveryFields = [
  'status', 'projectRef', 'sourceCommit', 'batchDigest', 'productionModified', 'containsSecretValues',
  'backupSha256', 'startedAt', 'completedAt', 'observedRpoMinutes', 'observedRtoMinutes',
  'rpoObjectiveMinutes', 'rtoObjectiveMinutes', 'operator', 'approver', 'checks',
];
const nativeFields = [
  'schemaVersion', 'instanceId', 'engine', 'version', 'architecture', 'hosted', 'networkIsolated',
  'disposable', 'archiveSha256', 'restoreEvidenceSha256', 'fullArchiveLoad', 'playerTablePresent',
  'authUsersTablePresent', 'ledgerRowCount',
];

function requireFields(record, fields, optional = []) {
  assert(record && Object.getPrototypeOf(record) === Object.prototype, 'Invalid recovery record');
  assert(fields.every(key => Object.hasOwn(record, key)), 'Missing recovery field');
  assert(Object.keys(record).every(key => fields.includes(key) || optional.includes(key)), 'Unexpected recovery field');
}

function readReceipt(bytes) {
  const result = spawnSync('python3', ['-c', `
import io, json, stat, sys, zipfile

def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate JSON key")
        result[key] = value
    return result

def invalid_constant(_):
    raise ValueError("non-JSON number")

with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as archive:
    members = archive.infolist()
    if len(members) != 1 or members[0].orig_filename != "recovery.json":
        raise ValueError("unexpected members")
    member = members[0]
    if (member.flag_bits & 1 or stat.S_IFMT(member.external_attr >> 16) not in (0, stat.S_IFREG)
            or not 0 < member.file_size <= int(sys.argv[1])):
        raise ValueError("invalid member")
    with archive.open(member) as stream:
        raw = stream.read(int(sys.argv[1]) + 1)
    if len(raw) != member.file_size:
        raise ValueError("invalid member size")
    value = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_object, parse_constant=invalid_constant)
    if not isinstance(value, dict):
        raise ValueError("expected a JSON object")
    sys.stdout.buffer.write(raw)
`, String(maxPayloadBytes)], { input: bytes, timeout: 10000, maxBuffer: maxPayloadBytes });
  assert.equal(result.status, 0, 'Invalid recovery archive');
  return JSON.parse(result.stdout.toString('utf8'));
}

function requireRecoveryTarget(recovery, pins) {
  if (recovery.restoreTargetKind === undefined || recovery.restoreTargetKind === 'isolated-supabase-project') {
    assert.equal(recovery.nativeDatabaseRestore, undefined);
    assert.match(recovery.restoreTargetRef, refPattern);
    assert(![pins.stagingProjectRef, pins.productionProjectRef].includes(recovery.restoreTargetRef),
      'Restore target must be distinct');
    return;
  }

  assert.equal(recovery.restoreTargetKind, 'isolated-native-supabase-postgres');
  assert.equal(recovery.restoreTargetRef, undefined);
  const native = recovery.nativeDatabaseRestore;
  requireFields(native, nativeFields);
  assert.equal(native.schemaVersion, 1);
  assert.match(native.instanceId, /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/);
  assert.equal(native.engine, 'supabase-postgres');
  assert.match(native.version, /^17\.\d+(?:\.\d+)*$/);
  assert(['arm64', 'amd64'].includes(native.architecture));
  assert.equal(native.hosted, false);
  assert.equal(native.networkIsolated, true);
  assert.equal(native.disposable, true);
  assert.equal(native.archiveSha256, recovery.backupSha256);
  assert.match(native.restoreEvidenceSha256, digestPattern);
  assert.equal(native.fullArchiveLoad, 'PASS');
  assert.equal(native.playerTablePresent, true);
  assert.equal(native.authUsersTablePresent, true);
  assert(Number.isSafeInteger(native.ledgerRowCount) && native.ledgerRowCount > 0);
}

function requireRecoveryReceipt(recovery, pins, now) {
  requireFields(recovery, recoveryFields, ['restoreTargetKind', 'restoreTargetRef', 'nativeDatabaseRestore']);
  assert.equal(recovery.status, 'PASS');
  assert.equal(recovery.projectRef, pins.stagingProjectRef);
  assert.equal(recovery.sourceCommit, pins.source);
  assert.equal(recovery.batchDigest, batchDigest);
  assert.equal(recovery.productionModified, false);
  assert.equal(recovery.containsSecretValues, false);
  assert.match(recovery.backupSha256, digestPattern);
  requireRecoveryTarget(recovery, pins);

  assert.match(recovery.startedAt, timestampPattern);
  assert.match(recovery.completedAt, timestampPattern);
  const started = Date.parse(recovery.startedAt);
  const completed = Date.parse(recovery.completedAt);
  assert(started < completed && completed <= now && now - completed <= 90 * 86400000,
    'Invalid or stale recovery timing');
  for (const [observed, objective] of [
    [recovery.observedRpoMinutes, recovery.rpoObjectiveMinutes],
    [recovery.observedRtoMinutes, recovery.rtoObjectiveMinutes],
  ]) {
    assert(Number.isFinite(observed) && Number.isFinite(objective) && observed >= 0 && observed <= objective,
      'Recovery measurements must meet objectives');
  }
  requireFields(recovery.checks, recoveryChecks);
  for (const check of recoveryChecks) assert.equal(recovery.checks[check], 'PASS');
}

function normalizedLogin(value) {
  assert(typeof value === 'string' && value.length <= 39 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(value),
    'Expected a GitHub user login');
  return value.toLowerCase();
}

function requireReview(history, run, repositoryId, recovery) {
  assert.equal(history.runId, run.id);
  assert.equal(history.repositoryId, repositoryId);
  const reviewer = normalizedLogin(recovery.approver);
  assert.notEqual(reviewer, normalizedLogin(recovery.operator));
  assert.notEqual(reviewer, normalizedLogin(run.actor.login));
  assert(Array.isArray(history.reviews));
  const reviews = history.reviews.filter(review =>
    review?.user?.type === 'User' &&
    typeof review.user.login === 'string' && review.user.login.toLowerCase() === reviewer &&
    Array.isArray(review.environments) && review.environments.some(environment => environment?.name === 'staging')
  );
  assert(reviews.length > 0 && reviews.every(review => review.state === 'approved'),
    'Independent staging approval missing or inconsistent');
}

function requireRun(run, runId, workflow, pins) {
  assert.equal(run.id, runId);
  assert.equal(run.path, workflow);
  assert.equal(run.event, 'workflow_dispatch');
  assert.equal(run.head_branch, 'main');
  assert.equal(run.head_sha, pins.source);
  assert.equal(run.repository?.id, pins.repositoryId);
  assert.equal(run.head_repository?.id, pins.repositoryId);
  assert.equal(run.run_attempt, 1);
  assert.equal(run.actor?.type, 'User');
}

export function verifyRecoveryEvidence(evidence, now = Date.now()) {
  try {
    const { pins, producer, apply, artifact, bytes, producerReview, applyReview } = evidence;
    assert.match(pins.source, shaPattern);
    assert.equal(pins.source, pins.currentMain);
    for (const id of [pins.repositoryId, pins.producerRunId, pins.applyRunId, pins.artifactId]) {
      assert(Number.isSafeInteger(id) && id > 0);
    }
    assert.notEqual(pins.producerRunId, pins.applyRunId);
    assert.match(pins.stagingProjectRef, refPattern);
    assert.match(pins.productionProjectRef, refPattern);
    assert.notEqual(pins.stagingProjectRef, pins.productionProjectRef);

    requireRun(producer, pins.producerRunId, recoveryWorkflow, pins);
    assert.equal(producer.status, 'completed');
    assert.equal(producer.conclusion, 'success');
    requireRun(apply, pins.applyRunId, applyWorkflow, pins);
    assert.equal(apply.status, 'in_progress');

    assert.equal(artifact.id, pins.artifactId);
    assert.equal(artifact.name, `econovaria-staging-recovery-${pins.source}`);
    assert.equal(artifact.expired, false);
    assert.equal(artifact.workflow_run?.id, producer.id);
    assert.equal(artifact.workflow_run?.head_sha, pins.source);
    assert.equal(artifact.workflow_run?.head_branch, 'main');
    assert.equal(artifact.workflow_run?.repository_id, pins.repositoryId);
    assert.equal(artifact.workflow_run?.head_repository_id, pins.repositoryId);
    assert(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= maxArchiveBytes);
    assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= maxArchiveBytes);
    assert.equal(artifact.digest, pins.artifactDigest);
    assert.equal(artifact.digest, `sha256:${sha256(bytes)}`);

    const recovery = readReceipt(bytes);
    requireRecoveryReceipt(recovery, pins, now);
    requireReview(producerReview, producer, pins.repositoryId, recovery);
    requireReview(applyReview, apply, pins.repositoryId, recovery);
    return recovery;
  } catch {
    // Do not include untrusted archive fields, metadata, or Python diagnostics in logs.
    throw new Error('STAGING_RECOVERY_EVIDENCE_REJECTED');
  }
}
