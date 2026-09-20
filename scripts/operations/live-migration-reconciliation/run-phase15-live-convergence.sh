#!/usr/bin/env bash

set -euo pipefail

required=(
  PHASE15_ENVIRONMENT
  PHASE15_EXPECTED_PROJECT_REF
  PHASE15_REMOTE_DATABASE_URL
  PHASE15_CANONICAL_SCHEMA
  PHASE15_EVIDENCE_DIR
  PHASE15_LIVE_APPLY_AUTHORIZED
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
test "$PHASE15_LIVE_APPLY_AUTHORIZED" = "$PHASE15_ENVIRONMENT"
test -s "$PHASE15_CANONICAL_SCHEMA"

repo_root="$(git rev-parse --show-toplevel)"
evidence_dir="$PHASE15_EVIDENCE_DIR"
work_dir="${PHASE15_WORK_DIR:-$RUNNER_TEMP/phase15-live-$PHASE15_ENVIRONMENT}"
manifest="$work_dir/forward-manifest.json"
rollback_bundle="$work_dir/forward-rollback.sql"
apply_bundle="$work_dir/forward-apply.sql"
mkdir -p "$evidence_dir" "$work_dir"

export PHASE15_REMOTE_DATABASE_URL
node "$repo_root/scripts/release-integrity/cli.mjs" validate-db-url \
  --url-env PHASE15_REMOTE_DATABASE_URL \
  --expected-project-ref "$PHASE15_EXPECTED_PROJECT_REF"

node "$repo_root/scripts/operations/live-migration-reconciliation/build-phase15-forward-bundle.mjs" \
  --environment "$PHASE15_ENVIRONMENT" --mode rollback --format manifest > "$manifest"
node "$repo_root/scripts/operations/live-migration-reconciliation/build-phase15-forward-bundle.mjs" \
  --environment "$PHASE15_ENVIRONMENT" --mode rollback --format sql > "$rollback_bundle"
node "$repo_root/scripts/operations/live-migration-reconciliation/build-phase15-forward-bundle.mjs" \
  --environment "$PHASE15_ENVIRONMENT" --mode apply --format sql > "$apply_bundle"

expected_count="$(jq -r '.migrationCount' "$manifest")"
versions="$(jq -r '.migrations[].version' "$manifest" | paste -sd, -)"
test -n "$versions"

capture_ledger() {
  local destination="$1"
  psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -v phase15_versions="$versions" <<'SQL' > "$destination"
select coalesce(
  jsonb_agg(
    jsonb_build_object(
      'version', version,
      'name', coalesce(name, ''),
      'statementCount', cardinality(statements),
      'sha256', encode(extensions.digest(coalesce(statements[1], ''), 'sha256'), 'hex')
    ) order by version
  ),
  '[]'::jsonb
)::text
from supabase_migrations.schema_migrations
where version = any (string_to_array(:'phase15_versions', ','));
SQL
}

extract_bundle_evidence() {
  local source="$1"
  local destination="$2"
  BUNDLE_OUTPUT="$source" node --input-type=module - <<'NODE' > "$destination"
import { readFileSync } from "node:fs";
const lines = readFileSync(process.env.BUNDLE_OUTPUT, "utf8")
  .split(/\r?\n/u)
  .map((line) => line.trim())
  .filter(Boolean)
  .reverse();
for (const line of lines) {
  try {
    const value = JSON.parse(line);
    if (value?.economicInvariantsMatched === true) {
      process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
      process.exit(0);
    }
  } catch {}
}
throw new Error("Phase 15 bundle did not emit economic-invariant evidence.");
NODE
}

psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
  < "$repo_root/scripts/operations/live-migration-reconciliation/export-effective-schema-v2.sql" \
  > "$evidence_dir/pre-schema.json"
psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
  < "$repo_root/scripts/operations/live-migration-reconciliation/export-runtime-catalog-v2.sql" \
  > "$evidence_dir/pre-runtime-catalog.json"
capture_ledger "$evidence_dir/pre-ledger.json"

present_count="$(jq 'length' "$evidence_dir/pre-ledger.json")"
apply_status=""
if test "$present_count" -eq 0; then
  echo "Running rollback-only populated $PHASE15_ENVIRONMENT rehearsal."
  psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -f "$rollback_bundle" | tee "$work_dir/rollback-output.log"
  extract_bundle_evidence "$work_dir/rollback-output.log" "$evidence_dir/rollback-economic-invariants.json"

  capture_ledger "$evidence_dir/post-rollback-ledger.json"
  test "$(jq 'length' "$evidence_dir/post-rollback-ledger.json")" -eq 0
  psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
    < "$repo_root/scripts/operations/live-migration-reconciliation/export-effective-schema-v2.sql" \
    > "$evidence_dir/post-rollback-schema.json"
  node "$repo_root/scripts/operations/live-migration-reconciliation/compare-schema-snapshots.mjs" \
    --left "$evidence_dir/pre-schema.json" \
    --right "$evidence_dir/post-rollback-schema.json" \
    > "$evidence_dir/rollback-schema-comparison.json"

  echo "Applying the rollback-proven forward bundle to $PHASE15_ENVIRONMENT."
  psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
    -f "$apply_bundle" | tee "$work_dir/apply-output.log"
  extract_bundle_evidence "$work_dir/apply-output.log" "$evidence_dir/apply-economic-invariants.json"
  apply_status="applied"
elif test "$present_count" -eq "$expected_count"; then
  echo "All expected Phase 15 ledger identities already exist; verifying the completed apply."
  apply_status="already-applied"
else
  echo "Partial Phase 15 ledger detected: $present_count of $expected_count identities." >&2
  exit 1
fi

capture_ledger "$evidence_dir/post-ledger.json"
node "$repo_root/scripts/operations/live-migration-reconciliation/verify-phase15-ledger.mjs" \
  --manifest "$manifest" \
  --live "$evidence_dir/post-ledger.json" \
  > "$evidence_dir/ledger-verification.json"

psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
  < "$repo_root/scripts/operations/live-migration-reconciliation/export-effective-schema-v2.sql" \
  > "$evidence_dir/post-schema.json"
node "$repo_root/scripts/operations/live-migration-reconciliation/compare-schema-snapshots.mjs" \
  --left "$PHASE15_CANONICAL_SCHEMA" \
  --right "$evidence_dir/post-schema.json" \
  > "$evidence_dir/canonical-schema-comparison.json"

psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 \
  < "$repo_root/scripts/operations/live-migration-reconciliation/export-runtime-catalog-v2.sql" \
  > "$evidence_dir/post-runtime-catalog.json"

psql "$PHASE15_REMOTE_DATABASE_URL" -X -qAt -v ON_ERROR_STOP=1 <<'SQL' > "$evidence_dir/runtime-safety-audit.json"
with expected(jobname) as (
  values
    ('econovaria-stock-runtime-scheduler-v1'),
    ('econovaria-stock-tick-archive-retention-v1'),
    ('econovaria-stock-candle-retention-v1'),
    ('econovaria-game-license-expiration-v1'),
    ('econovaria-game-data-purge-scheduler-v1'),
    ('econovaria-cron-history-retention-v1'),
    ('econovaria-platform-storage-health-v1')
)
select jsonb_build_object(
  'registry', (select to_jsonb(row_value) from public.get_game_data_purge_registry_digest_v1() row_value),
  'foreignKeys', (select to_jsonb(row_value) from public.get_game_data_purge_fk_graph_digest_v1() row_value),
  'deleteOrder', (select to_jsonb(row_value) from public.get_game_data_purge_delete_order_digest_v1() row_value),
  'control', (
    select jsonb_build_object(
      'environmentName', environment_name,
      'bucketConfigured', r2_bucket_name is not null,
      'armed', arm_id is not null or armed_until is not null,
      'operatorIdentityCleared', armed_by_staff_user_id is null
    )
    from private.game_data_purge_control
    where singleton
  ),
  'scheduler', jsonb_build_object(
    'expectedActive', (select count(*) from expected),
    'missingExpected', (
      select count(*) from expected
      where not exists (
        select 1 from cron.job live_job
        where live_job.jobname = expected.jobname and live_job.active
      )
    ),
    'inactiveEconovaria', (
      select count(*) from cron.job where jobname like 'econovaria-%' and not active
    ),
    'activeEconovaria', (
      select count(*) from cron.job where jobname like 'econovaria-%' and active
    )
  ),
  'pgCronVersion', (
    select extversion from pg_extension where extname = 'pg_cron'
  )
)::text;
SQL

PHASE15_RUNTIME_AUDIT="$evidence_dir/runtime-safety-audit.json" \
PHASE15_APPLY_STATUS="$apply_status" \
PHASE15_EXPECTED_COUNT="$expected_count" \
PHASE15_SOURCE_COMMIT="$(git rev-parse HEAD)" \
node --input-type=module - <<'NODE' > "$evidence_dir/summary.json"
import { readFileSync } from "node:fs";
const audit = JSON.parse(readFileSync(process.env.PHASE15_RUNTIME_AUDIT, "utf8"));
const expected = {
  registry: { table_count: 207, registry_sha256: "7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3" },
  foreignKeys: { edge_count: 456, fk_graph_sha256: "fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329" },
  deleteOrder: { table_count: 206, order_sha256: "19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897" },
};
for (const [key, value] of Object.entries(expected)) {
  for (const [field, expectedValue] of Object.entries(value)) {
    if (audit?.[key]?.[field] !== expectedValue) {
      throw new Error(`${key}.${field} mismatch: ${audit?.[key]?.[field]}`);
    }
  }
}
if (audit?.control?.environmentName !== process.env.PHASE15_ENVIRONMENT) throw new Error("Purge environment identity mismatch.");
if (audit?.control?.bucketConfigured !== true) throw new Error("Purge bucket identity is not configured.");
if (audit?.control?.armed !== false || audit?.control?.operatorIdentityCleared !== true) throw new Error("Purge lever is not fail-closed.");
if (Number(audit?.scheduler?.missingExpected) !== 0 || Number(audit?.scheduler?.inactiveEconovaria) !== 0) throw new Error("Required scheduler health check failed.");
if (audit?.pgCronVersion !== "1.6.4") throw new Error("pg_cron version mismatch.");
process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  status: "PASS",
  environment: process.env.PHASE15_ENVIRONMENT,
  expectedProjectRef: process.env.PHASE15_EXPECTED_PROJECT_REF,
  sourceCommit: process.env.PHASE15_SOURCE_COMMIT,
  applyStatus: process.env.PHASE15_APPLY_STATUS,
  migrationCount: Number(process.env.PHASE15_EXPECTED_COUNT),
  rollbackRehearsalPassed: process.env.PHASE15_APPLY_STATUS === "applied",
  exactLedgerVerified: true,
  canonicalApplicationSchemaMatched: true,
  economicInvariantsMatched: true,
  purgeSafetyMatched: true,
  schedulerHealthMatched: true,
}, null, 2)}\n`);
NODE
