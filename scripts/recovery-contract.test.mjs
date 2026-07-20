import test from "node:test";
import assert from "node:assert/strict";
import { readJson, scanSensitive, validateEvidence, validateTemplates } from "./recovery-contract.mjs";

const templates = () => ({
  backup: structuredClone(readJson("docs/operations/backup-manifest.template.json")),
  restore: structuredClone(readJson("docs/operations/restore-rehearsal.template.json")),
  smoke: structuredClone(readJson("docs/operations/connected-access-smoke.template.json")),
});

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

test("complete evidence requires exact immutable identities and passing checks", () => {
  const backup = {
    schemaVersion: 1,
    status: "complete",
    environment: "isolated-staging",
    sourceProjectRef: "aaaaaaaaaaaaaaaaaaaa",
    sourceCommit: "1".repeat(40),
    migrationHead: "20260720235900",
    createdAt: "2026-07-20T00:00:00Z",
    completedAt: "2026-07-20T00:10:00Z",
    archive: { format: "encrypted-archive", sha256: "2".repeat(64), sizeBytes: 4096, storageClass: "approved-immutable-off-platform", locationReference: "custody-record-1", encryptionKeyReference: "custodian-reference-only" },
    coverage: {},
    productionModified: false,
    containsSecretValues: false,
  };
  const checks = Object.fromEntries(["targetIdentityDistinct", "migrationLedger", "balancesAndLedger", "inventoryAndContracts", "stockHoldingsAndOrders", "notifications", "authMapping", "storageInventory", "edgeFunctionSource", "adminSmoke", "playerSmoke"].map((key) => [key, "passed"]));
  const restore = {
    schemaVersion: 1,
    status: "complete",
    sourceProjectRef: "aaaaaaaaaaaaaaaaaaaa",
    targetProjectRef: "bbbbbbbbbbbbbbbbbbbb",
    productionProjectRef: "cccccccccccccccccccc",
    releaseCommit: "1".repeat(40),
    backupSha256: "2".repeat(64),
    startedAt: "2026-07-20T00:11:00Z",
    completedAt: "2026-07-20T00:40:00Z",
    rpoMinutes: 10,
    rtoMinutes: 29,
    checks,
    manualInterventions: [],
    failures: [],
    productionModified: false,
    containsSecretValues: false,
  };
  const smoke = {
    schemaVersion: 1,
    environment: "isolated-staging",
    releaseCommit: "1".repeat(40),
    frontendIdentity: "staging-site",
    supabaseProjectRef: "bbbbbbbbbbbbbbbbbbbb",
    executedAt: "2026-07-20T00:45:00Z",
    admin: { result: "passed", evidenceReferences: ["admin-evidence"] },
    playerDesktop: { result: "passed", evidenceReferences: ["desktop-evidence"] },
    playerMobile: { result: "passed", evidenceReferences: ["mobile-evidence"] },
    productionModified: false,
    containsSecretValues: false,
  };
  assert.deepEqual(validateEvidence({ backup, restore, smoke }), []);
  restore.backupSha256 = "3".repeat(64);
  assert.ok(validateEvidence({ backup, restore, smoke }).some((message) => message.includes("digest mismatch")));
});
