import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = ".github/workflows/production-web-session-release.yml";
const REQUEST_PATH = "docs/operations/release-requests/production-web-session-release-v1.json";

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

const workflow = read(WORKFLOW_PATH);
const request = JSON.parse(read(REQUEST_PATH));

function section(start, end) {
  const startIndex = workflow.indexOf(start);
  assert.notEqual(startIndex, -1, `missing workflow section: ${start}`);
  const endIndex = end ? workflow.indexOf(end, startIndex + start.length) : -1;
  return workflow.slice(startIndex, endIndex === -1 ? undefined : endIndex);
}

test("release request is repository-owned, bounded, and approval-gated", () => {
  assert.equal(request.schemaVersion, 1);
  assert.match(request.requestId, /^[a-z0-9][a-z0-9._-]{7,127}$/u);
  assert.equal(request.state, "approved");
  assert.equal(request.sourceMode, "trigger_commit");
  assert.equal(request.sourceRef, "refs/heads/main");
  assert.equal(request.functionName, "web-session-api");
  assert.equal(request.stagingFunctionName, request.functionName);
  assert.equal(request.stagingProjectRef, "eecvbssdvarfcykcfrny");
  assert.equal(request.productionProjectRef, "cgiukdjwicykrmtkhudh");
  assert.notEqual(request.stagingProjectRef, request.productionProjectRef);
  assert.equal(request.productionOrigin, "https://econovaria.vercel.app");
  assert.equal(request.trustedClientIpHeader, "x-real-ip");
  assert.equal(request.verifyJwt, false);
  assert.equal(request.customAuthenticationRequired, true);
  assert.equal(request.productionEnvironmentApprovalRequired, true);
  assert.deepEqual(request.allowedProductionMutations, ["deploy web-session-api only"]);
  assert.equal(request.databaseChangesAllowed, false);
  assert.equal(request.secretChangesAllowed, false);
  assert.equal(request.productionDataWritesAllowed, false);
  assert.equal(request.otherFunctionsAllowed, false);
  assert.equal(request.realAdministratorLoginRequiredForClosure, true);
});

test("orchestrator starts from a merged release request without copied workflow inputs", () => {
  assert.match(workflow, /^\s*push:\s*$/mu);
  assert.match(workflow, /branches:\s*\n\s*- main/u);
  assert.match(workflow, /production-web-session-release-v1\.json/u);
  assert.doesNotMatch(workflow, /workflow_dispatch:/u);
  assert.doesNotMatch(workflow, /candidate_run_id:/u);
  assert.doesNotMatch(workflow, /confirm_project_ref:/u);
  assert.doesNotMatch(workflow, /confirm_action:/u);
  assert.match(workflow, /source_commit:\s*\$\{\{ steps\.request\.outputs\.source_commit \}\}/u);
  assert.match(workflow, /source_sha256:\s*\$\{\{ steps\.package\.outputs\.source_sha256 \}\}/u);
  assert.match(workflow, /candidate_digest:\s*\$\{\{ steps\.candidate\.outputs\.candidate_digest \}\}/u);
  assert.match(workflow, /git archive --format=tar "\$source_commit" backend/u);
  assert.match(workflow, /Upload immutable release artifact/u);
});

test("orchestrator has one staging gate and one protected production approval", () => {
  assert.equal((workflow.match(/^\s*environment:\s*staging\s*$/gmu) || []).length, 1);
  assert.equal((workflow.match(/^\s*environment:\s*production\s*$/gmu) || []).length, 1);
  const production = section("  deploy-and-verify-production:");
  assert.match(production, /needs:\s*\n\s*- validate-and-package\s*\n\s*- deploy-staging/u);
  assert.match(production, /environment:\s*production/u);
  assert.match(production, /productionEnvironmentApprovalRequired:\s*true/u);
});

test("staging derives and verifies the candidate identity automatically", () => {
  const staging = section("  deploy-staging:", "  deploy-and-verify-production:");
  assert.match(staging, /--project-ref "\$EXPECTED_STAGING_PROJECT_REF"/u);
  assert.match(staging, /supabase functions deploy "\$FUNCTION_NAME"/u);
  assert.match(staging, /--no-verify-jwt/u);
  assert.match(staging, /--use-api/u);
  assert.match(staging, /ECONOVARIA_WEB_ALLOWED_ORIGINS/u);
  assert.match(staging, /ECONOVARIA_TRUSTED_CLIENT_IP_HEADER/u);
  assert.match(staging, /\/health/u);
  assert.match(staging, /invalid_status/u);
  assert.match(staging, /candidate_digest=/u);
  assert.match(staging, /candidate_version=/u);
  assert.doesNotMatch(staging, /EXPECTED_PRODUCTION_PROJECT_REF.*functions deploy/su);
});

test("production mutates only the approved function and verifies deployed bytes", () => {
  const production = section("  deploy-and-verify-production:");
  assert.equal((production.match(/supabase functions deploy/g) || []).length, 1);
  assert.match(production, /supabase functions deploy "\$FUNCTION_NAME"/u);
  assert.match(production, /--project-ref "\$EXPECTED_PRODUCTION_PROJECT_REF"/u);
  assert.match(production, /Verify production secrets and database preconditions/u);
  assert.doesNotMatch(production, /supabase secrets set/u);
  assert.doesNotMatch(production, /Apply the atomic reconciliation/u);
  assert.doesNotMatch(production, /psql[\s\S]*--file/u);
  assert.match(production, /functions\/\$FUNCTION_NAME\/body/u);
  assert.match(production, /Accept: multipart\/form-data/u);
  assert.match(production, /verify-edge-function-multipart-source\.mjs/u);
  assert.match(production, /Compare every deployed staging and production source byte/u);
  assert.match(production, /\/health/u);
  assert.match(production, /api\/admin-session\/login/u);
  assert.match(production, /Production deployed source equals staging: `true`/u);
  assert.match(production, /Real administrator login: `required before incident closure`/u);
});
