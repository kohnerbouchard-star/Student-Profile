import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const paths = {
  config: new URL("backend/supabase/config.toml", ROOT),
  manifest: new URL("backend/supabase/edge-function-manifest.json", ROOT),
  archiver: new URL("backend/supabase/functions/stock-tick-archiver/index.ts", ROOT),
  purger: new URL("backend/supabase/functions/game-data-purger/index.ts", ROOT),
  phase11Contract: new URL(
    "scripts/business-store-sales-convergence-contract.mjs",
    ROOT,
  ),
  schemaExporter: new URL(
    "scripts/operations/live-migration-reconciliation/export-effective-schema-v2.sql",
    ROOT,
  ),
  catalogExporter: new URL(
    "scripts/operations/live-migration-reconciliation/export-runtime-catalog-v2.sql",
    ROOT,
  ),
  stockMigration: new URL(
    "backend/supabase/migrations/20260920081000_phase15_reconcile_stock_tick_archive_lifecycle_v1.sql",
    ROOT,
  ),
  candleMigration: new URL(
    "backend/supabase/migrations/20260920081100_phase15_reconcile_stock_candle_retention_v1.sql",
    ROOT,
  ),
  purgeFoundation: new URL(
    "backend/supabase/migrations/20260920081200_phase15_reconcile_game_license_purge_foundation_v1.sql",
    ROOT,
  ),
  purgeInternal: new URL(
    "backend/supabase/migrations/20260920081300_phase15_reconcile_game_purge_internal_contracts_v1.sql",
    ROOT,
  ),
  purgeOperator: new URL(
    "backend/supabase/migrations/20260920081400_phase15_reconcile_game_purge_operator_controls_v1.sql",
    ROOT,
  ),
  healthMigration: new URL(
    "backend/supabase/migrations/20260920081500_phase15_reconcile_storage_health_and_cleanup_v1.sql",
    ROOT,
  ),
  reassertPurge: new URL(
    "backend/supabase/migrations/20260920081600_phase15_reassert_current_purge_contract_v1.sql",
    ROOT,
  ),
  retireSuperseded: new URL(
    "backend/supabase/migrations/20260920082000_phase15_retire_superseded_live_contracts_v1.sql",
    ROOT,
  ),
  closeSchemaParity: new URL(
    "backend/supabase/migrations/20260920082100_phase15_close_live_shaped_schema_parity_v1.sql",
    ROOT,
  ),
  runbook: new URL("docs/operations/econovaria-storage-lifecycle.md", ROOT),
};

const EXPECTED = Object.freeze({
  registrySha: "7bcda40cfba058b0a712782671ba91cb3c50b29adb1bbe105dfbf84998907ac3",
  registryCount: 207,
  fkSha: "fe88cafd56ca4c21ab3c1d34385e21f4c3d8be201eae44ee7f5539a34a98f329",
  fkCount: 456,
  orderSha: "19c4c6bf8e005c53c6dddfadcf63d5c5e955307a63d93b0343f48d73c4504897",
  orderCount: 206,
  finalizeCursor: 207,
});

async function text(path) {
  return readFile(path, "utf8");
}

function assertContains(source, value, label) {
  assert.ok(source.includes(value), `${label} must contain ${JSON.stringify(value)}`);
}

function assertNotContains(source, value, label) {
  assert.ok(!source.includes(value), `${label} must not contain ${JSON.stringify(value)}`);
}

test("canonical Edge Function inventory registers both custom-auth workers", async () => {
  const manifest = JSON.parse(await text(paths.manifest));
  const bySlug = new Map(manifest.canonicalFunctions.map((entry) => [entry.slug, entry]));

  for (const [slug, entrypoint] of [
    ["stock-tick-archiver", "backend/supabase/functions/stock-tick-archiver/index.ts"],
    ["game-data-purger", "backend/supabase/functions/game-data-purger/index.ts"],
  ]) {
    const entry = bySlug.get(slug);
    assert.ok(entry, `${slug} must be canonical`);
    assert.equal(entry.entrypoint, entrypoint);
    assert.equal(entry.verifyJwt, false);
    assert.match(entry.authorizationModel, /scheduler|vault/i);
  }

  const config = await text(paths.config);
  assert.match(config, /\[functions\.stock-tick-archiver\]\s*\nverify_jwt = false/u);
  assert.match(config, /\[functions\.game-data-purger\]\s*\nverify_jwt = false/u);
});

test("stock archival requires verified R2 content before source deletion", async () => {
  const archiver = await text(paths.archiver);
  for (const required of [
    "prepare_next_stock_tick_archive",
    "register_verified_stock_tick_archive",
    "purge_verified_stock_tick_archive",
    'method: "HEAD"',
    'method: "GET"',
    "r2_sha256_mismatch",
    'codec: "SNAPPY"',
    "game_session=",
  ]) {
    assertContains(archiver, required, "stock-tick-archiver");
  }

  assertNotContains(archiver, "R2_SECRET_ACCESS_KEY=", "stock-tick-archiver");
  assertNotContains(archiver, "BEGIN PRIVATE KEY", "stock-tick-archiver");
});

test("purge worker and SQL share the current deterministic Story-aware contract", async () => {
  const purger = await text(paths.purger);
  const internal = await text(paths.purgeInternal);
  const reasserted = await text(paths.reassertPurge);
  const phase11Contract = await text(paths.phase11Contract);
  const runbook = await text(paths.runbook);

  for (const source of [purger, internal, phase11Contract, runbook]) {
    assertContains(source, EXPECTED.registrySha, "purge contract");
    assertContains(source, EXPECTED.fkSha, "purge contract");
    assertContains(source, EXPECTED.orderSha, "purge contract");
  }

  assert.match(purger, new RegExp(`EXPECTED_REGISTRY_TABLES = ${EXPECTED.registryCount}`));
  assert.match(purger, new RegExp(`EXPECTED_FK_GRAPH_EDGES = ${EXPECTED.fkCount}`));
  assert.match(purger, new RegExp(`EXPECTED_DELETE_ORDER_TABLES = ${EXPECTED.orderCount}`));
  assert.match(purger, new RegExp(`DB_FINALIZE_CURSOR = ${EXPECTED.finalizeCursor}`));
  assertContains(internal, `v_registry_count <> ${EXPECTED.registryCount}`, "purge SQL");
  assertContains(internal, `v_edge_count <> ${EXPECTED.fkCount}`, "purge SQL");
  assertContains(internal, `v_order_count <> ${EXPECTED.orderCount}`, "purge SQL");
  assertContains(internal, `db_delete_cursor < ${EXPECTED.finalizeCursor}`, "purge SQL");
  assertContains(reasserted, "'environmentName', v_control.environment_name", "purge preflight");
  assertContains(reasserted, "'r2BucketName', v_control.r2_bucket_name", "purge preflight");
  assertContains(reasserted, "GAME_PURGE_EXECUTION_IN_PROGRESS", "purge environment binding");
  assertContains(reasserted, "v_expected_prefix", "purge R2 binding");
  assertContains(reasserted, "db_delete_token_hash = null", "purge failure recovery");
  assertContains(purger, "assertPurgeRuntimeBinding", "purge worker");
});

test("active reconciliation migrations are environment-neutral and non-arming", async () => {
  const migrations = await Promise.all([
    paths.stockMigration,
    paths.candleMigration,
    paths.purgeFoundation,
    paths.purgeInternal,
    paths.purgeOperator,
    paths.healthMigration,
    paths.reassertPurge,
  ].map(text));
  const combined = migrations.join("\n");

  for (const projectRef of ["cgiukdjwicykrmtkhudh", "eecvbssdvarfcykcfrny"]) {
    assertNotContains(combined, projectRef, "active reconciliation migrations");
  }
  assertNotContains(combined, "R2_ACCESS_KEY_ID=", "active reconciliation migrations");
  assertNotContains(combined, "R2_SECRET_ACCESS_KEY=", "active reconciliation migrations");
  assertNotContains(combined, "insert into public.staff_permission_grants", "active reconciliation migrations");
  assertNotContains(combined, "vacuum full", "active reconciliation migrations");

  const foundation = migrations[2];
  assert.match(
    foundation,
    /values \(\s*true,\s*null,\s*null,\s*null,\s*null,\s*null,\s*clock_timestamp\(\)\s*\)/u,
    "purge foundation must initialize environment, bucket, and lever fields to NULL",
  );
  assertContains(foundation, "arm_id = null", "purge foundation");
  assertContains(foundation, "configure_game_data_purge_environment_v1", "purge foundation");

  const operator = migrations[4];
  assertContains(operator, "ARM GAME DATA PURGE FOR 2 HOURS", "purge operator controls");
  assertContains(operator, "interval '7 days'", "purge operator controls");
  assertContains(operator, "interval '60 seconds'", "purge operator controls");
  assertContains(operator, "interval '30 minutes'", "purge operator controls");
});

test("bounded retention and health monitoring remain explicit", async () => {
  const stock = await text(paths.stockMigration);
  const candle = await text(paths.candleMigration);
  const health = await text(paths.healthMigration);

  assertContains(stock, "interval '4 hours'", "stock archive migration");
  assertContains(stock, "econovaria-stock-tick-archive-retention-v1", "stock archive migration");
  assertContains(candle, "interval '48 hours'", "candle retention migration");
  assertContains(candle, "interval '30 days'", "candle retention migration");
  assertContains(health, "interval '7 days'", "runtime history migration");
  assertContains(health, "databaseWarningMiB", "storage health migration");
  assertContains(health, "required storage/lifecycle cron missing", "storage health migration");
});

test("live parity exporters normalize only non-semantic physical identities", async () => {
  const schema = await text(paths.schemaExporter);
  const catalog = await text(paths.catalogExporter);

  assertNotContains(schema, "'ordinalPosition'", "effective schema exporter");
  assertContains(schema, "'game_purge_guard_dynamic_v1'", "effective schema exporter");
  assertContains(catalog, "'game_purge_guard_dynamic_v1'", "runtime catalog exporter");
  assertContains(
    catalog,
    "p.proname !~ '^game_purge_guard_[0-9]+_[0-9]+_v1$' and not exists",
    "runtime catalog exporter",
  );
  assertNotContains(catalog, "\\n", "runtime catalog exporter");
  assert.equal(
    catalog.match(/^rollback;$/gmu)?.length,
    1,
    "runtime catalog exporter must close exactly one read-only transaction",
  );
  assert.equal(
    schema.match(/p\.proname !~ '\^game_purge_guard_/gu)?.length,
    3,
    "dynamic purge guards must be excluded only from definitions, owners, and grants",
  );
});

test("superseded live aliases are retired without weakening current contracts", async () => {
  const retirement = await text(paths.retireSuperseded);

  for (const routine of [
    "assert_active_game_admin_v1",
    "issue_game_data_purge_confirmation_v1",
    "confirm_game_data_purge_v1",
    "configure_stock_tick_archive_retention_v2",
  ]) {
    assertContains(retirement, `drop function if exists ${routine === "assert_active_game_admin_v1" ? "private" : "public"}.${routine}`, "retirement migration");
  }
  assertContains(retirement, "revoke usage on schema public from public", "retirement migration");
  assertNotContains(retirement, "drop function if exists public.execute_game_data_purge_db_batch_v2", "retirement migration");
});

test("final live-shaped parity correction is additive and reasserts the canonical candle overload", async () => {
  const migration = await text(paths.closeSchemaParity);

  for (const column of ["review_manifest jsonb", "review_sha256 text", "review_generated_at timestamptz"]) {
    assertContains(migration, `add column if not exists ${column}`, "schema parity migration");
  }
  assertContains(
    migration,
    "create or replace function private.upsert_stock_price_candles(",
    "schema parity migration",
  );
  assertContains(migration, "union all select '1d', interval '1 day'", "canonical candle overload");
  assertNotContains(migration, "drop column", "schema parity migration");
  assertNotContains(migration, "drop function", "schema parity migration");
  assertNotContains(migration, "cron.schedule", "schema parity migration");
});
