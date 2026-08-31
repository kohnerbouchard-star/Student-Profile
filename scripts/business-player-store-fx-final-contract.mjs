#!/usr/bin/env node

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationDirectory = "backend/supabase/migrations";
const migrationName = "20260831103001_business_player_store_fx_final_v2.sql";
const retainedC1QuoteMigration =
  `${migrationDirectory}/20260827093500_multicurrency_store_funding_quote_commands_v1.sql`;
const migrationVersion = migrationName.slice(0, 14);
assert.ok(
  migrationVersion > "20260831103000",
  `10A.4D migration ${migrationName} must sort after the C4 assertion migration.`,
);

const files = Object.freeze({
  authority: "docs/operations/contracts/player-cross-cutting/pr-679.json",
  migration: `${migrationDirectory}/${migrationName}`,
  classroomRoot: "backend/supabase/functions/classroom-api/index.ts",
  playerRoot: "backend/supabase/functions/player-api/runtime.ts",
  handler: "backend/src/domains/store/api/playerStorePublicHttpHandler.ts",
  validation:
    "backend/src/domains/store/api/playerStorePublicRequestValidation.ts",
  fundingContracts:
    "backend/src/domains/store/contracts/playerStoreFundingPublicContracts.ts",
  seededContracts:
    "backend/src/domains/store/contracts/playerStorePublicContracts.ts",
  offerContracts:
    "backend/src/domains/store/contracts/playerStoreOfferPublicContracts.ts",
  fundingRepository:
    "backend/src/domains/store/infrastructure/supabasePlayerStoreFundingPublicRepository.ts",
  fundingProjection:
    "backend/src/domains/store/infrastructure/playerStoreFundingPublicResponse.ts",
  fundingErrors:
    "backend/src/domains/store/infrastructure/playerStoreFundingPublicErrors.ts",
  seededReadRepository:
    "backend/src/domains/store/infrastructure/supabasePlayerStorePublicReadRepository.ts",
  offerReadRepository:
    "backend/src/domains/store/infrastructure/supabasePlayerStoreOfferProductPublicRepository.ts",
  offerReadStore:
    "backend/src/domains/store/infrastructure/playerStoreOfferPublicReadStore.ts",
  playerFundingIntent:
    "player-terminal/src/features/store/store-funding-intent.js",
  playerPurchaseContract:
    "player-terminal/src/features/store/store-purchase-contract.js",
  playerPurchaseFlow:
    "player-terminal/src/features/store/store-purchase-flow.js",
  playerConvergence:
    "player-terminal/src/features/store/store-purchase-convergence.js",
  playerPage: "player-terminal/src/pages/store-page.js",
  playerFundingTest: "player-terminal/tests/store-funding-intent.mjs",
  playerLocalCurrencyTest: "player-terminal/tests/store-local-currency.mjs",
  playerFlowTest: "player-terminal/tests/store-purchase-flow.mjs",
  playerConnectedTest: "player-terminal/tests/store-connected-purchase.mjs",
  playerBrowser:
    "player-terminal/tests/browser/player-store-business-offer-acceptance.spec.mjs",
  connectedHarness:
    "scripts/business-phase10-player-store-browser-acceptance.mjs",
  database: "scripts/business-player-store-fx-final-database.mjs",
  concurrency: "scripts/business-player-store-fx-final-concurrency.mjs",
  workflow: ".github/workflows/business-player-store-fx-final-v2.yml",
});

for (const path of Object.values(files)) {
  assert.ok(existsSync(path), `10A.4D certification input is missing: ${path}`);
}
assert.ok(
  existsSync(retainedC1QuoteMigration),
  `Retained C1 quote authority is missing: ${retainedC1QuoteMigration}`,
);

const source = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]),
);
const authority = JSON.parse(source.authority);
const retainedC1QuoteSource = readFileSync(retainedC1QuoteMigration, "utf8");
const criticalJobChecks = Object.freeze([
  "business-player-store-fx-final-v2-source",
  "business-player-store-fx-final-v2-database",
  "business-player-store-fx-final-v2-player-browser",
  "business-player-store-fx-final-v2-connected",
]);

function includesAll(text, values, label) {
  for (const value of values) {
    assert.ok(text.includes(value), `${label} is missing ${value}`);
  }
}

function excludesAll(text, values, label) {
  for (const value of values) {
    assert.ok(!text.includes(value), `${label} must not contain ${value}`);
  }
}

assert.equal(authority.pullRequestNumber, 679);
assert.equal(authority.baseRef, "feat/business-multicurrency-treasury-v1");
assert.equal(authority.productionDeploymentAllowed, false);
assert.equal(authority.productionMutationAllowed, false);
assert.equal(authority.secretValuesAllowed, false);
assert.deepEqual(authority.criticalJobChecks, criticalJobChecks);
for (const check of criticalJobChecks) {
  assert.ok(
    authority.requiredChecks.includes(check),
    `PR 679 authority must bind the critical workflow job ${check}.`,
  );
}
for (const path of Object.values(files)) {
  assert.ok(
    authority.allowedPaths.includes(path),
    `PR 679 authority must explicitly allow ${path}. Coordinate the migration path before implementation certification.`,
  );
}

// The D repair may redefine the two C1 quote wrappers, add bounded seeded/NPC
// offer bindings to existing Store evidence, and add one quote-key-only
// Business settlement wrapper. The persisted-evidence exception is closed over
// exact columns/constraints/indexes/triggers below; it cannot add a table,
// browser grant, second commercial authority, or direct economic DML.
includesAll(source.migration, [
  "begin;",
  "commit;",
  "public.create_seeded_store_funding_quote_v1(uuid,uuid,text,integer,jsonb,text,timestamp with time zone)",
  "public.create_business_store_offer_funding_quote_v1(uuid,uuid,text,integer,bigint,jsonb,text)",
  "create or replace function public.settle_business_store_offer_funding_v2",
  "create or replace function public.read_business_store_offer_funding_receipt_v1",
  "private.store_funding_normalize_allocation_intent_v2",
  "private.store_funding_materialize_allocation_intent_v2",
  "private.store_funding_normalize_allocations_v1",
  "public.settle_business_store_offer_funding_v1",
  "STORE_FUNDING_ALLOCATIONS_INVALID",
  "STORE_FUNDING_DUPLICATE_ACCOUNT",
  "STORE_FUNDING_TARGET_PRECISION_INVALID",
  "STORE_FUNDING_REMAINDER_INVALID",
  "allocationIntent",
  "seeded-store-funding-quote-v2",
  "business-store-offer-funding-quote-v2",
  "jsonb_typeof",
  "targetAmount",
  "seller_offer_id",
  "seller_offer_version",
  "available_quantity_at_quote",
  "seller_offer_version_after",
  "remaining_seller_quantity",
  "store_purchase_quotes_seller_offer_scope_fk",
  "store_purchase_quotes_seller_offer_binding_check",
  "store_purchases_seller_offer_result_check",
  "store_purchase_quotes_seller_offer_created_idx",
  "guard_store_purchase_offer_binding_v2",
  "guard_store_purchase_offer_result_v2",
  "economy_private.post_inventory_transaction_v2(uuid,text,text,text,uuid,text,jsonb,jsonb)",
  "system_offer_funded_purchase",
  "seller_kind = ''npc''",
  "STORE_OFFER_FUNDED_RECEIPT_NOT_FOUND",
  "buyer_player_id = p_buyer_player_id",
  "set search_path = pg_catalog",
  "from public, anon, authenticated",
  "to service_role",
], "10A.4D bounded forward repair migration");
assert.match(
  source.migration,
  /create or replace function public\.settle_business_store_offer_funding_v2\(\s*p_game_session_id uuid,\s*p_buyer_player_id uuid,\s*p_quote_key text,\s*p_idempotency_key text\s*\)/iu,
  "10A.4D Business settlement must expose only game, authenticated buyer, quote key, and idempotency intent.",
);
assert.match(
  source.migration,
  /jsonb_array_length\([\s\S]*?\)\s+not between 1 and 3/iu,
  "10A.4D allocations must remain bounded to one through three accounts.",
);
assert.match(
  source.migration,
  /allocation\.ordinal\s*=\s*v_count[\s\S]*?jsonb_typeof\(allocation\.value\s*->\s*'targetAmount'\)[\s\S]*?is distinct from\s*'null'/iu,
  "10A.4D must recognize the ordered final-null remainder intent.",
);
assert.match(
  source.migration,
  /seller_offer_id is not null\s+and seller_offer_version is not null\s+and available_quantity_at_quote is not null/iu,
  "Offer-bound Store quotes must require the complete non-null seller binding family.",
);
assert.match(
  source.migration,
  /seller_offer_version_after is not null\s+and remaining_seller_quantity is not null/iu,
  "Offer-bound Store receipts must require the complete non-null result family.",
);
assert.deepEqual(
  [...source.migration.matchAll(/\balter\s+table\s+public\.([a-z_]+)/giu)]
    .map((match) => match[1]),
  [
    "store_purchase_quotes",
    "store_purchase_quotes",
    "store_purchases",
    "store_purchases",
  ],
  "10A.4D may alter only the two retained Store evidence tables in the bounded four statements.",
);
assert.deepEqual(
  [...source.migration.matchAll(/\badd\s+column\s+([a-z_]+)/giu)]
    .map((match) => match[1]).sort(),
  [
    "available_quantity_at_quote",
    "remaining_seller_quantity",
    "seller_offer_id",
    "seller_offer_version",
    "seller_offer_version_after",
  ],
  "10A.4D additive Store evidence columns changed.",
);
assert.deepEqual(
  [...source.migration.matchAll(/\badd\s+constraint\s+([a-z_]+)/giu)]
    .map((match) => match[1]).sort(),
  [
    "store_purchase_quotes_seller_offer_binding_check",
    "store_purchase_quotes_seller_offer_scope_fk",
    "store_purchases_seller_offer_result_check",
  ],
  "10A.4D additive Store evidence constraints changed.",
);
assert.deepEqual(
  [...source.migration.matchAll(/\bcreate\s+index\s+([a-z_]+)/giu)]
    .map((match) => match[1]),
  ["store_purchase_quotes_seller_offer_created_idx"],
  "10A.4D may add only the bounded seeded/NPC offer lookup index.",
);
assert.deepEqual(
  [...source.migration.matchAll(/\bcreate\s+trigger\s+([a-z0-9_]+)/giu)]
    .map((match) => match[1]).sort(),
  [
    "guard_store_purchase_offer_binding_v2",
    "guard_store_purchase_offer_result_v2",
  ],
  "10A.4D may add only the two immutable Store evidence guards.",
);
assert.match(
  source.migration,
  /create trigger guard_store_purchase_offer_binding_v2\s+before insert or update on public\.store_purchase_quotes/iu,
  "10A.4D quote binding guard is not attached to the retained quote evidence.",
);
assert.match(
  source.migration,
  /create trigger guard_store_purchase_offer_result_v2\s+before insert or update on public\.store_purchases/iu,
  "10A.4D purchase result guard is not attached to the retained receipt evidence.",
);
assert.doesNotMatch(
  source.migration,
  /\b(?:create|drop|truncate)\s+table\b|\bcreate\s+unique\s+index\b|\b(?:drop|rename)\s+(?:column|constraint|index|trigger)\b|\balter\s+column\b|\bcreate\s+policy\b|\b(?:enable|force|disable)\s+row\s+level\s+security\b|\bgrant\s+(?:select|insert|update|delete|truncate|references|trigger|all)\b[\s\S]*?\bon\s+table\b/iu,
  "10A.4D exceeded its exact additive Store evidence exception.",
);
excludesAll(source.migration, [
  "record_business_ledger_entry",
  "purchase_quoted_store_item",
  "create_business_store_offer_quote_v2",
  "settle_business_store_offer_v2",
  "grant execute to authenticated",
  "grant execute to anon",
], "10A.4D bounded forward repair migration");
const systemOfferSettlement = source.migration.match(
  /create or replace function public\.settle_seeded_store_funding_v1\([\s\S]*?\$function\$;/iu,
)?.[0];
assert.ok(systemOfferSettlement, "10A.4D system-offer funded settlement body is missing.");
assert.doesNotMatch(
  systemOfferSettlement,
  /record_player_ledger_entry|record_business_ledger_entry|purchase_quoted_store_item/iu,
  "The converged system-offer settlement must not call a legacy ledger or purchase authority.",
);
assert.ok(
  source.migration.includes("v_system_offer_settlement_source like '%record_player_ledger_entry%'"),
  "10A.4D migration assertions must reject a legacy Player ledger call in the installed system-offer settlement.",
);
const systemOfferLiveAdapter = source.migration.match(
  /create or replace function public\.settle_system_store_offer_funding_v2\([\s\S]*?\$function\$;/iu,
)?.[0];
assert.ok(systemOfferLiveAdapter, "10A.4D live system-offer settlement adapter is missing.");
includesAll(systemOfferLiveAdapter, [
  "seller_offer_id is null",
  "STORE_SYSTEM_OFFER_FUNDED_SETTLEMENT_LEGACY_CONFLICT",
  "settle_seeded_store_funding_v1",
], "live system-offer settlement adapter");
assert.doesNotMatch(
  systemOfferLiveAdapter,
  /for update|\binsert\b|\bupdate\b|\bdelete\b/iu,
  "The live system-offer adapter must reject legacy quotes without pre-locking or writing before canonical settlement.",
);
includesAll(retainedC1QuoteSource, [
  "public.create_purchase_funding_quote_v1",
  "private.store_funding_normalize_allocations_v1",
  "STORE_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT",
  "STORE_OFFER_FUNDED_QUOTE_IDEMPOTENCY_CONFLICT",
], "retained C1 Store funding authority");
const quoteOnlySettlement = source.migration.match(
  /create or replace function public\.settle_business_store_offer_funding_v2\([\s\S]*?\$function\$;/iu,
)?.[0];
assert.ok(quoteOnlySettlement, "10A.4D quote-only settlement body is missing.");
assert.doesNotMatch(
  quoteOnlySettlement,
  /for update|\binsert\b|\bupdate\b|\bdelete\b/iu,
  "The D settlement adapter must derive immutable quote intent without taking a pre-delegation lock or writing rows.",
);

for (
  const [label, root] of [
    ["classroom-api", source.classroomRoot],
    ["player-api", source.playerRoot],
  ]
) {
  includesAll(root, [
    "../../../src/domains/store/api/playerStorePublicHttpHandler.ts",
    "handlePlayerStorePublicRequest",
  ], `${label} Store entrypoint`);
}

includesAll(source.handler, [
  "SupabasePlayerStoreFundingPublicRepository",
  "SupabasePlayerStorePublicReadRepository",
  "SupabasePlayerStoreOfferProductPublicRepository",
  "readPlayerStoreFundingAllocations",
  "createSystemOfferQuote",
  "settleSystemOfferPurchase",
  "createBusinessOfferQuote",
  "settleBusinessOfferPurchase",
  "readBusinessOfferReceipt",
  "refreshRequired: true",
], "live Player Store handler");
excludesAll(source.handler, [
  "SupabasePlayerStorePublicRepository",
  "SupabasePlayerStoreOfferPublicRepository",
  ".createQuote(",
  ".purchase(",
  ".purchaseBusinessOffer(",
  "createSeededQuote",
  "settleSeededPurchase",
  "readPlayerStoreOptionalTimestamp",
  "readPlayerStoreStrictOptionalTimestamp",
], "live Player Store handler");

includesAll(source.validation, [
  '"allocations"',
  '"idempotencyKey"',
  "readPlayerStoreFundingAllocations",
  "one to three ordered Checking accounts",
  "unique Checking accounts",
  "final funding allocation must have targetAmount null",
  "positive canonical decimal string",
], "Player Store request validation");
assert.match(
  source.validation,
  /finalAllocation\s*=\s*index\s*===\s*value\.length\s*-\s*1/iu,
  "The final-null allocation must be positional and order-preserving.",
);

includesAll(source.fundingContracts, [
  "PlayerStoreFundingAllocationInput",
  "readonly targetAmount: string | null",
  "PlayerStoreFundingQuoteDto",
  "PlayerStoreFundingReceiptDto",
  "PlayerStoreFundingPublicRepository",
  "createSystemOfferQuote",
  "settleSystemOfferPurchase",
  "createBusinessOfferQuote",
  "settleBusinessOfferPurchase",
], "funded Store public contracts");
excludesAll(source.fundingContracts, [
  "createSeededQuote",
  "settleSeededPurchase",
], "funded Store converged public contracts");
includesAll(source.seededContracts, [
  "PlayerStorePublicReadRepository",
  "Combined pre-funding Store port retained for isolated regression coverage",
], "seeded Store read contract");
includesAll(source.offerContracts, [
  "PlayerStoreOfferProductPublicRepository",
  "Combined pre-funding Business-offer port retained for regression coverage",
], "Business-offer read contract");

includesAll(source.fundingRepository, [
  '"./playerStoreFundingPublicErrors.ts"',
  '"create_system_store_offer_funding_quote_v2"',
  '"settle_system_store_offer_funding_v2"',
  '"create_business_store_offer_funding_quote_v1"',
  '"settle_business_store_offer_funding_v2"',
  '"read_business_store_offer_funding_receipt_v1"',
  "p_quote_key: input.quoteKey",
  "p_idempotency_key: input.idempotencyKey",
], "funded Store repository");
excludesAll(source.fundingRepository, [
  '"create_seeded_store_funding_quote_v1"',
  '"settle_seeded_store_funding_v1"',
  '"purchase_quoted_store_item"',
  '"create_business_store_offer_quote_v2"',
  '"settle_business_store_offer_v2"',
  "p_offer_key: input.offerKey,\n        p_quote_key",
], "funded Store repository");
const businessSettlementRepository = source.fundingRepository.match(
  /async settleBusinessOfferPurchase\([\s\S]*?\n  \}\n\n  async readBusinessOfferReceipt/iu,
)?.[0];
assert.ok(businessSettlementRepository, "Quote-only Business repository settlement method is missing.");
includesAll(businessSettlementRepository, [
  '"settle_business_store_offer_funding_v2"',
  "p_quote_key: input.quoteKey",
  "p_idempotency_key: input.idempotencyKey",
], "quote-only Business repository settlement");
excludesAll(businessSettlementRepository, [
  "p_offer_key",
  "p_quantity",
  "p_expected_offer_version",
  "p_allocations",
], "quote-only Business repository settlement");

const readOnlyAdapters = [
  source.seededReadRepository,
  source.offerReadRepository,
  source.offerReadStore,
].join("\n");
includesAll(source.seededReadRepository, [
  "Mutation-free Player Store catalog and purchase-history adapter",
  "listItems",
  "listPurchases",
], "seeded Store read adapter");
includesAll(source.offerReadRepository, [
  "Mutation-free Store offer-product projection",
  "listOfferProducts",
  "listCatalogOfferGroups",
], "Business-offer read adapter");
assert.doesNotMatch(
  readOnlyAdapters,
  /\.rpc\s*\(|\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|purchase_quoted_store_item|create_business_store_offer_quote_v2|settle_business_store_offer_v2/iu,
  "Live catalog/history adapters must be structurally mutation-free.",
);

const liveMutationSources = [
  source.classroomRoot,
  source.playerRoot,
  source.handler,
  source.fundingRepository,
].join("\n");
excludesAll(liveMutationSources, [
  '"purchase_quoted_store_item"',
  '"create_business_store_offer_quote_v2"',
  '"settle_business_store_offer_v2"',
], "live Player Store composition");

includesAll(source.fundingProjection, [
  "parseFundingQuote",
  "parseFundingReceipt",
  "target_contribution",
  "source_debit",
  "reference_rate",
  "customer_rate",
  "effective_rate",
  "spread_rate",
], "funding evidence projection");
includesAll(source.fundingErrors, [
  "mapFundingRpcError",
  "PRE_FUNDING_QUOTE_CONFLICT",
  "store_funding_quote_required",
  "store_purchase_in_progress",
], "funding error projection");
includesAll(source.playerFundingIntent, [
  "sourceAccountKey",
  "targetAmount: null",
  "canonicalStoreTargetAmount",
  "allocations",
  "targetReserveDrawAmount",
  "validateStoreFundingQuoteEvidence",
  "validateStoreFundingReceiptEvidence",
], "Player funding intent builder");
includesAll(source.playerPurchaseContract, [
  "fundingQuote",
  "fundingReceipt",
  "validateStoreFundingQuoteEvidence",
  "validateStoreFundingReceiptEvidence",
  "allocationIntent",
], "Player Store funding evidence contract");
includesAll(source.playerPurchaseFlow, [
  "allocations",
  "validateBusinessOfferQuote",
  "validateBusinessOfferReceipt",
  "validateSystemOfferQuote",
  "validateSystemOfferReceipt",
  "convergeCommittedStorePurchase",
], "Player Store funded flow");
excludesAll(source.playerPurchaseFlow, [
  "validateSeededQuote",
  "validateSeededReceipt",
], "Player Store converged system-offer flow");
includesAll(source.playerConvergence, [
  "validateImmutableBusinessOfferReceipt",
  "refreshResources",
  "purchase completed",
], "committed-success convergence");

const playerSurface = [
  source.playerPage,
  source.playerFundingTest,
  source.playerLocalCurrencyTest,
  source.playerFlowTest,
  source.playerConnectedTest,
  source.playerBrowser,
].join("\n");
includesAll(playerSurface, [
  "funding",
  "allocations",
  "targetAmount",
  "requiresFx",
  "fundingReceipt",
], "Player Store UI and permanent tests");
assert.doesNotMatch(
  [source.playerPage, source.playerPurchaseFlow].join("\n"),
  /LOCAL WALLET|LOCAL AVAILABLE BALANCE|same-currency purchase settles|before retail checkout FX|converts?[^.]{0,160}(?:THD|local wallet)/iu,
  "The final Player Store surface must not retain the local-wallet/same-currency boundary.",
);
includesAll(source.playerLocalCurrencyTest, [
  "assert.doesNotMatch",
  "LOCAL WALLET",
  "LOCAL AVAILABLE BALANCE",
  "same-currency purchase",
], "retired same-currency Player copy regression");

includesAll(source.database, [
  "create_seeded_store_funding_quote_v1",
  "create_system_store_offer_funding_quote_v2",
  "settle_system_store_offer_funding_v2",
  "create_business_store_offer_funding_quote_v1",
  "settle_business_store_offer_funding_v2",
  "targetAmount: null",
  "STORE_FUNDING_ALLOCATIONS_INVALID",
  "STORE_FUNDING_DUPLICATE_ACCOUNT",
  "STORE_FUNDING_TARGET_PRECISION_INVALID",
  "STORE_FUNDING_REMAINDER_INVALID",
  "d-seeded-final-null-all-foreign",
  "d-system-seeded-fresh-b",
  "d-system-npc-settle",
  "STORE_SYSTEM_OFFER_FUNDED_SETTLEMENT_LEGACY_CONFLICT",
  "d-business-final-null-fresh",
  "STORE_OFFER_FUNDED_SETTLEMENT_IDEMPOTENCY_CONFLICT",
  "d-business-different-quote",
  "two-game",
  "replay",
], "10A.4D database acceptance");
includesAll(source.concurrency, [
  "settle_business_store_offer_funding_v2",
  "targetAmount: null",
  "pollForDatabaseWait",
  "waitEventType",
  "Lock",
  "replay",
  "reverse",
], "10A.4D concurrency acceptance");
includesAll(source.connectedHarness, [
  "fundForeignBuyerChecking",
  "businessAllForeignFundingSelected",
  "retainedSeededAllForeignFundingSelected",
  "fundingSourcesDebitedExactly",
  "business_offer_purchase_funding",
  'data-player-store-purchase-mode="system_offer"',
  'contextKind: "store.system-offer"',
  '"system_offer_purchase_funding"',
  "purchase_funding_source_debit",
  "purchase_funding_recipient_credit",
  "unit_cost = receipt.unit_price",
  "create_business_store_offer_funding_quote_v1",
  "settle_business_store_offer_funding_v2",
], "10A.4D connected all-foreign funded settlement");
excludesAll(source.connectedHarness, [
  'data-player-store-purchase-mode="seeded_offer"',
  'contextKind: "store.seeded"',
  '"seeded_store_purchase_funding"',
  "business_offer_purchase_debit",
  "business_offer_purchase_credit",
  "create_business_store_offer_quote_v2",
  "settle_business_store_offer_v2",
], "10A.4D connected funded settlement authority");

includesAll(source.workflow, [
  "business-player-store-fx-final-v2",
  "feat/business-player-store-fx-final-v2",
  "scripts/business-player-store-fx-final-contract.mjs",
  "scripts/business-player-store-fx-final-database.mjs",
  "scripts/business-player-store-fx-final-concurrency.mjs",
  "scripts/verify-player-cross-cutting-authority.mjs",
  "scripts/validate-supabase-migrations.mjs",
  "scripts/multicurrency-funding-database.mjs",
  "scripts/multicurrency-funding-concurrency.mjs",
  "scripts/multicurrency-store-funding-database.mjs",
  "scripts/business-multicurrency-treasury-database.mjs",
  "scripts/business-phase10-atomic-settlement-concurrency.mjs",
  "npx supabase db reset --workdir backend --local",
  "npx supabase db lint --workdir backend --local --level warning",
  "npx supabase db advisors",
  "--fail-on error",
  "git diff --check \"origin/${BASE_REF}...HEAD\"",
  "auth_throttle_check_v2",
  "npm --prefix backend run typecheck",
  "playwright install --with-deps chromium",
], "10A.4D permanent workflow");
for (const check of criticalJobChecks) {
  assert.ok(
    source.workflow.includes(`name: ${check}`),
    `10A.4D workflow is missing the stable critical check context ${check}.`,
  );
}
for (const authorityPath of [
  "scripts/player-cross-cutting-authority.test.mjs",
  "scripts/verify-player-cross-cutting-authority.mjs",
]) {
  assert.equal(
    source.workflow.match(new RegExp(`- ${authorityPath.replaceAll(".", "\\.")}`, "gu"))?.length,
    2,
    `10A.4D pull-request and push filters must both include ${authorityPath}.`,
  );
}
assert.match(
  source.workflow,
  /for PASS in 1 2; do[\s\S]*?supabase db reset/iu,
  "10A.4D workflow must replay the zero-to-head database twice.",
);
assert.doesNotMatch(
  source.workflow,
  /supabase\s+(?:functions\s+deploy|db\s+push|migration\s+up)|vercel\s+deploy|schedule|cron|production/iu,
  "10A.4D certification must not deploy, configure a scheduler, or mutate a live database.",
);

console.log(
  `Business Player Store/FX final contract passed for ${migrationName}: both Edge roots compose one funded mutation authority with read-only catalog adapters, ordered final-null allocation intent, immutable evidence, and permanent exact-head certification.`,
);
