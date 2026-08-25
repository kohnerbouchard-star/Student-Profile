#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  scope:
    "docs/roadmaps/business-phase10-store-purchase-settlement-scope-v1.md",
  authority:
    "docs/architecture/business-phase10-store-purchase-settlement-authority-v1.md",
  contracts:
    "scripts/business-phase10-store-purchase-settlement-contracts.ts",
  simulation:
    "scripts/business-phase10-store-purchase-settlement-lock-simulation.mjs",
  types:
    "scripts/business-phase10-store-purchase-settlement-foundation-types.mjs",
  workflow:
    ".github/workflows/business-store-purchase-settlement-foundation-v2.yml",
  withdrawalFoundation:
    "backend/supabase/migrations/20260824120000_store_offer_withdrawal_foundation_v2.sql",
  withdrawalRequest:
    "backend/supabase/migrations/20260824120010_store_offer_withdrawal_request_command_v2.sql",
  withdrawalProcessor:
    "backend/supabase/migrations/20260824120020_store_offer_withdrawal_processor_v2.sql",
  retainedSettlement:
    "backend/supabase/migrations/20260806120110_cutover_store_settlement_v2.sql",
  automaticBusinessSettlement:
    "backend/supabase/migrations/20260806120230_cutover_business_settlement_v2.sql",
};

const source = Object.fromEntries(
  Object.entries(files).map(([label, relativePath]) => {
    const absolutePath = path.join(root, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing Phase 10A.1 ${label}: ${relativePath}`);
    }
    return [label, fs.readFileSync(absolutePath, "utf8")];
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
      throw new Error(`${label} contains excluded runtime token: ${token}`);
    }
  }
}

requireTokens(source.scope, "Phase 10A.1 scope", [
  "BUSINESS-V2-10A1",
  "authority foundation certified",
  "A later runtime settlement must create exactly one durable receipt",
  "spr_[0-9a-f]{32}",
  "The retained Player Store quote/purchase path is a seeded compatibility channel",
  "Buyer Checking debit equals the quote's final total price",
  "Business cash credit equals the same final total price",
  "purchase-first",
  "withdrawal-first",
  "does **not** authorize",
  "10A.2 — offer-aware quote authority",
  "10A.3 — atomic economic settlement",
]);

requireTokens(source.authority, "Phase 10A.1 authority audit", [
  "The Business seller-offer purchase path must be a new Store-owned economic authority",
  "The retained Player Store quote records",
  "It does not record a seller offer",
  "The purchase command must therefore lock the offer before any money or Inventory row",
  "Player transaction money is canonical Checking",
  "Business cash uses first-class Business account ownership",
  "The existing automatic `settle_business_cycle_v1` path",
  "Phase 11 must retire or redirect competing automatic physical-good sales",
  "All money, Inventory, offer, revenue, COGS, and evidence changes commit together or do not exist.",
]);

requireTokens(source.contracts, "Typed settlement foundation", [
  'BUSINESS_PHASE10_CHECKPOINT = "BUSINESS-V2-10A1"',
  "STORE_PURCHASE_SETTLEMENT_RECEIPT_KEY_PATTERN",
  "TrustedStorePurchaseSettlementScope",
  "StorePurchaseSettlementBrowserIntent",
  "StorePurchaseSettlementCommand",
  "StorePurchaseSettlementReceipt",
  "normalizeStorePurchaseSettlementCommand",
  "parseStorePurchaseSettlementReceipt",
  "assertStorePurchaseSettlementLockOrder",
  '"seller_offer"',
  '"store_listing_holding"',
  '"buyer_checking"',
  '"business_cash"',
  '"buyer_inventory"',
  '"economic_posting"',
  '"purchase_receipt"',
  '"offer_completion"',
]);

const orderTokens = [
  '"seller_offer"',
  '"store_listing_holding"',
  '"buyer_checking"',
  '"business_cash"',
  '"buyer_inventory"',
  '"economic_posting"',
  '"purchase_receipt"',
  '"offer_completion"',
];
let previousIndex = -1;
for (const token of orderTokens) {
  const index = source.contracts.indexOf(token);
  if (index <= previousIndex) {
    throw new Error(
      "Phase 10A.1 typed lock order does not preserve seller-offer-first ordering.",
    );
  }
  previousIndex = index;
}

requireTokens(source.simulation, "Settlement ordering simulation", [
  "purchaseFirstPromise",
  "withdrawalAfterPurchase",
  "purchaseAfterWithdrawal",
  "STORE_PURCHASE_SETTLEMENT_IDEMPOTENCY_CONFLICT",
  "INJECTED_AFTER_SELLER_CREDIT",
  "Game-one state must remain isolated",
  "parseStorePurchaseSettlementReceipt",
]);

const foundationOnly = [
  source.contracts,
  source.simulation,
  source.types,
].join("\n").toLowerCase();
forbidTokens(foundationOnly, "Checkpoint 10A.1 foundation", [
  "create table",
  "create or replace function",
  "grant execute",
  ".rpc(",
  "record_player_ledger_entry",
  "record_business_ledger_entry",
  "post_inventory_transaction_v2",
  "/players/me/store",
]);

requireTokens(source.withdrawalFoundation, "Retained Phase 9A lifecycle", [
  "withdrawal_pending",
  "store_offer_withdrawal_requests",
]);
requireTokens(source.withdrawalRequest, "Retained Phase 9A offer-first request", [
  "from public.store_seller_offers as offer_row",
  "for update",
  "status = 'withdrawal_pending'",
]);
requireTokens(source.withdrawalProcessor, "Retained Phase 9A due worker", [
  "for update skip locked",
  "quantity_reserved > 0",
  "inventory_reserved",
]);

requireTokens(source.retainedSettlement, "Retained seeded settlement audit", [
  "purchase_quoted_store_item",
  "v_item public.store_items%rowtype",
  "store_purchase_quotes",
  "inventory_account_id",
]);
if (source.retainedSettlement.includes("store_seller_offers")) {
  throw new Error(
    "The retained Store settlement unexpectedly became seller-offer aware; re-audit the Phase 10A.1 boundary.",
  );
}

requireTokens(
  source.automaticBusinessSettlement,
  "Competing automatic Business settlement audit",
  [
    "settle_business_cycle_v1",
    "business_sales",
    "cost_of_goods_sold",
    "v_demand",
  ],
);

requireTokens(source.workflow, "Dedicated Phase 10A.1 workflow", [
  "Business Store Purchase Settlement Foundation V2",
  "business-phase10-store-purchase-settlement-foundation-contract.mjs",
  "business-phase10-store-purchase-settlement-lock-simulation.mjs",
  "business-phase10-store-purchase-settlement-foundation-types.mjs",
  "business-phase9-store-withdrawal-safety-contract.mjs",
  "business-phase8-store-listing-inventory-contract.mjs",
  "business-phase7-store-seller-offers-contract.mjs",
  "validate-supabase-migrations.mjs",
  "test:player-store-public",
  "test:player-inventory",
  "typecheck:all",
  "npm run browser",
]);

console.log(
  "Business Phase 10A.1 Store purchase settlement foundation contract: PASS",
);
