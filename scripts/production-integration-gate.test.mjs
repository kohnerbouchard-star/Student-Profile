import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  PREPARATION_CATEGORIES,
  PROBE_IDS,
  ProductionIntegrationGateError,
  TEMPLATE_IDS,
  validateOperationsPreparation,
  validateProductionIntegrationEvidence,
} from "./production-integration-gate.mjs";

const PREFLIGHT_PATH =
  "docs/operations/evidence/production-integration-gate-v1/preflight-2026-07-21.json";
const PREPARATION_PATH =
  "docs/operations/evidence/production-integration-gate-v1/preliminary-go-no-go-2026-07-21.json";
const COMMIT = /^[a-f0-9]{40}$/;
const EXPECTED_EDGES = [
  "admin-api",
  "classroom-api",
  "stock-market-player-read",
  "stock-market-read",
  "stock-market-runner",
  "stock-market-seed-copy",
  "stock-market-trading",
];

async function preflightFixture() {
  return JSON.parse(await readFile(PREFLIGHT_PATH, "utf8"));
}

async function preparationFixture() {
  return JSON.parse(await readFile(PREPARATION_PATH, "utf8"));
}

function assertReleasePreparation(evidence) {
  assert.equal(
    evidence.preparationCheckpoint,
    "CONNECTED_RELEASE_PREPARATION_CURRENT_NO_GO",
  );
  const preparation = evidence.releasePreparation;
  assert.equal(preparation.status, "PREPARED_NOT_EXECUTED");
  const manifest = preparation.manifestContracts;
  assert.equal(manifest.releaseManifestSchemaVersion, 1);
  assert.equal(manifest.artifactSetManifestSchemaVersion, 1);
  assert.equal(manifest.sourceCommitBinding, "EXACT_MERGED_MAIN_SHA_ONLY");
  assert.equal(manifest.sourceCommitReachabilityRequired, true);
  assert.equal(manifest.singleBuildPromotionRequired, true);
  assert.equal(manifest.rebuildDuringPromotionAllowed, false);
  assert.equal(manifest.configurationIdentityRequired, true);
  assert.equal(manifest.migrationIdentityRequired, true);
  assert.equal(manifest.artifactChecksumsRequired, true);

  const migration = preparation.migrationInventoryContract;
  assert.equal(migration.versionPattern, "^[0-9]{14}$");
  assert.equal(migration.ordering, "lexicographic-ascending");
  assert.equal(migration.digestAlgorithm, "sha256");
  assert.equal(
    migration.digestInput,
    "sorted-unique-versions-newline-delimited-with-trailing-newline",
  );
  assert.equal(migration.duplicatesAllowed, false);
  assert.equal(migration.historyRewriteAllowed, false);
  assert.ok(
    migration.historicalCompatibility.strategy.startsWith(
      "forward-only-preserve-applied-",
    ),
  );
  assert.deepEqual(
    migration.historicalCompatibility.stagingOnlyVersions,
    evidence.migrations.stagingLedger.stagingOnlyVersions.map(({ version }) => version),
  );
  assert.equal(
    migration.historicalCompatibility.exactIdentityRequiredBeforeFinalDeployment,
    true,
  );

  assert.deepEqual(preparation.inventoryTemplates.edgeFunctions, EXPECTED_EDGES);
  for (const inventory of ["routeInventory", "capabilityInventory", "rateLimitInventory"]) {
    assert.equal(
      preparation.inventoryTemplates[inventory].status,
      "TEMPLATE_PREPARED_REQUIRES_FINAL_MAIN",
    );
  }
  assert.deepEqual(
    preparation.environmentPrerequisites.requiredEnvironments,
    ["development", "production", "staging"],
  );
  assert.equal(preparation.environmentPrerequisites.valuesRetained, false);
  assert.equal(preparation.environmentPrerequisites.stagingProductionProjectDistinct, true);
  assert.equal(preparation.syntheticIdentityPlan.status, "PREPARED_NOT_PROVISIONED");
  assert.equal(preparation.syntheticIdentityPlan.expectedPlayers, 30);
  assert.equal(preparation.syntheticIdentityPlan.maximumPlayers, 40);
  assert.equal(preparation.syntheticIdentityPlan.productionDataAllowed, false);

  const rollback = preparation.rollbackEligibilityRules;
  assert.equal(rollback.status, "PREPARED");
  assert.equal(rollback.requiresKnownGoodConnectedStaging, true);
  assert.equal(rollback.requiresExactArtifactSet, true);
  assert.equal(rollback.requiresForwardDatabaseCompatibility, true);
  assert.equal(rollback.requiresExactRuntimeInventory, true);
  assert.equal(rollback.requiresRestoreEvidence, true);
  assert.equal(rollback.obsoleteArtifactEligibility, "REJECTED");
  assert.ok(preparation.evidenceRetention.forbidden.includes("credential-values"));
  assert.ok(preparation.evidenceRetention.forbidden.includes("production-data"));
  assert.ok(preparation.evidenceRetention.forbidden.includes("session-material"));
}

function assertCrossLedgerIdentity(preflight, preparation) {
  assert.match(preflight.repository.mainCommitAtAudit, COMMIT);
  assert.equal(
    preflight.repository.mainCommitAtAudit,
    preparation.repository.mainCommit,
  );
  assert.equal(
    preflight.repository.branchBaseCommit,
    preflight.repository.mainCommitAtAudit,
  );

  const merged = preflight.integrationWatch.serialQueue.filter(
    ({ status }) => status === "MERGED",
  );
  const open = preflight.integrationWatch.serialQueue.filter(
    ({ status }) => status !== "MERGED",
  );
  assert.deepEqual(
    preparation.serialReleaseQueue.completed.map(({ number }) => number),
    merged.map(({ number }) => number),
  );
  assert.deepEqual(
    preparation.serialReleaseQueue.remaining,
    open.map(({ number }) => number),
  );
  assert.equal(preparation.serialReleaseQueue.activeBlocker.number, open[0].number);
  assert.equal(preparation.serialReleaseQueue.activeBlocker.head, open[0].head);
  for (const entry of open) {
    assert.equal(preparation.serialReleaseQueue.heads[String(entry.number)], entry.head);
  }

  const canonical = preflight.migrations.canonicalRepositoryIdentity;
  const staging = preflight.migrations.stagingLedger;
  assert.equal(preparation.staging.migrations.repositoryCount, canonical.count);
  assert.equal(preparation.staging.migrations.repositoryHead, canonical.head);
  assert.equal(
    preparation.staging.migrations.repositoryVersionSetSha256,
    canonical.versionSetSha256,
  );
  assert.equal(preparation.staging.migrations.appliedCount, staging.count);
  assert.equal(preparation.staging.migrations.appliedDistinctCount, staging.distinctVersionCount);
  assert.equal(preparation.staging.migrations.appliedHead, staging.head);
  assert.equal(
    preparation.staging.migrations.appliedVersionSetSha256,
    staging.versionSetSha256,
  );
  assert.deepEqual(
    preparation.staging.migrations.stagingOnlyVersions,
    staging.stagingOnlyVersions.map(({ version }) => version),
  );
  assert.deepEqual(
    preparation.staging.migrations.missingCanonicalVersions,
    staging.missingCanonicalVersions,
  );
}

test("serial watch is current, blocked, synchronized, and production-safe", async () => {
  const preflight = await preflightFixture();
  const preparation = await preparationFixture();
  const result = validateProductionIntegrationEvidence(preflight);
  assertCrossLedgerIdentity(preflight, preparation);
  assert.equal(result.executionState, "ACTIVE_SERIAL_RELEASE_WATCH");
  assert.equal(result.repository.behindMain, 0);
  assert.equal(result.repository.permanentChangedFileCount, 6);
  assert.ok(result.integrationWatch.serialQueue.some(({ status }) => status === "MERGED"));
  assert.ok(result.dependencyState.openCapabilityPullRequests.length > 0);
  assert.equal(result.gate.productionDecision, "NO_GO");
  assert.equal(result.gate.productionModified, false);
});

test("migration delta markers match the complete live staging ledger", async () => {
  const result = validateProductionIntegrationEvidence(await preflightFixture());
  const canonical = result.migrations.canonicalRepositoryIdentity;
  const staging = result.migrations.stagingLedger;
  assert.equal(staging.distinctVersionCount, staging.count);
  assert.equal(staging.stagingOnlyCount, staging.stagingOnlyVersions.length);
  assert.equal(staging.canonicalOnlyCount, staging.missingCanonicalVersions.length);
  assert.equal(staging.netCountDelta, staging.count - canonical.count);
  assert.equal(
    staging.netCountDelta,
    staging.stagingOnlyCount - staging.canonicalOnlyCount,
  );
  assert.equal(staging.matchesCanonicalRepository, false);
});

test("serial order and open dependency ledger are fail-closed", async () => {
  const nonContiguous = await preflightFixture();
  const openIndex = nonContiguous.integrationWatch.serialQueue.findIndex(
    ({ status }) => status !== "MERGED",
  );
  const laterIndex = openIndex + 1;
  nonContiguous.integrationWatch.serialQueue[laterIndex].status = "MERGED";
  nonContiguous.integrationWatch.serialQueue[laterIndex].mergeCommit = "a".repeat(40);
  assert.throws(
    () => validateProductionIntegrationEvidence(nonContiguous),
    /serial merge ledger is not a contiguous prefix/,
  );

  const reordered = await preflightFixture();
  [reordered.integrationWatch.serialQueue[2], reordered.integrationWatch.serialQueue[3]] =
    [reordered.integrationWatch.serialQueue[3], reordered.integrationWatch.serialQueue[2]];
  assert.throws(
    () => validateProductionIntegrationEvidence(reordered),
    /serial release queue order is invalid/,
  );

  const dependencies = await preflightFixture();
  dependencies.dependencyState.openCapabilityPullRequests.pop();
  assert.throws(
    () => validateProductionIntegrationEvidence(dependencies),
    /open capability dependency ledger does not match serial queue/,
  );
});

test("two-way migration delta markers must remain exact", async () => {
  const canonicalOnly = await preflightFixture();
  canonicalOnly.migrations.stagingLedger.canonicalOnlyCount += 1;
  assert.throws(
    () => validateProductionIntegrationEvidence(canonicalOnly),
    /canonicalOnlyCount is inaccurate|set-delta counts are inconsistent/,
  );
  const net = await preflightFixture();
  net.migrations.stagingLedger.netCountDelta += 1;
  assert.throws(
    () => validateProductionIntegrationEvidence(net),
    /netCountDelta is inaccurate|set-delta counts are inconsistent/,
  );
});

test("Edge inventory and deployment prohibitions are exact", async () => {
  const result = validateProductionIntegrationEvidence(await preflightFixture());
  assert.deepEqual(result.integrationWatch.requiredApplicationEdgeFunctions, EXPECTED_EDGES);
  assert.deepEqual(result.environment.staging.applicationEdgeFunctions, []);

  const substituted = await preflightFixture();
  substituted.integrationWatch.requiredApplicationEdgeFunctions[0] = "different-api";
  assert.throws(
    () => validateProductionIntegrationEvidence(substituted),
    /required application Edge Function inventory|does not match the required contract/,
  );

  const pullRequestDeployment = await preflightFixture();
  pullRequestDeployment.integrationWatch.workflowSafety.pullRequestDeploymentAllowed = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(pullRequestDeployment),
    /pull-request deployment must remain prohibited/,
  );
  const productionTarget = await preflightFixture();
  productionTarget.integrationWatch.workflowSafety.productionTargetAllowed = true;
  assert.throws(
    () => validateProductionIntegrationEvidence(productionTarget),
    /production workflow targeting must remain prohibited/,
  );
});

test("parallel immutable release preparation is complete and non-executed", async () => {
  assertReleasePreparation(await preflightFixture());
});

test("release preparation rejects rebuild during promotion", async () => {
  const evidence = await preflightFixture();
  evidence.releasePreparation.manifestContracts.rebuildDuringPromotionAllowed = true;
  assert.throws(() => assertReleasePreparation(evidence), /Expected values to be strictly equal/);
});

test("migration reservations retain ordered downstream rekey requirements", async () => {
  const evidence = await preflightFixture();
  const ledger = evidence.integrationWatch.migrationReservationLedger;
  assert.equal(ledger.mergedRangesImmutable, true);
  assert.equal(ledger.unmergedBranchesRekeyOnlyAfterPredecessorMerge, true);
  assert.deepEqual(
    ledger.reservations.map(({ pullRequest }) => pullRequest),
    evidence.integrationWatch.serialQueue.map(({ number }) => number),
  );
  for (const conflict of ledger.exactVersionConflicts) {
    assert.ok(conflict.pullRequests.length >= 2);
    assert.ok(conflict.versions.length > 0);
    assert.equal(typeof conflict.status, "string");
  }
});

test("operations preparation has a distinct internal stop and sends no connected work", async () => {
  const evidence = await preparationFixture();
  assert.equal(
    evidence.preparationCheckpoint,
    "CONNECTED_RELEASE_PREPARATION_CURRENT_NO_GO",
  );
  assert.equal(
    evidence.operationsStopState,
    "OPERATIONS_PREPARATION_CURRENT_EXECUTION_BLOCKED",
  );
  const preparation = validateOperationsPreparation(evidence.operationsPreparation, {
    operationsEvidenceComplete: false,
  });
  assert.equal(preparation.stopState, evidence.operationsStopState);
  assert.deepEqual(preparation.validatedCategories, PREPARATION_CATEGORIES);
  assert.deepEqual(preparation.probes.items.map(({ id }) => id), PROBE_IDS);
  assert.deepEqual(
    preparation.evidenceTemplates.templates.map(({ id }) => id),
    TEMPLATE_IDS,
  );
  assert.equal(preparation.syntheticIdentities.plannedPoolSize, 40);
  assert.equal(preparation.syntheticIdentities.expectedLoadSubsetSize, 30);
  assert.equal(preparation.syntheticIdentities.credentialMaterialized, false);
  assert.equal(preparation.loadRunner.connectedExecutionBlocked, true);
  assert.ok(preparation.loadRunner.scenarios.every(({ executed }) => executed === false));
  assert.equal(preparation.queryPlanCapture.executed, false);
  assert.equal(preparation.cleanupProcedure.executed, false);
  assert.equal(preparation.productionNonModificationProof.executed, false);
});

test("operations preparation rejects missing contracts and premature execution", async () => {
  for (const [mutate, pattern] of [
    [(plan) => plan.validatedCategories.pop(), /validatedCategories does not match/],
    [(plan) => plan.probes.items.pop(), /probes\.items ids does not match/],
    [(plan) => plan.evidenceTemplates.templates.pop(), /evidenceTemplates ids does not match/],
    [(plan) => { plan.backupProcedure.executed = true; }, /execution marker is inconsistent/],
    [(plan) => { plan.loadRunner.scenarios[0].executed = true; }, /execution marker is inconsistent/],
    [(plan) => { plan.observability.activated = true; }, /activation marker is inconsistent/],
  ]) {
    const evidence = await preparationFixture();
    mutate(evidence.operationsPreparation);
    assert.throws(
      () => validateOperationsPreparation(evidence.operationsPreparation),
      pattern,
    );
  }
});

test("bounded-load and synthetic identity constraints are enforced", async () => {
  const wrongMaximum = await preparationFixture();
  wrongMaximum.operationsPreparation.loadRunner.scenarios[1].players = 41;
  assert.throws(
    () => validateOperationsPreparation(wrongMaximum.operationsPreparation),
    /maximum-40 player count is invalid/,
  );
  const excessiveDuration = await preparationFixture();
  excessiveDuration.operationsPreparation.loadRunner.scenarios[0].steadyMinutes = 13;
  assert.throws(
    () => validateOperationsPreparation(excessiveDuration.operationsPreparation),
    /expected-30 exceeds the duration bound/,
  );
  const derived = await preparationFixture();
  derived.operationsPreparation.syntheticIdentities.productionDerived = true;
  assert.throws(
    () => validateOperationsPreparation(derived.operationsPreparation),
    /must not be derived from production/,
  );
});

test("ready mode requires full convergence and executed connected evidence", async () => {
  const evidence = await preflightFixture();
  assert.throws(
    () => validateProductionIntegrationEvidence(evidence, { requireReady: true }),
    /CONNECTED_GATE_COMPLETE_AND_HANDED_OFF|every serial capability PR merged|OPERATIONS_EVIDENCE_COMPLETE|operationsPreparation evidence/,
  );
});

test("obsolete release, sensitive material, and environment aliasing are rejected", async () => {
  const result = validateProductionIntegrationEvidence(await preflightFixture());
  assert.equal(result.immutableRelease.currentForCanonicalMain, false);
  assert.equal(result.immutableRelease.rollbackCompatibility.decision, "REJECTED");
  assert.notEqual(
    result.immutableRelease.migrations.versionSetSha256,
    result.migrations.canonicalRepositoryIdentity.versionSetSha256,
  );

  const browserKey = await preflightFixture();
  browserKey.environment.staging.runtimeConfiguration.materializedValue =
    ["sb", "publishable", "not-retainable"].join("_");
  assert.throws(
    () => validateProductionIntegrationEvidence(browserKey),
    /prohibited sensitive material/,
  );
  const rawIdentifier = await preflightFixture();
  rawIdentifier.debugReference =
    ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
  assert.throws(
    () => validateProductionIntegrationEvidence(rawIdentifier),
    /prohibited sensitive material/,
  );
  const sameProject = await preflightFixture();
  sameProject.environment.staging.projectRef = sameProject.environment.productionGuard.projectRef;
  assert.throws(
    () => validateProductionIntegrationEvidence(sameProject),
    /must differ/,
  );
});

test("validator exposes structured errors", () => {
  assert.throws(
    () => validateProductionIntegrationEvidence(null),
    (error) => error instanceof ProductionIntegrationGateError && error.errors.length > 0,
  );
});
