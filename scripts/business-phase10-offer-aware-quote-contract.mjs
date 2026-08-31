#!/usr/bin/env node
import fs from "node:fs";

const files = {
  schema: "backend/supabase/migrations/20260825100000_business_store_offer_quote_schema_v2.sql",
  result: "backend/supabase/migrations/20260825100010_business_store_offer_quote_result_v2.sql",
  command: "backend/supabase/migrations/20260825100020_business_store_offer_quote_command_v2.sql",
  contracts: "backend/src/domains/store/contracts/storeOfferQuoteContracts.ts",
  repository: "backend/src/domains/store/infrastructure/supabaseStoreOfferQuoteRepository.ts",
  index: "backend/src/domains/store/index.ts",
  scope: "docs/roadmaps/business-phase10-offer-aware-quote-scope-v1.md",
  simulation: "scripts/business-phase10-offer-aware-quote-simulation.mjs",
  types: "scripts/business-phase10-offer-aware-quote-types.mjs",
  workflow: ".github/workflows/business-store-offer-aware-quotes-v2.yml",
};
const text = {};
for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`Missing Phase 10A.2 ${name}: ${file}`);
  text[name] = fs.readFileSync(file, "utf8");
}
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) if (!source.includes(token)) {
    throw new Error(`${label} missing token: ${token}`);
  }
};
const forbidTokens = (source, label, tokens) => {
  for (const token of tokens) if (source.includes(token)) {
    throw new Error(`${label} contains excluded token: ${token}`);
  }
};

requireTokens(text.schema, "quote schema", [
  "create table public.store_offer_purchase_quotes",
  "default ('quote_' || encode(gen_random_bytes(16), 'hex'))",
  "store_offer_purchase_quotes_idempotency_unique",
  "business-offer-fixed-price-v2",
  "expires_at = created_at + interval '2 minutes'",
  "new.used_at < old.expires_at",
  "force row level security",
  "STORE_OFFER_QUOTE_IDENTITY_IMMUTABLE",
  "STORE_OFFER_QUOTE_DELETE_FORBIDDEN",
]);
requireTokens(text.result, "quote result projection", [
  "read_store_offer_purchase_quote_result_v2",
  "catalogItemKey",
  "canonicalItemKey",
  "inventoryAccountKey",
  "replayed",
]);
requireTokens(text.command, "quote command", [
  "create_business_store_offer_quote_v2",
  "pg_advisory_xact_lock",
  "Durable replay precedes every mutable live-state interpretation",
  "from public.store_offer_purchase_quotes as quote_row",
  "from public.store_seller_offers as offer_row",
  "for share",
  "STORE_OFFER_QUOTE_OFFER_STATUS_INVALID",
  "STORE_OFFER_QUOTE_OFFER_VERSION_CONFLICT",
  "STORE_OFFER_QUOTE_INVENTORY_RESERVED",
  "STORE_OFFER_QUOTE_INSUFFICIENT_STOCK",
  "STORE_OFFER_QUOTE_SELF_PURCHASE_FORBIDDEN",
  "STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED",
  "same_currency_fixed_offer_price",
  "'nonReserving', true",
  "to service_role",
]);
const replay = text.command.indexOf("from public.store_offer_purchase_quotes as quote_row");
const offer = text.command.indexOf("from public.store_seller_offers as offer_row");
if (replay < 0 || offer < 0 || replay >= offer) {
  throw new Error("Durable replay must precede live offer validation.");
}
forbidTokens(text.command, "quote command", [
  "record_player_ledger_entry(",
  "record_business_ledger_entry_v2(",
  "post_inventory_transaction_v2(",
  "insert into public.store_purchases",
  "insert into public.inventory_transactions",
  "update public.store_seller_offers",
  "update public.inventory_holdings",
  "from public.account_balances",
]);
requireTokens(text.contracts, "typed contract", [
  "BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION",
  "CreateBusinessStoreOfferQuoteCommand",
  "BusinessStoreOfferQuoteDto",
  "normalizeBusinessStoreOfferQuoteCommand",
  "parseBusinessStoreOfferQuote",
]);
requireTokens(text.repository, "repository", [
  "SupabaseStoreOfferQuoteRepository",
  "create_business_store_offer_quote_v2",
  "store_offer_quote_idempotency_conflict",
  "store_offer_quote_offer_unavailable",
]);
forbidTokens(text.repository, "repository", [
  "store_offer_quote_cross_currency_unsupported",
]);
requireTokens(text.index, "Store exports", [
  './contracts/storeOfferQuoteContracts.ts',
  './infrastructure/supabaseStoreOfferQuoteRepository.ts',
]);
requireTokens(text.scope, "scope", [
  "BUSINESS-V2-10A2",
  "same-currency",
  "non-reserving",
  "Durable replay",
  "does not authorize",
  "Phase 10A.3",
]);
requireTokens(text.simulation, "simulation", [
  "concurrentReplay",
  "quoteAfterWithdrawal",
  "STORE_OFFER_QUOTE_IDEMPOTENCY_CONFLICT",
  "STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED",
  "STORE_OFFER_QUOTE_SELF_PURCHASE_FORBIDDEN",
  "two-game isolation",
]);
requireTokens(text.types, "type test", [
  "normalizeBusinessStoreOfferQuoteCommand",
  "parseBusinessStoreOfferQuote",
  "BUSINESS_STORE_OFFER_QUOTE_PRICING_VERSION",
]);
requireTokens(text.workflow, "workflow", [
  "Business Store Offer-Aware Quotes V2",
  "business-phase10-offer-aware-quote-contract.mjs",
  "business-phase10-offer-aware-quote-simulation.mjs",
  "business-phase10-offer-aware-quote-types.mjs",
  "business-phase10-store-purchase-settlement-foundation-contract.mjs",
  "business-phase9-store-withdrawal-safety-contract.mjs",
  "validate-supabase-migrations.mjs",
  "test:player-store-public",
  "test:player-inventory",
  "typecheck:all",
]);
console.log("Business Phase 10A.2 offer-aware quote structural contract: PASS");
