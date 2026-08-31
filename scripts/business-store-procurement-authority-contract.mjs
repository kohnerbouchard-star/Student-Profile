#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = Object.freeze({
  migration: "backend/supabase/migrations/20260821060000_business_store_procurement_v2.sql",
  pricing: "backend/supabase/migrations/20260820070000_store_quote_pricing_resolver_v2.sql",
  contracts: "backend/src/domains/business/contracts/playerBusinessContracts.ts",
  handler: "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
  procurement: "backend/src/domains/business/api/playerBusinessStoreProcurement.ts",
  procurementRequest: "backend/src/domains/business/api/playerBusinessStoreProcurementRequest.ts",
  fundingProjection: "backend/src/domains/business/api/playerBusinessStoreFundingProjection.ts",
  fundingProjectionSupport: "backend/src/domains/business/api/playerBusinessStoreFundingProjectionSupport.ts",
  procurementProjection: "backend/src/domains/business/api/playerBusinessStoreProcurementProjection.ts",
  projectionSupport: "backend/src/domains/business/api/playerBusinessStoreProjectionSupport.ts",
  routes: "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
  routeTests: "backend/src/domains/business/api/playerBusinessRoutePaths.test.ts",
  procurementTests: "backend/src/domains/business/api/playerBusinessStoreProcurement.test.ts",
  repository: "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
  databaseErrors: "backend/src/domains/business/infrastructure/playerBusinessDatabaseErrors.ts",
  sharedDispatch: "backend/supabase/functions/_shared/playerBusinessDispatch.ts",
  compatibilityRoutes: "backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts",
  classroomRuntime: "backend/supabase/functions/classroom-api/index.ts",
  playerRuntime: "backend/supabase/functions/player-api/runtime.ts",
  workflow: ".github/workflows/business-economy-v2.yml",
});

const sourceEntries = await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
);
const source = Object.fromEntries(sourceEntries);
const procurementRequestBoundary = [
  source.procurement,
  source.procurementRequest,
].join("\n");
const procurementProjectionBoundary = [
  source.fundingProjection,
  source.fundingProjectionSupport,
  source.procurementProjection,
  source.projectionSupport,
].join("\n");
const repositoryErrorBoundary = [
  source.repository,
  source.databaseErrors,
].join("\n");

function mustMatch(text, pattern, message) {
  assert.match(text, pattern, message);
}
function mustNotMatch(text, pattern, message) {
  assert.doesNotMatch(text, pattern, message);
}
function mustContain(text, value, message) {
  assert.ok(text.includes(value), message);
}

assert.match(source.migration.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(source.migration.trim(), /commit;$/u);
assert.match(source.pricing.trim(), /^--[\s\S]*\nbegin;/u);
assert.match(source.pricing.trim(), /commit;$/u);

// Canonical Store pricing, scarcity, country snapshot, FX, version, and TTL.
mustMatch(source.pricing, /create or replace function public\.resolve_store_quote_pricing_v2/u,
  "Phase 3B must reuse one canonical Store quote resolver.");
mustMatch(source.pricing, /public\.store_items/u, "Store catalog and finite stock must remain canonical.");
mustMatch(source.pricing, /public\.country_economic_snapshots/u,
  "Store pricing must use the canonical country economic snapshot.");
mustMatch(source.pricing, /v_snapshot\.supply_constraint_index/u,
  "Store scarcity must remain snapshot-derived.");
mustMatch(source.pricing, /public\.convert_currency_amount/u,
  "Canonical Store FX conversion must remain authoritative.");
mustMatch(source.pricing, /store-pricing-v1:country-snapshot/u,
  "Quotes must carry a stable pricing-policy version.");
mustMatch(source.pricing, /v_effective_at \+ interval '3 minutes'/u,
  "Quotes must be short lived and server timed.");

// Quote and receipt rows are immutable operation evidence, not new authorities.
mustMatch(source.migration, /create table public\.business_store_purchase_quotes/u);
mustMatch(source.migration, /create table public\.business_store_purchases/u);
mustMatch(source.migration, /business_store_purchase_quotes_scope_id_unique/u,
  "Quote evidence needs a game-scoped composite identity.");
mustMatch(source.migration, /business_store_purchases_quote_scope_fk[\s\S]{0,180}references public\.business_store_purchase_quotes\(game_session_id, id\)/u,
  "Purchase evidence must reference a quote in the same game.");
mustMatch(source.migration, /alter table public\.business_store_purchase_quotes enable row level security/u);
mustMatch(source.migration, /alter table public\.business_store_purchases enable row level security/u);
mustMatch(source.migration, /guard_business_store_quote_evidence_v2/u,
  "Quote evidence must be immutable outside reviewed terminal transitions.");
mustMatch(source.migration, /guard_business_store_purchase_evidence_v2/u,
  "Receipt evidence must be immutable outside STARTED to COMPLETED.");
mustMatch(source.migration, /before update or delete on public\.business_store_purchase_quotes/u);
mustMatch(source.migration, /before update or delete on public\.business_store_purchases/u);
mustMatch(source.migration, /revoke all on table public\.business_store_purchase_quotes[\s\S]{0,100}from public, anon, authenticated/iu);
mustMatch(source.migration, /revoke all on table public\.business_store_purchases[\s\S]{0,100}from public, anon, authenticated/iu);

for (const forbiddenParallelAuthority of [
  /create table(?: if not exists)? public\.store_items\s*\(/iu,
  /create table(?: if not exists)? public\.game_items\s*\(/iu,
  /create table(?: if not exists)? public\.inventory_(?:accounts|holdings|transactions)\s*\(/iu,
  /create table(?: if not exists)? public\.account_balances\s*\(/iu,
  /create table(?: if not exists)? public\.business_inventory\s*\(/iu,
  /create table(?: if not exists)? public\.(?:wholesale|supplier)_[a-z0-9_]*\s*\(/iu,
]) {
  mustNotMatch(
    source.migration,
    forbiddenParallelAuthority,
    "Phase 3B may not create a parallel catalog, inventory, supplier, or money authority.",
  );
}
mustNotMatch(source.migration, /ensure_player_inventory_account_v2/iu,
  "Business procurement must never route materials through owner Inventory.");
mustNotMatch(source.migration, /purchase_business_input_v1/iu,
  "Canonical procurement must not expand legacy abstract-input purchasing.");

// Business scope, geography, and currency are resolved server-side.
mustMatch(source.migration, /public\.resolve_player_business_v2\(p_game_session_id, p_player_id\)/u,
  "Business ownership and game scope must be server resolved.");
mustMatch(source.migration, /country_row\.country_code = upper\(btrim\(v_business\.country_code\)\)/u,
  "Quote geography must come from the Business country.");
mustMatch(source.migration, /upper\(btrim\(v_business\.currency_code\)\)/u,
  "Quote settlement currency must come from the Business.");
mustMatch(source.migration, /public\.resolve_store_quote_pricing_v2\(/u,
  "Business quotes must call canonical Store pricing.");
mustMatch(source.migration, /'playerId', p_player_id/u,
  "Idempotency request identity must include the authenticated actor.");
mustNotMatch(procurementRequestBoundary, /p_effective_at/u,
  "The browser adapter must never submit pricing time.");
mustNotMatch(procurementRequestBoundary, /body\.(?:countryCode|currencyCode)|p_(?:country_code|currency_code)/u,
  "The browser must not author Business pricing geography or currency.");

// Idempotency, isolation, and concurrency.
mustMatch(source.migration, /business_store_purchase_quotes_idempotency_unique/u);
mustMatch(source.migration, /business_store_purchases_idempotency_unique/u);
mustMatch(source.migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]{0,300}business-store-quote-v2/u);
mustMatch(source.migration, /pg_advisory_xact_lock\(hashtextextended\([\s\S]{0,300}business-store-purchase-v2/u);
mustMatch(source.migration, /IDEMPOTENCY_KEY_CONFLICT/u);
mustMatch(source.migration, /IDEMPOTENCY_IN_PROGRESS/u);
mustMatch(source.migration, /where quote_row\.game_session_id = p_game_session_id[\s\S]{0,160}quote_row\.business_id = v_business\.business_id/u);
mustMatch(source.migration, /where purchase_row\.game_session_id = p_game_session_id[\s\S]{0,180}purchase_row\.business_id = v_business\.business_id/u);

const purchaseStart = source.migration.indexOf(
  "create or replace function public.purchase_business_store_quote_v2",
);
assert.ok(purchaseStart >= 0, "Purchase settlement RPC is missing.");
const purchaseSource = source.migration.slice(purchaseStart);
const itemLock = /select item_row\.\*[\s\S]{0,600}from public\.store_items as item_row[\s\S]{0,320}for update;/u.exec(purchaseSource);
const warehouseLock = /select holding_row\.\*[\s\S]{0,600}from public\.inventory_holdings as holding_row[\s\S]{0,320}for update;/u.exec(purchaseSource);
const cashLock = /select balance_row\.\*[\s\S]{0,600}from public\.account_balances as balance_row[\s\S]{0,320}for update;/u.exec(purchaseSource);
assert.ok(itemLock && warehouseLock && cashLock, "Settlement must lock Store stock, warehouse holding, and Business cash.");
assert.ok(
  itemLock.index < warehouseLock.index && warehouseLock.index < cashLock.index,
  "Settlement lock order must be Store item -> Business warehouse -> Business cash.",
);

// Atomic first-class Business cash and canonical inventory settlement.
mustMatch(source.migration, /public\.record_business_ledger_entry_v2\([\s\S]{0,260}-v_quote\.final_total_price/u,
  "Business cash must debit through the first-class Business ledger.");
mustMatch(source.migration, /economy_private\.post_inventory_transaction_v2\(/u,
  "Inventory must settle through the canonical journal poster.");
mustMatch(source.migration, /'side', 'store_stock'/u);
mustMatch(source.migration, /'quantityDelta', -v_quote\.quantity/u,
  "Canonical Store stock must decrease exactly once.");
mustMatch(source.migration, /'side', 'business_warehouse'/u);
mustMatch(source.migration, /'quantityDelta', v_quote\.quantity/u,
  "Canonical Business warehouse stock must increase exactly once.");
mustMatch(source.migration, /v_settled_unit_cost := round\([\s\S]{0,120}v_quote\.final_total_price \/ v_quote\.quantity/u,
  "Acquisition basis must use the actual settled total divided by quantity.");
mustMatch(source.migration, /'unitCost', v_settled_unit_cost/u,
  "Canonical warehouse weighted-average cost must receive the settled unit basis.");
mustMatch(source.migration, /BUSINESS_STOCKROOM_COST_CURRENCY_MISMATCH/u,
  "Mixed-currency weighted averages must fail closed.");
mustMatch(source.migration, /update public\.store_items[\s\S]{0,120}stock_quantity = stock_quantity - v_quote\.quantity/u,
  "Store read-model stock must stay synchronized with canonical settlement.");

// Replay returns frozen receipt evidence rather than mutable current holdings.
mustMatch(source.migration, /warehouse_quantity_owned integer null/u);
mustMatch(source.migration, /warehouse_average_unit_cost numeric\(18, 4\) null/u);
mustMatch(source.migration, /warehouse_quantity_owned = v_holding\.quantity_owned/u);
mustMatch(source.migration, /warehouse_average_unit_cost = v_holding\.average_unit_cost/u);
mustMatch(source.migration, /v_purchase\.warehouse_quantity_owned[\s\S]{0,100}v_purchase\.warehouse_average_unit_cost/u,
  "Completed replay must return the frozen settlement outcome.");

// Audit evidence and public browser contracts.
mustMatch(source.migration, /insert into public\.business_activity_events/u,
  "Completed procurement must append immutable Business activity evidence.");
mustMatch(source.migration, /business\.store\.procurement\.completed/u);
mustMatch(source.contracts, /interface BusinessStoreQuoteDto/u);
mustMatch(source.contracts, /interface BusinessStoreReceiptDto/u);
mustMatch(source.contracts, /readonly quoteKey: string/u);
mustMatch(source.contracts, /readonly receiptKey: string/u);
mustContain(
  source.procurement,
  'from "./playerBusinessStoreProcurementRequest.ts"',
  "The procurement facade must delegate request validation to its bounded module.",
);
mustContain(
  source.procurement,
  'from "./playerBusinessStoreProcurementProjection.ts"',
  "The procurement facade must delegate public response projection to its bounded module.",
);
mustMatch(source.procurementRequest, /readFundingAllocations/u);
mustMatch(source.procurementRequest, /assertExactBodyFields/u);
mustMatch(source.fundingProjection, /playerBusinessStoreFundingProjectionSupport\.ts/u);
mustMatch(source.procurementProjection, /playerBusinessStoreProjectionSupport\.ts/u);
mustMatch(source.fundingProjectionSupport, /assertFundingLines/u);
mustMatch(source.projectionSupport, /readResultPublicKey/u);
mustMatch(procurementProjectionBoundary, /readResultPublicKey\(quote\.quote_key, "quote_key", "bsq"\)/u);
mustMatch(procurementProjectionBoundary, /readResultPublicKey\(receipt\.receipt_key, "receipt_key", "bsr"\)/u);
mustMatch(procurementProjectionBoundary, /warehouseQuantityOwned/u);
mustMatch(procurementProjectionBoundary, /warehouseAverageUnitCost/u);
mustMatch(source.procurementTests, /assertNoUuid/u);
mustMatch(source.procurementTests, /reject browser scope/u);

// Direct and compatibility routing must both retain the public intent endpoints.
mustMatch(source.routes, /tail\[2\] === "quotes"[\s\S]{0,100}businessStoreQuote/u);
mustMatch(source.routes, /tail\[2\] === "purchases"[\s\S]{0,100}businessStorePurchase/u);
mustMatch(source.routeTests, /\/player-api\/players\/me\/business\/store\/quotes/u);
mustMatch(source.routeTests, /\/functions\/v1\/classroom-api\/players\/me\/business\/store\/purchases/u);
mustMatch(source.sharedDispatch, /route\.kind === "businessStoreQuote"\) return "businessStoreQuote"/u);
mustMatch(source.sharedDispatch, /route\.kind === "businessStorePurchase"\) return "businessStorePurchase"/u);
mustMatch(source.compatibilityRoutes, /\{ kind: "businessStoreQuote" \}/u);
mustMatch(source.compatibilityRoutes, /\{ kind: "businessStorePurchase" \}/u);
for (const runtime of [source.classroomRuntime, source.playerRuntime]) {
  mustMatch(runtime, /businessStoreQuote: "storeQuote"/u);
  mustMatch(runtime, /businessStorePurchase: "storePurchase"/u);
}

// Repository errors remain bounded and retry semantics are explicit.
mustMatch(source.repository, /mapPlayerBusinessDatabaseError/u);
mustMatch(repositoryErrorBoundary, /INSUFFICIENT_BUSINESS_BALANCE/u);
mustMatch(repositoryErrorBoundary, /BUSINESS_STOCKROOM_COST_CURRENCY_MISMATCH/u);
mustMatch(repositoryErrorBoundary, /INVENTORY_POSTING_RESULT_MISSING:[\s\S]{0,180}true/u);
mustMatch(repositoryErrorBoundary, /IDEMPOTENCY_IN_PROGRESS:[\s\S]{0,180}true/u);

// The exact-head workflow must exercise every Phase 3B authority surface.
mustMatch(source.workflow, /backend\/supabase\/migrations\/20260820\*\.sql/u);
mustMatch(source.workflow, /backend\/supabase\/migrations\/20260821\*\.sql/u);
mustMatch(source.workflow, /node scripts\/business-store-procurement-authority-contract\.mjs/u);
mustMatch(source.workflow, /playerBusinessStoreProcurement\.test\.ts/u);
mustNotMatch(source.workflow, /source-archive|temporary-phase3b/iu,
  "Temporary source-export and repair scaffolding must not remain in the final workflow.");

console.log("Business Phase 3B canonical Store procurement authority contract passed.");
