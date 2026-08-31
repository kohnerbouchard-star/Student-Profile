#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const LEGACY_AUTHORITY_PATH =
  "docs/operations/contracts/player-cross-cutting-verification-authority-v1.json";
export const DEFAULT_AUTHORITY_PATH = LEGACY_AUTHORITY_PATH;
export const AUTHORITY_DIRECTORY =
  "docs/operations/contracts/player-cross-cutting";
export const AUTHORITY_ID_PATTERN =
  /^econovaria\.[a-z0-9]+(?:-[a-z0-9]+)*-pr-(\d+)\.v1$/u;

export function authorityPathForPullRequest(pullRequestNumber) {
  const value = Number(pullRequestNumber);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Player authority pull request number is invalid.");
  }
  return `${AUTHORITY_DIRECTORY}/pr-${value}.json`;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function uniqueStrings(value, label) {
  assert(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array.`);
  const normalized = value.map((entry) => String(entry || "").trim());
  assert(normalized.every(Boolean), `${label} contains an empty value.`);
  assert(new Set(normalized).size === normalized.length, `${label} contains duplicate values.`);
  return normalized;
}

export function verifyAuthority({
  manifest,
  changedPaths,
  pullRequestNumber,
  baseRef,
  manifestPath = DEFAULT_AUTHORITY_PATH,
}) {
  assert(manifest?.schemaVersion === 1, "Unsupported Player authority schema version.");
  const authorityId = String(manifest.authorityId || "").trim();
  const authorityMatch = authorityId.match(AUTHORITY_ID_PATTERN);
  assert(authorityMatch, "Unexpected Player authority identifier.");
  assert(
    Number(authorityMatch[1]) === Number(pullRequestNumber),
    "Player authority identifier is not bound to this pull request.",
  );
  assert(
    manifest.purpose === "authorize-cross-cutting-player-verification",
    "Unexpected Player authority purpose.",
  );
  assert(
    Number(manifest.pullRequestNumber) === Number(pullRequestNumber),
    "Player authority is not bound to this pull request.",
  );
  assert(manifest.baseRef === baseRef, "Player authority is not bound to this base ref.");
  assert(manifest.scopeLock === "exact-path-allowlist", "Player authority must use an exact path allowlist.");
  assert(manifest.productionDeploymentAllowed === false, "Player authority must deny production deployment.");
  assert(manifest.productionMutationAllowed === false, "Player authority must deny production mutation.");
  assert(manifest.secretValuesAllowed === false, "Player authority must deny secret-value handling.");

  const allowedPaths = uniqueStrings(manifest.allowedPaths, "allowedPaths");
  const requiredFiles = uniqueStrings(manifest.requiredFiles, "requiredFiles");
  const requiredChecks = uniqueStrings(manifest.requiredChecks, "requiredChecks");
  const criticalJobChecks = manifest.criticalJobChecks === undefined
    ? []
    : uniqueStrings(manifest.criticalJobChecks, "criticalJobChecks");
  const changed = uniqueStrings(changedPaths, "changedPaths");
  const allowed = new Set(allowedPaths);

  for (const path of changed) {
    assert(allowed.has(path), `Cross-cutting Player authority does not allow changed path: ${path}`);
  }
  for (const path of requiredFiles) {
    assert(allowed.has(path), `Required Player file is outside the authority allowlist: ${path}`);
  }
  assert(
    allowed.has(manifestPath) &&
      allowed.has("scripts/verify-player-cross-cutting-authority.mjs") &&
      allowed.has("scripts/player-cross-cutting-authority.test.mjs"),
    "Player authority must lock its own manifest, verifier, and regression test.",
  );
  assert(
    requiredChecks.includes("player-terminal-verify") &&
      requiredChecks.includes("player-edge-trusted-ip-entrypoint-contract") &&
      requiredChecks.includes("player-production-secret-provision-contract") &&
      requiredChecks.includes("player-api-read-resilience"),
    "Player authority omits a required verification contract.",
  );
  for (const check of criticalJobChecks) {
    assert(
      requiredChecks.includes(check),
      `Critical workflow job is not bound as a required check: ${check}`,
    );
  }

  return {
    allowedPathCount: allowedPaths.length,
    changedPathCount: changed.length,
    criticalJobCheckCount: criticalJobChecks.length,
  };
}

function readOptions(argv) {
  const options = {
    manifest: "",
    changedFiles: "",
    pullRequestNumber: "",
    baseRef: "",
  };
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!value) throw new Error(`Missing value for ${key}.`);
    if (key === "--manifest") options.manifest = value;
    else if (key === "--changed-files") options.changedFiles = value;
    else if (key === "--pr-number") options.pullRequestNumber = value;
    else if (key === "--base-ref") options.baseRef = value;
    else throw new Error(`Unknown option: ${key}`);
  }
  return options;
}

function resolveManifestPath(options) {
  if (options.manifest) return options.manifest;
  const prPath = authorityPathForPullRequest(options.pullRequestNumber);
  return existsSync(prPath) ? prPath : LEGACY_AUTHORITY_PATH;
}

function main() {
  const options = readOptions(process.argv.slice(2));
  assert(options.changedFiles, "--changed-files is required.");
  assert(options.pullRequestNumber, "--pr-number is required.");
  assert(options.baseRef, "--base-ref is required.");
  const manifestPath = resolveManifestPath(options);
  assert(existsSync(manifestPath), `Player authority manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const changedPaths = readFileSync(options.changedFiles, "utf8")
    .split(/\r?\n/u)
    .map((value) => value.trim())
    .filter(Boolean);
  const result = verifyAuthority({
    manifest,
    changedPaths,
    pullRequestNumber: options.pullRequestNumber,
    baseRef: options.baseRef,
    manifestPath,
  });
  for (const path of manifest.requiredFiles) {
    assert(existsSync(path), `Required Player authority file is missing: ${path}`);
  }
  process.stdout.write(
    `Cross-cutting Player authority accepted ${result.changedPathCount} changed paths under ${result.allowedPathCount} locked paths.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
