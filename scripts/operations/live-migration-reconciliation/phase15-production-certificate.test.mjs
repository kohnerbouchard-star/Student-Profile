import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  canonicalSha256,
  certifyProductionApply,
} from "./phase15-production-certificate.mjs";
import {
  loadPhase15Migrations,
  PHASE15_COMMON_COUNT,
  PHASE15_CUTOFF,
  PRODUCTION_PRELUDE,
} from "./build-phase15-forward-bundle.mjs";

const ORIGINAL_SOURCE = "a".repeat(40);
const CURRENT_SOURCE = "b".repeat(40);
const SCHEMA_SHA = "c".repeat(64);

const FILES = Object.freeze({
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

function clone(value) {
  return structuredClone(value);
}

function manifestFixture() {
  return {
    schemaVersion: 1,
    environment: "production",
    cutoff: "20260101000000",
    commonMigrationCount: 1,
    preludeMigrationCount: 1,
    migrationCount: 2,
    migrations: [
      {
        order: 1,
        filename: "20260101000000_one.sql",
        version: "20260101000000",
        name: "one",
        sourceSha256: "1".repeat(64),
        statementCount: 1,
        outerTransactionStripped: true,
      },
      {
        order: 2,
        filename: "20260102000000_two.sql",
        version: "20260102000000",
        name: "two",
        sourceSha256: "2".repeat(64),
        statementCount: 1,
        outerTransactionStripped: false,
      },
    ],
  };
}

function economicEvidence(mode, startIndex, migrationCount) {
  const accountDigest = mode === "apply" ? "a".repeat(32) : "b".repeat(32);
  return {
    schemaVersion: 2,
    environment: "production",
    mode,
    startIndex,
    migrationCount,
    certifiedMigrationCount: 2,
    economicInvariantsMatched: true,
    economicInvariants: {
      players: { rows: 54 },
      gameSessions: { rows: 3 },
      ledgerEntries: { rows: 336, amount: "516434.35", digest: "c".repeat(32) },
      stockHoldings: { rows: 4, quantity: "15", reserved: "0", digest: "d".repeat(32) },
      accountBalances: {
        rows: 147,
        balance: "516434.35",
        digest: accountDigest,
        nonZeroRows: 92,
        nonZeroDigest: "e".repeat(32),
      },
      inventoryHoldings: { rows: 393, owned: "2082", reserved: "36", digest: "f".repeat(32) },
    },
    accountProjectionProof: {
      rowsBefore: 108,
      rowsAfter: 147,
      newZeroBalanceRows: 39,
      existingEconomicFieldsMatched: true,
      newRowsAreCanonicalUnpostedZeroBalances: true,
    },
  };
}

function evidenceFixture(manifest, {
  sourceCommit = CURRENT_SOURCE,
  mode = "fresh",
} = {}) {
  const preexistingMigrationCount = mode === "fresh" ? 0 : mode === "suffix" ? 1 : 2;
  const appliedMigrationCount = manifest.migrationCount - preexistingMigrationCount;
  const applyStatus = mode === "already-applied" ? "already-applied" : "applied";
  const evidence = {
    summary: {
      schemaVersion: 1,
      status: "PASS",
      environment: "production",
      expectedProjectRef: "production-ref",
      sourceCommit,
      applyStatus,
      migrationCount: manifest.migrationCount,
      preexistingMigrationCount,
      appliedMigrationCount,
      rollbackRehearsalPassed: applyStatus === "applied",
      exactLedgerVerified: true,
      canonicalApplicationSchemaMatched: true,
      economicInvariantsMatched: true,
      purgeSafetyMatched: true,
      schedulerHealthMatched: true,
    },
    ledgerVerification: {
      ok: true,
      verificationMode: "exact",
      environment: "production",
      migrationCount: manifest.migrationCount,
      firstMigration: manifest.migrations[0].filename,
      lastMigration: manifest.migrations.at(-1).filename,
    },
    postLedger: manifest.migrations.map(({ version, name, sourceSha256 }) => ({
      version,
      name,
      statementCount: 1,
      sha256: sourceSha256,
    })),
    canonicalSchemaComparison: {
      matched: true,
      profile: "supabase-hosted-live-v1",
      left: { path: "canonical.json", sha256: SCHEMA_SHA },
      right: { path: "post.json", sha256: SCHEMA_SHA },
      differenceCountShown: 0,
      differences: [],
    },
    runtimeSafetyAudit: {
      control: {
        environmentName: "production",
        bucketConfigured: true,
        armed: false,
        operatorIdentityCleared: true,
      },
      registry: { table_count: 207, registry_sha256: "d".repeat(64) },
      foreignKeys: { edge_count: 456, fk_graph_sha256: "e".repeat(64) },
      deleteOrder: { table_count: 206, order_sha256: "f".repeat(64) },
      scheduler: { expectedActive: 7, missingExpected: 0, activeEconovaria: 13, inactiveEconovaria: 0 },
      pgCronVersion: "1.6.4",
    },
  };
  if (mode !== "already-applied") {
    evidence.applyEconomicInvariants = economicEvidence("apply", preexistingMigrationCount, appliedMigrationCount);
    evidence.rollbackEconomicInvariants = economicEvidence("rollback", preexistingMigrationCount, appliedMigrationCount);
    evidence.rollbackSchemaComparison = {
      matched: true,
      profile: "exact",
      left: { path: "pre.json", sha256: "9".repeat(64) },
      right: { path: "rollback.json", sha256: "9".repeat(64) },
      differenceCountShown: 0,
      differences: [],
    };
    evidence.schedulerMaintenance = {
      schemaVersion: 1,
      status: "PASS",
      restoreDeadline: "2026-09-21T02:21:42Z",
      activeCountBefore: 13,
      activeCountAfter: 13,
      inFlightRunsDrained: true,
      autoRestoreGuardRemoved: true,
    };
  }
  return evidence;
}

function contractFixture(manifest, original) {
  const evidenceCanonicalSha256 = Object.fromEntries(
    Object.entries(FILES).map(([key, filename]) => [filename, canonicalSha256(original[key])]),
  );
  return {
    schemaVersion: 1,
    contractId: "econovaria.phase15.production-apply-provenance.v1",
    environment: "production",
    expectedProjectRef: "production-ref",
    manifest: {
      schemaVersion: 1,
      migrationCount: manifest.migrationCount,
      canonicalSha256: canonicalSha256(manifest),
      migrationsSha256: canonicalSha256(manifest.migrations),
      firstMigration: manifest.migrations[0].filename,
      lastMigration: manifest.migrations.at(-1).filename,
    },
    schema: {
      comparisonProfile: "supabase-hosted-live-v1",
      canonicalFingerprintSha256: SCHEMA_SHA,
    },
    runtime: clone(original.runtimeSafetyAudit),
    originalApplication: {
      sourceCommit: ORIGINAL_SOURCE,
      workflowRun: { id: 1234, headBranch: "main", headSha: ORIGINAL_SOURCE },
      artifact: {
        id: 5678,
        name: `phase15-production-database-${ORIGINAL_SOURCE}`,
        digest: `sha256:${"8".repeat(64)}`,
      },
      evidenceCanonicalSha256,
    },
  };
}

function artifactFixture(contract) {
  return {
    artifacts: [{
      id: contract.originalApplication.artifact.id,
      name: contract.originalApplication.artifact.name,
      digest: contract.originalApplication.artifact.digest,
      expired: false,
      workflow_run: {
        id: contract.originalApplication.workflowRun.id,
        head_branch: contract.originalApplication.workflowRun.headBranch,
        head_sha: contract.originalApplication.workflowRun.headSha,
      },
    }],
  };
}

function fixture(mode = "fresh") {
  const manifest = manifestFixture();
  const original = evidenceFixture(manifest, { sourceCommit: ORIGINAL_SOURCE, mode: "fresh" });
  const contract = contractFixture(manifest, original);
  const current = evidenceFixture(manifest, { mode });
  return { manifest, original, contract, current, artifactMetadata: artifactFixture(contract) };
}

test("fresh production application is certified from its current rollback proof", () => {
  const values = fixture("fresh");
  const certificate = certifyProductionApply(values);
  assert.equal(certificate.status, "PASS");
  assert.equal(certificate.convergenceMode, "fresh");
  assert.equal(certificate.applicationProvenance.kind, "current-convergence-evidence");
  assert.equal(certificate.applicationProvenance.appliedMigrationCount, 2);
  assert.match(certificate.certificateSha256, /^[0-9a-f]{64}$/u);
});

test("contiguous suffix production application preserves its exact start/count binding", () => {
  const values = fixture("suffix");
  const certificate = certifyProductionApply(values);
  assert.equal(certificate.convergenceMode, "suffix");
  assert.equal(certificate.applicationProvenance.preexistingMigrationCount, 1);
  assert.equal(certificate.applicationProvenance.appliedMigrationCount, 1);
});

test("already-applied production is certified only through the pinned original artifact", () => {
  const values = fixture("already-applied");
  const certificate = certifyProductionApply(values);
  assert.equal(certificate.convergenceMode, "already-applied");
  assert.equal(certificate.applicationProvenance.kind, "pinned-original-workflow-artifact");
  assert.equal(certificate.applicationProvenance.workflowRunId, 1234);
  assert.equal(certificate.applicationProvenance.sourceCommit, ORIGINAL_SOURCE);
  assert.equal(certificate.candidateSourceCommit, CURRENT_SOURCE);
});

test("already-applied retries fail closed without original evidence or artifact metadata", () => {
  const values = fixture("already-applied");
  assert.throws(() => certifyProductionApply({ ...values, original: null }), /ORIGINAL_EVIDENCE_REQUIRED/u);
  assert.throws(() => certifyProductionApply({ ...values, artifactMetadata: null }), /ORIGINAL_ARTIFACT_METADATA_REQUIRED/u);
});

test("artifact identity, digest, run, source branch and expiry are immutable provenance", () => {
  const mutations = [
    ["id", 9999, /ORIGINAL_ARTIFACT_NOT_FOUND|ORIGINAL_ARTIFACT_ID_MISMATCH/u],
    ["name", "wrong", /ORIGINAL_ARTIFACT_NAME_MISMATCH/u],
    ["digest", `sha256:${"0".repeat(64)}`, /ORIGINAL_ARTIFACT_DIGEST_MISMATCH/u],
    ["expired", true, /ORIGINAL_ARTIFACT_EXPIRED/u],
  ];
  for (const [field, value, pattern] of mutations) {
    const values = fixture("already-applied");
    values.artifactMetadata.artifacts[0][field] = value;
    assert.throws(() => certifyProductionApply(values), pattern);
  }
  for (const [field, value, pattern] of [
    ["id", 9999, /ORIGINAL_ARTIFACT_RUN_ID_MISMATCH/u],
    ["head_branch", "release/production", /ORIGINAL_ARTIFACT_BRANCH_MISMATCH/u],
    ["head_sha", CURRENT_SOURCE, /ORIGINAL_ARTIFACT_HEAD_SHA_MISMATCH/u],
  ]) {
    const values = fixture("already-applied");
    values.artifactMetadata.artifacts[0].workflow_run[field] = value;
    assert.throws(() => certifyProductionApply(values), pattern);
  }
});

test("an altered original evidence file cannot inherit the original application certificate", () => {
  const values = fixture("already-applied");
  values.original.summary.unrecognized = "tamper";
  assert.throws(() => certifyProductionApply(values), /ORIGINAL_EVIDENCE_DIGEST_MISMATCH_summary\.json/u);
});

test("manifest identity and source content are pinned independently of summary claims", () => {
  for (const mutate of [
    (values) => { values.manifest.migrations[0].sourceSha256 = "0".repeat(64); },
    (values) => { values.manifest.migrations[0].name = "renamed"; values.manifest.migrations[0].filename = "20260101000000_renamed.sql"; },
    (values) => { values.manifest.migrations.reverse(); },
  ]) {
    const values = fixture();
    mutate(values);
    assert.throws(() => certifyProductionApply(values), /MANIFEST_/u);
  }
});

test("the exact post-apply ledger is checked against every manifest identity and digest", () => {
  for (const [field, value, pattern] of [
    ["version", "20260103000000", /POST_LEDGER_VERSION_MISMATCH/u],
    ["name", "wrong", /POST_LEDGER_NAME_MISMATCH/u],
    ["statementCount", 2, /POST_LEDGER_STATEMENT_COUNT_MISMATCH/u],
    ["sha256", "0".repeat(64), /POST_LEDGER_STATEMENT_DIGEST_MISMATCH/u],
  ]) {
    const values = fixture();
    values.current.postLedger[0][field] = value;
    assert.throws(() => certifyProductionApply(values), pattern);
  }
});

test("canonical schema proof rejects a different fingerprint or any reported difference", () => {
  {
    const values = fixture();
    values.current.canonicalSchemaComparison.right.sha256 = "0".repeat(64);
    assert.throws(() => certifyProductionApply(values), /CANONICAL_SCHEMA_DIGEST_MISMATCH/u);
  }
  {
    const values = fixture();
    values.current.canonicalSchemaComparison.left.sha256 = "0".repeat(64);
    values.current.canonicalSchemaComparison.right.sha256 = "0".repeat(64);
    assert.throws(() => certifyProductionApply(values), /CANONICAL_SCHEMA_FINGERPRINT_MISMATCH/u);
  }
  {
    const values = fixture();
    values.current.canonicalSchemaComparison.differenceCountShown = 1;
    values.current.canonicalSchemaComparison.differences = ["drift"];
    assert.throws(() => certifyProductionApply(values), /CANONICAL_SCHEMA_DIFFERENCE_COUNT_MISMATCH/u);
  }
});

test("economic rollback/apply evidence is bound to the applied suffix and invariant state", () => {
  {
    const values = fixture("suffix");
    values.current.applyEconomicInvariants.startIndex = 0;
    assert.throws(() => certifyProductionApply(values), /APPLY_ECONOMIC_START_INDEX_MISMATCH/u);
  }
  {
    const values = fixture();
    values.current.rollbackEconomicInvariants.economicInvariants.ledgerEntries.rows += 1;
    assert.throws(() => certifyProductionApply(values), /ECONOMIC_LEDGERENTRIES_ROLLBACK_APPLY_MISMATCH/u);
  }
  {
    const values = fixture();
    values.current.applyEconomicInvariants.accountProjectionProof.newZeroBalanceRows = 38;
    assert.throws(() => certifyProductionApply(values), /APPLY_ACCOUNT_PROJECTION_COUNT_MISMATCH/u);
  }
  {
    const values = fixture();
    values.current.rollbackSchemaComparison.right.sha256 = "0".repeat(64);
    assert.throws(() => certifyProductionApply(values), /ROLLBACK_SCHEMA_DIGEST_MISMATCH/u);
  }
});

test("scheduler and purge/runtime safety claims are verified rather than trusted from summary", () => {
  {
    const values = fixture();
    values.current.schedulerMaintenance.activeCountAfter = 12;
    assert.throws(() => certifyProductionApply(values), /SCHEDULER_ACTIVE_COUNT_NOT_RESTORED/u);
  }
  {
    const values = fixture();
    values.current.runtimeSafetyAudit.scheduler.inactiveEconovaria = 1;
    assert.throws(() => certifyProductionApply(values), /RUNTIME_SCHEDULER_INACTIVEECONOVARIA_MISMATCH/u);
  }
  {
    const values = fixture();
    values.current.runtimeSafetyAudit.control.armed = true;
    assert.throws(() => certifyProductionApply(values), /RUNTIME_PURGE_CONTROL_ARMED/u);
  }
});

test("apply status/count combinations cannot manufacture rollback provenance", () => {
  {
    const values = fixture("already-applied");
    values.current.summary.rollbackRehearsalPassed = true;
    assert.throws(() => certifyProductionApply(values), /ALREADY_APPLIED_ROLLBACK_FLAG_MISMATCH/u);
  }
  {
    const values = fixture();
    values.current.summary.preexistingMigrationCount = 1;
    assert.throws(() => certifyProductionApply(values), /SUMMARY_MIGRATION_COUNT_GEOMETRY_MISMATCH/u);
  }
  {
    const values = fixture();
    values.current.summary.applyStatus = "already-applied";
    assert.throws(() => certifyProductionApply(values), /ALREADY_APPLIED_PREEXISTING_COUNT_MISMATCH/u);
  }
});

test("the committed production contract remains bound to the repository migration manifest", async () => {
  const contract = JSON.parse(await readFile(
    "docs/operations/contracts/phase15-production-apply-provenance-v1.json",
    "utf8",
  ));
  const migrations = await loadPhase15Migrations("production");
  const manifest = {
    schemaVersion: 1,
    environment: "production",
    cutoff: PHASE15_CUTOFF,
    commonMigrationCount: PHASE15_COMMON_COUNT,
    preludeMigrationCount: PRODUCTION_PRELUDE.length,
    migrationCount: migrations.length,
    migrations: migrations.map((migration) => ({
      order: migration.order,
      filename: migration.filename,
      version: migration.version,
      name: migration.name,
      sourceSha256: migration.sourceSha256,
      statementCount: 1,
      outerTransactionStripped: migration.outerTransactionStripped,
    })),
  };
  assert.equal(canonicalSha256(manifest), contract.manifest.canonicalSha256);
  assert.equal(canonicalSha256(manifest.migrations), contract.manifest.migrationsSha256);
  assert.equal(manifest.migrations[0].filename, contract.manifest.firstMigration);
  assert.equal(manifest.migrations.at(-1).filename, contract.manifest.lastMigration);
});
