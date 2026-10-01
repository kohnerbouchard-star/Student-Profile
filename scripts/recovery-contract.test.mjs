import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readJson, scanSensitive, validateEvidence, validateTemplates } from "./recovery-contract.mjs";

const templates = () => ({
  backup: structuredClone(readJson("docs/operations/backup-manifest.template.json")),
  restore: structuredClone(readJson("docs/operations/restore-rehearsal.template.json")),
  smoke: structuredClone(readJson("docs/operations/connected-access-smoke.template.json")),
});

function completeEvidence() {
  const documents = templates();
  const sourceProjectRef = "aaaaaaaaaaaaaaaaaaaa";
  const targetProjectRef = "bbbbbbbbbbbbbbbbbbbb";
  const sourceCommit = "1".repeat(40);
  const sourceDumpSha256 = "2".repeat(64);
  const restoredDumpSha256 = "3".repeat(64);
  const contentSha256 = "4".repeat(64);
  const sourceEvidenceSha256 = "5".repeat(64);
  const restoredEvidenceSha256 = "6".repeat(64);
  const plaintextSha256 = "7".repeat(64);
  const cipherSha256 = "8".repeat(64);
  const artifactDigest = `sha256:${"9".repeat(64)}`;
  const manifestSha256 = "a".repeat(64);

  Object.assign(documents.backup, {
    status: "complete",
    sourceProjectRef,
    sourceCommit,
    migrationHead: "20260920082200",
    createdAt: "2026-09-20T00:00:00Z",
    completedAt: "2026-09-20T00:10:00Z",
  });
  Object.assign(documents.backup.snapshot, { applicationDataDumpSha256: sourceDumpSha256 });
  Object.assign(documents.backup.snapshot.sourceComparator, {
    dumpSha256: sourceDumpSha256,
    dumpBytes: 2048,
    tableCount: 187,
    totalRowCount: 1024,
    sequenceCount: 12,
    contentSha256,
    evidenceSha256: sourceEvidenceSha256,
  });
  Object.assign(documents.backup.archive, {
    artifactId: 42,
    artifactName: `phase15-production-recovery-${sourceCommit}`,
    githubArtifactDigest: artifactDigest,
    plaintextSha256,
    cipherSha256,
    sizeBytes: 4096,
    expiresAt: "2026-12-19T00:10:00Z",
    locationReference: "github-actions-run-42-artifact-42",
  });
  documents.backup.archive.encryption.retainWithoutRotationUntil = documents.backup.archive.expiresAt;
  Object.assign(documents.backup.archive.freshRunnerDecryptVerification, {
    status: "passed",
    runId: 43,
    completedAt: "2026-09-20T00:15:00Z",
    downloadedArtifactDigest: artifactDigest,
    cipherSha256,
    plaintextSha256,
    manifestSha256,
  });
  for (const name of [
    "managedDatabaseBackup",
    "managedAuth",
    "vault",
    "migrationLedger",
    "cron",
    "supabaseStorageMetadata",
    "edgeAndWebRelease",
  ]) {
    documents.backup.scope[name].evidenceReference = `${name}-evidence`;
  }
  documents.backup.scope.supabaseStorageBlobs.inventoryEvidenceReference = "supabase-storage-object-inventory";
  documents.backup.scope.r2Objects.inventoryEvidenceReference = "r2-object-inventory";

  Object.assign(documents.restore, {
    status: "complete",
    sourceProjectRef,
    targetProjectRef,
    productionProjectRef: sourceProjectRef,
    releaseCommit: sourceCommit,
    backupCipherSha256: cipherSha256,
    startedAt: "2026-09-20T00:20:00Z",
    completedAt: "2026-09-20T00:50:00Z",
    rpoMinutes: 10,
    rtoMinutes: 30,
  });
  Object.assign(documents.restore.dumpComparison, {
    sourceComparatorEvidenceSha256: sourceEvidenceSha256,
    restoredComparatorEvidenceSha256: restoredEvidenceSha256,
    sourceDumpSha256,
    restoredDumpSha256,
    sourceContentSha256: contentSha256,
    restoredContentSha256: contentSha256,
    sourceTableCount: 187,
    restoredTableCount: 187,
    sourceTotalRowCount: 1024,
    restoredTotalRowCount: 1024,
    sourceSequenceCount: 12,
    restoredSequenceCount: 12,
    matched: true,
  });
  Object.assign(documents.restore.scopeVerification, {
    applicationData: "restored-and-exactly-compared",
    migrationLedger: "restored-and-exactly-compared",
    cron: "definitions-verified-isolated-target-inactive",
    edgeAndWebRelease: "exact-identity-verified-separate",
  });
  documents.restore.checks = Object.fromEntries(
    Object.keys(documents.restore.checks).map((key) => [key, "passed"]),
  );

  Object.assign(documents.smoke, {
    releaseCommit: sourceCommit,
    frontendIdentity: "isolated-restored-release",
    supabaseProjectRef: targetProjectRef,
    executedAt: "2026-09-20T00:55:00Z",
  });
  for (const surface of ["admin", "playerDesktop", "playerMobile"]) {
    documents.smoke[surface] = { result: "passed", evidenceReferences: [`${surface}-evidence`] };
  }
  return documents;
}

test("repository recovery templates pass", () => {
  assert.deepEqual(validateTemplates(templates()), []);
});

test("sensitive connection material is rejected", () => {
  const failures = scanSensitive({ databaseUrl: "postgresql://user:pass@example.invalid/db" });
  assert.ok(failures.length >= 1);
});

test("restore target cannot equal production", () => {
  const documents = templates();
  documents.restore.targetProjectRef = documents.restore.productionProjectRef;
  assert.ok(validateTemplates(documents).some((message) => message.includes("target must differ from production")));
});

test("complete evidence requires snapshot-bound exact comparison and separate scope evidence", () => {
  const documents = completeEvidence();
  assert.deepEqual(validateEvidence(documents), []);

  documents.restore.backupCipherSha256 = "b".repeat(64);
  assert.ok(validateEvidence(documents).some((message) => message.includes("ciphertext digest mismatch")));
});

test("economy_private cannot be relabeled as application data", () => {
  const documents = completeEvidence();
  documents.backup.snapshot.dataSchemas.push("economy_private");
  assert.ok(validateEvidence(documents).some((message) => message.includes("data schemas must be public and private only")));
});

test("independent live counts cannot replace exact dump-derived evidence", () => {
  const documents = completeEvidence();
  documents.backup.snapshot.sourceComparator.dumpSha256 = "f".repeat(64);
  assert.ok(validateEvidence(documents).some((message) => message.includes("bind the exact application-data dump")));
});

test("fresh-runner decrypt verification is mandatory", () => {
  const documents = completeEvidence();
  documents.backup.archive.freshRunnerDecryptVerification.status = "planned";
  assert.ok(validateEvidence(documents).some((message) => message.includes("fresh-runner decryption must pass")));
});

test("V1 key retention must cover artifact expiry", () => {
  const documents = completeEvidence();
  documents.backup.archive.encryption.retainWithoutRotationUntil = "2026-10-01T00:00:00Z";
  assert.ok(validateEvidence(documents).some((message) => message.includes("retained without rotation until artifact expiry")));
});

test("release artifact cannot claim recurring retention or full disaster recovery", () => {
  const documents = completeEvidence();
  documents.backup.archive.recurringPolicySatisfied = true;
  documents.restore.fullDisasterRecoveryClaimed = true;
  const failures = validateEvidence(documents);
  assert.ok(failures.some((message) => message.includes("recurring-policy coverage")));
  assert.ok(failures.some((message) => message.includes("full disaster recovery must not be claimed")));
});

test("object inventories remain separately evidenced", () => {
  const documents = completeEvidence();
  documents.backup.scope.r2Objects.inventoryEvidenceReference = null;
  assert.ok(validateEvidence(documents).some((message) => message.includes("R2 object inventory evidence is required")));
});

test("restore integrity SQL uses canonical Inventory and stock relations", () => {
  const sql = fs.readFileSync("scripts/restore-integrity-checks.sql", "utf8");
  for (const relation of ["public.inventory_holdings", "public.stock_holdings", "public.stock_orders"]) {
    assert.match(sql, new RegExp(relation.replace(".", "\\."), "u"));
  }
  for (const retired of ["public.player_inventory", "public.player_stock_holdings", "public.stock_market_orders"]) {
    assert.doesNotMatch(sql, new RegExp(retired.replace(".", "\\."), "u"));
  }
});
