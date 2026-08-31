#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = {
  migration: "backend/supabase/migrations/20260822140300_business_production_labor_reservations_v2.sql",
  contracts: "backend/src/domains/business/contracts/playerBusinessContracts.ts",
  parser: "backend/src/domains/business/application/workforce/businessWorkforceResultParser.ts",
  repository: "backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts",
  databaseErrors: "backend/src/domains/business/infrastructure/playerBusinessDatabaseErrors.ts",
  handler: "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
  capability: "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
  normalizer: "player-terminal/src/api/response-normalizer.js",
  errors: "player-terminal/src/api/errors.js",
  page: "player-terminal/src/pages/business-page.js",
  surfaceTest: "player-terminal/tests/business-banking-surface.mjs",
};

const source = Object.fromEntries(Object.entries(files).map(([key, relative]) => {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) throw new Error(`Missing Phase 4C-C file: ${relative}`);
  return [key, fs.readFileSync(absolute, "utf8")];
}));

for (const token of [
  "read_owned_business_workforce_utilization_v2",
  "utilizationBasisPoints",
  "latestPayrollStatus",
]) requireToken(source.migration, token, "utilization authority migration");
for (const token of [
  "BusinessWorkforceUtilizationDto",
  "workforceUtilization: BusinessWorkforceUtilizationDto | null",
]) requireToken(source.contracts, token, "Business read contract");
for (const token of [
  "parseBusinessWorkforceUtilization",
  "payrollPeriodKey",
  "utilizedMinutes !== reservedMinutes + consumedMinutes",
]) requireToken(source.parser, token, "server utilization parser");
const recoveryBoundary = [source.repository, source.databaseErrors].join("\n");
for (const token of [
  "read_owned_business_workforce_utilization_v2",
  "parseBusinessWorkforceUtilization",
  "mapPlayerBusinessDatabaseError",
  "BUSINESS_PRODUCTION_RECIPE_AMBIGUOUS",
  "BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE",
  "BUSINESS_LABOR_SKILL_UNAVAILABLE",
  "BUSINESS_LABOR_CAPACITY_UNAVAILABLE",
  "BUSINESS_LABOR_RESERVATION_CONSUMPTION_CONFLICT",
  "message.toUpperCase()",
  "Object.keys(mappings).find",
  "business_operation_failed",
]) requireToken(recoveryBoundary, token, "server Business read/recovery boundary");
requireToken(source.handler, "await repository.readBusiness(publicScope)", "existing Edge Business read path");
for (const token of [
  'key: "business"',
  'pathTemplate: "/players/me/business"',
  'routeCapabilities: ["business"]',
]) requireToken(source.capability, token, "existing Business capability manifest path");
for (const token of [
  "validateBusinessWorkforceUtilization",
  "workforceUtilization",
  "utilizationBasisPoints > 10000",
]) requireToken(source.normalizer, token, "Player response normalizer");
for (const token of [
  "BUSINESS_LABOR_CAPACITY_UNAVAILABLE",
  "BUSINESS_LABOR_ROLE_COVERAGE_UNAVAILABLE",
  "BUSINESS_LABOR_SKILL_UNAVAILABLE",
]) requireToken(source.errors, token, "Player recovery messages");
for (const token of [
  "Workforce utilization & payroll",
  "data-business-workforce-utilization",
  "The server reserves exact materials, labor, equipment, and completion time",
  "recurring Business payroll",
]) requireToken(source.page, token, "Player Business UI");
if (/name="unitLaborCost"/u.test(source.page)) {
  throw new Error("Player Business UI still exposes Player-authored synthetic labor cost.");
}
if (/playerUuid|gameSessionId|ownerPlayerId/u.test(source.page)) {
  throw new Error("Player Business UI leaks internal ownership scope.");
}
for (const token of [
  "data-business-workforce-utilization",
  "BUSINESS_LABOR_CAPACITY_UNAVAILABLE",
  'name="unitLaborCost"',
]) requireToken(source.surfaceTest, token, "Player Business surface regression");

console.log("Business Phase 4C-C Player recovery and utilization contract: PASS");

function requireToken(text, token, label) {
  if (!text.includes(token)) throw new Error(`${label} missing required token: ${token}`);
}
