// Owner-reviewed one-shot Campaign-only staging authority.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { approvalComment } from '../staging-suffix-permission-preflight/run.mjs';
import { stageRef } from './packet.mjs';

export const workflow = '.github/workflows/staging-campaign-hold-write.yml';
export const operationPath = 'scripts/operations/staging-campaign-hold-admission/operation.json';
export const parent = 'a4f4bdb236ecc87c777fb8af236f62f737810f48';
export const repo = 'kohnerbouchard-star/Student-Profile';
export const repoId = 1264495890;
export const owner = 287640607;
export const stagingId = 18428073637;
export const branch = 'chore/staging-suffix-permission-preflight-20261126';
export const ref = 'refs/heads/' + branch;
export const baseline = 'abe640a61ab112cafeeae89dd93c27e93796b7122680b94c1661ef092c7bc312';
export const inverseBlob = '7f46cdd2b27b101c01b383df208ed6ac2086070c';
const priorWorkerDigest = 'b8f4f71163fbf5d313ef1d103c3cc529ab780c6576597e27644d9b5c77646fea';
export const functionId = 'c43e768c-3f46-415d-a99d-816fe876d1dc';
export const runtimeExpectation = Object.freeze({
  slug:'campaign-orchestrator',version:10,deploymentId:stageRef + '_' + functionId + '_10',
  sourceSha256:priorWorkerDigest,verifyJwt:false,importMap:false,verification:'supabase-management-get-v1',
  configSha256:'fcd6598422a7cb6e649ce25df68589b3df74cbd960a4ba30d8a6935a5c6f73a5',
  preservedPackageSha256:'891f341eac79cec5aab2ff4300911cbf8d1f600f53898955bb044f2201304c41',
});
const exactInverseRun = '45768104640';
const inverseJob = 139733840434;
const inverseHead = '2e91c85a5e8b44f0643387724ab7122d43b9213c';
const folder = 'scripts/operations/staging-campaign-hold-admission/';
export const initialPaths = [
  workflow, 'docs/roadmaps/econovaria-beta-completion-roadmap-v1.md',
  ...['abort-before-suffix.sql','authority.mjs','install.sql','operation.json','packet.mjs','run.mjs'].map(name => folder + name),
];
export const sha = value => createHash('sha256').update(value).digest('hex');
const headPattern = /^[a-f0-9]{40}$/;
const runPattern = /^[1-9][0-9]*$/;
function digest(value) {
  assert.equal(typeof value, 'string');
  assert.match(value, /^(?!([a-f0-9])\1{63}$)[a-f0-9]{64}$/);
}
function keys(value, expected) {
  assert(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), expected.split(' ').sort());
}
function time(value) {
  assert.equal(typeof value, 'string');
  const parsed = Date.parse(value);
  assert.equal(new Date(parsed).toISOString(), value);
  return parsed;
}

export function validateOperation(op, now = Date.now(), historical = false) {
  assert(['install','abort'].includes(op.type));
  keys(op, 'schemaVersion type projectRef scope ledgerSha256 recovery runtime maintenance inverse' +
    (op.type === 'abort' ? ' installHead installRunId heldEpochSha256' : ''));
  assert.equal(op.schemaVersion,1);
  assert.equal(op.projectRef,stageRef);
  assert.equal(op.scope,'campaign-only-pre-suffix');
  assert.equal(op.ledgerSha256,baseline);

  const { maintenance, recovery, runtime, inverse } = op;
  keys(maintenance,'startsAt endsAt approvalEvidenceSha256');
  const start = time(maintenance.startsAt), end = time(maintenance.endsAt);
  assert(start < end);
  if (!historical) assert(start <= now && now < end);
  digest(maintenance.approvalEvidenceSha256);

  keys(recovery,'projectRef archiveSha256 receiptSha256 restoreTargetKind completedAt restoredLedgerSha256 fullArchiveLoad isolated outOfHostedProduction');
  assert.equal(recovery.projectRef,stageRef);
  assert(['isolated-native-supabase-postgres','isolated-supabase-project'].includes(recovery.restoreTargetKind));
  for (const fact of ['fullArchiveLoad','isolated','outOfHostedProduction']) assert.equal(recovery[fact],true);
  assert.equal(recovery.restoredLedgerSha256,baseline);
  assert(time(recovery.completedAt) <= (historical ? end : now));
  assert.equal(recovery.archiveSha256,'88ce1d3d9fbd2b1d0bb7e39de0ea6e624e80f82dc93e188ca3963d3c7cce829e');
  assert.equal(recovery.receiptSha256,'20beca25f483a5f6cc3537169b067df1a4913b9da2475d1fe4897fc1236c06d0');
  assert.equal(recovery.completedAt,'2026-11-27T00:18:10.000Z');
  assert.equal(recovery.restoreTargetKind,'isolated-native-supabase-postgres');

  assert.deepEqual(runtime,runtimeExpectation);

  keys(inverse,'blob testedRunId');
  assert.equal(inverse.blob,inverseBlob);
  assert.equal(inverse.testedRunId,exactInverseRun);
  if (op.type === 'abort') {
    assert.match(op.installHead,headPattern);
    assert.match(op.installRunId,runPattern);
    digest(op.heldEpochSha256);
  }
}

export function validateAppend(op, event, git, head) {
  assert.equal(git('show','-s','--format=%P',head),event.before);
  const changes = (base, tip) => git('diff','--name-only',base,tip).split('\n').sort();
  if (op.type === 'install') {
    assert.equal(event.before,parent);
    assert.deepEqual(changes(parent,head),initialPaths);
    return;
  }
  assert.equal(event.before,op.installHead);
  assert.equal(git('show','-s','--format=%P',op.installHead),parent);
  assert.deepEqual(changes(parent,op.installHead),initialPaths);
  assert.deepEqual(changes(op.installHead,head),[operationPath]);
  const original = JSON.parse(git('show',op.installHead + ':' + operationPath));
  assert.equal(original.type,'install');
  validateOperation(original,Date.now(),true);
  assert.deepEqual(original.recovery,op.recovery);
  for (const field of ['deploymentId','version','sourceSha256','configSha256','preservedPackageSha256']) {
    assert.equal(original.runtime[field],op.runtime[field]);
  }
}

export function campaignWriteComment({ op, operationSha256, ...facts }) {
  const base = approvalComment(facts).replace('econovaria-staging-preflight-root-reviewed-v1',
    'econovaria-staging-campaign-write-owner-reviewed-v2');
  return [base,stageRef,op.type,operationSha256,op.recovery.receiptSha256,op.maintenance.approvalEvidenceSha256,
    op.runtime.verification].join(' ');
}

export async function verifyReview({ op, bytes, head, env, root }) {
  const runId = env.GITHUB_RUN_ID;
  assert.match(runId,runPattern);
  assert(env.GH_TOKEN && !env.STAGING_DATABASE_URL);
  const branchPath = encodeURIComponent(branch);
  const selected = 'environments/staging/deployment-branch-policies?per_page=100&page=1';
  const get = async path => {
    const headers = { Authorization:'Bearer ' + env.GH_TOKEN, Accept:'application/vnd.github+json' };
    if (path === selected) headers['X-GitHub-Api-Version'] = '2026-03-10';
    const response = await fetch('https://api.github.com/repos/' + repo + '/' + path,
      { headers, redirect:'error', signal:AbortSignal.timeout(8000) });
    assert.equal(response.status,200);
    if (path === selected) assert.equal(response.headers.get('link'),null);
    return response.json();
  };
  const [environment, liveBranch, rules, branchPolicies, reviews, qualification, job, prior] = await Promise.all([
    get('environments/staging'),get('branches/' + branchPath),get('rules/branches/' + branchPath),
    get(selected),get('actions/runs/' + runId + '/approvals'),
    get('actions/runs/' + exactInverseRun),get('actions/jobs/' + inverseJob),
    op.type === 'abort' ? get('actions/runs/' + op.installRunId) : null,
  ]);
  assert.equal(qualification.id,Number(exactInverseRun));
  assert.equal(qualification.head_sha,inverseHead);
  assert.equal(qualification.repository?.id,repoId);
  assert.equal(qualification.status,'completed');
  assert.equal(qualification.conclusion,'success');
  assert.equal(job.id,inverseJob);
  assert.equal(job.run_id,Number(exactInverseRun));
  assert.equal(job.head_sha,inverseHead);
  assert.equal(job.status,'completed');
  assert.equal(job.conclusion,'success');
  assert(job.steps?.some(step => step.name === 'Test the fenced Campaign worker with isolated disposable PostgREST' &&
    step.conclusion === 'success'));
  if (prior) {
    assert.equal(prior.id,Number(op.installRunId));
    assert.equal(prior.head_sha,op.installHead);
    assert.equal(prior.head_branch,branch);
    assert.equal(prior.repository?.id,repoId);
    assert.equal(prior.path,workflow);
    assert.equal(prior.actor?.id,owner);
    assert.equal(prior.event,'push');
    assert.equal(prior.run_attempt,1);
    assert.equal(prior.status,'completed');
    assert(['success','failure','cancelled','timed_out'].includes(prior.conclusion));
  }
  const comment = campaignWriteComment({ op, operationSha256:sha(bytes), head, runId, environment,
    branch:liveBranch, rules, branchPolicies, workflowSha256:sha(readFileSync(root + workflow)) });
  const staging = reviews.filter(review => review.environments?.some(e => e.id === stagingId && e.name === 'staging'));
  assert.equal(staging.length,1);
  const [review] = staging;
  assert.equal(review.state,'approved');
  assert.equal(review.user?.id,owner);
  assert.equal(review.user?.type,'User');
  assert.equal(review.comment,comment);
}
