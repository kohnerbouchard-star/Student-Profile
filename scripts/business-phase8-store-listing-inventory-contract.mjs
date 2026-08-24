#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = {
  poster: "backend/supabase/migrations/20260824110000_business_store_listing_inventory_poster_v2.sql",
  commands: "backend/supabase/migrations/20260824110010_business_store_listing_inventory_commands_v2.sql",
  projection: "backend/supabase/migrations/20260824110015_business_store_listing_inventory_projection_v2.sql",
  assertions: "backend/supabase/migrations/20260824110020_business_store_listing_inventory_assertions_v2.sql",
  contracts: "backend/src/domains/store/contracts/storeListingInventoryContracts.ts",
  repository: "backend/src/domains/store/infrastructure/supabaseStoreListingInventoryRepository.ts",
  index: "backend/src/domains/store/index.ts",
  scope: "docs/roadmaps/business-phase8-store-listing-inventory-scope-v1.md",
  workflow: ".github/workflows/business-store-listing-inventory-v2.yml",
};

const source = Object.fromEntries(
  Object.entries(files).map(([key, relativePath]) => {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing Phase 8A artifact: ${relativePath}`);
    }
    return [key, fs.readFileSync(absolutePath, "utf8")];
  }),
);

function requireTokens(text, label, tokens) {
  for (const token of tokens) {
    if (!text.includes(token)) {
      throw new Error(`${label} is missing required token: ${token}`);
    }
  }
}

function forbidTokens(text, label, tokens) {
  for (const token of tokens) {
    if (text.includes(token)) {
      throw new Error(`${label} contains excluded token: ${token}`);
    }
  }
}

requireTokens(source.poster, "Canonical Inventory poster extension", [
  "create or replace function economy_private.post_inventory_transaction_v2",
  "v_party.party_kind not in ('store','business')",
  "INVENTORY_TRANSACTION_BUSINESS_STORE_PROVENANCE_INVALID",
  "INVENTORY_TRANSACTION_BUSINESS_STORE_SCOPE_MISMATCH",
  "offer_row.inventory_account_id = v_account_id",
  "offer_row.seller_party_id = v_party.id",
  "offer_row.game_item_id = v_game_item_id",
  "offer_row.status <> 'retired'",
  "store_item_id",
  "average_unit_cost",
  "inventory_transactions_idempotency_unique",
]);
requireTokens(source.poster, "Retained seeded Store compatibility", [
  "v_party.party_kind not in ('store','business')",
  "v_store_item.inventory_account_id is distinct from v_account_id",
  "INVENTORY_TRANSACTION_STORE_SCOPE_MISMATCH",
]);

requireTokens(source.commands, "Business Store-listing account guard", [
  "guard_business_store_listing_account_v2",
  "^store_offer:sof_[0-9a-f]{32}$",
  "STORE_LISTING_ACCOUNT_IDENTITY_IMMUTABLE",
  "new.metadata->>'offerKey'",
  "new.metadata->>'businessKey'",
  "business_store_listing_v2",
]);
requireTokens(source.commands, "Deterministic listing account", [
  "ensure_business_store_listing_account_v2",
  "'store_offer:' || v_offer.public_key",
  "'store_stock'",
  "on conflict",
  "STORE_LISTING_ACCOUNT_UNAVAILABLE",
]);

requireTokens(source.projection, "Service-only stock command", [
  "create or replace function public.stock_business_store_offer_v2",
  "STORE_LISTING_STOCK_REQUEST_INVALID",
  "STORE_LISTING_STOCK_IDEMPOTENCY_CONFLICT",
  "STORE_LISTING_STOCK_OFFER_VERSION_CONFLICT",
  "STORE_LISTING_STOCK_INSUFFICIENT_FINISHED_GOODS",
  "quantity_owned - v_source_holding.quantity_reserved",
  "economy_private.ensure_business_inventory_account_v2",
  "'finished_goods'",
  "economy_private.post_inventory_transaction_v2",
  "'transfer'",
  "'business_store'",
  "'stock_offer'",
  "'finished_goods_source'",
  "'store_listing_destination'",
  "v_source_holding.average_unit_cost",
  "v_source_holding.cost_currency_code",
  "version = offer_row.version + 1",
  "'replayed', true",
  "'replayed', false",
]);
requireTokens(source.projection, "Finished Goods projection convergence", [
  "public.business_inventory%rowtype",
  "inventory_row.inventory_kind = 'finished_good'",
  "STORE_LISTING_STOCK_FINISHED_PROJECTION_MISSING",
  "STORE_LISTING_STOCK_FINISHED_PROJECTION_MISMATCH",
  "STORE_LISTING_STOCK_REPLAY_FINISHED_PROJECTION_MISMATCH",
  "quantity = v_source_holding_after.quantity_owned",
  "unit_cost = v_source_holding_after.average_unit_cost",
  "total_cost_basis = round(",
  "STORE_LISTING_STOCK_FINISHED_PROJECTION_UPDATE_INVALID",
]);
requireTokens(source.projection, "Public-key-only result", [
  "'offerKey', v_offer.public_key",
  "'inventoryAccountKey', v_account.public_key",
  "'transactionKey'",
  "'listedQuantity'",
  "'availableQuantity'",
  "'averageUnitCost'",
  "'costCurrencyCode'",
]);
requireTokens(source.projection, "Service-role privilege boundary", [
  "revoke all on function public.stock_business_store_offer_v2",
  "from public, anon, authenticated",
  "to service_role",
]);

const replayIndex = source.projection.indexOf("select transaction_row.*");
const versionIndex = source.projection.indexOf(
  "if v_offer.version <> p_expected_offer_version then",
);
if (replayIndex < 0 || versionIndex < 0 || replayIndex > versionIndex) {
  throw new Error(
    "Idempotent replay must be resolved before rejecting the advanced offer version.",
  );
}
const projectionLockIndex = source.projection.indexOf(
  "from public.business_inventory as inventory_row",
  versionIndex,
);
const holdingLockIndex = source.projection.indexOf(
  "from public.inventory_holdings as holding_row",
  projectionLockIndex,
);
if (
  projectionLockIndex < 0 ||
  holdingLockIndex < 0 ||
  projectionLockIndex > holdingLockIndex
) {
  throw new Error(
    "Finished Goods projection must be locked before its canonical holding.",
  );
}

forbidTokens(
  `${source.poster}\n${source.commands}\n${source.projection}\n${source.assertions}`,
  "Checkpoint 8A migrations",
  [
    "withdraw_business_store_offer",
    "withdrawal_pending",
    "cooling_off",
    "buyer_account",
    "seller_cash",
    "cost_of_goods_sold",
    "create table public.business_store_listing",
    "grant execute on function public.stock_business_store_offer_v2(\n  uuid, text, text, integer, bigint, text\n) to authenticated",
  ],
);

requireTokens(source.assertions, "Phase 8A schema assertions", [
  "STORE_LISTING_CANONICAL_POSTER_MISSING",
  "STORE_LISTING_CANONICAL_POSTER_INCOMPLETE",
  "STORE_LISTING_ACCOUNT_GUARD_MISSING",
  "STORE_LISTING_STOCK_PRIVILEGE_BOUNDARY_INVALID",
  "STORE_LISTING_STOCK_FUNCTION_INCOMPLETE",
  "STORE_LISTING_STOCK_PROJECTION_SYNC_MISSING",
  "STORE_LISTING_PARALLEL_QUANTITY_FORBIDDEN",
  "STORE_LISTING_ACCOUNT_BACKFILL_INVALID",
]);

requireTokens(source.contracts, "Typed Store-listing contracts", [
  "StockBusinessStoreOfferCommand",
  "StockBusinessStoreOfferResult",
  "StoreListingInventoryRepository",
  "normalizeStockBusinessStoreOfferCommand",
  "parseStockBusinessStoreOfferResult",
  "inventoryAccountKey",
  "transactionKey",
  "averageUnitCost",
]);
requireTokens(source.repository, "Supabase Store-listing repository", [
  "SupabaseStoreListingInventoryRepository",
  "stock_business_store_offer_v2",
  "p_expected_offer_version",
  "p_idempotency_key",
  "store_listing_idempotency_conflict",
  "store_listing_version_conflict",
  "store_listing_insufficient_finished_goods",
]);
requireTokens(source.index, "Store-domain exports", [
  "storeListingInventoryContracts.ts",
  "supabaseStoreListingInventoryRepository.ts",
]);
requireTokens(source.scope, "Phase 8A scope lock", [
  "Status:** IN PROGRESS",
  "Checkpoint 8A makes a Business Store offer hold real canonical inventory",
  "It does not withdraw listed units and it does not sell them to a buyer",
  "Do not widen checkpoint 8A into withdrawal or buyer settlement",
]);
requireTokens(source.workflow, "Dedicated Phase 8A workflow", [
  "Business Store Listing Inventory V2",
  "business-phase8-store-listing-inventory-contract.mjs",
  "business-phase8-store-listing-inventory-simulation.mjs",
  "business-phase8-store-listing-inventory-types.mjs",
  "business-phase7-store-seller-offers-contract.mjs",
  "validate-supabase-migrations.mjs",
  "build-architecture-inventory.mjs",
  "test:player-store-public",
  "test:player-inventory",
  "npm run browser",
]);

console.log("Business Phase 8A Store-listing inventory contract: PASS");
