import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = Object.freeze({
  schema: "backend/supabase/migrations/20260827100000_multicurrency_marketplace_funding_schema_v1.sql",
  quote: "backend/supabase/migrations/20260827100500_multicurrency_marketplace_funding_quote_v1.sql",
  settlement: "backend/supabase/migrations/20260827101000_multicurrency_marketplace_funding_settlement_v1.sql",
  refund: "backend/supabase/migrations/20260827101500_multicurrency_marketplace_funding_refund_v1.sql",
  assertions: "backend/supabase/migrations/20260827102000_multicurrency_marketplace_funding_assertions_v1.sql",
  purgeRegistry: "backend/supabase/migrations/20260827102500_multicurrency_marketplace_funding_purge_registry_v1.sql",
  contracts: "backend/src/domains/marketplace/contracts/playerMarketplaceFundingContracts.ts",
  response: "backend/src/domains/marketplace/infrastructure/playerMarketplaceFundingResponse.ts",
  repository: "backend/src/domains/marketplace/infrastructure/supabasePlayerMarketplaceFundingRepository.ts",
  route: "backend/src/domains/marketplace/api/playerMarketplaceRoutePaths.ts",
  inputs: "backend/src/domains/marketplace/api/playerMarketplaceFundingHttpInputs.ts",
  handler: "backend/src/domains/marketplace/api/playerMarketplaceHttpHandler.ts",
  handlerTest: "backend/src/domains/marketplace/api/playerMarketplaceHttpHandler.test.ts",
  endpoints: "player-terminal/src/api/endpoints.js",
  backendRoutes: "player-terminal/src/api/marketplace-backend-routes.js",
  capabilities: "player-terminal/src/api/capabilities.js",
  resourcePlan: "player-terminal/src/api/resource-plan.js",
  playerReadModel: "player-terminal/src/features/marketplace/marketplace-funding-read-model.js",
  playerFlow: "player-terminal/src/features/marketplace/marketplace-funding-flow.js",
  playerPage: "player-terminal/src/pages/marketplace-page.js",
  playerMain: "player-terminal/src/main.js",
  playerTest: "player-terminal/tests/marketplace-funding-flow.mjs",
  connectedRunner: "player-terminal/tools/connected-marketplace-mutation-runner.mjs",
  scope: "docs/roadmaps/multicurrency-marketplace-funding-scope-v1.md",
  authority: "docs/operations/contracts/player-cross-cutting/pr-675.json",
  workflow: ".github/workflows/multicurrency-marketplace-funding-v1.yml",
  connectedRunner: "player-terminal/tools/connected-marketplace-mutation-runner.mjs",
});

const source = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));

function includesAll(label, text, required) {
  for (const token of required) {
    assert.ok(text.includes(token), `${label} is missing required token: ${token}`);
  }
}

includesAll("schema migration", source.schema, [
  "marketplace_purchase_reservations",
  "funding_quote_id",
  "marketplace_orders_payment_evidence_check",
  "marketplace_funding_refunds",
  "force row level security",
  "MARKETPLACE_FUNDING_DIRECT_WRITE_FORBIDDEN",
  "marketplace_reservations_funding_binding_guard",
  "marketplace_orders_funding_binding_guard",
]);

includesAll("quote migration", source.quote, [
  "create_marketplace_funding_quote_v1",
  "marketplace.purchase",
  "marketplace.settlement-clearing",
  "marketplace.fee-revenue",
  "marketplace.tax-payable",
  "create_purchase_funding_quote_v1",
  "marketplace_assert_listing_reservation_v1",
  "MARKETPLACE_SELLER_ACCOUNT_UNAVAILABLE",
  "MARKETPLACE_LISTING_MINOR_UNIT_INVALID",
  "funded_purchase_quoted",
]);
assert.ok(
  !source.quote.includes("MARKETPLACE_CURRENCY_MISMATCH"),
  "C2 quote must not require buyer home currency to equal listing currency.",
);
assert.ok(
  !source.quote.includes("record_player_ledger_entry"),
  "C2 quote must not invoke legacy ledger gateways.",
);

includesAll("settlement migration", source.settlement, [
  "settle_marketplace_funding_v1",
  "compose_purchase_funding_v1",
  "marketplace_purchase_distribution",
  "post_bank_transaction_v1",
  "marketplace_settlement_clearing_debit",
  "marketplace_seller_proceeds_credit",
  "marketplace_fee_revenue_credit",
  "marketplace_tax_payable_credit",
  "marketplace_transition_listing_reservation_v1",
  "MARKETPLACE_SETTLEMENT_CLEARING_RESIDUE",
]);
for (const forbidden of [
  "record_player_ledger_entry",
  "marketplace_treasury_balances",
  "account_type = 'cash'",
]) {
  assert.ok(
    !source.settlement.includes(forbidden),
    `C2 settlement retained forbidden monetary authority: ${forbidden}`,
  );
}

includesAll("refund migration", source.refund, [
  "reverse_purchase_funding_receipt_v1",
  "purchase_funding_exact_reversal",
  "marketplace_distribution_reversal",
  "marketplace_refund_distribution",
  "marketplace_refund_funding_reversal",
  "marketplace_funding_refunds",
  "MARKETPLACE_REFUND_CLEARING_RESIDUE",
  "review_marketplace_admin_pre_c2_v2",
]);
for (const forbidden of [
  "record_player_ledger_entry",
  "marketplace_treasury_balances",
  "fx_rate",
  "convert_currency_amount",
]) {
  assert.ok(
    !source.refund.includes(forbidden),
    `C2 refund retained forbidden repricing/treasury authority: ${forbidden}`,
  );
}

includesAll("assertion migration", source.assertions, [
  "MARKETPLACE_FUNDING_COLUMNS_MISSING",
  "MARKETPLACE_FUNDING_REFUND_RLS_INVALID",
  "MARKETPLACE_FUNDING_BROWSER_EXECUTE_FORBIDDEN",
  "MARKETPLACE_FUNDING_REVERSAL_PRIVATE_AUTHORITY_INVALID",
  "MARKETPLACE_FUNDING_SEARCH_PATH_MISSING",
]);

includesAll("purge registry migration", source.purgeRegistry, [
  "private.game_data_purge_table_registry",
  "public.marketplace_funding_refunds",
  "marketplace_funding_refunds",
  "on conflict (table_schema, table_name) do nothing",
  "MARKETPLACE_FUNDING_PURGE_REGISTRY_INCOMPLETE",
]);

includesAll("public contracts", source.contracts, [
  "PlayerMarketplaceFundingAllocationInput",
  "PlayerMarketplaceFundedReservationDto",
  "PlayerMarketplaceFundedOrderDto",
  "PlayerMarketplaceFundedRefundDto",
  "sourceAccountKey",
  "targetAmount",
]);
includesAll("response parser", source.response, [
  "UUID_ANY",
  "parseMarketplaceFundingQuote",
  "parseMarketplaceFundingOrder",
  "mapMarketplaceFundingRpcError",
  "MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN",
]);
includesAll("repository", source.repository, [
  "create_marketplace_funding_quote_v1",
  "settle_marketplace_funding_v1",
  "p_allocations",
  "p_reservation_key",
]);

includesAll("authenticated route", source.route, [
  'readonly kind: "purchase"',
  'readonly action: "retired" | "quote"',
  'readonly action: "settlement"',
  "|quotes",
  "/settlements",
  "MARKETPLACE_RESERVATION_KEY_PATTERN",
]);
includesAll("funding HTTP input boundary", source.inputs, [
  "readMarketplaceFundingAllocations",
  "readMarketplaceClientTimestamp",
  "MARKETPLACE_FUNDING_ACCOUNT_KEY_PATTERN",
  "Marketplace funding accounts must be valid and unique",
]);
includesAll("authenticated handler", source.handler, [
  "createFundingRepository",
  "readMarketplaceFundingAllocations",
  "readMarketplaceClientTimestamp",
  "createQuote",
  "fundingRepository.settle",
  "player_marketplace_purchase_retired",
  'route.action === "quote"',
  'route.action === "settlement"',
]);
for (const forbidden of ["unitPrice: body", "currencyCode: body", "targetAccountKey"]) {
  assert.ok(
    !source.handler.includes(forbidden),
    `Player handler trusts forbidden monetary field: ${forbidden}`,
  );
}
includesAll("authenticated handler tests", source.handlerTest, [
  "explicit funding quote and settlement confirmation",
  "player_marketplace_purchase_retired",
  "duplicate accounts",
  "assertNoUuid",
  'action: "quote"',
  'action: "settlement"',
]);

includesAll("Player endpoints", source.endpoints, [
  "/marketplace/listings/:listingId/quotes",
  "/marketplace/reservations/:reservationId/settlements",
]);
includesAll("Player backend routes", source.backendRoutes, [
  "marketplaceSettlement",
  "/quotes",
  "/settlements",
  "allocations(payload",
  "clientSubmittedAt",
]);
includesAll("Player capability mapping", source.capabilities, [
  'marketplaceSettlement: "marketplacePurchase"',
]);
includesAll("Player resource plan", source.resourcePlan, [
  'marketplacePurchase: Object.freeze([])',
  'marketplaceSettlement: Object.freeze(["dashboard", "marketplace", "inventory", "banking", "bankingFx"])',
  'optional: Object.freeze(["inventory", "banking", "bankingFx"])',
]);
includesAll("Player funding read model", source.playerReadModel, [
  "normalizeMarketplaceFundingQuote",
  "normalizeMarketplaceFundingOrder",
  "INTERNAL_UUID",
  "customerRate",
  "effectiveRate",
  "roundingDisclosure",
]);
includesAll("Player funding flow", source.playerFlow, [
  "installMarketplaceFundingFlow",
  'api.execute(\n        "marketplacePurchase"',
  'api.execute(\n        "marketplaceSettlement"',
  "readAllocations",
  "currentFundingQuote",
  "refreshResources",
]);
includesAll("Player Marketplace page", source.playerPage, [
  'data-player-marketplace-funding-form="quote"',
  'name="sourceAccountKey"',
  'name="targetAmount"',
  'data-player-marketplace-funding-form="settlement"',
  "IMMUTABLE FUNDING QUOTE",
  "Reference",
  "Customer",
  "Effective",
]);
assert.ok(
  !source.playerPage.includes('data-endpoint="marketplacePurchase"'),
  "Legacy direct Marketplace purchase form remains active.",
);
includesAll("Player composition", source.playerMain, [
  "installMarketplaceFundingFlow",
  "marketplaceFunding.destroy()",
]);
includesAll("Player funding test", source.playerTest, [
  "quote from settlement confirmation",
  "rejects UUIDs and incoherent totals",
  "legacy purchase tombstone",
]);
includesAll("connected Marketplace runner", source.connectedRunner, [
  'data-player-marketplace-funding-form=\"quote\"',
  "/quotes",
  'data-player-marketplace-funding-form=\"settlement\"',
  "/settlements",
  "buyerAccountKey",
  "quoteReplaySafe",
  "record_player_ledger_entry",
]);
for (const forbidden of [
  "account_type = 'cash'",
  "/purchase",
  'data-endpoint=\"marketplacePurchase\"',
]) {
  assert.ok(
    !source.connectedRunner.includes(forbidden),
    `Connected Marketplace runner retained a retired funding path: ${forbidden}`,
  );
}

includesAll("connected browser workflow", source.workflow, [
  "connected-browser:",
  "Verify connected multi-currency Marketplace funding browser journey",
  "node scripts/player-multiplayer-browser-acceptance.mjs",
  "node player-terminal/tools/connected-marketplace-mutation-runner.mjs",
  "player-marketplace-mutation-browser-acceptance.json",
  "Enforce connected Marketplace evidence",
]);
includesAll("connected Marketplace runner", source.connectedRunner, [
  "/functions/v1/player-web-session-api/login",
  'credentials: "include"',
  "quoteReplaySafe",
  "replaySafe",
  "unauthenticatedRejected",
]);
assert.ok(
  !source.connectedRunner.includes("/functions/v1/classroom-api/players/login"),
  "Connected Marketplace browser journey retained the direct legacy Player login path.",
);
assert.ok(
  !source.connectedRunner.includes('"authorization", "content-type"'),
  "Connected Marketplace replay retained browser Authorization forwarding.",
);

const authority = JSON.parse(source.authority);
assert.equal(authority.pullRequestNumber, 675);
assert.equal(authority.baseRef, "feat/multicurrency-store-funding-v1");
assert.equal(authority.productionDeploymentAllowed, false);
assert.equal(authority.productionMutationAllowed, false);
assert.equal(authority.secretValuesAllowed, false);
for (const path of Object.values(paths)) {
  if (path === paths.scope || path === paths.authority) continue;
  assert.ok(
    authority.allowedPaths.includes(path),
    `PR authority does not allow the reviewed path: ${path}`,
  );
}

includesAll("controlling scope", source.scope, [
  "BUSINESS-V2-10A4C2",
  "marketplace.settlement-clearing",
  "marketplace.fee-revenue",
  "marketplace.tax-payable",
  "reverse the original C0 funding",
  "C3 must not begin until the C2 handoff exists",
]);

console.log("Multi-currency Marketplace funding structural contract passed.");
