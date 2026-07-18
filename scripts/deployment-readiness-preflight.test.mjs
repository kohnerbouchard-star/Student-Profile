import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ReadinessValidationError,
  validateDeploymentReadiness,
} from "./deployment-readiness-preflight.mjs";

const NOW = new Date("2026-07-18T12:00:00.000Z");
const RELEASE_COMMIT = "a".repeat(40);
const ROLLBACK_COMMIT = "b".repeat(40);

function sha256(content) {
  return createHash("sha256").update(content).digest("hex");
}

async function write(root, relativePath, content) {
  const absolute = path.join(root, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content);
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "econovaria-readiness-"));
  const evidenceContent = "deterministic staging evidence\n";
  await write(root, "backend/supabase/migrations/20260717090000_first.sql", "begin;\ncommit;\n");
  await write(root, "backend/supabase/migrations/20260718090000_second.sql", "begin;\ncommit;\n");
  await write(root, "backend/supabase/functions/admin-api/index.ts", "Deno.serve(() => new Response());\n");
  await write(root, "backend/supabase/functions/classroom-api/index.ts", "Deno.serve(() => new Response());\n");
  await write(root, "backend/supabase/functions/notification-worker/README.md", "placeholder\n");
  await write(
    root,
    "backend/src/platform/env.ts",
    'Deno.env.get("SUPABASE_URL");\nDeno.env.get("SUPABASE_SERVICE_ROLE_KEY");\n',
  );
  await write(root, "docs/operations/production-manifest-2026-07-17.json", JSON.stringify({
    supabase: { projectRef: "live-prod-ref" },
  }));
  await write(root, "evidence/proof.txt", evidenceContent);

  const evidence = {
    path: "evidence/proof.txt",
    sha256: sha256(evidenceContent),
    capturedAt: NOW.toISOString(),
  };
  const entrypointDigest = sha256("Deno.serve(() => new Response());\n");
  const migrationVersionSetSha256 = sha256("20260717090000\n20260718090000\n");
  const functions = ["admin-api", "classroom-api"];
  const manifest = {
    schemaVersion: 1,
    generatedAt: NOW.toISOString(),
    targetEnvironment: "staging",
    source: {
      repository: "kohnerbouchard-star/Student-Profile",
      ref: "refs/heads/main",
      commit: RELEASE_COMMIT,
      mergedIntoMain: true,
    },
    environments: {
      development: { identity: "dev-ref-001" },
      staging: { identity: "stage-ref-001", dataPolicy: "synthetic-only" },
      production: { identity: "live-prod-ref" },
    },
    secrets: {
      configuredNames: ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"],
    },
    migrations: {
      repositoryHead: "20260718090000",
      appliedHead: "20260718090000",
      repositoryCount: 2,
      appliedCount: 2,
      repositoryVersionSetSha256: migrationVersionSetSha256,
      appliedVersionSetSha256: migrationVersionSetSha256,
      appliedLedgerEvidence: evidence,
      cleanReplayEvidence: evidence,
      schemaComparisonEvidence: evidence,
      schemaComparisonResult: "match",
    },
    artifacts: {
      frontend: { sha256: "c".repeat(64), builtFromCommit: RELEASE_COMMIT },
      edgeFunctions: functions.map((name, index) => ({
        name,
        sha256: String(index + 1).repeat(64),
        builtFromCommit: RELEASE_COMMIT,
        deployedVersion: index + 1,
      })),
      manifestEvidence: evidence,
    },
    edgeRoutes: {
      functions: functions.map((name) => ({
        name,
        entrypoint: `backend/supabase/functions/${name}/index.ts`,
        sourceSha256: entrypointDigest,
        routes: [`GET /functions/v1/${name}/health`],
      })),
      placeholders: ["notification-worker"],
      inventoryEvidence: evidence,
    },
    configuration: {
      schemaVersion: 1,
      featureFlags: { beta: false },
    },
    legacyRuntimes: {
      services: [
        "admin-api-staging",
        "cloudflare-worker",
        "make-server-0dbf686f",
        "server",
      ].map((id) => ({ id, disposition: "retired", owner: "release-team" })),
      inventoryEvidence: evidence,
    },
    rollback: {
      targetCommit: ROLLBACK_COMMIT,
      procedureEvidence: evidence,
      rehearsalEvidence: evidence,
    },
    restore: {
      result: "pass",
      environmentIdentity: "restore-ref-001",
      rpoMinutes: 60,
      rtoMinutes: 120,
      observedRpoMinutes: 30,
      observedRtoMinutes: 90,
      evidence,
    },
    approval: {
      approver: "release-owner",
      approvedAt: NOW.toISOString(),
    },
  };

  return { root, manifest };
}

async function expectBlocked(mutator, expectedMessages) {
  const { root, manifest } = await createFixture();
  try {
    mutator(manifest);
    await assert.rejects(
      validateDeploymentReadiness({
        manifest,
        repoRoot: root,
        expectedCommit: RELEASE_COMMIT,
        now: NOW,
      }),
      (error) => {
        assert.ok(error instanceof ReadinessValidationError);
        for (const message of expectedMessages) {
          assert.ok(error.errors.some((entry) => entry.includes(message)), `missing error containing: ${message}`);
        }
        return true;
      },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("accepts complete, current, isolated staging evidence", async () => {
  const { root, manifest } = await createFixture();
  try {
    const result = await validateDeploymentReadiness({
      manifest,
      repoRoot: root,
      expectedCommit: RELEASE_COMMIT,
      now: NOW,
    });
    assert.equal(result.status, "ready");
    assert.deepEqual(result.deployableEdgeFunctions, ["admin-api", "classroom-api"]);
    assert.deepEqual(result.placeholderEdgeFunctions, ["notification-worker"]);
    assert.deepEqual(result.requiredSecretNames, ["SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_URL"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks stale evidence and a staging identity shared with production", async () => {
  await expectBlocked((manifest) => {
    manifest.generatedAt = "2026-06-01T00:00:00.000Z";
    manifest.environments.staging.identity = manifest.environments.production.identity;
  }, ["generatedAt is stale", "identities must be distinct", "matches the last audited live project"]);
});

test("blocks secret values even when all required secret names exist", async () => {
  await expectBlocked((manifest) => {
    manifest.secrets.secretValue = "must-never-be-recorded";
  }, ["secretValue is forbidden"]);
});

test("blocks migration drift and incomplete Edge inventories", async () => {
  await expectBlocked((manifest) => {
    manifest.migrations.appliedHead = "20260717090000";
    manifest.migrations.appliedVersionSetSha256 = "f".repeat(64);
    manifest.artifacts.edgeFunctions.pop();
    manifest.edgeRoutes.placeholders = [];
  }, ["appliedHead must match", "appliedVersionSetSha256 does not match", "artifacts.edgeFunctions names does not match", "edgeRoutes.placeholders does not match"]);
});

test("blocks tampered evidence and uncontained legacy services", async () => {
  await expectBlocked((manifest) => {
    manifest.rollback.rehearsalEvidence.sha256 = "f".repeat(64);
    manifest.legacyRuntimes.services[0].disposition = "active-uncontained";
  }, ["rehearsalEvidence.sha256 does not match", "is not contained or retired"]);
});

test("blocks source commits that differ from the checked-out release", async () => {
  await expectBlocked((manifest) => {
    manifest.source.commit = "d".repeat(40);
  }, ["does not match the selected immutable release commit", "frontend artifact was not built", "was not built from source.commit"]);
});

test("accepts a bounded, owned, unexpired read-only legacy bridge", async () => {
  const { root, manifest } = await createFixture();
  try {
    manifest.legacyRuntimes.services[0] = {
      id: "admin-api-staging",
      disposition: "approved-read-only-bridge",
      owner: "release-team",
      approvalExpiresAt: "2026-07-20T12:00:00.000Z",
    };
    const result = await validateDeploymentReadiness({
      manifest,
      repoRoot: root,
      expectedCommit: RELEASE_COMMIT,
      now: NOW,
    });
    assert.equal(result.status, "ready");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks evidence paths that traverse outside the repository", async () => {
  await expectBlocked((manifest) => {
    manifest.restore.evidence.path = "../outside.txt";
  }, ["restore.evidence.path must stay within the repository"]);
});
