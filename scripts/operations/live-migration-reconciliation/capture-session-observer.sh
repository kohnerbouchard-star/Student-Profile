#!/usr/bin/env bash
# No connection is opened here. Caller uses the snapshot owner's existing pipes.
capture_observer_sql() {
  [[ "$1" =~ ^ref032_dump_[a-f0-9]{32}$ ]] || return 1
  cat <<SQL
SET LOCAL statement_timeout = 2000;
\\o /dev/null
SELECT pg_catalog.pg_stat_clear_snapshot();
\\o
SELECT concat_ws('|', count(*),
 count(*) FILTER (WHERE wait_event_type='Lock'),
 count(*) FILTER (WHERE wait_event_type='IO'),
 count(*) FILTER (WHERE wait_event_type='Client'),
 count(*) FILTER (WHERE wait_event_type='IPC'),
 count(*) FILTER (WHERE wait_event_type='LWLock'),
 count(*) FILTER (WHERE wait_event_type='Timeout'),
 count(*) FILTER (WHERE wait_event_type IS NULL AND state='active'),
 count(*) FILTER (WHERE coalesce(wait_event_type NOT IN ('Lock','IO','Client','IPC','LWLock','Timeout'), NOT (state='active'))))
FROM pg_catalog.pg_stat_activity
WHERE application_name='$1' AND usename=current_user AND datname=current_database();
SET LOCAL statement_timeout = 120000;
SQL
}
capture_observer_projection() {
  local total lock io client ipc lwlock timer active other
  [[ "$1" =~ ^[01](\|[01]){8}$ ]] || return 1
  IFS='|' read -r total lock io client ipc lwlock timer active other <<< "$1"
  test "$((lock+io+client+ipc+lwlock+timer+active+other))" = "$total" || return 1
  printf '{"matched":%s,"lock":%s,"io":%s,"client":%s,"ipc":%s,"lwlock":%s,"timeout":%s,"activeWithoutWait":%s,"other":%s}' "$total" "$lock" "$io" "$client" "$ipc" "$lwlock" "$timer" "$active" "$other"
}
