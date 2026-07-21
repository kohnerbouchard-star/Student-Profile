import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ProductionIntegrationGateError,
  validateProductionIntegrationEvidence,
} from "./production-integration-gate.mjs";

const EVIDENCE_PATH = "docs/operations/evidence/production-integration-gate-v1/preflight-2026-07-21.json";

async function fixture() {
  return JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
}

test("connected preflight validates as explicitly blocked and production-safe", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);
  assert.equal(result.gate.status, "BLOCKED");
  assert.equal(result.gate.productionDecision, "NO_GO");
  assert.equal(result.gate.productionPromotionAuthorized, false);
  assert.equal(result.migrations.productionModified, false);
  assert.equal(result.environment.distinctness.result, "pass");
});

test("blocked preflight records staging migration drift without claiming a canonical match", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);

  assert.equal(result.migrations.canonicalRepositoryIdentity.count, 73);
  assert.equal(result.migrations.stagingLedger.count, 76);
  assert.equal(result.migrations.stagingLedger.aheadBy, 3);
  assert.equal(result.migrations.stagingLedger.matchesCanonicalRepository, false);
  assert.equal(result.migrations.stagingLedger.matchesImmutableRelease, false);
});

test("staging/canonical binding marker must match the recorded identities", async () => {
  const evidence = await fixture();
  evidence.migrations.stagingLedger.matchesCanonicalRepository = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /staging\/canonical migration binding marker is inaccurate/,
  );
});

test("staging migration aheadBy marker must be exact", async () => {
  const evidence = await fixture();
  evidence.migrations.stagingLedger.aheadBy = 2;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /aheadBy marker is inaccurate/,
  );
});

test("blocked preflight may retain an obsolete verified release without treating it as current", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);

  assert.equal(result.immutableRelease.currentForCanonicalMain, false);
  assert.notEqual(
    result.immutableRelease.migrations.versionSetSha256,
    result.migrations.canonicalRepositoryIdentity.versionSetSha256,
  );
});

test("ready mode rejects obsolete, drifted, or partial connected acceptance", async () => {
  const evidence = await fixture();
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence, { requireReady: true }),
    /canonical repository migration identity|canonical current-main migration set|connected execution is not ready/,
  );
});

test("release current-main marker must match the recorded migration identity", async () => {
  const evidence = await fixture();
  evidence.immutableRelease.currentForCanonicalMain = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /current-main marker does not match/,
  );
});

test("staging/release binding marker must match the complete recorded identities", async () => {
  const evidence = await fixture();
  evidence.migrations.stagingLedger.matchesImmutableRelease = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /staging\/release binding marker is inaccurate/,
  );
});

test("evidence rejects browser key values and raw internal identifiers", async () => {
  const evidence = await fixture();
  evidence.environment.staging.runtimeConfiguration.materializedValue = ["sb", "publishable", "not-retainable"].join("_");
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /prohibited sensitive material/,
  );

  const rawIdentifier = await fixture();
  rawIdentifier.debugReference = ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
  assert.throws(
    () => validateProductionIntegrationEvidence(rawIdentifier),
    /prohibited sensitive material/,
  );
});

test("staging and production identities must remain distinct", async () => {
  const evidence = await fixture();
  evidence.environment.staging.projectRef = evidence.environment.productionGuard.projectRef;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /must differ/,
  );
});

test("diagnostic Edge Functions cannot satisfy an application deployment claim", async () => {
  const evidence = await fixture();
  evidence.immutableRelease.deployedToStaging = true;
  assert.equal(evidence.environment.staging.edgeFunctionCount, 1);
  assert.equal(evidence.environment.staging.applicationEdgeFunctionCount, 0);
  assert.equal(evidence.environment.staging.diagnosticEdgeFunctionCount, 1);
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /canonical current-main migration identity|canonical current main|exact application Edge Function inventory|frontend target/,
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
    (error) => error instanceof ProductionIntegrationGateError && error.errors.length > 0,
  );
});
