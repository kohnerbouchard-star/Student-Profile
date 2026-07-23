#!/usr/bin/env bash
set -euo pipefail

readonly EXPECTED_HEAD="7f1a9d26aa2b37b5357f53b7dbc1c248b1920cc8"
test "$(git rev-parse HEAD)" = "$EXPECTED_HEAD"

npm install --global npm@10.9.8
npm ci
npm --prefix backend ci

set +e
npm run test:admin-progression 2>&1 | tee "$RUNNER_TEMP/admin-progression.log"
admin_status=${PIPESTATUS[0]}
(
  cd backend
  npm run test:player-security
) 2>&1 | tee "$RUNNER_TEMP/player-security.log"
security_status=${PIPESTATUS[0]}
set -e

printf 'admin_progression_status=%s\nplayer_security_status=%s\n' \
  "$admin_status" "$security_status" > "$RUNNER_TEMP/progression-ci-status.txt"

if [[ "$admin_status" -ne 0 || "$security_status" -ne 0 ]]; then
  exit 1
fi
