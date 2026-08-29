#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.freeze({
  schema:
    "backend/supabase/migrations/20260827110000_multicurrency_stock_funding_schema_v1.sql",
  assertions:
    "backend/supabase/migrations/20260827110500_multicurrency_stock_funding_assertions_v1.sql",
  scope: "docs/roadmaps/multicurrency-stock-funding-scope-v1.md",
  audit: "docs/roadmaps/multicurrency-stock-funding-authority-audit-v1.md",
  plan: "docs/roadmaps/multicurrency-stock-funding-implementation-plan-v1.md",
  handoff: "docs/roadmaps/multicurrency-stock-funding-intake-handoff-v1.md",
  authority: "docs/operations/contracts/player-cross-cutting/pr-676.json",
  workflow: ".github/workflows/multicurrency-stock-funding-v1.yml",
});

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([key, path]) => [
      key,
      await readFile(new URL(`../${path}`, import.meta.url), "utf8"),
    ]),
  ),
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

requireTokens(source.schema, "C3A listing-currency authority", [
  "private.resolve_stock_listing_currency_v1",
  "alter table public.stock_templates",
  "add column listing_currency_code text null",
  "alter table public.game_session_stock_assets",
  "STOCK_TEMPLATE_LISTING_CURRENCY_IMMUTABLE",
  "STOCK_RUNTIME_LISTING_CURRENCY_IMMUTABLE",
  "guard_stock_template_listing_currency_v1",
  "guard_runtime_stock_listing_currency_v1",
  "stock_templates_listing_currency_fk",
  "game_session_stock_assets_listing_currency_fk",
]);

requireTokens(source.schema, "C3A holding basis currency", [
  "alter table public.stock_holdings",
  "add column cost_currency_code text null",
  "STOCK_HOLDING_COST_CURRENCY_MISMATCH",
  "STOCK_HOLDING_COST_CURRENCY_IMMUTABLE",
  "guard_stock_holding_cost_currency_v1",
]);

requireTokens(source.schema, "C3A legacy/current Stock evidence", [
  "settlement_evidence_family",
  "stock_orders_settlement_evidence_shape_check",
  "stock_trades_settlement_evidence_shape_check",
  "funding_quote_id",
  "funding_receipt_id",
  "funding_bank_transaction_id",
  "market_liquidity_account_id",
  "destination_bank_account_id",
  "settlement_bank_transaction_id",
  "cash_balance_after drop not null",
  "STOCK_ORDER_SETTLEMENT_EVIDENCE_IMMUTABLE",
  "STOCK_TRADE_SETTLEMENT_EVIDENCE_IMMUTABLE",
  "settlement_evidence_family = 'legacy'",
  "settlement_evidence_family = 'c3'",
]);

requireTokens(source.schema, "Canonical Stock market-liquidity identity", [
  "create table public.stock_market_liquidity_accounts",
  "stocks.market-liquidity",
  "zero-balance-identity-v1",
  "private.ensure_system_bank_account_v1",
  "private.ensure_stock_market_liquidity_account_v1",
  "public.initialize_stock_market_liquidity_accounts_v1",
  "account_kind = 'checking'",
  "enable row level security",
  "force row level security",
  "to service_role",
  "STOCK_MARKET_LIQUIDITY_BINDING_IMMUTABLE",
]);

forbidTokens(source.schema, "C3A schema foundation", [
  "record_player_ledger_entry",
  "record_business_ledger_entry",
  "insert into public.ledger_entries",
  "update public.account_balances",
  "private.post_bank_transaction_v1",
  "execute_stock_market_order(",
  "execute_stock_market_order_calendar_gated(",
  "limit_order",
  "partial_fill",
  "time_in_force",
]);

requireTokens(source.assertions, "C3A database assertions", [
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

requireTokens(source.scope, "C3 controlling scope", [
  "BUSINESS-V2-10A4C3",
  "SCOPE_ONLY",
  "immediate market fills only",
  "stocks.market-liquidity",
  "## Listing-currency authority",
  "C3 may become `IMPLEMENTED_NOT_MERGED` only after one exact implementation SHA",
]);

requireTokens(source.audit, "C3 resolved audit", [
  "RESOLVED_FOR_SCOPE",
  "The live execution model is immediate-fill only",
  "The current cash path is not compatible with C0/B2",
  "The current synthetic market has no monetary counterparty",
  "The Player UI currently overstates unsupported behavior",
]);

requireTokens(source.plan, "C3 ordered plan", [
  "C3A — Listing currency and evidence foundation",
  "C3B — Immediate buy quote",
  "C3C — Atomic immediate buy settlement",
  "C3D — Atomic immediate sell settlement",
  "C3E — Player API and UI cutover",
  "C3F — Certification and durable handoff",
]);

requireTokens(source.handoff, "C3 intake handoff", [
  "INTAKE_COMPLETE — IMPLEMENTATION_NOT_STARTED",
  "Exact parent C2 implementation and verification source",
  "9b95009dd7e73ed70987a0a99716d3ee32f2662d",
  "ba033ac4a7759d068233513431891fc9de3ae95a",
  "C3A may now begin",
]);

const authority = JSON.parse(source.authority);
assert.equal(authority.schemaVersion, 1);
assert.equal(authority.pullRequestNumber, 676);
assert.equal(authority.baseRef, "feat/multicurrency-marketplace-funding-v1");
assert.equal(authority.scopeLock, "exact-path-allowlist");
assert.equal(authority.productionDeploymentAllowed, false);
assert.equal(authority.productionMutationAllowed, false);
assert.equal(authority.secretValuesAllowed, false);

for (const path of [
  files.schema,
  files.assertions,
  files.workflow,
  "scripts/multicurrency-stock-funding-schema-contract.mjs",
  "scripts/multicurrency-stock-funding-schema-database.mjs",
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
  "Verify C3A Stock funding source and scope",
  "Verify C3A Stock funding database",
  "verify-player-cross-cutting-authority.mjs",
  "multicurrency-stock-funding-schema-contract.mjs",
  "multicurrency-stock-funding-schema-database.mjs",
  "validate-supabase-migrations.mjs",
  "architecture-ratchet-v2.mjs",
  "supabase db reset",
  "supabase db lint",
]);

console.log("Multi-currency Stock funding C3A source contract: PASS");
