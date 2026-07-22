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

test("post-Business serial watch validates as blocked and production-safe", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);

  assert.equal(result.executionState, "ACTIVE_SERIAL_RELEASE_WATCH");
  assert.equal(
    result.repository.mainCommitAtAudit,
    "2b073019ed36ca63cf9a9b3c7acd14569fe88116",
  );
  assert.equal(result.repository.behindMain, 0);
  assert.equal(result.repository.permanentChangedFileCount, 6);
  assert.equal(result.integrationWatch.serialQueue[0].status, "MERGED");
  assert.equal(result.integrationWatch.serialQueue[1].status, "MERGED");
  assert.equal(
    result.integrationWatch.serialQueue[1].mergeCommit,
    "2b073019ed36ca63cf9a9b3c7acd14569fe88116",
  );
  assert.deepEqual(
    result.dependencyState.openCapabilityPullRequests,
    [300, 249, 248, 261],
  );
  assert.equal(result.gate.productionDecision, "NO_GO");
  assert.equal(result.gate.productionModified, false);
});

test("migration drift records one staging-only alias and zero missing canonical migrations", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);

  assert.equal(result.migrations.canonicalRepositoryIdentity.count, 93);
  assert.equal(result.migrations.canonicalRepositoryIdentity.head, "20260721122500");
  assert.equal(result.migrations.stagingLedger.count, 94);
  assert.equal(result.migrations.stagingLedger.head, "20260721122500");
  assert.equal(result.migrations.stagingLedger.stagingOnlyCount, 1);
  assert.equal(result.migrations.stagingLedger.canonicalOnlyCount, 0);
  assert.equal(result.migrations.stagingLedger.netCountDelta, 1);
  assert.deepEqual(result.migrations.stagingLedger.missingCanonicalVersions, []);
  assert.equal(result.migrations.stagingLedger.matchesCanonicalRepository, false);
});

test("serial merge ledger must be a contiguous prefix", async () => {
  const evidence = await fixture();
  evidence.integrationWatch.serialQueue[3].status = "MERGED";
  evidence.integrationWatch.serialQueue[3].mergeCommit = "a".repeat(40);

  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /serial merge ledger is not a contiguous prefix/,
  );
});

test("serial queue order is immutable", async () => {
  const evidence = await fixture();
  [evidence.integrationWatch.serialQueue[2], evidence.integrationWatch.serialQueue[3]] =
    [evidence.integrationWatch.serialQueue[3], evidence.integrationWatch.serialQueue[2]];

  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /serial release queue order is invalid/,
  );
});

test("open dependency ledger must match serial queue", async () => {
  const evidence = await fixture();
  evidence.dependencyState.openCapabilityPullRequests.pop();

  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /open capability dependency ledger does not match serial queue/,
  );
});

test("two-way migration delta markers must be exact", async () => {
  const canonicalOnly = await fixture();
  canonicalOnly.migrations.stagingLedger.canonicalOnlyCount = 1;
  assert.throws(
    () => validateProductionIntegrationEvidence(canonicalOnly),
    /canonicalOnlyCount is inaccurate|set-delta counts are inconsistent/,
  );

  const net = await fixture();
  net.migrations.stagingLedger.netCountDelta = 2;
  assert.throws(
    () => validateProductionIntegrationEvidence(net),
    /netCountDelta is inaccurate|set-delta counts are inconsistent/,
  );
});

test("required application Edge inventory is exact", async () => {
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
});

test("substituted Edge inventory is rejected", async () => {
  const evidence = await fixture();
  evidence.integrationWatch.requiredApplicationEdgeFunctions[0] = "different-api";

  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /required application Edge Function inventory does not match repository source/,
  );
});

test("pull-request deployment and production targeting remain prohibited", async () => {
  const evidence = await fixture();
  evidence.integrationWatch.workflowSafety.pullRequestDeploymentAllowed = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /pull-request deployment must remain prohibited/,
  );

  const production = await fixture();
  production.integrationWatch.workflowSafety.productionTargetAllowed = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(production),
    /production workflow targeting must remain prohibited/,
  );
});

test("obsolete retained release remains rejected", async () => {
  const evidence = await fixture();
  const result = validateProductionIntegrationEvidence(evidence);

  assert.equal(result.immutableRelease.currentForCanonicalMain, false);
  assert.equal(result.immutableRelease.rollbackCompatibility.decision, "REJECTED");
  assert.notEqual(
    result.immutableRelease.migrations.versionSetSha256,
    result.migrations.canonicalRepositoryIdentity.versionSetSha256,
  );
});

test("ready mode rejects incomplete queue and connected gates", async () => {
  const evidence = await fixture();
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence, { requireReady: true }),
    /CONNECTED_GATE_COMPLETE_AND_HANDED_OFF|every serial capability PR merged|OPERATIONS_EVIDENCE_COMPLETE/,
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
  evidence.environment.staging.projectRef = evidence.environment.productionGuard.projectRef;

  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /must differ/,
  );
});

test("validator exposes structured errors", () => {
  assert.throws(
    () => validateProductionIntegrationEvidence(null),
    (error) => error instanceof ProductionIntegrationGateError && error.errors.length > 0,
  );
});
