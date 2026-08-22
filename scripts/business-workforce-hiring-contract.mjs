import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, ROOT), "utf8").replace(/\r\n/g, "\n");
const must = (value, pattern, label) => assert.match(value, pattern, label);
const mustNot = (value, pattern, label) => assert.doesNotMatch(value, pattern, label);

const migrationDirectory = new URL("backend/supabase/migrations/", ROOT);
const migrationNames = readdirSync(migrationDirectory)
  .filter((name) => /^20260822.*\.sql$/u.test(name))
  .sort();
const phase4bNames = migrationNames.filter((name) => /workforce|candidate|hiring/u.test(name));
assert.ok(phase4bNames.length >= 1, "Phase 4B requires a forward-only workforce migration.");
const phase4bSql = phase4bNames
  .map((name) => readFileSync(join(migrationDirectory.pathname, name), "utf8"))
  .join("\n")
  .replace(/\r\n/g, "\n");

must(phase4bSql, /business_workforce_candidates/u, "Reuse canonical candidate authority.");
must(phase4bSql, /business_employees/u, "Reuse canonical employee authority.");
must(phase4bSql, /(?:read|get|list)[a-z0-9_]*business[a-z0-9_]*candidate|business[a-z0-9_]*candidate[a-z0-9_]*(?:read|get|list)/iu, "Expose a bounded candidate read.");
must(phase4bSql, /(?:hire|accept)[a-z0-9_]*business[a-z0-9_]*candidate|business[a-z0-9_]*candidate[a-z0-9_]*(?:hire|accept)/iu, "Expose candidate-backed hiring.");
must(phase4bSql, /for\s+update/iu, "Serialize candidate hiring state.");
must(phase4bSql, /status\s*=\s*'reserved'|set\s+status\s*=\s*'hired'|status[^\n]*'hired'/iu, "Reserve or hire the candidate transactionally.");
must(phase4bSql, /workforce_candidate_id/iu, "Retain candidate provenance.");
for (const field of ["role_definition_id", "wage_per_cycle", "labor_minutes_per_cycle", "skill_basis_points", "productivity_index", "country_code", "currency_code"]) {
  must(phase4bSql, new RegExp(field, "iu"), `Candidate hiring must retain ${field}.`);
}
must(phase4bSql, /idempotency_key/iu, "Candidate hiring must be idempotent.");
must(phase4bSql, /request_hash/iu, "Idempotency payload conflicts must be detectable.");
must(phase4bSql, /owner_player_id|business_ownership/u, "Enforce Business ownership.");
must(phase4bSql, /game_session_id/iu, "Keep candidate reads and hiring game scoped.");
must(phase4bSql, /audit_log|business_activity/u, "Leave durable audit evidence.");
must(phase4bSql, /revoke\s+all[\s\S]*anon[\s\S]*authenticated/iu, "Deny browser database roles.");
must(phase4bSql, /grant\s+execute[\s\S]*service_role/iu, "Keep trusted execution service-role bounded.");
mustNot(phase4bSql, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.(?!business_workforce_candidates\b|business_employees\b)[a-z0-9_]*employee/iu, "Do not create a parallel employee authority.");
mustNot(phase4bSql, /record_player_ledger_entry|post_ledger|insert\s+into\s+public\.ledger_entries/iu, "Do not open payroll settlement.");
mustNot(phase4bSql, /reserve_business_labor_v2|run_business_production_v1|business_production_runs\s*\(/iu, "Do not open production-labor integration.");

const routePaths = read("backend/src/domains/business/api/playerBusinessRoutePaths.ts");
const contracts = read("backend/src/domains/business/contracts/playerBusinessContracts.ts");
const handler = read("backend/src/domains/business/api/playerBusinessHttpHandler.ts");
const executor = read("backend/src/domains/business/api/playerBusinessMutationExecutor.ts");
const validation = read("backend/src/domains/business/api/playerBusinessRequestValidation.ts");
const repository = read("backend/src/domains/business/infrastructure/supabasePlayerBusinessRepository.ts");
const capabilityManifest = read("backend/src/domains/players/contracts/playerCapabilityManifestContracts.ts");
const rateLimits = read("backend/src/security/playerRateLimitDispatch.ts");
const classroomApi = read("backend/supabase/functions/classroom-api/index.ts");
const playerRoutes = read("player-terminal/src/api/business-banking-backend-routes.js");
const endpoints = read("player-terminal/src/api/endpoints.js");
const capabilities = read("player-terminal/src/api/capabilities.js");
const resourcePlan = read("player-terminal/src/api/resource-plan.js");
const businessPage = read("player-terminal/src/pages/business-page.js");

const serverSurface = [routePaths, contracts, handler, validation, repository].join("\n");
must(serverSurface, /workforce[^\n/]*candidates|business[^\n/]*candidates/iu, "Expose the candidate-pool resource.");
must(serverSurface, /candidateKey|candidate_key|candidatePublicKey/iu, "Select candidates by public key.");
must(serverSurface, /wfc_[0-9a-f]|"wfc"|'wfc'/iu, "Use the candidate public-key namespace.");
must(handler, /businessHire[\s\S]{0,1200}(?:410|business_[a-z0-9_]*hire[a-z0-9_]*retired)|(?:410|business_[a-z0-9_]*hire[a-z0-9_]*retired)[\s\S]{0,1200}businessHire/iu, "Legacy free-text hiring must return stable 410 Gone.");
mustNot(executor, /hire_business_employee_v1/iu, "Do not execute the legacy free-text hiring RPC.");
mustNot(validation, /businessHire:\s*\[[^\]]*(?:employeePlayerIdentifier|wagePerCycle|productivityIndex|roleName)/isu, "Do not accept Player-authored workforce economics.");
must(repository, /candidate/iu, "Repository must execute candidate-backed workforce operations.");

const browserSurface = [playerRoutes, endpoints, capabilities, resourcePlan, businessPage].join("\n");
must(browserSurface, /candidate/iu, "Expose candidate selection in the Player workspace.");
must(browserSurface, /candidateKey/iu, "Submit only a candidate public key and command metadata.");
for (const field of ["employeePlayerIdentifier", "wagePerCycle", "productivityIndex"]) {
  mustNot(businessPage, new RegExp(`name=["']${field}["']`, "iu"), `Do not render Player-authored ${field}.`);
  mustNot(playerRoutes, new RegExp(`${field}\\s*:`, "iu"), `Do not serialize Player-authored ${field}.`);
}
mustNot(capabilities, /["']businessHire["']/u, "Do not advertise the retired businessHire action.");
must(capabilityManifest, /candidate/iu, "Publish candidate reads and hiring in the capability manifest.");
mustNot(capabilityManifest, /actionCapabilities:\s*\[["']businessHire["']\]/u, "Do not advertise the retired free-text action.");
must(rateLimits, /candidate/iu, "Keep candidate operations in reviewed rate limits.");
must(classroomApi, /candidate/iu, "Compose candidate operations through Classroom API.");

console.log(`Business Phase 4B authority contract passed (${phase4bNames.join(", ")}).`);
