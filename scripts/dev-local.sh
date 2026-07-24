#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FUNCTIONS_LOG="${TMPDIR:-/tmp}/econovaria-local-functions.log"
FUNCTIONS_PID=""

cleanup() {
  if [[ -n "$FUNCTIONS_PID" ]] && kill -0 "$FUNCTIONS_PID" 2>/dev/null; then
    kill "$FUNCTIONS_PID" 2>/dev/null || true
    wait "$FUNCTIONS_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

npx supabase start --workdir backend

: > "$FUNCTIONS_LOG"
npx supabase functions serve --workdir backend >"$FUNCTIONS_LOG" 2>&1 &
FUNCTIONS_PID=$!

STATUS_ENV="$(npx supabase status -o env --workdir backend)"
API_URL="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^API_URL=//p' | head -n 1 | tr -d '"')"
ANON_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^ANON_KEY=//p' | head -n 1 | tr -d '"')"

if [[ -z "$API_URL" || -z "$ANON_KEY" ]]; then
  echo "Local Supabase status did not provide API_URL and ANON_KEY." >&2
  exit 1
fi

FUNCTIONS_READY=false
for _ in $(seq 1 60); do
  if ! kill -0 "$FUNCTIONS_PID" 2>/dev/null; then
    echo "Local Edge Functions runtime exited before becoming ready." >&2
    cat "$FUNCTIONS_LOG" >&2 || true
    exit 1
  fi

  HTTP_STATUS="$(
    curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
      "$API_URL/functions/v1/classroom-api/health" \
      -H "Authorization: Bearer $ANON_KEY" \
      -H "apikey: $ANON_KEY" \
      || true
  )"

  if [[ "$HTTP_STATUS" == "200" ]]; then
    FUNCTIONS_READY=true
    break
  fi
  sleep 1
done

if [[ "$FUNCTIONS_READY" != "true" ]]; then
  echo "Local Edge Functions runtime did not become healthy." >&2
  cat "$FUNCTIONS_LOG" >&2 || true
  exit 1
fi

python3 scripts/local-staging-gateway.py --local-supabase --open "$@"
