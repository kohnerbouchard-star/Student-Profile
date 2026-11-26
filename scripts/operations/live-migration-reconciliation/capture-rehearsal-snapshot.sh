#!/usr/bin/env bash
# Connection binding/TLS belongs to the reviewed caller; this helper only reads.
set -euo pipefail
umask 077
out="${1:?Restricted capture directory required}"
[[ "${PHASE15_VERSIONS:-}" =~ ^[0-9]{14}(,[0-9]{14})*$ ]]
mkdir -m 700 "$out"
export PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000 -c idle_in_transaction_session_timeout=180000'
export PGAPPNAME=ref032-readonly-capture
export PGCONNECT_TIMEOUT=15
completed=false
stage=capture-snapshot
dump_exit=0
export LC_ALL=C
cleanup() {
  local result=$?
  trap - EXIT
  if test -n "${exporter_pid:-}"; then
    kill "$exporter_pid" 2>/dev/null || true
    wait "$exporter_pid" 2>/dev/null || true
  fi
  if test "$completed" != true; then
    rm -f "$out/schema.sql" "$out/ledger.json" "$out/SHA256SUMS"
    kind=command-failure
    if test "$stage" = capture-dump; then
      if test "$dump_exit" = 124; then kind=outer-dump-timeout
      elif test "$dump_exit" = 1 && grep -Fq 'canceling statement due to statement timeout' "$out/dump-diagnostics" && grep -Eq '^pg_dump: detail: Query was: LOCK TABLE .+ IN ACCESS SHARE MODE$' "$out/dump-diagnostics"; then kind=initial-lock-timeout
      fi
    fi
    # All fields come from fixed local control flow; no command output is copied.
    printf '{"status":"FAILED","captureStage":"%s","captureExitKind":"%s","exitCode":%s}\n' "$stage" "$kind" "$result" >&2
  fi
  exit "$result"
}
trap cleanup EXIT
coproc EXPORTER { exec psql -XqAt -v ON_ERROR_STOP=1 2>"$out/diagnostics"; }
exporter_pid=$EXPORTER_PID
exec {writer}>&"${EXPORTER[1]}" {reader}<&"${EXPORTER[0]}"
printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;' 'SELECT pg_export_snapshot();' >&"$writer"
read -r -t 30 snapshot <&"$reader"
[[ "$snapshot" =~ ^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$ ]]
# The exporter remains open until both consumers have completed. No retries.
stage=capture-dump
if timeout 150 pg_dump --snapshot="$snapshot" --lock-wait-timeout=5000 --schema-only \
  --schema=public --schema=private --schema=economy_private \
  --no-publications --no-subscriptions >"$out/schema.sql" 2>"$out/dump-diagnostics"; then
  dump_exit=0
else
  dump_exit=$?
  exit "$dump_exit"
fi
stage=capture-schema-boundary
test -s "$out/schema.sql"
! grep -Eq '^(COPY|INSERT INTO) ' "$out/schema.sql"
stage=capture-ledger
# Read the ledger on the exporter itself, hence at precisely the exported snapshot.
cat >&"$writer" <<SQL
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'version', version, 'name', coalesce(name, ''),
  'statementCount', cardinality(statements),
  'sha256', encode(sha256(convert_to(coalesce(statements[1], ''), 'UTF8')), 'hex')
) ORDER BY version), '[]'::jsonb)::text
FROM supabase_migrations.schema_migrations
WHERE version = ANY(string_to_array('$PHASE15_VERSIONS', ',')) OR version > '20260920082200';
ROLLBACK;
\\q
SQL
read -r -t 30 ledger <&"$reader"
printf '%s\n' "$ledger" >"$out/ledger.json"
wait "$exporter_pid"
unset exporter_pid
stage=capture-checksums
(cd "$out" && sha256sum schema.sql ledger.json > SHA256SUMS)
completed=true
