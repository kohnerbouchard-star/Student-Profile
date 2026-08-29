import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const source = {
  schema: read("backend/supabase/migrations/20260827110000_multicurrency_stock_funding_schema_v1.sql"),
  assertions: read("backend/supabase/migrations/20260827110500_multicurrency_stock_funding_assertions_v1.sql"),
  purge: read("backend/supabase/migrations/20260827111000_multicurrency_stock_funding_purge_registry_v1.sql"),
  quote: read("backend/supabase/migrations/20260827111500_multicurrency_stock_buy_quote_v1.sql"),
  quoteClock: read("backend/supabase/migrations/20260827111600_multicurrency_stock_buy_quote_clock_v1.sql"),
  quoteAssertions: read("backend/supabase/migrations/20260827111700_multicurrency_stock_buy_quote_assertions_v1.sql"),
  quotePurge: read("backend/supabase/migrations/20260827111800_multicurrency_stock_buy_quote_purge_registry_v1.sql"),
  workflow: read(".github/workflows/multicurrency-stock-funding-v1.yml"),
};
const authority = JSON.parse(
  read("docs/operations/contracts/player-cross-cutting/pr-676.json"),
);

function requireTokens(text, label, tokens) {
  for (const token of tokens) {
    assert.ok(text.includes(token), `${label} is missing required token: ${token}`);
  }
}

function forbidTokens(text, label, tokens) {
  for (const token of tokens) {
    assert.ok(!text.includes(token), `${label} contains forbidden token: ${token}`);
  }
}

requireTokens(source.schema, "C3A schema", [
  "listing_currency_code",
  "settlement_evidence_family",
  "funding_quote_id",
  "funding_receipt_id",
  "funding_bank_transaction_id",
  "market_liquidity_account_id",
  "destination_bank_account_id",
  "settlement_bank_transaction_id",
  "stock_market_liquidity_accounts",
  "stocks.market-liquidity",
  "ensure_stock_market_liquidity_account_v1",
  "initialize_stock_market_liquidity_accounts_v1",
  "guard_stock_order_currency_evidence_v1",
  "guard_stock_trade_currency_evidence_v1",
]);

requireTokens(source.assertions, "C3A assertions", [
  "C3A_STOCK_TEMPLATE_LISTING_CURRENCY_INVALID",
  "C3A_RUNTIME_STOCK_LISTING_CURRENCY_INVALID",
  "C3A_HOLDING_COST_CURRENCY_INVALID",
  "C3A_LEGACY_ORDER_BACKFILL_INVALID",
  "C3A_TRADE_EVIDENCE_BACKFILL_INVALID",
  "C3A_REQUIRED_COLUMN_INVALID",
  "C3A_REQUIRED_CONSTRAINT_INVALID",
  "C3A_ORDER_TYPE_MODEL_WIDENED",
  "C3A_ORDER_STATUS_MODEL_WIDENED",
  "C3A_LIQUIDITY_BINDING_RLS_INVALID",
  "C3A_LIQUIDITY_INITIALIZER_MUTATES_MONEY",
  "C3A_REQUIRED_TRIGGER_MISSING",
]);

requireTokens(source.purge, "C3A purge registry", [
  "private.game_data_purge_table_registry",
  "stock_market_liquidity_accounts",
  "STOCK_FUNDING_PURGE_REGISTRY_MISSING",
  "STOCK_FUNDING_PURGE_REGISTRY_INCOMPLETE",
  "STOCK_FUNDING_GLOBAL_PURGE_REGISTRY_INCOMPLETE",
  "on conflict (table_schema, table_name) do nothing",
]);

requireTokens(source.quote, "C3B quote", [
  "stock_buy_quotes",
  "stocks.immediate-buy",
  "funding_quote_id",
  "price_tick_index",
  "quoted_price",
  "gross_value",
  "create_stock_buy_quote_v1",
]);

requireTokens(source.quoteClock, "C3B quote clock seam", [
  "private.create_stock_buy_quote_at_v1",
  "clock_timestamp()",
  "service_role",
]);

requireTokens(source.quoteAssertions, "C3B quote assertions", [
  "C3B_ASSERT",
  "stock_buy_quotes",
]);

requireTokens(source.quotePurge, "C3B quote purge repair", [
  "stock_buy_quotes",
  "private.game_data_purge_table_registry",
  "STOCK_BUY_QUOTE_PURGE_REGISTRY_INCOMPLETE",
  "STOCK_BUY_QUOTE_GLOBAL_PURGE_REGISTRY_INCOMPLETE",
]);

forbidTokens(
  `${source.schema}\n${source.assertions}\n${source.purge}\n${source.quote}\n${source.quoteClock}\n${source.quoteAssertions}\n${source.quotePurge}`,
  "C3A/C3B retained implementation",
  [
    "update public.account_balances",
    "insert into public.account_balances",
    "insert into public.ledger_entries",
  ],
);

assert.equal(authority.pullRequestNumber, 676);
assert.equal(authority.baseRef, "feat/multicurrency-marketplace-funding-v1");
assert.equal(authority.scopeLock, "exact-path-allowlist");
assert.equal(authority.productionDeploymentAllowed, false);
assert.equal(authority.productionMutationAllowed, false);
assert.equal(authority.secretValuesAllowed, false);

for (const path of [
  ".github/workflows/multicurrency-stock-funding-v1.yml",
  "backend/supabase/migrations/20260827110000_multicurrency_stock_funding_schema_v1.sql",
  "backend/supabase/migrations/20260827110500_multicurrency_stock_funding_assertions_v1.sql",
  "backend/supabase/migrations/20260827111000_multicurrency_stock_funding_purge_registry_v1.sql",
  "backend/supabase/migrations/20260827111500_multicurrency_stock_buy_quote_v1.sql",
  "backend/supabase/migrations/20260827111600_multicurrency_stock_buy_quote_clock_v1.sql",
  "backend/supabase/migrations/20260827111700_multicurrency_stock_buy_quote_assertions_v1.sql",
  "backend/supabase/migrations/20260827111800_multicurrency_stock_buy_quote_purge_registry_v1.sql",
  "scripts/multicurrency-stock-funding-schema-contract.mjs",
  "scripts/multicurrency-stock-funding-schema-database.mjs",
  "scripts/multicurrency-stock-buy-quote-contract.mjs",
  "scripts/multicurrency-stock-buy-quote-database.mjs",
  "scripts/multicurrency-stock-buy-settlement-concurrency-database.mjs",
]) {
  assert.ok(
    authority.allowedPaths.includes(path),
    `C3 authority does not allow ${path}`,
  );
  assert.ok(
    authority.requiredFiles.includes(path),
    `C3 authority does not require ${path}`,
  );
}

for (const check of [
  "multicurrency-stock-funding-v1",
  "database-replay",
  "backend-typecheck",
  "repository-quality",
  "banking-fx-clearing-v1",
  "multicurrency-funding-core-v1",
  "multicurrency-store-funding-v1",
  "multicurrency-marketplace-funding-v1",
  "exchange-calendar-runtime",
  "required-game-market-timezone",
  "player-terminal-verify",
]) {
  assert.ok(
    authority.requiredChecks.includes(check),
    `C3 authority does not require ${check}`,
  );
}

requireTokens(source.workflow, "Permanent C3 workflow", [
  "name: multicurrency-stock-funding-v1",
  "Verify C3C Stock buy settlement source and retained C3A/C3B scope",
  "Verify C3C atomic Stock buy database and retained C3A/C3B authority",
  "verify-player-cross-cutting-authority.mjs",
  "multicurrency-stock-funding-schema-contract.mjs",
  "multicurrency-stock-buy-quote-contract.mjs",
  "multicurrency-stock-buy-quote-database.mjs",
  "multicurrency-stock-buy-settlement-contract.mjs",
  "multicurrency-stock-buy-settlement-database.mjs",
  "multicurrency-stock-buy-settlement-concurrency-database.mjs",
  "validate-supabase-migrations.mjs",
  "architecture-ratchet-v2.mjs",
  "supabase db reset",
  "supabase db lint",
]);

console.log("Multi-currency Stock funding retained C3A/C3B source contract: PASS");
