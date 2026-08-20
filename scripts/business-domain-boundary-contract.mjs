#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const businessIndex = read("backend/src/domains/business/index.ts");
const businessContracts = read("backend/src/domains/business/contracts/playerBusinessContracts.ts");
const businessRoutes = read("backend/src/domains/business/api/playerBusinessRoutePaths.ts");
const businessHandler = read("backend/src/domains/business/api/playerBusinessHttpHandler.ts");
const businessRepository = read("backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts");
const mixedContracts = read("backend/src/domains/business-banking/contracts/playerBusinessBankingContracts.ts");
const mixedRoutes = read("backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts");
const mixedHandler = read("backend/src/domains/business-banking/api/playerBusinessBankingHttpHandler.ts");
const mixedRepository = read("backend/src/domains/business-banking/infrastructure/supabasePlayerBusinessBankingRepository.ts");

assert.match(businessIndex, /readPlayerBusinessRoutePath/u, "Business must publish its route authority through index.ts.");
assert.match(businessIndex, /handlePlayerBusinessRequest/u, "Business must publish its HTTP handler through index.ts.");
assert.match(businessIndex, /SupabasePlayerBusinessRepository/u, "Business must publish its repository through index.ts.");
assert.match(businessContracts, /export type PlayerBusinessRoute/u);
assert.match(businessContracts, /PlayerBusinessRepository/u);
assert.match(businessRoutes, /readPlayerBusinessRoutePath/u);
assert.doesNotMatch(businessRoutes, /\.\.\/\.\.\/players\//u, "Business route authority must not deep-import Players internals.");
assert.doesNotMatch(businessRoutes, /banking|loan|savings/iu, "Business route authority must not own Banking URLs.");
assert.doesNotMatch(businessContracts, /business-banking/iu, "Business contracts must not depend on the mixed façade.");
assert.doesNotMatch(businessHandler, /domains\/players|business-banking/iu, "Business handler must depend on injected scope and Business-owned contracts only.");
assert.doesNotMatch(businessRepository, /business-banking/iu, "Business repository must not depend on the mixed façade.");
assert.match(businessRepository, /class SupabasePlayerBusinessRepository/u);

assert.match(mixedContracts, /\.\.\/\.\.\/business\/index\.ts/u, "Mixed façade must consume the Business public boundary.");
assert.match(mixedContracts, /export type PlayerBankingRoute/u, "Mixed façade must keep Banking routes explicit and separate.");
assert.doesNotMatch(mixedContracts, /extends PlayerBusinessRepository/u, "Mixed Banking repository must not inherit Business persistence authority.");
assert.match(mixedRoutes, /\.\.\/\.\.\/business\/index\.ts/u, "Mixed façade must delegate through the Business public boundary.");
assert.match(mixedRoutes, /DELEGATED_BUSINESS_ROUTE_CONTRACT/u, "Mixed façade must expose a bounded delegated route manifest until retirement.");
assert.match(mixedHandler, /handlePlayerBusinessRequest/u, "Classroom compatibility handler must forward Business to the Business handler.");
assert.match(mixedHandler, /isPlayerBusinessRoute\(route\)/u, "Business forwarding must occur by Business-owned route identity.");
assert.match(mixedHandler, /return handlePlayerBusinessRequest\(request, route,/u, "Business routes must exit the mixed handler immediately.");
assert.doesNotMatch(mixedHandler, /case "business(?:Create|ProductCreate|InputPurchase|Production|Price|Hire|Terminate|Status)"/u, "Mixed handler must not retain Business mutation execution cases.");
assert.doesNotMatch(mixedHandler, /handlePlayerBusinessRequest[\s\S]{0,300}createRepository:/u, "Mixed Banking repository must never be injected into Business execution.");
assert.match(mixedHandler, /type PlayerBankingRoute/u, "Banking execution must be typed independently after Business forwarding.");

assert.match(mixedRepository, /class SupabasePlayerBusinessBankingRepository/u);
assert.match(mixedRepository, /readLoans/u, "Mixed repository must retain Loans reads.");
assert.match(mixedRepository, /resolve_player_economic_context_v1/u, "Mixed repository must retain Banking economic context resolution.");
for (const removedBusinessAuthority of [
  "assertBusinessCreationAllowed",
  "readBusiness(",
  "business_products",
  "business_inventory",
  "business_employees",
  "business_production_runs",
]) {
  assert.doesNotMatch(
    mixedRepository,
    new RegExp(removedBusinessAuthority.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"),
    `Mixed repository must not retain Business persistence authority: ${removedBusinessAuthority}`,
  );
}

console.log("Business Phase 1 domain-boundary contract passed.");
