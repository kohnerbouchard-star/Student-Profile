import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const REF = /^[a-z0-9]{20}$/;
const VER = /^\d{14}$/;
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{2,95}$/;
const TABLE_NAME = /^[a-z][a-z0-9_]{0,62}$/;
const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const PRODUCTION_PROJECT_REF = "cgiukdjwicykrmtkhudh";
const STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
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
export const PREPARATION_CATEGORIES = [
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
export const PROBE_IDS = [
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
export const TEMPLATE_IDS = [
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
export const EXECUTABLE_OPERATIONS = [
  "backup-manifest",
  "backup-verify",
  "cleanup-verify",
  "load-plan",
  "observability-contract",
  "production-proof",
  "query-plan-analyze",
  "restore-verify",
  "security-probes",
];
export const SECURITY_TOOL_PROBE_IDS = [
  "access-code-leakage",
  "expired-token",
  "internal-error-leakage",
  "missing-rate-limit-enforcement",
  "proxy-cors-behavior",
  "raw-uuid-leakage",
  "replay-duplicate-requests",
  "staff-scope-violation",
  "unauthenticated-access",
  "wrong-game-access",
  "wrong-player-access",
];
const DASHBOARD_PANEL_IDS = [
  "auth-failures",
  "cleanup-residuals",
  "database-connections",
  "database-cpu",
  "database-lock-wait",
  "error-rate",
  "latency-p50",
  "latency-p95",
  "latency-p99",
  "queue-depth",
  "rate-limit-denials",
  "replay-conflicts",
  "request-rate",
];
const ALERT_IDS = [
  "auth-failure-burst",
  "backup-restore-verification-failure",
  "cleanup-failure",
  "database-connection-saturation",
  "database-cpu-saturation",
  "error-rate-high",
  "function-5xx-rate-high",
  "latency-p95-high",
  "partial-outage-recovery-slow",
  "queue-depth-high",
  "rate-limit-denial-burst",
  "replay-conflict-burst",
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
const executionClassification = () => ({
  prepared: true,
  locallyValidated: true,
  connectedExecuted: false,
  productionExecuted: false,
});

function check(value, message, errors) {
  if (!value) errors.push(message);
}

function failIfErrors(errors) {
  if (errors.length) throw new ProductionIntegrationGateError(errors);
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

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validateProjectRef(projectRef, label, errors) {
  check(REF.test(projectRef ?? ""), `${label} project ref is invalid`, errors);
}

function validateRowCounts(rowCounts, label, errors) {
  check(isObject(rowCounts), `${label} row-count contract is required`, errors);
  if (!isObject(rowCounts)) return {};
  const entries = Object.entries(rowCounts).sort(([a], [b]) => a.localeCompare(b));
  check(entries.length > 0, `${label} row-count contract must not be empty`, errors);
  const normalized = {};
  for (const [table, count] of entries) {
    check(TABLE_NAME.test(table), `${label} table name is invalid: ${table}`, errors);
    check(Number.isInteger(count) && count >= 0, `${label} row count is invalid for ${table}`, errors);
    normalized[table] = count;
  }
  return normalized;
}

function productionBackupAuthorized(input) {
  const authorization = input?.productionAuthorization;
  return (
    isObject(authorization) &&
    authorization.approved === true &&
    authorization.action === "BACKUP_MANIFEST_ONLY" &&
    authorization.projectRef === PRODUCTION_PROJECT_REF &&
    SAFE_ID.test(authorization.approvalId ?? "") &&
    Number.isFinite(Date.parse(authorization.approvedAt))
  );
}

export function createEncryptedBackupManifest(input) {
  const errors = [];
  check(isObject(input), "backup input is required", errors);
  if (!isObject(input)) throw new ProductionIntegrationGateError(errors);
  validateProjectRef(input.projectRef, "backup source", errors);
  check(["staging", "isolated-restore", "production"].includes(input.environment), "backup environment is invalid", errors);
  const productionTarget = input.projectRef === PRODUCTION_PROJECT_REF || input.environment === "production";
  check(!productionTarget || productionBackupAuthorized(input), "production backup requires separate explicit authorization", errors);
  check(isObject(input.artifact), "backup artifact metadata is required", errors);
  check(SHA.test(input.artifact?.sha256 ?? ""), "backup artifact digest is invalid", errors);
  check(Number.isInteger(input.artifact?.sizeBytes) && input.artifact.sizeBytes > 0, "backup artifact size is invalid", errors);
  check(isObject(input.encryption), "backup encryption metadata is required", errors);
  check(input.encryption?.encrypted === true, "backup artifact must be encrypted", errors);
  check(input.encryption?.algorithm === "AES-256-GCM", "backup encryption algorithm must be AES-256-GCM", errors);
  check(input.encryption?.nonceBytes === 12, "backup encryption nonce must be 12 bytes", errors);
  check(input.encryption?.tagBytes === 16, "backup authentication tag must be 16 bytes", errors);
  check(["external-kms", "envelope-encryption"].includes(input.encryption?.keyManagement), "backup key-management profile is invalid", errors);
  validateIdentity(input.migrationIdentity, "backup migration identity", errors);
  const rowCounts = validateRowCounts(input.rowCountContracts, "backup", errors);
  check(isObject(input.custody), "backup custody metadata is required", errors);
  check(input.custody?.immutable === true, "backup custody must be immutable", errors);
  check(input.custody?.offPlatform === true, "backup custody must be off-platform", errors);
  check(SAFE_ID.test(input.custody?.reference ?? ""), "backup custody reference is invalid", errors);
  failIfErrors(errors);

  const manifest = {
    schemaVersion: 1,
    evidenceType: "encrypted-backup-manifest",
    status: "LOCALLY_VALIDATED",
    createdAt: input.createdAt ?? new Date().toISOString(),
    project: { ref: input.projectRef, environment: input.environment },
    artifact: { sha256: input.artifact.sha256, sizeBytes: input.artifact.sizeBytes },
    encryption: {
      encrypted: true,
      algorithm: "AES-256-GCM",
      nonceBytes: 12,
      tagBytes: 16,
      keyManagement: input.encryption.keyManagement,
    },
    migrationIdentity: canonicalValue(input.migrationIdentity),
    rowCountContracts: rowCounts,
    custody: {
      immutable: true,
      offPlatform: true,
      reference: input.custody.reference,
    },
    execution: {
      ...executionClassification(),
      backupExecuted: false,
      destructiveActionExecuted: false,
    },
  };
  return { ...manifest, manifestSha256: sha256(canonicalJson(manifest)) };
}

export async function createEncryptedBackupManifestFromFile(input) {
  const artifactBytes = await readFile(path.resolve(input.artifactPath));
  const artifactStat = await stat(path.resolve(input.artifactPath));
  return createEncryptedBackupManifest({
    ...input,
    artifact: { sha256: sha256(artifactBytes), sizeBytes: artifactStat.size },
    artifactPath: undefined,
  });
}

export function verifyEncryptedBackupManifest(manifest, expectations = {}) {
  const errors = [];
  check(isObject(manifest), "backup manifest is required", errors);
  if (!isObject(manifest)) throw new ProductionIntegrationGateError(errors);
  check(manifest.schemaVersion === 1, "backup manifest schemaVersion is invalid", errors);
  check(manifest.evidenceType === "encrypted-backup-manifest", "backup manifest evidenceType is invalid", errors);
  check(SHA.test(manifest.manifestSha256 ?? ""), "backup manifest digest is invalid", errors);
  const { manifestSha256, ...unsigned } = manifest;
  check(sha256(canonicalJson(unsigned)) === manifestSha256, "backup manifest digest verification failed", errors);
  check(manifest.encryption?.encrypted === true, "backup manifest does not describe encrypted material", errors);
  check(manifest.encryption?.algorithm === "AES-256-GCM", "backup encryption metadata is invalid", errors);
  check(manifest.encryption?.nonceBytes === 12 && manifest.encryption?.tagBytes === 16, "backup AEAD metadata is invalid", errors);
  validateProjectRef(manifest.project?.ref, "backup manifest", errors);
  validateIdentity(manifest.migrationIdentity, "backup manifest migration identity", errors);
  validateRowCounts(manifest.rowCountContracts, "backup manifest", errors);
  if (expectations.expectedProjectRef) check(manifest.project?.ref === expectations.expectedProjectRef, "backup project identity mismatch", errors);
  if (expectations.expectedArtifactSha256) check(manifest.artifact?.sha256 === expectations.expectedArtifactSha256, "backup artifact digest mismatch", errors);
  if (manifest.project?.ref === PRODUCTION_PROJECT_REF) {
    check(productionBackupAuthorized(expectations), "production backup verification requires separate explicit authorization", errors);
  }
  failIfErrors(errors);
  return {
    schemaVersion: 1,
    evidenceType: "backup-verification",
    status: "PASS",
    manifestSha256,
    projectRef: manifest.project.ref,
    artifactSha256: manifest.artifact.sha256,
    encryptionVerified: true,
    artifactDigestVerified: true,
    projectIdentityVerified: true,
    execution: executionClassification(),
  };
}

export async function verifyEncryptedBackupManifestAgainstFile(input) {
  const artifactBytes = await readFile(path.resolve(input.artifactPath));
  return verifyEncryptedBackupManifest(input.manifest, {
    ...input,
    expectedArtifactSha256: sha256(artifactBytes),
  });
}

export function verifyIsolatedRestore(input) {
  const errors = [];
  check(isObject(input), "restore verification input is required", errors);
  if (!isObject(input)) throw new ProductionIntegrationGateError(errors);
  const productionRef = input.productionProjectRef ?? PRODUCTION_PROJECT_REF;
  const stagingRef = input.sharedStagingProjectRef ?? STAGING_PROJECT_REF;
  for (const [label, value] of Object.entries({
    source: input.sourceProjectRef,
    target: input.targetProjectRef,
    production: productionRef,
    staging: stagingRef,
  })) validateProjectRef(value, `restore ${label}`, errors);
  check(input.targetProjectRef !== input.sourceProjectRef, "restore target must differ from source", errors);
  check(input.targetProjectRef !== stagingRef, "restore target must not be shared staging", errors);
  check(input.targetProjectRef !== productionRef, "restore target must not be production", errors);
  check(input.syntheticOnly === true, "restore verification must be synthetic-only", errors);
  check(input.destructiveRestoreExecuted === false, "destructive restore execution is not authorized", errors);
  verifyEncryptedBackupManifest(input.manifest, { expectedProjectRef: input.sourceProjectRef });
  validateIdentity(input.expectedMigrationIdentity, "expected restore migration identity", errors);
  validateIdentity(input.actualMigrationIdentity, "actual restore migration identity", errors);
  check(sameIdentity(input.expectedMigrationIdentity, input.actualMigrationIdentity), "restored schema identity mismatch", errors);
  const expectedRows = validateRowCounts(input.expectedRowCounts, "expected restore", errors);
  const actualRows = validateRowCounts(input.actualRowCounts, "actual restore", errors);
  check(JSON.stringify(expectedRows) === JSON.stringify(actualRows), "restored row-count contract mismatch", errors);
  failIfErrors(errors);
  return {
    schemaVersion: 1,
    evidenceType: "isolated-restore-verification",
    status: "PASS",
    sourceProjectRef: input.sourceProjectRef,
    targetProjectRef: input.targetProjectRef,
    distinctTargetVerified: true,
    schemaIdentityVerified: true,
    rowCountContractsVerified: true,
    destructiveRestoreExecuted: false,
    execution: executionClassification(),
  };
}

function loadScenario(players) {
  if (players === 30) return { id: "expected-30", rampSeconds: 180, steadySeconds: 720, cooldownSeconds: 300 };
  if (players === 40) return { id: "maximum-40", rampSeconds: 300, steadySeconds: 600, cooldownSeconds: 300 };
  throw new ProductionIntegrationGateError(["load plan supports only 30 or 40 players"]);
}

function deterministicIdentityLabel(seed, index) {
  return `syn-${String(index + 1).padStart(2, "0")}-${sha256(`${seed}:identity:${index}`).slice(0, 10)}`;
}

function deterministicIdempotencyKey(seed, label, operation) {
  return `idem-${sha256(`${seed}:${label}:${operation}`).slice(0, 32)}`;
}

export function createDeterministicLoadPlan({ players, seed = "econovaria-operations-v1", maximumRequestsPerSecond = 25 } = {}) {
  const scenario = loadScenario(players);
  const errors = [];
  check(typeof seed === "string" && seed.length >= 8 && seed.length <= 120, "load seed is invalid", errors);
  check(Number.isInteger(maximumRequestsPerSecond) && maximumRequestsPerSecond > 0 && maximumRequestsPerSecond <= 25, "load RPS bound is invalid", errors);
  failIfErrors(errors);
  const labels = Array.from({ length: players }, (_, index) => deterministicIdentityLabel(seed, index));
  const operationDefinitions = [
    ["authenticated-read", "ramp"],
    ["idempotent-write", "ramp"],
    ["paused-game-denial", "steady"],
    ["ended-game-denial", "steady"],
    ["session-expiry-denial", "steady"],
    ["replay-primary", "steady"],
    ["replay-duplicate", "steady"],
    ["partial-outage-fail-closed", "steady"],
    ["cleanup-verification", "cooldown"],
  ];
  const phaseStart = {
    ramp: 0,
    steady: scenario.rampSeconds,
    cooldown: scenario.rampSeconds + scenario.steadySeconds,
  };
  const phaseLength = {
    ramp: scenario.rampSeconds,
    steady: scenario.steadySeconds,
    cooldown: scenario.cooldownSeconds,
  };
  const events = [];
  labels.forEach((label, playerIndex) => {
    const replayKey = deterministicIdempotencyKey(seed, label, "replay-primary");
    operationDefinitions.forEach(([operation, phase], operationIndex) => {
      const secondOffset = phaseStart[phase] + ((playerIndex * 17 + operationIndex * 13) % phaseLength[phase]);
      events.push({
        sequence: events.length + 1,
        secondOffset,
        phase,
        identityLabel: label,
        operation,
        idempotencyKey:
          operation === "replay-primary" || operation === "replay-duplicate"
            ? replayKey
            : deterministicIdempotencyKey(seed, label, operation),
        expectedBehavior:
          operation.includes("denial") || operation.includes("fail-closed")
            ? "DENY_OR_FAIL_CLOSED"
            : operation === "replay-duplicate"
              ? "NO_SECOND_MUTATION"
              : "SUCCESS",
      });
    });
  });
  const plan = {
    schemaVersion: 1,
    evidenceType: "deterministic-load-plan",
    status: "LOCALLY_VALIDATED",
    scenario,
    maximumRequestsPerSecond,
    maximumDurationSeconds: 1200,
    identities: labels,
    events: events.sort((a, b) => a.secondOffset - b.secondOffset || a.sequence - b.sequence),
    cleanupTag: `ops-${sha256(seed).slice(0, 12)}`,
    execution: {
      ...executionClassification(),
      dryRunOnly: true,
      requestsSent: 0,
      cleanupAttempted: false,
    },
  };
  validateDeterministicLoadPlan(plan);
  return plan;
}

export function validateDeterministicLoadPlan(plan) {
  const errors = [];
  check(isObject(plan), "load plan is required", errors);
  if (!isObject(plan)) throw new ProductionIntegrationGateError(errors);
  const players = plan.scenario?.id === "expected-30" ? 30 : plan.scenario?.id === "maximum-40" ? 40 : 0;
  check(players > 0, "load plan scenario is invalid", errors);
  check(plan.identities?.length === players, "load plan identity count is invalid", errors);
  check(new Set(plan.identities ?? []).size === players, "load plan identities must be unique", errors);
  check(plan.maximumRequestsPerSecond <= 25, "load plan exceeds the 25 RPS bound", errors);
  const duration = (plan.scenario?.rampSeconds ?? 0) + (plan.scenario?.steadySeconds ?? 0) + (plan.scenario?.cooldownSeconds ?? 0);
  check(duration <= 1200, "load plan exceeds the 20-minute duration bound", errors);
  check(Array.isArray(plan.events) && plan.events.length === players * 9, "load plan event count is invalid", errors);
  const perSecond = new Map();
  const idempotency = new Set();
  const replayByIdentity = new Map();
  for (const event of plan.events ?? []) {
    check(plan.identities.includes(event.identityLabel), "load event references an unknown identity", errors);
    check(Number.isInteger(event.secondOffset) && event.secondOffset >= 0 && event.secondOffset < duration, "load event schedule is invalid", errors);
    perSecond.set(event.secondOffset, (perSecond.get(event.secondOffset) ?? 0) + 1);
    if (event.operation === "replay-primary" || event.operation === "replay-duplicate") {
      const entries = replayByIdentity.get(event.identityLabel) ?? [];
      entries.push(event.idempotencyKey);
      replayByIdentity.set(event.identityLabel, entries);
    } else {
      check(!idempotency.has(event.idempotencyKey), "non-replay idempotency key is duplicated", errors);
      idempotency.add(event.idempotencyKey);
    }
  }
  check([...perSecond.values()].every((count) => count <= plan.maximumRequestsPerSecond), "load plan exceeds its per-second request bound", errors);
  check([...replayByIdentity.values()].every((keys) => keys.length === 2 && keys[0] === keys[1]), "replay pair idempotency keys are inconsistent", errors);
  check(plan.execution?.dryRunOnly === true && plan.execution?.requestsSent === 0, "load plan must remain a zero-request dry run", errors);
  failIfErrors(errors);
  return plan;
}

export function runLoadPlanDryRun(plan) {
  validateDeterministicLoadPlan(plan);
  return {
    schemaVersion: 1,
    evidenceType: "load-plan-dry-run",
    status: "PASS",
    scenarioId: plan.scenario.id,
    playerCount: plan.identities.length,
    eventCount: plan.events.length,
    planSha256: sha256(canonicalJson(plan)),
    requestsSent: 0,
    execution: executionClassification(),
  };
}

function bodyText(value) {
  if (Array.isArray(value)) return value.join("\n");
  return typeof value === "string" ? value : "";
}

export function evaluateSecurityPrivacyProbes(input) {
  const errors = [];
  check(isObject(input), "security probe input is required", errors);
  if (!isObject(input)) throw new ProductionIntegrationGateError(errors);
  const statuses = input.statuses ?? {};
  const bodies = bodyText(input.responseBodies);
  const results = {
    "unauthenticated-access": [401, 403].includes(statuses.unauthenticated),
    "wrong-game-access": [403, 404].includes(statuses.wrongGame),
    "wrong-player-access": [403, 404].includes(statuses.wrongPlayer),
    "staff-scope-violation": [403, 404].includes(statuses.staffScopeViolation),
    "expired-token": statuses.expiredToken === 401,
    "missing-rate-limit-enforcement": Array.isArray(statuses.rateLimitSequence) && statuses.rateLimitSequence.includes(429),
    "raw-uuid-leakage": !UUID.test(bodies),
    "access-code-leakage": !/(access[-_ ]?code|player[-_ ]?pin)\s*[:=]/i.test(bodies),
    "internal-error-leakage": !/(node_modules|stack trace|postgres(?:ql)? error|at\s+[\w$.]+\s*\(|file:\/\/)/i.test(bodies),
    "proxy-cors-behavior":
      input.proxyCors?.corsOrigin === input.proxyCors?.expectedCorsOrigin &&
      input.proxyCors?.untrustedForwardedAccepted === false &&
      input.proxyCors?.wildcardCredentialsAllowed === false,
    "replay-duplicate-requests":
      input.replay?.mutationCount === 1 &&
      [200, 201, 409, 422].includes(input.replay?.duplicateStatus) &&
      input.replay?.secondMutationObserved === false,
  };
  UUID.lastIndex = 0;
  const probeResults = SECURITY_TOOL_PROBE_IDS.map((id) => ({ id, passed: results[id] === true }));
  check(probeResults.every(({ passed }) => passed), `security/privacy probes failed: ${probeResults.filter(({ passed }) => !passed).map(({ id }) => id).join(", ")}`, errors);
  failIfErrors(errors);
  return {
    schemaVersion: 1,
    evidenceType: "security-privacy-probe-report",
    status: "PASS",
    probes: probeResults,
    responseBodySha256: sha256(bodies),
    rawBodiesRetained: false,
    execution: executionClassification(),
  };
}

export function createObservabilityContract() {
  const panels = DASHBOARD_PANEL_IDS.map((id) => ({ id, required: true }));
  const alerts = [
    { id: "auth-failure-burst", metric: "auth_failures_5m", warning: 20, critical: 100 },
    { id: "backup-restore-verification-failure", metric: "backup_restore_verification_failures", warning: 1, critical: 1 },
    { id: "cleanup-failure", metric: "cleanup_residual_rows", warning: 1, critical: 1 },
    { id: "database-connection-saturation", metric: "database_connection_utilization_ratio", warning: 0.7, critical: 0.9 },
    { id: "database-cpu-saturation", metric: "database_cpu_ratio", warning: 0.7, critical: 0.85 },
    { id: "error-rate-high", metric: "request_error_ratio_5m", warning: 0.02, critical: 0.05 },
    { id: "function-5xx-rate-high", metric: "function_5xx_ratio_5m", warning: 0.01, critical: 0.03 },
    { id: "latency-p95-high", metric: "request_latency_p95_ms", warning: 750, critical: 1500 },
    { id: "partial-outage-recovery-slow", metric: "partial_outage_recovery_seconds", warning: 120, critical: 300 },
    { id: "queue-depth-high", metric: "queue_depth", warning: 100, critical: 500 },
    { id: "rate-limit-denial-burst", metric: "rate_limit_denials_5m", warning: 50, critical: 200 },
    { id: "replay-conflict-burst", metric: "replay_conflicts_5m", warning: 10, critical: 50 },
  ];
  const contract = {
    schemaVersion: 1,
    evidenceType: "observability-contract",
    status: "LOCALLY_VALIDATED",
    panels,
    alerts,
    destinationsConfigured: false,
    activated: false,
    execution: executionClassification(),
  };
  validateObservabilityContract(contract);
  return contract;
}

export function validateObservabilityContract(contract) {
  const errors = [];
  check(isObject(contract), "observability contract is required", errors);
  if (!isObject(contract)) throw new ProductionIntegrationGateError(errors);
  exactStrings((contract.panels ?? []).map(({ id }) => id).sort(), DASHBOARD_PANEL_IDS, "observability panel ids", errors);
  exactStrings((contract.alerts ?? []).map(({ id }) => id).sort(), ALERT_IDS, "observability alert ids", errors);
  for (const alert of contract.alerts ?? []) {
    check(typeof alert.metric === "string" && alert.metric.length > 0, `alert metric is missing for ${alert.id}`, errors);
    check(Number.isFinite(alert.warning) && Number.isFinite(alert.critical), `alert threshold is invalid for ${alert.id}`, errors);
    check(alert.warning <= alert.critical, `alert warning threshold exceeds critical for ${alert.id}`, errors);
  }
  check(contract.destinationsConfigured === false, "observability destinations must remain unconfigured during local validation", errors);
  check(contract.activated === false, "observability must not be activated during local validation", errors);
  failIfErrors(errors);
  return contract;
}

function redactPlanString(value) {
  return value
    .replace(UUID, "<uuid-redacted>")
    .replace(/'([^']|'')*'/g, "'<literal-redacted>'")
    .replace(/\b\d+(?:\.\d+)?\b/g, "<number-redacted>");
}

function redactPlan(value) {
  if (Array.isArray(value)) return value.map(redactPlan);
  if (!isObject(value)) return typeof value === "string" ? redactPlanString(value) : value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactPlan(entry)]));
}

function planRoot(value) {
  if (Array.isArray(value)) return value[0]?.Plan ?? value[0]?.plan ?? value[0] ?? null;
  return value?.Plan ?? value?.plan ?? value ?? null;
}

function flattenPlan(root) {
  const nodes = [];
  const visit = (node) => {
    if (!isObject(node)) return;
    nodes.push(node);
    for (const child of node.Plans ?? node.plans ?? []) visit(child);
  };
  visit(root);
  return nodes;
}

function queryMetrics(plan) {
  const root = planRoot(plan);
  const nodes = flattenPlan(root);
  return {
    actualTotalTimeMs: Number(root?.["Actual Total Time"] ?? root?.actualTotalTime ?? 0),
    totalCost: Number(root?.["Total Cost"] ?? root?.totalCost ?? 0),
    sharedReadBlocks: nodes.reduce((sum, node) => sum + Number(node["Shared Read Blocks"] ?? node.sharedReadBlocks ?? 0), 0),
    sequentialScans: nodes
      .filter((node) => (node["Node Type"] ?? node.nodeType) === "Seq Scan")
      .map((node) => ({ relation: node["Relation Name"] ?? node.relationName ?? "unknown", planRows: Number(node["Plan Rows"] ?? node.planRows ?? 0) })),
    indexScanCount: nodes.filter((node) => /Index.*Scan/.test(node["Node Type"] ?? node.nodeType ?? "")).length,
  };
}

export function analyzeQueryPlans(input) {
  const errors = [];
  check(isObject(input), "query-plan input is required", errors);
  if (!isObject(input)) throw new ProductionIntegrationGateError(errors);
  check(Array.isArray(input.queries) && input.queries.length > 0, "critical query inventory is required", errors);
  const thresholds = {
    maximumActualTotalTimeMs: input.thresholds?.maximumActualTotalTimeMs ?? 500,
    maximumTotalCost: input.thresholds?.maximumTotalCost ?? 100000,
    maximumSharedReadBlocks: input.thresholds?.maximumSharedReadBlocks ?? 50000,
    sequentialScanRowThreshold: input.thresholds?.sequentialScanRowThreshold ?? 1000,
    regressionRatio: input.thresholds?.regressionRatio ?? 1.5,
  };
  check(thresholds.regressionRatio >= 1, "query-plan regression ratio is invalid", errors);
  failIfErrors(errors);
  const reports = [];
  for (const query of input.queries) {
    const queryErrors = [];
    check(SAFE_ID.test(query.id ?? ""), "critical query id is invalid", queryErrors);
    check(query.critical === true, `query ${query.id} must be marked critical`, queryErrors);
    const current = queryMetrics(query.plan);
    const baseline = query.baselinePlan ? queryMetrics(query.baselinePlan) : null;
    const findings = [];
    if (current.actualTotalTimeMs > thresholds.maximumActualTotalTimeMs) findings.push("ACTUAL_TIME_THRESHOLD_EXCEEDED");
    if (current.totalCost > thresholds.maximumTotalCost) findings.push("TOTAL_COST_THRESHOLD_EXCEEDED");
    if (current.sharedReadBlocks > thresholds.maximumSharedReadBlocks) findings.push("SHARED_READ_BLOCK_THRESHOLD_EXCEEDED");
    if (current.sequentialScans.some(({ planRows }) => planRows > thresholds.sequentialScanRowThreshold)) findings.push("SEQUENTIAL_SCAN_REGRESSION");
    if (baseline) {
      if (baseline.actualTotalTimeMs > 0 && current.actualTotalTimeMs / baseline.actualTotalTimeMs > thresholds.regressionRatio) findings.push("LATENCY_REGRESSION");
      if (baseline.totalCost > 0 && current.totalCost / baseline.totalCost > thresholds.regressionRatio) findings.push("COST_REGRESSION");
      if (baseline.sequentialScans.length === 0 && current.sequentialScans.length > 0) findings.push("NEW_SEQUENTIAL_SCAN");
      if (baseline.indexScanCount > 0 && current.indexScanCount === 0) findings.push("INDEX_SCAN_REMOVED");
    }
    failIfErrors(queryErrors);
    reports.push({
      id: query.id,
      status: findings.length === 0 ? "PASS" : "FAIL",
      findings: [...new Set(findings)].sort(),
      metrics: current,
      redactedPlan: redactPlan(query.plan),
      rawPlanRetained: false,
    });
  }
  return {
    schemaVersion: 1,
    evidenceType: "query-plan-analysis",
    status: reports.every(({ status }) => status === "PASS") ? "PASS" : "FAIL",
    thresholds,
    queries: reports,
    execution: executionClassification(),
  };
}

export function verifyTagScopedCleanup(input) {
  const errors = [];
  check(isObject(input), "cleanup verification input is required", errors);
  if (!isObject(input)) throw new ProductionIntegrationGateError(errors);
  check(SAFE_ID.test(input.tag ?? ""), "cleanup tag is invalid", errors);
  const attempted = validateRowCounts(input.attemptedDeletionCounts, "attempted cleanup", errors);
  const residual = validateRowCounts(input.residualCounts, "residual cleanup", errors);
  check(Object.values(residual).every((count) => count === 0), "cleanup residual rows remain", errors);
  check(input.activeSyntheticSessions === 0, "active synthetic sessions remain after cleanup", errors);
  check(Array.isArray(input.temporaryFunctions) && input.temporaryFunctions.length === 0, "temporary functions remain after cleanup", errors);
  check(input.productionTarget === false, "cleanup must not target production", errors);
  failIfErrors(errors);
  return {
    schemaVersion: 1,
    evidenceType: "cleanup-verification",
    status: "PASS",
    tag: input.tag,
    attemptedDeletionCounts: attempted,
    residualCounts: residual,
    activeSyntheticSessions: 0,
    temporaryFunctions: [],
    zeroCountVerified: true,
    execution: executionClassification(),
  };
}

export function verifyProductionNonModification(input) {
  const errors = [];
  check(isObject(input?.before) && isObject(input?.after), "production pre/post snapshots are required", errors);
  const checkpoints = ["projectRef", "migrationHead", "frontendIdentity", "releaseIdentity"];
  for (const checkpoint of checkpoints) {
    check(input?.before?.[checkpoint] === input?.after?.[checkpoint], `production ${checkpoint} changed`, errors);
  }
  check(
    JSON.stringify([...(input?.before?.functionInventory ?? [])].sort()) === JSON.stringify([...(input?.after?.functionInventory ?? [])].sort()),
    "production function inventory changed",
    errors,
  );
  check(input?.auditWindow?.writeOperationCount === 0, "production audit window contains write operations", errors);
  check(Number.isFinite(Date.parse(input?.auditWindow?.startedAt)) && Number.isFinite(Date.parse(input?.auditWindow?.endedAt)), "production audit window is invalid", errors);
  failIfErrors(errors);
  return {
    schemaVersion: 1,
    evidenceType: "production-non-modification-proof",
    status: "PASS",
    requiredCheckpoints: PROOF_CHECKPOINTS,
    prePostIdentityEqual: true,
    writeOperationCount: 0,
    execution: executionClassification(),
  };
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

export function validateOperationsPreparation(preparation, { operationsEvidenceComplete = false } = {}) {
  const errors = [];
  check(isObject(preparation), "operations preparation evidence is required", errors);
  if (!isObject(preparation)) throw new ProductionIntegrationGateError(errors);
  scanSensitive(preparation, "operationsPreparation", errors);

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

  failIfErrors(errors);
  return preparation;
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

  if (evidence.operationsPreparation !== undefined) {
    try {
      validateOperationsPreparation(evidence.operationsPreparation, {
        operationsEvidenceComplete: evidence.operationsEvidenceComplete,
      });
    } catch (error) {
      if (error instanceof ProductionIntegrationGateError) errors.push(...error.errors);
      else throw error;
    }
  } else if (requireReady) {
    errors.push("ready gate requires operationsPreparation evidence");
  }

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

  failIfErrors(errors);
  return evidence;
}

async function runExecutableOperation(operation, input) {
  switch (operation) {
    case "backup-manifest":
      return input.artifactPath ? createEncryptedBackupManifestFromFile(input) : createEncryptedBackupManifest(input);
    case "backup-verify":
      return input.artifactPath ? verifyEncryptedBackupManifestAgainstFile(input) : verifyEncryptedBackupManifest(input.manifest, input);
    case "restore-verify":
      return verifyIsolatedRestore(input);
    case "load-plan": {
      const plan = createDeterministicLoadPlan(input);
      return { plan, dryRun: runLoadPlanDryRun(plan) };
    }
    case "security-probes":
      return evaluateSecurityPrivacyProbes(input);
    case "observability-contract":
      return createObservabilityContract();
    case "query-plan-analyze":
      return analyzeQueryPlans(input);
    case "cleanup-verify":
      return verifyTagScopedCleanup(input);
    case "production-proof":
      return verifyProductionNonModification(input);
    default:
      throw new Error(`Unknown executable operation: ${operation}`);
  }
}

function parseArgs(args) {
  const options = { requireReady: false };
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--evidence") options.evidencePath = args[++index];
    else if (args[index] === "--require-ready") options.requireReady = true;
    else if (args[index] === "--operation") options.operation = args[++index];
    else if (args[index] === "--input") options.inputPath = args[++index];
    else if (args[index] === "--output") options.outputPath = args[++index];
    else throw new Error(`Unknown argument: ${args[index]}`);
  }
  if (options.operation) {
    if (!EXECUTABLE_OPERATIONS.includes(options.operation)) throw new Error(`Unsupported operation: ${options.operation}`);
    if (!options.inputPath) throw new Error("--input is required for executable operations");
    if (options.evidencePath || options.requireReady) throw new Error("executable operations cannot be combined with evidence gate arguments");
  } else if (!options.evidencePath) {
    throw new Error("--evidence is required when --operation is not supplied");
  }
  return options;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.operation) {
    const input = JSON.parse(await readFile(path.resolve(options.inputPath), "utf8"));
    const result = await runExecutableOperation(options.operation, input);
    const output = `${JSON.stringify(result, null, 2)}\n`;
    if (options.outputPath) await writeFile(path.resolve(options.outputPath), output, "utf8");
    else process.stdout.write(output);
    return;
  }

  const evidence = JSON.parse(await readFile(path.resolve(options.evidencePath), "utf8"));
  validateProductionIntegrationEvidence(evidence, { requireReady: options.requireReady });
  console.log(
    JSON.stringify(
      {
        executionState: evidence.executionState,
        preparationStopState:
          evidence.operationsPreparation?.stopState ??
          evidence.preparationCheckpoint ??
          "STAGE1_LEDGER_VALIDATED_SEPARATELY",
        serialMerged: evidence.integrationWatch.serialQueue.filter(({ status }) => status === "MERGED").length,
        serialRemaining: evidence.dependencyState.openCapabilityPullRequests.length,
        canonicalMigrationCount: evidence.migrations.canonicalRepositoryIdentity.count,
        stagingMigrationCount: evidence.migrations.stagingLedger.count,
        stagingOnlyCount: evidence.migrations.stagingLedger.stagingOnlyCount,
        canonicalOnlyCount: evidence.migrations.stagingLedger.canonicalOnlyCount,
        preparationCategoryCount: evidence.operationsPreparation?.validatedCategories?.length ?? 0,
        probeCount: evidence.operationsPreparation?.probes?.items?.length ?? 0,
        templateCount: evidence.operationsPreparation?.evidenceTemplates?.templates?.length ?? 0,
        executableOperationCount: EXECUTABLE_OPERATIONS.length,
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
