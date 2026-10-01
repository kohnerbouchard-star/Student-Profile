#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EVIDENCE_FILES = Object.freeze({
  summary: "summary.json",
  ledgerVerification: "ledger-verification.json",
  postLedger: "post-ledger.json",
  canonicalSchemaComparison: "canonical-schema-comparison.json",
  runtimeSafetyAudit: "runtime-safety-audit.json",
  applyEconomicInvariants: "apply-economic-invariants.json",
  rollbackEconomicInvariants: "rollback-economic-invariants.json",
  rollbackSchemaComparison: "rollback-schema-comparison.json",
  schedulerMaintenance: "scheduler-maintenance.json",
});

const BASE_EVIDENCE_KEYS = Object.freeze([
  "summary",
  "ledgerVerification",
  "postLedger",
  "canonicalSchemaComparison",
  "runtimeSafetyAudit",
]);

const APPLICATION_EVIDENCE_KEYS = Object.freeze([
  "applyEconomicInvariants",
  "rollbackEconomicInvariants",
  "rollbackSchemaComparison",
  "schedulerMaintenance",
]);

function fail(code, detail) {
  throw new Error(detail ? `${code}: ${detail}` : code);
}

function requireCondition(condition, code, detail) {
  if (!condition) fail(code, detail);
}

function requireEqual(actual, expected, code) {
  if (actual !== expected) fail(code, `expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalSha256(value) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

function requireSha256(value, code) {
  requireCondition(typeof value === "string" && /^[0-9a-f]{64}$/u.test(value), code);
}

function requireCommit(value, code) {
  requireCondition(typeof value === "string" && /^[0-9a-f]{40}$/u.test(value), code);
}

function verifyContract(contract) {
  requireEqual(contract?.schemaVersion, 1, "CONTRACT_SCHEMA_VERSION_MISMATCH");
  requireEqual(contract?.contractId, "econovaria.phase15.production-apply-provenance.v1", "CONTRACT_ID_MISMATCH");
  requireEqual(contract?.environment, "production", "CONTRACT_ENVIRONMENT_MISMATCH");
  requireCondition(typeof contract?.expectedProjectRef === "string" && contract.expectedProjectRef.length > 0,
    "CONTRACT_PROJECT_REF_MISSING");
  requireEqual(contract?.manifest?.schemaVersion, 1, "CONTRACT_MANIFEST_SCHEMA_VERSION_MISMATCH");
  requireCondition(Number.isSafeInteger(contract?.manifest?.migrationCount) && contract.manifest.migrationCount > 0,
    "CONTRACT_MIGRATION_COUNT_INVALID");
  requireSha256(contract?.manifest?.canonicalSha256, "CONTRACT_MANIFEST_DIGEST_INVALID");
  requireSha256(contract?.manifest?.migrationsSha256, "CONTRACT_MIGRATIONS_DIGEST_INVALID");
  requireSha256(contract?.schema?.canonicalFingerprintSha256, "CONTRACT_SCHEMA_FINGERPRINT_INVALID");

  const provenance = contract?.originalApplication;
  requireCondition(provenance && typeof provenance === "object", "CONTRACT_ORIGINAL_PROVENANCE_MISSING");
  requireCommit(provenance?.sourceCommit, "CONTRACT_ORIGINAL_SOURCE_COMMIT_INVALID");
  requireCondition(Number.isSafeInteger(provenance?.workflowRun?.id), "CONTRACT_ORIGINAL_RUN_ID_INVALID");
  requireEqual(provenance?.workflowRun?.headBranch, "main", "CONTRACT_ORIGINAL_BRANCH_MISMATCH");
  requireEqual(provenance?.workflowRun?.headSha, provenance.sourceCommit, "CONTRACT_ORIGINAL_RUN_SHA_MISMATCH");
  requireCondition(Number.isSafeInteger(provenance?.artifact?.id), "CONTRACT_ORIGINAL_ARTIFACT_ID_INVALID");
  requireCondition(typeof provenance?.artifact?.name === "string" && provenance.artifact.name.length > 0,
    "CONTRACT_ORIGINAL_ARTIFACT_NAME_INVALID");
  requireCondition(/^sha256:[0-9a-f]{64}$/u.test(provenance?.artifact?.digest || ""),
    "CONTRACT_ORIGINAL_ARTIFACT_DIGEST_INVALID");

  for (const key of [...BASE_EVIDENCE_KEYS, ...APPLICATION_EVIDENCE_KEYS]) {
    requireSha256(provenance?.evidenceCanonicalSha256?.[EVIDENCE_FILES[key]],
      `CONTRACT_ORIGINAL_EVIDENCE_DIGEST_INVALID_${EVIDENCE_FILES[key]}`);
  }
}

function verifyManifest(contract, manifest) {
  const expected = contract.manifest;
  requireEqual(manifest?.schemaVersion, expected.schemaVersion, "MANIFEST_SCHEMA_VERSION_MISMATCH");
  requireEqual(manifest?.environment, "production", "MANIFEST_ENVIRONMENT_MISMATCH");
  requireEqual(manifest?.migrationCount, expected.migrationCount, "MANIFEST_MIGRATION_COUNT_MISMATCH");
  requireCondition(Array.isArray(manifest?.migrations), "MANIFEST_MIGRATIONS_MISSING");
  requireEqual(manifest.migrations.length, expected.migrationCount, "MANIFEST_MIGRATION_ARRAY_COUNT_MISMATCH");

  const versions = new Set();
  manifest.migrations.forEach((migration, index) => {
    const position = index + 1;
    requireEqual(migration?.order, position, "MANIFEST_ORDER_MISMATCH");
    requireCondition(/^\d{14}$/u.test(migration?.version || ""), "MANIFEST_VERSION_INVALID", String(position));
    requireCondition(typeof migration?.name === "string" && migration.name.length > 0,
      "MANIFEST_NAME_INVALID", String(position));
    requireEqual(migration?.filename, `${migration.version}_${migration.name}.sql`, "MANIFEST_FILENAME_MISMATCH");
    requireSha256(migration?.sourceSha256, "MANIFEST_SOURCE_DIGEST_INVALID");
    requireEqual(migration?.statementCount, 1, "MANIFEST_STATEMENT_COUNT_MISMATCH");
    requireCondition(typeof migration?.outerTransactionStripped === "boolean",
      "MANIFEST_TRANSACTION_NORMALIZATION_MISSING");
    requireCondition(!versions.has(migration.version), "MANIFEST_DUPLICATE_VERSION", migration.version);
    versions.add(migration.version);
  });

  requireEqual(manifest.migrations[0]?.filename, expected.firstMigration, "MANIFEST_FIRST_MIGRATION_MISMATCH");
  requireEqual(manifest.migrations.at(-1)?.filename, expected.lastMigration, "MANIFEST_LAST_MIGRATION_MISMATCH");
  requireEqual(canonicalSha256(manifest), expected.canonicalSha256, "MANIFEST_CANONICAL_DIGEST_MISMATCH");
  requireEqual(canonicalSha256(manifest.migrations), expected.migrationsSha256, "MANIFEST_MIGRATIONS_DIGEST_MISMATCH");
}

function deriveMode(summary, migrationCount) {
  requireEqual(summary?.schemaVersion, 1, "SUMMARY_SCHEMA_VERSION_MISMATCH");
  requireEqual(summary?.status, "PASS", "SUMMARY_STATUS_MISMATCH");
  requireEqual(summary?.environment, "production", "SUMMARY_ENVIRONMENT_MISMATCH");
  requireCommit(summary?.sourceCommit, "SUMMARY_SOURCE_COMMIT_INVALID");
  requireEqual(summary?.migrationCount, migrationCount, "SUMMARY_MIGRATION_COUNT_MISMATCH");
  requireCondition(Number.isSafeInteger(summary?.preexistingMigrationCount), "SUMMARY_PREEXISTING_COUNT_INVALID");
  requireCondition(Number.isSafeInteger(summary?.appliedMigrationCount), "SUMMARY_APPLIED_COUNT_INVALID");
  requireCondition(summary.preexistingMigrationCount >= 0 && summary.preexistingMigrationCount <= migrationCount,
    "SUMMARY_PREEXISTING_COUNT_OUT_OF_RANGE");
  requireCondition(summary.appliedMigrationCount >= 0 && summary.appliedMigrationCount <= migrationCount,
    "SUMMARY_APPLIED_COUNT_OUT_OF_RANGE");
  requireEqual(summary.preexistingMigrationCount + summary.appliedMigrationCount, migrationCount,
    "SUMMARY_MIGRATION_COUNT_GEOMETRY_MISMATCH");

  for (const field of [
    "exactLedgerVerified",
    "canonicalApplicationSchemaMatched",
    "economicInvariantsMatched",
    "purgeSafetyMatched",
    "schedulerHealthMatched",
  ]) requireEqual(summary?.[field], true, `SUMMARY_${field.toUpperCase()}_MISMATCH`);

  if (summary.applyStatus === "already-applied") {
    requireEqual(summary.preexistingMigrationCount, migrationCount, "ALREADY_APPLIED_PREEXISTING_COUNT_MISMATCH");
    requireEqual(summary.appliedMigrationCount, 0, "ALREADY_APPLIED_NEW_COUNT_MISMATCH");
    requireEqual(summary.rollbackRehearsalPassed, false, "ALREADY_APPLIED_ROLLBACK_FLAG_MISMATCH");
    return "already-applied";
  }
  requireEqual(summary.applyStatus, "applied", "SUMMARY_APPLY_STATUS_INVALID");
  requireCondition(summary.appliedMigrationCount > 0, "APPLIED_COUNT_MUST_BE_POSITIVE");
  requireEqual(summary.rollbackRehearsalPassed, true, "APPLIED_ROLLBACK_FLAG_MISMATCH");
  return summary.preexistingMigrationCount === 0 ? "fresh" : "suffix";
}

function verifyLedger(manifest, evidence) {
  const verification = evidence.ledgerVerification;
  requireEqual(verification?.ok, true, "LEDGER_VERIFICATION_NOT_OK");
  requireEqual(verification?.verificationMode, "exact", "LEDGER_VERIFICATION_MODE_MISMATCH");
  requireEqual(verification?.environment, "production", "LEDGER_VERIFICATION_ENVIRONMENT_MISMATCH");
  requireEqual(verification?.migrationCount, manifest.migrationCount, "LEDGER_VERIFICATION_COUNT_MISMATCH");
  requireEqual(verification?.firstMigration, manifest.migrations[0].filename, "LEDGER_VERIFICATION_FIRST_MISMATCH");
  requireEqual(verification?.lastMigration, manifest.migrations.at(-1).filename, "LEDGER_VERIFICATION_LAST_MISMATCH");

  requireCondition(Array.isArray(evidence.postLedger), "POST_LEDGER_MISSING");
  requireEqual(evidence.postLedger.length, manifest.migrations.length, "POST_LEDGER_COUNT_MISMATCH");
  evidence.postLedger.forEach((row, index) => {
    const migration = manifest.migrations[index];
    requireEqual(String(row?.version || ""), migration.version, "POST_LEDGER_VERSION_MISMATCH");
    requireEqual(String(row?.name || ""), migration.name, "POST_LEDGER_NAME_MISMATCH");
    requireEqual(Number(row?.statementCount), 1, "POST_LEDGER_STATEMENT_COUNT_MISMATCH");
    requireEqual(String(row?.sha256 || "").toLowerCase(), migration.sourceSha256,
      "POST_LEDGER_STATEMENT_DIGEST_MISMATCH");
  });
}

function verifyComparison(comparison, profile, codePrefix) {
  requireEqual(comparison?.matched, true, `${codePrefix}_NOT_MATCHED`);
  requireEqual(comparison?.profile, profile, `${codePrefix}_PROFILE_MISMATCH`);
  requireSha256(comparison?.left?.sha256, `${codePrefix}_LEFT_DIGEST_INVALID`);
  requireSha256(comparison?.right?.sha256, `${codePrefix}_RIGHT_DIGEST_INVALID`);
  requireEqual(comparison.left.sha256, comparison.right.sha256, `${codePrefix}_DIGEST_MISMATCH`);
  requireEqual(comparison?.differenceCountShown, 0, `${codePrefix}_DIFFERENCE_COUNT_MISMATCH`);
  requireCondition(Array.isArray(comparison?.differences) && comparison.differences.length === 0,
    `${codePrefix}_DIFFERENCES_PRESENT`);
}

function verifyCanonicalSchema(contract, evidence) {
  const comparison = evidence.canonicalSchemaComparison;
  verifyComparison(comparison, contract.schema.comparisonProfile, "CANONICAL_SCHEMA");
  requireEqual(comparison.left.sha256, contract.schema.canonicalFingerprintSha256,
    "CANONICAL_SCHEMA_FINGERPRINT_MISMATCH");
}

function verifyRuntime(contract, evidence) {
  const actual = evidence.runtimeSafetyAudit;
  const expected = contract.runtime;
  requireEqual(actual?.control?.environmentName, "production", "RUNTIME_CONTROL_ENVIRONMENT_MISMATCH");
  requireEqual(actual?.control?.bucketConfigured, true, "RUNTIME_PURGE_BUCKET_NOT_CONFIGURED");
  requireEqual(actual?.control?.armed, false, "RUNTIME_PURGE_CONTROL_ARMED");
  requireEqual(actual?.control?.operatorIdentityCleared, true, "RUNTIME_PURGE_OPERATOR_NOT_CLEARED");

  for (const [section, fields] of Object.entries({
    registry: expected.registry,
    foreignKeys: expected.foreignKeys,
    deleteOrder: expected.deleteOrder,
    scheduler: expected.scheduler,
  })) {
    for (const [field, expectedValue] of Object.entries(fields)) {
      requireEqual(actual?.[section]?.[field], expectedValue, `RUNTIME_${section.toUpperCase()}_${field.toUpperCase()}_MISMATCH`);
    }
  }
  requireEqual(actual?.pgCronVersion, expected.pgCronVersion, "RUNTIME_PG_CRON_VERSION_MISMATCH");
}

function verifyEconomicShape(value, expectedMode, summary) {
  requireEqual(value?.schemaVersion, 2, `${expectedMode.toUpperCase()}_ECONOMIC_SCHEMA_VERSION_MISMATCH`);
  requireEqual(value?.environment, "production", `${expectedMode.toUpperCase()}_ECONOMIC_ENVIRONMENT_MISMATCH`);
  requireEqual(value?.mode, expectedMode, `${expectedMode.toUpperCase()}_ECONOMIC_MODE_MISMATCH`);
  requireEqual(value?.startIndex, summary.preexistingMigrationCount,
    `${expectedMode.toUpperCase()}_ECONOMIC_START_INDEX_MISMATCH`);
  requireEqual(value?.migrationCount, summary.appliedMigrationCount,
    `${expectedMode.toUpperCase()}_ECONOMIC_MIGRATION_COUNT_MISMATCH`);
  requireEqual(value?.certifiedMigrationCount, summary.migrationCount,
    `${expectedMode.toUpperCase()}_ECONOMIC_CERTIFIED_COUNT_MISMATCH`);
  requireEqual(value?.economicInvariantsMatched, true,
    `${expectedMode.toUpperCase()}_ECONOMIC_MATCH_FLAG_MISMATCH`);

  const prefix = expectedMode.toUpperCase();
  const invariants = value?.economicInvariants;
  for (const key of ["players", "gameSessions", "ledgerEntries", "stockHoldings", "accountBalances", "inventoryHoldings"]) {
    requireCondition(invariants?.[key] && typeof invariants[key] === "object",
      `${prefix}_ECONOMIC_SECTION_MISSING`, key);
  }
  const requireRowCount = (section, field = "rows") => requireCondition(
    Number.isSafeInteger(invariants[section]?.[field]) && invariants[section][field] >= 0,
    `${prefix}_ECONOMIC_${section.toUpperCase()}_${field.toUpperCase()}_INVALID`,
  );
  const requireNumericText = (section, field) => requireCondition(
    typeof invariants[section]?.[field] === "string" && /^-?\d+(?:\.\d+)?$/u.test(invariants[section][field]),
    `${prefix}_ECONOMIC_${section.toUpperCase()}_${field.toUpperCase()}_INVALID`,
  );
  const requireMd5 = (section, field) => requireCondition(
    typeof invariants[section]?.[field] === "string" && /^[0-9a-f]{32}$/u.test(invariants[section][field]),
    `${prefix}_ECONOMIC_${section.toUpperCase()}_${field.toUpperCase()}_INVALID`,
  );
  for (const section of ["players", "gameSessions", "ledgerEntries", "stockHoldings", "accountBalances", "inventoryHoldings"]) {
    requireRowCount(section);
  }
  requireRowCount("accountBalances", "nonZeroRows");
  for (const [section, fields] of [
    ["ledgerEntries", ["amount"]],
    ["stockHoldings", ["quantity", "reserved"]],
    ["accountBalances", ["balance"]],
    ["inventoryHoldings", ["owned", "reserved"]],
  ]) for (const field of fields) requireNumericText(section, field);
  for (const [section, fields] of [
    ["ledgerEntries", ["digest"]],
    ["stockHoldings", ["digest"]],
    ["accountBalances", ["digest", "nonZeroDigest"]],
    ["inventoryHoldings", ["digest"]],
  ]) for (const field of fields) requireMd5(section, field);

  const proof = value?.accountProjectionProof;
  requireCondition(Number.isSafeInteger(proof?.rowsBefore) && Number.isSafeInteger(proof?.rowsAfter) &&
    Number.isSafeInteger(proof?.newZeroBalanceRows) && proof.rowsBefore >= 0 && proof.rowsAfter >= 0 &&
    proof.newZeroBalanceRows >= 0, `${prefix}_ACCOUNT_PROJECTION_COUNTS_INVALID`);
  requireEqual(proof.rowsAfter, proof.rowsBefore + proof.newZeroBalanceRows,
    `${prefix}_ACCOUNT_PROJECTION_COUNT_MISMATCH`);
  requireEqual(proof?.existingEconomicFieldsMatched, true,
    `${prefix}_EXISTING_ECONOMIC_FIELDS_MISMATCH`);
  requireEqual(proof?.newRowsAreCanonicalUnpostedZeroBalances, true,
    `${prefix}_NEW_ACCOUNT_PROJECTION_MISMATCH`);
}

function verifyEconomicPair(evidence, summary) {
  const apply = evidence.applyEconomicInvariants;
  const rollback = evidence.rollbackEconomicInvariants;
  verifyEconomicShape(apply, "apply", summary);
  verifyEconomicShape(rollback, "rollback", summary);

  for (const section of ["players", "gameSessions", "ledgerEntries", "stockHoldings", "inventoryHoldings"]) {
    requireEqual(canonicalSha256(apply.economicInvariants[section]),
      canonicalSha256(rollback.economicInvariants[section]), `ECONOMIC_${section.toUpperCase()}_ROLLBACK_APPLY_MISMATCH`);
  }
  for (const field of ["rows", "balance", "nonZeroRows", "nonZeroDigest"]) {
    requireEqual(apply.economicInvariants.accountBalances[field], rollback.economicInvariants.accountBalances[field],
      `ECONOMIC_ACCOUNT_BALANCES_${field.toUpperCase()}_ROLLBACK_APPLY_MISMATCH`);
  }
  requireEqual(canonicalSha256(apply.accountProjectionProof), canonicalSha256(rollback.accountProjectionProof),
    "ECONOMIC_ACCOUNT_PROJECTION_ROLLBACK_APPLY_MISMATCH");

  verifyComparison(evidence.rollbackSchemaComparison, "exact", "ROLLBACK_SCHEMA");
}

function verifySchedulerMaintenance(evidence, runtimeAudit) {
  const maintenance = evidence.schedulerMaintenance;
  requireEqual(maintenance?.schemaVersion, 1, "SCHEDULER_MAINTENANCE_SCHEMA_VERSION_MISMATCH");
  requireEqual(maintenance?.status, "PASS", "SCHEDULER_MAINTENANCE_STATUS_MISMATCH");
  requireCondition(typeof maintenance?.restoreDeadline === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(maintenance.restoreDeadline) &&
    !Number.isNaN(Date.parse(maintenance.restoreDeadline)), "SCHEDULER_RESTORE_DEADLINE_INVALID");
  requireCondition(Number.isSafeInteger(maintenance?.activeCountBefore) && maintenance.activeCountBefore > 0,
    "SCHEDULER_ACTIVE_COUNT_BEFORE_INVALID");
  requireEqual(maintenance?.activeCountAfter, maintenance.activeCountBefore,
    "SCHEDULER_ACTIVE_COUNT_NOT_RESTORED");
  requireEqual(maintenance.activeCountAfter, runtimeAudit.scheduler.activeEconovaria,
    "SCHEDULER_MAINTENANCE_RUNTIME_COUNT_MISMATCH");
  requireEqual(maintenance?.inFlightRunsDrained, true, "SCHEDULER_IN_FLIGHT_RUNS_NOT_DRAINED");
  requireEqual(maintenance?.autoRestoreGuardRemoved, true, "SCHEDULER_AUTO_RESTORE_GUARD_PRESENT");
}

function verifyEvidence(contract, manifest, evidence, { requireApplicationProof }) {
  for (const key of BASE_EVIDENCE_KEYS) {
    requireCondition(evidence?.[key] !== undefined, `EVIDENCE_MISSING_${EVIDENCE_FILES[key]}`);
  }
  const mode = deriveMode(evidence.summary, manifest.migrationCount);
  requireEqual(evidence.summary.expectedProjectRef, contract.expectedProjectRef, "SUMMARY_PROJECT_REF_MISMATCH");
  verifyLedger(manifest, evidence);
  verifyCanonicalSchema(contract, evidence);
  verifyRuntime(contract, evidence);

  if (requireApplicationProof) {
    requireCondition(mode !== "already-applied", "APPLICATION_PROOF_CANNOT_BE_ALREADY_APPLIED");
    for (const key of APPLICATION_EVIDENCE_KEYS) {
      requireCondition(evidence?.[key] !== undefined, `EVIDENCE_MISSING_${EVIDENCE_FILES[key]}`);
    }
    verifyEconomicPair(evidence, evidence.summary);
    verifySchedulerMaintenance(evidence, evidence.runtimeSafetyAudit);
  }
  return mode;
}

function selectArtifact(metadata, expectedId) {
  if (Array.isArray(metadata?.artifacts)) {
    return metadata.artifacts.find((artifact) => Number(artifact?.id) === expectedId);
  }
  if (metadata?.artifact && typeof metadata.artifact === "object") return metadata.artifact;
  return metadata;
}

function verifyOriginalProvenance(contract, manifest, original, artifactMetadata) {
  requireCondition(original && typeof original === "object", "ORIGINAL_EVIDENCE_REQUIRED");
  requireCondition(artifactMetadata && typeof artifactMetadata === "object", "ORIGINAL_ARTIFACT_METADATA_REQUIRED");
  const expected = contract.originalApplication;
  const artifact = selectArtifact(artifactMetadata, expected.artifact.id);
  requireCondition(artifact && typeof artifact === "object", "ORIGINAL_ARTIFACT_NOT_FOUND");
  requireEqual(Number(artifact.id), expected.artifact.id, "ORIGINAL_ARTIFACT_ID_MISMATCH");
  requireEqual(artifact.name, expected.artifact.name, "ORIGINAL_ARTIFACT_NAME_MISMATCH");
  requireEqual(artifact.digest, expected.artifact.digest, "ORIGINAL_ARTIFACT_DIGEST_MISMATCH");
  requireEqual(artifact.expired, false, "ORIGINAL_ARTIFACT_EXPIRED");
  requireEqual(Number(artifact?.workflow_run?.id), expected.workflowRun.id, "ORIGINAL_ARTIFACT_RUN_ID_MISMATCH");
  requireEqual(artifact?.workflow_run?.head_branch, expected.workflowRun.headBranch,
    "ORIGINAL_ARTIFACT_BRANCH_MISMATCH");
  requireEqual(artifact?.workflow_run?.head_sha, expected.workflowRun.headSha, "ORIGINAL_ARTIFACT_HEAD_SHA_MISMATCH");

  const originalMode = verifyEvidence(contract, manifest, original, { requireApplicationProof: true });
  requireEqual(originalMode, "fresh", "ORIGINAL_APPLICATION_MODE_MISMATCH");
  requireEqual(original.summary.sourceCommit, expected.sourceCommit, "ORIGINAL_APPLICATION_SOURCE_COMMIT_MISMATCH");
  for (const key of [...BASE_EVIDENCE_KEYS, ...APPLICATION_EVIDENCE_KEYS]) {
    const filename = EVIDENCE_FILES[key];
    requireEqual(canonicalSha256(original[key]), expected.evidenceCanonicalSha256[filename],
      `ORIGINAL_EVIDENCE_DIGEST_MISMATCH_${filename}`);
  }
  return artifact;
}

function evidenceDigests(evidence, keys) {
  return Object.fromEntries(keys.map((key) => [EVIDENCE_FILES[key], canonicalSha256(evidence[key])]));
}

export function certifyProductionApply({
  contract,
  manifest,
  current,
  original = null,
  artifactMetadata = null,
}) {
  verifyContract(contract);
  verifyManifest(contract, manifest);
  const currentMode = deriveMode(current?.summary, manifest.migrationCount);
  verifyEvidence(contract, manifest, current, { requireApplicationProof: currentMode !== "already-applied" });

  let applicationProvenance;
  if (currentMode === "already-applied") {
    verifyOriginalProvenance(contract, manifest, original, artifactMetadata);
    const expected = contract.originalApplication;
    applicationProvenance = {
      kind: "pinned-original-workflow-artifact",
      sourceCommit: expected.sourceCommit,
      workflowRunId: expected.workflowRun.id,
      artifactId: expected.artifact.id,
      artifactName: expected.artifact.name,
      artifactDigest: expected.artifact.digest,
      evidenceCanonicalSha256: expected.evidenceCanonicalSha256,
    };
  } else {
    applicationProvenance = {
      kind: "current-convergence-evidence",
      sourceCommit: current.summary.sourceCommit,
      applyStatus: current.summary.applyStatus,
      preexistingMigrationCount: current.summary.preexistingMigrationCount,
      appliedMigrationCount: current.summary.appliedMigrationCount,
      evidenceCanonicalSha256: evidenceDigests(current, [...BASE_EVIDENCE_KEYS, ...APPLICATION_EVIDENCE_KEYS]),
    };
  }

  const payload = {
    schemaVersion: 1,
    contractId: contract.contractId,
    status: "PASS",
    environment: "production",
    expectedProjectRef: contract.expectedProjectRef,
    candidateSourceCommit: current.summary.sourceCommit,
    convergenceMode: currentMode,
    migrationBinding: {
      migrationCount: manifest.migrationCount,
      canonicalManifestSha256: contract.manifest.canonicalSha256,
      migrationsSha256: contract.manifest.migrationsSha256,
      postLedgerSha256: canonicalSha256(current.postLedger),
    },
    schemaBinding: {
      profile: contract.schema.comparisonProfile,
      canonicalFingerprintSha256: contract.schema.canonicalFingerprintSha256,
    },
    runtimeBinding: canonicalize(contract.runtime),
    currentEvidenceCanonicalSha256: evidenceDigests(current, BASE_EVIDENCE_KEYS),
    applicationProvenance,
  };
  return Object.freeze({ ...payload, certificateSha256: canonicalSha256(payload) });
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    requireCondition(key?.startsWith("--") && value !== undefined, "INVALID_ARGUMENT", key || "end");
    requireCondition(!values.has(key), "DUPLICATE_ARGUMENT", key);
    values.set(key, value);
  }
  for (const key of ["--contract", "--manifest", "--current-evidence"]) {
    requireCondition(values.has(key), "MISSING_ARGUMENT", key);
  }
  return values;
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

export async function loadEvidenceDirectory(directory, { applicationProof = false } = {}) {
  const keys = applicationProof ? [...BASE_EVIDENCE_KEYS, ...APPLICATION_EVIDENCE_KEYS] : BASE_EVIDENCE_KEYS;
  const rows = await Promise.all(keys.map(async (key) => [key, await readJson(path.join(directory, EVIDENCE_FILES[key]))]));
  return Object.fromEntries(rows);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const [contract, manifest, summary] = await Promise.all([
    readJson(options.get("--contract")),
    readJson(options.get("--manifest")),
    readJson(path.join(options.get("--current-evidence"), EVIDENCE_FILES.summary)),
  ]);
  const currentRequiresApplicationProof = summary.applyStatus !== "already-applied";
  const current = await loadEvidenceDirectory(options.get("--current-evidence"), {
    applicationProof: currentRequiresApplicationProof,
  });

  let original = null;
  let artifactMetadata = null;
  if (summary.applyStatus === "already-applied") {
    requireCondition(options.has("--original-evidence"), "MISSING_ARGUMENT", "--original-evidence");
    requireCondition(options.has("--original-artifact-metadata"), "MISSING_ARGUMENT", "--original-artifact-metadata");
    [original, artifactMetadata] = await Promise.all([
      loadEvidenceDirectory(options.get("--original-evidence"), { applicationProof: true }),
      readJson(options.get("--original-artifact-metadata")),
    ]);
  }

  const certificate = certifyProductionApply({ contract, manifest, current, original, artifactMetadata });
  process.stdout.write(`${JSON.stringify(certificate, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
