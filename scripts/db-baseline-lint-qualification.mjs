import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';

const authority = JSON.parse(readFileSync('docs/operations/evidence/db-baseline-lint-v1/qualification-authority.json', 'utf8'));
const workflow = readFileSync('.github/workflows/db-baseline-lint-qualification.yml', 'utf8');
function validateEvent(eventName, event, checkedOutSha, files) {
  const pr = event.pull_request;
  assert.equal(eventName, 'pull_request');
  assert.ok(authority.prNumber > 0, 'Unbound PR: qualification disabled until reviewed PR binding');
  assert.equal(pr.number, authority.prNumber);
  assert.equal(pr.draft, true);
  assert.equal(pr.head.repo.full_name, authority.repository);
  assert.equal(pr.base.repo.full_name, authority.repository);
  assert.equal(pr.head.ref, authority.head);
  assert.equal(pr.base.ref, 'main');
  assert.match(pr.head.sha, /^[a-f0-9]{40}$/);
  assert.equal(checkedOutSha, pr.head.sha);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(authority.allowedPaths.includes(file), `Outside bounded baseline lint scope: ${file}`);
}
function validateWorkflow(text) {
  for (const forbidden of [/workflow_dispatch/, /pull_request_target/, /secrets\s*[.[]/, /id-token:/, /contents:\s*write/, /supabase\s+(?:link|deploy|functions\s+deploy)/, /db\s+(?:push|pull)/, /DATABASE_URL:/, /continue-on-error/, /psql[^\n]*\|\|/]) {
    assert.ok(!forbidden.test(text), `Forbidden workflow content: ${forbidden}`);
  }
  for (const required of ['permissions:\n  contents: read', 'persist-credentials: false', 'ref: ${{ github.event.pull_request.head.sha }}', 'node scripts/db-baseline-lint-qualification.mjs --event', 'supabase db reset --workdir backend --local', 'backend/tests/sql/baseline_function_name_resolution_v1.sql', 'backend/tests/sql/baseline_temporary_context_lint_v1.sql', 'node scripts/multicurrency-funding-database.mjs', 'python3 scripts/tests/test_db_baseline_name_resolution.py', "psql -X 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1", 'Fail on any error across exact CLI-covered scope with runtime temporary context', 'node scripts/db-baseline-lint-qualification.mjs --database', 'supabase stop --workdir backend --no-backup']) assert.ok(text.includes(required), `Missing ${required}`);
  assert.equal((text.match(/supabase db reset --workdir backend --local/g) ?? []).length, 2);
  for (const use of text.matchAll(/uses:\s*([^\s]+)/g)) assert.match(use[1], /@[a-f0-9]{40}$/);
  for (const file of authority.allowedPaths) assert.ok(text.includes(`- "${file}"`), `Missing path trigger ${file}`);
}
validateWorkflow(workflow);
if (process.argv.includes('--event')) {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const files = execFileSync('git', ['diff', '--name-only', `${event.pull_request.base.sha}...${sha}`], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  validateEvent(process.env.GITHUB_EVENT_NAME, event, sha, files);
  console.log('Exact-head, same-repository, bounded draft PR verified.');
} else if (process.argv.includes('--database')) {
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).devDependencies.supabase, '2.109.1');
  const args = ['-X', 'postgresql://postgres:postgres@127.0.0.1:54322/postgres', '-v', 'ON_ERROR_STOP=1', '-v'];
  const run = (negative) => spawnSync('psql', [...args, `context_negative=${negative}`, '-f', 'backend/tests/sql/baseline_temporary_context_lint_v1.sql'], {encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  const broken = run('true');
  assert.equal(broken.error, undefined, 'psql must launch');
  assert.ok(Number.isInteger(broken.status) && broken.status !== 0, 'Unrelated broken function must make actual checker process fail');
  assert.match(broken.stdout, /baseline_context_lint_negative_control/);
  assert.match(broken.stdout, /42703/);
  assert.match(broken.stderr, /CONTEXT_LINT_ERROR_LEVEL_FINDINGS_REMAIN/);
  console.log('Injected unrelated invalid function made checker process fail; connection rollback removes fixture.');
  const clean = run('false');
  process.stdout.write(clean.stdout ?? '');
  process.stderr.write(clean.stderr ?? '');
  assert.equal(clean.error, undefined, 'psql must launch');
  assert.equal(clean.status, 0, 'Every error-level finding must fail the context-aware gate');
} else {
  assert.throws(() => validateWorkflow(workflow.replaceAll(' -v ON_ERROR_STOP=1', '')));
  assert.throws(() => validateWorkflow(workflow.replaceAll('backend/tests/sql/baseline_temporary_context_lint_v1.sql', 'omitted.sql')));
  const saved = authority.prNumber;
  authority.prNumber = 123;
  const sha = 'a'.repeat(40);
  const event = { pull_request: { number: 123, draft: true, head: { ref: authority.head, sha, repo: { full_name: authority.repository } }, base: { ref: 'main', repo: { full_name: authority.repository } } } };
  const files = [authority.allowedPaths[0]];
  validateEvent('pull_request', event, sha, files);
  for (const mutate of [e => e.pull_request.number++, e => e.pull_request.draft = false, e => e.pull_request.head.ref = 'main', e => e.pull_request.base.ref = 'release/production', e => e.pull_request.head.repo.full_name = 'other/repo', e => e.pull_request.base.repo.full_name = 'other/repo']) {
    const wrong = structuredClone(event); mutate(wrong);
    assert.throws(() => validateEvent('pull_request', wrong, sha, files));
  }
  assert.throws(() => validateEvent('workflow_dispatch', event, sha, files));
  assert.throws(() => validateEvent('pull_request', event, 'b'.repeat(40), files));
  assert.throws(() => validateEvent('pull_request', event, sha, ['.github/workflows/production.yml']));
  assert.throws(() => validateEvent('pull_request', event, sha, []));
  authority.prNumber = 0;
  assert.throws(() => validateEvent('pull_request', event, sha, files));
  authority.prNumber = saved;
  console.log('Baseline lint qualification workflow and 12 scope/identity cases passed; PostgreSQL not executed.');
}
