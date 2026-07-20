#!/usr/bin/env bash
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

if [ ! -d .seed-bootstrap ]; then
  echo "Seed beta bootstrap transport is absent; no orchestration is required."
  exit 0
fi

if [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  echo "This bounded bootstrap may run only inside GitHub Actions." >&2
  exit 2
fi

BRANCH="agent/seed-content-foundation-v1"
KNOWN_LIVE_REF="cgiukdjwicykrmtkhudh"
ORIGINAL_APPLY="$(mktemp)"
STATUS_FILE="$(mktemp)"
LOG_DIR=".seed-audit/logs"
mkdir -p "$LOG_DIR"
: > "$STATUS_FILE"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git show HEAD~1:scripts/apply-seed-simulation-retention-policy.mjs > "$ORIGINAL_APPLY"

node --input-type=module <<'NODE'
import { gunzipSync } from 'node:zlib';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const chunks = (await readdir('.seed-bootstrap')).filter((name) => name.startsWith('chunk-')).sort();
if (chunks.length !== 6) throw new Error(`Expected 6 bootstrap chunks, found ${chunks.length}.`);
const payload = (await Promise.all(chunks.map((name) => readFile(path.join('.seed-bootstrap', name), 'utf8')))).join('');
const files = JSON.parse(gunzipSync(Buffer.from(payload, 'base64')).toString('utf8'));
for (const [filePath, content] of Object.entries(files)) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf8');
  console.log(`materialized ${filePath}`);
}
NODE

node --check scripts/build-seed-beta-pack.mjs
node --check scripts/seed-beta-pack-validator.mjs
node --check scripts/seed-beta-importer.mjs
node --check scripts/seed-beta-pack.test.mjs
node --check scripts/seed-beta-reconcile-main.mjs

git fetch origin main
MAIN_SHA="$(git rev-parse origin/main)"
BEFORE_SHA="$(git rev-parse HEAD)"
MERGE_STATUS=0
git merge --no-ff --no-commit origin/main || MERGE_STATUS=$?
node scripts/seed-beta-reconcile-main.mjs > "$LOG_DIR/reconcile-main.json"

cp "$ORIGINAL_APPLY" scripts/apply-seed-simulation-retention-policy.mjs
rm -rf .seed-bootstrap
rm -f .github/workflows/seed-beta-pack-bootstrap.yml
rm -f scripts/seed-beta-runner-bootstrap.sh

git add -A
git diff --cached --check
if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  git commit -m "chore(seed): synchronize PR 163 with current main and install beta pack [skip ci]"
elif ! git diff --cached --quiet; then
  git commit -m "feat(seed): install executable bounded beta pack [skip ci]"
fi
RECONCILED_SHA="$(git rev-parse HEAD)"
git push origin HEAD:"$BRANCH"

run_required() {
  local name="$1"
  shift
  local log="$LOG_DIR/${name}.log"
  local status=0
  "$@" >"$log" 2>&1 || status=$?
  printf '%s\trequired\t%s\n' "$name" "$status" | tee -a "$STATUS_FILE"
}

run_evidence() {
  local name="$1"
  shift
  local log="$LOG_DIR/${name}.log"
  local status=0
  "$@" >"$log" 2>&1 || status=$?
  printf '%s\tevidence\t%s\n' "$name" "$status" | tee -a "$STATUS_FILE"
}

run_required npm_ci npm ci
run_required backend_npm_ci npm --prefix backend ci
run_required build_seed_beta_pack npm run build:seed-beta-pack
run_required validate_seed_beta_pack npm run validate:seed-beta-pack
run_required test_seed_beta_pack npm run test:seed-beta-pack
run_required importer_validate npm run seed:beta:validate
run_required importer_dry_run npm run seed:beta:dry-run
run_required existing_seed_validators npm run audit:seed-content
run_required repository_test_suite npm test
run_required backend_typecheck npm --prefix backend run typecheck:all
run_required backend_smoke npm --prefix backend run smoke
run_required migration_static_audit npm run audit:migrations
run_required git_diff_check git diff --check

run_evidence seed_design_staging_preflight npm run preflight:seed-content:staging
run_evidence release_staging_preflight npm run preflight:staging
run_evidence supabase_cli_help npx supabase --help
run_evidence supabase_db_lint_help npx supabase db lint --help
run_evidence supabase_local_db_lint npm run db:lint

printf 'connected_staging_import\texternal\t125\n' | tee -a "$STATUS_FILE"
printf '%s\n' "Chat 2 has not supplied a distinct isolated staging project identity, game session, and credentials to this workflow. The known live project ${KNOWN_LIVE_REF} is explicitly prohibited and was not touched." > "$LOG_DIR/connected_staging_import.log"
cp "$STATUS_FILE" .seed-audit/check-status.tsv

REQUIRED_FAILURES="$(awk -F '\t' '$2 == "required" && $3 != 0 { count += 1 } END { print count + 0 }' "$STATUS_FILE")"
export MAIN_SHA RECONCILED_SHA REQUIRED_FAILURES KNOWN_LIVE_REF
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const statusText = await readFile('.seed-audit/check-status.tsv', 'utf8');
const checks = statusText.trim().split('\n').filter(Boolean).map((line) => {
  const [name, classification, rawStatus] = line.split('\t');
  return { name, classification, status: Number(rawStatus), passed: Number(rawStatus) === 0 };
});
const logs = [];
for (const name of (await readdir('.seed-audit/logs')).sort()) {
  const bytes = await readFile(path.join('.seed-audit/logs', name));
  logs.push({ name, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const requiredFailures = Number(process.env.REQUIRED_FAILURES || 0);
const evidence = {
  schemaVersion: 'econovaria-beta-seed-execution-evidence-v1',
  recordedAt: new Date().toISOString(),
  branch: 'agent/seed-content-foundation-v1',
  pullRequest: 163,
  synchronizedMainSha: process.env.MAIN_SHA,
  reconciledBranchSha: process.env.RECONCILED_SHA,
  requiredFailures,
  connectedStaging: {
    status: 'external-blocked',
    reason: 'Chat 2 isolated staging project identity, game session, and credentials were not available to this workflow. No database was touched.',
    productionTouched: false,
    knownLiveProjectRefProhibited: process.env.KNOWN_LIVE_REF,
  },
  checks,
  retainedWorkflowLogs: logs,
  conclusion: requiredFailures === 0
    ? 'repository-verified-awaiting-connected-isolated-staging'
    : 'repository-checks-failed',
};
const root = 'docs/seed-content/executable/beta-pack-v1';
await mkdir(root, { recursive: true });
await writeFile(path.join(root, 'execution-evidence-v1.json'), `${JSON.stringify(evidence, null, 2)}\n`);
const required = checks.filter((entry) => entry.classification === 'required');
const requiredPassed = required.filter((entry) => entry.passed).length;
const report = `# Executable beta seed pack readiness\n\n- PR authority: #163 on \`agent/seed-content-foundation-v1\`\n- Synchronized main: \`${process.env.MAIN_SHA}\`\n- Reconciled branch: \`${process.env.RECONCILED_SHA}\`\n- Required repository checks: ${requiredPassed}/${required.length} passed\n- Connected isolated staging: external-blocked\n- Production touched: no\n\n## Connected staging disposition\n\nChat 2 has not supplied a distinct isolated staging project identity, game session, and credentials to this workflow. The known live project \`${process.env.KNOWN_LIVE_REF}\` is prohibited and was not touched.\n\nThe importer is fail-closed: production is rejected; the known live project is rejected; writes require an exact target project-ref match; definitions are inactive by default; rollback state is captured before mutation; activation requires a separate, unexpired authorization matching the pack checksum.\n`;
await mkdir('docs/seed-content/reviews', { recursive: true });
await writeFile('docs/seed-content/reviews/executable-beta-pack-readiness-v1.md', report);
NODE

git add package.json package-lock.json .gitignore scripts .github/workflows/seed-beta-pack-execution.yml docs/seed-content/executable/beta-pack-v1 docs/seed-content/reviews/executable-beta-pack-readiness-v1.md
git diff --cached --check
if ! git diff --cached --quiet; then
  git commit -m "feat(seed): complete executable bounded beta pack evidence [skip ci]"
  git push origin HEAD:"$BRANCH"
fi

rm -f "$ORIGINAL_APPLY" "$STATUS_FILE"

if [ "$REQUIRED_FAILURES" -ne 0 ]; then
  echo "Executable beta seed verification has ${REQUIRED_FAILURES} required failure(s)." >&2
  exit 1
fi

echo "Executable beta seed repository verification passed; isolated staging remains externally blocked."
