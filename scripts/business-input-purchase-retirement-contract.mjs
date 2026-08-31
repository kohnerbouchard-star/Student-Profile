#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.freeze({
  handler: "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
  route: "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
  validation: "backend/src/domains/business/api/playerBusinessRequestValidation.ts",
  executor: "backend/src/domains/business/api/playerBusinessMutationExecutor.ts",
  dispatch: "backend/supabase/functions/_shared/playerBusinessDispatch.ts",
  rateLimit: "backend/src/security/playerRateLimitDispatch.ts",
  rateLimitRegistry: "backend/src/security/playerRateLimitOperationRegistry.ts",
  capability: "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
  endpoints: "player-terminal/src/api/endpoints.js",
  browserRoutes: "player-terminal/src/api/business-banking-backend-routes.js",
  browserCapabilities: "player-terminal/src/api/capabilities.js",
  browserManifest: "player-terminal/src/integrations/student-profile-capability-manifest.js",
  resourcePlan: "player-terminal/src/api/resource-plan.js",
  businessPage: "player-terminal/src/pages/business-page.js",
  buttonCoverage: "docs/operations/contracts/button-action-coverage-v1.json",
  historicalMigration: "backend/supabase/migrations/20260721122400_fix_business_connected_settlement_v1.sql",
  procurementMigration: "backend/supabase/migrations/20260821060000_business_store_procurement_v2.sql",
});

const entries = await Promise.all(
  Object.entries(files).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
);
const source = Object.fromEntries(entries);
const rateLimitBoundary = [source.rateLimit, source.rateLimitRegistry].join("\n");

assert.match(
  source.route,
  /tail\[0\] === "business"[\s\S]{0,120}tail\[1\] === "inputs"[\s\S]{0,120}tail\[2\] === "purchases"[\s\S]{0,120}kind: "businessInputPurchase"/u,
  "The exact legacy compatibility URL must remain recognized.",
);
assert.match(
  source.validation,
  /businessInputPurchase:[\s\S]{0,180}"businessKey"[\s\S]{0,180}"productKey"[\s\S]{0,180}"quantity"[\s\S]{0,180}"idempotencyKey"/u,
  "The bounded legacy request shape must remain validated before retirement handling.",
);
assert.match(source.handler, /route\.kind === "businessInputPurchase"/u);
assert.match(source.handler, /jsonError\(410/u);
assert.match(source.handler, /business_input_purchase_retired/u);
assert.match(source.handler, /Use Business Store procurement/u);
assert.match(
  source.dispatch,
  /\(applicationContext\) =>[\s\S]{0,260}handlePlayerBusinessRequest\([\s\S]{0,260}applicationContext\)/u,
  "The reviewed dispatch must forward its authenticated application context.",
);
assert.match(
  source.handler,
  /const scope = applicationContext[\s\S]{0,220}gameId: applicationContext\.gameSessionId[\s\S]{0,160}playerUuid: applicationContext\.actor\.playerUuid[\s\S]{0,180}: await dependencies\.resolveScope\(request, client, body\)/u,
  "The Business handler must prefer authenticated application-context scope while retaining its compatibility fallback.",
);
const applicationContextScopeIndex = source.handler.indexOf(
  "const scope = applicationContext",
);
const retiredInputIndex = source.handler.indexOf(
  'if (route.kind === "businessInputPurchase")',
);
assert.ok(
  applicationContextScopeIndex >= 0,
  "Authenticated application-context scope forwarding must remain present.",
);
assert.ok(
  retiredInputIndex > applicationContextScopeIndex,
  "Retired requests must authenticate before receiving 410 Gone.",
);

assert.doesNotMatch(source.executor, /case "businessInputPurchase"/u);
assert.doesNotMatch(source.executor, /purchase_business_input_v1/u);
assert.match(
  source.dispatch,
  /\| "businessInputPurchase"/u,
  "The compatibility route must remain an explicit reviewed dispatch key.",
);
assert.match(
  source.dispatch,
  /businessInputPurchase:\s*"businessInputPurchase"/u,
  "The compatibility route must retain its reviewed rate-limit dispatch mapping.",
);
assert.match(
  rateLimitBoundary,
  /ReviewedPlayerRateLimitEndpointKey[\s\S]{0,180}\| "businessInputPurchase"/u,
);
assert.match(
  rateLimitBoundary,
  /businessInputPurchase:[\s\S]{0,120}player\.business\.inputs\.purchase\.retired/u,
);

for (const [name, value] of [
  ["server capability manifest", source.capability],
  ["Player endpoint registry", source.endpoints],
  ["Player Business route helper", source.browserRoutes],
  ["Player capability resolver", source.browserCapabilities],
  ["Player capability validator", source.browserManifest],
  ["Player resource plan", source.resourcePlan],
  ["Player Business page", source.businessPage],
  ["button action evidence", source.buttonCoverage],
]) {
  assert.doesNotMatch(value, /businessInputPurchase/u, `${name} must not advertise the retired action.`);
}
for (const [name, value] of [
  ["server capability manifest", source.capability],
  ["Player endpoint registry", source.endpoints],
  ["Player Business route helper", source.browserRoutes],
  ["Player Business page", source.businessPage],
]) {
  assert.doesNotMatch(
    value,
    /\/players\/me\/business\/inputs\/purchases/u,
    `${name} must not publish the compatibility URL as active.`,
  );
}
assert.doesNotMatch(
  source.businessPage,
  /data-player-form="business-input-purchase"|<strong>Purchase production inputs<\/strong>/u,
  "The retired Player control must not remain rendered.",
);

assert.match(source.historicalMigration, /create or replace function public\.purchase_business_input_v1/u);
assert.match(source.historicalMigration, /public\.business_inventory/u);
assert.match(source.procurementMigration, /create_business_store_quote_v2/u);
assert.match(source.procurementMigration, /purchase_business_store_quote_v2/u);
assert.match(source.procurementMigration, /post_inventory_transaction_v2/u);
assert.match(source.procurementMigration, /ensure_business_inventory_account_v2/u);
assert.doesNotMatch(source.procurementMigration, /purchase_business_input_v1/u);

const runtimeSources = [
  source.handler,
  source.executor,
  source.capability,
  source.endpoints,
  source.browserRoutes,
  source.browserCapabilities,
  source.browserManifest,
  source.resourcePlan,
  source.businessPage,
].join("\n");
assert.doesNotMatch(runtimeSources, /purchase_business_input_v1/u);

console.log(
  "Business Phase 3D abstract input-purchase retirement contract passed: historical compatibility preserved, live authority removed.",
);
