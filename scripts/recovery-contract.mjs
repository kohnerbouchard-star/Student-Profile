import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const templatePaths = [
  "docs/operations/backup-manifest.template.json",
  "docs/operations/restore-rehearsal.template.json",
  "docs/operations/connected-access-smoke.template.json",
];

const SHA40 = /^[a-f0-9]{40}$/;
const SHA64 = /^[a-f0-9]{64}$/;
const GITHUB_DIGEST = /^(?:sha256:)?[a-f0-9]{64}$/;
const MIGRATION_VERSION = /^\d{14}$/;
const REF = /^[a-z0-9]{20}$/;
const KEY_REFERENCE = "GitHub production environment secret PHASE15_BACKUP_ENCRYPTION_KEY_V1";
const DATA_SCHEMAS = ["public", "private"];
const SCHEMA_ONLY_SCHEMAS = ["economy_private"];
const sensitiveKey = /(password|token|secretvalue|connection|string|service.?role.?key|anon.?key|authorization|cookie|access.?code)/i;
const sensitiveValue = /(postgres(?:ql)?:\/\/|bearer\s+[a-z0-9._-]+|eyJ[a-zA-Z0-9_-]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/i;

const backupScope = Object.freeze({
  managedDatabaseBackup: "provider-managed-separate",
  managedAuth: "managed-platform-separate-current-version-target-required",
  vault: "secret-values-excluded-reprovision-separately",
  migrationLedger: "snapshot-bound-captured-and-verified-separately",
  cron: "captured-and-verified-separately",
  supabaseStorageMetadata: "managed-database-scope-separate-from-application-comparator",
  supabaseStorageBlobs: "not-in-logical-database-artifact-separate-recovery-required",
  r2Objects: "not-in-logical-database-artifact-separate-recovery-required",
  edgeAndWebRelease: "immutable-source-and-deployment-identity-separate",
});

const plannedRestoreScope = Object.freeze({
  applicationData: "pending",
  managedDatabaseBackup: "recorded-separate",
  managedAuth: "recorded-separate",
  vault: "values-excluded-recorded-separate",
  migrationLedger: "pending",
  cron: "pending-inactive-in-isolated-target",
  supabaseStorageMetadata: "recorded-separate",
  supabaseStorageBlobs: "inventory-only-not-restored",
  r2Objects: "inventory-only-not-restored",
  edgeAndWebRelease: "pending-separate-identity-verification",
});

const completeRestoreScope = Object.freeze({
  applicationData: "restored-and-exactly-compared",
  managedDatabaseBackup: "recorded-separate",
  managedAuth: "recorded-separate",
  vault: "values-excluded-recorded-separate",
  migrationLedger: "restored-and-exactly-compared",
  cron: "definitions-verified-isolated-target-inactive",
  supabaseStorageMetadata: "recorded-separate",
  supabaseStorageBlobs: "inventory-only-not-restored",
  r2Objects: "inventory-only-not-restored",
  edgeAndWebRelease: "exact-identity-verified-separate",
});

export function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
}

export function scanSensitive(value, trail = []) {
  const failures = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => failures.push(...scanSensitive(item, [...trail, index])));
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (sensitiveKey.test(key) && nested && !["containsSecretValues", "encryptionKeyReference"].includes(key)) {
        failures.push(`${[...trail, key].join(".")}: sensitive key is prohibited`);
      }
      failures.push(...scanSensitive(nested, [...trail, key]));
    }
  } else if (typeof value === "string" && sensitiveValue.test(value)) {
    failures.push(`${trail.join(".")}: sensitive-looking value is prohibited`);
  }
  return failures;
}

function requireValue(condition, message, failures) {
  if (!condition) failures.push(message);
}

function arraysEqual(actual, expected) {
  return Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index]);
}

function isIsoTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateDocumentSafety(name, document, expectedSchemaVersion, failures) {
  requireValue(
    document.schemaVersion === expectedSchemaVersion,
    `${name}: schemaVersion must be ${expectedSchemaVersion}`,
    failures,
  );
  requireValue(document.productionModified === false, `${name}: productionModified must be false`, failures);
  requireValue(document.containsSecretValues === false, `${name}: containsSecretValues must be false`, failures);
  if (name !== "smoke") {
    requireValue(
      document.fullDisasterRecoveryClaimed === false,
      `${name}: full disaster recovery must not be claimed`,
      failures,
    );
  }
  failures.push(...scanSensitive(document).map((failure) => `${name}: ${failure}`));
}

function validateSnapshotScope(snapshot, prefix, failures) {
  requireValue(snapshot?.consistency === "pg-dump-internal-consistent-snapshot", `${prefix}: pg_dump consistent snapshot is required`, failures);
  requireValue(snapshot?.bindingMethod === "exact-application-data-dump-sha256", `${prefix}: exact application-data dump binding is required`, failures);
  requireValue(snapshot?.applicationDataDumpBound === true, `${prefix}: application dump must be snapshot-bound`, failures);
  requireValue(snapshot?.sourceComparatorDerivedFromDump === true, `${prefix}: source comparator must be derived from the exact dump`, failures);
  requireValue(arraysEqual(snapshot?.dataSchemas, DATA_SCHEMAS), `${prefix}: data schemas must be public and private only`, failures);
  requireValue(arraysEqual(snapshot?.schemaOnlySchemas, SCHEMA_ONLY_SCHEMAS), `${prefix}: economy_private must be schema-only`, failures);
  requireValue(snapshot?.sourceComparator?.profile === "supabase-copy-application-data-v1", `${prefix}: dump-bound COPY comparator is required`, failures);
}

function validateBackupScope(scope, requireEvidence, failures) {
  requireValue(scope?.applicationData?.disposition === "snapshot-bound-captured-and-restore-compared", "backup: application-data scope disposition is invalid", failures);
  requireValue(arraysEqual(scope?.applicationData?.dataSchemas, DATA_SCHEMAS), "backup: application-data schemas must be public and private only", failures);
  requireValue(arraysEqual(scope?.applicationData?.schemaOnlySchemas, SCHEMA_ONLY_SCHEMAS), "backup: economy_private must remain schema-only", failures);
  for (const [name, disposition] of Object.entries(backupScope)) {
    requireValue(scope?.[name]?.disposition === disposition, `backup: ${name} scope disposition is invalid`, failures);
  }
  requireValue(scope?.vault?.containsValues === false, "backup: Vault values must be excluded", failures);
  requireValue(scope?.migrationLedger?.relation === "supabase_migrations.schema_migrations", "backup: migration ledger relation is invalid", failures);
  requireValue(scope?.cron?.relation === "cron.job", "backup: cron relation is invalid", failures);
  requireValue(scope?.cron?.isolatedRestoreActivation === "disabled", "backup: cron must remain disabled on isolated restore", failures);
  if (requireEvidence) {
    for (const name of [
      "managedDatabaseBackup",
      "managedAuth",
      "vault",
      "migrationLedger",
      "cron",
      "supabaseStorageMetadata",
      "edgeAndWebRelease",
    ]) {
      requireValue(isNonEmptyString(scope?.[name]?.evidenceReference), `backup: ${name} evidence reference is required`, failures);
    }
    requireValue(isNonEmptyString(scope?.supabaseStorageBlobs?.inventoryEvidenceReference), "backup: Supabase Storage blob inventory evidence is required", failures);
    requireValue(isNonEmptyString(scope?.r2Objects?.inventoryEvidenceReference), "backup: R2 object inventory evidence is required", failures);
  }
}

function validateRestoreScope(actual, expected, prefix, failures) {
  for (const [name, disposition] of Object.entries(expected)) {
    requireValue(actual?.[name] === disposition, `${prefix}: ${name} scope verification is invalid`, failures);
  }
  requireValue(
    actual && Object.keys(actual).length === Object.keys(expected).length,
    `${prefix}: scope verification must cover exactly the required recovery domains`,
    failures,
  );
}

export function validateTemplates(documents) {
  const failures = [];
  validateDocumentSafety("backup", documents.backup, 2, failures);
  validateDocumentSafety("restore", documents.restore, 2, failures);
  validateDocumentSafety("smoke", documents.smoke, 1, failures);

  const backup = documents.backup;
  const restore = documents.restore;
  const smoke = documents.smoke;
  requireValue(backup.status === "planned", "backup: template must remain planned", failures);
  requireValue(backup.environment === "production-read-only-export", "backup: environment must be production-read-only-export", failures);
  requireValue(backup.recoveryClaim === "phase15-application-database-release-recovery-point", "backup: bounded recovery claim is required", failures);
  validateSnapshotScope(backup.snapshot, "backup", failures);
  requireValue(backup.archive?.storageClass === "github-actions-phase15-release-artifact", "backup: Phase 15 artifact storage class is required", failures);
  requireValue(backup.archive?.retentionDays === 90, "backup: release artifact retention must be 90 days", failures);
  requireValue(backup.archive?.recurringPolicySatisfied === false, "backup: release artifact must not claim recurring-policy coverage", failures);
  requireValue(backup.archive?.encryption?.keyReference === KEY_REFERENCE, "backup: versioned production encryption key reference is required", failures);
  requireValue(backup.archive?.encryption?.keyVersion === "V1", "backup: encryption key version must be V1", failures);
  requireValue(backup.archive?.encryption?.containsKeyMaterial === false, "backup: encryption key material must be excluded", failures);
  requireValue(backup.archive?.freshRunnerDecryptVerification?.required === true, "backup: fresh-runner decryption must be required", failures);
  requireValue(backup.archive?.freshRunnerDecryptVerification?.status === "planned", "backup: fresh-runner template status must remain planned", failures);
  requireValue(backup.archive?.freshRunnerDecryptVerification?.executionEnvironment === "github-production-environment", "backup: verifier must use the GitHub production environment", failures);
  validateBackupScope(backup.scope, false, failures);

  requireValue(restore.status === "planned", "restore: template must remain planned", failures);
  requireValue(restore.recoveryClaim === "isolated-phase15-application-database-restore-rehearsal", "restore: bounded rehearsal claim is required", failures);
  requireValue(restore.targetProjectRef !== restore.productionProjectRef, "restore: target must differ from production", failures);
  requireValue(restore.targetProjectRef !== restore.sourceProjectRef, "restore: target must differ from source", failures);
  requireValue(restore.sourceProjectRef === restore.productionProjectRef, "restore: production backup source must equal the production guard", failures);
  requireValue(restore.dumpComparison?.profile === "supabase-copy-application-data-comparison-v1", "restore: dump-bound COPY comparison is required", failures);
  requireValue(arraysEqual(restore.dumpComparison?.dataSchemas, DATA_SCHEMAS), "restore: data schemas must be public and private only", failures);
  requireValue(arraysEqual(restore.dumpComparison?.schemaOnlySchemas, SCHEMA_ONLY_SCHEMAS), "restore: economy_private must be schema-only", failures);
  requireValue(Array.isArray(restore.dumpComparison?.differences) && restore.dumpComparison.differences.length === 0, "restore: differences must start empty", failures);
  validateRestoreScope(restore.scopeVerification, plannedRestoreScope, "restore", failures);
  requireValue(smoke.environment === "isolated-staging", "smoke: environment must be isolated-staging", failures);
  return failures;
}

export function validateEvidence({ backup, restore, smoke }) {
  const failures = [];
  validateDocumentSafety("backup", backup, 2, failures);
  validateDocumentSafety("restore", restore, 2, failures);
  validateDocumentSafety("smoke", smoke, 1, failures);

  requireValue(backup.status === "complete", "backup: status must be complete", failures);
  requireValue(backup.environment === "production-read-only-export", "backup: environment must be production-read-only-export", failures);
  requireValue(backup.recoveryClaim === "phase15-application-database-release-recovery-point", "backup: bounded recovery claim is required", failures);
  requireValue(SHA40.test(backup.sourceCommit ?? ""), "backup: full source commit is required", failures);
  requireValue(REF.test(backup.sourceProjectRef ?? ""), "backup: source project ref is invalid", failures);
  requireValue(MIGRATION_VERSION.test(backup.migrationHead ?? ""), "backup: migration head is invalid", failures);
  requireValue(isIsoTimestamp(backup.createdAt) && isIsoTimestamp(backup.completedAt), "backup: valid creation and completion timestamps are required", failures);
  requireValue(Date.parse(backup.completedAt) >= Date.parse(backup.createdAt), "backup: completion must not precede creation", failures);

  validateSnapshotScope(backup.snapshot, "backup", failures);
  requireValue(SHA64.test(backup.snapshot?.applicationDataDumpSha256 ?? ""), "backup: application-data dump SHA-256 is required", failures);
  const sourceComparator = backup.snapshot?.sourceComparator;
  requireValue(sourceComparator?.dumpSha256 === backup.snapshot?.applicationDataDumpSha256, "backup: source comparator must bind the exact application-data dump", failures);
  requireValue(Number.isSafeInteger(sourceComparator?.dumpBytes) && sourceComparator.dumpBytes > 0, "backup: positive application-data dump size is required", failures);
  requireValue(Number.isSafeInteger(sourceComparator?.tableCount) && sourceComparator.tableCount > 0, "backup: positive source comparator table count is required", failures);
  requireValue(Number.isSafeInteger(sourceComparator?.totalRowCount) && sourceComparator.totalRowCount >= 0, "backup: source comparator total row count is required", failures);
  requireValue(Number.isSafeInteger(sourceComparator?.sequenceCount) && sourceComparator.sequenceCount >= 0, "backup: source comparator sequence count is required", failures);
  for (const field of ["contentSha256", "evidenceSha256"]) {
    requireValue(SHA64.test(sourceComparator?.[field] ?? ""), `backup: source comparator ${field} is required`, failures);
  }

  const archive = backup.archive;
  requireValue(archive?.format === "encrypted-tar-gzip", "backup: encrypted tar-gzip archive is required", failures);
  requireValue(Number.isSafeInteger(archive?.artifactId) && archive.artifactId > 0, "backup: positive artifact ID is required", failures);
  requireValue(isNonEmptyString(archive?.artifactName), "backup: artifact name is required", failures);
  requireValue(GITHUB_DIGEST.test(archive?.githubArtifactDigest ?? ""), "backup: GitHub artifact digest is required", failures);
  requireValue(SHA64.test(archive?.plaintextSha256 ?? ""), "backup: plaintext archive SHA-256 is required", failures);
  requireValue(SHA64.test(archive?.cipherSha256 ?? ""), "backup: ciphertext SHA-256 is required", failures);
  requireValue(Number.isSafeInteger(archive?.sizeBytes) && archive.sizeBytes > 0, "backup: positive archive size is required", failures);
  requireValue(archive?.storageClass === "github-actions-phase15-release-artifact", "backup: Phase 15 artifact storage class is required", failures);
  requireValue(archive?.retentionDays === 90, "backup: release artifact retention must be 90 days", failures);
  requireValue(isIsoTimestamp(archive?.expiresAt), "backup: artifact expiry is required", failures);
  requireValue(Date.parse(archive?.expiresAt) > Date.parse(backup.completedAt), "backup: artifact expiry must follow completion", failures);
  requireValue(archive?.recurringPolicySatisfied === false, "backup: release artifact must not claim recurring-policy coverage", failures);
  requireValue(isNonEmptyString(archive?.locationReference), "backup: artifact custody reference is required", failures);
  requireValue(archive?.encryption?.keyReference === KEY_REFERENCE, "backup: versioned production encryption key reference is required", failures);
  requireValue(archive?.encryption?.keyVersion === "V1", "backup: encryption key version must be V1", failures);
  requireValue(archive?.encryption?.retainWithoutRotationUntil === archive?.expiresAt, "backup: V1 key must be retained without rotation until artifact expiry", failures);
  requireValue(archive?.encryption?.containsKeyMaterial === false, "backup: encryption key material must be excluded", failures);

  const verifier = archive?.freshRunnerDecryptVerification;
  requireValue(verifier?.required === true, "backup: fresh-runner decryption must be required", failures);
  requireValue(verifier?.status === "passed", "backup: fresh-runner decryption must pass", failures);
  requireValue(verifier?.executionEnvironment === "github-production-environment", "backup: verifier must use the GitHub production environment", failures);
  requireValue(Number.isSafeInteger(verifier?.runId) && verifier.runId > 0, "backup: fresh-runner workflow run ID is required", failures);
  requireValue(isIsoTimestamp(verifier?.completedAt), "backup: fresh-runner completion timestamp is required", failures);
  requireValue(verifier?.downloadedArtifactDigest === archive?.githubArtifactDigest, "backup: fresh-runner artifact digest mismatch", failures);
  requireValue(verifier?.cipherSha256 === archive?.cipherSha256, "backup: fresh-runner ciphertext digest mismatch", failures);
  requireValue(verifier?.plaintextSha256 === archive?.plaintextSha256, "backup: fresh-runner plaintext digest mismatch", failures);
  requireValue(SHA64.test(verifier?.manifestSha256 ?? ""), "backup: fresh-runner manifest SHA-256 is required", failures);
  validateBackupScope(backup.scope, true, failures);

  requireValue(restore.status === "complete", "restore: status must be complete", failures);
  requireValue(restore.recoveryClaim === "isolated-phase15-application-database-restore-rehearsal", "restore: bounded rehearsal claim is required", failures);
  requireValue(
    REF.test(restore.sourceProjectRef ?? "") &&
      REF.test(restore.targetProjectRef ?? "") &&
      REF.test(restore.productionProjectRef ?? ""),
    "restore: project refs are invalid",
    failures,
  );
  requireValue(restore.sourceProjectRef === restore.productionProjectRef, "restore: production backup source must equal the production guard", failures);
  requireValue(restore.targetProjectRef !== restore.sourceProjectRef, "restore: target must differ from source and production", failures);
  requireValue(restore.sourceProjectRef === backup.sourceProjectRef, "restore: source project mismatch", failures);
  requireValue(SHA40.test(restore.releaseCommit ?? ""), "restore: full release commit is required", failures);
  requireValue(restore.releaseCommit === backup.sourceCommit, "restore: release commit mismatch", failures);
  requireValue(restore.backupCipherSha256 === archive?.cipherSha256, "restore: backup ciphertext digest mismatch", failures);
  requireValue(isIsoTimestamp(restore.startedAt) && isIsoTimestamp(restore.completedAt), "restore: valid start and completion timestamps are required", failures);
  requireValue(Date.parse(restore.completedAt) >= Date.parse(restore.startedAt), "restore: completion must not precede start", failures);

  const comparison = restore.dumpComparison;
  requireValue(comparison?.profile === "supabase-copy-application-data-comparison-v1", "restore: dump comparison profile mismatch", failures);
  requireValue(arraysEqual(comparison?.dataSchemas, DATA_SCHEMAS), "restore: data schemas must be public and private only", failures);
  requireValue(arraysEqual(comparison?.schemaOnlySchemas, SCHEMA_ONLY_SCHEMAS), "restore: economy_private must be schema-only", failures);
  requireValue(comparison?.sourceComparatorEvidenceSha256 === sourceComparator?.evidenceSha256, "restore: source comparator evidence mismatch", failures);
  requireValue(SHA64.test(comparison?.restoredComparatorEvidenceSha256 ?? ""), "restore: restored comparator evidence SHA-256 is required", failures);
  requireValue(comparison?.sourceDumpSha256 === sourceComparator?.dumpSha256, "restore: source dump digest mismatch", failures);
  requireValue(SHA64.test(comparison?.restoredDumpSha256 ?? ""), "restore: restored dump SHA-256 is required", failures);
  requireValue(comparison?.sourceContentSha256 === sourceComparator?.contentSha256, "restore: source content digest mismatch", failures);
  requireValue(comparison?.restoredContentSha256 === sourceComparator?.contentSha256, "restore: restored content digest mismatch", failures);
  requireValue(comparison?.sourceTableCount === sourceComparator?.tableCount, "restore: source table count mismatch", failures);
  requireValue(comparison?.restoredTableCount === sourceComparator?.tableCount, "restore: restored table count mismatch", failures);
  requireValue(comparison?.sourceTotalRowCount === sourceComparator?.totalRowCount, "restore: source total row count mismatch", failures);
  requireValue(comparison?.restoredTotalRowCount === sourceComparator?.totalRowCount, "restore: restored total row count mismatch", failures);
  requireValue(comparison?.sourceSequenceCount === sourceComparator?.sequenceCount, "restore: source sequence count mismatch", failures);
  requireValue(comparison?.restoredSequenceCount === sourceComparator?.sequenceCount, "restore: restored sequence count mismatch", failures);
  requireValue(comparison?.matched === true, "restore: dump-bound application data must match", failures);
  requireValue(Array.isArray(comparison?.differences) && comparison.differences.length === 0, "restore: dump comparison differences must be empty", failures);
  validateRestoreScope(restore.scopeVerification, completeRestoreScope, "restore", failures);
  requireValue(Object.values(restore.checks ?? {}).every((value) => value === "passed"), "restore: every check must pass", failures);
  requireValue(Number.isFinite(restore.rpoMinutes) && restore.rpoMinutes >= 0, "restore: measured RPO is required", failures);
  requireValue(Number.isFinite(restore.rtoMinutes) && restore.rtoMinutes >= 0, "restore: measured RTO is required", failures);

  requireValue(smoke.releaseCommit === restore.releaseCommit, "smoke: release commit mismatch", failures);
  requireValue(smoke.supabaseProjectRef === restore.targetProjectRef, "smoke: target project mismatch", failures);
  requireValue(
    [smoke.admin?.result, smoke.playerDesktop?.result, smoke.playerMobile?.result]
      .every((value) => value === "passed"),
    "smoke: all connected surfaces must pass",
    failures,
  );
  return failures;
}

function loadTemplates() {
  const [backup, restore, smoke] = templatePaths.map(readJson);
  return { backup, restore, smoke };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [command, ...args] = process.argv.slice(2);
  let failures;
  if (command === "validate-templates") {
    failures = validateTemplates(loadTemplates());
  } else if (command === "validate-evidence" && args.length === 3) {
    failures = validateEvidence({ backup: readJson(args[0]), restore: readJson(args[1]), smoke: readJson(args[2]) });
  } else {
    console.error("Use validate-templates or validate-evidence <backup.json> <restore.json> <smoke.json>.");
    process.exitCode = 1;
  }
  if (failures) {
    if (failures.length) {
      console.error("Recovery contract validation failed:\n- " + failures.join("\n- "));
      process.exitCode = 1;
    } else {
      console.log("Recovery contract validation passed.");
    }
  }
}
