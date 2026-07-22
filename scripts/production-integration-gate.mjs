import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const REF = /^[a-z0-9]{20}$/;
const VER = /^\d{14}$/;
const QUEUE = [294, 299, 300, 249, 248, 261];
const EDGES = [
  "admin-api",
  "classroom-api",
  "stock-market-player-read",
  "stock-market-read",
  "stock-market-runner",
  "stock-market-seed-copy",
  "stock-market-trading",
];
const ROOTS = ["admin", "assets", "auth", "frontend", "index.html", "player-terminal"];
const PREPARATION_CATEGORIES = [
  "backup",
  "cleanup",
  "concurrency",
  "dashboards-alerts",
  "evidence-templates",
  "ingress-proxy",
  "load-runner",
  "partial-outage",
  "privacy",
  "production-non-modification",
  "query-plan-capture",
  "replay-idempotency",
  "restore",
  "rollback-recovery",
  "security",
  "session-expiry",
  "synthetic-identities",
];
const PROBE_IDS = [
  "concurrency",
  "hmac-trusted-ingress",
  "partial-outage-fail-closed",
  "privacy-redaction",
  "production-non-modification",
  "proxy-header-correctness",
  "replay-idempotency-committed-success",
  "security-authentication",
  "session-expiry-revocation",
  "shared-nat-rate-limit",
  "synthetic-cleanup",
  "wrong-game-cross-tenant",
];
const TEMPLATE_IDS = [
  "alert-delivery",
  "backup-manifest",
  "cleanup-report",
  "load-report",
  "observability-activation",
  "outage-recovery",
  "privacy-probe-report",
  "production-non-modification",
  "query-plan-capture",
  "restore-rehearsal",
  "rollback-recovery",
  "security-probe-report",
];
const PROOF_CHECKPOINTS = [
  "edge-function-inventory",
  "frontend-identity",
  "migration-head",
  "production-audit-window",
  "project-identity",
  "release-identity",
];
const BAD = [
  /sb_secret_[\w-]+/,
  /sb_publishable_[\w-]+/,
  /Bearer\s+[\w._~-]+/i,
  /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
];
const BAD_KEY = new Set([
  "accesscode",
  "apikey",
  "authorization",
  "authorizationheader",
  "password",
  "publishablekey",
  "requestbody",
  "servicerolekey",
  "sessiontoken",
  "token",
]);

export class ProductionIntegrationGateError extends Error {
  constructor(errors) {
    super(`Production integration gate failed:\n- ${errors.join("\n- ")}`);
    this.name = "ProductionIntegrationGateError";
    this.errors = errors;
  }
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const normalizedKey = (value) => String(value).replace(/[^a-z0-9]/gi, "").toLowerCase();
const sameIdentity = (a, b) =>
  isObject(a) &&
  isObject(b) &&
  a.count === b.count &&
  a.head === b.head &&
  a.versionSetSha256 === b.versionSetSha256;

function check(value, message, errors) {
  if (!value) errors.push(message);
}

function scanSensitive(value, pointer, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => scanSensitive(entry, `${pointer}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) {
    if (typeof value === "string") {
      for (const pattern of BAD) {
        if (pattern.test(value)) errors.push(`${pointer} contains prohibited sensitive material`);
      }
    }
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (BAD_KEY.has(normalizedKey(key))) errors.push(`${pointer}.${key} is a prohibited evidence field`);
    scanSensitive(entry, `${pointer}.${key}`, errors);
  }
}

function sortedStrings(value, label, errors) {
  check(Array.isArray(value), `${label} must be an array`, errors);
  if (!Array.isArray(value)) return [];
  check(value.every((entry) => typeof entry === "string" && entry), `${label} must contain non-empty strings`, errors);
  const normalized = [...new Set(value)].sort();
  check(normalized.length === value.length, `${label} must not contain duplicates`, errors);
  check(JSON.stringify(normalized) === JSON.stringify(value), `${label} must be sorted`, errors);
  return normalized;
}

function exactStrings(value, expected, label, errors) {
  const actual = sortedStrings(value, label, errors);
  check(JSON.stringify(actual) === JSON.stringify(expected), `${label} does not match the required contract`, errors);
  return actual;
}

function validateIdentity(value, label, errors) {
  check(isObject(value), `${label} is required`, errors);
  if (!isObject(value)) return;
  check(Number.isInteger(value.count) && value.count > 0, `${label} count is invalid`, errors);
  check(VER.test(value.head), `${label} head is invalid`, errors);
  check(SHA.test(value.versionSetSha256), `${label} digest is invalid`, errors);
}

function validateQueue(watch, errors) {
  check(Array.isArray(watch?.serialQueue), "serial release queue is required", errors);
  if (!Array.isArray(watch?.serialQueue)) return [];
  check(
    JSON.stringify(watch.serialQueue.map((entry) => entry?.number)) === JSON.stringify(QUEUE),
    "serial release queue order is invalid",
    errors,
  );
  let openSeen = false;
  const pending = [];
  for (const entry of watch.serialQueue) {
    check(isObject(entry), "serial queue entry must be an object", errors);
    if (!isObject(entry)) continue;
    check(COMMIT.test(entry.head), `serial PR #${entry.number} head is invalid`, errors);
    check(["MERGED", "OPEN_DRAFT", "OPEN_READY"].includes(entry.status), `serial PR #${entry.number} status is invalid`, errors);
    if (entry.status === "MERGED") {
      check(!openSeen, "serial merge ledger is not a contiguous prefix", errors);
      check(COMMIT.test(entry.mergeCommit), `serial PR #${entry.number} merge commit is invalid`, errors);
    } else {
      openSeen = true;
      pending.push(entry.number);
      check(entry.mergeCommit === null, `open serial PR #${entry.number} must not claim a merge commit`, errors);
    }
    const versions = sortedStrings(entry.migrationVersions, `serial PR #${entry.number} migrationVersions`, errors);
    check(versions.every((version) => VER.test(version)), `serial PR #${entry.number} migration version is invalid`, errors);
    check(typeof entry.assemblyStatus === "string" && entry.assemblyStatus, `serial PR #${entry.number} assemblyStatus is required`, errors);
  }
  return pending;
}

function validateArtifacts(release, requiredEdges, errors) {
  check(Array.isArray(release?.artifacts), "immutable release artifacts are required", errors);
  if (!Array.isArray(release?.artifacts)) return { edge: [], frontend: null };
  let frontend = null;
  const edge = [];
  const files = new Set();
  for (const artifact of release.artifacts) {
    check(isObject(artifact), "artifact must be an object", errors);
    if (!isObject(artifact)) continue;
    check(typeof artifact.file === "string" && artifact.file.startsWith("artifacts/"), "artifact file is invalid", errors);
    check(!files.has(artifact.file), `artifact file is duplicated: ${artifact.file}`, errors);
    files.add(artifact.file);
    check(SHA.test(artifact.sha256), `artifact ${artifact.file} SHA-256 is invalid`, errors);
    check(Number.isInteger(artifact.sizeBytes) && artifact.sizeBytes > 0, `artifact ${artifact.file} size is invalid`, errors);
    if (artifact.kind === "frontend") {
      check(frontend === null, "exactly one frontend artifact is required", errors);
      frontend = artifact;
    } else if (artifact.kind === "edge-function") {
      check(typeof artifact.name === "string" && artifact.name, "edge artifact name is required", errors);
      edge.push(artifact.name);
    } else {
      errors.push(`artifact ${artifact.file} kind is invalid`);
    }
  }
  edge.sort();
  check(frontend !== null, "exactly one frontend artifact is required", errors);
  check(JSON.stringify(edge) === JSON.stringify(requiredEdges), "immutable release Edge inventory does not match required source inventory", errors);
  return { edge, frontend };
}

function validateOperationsPreparation(preparation, operationsEvidenceComplete, errors) {
  check(isObject(preparation), "operationsPreparation evidence is required", errors);
  if (!isObject(preparation)) return;

  exactStrings(preparation.validatedCategories, PREPARATION_CATEGORIES, "operationsPreparation.validatedCategories", errors);
  check(preparation.productionDataUsed === false, "operations preparation must not use production data", errors);
  check(preparation.productionModified === false, "operations preparation must not modify production", errors);

  const blocked = operationsEvidenceComplete === false;
  if (blocked) {
    check(preparation.phase === "PREPARATION", "blocked operations must remain in PREPARATION phase", errors);
    check(
      preparation.mode === "NON_DESTRUCTIVE_LOCAL_AND_SYNTHETIC_VALIDATION",
      "operations preparation mode is invalid",
      errors,
    );
    check(
      preparation.stopState === "OPERATIONS_PREPARATION_CURRENT_EXECUTION_BLOCKED",
      "blocked operations stop state is invalid",
      errors,
    );
    check(preparation.finalExecutionBlocked === true, "final operations execution must remain blocked", errors);
    check(preparation.destructiveActionsExecuted === false, "destructive operations must not be executed during preparation", errors);
  }

  const backup = preparation.backupProcedure;
  check(isObject(backup), "encrypted backup procedure is required", errors);
  if (isObject(backup)) {
    check(backup.encrypted === true, "backup procedure must require encryption", errors);
    check(backup.encryptionAlgorithm === "AES-256-GCM", "backup encryption profile is invalid", errors);
    check(backup.immutableOffPlatformCustodyRequired === true, "backup custody must be immutable and off-platform", errors);
    check(backup.executed === !blocked, "backup execution marker is inconsistent", errors);
  }

  const restore = preparation.restoreProcedure;
  check(isObject(restore), "distinct isolated restore procedure is required", errors);
  if (isObject(restore)) {
    check(restore.distinctProjectRequired === true, "restore must use a distinct project", errors);
    check(restore.syntheticOnly === true, "restore must remain synthetic-only", errors);
    check(restore.sharedStagingTargetAllowed === false, "restore must not target shared staging", errors);
    check(restore.productionTargetAllowed === false, "restore must not target production", errors);
    check(restore.controllerAuthorizationRequired === true, "restore must require controller authorization", errors);
    check(restore.executed === !blocked, "restore execution marker is inconsistent", errors);
  }

  const rollback = preparation.rollbackRecovery;
  check(isObject(rollback), "rollback and recovery procedure is required", errors);
  if (isObject(rollback)) {
    check(rollback.databaseDownMigrationAllowed === false, "database down-migration rollback must remain prohibited", errors);
    check(rollback.runtimeArtifactRollbackOnly === true, "rollback must use exact runtime artifacts", errors);
    check(rollback.forwardCompatibilityProofRequired === true, "rollback requires forward-compatibility proof", errors);
    check(
      rollback.sharedStagingExecutionAllowedBeforeFinalRelease === false,
      "rollback against shared staging must remain blocked before the final release",
      errors,
    );
    check(rollback.executed === !blocked, "rollback execution marker is inconsistent", errors);
  }

  const load = preparation.loadRunner;
  check(isObject(load), "load-runner configuration is required", errors);
  if (isObject(load)) {
    check(load.maximumRequestsPerSecond === 25, "load-runner RPS bound is invalid", errors);
    check(load.maximumDurationMinutes === 20, "load-runner duration bound is invalid", errors);
    check(load.connectedExecutionBlocked === blocked, "load connected-execution marker is inconsistent", errors);
    check(Array.isArray(load.scenarios) && load.scenarios.length === 2, "exactly two bounded-load scenarios are required", errors);
    const scenarios = Array.isArray(load.scenarios) ? load.scenarios : [];
    check(JSON.stringify(scenarios.map(({ id }) => id)) === JSON.stringify(["expected-30", "maximum-40"]), "load scenario order is invalid", errors);
    for (const scenario of scenarios) {
      const expectedPlayers = scenario.id === "expected-30" ? 30 : 40;
      check(scenario.players === expectedPlayers, `${scenario.id} player count is invalid`, errors);
      check(
        scenario.rampMinutes + scenario.steadyMinutes + scenario.cooldownMinutes <= load.maximumDurationMinutes,
        `${scenario.id} exceeds the duration bound`,
        errors,
      );
      check(scenario.executed === !blocked, `${scenario.id} execution marker is inconsistent`, errors);
    }
    check(load.executed === !blocked, "load execution marker is inconsistent", errors);
  }

  const identities = preparation.syntheticIdentities;
  check(isObject(identities), "synthetic identity preparation is required", errors);
  if (isObject(identities)) {
    check(identities.plannedPoolSize === 40, "synthetic identity pool must contain 40 planned identities", errors);
    check(identities.expectedLoadSubsetSize === 30, "expected-load identity subset must contain 30 identities", errors);
    check(identities.productionDerived === false, "synthetic identities must not be derived from production", errors);
    check(identities.credentialMaterialized === false || !blocked, "credential material must not be materialized during preparation", errors);
    check(typeof identities.cleanupTag === "string" && identities.cleanupTag, "synthetic identity cleanup tag is required", errors);
    check(identities.executed === !blocked, "synthetic identity execution marker is inconsistent", errors);
  }

  const probes = preparation.probes;
  check(isObject(probes), "operations probe preparation is required", errors);
  if (isObject(probes)) {
    check(Array.isArray(probes.items), "operations probes must be an array", errors);
    const items = Array.isArray(probes.items) ? probes.items : [];
    exactStrings(items.map(({ id }) => id), PROBE_IDS, "operationsPreparation.probes.items ids", errors);
    if (blocked) {
      check(
        items.every(({ status }) => ["PREPARED_NOT_EXECUTED", "PREPARED_REQUIRES_FINAL_ROUTE_INVENTORY"].includes(status)),
        "blocked probe status must remain prepared and unexecuted",
        errors,
      );
    }
    check(probes.executed === !blocked, "probe execution marker is inconsistent", errors);
  }

  const observability = preparation.observability;
  check(isObject(observability), "dashboard and alert preparation is required", errors);
  if (isObject(observability)) {
    check(observability.dashboardPanelCount === 13, "dashboard panel contract must contain 13 panels", errors);
    check(observability.alertCount === 12, "alert contract must contain 12 alerts", errors);
    check(observability.destinationsConfigured === !blocked, "observability destination marker is inconsistent", errors);
    check(observability.activated === !blocked, "observability activation marker is inconsistent", errors);
  }

  const queryPlans = preparation.queryPlanCapture;
  check(isObject(queryPlans), "query-plan capture procedure is required", errors);
  if (isObject(queryPlans)) {
    check(queryPlans.target === "synthetic-staging-only", "query-plan capture target is invalid", errors);
    check(queryPlans.statementProfile === "EXPLAIN ANALYZE BUFFERS FORMAT JSON", "query-plan statement profile is invalid", errors);
    check(queryPlans.literalRedactionRequired === true, "query-plan evidence must redact literals", errors);
    check(queryPlans.postLoadOnly === true, "query-plan capture must run after bounded load", errors);
    check(queryPlans.productionAllowed === false, "query-plan capture must not target production", errors);
    check(queryPlans.executed === !blocked, "query-plan execution marker is inconsistent", errors);
  }

  const cleanup = preparation.cleanupProcedure;
  check(isObject(cleanup), "synthetic cleanup procedure is required", errors);
  if (isObject(cleanup)) {
    check(cleanup.tagScopedOnly === true, "cleanup must be tag-scoped", errors);
    check(cleanup.verifyZeroResidualRows === true, "cleanup must verify zero residual rows", errors);
    check(cleanup.verifyZeroActiveSessions === true, "cleanup must verify zero active synthetic sessions", errors);
    check(cleanup.verifyNoTemporaryFunctions === true, "cleanup must verify no temporary functions remain", errors);
    check(cleanup.productionAllowed === false, "cleanup must not target production", errors);
    check(cleanup.executed === !blocked, "cleanup execution marker is inconsistent", errors);
  }

  const templates = preparation.evidenceTemplates;
  check(isObject(templates), "operations evidence templates are required", errors);
  if (isObject(templates)) {
    const entries = Array.isArray(templates.templates) ? templates.templates : [];
    exactStrings(entries.map(({ id }) => id), TEMPLATE_IDS, "operationsPreparation.evidenceTemplates ids", errors);
    if (blocked) check(entries.every(({ status }) => status === "PREPARED_NOT_EXECUTED"), "evidence templates must not claim execution", errors);
    for (const field of [
      "credentialValuesAllowed",
      "accessCodesAllowed",
      "sessionMaterialAllowed",
      "rawInternalIdentifiersAllowed",
      "sensitiveRequestBodiesAllowed",
    ]) {
      check(templates[field] === false, `evidenceTemplates.${field} must be false`, errors);
    }
  }

  const proof = preparation.productionNonModificationProof;
  check(isObject(proof), "production non-modification proof template is required", errors);
  if (isObject(proof)) {
    exactStrings(proof.requiredCheckpoints, PROOF_CHECKPOINTS, "productionNonModificationProof.requiredCheckpoints", errors);
    check(proof.prePostComparisonRequired === true, "production proof must require pre/post comparison", errors);
    check(proof.productionWriteOperationsAllowed === false, "production proof must prohibit production writes", errors);
    check(proof.executed === !blocked, "production proof execution marker is inconsistent", errors);
  }
}

export function validateProductionIntegrationEvidence(evidence, { requireReady = false } = {}) {
  const errors = [];
  check(isObject(evidence), "evidence must be an object", errors);
  if (!isObject(evidence)) throw new ProductionIntegrationGateError(errors);
  scanSensitive(evidence, "evidence", errors);

  check(evidence.schemaVersion === 2, "schemaVersion must be 2", errors);
  check(evidence.evidenceType === "production-integration-preflight", "evidenceType is invalid", errors);
  check(Number.isFinite(Date.parse(evidence.capturedAt)), "capturedAt must be an ISO-8601 timestamp", errors);
  check(
    ["ACTIVE_SERIAL_RELEASE_WATCH", "FINAL_RELEASE_ASSEMBLY", "CONNECTED_GATE_COMPLETE_AND_HANDED_OFF"].includes(evidence.executionState),
    "executionState is invalid",
    errors,
  );

  const repository = evidence.repository;
  check(isObject(repository), "repository identity is required", errors);
  if (isObject(repository)) {
    check(repository.name === "kohnerbouchard-star/Student-Profile", "repository name is invalid", errors);
    check(COMMIT.test(repository.mainCommitAtAudit), "mainCommitAtAudit must be a full commit SHA", errors);
    check(repository.integrationBranch === "agent/production-integration-gate-v1", "integration branch is invalid", errors);
    check(repository.branchBaseCommit === repository.mainCommitAtAudit, "integration branch must include audited main", errors);
    check(COMMIT.test(repository.reviewedIntegrationHeadBeforeEvidenceUpdate), "reviewed integration head is invalid", errors);
    check(repository.behindMain === 0, "integration branch must remain synchronized with main", errors);
    check(repository.permanentChangedFileCount === 6, "integration branch must retain exactly six permanent files", errors);
  }

  const staging = evidence.environment?.staging;
  const production = evidence.environment?.productionGuard;
  check(isObject(staging), "staging identity is required", errors);
  check(isObject(production), "production guard identity is required", errors);
  if (isObject(staging) && isObject(production)) {
    check(REF.test(staging.projectRef), "staging projectRef is invalid", errors);
    check(REF.test(production.projectRef), "production projectRef is invalid", errors);
    check(staging.projectRef !== production.projectRef, "staging and production project refs must differ", errors);
    check(staging.status === "ACTIVE_HEALTHY" && production.status === "ACTIVE_HEALTHY", "environment must be healthy", errors);
    check(staging.dataPolicy === "synthetic-only", "staging data policy must be synthetic-only", errors);
    check(SHA.test(staging.runtimeConfiguration?.publishableKeySha256), "runtime publishable-key fingerprint is invalid", errors);
    check(staging.runtimeConfiguration?.secretValueRetained === false, "runtime configuration must not retain a key value", errors);
    const deployed = sortedStrings(staging.applicationEdgeFunctions, "staging.applicationEdgeFunctions", errors);
    check(deployed.length === staging.applicationEdgeFunctionCount, "staging application Edge Function count is inaccurate", errors);
    check(
      staging.edgeFunctionCount === staging.applicationEdgeFunctionCount + staging.diagnosticEdgeFunctionCount,
      "staging Edge Function inventory totals are inconsistent",
      errors,
    );
    check(isObject(staging.frontendDeployment), "staging frontend deployment evidence is required", errors);
    if (isObject(staging.frontendDeployment)) {
      check(["not-deployed", "deployed"].includes(staging.frontendDeployment.status), "frontend deployment status is invalid", errors);
      check(staging.frontendDeployment.sourceFilesMutated === false, "frontend deployment must not mutate immutable source files", errors);
    }
  }
  check(evidence.environment?.distinctness?.result === "pass", "environment distinctness must pass", errors);

  const canonical = evidence.migrations?.canonicalRepositoryIdentity;
  const ledger = evidence.migrations?.stagingLedger;
  validateIdentity(canonical, "canonical migration identity", errors);
  validateIdentity(ledger, "staging migration identity", errors);
  let aligned = false;
  if (isObject(canonical) && isObject(ledger)) {
    check(ledger.distinctVersionCount === ledger.count, "staging migration versions are not unique", errors);
    check(ledger.blankVersionCount === 0 && ledger.blankNameCount === 0, "staging migration ledger contains blanks", errors);
    const extra = sortedStrings(ledger.stagingOnlyVersions?.map(({ version }) => version), "staging migration stagingOnlyVersions", errors);
    const missing = sortedStrings(ledger.missingCanonicalVersions, "staging migration missingCanonicalVersions", errors);
    check(extra.every((version) => VER.test(version)), "staging-only migration version is invalid", errors);
    check(missing.every((version) => VER.test(version)), "missing canonical migration version is invalid", errors);
    check(ledger.stagingOnlyCount === extra.length, "stagingOnlyCount is inaccurate", errors);
    check(ledger.canonicalOnlyCount === missing.length, "canonicalOnlyCount is inaccurate", errors);
    check(ledger.netCountDelta === ledger.count - canonical.count, "migration netCountDelta is inaccurate", errors);
    check(ledger.netCountDelta === ledger.stagingOnlyCount - ledger.canonicalOnlyCount, "migration set-delta counts are inconsistent", errors);
    aligned = ledger.stagingOnlyCount === 0 && ledger.canonicalOnlyCount === 0 && sameIdentity(ledger, canonical);
    check(ledger.matchesCanonicalRepository === aligned, "staging/canonical migration binding marker is inaccurate", errors);
  }
  check(evidence.migrations?.productionModified === false, "production must remain unmodified", errors);

  const watch = evidence.integrationWatch;
  check(isObject(watch), "integrationWatch evidence is required", errors);
  let requiredEdges = [];
  let pending = [];
  if (isObject(watch)) {
    check(["ACTIVE", "FINAL_RELEASE_ASSEMBLY", "FINAL_ACCEPTANCE_COMPLETE"].includes(watch.status), "integrationWatch.status is invalid", errors);
    pending = validateQueue(watch, errors);
    requiredEdges = exactStrings(watch.requiredApplicationEdgeFunctions, EDGES, "integrationWatch.requiredApplicationEdgeFunctions", errors);
    const roots = sortedStrings(watch.frontendArtifactRoots, "integrationWatch.frontendArtifactRoots", errors);
    check(ROOTS.every((root) => roots.includes(root)), "frontend artifact roots are incomplete", errors);
    check(watch.workflowSafety?.pullRequestDeploymentAllowed === false, "pull-request deployment must remain prohibited", errors);
    check(watch.workflowSafety?.productionTargetAllowed === false, "production workflow targeting must remain prohibited", errors);
    check(watch.workflowSafety?.branchMutationHelpersDetected === false, "branch mutation helper must not exist", errors);
  }

  const dependencyState = evidence.dependencyState;
  check(isObject(dependencyState), "dependency state is required", errors);
  if (isObject(dependencyState)) {
    check(
      JSON.stringify(dependencyState.openCapabilityPullRequests) === JSON.stringify(pending),
      "open capability dependency ledger does not match serial queue",
      errors,
    );
  }

  const release = evidence.immutableRelease;
  check(isObject(release), "immutable release identity is required", errors);
  let releaseMatchesCanonical = false;
  let releaseMatchesStaging = false;
  let artifactInventory = { edge: [], frontend: null };
  if (isObject(release)) {
    check(COMMIT.test(release.sourceCommit), "release sourceCommit is invalid", errors);
    check(release.sourceMergedIntoMain === true, "release source must be merged into main", errors);
    check(/^\d+$/.test(release.workflowRunId) && /^\d+$/.test(release.artifactId), "release workflow/artifact identity is invalid", errors);
    for (const [label, value] of Object.entries({
      githubArtifactSha256: release.githubArtifactSha256,
      releaseManifestSha256: release.releaseManifestSha256,
      artifactSetSha256: release.artifactSetSha256,
      configurationSha256: release.configuration?.sha256,
    })) {
      check(SHA.test(value), `${label} is invalid`, errors);
    }
    check(release.checksumsVerified === true, "release checksums must be verified", errors);
    check(release.environmentNeutrality?.status === "pass", "environment-neutrality must pass", errors);
    validateIdentity(release.migrations, "immutable release migration identity", errors);
    releaseMatchesCanonical = sameIdentity(release.migrations, canonical);
    releaseMatchesStaging = sameIdentity(release.migrations, ledger);
    check(release.currentForCanonicalMain === releaseMatchesCanonical, "release current-main marker is inaccurate", errors);
    check(ledger?.matchesImmutableRelease === releaseMatchesStaging, "staging/release binding marker is inaccurate", errors);
    artifactInventory = validateArtifacts(release, requiredEdges, errors);
  }

  validateOperationsPreparation(evidence.operationsPreparation, evidence.operationsEvidenceComplete, errors);

  if (isObject(evidence.privacy)) {
    for (const [key, value] of Object.entries(evidence.privacy)) check(value === false, `privacy.${key} must be false`, errors);
  } else {
    errors.push("privacy evidence is required");
  }

  const gate = evidence.gate;
  check(isObject(gate), "gate decision is required", errors);
  if (isObject(gate)) {
    check(gate.productionPromotionAuthorized === false, "production promotion must remain unauthorized", errors);
    check(gate.productionModified === false, "production must remain unchanged", errors);
    check(gate.failClosed === true, "gate must fail closed", errors);
    check(Array.isArray(gate.blockers), "gate blockers must be an array", errors);
    if (gate.blockers?.length) {
      check(gate.status === "BLOCKED", "a gate with blockers must be BLOCKED", errors);
      check(gate.productionDecision === "NO_GO", "a blocked gate must be NO_GO", errors);
    }
  }

  if (release?.deployedToStaging === true) {
    check(releaseMatchesCanonical && aligned && releaseMatchesStaging, "deployed release must match canonical and staging migration identities", errors);
    check(
      JSON.stringify(staging?.applicationEdgeFunctions) === JSON.stringify(artifactInventory.edge),
      "deployed release requires exact named application Edge inventory",
      errors,
    );
    check(staging?.frontendDeployment?.status === "deployed", "deployed release requires frontend deployment evidence", errors);
    check(
      staging?.frontendDeployment?.artifactSha256 === artifactInventory.frontend?.sha256,
      "deployed frontend artifact digest mismatch",
      errors,
    );
    check(
      staging?.frontendDeployment?.artifactSetSha256 === release.artifactSetSha256,
      "deployed frontend artifact-set digest mismatch",
      errors,
    );
    check(SHA.test(staging?.frontendDeployment?.runtimeConfigurationSha256 ?? ""), "deployed runtime configuration digest is invalid", errors);
    check(staging?.frontendDeployment?.runtimeBindingsValidated === true, "deployed runtime bindings must be validated", errors);
  } else {
    check(staging?.applicationEdgeFunctionCount === 0, "undeployed release must not claim application Edge Functions", errors);
    check(staging?.frontendDeployment?.status === "not-deployed", "undeployed release must not claim frontend deployment", errors);
  }

  if (requireReady) {
    check(evidence.executionState === "CONNECTED_GATE_COMPLETE_AND_HANDED_OFF", "ready gate requires CONNECTED_GATE_COMPLETE_AND_HANDED_OFF", errors);
    check(watch?.status === "FINAL_ACCEPTANCE_COMPLETE", "ready gate requires final acceptance watch state", errors);
    check(pending.length === 0, "ready gate requires every serial capability PR merged", errors);
    check(aligned && releaseMatchesCanonical && releaseMatchesStaging, "ready gate requires exact migration and release identity", errors);
    check(release?.deployedToStaging === true, "ready gate requires exact release deployed to staging", errors);
    check(evidence.operationsEvidenceComplete === true, "ready gate requires OPERATIONS_EVIDENCE_COMPLETE", errors);
    check(evidence.operationsPreparation?.phase === "EXECUTED", "ready gate requires executed operations evidence", errors);
    check(evidence.operationsPreparation?.stopState === "OPERATIONS_EVIDENCE_COMPLETE", "ready gate stop state is invalid", errors);
    check(gate?.status === "READY_FOR_OWNER_GO_NO_GO" && gate?.productionDecision === "GO_PENDING_AUTHORIZATION", "ready gate decision is invalid", errors);
    check(gate?.blockers?.length === 0, "ready gate must have no blockers", errors);
    for (const key of [
      "rollbackRehearsal",
      "encryptedBackupRestoreRehearsal",
      "securityAcceptance",
      "operationalDashboardsAndAlerts",
      "boundedLoad",
      "postLoadQueryPlans",
      "boundedSeedAcceptance",
      "connectedAdminSmoke",
      "connectedPlayerDesktopSmoke",
      "connectedPlayerMobileSmoke",
      "continuousScenarioRun",
      "defectClosure",
      "pilotHandoff",
    ]) {
      check(dependencyState?.[key] === "pass", `ready gate requires ${key}=pass`, errors);
    }
  }

  if (errors.length) throw new ProductionIntegrationGateError(errors);
  return evidence;
}

function parseArgs(args) {
  const options = { requireReady: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--evidence") options.evidencePath = args[++index];
    else if (args[index] === "--require-ready") options.requireReady = true;
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (!options.evidencePath) throw new Error("--evidence is required");
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const evidence = JSON.parse(await readFile(path.resolve(options.evidencePath), "utf8"));
  validateProductionIntegrationEvidence(evidence, { requireReady: options.requireReady });
  console.log(
    JSON.stringify(
      {
        executionState: evidence.executionState,
        preparationStopState: evidence.operationsPreparation.stopState,
        serialMerged: evidence.integrationWatch.serialQueue.filter(({ status }) => status === "MERGED").length,
        serialRemaining: evidence.dependencyState.openCapabilityPullRequests.length,
        canonicalMigrationCount: evidence.migrations.canonicalRepositoryIdentity.count,
        stagingMigrationCount: evidence.migrations.stagingLedger.count,
        stagingOnlyCount: evidence.migrations.stagingLedger.stagingOnlyCount,
        canonicalOnlyCount: evidence.migrations.stagingLedger.canonicalOnlyCount,
        preparationCategoryCount: evidence.operationsPreparation.validatedCategories.length,
        probeCount: evidence.operationsPreparation.probes.items.length,
        templateCount: evidence.operationsPreparation.evidenceTemplates.templates.length,
        gateStatus: evidence.gate.status,
        productionDecision: evidence.gate.productionDecision,
      },
      null,
      2,
    ),
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
