import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(
  "backend/supabase/migrations/20260822120000_business_workforce_candidate_hiring_v2.sql",
  "utf8",
);
const routes = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessRoutePaths.ts",
  "utf8",
);
const handler = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessHttpHandler.ts",
  "utf8",
);
const executor = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessMutationExecutor.ts",
  "utf8",
);
const validation = fs.readFileSync(
  "backend/src/domains/business/api/playerBusinessRequestValidation.ts",
  "utf8",
);
const serverManifest = fs.readFileSync(
  "backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts",
  "utf8",
);
const clientCapabilities = fs.readFileSync(
  "player-terminal/src/api/capabilities.js",
  "utf8",
);
const businessPage = [
  fs.readFileSync("player-terminal/src/pages/business-page.js", "utf8"),
  fs.readFileSync("player-terminal/src/pages/business-workforce-market.js", "utf8"),
].join("\n");

for (const token of [
  "read_owned_business_workforce_candidates_v2",
  "hire_business_workforce_candidate_v2",
  "for update",
  "status = 'reserved'",
  "status = 'hired'",
  "workforce_source_type",
  "candidate_v2",
  "business.workforce.candidate.hire",
  "IDEMPOTENCY_KEY_CONFLICT",
  "BUSINESS_WORKFORCE_PLAYER_ALREADY_EMPLOYED",
]) assert.match(migration, new RegExp(token.replaceAll(".", "\\."), "i"));

assert.match(
  routes,
  /tail\[1\] === "workforce" && tail\[2\] === "candidates"/u,
);
assert.match(routes, /businessCandidateHire/u);
assert.match(handler, /business_free_text_hiring_retired/u);
assert.match(handler, /hireBusinessWorkforceCandidate/u);
assert.doesNotMatch(executor, /hire_business_employee_v1/u);
assert.match(validation, /businessCandidateHire:\s*\["businessKey",\s*"idempotencyKey"\]/u);
assert.match(serverManifest, /businessCandidateHire/u);
assert.doesNotMatch(serverManifest, /"businessHire"/u);
assert.match(clientCapabilities, /businessCandidateHire/u);
assert.doesNotMatch(clientCapabilities, /"businessHire"/u);
assert.match(businessPage, /data-endpoint="businessCandidateHire"/u);
for (const prohibited of [
  'name="employeePlayerIdentifier"',
  'name="role"',
  'name="wagePerCycle"',
  'name="productivityIndex"',
]) assert.doesNotMatch(businessPage, new RegExp(prohibited, "u"));

console.log("Business Phase 4B workforce hiring contract passed.");
