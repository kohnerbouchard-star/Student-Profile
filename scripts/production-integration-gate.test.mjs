import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  EXECUTABLE_OPERATIONS,
  PREPARATION_CATEGORIES,
  PROBE_IDS,
  ProductionIntegrationGateError,
  SECURITY_TOOL_PROBE_IDS,
  TEMPLATE_IDS,
  analyzeQueryPlans,
  createDeterministicLoadPlan,
  createEncryptedBackupManifest,
  createObservabilityContract,
  evaluateSecurityPrivacyProbes,
  runLoadPlanDryRun,
  validateDeterministicLoadPlan,
  validateObservabilityContract,
  validateOperationsPreparation,
  validateProductionIntegrationEvidence,
  verifyEncryptedBackupManifest,
  verifyIsolatedRestore,
  verifyProductionNonModification,
  verifyTagScopedCleanup,
} from "./production-integration-gate.mjs";

const PREFLIGHT_PATH =
  "docs/operations/evidence/production-integration-gate-v1/preflight-2026-07-21.json";
const PREPARATION_PATH =
  "docs/operations/evidence/production-integration-gate-v1/preliminary-go-no-go-2026-07-21.json";
const SCRIPT_PATH = "scripts/production-integration-gate.mjs";
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

function migrationIdentity() {
  return {
    count: 93,
    head: "20260721122500",
    versionSetSha256: "4357a78ef8ea329f28a9394a86d2c3b19b6319422ff5d2b535f41e1f45500f65",
  };
}

function backupInput(overrides = {}) {
  return {
    projectRef: "eecvbssdvarfcykcfrny",
    environment: "staging",
    artifact: { sha256: "a".repeat(64), sizeBytes: 4096 },
    encryption: {
      encrypted: true,
      algorithm: "AES-256-GCM",
      nonceBytes: 12,
      tagBytes: 16,
      keyManagement: "external-kms",
    },
    migrationIdentity: migrationIdentity(),
    rowCountContracts: { games: 1, players: 40 },
    custody: { immutable: true, offPlatform: true, reference: "custody-local-001" },
    createdAt: "2026-07-22T06:00:00.000Z",
    ...overrides,
  };
}

function passingSecurityInput() {
  return {
    statuses: {
      unauthenticated: 401,
      wrongGame: 403,
      wrongPlayer: 404,
      staffScopeViolation: 403,
      expiredToken: 401,
      rateLimitSequence: [200, 200, 429],
    },
    responseBodies: ["request denied", "safe public error"],
    proxyCors: {
      corsOrigin: "https://staging.econovaria.invalid",
      expectedCorsOrigin: "https://staging.econovaria.invalid",
      untrustedForwardedAccepted: false,
      wildcardCredentialsAllowed: false,
    },
    replay: {
      mutationCount: 1,
      duplicateStatus: 200,
      secondMutationObserved: false,
    },
  };
}

function passingQueryPlan() {
  return [{
    Plan: {
      "Node Type": "Index Scan",
      "Relation Name": "players",
      "Index Name": "players_game_public_id_idx",
      "Actual Total Time": 12,
      "Total Cost": 120,
      "Plan Rows": 1,
      "Shared Read Blocks": 4,
      "Index Cond": "((game_id = '11111111-1111-4111-8111-111111111111') AND (public_id = 'P-001'))",
    },
  }];
}

function assertReleasePreparation(evidence) {
  assert.equal(evidence.preparationCheckpoint, "CONNECTED_RELEASE_PREPARATION_CURRENT_NO_GO");
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
  assert.equal(migration.digestInput, "sorted-unique-versions-newline-delimited-with-trailing-newline");
  assert.equal(migration.duplicatesAllowed, false);
  assert.equal(migration.historyRewriteAllowed, false);
  assert.ok(migration.historicalCompatibility.strategy.startsWith("forward-only-preserve-applied-"));
  assert.deepEqual(
    migration.historicalCompatibility.stagingOnlyVersions,
    evidence.migrations.stagingLedger.stagingOnlyVersions.map(({ version }) => version),
  );
  assert.equal(migration.historicalCompatibility.exactIdentityRequiredBeforeFinalDeployment, true);

  assert.deepEqual(preparation.inventoryTemplates.edgeFunctions, EXPECTED_EDGES);
  for (const inventory of ["routeInventory", "capabilityInventory", "rateLimitInventory"]) {
    assert.equal(preparation.inventoryTemplates[inventory].status, "TEMPLATE_PREPARED_REQUIRES_FINAL_MAIN");
  }
  assert.deepEqual(preparation.environmentPrerequisites.requiredEnvironments, ["development", "production", "staging"]);
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
  assert.equal(preflight.repository.mainCommitAtAudit, preparation.repository.mainCommit);
  assert.equal(preflight.repository.branchBaseCommit, preflight.repository.mainCommitAtAudit);
  const merged = preflight.integrationWatch.serialQueue.filter(({ status }) => status === "MERGED");
  const open = preflight.integrationWatch.serialQueue.filter(({ status }) => status !== "MERGED");
  assert.deepEqual(preparation.serialReleaseQueue.completed.map(({ number }) => number), merged.map(({ number }) => number));
  assert.deepEqual(preparation.serialReleaseQueue.remaining, open.map(({ number }) => number));
  assert.equal(preparation.serialReleaseQueue.activeBlocker.number, open[0].number);
  assert.equal(preparation.serialReleaseQueue.activeBlocker.head, open[0].head);
  for (const entry of open) assert.equal(preparation.serialReleaseQueue.heads[String(entry.number)], entry.head);

  const canonical = preflight.migrations.canonicalRepositoryIdentity;
  const staging = preflight.migrations.stagingLedger;
  assert.equal(preparation.staging.migrations.repositoryCount, canonical.count);
  assert.equal(preparation.staging.migrations.repositoryHead, canonical.head);
  assert.equal(preparation.staging.migrations.repositoryVersionSetSha256, canonical.versionSetSha256);
  assert.equal(preparation.staging.migrations.appliedCount, staging.count);
  assert.equal(preparation.staging.migrations.appliedDistinctCount, staging.distinctVersionCount);
  assert.equal(preparation.staging.migrations.appliedHead, staging.head);
  assert.equal(preparation.staging.migrations.appliedVersionSetSha256, staging.versionSetSha256);
  assert.deepEqual(preparation.staging.migrations.stagingOnlyVersions, staging.stagingOnlyVersions.map(({ version }) => version));
  assert.deepEqual(preparation.staging.migrations.missingCanonicalVersions, staging.missingCanonicalVersions);
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
  assert.equal(staging.netCountDelta, staging.stagingOnlyCount - staging.canonicalOnlyCount);
  assert.equal(staging.matchesCanonicalRepository, false);
});

test("serial order and open dependency ledger are fail-closed", async () => {
  const nonContiguous = await preflightFixture();
  const openIndex = nonContiguous.integrationWatch.serialQueue.findIndex(({ status }) => status !== "MERGED");
  const laterIndex = openIndex + 1;
  nonContiguous.integrationWatch.serialQueue[laterIndex].status = "MERGED";
  nonContiguous.integrationWatch.serialQueue[laterIndex].mergeCommit = "a".repeat(40);
  assert.throws(() => validateProductionIntegrationEvidence(nonContiguous), /serial merge ledger is not a contiguous prefix/);

  const reordered = await preflightFixture();
  [reordered.integrationWatch.serialQueue[2], reordered.integrationWatch.serialQueue[3]] =
    [reordered.integrationWatch.serialQueue[3], reordered.integrationWatch.serialQueue[2]];
  assert.throws(() => validateProductionIntegrationEvidence(reordered), /serial release queue order is invalid/);

  const dependencies = await preflightFixture();
  dependencies.dependencyState.openCapabilityPullRequests.pop();
  assert.throws(() => validateProductionIntegrationEvidence(dependencies), /open capability dependency ledger does not match serial queue/);
});

test("two-way migration delta markers must remain exact", async () => {
  const canonicalOnly = await preflightFixture();
  canonicalOnly.migrations.stagingLedger.canonicalOnlyCount += 1;
  assert.throws(() => validateProductionIntegrationEvidence(canonicalOnly), /canonicalOnlyCount is inaccurate|set-delta counts are inconsistent/);
  const net = await preflightFixture();
  net.migrations.stagingLedger.netCountDelta += 1;
  assert.throws(() => validateProductionIntegrationEvidence(net), /netCountDelta is inaccurate|set-delta counts are inconsistent/);
});

test("Edge inventory and deployment prohibitions are exact", async () => {
  const result = validateProductionIntegrationEvidence(await preflightFixture());
  assert.deepEqual(result.integrationWatch.requiredApplicationEdgeFunctions, EXPECTED_EDGES);
  assert.deepEqual(result.environment.staging.applicationEdgeFunctions, []);
  const substituted = await preflightFixture();
  substituted.integrationWatch.requiredApplicationEdgeFunctions[0] = "different-api";
  assert.throws(() => validateProductionIntegrationEvidence(substituted), /required application Edge Function inventory|does not match the required contract/);
  const pullRequestDeployment = await preflightFixture();
  pullRequestDeployment.integrationWatch.workflowSafety.pullRequestDeploymentAllowed = true;
  assert.throws(() => validateProductionIntegrationEvidence(pullRequestDeployment), /pull-request deployment must remain prohibited/);
  const productionTarget = await preflightFixture();
  productionTarget.integrationWatch.workflowSafety.productionTargetAllowed = true;
  assert.throws(() => validateProductionIntegrationEvidence(productionTarget), /production workflow targeting must remain prohibited/);
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
  assert.deepEqual(ledger.reservations.map(({ pullRequest }) => pullRequest), evidence.integrationWatch.serialQueue.map(({ number }) => number));
  for (const conflict of ledger.exactVersionConflicts) {
    assert.ok(conflict.pullRequests.length >= 2);
    assert.ok(conflict.versions.length > 0);
    assert.equal(typeof conflict.status, "string");
  }
});

test("operations preparation has a distinct internal stop and sends no connected work", async () => {
  const evidence = await preparationFixture();
  assert.equal(evidence.preparationCheckpoint, "CONNECTED_RELEASE_PREPARATION_CURRENT_NO_GO");
  assert.equal(evidence.operationsStopState, "OPERATIONS_PREPARATION_CURRENT_EXECUTION_BLOCKED");
  const preparation = validateOperationsPreparation(evidence.operationsPreparation, { operationsEvidenceComplete: false });
  assert.equal(preparation.stopState, evidence.operationsStopState);
  assert.deepEqual(preparation.validatedCategories, PREPARATION_CATEGORIES);
  assert.deepEqual(preparation.probes.items.map(({ id }) => id), PROBE_IDS);
  assert.deepEqual(preparation.evidenceTemplates.templates.map(({ id }) => id), TEMPLATE_IDS);
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
    assert.throws(() => validateOperationsPreparation(evidence.operationsPreparation), pattern);
  }
});

test("bounded-load and synthetic identity constraints are enforced", async () => {
  const wrongMaximum = await preparationFixture();
  wrongMaximum.operationsPreparation.loadRunner.scenarios[1].players = 41;
  assert.throws(() => validateOperationsPreparation(wrongMaximum.operationsPreparation), /maximum-40 player count is invalid/);
  const excessiveDuration = await preparationFixture();
  excessiveDuration.operationsPreparation.loadRunner.scenarios[0].steadyMinutes = 13;
  assert.throws(() => validateOperationsPreparation(excessiveDuration.operationsPreparation), /expected-30 exceeds the duration bound/);
  const derived = await preparationFixture();
  derived.operationsPreparation.syntheticIdentities.productionDerived = true;
  assert.throws(() => validateOperationsPreparation(derived.operationsPreparation), /must not be derived from production/);
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
  assert.notEqual(result.immutableRelease.migrations.versionSetSha256, result.migrations.canonicalRepositoryIdentity.versionSetSha256);
  const browserKey = await preflightFixture();
  browserKey.environment.staging.runtimeConfiguration.materializedValue = ["sb", "publishable", "not-retainable"].join("_");
  assert.throws(() => validateProductionIntegrationEvidence(browserKey), /prohibited sensitive material/);
  const rawIdentifier = await preflightFixture();
  rawIdentifier.debugReference = ["123e4567", "e89b", "42d3", "a456", "426614174000"].join("-");
  assert.throws(() => validateProductionIntegrationEvidence(rawIdentifier), /prohibited sensitive material/);
  const sameProject = await preflightFixture();
  sameProject.environment.staging.projectRef = sameProject.environment.productionGuard.projectRef;
  assert.throws(() => validateProductionIntegrationEvidence(sameProject), /must differ/);
});

test("encrypted backup tooling binds digest, encryption, project, schema, and row counts", () => {
  const manifest = createEncryptedBackupManifest(backupInput());
  const report = verifyEncryptedBackupManifest(manifest, {
    expectedProjectRef: "eecvbssdvarfcykcfrny",
    expectedArtifactSha256: "a".repeat(64),
  });
  assert.equal(manifest.encryption.algorithm, "AES-256-GCM");
  assert.equal(manifest.execution.backupExecuted, false);
  assert.equal(report.status, "PASS");
  assert.equal(report.execution.connectedExecuted, false);
  assert.equal(report.execution.productionExecuted, false);
});

test("backup tooling rejects altered digest and unauthorized production", () => {
  const manifest = createEncryptedBackupManifest(backupInput());
  const altered = structuredClone(manifest);
  altered.artifact.sha256 = "b".repeat(64);
  assert.throws(() => verifyEncryptedBackupManifest(altered), /manifest digest verification failed/);
  assert.throws(
    () => createEncryptedBackupManifest(backupInput({ projectRef: "cgiukdjwicykrmtkhudh", environment: "production" })),
    /production backup requires separate explicit authorization/,
  );
});

test("restore tooling requires a distinct target and exact restored contracts", () => {
  const manifest = createEncryptedBackupManifest(backupInput());
  const result = verifyIsolatedRestore({
    manifest,
    sourceProjectRef: "eecvbssdvarfcykcfrny",
    targetProjectRef: "rrrrrrrrrrrrrrrrrrrr",
    sharedStagingProjectRef: "eecvbssdvarfcykcfrny",
    productionProjectRef: "cgiukdjwicykrmtkhudh",
    syntheticOnly: true,
    destructiveRestoreExecuted: false,
    expectedMigrationIdentity: migrationIdentity(),
    actualMigrationIdentity: migrationIdentity(),
    expectedRowCounts: { games: 1, players: 40 },
    actualRowCounts: { games: 1, players: 40 },
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.distinctTargetVerified, true);
  assert.equal(result.destructiveRestoreExecuted, false);
  assert.throws(
    () => verifyIsolatedRestore({
      manifest,
      sourceProjectRef: "eecvbssdvarfcykcfrny",
      targetProjectRef: "eecvbssdvarfcykcfrny",
      sharedStagingProjectRef: "eecvbssdvarfcykcfrny",
      productionProjectRef: "cgiukdjwicykrmtkhudh",
      syntheticOnly: true,
      destructiveRestoreExecuted: false,
      expectedMigrationIdentity: migrationIdentity(),
      actualMigrationIdentity: migrationIdentity(),
      expectedRowCounts: { games: 1 },
      actualRowCounts: { games: 1 },
    }),
    /restore target must differ from source|must not be shared staging/,
  );
});

test("deterministic load tooling supports exact bounded 30-player and 40-player plans", () => {
  for (const players of [30, 40]) {
    const first = createDeterministicLoadPlan({ players, seed: "deterministic-load-seed" });
    const second = createDeterministicLoadPlan({ players, seed: "deterministic-load-seed" });
    validateDeterministicLoadPlan(first);
    const dryRun = runLoadPlanDryRun(first);
    assert.deepEqual(first, second);
    assert.equal(first.identities.length, players);
    assert.equal(first.events.length, players * 9);
    assert.equal(first.maximumRequestsPerSecond, 25);
    assert.equal(first.execution.requestsSent, 0);
    assert.equal(dryRun.requestsSent, 0);
    assert.equal(dryRun.status, "PASS");
  }
});

test("load tooling includes pause, ended-game, expiry, replay, outage, and cleanup", () => {
  const plan = createDeterministicLoadPlan({ players: 30, seed: "scenario-coverage-seed" });
  const operations = new Set(plan.events.map(({ operation }) => operation));
  for (const operation of [
    "paused-game-denial",
    "ended-game-denial",
    "session-expiry-denial",
    "replay-primary",
    "replay-duplicate",
    "partial-outage-fail-closed",
    "cleanup-verification",
  ]) assert.ok(operations.has(operation));
  assert.throws(() => createDeterministicLoadPlan({ players: 31 }), /only 30 or 40 players/);
  assert.throws(() => createDeterministicLoadPlan({ players: 30, maximumRequestsPerSecond: 26 }), /RPS bound is invalid/);
});

test("security and privacy tooling covers all denial, leakage, proxy, CORS, and replay probes", () => {
  const report = evaluateSecurityPrivacyProbes(passingSecurityInput());
  assert.equal(report.status, "PASS");
  assert.deepEqual(report.probes.map(({ id }) => id), SECURITY_TOOL_PROBE_IDS);
  assert.ok(report.probes.every(({ passed }) => passed));
  assert.equal(report.rawBodiesRetained, false);

  const uuidLeak = passingSecurityInput();
  uuidLeak.responseBodies = ["player 123e4567-e89b-42d3-a456-426614174000"];
  assert.throws(() => evaluateSecurityPrivacyProbes(uuidLeak), /raw-uuid-leakage/);
  const noRateLimit = passingSecurityInput();
  noRateLimit.statuses.rateLimitSequence = [200, 200, 200];
  assert.throws(() => evaluateSecurityPrivacyProbes(noRateLimit), /missing-rate-limit-enforcement/);
  const duplicateMutation = passingSecurityInput();
  duplicateMutation.replay.mutationCount = 2;
  duplicateMutation.replay.secondMutationObserved = true;
  assert.throws(() => evaluateSecurityPrivacyProbes(duplicateMutation), /replay-duplicate-requests/);
});

test("observability tooling emits exact machine-readable panels, alerts, and thresholds", () => {
  const contract = createObservabilityContract();
  validateObservabilityContract(contract);
  assert.equal(contract.panels.length, 13);
  assert.equal(contract.alerts.length, 12);
  assert.ok(contract.alerts.every(({ warning, critical }) => warning <= critical));
  assert.equal(contract.activated, false);
  assert.equal(contract.execution.connectedExecuted, false);
});

test("query-plan tooling redacts literals and detects sequential-scan and latency regressions", () => {
  const pass = analyzeQueryPlans({ queries: [{ id: "player-read", critical: true, plan: passingQueryPlan() }] });
  assert.equal(pass.status, "PASS");
  assert.equal(pass.queries[0].rawPlanRetained, false);
  assert.match(JSON.stringify(pass.queries[0].redactedPlan), /literal-redacted/);
  assert.doesNotMatch(JSON.stringify(pass.queries[0].redactedPlan), /11111111-1111-4111-8111-111111111111/);

  const regression = analyzeQueryPlans({
    thresholds: { maximumActualTotalTimeMs: 500, sequentialScanRowThreshold: 1000, regressionRatio: 1.5 },
    queries: [{
      id: "player-read",
      critical: true,
      baselinePlan: passingQueryPlan(),
      plan: [{ Plan: {
        "Node Type": "Seq Scan",
        "Relation Name": "players",
        "Actual Total Time": 900,
        "Total Cost": 9000,
        "Plan Rows": 5000,
        "Shared Read Blocks": 600,
        Filter: "(game_id = '11111111-1111-4111-8111-111111111111')",
      } }],
    }],
  });
  assert.equal(regression.status, "FAIL");
  assert.ok(regression.queries[0].findings.includes("SEQUENTIAL_SCAN_REGRESSION"));
  assert.ok(regression.queries[0].findings.includes("LATENCY_REGRESSION"));
  assert.ok(regression.queries[0].findings.includes("INDEX_SCAN_REMOVED"));
});

test("cleanup tooling reports success only after tag-scoped zero-count verification", () => {
  const result = verifyTagScopedCleanup({
    tag: "ops-cleanup-local-001",
    attemptedDeletionCounts: { games: 1, players: 40 },
    residualCounts: { games: 0, players: 0 },
    activeSyntheticSessions: 0,
    temporaryFunctions: [],
    productionTarget: false,
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.zeroCountVerified, true);
  assert.throws(
    () => verifyTagScopedCleanup({
      tag: "ops-cleanup-local-001",
      attemptedDeletionCounts: { players: 40 },
      residualCounts: { players: 1 },
      activeSyntheticSessions: 0,
      temporaryFunctions: [],
      productionTarget: false,
    }),
    /cleanup residual rows remain/,
  );
});

test("production non-modification tooling requires exact pre/post identity and zero writes", () => {
  const snapshot = {
    projectRef: "cgiukdjwicykrmtkhudh",
    migrationHead: "20260721122500",
    functionInventory: ["admin-api", "classroom-api"],
    frontendIdentity: "frontend-prod-v1",
    releaseIdentity: "release-prod-v1",
  };
  const result = verifyProductionNonModification({
    before: snapshot,
    after: structuredClone(snapshot),
    auditWindow: { startedAt: "2026-07-22T05:00:00.000Z", endedAt: "2026-07-22T06:00:00.000Z", writeOperationCount: 0 },
  });
  assert.equal(result.status, "PASS");
  assert.equal(result.writeOperationCount, 0);
  const changed = structuredClone(snapshot);
  changed.migrationHead = "20260721130000";
  assert.throws(
    () => verifyProductionNonModification({
      before: snapshot,
      after: changed,
      auditWindow: { startedAt: "2026-07-22T05:00:00.000Z", endedAt: "2026-07-22T06:00:00.000Z", writeOperationCount: 0 },
    }),
    /production migrationHead changed/,
  );
});

test("CLI creates and verifies a local encrypted backup manifest with zero connected execution", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "econovaria-ops-"));
  try {
    const artifactPath = path.join(directory, "backup.enc");
    const inputPath = path.join(directory, "backup-input.json");
    const manifestPath = path.join(directory, "manifest.json");
    const verifyInputPath = path.join(directory, "verify-input.json");
    const verifyOutputPath = path.join(directory, "verify-output.json");
    await writeFile(artifactPath, "synthetic encrypted backup fixture", "utf8");
    const input = backupInput();
    delete input.artifact;
    input.artifactPath = artifactPath;
    await writeFile(inputPath, JSON.stringify(input), "utf8");
    const create = spawnSync(process.execPath, [SCRIPT_PATH, "--operation", "backup-manifest", "--input", inputPath, "--output", manifestPath], { encoding: "utf8" });
    assert.equal(create.status, 0, create.stderr);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    assert.equal(manifest.execution.connectedExecuted, false);
    assert.equal(manifest.execution.productionExecuted, false);
    await writeFile(verifyInputPath, JSON.stringify({ manifest, artifactPath, expectedProjectRef: "eecvbssdvarfcykcfrny" }), "utf8");
    const verify = spawnSync(process.execPath, [SCRIPT_PATH, "--operation", "backup-verify", "--input", verifyInputPath, "--output", verifyOutputPath], { encoding: "utf8" });
    assert.equal(verify.status, 0, verify.stderr);
    const report = JSON.parse(await readFile(verifyOutputPath, "utf8"));
    assert.equal(report.status, "PASS");
    assert.equal(report.execution.connectedExecuted, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("executable operation inventory is exact and local-only", () => {
  assert.deepEqual(EXECUTABLE_OPERATIONS, [
    "backup-manifest",
    "backup-verify",
    "cleanup-verify",
    "load-plan",
    "observability-contract",
    "production-proof",
    "query-plan-analyze",
    "restore-verify",
    "security-probes",
  ]);
});

test("validator exposes structured errors", () => {
  assert.throws(
    () => validateProductionIntegrationEvidence(null),
    (error) => error instanceof ProductionIntegrationGateError && error.errors.length > 0,
  );
});
