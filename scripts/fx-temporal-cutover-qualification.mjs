import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const authority = JSON.parse(readFileSync('docs/operations/evidence/fx-temporal-cutover/qualification-authority.json', 'utf8'));
const workflow = readFileSync('.github/workflows/fx-temporal-cutover-qualification.yml', 'utf8');
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
  for (const file of files) assert.ok(authority.allowedPaths.includes(file), `Outside bounded FX scope: ${file}`);
}
function validateWorkflow(text) {
  for (const forbidden of [/workflow_dispatch/, /pull_request_target/, /secrets\s*[.[]/, /id-token:/, /contents:\s*write/, /supabase\s+(?:link|deploy|functions\s+deploy)/, /db\s+(?:push|pull)/, /DATABASE_URL:/]) {
    assert.ok(!forbidden.test(text), `Forbidden workflow content: ${forbidden}`);
  }
  for (const required of ['permissions:\n  contents: read', 'persist-credentials: false', 'ref: ${{ github.event.pull_request.head.sha }}', 'node scripts/fx-temporal-cutover-qualification.mjs --event', 'supabase db reset --workdir backend --local', 'node scripts/canonical-fx-authority-database.mjs --real-clock-story-proof', 'timeout-minutes: 100', 'node scripts/fx-temporal-cutover-concurrency.mjs', 'node --test scripts/fx-temporal-cutover-concurrency.test.mjs', 'supabase db lint --workdir backend --local --level warning --fail-on error', 'supabase stop --workdir backend --no-backup']) assert.ok(text.includes(required), `Missing ${required}`);
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
} else {
  assert.throws(() => validateWorkflow(workflow.replace(' --fail-on error', '')));
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
  console.log('FX qualification workflow and 12 scope/identity cases passed; PostgreSQL not executed.');
}
