#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HEAD="cfd8def7a4731b0dde257fc798412ac1915ec986"
BRANCH="agent/progression-reputation-achievements-v1"
MIGRATION="backend/supabase/migrations/20260721160000_add_progression_reputation_runtime_v1.sql"

git config user.name "econovaria-progression-controller"
git config user.email "progression-controller@users.noreply.github.com"
git fetch origin "$BRANCH"
git switch -C "$BRANCH" "origin/$BRANCH"
test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"

python3 - "$MIGRATION" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")
before = [line for line in text.splitlines() if "archived_at" in line]
if not before:
    raise SystemExit("No archived_at compatibility references found")

text = text.replace("player_row.archived_at is null", "player_row.status = 'active'")
text = text.replace("and archived_at is null", "and status = 'active'")
remaining = [line for line in text.splitlines() if "archived_at" in line]
if remaining:
    raise SystemExit("Unresolved archived_at references:\n" + "\n".join(remaining))

path.write_text(text, encoding="utf-8")
print(f"Replaced {len(before)} stale players.archived_at references")
PY

test -z "$(grep -n 'archived_at' "$MIGRATION" || true)"
grep -Fq "player_row.status = 'active'" "$MIGRATION"
grep -Fq "and status = 'active'" "$MIGRATION"
git diff --check

git add "$MIGRATION"
git commit -m "fix(progression): use canonical Player lifecycle status"
git push origin "HEAD:$BRANCH"
