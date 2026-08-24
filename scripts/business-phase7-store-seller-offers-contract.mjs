#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  migration: path.join(
    root,
    "backend/supabase/migrations/20260824100000_store_seller_offer_foundation_v2.sql",
  ),
  compatibility: path.join(
    root,
    "backend/supabase/migrations/20260824100010_store_seeded_offer_compatibility_v2.sql",
  ),
  commands: path.join(
    root,
    "backend/supabase/migrations/20260824100020_store_seller_offer_commands_v2.sql",
  ),
  aggregation: path.join(
    root,
    "backend/supabase/migrations/20260824100030_store_seller_offer_aggregation_v2.sql",
  ),
  assertions: path.join(
    root,
    "backend/supabase/migrations/20260824100040_store_seller_offer_schema_assertions_v2.sql",
  ),
  scope: path.join(
    root,
    "docs/roadmaps/business-phase7-store-seller-offers-scope-v1.md",
  ),
  contracts: path.join(
    root,
    "backend/src/domains/store/contracts/storeSellerOfferContracts.ts",
  ),
  repository: path.join(
    root,
    "backend/src/domains/store/infrastructure/supabaseStoreSellerOfferRepository.ts",
  ),
  storeIndex: path.join(root, "backend/src/domains/store/index.ts"),
};

for (const [label, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`Missing Phase 7A ${label}: ${file}`);
}

const migration = [
  files.migration,
  files.compatibility,
  files.commands,
  files.aggregation,
].map((file) => fs.readFileSync(file, "utf8")).join("\n");
const lower = migration.toLowerCase();
const assertions = fs.readFileSync(files.assertions, "utf8");
const scope = fs.readFileSync(files.scope, "utf8");
const contracts = fs.readFileSync(files.contracts, "utf8");
const repository = fs.readFileSync(files.repository, "utf8");
const storeIndex = fs.readFileSync(files.storeIndex, "utf8");

function requireTokens(source, label, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`${label} missing: ${token}`);
  }
}

function forbidTokens(source, label, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) {
      throw new Error(`${label} contains forbidden token: ${token}`);
    }
  }
}

requireTokens(migration, "Store seller-offer schema", [
  "create table public.store_seller_offers",
  "default ('sof_' || encode(gen_random_bytes(16), 'hex'))",
  "references public.store_items(game_session_id, id)",
  "references public.game_items(game_session_id, id)",
  "references public.economic_parties(game_session_id, id)",
  "references public.inventory_accounts(game_session_id, id)",
  "seller_kind in ('seeded','npc','business')",
  "status in ('draft','active','paused','retired')",
  "store_seller_offers_active_custody_check",
  "store_seller_offers_business_current_unique",
  "store_seller_offers_active_account_unique",
  "store_seller_offers_idempotency_unique",
]);

requireTokens(migration, "Store seller-offer guard", [
  "guard_store_seller_offer_v2",
  "STORE_SELLER_OFFER_CATALOG_IDENTITY_MISMATCH",
  "STORE_SELLER_OFFER_CURRENCY_MISMATCH",
  "STORE_SELLER_OFFER_BUSINESS_PARTY_INVALID",
  "STORE_SELLER_OFFER_BUSINESS_UNAVAILABLE",
  "STORE_SELLER_OFFER_CUSTODY_ACCOUNT_INVALID",
  "account_kind <> 'store_stock'",
  "STORE_SELLER_OFFER_IDENTITY_IMMUTABLE",
  "STORE_SELLER_OFFER_CUSTODY_BINDING_IMMUTABLE",
  "STORE_SELLER_OFFER_VERSION_INVALID",
  "STORE_SELLER_OFFER_RETIRED_TERMINAL",
  "STORE_SELLER_OFFER_TRANSITION_INVALID",
]);

requireTokens(migration, "Seeded compatibility convergence", [
  "sync_seeded_store_seller_offer_v2",
  "seller_kind = 'seeded'",
  "'canonical_supply'",
  "compatibilitySource",
  "on public.store_items",
  "version = public.store_seller_offers.version + 1",
]);

requireTokens(migration, "Business draft authority", [
  "create_business_store_offer_draft_v2",
  "business_products",
  "product_kind = 'physical_good'",
  "output_game_item_id = v_store_item.game_item_id",
  "pg_advisory_xact_lock",
  "STORE_SELLER_OFFER_IDEMPOTENCY_CONFLICT",
  "STORE_SELLER_OFFER_BUSINESS_CURRENT_EXISTS",
  "'alreadyCreated', true",
  "'alreadyCreated', false",
]);

requireTokens(migration, "Optimistic mutation authority", [
  "mutate_store_seller_offer_v2",
  "for update",
  "STORE_SELLER_OFFER_VERSION_CONFLICT",
  "p_expected_version",
  "version = offer_row.version + 1",
  "inventoryBound",
]);

requireTokens(migration, "Canonical multi-offer aggregation", [
  "read_store_catalog_offer_groups_v2",
  "coalesce(holding.quantity_owned, 0)",
  "coalesce(holding.quantity_reserved, 0)",
  "partition by row_value.game_item_id",
  "min(ranked.unit_price) filter (where ranked.available_quantity > 0)",
  "count(distinct ranked.seller_party_id)",
  "jsonb_agg",
  "'offerKey'",
  "'sellerKey'",
  "'availableQuantity'",
]);

requireTokens(migration, "Service-only boundary", [
  "force row level security",
  "revoke all on table public.store_seller_offers",
  "from public, anon, authenticated",
  "grant execute on function public.create_business_store_offer_draft_v2",
  "grant execute on function public.mutate_store_seller_offer_v2",
  "grant execute on function public.read_store_catalog_offer_groups_v2",
  "to service_role",
]);

forbidTokens(lower, "Phase 7A canonical-authority reuse", [
  "create table public.game_items",
  "create table if not exists public.game_items",
  "create table public.inventory_accounts",
  "create table if not exists public.inventory_accounts",
  "create table public.inventory_holdings",
  "create table if not exists public.inventory_holdings",
  "create table public.ledger_entries",
  "create table if not exists public.ledger_entries",
  "create table public.store_purchase_quotes",
  "create table public.store_purchases",
  "create table public.business_store_offers",
]);

forbidTokens(lower, "Phase 7A settlement exclusions", [
  "purchase_quoted_store_item_public_v1",
  "post_store_purchase_inventory_v2",
  "finished_goods -> store",
  "withdrawal_pending",
  "withdrawal_effective_at",
  "credit_business",
  "ipo",
]);

requireTokens(assertions, "Phase 7A schema assertions", [
  "STORE_SELLER_OFFER_SCHEMA_MISSING",
  "STORE_SELLER_OFFER_COLUMN_MISSING",
  "STORE_SELLER_OFFER_CONSTRAINT_MISSING",
  "STORE_SELLER_OFFER_INDEX_MISSING",
  "STORE_SELLER_OFFER_GUARD_TRIGGER_MISSING",
  "STORE_SELLER_OFFER_COMPATIBILITY_TRIGGER_MISSING",
  "STORE_SELLER_OFFER_RLS_NOT_FORCED",
  "STORE_SELLER_OFFER_BROWSER_FUNCTION_PRIVILEGE_FORBIDDEN",
  "STORE_SELLER_OFFER_SEEDED_BACKFILL_INCOMPLETE",
]);

requireTokens(scope, "Phase 7A scope lock", [
  "Status:** IN PROGRESS",
  "Checkpoint 7A — seller-offer identity and aggregation foundation",
  "Available quantity is never browser-authored",
  "existing Player Store reads, quotes, and purchases continue",
  "buyer payment or inventory settlement",
  "Database replay from zero twice",
]);

requireTokens(contracts, "Typed Store seller-offer contracts", [
  "StoreSellerKind",
  "StoreCatalogOfferGroupDto",
  "StoreSellerOfferRepository",
  "parseStoreCatalogOfferGroupRow",
  "best_unit_price must match",
  "total_available_quantity must match",
  "seller_count must match",
]);

requireTokens(repository, "Typed Store seller-offer repository", [
  "SupabaseStoreSellerOfferRepository",
  "read_store_catalog_offer_groups_v2",
  "p_game_session_id",
  "parseStoreCatalogOfferGroupRow",
]);

requireTokens(storeIndex, "Store domain export", [
  "./contracts/storeSellerOfferContracts.ts",
  "./infrastructure/supabaseStoreSellerOfferRepository.ts",
]);

console.log("Business Phase 7A Store seller-offer authority contract: PASS");
