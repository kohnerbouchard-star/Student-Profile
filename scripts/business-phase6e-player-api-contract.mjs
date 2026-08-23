import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const requireTokens = (source, label, tokens) => {
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`${label} missing: ${token}`);
  }
};
const forbidTokens = (source, label, tokens) => {
  for (const token of tokens) {
    if (source.includes(token)) throw new Error(`${label} still contains: ${token}`);
  }
};

const routeContracts = read("backend/src/domains/business/contracts/playerBusinessContracts.ts");
const routePaths = read("backend/src/domains/business/api/playerBusinessRoutePaths.ts");
const validation = read("backend/src/domains/business/api/playerBusinessRequestValidation.ts");
const handler = read("backend/src/domains/business/api/playerBusinessHttpHandler.ts");
const adapter = read("backend/src/domains/business/api/playerBusinessManufacturing.ts");
const sql = read("backend/supabase/migrations/20260823110500_business_manufacturing_player_api_v2.sql");
const endpoints = read("player-terminal/src/api/endpoints.js");
const backendRoutes = read("player-terminal/src/api/business-banking-backend-routes.js");
const resourcePlan = read("player-terminal/src/api/resource-plan.js");
const businessPage = read("player-terminal/src/pages/business-page.js");
const authority = JSON.parse(
  read("docs/operations/contracts/player-cross-cutting-verification-authority-v1.json"),
);

requireTokens(routeContracts, "manufacturing route contract", [
  '"businessManufacturingCollection"',
  '"businessManufacturingCancel"',
]);
requireTokens(routePaths, "manufacturing route parser", [
  "matchPlayerBusinessManufacturingCollectionPath",
  "matchPlayerBusinessManufacturingCancellationPath",
]);
requireTokens(validation, "manufacturing request boundary", [
  'method !== "GET"',
  'method !== "POST"',
  '"productKey", "quantity", "priority", "idempotencyKey"',
]);
requireTokens(handler, "authenticated manufacturing handler", [
  "readPlayerBusinessManufacturingJobs",
  "startPlayerBusinessManufacturingJob",
  "cancelPlayerBusinessManufacturingJob",
  "business_instant_production_retired",
]);
requireTokens(adapter, "manufacturing application adapter", [
  "list_player_business_manufacturing_jobs_v2",
  "start_player_business_manufacturing_job_v2",
  "cancel_player_business_manufacturing_job_v2",
  "playerBusinessManufacturingJobsSchema.safeParse",
]);
requireTokens(sql, "service-only manufacturing wrappers", [
  "revoke all on function public.list_player_business_manufacturing_jobs_v2",
  "grant execute on function public.list_player_business_manufacturing_jobs_v2",
  "to service_role",
]);
requireTokens(endpoints, "Player endpoint identities", [
  "businessManufacturingJobs",
  "businessManufacturingStart",
  "businessManufacturingCancel",
]);
requireTokens(backendRoutes, "Player BFF manufacturing paths", [
  "/players/me/businesses/",
  "/manufacturing/jobs",
  "businessManufacturingCancel",
]);
requireTokens(resourcePlan, "manufacturing refresh boundary", [
  "businessManufacturingStart",
  "businessManufacturingCancel",
]);
requireTokens(businessPage, "connected manufacturing workspace", [
  'data-endpoint="businessManufacturingStart"',
  'data-endpoint="businessManufacturingCancel"',
  "manufacturingJobsPanel",
]);
forbidTokens(businessPage, "retired workspace instant production", [
  'data-endpoint="businessProduction"',
]);

if (authority.pullRequestNumber !== 661) {
  throw new Error("Player verification authority is not bound to PR #661.");
}
for (const required of [
  "backend/src/domains/business/api/playerBusinessManufacturing.ts",
  "backend/src/domains/business/api/playerBusinessManufacturingRoutePaths.ts",
  "backend/src/domains/business/contracts/playerBusinessManufacturingContracts.ts",
  "backend/supabase/migrations/20260823110500_business_manufacturing_player_api_v2.sql",
  "player-terminal/src/pages/business-page.js",
  "scripts/business-phase6e-player-api-contract.mjs",
]) {
  if (!authority.allowedPaths.includes(required)) {
    throw new Error(`Player verification authority missing Phase 6E path: ${required}`);
  }
}

console.log("Business Phase 6E authenticated Player API and workspace contract: PASS");
