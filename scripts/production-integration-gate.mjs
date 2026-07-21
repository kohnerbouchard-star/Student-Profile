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
    check(runtimeContract.materializedPath === "runtime-config.env.js", "runtime configuration path is invalid", errors);
    check(runtimeContract.committedMaterializedFileAllowed === false, "materialized runtime configuration must remain uncommitted", errors);
    check(runtimeContract.sourceFilesMutated === false, "deployment must not mutate frontend source", errors);
    for (const field of ["projectRef", "supabaseUrl", "supabasePublishableKey"]) {
      check(runtimeContract.requiredFields?.includes(field), `runtime configuration misses ${field}`, errors);
    }
  }

  const reviews = watch.capabilityReviews;
  check(Array.isArray(reviews) && reviews.length === ACTIVE_CAPABILITY_PULL_REQUESTS.length, "capability review inventory is incomplete", errors);
  if (Array.isArray(reviews)) {
    const numbers = reviews.map((review) => review.number).sort((left, right) => left - right);
    check(JSON.stringify(numbers) === JSON.stringify([m®ιάjΧvη­ΆW§‚Ψ