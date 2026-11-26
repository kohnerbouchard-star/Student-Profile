#!/usr/bin/env bash
# Project only exact, object-free PostgreSQL 17 verbose messages. A milestone
# records where the client got to, not whether the following work is waiting.
capture_dump_progress() {
  local line progress=unobserved
  if test -f "$1"; then
    while IFS= read -r line; do
      case "$line" in
        'pg_dump: reading extensions') progress=extensions;;
        'pg_dump: reading schemas') progress=schemas;;
        'pg_dump: reading user-defined tables') progress=tables;;
        'pg_dump: reading user-defined functions') progress=functions;;
        'pg_dump: reading user-defined types') progress=types;;
        'pg_dump: reading dependency data') progress=dependencies;;
        'pg_dump: saving database definition') progress=database-definition;;
      esac
    done < "$1"
  fi
  printf '%s' "$progress"
}
