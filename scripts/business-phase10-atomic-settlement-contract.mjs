#!/usr/bin/env node
import fs from "node:fs";

const files = {
  schema:
    "backend/supabase/migrations/20260825110000_business_store_offer_purchase_receipt_v2.sql",
  result:
    "backend/supabase/migrations/20260825110010_business_store_offer_purchase_receipt_result_v2.sql",
  command:
    "backend/supabase/migrations/20260825110020_business_store_offer_atomic_settlement_v2.sql",
  assertions:
    "backend/supabase/migrations/20260825110030_business_store_offer_settlement_assertions_v2.sql",
  contracts:
    "backend/src/domains/store/contracts/storeOfferSettlementContracts.ts",
  repository:
    "backend/src/domains/store/infrastructure/supabaseStoreOfferSettlementRepository.ts",
  application:
    "backend/src/domains/store/application/settleBusinessStoreOffer.ts",
  index: "backend/src/domains/store/index.ts",
  scope: "docs/roadmaps/business-phase10-atomic-store-settlement-scope-v1.md",
  simulation: "scripts/business-phase10-atomic-settlement-simulation.mjs",
  types: "scripts/business-phase10-atomic-settlement-types.mjs",
  databaseSupport:
    "scripts/business-phase10-atomic-settlement-database-support.mjs",
  database: "scripts/business-phase10-atomic-settlement-database.mjs",
  concurrency: "scripts/business-phase10-atomic-settlement-concurrency.mjs",
  workflow: ".github/workflows/business-store-atomic-settlement-v2.yml",
};
const text = Object.fromEntries(
  Object.entries(files).map(([name, file]) => {
    if (!fs.existsSync(file)) {
      throw new Error(`Missing Phase 10A.3 ${name}: ${file}`);
    }
    return [name, fs.readFileSync(file, "utf8")];
  }),
);
const requireTokens = (source, label, tokens) =>
  tokens.forEach((token) => {
    if (!source.includes(token)) {
      throw new Error(`${label} missing token: ${token}`);
    }
  });
const forbidTokens = (source, label, tokens) =>
  tokens.forEach((token) => {
    if (source.includes(token)) {
      throw new Error(`${label} contains forbidden token: ${token}`);
    }
  });
const statementContaining = (source, label, token) => {
  const tokenIndex = source.indexOf(token);
  if (tokenIndex < 0) throw new Error(`${label} missing statement: ${token}`);
  const start = source.lastIndexOf("\n  ", tokenIndex);
  const end = source.indexOf(";", tokenIndex);
  if (start < 0 || end < 0) {
    throw new Error(`${label} statement is not bounded: ${token}`);
  }
  return { index: tokenIndex, text: source.slice(start, end + 1) };
};
const requireLockedStatement = (source, label, token) => {
  const statement = statementContaining(source, label, token);
  if (!/for update\s*;/iu.test(statement.text)) {
    throw new Error(
      `${label} must lock its exact row with FOR UPDATE: ${token}`,
    );
  }
  return statement.index;
};

requireTokens(text.schema, "receipt schema", [
  "create table public.store_offer_purchase_receipts",
  "default ('spr_' || encode(gen_random_bytes(16), 'hex'))",
  "store_offer_purchase_receipts_idempotency_unique",
  "store_offer_purchase_receipts_quote_unique",
  "total_price = round(total_price, 2)",
  "gross_margin = round(gross_revenue - cost_of_goods_sold, 4)",
  "STORE_OFFER_PURCHASE_RECEIPT_INVENTORY_LINES_INVALID",
  "count(*) = 2",
  "STORE_OFFER_PURCHASE_RECEIPT_IMMUTABLE",
  "force row level security",
  "from public, anon, authenticated, service_role",
  "grant select on table public.store_offer_purchase_receipts to service_role",
]);
requireTokens(text.result, "receipt result", [
  "read_store_offer_purchase_receipt_result_v2",
  "buyerInventoryAccountKey",
  "inventoryTransactionKey",
  "costOfGoodsSold",
  "remainingListedQuantity",
  "replayed",
]);
requireTokens(text.command, "settlement command", [
  "settle_business_store_offer_v2",
  "pg_advisory_xact_lock",
  "A committed immutable receipt is authoritative before mutable-state interpretation",
  "for update",
  "STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID",
  "STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED",
  "STORE_OFFER_SETTLEMENT_QUOTE_MISMATCH",
  "STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED",
  "STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK",
  "STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS",
  "STORE_OFFER_SETTLEMENT_COST_CURRENCY_DRIFT",
  "STORE_OFFER_SETTLEMENT_MONEY_PRECISION_UNREPRESENTABLE",
  "STORE_OFFER_SETTLEMENT_COST_PRECISION_UNREPRESENTABLE",
  "public.record_player_ledger_entry(",
  "public.record_business_ledger_entry_v2(",
  "economy_private.post_inventory_transaction_v2(",
  "business.store.sale.completed",
  "insert into public.store_offer_purchase_receipts(",
  "status = 'used'",
  "update public.store_seller_offers set version = version + 1",
  "after_buyer_debit",
  "after_business_credit",
  "after_inventory_post",
  "after_activity",
  "after_receipt",
  "after_quote_consumption",
  "after_offer_version",
  "STORE_OFFER_SETTLEMENT_QUOTE_COMPLETION_FAILED",
  "STORE_OFFER_SETTLEMENT_OFFER_COMPLETION_FAILED",
  "to service_role",
]);
forbidTokens(text.command, "settlement authority", [
  "business_sales",
  "settle_business_cycle_v1",
  "insert into public.inventory_holdings",
  "update public.inventory_holdings",
  "insert into public.account_balances",
  "update public.account_balances",
]);
const replay = text.command.indexOf(
  "select receipt_row.* into v_receipt",
);
const replayEnd = text.command.indexOf("perform 1", replay);
if (
  replay < 0 || replayEnd < 0 ||
  /for\s+(update|share)/iu.test(text.command.slice(replay, replayEnd))
) {
  throw new Error(
    "Committed receipt replay must precede mutable reads without row locks.",
  );
}
const offer = requireLockedStatement(
  text.command,
  "seller offer",
  "select offer_row.* into v_offer",
);
const quote = requireLockedStatement(
  text.command,
  "offer-aware quote",
  "select quote_row.* into v_quote",
);
const listing = requireLockedStatement(
  text.command,
  "Store-listing holding",
  "select holding_row.* into v_listing_holding",
);
const checking = requireLockedStatement(
  text.command,
  "Buyer Checking",
  "select balance_row.* into v_buyer_checking",
);
const businessCash = requireLockedStatement(
  text.command,
  "Business cash",
  "select balance_row.* into v_business_cash",
);
const buyerInventory = requireLockedStatement(
  text.command,
  "Buyer Inventory account",
  "select account_row.* into v_buyer_account",
);
const buyerHolding = requireLockedStatement(
  text.command,
  "Buyer Inventory holding",
  "select holding_row.* into v_buyer_holding",
);
if (
  !(replay < offer && offer < quote && quote < listing && listing < checking &&
    checking < businessCash && businessCash < buyerInventory &&
    buyerInventory < buyerHolding)
) {
  throw new Error(
    "Settlement order must be replay -> offer -> quote -> listing -> Checking -> Business cash -> Buyer Inventory.",
  );
}
const expectedQuoteHash = text.command.indexOf("v_expected_quote_hash :=");
const quoteHashComparison = text.command.indexOf(
  "v_quote.request_hash is distinct from v_expected_quote_hash",
);
const mutations = [
  ["Buyer debit", "select * into v_buyer_debit", "after_buyer_debit"],
  [
    "Business credit",
    "select * into v_business_credit",
    "after_business_credit",
  ],
  [
    "Inventory post",
    "v_inventory_post := economy_private.post_inventory_transaction_v2",
    "after_inventory_post",
  ],
  [
    "Business activity",
    "insert into public.business_activity_events",
    "after_activity",
  ],
  [
    "receipt",
    "insert into public.store_offer_purchase_receipts",
    "after_receipt",
  ],
  [
    "quote consumption",
    "update public.store_offer_purchase_quotes",
    "after_quote_consumption",
  ],
  [
    "offer advancement",
    "update public.store_seller_offers",
    "after_offer_version",
  ],
].map(([label, stageToken, failToken]) => ({
  label,
  stage: text.command.indexOf(stageToken),
  fail: text.command.indexOf(`v_fail_stage = '${failToken}'`),
}));
if (
  expectedQuoteHash < 0 || quoteHashComparison < expectedQuoteHash ||
  quoteHashComparison > mutations[0].stage
) {
  throw new Error(
    "Immutable quote request hash must be recomputed and compared before mutation.",
  );
}
for (let index = 0; index < mutations.length; index += 1) {
  const current = mutations[index];
  const next = mutations[index + 1];
  if (
    current.stage < 0 || current.fail <= current.stage ||
    (next && (next.stage <= current.fail || next.stage <= current.stage))
  ) {
    throw new Error(
      `Settlement mutation/failure order invalid at ${current.label}.`,
    );
  }
}
requireTokens(text.assertions, "database assertions", [
  "STORE_OFFER_SETTLEMENT_RECEIPT_SCHEMA_MISSING",
  "STORE_OFFER_SETTLEMENT_FUNCTION_PRIVILEGE_INVALID",
  "STORE_OFFER_SETTLEMENT_HELPER_PRIVILEGE_INVALID",
  "STORE_OFFER_SETTLEMENT_RECEIPT_RLS_NOT_FORCED",
  "STORE_OFFER_SETTLEMENT_RECEIPT_VALIDATOR_MISSING",
  "STORE_OFFER_SETTLEMENT_PARALLEL_AUTHORITY_FORBIDDEN",
]);
requireTokens(text.contracts, "typed contracts", [
  "SettleBusinessStoreOfferCommand",
  "BusinessStoreOfferReceiptDto",
  "normalizeBusinessStoreOfferSettlementCommand",
  "parseBusinessStoreOfferReceipt",
]);
requireTokens(text.repository, "repository", [
  "SupabaseStoreOfferSettlementRepository",
  "settle_business_store_offer_v2",
  "store_offer_settlement_idempotency_conflict",
  "store_offer_settlement_insufficient_funds",
]);
requireTokens(text.application, "application service", [
  "SettleBusinessStoreOfferDependencies",
  "settleBusinessStoreOffer",
  "settlementRepository.settleBusinessOffer(command)",
]);
requireTokens(text.index, "exports", [
  "./application/settleBusinessStoreOffer.ts",
  "./contracts/storeOfferSettlementContracts.ts",
  "./infrastructure/supabaseStoreOfferSettlementRepository.ts",
]);
requireTokens(text.scope, "scope", [
  "BUSINESS-V2-10A3",
  "offer-first",
  "paid-without-item",
  "does **not authorize**",
]);
requireTokens(text.simulation, "simulation", [
  "purchaseFirst",
  "withdrawalFirst",
  "concurrentPurchases",
  "rollbackStages",
  "two-game isolation",
]);
requireTokens(text.types, "types", [
  "normalizeBusinessStoreOfferSettlementCommand",
  "parseBusinessStoreOfferReceipt",
]);
requireTokens(text.databaseSupport, "database support", [
  "localhost:54322/postgres",
  "resetFixture",
  "runSql(`begin;\\n${seedFixtureSql}\\ncommit;`)",
  "createQuoteSql",
  "settlementSql",
  "snapshotSql",
  "fullScopedRows",
  '"store_items"',
  '"inventory_accounts"',
  '"mutation_idempotency_keys"',
  '"store_purchase_quotes"',
  '"store_purchases"',
  "openPsqlSession",
  "pollForDatabaseWait",
]);
requireTokens(text.database, "real PostgreSQL serial harness", [
  "resetFixture();",
  "purchase_quoted_store_item_public_v1",
  "retained seeded Store purchase, delivery, and idempotent replay",
  "STORE_OFFER_SETTLEMENT_REQUEST_INVALID",
  "STORE_OFFER_SETTLEMENT_QUOTE_NOT_FOUND",
  "STORE_OFFER_SETTLEMENT_BUSINESS_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_SELLER_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_QUOTE_STATUS_INVALID",
  "STORE_OFFER_SETTLEMENT_OFFER_STATUS_INVALID",
  "STORE_OFFER_SETTLEMENT_CUSTODY_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_BUYER_INVENTORY_CURRENCY_INVALID",
  "STORE_OFFER_SETTLEMENT_INSUFFICIENT_FUNDS",
  "STORE_OFFER_SETTLEMENT_INVENTORY_RESERVED",
  "STORE_OFFER_SETTLEMENT_INSUFFICIENT_STOCK",
  "STORE_OFFER_SETTLEMENT_COST_CURRENCY_DRIFT",
  "STORE_OFFER_SETTLEMENT_BUSINESS_CASH_UNAVAILABLE",
  "STORE_OFFER_SETTLEMENT_SELF_PURCHASE_FORBIDDEN",
  "STORE_OFFER_SETTLEMENT_QUOTE_EXPIRED",
  "STORE_OFFER_SETTLEMENT_QUOTE_MISMATCH",
  "STORE_OFFER_SETTLEMENT_MONEY_PRECISION_UNREPRESENTABLE",
  "after_buyer_debit",
  "after_business_credit",
  "after_inventory_post",
  "after_activity",
  "after_receipt",
  "after_quote_consumption",
  "after_offer_version",
  "STORE_OFFER_PURCHASE_RECEIPT_IMMUTABLE",
  "STORE_OFFER_SETTLEMENT_IDEMPOTENCY_CONFLICT",
  "matching replay returns the exact receipt",
  "successful settlement in Game Two is isolated from Game One",
]);
requireTokens(text.concurrency, "real PostgreSQL concurrency harness", [
  "sameIdempotencyRace",
  "sameOfferOversellRace",
  "twoGameIsolationRace",
  "buyerCheckingRace",
  "listingHoldingRace",
  "purchaseFirstWithdrawalRace",
  "withdrawalFirstPurchaseRace",
  "businessCashOverflowRace",
  "request_business_store_offer_withdrawal_v2",
  "pollForDatabaseWait",
  "waitEventType",
  '"Lock"',
]);
requireTokens(text.workflow, "workflow", [
  "Business Store Atomic Settlement V2",
  "business-phase10-atomic-settlement-contract.mjs",
  "business-phase10-atomic-settlement-simulation.mjs",
  "business-phase10-atomic-settlement-types.mjs",
  "validate-supabase-migrations.mjs",
  "supabase db reset",
  "supabase db lint",
  "business-phase10-atomic-settlement-database.mjs",
  "business-phase10-atomic-settlement-concurrency.mjs",
  "Rebuild database for independent concurrency verification",
  "EXPECTED_SHA",
  'test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"',
]);
const resultKeys = [...text.result.matchAll(/'([A-Za-z][A-Za-z0-9]+)',/gu)]
  .map((match) => match[1]);
const expectedResultKeys = [
  "receiptKey",
  "quoteKey",
  "offerKey",
  "businessKey",
  "sellerPartyKey",
  "catalogItemKey",
  "canonicalItemKey",
  "storeItemKey",
  "buyerInventoryAccountKey",
  "inventoryTransactionKey",
  "quantity",
  "unitPrice",
  "totalPrice",
  "currencyCode",
  "buyerDebit",
  "businessCredit",
  "grossRevenue",
  "costOfGoodsSold",
  "grossMargin",
  "sourceUnitCost",
  "costCurrencyCode",
  "offerVersionBefore",
  "offerVersionAfter",
  "remainingListedQuantity",
  "completedAt",
  "replayed",
];
if (JSON.stringify(resultKeys) !== JSON.stringify(expectedResultKeys)) {
  throw new Error(
    `Public receipt projection keys changed: ${resultKeys.join(",")}`,
  );
}
console.log("Business Phase 10A.3 atomic settlement structural contract: PASS");
