import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

export const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
export const SHA256_PATTERN = /^[a-f0-9]{64}$/;
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]+$/;
export const ENVIRONMENTS = ["development", "staging", "production"];

const MIGRATION_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/;
const PLACEHOLDER_PATTERN = /^(?:change-me|example|placeholder|todo|tbd|unknown|development|staging|production|0+)$/i;
const FORBIDDEN_VALUE_KEYS = new Set([
  "apikey",
  "credential",
  "credentials",
  "databaseurl",
  "password",
  "privatekey",
  "secret",
  "secretvalue",
  "secretvalues",
  "servicerolekey",
  "token",
  "value",
  "values",
]);
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;

export class ReleasePlatformValidationError extends Error {
  constructor(errors) {
    super(`Release platform validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "ReleasePlatformValidationError";
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function push(errors, condition, message) {
  if (!condition) errors.push(message);
}

function normalizedKey(key) {
  return key.replace(/[^a-z]/gi, "").toLowerCase();
}

function rejectSensitiveValueFields(value, pointer, errors) {
  if (Array.isArray(value)) {
    value.forEach((child, index) => rejectSensitiveValueFields(child, `${pointer}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_VALUE_KEYS.has(normalizedKey(key))) {
      errors.push(`${pointer}.${key} is forbidden; release records contain secret names only`);
    }
    rejectSensitiveValueFields(child, `${pointer}.${key}`, errors);
  }
}

function parseTimestamp(value, label, errors) {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  push(errors, Number.isFinite(timestamp), `${label} must be an ISO-8601 timestamp`);
  return timestamp;
}

function assertNonPlaceholder(value, label, errors, minimum = 6) {
  push(errors, typeof value === "string" && value.length >= minimum, `${label} is required`);
  if (typeof value === "string") {
    push(errors, !PLACEHOLDER_PATTERN.test(value), `${label} is a placeholder`);
  }
}

function sortedUniqueStrings(value, label, errors) {
  push(errors, Array.isArray(value), `${label} must be an array`);
  if (!Array.isArray(value)) return [];
  push(errors, value.every((item) => typeof item === "string"), `${label} must contain only strings`);
  const sorted = [...new Set(value)].sort();
  push(errors, sorted.length === value.length, `${label} must not contain duplicates`);
  push(errors, JSON.stringify(value) === JSON.stringify(sorted), `${label} must be sorted`);
  return sorted;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function canonicalJson(value) {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function sha256File(filePath) {
  return sha256(await readFile(filePath));
}

async function ensureFile(filePath, label, errors) {
  try {
    push(errors, (await stat(filePath)).isFile(), `${label} must be a file`);
    return true;
  } catch {
    errors.push(`${label} does not exist: ${filePath}`);
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function validateEnvironmentManifest(manifest, { expectedEnvironment } = {}) {
  const errors = [];
  push(errors, isObject(manifest), "environment manifest must be an object");
  if (!isObject(manifest)) throw new ReleasePlatformValidationError(errors);
  rejectSensitiveValueFields(manifest, "environment", errors);
  push(errors, manifest.schemaVersion === 1, "environment schemaVersion must be 1");
  push(errors, ENVIRONMENTS.includes(manifest.environment), "environment name is invalid");
  if (expectedEnvironment) {
    push(errors, manifest.environment === expectedEnvironment, `environment must be ${expectedEnvironment}`);
  }
  push(errors, manifest.githubEnvironment === manifest.environment, "githubEnvironment must match environment");
  assertNonPlaceholder(manifest.identity, "environment identity", errors);
  push(errors, manifest.dataPolicy === "synthetic-only" || manifest.environment === "production", "non-production dataPolicy must be synthetic-only");
  if (manifest.environment === "production") {
    push(errors, manifest.dataPolicy === "production-controlled", "production dataPolicy must be production-controlled");
  }
  const secretNames = sortedUniqueStrings(manifest.secretNames, "secretNames", errors);
  for (const name of secretNames) {
    push(errors, SECRET_NAME_PATTERN.test(name), `invalid secret name: ${name}`);
  }
  push(errors, isObject(manifest.frontend), "frontend deployment identity is required");
  if (isObject(manifest.frontend)) {
    assertNonPlaceholder(manifest.frontend.identity, "frontend.identity", errors);
    assertNonPlaceholder(manifest.frontend.provider, "frontend.provider", errors, 2);
  }
  push(errors, isObject(manifest.supabase), "supabase deployment identity is required");
  if (isObject(manifest.supabase)) {
    assertNonPlaceholder(manifest.supabase.projectRef, "supabase.projectRef", errors);
    assertNonPlaceholder(manifest.supabase.organization, "supabase.organization", errors);
    push(errors, manifest.supabase.projectRef === manifest.identity, "environment identity must equal supabase.projectRef");
  }
  if (errors.length) throw new ReleasePlatformValidationError(errors);
  return manifest;
}

export function validateDistinctEnvironmentManifests(manifests) {
  const errors = [];
  push(errors, Array.isArray(manifests) && manifests.length === 3, "exactly three environment manifests are required");
  if (!Array.isArray(manifests)) throw new ReleasePlatformValidationError(errors);
  const validated = [];
  for (const manifest of manifests) {
    try {
      validated.push(validateEnvironmentManifest(manifest));
    } catch (error) {
      if (error instanceof ReleasePlatformValidationError) errors.push(...error.errors);
      else throw error;
    }
  }
  const names = validated.map((item) => item.environment).sort();
  push(errors, JSON.stringify(names) === JSON.stringify(ENVIRONMENTS), "development, staging, and production manifests are all required");
  for (const field of ["identity", "frontend.identity"]) {
    const values = validated.map((item) => field === "identity" ? item.identity : item.frontend.identity);
    push(errors, new Set(values).size === values.length, `${field} values must be distinct across environments`);
  }
  if (errors.length) throw new ReleasePlatformValidationError(errors);
  return validated;
}

export function validateReleaseConfiguration(configuration) {
  const errors = [];
  push(errors, isObject(configuration), "release configuration must be an object");
  if (!isObject(configuration)) throw new ReleasePlatformValidationError(errors);
  rejectSensitiveValueFields(configuration, "configuration", errors);
  push(errors, configuration.schemaVersion === 1, "configuration.schemaVersion must be 1");
  assertNonPlaceholder(configuration.configurationVersion, "configuration.configurationVersion", errors);
  push(errors, isObject(configuration.featureFlags), "configuration.featureFlags must be an object");
  if (isObject(configuration.featureFlags)) {
    const entries = Object.entries(configuration.featureFlags);
    push(errors, entries.length > 0, "configuration.featureFlags must not be empty");
    for (const [name, enabled] of entries) {
      push(errors, /^[a-z][a-zA-Z0-9]+$/.test(name), `invalid feature flag name: ${name}`);
      push(errors, typeof enabled === "boolean", `feature flag ${name} must be boolean`);
    }
  }
  if (errors.length) throw new ReleasePlatformValidationError(errors);
  return configuration;
}

export async function repositoryReleaseFacts(repoRoot) {
  const migrationRoot = path.join(repoRoot, "backend/supabase/migrations");
  const migrationFiles = (await readdir(migrationRoot))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const malformed = migrationFiles.filter((name) => !MIGRATION_PATTERN.test(name));
  if (malformed.length) throw new Error(`Malformed migrations: ${malformed.join(", ")}`);
  const versions = migrationFiles.map((name) => name.match(MIGRATION_PATTERN)[1]);

  const functionsRoot = path.join(repoRoot, "backend/supabase/functions");
  const entries = await readdir(functionsRoot, { withFileTypes: true });
  const edgeFunctions = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "_shared") continue;
    try {
      if ((await stat(path.join(functionsRoot, entry.name, "index.ts"))).isFile()) edgeFunctions.push(entry.name);
    } catch {
      // Non-deployable placeholder directories are excluded from immutable artifacts.
    }
  }
  edgeFunctions.sort();

  return {
    migrationCount: versions.length,
    migrationHead: versions.at(-1) ?? null,
    migrationVersionSetSha256: sha256(`${versions.join("\n")}\n`),
    edgeFunctions,
  };
}

async function copyRoot(repoRoot, relativePath, stagingRoot) {
  const source = path.join(repoRoot, relativePath);
  const target = path.join(stagingRoot, relativePath);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(source, target, { recursive: true, force: false, errorOnExist: true });
}

async function writeDeterministicTarGzip(sourceRoot, archivePath) {
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
  if (tar.status !== 0) throw new Error(`tar failed: ${tar.stderr?.toString() ?? "unknown error"}`);
  const gzip = spawnSync("gzip", ["-n", "-9"], {
    input: tar.stdout,
    encoding: null,
    maxBuffer: MAX_ARCHIVE_BYTES,
  });
  if (gzip.status !== 0) throw new Error(`gzip failed: ${gzip.stderr?.toString() ?? "unknown error"}`);
  await writeFile(archivePath, gzip.stdout);
}

async function artifactRecord(outputRoot, fileName, kind, extra = {}) {
  const absolute = path.join(outputRoot, fileName);
  const metadata = await stat(absolute);
  return {
    kind,
    file: fileName,
    sha256: await sha256File(absolute),
    sizeBytes: metadata.size,
    ...extra,
  };
}

export async function buildImmutableRelease({ repoRoot, outputRoot, commit, configurationPath }) {
  if (!COMMIT_PATTERN.test(commit)) throw new Error("--commit must be a full lowercase commit SHA");
  const git = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" });
  if (git.status !== 0) throw new Error("Unable to resolve repository HEAD");
  if (git.stdout.trim() !== commit) throw new Error(`Checked-out HEAD ${git.stdout.trim()} does not equal selected commit ${commit}`);

  const configuration = validateReleaseConfiguration(await readJson(path.join(repoRoot, configurationPath)));
  const facts = await repositoryReleaseFacts(repoRoot);
  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(path.join(outputRoot, "artifacts"), { recursive: true });
  const workRoot = path.join(outputRoot, ".work");
  await mkdir(workRoot, { recursive: true });

  const frontendStage = path.join(workRoot, "frontend");
  await mkdir(frontendStage, { recursive: true });
  for (const relativePath of ["index.html", "frontend", "admin", "assets"]) {
    await copyRoot(repoRoot, relativePath, frontendStage);
  }
  const frontendFile = "artifacts/frontend.tar.gz";
  await writeDeterministicTarGzip(frontendStage, path.join(outputRoot, frontendFile));
  const artifacts = [await artifactRecord(outputRoot, frontendFile, "frontend")];

  const functionsRoot = path.join(repoRoot, "backend/supabase/functions");
  const rootEntries = await readdir(functionsRoot, { withFileTypes: true });
  const supportFiles = rootEntries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  for (const functionName of facts.edgeFunctions) {
    const stage = path.join(workRoot, `edge-${functionName}`);
    await mkdir(path.join(stage, "backend/supabase/functions"), { recursive: true });
    await copyRoot(repoRoot, "backend/src", stage);
    await copyRoot(repoRoot, `backend/supabase/functions/${functionName}`, stage);
    try {
      await copyRoot(repoRoot, "backend/supabase/functions/_shared", stage);
    } catch {
      // A repository without shared function support remains valid.
    }
    for (const fileName of supportFiles) {
      await copyRoot(repoRoot, `backend/supabase/functions/${fileName}`, stage);
    }
    const file = `artifacts/edge-${functionName}.tar.gz`;
    await writeDeterministicTarGzip(stage, path.join(outputRoot, file));
    artifacts.push(await artifactRecord(outputRoot, file, "edge-function", { name: functionName }));
  }

  const configurationSnapshot = canonicalJson(configuration);
  await writeFile(path.join(outputRoot, "release-configuration.json"), configurationSnapshot);
  const configurationSha256 = sha256(configurationSnapshot);
  const artifactSetSha256 = sha256(canonicalJson(artifacts.map(({ file, sha256: digest, sizeBytes }) => ({ file, sha256: digest, sizeBytes }))));
  const manifest = {
    schemaVersion: 2,
    releaseId: `econovaria-${commit}`,
    generatedAt: new Date().toISOString(),
    source: {
      repository: "kohnerbouchard-star/Student-Profile",
      ref: "refs/heads/main",
      commit,
      mergedIntoMain: true,
    },
    migrations: {
      head: facts.migrationHead,
      count: facts.migrationCount,
      versionSetSha256: facts.migrationVersionSetSha256,
    },
    configuration: {
      schemaVersion: configuration.schemaVersion,
      version: configuration.configurationVersion,
      featureFlags: configuration.featureFlags,
      file: "release-configuration.json",
      sha256: configurationSha256,
    },
    artifacts,
    artifactSetSha256,
    provenance: {
      builder: "github-actions",
      workflow: process.env.GITHUB_WORKFLOW ?? "local",
      workflowRunId: process.env.GITHUB_RUN_ID ?? "local",
      workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "local",
      repository: process.env.GITHUB_REPOSITORY ?? "kohnerbouchard-star/Student-Profile",
      sourceCommit: commit,
      toolingCommit: process.env.RELEASE_TOOLING_COMMIT ?? commit,
      deterministicArchive: "gnu-tar+gzip-n",
    },
    promotionPolicy: {
      rebuildAllowed: false,
      requiredSequence: ["staging", "production"],
      identity: "artifactSetSha256",
    },
  };
  await writeFile(path.join(outputRoot, "release-manifest.json"), canonicalJson(manifest));
  const checksums = [
    ...artifacts.map((artifact) => `${artifact.sha256}  ${artifact.file}`),
    `${configurationSha256}  release-configuration.json`,
  ].sort();
  await writeFile(path.join(outputRoot, "checksums.sha256"), `${checksums.join("\n")}\n`);
  await rm(workRoot, { recursive: true, force: true });
  return manifest;
}

export async function validateReleaseManifest({ manifest, artifactRoot, repoRoot, expectedCommit }) {
  const errors = [];
  push(errors, isObject(manifest), "release manifest must be an object");
  if (!isObject(manifest)) throw new ReleasePlatformValidationError(errors);
  rejectSensitiveValueFields(manifest, "release", errors);
  push(errors, manifest.schemaVersion === 2, "release schemaVersion must be 2");
  assertNonPlaceholder(manifest.releaseId, "releaseId", errors);
  parseTimestamp(manifest.generatedAt, "generatedAt", errors);
  push(errors, isObject(manifest.source), "source is required");
  if (isObject(manifest.source)) {
    push(errors, manifest.source.repository === "kohnerbouchard-star/Student-Profile", "source.repository is incorrect");
    push(errors, manifest.source.ref === "refs/heads/main", "source.ref must be refs/heads/main");
    push(errors, manifest.source.mergedIntoMain === true, "source.mergedIntoMain must be true");
    push(errors, COMMIT_PATTERN.test(manifest.source.commit ?? ""), "source.commit must be a full SHA");
    if (expectedCommit) push(errors, manifest.source.commit === expectedCommit, "source.commit does not match expected commit");
  }
  const facts = await repositoryReleaseFacts(repoRoot);
  push(errors, manifest.migrations?.head === facts.migrationHead, "migration head does not match repository");
  push(errors, manifest.migrations?.count === facts.migrationCount, "migration count does not match repository");
  push(errors, manifest.migrations?.versionSetSha256 === facts.migrationVersionSetSha256, "migration version digest does not match repository");

  const configurationPath = path.join(artifactRoot, manifest.configuration?.file ?? "");
  if (await ensureFile(configurationPath, "release configuration", errors)) {
    const configurationBuffer = await readFile(configurationPath);
    push(errors, sha256(configurationBuffer) === manifest.configuration.sha256, "release configuration digest mismatch");
    try {
      const configuration = validateReleaseConfiguration(JSON.parse(configurationBuffer.toString("utf8")));
      push(errors, configuration.configurationVersion === manifest.configuration.version, "configuration version mismatch");
      push(errors, JSON.stringify(configuration.featureFlags) === JSON.stringify(manifest.configuration.featureFlags), "feature flags mismatch");
    } catch (error) {
      if (error instanceof ReleasePlatformValidationError) errors.push(...error.errors);
      else throw error;
    }
  }

  const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
  push(errors, artifacts.length === facts.edgeFunctions.length + 1, "artifact inventory count is incorrect");
  const frontend = artifacts.filter((item) => item?.kind === "frontend");
  push(errors, frontend.length === 1, "exactly one frontend artifact is required");
  const edgeNames = artifacts.filter((item) => item?.kind === "edge-function").map((item) => item.name).sort();
  push(errors, JSON.stringify(edgeNames) === JSON.stringify(facts.edgeFunctions), "Edge Function artifact inventory is incomplete");
  for (const artifact of artifacts) {
    push(errors, typeof artifact?.file === "string" && artifact.file.startsWith("artifacts/") && !artifact.file.includes(".."), "artifact file path is invalid");
    push(errors, SHA256_PATTERN.test(artifact?.sha256 ?? ""), `artifact ${artifact?.file ?? "unknown"} digest is invalid`);
    push(errors, Number.isInteger(artifact?.sizeBytes) && artifact.sizeBytes > 0, `artifact ${artifact?.file ?? "unknown"} size is invalid`);
    const absolute = path.join(artifactRoot, artifact?.file ?? "invalid");
    if (await ensureFile(absolute, `artifact ${artifact?.file ?? "unknown"}`, errors)) {
      const metadata = await stat(absolute);
      push(errors, metadata.size === artifact.sizeBytes, `artifact ${artifact.file} size mismatch`);
      push(errors, await sha256File(absolute) === artifact.sha256, `artifact ${artifact.file} digest mismatch`);
    }
  }
  const expectedSetDigest = sha256(canonicalJson(artifacts.map(({ file, sha256: digest, sizeBytes }) => ({ file, sha256: digest, sizeBytes }))));
  push(errors, manifest.artifactSetSha256 === expectedSetDigest, "artifactSetSha256 is invalid");
  push(errors, manifest.provenance?.sourceCommit === manifest.source?.commit, "provenance source commit mismatch");
  push(errors, manifest.promotionPolicy?.rebuildAllowed === false, "promotion must forbid rebuilds");
  push(errors, JSON.stringify(manifest.promotionPolicy?.requiredSequence) === JSON.stringify(["staging", "production"]), "promotion sequence must be staging then production");
  if (errors.length) throw new ReleasePlatformValidationError(errors);
  return manifest;
}

async function validateEvidencePointer(pointer, label, repoRoot, errors) {
  push(errors, isObject(pointer), `${label} is required`);
  if (!isObject(pointer)) return;
  push(errors, typeof pointer.path === "string" && pointer.path.startsWith("docs/operations/evidence/") && !pointer.path.includes(".."), `${label}.path is invalid`);
  push(errors, SHA256_PATTERN.test(pointer.sha256 ?? ""), `${label}.sha256 is invalid`);
  parseTimestamp(pointer.capturedAt, `${label}.capturedAt`, errors);
  const absolute = path.join(repoRoot, pointer.path ?? "invalid");
  if (await ensureFile(absolute, label, errors) && SHA256_PATTERN.test(pointer.sha256 ?? "")) {
    push(errors, await sha256File(absolute) === pointer.sha256, `${label}.sha256 does not match its file`);
  }
}

export async function validatePromotionRecord({ record, releaseManifest, releaseManifestPath, artifactRoot, repoRoot, expectedEnvironment }) {
  const errors = [];
  push(errors, isObject(record), "promotion record must be an object");
  if (!isObject(record)) throw new ReleasePlatformValidationError(errors);
  rejectSensitiveValueFields(record, "promotion", errors);
  push(errors, record.schemaVersion === 1, "promotion schemaVersion must be 1");
  push(errors, ["staging", "production"].includes(record.targetEnvironment), "targetEnvironment must be staging or production");
  push(errors, record.targetEnvironment === expectedEnvironment, `targetEnvironment must be ${expectedEnvironment}`);
  assertNonPlaceholder(record.promotionId, "promotionId", errors);
  push(errors, record.releaseId === releaseManifest.releaseId, "promotion releaseId mismatch");
  push(errors, record.sourceCommit === releaseManifest.source?.commit, "promotion sourceCommit mismatch");
  push(errors, record.artifactSetSha256 === releaseManifest.artifactSetSha256, "promotion artifactSetSha256 mismatch");
  push(errors, /^\d+$/.test(String(record.sourceRunId ?? "")), "sourceRunId must be numeric");
  push(errors, /^\d+$/.test(String(record.sourceArtifactId ?? "")), "sourceArtifactId must be numeric");
  push(errors, SHA256_PATTERN.test(record.releaseManifestSha256 ?? ""), "releaseManifestSha256 is invalid");
  if (SHA256_PATTERN.test(record.releaseManifestSha256 ?? "")) {
    push(errors, await sha256File(releaseManifestPath) === record.releaseManifestSha256, "releaseManifestSha256 mismatch");
  }
  push(errors, record.approval?.githubEnvironment === expectedEnvironment, "approval.githubEnvironment mismatch");
  assertNonPlaceholder(record.approval?.approver, "approval.approver", errors, 2);
  parseTimestamp(record.approval?.approvedAt, "approval.approvedAt", errors);
  assertNonPlaceholder(record.deployment?.operator, "deployment.operator", errors, 2);
  parseTimestamp(record.deployment?.requestedAt, "deployment.requestedAt", errors);
  push(errors, record.deployment?.mode === "deploy", "deployment.mode must be deploy");
  await validateEvidencePointer(record.environmentManifestEvidence, "environmentManifestEvidence", repoRoot, errors);
  push(errors, isObject(record.rollback), "rollback target is required");
  if (isObject(record.rollback)) {
    assertNonPlaceholder(record.rollback.releaseId, "rollback.releaseId", errors);
    push(errors, record.rollback.releaseId !== record.releaseId, "rollback.releaseId must differ from the promoted release");
    push(errors, SHA256_PATTERN.test(record.rollback.artifactSetSha256 ?? ""), "rollback.artifactSetSha256 is invalid");
    await validateEvidencePointer(record.rollback.manifestEvidence, "rollback.manifestEvidence", repoRoot, errors);
  }
  if (expectedEnvironment === "production") {
    push(errors, isObject(record.stagingEvidence), "production promotion requires stagingEvidence");
    if (isObject(record.stagingEvidence)) {
      push(errors, record.stagingEvidence.releaseId === record.releaseId, "stagingEvidence releaseId mismatch");
      push(errors, record.stagingEvidence.artifactSetSha256 === record.artifactSetSha256, "stagingEvidence artifactSetSha256 mismatch");
      push(errors, record.stagingEvidence.playerSmoke === "pass", "staging Player smoke must pass");
      push(errors, record.stagingEvidence.adminSmoke === "pass", "staging Admin smoke must pass");
      await validateEvidencePointer(record.stagingEvidence.evidence, "stagingEvidence.evidence", repoRoot, errors);
    }
  }
  try {
    await validateReleaseManifest({
      manifest: releaseManifest,
      artifactRoot,
      repoRoot,
      expectedCommit: record.sourceCommit,
    });
  } catch (error) {
    if (error instanceof ReleasePlatformValidationError) errors.push(...error.errors);
    else throw error;
  }
  if (errors.length) throw new ReleasePlatformValidationError(errors);
  return record;
}

export async function loadJson(filePath) {
  return readJson(filePath);
}
