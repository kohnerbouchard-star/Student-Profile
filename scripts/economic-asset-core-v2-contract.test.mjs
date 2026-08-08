#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const migrations = [
  "20260806120000_add_economic_asset_identity_and_accounts_v2.sql",
  "20260806120010_add_economic_asset_context_resolvers_v2.sql",
  "20260806120020_backfill_economic_asset_catalog_v2.sql",
  "20260806120030_enforce_economic_asset_constraints_v2.sql",
  "20260806120040_add_economic_asset_projection_context_triggers_v2.sql",
  "20260806120050_add_economic_asset_runtime_compatibility_triggers_v2.sql",
  "20260806120055_repair_store_source_identity_resolution_v2.sql",
  "20260806120060_add_economic_asset_sync_gate_v2.sql",
  "20260806120100_add_canonical_inventory_posting_v2.sql",
  "20260806120110_cutover_store_settlement_v2.sql",
  "20260806120120_cutover_crafting_read_v2.sql",
  "20260806120125_decouple_inventory_reservations_from_store_identity_v2.sql",
  "20260806120130_cutover_crafting_start_v2.sql",
  "20260806120140_cutover_crafting_cancel_claim_v2.sql",
  "20260806120150_cutover_inventory_effects_salvage_v2.sql",
  "20260806120200_add_business_material_flow_foundation_v2.sql",
  "20260806120210_cutover_business_production_v2.sql",
  "20260806120220_add_business_cogs_helper_v2.sql",
  "20260806120230_cutover_business_settlement_v2.sql",
  "20260806120300_integrate_seed_catalog_with_economic_core_v2.sql",
  "20260806120400_add_marketplace_redemption_canonical_context_v2.sql",
  "20260806120410_add_economic_asset_integrity_validator_v2.sql",
  "20260806120420_harden_inventory_journal_append_only_v2.sql",
  "20260806120430_repair_seed_and_supply_canonical_identity_v2.sql",
  "20260806120440_repair_seed_store_rollback_compatibility_v2.sql",
  "20260806120450_finalize_seed_store_rollback_ordering_v2.sql",
];

const sources = new Map(await Promise.all(migrations.map(async (name) => {
  const value = await readFile(path.join(root, "backend/supabase/migrations", name), "utf8");
  return [name, value];
})));
const joined = [...sources.values()].join("\n");

function source(name) {
  const value = sources.get(name);
  assert.ok(value, `Missing migration ${name}`);
  return value;
}

function functionBody(sql, functionName) {
  const marker = new RegExp(`create\\s+or\\s+replace\\s+function\\s+(?:public|economy_private)\\.${functionName}\\b`, "iu");
  const start = sql.search(marker);
  assert.notEqual(start, -1, `Missing function ${functionName}`);
  const fragment = sql.slice(start);
  const tagMatch = fragment.match(/as\s+(\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/iu);
  assert.ok(tagMatch, `Missing body delimiter for ${functionName}`);
  const bodyStart = tagMatch.index + tagMatch[0].length;
  const bodyEnd = fragment.indexOf(tagMatch[1], bodyStart);
  assert.notEqual(bodyEnd, -1, `Unclosed body for ${functionName}`);
  return fragment.slice(bodyStart, bodyEnd);
}

function assertContains(value, pattern, message) {
  assert.match(value, pattern, message);
}

function assertNotContains(value, pattern, message) {
  assert.doesNotMatch(value, pattern, message);
}

test("migration manifest is ordered, unique, and transaction bounded", () => {
  assert.equal(new Set(migrations).size, migrations.length);
  assert.deepEqual([...migrations].sort(), migrations);
  assert.equal(migrations.length, 26);
  assert.equal(migrations.at(-1), "20260806120450_finalize_seed_store_rollback_ordering_v2.sql");
  for (const [name, sql] of sources) {
    const withoutLeadingComments = sql.replace(/^(?:\s*--[^\n]*\n)*/u, "").trimStart();
    assert.ok(withoutLeadingComments.startsWith("begin;"), `${name} must begin transactionally`);
    assert.ok(sql.trimEnd().endsWith("commit;"), `${name} must end in COMMIT`);
    const tags = new Map();
    for (const match of sql.matchAll(/\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$/gu)) {
      tags.set(match[0], (tags.get(match[0]) ?? 0) + 1);
    }
    for (const [tag, count] of tags) {
      assert.equal(count % 2, 0, `${name} has unbalanced ${tag}`);
    }
  }
});

test("canonical item, party, account, holding, and journal authorities are explicit", () => {
  for (const table of [
    "game_items",
    "economic_parties",
    "inventory_accounts",
    "inventory_transactions",
    "inventory_transaction_lines",
    "business_product_inputs",
    "business_product_outputs",
  ]) {
    assertContains(joined, new RegExp(`create table if not exists public\\.${table}\\b`, "iu"), `Missing ${table}`);
  }
  assertContains(joined, /unique\s*\(game_session_id,\s*canonical_key\)/iu);
  assertContains(joined, /inventory_holdings_account_item_unique/iu);
  assertContains(joined, /INVENTORY_TRANSACTION_DELETE_FORBIDDEN/iu);
  assertContains(joined, /INVENTORY_TRANSACTION_LINE_IMMUTABLE/iu);
  assertContains(joined, /store_item_id becomes optional acquisition provenance|Optional legacy acquisition provenance/iu);
});

test("Store settlement preserves public signatures and posts both canonical sides", () => {
  const sql = source("20260806120110_cutover_store_settlement_v2.sql");
  for (const name of ["purchase_quoted_store_item", "purchase_quoted_store_item_public_v1"]) {
    assertContains(sql, new RegExp(`create or replace function public\\.${name}\\b`, "iu"));
  }
  const body = functionBody(sql, "purchase_quoted_store_item");
  assertContains(body, /record_player_ledger_entry/iu);
  assertContains(body, /post_inventory_transaction_v2/iu);
  assertContains(body, /v_item\.inventory_account_id/iu);
  assertContains(body, /v_player_account_id/iu);
  assertContains(body, /'store_stock'/iu);
});

test("Crafting resolves, reserves, consumes, and grants canonical items", () => {
  const sql = [
    source("20260806120120_cutover_crafting_read_v2.sql"),
    source("20260806120130_cutover_crafting_start_v2.sql"),
    source("20260806120140_cutover_crafting_cancel_claim_v2.sql"),
    source("20260806120150_cutover_inventory_effects_salvage_v2.sql"),
  ].join("\n");
  for (const name of [
    "read_player_crafting_v1",
    "start_player_crafting_job_v1",
    "cancel_player_crafting_job_v1",
    "claim_player_crafting_job_v1",
    "use_player_inventory_item_effect_v1",
    "salvage_player_equipment_v1",
  ]) {
    assertContains(sql, new RegExp(`create or replace function public\\.${name}\\b`, "iu"));
  }
  assertContains(sql, /game_items/iu);
  assertContains(sql, /inventory_account_id/iu);
  assertContains(sql, /post_inventory_transaction_v2/iu);
  assertContains(sql, /store_item_id\s*=\s*null/iu, "Crafted output must not require a Store offer");
  assertNotContains(sql, /regexp_replace\([^\n]*\^beta-/iu, "Runtime identity must not strip Store prefixes");
});

test("Business procurement, production, and settlement carry material basis once", () => {
  const foundation = source("20260806120200_add_business_material_flow_foundation_v2.sql");
  const production = source("20260806120210_cutover_business_production_v2.sql");
  const settlement = source("20260806120230_cutover_business_settlement_v2.sql");
  for (const name of [
    "configure_business_product_material_flow_v2",
    "contribute_player_inventory_to_business_v2",
    "purchase_business_input_v1",
  ]) {
    assertContains(foundation, new RegExp(`create or replace function public\\.${name}\\b`, "iu"));
  }
  assertContains(foundation, /'capitalized',\s*true/iu);
  const productionBody = functionBody(production, "run_business_production_v1");
  assertContains(productionBody, /-v_labor_cost/iu, "Production must debit newly incurred labor");
  assertNotContains(productionBody, /record_player_ledger_entry[\s\S]{0,900}-v_input_cost/iu, "Production must not repay carried material basis");
  assertNotContains(productionBody, /record_player_ledger_entry[\s\S]{0,900}-v_total_cost/iu, "Production must not debit total cost including material basis");
  assertContains(productionBody, /business_product_inputs/iu);
  assertContains(productionBody, /production_output_granted/iu);
  assertContains(settlement, /cost_of_goods_sold/iu);
  assertContains(settlement, /consume_business_finished_inventory_v2/iu);
});

test("Seed import keeps its public RPC and uses explicit source item identity", () => {
  const sql = source("20260806120300_integrate_seed_catalog_with_economic_core_v2.sql");
  assertContains(sql, /rename to apply_seed_content_release_legacy_v1/iu);
  assertContains(sql, /create or replace function public\.apply_seed_content_release_v1/iu);
  assertContains(sql, /apply_seed_content_release_legacy_v1/iu);
  assertContains(sql, /sync_game_item_catalog_v2\(\s*p_game_session_id,\s*p_store_items/iu);
  assertContains(source("20260806120060_add_economic_asset_sync_gate_v2.sql"), /sourceItemStableId/iu);
  assertContains(source("20260806120430_repair_seed_and_supply_canonical_identity_v2.sql"), /promote_store_game_item_key_v2/iu);
});

test("Seed rollback removes synthetic Store stock before deleting the Store row and its account after", () => {
  const sql = source("20260806120450_finalize_seed_store_rollback_ordering_v2.sql");
  const beforeBody = functionBody(sql, "release_history_free_store_stock_projection_v2");
  const afterBody = functionBody(sql, "cleanup_history_free_store_stock_account_v2");
  assertContains(beforeBody, /inventory_transaction_lines/iu, "Canonical journal history must block hard Store deletion");
  assertContains(beforeBody, /errcode\s*=\s*'23503'/iu, "Journal-backed Store rows must use the legacy soft-rollback path");
  assertContains(beforeBody, /delete from public\.inventory_holdings/iu, "History-free synthetic Store stock must be removable before Store deletion");
  assertNotContains(beforeBody, /delete from public\.inventory_accounts/iu, "The Store row still references its stock account during BEFORE DELETE");
  assertContains(afterBody, /delete from public\.inventory_accounts/iu, "The per-Store stock account must be cleaned only after Store deletion");
  assertContains(beforeBody, /account_kind\s*=\s*'store_stock'/iu);
  assertContains(beforeBody, /location_key\s*=\s*'store_item:'/iu);
  assertContains(beforeBody, /holding\.player_id\s+is\s+null/iu);
  assertContains(sql, /before delete on public\.store_items/iu);
  assertContains(sql, /after delete on public\.store_items/iu);
});

test("Marketplace and redemption gain canonical context without replacing public workflows", () => {
  const sql = source("20260806120400_add_marketplace_redemption_canonical_context_v2.sql");
  for (const table of [
    "marketplace_listings",
    "marketplace_purchase_reservations",
    "marketplace_orders",
    "inventory_redemption_requests",
  ]) {
    assertContains(sql, new RegExp(`alter table public\\.${table}\\b`, "iu"));
  }
  assertContains(sql, /reason_type,\s*source_id,\s*quantity,\s*status/iu);
  assertContains(sql, /'redemption'/iu);
  assertNotContains(sql, /create or replace function public\.(?:create|activate|cancel|reserve|settle|refund|review|request|read).*marketplace/iu);
});

test("database validator covers every migrated economic boundary", () => {
  const sql = source("20260806120410_add_economic_asset_integrity_validator_v2.sql");
  assertContains(sql, /create or replace function public\.validate_economic_asset_core_v2/iu);
  for (const marker of [
    "storeContextMissing",
    "recipeInputsMissing",
    "holdingsInvalid",
    "reservationsInvalid",
    "businessProductsInvalid",
    "marketplaceContextMissing",
    "redemptionContextMissing",
    "transactionsInvalid",
  ]) {
    assertContains(sql, new RegExp(marker, "u"));
  }
});

test("Player inventory reads canonical metadata without serializing canonical UUIDs", async () => {
  const contracts = await readFile(path.join(root, "backend/src/domains/inventory/contracts/playerInventoryReadContracts.ts"), "utf8");
  const repository = await readFile(path.join(root, "backend/src/domains/inventory/infrastructure/supabasePlayerInventoryReadRepository.ts"), "utf8");
  const service = await readFile(path.join(root, "backend/src/domains/inventory/services/playerInventoryReadService.ts"), "utf8");
  assertContains(contracts, /internalGameItemUuid:\s*string/iu);
  assertContains(contracts, /internalStoreItemUuid:\s*string\s*\|\s*null/iu);
  assertContains(repository, /from\("game_items"\)/iu);
  assertContains(repository, /canonical_key/iu);
  assertContains(repository, /itemStatus:\s*requireGameItemStatus\(item\.status\)/iu);
  assertContains(service, /storeItemId:\s*publicItemId/iu);
  assertContains(service, /itemKey:\s*publicItemId/iu);
  assertNotContains(service, /internalGameItemUuid/iu);
});
