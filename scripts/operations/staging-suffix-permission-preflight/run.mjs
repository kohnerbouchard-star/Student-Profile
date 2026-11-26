import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateDatabaseUrlProjectRef } from '../../release-integrity/database-binding.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const repository = 'kohnerbouchard-star/Student-Profile';
const repositoryId = 1264495890;
const ownerId = 287640607;
const stagingEnvironmentId = 18428073637;
const workflowPath = '.github/workflows/econovaria-staging-suffix-permission-preflight.yml';
const ref = 'refs/heads/chore/staging-suffix-permission-preflight-20261126';
const parent = '3b4d70093b15d178ecb343d964b0f441de4fe042';
const project = 'eecvbssdvarfcykcfrny';
const allowedChanges = [
  workflowPath,
  'docs/roadmaps/econovaria-beta-completion-roadmap-v1.md',
  'scripts/operations/staging-suffix-permission-preflight/catalog.sql',
  'scripts/operations/staging-suffix-permission-preflight/run.mjs',
  'vercel.json',
];
const certificate = root + 'scripts/operations/live-migration-reconciliation/supabase-prod-ca-2021.crt';
const sha256 = value => createHash('sha256').update(value).digest('hex');

function verifyEvent(env) {
  assert.equal(env.GITHUB_ACTIONS, 'true');
  assert.equal(env.GITHUB_WORKFLOW, 'Staging Suffix Permission Preflight');
  assert.equal(env.GITHUB_EVENT_NAME, 'push');
  assert.equal(env.GITHUB_REPOSITORY, repository);
  assert.equal(env.GITHUB_REPOSITORY_ID, String(repositoryId));
  assert.equal(env.GITHUB_ACTOR_ID, String(ownerId));
  assert.equal(env.GITHUB_REF, ref);
  assert.equal(env.GITHUB_RUN_ATTEMPT, '1');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  assert.equal(event.repository.private, false);
  assert.equal(event.repository.id, repositoryId);
  assert.equal(event.repository.full_name, repository);
  assert.equal(event.repository.owner.id, ownerId);
  assert.equal(event.sender.id, ownerId);
  assert.equal(event.sender.type, 'User');
  assert.equal(event.ref, ref);
  assert.equal(event.created, true);
  assert.equal(event.forced, false);
  assert.equal(event.deleted, false);
  assert.equal(event.before, '0'.repeat(40));
  const git = (...args) => execFileSync('/usr/bin/git', args, { cwd: root, env: { PATH: '/usr/bin:/bin' },
    encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const head = git('rev-parse', 'HEAD');
  assert.match(head, /^[a-f0-9]{40}$/);
  assert.equal(head, env.GITHUB_SHA);
  assert.equal(head, event.after);
  assert.equal(head, event.head_commit.id);
  assert.equal(git('show', '-s', '--format=%P', head), parent);
  assert.deepEqual(git('diff', '--name-only', parent, head).split('\n').sort(), allowedChanges);
  assert.equal(git('status', '--porcelain', '--untracked-files=all'), '');
  return head;
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.keys(value).sort().map(key => [key, sortKeys(value[key])]));
  return value;
}

export function approvalComment({ head, workflowSha256, runId, environment, branch, rules, branchPolicies }) {
  assert.match(head, /^[a-f0-9]{40}$/);
  assert.match(workflowSha256, /^[a-f0-9]{64}$/);
  assert.match(runId, /^[1-9][0-9]*$/);
  assert.equal(environment.id, stagingEnvironmentId);
  assert.equal(environment.name, 'staging');
  const policy = environment.deployment_branch_policy;
  assert.equal(policy?.protected_branches, false);
  assert.equal(policy.custom_branch_policies, true);
  const branchName = ref.slice('refs/heads/'.length);
  assert.equal(branch.name, branchName);
  assert.equal(branchPolicies?.total_count, 2);
  const entries = branchPolicies.branch_policies;
  assert(Array.isArray(entries) && entries.length === 2);
  assert(entries.every(entry => entry?.type === 'branch' && Number.isSafeInteger(entry.id) && entry.id > 0));
  assert.equal(new Set(entries.map(entry => entry.id)).size, 2);
  const allowedBranches = [branchName, 'main'];
  assert.deepEqual(entries.map(entry => entry.name).sort(), allowedBranches);
  const selectedBranches = allowedBranches.map(name => {
    const { id, type } = entries.find(entry => entry.name === name);
    return { id, name, type };
  });
  assert.equal(branch.commit?.sha, head);
  assert.equal(branch.protected, true);
  assert(Array.isArray(rules));
  const reviewers = environment.protection_rules.filter(rule => rule.type === 'required_reviewers');
  assert.equal(reviewers.length, 1);
  assert.equal(reviewers[0].prevent_self_review, false);
  assert(reviewers[0].reviewers.some(row => row.type === 'User' && row.reviewer?.id === ownerId));
  const policySha256 = sha256(JSON.stringify(sortKeys({
    environmentId: environment.id, branchName: branch.name, protected: branch.protected,
    branchProtection: branch.protection, activeRules: rules, policy, selectedBranches,
    adminBypass: environment.can_admins_bypass,
    environmentRules: environment.protection_rules.map(rule => ({
      id: rule.id, type: rule.type, wait: rule.wait_timer, preventSelfReview: rule.prevent_self_review,
      reviewers: rule.reviewers?.map(row => [row.type, row.reviewer?.id]),
    })),
  })));
  // The owner records this exact line only after the independent operator reviews these facts.
  return [ 'econovaria-staging-preflight-root-reviewed-v1', runId, head, workflowSha256, policySha256 ].join(' ');
}

async function requireOwnerReview(head, env) {
  const runId = env.GITHUB_RUN_ID;
  assert.match(runId, /^[1-9][0-9]*$/);
  assert(env.GH_TOKEN);
  assert(!env.STAGING_DATABASE_URL);
  const branchPath = encodeURIComponent(ref.slice('refs/heads/'.length));
  const policiesPath = 'environments/staging/deployment-branch-policies?per_page=100&page=1';
  const api = async path => {
    const headers = { Authorization: 'Bearer ' + env.GH_TOKEN, Accept: 'application/vnd.github+json' };
    if (path === policiesPath) headers['X-GitHub-Api-Version'] = '2026-03-10';
    const response = await fetch('https://api.github.com/repos/' + repository + '/' + path, {
      redirect: 'error', signal: AbortSignal.timeout(8000), headers,
    });
    assert.equal(response.status, 200);
    if (path === policiesPath) assert.equal(response.headers.get('link'), null);
    return response.json();
  };
  const [environment, branch, rules, reviews, branchPolicies] = await Promise.all([
    api('environments/staging'), api('branches/' + branchPath), api('rules/branches/' + branchPath),
    api('actions/runs/' + runId + '/approvals'), api(policiesPath),
  ]);
  const comment = approvalComment({
    head, workflowSha256: sha256(readFileSync(root + workflowPath)), runId, environment, branch, rules, branchPolicies,
  });
  assert(Array.isArray(reviews));
  const staging = reviews.filter(review => review.environments?.some(value =>
    value.id === stagingEnvironmentId && value.name === 'staging'));
  assert.equal(staging.length, 1);
  const [review] = staging;
  assert.equal(review.state, 'approved');
  assert.equal(review.user?.id, ownerId);
  assert.equal(review.user?.type, 'User');
  assert.equal(review.comment, comment);
}

function connection(raw) {
  assert(typeof raw === 'string' && raw.length <= 8192 && !/[\x00-\x20\x7f\\#]/.test(raw));
  assert.match(raw, /^postgres(?:ql)?:\/\//);
  const parsed = new URL(raw);
  assert(!raw.includes('?') || raw.endsWith('?sslmode=verify-full') && parsed.search === '?sslmode=verify-full');
  assert.equal(parsed.pathname, '/postgres');
  assert(parsed.port === '' || parsed.port === '5432');
  const spec = validateDatabaseUrlProjectRef({ databaseUrl: raw, expectedProjectRef: project });
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  assert(password && !/[\x00-\x1f\x7f]/.test(password));
  if (spec.connectionType === 'direct') {
    assert.equal(parsed.hostname, 'db.' + project + '.supabase.co');
    assert.equal(user, 'postgres');
  } else {
    // The verified staging project is in ap-northeast-2. Use port 5432 only.
    assert.match(parsed.hostname, /^aws-[01]-ap-northeast-2\.pooler\.supabase\.com$/);
    assert.equal(user, 'postgres.' + project);
  }
  assert.equal(sha256(readFileSync(certificate)), '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7');
  return {
    PATH: process.env.PATH, PGHOST: parsed.hostname, PGPORT: '5432', PGDATABASE: 'postgres', PGUSER: user,
    PGPASSWORD: password, PGSSLROOTCERT: certificate, PGSSLMODE: 'verify-full', PGGSSENCMODE: 'disable',
    PGCONNECT_TIMEOUT: '10', PGPASSFILE: '/dev/null', PGSERVICEFILE: '/dev/null',
    PGAPPNAME: 'econovaria-staging-permission-preflight',
  };
}

const keys = [
  'transactionReadOnly', 'primary', 'postgresDatabase', 'postgresSessionLogin', 'sessionCanLogin', 'sessionSuperuser',
  'defaultReadOnly', 'readOnlySourceDefault', 'readOnlySourceServer', 'readOnlySourceDatabase', 'readOnlySourceRole',
  'readOnlySourceDatabaseRole', 'readOnlySourceClient', 'readOnlySourceOther',
  'canCreateRecoverySchema', 'canCreateTemporaryProbe', 'canCreateInBatchSchemas', 'ownsExistingRecoverySchema',
  'ownsAlteredTables', 'ownsExistingReplacementRoutines', 'ownsRequiredRewriteTargets', 'canReadPreconditionTables',
  'canLockCampaignFenceRow', 'canUseLedgerSchema', 'canReadLedger', 'canInsertLedger', 'canExclusivelyLockLedger', 'hasDrainObserverPrivilege',
  'canExecuteInstalledHoldRoutines',
];

async function main() {
  let sourceAuthorized = false;
  let reviewAuthorized = false;
  let targetBound = false;
  try {
    const mode = process.argv[2];
    assert(['verify-review', 'catalog'].includes(mode));
    const head = verifyEvent(process.env);
    sourceAuthorized = true;
    if (mode === 'verify-review') {
      await requireOwnerReview(head, process.env);
      reviewAuthorized = true;
      appendFileSync(process.env.GITHUB_OUTPUT, 'approved_head=' + head + '\n');
      console.log(JSON.stringify({ sourceAuthorized, reviewAuthorized }));
      return;
    }
    assert.equal(process.env.PREFLIGHT_REVIEWED_HEAD, head);
    assert(!process.env.GH_TOKEN);
    reviewAuthorized = true;
    const env = connection(process.env.STAGING_DATABASE_URL);
    targetBound = true;
    const sql = readFileSync(new URL('./catalog.sql', import.meta.url), 'utf8');
    const output = execFileSync('psql', ['-X', '-w', '-qAt', '-v', 'ON_ERROR_STOP=1', '-f', '-'], {
      env, input: sql, encoding: 'utf8', timeout: 20000, maxBuffer: 16384, stdio: ['pipe', 'pipe', 'pipe'],
    });
    const facts = JSON.parse(output);
    assert.equal(Object.keys(facts).length, keys.length);
    assert(keys.every(key => typeof facts[key] === 'boolean'));
    assert.equal(facts.transactionReadOnly, true);
    console.log(JSON.stringify({ sourceAuthorized, reviewAuthorized, targetBound, catalogRead: true,
      ...Object.fromEntries(keys.map(key => [key, facts[key]])) }));
  } catch {
    console.error(JSON.stringify({ sourceAuthorized, reviewAuthorized, targetBound, catalogRead: false }));
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
