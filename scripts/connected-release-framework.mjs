import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA40 = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const VERSION = /^\d{14}$/;
const PROJECT_REF = /^[a-z0-9]{20}$/;
const ALLOWED_RESPONSE_FIELDS = new Set([
  "ok",
  "status",
  "evidenceId",
  "projectRef",
  "sourceSha",
  "artifactDigest",
  "replayProtected",
  "cleanupVerified",
]);
const TEMPORARY_URL = /https?:\/\/[^\s"'`]+(?:oaiusercontent\.com|[?&](?:se|sig|token|x-amz-[^=]+)=)/i;
const FORBIDDEN_RESPONSE_FIELD = /(uuid|userId|staffUserId|gameSessionId|playerId|token|secret|credential|signedUrl|artifactUrl)/i;
const DISPOSITION_TYPES = new Set([
  "historical-staging-alias",
  "unmerged-feature-migration",
  "staging-deployment-marker",
  "staging-only-forward-patch",
]);

export class ConnectedReleaseFrameworkError extends Error {
  constructor(errors) {
    super(`Connected release framework validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "ConnectedReleaseFrameworkError";
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function check(condition, message, errors) {
  if (!condition) errors.push(message);
}

function exactSortedStrings(value, label, errors, pattern = null) {
  check(Array.isArray(value), `${label} must be an array`, errors);
  if (!Array.isArray(value)) return [];
  check(value.every((entry) => typeof entry === "string" && entry), `${label} must contain non-empty strings`, errors);
  if (pattern) check(value.every((entry) => pattern.test(entry)), `${label} contains an invalid value`, errors);
  const normalized = [...new Set(value)].sort();
  check(normalized.length === value.length, `${label} must not contain duplicates`, errors);
  check(JSON.stringify(normalized) === JSON.stringify(value), `${label} must be sorted`, errors);
  return normalized;
}

export function versionSetSha256(versions) {
  return createHash("sha256").update(`${versions.join("\n")}\n`).digest("hex");
}

export async function readCanonicalMigrationVersions(repositoryRoot = ".") {
  const migrationRoot = path.join(repositoryRoot, "backend", "supabase", "migrations");
  const filenames = await readdir(migrationRoot);
  const versions = filenames
    .map((filename) => filename.match(/^(\d{14})_[A-Za-z0-9_]+[.]sql$/)?.[1] ?? null)
    .filter(Boolean)
    .sort();
  const unique = [...new Set(versions)];
  if (unique.length !== versions.length) {
    throw new ConnectedReleaseFrameworkError(["canonical migration filenames contain duplicate versions"]);
  }
  if (unique.length === 0) {
    throw new ConnectedReleaseFrameworkError(["canonical migration inventory is empty"]);
  }
  return unique;
}

export function validateAcceptancePolicy(policy) {
  const errors = [];
  check(isObject(policy), "acceptance policy is required", errors);
  if (!isObject(policy)) throw new ConnectedReleaseFrameworkError(errors);

  check(policy.schemaVersion === 1, "acceptance policy schemaVersion must be 1", errors);
  check(policy.contractType === "secure-connected-acceptance", "acceptance policy contractType is invalid", errors);
  check(policy.platformJwtVerificationRequired === true, "platform JWT verification must be required", errors);
  check(policy.serverSideGetUserRequired === true, "server-side auth.getUser validation must be required", errors);
  check(policy.authorizationMetadataSource === "app_metadata", "authorization must use app_metadata", errors);
  check(policy.userMetadataAuthorizationAllowed === false, "user_metadata authorization must be prohibited", errors);
  check(policy.requiredOperatorRole === "staging_acceptance_operator", "staging operator role is invalid", errors);
  check(
    JSON.stringify(policy.allowedReplayProtectionModes) === JSON.stringify(["one-time-authorization", "signed-request"]),
    "replay protection modes are invalid",
    errors,
  );
  check(policy.exactProjectRefBindingRequired === true, "exact project-ref binding must be required", errors);
  check(policy.exactSourceShaBindingRequired === true, "exact source-SHA binding must be required", errors);
  check(policy.exactArtifactDigestBindingRequired === true, "exact artifact digest binding must be required", errors);
  check(JSON.stringify(policy.allowedMethods) === JSON.stringify(["POST"]), "only POST may be allowed", errors);
  check(
    Number.isInteger(policy.maximumPayloadBytes) && policy.maximumPayloadBytes > 0 && policy.maximumPayloadBytes <= 8192,
    "maximum payload bound is invalid",
    errors,
  );
  check(policy.idempotencyRequired === true, "idempotency must be required", errors);
  check(policy.replayDenialRequired === true, "replay denial must be required", errors);
  check(policy.sanitizedResponsesRequired === true, "sanitized responses must be required", errors);
  check(policy.guaranteedCleanupRequired === true, "guaranteed cleanup must be required", errors);
  check(policy.postCleanupZeroResidueRequired === true, "post-cleanup zero-residue verification must be required", errors);
  check(policy.productionProjectDenied === true, "production-project denial must be required", errors);
  check(policy.temporaryArtifactUrlsAllowed === false, "temporary artifact URLs must be prohibited", errors);

  if (errors.length) throw new ConnectedReleaseFrameworkError(errors);
  return policy;
}

export function validateSecureAcceptanceMechanism(mechanism, policy) {
  validateAcceptancePolicy(policy);
  const errors = [];
  check(isObject(mechanism), "acceptance mechanism is required", errors);
  if (!isObject(mechanism)) throw new ConnectedReleaseFrameworkError(errors);

  check(typeof mechanism.id === "string" && mechanism.id, "mechanism id is required", errors);

  const deployment = mechanism.deployment;
  check(isObject(deployment), "deployment metadata is required", errors);
  if (isObject(deployment)) {
    check(deployment.verifyJwt === true, "verify_jwt must be true", errors);
    check(PROJECT_REF.test(deployment.projectRef ?? ""), "staging project ref is invalid", errors);
    check(PROJECT_REF.test(deployment.productionProjectRef ?? ""), "production project ref is invalid", errors);
    check(deployment.projectRef !== deployment.productionProjectRef, "production project ref is prohibited", errors);
    check(deployment.environment === "staging", "acceptance mechanism must be staging-only", errors);
  }

  const identity = mechanism.identity;
  check(isObject(identity), "identity bindings are required", errors);
  if (isObject(identity)) {
    check(SHA40.test(identity.sourceSha ?? ""), "source SHA binding is invalid", errors);
    check(SHA256.test(identity.artifactDigest ?? ""), "artifact digest binding is invalid", errors);
  }

  const request = mechanism.request;
  check(isObject(request), "request contract is required", errors);
  if (isObject(request)) {
    check(JSON.stringify(request.allowedMethods) === JSON.stringify(policy.allowedMethods), "request methods are invalid", errors);
    check(
      Number.isInteger(request.maximumPayloadBytes) && request.maximumPayloadBytes <= policy.maximumPayloadBytes,
      "request payload bound is invalid",
      errors,
    );
    check(
      JSON.stringify(request.allowedContentTypes) === JSON.stringify(["application/json"]),
      "request content type contract is invalid",
      errors,
    );
    check(request.exactProjectRefBinding === true, "exact project-ref binding is missing", errors);
    check(request.exactSourceShaBinding === true, "exact source-SHA binding is missing", errors);
    check(request.exactArtifactDigestBinding === true, "exact artifact digest binding is missing", errors);
    check(request.expectedProjectRef === deployment?.projectRef, "request project-ref binding is stale", errors);
    check(request.expectedSourceSha === identity?.sourceSha, "request source-SHA binding is stale", errors);
    check(request.expectedArtifactDigest === identity?.artifactDigest, "request artifact digest binding is stale", errors);
  }

  const authentication = mechanism.authentication;
  check(isObject(authentication), "caller authentication contract is required", errors);
  if (isObject(authentication)) {
    check(authentication.serverSideGetUser === true, "server-side auth.getUser validation is required", errors);
    check(authentication.metadataSource === "app_metadata", "authorization must use app_metadata", errors);
    check(authentication.userMetadataUsed === false, "user_metadata authorization is prohibited", errors);
    check(authentication.requiredRole === policy.requiredOperatorRole, "staging operator role is invalid", errors);
    check(authentication.stagingOnly === true, "operator authorization must be staging-only", errors);
  }

  const authorization = mechanism.authorization;
  check(isObject(authorization), "authorization contract is required", errors);
  if (isObject(authorization)) {
    check(policy.allowedReplayProtectionModes.includes(authorization.mode), "replay protection mode is invalid", errors);
    check(authorization.atomicClaim === true, "authorization claim must be atomic", errors);
    check(authorization.expiryRequired === true, "authorization expiry is required", errors);
    check(authorization.idempotencyRequired === true, "idempotency is required", errors);
    check(authorization.replayDenied === true, "replay denial is required", errors);
    check(authorization.shaOnlyAuthorization === false, "SHA-only authorization is prohibited", errors);
    check(
      Array.isArray(authorization.factors) &&
        authorization.factors.includes("authenticated-user") &&
        authorization.factors.includes("app-metadata-role") &&
        authorization.factors.some((factor) => ["one-time-authorization", "signed-request"].includes(factor)),
      "authorization factors are incomplete",
      errors,
    );
  }

  const privileged = mechanism.privilegedAccess;
  check(isObject(privileged), "privileged access contract is required", errors);
  if (isObject(privileged) && privileged.usesServiceRole === true) {
    check(privileged.afterCallerAuthorization === true, "service-role access requires caller authorization first", errors);
    check(privileged.scopeBound === true, "service-role access must be scope-bound", errors);
  }

  const response = mechanism.response;
  check(isObject(response), "response contract is required", errors);
  if (isObject(response)) {
    check(response.sanitized === true, "responses must be sanitized", errors);
    check(response.rawIdentifiersAllowed === false, "raw identifiers are prohibited", errors);
    check(response.secretsAllowed === false, "secrets and credentials are prohibited", errors);
    check(Array.isArray(response.fields), "response fields must be an array", errors);
    for (const field of response.fields ?? []) {
      check(ALLOWED_RESPONSE_FIELDS.has(field), `response field is not allowed: ${field}`, errors);
      check(!FORBIDDEN_RESPONSE_FIELD.test(field), `raw identifier response field is prohibited: ${field}`, errors);
    }
  }

  const cleanup = mechanism.cleanup;
  check(isObject(cleanup), "cleanup contract is required", errors);
  if (isObject(cleanup)) {
    check(cleanup.guaranteed === true, "cleanup must be guaranteed", errors);
    check(["finally", "transactional-compensation"].includes(cleanup.strategy), "cleanup strategy is invalid", errors);
    check(cleanup.zeroResidueVerified === true, "post-cleanup zero-residue verification is required", errors);
    const scopes = exactSortedStrings(cleanup.verificationScopes, "cleanup verificationScopes", errors);
    for (const required of ["auth-users", "database-rows", "edge-functions", "sessions", "storage-objects"]) {
      check(scopes.includes(required), `cleanup scope is missing: ${required}`, errors);
    }
  }

  check(mechanism.productionProjectDenied === true, "production project must be denied", errors);
  check(mechanism.temporaryArtifactUrlsAllowed === false, "temporary artifact URLs are prohibited", errors);
  check(typeof mechanism.sourceText === "string", "sourceText is required for static security scanning", errors);
  if (typeof mechanism.sourceText === "string") {
    check(!TEMPORARY_URL.test(mechanism.sourceText), "embedded temporary artifact URL is prohibited", errors);
    check(mechanism.sourceText.includes("auth.getUser"), "source must perform auth.getUser validation", errors);
    check(mechanism.sourceText.includes("app_metadata"), "source must authorize through app_metadata", errors);
    check(!mechanism.sourceText.includes("user_metadata"), "source must not authorize through user_metadata", errors);
  }

  if (errors.length) throw new ConnectedReleaseFrameworkError(errors);
  return mechanism;
}

function validateSerialQueue(serialQueue, errors) {
  check(Array.isArray(serialQueue) && serialQueue.length > 0, "serial queue is required", errors);
  if (!Array.isArray(serialQueue)) return { heads: {}, merged: [], open: [] };
  let openSeen = false;
  const heads = {};
  const merged = [];
  const open = [];
  for (const entry of serialQueue) {
    check(isObject(entry), "serial queue entry must be an object", errors);
    if (!isObject(entry)) continue;
    check(Number.isInteger(entry.number) && entry.number > 0, "serial queue PR number is invalid", errors);
    check(SHA40.test(entry.head ?? ""), `serial PR #${entry.number} head is invalid`, errors);
    check(["MERGED", "OPEN_DRAFT", "OPEN_READY"].includes(entry.status), `serial PR #${entry.number} status is invalid`, errors);
    heads[String(entry.number)] = entry.head;
    if (entry.status === "MERGED") {
      check(!openSeen, "merged serial entries must form a contiguous prefix", errors);
      check(SHA40.test(entry.mergeCommit ?? ""), `serial PR #${entry.number} merge commit is invalid`, errors);
      merged.push(entry.number);
    } else {
      openSeen = true;
      check(entry.mergeCommit === null, `open serial PR #${entry.number} must not claim a merge commit`, errors);
      open.push(entry.number);
    }
  }
  return { heads, merged, open };
}

export function deriveStagingInventory(snapshot, canonicalVersions) {
  const errors = [];
  check(isObject(snapshot), "live inventory snapshot is required", errors);
  if (!isObject(snapshot)) throw new ConnectedReleaseFrameworkError(errors);

  const canonical = exactSortedStrings(canonicalVersions, "canonicalVersions", errors, VERSION);
  const stagingVersions = exactSortedStrings(snapshot.stagingMigrationVersions, "stagingMigrationVersions", errors, VERSION);
  check(SHA40.test(snapshot.mainCommit ?? ""), "current merged-main SHA is invalid", errors);
  check(PROJECT_REF.test(snapshot.stagingProjectRef ?? ""), "staging project ref is invalid", errors);
  check(PROJECT_REF.test(snapshot.productionProjectRef ?? ""), "production project ref is invalid", errors);
  check(snapshot.stagingProjectRef !== snapshot.productionProjectRef, "staging and production project refs must differ", errors);

  const canonicalSet = new Set(canonical);
  const stagingSet = new Set(stagingVersions);
  const missingCanonicalVersions = canonical.filter((version) => !stagingSet.has(version));
  const stagingOnlyVersions = stagingVersions.filter((version) => !canonicalSet.has(version));
  const queue = validateSerialQueue(snapshot.serialQueue, errors);

  check(Array.isArray(snapshot.edgeFunctions), "Edge Function inventory is required", errors);
  const edgeFunctions = Array.isArray(snapshot.edgeFunctions)
    ? [...snapshot.edgeFunctions].sort((a, b) => String(a.slug).localeCompare(String(b.slug)))
    : [];
  for (const fn of edgeFunctions) {
    check(typeof fn.slug === "string" && fn.slug, "Edge Function slug is required", errors);
    check(Number.isInteger(fn.version) && fn.version > 0, `Edge Function ${fn.slug} version is invalid`, errors);
    check(typeof fn.verifyJwt === "boolean", `Edge Function ${fn.slug} verifyJwt is invalid`, errors);
    check(["ACTIVE", "INACTIVE"].includes(fn.status), `Edge Function ${fn.slug} status is invalid`, errors);
    check(SHA256.test(fn.sourceSha256 ?? ""), `Edge Function ${fn.slug} source digest is invalid`, errors);
    check(
      ["final-application", "diagnostic", "feature-acceptance-temporary"].includes(fn.classification),
      `Edge Function ${fn.slug} classification is invalid`,
      errors,
    );
  }

  if (errors.length) throw new ConnectedReleaseFrameworkError(errors);

  return {
    mainCommit: snapshot.mainCommit,
    stagingProjectRef: snapshot.stagingProjectRef,
    productionProjectRef: snapshot.productionProjectRef,
    canonicalMigrationIdentity: {
      count: canonical.length,
      head: canonical.at(-1),
      versionSetSha256: versionSetSha256(canonical),
    },
    stagingMigrationIdentity: {
      count: stagingVersions.length,
      head: stagingVersions.at(-1),
      versionSetSha256: versionSetSha256(stagingVersions),
    },
    missingCanonicalVersions,
    stagingOnlyVersions,
    canonicalCoverageComplete: missingCanonicalVersions.length === 0,
    historiesEqual:
      missingCanonicalVersions.length === 0 &&
      stagingOnlyVersions.length === 0 &&
      versionSetSha256(canonical) === versionSetSha256(stagingVersions),
    edgeFunctions,
    edgeFunctionCount: edgeFunctions.length,
    finalApplicationEdgeFunctions: edgeFunctions
      .filter(({ classification }) => classification === "final-application")
      .map(({ slug }) => slug),
    temporaryAcceptanceEdgeFunctions: edgeFunctions
      .filter(({ classification }) => classification === "feature-acceptance-temporary")
      .map(({ slug }) => slug),
    serialHeads: queue.heads,
    serialMergedPrefix: queue.merged,
    serialOpen: queue.open,
    activeSerialBlocker: queue.open[0] ?? null,
  };
}

export function validateLiveInventorySnapshot(snapshot, canonicalVersions) {
  const derived = deriveStagingInventory(snapshot, canonicalVersions);
  const errors = [];
  const declared = snapshot.declared;
  check(isObject(declared), "declared live evidence values are required", errors);
  if (isObject(declared)) {
    for (const [label, actual, expected] of [
      ["mainCommit", declared.mainCommit, derived.mainCommit],
      ["canonicalMigrationIdentity", declared.canonicalMigrationIdentity, derived.canonicalMigrationIdentity],
      ["stagingMigrationIdentity", declared.stagingMigrationIdentity, derived.stagingMigrationIdentity],
      ["missingCanonicalVersions", declared.missingCanonicalVersions, derived.missingCanonicalVersions],
      ["stagingOnlyVersions", declared.stagingOnlyVersions, derived.stagingOnlyVersions],
      ["edgeFunctions", declared.edgeFunctions, derived.edgeFunctions],
      ["serialHeads", declared.serialHeads, derived.serialHeads],
      ["serialMergedPrefix", declared.serialMergedPrefix, derived.serialMergedPrefix],
      ["serialOpen", declared.serialOpen, derived.serialOpen],
      ["activeSerialBlocker", declared.activeSerialBlocker, derived.activeSerialBlocker],
    ]) {
      check(JSON.stringify(actual) === JSON.stringify(expected), `declared ${label} does not match derived live inventory`, errors);
    }
  }
  check(isObject(snapshot.controllerDecision), "controller decision must be separate from live evidence", errors);
  if (isObject(snapshot.controllerDecision)) {
    check(snapshot.controllerDecision.status === "NO_GO", "controller decision must remain NO_GO", errors);
    check(
      snapshot.controllerDecision.finalReleaseOperationsAuthorized === false,
      "final release operations must remain unauthorized",
      errors,
    );
    check(snapshot.controllerDecision.productionModified === false, "production must remain unmodified", errors);
  }
  if (errors.length) throw new ConnectedReleaseFrameworkError(errors);
  return derived;
}

export function validateForwardOnlyReconciliation(plan, inventory) {
  const errors = [];
  check(isObject(plan), "forward-only reconciliation plan is required", errors);
  if (!isObject(plan)) throw new ConnectedReleaseFrameworkError(errors);
  check(plan.schemaVersion === 1, "reconciliation schemaVersion must be 1", errors);
  check(plan.contractType === "forward-only-staging-reconciliation", "reconciliation contractType is invalid", errors);
  check(plan.stagingProjectRef === inventory.stagingProjectRef, "reconciliation staging project is stale", errors);
  check(plan.productionProjectRef === inventory.productionProjectRef, "reconciliation production project is stale", errors);
  check(plan.productionProjectRef !== plan.stagingProjectRef, "production project ref is prohibited", errors);
  check(plan.appliedHistoryRewriteAllowed === false, "rewriting applied migration history is prohibited", errors);
  check(plan.appliedMigrationDeletionAllowed === false, "deleting applied migration records is prohibited", errors);
  check(plan.canonicalEqualityClaimed === false, "staging must not pretend to equal canonical history", errors);
  check(plan.retroactiveCanonicalInsertionAllowed === false, "retroactive canonical insertion is prohibited", errors);
  check(plan.controllerApprovalRequired === true, "controller approval must be required", errors);
  check(plan.futureCanonicalConvergence?.mode === "forward-only", "future canonical convergence must be forward-only", errors);
  check(
    plan.futureCanonicalConvergence?.preserveAppliedVersions === true,
    "future convergence must preserve applied versions",
    errors,
  );

  const dispositions = Array.isArray(plan.dispositions) ? plan.dispositions : [];
  check(Array.isArray(plan.dispositions), "reconciliation dispositions are required", errors);
  const versions = dispositions.map(({ version }) => version).sort();
  check(new Set(versions).size === versions.length, "reconciliation dispositions must not duplicate versions", errors);
  check(
    JSON.stringify(versions) === JSON.stringify(inventory.stagingOnlyVersions),
    "every staging-only version must have exactly one disposition",
    errors,
  );

  for (const disposition of dispositions) {
    check(VERSION.test(disposition.version ?? ""), "reconciliation disposition version is invalid", errors);
    check(DISPOSITION_TYPES.has(disposition.type), `reconciliation disposition type is invalid: ${disposition.type}`, errors);
    check(disposition.preserveAppliedRecord === true, `applied record must be preserved: ${disposition.version}`, errors);
    check(disposition.deleteAppliedRecord === false, `applied record deletion is prohibited: ${disposition.version}`, errors);
    check(disposition.rewriteVersion === false, `applied version rewrite is prohibited: ${disposition.version}`, errors);
    check(
      disposition.insertIntoHistoricalCanonicalRange === false,
      `retroactive canonical insertion is prohibited: ${disposition.version}`,
      errors,
    );
    check(
      typeof disposition.futureTreatment === "string" && disposition.futureTreatment,
      `future treatment is required: ${disposition.version}`,
      errors,
    );
    if (disposition.type === "unmerged-feature-migration") {
      check(Number.isInteger(disposition.featurePullRequest), `feature PR is required: ${disposition.version}`, errors);
      check(
        disposition.controllerApprovalBeforeCanonicalization === true,
        `controller approval is required before canonicalization: ${disposition.version}`,
        errors,
      );
    }
    if (disposition.type === "staging-only-forward-patch") {
      check(
        disposition.controllerApprovalBeforeCanonicalization === true,
        `controller approval is required for staging-only patch: ${disposition.version}`,
        errors,
      );
    }
  }

  if (errors.length) throw new ConnectedReleaseFrameworkError(errors);
  return plan;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), "utf8"));
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const key = rest[index];
    if (key === "--snapshot") options.snapshot = rest[++index];
    else if (key === "--contract") options.contract = rest[++index];
    else if (key === "--plan") options.plan = rest[++index];
    else if (key === "--repo-root") options.repoRoot = rest[++index];
    else throw new Error(`Unknown argument: ${key}`);
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === "validate-acceptance") {
    const contract = await readJson(options.contract);
    validateAcceptancePolicy(contract.policy);
    validateSecureAcceptanceMechanism(contract.referenceMechanism, contract.policy);
    console.log(JSON.stringify({ contract: contract.contractId, status: "green" }));
    return;
  }
  if (options.command === "validate-live-inventory") {
    const snapshot = await readJson(options.snapshot);
    const canonical = await readCanonicalMigrationVersions(options.repoRoot ?? ".");
    const derived = validateLiveInventorySnapshot(snapshot, canonical);
    console.log(JSON.stringify(derived, null, 2));
    return;
  }
  if (options.command === "validate-reconciliation") {
    const snapshot = await readJson(options.snapshot);
    const canonical = await readCanonicalMigrationVersions(options.repoRoot ?? ".");
    const inventory = validateLiveInventorySnapshot(snapshot, canonical);
    const plan = await readJson(options.plan);
    validateForwardOnlyReconciliation(plan, inventory);
    console.log(JSON.stringify({ plan: plan.planId, status: "green", stagingOnly: inventory.stagingOnlyVersions.length }));
    return;
  }
  throw new Error("command must be validate-acceptance, validate-live-inventory, or validate-reconciliation");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
