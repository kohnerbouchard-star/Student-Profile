#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const paths = Object.freeze({
  scope: "docs/roadmaps/multicurrency-store-funding-scope-v1.md",
  authority: "docs/operations/contracts/player-cross-cutting/pr-674.json",
  schema: "backend/supabase/migrations/20260827093000_multicurrency_store_funding_schema_v1.sql",
  quotes: "backend/supabase/migrations/20260827093500_multicurrency_store_funding_quote_commands_v1.sql",
  settlement: "backend/supabase/migrations/20260827094000_multicurrency_store_funding_settlement_v1.sql",
  assertions: "backend/supabase/migrations/20260827094500_multicurrency_store_funding_assertions_v1.sql",
  fundingContracts: "backend/src/domains/store/contracts/playerStoreFundingPublicContracts.ts",
  fundingResponse: "backend/src/domains/store/infrastructure/playerStoreFundingPublicResponse.ts",
  fundingRepository: "backend/src/domains/store/infrastructure/supabasePlayerStoreFundingPublicRepository.ts",
});

function text(path) {
  return readFileSync(path, "utf8");
}

const scope = text(paths.scope);
const authority = JSON.parse(text(paths.authority));
const schema = text(paths.schema);
const quotes = text(paths.quotes);
const settlement = text(paths.settlement);
const assertions = text(paths.assertions);
const fundingContracts = text(paths.fundingContracts);
const fundingResponse = text(paths.fundingResponse);
const fundingRepository = text(paths.fundingRepository);
const fundingErrorsPath =
  "backend/src/domains/store/infrastructure/playerStoreFundingPublicErrors.ts";
const finalConvergenceMigrationPath =
  "backend/supabase/migrations/20260831103001_business_player_store_fx_final_v2.sql";
const fundingErrors = existsSync(fundingErrorsPath) ? text(fundingErrorsPath) : "";
const finalConvergenceMigration = existsSync(finalConvergenceMigrationPath)
  ? text(finalConvergenceMigrationPath)
  : "";

assert.equal(authority.pullRequestNumber, 674);
assert.equal(authority.baseRef, "feat/multicurrency-funding-core-v1");
assert.equal(authority.productionDeploymentAllowed, false);
assert.equal(authority.productionMutationAllowed, false);
assert.equal(authority.secretValuesAllowed, false);
for (const path of Object.values(paths)) {
  assert.ok(
    authority.allowedPaths.includes(path),
    `PR #674 authority must allow ${path}.`,
  );
}

assert.match(scope, /BUSINESS-V2-10A4C1/u);
assert.match(scope, /one to three canonical Player Checking accounts/iu);
assert.match(scope, /Store remains the commercial and inventory authority/iu);
assert.match(scope, /C0 remains the funding and Banking-composition authority/iu);
assert.match(scope, /Marketplace remains C2/iu);
assert.match(scope, /No merge, deployment/iu);

assert.match(fundingContracts, /PLAYER_STORE_FUNDING_ACCOUNT_KEY_PATTERN/u);
assert.match(fundingContracts, /PlayerStoreFundingPublicRepository/u);
assert.match(fundingContracts, /PlayerStoreFundingAllocationInput/u);
assert.match(fundingRepository, /playerStoreFundingPublicResponse\.ts/u);
if (finalConvergenceMigration) {
  assert.match(fundingRepository, /create_system_store_offer_funding_quote_v2/u);
  assert.doesNotMatch(fundingRepository, /create_seeded_store_funding_quote_v1/u);
  assert.match(fundingRepository, /settle_system_store_offer_funding_v2/u);
  assert.doesNotMatch(fundingRepository, /settle_seeded_store_funding_v1/u);
} else {
  assert.match(fundingRepository, /create_seeded_store_funding_quote_v1/u);
  assert.match(fundingRepository, /settle_seeded_store_funding_v1/u);
}
assert.match(fundingRepository, /create_business_store_offer_funding_quote_v1/u);
if (finalConvergenceMigration) {
  assert.match(fundingRepository, /settle_business_store_offer_funding_v2/u);
  assert.match(finalConvergenceMigration, /settle_business_store_offer_funding_v1/u);
} else {
  assert.match(fundingRepository, /settle_business_store_offer_funding_v1/u);
}
assert.match(fundingRepository, /read_business_store_offer_funding_receipt_v1/u);
assert.match(fundingResponse, /UUID_ANY/u);
assert.match(fundingResponse, /lines\.length < 1 \|\| lines\.length > 3/u);
assert.match(`${fundingResponse}\n${fundingErrors}`, /mapFundingRpcError/u);
assert.match(fundingResponse, /export function publicRecord/u);

for (const [path, source] of [
  [paths.schema, schema],
  [paths.quotes, quotes],
  [paths.settlement, settlement],
  [paths.assertions, assertions],
]) {
  assert.match(source, /set local lock_timeout = '5s'/u, `${path} needs lock timeout.`);
  assert.match(source, /set local statement_timeout/u, `${path} needs statement timeout.`);
  assert.match(source, /commit;\s*$/u, `${path} must be a committed forward migration.`);
}

assert.match(schema, /store_funding_normalize_allocations_v1/u);
assert.match(schema, /store_purchase_quotes_funding_binding_check/u);
assert.match(schema, /store_offer_purchase_quotes_funding_binding_check/u);
assert.match(schema, /store_purchases_payment_evidence_check/u);
assert.match(schema, /store_offer_purchase_receipts_payment_evidence_check/u);
assert.match(schema, /alter column buyer_debit_ledger_entry_id drop not null/u);
assert.match(schema, /funding_receipt_id/u);
assert.doesNotMatch(schema, /create table\s+public\.(?:wallet|store_wallet|store_balances)/iu);

assert.match(quotes, /create_seeded_store_funding_quote_v1/u);
assert.match(quotes, /create_business_store_offer_funding_quote_v1/u);
assert.equal(
  [...quotes.matchAll(/create_purchase_funding_quote_v1/gu)].length >= 2,
  true,
  "Both Store quote kinds must consume C0 quote authority.",
);
assert.match(quotes, /'store\.seeded'/u);
assert.match(quotes, /'store\.business-offer'/u);
assert.match(quotes, /store\.seeded-revenue/u);
assert.match(quotes, /ensure_business_bank_account_identity_v1/u);
assert.match(quotes, /STORE_FUNDED_QUOTE_CURRENCY_PRECISION_UNSUPPORTED/u);
assert.match(quotes, /v_bill_unit_price/u);
assert.match(quotes, /v_bill_total_price/u);
assert.match(quotes, /STORE_OFFER_FUNDED_QUOTE_PRICE_PRECISION_INVALID/u);
assert.doesNotMatch(quotes, /STORE_OFFER_QUOTE_CROSS_CURRENCY_UNSUPPORTED/u);
assert.doesNotMatch(quotes, /record_player_ledger_entry/u);
assert.doesNotMatch(quotes, /record_business_ledger_entry_v2/u);
assert.doesNotMatch(quotes, /convert_currency_amount/u);
assert.doesNotMatch(quotes, /country-snapshot:[^']*[0-9a-f]{8}-[0-9a-f-]{27,}/iu);

assert.match(settlement, /settle_seeded_store_funding_v1/u);
assert.match(settlement, /settle_business_store_offer_funding_v1/u);
assert.equal(
  [...settlement.matchAll(/compose_purchase_funding_v1/gu)].length >= 2,
  true,
  "Both Store settlement kinds must consume the C0 composer.",
);
assert.equal(
  [...settlement.matchAll(/post_inventory_transaction_v2/gu)].length >= 2,
  true,
  "Both Store settlement kinds must retain canonical Inventory posting.",
);
assert.match(settlement, /purchase_funding_recipient_credit/u);
assert.match(settlement, /business_offer_purchase_funding/u);
assert.match(settlement, /seeded_store_purchase_funding/u);
assert.match(settlement, /unitCost', v_quote\.final_unit_price/u);
assert.doesNotMatch(settlement, /record_player_ledger_entry/u);
assert.doesNotMatch(settlement, /record_business_ledger_entry_v2/u);
assert.doesNotMatch(settlement, /compatibility_offset/u);

assert.match(assertions, /C1_ASSERT_SEEDED_QUOTE_AUTHORITY_INVALID/u);
assert.match(assertions, /C1_ASSERT_BUSINESS_SETTLEMENT_AUTHORITY_INVALID/u);
assert.match(assertions, /has_function_privilege/u);

console.log("Multi-currency Store funding source contract passed.");
