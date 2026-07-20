import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const COMMIT_PATTERN = /^[a-f0-9]{40}$/;
const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]+$/;
const MIGRATION_PATTERN = /^(\d{14})_[a-z0-9_]+\.sql$/;
const ALLOWED_LEGACY_DISPOSITIONS = new Set([
  "contained",
  "retired",
  "approved-read-only-bridge",
]);
const REQUIRED_LEGACY_RUNTIMES = [
  "admin-api-staging",
  "cloudflare-worker",
  "make-server-0dbf686f",
  "server",
];
const SENSITIVE_VALUE_KEYS = new Set([
  "apikey",
  "credential",
  "credentials",
  "databaseurl",
  "password",
  "secret",
  "secretvalue",
  "secretvalues",
  "servicerolekey",
  "token",
  "value",
  "values",
]);
const PLACEHOLDER_PATTERN = /^(?:change-me|example|placeholder|todo|tbd|unknown|development|staging|production|0+)$/i;
const DEPLOYMENT_EVIDENCE_MAX_AGE_MS = 72 * 60 * 60 * 1000;
const LEGACY_EVIDENCE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const RECOVERY_EVIDENCE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MANIFEST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;

export class ReadinessValidationError extends Error {
  constructor(errors) {
    super(`Staging readiness is blocked:\n- ${errors.join("\n- ")}`);
    this.name = "ReadinessValidationError";
    this.errors = errors;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function push(errors, condition, message) {
  if (!condition) errors.push(message);
}

function parseTime(value, label, errors) {
  const time = typeof value === "string" ? Date.parse(value) : Number.NaN;
  push(errors, Number.isFinite(time), `${label} must be an ISO-8601 timestamp`);
  return time;
}

function validateFreshTime(value, label, nowMs, maxAgeMs, errors) {
  const time = parseTime(value, label, errors);
  if (!Number.isFinite(time)) return;
  push(errors, time <= nowMs + FUTURE_SKEW_MS, `${label} cannot be in the future`);
  push(errors, nowMs - time <= maxAgeMs, `${label} is stale`);
}

function rejectSensitiveValueFields(value, pointer, errors) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectSensitiveValueFields(item, `${pointer}[${index}]`, errors));
    return;
  }
  if (!isObject(value)) return;

  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z]/gi, "").toLowerCase();
    if (SENSITIVE_VALUE_KEYS.has(normalized)) {
      errors.push(`${pointer}.${key} is forbidden; manifests record secret names only, never values`);
    }
    rejectSensitiveValueFields(child, `${pointer}.${key}`, errors);
  }
}

async function listFilesRecursively(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await listFilesRecursively(absolute));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

async function sha256File(absolutePath) {
  return createHash("sha256").update(await readFile(absolutePath)).digest("hex");
}

async function resolveRepositoryFile(repoRoot, relativePath, label, errors) {
  if (typeof relativePath !== "string" || relativePath.length === 0) {
    errors.push(`${label}.path is required`);
    return null;
  }
  if (path.isAbsolute(relativePath) || path.normalize(relativePath).startsWith(`..${path.sep}`)) {
    errors.push(`${label}.path must stay within the repository`);
    return null;
  }

  try {
    const [rootReal, fileReal] = await Promise.all([
      realpath(repoRoot),
      realpath(path.resolve(repoRoot, relativePath)),
    ]);
    if (fileReal !== rootReal && !fileReal.startsWith(`${rootReal}${path.sep}`)) {
      errors.push(`${label}.path resolves outside the repository`);
      return null;
    }
    if (!(await stat(fileReal)).isFile()) {
      errors.push(`${label}.path must point to a file`);
      return null;
    }
    return fileReal;
  } catch {
    errors.push(`${label}.path does not exist: ${relativePath}`);
    return null;
  }
}

async function validateEvidence(pointer, label, repoRoot, nowMs, maxAgeMs, errors) {
  if (!isObject(pointer)) {
    errors.push(`${label} evidence pointer is required`);
    return;
  }
  push(errors, SHA256_PATTERN.test(pointer.sha256 ?? ""), `${label}.sha256 must be a lowercase SHA-256 digest`);
  validateFreshTime(pointer.capturedAt, `${label}.capturedAt`, nowMs, maxAgeMs, errors);
  const absolute = await resolveRepositoryFile(repoRoot, pointer.path, label, errors);
  if (absolute && SHA256_PATTERN.test(pointer.sha256 ?? "")) {
    const actual = await sha256File(absolute);
    push(errors, actual === pointer.sha256, `${label}.sha256 does not match ${pointer.path}`);
  }
}

async function repositoryFacts(repoRoot) {
  const migrationRoot = path.join(repoRoot, "backend/supabase/migrations");
  const migrationFiles = (await readdir(migrationRoot))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  const malformed = migrationFiles.filter((name) => !MIGRATION_PATTERN.test(name));
  if (malformed.length > 0) {
    throw new Error(`Repository contains malformed migrations: ${malformed.join(", ")}`);
  }
  const migrationVersions = migrationFiles.map((name) => name.match(MIGRATION_PATTERN)[1]);
  const migrationVersionSetSha256 = createHash("sha256")
    .update(`${migrationVersions.join("\n")}\n`)
    .digest("hex");

  const functionRoot = path.join(repoRoot, "backend/supabase/functions");
  const functionEntries = await readdir(functionRoot, { withFileTypes: true });
  const deployableFunctions = [];
  const placeholders = [];
  for (const entry of functionEntries) {
    if (!entry.isDirectory() || entry.name === "_shared") continue;
    try {
      const entrypoint = path.join(functionRoot, entry.name, "index.ts");
      if ((await stat(entrypoint)).isFile()) deployableFunctions.push(entry.name);
    } catch {
      placeholders.push(entry.name);
    }
  }
  deployableFunctions.sort();
  placeholders.sort();

  const sourceRoots = [
    path.join(repoRoot, "backend/src"),
    path.join(repoRoot, "backend/supabase/functions"),
  ];
  const secretNames = new Set();
  for (const sourceRoot of sourceRoots) {
    for (const file of await listFilesRecursively(sourceRoot)) {
      if (!file.endsWith(".ts")) continue;
      const source = await readFile(file, "utf8");
      for (const match of source.matchAll(/Deno\.env\.get\(["']([A-Z][A-Z0-9_]+)["']\)/g)) {
        secretNames.add(match[1]);
      }
    }
  }

  let knownLiveProjectIdentity = null;
  try {
    const audit = JSON.parse(await readFile(
      path.join(repoRoot, "docs/operations/production-manifest-2026-07-17.json"),
      "utf8",
    ));
    knownLiveProjectIdentity = audit?.supabase?.projectRef ?? null;
  } catch {
    // The preflight still requires three explicit, distinct identities below.
  }

  return {
    deployableFunctions,
    knownLiveProjectIdentity,
    migrationCount: migrationFiles.length,
    migrationHead: migrationFiles.at(-1)?.match(MIGRATION_PATTERN)?.[1] ?? null,
    migrationVersionSetSha256,
    placeholders,
    requiredSecretNames: [...secretNames].sort(),
  };
}

function sortedUniqueStrings(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) return null;
  return [...new Set(value)].sort();
}

function compareExactInventory(actual, expected, label, errors) {
  const normalized = sortedUniqueStrings(actual);
  push(errors, normalized !== null, `${label} must be an array of strings`);
  if (normalized) {
    push(errors, normalized.length === actual.length, `${label} must not contain duplicates`);
    push(errors, JSON.stringify(normalized) === JSON.stringify(expected), `${label} does not match repository inventory (${expected.join(", ")})`);
  }
}

export async function validateDeploymentReadiness({
  manifest,
  repoRoot,
  expectedCommit,
  now = new Date(),
}) {
  const errors = [];
  const nowMs = now.getTime();
  push(errors, isObject(manifest), "manifest must be a JSON object");
  if (!isObject(manifest)) throw new ReadinessValidationError(errors);

  rejectSensitiveValueFields(manifest, "manifest", errors);
  const facts = await repositoryFacts(repoRoot);

  push(errors, manifest.schemaVersion === 1, "schemaVersion must be 1");
  push(errors, manifest.targetEnvironment === "staging", "targetEnvironment must be staging");
  validateFreshTime(manifest.generatedAt, "generatedAt", nowMs, MANIFEST_MAX_AGE_MS, errors);

  const source = manifest.source;
  push(errors, isObject(source), "source is required");
  if (isObject(source)) {
    push(errors, source.repository === "kohnerbouchard-star/Student-Profile", "source.repository is incorrect");
    push(errors, source.ref === "refs/heads/main", "source.ref must be refs/heads/main");
    push(errors, source.mergedIntoMain === true, "source.mergedIntoMain must be true");
    push(errors, COMMIT_PATTERN.test(source.commit ?? ""), "source.commit must be a full lowercase commit SHA");
    push(errors, COMMIT_PATTERN.test(expectedCommit ?? ""), "--expected-commit must be a full lowercase commit SHA");
    if (COMMIT_PATTERN.test(expectedCommit ?? "")) {
      push(errors, source.commit === expectedCommit, "source.commit does not match the selected immutable release commit");
    }
  }

  const environments = manifest.environments;
  push(errors, isObject(environments), "environments is required");
  if (isObject(environments)) {
    const identities = ["development", "staging", "production"].map((name) => {
      const identity = environments[name]?.identity;
      push(errors, typeof identity === "string" && identity.length >= 6, `environments.${name}.identity is required`);
      push(errors, typeof identity === "string" && !PLACEHOLDER_PATTERN.test(identity), `environments.${name}.identity is a placeholder`);
      return identity;
    });
    push(errors, new Set(identities).size === 3, "development, staging, and production identities must be distinct");
    push(errors, environments.staging?.dataPolicy === "synthetic-only", "staging dataPolicy must be synthetic-only");
    if (facts.knownLiveProjectIdentity) {
      push(errors, environments.staging?.identity !== facts.knownLiveProjectIdentity, "staging identity matches the last audited live project");
    }
  }

  const secrets = manifest.secrets;
  push(errors, isObject(secrets), "secrets is required");
  if (isObject(secrets)) {
    compareExactInventory(secrets.configuredNames, facts.requiredSecretNames, "secrets.configuredNames", errors);
    for (const name of secrets.configuredNames ?? []) {
      push(errors, SECRET_NAME_PATTERN.test(name), `invalid configured secret name: ${name}`);
    }
  }

  const migrations = manifest.migrations;
  push(errors, isObject(migrations), "migrations is required");
  if (isObject(migrations)) {
    push(errors, migrations.repositoryHead === facts.migrationHead, `migrations.repositoryHead must be ${facts.migrationHead}`);
    push(errors, migrations.appliedHead === facts.migrationHead, `migrations.appliedHead must match repository head ${facts.migrationHead}`);
    push(errors, migrations.repositoryCount === facts.migrationCount, `migrations.repositoryCount must be ${facts.migrationCount}`);
    push(errors, migrations.appliedCount === facts.migrationCount, `migrations.appliedCount must be ${facts.migrationCount}`);
    push(errors, migrations.repositoryVersionSetSha256 === facts.migrationVersionSetSha256, "migrations.repositoryVersionSetSha256 does not match repository versions");
    push(errors, migrations.appliedVersionSetSha256 === facts.migrationVersionSetSha256, "migrations.appliedVersionSetSha256 does not match repository versions");
    await validateEvidence(migrations.appliedLedgerEvidence, "migrations.appliedLedgerEvidence", repoRoot, nowMs, DEPLOYMENT_EVIDENCE_MAX_AGE_MS, errors);
    await validateEvidence(migrations.cleanReplayEvidence, "migrations.cleanReplayEvidence", repoRoot, nowMs, DEPLOYMENT_EVIDENCE_MAX_AGE_MS, errors);
    await validateEvidence(migrations.schemaComparisonEvidence, "migrations.schemaComparisonEvidence", repoRoot, nowMs, DEPLOYMENT_EVIDENCE_MAX_AGE_MS, errors);
    push(errors, migrations.schemaComparisonResult === "match", "migrations.schemaComparisonResult must be match");
  }

  const artifacts = manifest.artifacts;
  push(errors, isObject(artifacts), "artifacts is required");
  if (isObject(artifacts)) {
    push(errors, SHA256_PATTERN.test(artifacts.frontend?.sha256 ?? ""), "artifacts.frontend.sha256 is required");
    push(errors, artifacts.frontend?.builtFromCommit === source?.commit, "frontend artifact was not built from source.commit");
    const artifactFunctions = Array.isArray(artifacts.edgeFunctions) ? artifacts.edgeFunctions : [];
    compareExactInventory(artifactFunctions.map((item) => item?.name), facts.deployableFunctions, "artifacts.edgeFunctions names", errors);
    for (const item of artifactFunctions) {
      push(errors, SHA256_PATTERN.test(item?.sha256 ?? ""), `artifact digest is missing for Edge Function ${item?.name ?? "unknown"}`);
      push(errors, item?.builtFromCommit === source?.commit, `Edge Function ${item?.name ?? "unknown"} was not built from source.commit`);
      push(errors, Number.isInteger(item?.deployedVersion) && item.deployedVersion > 0, `Edge Function ${item?.name ?? "unknown"} deployedVersion is required`);
    }
    await validateEvidence(artifacts.manifestEvidence, "artifacts.manifestEvidence", repoRoot, nowMs, DEPLOYMENT_EVIDENCE_MAX_AGE_MS, errors);
  }

  const edgeRoutes = manifest.edgeRoutes;
  push(errors, isObject(edgeRoutes), "edgeRoutes is required");
  if (isObject(edgeRoutes)) {
    const routeFunctions = Array.isArray(edgeRoutes.functions) ? edgeRoutes.functions : [];
    compareExactInventory(routeFunctions.map((item) => item?.name), facts.deployableFunctions, "edgeRoutes.functions names", errors);
    compareExactInventory(edgeRoutes.placeholders, facts.placeholders, "edgeRoutes.placeholders", errors);
    for (const item of routeFunctions) {
      const expectedEntrypoint = `backend/supabase/functions/${item?.name}/index.ts`;
      push(errors, item?.entrypoint === expectedEntrypoint, `Edge Function ${item?.name ?? "unknown"} entrypoint is incorrect`);
      const absolute = await resolveRepositoryFile(repoRoot, expectedEntrypoint, `edgeRoutes.${item?.name ?? "unknown"}`, errors);
      if (absolute && SHA256_PATTERN.test(item?.sourceSha256 ?? "")) {
        push(errors, await sha256File(absolute) === item.sourceSha256, `Edge Function ${item.name} sourceSha256 is stale`);
      } else {
        push(errors, false, `Edge Function ${item?.name ?? "unknown"} sourceSha256 is required`);
      }
      push(errors, Array.isArray(item?.routes) && item.routes.length > 0, `Edge Function ${item?.name ?? "unknown"} routes are required`);
      for (const route of item?.routes ?? []) {
        push(errors, /^[A-Z]+\s+\/.+/.test(route), `invalid route inventory entry for ${item?.name ?? "unknown"}: ${route}`);
      }
    }
    await validateEvidence(edgeRoutes.inventoryEvidence, "edgeRoutes.inventoryEvidence", repoRoot, nowMs, DEPLOYMENT_EVIDENCE_MAX_AGE_MS, errors);
  }

  const config = manifest.configuration;
  push(errors, isObject(config), "configuration is required");
  if (isObject(config)) {
    push(errors, Number.isInteger(config.schemaVersion) && config.schemaVersion > 0, "configuration.schemaVersion must be a positive integer");
    push(errors, isObject(config.featureFlags) && Object.keys(config.featureFlags).length > 0, "configuration.featureFlags must be a non-empty object");
    for (const [name, enabled] of Object.entries(config.featureFlags ?? {})) {
      push(errors, typeof enabled === "boolean", `feature flag ${name} must be boolean`);
    }
  }

  const legacy = manifest.legacyRuntimes;
  push(errors, isObject(legacy), "legacyRuntimes is required");
  if (isObject(legacy)) {
    const services = Array.isArray(legacy.services) ? legacy.services : [];
    compareExactInventory(services.map((item) => item?.id), REQUIRED_LEGACY_RUNTIMES, "legacyRuntimes.services ids", errors);
    for (const service of services) {
      push(errors, ALLOWED_LEGACY_DISPOSITIONS.has(service?.disposition), `legacy runtime ${service?.id ?? "unknown"} is not contained or retired`);
      push(errors, typeof service?.owner === "string" && service.owner.length > 0 && !PLACEHOLDER_PATTERN.test(service.owner), `legacy runtime ${service?.id ?? "unknown"} needs an owner`);
      if (service?.disposition === "approved-read-only-bridge") {
        const expiration = parseTime(
          service.approvalExpiresAt,
          `legacy runtime ${service.id}.approvalExpiresAt`,
          errors,
        );
        if (Number.isFinite(expiration)) {
          push(errors, expiration > nowMs, `legacy runtime ${service.id} bridge approval has expired`);
          push(errors, expiration <= nowMs + LEGACY_EVIDENCE_MAX_AGE_MS, `legacy runtime ${service.id} bridge approval may not exceed seven days`);
        }
      }
    }
    await validateEvidence(legacy.inventoryEvidence, "legacyRuntimes.inventoryEvidence", repoRoot, nowMs, LEGACY_EVIDENCE_MAX_AGE_MS, errors);
  }

  const rollback = manifest.rollback;
  push(errors, isObject(rollback), "rollback is required");
  if (isObject(rollback)) {
    push(errors, COMMIT_PATTERN.test(rollback.targetCommit ?? ""), "rollback.targetCommit must be a full commit SHA");
    push(errors, rollback.targetCommit !== source?.commit, "rollback.targetCommit must differ from source.commit");
    await validateEvidence(rollback.procedureEvidence, "rollback.procedureEvidence", repoRoot, nowMs, RECOVERY_EVIDENCE_MAX_AGE_MS, errors);
    await validateEvidence(rollback.rehearsalEvidence, "rollback.rehearsalEvidence", repoRoot, nowMs, RECOVERY_EVIDENCE_MAX_AGE_MS, errors);
  }

  const restore = manifest.restore;
  push(errors, isObject(restore), "restore is required");
  if (isObject(restore)) {
    push(errors, restore.result === "pass", "restore.result must be pass");
    push(errors, typeof restore.environmentIdentity === "string" && restore.environmentIdentity.length >= 6, "restore.environmentIdentity is required");
    const environmentIdentities = new Set(Object.values(environments ?? {}).map((item) => item?.identity));
    push(errors, !environmentIdentities.has(restore.environmentIdentity), "restore environment must be isolated from development, staging, and production");
    push(errors, Number.isFinite(restore.rpoMinutes) && restore.rpoMinutes >= 0, "restore.rpoMinutes is required");
    push(errors, Number.isFinite(restore.rtoMinutes) && restore.rtoMinutes > 0, "restore.rtoMinutes is required");
    push(errors, Number.isFinite(restore.observedRpoMinutes) && restore.observedRpoMinutes <= restore.rpoMinutes, "observed restore RPO exceeds objective");
    push(errors, Number.isFinite(restore.observedRtoMinutes) && restore.observedRtoMinutes <= restore.rtoMinutes, "observed restore RTO exceeds objective");
    await validateEvidence(restore.evidence, "restore.evidence", repoRoot, nowMs, RECOVERY_EVIDENCE_MAX_AGE_MS, errors);
  }

  const approval = manifest.approval;
  push(errors, isObject(approval), "approval is required");
  if (isObject(approval)) {
    push(errors, typeof approval.approver === "string" && approval.approver.length > 0 && !PLACEHOLDER_PATTERN.test(approval.approver), "approval.approver is required");
    validateFreshTime(approval.approvedAt, "approval.approvedAt", nowMs, DEPLOYMENT_EVIDENCE_MAX_AGE_MS, errors);
  }

  if (errors.length > 0) throw new ReadinessValidationError(errors);
  return {
    status: "ready",
    commit: source.commit,
    environment: "staging",
    migrationHead: facts.migrationHead,
    deployableEdgeFunctions: facts.deployableFunctions,
    placeholderEdgeFunctions: facts.placeholders,
    requiredSecretNames: facts.requiredSecretNames,
  };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--manifest") options.manifest = argv[++index];
    else if (argument === "--repo-root") options.repoRoot = argv[++index];
    else if (argument === "--expected-commit") options.expectedCommit = argv[++index];
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.manifest) throw new Error("--manifest is required");
  if (!options.expectedCommit) throw new Error("--expected-commit is required");
  const repoRoot = path.resolve(options.repoRoot ?? ".");
  const pathErrors = [];
  const manifestPath = await resolveRepositoryFile(
    repoRoot,
    options.manifest,
    "manifest",
    pathErrors,
  );
  if (!manifestPath) throw new ReadinessValidationError(pathErrors);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const result = await validateDeploymentReadiness({
    manifest,
    repoRoot,
    expectedCommit: options.expectedCommit,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
