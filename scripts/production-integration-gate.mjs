import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256 = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const PROJECT_REF = /^[a-z0-9]{20}$/;
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

function validateArtifacts(release, errors) {
  check(Array.isArray(release.artifacts) && release.artifacts.length >= 2, "immutable release artifacts are required", errors);
  if (!Array.isArray(release.artifacts)) return;
  const files = new Set();
  let frontendCount = 0;
  let edgeCount = 0;
  for (const [index, artifact] of release.artifacts.entries()) {
    check(object(artifact), `artifact ${index} must be an object`, errors);
    if (!object(artifact)) continue;
    check(typeof artifact.file === "string" && artifact.file.startsWith("artifacts/"), `artifact ${index} file is invalid`, errors);
    check(!files.has(artifact.file), `artifact file is duplicated: ${artifact.file}`, errors);
    files.add(artifact.file);
    check(SHA256.test(artifact.sha256), `artifact ${artifact.file} SHA-256 is invalid`, errors);
    check(Number.isInteger(artifact.sizeBytes) && artifact.sizeBytes > 0, `artifact ${artifact.file} size is invalid`, errors);
    if (artifact.kind === "frontend") frontendCount += 1;
    if (artifact.kind === "edge-function") {
      edgeCount += 1;
      check(typeof artifact.name === "string" && artifact.name.length > 0, `edge artifact ${artifact.file} name is required`, errors);
    }
  }
  check(frontendCount === 1, "exactly one frontend artifact is required", errors);
  check(edgeCount > 0, "at least one Edge Function artifact is required", errors);
}

function validatePrivacy(privacy, errors) {
  check(object(privacy), "privacy evidence is required", errors);
  if (!object(privacy)) return;
  for (const [name, value] of Object.entries(privacy)) {
    check(value === false, `privacy.${name} must be false`, errors);
  }
}

function sameMigrationIdentity(left, right) {
  return object(left) && object(right) &&
    left.count === right.count &&
    left.head === right.head &&
    left.versionSetSha256 === right.versionSetSha256;
}

export function validateProductionIntegrationEvidence(evidence, { requireReady = false } = {}) {
  const errors = [];
  check(object(evidence), "evidence must be an object", errors);
  if (!object(evidence)) throw new ProductionIntegrationGateError(errors);

  inspectSensitiveValues(evidence, "evidence", errors);
  check(evidence.schemaVersion === 1, "schemaVersion must be 1", errors);
  check(evidence.evidenceType === "production-integration-preflight", "evidenceType is invalid", errors);
  check(Number.isFinite(Date.parse(evidence.capturedAt)), "capturedAt must be an ISO-8601 timestamp", errors);

  const repository = evidence.repository;
  check(object(repository), "repository identity is required", errors);
  if (object(repository)) {
    check(repository.name === "kohnerbouchard-star/Student-Profile", "repository name is invalid", errors);
    check(COMMIT.test(repository.mainCommitAtAudit), "mainCommitAtAudit must be a full commit SHA", errors);
    check(repository.integrationBranch === "agent/production-integration-gate-v1", "integration branch is invalid", errors);
    check(repository.branchBaseCommit === repository.mainCommitAtAudit, "integration branch must start from audited main", errors);
  }

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
  }
  check(evidence.environment?.distinctness?.result === "pass", "environment distinctness must pass", errors);

  const canonical = evidence.migrations?.canonicalRepositoryIdentity;
  const ledger = evidence.migrations?.stagingLedger;
  check(object(canonical) && object(ledger), "canonical and staging migration identities are required", errors);
  if (object(canonical) && object(ledger)) {
    check(Number.isInteger(canonical.count) && canonical.count > 0, "canonical migration count is invalid", errors);
    check(/^\d{14}$/.test(canonical.head), "canonical migration head is invalid", errors);
    check(SHA256.test(canonical.versionSetSha256), "canonical migration digest is invalid", errors);
    check(ledger.count === canonical.count, "staging migration count does not match canonical count", errors);
    check(ledger.distinctVersionCount === canonical.count, "staging migration versions are not unique", errors);
    check(ledger.head === canonical.head, "staging migration head does not match canonical head", errors);
    check(ledger.blankVersionCount === 0 && ledger.blankNameCount === 0, "staging migration ledger contains blanks", errors);
    check(ledger.matchesCanonicalRepository === true, "staging migration ledger is not bound to the canonical repository", errors);
  }
  check(evidence.migrations?.productionModified === false, "production must remain unmodified", errors);

  const release = evidence.immutableRelease;
  check(object(release), "immutable release identity is required", errors);
  let releaseMatchesCanonical = false;
  let ledgerMatchesRelease = false;
  if (object(release)) {
    check(COMMIT.test(release.sourceCommit), "release sourceCommit is invalid", errors);
    check(release.sourceMergedIntoMain === true, "release source must be merged into main", errors);
    check(/^\d+$/.test(release.workflowRunId), "release workflowRunId is invalid", errors);
    check(/^\d+$/.test(release.artifactId), "release artifactId is invalid", errors);
    check(SHA256.test(release.githubArtifactSha256), "GitHub artifact digest is invalid", errors);
    check(SHA256.test(release.releaseManifestSha256), "release manifest digest is invalid", errors);
    check(SHA256.test(release.artifactSetSha256), "artifact-set digest is invalid", errors);
    check(release.checksumsVerified === true, "release checksums must be verified", errors);
    check(release.configuration?.sha256 && SHA256.test(release.configuration.sha256), "release configuration digest is invalid", errors);
    check(release.environmentNeutrality?.status === "pass", "environment-neutrality must pass", errors);
    const requiredRoots = ["admin", "auth", "frontend", "index.html", "player-terminal"];
    check(requiredRoots.every((root) => release.environmentNeutrality?.scannedRoots?.includes(root)), "neutrality evidence must cover every browser root", errors);

    check(object(release.migrations), "immutable release migration identity is required", errors);
    if (object(release.migrations)) {
      check(Number.isInteger(release.migrations.count) && release.migrations.count > 0, "release migration count is invalid", errors);
      check(/^\d{14}$/.test(release.migrations.head), "release migration head is invalid", errors);
      check(SHA256.test(release.migrations.versionSetSha256), "release migration digest is invalid", errors);
      releaseMatchesCanonical = sameMigrationIdentity(release.migrations, canonical);
      ledgerMatchesRelease =
        release.migrations.count === ledger?.count &&
        release.migrations.head === ledger?.head;
      check(release.currentForCanonicalMain === releaseMatchesCanonical, "release current-main marker does not match migration identity", errors);
      check(ledger?.matchesImmutableRelease === ledgerMatchesRelease, "staging/release binding marker is inaccurate", errors);
    }

    validateArtifacts(release, errors);
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
    check(ledgerMatchesRelease, "a deployed candidate must match the staging migration ledger", errors);
    check(staging?.edgeFunctionCount > 0, "a deployed release requires staging Edge Functions", errors);
    check(typeof staging?.frontendTarget === "string" && staging.frontendTarget.length > 0, "a deployed release requires a frontend target", errors);
  }

  if (requireReady) {
    check(gate?.status === "READY_FOR_OWNER_GO_NO_GO", "connected execution is not ready for owner go/no-go", errors);
    check(gate?.productionDecision === "GO_PENDING_AUTHORIZATION", "ready gate must be GO_PENDING_AUTHORIZATION", errors);
    check(Array.isArray(gate?.blockers) && gate.blockers.length === 0, "ready gate must have no blockers", errors);
    check(release?.deployedToStaging === true, "ready gate requires exact-artifact staging deployment", errors);
    check(releaseMatchesCanonical, "ready gate requires an immutable release built from the canonical current-main migration set", errors);
    check(ledgerMatchesRelease, "ready gate requires staging to match the immutable release migration identity", errors);
    check(Array.isArray(dependencyState?.openCapabilityPullRequests) && dependencyState.openCapabilityPullRequests.length === 0, "ready gate requires all capability dependencies merged", errors);
    for (const key of [
      "encryptedBackupRestoreRehearsal",
      "operationalDashboardsAndAlerts",
      "boundedLoad",
      "connectedAdminSmoke",
      "connectedPlayerDesktopSmoke",
      "connectedPlayerMobileSmoke",
      "continuousScenarioRun",
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
