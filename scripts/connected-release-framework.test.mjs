import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ConnectedReleaseFrameworkError,
  deriveStagingInventory,
  readCanonicalMigrationVersions,
  validateAcceptancePolicy,
  validateForwardOnlyReconciliation,
  validateLiveInventorySnapshot,
  validateSecureAcceptanceMechanism,
  versionSetSha256,
} from "./connected-release-framework.mjs";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const SHA_C = "c".repeat(40);
const DIGEST_A = "1".repeat(64);
const DIGEST_B = "2".repeat(64);
const STAGING = "eecvbssdvarfcykcfrny";
const PRODUCTION = "cgiukdjwicykrmtkhudh";

function policy() {
  return {
    schemaVersion: 1,
    contractType: "secure-connected-acceptance",
    platformJwtVerificationRequired: true,
    serverSideGetUserRequired: true,
    authorizationMetadataSource: "app_metadata",
    userMetadataAuthorizationAllowed: false,
    requiredOperatorRole: "staging_acceptance_operator",
    allowedReplayProtectionModes: ["one-time-authorization", "signed-request"],
    exactProjectRefBindingRequired: true,
    exactSourceShaBindingRequired: true,
    exactArtifactDigestBindingRequired: true,
    allowedMethods: ["POST"],
    maximumPayloadBytes: 4096,
    idempotencyRequired: true,
    replayDenialRequired: true,
    sanitizedResponsesRequired: true,
    guaranteedCleanupRequired: true,
    postCleanupZeroResidueRequired: true,
    productionProjectDenied: true,
    temporaryArtifactUrlsAllowed: false,
  };
}

function mechanism() {
  return {
    id: "reference-secure-acceptance",
    deployment: {
      verifyJwt: true,
      projectRef: STAGING,
      productionProjectRef: PRODUCTION,
      environment: "staging",
    },
    identity: {
      sourceSha: SHA_A,
      artifactDigest: DIGEST_A,
    },
    request: {
      allowedMethods: ["POST"],
      maximumPayloadBytes: 4096,
      allowedContentTypes: ["application/json"],
      exactProjectRefBinding: true,
      exactSourceShaBinding: true,
      exactArtifactDigestBinding: true,
      expectedProjectRef: STAGING,
      expectedSourceSha: SHA_A,
      expectedArtifactDigest: DIGEST_A,
    },
    authentication: {
      serverSideGetUser: true,
      metadataSource: "app_metadata",
      userMetadataUsed: false,
      requiredRole: "staging_acceptance_operator",
      stagingOnly: true,
    },
    authorization: {
      mode: "one-time-authorization",
      atomicClaim: true,
      expiryRequired: true,
      idempotencyRequired: true,
      replayDenied: true,
      shaOnlyAuthorization: false,
      factors: ["app-metadata-role", "authenticated-user", "one-time-authorization"],
    },
    privilegedAccess: {
      usesServiceRole: true,
      afterCallerAuthorization: true,
      scopeBound: true,
    },
    response: {
      sanitized: true,
      rawIdentifiersAllowed: false,
      secretsAllowed: false,
      fields: [
        "artifactDigest",
        "cleanupVerified",
        "evidenceId",
        "ok",
        "projectRef",
        "replayProtected",
        "sourceSha",
        "status",
      ],
    },
    cleanup: {
      guaranteed: true,
      strategy: "finally",
      zeroResidueVerified: true,
      verificationScopes: ["auth-users", "database-rows", "edge-functions", "sessions", "storage-objects"],
    },
    productionProjectDenied: true,
    temporaryArtifactUrlsAllowed: false,
    sourceText: "request.method !== \"POST\"; admin.auth.getUser(jwt); user.app_metadata.acceptance_role;",
  };
}

function serialQueue(craftingHead = SHA_C) {
  return [
    { number: 294, head: SHA_A, mergeCommit: SHA_B, status: "MERGED" },
    { number: 299, head: SHA_B, mergeCommit: SHA_C, status: "MERGED" },
    { number: 300, head: craftingHead, mergeCommit: null, status: "OPEN_DRAFT" },
    { number: 249, head: SHA_A, mergeCommit: null, status: "OPEN_DRAFT" },
    { number: 248, head: SHA_B, mergeCommit: null, status: "OPEN_DRAFT" },
    { number: 261, head: SHA_C, mergeCommit: null, status: "OPEN_DRAFT" },
  ];
}

function liveSnapshot() {
  const canonical = ["20260721100000", "20260721101000"];
  const staging = [...canonical, "20260722010000"];
  const base = {
    schemaVersion: 1,
    capturedAt: "2026-07-22T07:26:23.672Z",
    mainCommit: SHA_C,
    stagingProjectRef: STAGING,
    productionProjectRef: PRODUCTION,
    stagingMigrationVersions: staging,
    edgeFunctions: [
      {
        slug: "secure-acceptance",
        version: 1,
        verifyJwt: true,
        status: "ACTIVE",
        sourceSha256: DIGEST_A,
        classification: "feature-acceptance-temporary",
      },
    ],
    serialQueue: serialQueue(),
    controllerDecision: {
      status: "NO_GO",
      finalReleaseOperationsAuthorized: false,
      productionModified: false,
    },
  };
  const derived = deriveStagingInventory(base, canonical);
  base.declared = {
    mainCommit: derived.mainCommit,
    canonicalMigrationIdentity: derived.canonicalMigrationIdentity,
    stagingMigrationIdentity: derived.stagingMigrationIdentity,
    missingCanonicalVersions: derived.missingCanonicalVersions,
    stagingOnlyVersions: derived.stagingOnlyVersions,
    edgeFunctions: derived.edgeFunctions,
    serialHeads: derived.serialHeads,
    serialMergedPrefix: derived.serialMergedPrefix,
    serialOpen: derived.serialOpen,
    activeSerialBlocker: derived.activeSerialBlocker,
  };
  return { canonical, snapshot: base };
}

function reconciliationPlan() {
  return {
    schemaVersion: 1,
    contractType: "forward-only-staging-reconciliation",
    planId: "test-plan",
    stagingProjectRef: STAGING,
    productionProjectRef: PRODUCTION,
    appliedHistoryRewriteAllowed: false,
    appliedMigrationDeletionAllowed: false,
    canonicalEqualityClaimed: false,
    retroactiveCanonicalInsertionAllowed: false,
    controllerApprovalRequired: true,
    futureCanonicalConvergence: {
      mode: "forward-only",
      preserveAppliedVersions: true,
    },
    dispositions: [
      {
        version: "20260722010000",
        type: "staging-only-forward-patch",
        preserveAppliedRecord: true,
        deleteAppliedRecord: false,
        rewriteVersion: false,
        insertIntoHistoricalCanonicalRange: false,
        controllerApprovalBeforeCanonicalization: true,
        futureTreatment: "publish an approved forward patch after final main convergence",
      },
    ],
  };
}

test("secure acceptance reference contract validates", () => {
  validateAcceptancePolicy(policy());
  validateSecureAcceptanceMechanism(mechanism(), policy());
});

test("rejects verify_jwt false", () => {
  const candidate = mechanism();
  candidate.deployment.verifyJwt = false;
  assert.throws(() => validateSecureAcceptanceMechanism(candidate, policy()), /verify_jwt must be true/);
});

test("rejects service-role endpoint with no caller authorization", () => {
  const candidate = mechanism();
  candidate.privilegedAccess.afterCallerAuthorization = false;
  assert.throws(
    () => validateSecureAcceptanceMechanism(candidate, policy()),
    /service-role access requires caller authorization first/,
  );
});

test("rejects SHA-only authorization", () => {
  const candidate = mechanism();
  candidate.authorization.shaOnlyAuthorization = true;
  candidate.authorization.factors = ["source-sha"];
  assert.throws(
    () => validateSecureAcceptanceMechanism(candidate, policy()),
    /SHA-only authorization is prohibited|authorization factors are incomplete/,
  );
});

test("rejects raw identifier responses", () => {
  const candidate = mechanism();
  candidate.response.fields.push("playerId");
  assert.throws(
    () => validateSecureAcceptanceMechanism(candidate, policy()),
    /response field is not allowed|raw identifier response field is prohibited/,
  );
});

test("rejects missing cleanup", () => {
  const candidate = mechanism();
  candidate.cleanup.guaranteed = false;
  candidate.cleanup.zeroResidueVerified = false;
  assert.throws(
    () => validateSecureAcceptanceMechanism(candidate, policy()),
    /cleanup must be guaranteed|zero-residue/,
  );
});

test("rejects production project refs", () => {
  const candidate = mechanism();
  candidate.deployment.projectRef = PRODUCTION;
  candidate.request.expectedProjectRef = PRODUCTION;
  assert.throws(
    () => validateSecureAcceptanceMechanism(candidate, policy()),
    /production project ref is prohibited/,
  );
});

test("rejects stale artifact identity", () => {
  const candidate = mechanism();
  candidate.request.expectedArtifactDigest = DIGEST_B;
  assert.throws(
    () => validateSecureAcceptanceMechanism(candidate, policy()),
    /artifact digest binding is stale/,
  );
});

test("rejects embedded temporary artifact URLs", () => {
  const candidate = mechanism();
  candidate.sourceText += " https://example.oaiusercontent.com/raw?se=tomorrow&sig=temporary";
  assert.throws(
    () => validateSecureAcceptanceMechanism(candidate, policy()),
    /temporary artifact URL is prohibited/,
  );
});

test("inventory derives counts, digests, drift, functions, and serial heads", () => {
  const { canonical, snapshot } = liveSnapshot();
  const derived = validateLiveInventorySnapshot(snapshot, canonical);
  assert.deepEqual(derived.stagingOnlyVersions, ["20260722010000"]);
  assert.equal(derived.canonicalCoverageComplete, true);
  assert.equal(derived.historiesEqual, false);
  assert.equal(derived.activeSerialBlocker, 300);
  assert.equal(derived.temporaryAcceptanceEdgeFunctions[0], "secure-acceptance");
  assert.equal(derived.canonicalMigrationIdentity.versionSetSha256, versionSetSha256(canonical));
});

test("feature head advancement requires evidence changes, not code changes", () => {
  const { canonical, snapshot } = liveSnapshot();
  const nextHead = "d".repeat(40);
  snapshot.serialQueue[2].head = nextHead;
  snapshot.declared.serialHeads["300"] = nextHead;
  validateLiveInventorySnapshot(snapshot, canonical);
});

test("inventory rejects stale declared values", () => {
  const { canonical, snapshot } = liveSnapshot();
  snapshot.declared.stagingMigrationIdentity.count += 1;
  assert.throws(
    () => validateLiveInventorySnapshot(snapshot, canonical),
    /declared stagingMigrationIdentity/,
  );
});

test("forward-only reconciliation validates exact staging-only coverage", () => {
  const { canonical, snapshot } = liveSnapshot();
  const inventory = validateLiveInventorySnapshot(snapshot, canonical);
  validateForwardOnlyReconciliation(reconciliationPlan(), inventory);
});

test("forward-only reconciliation rejects destructive or dishonest history treatment", () => {
  const { canonical, snapshot } = liveSnapshot();
  const inventory = validateLiveInventorySnapshot(snapshot, canonical);
  for (const mutate of [
    (plan) => { plan.appliedHistoryRewriteAllowed = true; },
    (plan) => { plan.appliedMigrationDeletionAllowed = true; },
    (plan) => { plan.canonicalEqualityClaimed = true; },
    (plan) => { plan.retroactiveCanonicalInsertionAllowed = true; },
    (plan) => { plan.dispositions[0].insertIntoHistoricalCanonicalRange = true; },
  ]) {
    const plan = reconciliationPlan();
    mutate(plan);
    assert.throws(() => validateForwardOnlyReconciliation(plan, inventory), ConnectedReleaseFrameworkError);
  }
});

test("forward-only reconciliation rejects missing staging-only disposition", () => {
  const { canonical, snapshot } = liveSnapshot();
  const inventory = validateLiveInventorySnapshot(snapshot, canonical);
  const plan = reconciliationPlan();
  plan.dispositions = [];
  assert.throws(
    () => validateForwardOnlyReconciliation(plan, inventory),
    /every staging-only version/,
  );
});

test("canonical migration filesystem reader rejects duplicate version filenames", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "connected-release-"));
  const migrationRoot = path.join(root, "backend", "supabase", "migrations");
  await mkdir(migrationRoot, { recursive: true });
  await writeFile(path.join(migrationRoot, "20260721100000_first.sql"), "-- first");
  await writeFile(path.join(migrationRoot, "20260721100000_second.sql"), "-- duplicate");
  await assert.rejects(() => readCanonicalMigrationVersions(root), /duplicate versions/);
});
