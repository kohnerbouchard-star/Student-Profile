// Protected GitHub evidence transport. No database environment or mutation step.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadBatch, PROJECT, sha256, validateReceipts } from '../staging-suffix-apply/control.mjs';
import { readEvidenceJson, requireRecoveryArtifactBinding, verifyRecoveryEvidence, verifyRecoveryPublication } from './verify.mjs';

const repository = 'kohnerbouchard-star/Student-Profile';
const productionProjectRef = 'cgiukdjwicykrmtkhudh';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const shaPattern = /^[a-f0-9]{40}$/;
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const archiveLimit = 64 * 1024;
const controlFiles = [
  '.github/workflows/econovaria-staging-recovery-evidence.yml',
  '.github/workflows/econovaria-staging-suffix-apply.yml',
  'scripts/operations/staging-recovery-evidence/verify.mjs',
  'scripts/operations/staging-recovery-evidence/protected-transport.mjs',
  'scripts/operations/staging-recovery-evidence/verify.test.mjs',
  'scripts/operations/staging-suffix-apply/control.mjs',
  'scripts/operations/live-migration-reconciliation/build-phase15-rehearsal-plan.mjs',
];

function numericId(raw) {
  assert(typeof raw === 'string' && /^[1-9][0-9]*$/.test(raw), 'Invalid GitHub ID');
  const id = Number(raw);
  assert(Number.isSafeInteger(id), 'Invalid GitHub ID');
  return id;
}

function dispatch({ mode, env, event, head }) {
  assert(['publish', 'preflight'].includes(mode));
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_EVENT_NAME, 'workflow_dispatch');
  assert.equal(env.GITHUB_REF, 'refs/heads/main');
  assert.equal(env.GITHUB_RUN_ATTEMPT, '1');
  const inputs = event.inputs;
  assert.equal(inputs[mode === 'publish' ? 'record_authorized' : 'verify_authorized'], 'true');
  assert.match(inputs.source_sha, shaPattern);
  assert.equal(inputs.source_sha, head);
  assert.equal(inputs.source_sha, env.GITHUB_SHA);
  return {
    inputs, source: inputs.source_sha, repositoryId: numericId(env.GITHUB_REPOSITORY_ID),
    runId: numericId(env.GITHUB_RUN_ID),
  };
}

function githubApi(route, binary = false) {
  // Suppress stderr and let the CLI print only a fixed failure label.
  const data = execFileSync('gh', ['api', '--hostname', 'github.com', `repos/${repository}/${route}`], {
    stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: binary ? archiveLimit : 1024 * 1024,
  });
  return binary ? data : JSON.parse(data.toString('utf8'));
}

function reviewHistory(api, runId, repositoryId) {
  return { runId, repositoryId, reviews: api(`actions/runs/${runId}/approvals`) };
}

function requireRepositoryRun(run, id, repositoryId) {
  assert.equal(run.id, id);
  assert.equal(run.repository?.id, repositoryId);
  assert.equal(run.head_repository?.id, repositoryId);
}

function readPinnedZip(api, artifact) {
  assert.match(artifact.digest, digestPattern);
  assert(Number.isSafeInteger(artifact.size_in_bytes) && artifact.size_in_bytes > 0 && artifact.size_in_bytes <= archiveLimit);
  const bytes = api(`actions/artifacts/${artifact.id}/zip`, true);
  assert(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= archiveLimit);
  assert.equal(`sha256:${sha256(bytes)}`, artifact.digest);
  return bytes;
}

export function verifyProtectedEvidence({ mode, env, event, head, api, qualification, controlDigest, now }) {
  const { inputs, source, repositoryId, runId } = dispatch({ mode, env, event, head });
  const currentMain = api('commits/main').sha;
  assert.equal(currentMain, source, 'Current-main identity drift');
  const scope = { source, currentMain, repositoryId, stagingProjectRef: PROJECT, productionProjectRef };
  const currentRun = api(`actions/runs/${runId}`);
  const currentReview = reviewHistory(api, runId, repositoryId);

  if (mode === 'publish') {
    assert(typeof inputs.recovery_receipt === 'string');
    return verifyRecoveryPublication({
      pins: { ...scope, producerRunId: runId }, run: currentRun, review: currentReview,
      bytes: Buffer.from(inputs.recovery_receipt, 'utf8'),
    }, now);
  }

  const pins = {
    ...scope, applyRunId: runId, producerRunId: numericId(inputs.recovery_run),
    artifactId: numericId(inputs.recovery_artifact), artifactDigest: inputs.recovery_artifact_digest,
  };
  const replayId = numericId(inputs.replay_run);
  const rehearsalId = numericId(inputs.rehearsal_run);
  const rehearsalArtifactId = numericId(inputs.rehearsal_artifact);
  const producer = api(`actions/runs/${pins.producerRunId}`);
  const recoveryArtifact = api(`actions/artifacts/${pins.artifactId}`);
  const recoverySource = { pins, producer, apply: currentRun, artifact: recoveryArtifact };
  requireRecoveryArtifactBinding(recoverySource);
  const recovery = verifyRecoveryEvidence({
    ...recoverySource, bytes: readPinnedZip(api, recoveryArtifact),
    producerReview: reviewHistory(api, pins.producerRunId, repositoryId), applyReview: currentReview,
  }, now);

  const replay = api(`actions/runs/${replayId}`);
  const rehearsal = api(`actions/runs/${rehearsalId}`);
  requireRepositoryRun(replay, replayId, repositoryId);
  requireRepositoryRun(rehearsal, rehearsalId, repositoryId);
  const artifact = api(`actions/artifacts/${rehearsalArtifactId}`);
  assert.equal(artifact.id, rehearsalArtifactId);
  assert.equal(artifact.expired, false);
  assert.equal(artifact.name, `econovaria-staging-rehearsal-diagnostic-${source}`);
  assert.equal(artifact.workflow_run?.id, rehearsalId);
  assert.equal(artifact.workflow_run?.repository_id, repositoryId);
  assert.equal(artifact.workflow_run?.head_repository_id, repositoryId);
  assert.equal(artifact.workflow_run?.head_sha, source);
  assert.equal(artifact.workflow_run?.head_branch, 'main');
  const archiveBytes = readPinnedZip(api, artifact);
  const summary = readEvidenceJson(archiveBytes, 'result.json');

  validateReceipts({
    source, currentMain, replay, rehearsal, artifact, result: { summary, archiveBytes }, recovery,
    qualification, controlDigest, approvals: currentReview.reviews, now,
  });

  // The reviewed all-caller fence and authoritative old-worker drain are a
  // separate prerequisite. A recovery receipt cannot certify either.
  return { status: 'EVIDENCE_VERIFIED_APPLY_HELD', fenceVerified: false, applyAuthorized: false };
}

async function main() {
  const mode = process.argv[2];
  const env = process.env;
  const eventBytes = await readFile(env.GITHUB_EVENT_PATH);
  assert(eventBytes.length <= 128 * 1024);
  const event = JSON.parse(eventBytes.toString('utf8'));
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const request = { mode, env, event, head, api: githubApi };
  // Block wrong event, branch or attempt before assembly or GitHub requests.
  dispatch(request);
  if (mode === 'preflight') {
    const qualification = await readFile(join(root, 'docs/operations/evidence/staging-suffix-apply-v1/qualification.json'));
    request.qualification = JSON.parse(qualification.toString('utf8'));
    const files = await Promise.all(controlFiles.map(file => readFile(join(root, file))));
    request.controlDigest = sha256(Buffer.concat(files));
    await loadBatch(root);
  }

  const result = verifyProtectedEvidence(request);
  if (mode === 'publish') {
    assert(env.RUNNER_TEMP);
    const directory = join(env.RUNNER_TEMP, 'staging-reviewed-recovery');
    await mkdir(directory, { mode: 0o700 });
    await writeFile(join(directory, 'recovery.json'), JSON.stringify(result) + '\n', {
      mode: 0o600, flag: 'wx',
    });
    console.log('STAGING_RECOVERY_RECEIPT_VERIFIED');
    return;
  }
  console.log(JSON.stringify(result));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await main();
  } catch {
    // Supplied JSON, API fields and diagnostic stderr may contain private values.
    console.error('PROTECTED_STAGING_RECOVERY_REJECTED');
    process.exitCode = 1;
  }
}
