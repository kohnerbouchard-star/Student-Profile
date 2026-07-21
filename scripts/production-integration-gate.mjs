import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const PROJECT_REF = /^[a-z0-9]{20}$/;
const MIGRATION_VERSION = /^\d{14}$/;
const REQUIRED_APPLICATION_EDGE_FUNCTIONS = Object.freeze([
  "admin-api",
  "classroom-api",
  "stock-market-player-read",
  "stock-market-read",
  "stock-market-runner",
  "stock-market-seed-copy",
  "stock-market-trading",
]);
const REQUIRED_FRONTEND_ROOTS = Object.freeze([
  "admin",
  "assets",
  "auth",
  "frontend",
  "index.html",
  "player-terminal",
]);
const ACTIVE_CAPABILITY_PULL_REQUESTS = Object.freeze([163, 248, 249, 261, 294, 299, 300]);
const FORBIDDEN_VALUE_PATTERNS = [
  /sb_secret_[A-Za-z0-9_-]+/,
  /sb_publishable_[A-Za-z0-9_-]+/,
  /Bearer\s+[A-Za-z0-9._~-]+/i,
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
];
const FORBIDDEN_KEYS = new Set([
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

function object(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizedKey(value) {
  return String(value).replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function check(condition, message, errors) {
  if (!condition) errors.push(message);
}

function inspectSensitiveValues(value, pointer, errors) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => inspectSensitiveValues(entry, `${pointer}[${index}]`, errors));
    return;
  }
  if (!object(value)) {
    if (typeof value === "string") {
      for (const pattern of FORBIDDEN_VALUE_PATTERNS) {
        if (pattern.test(value)) errors.push(`${pointer} contains prohibited sensitive material`);
      }
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizedKey(key))) {
      errors.push(`${pointer}.${key} is a prohibited evidence field`);
    }
    inspectSensitiveValues(child, `${pointer}.${key}`, errors);
  }
}

function sameMigrationIdentity(left, right) {
  return object(left) && object(right) &&
    left.count === right.count &&
    left.head === right.head &&
    left.versionSetSha256 === right.versionSetSha256;
}

function sortedUniqueStrings(value, label, errors) {
  check(Array.isArray(value), `${label} must be an array`, errors);
  if (!Array.isArray(value)) return [];
  check(value.every((entry) => typeof entry === "string" && entry.length > 0), `${label} must contain non-empty strings`, errors);
  const normalized = [...new Set(value)].sort();
  check(normalized.length === value.length, `${label} must not contain duplicates`, errors);
  check(JSON.stringify(value) === JSON.stringify(normalized), `${label} must be sorted`, errors);
  return normalized;
}

function validateMigrationIdentity(identity, label, errors) {
  check(object(identity), `${label} is required`, errors);
  if (!object(identity)) return;
  check(Number.isInteger(identity.count) && identity.count > 0, `${label} count is invalid`, errors);
  check(MIGRATION_VERSION.test(identity.head), `${label} head is invalid`, errors);
  check(SHA256.test(identity.versionSetSha256), `${label} digest is invalid`, errors);
}

function validateArtifacts(release, errors) {
  check(Array.isArray(release.artifacts) && release.artifacts.length >= 2, "immutable release artifacts are required", errors);
  if (!Array.isArray(release.artifacts)) {
    return { frontendCount: 0, edgeCount: 0, edgeNames: [], frontendArtifact: null };
  }
  const files = new Set();
  const edgeNames = [];
  let frontendCount = 0;
  let edgeCount = 0;
  let frontendArtifact = null;
  for (const [index, artifact] of release.artifacts.entries()) {
    check(object(artifact), `artifact ${index} must be an object`, errors);
    if (!object(artifact)) continue;
    check(typeof artifact.file === "string" && artifact.file.startsWith("artifacts/"), `artifact ${index} file is invalid`, errors);
    check(!files.has(artifact.file), `artifact file is duplicated: ${artifact.file}`, errors);
    files.add(artifact.file);
    check(SHA256.test(artifact.sha256), `artifact ${artifact.file} SHA-256 is invalid`, errors);
    check(Number.isInteger(artifact.sizeBytes) && artifact.sizeBytes > 0, `artifact ${artifact.file} size is invalid`, errors);
    if (artifact.kind === "frontend") {
      frontendCount += 1;
      frontendArtifact = artifact;
    }
    if (artifact.kind === "edge-function") {
      edgeCount += 1;
      check(typeof artifact.name === "string" && artifact.name.length > 0, `edge artifact ${artifact.file} name is required`, errors);
      if (typeof artifact.name === "string") edgeNames.push(artifact.name);
    }
  }
  edgeNames.sort();
  check(frontendCount === 1, "exactly one frontend artifact is required", errors);
  check(edgeCount > 0, "at least one Edge Function artifact is required", errors);
  check(new Set(edgeNames).size === edgeNames.length, "Edge Function artifact names must be unique", errors);
  return { frontendCount, edgeCount, edgeNames, frontendArtifact };
}

function validatePrivacy(privacy, errors) {
  check(object(privacy), "privacy evidence is required", errors);
  if (!object(privacy)) return;
  for (const [name, value] of Object.entries(privacy)) {
    check(value === false, `privacy.${name} must be false`, errors);
  }
}

function validateIntegrationWatch(watch, repository, errors) {
  check(object(watch), "integrationWatch evidence is required", errors);
  if (!object(watch)) return { requiredEdgeNames: [] };

  check(["ACTIVE", "FINAL_RELEASE_ASSEMBLY", "FINAL_ACCEPTANCE_COMPLETE"].includes(watch.status), "integrationWatch.status is invalid", errors);
  check(object(watch.controllerPullRequest), "controller pull request identity is required", errors);
  if (object(watch.controllerPullRequest)) {
    check(watch.controllerPullRequest.number === 301, "controller pull request number is invalid", errors);
    check(COMMIT.test(watch.controllerPullRequest.head), "controller pull request head is invalid", errors);
  }

  const requiredEdgeNames = sortedUniqueStrings(
    watch.requiredApplicationEdgeFunctions,
    "integrationWatch.requiredApplicationEdgeFunctions",
    errors,
  );
  check(
    JSON.stringify(requiredEdgeNames) === JSON.stringify(REQUIRED_APPLICATION_EDGE_FUNCTIONS),
    "required application Edge Function inventory does not match repository source",
    errors,
  );

  const frontendRoots = sortedUniqueStrings(
    watch.frontendArtifactRoots,
    "integrationWatch.frontendArtifactRoots",
    errors,
  );
  check(
    REQUIRED_FRONTEND_ROOTS.every((root) => frontendRoots.includes(root)),
    "frontend artifact roots are incomplete",
    errors,
  );

  const runtimeContract = watch.frontendRuntimeConfigurationContract;
  check(object(runtimeContract), "frontend runtime configuration contract is required", errors);
  if (object(runtimeContract)) {
    check(runtimeContract.template === "docs/operations/environments/runtime-config.env.template.js", "runtime configuration template is invalid", errors);
    check(runtimeContract.materializedPath === "runtime-config.env.js", "runtime configuration materialized path is invalid", errors);
    check(runtimeContract.committedMaterializedFileAllowed === false, "materialized runtime configuration must not be committed", errors);
    check(runtimeContract.sourceFilesMutated === false, "runtime materialization must not mutate immutable source files", errors);
    const requiredFields = sortedUniqueStrings(runtimeContract.requiredFields, "runtime configuration requiredFields", errors);
    check(
      JSON.stringify(requiredFields) === JSON.stringify(["environment", "projectRef", "supabasePublishableKey", "supabaseUrl"]),
      "runtime configuration required fields are incomplete",
      errors,
    );
    const derivedBindings = sortedUniqueStrings(runtimeContract.derivedBindings, "runtime configuration derivedBindings", errors);
    check(
      JSON.stringify(derivedBindings) === JSON.stringify(["adminApiUrl", "classroomApiUrl"]),
      "runtime configuration derived API bindings are incomplete",
      errors,
    );
  }

  check(Array.isArray(watch.capabilityReviews), "capability review evidence is required", errors);
  if (Array.isArray(watch.capabilityReviews)) {
    const numbers = watch.capabilityReviews.map((review) => review?.number).sort((left, right) => left - right);
    check(JSON.stringify(numbers) === JSON.stringify(ACTIVE_CAPABILITY_PULL_REQUESTS), "capability review pull request set is incomplete", errors);
    for (const review of watch.capabilityReviews) {
      check(object(review), "capability review must be an object", errors);
      if (!object(review)) continue;
      check(Number.isInteger(review.number), "capability review number is invalid", errors);
      check(COMMIT.test(review.head), `capability PR #${review.number} head is invalid`, errors);
      check(Number.isInteger(review.aheadBy) && review.aheadBy >= 0, `capability PR #${review.number} aheadBy is invalid`, errors);
      check(Number.isInteger(review.behindBy) && review.behindBy >= 0, `capability PR #${review.number} behindBy is invalid`, errors);
      const versions = sortedUniqueStrings(review.migrationVersions, `capability PR #${review.number} migrationVersions`, errors);
      check(versions.every((version) => MIGRATION_VERSION.test(version)), `capability PR #${review.number} migration version is invalid`, errors);
      check(typeof review.assemblyStatus === "string" && review.assemblyStatus.length > 0, `capability PR #${review.number} assemblyStatus is required`, errors);
    }
  }

  check(Array.isArray(watch.migrationCollisions), "migration collision evidence is required", errors);
  if (Array.isArray(watch.migrationCollisions)) {
    for (const [index, collision] of watch.migrationCollisions.entries()) {
      check(object(collision), `migration collision ${index} must be an object`, errors);
      if (!object(collision)) continue;
      check(Array.isArray(collision.pullRequests) && collision.pullRequests.length > 0, `migration collision ${index} pullRequests are required`, errors);
      const versions = sortedUniqueStrings(collision.versions, `migration collision ${index} versions`, errors);
      check(versions.every((version) => MIGRATION_VERSION.test(version)), `migration collision ${index} version is invalid`, errors);
      check(typeof collision.resolution === "string" && collision.resolution.length > 0, `migration collision ${index} resolution is required`, errors);
    }
  }

  const workflowSafety = watch.workflowSafety;
  check(object(workflowSafety), "workflow safety evidence is required", errors);
  if (object(workflowSafety)) {
    check(workflowSafety.pullRequestDeploymentAllowed === false, "pull-request deployment must remain prohibited", errors);
    check(workflowSafety.productionTargetAllowed === false, "production workflow targeting must remain prohibited", errors);
    check(workflowSafety.branchMutationHelpersDetected === false, "branch mutation helper must not exist", errors);
    check(Array.isArray(workflowSafety.unsafeConnectedJobs), "unsafe connected job list is required", errors);
  }

  if (watch.status === "ACTIVE") {
    check(repository?.behindMain === 0, "active integration branch must remain synchronized with main", errors);
    check(repository?.permanentChangedFileCount === 6, "integration branch must retain exactly six permanent files", errors);
  }

  return { requiredEdgeNames };
}

export function validateProductionIntegrationEvidence(evidence, { requireReady = false } = {}) {
  const errors = [];
  check(object(evidence), "evidence must be an object", errors);
  if (!object(evidence)) throw new ProductionIntegrationGateError(errors);

  inspectSensitiveValues(evidence, "evidence", errors);
  check(evidence.schemaVersion === 1, "schemaVersion must be 1", errors);
  check(evidence.evidenceType === "production-integration-preflight", "evidenceType is invalid", errors);
  check(Number.isFinite(Date.parse(evidence.capturedAt)), "capturedAt must be an ISO-8601 timestamp", errors);
  check(["ACTIVE_INTEGRATION_WATCH", "FINAL_RELEASE_ASSEMBLY", "CONNECTED_GATE_COMPLETE"].includes(evidence.executionState), "executionState is invalid", errors);

  const repository = evidence.repository;
  check(object(repository), "repository identity is required", errors);
  if (object(repository)) {
    check(repository.name === "kohnerbouchard-star/Student-Profile", "repository name is invalid", errors);
    check(COMMIT.test(repository.mainCommitAtAudit), "mainCommitAtAudit must be a full commit SHA", errors);
    check(repository.integrationBranch === "agent/production-integration-gate-v1", "integration branch is invalid", errors);
    check(repository.branchBaseCommit === repository.mainCommitAtAudit, "integration branch must start from audited main", errors);
    check(COMMIT.test(repository.reviewedIntegrationHeadBeforeEvidenceUpdate), "reviewed integration head is invalid", errors);
    check(Number.isInteger(repository.behindMain) && repository.behindMain >= 0, "repository.behindMain is invalid", errors);
    check(Number.isInteger(repository.permanentChangedFileCount) && repository.permanentChangedFileCount > 0, "permanent changed-file count is invalid", errors);
  }

  const watchFacts = validateIntegrationWatch(evidence.integrationWatch, repository, errors);

  const staging = evidence.environment?.staging;
  const production = evidence.environment?.productionGuard;
  check(object(staging), "staging identity is required", errors);
  check(object(production), "production guard identity is required", errors);
  if (object(staging) && object(production)) {
    check(PROJECT_REF.test(staging.projectRef), "staging projectRef is invalid", errors);
    check(PROJECT_REF.test(production.projectRef), "production projectRef is invalid", errors);
    check(staging.projectRef !== production.projectRef, "staging and production project refs must differ", errors);
    check(staging.dataPolicy === "synthetic-only", "staging data policy must be synthetic-only", errors);
    check(staging.status === "ACTIVE_HEALTHY", "staging project must be healthy", errors);
    check(production.status === "ACTIVE_HEALTHY", "production guard project must be healthy", errors);
    check(SHA256.test(staging.runtimeConfiguration?.publishableKeySha256), "runtime publishable-key fingerprint is invalid", errors);
    check(staging.runtimeConfiguration?.secretValueRetained === false, "runtime configuration must not retain a key value", errors);
    for (const key of ["edgeFunctionCount", "applicationEdgeFunctionCount", "diagnosticEdgeFunctionCount"]) {
      check(Number.isInteger(staging[key]) && staging[key] >= 0, `staging.${key} is invalid`, errors);
    }
    check(
      staging.edgeFunctionCount === staging.applicationEdgeFunctionCount + staging.diagnosticEdgeFunctionCount,
      "staging Edge Function inventory totals are inconsistent",
      errors,
    );
    const deployedApplicationEdgeNames = sortedUniqueStrings(
      staging.applicationEdgeFunctions,
      "staging.applicationEdgeFunctions",
      errors,
    );
    check(
      deployedApplicationEdgeNames.length === staging.applicationEdgeFunctionCount,
      "staging application Edge Function count does not match its inventory",
      errors,
    );
    check(Array.isArray(staging.diagnosticEdgeFunctions), "staging diagnostic Edge Function evidence is required", errors);
    check(
      Array.isArray(staging.diagnosticEdgeFunctions) &&
        staging.diagnosticEdgeFunctions.length === staging.diagnosticEdgeFunctionCount,
      "staging diagnostic Edge Function count does not match its inventory",
      errors,
    );
    check(object(staging.frontendDeployment), "staging frontend deployment evidence is required", errors);
    if (object(staging.frontendDeployment)) {
      check(["not-deployed", "deployed"].includes(staging.frontendDeployment.status), "frontend deployment status is invalid", errors);
      check(staging.frontendDeployment.sourceFilesMutated === false, "frontend deployment must not mutate immutable source files", errors);
    }
  }
  check(evidence.environment?.distinctness?.result === "pass", "environment distinctness must pass", errors);

  const canonical = evidence.migrations?.canonicalRepositoryIdentity;
  const ledger = evidence.migrations?.stagingLedger;
  validateMigrationIdentity(canonical, "canonical migration identity", errors);
  validateMigrationIdentity(ledger, "staging migration identity", errors);
  let ledgerMatchesCanonical = false;
  if (object(canonical) && object(ledger)) {
    check(ledger.distinctVersionCount === ledger.count, "staging migration versions are not unique", errors);
    check(ledger.blankVersionCount === 0 && ledger.blankNameCount === 0, "staging migration ledger contains blanks", errors);
    ledgerMatchesCanonical = sameMigrationIdentity(ledger, canonical);
    check(
      ledger.matchesCanonicalRepository === ledgerMatchesCanonical,
      "staging/canonical migration binding marker is inaccurate",
      errors,
    );
    const expectedDrift = ledger.count - canonical.count;
    check(ledger.aheadBy === expectedDrift, "staging migration aheadBy marker is inaccurate", errors);
    check(Array.isArray(ledger.additionalVersions), "staging additional-version evidence is required", errors);
    if (Array.isArray(ledger.additionalVersions)) {
      check(ledger.additionalVersions.length === Math.max(expectedDrift, 0), "staging additional-version count is inaccurate", errors);
      check(
        ledger.additionalVersions.every((entry) => object(entry) && MIGRATION_VERSION.test(entry.version)),
        "staging additional migration version is invalid",
        errors,
      );
    }
  }
  check(evidence.migrations?.productionModified === false, "production must remain unmodified", errors);

  const release = evidence.immutableRelease;
  check(object(release), "immutable release identity is required", errors);
  let releaseMatchesCanonical = false;
  let ledgerMatchesRelease = false;
  let artifactFacts = { frontendCount: 0, edgeCount: 0, edgeNames: [], frontendArtifact: null };
  if (object(release)) {
    check(COMMIT.test(release.sourceCommit), "release sourceCommit is invalid", errors);
    check(release.sourceMergedIntoMain === true, "release source must be merged into main", errors);
    check(/^\d+$/.test(release.workflowRunId), "release workflowRunId is invalid", errors);
    check(/^\d+$/.test(release.artifactId), "release artifactId is invalid", errors);
    check(SHA256.test(release.githubArtifactSha256), "GitHub artifact digest is invalid", errors);
    check(SHA256.test(release.releaseManifestSha256), "release manifest digest is invalid", errors);
    check(SHA256.test(release.artifactSetSha256), "artifact-set digest is invalid", errors);
    check(release.checksumsVerified === true, "release checksums must be verified", errors);
    check(SHA256.test(release.configuration?.sha256), "release configuration digest is invalid", errors);
    check(release.environmentNeutrality?.status === "pass", "environment-neutrality must pass", errors);
    const requiredNeutralityRoots = ["admin", "auth", "frontend", "index.html", "player-terminal"];
    check(
      requiredNeutralityRoots.every((root) => release.environmentNeutrality?.scannedRoots?.includes(root)),
      "neutrality evidence must cover every browser root",
      errors,
    );

    validateMigrationIdentity(release.migrations, "immutable release migration identity", errors);
    if (object(release.migrations)) {
      releaseMatchesCanonical = sameMigrationIdentity(release.migrations, canonical);
      ledgerMatchesRelease = sameMigrationIdentity(release.migrations, ledger);
      check(release.currentForCanonicalMain === releaseMatchesCanonical, "release current-main marker does not match migration identity", errors);
      check(ledger?.matchesImmutableRelease === ledgerMatchesRelease, "staging/release binding marker is inaccurate", errors);
    }
    artifactFacts = validateArtifacts(release, errors);
    check(
      JSON.stringify(artifactFacts.edgeNames) === JSON.stringify(watchFacts.requiredEdgeNames),
      "immutable release Edge inventory does not match required source inventory",
      errors,
    );
  }

  validatePrivacy(evidence.privacy, errors);

  const dependencyState = evidence.dependencyState;
  check(object(dependencyState), "dependency state is required", errors);
  const gate = evidence.gate;
  check(object(gate), "gate decision is required", errors);
  if (object(gate)) {
    check(gate.productionPromotionAuthorized === false, "production promotion must remain unauthorized", errors);
    check(gate.promotionAwaitingProductOwnerAuthorization === true, "final promotion must await product-owner authorization", errors);
    check(gate.failClosed === true, "gate must fail closed", errors);
    check(Array.isArray(gate.blockers), "gate blockers must be an array", errors);
    if (Array.isArray(gate.blockers) && gate.blockers.length > 0) {
      check(gate.status === "BLOCKED", "a gate with blockers must be BLOCKED", errors);
      check(gate.productionDecision === "NO_GO", "a blocked gate must be NO_GO", errors);
    }
  }

  if (release?.deployedToStaging === true) {
    check(releaseMatchesCanonical, "a deployed candidate must use the canonical current-main migration identity", errors);
    check(ledgerMatchesCanonical, "a deployed candidate requires staging to match canonical current main", errors);
    check(ledgerMatchesRelease, "a deployed candidate must match the staging migration ledger", errors);
    check(
      JSON.stringify(staging?.applicationEdgeFunctions) === JSON.stringify(artifactFacts.edgeNames),
      "a deployed release requires the exact named application Edge Function inventory",
      errors,
    );
    check(typeof staging?.frontendTarget === "string" && staging.frontendTarget.length > 0, "a deployed release requires a frontend target", errors);
    check(staging?.frontendDeployment?.status === "deployed", "a deployed release requires frontend deployment status", errors);
    check(staging?.frontendDeployment?.artifactSha256 === artifactFacts.frontendArtifact?.sha256, "deployed frontend artifact digest mismatch", errors);
    check(staging?.frontendDeployment?.artifactSetSha256 === release.artifactSetSha256, "deployed frontend artifact-set digest mismatch", errors);
    check(SHA256.test(staging?.frontendDeployment?.runtimeConfigurationSha256 ?? ""), "deployed runtime configuration digest is invalid", errors);
    check(staging?.frontendDeployment?.runtimeBindingsValidated === true, "deployed runtime bindings must be validated", errors);
    check(staging?.runtimeConfiguration?.status === "deployed", "runtime configuration must be deployed", errors);
  } else if (object(staging?.frontendDeployment)) {
    check(staging.frontendDeployment.status === "not-deployed", "undeployed release must not claim a frontend deployment", errors);
    check(staging.applicationEdgeFunctionCount === 0, "undeployed release must not claim application Edge Functions", errors);
  }

  if (requireReady) {
    check(evidence.executionState === "CONNECTED_GATE_COMPLETE", "ready gate requires CONNECTED_GATE_COMPLETE execution state", errors);
    check(evidence.integrationWatch?.status === "FINAL_ACCEPTANCE_COMPLETE", "ready gate requires final acceptance watch state", errors);
    check(gate?.status === "READY_FOR_OWNER_GO_NO_GO", "connected execution is not ready for owner go/no-go", errors);
    check(gate?.productionDecision === "GO_PENDING_AUTHORIZATION", "ready gate must be GO_PENDING_AUTHORIZATION", errors);
    check(Array.isArray(gate?.blockers) && gate.blockers.length === 0, "ready gate must have no blockers", errors);
    check(release?.deployedToStaging === true, "ready gate requires exact-artifact staging deployment", errors);
    check(releaseMatchesCanonical, "ready gate requires an immutable release built from the canonical current-main migration set", errors);
    check(ledgerMatchesCanonical, "ready gate requires staging to match the canonical repository migration identity", errors);
    check(ledgerMatchesRelease, "ready gate requires staging to match the immutable release migration identity", errors);
    check(Array.isArray(evidence.integrationWatch?.migrationCollisions) && evidence.integrationWatch.migrationCollisions.length === 0, "ready gate requires zero migration collisions", errors);
    check(Array.isArray(dependencyState?.openCapabilityPullRequests) && dependencyState.openCapabilityPullRequests.length === 0, "ready gate requires all capability dependencies merged", errors);
    for (const key of [
      "stagingEnvironmentProtection",
      "environmentScopedSecrets",
      "frontendStagingTarget",
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
    ]) {
      check(dependencyState?.[key] === "pass", `ready gate requires ${key}=pass`, errors);
    }
  }

  if (errors.length) throw new ProductionIntegrationGateError(errors);
  return evidence;
}

function parseArguments(argv) {
  const options = { requireReady: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--evidence") options.evidencePath = argv[++index];
    else if (argument === "--require-ready") options.requireReady = true;
    else throw new Error(`Unknown argument: ${argument}`);
  }
  if (!options.evidencePath) throw new Error("--evidence is required");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const absolute = path.resolve(options.evidencePath);
  const evidence = JSON.parse(await readFile(absolute, "utf8"));
  validateProductionIntegrationEvidence(evidence, { requireReady: options.requireReady });
  console.log(JSON.stringify({
    status: evidence.gate.status,
    productionDecision: evidence.gate.productionDecision,
    executionState: evidence.executionState,
    releaseId: evidence.immutableRelease.releaseId,
    stagingProjectRef: evidence.environment.staging.projectRef,
    blockerCount: evidence.gate.blockers.length,
  }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
