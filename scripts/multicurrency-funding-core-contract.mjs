#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = Object.freeze({
  scope: "docs/roadmaps/multicurrency-funding-core-scope-v1.md",
  authority: "docs/operations/contracts/player-cross-cutting/pr-673.json",
  quote: "backend/supabase/migrations/20260827090000_multicurrency_funding_quote_v1.sql",
  quoteIsolation: "backend/supabase/migrations/20260827090500_multicurrency_funding_quote_stage_isolation_v1.sql",
  composer: "backend/supabase/migrations/20260827091000_multicurrency_funding_composer_v1.sql",
  bankingWorkflow: ".github/workflows/banking-fx-clearing-v1.yml",
});

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]),
);
const authority = JSON.parse(source.authority);

function includesAll(text, values, label) {
  for (const value of values) {
    assert.ok(text.includes(value), `${label} is missing ${value}`);
  }
}

assert.equal(authority.pullRequestNumber, 673);
assert.equal(authority.baseRef, "feat/banking-fx-clearing-v1");
assert.equal(authority.productionDeploymentAllowed, false);
assert.equal(authority.productionMutationAllowed, false);
assert.equal(authority.secretValuesAllowed, false);
for (const path of Object.values(files)) {
  assert.ok(authority.allowedPaths.includes(path), `PR 673 authority does not allow ${path}`);
}

includesAll(source.scope, [
  "one to three",
  "1.00% retail spread",
  "target-credit",
  "compatibility-offset",
  "C1-C4",
], "C0 scope");

includesAll(source.quote, [
  "create table public.purchase_funding_quotes",
  "create table public.purchase_funding_quote_lines",
  "'^pfq_[0-9a-f]{32}$'",
  "jsonb_array_length(p_allocations) not between 1 and 3",
  "PURCHASE_FUNDING_DUPLICATE_ACCOUNT",
  "PURCHASE_FUNDING_TOTAL_MISMATCH",
  "account_row.account_kind = 'checking'",
  "v_customer_rate := (v_reference_rate * 0.99)",
  "v_spread_rate := 0.01",
  "private.purchase_funding_ceil_minor_v1",
  "private.player_fx_current_cap_v1",
  "private.fx_liquidity_headroom_v1",
  "grant execute on function public.create_purchase_funding_quote_v1",
], "funding quote migration");

assert.ok(
  /revoke all on function public\.create_purchase_funding_quote_v1[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute[\s\S]*?to service_role;/u.test(source.quote),
  "Funding quote command must remain service-only.",
);

includesAll(source.quoteIsolation, [
  "create_purchase_funding_quote_core_v1",
  "set schema private",
  "drop table if exists pg_temp.purchase_funding_line_stage_v1",
  "return private.create_purchase_funding_quote_core_v1",
  "PURCHASE_FUNDING_PRIVATE_QUOTE_CORE_EXPOSED",
  "grant execute on function public.create_purchase_funding_quote_v1",
], "funding quote stage-isolation migration");
assert.ok(
  /revoke all on function private\.create_purchase_funding_quote_core_v1[\s\S]*?from public, anon, authenticated, service_role;/u.test(source.quoteIsolation),
  "Private quote core must not be executable by service_role.",
);

includesAll(source.composer, [
  "create table public.purchase_funding_receipts",
  "'^pfr_[0-9a-f]{32}$'",
  "create or replace function private.compose_purchase_funding_v1",
  "private.post_bank_transaction_v1",
  "'purchaseFundingAuthority', 'multicurrency_funding_v1'",
  "'reserveAuthority'",
  "'fx_liquidity_v1'",
  "'purchase_funding_source_debit'",
  "'purchase_funding_source_clearing_inflow'",
  "'purchase_funding_target_reserve_draw'",
  "'purchase_funding_target_clearing_delivery'",
  "'purchase_funding_recipient_credit'",
  "'purchase_funding_reserve_repayment'",
  "PURCHASE_FUNDING_SELF_TARGET_FORBIDDEN",
  "FUNDING_INSUFFICIENT",
  "FX_LIQUIDITY_UNAVAILABLE",
], "funding composer migration");

assert.ok(
  /revoke all on function private\.compose_purchase_funding_v1[\s\S]*?from public, anon, authenticated, service_role;/u.test(source.composer),
  "Private funding composer must not be executable by service_role.",
);
assert.ok(
  !source.composer.includes("banking.compatibility-offset") &&
    !source.composer.includes("compatibility_offset"),
  "Retail funding must not use the B2 compatibility-offset account.",
);
assert.ok(
  !source.quote.includes("create_player_fx_quote_v1") &&
    !source.composer.includes("submit_player_standard_fx_order_v1") &&
    !source.composer.includes("execute_player_instant_fx"),
  "C0 must not proxy through the Player bank-FX order surface.",
);

includesAll(source.bankingWorkflow, [
  "AUTHORITY_PR_NUMBER: ${{ github.event.pull_request.number || 672 }}",
  "AUTHORITY_BASE_REF: ${{ github.event.pull_request.base.ref || 'feat/canonical-fx-authority-v1' }}",
  'git diff --name-only "origin/${AUTHORITY_BASE_REF}...HEAD"',
  '--pr-number "${AUTHORITY_PR_NUMBER}"',
  '--base-ref "${AUTHORITY_BASE_REF}"',
], "stack-aware Banking workflow");

const changed = execFileSync(
  "git",
  [
    "diff",
    "--name-only",
    "029ea568adc722f0b7c1cd57a02c49f88ceaf716...fd1511d716c1efd291cf6f45415a32a8d7550db4",
  ],
  { encoding: "utf8" },
).trim().split(/\r?\n/u).filter(Boolean);

for (const path of changed) {
  assert.ok(authority.allowedPaths.includes(path), `C0 changed unauthorized path ${path}`);
  assert.ok(
    !/(^|\/)(store|marketplace|stocks|business)(\/|$)/iu.test(path),
    `C0 widened into a domain-specific settlement path: ${path}`,
  );
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  phase: "10A4C0",
  changedPaths: changed.length,
  retailSpread: "0.01",
  maxSourceAccounts: 3,
  quoteStageIsolation: true,
})}\n`);
