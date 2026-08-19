#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const businessContracts = read("backend/src/domains/business/contracts/playerBusinessContracts.ts");
const businessRoutes = read("backend/src/domains/business/api/playerBusinessRoutePaths.ts");
const mixedContracts = read("backend/src/domains/business-banking/contracts/playerBusinessBankingContracts.ts");
const mixedRoutes = read("backend/src/domains/business-banking/api/playerBusinessBankingRoutePaths.ts");

assert.match(businessContracts, /export type PlayerBusinessRoute/u);
assert.match(businessContracts, /PlayerBusinessRepository/u);
assert.match(businessRoutes, /readPlayerBusinessRoutePath/u);
assert.doesNotMatch(businessRoutes, /banking|loan|savings/iu, "Business route authority must not own Banking URLs.");
assert.doesNotMatch(businessContracts, /business-banking/iu, "Business contracts must not depend on the mixed façade.");
assert.match(mixedContracts, /PlayerBusinessRoute/u, "Mixed façade must consume Business-owned route contracts.");
assert.match(mixedRoutes, /readPlayerBusinessRoutePath/u, "Mixed façade must delegate Business URL parsing.");

console.log("Business Phase 1 domain-boundary contract passed.");
