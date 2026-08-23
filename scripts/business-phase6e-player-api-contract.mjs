#!/usr/bin/env node

import fs from "node:fs";

const route = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
  "utf8",
);
const manufacturing = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessManufacturing.ts",
  "utf8",
);
const handler = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
  "utf8",
);
const repository = fs.readFileSync(
  "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
  "utf8",
);
const test = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessManufacturing.test.ts",
  "utf8",
);
const scope = fs.readFileSync(
  "docs/roadmaps/business-phase6e-player-cutover-scope-v1.md",
  "utf8",
);

function requireTokens(source, label, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) throw new Error(`${label} missing: ${token}`);
  }
}

function forbidTokens(source, label, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) throw new Error(`${label} contains forbidden token: ${token}`);
  }
}

requireTokens(route, "Extracted Business route parser", [
  "parsePlayerBusinessManufacturingRoute",
  "const manufacturingRoute = parsePlayerBusinessManufacturingRoute",
  "if (manufacturingRoute) return manufacturingRoute as never",
]);

requireTokens(manufacturing, "Manufacturing public routes", [
  "/players/me/business/manufacturing",
  "/players/me/business/manufacturing/jobs",
  "mfg_[0-9a-f]{32}",
  "businessManufacturingRead",
  "businessManufacturingStart",
  "businessManufacturingCancel",
  "businessManufacturingMethodNotAllowed",
]);

requireTokens(manufacturing, "Server-scoped repository calls", [
  "read_owned_business_manufacturing_jobs_v2",
  "start_business_manufacturing_job_v2",
  "cancel_business_manufacturing_job_v2",
  "p_game_session_id: input.gameSessionId",
  "p_player_id: input.playerId",
  "p_business_key: businessKey",
  "p_product_key: productKey",
  "p_job_key: jobKey",
]);

requireTokens(manufacturing, "Intent-only validation", [
  '["businessKey", "productKey", "quantity", "priority", "idempotencyKey"]',
  '["businessKey", "idempotencyKey"]',
  "assertExactKeys",
  "business_manufacturing_payload_not_allowed",
  "publicKey(body.businessKey, \"biz\"",
  "publicKey(body.productKey, \"bpr\"",
  "publicKey(route?.jobKey, \"mfg\"",
  "Number.isSafeInteger",
  '["standard", "expedite"]',
]);

requireTokens(manufacturing, "Authenticated retirement", [
  "LEGACY_INSTANT_PRODUCTION_ROUTE_KIND",
  "business_instant_production_retired",
  "Instant production has been retired",
  "410",
]);

requireTokens(handler, "Handler composition", [
  "maybeHandlePlayerBusinessManufacturingRequest",
  "const manufacturingResponse = await",
  "request: input.request",
  "gameSessionId: input.gameSessionId",
  "playerId: input.playerId",
  "if (manufacturingResponse) return manufacturingResponse",
]);

const helperPosition = handler.indexOf(
  "const manufacturingResponse = await maybeHandlePlayerBusinessManufacturingRequest",
);
const legacySwitchPosition = handler.indexOf("switch", helperPosition);
if (helperPosition < 0 || (legacySwitchPosition >= 0 && helperPosition > legacySwitchPosition)) {
  throw new Error("Manufacturing retirement/publication must execute before the legacy mutation switch.");
}

requireTokens(repository, "Repository publication", [
  "async readMany(",
  "Promise<readonly Row[]>",
  "this.client.rpc<unknown>(command, args)",
  "BUSINESS_MANUFACTURING_START_REQUEST_INVALID",
  "BUSINESS_MANUFACTURING_INPUT_QUANTITY_UNAVAILABLE",
  "BUSINESS_MANUFACTURING_LABOR_CAPACITY_UNAVAILABLE",
  "BUSINESS_MANUFACTURING_EQUIPMENT_CAPACITY_UNAVAILABLE",
  "BUSINESS_MANUFACTURING_CANCEL_STATE_INVALID",
  "BUSINESS_MANUFACTURING_TERMINAL_IDEMPOTENCY_CONFLICT",
]);

requireTokens(test, "Focused route/handler tests", [
  "manufacturing routes are public-key-only and method bounded",
  "manufacturing read invokes bounded server-scoped RPC",
  "manufacturing start rejects trusted fields and submits only intent",
  "legacy instant production kind returns authenticated retirement response",
  "gameSessionId: \"forbidden\"",
  "business_instant_production_retired",
]);

forbidTokens(manufacturing, "Browser authority exclusions", [
  "p_recipe_definition_id",
  "p_output_game_item_id",
  "p_duration_seconds",
  "p_completes_at",
  "p_completion_lease_token",
  "p_material_cost_basis",
  "p_labor_cost_basis",
  "p_equipment_minutes",
  "complete_business_manufacturing_job_v2",
  "fail_business_manufacturing_job_v2",
]);

const startResponse = manufacturing.slice(
  manufacturing.indexOf('if (kind === "businessManufacturingStart")'),
  manufacturing.indexOf('if (kind === "businessManufacturingCancel")'),
).toLowerCase();
forbidTokens(startResponse, "Start response privacy", [
  "game_session_id",
  "business_id",
  "product_id",
  "recipe_definition_id",
  "output_game_item_id",
  "employee_id",
  "installation_id",
  "lease_token",
  "request_hash",
]);

requireTokens(scope, "Cutover scope", [
  "Phase 6E-1 — extracted Business API publication is OPEN",
  "business_instant_production_retired",
  "same-origin Player BFF",
  "40-Player",
]);

console.log("Business Phase 6E extracted Player API contract: PASS");
