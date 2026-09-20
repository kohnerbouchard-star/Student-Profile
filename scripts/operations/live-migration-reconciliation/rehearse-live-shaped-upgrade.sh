#!/usr/bin/env bash

set -euo pipefail

required=(
  PHASE15_ENVIRONMENT
  PHASE15_EXPECTED_PROJECT_REF
  PHASE15_REMOTE_DATABASE_URL
  PHASE15_WORK_DIR
  PHASE15_EVIDENCE_DIR
  PHASE15_CANONICAL_SCHEMA
  PHASE15_CANONICAL_CATALOG
)

for name in "${required[@]}"; do
  if test -z "${!name:-}"; then
    echo "Missing required environment variable: $name" >&2
    exit 1
  fi
done

case "$PHASE15_ENVIRONMENT" in
  staging|production) ;;
  *) echo "PHASE15_ENVIRONMENT must be staging or production." >&2; exit 1 ;;
esac

test -s "$PHASE15_CANONICAL_SCHEMA"
test -s "$PHASE15_CANONICAL_CATALOG"

repo_root="$(git rev-parse --show-toplevel)"
cutoff="20260819062000"
project_id="econovaria_phase15_${PHASE15_ENVIRONMENT}"
container="supabase_db_${project_id}"
supabase_root="$PHASE15_WORK_DIR/backend"
dump_path="$PHASE15_WORK_DIR/${PHASE15_ENVIRONMENT}-schema.sql"
ca_path="$repo_root/scripts/operations/live-migration-reconciliation/supabase-prod-ca-2021.crt"
ca_container_path="/tmp/supabase-prod-ca-2021.crt"
ca_sha256="700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7"
applied_path="$PHASE15_EVIDENCE_DIR/applied-migrations.txt"
failure_path="$PHASE15_EVIDENCE_DIR/failure.json"
status="FAILED"
failed_migration=""
local_started=false
schema_restored=false

mkdir -p "$supabase_root/supabase/migrations" "$PHASE15_EVIDENCE_DIR"
: > "$applied_path"
rm -f "$failure_path"

cp "$repo_root/backend/supabase/config.toml" "$supabase_root/supabase/config.toml"
sed -i "s/^project_id = .*/project_id = \"$project_id\"/" "$supabase_root/supabase/config.toml"

export PHASE15_REMOTE_DATABASE_URL
node "$repo_root/scripts/release-integrity/cli.mjs" validate-db-url \
  --url-env PHASE15_REMOTE_DATABASE_URL \
  --expected-project-ref "$PHASE15_EXPECTED_PROJECT_REF"

capture_local_snapshot() {
  if test "$schema_restored" != true; then
    return 0
  fi
  if ! docker ps --format '{{.Names}}' | grep -Fxq "$container"; then
    return 0
  fi
  docker exec -i "$container" psql -U postgres -d postgres -X -qAt -v ON_ERROR_STOP=1 \
    < "$repo_root/scripts/operations/live-migration-reconciliation/export-effective-schema-v2.sql" \
    > "$PHASE15_EVIDENCE_DIR/post-schema.json" || true
  docker exec -i "$container" psql -U postgres -d postgres -X -qAt -v ON_ERROR_STOP=1 \
    < "$repo_root/scripts/operations/live-migration-reconciliation/export-runtime-catalog-v2.sql" \
    > "$PHASE15_EVIDENCE_DIR/post-catalog.json" || true
}

write_summary() {
  local exit_code="$1"
  local schema_compare_exit=""
  local catalog_compare_exit=""
  if test -s "$PHASE15_EVIDENCE_DIR/schema-comparison-exit.txt"; then
    schema_compare_exit="$(cat "$PHASE15_EVIDENCE_DIR/schema-comparison-exit.txt")"
  fi
  if test -s "$PHASE15_EVIDENCE_DIR/catalog-comparison-exit.txt"; then
    catalog_compare_exit="$(cat "$PHASE15_EVIDENCE_DIR/catalog-comparison-exit.txt")"
  fi
  PHASE15_EXIT_CODE="$exit_code" \
  PHASE15_STATUS="$status" \
  PHASE15_FAILED_MIGRATION="$failed_migration" \
  PHASE15_CUTOFF="$cutoff" \
  PHASE15_SOURCE_COMMIT="$(git rev-parse HEAD)" \
  PHASE15_APPLIED_PATH="$applied_path" \
  PHASE15_SCHEMA_COMPARE_EXIT="$schema_compare_exit" \
  PHASE15_CATALOG_COMPARE_EXIT="$catalog_compare_exit" \
  node --input-type=module - <<'NODE' > "$PHASE15_EVIDENCE_DIR/summary.json"
import { readFileSync } from "node:fs";

const applied = readFileSync(process.env.PHASE15_APPLIED_PATH, "utf8")
  .split("\n")
  .filter(Boolean);
const optionalExit = (value) => /^\d+$/.test(value ?? "") ? Number(value) : null;
const schemaComparisonExit = optionalExit(process.env.PHASE15_SCHEMA_COMPARE_EXIT);
const catalogComparisonExit = optionalExit(process.env.PHASE15_CATALOG_COMPARE_EXIT);
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  environment: process.env.PHASE15_ENVIRONMENT,
  expectedProjectRef: process.env.PHASE15_EXPECTED_PROJECT_REF,
  sourceCommit: process.env.PHASE15_SOURCE_COMMIT,
  migrationCutoff: process.env.PHASE15_CUTOFF,
  appliedMigrationCount: applied.length,
  firstAppliedMigration: applied[0] ?? null,
  lastAppliedMigration: applied.at(-1) ?? null,
  failedMigration: process.env.PHASE15_FAILED_MIGRATION || null,
  status: process.env.PHASE15_STATUS,
  exitCode: Number(process.env.PHASE15_EXIT_CODE),
  sourceDatabaseAccess: "schema-only-read-only",
  sourceRowsCopied: false,
  rawSchemaDumpRetained: false,
  canonicalApplicationSchemaComparisonExit: schemaComparisonExit,
  canonicalApplicationSchemaMatched: schemaComparisonExit === 0,
  runtimeCatalogComparisonExit: catalogComparisonExit,
  runtimeCatalogComparisonIsInformational: true,
}, null, 2)}\n`);
NODE
}

cleanup() {
  local exit_code=$?
  trap - EXIT
  capture_local_snapshot
  if test -s "$PHASE15_EVIDENCE_DIR/post-schema.json" \
      && test -s "$PHASE15_EVIDENCE_DIR/post-catalog.json"; then
    set +e
    node "$repo_root/scripts/operations/live-migration-reconciliation/compare-schema-snapshots.mjs" \
      --left "$PHASE15_CANONICAL_SCHEMA" \
      --right "$PHASE15_EVIDENCE_DIR/post-schema.json" \
      > "$PHASE15_EVIDENCE_DIR/schema-comparison.json"
    schema_compare_exit=$?
    node "$repo_root/scripts/operations/live-migration-reconciliation/compare-schema-snapshots.mjs" \
      --left "$PHASE15_CANONICAL_CATALOG" \
      --right "$PHASE15_EVIDENCE_DIR/post-catalog.json" \
      > "$PHASE15_EVIDENCE_DIR/catalog-comparison.json"
    catalog_compare_exit=$?
    set -e
    printf '%s\n' "$schema_compare_exit" > "$PHASE15_EVIDENCE_DIR/schema-comparison-exit.txt"
    printf '%s\n' "$catalog_compare_exit" > "$PHASE15_EVIDENCE_DIR/catalog-comparison-exit.txt"
  fi
  rm -f "$dump_path"
  if test "$local_started" = true; then
    supabase stop --workdir "$supabase_root" --no-backup >/dev/null 2>&1 || true
  fi
  write_summary "$exit_code"
  exit "$exit_code"
}
trap cleanup EXIT

excluded="studio,imgproxy,storage-api,edge-runtime,logflare,vector,supavisor,gotrue,postgrest,realtime,kong,mailpit,postgres-meta"
startup_status=1
for attempt in 1 2 3; do
  set +e
  supabase start --workdir "$supabase_root" --exclude "$excluded"
  startup_status=$?
  set -e
  if test "$startup_status" -eq 0; then
    local_started=true
    break
  fi
  supabase stop --workdir "$supabase_root" --no-backup >/dev/null 2>&1 || true
  sleep $((attempt * 10))
done
test "$startup_status" -eq 0

test -s "$ca_path"
test "$(sha256sum "$ca_path" | awk '{print $1}')" = "$ca_sha256"
openssl x509 -in "$ca_path" -noout -checkend 2592000
docker cp "$ca_path" "$container:$ca_container_path"
docker exec "$container" chmod 0444 "$ca_container_path"
test "$(docker exec "$container" psql -U supabase_admin -d postgres -X -qAt -v ON_ERROR_STOP=1 \
  -c "select rolsuper from pg_roles where rolname = 'supabase_admin'")" = "t"

echo "Capturing $PHASE15_ENVIRONMENT schema without application rows."
docker exec \
  -e DATABASE_URL="$PHASE15_REMOTE_DATABASE_URL" \
  -e PGSSLMODE=verify-full \
  -e PGSSLROOTCERT="$ca_container_path" \
  -e 'PGOPTIONS=-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000' \
  "$container" \
  sh -ceu 'test -s "$PGSSLROOTCERT"; pg_dump "$DATABASE_URL" --schema-only --schema=public --schema=private --schema=economy_private --no-publications --no-subscriptions' \
  > "$dump_path"

test -s "$dump_path"
if grep -Eq '^(COPY|INSERT INTO) ' "$dump_path"; then
  echo "Schema capture unexpectedly contained application rows." >&2
  exit 1
fi
sha256sum "$dump_path" | awk '{print $1}' > "$PHASE15_EVIDENCE_DIR/source-schema-dump-sha256.txt"

docker exec -i "$container" psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 <<'SQL'
drop schema if exists economy_private cascade;
drop schema if exists private cascade;
drop schema if exists public cascade;
SQL
docker exec -i "$container" psql -U supabase_admin -d postgres -X -q -v ON_ERROR_STOP=1 < "$dump_path"
schema_restored=true

docker exec -i "$container" psql -U postgres -d postgres -X -qAt -v ON_ERROR_STOP=1 \
  < "$repo_root/scripts/operations/live-migration-reconciliation/export-effective-schema-v2.sql" \
  > "$PHASE15_EVIDENCE_DIR/pre-schema.json"
docker exec -i "$container" psql -U postgres -d postgres -X -qAt -v ON_ERROR_STOP=1 \
  < "$repo_root/scripts/operations/live-migration-reconciliation/export-runtime-catalog-v2.sql" \
  > "$PHASE15_EVIDENCE_DIR/pre-catalog.json"

mapfile -t migrations < <(
  find "$repo_root/backend/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' \
    | LC_ALL=C sort \
    | awk -v cutoff="$cutoff" 'substr($0,1,14) >= cutoff'
)
if test "${#migrations[@]}" -ne 138; then
  echo "Expected 138 forward migrations, found ${#migrations[@]}." >&2
  exit 1
fi

for migration in "${migrations[@]}"; do
  failed_migration="$migration"
  echo "Applying $migration"
  if ! docker exec -i "$container" psql -U postgres -d postgres -X -q -v ON_ERROR_STOP=1 \
    < "$repo_root/backend/supabase/migrations/$migration"; then
    PHASE15_FAILED_MIGRATION="$migration" node --input-type=module - <<'NODE' > "$failure_path"
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  environment: process.env.PHASE15_ENVIRONMENT,
  failedMigration: process.env.PHASE15_FAILED_MIGRATION,
  errorClass: "MIGRATION_APPLICATION_FAILED",
}, null, 2)}\n`);
NODE
    exit 1
  fi
  printf '%s\n' "$migration" >> "$applied_path"
done

failed_migration=""
capture_local_snapshot
set +e
node "$repo_root/scripts/operations/live-migration-reconciliation/compare-schema-snapshots.mjs" \
  --left "$PHASE15_CANONICAL_SCHEMA" \
  --right "$PHASE15_EVIDENCE_DIR/post-schema.json" \
  > "$PHASE15_EVIDENCE_DIR/schema-comparison.json"
schema_compare_exit=$?
node "$repo_root/scripts/operations/live-migration-reconciliation/compare-schema-snapshots.mjs" \
  --left "$PHASE15_CANONICAL_CATALOG" \
  --right "$PHASE15_EVIDENCE_DIR/post-catalog.json" \
  > "$PHASE15_EVIDENCE_DIR/catalog-comparison.json"
catalog_compare_exit=$?
set -e
printf '%s\n' "$schema_compare_exit" > "$PHASE15_EVIDENCE_DIR/schema-comparison-exit.txt"
printf '%s\n' "$catalog_compare_exit" > "$PHASE15_EVIDENCE_DIR/catalog-comparison-exit.txt"

if test "$schema_compare_exit" -ne 0; then
  node --input-type=module - <<'NODE' > "$failure_path"
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  environment: process.env.PHASE15_ENVIRONMENT,
  errorClass: "CANONICAL_APPLICATION_SCHEMA_MISMATCH",
}, null, 2)}\n`);
NODE
  exit 1
fi

status="PASS"
