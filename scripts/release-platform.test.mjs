import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ReleasePlatformValidationError,
  canonicalJson,
  sha256,
  validateDistinctEnvironmentManifests,
  validateEnvironmentManifest,
  validatePromotionRecord,
  validateReleaseConfiguration,
  validateReleaseManifest,
} from "./release-platform-lib.mjs";

async function write(root, relativePath, value) {
  const absolute = path.join(root, relativePath);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, value);
  return absolute;
}

function environmentManifest(environment, identity, frontendIdentity) {
  return {
    schemaVersion: 1,
    environment,
    githubEnvironment: environment,
    identity,
    dataPolicy: environment === "production" ? "production-controlled" : "synthetic-only",
    frontend: {
      provider: "approved-static-host",
      identity: frontendIdentity,
    },
    supabase: {
      organization: "EconovariaOrg",
      projectRef: identity,
    },
    secretNames: [
      "FRONTEND_DEPLOY_TOKEN",
      "SUPABASE_ACCESS_TOKEN",
      "SUPABASE_ANON_KEY",
      "SUPABASE_PROJECT_REF",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_URL",
    ],
  };
}

async function fixture() {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "econovaria-release-"));
  await write(repoRoot, "backend/supabase/migrations/20260101000000_init.sql", "select 1;\n");
  await write(repoRoot, "backend/supabase/functions/admin-api/index.ts", "export default true;\n");
  await write(repoRoot, "backend/supabase/functions/_shared/helper.ts", "export const shared = true;\n");
  const artifactRoot = path.join(repoRoot, "dist/release");
  const frontend = Buffer.from("frontend-artifact");
  const edge = Buffer.from("edge-artifact");
  await write(artifactRoot, "artifacts/frontend.tar.gz", frontend);
  await write(artifactRoot, "artifacts/edge-admin-api.tar.gz", edge);
  const configuration = {
    schemaVersion: 1,
    configurationVersion: "2026-07-20.1",
    featureFlags: {
      betaReleaseApproved: false,
      seedActivationAuthorized: false,
    },
  };
  const configurationText = canonicalJson(configuration);
  await write(artifactRoot, "release-configuration.json", configurationText);
  const artifacts = [
    {
      kind: "frontend",
      file: "artifacts/frontend.tar.gz",
      sha256: sha256(frontend),
      sizeBytes: frontend.length,
    },
    {
      kind: "edge-function",
      name: "admin-api",
      file: "artifacts/edge-admin-api.tar.gz",
      sha256: sha256(edge),
      sizeBytes: edge.length,
    },
  ];
  const manifest = {
    schemaVersion: 2,
    releaseId: `econovaria-${"a".repeat(40)}`,
    generatedAt: "2026-07-20T05:00:00.000Z",
    source: {
      repository: "kohnerbouchard-star/Student-Profile",
      ref: "refs/heads/main",
      commit: "a".repeat(40),
      mergedIntoMain: true,
    },
    migrations: {
      head: "20260101000000",
      count: 1,
      versionSetSha256: sha256("20260101000000\n"),
    },
    configuration: {
      schemaVersion: 1,
      version: configuration.configurationVersion,
      featureFlags: configuration.featureFlags,
      file: "release-configuration.json",
      sha256: sha256(configurationText),
    },
    artifacts,
    artifactSetSha256: sha256(canonicalJson(artifacts.map(({ file, sha256: digest, sizeBytes }) => ({
      file,
      sha256: digest,
      sizeBytes,
    })))),
    provenance: {
      builder: "github-actions",
      workflow: "Release Artifact Build",
      workflowRunId: "123",
      workflowRunAttempt: "1",
      repository: "kohnerbouchard-star/Student-Profile",
      sourceCommit: "a".repeat(40),
      deterministicArchive: "gnu-tar+gzip-n",
    },
    promotionPolicy: {
      rebuildAllowed: false,
      requiredSequence: ["staging", "production"],
      identity: "artifactSetSha256",
    },
  };
  const releaseManifestPath = await write(artifactRoot, "release-manifest.json", canonicalJson(manifest));
  return { repoRoot, artifactRoot, configuration, manifest, releaseManifestPath };
}

async function evidence(root, name, body) {
  const relativePath = `docs/operations/evidence/${name}`;
  const absolute = await write(root, relativePath, `${body}\n`);
  return {
    path: relativePath,
    sha256: sha256(await readFile(absolute)),
    capturedAt: "2026-07-20T05:15:00.000Z",
  };
}

test("environment manifests require distinct identities and names-only secrets", () => {
  const manifests = [
    environmentManifest("development", "devproject01", "dev-static-01"),
    environmentManifest("staging", "stageproject01", "stage-static-01"),
    environmentManifest("production", "prodproject01", "prod-static-01"),
  ];
  assert.equal(validateDistinctEnvironmentManifests(manifests).length, 3);
  const duplicate = structuredClone(manifests);
  duplicate[1].identity = duplicate[0].identity;
  duplicate[1].supabase.projectRef = duplicate[0].supabase.projectRef;
  assert.throws(
    () => validateDistinctEnvironmentManifests(duplicate),
    ReleasePlatformValidationError,
  );
});

test("environment manifests reject secret values and placeholders", () => {
  const manifest = environmentManifest("staging", "stageproject01", "stage-static-01");
  manifest.supabase.serviceRoleKey = "not-allowed";
  assert.throws(() => validateEnvironmentManifest(manifest), /secret names only/);
  const placeholder = environmentManifest("staging", "staging", "stage-static-01");
  assert.throws(() => validateEnvironmentManifest(placeholder), /placeholder/);
});

test("release configuration records a version and boolean feature flags", () => {
  assert.equal(validateReleaseConfiguration({
    schemaVersion: 1,
    configurationVersion: "2026-07-20.1",
    featureFlags: { betaReleaseApproved: false },
  }).configurationVersion, "2026-07-20.1");
  assert.throws(() => validateReleaseConfiguration({
    schemaVersion: 1,
    configurationVersion: "todo",
    featureFlags: { betaReleaseApproved: "no" },
  }), ReleasePlatformValidationError);
});

test("release manifest validates exact artifact bytes and repository facts", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.repoRoot, { recursive: true, force: true }));
  const validated = await validateReleaseManifest({
    manifest: data.manifest,
    artifactRoot: data.artifactRoot,
    repoRoot: data.repoRoot,
    expectedCommit: "a".repeat(40),
  });
  assert.equal(validated.artifactSetSha256, data.manifest.artifactSetSha256);
  await writeFile(path.join(data.artifactRoot, "artifacts/frontend.tar.gz"), "tampered");
  await assert.rejects(
    validateReleaseManifest({
      manifest: data.manifest,
      artifactRoot: data.artifactRoot,
      repoRoot: data.repoRoot,
      expectedCommit: "a".repeat(40),
    }),
    /digest mismatch|size mismatch/,
  );
});

test("production promotion requires exact staging evidence and rollback target", async (t) => {
  const data = await fixture();
  t.after(() => rm(data.repoRoot, { recursive: true, force: true }));
  const environmentManifestEvidence = await evidence(data.repoRoot, "production-environment.json", "production environment record");
  const rollbackManifestEvidence = await evidence(data.repoRoot, "rollback-release.json", "previous immutable release");
  const stagingEvidencePointer = await evidence(data.repoRoot, "staging-smoke.json", "player=pass admin=pass");
  const record = {
    schemaVersion: 1,
    promotionId: "promotion-production-20260720-001",
    targetEnvironment: "production",
    releaseId: data.manifest.releaseId,
    sourceCommit: data.manifest.source.commit,
    sourceRunId: "123",
    sourceArtifactId: "456",
    releaseManifestSha256: sha256(await readFile(data.releaseManifestPath)),
    artifactSetSha256: data.manifest.artifactSetSha256,
    environmentManifestEvidence,
    approval: {
      githubEnvironment: "production",
      approver: "release-owner",
      approvedAt: "2026-07-20T05:20:00.000Z",
    },
    deployment: {
      operator: "release-operator",
      requestedAt: "2026-07-20T05:21:00.000Z",
      mode: "deploy",
    },
    rollback: {
      releaseId: `econovaria-${"b".repeat(40)}`,
      artifactSetSha256: "b".repeat(64),
      manifestEvidence: rollbackManifestEvidence,
    },
    stagingEvidence: {
      releaseId: data.manifest.releaseId,
      artifactSetSha256: data.manifest.artifactSetSha256,
      playerSmoke: "pass",
      adminSmoke: "pass",
      evidence: stagingEvidencePointer,
    },
  };
  const validated = await validatePromotionRecord({
    record,
    releaseManifest: data.manifest,
    releaseManifestPath: data.releaseManifestPath,
    artifactRoot: data.artifactRoot,
    repoRoot: data.repoRoot,
    expectedEnvironment: "production",
  });
  assert.equal(validated.targetEnvironment, "production");
  const incomplete = structuredClone(record);
  delete incomplete.stagingEvidence;
  await assert.rejects(
    validatePromotionRecord({
      record: incomplete,
      releaseManifest: data.manifest,
      releaseManifestPath: data.releaseManifestPath,
      artifactRoot: data.artifactRoot,
      repoRoot: data.repoRoot,
      expectedEnvironment: "production",
    }),
    /requires stagingEvidence/,
  );
});

test("promotion workflow downloads an artifact by ID and never rebuilds", async () => {
  const workflow = await readFile(".github/workflows/release-promote.yml", "utf8");
  assert.match(workflow, /artifact-ids:/);
  assert.match(workflow, /environment:\s*\$\{\{ inputs\.target_environment \}\}/);
  assert.doesNotMatch(workflow, /release:build/);
  assert.doesNotMatch(workflow, /npm\s+run\s+build/);
  assert.match(workflow, /validate-promotion/);
});
