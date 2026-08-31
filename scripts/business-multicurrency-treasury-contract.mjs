#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const files = Object.freeze({
  authority: "docs/operations/contracts/player-cross-cutting/pr-678.json",
  owner: "backend/supabase/migrations/20260831100000_business_multicurrency_owner_identity_v1.sql",
  treasury: "backend/supabase/migrations/20260831101000_business_treasury_fx_commands_v1.sql",
  procurement: "backend/supabase/migrations/20260831102000_business_procurement_funding_v1.sql",
  assertions: "backend/supabase/migrations/20260831103000_business_multicurrency_assertions_v1.sql",
  contracts: "backend/src/domains/business/contracts/businessTreasuryContracts.ts",
  repository: "backend/src/domains/business/infrastructure/supabaseBusinessTreasuryRepository.ts",
  requestParser: "backend/src/domains/business/api/playerBusinessTreasury.ts",
  handler: "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
  treasuryHttpDispatch: "backend/src/domains/business/api/playerBusinessTreasuryHttpDispatch.ts",
  store: "backend/src/domains/business/api/playerBusinessStoreProcurement.ts",
  storeRequest: "backend/src/domains/business/api/playerBusinessStoreProcurementRequest.ts",
  storeFundingProjection: "backend/src/domains/business/api/playerBusinessStoreFundingProjection.ts",
  storeFundingProjectionSupport: "backend/src/domains/business/api/playerBusinessStoreFundingProjectionSupport.ts",
  storeProjection: "backend/src/domains/business/api/playerBusinessStoreProcurementProjection.ts",
  storeProjectionSupport: "backend/src/domains/business/api/playerBusinessStoreProjectionSupport.ts",
  storeTestSupport: "backend/src/domains/business/api/playerBusinessStoreProcurement.testSupport.ts",
  treasuryProjection: "backend/src/domains/business/infrastructure/businessTreasuryProjection.ts",
  treasuryProjectionSupport: "backend/src/domains/business/infrastructure/businessTreasuryProjectionSupport.ts",
  treasuryFxProjection: "backend/src/domains/business/infrastructure/businessTreasuryFxProjection.ts",
  treasuryDatabaseErrors: "backend/src/domains/business/infrastructure/businessTreasuryDatabaseErrors.ts",
  treasuryDatabaseErrorsTest: "backend/src/domains/business/infrastructure/businessTreasuryDatabaseErrors.test.ts",
  playerBusinessDatabaseErrors: "backend/src/domains/business/infrastructure/playerBusinessDatabaseErrors.ts",
  rateLimitRegistry: "backend/src/security/playerRateLimitOperationRegistry.ts",
  routes: "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
  routeTests: "backend/src/domains/business/api/playerBusinessRoutePaths.test.ts",
  clientRoutes: "player-terminal/src/api/business-treasury-backend-routes.js",
  freshness: "player-terminal/src/api/freshness.js",
  playerApi: "player-terminal/src/api/player-api.js",
  resourcePlan: "player-terminal/src/api/resource-plan.js",
  invalidationController: "player-terminal/src/realtime/player-invalidation-controller.js",
  readModel: "player-terminal/src/features/business-treasury/business-treasury-read-model.js",
  procurementReadModel: "player-terminal/src/features/business-treasury/business-procurement-read-model.js",
  validation: "player-terminal/src/features/business-treasury/business-treasury-validation.js",
  flow: "player-terminal/src/features/business-treasury/business-treasury-flow.js",
  flowSupport: "player-terminal/src/features/business-treasury/business-treasury-flow-support.js",
  page: "player-terminal/src/pages/business-page.js",
  style: "player-terminal/css/player-terminal-business-v2.css",
  browser: "player-terminal/tests/browser/player-business-treasury.spec.mjs",
  playerTest: "player-terminal/tests/business-multicurrency-treasury.mjs",
  database: "scripts/business-multicurrency-treasury-database.mjs",
  concurrency: "scripts/business-multicurrency-treasury-concurrency.mjs",
  phase4cRecoveryContract: "scripts/business-phase4c-player-recovery-contract.mjs",
  phase10StoreCutoverContract: "scripts/business-phase10-player-store-cutover-contract.mjs",
  storeProcurementAuthorityContract: "scripts/business-store-procurement-authority-contract.mjs",
  inputPurchaseRetirementContract: "scripts/business-input-purchase-retirement-contract.mjs",
  workflow: ".github/workflows/business-multicurrency-treasury-v1.yml",
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

assert.equal(authority.pullRequestNumber, 678);
assert.equal(authority.baseRef, "feat/multicurrency-stock-funding-v1");
assert.equal(authority.productionDeploymentAllowed, false);
assert.equal(authority.productionMutationAllowed, false);
assert.equal(authority.secretValuesAllowed, false);
for (const path of Object.values(files)) {
  assert.ok(authority.allowedPaths.includes(path), `PR 678 authority does not allow ${path}`);
}

includesAll(source.owner, [
  "fx_quotes_exactly_one_owner_check",
  "fx_orders_exactly_one_owner_check",
  "purchase_funding_quotes_exactly_one_owner_check",
  "purchase_funding_receipts_exactly_one_owner_check",
  "private.ensure_active_business_checking_account_v1",
  "private.business_bank_account_public_json_v1",
  "public.ensure_business_banking_account_v1",
  "public.list_player_business_bank_accounts_v1",
  "account_kind = 'checking'",
  "'balanceEffect', '0'",
  "from public, anon, authenticated",
  "to service_role",
], "C4 owner/account migration");
assert.doesNotMatch(
  source.owner,
  /\b(?:new|old)\.quote_id\b/iu,
  "Polymorphic owner triggers must not dereference a table-specific record field.",
);
const activeBusinessAccountHelper = source.owner.match(
  /create or replace function private\.ensure_active_business_checking_account_v1\([\s\S]*?\$function\$;/u,
)?.[0];
assert.ok(activeBusinessAccountHelper, "C4 active Business account helper is missing.");
includesAll(activeBusinessAccountHelper, [
  "do nothing",
  "BANK_ACCOUNT_NOT_ACTIVE",
  "private.ensure_bank_account_identity_v1",
], "C4 restricted-safe Business account helper");
assert.ok(
  !activeBusinessAccountHelper.includes("ensure_business_bank_account_identity_v1"),
  "C4 account opening must not reactivate a restricted Business party/account.",
);
includesAll(source.treasury, [
  "public.create_business_fx_quote_v1",
  "public.submit_business_standard_fx_order_v1",
  "public.execute_business_instant_fx_v1",
  "public.cancel_business_standard_fx_order_v1",
  "public.get_business_treasury_overview_v1",
  "private.fx_order_public_json_v1",
  "private.fx_settlement_receipt_public_json_v1",
  "current_business_owner_context_v1",
  "set search_path = pg_catalog",
], "C4 Treasury/FX migration");
assert.ok(!source.treasury.includes("record_business_ledger_entry_v2"), "Business FX must not dual-write legacy balances.");

includesAll(source.procurement, [
  "public.create_business_purchase_funding_quote_v1",
  "private.compose_business_purchase_funding_v1",
  "public.create_business_store_quote_v2",
  "public.purchase_business_store_quote_v2",
  "BUSINESS_STORE_PROCUREMENT_PAYMENT_RETIRED",
  "PURCHASE_FUNDING_REMAINDER_INVALID",
  "business.store-procurement",
  "funding_context_hash",
  "funding_allocations",
  "store_procurement_purchase",
  "business.store.procurement.completed",
  "v_settlement_total := v_settlement_unit * p_quantity",
  "alter column final_total_price type numeric(38, 18)",
  "private.ensure_active_system_checking_account_v1",
  "for update",
], "C4 funded procurement migration");
assert.ok(!source.procurement.includes("record_business_ledger_entry_v2"), "Funded procurement must compose canonical Banking, not a legacy Business ledger write.");
assert.ok(
  !source.procurement.includes("private.ensure_system_bank_account_v1("),
  "C4 procurement must not reactivate a restricted Store target account.",
);
assert.match(source.procurement, /jsonb_array_length\(p_allocations\) not between 1 and 3/u);
assert.match(source.procurement, /allocation\.ordinal = v_line_count[\s\S]*?jsonb_typeof\(allocation\.value -> 'targetAmount'\) <> 'null'/u);

includesAll(source.assertions, [
  "C4_ASSERT_RLS_NOT_FORCED",
  "C4_ASSERT_BROWSER_TABLE_PRIVILEGE",
  "C4_ASSERT_OWNER_FAMILY_DATA_INVALID",
  "C4_ASSERT_BUSINESS_CONTROLLER_MISMATCH",
  "C4_ASSERT_STORE_QUOTE_PARTIAL_BINDING",
  "C4_ASSERT_FUNDED_STORE_QUOTE_INVALID",
  "C4_ASSERT_SHARED_FUNDING_COMPOSER_INVALID",
  "C4_ASSERT_SYSTEM_CHECKING_HELPER_INVALID",
  "v_settlement_total := v_settlement_unit * p_quantity",
], "C4 migration assertions");

includesAll(source.contracts, [
  "BusinessTreasurySnapshotV1",
  "BusinessTreasuryFxQuoteV1",
  "BusinessTreasuryFxOrderV1",
  "BusinessTreasuryFxReceiptV1",
  "BusinessFundingQuoteV1",
  "BusinessFundingReceiptV1",
  "BusinessMoneyV1",
], "C4 public contracts");
includesAll(source.repository, [
  "get_business_treasury_overview_v1",
  "ensure_business_banking_account_v1",
  "create_business_fx_quote_v1",
  "submit_business_standard_fx_order_v1",
  "execute_business_instant_fx_v1",
  "cancel_business_standard_fx_order_v1",
], "C4 repository");
includesAll(source.playerBusinessDatabaseErrors, [
  "BANK_ACCOUNT_NOT_ACTIVE",
  "BANK_ACCOUNT_CURRENCY_INVALID",
  "PURCHASE_FUNDING_TARGET_ROUNDS_TO_ZERO",
], "C4 Store database error boundary");
includesAll(source.routes, [
  "businessTreasuryRead",
  "businessTreasuryAccountOpen",
  "businessTreasuryFxQuote",
  "businessTreasuryFxStandard",
  "businessTreasuryFxInstant",
  "businessTreasuryFxCancel",
  "validKey(decodeSegment(tail[4]), \"fxo\")",
], "C4 Player route parser");
includesAll(source.routeTests, [
  "/players/me/business/treasury",
  "/players/me/business/treasury/accounts",
  "/players/me/business/treasury/fx/quotes",
  "/players/me/business/treasury/fx/orders/standard",
  "/players/me/business/treasury/fx/orders/instant",
  "/functions/v1/classroom-api/players/me/business/treasury/fx/orders/",
], "C4 locked Player route tests");
includesAll(source.requestParser, [
  "parseBusinessTreasuryAccountOpenBody",
  "parseBusinessTreasuryQuoteBody",
  "parseBusinessTreasuryConsumeBody",
  "parseBusinessTreasuryCancelBody",
], "C4 Player request parser");
includesAll(source.handler, [
  "dispatchPlayerBusinessTreasuryRequest",
  "playerBusinessTreasuryHttpDispatch.ts",
], "C4 Player HTTP facade");
includesAll([source.handler, source.treasuryHttpDispatch].join("\n"), [
  "businessTreasuryRead",
  "businessTreasuryAccountOpen",
  "businessTreasuryFxQuote",
  "businessTreasuryFxStandard",
  "businessTreasuryFxInstant",
  "businessTreasuryFxCancel",
  "refreshRequired",
], "C4 Player HTTP handler");
includesAll(source.store, [
  "create_business_store_quote_v2",
  "purchase_business_store_quote_v2",
  "allocations",
], "C4 Store composition");
includesAll(source.storeRequest, [
  "allocations must contain one to three accounts",
  "sourceAccountKey",
  "targetAmount",
  "server-derived remainder",
], "C4 Store allocation parser");
includesAll(source.storeFundingProjection, [
  "projectBusinessFundingQuote",
  "projectBusinessFundingReceipt",
  "targetReserveDrawAmount",
], "C4 Store funding projection");
includesAll(source.storeFundingProjectionSupport, [
  "assertFundingLines",
  "fundingMoney",
  "scaledDecimal",
], "C4 Store funding projection support");
includesAll(source.storeProjection, [
  "toBusinessStoreQuote",
  "toBusinessStoreReceipt",
  "assertFundingCommercialBinding",
  "business.store-procurement",
], "C4 Store commercial projection");
includesAll(source.storeProjectionSupport, [
  "assertPublicBusinessStoreResult",
  "business_store_result_invalid",
], "C4 Store public-result support");
includesAll(source.storeTestSupport, [
  "CapturingRepository",
  "fundingQuoteRow",
  "assertNoUuid",
], "C4 Store test support");
includesAll(source.treasuryProjection, [
  "projectBusinessTreasurySnapshot",
  "projectBusinessTreasuryAccountMutation",
  "projectBusinessTreasuryQuoteMutation",
  "projectBusinessTreasuryOrderMutation",
], "C4 Treasury projection");
includesAll(source.treasuryProjectionSupport, [
  "assertNoInternalUuid",
  "UUID_ANY",
  "export function mutation",
], "C4 Treasury public-result support");
includesAll(source.treasuryFxProjection, [
  "projectTreasuryQuote",
  "projectTreasuryOrder",
  "projectTreasuryReceipt",
  "reserveRepaymentAmount",
], "C4 Treasury FX projection");
includesAll(source.treasuryDatabaseErrors, [
  "mapBusinessTreasuryDatabaseError",
  "business_treasury_idempotency_conflict",
  "business_treasury_service_unavailable",
], "C4 Treasury database error boundary");
includesAll(source.treasuryDatabaseErrorsTest, [
  "business_fx_rate_stale",
  "business_treasury_idempotency_conflict",
  "Private database diagnostics leaked",
], "C4 Treasury database error tests");
includesAll(source.rateLimitRegistry, [
  "businessTreasuryAccountOpen",
  "businessTreasuryFxQuote",
  "businessTreasuryFxStandard",
  "businessTreasuryFxInstant",
  "businessTreasuryFxCancel",
  "businessStoreQuote",
  "businessStorePurchase",
], "C4 reviewed rate-limit operations");
includesAll(source.phase4cRecoveryContract, [
  "playerBusinessDatabaseErrors.ts",
  "recoveryBoundary",
  "Object.keys(mappings).find",
], "C4 retained Player Business recovery ratchet");
includesAll(source.phase10StoreCutoverContract, [
  "playerRateLimitOperationRegistry.ts",
  "source.rateLimitRegistry",
], "C4 retained Player Store rate-limit ratchet");
includesAll(source.storeProcurementAuthorityContract, [
  "playerBusinessStoreProcurementProjection.ts",
  "procurementProjectionBoundary",
  "repositoryErrorBoundary",
], "C4 retained Store procurement split-module ratchet");
includesAll(source.inputPurchaseRetirementContract, [
  "playerRateLimitOperationRegistry.ts",
  "applicationContextScopeIndex",
  "authenticated application context",
], "C4 retained input-purchase retirement scope ratchet");
includesAll(source.resourcePlan, [
  "dependentResourcesForRoute",
  "businessTreasury",
  "data?.business?.configured === true",
], "C4 prerequisite-gated Treasury resource plan");
includesAll([source.resourcePlan, source.freshness].join("\n"), [
  'businessCreate: Object.freeze(["dashboard", "business", "banking", "businessTreasury"])',
  "businessTreasury: 10_000",
], "C4 post-formation Treasury refresh and invalidation registry");
includesAll(source.playerApi, [
  "dependentResourcesForRoute",
  "prerequisitePendingResourceStatus",
  "RESOURCE_PREREQUISITE_NOT_MET",
  "mergeResourceResults",
], "C4 prerequisite-gated Player resource loader");
includesAll(source.invalidationController, [
  "dependentResourcesForRoute",
  "resourcesVisibleOnRoute(state.route, state.data)",
], "C4 prerequisite-aware Player invalidation controller");
includesAll(source.playerTest, [
  "A Player without a Business must not resolve an owner-scoped treasury request.",
  "Treasury may be requested only after the canonical Business prerequisite resolves.",
  "The false-to-true formation transition must fetch Treasury exactly once without route re-entry.",
], "C4 prerequisite-gated Treasury regression evidence");

includesAll(source.readModel, [
  "normalizeBusinessTreasurySnapshot",
  "normalizeBusinessTreasuryQuote",
  "reserveRepaymentAmount.currencyCode !== result.sourceAmount.currencyCode",
], "C4 Player Treasury read model");
includesAll(source.procurementReadModel, [
  "normalizeBusinessProcurementQuote",
  "normalizeBusinessProcurementReceipt",
  "fundingLineBindings",
  "0.01",
], "C4 Player procurement read model");
includesAll(source.validation, [
  "PUBLIC_KEYS",
  "INTERNAL_UUID",
  "scaledInteger",
  "export function money",
], "C4 Player public/economic validation");
assert.ok(
  !/parseFloat|toFixed/u.test(source.readModel + source.procurementReadModel + source.validation),
  "Treasury monetary evidence must not use floating-point parsing/formatting.",
);
includesAll(source.clientRoutes, [
  "BUSINESS_TREASURY_ROUTE_BUILDERS",
  "businessTreasuryFxQuote",
  "businessStoreQuote",
  "finalAllocation ? null",
], "C4 Player request builders");
includesAll(source.flow, [
  "businessTreasuryFxQuote",
  "businessTreasuryFxStandard",
  "businessTreasuryFxInstant",
  "businessTreasuryFxCancel",
  "businessStoreQuote",
  "businessStorePurchase",
  "refreshRequired",
], "C4 Player flow");
includesAll(source.flowSupport, [
  "SERVER-DERIVED REMAINDER",
  "procurementIntent",
  "assertProcurementQuoteMatchesIntent",
  "canonicalTargetAmount",
], "C4 Player intent controls");
includesAll(source.page, [
  "Canonical Checking accounts & FX",
  "Review exact quote",
  "Review funded procurement quote",
  "IMMUTABLE PROCUREMENT RECEIPT",
  "formatBusinessRatePercent",
], "C4 Player page");
assert.ok(!source.page.includes("LOCAL WALLET"), "C4 UI must not represent a Business wallet.");
includesAll(source.style, ["player-terminal-business-treasury", "player-terminal-business-procurement"], "C4 Player styles");
includesAll(source.browser, [
  "exact terms and recover committed refresh",
  "SERVER-DERIVED REMAINDER",
  "ECO 50.0000",
  "horizontal overflow on mobile",
], "C4 browser evidence");

includesAll(source.database, [
  "resetFixture",
  "create_business_fx_quote_v1",
  "purchase_business_store_quote_v2",
  "FX_SAME_CURRENCY_NOT_REQUIRED",
  "BANK_ACCOUNT_NOT_ACTIVE",
  "for (const precision of [0, 3, 18])",
  "targetCreditMatches",
  "c4-persisted-legacy-purchase",
  "allFundingBindingsNull",
  "INVENTORY_TRANSACTION_BALANCE_INVALID:1",
  "Post-funding Inventory rejection did not roll back every economic family.",
], "C4 database evidence");
includesAll(source.concurrency, ["openPsqlSession", "pollForDatabaseWait", "purchase_business_store_quote_v2"], "C4 concurrency evidence");
includesAll(source.workflow, [
  "business-multicurrency-treasury-v1",
  "business-multicurrency-treasury-contract.mjs",
  "business-multicurrency-treasury-database.mjs",
  "business-multicurrency-treasury-concurrency.mjs",
  "business-input-purchase-retirement-contract.mjs",
  "business-phase10-player-store-cutover-contract.mjs",
  "business-phase4c-player-recovery-contract.mjs",
  "business-store-procurement-authority-contract.mjs",
  "player-business-treasury.spec.mjs",
  "businessTreasuryDatabaseErrors.test.ts",
  "playerRateLimitOperationRegistry",
  "supabase db reset",
], "C4 permanent workflow");
assert.ok(!/deploy|production sql|schedule|cron/iu.test(source.workflow), "C4 workflow must not deploy, schedule, or mutate production.");

const changed = execFileSync(
  "git",
  ["diff", "--name-only", "origin/feat/multicurrency-stock-funding-v1...HEAD"],
  { encoding: "utf8" },
).trim().split(/\r?\n/u).filter(Boolean);
for (const path of changed) {
  assert.ok(authority.allowedPaths.includes(path), `C4 changed unauthorized path ${path}`);
}

process.stdout.write(`${JSON.stringify({
  ok: true,
  phase: "BUSINESS-V2-10A4C4",
  changedPaths: changed.length,
  ownerFamilies: ["player", "business"],
  standardSpread: "0.005",
  instantFee: "0.02",
  procurementFundingAccounts: 3,
  publicKeysOnly: true,
})}\n`);
