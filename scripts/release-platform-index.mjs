import * as base from "./release-platform-lib.mjs";

export const {
  COMMIT_PATTERN,
  ENVIRONMENTS,
  ReleasePlatformValidationError,
  SECRET_NAME_PATTERN,
  SHA256_PATTERN,
  buildImmutableRelease,
  canonicalJson,
  loadJson,
  repositoryReleaseFacts,
  sha256,
  sha256File,
  validateReleaseConfiguration,
  validateReleaseManifest,
} = base;

const PLACEHOLDER_PATTERN = /^(?:change-me|example|placeholder|todo(?:[_-].*)?|tbd(?:[_-].*)?|unknown(?:[_-].*)?|development|staging|production|0+)$/i;

function assertNoPlaceholder(value, label, errors) {
  if (typeof value !== "string" || PLACEHOLDER_PATTERN.test(value)) {
    errors.push(`${label} is a placeholder`);
  }
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

export async function validatePromotionRecord(options) {
  const { record, releaseManifest, expectedEnvironment } = options;
  const errors = [];
  if (record && releaseManifest) {
    if (record.configurationSha256 !== releaseManifest.configuration?.sha256) {
      errors.push("promotion configurationSha256 mismatch");
    }
    if (record.configurationVersion !== releaseManifest.configuration?.version) {
      errors.push("promotion configurationVersion mismatch");
    }
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
  return base.validatePromotionRecord(options);
}
