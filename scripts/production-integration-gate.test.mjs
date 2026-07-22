import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ProductionIntegrationGateError,
  validateProductionIntegrationEvidence,
} from "./production-integration-gate.mjs";

const EVIDENCE_PATH =
  "docs/operations/evidence/production-integration-gate-v1/preflight-2026-07-21.json";

const EXPECTED_EDGES = [
  "admin-api",
  "classroom-api",
  "stock-market-player-read",
  "stock-market-read",
  "stock-market-runner",
  "stock-market-seed-copy",
  "stock-market-trading",
];

async function fixture() {
  return JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
}

function assertPreparationContract(evidence) {
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
  assert.equal(
    migration.historicalCompatibility.strategy,
    "forward-only-preserve-applied-alias",
  );
  assert.deepEqual(
    migration.historicalCompatibility.stagingOnlyVersions,
    ["20260721015504"],
  );
  assert.equal(
    migration.historicalCompatibility.exactIdentityRequiredBeforeFinalDeployment,
    true,
  );

  assert.deepEqual(preparation.inventoryTemplates.edgeFunctions, EXPECTED_EDGES);
  assert.equal(
    preparation.inventoryTemplates.routeInventory.status,
    "TEMPLATE_PREPARED_REQUIRES_FINAL_MAIN",
  );
  assert.equal(
    preparation.inventoryTemplates.capabilityInventory.status,
    "TEMPLATE_PREPARED_REQUIRES_FINAL_MAIN",
  );
  assert.equal(
    preparation.inventoryTemplates.rateLimitInventory.status,
    "TEMPLATE_PREPARED_REQUIRES_FINAL_MAIN",
  );

  assert.deepEqual(
    preparation.environmentPrerequisites.requiredEnvironments,
    ["development", "production", "staging"],
  );
  assert.equal(preparation.environmentPrerequisites.valuesRetained, false);
  assert.equal(
    preparation.environmentPrerequisites.stagingProductionProjectDistinct,
    true,
  );

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

  assert.equal(preparation.evidenceRetention.status, "PREPARED");
  assert.ok(preparation.evidenceRetention.forbidden.includes("credential-values"));
  assert.ok(preparation.evidenceRetention.forbidden.includes("production-data"));
  assert.ok(preparation.evidenceRetention.forbidden.includes("session-material"));
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
  assert.equal(
    result.integrationWatch.serialQueue[2].head,
    "2a5659cab81dfe7ce1ddb4773381d6a71e83c1ce",
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

  assert.deepEqual(result.integrationWatch.requiredApplicationEdgeFunctions, EXPECTED_EDGES);
  assert.deepEqual(result.environment.staging.applicationEdgeFunctions, []);
});

test("substituted Edge inventory is rejected", async () => {
  const evidence = await fixture();
  evidence.integrationWatch.requiredApplicationEdgeFunctions[0] = "different-api";

  assert.throws(
    () => validateProductionIntegrationEvidence(evidence),
    /required application Edge Function inventory|does not match the required contract/,
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

test("parallel immutable release preparation is complete and explicitly non-executed", async () => {
  const evidence = await fixture();
  assertPreparationContract(evidence);
});

test("preparation contract rejects rebuild during promotion", async () => {
  const evidence = await fixture();
  evidence.releasePreparation.manifestContracts.rebuildDuringPromotionAllowed = true;

  assert.throws(
    () => assertPreparationContract(evidence),
    /Expected values to be strictly equal/,
  );
});

test("migration reservation ledger records downstream rekey requirements", async () => {
  const evidence = await fixture();
  const ledger = evidence.integrationWatch.migrationReservationLedger;

  assert.equal(ledger.mergedRangesImmutable, true);
  assert.equal(ledger.unmergedBranchesRekeyOnlyAfterPredecessorMerge, true);
  assert.deepEqual(
    ledger.reservations.map(({ pullRequest }) => pullRequest),
    [294, 299, 300, 249, 248, 261],
  );

  const conflict = ledger.exactVersionConflicts[0];
  assert.deepEqual(conflict.pullRequests, [300, 248]);
  assert.deepEqual(
    conflict.versions,
    ["20260721130000", "20260721131000", "20260721132000", "20260721133000"],
  );
  assert.equal(conflict.status, "MESSAGING_REKEY_REQUIRED_AFTER_MARKETPLACE");
  assert.equal(ledger.orderingRisks[0].pullRequest, 261);
});

test("shared convergence inventory templates remain final-main gated", async () => {
  const evidence = await fixture();
  const templates = evidence.integrationWatch.sharedConvergenceTemplates;

  assert.equal(templates.status, "PREPARED_REQUIRES_FINAL_MAIN");
  assert.equal(templates.finalInventoryRequired, true);
  assert.ok(templates.routerSurfaces.includes("backend/supabase/functions/admin-api/index.ts"));
  assert.ok(templates.routerSurfaces.includes("backend/supabase/functions/classroom-api/index.ts"));
  assert.ok(templates.packageSurfaces.includes("package.json"));
  assert.ok(templates.releaseSurfaces.length >= 2);
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
