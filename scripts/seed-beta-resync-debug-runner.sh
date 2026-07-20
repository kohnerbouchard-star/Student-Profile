#!/usr/bin/env bash
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"
BRANCH="agent/seed-content-foundation-v1"
KNOWN_LIVE_REF="cgiukdjwicykrmtkhudh"
ORIGINAL_APPLY="$(mktemp)"
STATUS_FILE="$(mktemp)"
LOG_DIR="docs/seed-content/reviews/executable-beta-pack-run-logs"
mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log "$LOG_DIR"/check-status.tsv
: > "$STATUS_FILE"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git show HEAD^:scripts/apply-seed-simulation-retention-policy.mjs > "$ORIGINAL_APPLY"
cp package.json /tmp/seed-resync-package.json

git fetch origin main
MAIN_SHA="$(git rev-parse origin/main)"
git merge --no-ff --no-commit origin/main || true

while IFS= read -r -d '' file_path; do
  side="--theirs"
  case "$file_path" in
    docs/seed-content/*|.github/workflows/seed-*|scripts/*seed*|scripts/build-northreach*|scripts/build-seed-beta*) side="--ours" ;;
    package.json|package-lock.json) side="--theirs" ;;
  esac
  if git checkout "$side" -- "$file_path" 2>/dev/null; then
    git add -- "$file_path"
  else
    stage=3
    [ "$side" = "--ours" ] && stage=2
    if git cat-file -e ":${stage}:${file_path}" 2>/dev/null; then
      mkdir -p "$(dirname "$file_path")"
      git show ":${stage}:${file_path}" > "$file_path"
      git add -- "$file_path"
    else
      git rm --ignore-unmatch -- "$file_path"
    fi
  fi
done < <(git diff --name-only --diff-filter=U -z)

node --input-type=module <<'NODE'
import { readFile, writeFile } from 'node:fs/promises';
const ours = JSON.parse(await readFile('/tmp/seed-resync-package.json', 'utf8'));
const current = JSON.parse(await readFile('package.json', 'utf8'));
current.scripts ??= {};
for (const [name, command] of Object.entries(ours.scripts ?? {})) {
  if (name.includes('seed-content') || name.includes('seed-beta') || String(command).includes('seed-content')) current.scripts[name] = command;
}
Object.assign(current.scripts, {
  'build:seed-beta-pack': 'node scripts/build-seed-beta-pack.mjs',
  'validate:seed-beta-pack': 'node scripts/seed-beta-pack-validator.mjs',
  'test:seed-beta-pack': 'node --test scripts/seed-beta-pack.test.mjs',
  'seed:beta:validate': 'node scripts/seed-beta-importer.mjs --mode validate --environment test',
  'seed:beta:dry-run': 'node scripts/seed-beta-importer.mjs --mode dry-run --environment staging',
});
await writeFile('package.json', `${JSON.stringify(current, null, 2)}\n`);
NODE

git add package.json
if ! grep -qxF '.seed-audit/' .gitignore; then printf '\n.seed-audit/\n' >> .gitignore; fi
git add .gitignore
UNRESOLVED="$(git diff --name-only --diff-filter=U)"
if [ -n "$UNRESOLVED" ]; then
  printf 'Unresolved merge conflicts:\n%s\n' "$UNRESOLVED" | tee "$LOG_DIR/merge.log"
  exit 3
fi

cp "$ORIGINAL_APPLY" scripts/apply-seed-simulation-retention-policy.mjs
rm -f scripts/seed-beta-resync-debug-runner.sh
rm -f docs/seed-content/reviews/seed-beta-runner-failure-v1.txt

git add -A
git diff --cached --check -- docs/seed-content scripts '.github/workflows/seed-*' package.json .gitignore
if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  git commit -m "chore(seed): resynchronize PR 163 with current main [skip ci]"
elif ! git diff --cached --quiet; then
  git commit -m "chore(seed): remove seed verification transport [skip ci]"
fi
RECONCILED_SHA="$(git rev-parse HEAD)"
git push origin HEAD:"$BRANCH"

if ! command -v deno >/dev/null 2>&1; then
  export DENO_INSTALL="${RUNNER_TEMP:-/tmp}/deno"
  curl -fsSL https://deno.land/install.sh | sh >"$LOG_DIR/deno-install.log" 2>&1
  export PATH="$DENO_INSTALL/bin:$PATH"
fi
deno --version >"$LOG_DIR/deno-version.log" 2>&1

run_check() {
  local classification="$1"
  local name="$2"
  shift 2
  local log="$LOG_DIR/${name}.log"
  local status=0
  "$@" >"$log" 2>&1 || status=$?
  printf '%s\t%s\t%s\n' "$name" "$classification" "$status" | tee -a "$STATUS_FILE"
}

run_check required npm_ci npm ci
run_check required backend_npm_ci npm --prefix backend ci
run_check required build_seed_beta_pack npm run build:seed-beta-pack
run_check required validate_seed_beta_pack npm run validate:seed-beta-pack
run_check required test_seed_beta_pack npm run test:seed-beta-pack
run_check required importer_validate npm run seed:beta:validate
run_check required importer_dry_run npm run seed:beta:dry-run
run_check required existing_seed_validators npm run audit:seed-content
run_check required repository_test_suite npm test
run_check required backend_typecheck npm --prefix backend run typecheck:all
run_check required backend_smoke npm --prefix backend run smoke
run_check required migration_static_audit npm run audit:migrations
run_check required git_diff_check git diff --check
run_check evidence seed_design_staging_preflight npm run preflight:seed-content:staging
run_check evidence release_staging_preflight npm run preflight:staging
run_check evidence supabase_cli_help npx supabase --help
run_check evidence supabase_db_lint_help npx supabase db lint --help
run_check evidence supabase_local_db_lint npm run db:lint
printf 'connected_staging_import\texternal\t125\n' | tee -a "$STATUS_FILE"
printf '%s\n' "No distinct Chat 2 isolated staging project identity, game session, or credentials were available. Known live project ${KNOWN_LIVE_REF} was prohibited and not touched." > "$LOG_DIR/connected_staging_import.log"
cp "$STATUS_FILE" "$LOG_DIR/check-status.tsv"

REQUIRED_FAILURES="$(awk -F '\t' '$2 == "required" && $3 != 0 { count += 1 } END { print count + 0 }' "$STATUS_FILE")"
export MAIN_SHA RECONCILED_SHA REQUIRED_FAILURES KNOWN_LIVE_REF LOG_DIR
node --input-type=module <<'NODE'
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const statusText = await readFile(path.join(process.env.LOG_DIR, 'check-status.tsv'), 'utf8');
const checks = statusText.trim().split('\n').filter(Boolean).map((line) => {
  const [name, classification, rawStatus] = line.split('\t');
  return { name, classification, status: Number(rawStatus), passed: Number(rawStatus) === 0 };
});
const logs = [];
for (const name of (await readdir(process.env.LOG_DIR)).filter((name) => name.endsWith('.log')).sort()) {
  const bytes = await readFile(path.join(process.env.LOG_DIR, name));
  logs.push({ name, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') });
}
const requiredFailures = Number(process.env.REQUIRED_FAILURES || 0);
const evidence = {
  schemaVersion: 'econovaria-beta-seed-execution-evidence-v1',
  recordedAt: new Date().toISOString(), branch: 'agent/seed-content-foundation-v1', pullRequest: 163,
  synchronizedMainSha: process.env.MAIN_SHA, reconciledBranchSha: process.env.RECONCILED_SHA,
  requiredFailures,
  connectedStaging: { status: 'external-blocked', reason: 'Chat 2 isolated staging identity and credentials unavailable; no database touched.', productionTouched: false, knownLiveProjectRefProhibited: process.env.KNOWN_LIVE_REF },
  checks, retainedWorkflowLogs: logs,
  conclusion: requiredFailures === 0 ? 'repository-verified-awaiting-connected-isolated-staging' : 'repository-checks-failed',
};
await writeFile('docs/seed-content/executable/beta-pack-v1/execution-evidence-v1.json', `${JSON.stringify(evidence, null, 2)}\n`);
const required = checks.filter((entry) => entry.classification === 'required');
const passed = required.filter((entry) => entry.passed).length;
await writeFile('docs/seed-content/reviews/executable-beta-pack-readiness-v1.md', `# Executable beta seed pack readiness\n\n- PR authority: #163 on \`agent/seed-content-foundation-v1\`\n- Synchronized main: \`${process.env.MAIN_SHA}\`\n- Reconciled branch: \`${process.env.RECONCILED_SHA}\`\n- Required repository checks: ${passed}/${required.length} passed\n- Connected isolated staging: external-blocked\n- Production touched: no\n\nFull retained logs are under \`docs/seed-content/reviews/executable-beta-pack-run-logs/\`.\n`);
NODE

git add package.json package-lock.json .gitignore scripts docs/seed-content/executable/beta-pack-v1 docs/seed-content/reviews/executable-beta-pack-readiness-v1.md "$LOG_DIR"
git diff --cached --check -- docs/seed-content scripts package.json .gitignore
if ! git diff --cached --quiet; then
  git commit -m "test(seed): retain executable beta pack verification evidence [skip ci]"
  git push origin HEAD:"$BRANCH"
fi

rm -f "$ORIGINAL_APPLY" "$STATUS_FILE" /tmp/seed-resync-package.json
if [ "$REQUIRED_FAILURES" -ne 0 ]; then
  echo "Executable beta pack verification has ${REQUIRED_FAILURES} required failure(s)." >&2
  exit 1
fi
