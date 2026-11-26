import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { verifyProtectedEvidence } from './protected-transport.mjs';
import {
  STAGING_OWNER_ID, STAGING_OWNER_LOGIN, STAGING_REPOSITORY, STAGING_REPOSITORY_ID,
} from './owner-approval.mjs';
import { batchDigest, PROJECT, sha256 } from '../staging-suffix-apply/control.mjs';
import { requireAuthorizedOperation } from '../staging-suffix-apply/manual.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const transport = join(root, 'scripts/operations/staging-recovery-evidence/protected-transport.mjs');
const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const owner = { id: STAGING_OWNER_ID, login: STAGING_OWNER_LOGIN, type: 'User' };
const repo = { id: STAGING_REPOSITORY_ID, full_name: STAGING_REPOSITORY, default_branch: 'main', owner };
const dispatchEnv = {
  GITHUB_REPOSITORY: STAGING_REPOSITORY, GITHUB_REPOSITORY_ID: String(STAGING_REPOSITORY_ID),
  GITHUB_ACTOR_ID: String(STAGING_OWNER_ID), GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: head, GITHUB_RUN_ID: '41',
};
const publisher = '.github/workflows/econovaria-staging-recovery-evidence.yml';
const applier = '.github/workflows/econovaria-staging-suffix-apply.yml';
const run = (id, path, options = {}) => ({
  id, path, event: 'workflow_dispatch', head_branch: 'main', head_sha: head, run_attempt: 1,
  status: 'in_progress', repository: repo, head_repository: repo, actor: owner, triggering_actor: owner,
  ...options,
});
const hash = bytes => 'sha256:' + sha256(bytes);
const now = Date.now();
const iso = ms => new Date(ms).toISOString();
const receipt = {
  status: 'PASS', projectRef: PROJECT, sourceCommit: head, batchDigest,
  productionModified: false, containsSecretValues: false, backupSha256: '1'.repeat(64),
  startedAt: iso(now - 180_000), completedAt: iso(now - 120_000), observedRpoMinutes: 1,
  observedRtoMinutes: 1, rpoObjectiveMinutes: 5, rtoObjectiveMinutes: 5,
  operator: STAGING_OWNER_LOGIN, approver: STAGING_OWNER_LOGIN,
  restoreTargetKind: 'isolated-native-supabase-postgres',
  nativeDatabaseRestore: {
    schemaVersion: 1, instanceId: '00000000-0000-4000-8000-000000000001', engine: 'supabase-postgres',
    version: '17.12', architecture: 'arm64', hosted: false, networkIsolated: true, disposable: true,
    archiveSha256: '1'.repeat(64), restoreEvidenceSha256: '2'.repeat(64), fullArchiveLoad: 'PASS',
    playerTablePresent: true, authUsersTablePresent: true, ledgerRowCount: 468,
  },
  checks: Object.fromEntries(['migrationLedger','economicInvariants','authMapping','storageInventory',
    'edgeSource','adminSmoke','playerDesktopSmoke','playerMobileSmoke'].map(name => [name, 'PASS'])),
};
// Whitespace is intentional. Approval covers the exact preserved member bytes.
const receiptBytes = Buffer.from(JSON.stringify(receipt, null, 2) + '\n\n', 'utf8');
const scopeInputs = { source_sha: head, staging_project_ref: PROJECT, recovery_receipt_sha256: hash(receiptBytes) };
const event = inputs => ({ ref: 'refs/heads/main', repository: repo, sender: owner, inputs });

function localEntry(mode, { envelope, env = {}, repoResponse = repo, runResponse = run(41, publisher) }) {
  // The exact CLI runs with an offline GitHub stub. All other environment is
  // excluded. These local fixtures cannot dispatch a workflow or touch SQL.
  const dir = mkdtempSync(join(tmpdir(), 'staging-owner-contract-'));
  try {
    const eventPath = join(dir, 'event.json');
    const responses = join(dir, 'responses.json');
    const output = join(dir, 'staging-reviewed-recovery', 'recovery.json');
    writeFileSync(eventPath, JSON.stringify(envelope));
    writeFileSync(responses, JSON.stringify({ '': repoResponse, 'commits/main': { sha: head }, 'actions/runs/41': runResponse }));
    writeFileSync(join(dir, 'gh'), [
      '#!' + process.execPath,
      "const fs = require('node:fs');",
      "const [command, flag, host, endpoint] = process.argv.slice(2);",
      "const base = 'repos/" + STAGING_REPOSITORY + "';",
      "if (command !== 'api' || flag !== '--hostname' || host !== 'github.com' || !endpoint.startsWith(base)) process.exit(80);",
      "const key = endpoint === base ? '' : endpoint.slice(base.length + 1);",
      "const responses = JSON.parse(fs.readFileSync(process.env.CAPTURE_OWNER_FIXTURE_RESPONSES, 'utf8'));",
      "if (!Object.hasOwn(responses,key)) process.exit(81);",
      "process.stdout.write(JSON.stringify(responses[key]));",
    ].join('\n') + '\n', { mode: 0o700 });
    writeFileSync(join(dir, 'psql'), '#!/bin/sh\nexit 82\n', { mode: 0o700 });
    const args = mode === 'verify' ? [join(root, 'scripts/operations/staging-suffix-apply/manual.mjs'), 'verify'] : [transport, mode];
    const result = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8', timeout: 15_000,
      env: { ...dispatchEnv, ...env, PATH: [dir, dirname(process.execPath), '/usr/local/bin', '/usr/bin', '/bin'].join(':'),
        GITHUB_EVENT_PATH: eventPath, CAPTURE_OWNER_FIXTURE_RESPONSES: responses, RUNNER_TEMP: dir } });
    assert.ifError(result.error);
    return { ...result, receipt: existsSync(output) ? readFileSync(output) : undefined };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const publishEvent = () => event({ ...scopeInputs, record_authorized: 'true', recovery_receipt: receiptBytes.toString('utf8') });

test('published receipt CLI preserves the exact bytes approved by the numeric owner', () => {
  const recorded = localEntry('publish', { envelope: publishEvent() });
  assert.equal(recorded.status, 0, recorded.stderr);
  assert.equal(recorded.stdout.trim(), 'STAGING_RECOVERY_RECEIPT_VERIFIED');
  assert.deepEqual(recorded.receipt, receiptBytes);
});

test('the publisher refuses identity, attempt, ref, target, digest and recovery mismatches', async t => {
  const cases = [
    ['unknown sender with matching login', args => { args.envelope.sender = { ...owner, id: STAGING_OWNER_ID + 1 }; }],
    ['missing sender', args => { delete args.envelope.sender; }],
    ['missing or unknown runner actor', args => { args.env.GITHUB_ACTOR_ID = '1'; }],
    ['repository transfer observed by API', args => { args.repoResponse = { ...repo, owner: { ...owner, id: 1 } }; }],
    ['untrusted trigger actor', args => { args.runResponse.triggering_actor = { ...owner, type: 'Bot' }; }],
    ['missing trigger actor', args => { delete args.runResponse.triggering_actor; }],
    ['rerun in Actions context', args => { args.env.GITHUB_RUN_ATTEMPT = '2'; }],
    ['rerun in API metadata', args => { args.runResponse.run_attempt = 2; }],
    ['dispatched ref mismatch', args => { args.envelope.ref = 'refs/heads/review'; }],
    ['wrong source commit', args => { args.envelope.inputs.source_sha = 'f'.repeat(40); }],
    ['wrong staging target', args => { args.envelope.inputs.staging_project_ref = 'a'.repeat(20); }],
    ['wrong receipt digest', args => { args.envelope.inputs.recovery_receipt_sha256 = hash(Buffer.from('changed')); }],
    ...[
      ['receipt names a different approver', { approver: 'another-operator' }],
      ['receipt names a different project', { projectRef: 'a'.repeat(20) }],
      ['genuine restore checks still required', { checks: { ...receipt.checks, authMapping: 'NOT_RUN' } }],
    ].map(([name, change]) => [name, args => {
      const changed = JSON.stringify({ ...receipt, ...change });
      args.envelope.inputs.recovery_receipt = changed;
      args.envelope.inputs.recovery_receipt_sha256 = hash(Buffer.from(changed));
    }]),
  ];
  for (const [name, mutate] of cases) await t.test(name, () => {
    const args = { envelope: publishEvent(), env: {}, runResponse: run(41, publisher) };
    mutate(args);
    const result = localEntry('publish', args);
    assert.equal(result.status, 1);
    assert.equal(result.stderr.trim(), 'PROTECTED_STAGING_RECOVERY_REJECTED');
    assert.equal(result.receipt, undefined);
  });
});

function zipMember(name, bytes) {
  const result = spawnSync('python3', ['-c', [
    'import io, sys, zipfile',
    'out = io.BytesIO()',
    "with zipfile.ZipFile(out, 'w') as z: z.writestr(sys.argv[1], sys.stdin.buffer.read())",
    'sys.stdout.buffer.write(out.getvalue())',
  ].join('\n'), name], { input: bytes, timeout: 5000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0);
  return result.stdout;
}

function consumer(member = receiptBytes, catalogExit = 0) {
  const recoveryZip = zipMember('recovery.json', member);
  const rehearsalZip = zipMember('result.json', Buffer.from(JSON.stringify({
    sourceCommit: head, environment: 'staging', status: 'PASS', exitCode: 0,
    canonicalApplicationSchemaMatched: true, runtimeCatalogComparisonExit: catalogExit,
    sourceRowsCopied: false, rawSchemaDumpRetained: false, releaseCertificate: false,
    sourceSchemaSha256: '4'.repeat(64), sourceLedgerSha256: '5'.repeat(64),
    suffix: { remoteLedgerPresentCount: 1, appliedMigrationCount: 15, certifiedMigrationCount: 16 },
  })));
  const artifact = (id, name, runId, bytes) => ({
    id, name, expired: false, digest: hash(bytes), size_in_bytes: bytes.length,
    workflow_run: { id: runId, head_sha: head, head_branch: 'main',
      repository_id: STAGING_REPOSITORY_ID, head_repository_id: STAGING_REPOSITORY_ID },
  });
  const complete = { status: 'completed', conclusion: 'success', updated_at: iso(now - 60_000) };
  const responses = new Map([
    ['', repo], ['commits/main', { sha: head }], ['actions/runs/41', run(41, applier)],
    ['actions/runs/42', run(42, publisher, complete)],
    ['actions/runs/43', run(43, '.github/workflows/database-replay.yml', { ...complete, event: 'push' })],
    ['actions/runs/44', run(44, '.github/workflows/econovaria-staging-schema-rehearsal.yml', complete)],
    ['actions/artifacts/51', artifact(51, 'econovaria-staging-recovery-' + head, 42, recoveryZip)],
    ['actions/artifacts/52', artifact(52, 'econovaria-staging-rehearsal-diagnostic-' + head, 44, rehearsalZip)],
    ['actions/artifacts/51/zip', recoveryZip], ['actions/artifacts/52/zip', rehearsalZip],
  ]);
  return { mode: 'preflight', head, env: dispatchEnv, now,
    event: event({ ...scopeInputs, verify_authorized: 'true', apply_authorized: 'true',
      recovery_run: '42', recovery_artifact: '51', recovery_artifact_digest: hash(recoveryZip),
      replay_run: '43', rehearsal_run: '44', rehearsal_artifact: '52' }),
    controlDigest: '3'.repeat(64), qualification: {
      status: 'PASS', batchDigest, controlDigest: '3'.repeat(64), transactionSafetyReviewed: true, postconditionsReviewed: true,
      checks: Object.fromEntries(['rollback','resume','ledgerAtomicity','wrongTarget','failureInjection',
        'perMigrationPostconditions'].map(name => [name, 'PASS'])),
    },
    api(route, binary = false) {
      assert(responses.has(route), route);
      const response = responses.get(route);
      assert.equal(Buffer.isBuffer(response), binary);
      return response;
    },
    responses,
  };
}

test('owner-approved evidence preserves the independent transactional and live writer gates', () => {
  const request = consumer();
  const result = verifyProtectedEvidence(request);
  assert.deepEqual(result, { status: 'EVIDENCE_VERIFIED_APPLY_HELD', fenceVerified: false, applyAuthorized: false });
  assert.throws(() => requireAuthorizedOperation(result, head), /STAGING_LIVE_WRITER_AUTHORITY_NOT_ISSUED/);
  assert.throws(() => verifyProtectedEvidence(consumer(receiptBytes, 2)), assert.AssertionError);
  request.qualification.status = 'NOT_RUN';
  assert.throws(() => verifyProtectedEvidence(request), /qualification NOT_RUN/);
});

test('consumer rejects mismatched owner, replayed producer and changed receipt member bytes', () => {
  const changed = consumer(Buffer.concat([receiptBytes, Buffer.from('\n')]));
  assert.throws(() => verifyProtectedEvidence(changed), /STAGING_RECOVERY_EVIDENCE_REJECTED/);
  const wrongOwner = consumer();
  wrongOwner.responses.set('actions/runs/41', run(41, applier, { actor: { ...owner, id: 1 } }));
  assert.throws(() => verifyProtectedEvidence(wrongOwner), /Repository owner ID required/);
  const rerun = consumer();
  rerun.responses.get('actions/runs/42').run_attempt = 2;
  assert.throws(() => verifyProtectedEvidence(rerun), assert.AssertionError);
  const wrongArchive = consumer();
  wrongArchive.event.inputs.recovery_artifact_digest = hash(Buffer.from('different archive'));
  assert.throws(() => verifyProtectedEvidence(wrongArchive), assert.AssertionError);
});

test('the checked-in manual apply entry is held on real source qualification', () => {
  const result = localEntry('verify', { envelope: consumer().event });
  assert.equal(result.status, 1);
  assert.equal(result.stderr.trim(), 'STAGING_SUFFIX_QUALIFICATION_NOT_RUN');
  assert.equal(result.receipt, undefined);
});
