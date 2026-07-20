#!/usr/bin/env bash
set -euo pipefail

# Release-controller replay entrypoint. Safe to rerun against isolated staging.
MIGRATIONS_DIR="${1:-backend/supabase/migrations}"
POOLER_URL_FILE="${2:-backend/supabase/.temp/pooler-url}"
EXPECTED_HEAD="20260719200000"
EXPECTED_COUNT="70"

command -v psql >/dev/null
test -d "$MIGRATIONS_DIR"
test -s "$POOLER_URL_FILE"
test -n "${SUPABASE_PROJECT_REF:-}"
test -n "${SUPABASE_DB_PASSWORD:-}"

POOLER_URL="$(tr -d '\r\n' < "$POOLER_URL_FILE")"
EXPECTED_PREFIX="postgresql://postgres.${SUPABASE_PROJECT_REF}@"

if [[ "$POOLER_URL" != "$EXPECTED_PREFIX"* ]]; then
  printf 'Refusing unexpected linked pooler identity.\n' >&2
  false
fi

if [[ "$POOLER_URL" != *":5432/postgres"* ]]; then
  printf 'Refusing non-session pooler URL.\n' >&2
  false
fi

export PGPASSWORD="$SUPABASE_DB_PASSWORD"
export PGSSLMODE=require

repair_migration() {
  local version="$1"
  (
    cd backend
    supabase migration repair "$version" \
      --status applied \
      --linked \
      --password "$SUPABASE_DB_PASSWORD"
  )
}

mapfile -t remote_versions < <(
  psql "$POOLER_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -c "select version from supabase_migrations.schema_migrations order by version"
)

declare -A applied=()
for version in "${remote_versions[@]}"; do
  applied["$version"]=1
done

while IFS= read -r file; do
  filename="$(basename "$file")"
  version="${filename%%_*}"
  name="${filename#*_}"
  name="${name%.sql}"

  if [[ ! "$version" =~ ^[0-9]{14}$ ]]; then
    printf 'Skipping non-migration file: %s\n' "$filename"
    continue
  fi

  if [[ -n "${applied[$version]:-}" ]]; then
    printf 'Already applied: %s\n' "$filename"
    continue
  fi

  recovered=false
  if [[ "$version" == "20260713194500" ]]; then
    reward_state="$(
      psql "$POOLER_URL" -X -qAt -F '|' -v ON_ERROR_STOP=1 -c "
        select
          to_regclass('public.contract_reward_issuances') is not null,
          to_regprocedure('public.issue_contract_rewards_atomic_v1(uuid,uuid,uuid,uuid,text)') is not null,
          has_function_privilege('service_role','public.issue_contract_rewards_atomic_v1(uuid,uuid,uuid,uuid,text)','EXECUTE'),
          has_function_privilege('anon','public.issue_contract_rewards_atomic_v1(uuid,uuid,uuid,uuid,text)','EXECUTE'),
          has_function_privilege('authenticated','public.issue_contract_rewards_atomic_v1(uuid,uuid,uuid,uuid,text)','EXECUTE'),
          coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.contract_reward_issuances')), false)
      "
    )"

    if [[ "$reward_state" == "t|t|t|f|f|t" ]]; then
      printf 'Recovering verified schema-applied migration ledger: %s\n' "$filename"
      repair_migration "$version"
      recovered=true
    elif [[ "$reward_state" != "f|f|f|f|f|f" ]]; then
      printf 'Refusing ambiguous partial state for %s: %s\n' "$filename" "$reward_state" >&2
      false
    fi
  fi

  if [[ "$recovered" == false ]]; then
    printf 'Applying through psql: %s\n' "$filename"
    psql "$POOLER_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f "$file"
    repair_migration "$version"
  fi

  recorded_name="$(
    psql "$POOLER_URL" -X -qAt -v ON_ERROR_STOP=1 \
      -v migration_version="$version" \
      -c "select coalesce(name, '') from supabase_migrations.schema_migrations where version = :'migration_version'"
  )"

  if [[ "$recorded_name" != "$name" ]]; then
    printf 'Migration ledger name mismatch for %s: got %s\n' "$version" "$recorded_name" >&2
    false
  fi

  applied["$version"]=1
done < <(find "$MIGRATIONS_DIR" -maxdepth 1 -type f -name '[0-9]*_*.sql' | sort)

read -r final_count final_head < <(
  psql "$POOLER_URL" -X -qAt -F ' ' -v ON_ERROR_STOP=1 \
    -c "select count(*)::int, max(version) from supabase_migrations.schema_migrations"
)

printf 'Final migration ledger: count=%s head=%s\n' "$final_count" "$final_head"
test "$final_count" = "$EXPECTED_COUNT"
test "$final_head" = "$EXPECTED_HEAD"

unset PGPASSWORD
