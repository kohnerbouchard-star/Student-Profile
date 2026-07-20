#!/usr/bin/env bash
set -euo pipefail

: "${SUPABASE_ACCESS_TOKEN:?Set SUPABASE_ACCESS_TOKEN to a scoped Supabase personal access token.}"
: "${SUPABASE_PROJECT_REF:?Set SUPABASE_PROJECT_REF to the target project reference.}"

OUTPUT_DIR="${1:-.tmp/live-migration-reconciliation}"
mkdir -p "$OUTPUT_DIR"
umask 077

redact_jq='
  def redact:
    walk(
      if type == "object" then
        with_entries(
          if (.key | test("(secret|password|token|private|smtp_pass|client_secret|captcha_secret|hook_secret)"; "i"))
          then .value = "REDACTED"
          else .
          end
        )
      else .
      end
    );
  redact
'

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/config/auth" \
  | jq -S "$redact_jq" \
  > "$OUTPUT_DIR/auth-config.redacted.json"

curl --fail --silent --show-error \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/functions" \
  | jq -S \
  > "$OUTPUT_DIR/edge-functions.json"

printf 'Wrote redacted Auth configuration and Edge Function inventory to %s\n' "$OUTPUT_DIR"
printf 'Review redaction before committing either file. Never commit access tokens or unredacted provider secrets.\n'
