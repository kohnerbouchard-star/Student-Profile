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
assert.match(mixedRoutes, /\.\.\/\.\.\/business\/index\.ts/u, "Mixed façade must delegate through the Business public boundary.");
assert.match(mixedRoutes, /DELEGATED_BUSINESS_ROUTE_CONTRACT/u, "Mixed façade must expose a bounded delegated route manifest until retirement.");

console.log("Business Phase 1 domain-boundary contract passed.");
