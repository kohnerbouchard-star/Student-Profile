#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_HEAD="63cce01ea7f15641b389de997e4a0f2256a01ded"
readonly BRANCH_NAME="agent/progression-reputation-achievements-v1"

test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"
git fetch --no-tags origin main
test "$(git rev-list --count HEAD..origin/main)" = "0"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

sed -i 's/if (!pagination.ok) return invalid(pagination.message);/if (pagination.ok === false) return invalid(pagination.message);/g' \
  backend/supabase/functions/admin-api/progressionOperations.ts

python3 - <<'PY'
from pathlib import Path
path = Path("player-terminal/tools/verify-pr-scope.mjs")
text = path.read_text()
exact_anchor = '  ".github/workflows/messaging-final-connected-acceptance.yml",\n'
if '".github/workflows/progression-runtime-v1.yml"' not in text:
    if exact_anchor not in text:
        raise SystemExit("Progression workflow allowlist anchor missing")
    text = text.replace(
        exact_anchor,
        exact_anchor + '  ".github/workflows/progression-runtime-v1.yml",\n',
        1,
    )
pattern_anchor = '  /^backend\\/supabase\\/migrations\\/2026072115(0000|1000|2000|3000)_[A-Za-z0-9_]+\\.sql$/,\n'
progression_patterns = '''  /^admin\\/progression-review-(client|loader|surface)\\.js$/,
  /^admin\\/progression-review\\.css$/,
  /^backend\\/src\\/domains\\/progression\\//,
  /^backend\\/src\\/security\\/progressionRateLimitDispatch(\\.test)?\\.ts$/,
  /^backend\\/supabase\\/functions\\/admin-api\\/progression[A-Za-z0-9.-]*\\.ts$/,
  /^backend\\/supabase\\/migrations\\/2026072116(0000|1000|2000|3000)_[A-Za-z0-9_]+\\.sql$/,
  /^docs\\/workstreams\\/progression-preconvergence-v1\\.md$/,
  /^scripts\\/(admin-progression-contract|progression-(abuse-threshold-simulation|balance-simulation|event-delivery-simulation))\\.mjs$/,
'''
if 'backend\\/src\\/domains\\/progression' not in text:
    if pattern_anchor not in text:
        raise SystemExit("Progression scope-pattern anchor missing")
    text = text.replace(pattern_anchor, pattern_anchor + progression_patterns, 1)
path.write_text(text)
PY

test "$(grep -Fc 'pagination.ok === false' backend/supabase/functions/admin-api/progressionOperations.ts)" = "2"
git diff --check

git diff --name-only origin/main...HEAD > /tmp/progression-changed-files.txt
node player-terminal/tools/verify-pr-scope.mjs /tmp/progression-changed-files.txt
deno check --config backend/supabase/functions/classroom-api/deno.json \
  backend/supabase/functions/admin-api/progressionOperations.ts

git add backend/supabase/functions/admin-api/progressionOperations.ts \
  player-terminal/tools/verify-pr-scope.mjs
git commit -m "fix(progression): complete post-messaging integration guards"
git push origin "HEAD:$BRANCH_NAME"
