#!/usr/bin/env bash
# Connection binding/TLS belongs to the reviewed caller; this helper only reads.
set -euo pipefail
umask 077
source "$(dirname "${BASH_SOURCE[0]}")/capture-dump-progress.sh"
source "$(dirname "${BASH_SOURCE[0]}")/capture-session-observer.sh"
[[ "${REF032_CAPTURE_OBSERVE:-}" = "" || "${REF032_CAPTURE_OBSERVE:-}" = 1 ]]
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
observer_status=disabled
observer_samples=
if test "${REF032_CAPTURE_OBSERVE:-}" = 1; then
  observer_status=unobserved
  dump_tag="ref032_dump_$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
  [[ "$dump_tag" =~ ^ref032_dump_[a-f0-9]{32}$ ]]
fi
cleanup() {
  local result=$?
  trap - EXIT
  if test -n "${dump_pid:-}"; then
    kill "$dump_pid" 2>/dev/null || true
    wait "$dump_pid" 2>/dev/null || true
  fi
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
    progress="$(capture_dump_progress "$out/dump-diagnostics")"
    # All fields come from fixed local control flow; no command output is copied.
    printf '{"status":"FAILED","captureStage":"%s","captureExitKind":"%s","exitCode":%s,"captureProgress":"%s","captureObserver":{"status":"%s","samples":[%s]}}\n' "$stage" "$kind" "$result" "$progress" "$observer_status" "$observer_samples" >&2
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
PGAPPNAME="${dump_tag:-ref032-readonly-capture}" timeout 150 pg_dump --snapshot="$snapshot" --lock-wait-timeout=5000 --schema-only --verbose \
  --schema=public --schema=private --schema=economy_private \
  --no-publications --no-subscriptions >"$out/schema.sql" 2>"$out/dump-diagnostics" &
dump_pid=$!
if test "${REF032_CAPTURE_OBSERVE:-}" = 1; then
  dump_started=$SECONDS
  next_sample=2
  sample_count=0
  while kill -0 "$dump_pid" 2>/dev/null; do
    if test "$sample_count" -lt 3 && test "$((SECONDS-dump_started))" -ge "$next_sample"; then
      # Same-role observer uses the exporter connection; no extra auth/transport.
      # A failed/unsupported observation aborts this capture, never certifies it.
      observer_status=unsupported
      capture_observer_sql "$dump_tag" >&"$writer"
      read -r -t 3 observation <&"$reader"
      projected="$(capture_observer_projection "$observation")"
      observer_samples="${observer_samples:+$observer_samples,}$projected"
      observer_status=sampled
      sample_count=$((sample_count+1))
      case "$sample_count" in 1) next_sample=30;; 2) next_sample=90;; esac
    fi
    sleep 1
  done
fi
if wait "$dump_pid"; then
  unset dump_pid
  dump_exit=0
else
  dump_exit=$?
  unset dump_pid
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
