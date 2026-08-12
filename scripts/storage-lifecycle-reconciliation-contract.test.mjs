import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const paths = {
  config: new URL("backend/supabase/config.toml", ROOT),
  manifest: new URL("backend/supabase/edge-function-manifest.json", ROOT),
  archiver: new URL("backend/supabase/functions/stock-tick-archiver/index.ts", ROOT),
  purger: new URL("backend/supabase/functions/game-data-purger/index.ts", ROOT),
  stockMigration: new URL(
    "backend/supabase/migrations/20260813100000_reconcile_stock_tick_archive_lifecycle_v1.sql",
    ROOT,
  ),
  candleMigration: new URL(
    "backend/supabase/migrations/20260813101000_reconcile_stock_candle_retention_v1.sql",
    ROOT,
  ),
  purgeFoundation: new URL(
    "backend/supabase/migrations/20260813102000_reconcile_game_license_purge_foundation_v1.sql",
    ROOT,
  ),
  purgeInternal: new URL(
    "backend/supabase/migrations/20260813103000_reconcile_game_purge_internal_contracts_v1.sql",
    ROOT,
  ),
  purgeOperator: new URL(
    "backend/supabase/migrations/20260813104000_reconcile_game_purge_operator_controls_v1.sql",
    ROOT,
  ),
  healthMigration: new URL(
    "backend/supabase/migrations/20260813105000_reconcile_storage_health_and_cleanup_v1.sql",
    ROOT,
  ),
  runbook: new URL("docs/operations/econovaria-storage-lifecycle.md", ROOT),
};

const EXPECTED = Object.freeze({
  registrySha: "6eb63825741b7118bc5acdc2ecef45101e7963b502ee3b0daf2b5f05a33d3f31",
  registryCount: 135,
  fkSha: "0f48f84c8fd0e71f2cbbfba90f2ded8bba0e6b0a8842e92add335dabb4314840",
  fkCount: 216,
  orderSha: "8c60cbaf1ad690cfaf1f360148fb36035ec6492e232c8d8fc3d642961ecf4a0a",
  orderCount: 131,
  finalizeCursor: 132,
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
  const runbook = await text(paths.runbook);

  for (const source of [purger, internal, runbook]) {
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
  assertContains(purger, "preflight_environment_not_configured", "purge worker");
});

test("active reconciliation migrations are environment-neutral and non-arming", async () => {
  const migrations = await Promise.all([
    paths.stockMigration,
    paths.candleMigration,
    paths.purgeFoundation,
    paths.purgeInternal,
    paths.purgeOperator,
    paths.healthMigration,
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
  assertContains(foundation, "environment_name = null", "purge foundation");
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
