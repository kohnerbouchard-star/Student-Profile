import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import * as base from "./release-platform-lib.mjs";
import { verifyEnvironmentNeutralFrontend } from "./release-environment-neutrality.mjs";

export const {
  COMMIT_PATTERN,
  ENVIRONMENTS,
  ReleasePlatformValidationError,
  SECRET_NAME_PATTERN,
  SHA256_PATTERN,
  canonicalJson,
  loadJson,
  repositoryReleaseFacts,
  sha256,
  sha256File,
  validateReleaseConfiguration,
} = base;

const PLACEHOLDER_PATTERN = /^(?:change-me|example|placeholder|todo(?:[_-].*)?|tbd(?:[_-].*)?|unknown(?:[_-].*)?|development|staging|production|0+)$/i;
const NEUTRALITY_VERIFIER = "release-environment-neutrality-v1";
const RELEASE_WORKFLOW = "Release Artifact Build";
const REQUIRED_BROWSER_ROOTS = ["index.html", "frontend", "admin", "player-terminal", "auth"];
const ADDITIONAL_BROWSER_ROOTS = ["player-terminal", "auth"];
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

function assertNoPlaceholder(value, label, errors) {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) {
    errors.push(`${label} is a placeholder`);
  }
}

function deterministicTarGzip(sourceRoot, archivePath) {
  const tar = spawnSync("tar", [
    "--sort=name",
    "--mtime=@0",
    "--owner=0",
    "--group=0",
    "--numeric-owner",
    "--format=ustar",
    "-cf",
    "-",
    "-C",
    sourceRoot,
    ".",
  ], { encoding: null, maxBuffer: MAX_ARCHIVE_BYTES });
  if (tar.status !== 0) {
    throw new Error(`tar failed while completing frontend artifact: ${tar.stderr?.toString() ?? "unknown error"}`);
  }
  const gzip = spawnSync("gzip", ["-n", "-9"], {
    input: tar.stdout,
    encoding: null,
    maxBuffer: MAX_ARCHIVE_BYTES,
  });
  if (gzip.status !== 0) {
    throw new Error(`gzip failed while completing frontend artifact: ${gzip.stderr?.toString() ?? "unknown error"}`);
  }
  return writeFile(archivePath, gzip.stdout);
}

async function completeBrowserArtifact({ manifest, repoRoot, outputRoot }) {
  const frontend = manifest.artifacts.find((artifact) => artifact.kind === "frontend");
  if (!frontend) throw new Error("release manifest is missing the frontend artifact");

  const archivePath = path.join(outputRoot, frontend.file);
  const stagingRoot = path.join(outputRoot, ".frontend-complete");
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });

  const extract = spawnSync("tar", ["-xzf", archivePath, "-C", stagingRoot], {
    encoding: "utf8",
    maxBuffer: MAX_ARCHIVE_BYTES,
  });
  if (extract.status !== 0) {
    throw new Error(`unable to expand base frontend artifact: ${extract.stderr || "unknown error"}`);
  }

  for (const relativePath of ADDITIONAL_BROWSER_ROOTS) {
    const source = path.join(repoRoot, relativePath);
    const target = path.join(stagingRoot, relativePath);
    if (!(await stat(source)).isDirectory()) {
      throw new Error(`required browser runtime root is not a directory: ${relativePath}`);
    }
    await cp(source, target, { recursive: true, force: false, errorOnExist: true });
  }

  await deterministicTarGzip(stagingRoot, archivePath);
  const metadata = await stat(archivePath);
  frontend.sha256 = await base.sha256File(archivePath);
  frontend.sizeBytes = metadata.size;
  manifest.artifactSetSha256 = base.sha256(base.canonicalJson(
    manifest.artifacts.map(({ file, sha256: digest, sizeBytes }) => ({
      file,
      sha256: digest,
      sizeBytes,
    })),
  ));

  const checksums = [
    ...manifest.artifacts.map((artifact) => `${artifact.sha256}  ${artifact.file}`),
    `${manifest.configuration.sha256}  ${manifest.configuration.file}`,
  ].sort();
  await writeFile(path.join(outputRoot, "checksums.sha256"), `${checksums.join("\n")}\n`);
  await rm(stagingRoot, { recursive: true, force: true });
}

async function repositoryHasCompleteBrowserSurface(repoRoot) {
  const states = await Promise.all(REQUIRED_BROWSER_ROOTS.map(async (relativePath) => {
    try {
      const metadata = await stat(path.join(repoRoot, relativePath));
      return relativePath === "index.html" ? metadata.isFile() : metadata.isDirectory();
    } catch {
      return false;
    }
  }));
  return states.every(Boolean);
}

export function validateEnvironmentManifest(manifest, options = {}) {
  const errors = [];
  if (manifest && typeof manifest === "object" && !Array.isArray(manifest)) {
    assertNoPlaceholder(manifest.identity, "environment identity", errors);
    assertNoPlaceholder(manifest.frontend?.provider, "frontend.provider", errors);
    assertNoPlaceholder(manifest.frontend?.identity, "frontend.identity", errors);
    assertNoPlaceholder(manifest.supabase?.organization, "supabase.organization", errors);
    assertNoPlaceholder(manifest.supabase?.projectRef, "supabase.projectRef", errors);
  }
  if (errors.length) throw new base.ReleasePlatformValidationError(errors);
  return base.validateEnvironmentManifest(manifest, options);
}

export function validateDistinctEnvironmentManifests(manifests) {
  const errors = [];
  if (!Array.isArray(manifests) || manifests.length !== 3) {
    throw new base.ReleasePlatformValidationError(["exactly three environment manifests are required"]);
  }
  const validated = [];
  for (const manifest of manifests) {
    try {
      validated.push(validateEnvironmentManifest(manifest));
    } catch (error) {
      if (error instanceof base.ReleasePlatformValidationError) errors.push(...error.errors);
      else throw error;
    }
  }
  const expected = ["development", "production", "staging"];
  const names = validated.map((item) => item.environment).sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    errors.push("development, staging, and production manifests are all required");
  }
  const identities = validated.map((item) => item.identity);
  if (new Set(identities).size !== identities.length) {
    errors.push("identity values must be distinct across environments");
  }
  const frontendIdentities = validated.map((item) => item.frontend.identity);
  if (new Set(frontendIdentities).size !== frontendIdentities.length) {
    errors.push("frontend.identity values must be distinct across environments");
  }
  if (errors.length) throw new base.ReleasePlatformValidationError(errors);
  return validated;
}

export async function buildImmutableRelease(options) {
  const neutrality = await verifyEnvironmentNeutralFrontend({ repoRoot: options.repoRoot });
  const manifest = await base.buildImmutableRelease(options);
  await completeBrowserArtifact({
    manifest,
    repoRoot: options.repoRoot,
    outputRoot: options.outputRoot,
  });
  const enrichedManifest = {
    ...manifest,
    environmentNeutrality: {
      status: "pass",
      verifier: NEUTRALITY_VERIFIER,
      scannedRoots: neutrality.scannedRoots,
      auditedProductionProjectRefSha256: neutrality.auditedProductionProjectRef
        ? base.sha256(neutrality.auditedProductionProjectRef)
        : null,
      auditedWorkerOriginSha256: neutrality.auditedWorkerOrigin
        ? base.sha256(neutrality.auditedWorkerOrigin)
        : null,
    },
  };
  await writeFile(
    path.join(options.outputRoot, "release-manifest.json"),
    base.canonicalJson(enrichedManifest),
  );
  return enrichedManifest;
}

export async function validateReleaseManifest(options) {
  const errors = [];
  const neutrality = options.manifest?.environmentNeutrality;
  if (neutrality?.status !== "pass") {
    errors.push("release environmentNeutrality.status must be pass");
  }
  if (neutrality?.verifier !== NEUTRALITY_VERIFIER) {
    errors.push(`release environmentNeutrality.verifier must be ${NEUTRALITY_VERIFIER}`);
  }
  if (!Array.isArray(neutrality?.scannedRoots) || neutrality.scannedRoots.length === 0) {
    errors.push("release environmentNeutrality.scannedRoots is required");
  } else if (await repositoryHasCompleteBrowserSurface(options.repoRoot)
      && !REQUIRED_BROWSER_ROOTS.every((root) => neutrality.scannedRoots.includes(root))) {
    errors.push(`release environmentNeutrality.scannedRoots must include ${REQUIRED_BROWSER_ROOTS.join(", ")}`);
  }
  const provenance = options.manifest?.provenance;
  if (provenance?.builder !== "github-actions") {
    errors.push("release provenance.builder must be github-actions");
  }
  if (provenance?.workflow !== RELEASE_WORKFLOW) {
    errors.push(`release provenance.workflow must be ${RELEASE_WORKFLOW}`);
  }
  if (provenance?.repository !== "kohnerbouchard-star/Student-Profile") {
    errors.push("release provenance.repository is invalid");
  }
  if (errors.length) throw new base.ReleasePlatformValidationError(errors);
  return base.validateReleaseManifest(options);
}

export async function validatePromotionRecord(options) {
  const {
    record,
    releaseManifest,
    expectedEnvironment,
    expectedSourceRunId,
    expectedSourceArtifactId,
    expectedEnvironmentManifestPath,
  } = options;
  const errors = [];
  if (record && releaseManifest) {
    if (record.configurationSha256 !== releaseManifest.configuration?.sha256) {
      errors.push("promotion configurationSha256 mismatch");
    }
    if (record.configurationVersion !== releaseManifest.configuration?.version) {
      errors.push("promotion configurationVersion mismatch");
    }
  }
  if (expectedSourceRunId !== undefined) {
    if (String(record?.sourceRunId ?? "") !== String(expectedSourceRunId)) {
      errors.push("promotion sourceRunId does not match workflow input");
    }
    if (String(releaseManifest?.provenance?.workflowRunId ?? "") !== String(expectedSourceRunId)) {
      errors.push("release provenance workflowRunId does not match workflow input");
    }
  }
  if (expectedSourceArtifactId !== undefined
      && String(record?.sourceArtifactId ?? "") !== String(expectedSourceArtifactId)) {
    errors.push("promotion sourceArtifactId does not match workflow input");
  }
  if (expectedEnvironmentManifestPath !== undefined
      && record?.environmentManifestEvidence?.path !== expectedEnvironmentManifestPath) {
    errors.push("promotion environment manifest path does not match workflow input");
  }
  if (expectedEnvironment === "production" && record?.stagingEvidence) {
    if (record.stagingEvidence.releaseManifestSha256 !== record.releaseManifestSha256) {
      errors.push("stagingEvidence releaseManifestSha256 mismatch");
    }
    if (record.stagingEvidence.configurationSha256 !== releaseManifest?.configuration?.sha256) {
      errors.push("stagingEvidence configurationSha256 mismatch");
    }
    if (String(record.stagingEvidence.sourceRunId ?? "") !== String(record.sourceRunId ?? "")) {
      errors.push("stagingEvidence sourceRunId mismatch");
    }
    if (String(record.stagingEvidence.sourceArtifactId ?? "") !== String(record.sourceArtifactId ?? "")) {
      errors.push("stagingEvidence sourceArtifactId mismatch");
    }
  }
  if (errors.length) throw new base.ReleasePlatformValidationError(errors);
  await validateReleaseManifest({
    manifest: releaseManifest,
    artifactRoot: options.artifactRoot,
    repoRoot: options.repoRoot,
    expectedCommit: record?.sourceCommit,
  });
  return base.validatePromotionRecord(options);
}
