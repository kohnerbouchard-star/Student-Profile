import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ProductionIntegrationGateError,
  validateProductionIntegrationEvidence,
} from "./production-integration-gate.mjs";

const EVIDENCE_PATH =
  "docs/operations/evidence/production-integration-gate-v1/preflight-2026-07-21.json";

async function fixture() {
  return JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
}

test("active integration watch validates as blocked and production-safe", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);
  assert.equal(result.executionState, "ACTIVE_INTEGRATION_WATCH");
  assert.equal(result.integrationWatch.status, "ACTIVE");
  assert.equal(result.gate.status, "BLOCKED");
  assert.equal(result.gate.productionDecision, "NO_GO");
  assert.equal(result.gate.productionPromotionAuthorized, false);
  assert.equal(result.migrations.productionModified, false);
  assert.equal(result.repository.behindMain, 0);
  assert.equal(result.repository.permanentChangedFileCount, 6);
});

test("blocked watch records exact staging drift without claiming alignment", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);

  assert.equal(result.migrations.canonicalRepositoryIdentity.count, 73);
  assert.equal(result.migrations.stagingLedger.count, 77);
  assert.equal(result.migrations.stagingLedger.aheadBy, 4);
  assert.equal(result.migrations.stagingLedger.additionalVersions.length, 4);
  assert.equal(result.migrations.stagingLedger.matchesCanonicalRepository, false);
  assert.equal(result.migrations.stagingLedger.matchesImmutableRelease, false);
});

test("required application Edge inventory is exact and named", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);
  assert.deepEqual(result.integrationWatch.requiredApplicationEdgeFunctions, [
    "admin-api",
    "classroom-api",
    "stock-market-player-read",
    "stock-market-read",
    "stock-market-runner",
    "stock-market-seed-copy",
    "stock-market-trading",
  ]);
  assert.deepEqual(result.environment.staging.applicationEdgeFunctions, []);
  assert.equal(result.environment.staging.applicationEdgeFunctionCount, 0);
  assert.equal(result.environment.staging.diagnosticEdgeFunctionCount, 1);
});

test("substituted or incomplete Edge inventory is rejected", async () => {
  const evidence = await fixture();
  evidence.integrationWatch.requiredApplicationEdgeFunctions[0] = "different-api";
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /required application Edge Function inventory does not match repository source/,
  );
});

test("frontend artifact and runtime materialization contract is complete", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);
  assert.equal(
    result.integrationWatch.frontendRuntimeConfigurationContract.materializedPath,
    "runtime-config.env.js",
  );
  assert.equal(
    result.integrationWatch.frontendRuntimeConfigurationContract.committedMaterializedFileAllowed,
    false,
  );

  const missingRoot = await fixture();
  missingRoot.integrationWatch.frontendArtifactRoots =
    missingRoot.integrationWatch.frontendArtifactRoots.filter((root) => root !== "player-terminal");
  assert.throws(
    () => validateProductionIntegrationEvidence(missingRoot),
    /frontend artifact roots are incomplete/,
  );
});

test("capability review set and exact heads are mandatory", async () => {
  const evidence = await fixture();
  evidence.integrationWatch.capabilityReviews.pop();
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /capability review pull request set is incomplete/,
  );

  const invalidHead = await fixture();
  invalidHead.integrationWatch.capabilityReviews[0].head = "not-a-commit";
  assert.throws(
    () => validateProductionIntegrationEvidence(invalidHead),
    /head is invalid/,
  );
});

test("migration collision and staging ahead markers must remain exact", async () => {
  const evidence = await fixture();
  evidence.migrations.stagingLedger.aheadBy = 3;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /aheadBy marker is inaccurate/,
  );

  const missingVersion = await fixture();
  missingVersion.migrations.stagingLedger.additionalVersions.pop();
  assert.throws(
    () => validateProductionIntegrationEvidence(missingVersion),
    /additional-version count is inaccurate/,
  );
});

test("pull-request deployment and production targeting remain prohibited", async () => {
  const evidence = await fixture();
  evidence.integrationWatch.workflowSafety.pullRequestDeploymentAllowed = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /pull-request deployment must remain prohibited/,
  );

  const productionTarget = await fixture();
  productionTarget.integrationWatch.workflowSafety.productionTargetAllowed = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(productionTarget),
    /production workflow targeting must remain prohibited/,
  );
});

test("blocked preflight may retain an obsolete verified release without treating it as current", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);

  assert.equal(result.immutableRelease.currentForCanonicalMain, false);
  assert.equal(result.immutableRelease.rollbackCompatibility.decision, "REJECTED");
  assert.notEqual(
    result.immutableRelease.migrations.versionSetSha256,
    result.migrations.canonicalRepositoryIdentity.versionSetSha256,
  );
});

test("ready mode rejects active watch, drift, and partial connected acceptance", async () => {
  const evidence = await fixture();
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence, { requireReady: true }),
    /CONNECTED_GATE_COMPLETE|FINAL_ACCEPTANCE_COMPLETE|canonical repository migration identity|connected execution is not ready/,
  );
});

test("release current-main and staging binding markers must be accurate", async () => {
  const evidence = await fixture();
  evidence.immutableRelease.currentForCanonicalMain = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /current-main marker does not match/,
  );

  const stagingBinding = await fixture();
  stagingBinding.migrations.stagingLedger.matchesImmutableRelease = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(stagingBinding),
    /staging\/release binding marker is inaccurate/,
  );
});

test("deployment claim requires exact named Edge and frontend artifact identity", async () => {
  const evidence = await fixture();
  evidence.immutableRelease.deployedToStaging = true;
  evidence.environment.staging.applicationEdgeFunctionCount = 7;
  evidence.environment.staging.applicationEdgeFunctions = [
    "admin-api",
    "classroom-api",
    "stock-market-player-read",
    "stock-market-read",
    "stock-market-runner",
    "stock-market-seed-copy",
    "wrong-trading-function",
  ];
  evidence.environment.staging.edgeFunctionCount = 8;
  evidence.environment.staging.frontendTarget = "staging-frontend-target";
  evidence.environment.staging.frontendDeployment.status = "deployed";
  evidence.environment.staging.frontendDeployment.artifactSha256 =
    evidence.immutableRelease.artifacts.find((artifact) => artifact.kind === "frontend").sha256;
  evidence.environment.staging.frontendDeployment.artifactSetSha256 =
    evidence.immutableRelease.artifactSetSha256;
  evidence.environment.staging.frontendDeployment.runtimeConfigurationSha256 =
    "a".repeat(64);
  evidence.environment.staging.frontendDeployment.runtimeBindingsValidated = true;
  evidence.environment.staging.runtimeConfiguration.status = "deployed";

  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /canonical current-main migration identity|exact named application Edge Function inventory/,
  );
});

test("evidence rejects browser key values and raw internal identifiers", async () => {
  const evidence = await fixture();
  evidence.environment.staging.runtimeConfiguration.materializedValue =
    ["sb", "publishable", "not-retainable"].join("_");
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /prohibited sensitive material/,
  );

  const rawIdentifier = await fixture();
  rawIdentifier.debugReference =
    ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
  assert.throws(
    () => validateProductionIntegrationEvidence(rawIdentifier),
    /prohibited sensitive material/,
  );
});

test("staging and production identities must remain distinct", async () => {
  const evidence = await fixture();
  evidence.environment.staging.projectRef =
    evidence.environment.productionGuard.projectRef;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /must differ/,
  );
});

test("Edge Function inventory totals must reconcile", async () => {
  const evidence = await fixture();
  evidence.environment.staging.edgeFunctionCount = 2;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /inventory totals are inconsistent/,
  );
});

test("validator exposes structured errors", () => {
  assert.throws(
    () => validateProductionIntegrationEvidence(null),
    (error) =>
      error instanceof ProductionIntegrationGateError &&
      error.errors.length > 0,
  );
});
