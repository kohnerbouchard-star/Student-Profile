#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PHASE15_ACCEPTANCE_LIMITS = Object.freeze({
  goldenFivePlayers: 5,
  baselineConcurrentPlayers: 30,
  maximumConcurrentPlayers: 40,
  readPathsPerPlayer: 7,
  baselineReadCount: 210,
  burstReadCount: 280,
  maximumLoginP95Ms: 15_000,
  maximumReadP95Ms: 8_000,
  maximumErrors: 0,
});

export const PHASE15_REQUIRED_ACCEPTANCE_CLAIMS = Object.freeze([
  "authenticated-browser",
  "browser-server-cleanliness",
  "economic-concurrency",
  "economic-conservation",
  "golden-five-lifecycle",
  "load-30",
  "load-40",
  "ordering-race",
  "two-game-isolation",
]);

export const PHASE15_EQUIVALENCE_ALLOWED_EXACT_PATHS = Object.freeze([
  ".github/workflows/phase15-controlled-production.yml",
  ".github/workflows/phase15-controlled-staging.yml",
  ".github/workflows/production-git-release.yml",
]);

export const PHASE15_EQUIVALENCE_ALLOWED_PATH_PREFIXES = Object.freeze([
  "docs/operations/contracts/phase15-",
  "docs/operations/contracts/player-cross-cutting/",
  "docs/operations/evidence/phase15-certification/",
  "docs/roadmaps/",
  "scripts/operations/live-migration-reconciliation/",
]);

const CONTRACT_ID = "econovaria.phase15d.acceptance-evidence.v1";
const DEFAULT_CONTRACT_PATH = "docs/operations/contracts/phase15-acceptance-evidence-v1.json";
const STAGING_PROJECT_REF = "eecvbssdvarfcykcfrny";
const SHA_PATTERN = /^[a-f0-9]{40}$/u;
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const ARTIFACT_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/u;
const RECORD_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SUPPORTED_CLAIMS = new Set([
  ...PHASE15_REQUIRED_ACCEPTANCE_CLAIMS,
  "staging-authority",
]);

const KNOWN_EVIDENCE_BINDINGS = Object.freeze({
  "current-hosted-golden-five": Object.freeze({
    role: "candidate-evidence",
    sourceHead: "5b11f344bc0e725cf7028c3f7c4a2a890e9972e3",
    sourceTree: "e06c33db2a4db2e7fc437f7c92b1af152926b83a",
    sourceBranch: "main",
    runId: 35_550_498_273,
    jobIds: Object.freeze([106_185_465_769]),
    artifactId: 10_618_496_769,
    artifactDigest: "sha256:4b6f0746b89fc2bde57d478bfab357b83c9378d3d00f6156bfc8f98d61e0db99",
    evidenceSha256: "51800fa24db58976e9b7fd78a972d4cbfbc77fc3eec02ec5874d190437cd9926",
  }),
  "current-hosted-staging-authority": Object.freeze({
    role: "supporting-attestation",
    sourceHead: "5b11f344bc0e725cf7028c3f7c4a2a890e9972e3",
    sourceTree: "e06c33db2a4db2e7fc437f7c92b1af152926b83a",
    sourceBranch: "main",
    runId: 35_551_077_276,
    jobIds: Object.freeze([106_185_866_655]),
    artifactId: 10_618_262_320,
    artifactDigest: "sha256:207cfc8f652bd7d13453e72af5f68f26696633a7aa6e38c0ab169b8812f0a61d",
    evidenceSha256: "48c3fe066f3e1520b3a66a8810b594f452cdb4e36a222088c1c631fe47072f87",
  }),
  "pr-718-two-game-economic-baseline": Object.freeze({
    role: "prior-baseline",
    sourceHead: "9c07d67bf313aeab93149812f7c26139171239f2",
    sourceTree: "c404551f79a4304fda92cc6f1db7a70382abd77c",
    sourceBranch: "fix/phase15-database-advisor-findings",
    runId: 35_530_444_828,
    jobIds: Object.freeze([106_130_045_895, 106_130_045_971]),
    artifactId: 10_611_435_529,
    artifactDigest: "sha256:669ec5d2e7d10d247a8ae9e5f958d2202dc788316a8dc8c1c028d5257cc60b0b",
    evidenceSha256: "03e906a2f3c35f055ab04f145580e46bac7922884c1de6ef81641fc886930ed5",
    pullRequestNumber: 718,
    mergeCommit: "ea8d44b6931c21622680a8dba8b7135b71aec7e1",
    diffSha256: "f82f7d00487c8f1bda751d2a406157bb08c64f40afc4f77ef0aec0c815a76f10",
  }),
  "pr-718-load-baseline": Object.freeze({
    role: "prior-baseline",
    sourceHead: "9c07d67bf313aeab93149812f7c26139171239f2",
    sourceTree: "c404551f79a4304fda92cc6f1db7a70382abd77c",
    sourceBranch: "fix/phase15-database-advisor-findings",
    runId: 35_530_444_743,
    jobIds: Object.freeze([106_130_016_523]),
    artifactId: 10_611_336_082,
    artifactDigest: "sha256:c89edcbdd9ad6f76276f1d635284d15c1cb600f488c8a87ec115883463975153",
    evidenceSha256: "dcccee781490492cd4bcbe12b3ebecf1c2d435b94f39b2d07bc5caf35f3340c1",
    pullRequestNumber: 718,
    mergeCommit: "ea8d44b6931c21622680a8dba8b7135b71aec7e1",
    diffSha256: "f82f7d00487c8f1bda751d2a406157bb08c64f40afc4f77ef0aec0c815a76f10",
  }),
  "pr-719-load-baseline": Object.freeze({
    role: "prior-baseline",
    sourceHead: "c0714d7471d9a3228c45fad456607b68672f13b2",
    sourceTree: "5929d73744aa3a2a536a379f396e222892dec097",
    sourceBranch: "fix/phase15-incremental-suffix-convergence",
    runId: 35_531_867_284,
    jobIds: Object.freeze([106_133_853_448]),
    artifactId: 10_611_911_415,
    artifactDigest: "sha256:3a41b84d7e09dfa4abd93d513110e1289b3adfb73142d4ab9c0f7ca32267463a",
    evidenceSha256: "b490dc34cdd2e04df7266e09dc22e36214d4ffd5365a625c8b46ad566e2e95b3",
    pullRequestNumber: 719,
    mergeCommit: "e7890675e5a43d73a41ad5e6202da95ab28458b0",
    diffSha256: "ce888c9c1daf14df71f4b3431f124d2dc4790c4caa36ee4a589a3e858de8ec0f",
  }),
});

function invalid(message) {
  throw new Error(`PHASE15_ACCEPTANCE_CERTIFICATE_INVALID: ${message}`);
}

function requireCondition(condition, message) {
  if (!condition) invalid(message);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label) {
  requireCondition(isObject(value), `${label} must be an object.`);
  return value;
}

function requireString(value, label) {
  requireCondition(typeof value === "string" && value.length > 0, `${label} must be a non-empty string.`);
  return value;
}

function requireSha(value, label) {
  requireCondition(typeof value === "string" && SHA_PATTERN.test(value), `${label} must be a lowercase 40-character Git SHA.`);
  return value;
}

function requireSha256(value, label) {
  requireCondition(typeof value === "string" && SHA256_PATTERN.test(value), `${label} must be a lowercase SHA-256 digest.`);
  return value;
}

function requirePositiveInteger(value, label) {
  requireCondition(Number.isSafeInteger(value) && value > 0, `${label} must be a positive safe integer.`);
  return value;
}

function requireNonnegativeInteger(value, label) {
  requireCondition(Number.isSafeInteger(value) && value >= 0, `${label} must be a non-negative safe integer.`);
  return value;
}

function requireFiniteNonnegative(value, label) {
  requireCondition(Number.isFinite(value) && value >= 0, `${label} must be a finite non-negative number.`);
  return value;
}

function requireExact(value, expected, label) {
  requireCondition(Object.is(value, expected), `${label} must be ${JSON.stringify(expected)}.`);
}

function requireBooleanTrue(value, label) {
  requireExact(value, true, label);
}

function sortedUniqueStrings(value, label, { allowEmpty = false } = {}) {
  requireCondition(Array.isArray(value), `${label} must be an array.`);
  if (!allowEmpty) requireCondition(value.length > 0, `${label} must not be empty.`);
  for (const entry of value) requireString(entry, `${label} entry`);
  requireCondition(new Set(value).size === value.length, `${label} must not contain duplicates.`);
  const sorted = [...value].sort((left, right) => left.localeCompare(right));
  requireCondition(value.every((entry, index) => entry === sorted[index]), `${label} must be sorted.`);
  return value;
}

function requireSameArray(actual, expected, label) {
  requireCondition(
    Array.isArray(actual) && actual.length === expected.length &&
      actual.every((entry, index) => entry === expected[index]),
    `${label} does not match the immutable Phase 15 acceptance policy.`,
  );
}

function requireRepositoryPath(value, label) {
  requireString(value, label);
  requireCondition(!value.startsWith("/") && !value.includes("\\"), `${label} must be a repository-relative POSIX path.`);
  const segments = value.split("/");
  requireCondition(
    segments.every((segment) => segment.length > 0 && segment !== "." && segment !== ".."),
    `${label} contains an unsafe path segment.`,
  );
  return value;
}

function pathMayUseRelevantSurfaceEquivalence(value) {
  return PHASE15_EQUIVALENCE_ALLOWED_EXACT_PATHS.includes(value) ||
    PHASE15_EQUIVALENCE_ALLOWED_PATH_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function validatePolicy(policyValue) {
  const policy = requireObject(policyValue, "policy");
  const thresholds = requireObject(policy.thresholds, "policy.thresholds");
  for (const [key, expected] of Object.entries(PHASE15_ACCEPTANCE_LIMITS)) {
    requireExact(thresholds[key], expected, `policy.thresholds.${key}`);
  }
  requireSameArray(policy.requiredClaims, PHASE15_REQUIRED_ACCEPTANCE_CLAIMS, "policy.requiredClaims");
  requireSameArray(
    policy.equivalenceAllowedExactPaths,
    PHASE15_EQUIVALENCE_ALLOWED_EXACT_PATHS,
    "policy.equivalenceAllowedExactPaths",
  );
  requireSameArray(
    policy.equivalenceAllowedPathPrefixes,
    PHASE15_EQUIVALENCE_ALLOWED_PATH_PREFIXES,
    "policy.equivalenceAllowedPathPrefixes",
  );
  requireExact(policy.minimumExactFinalAcceptanceRuns, 1, "policy.minimumExactFinalAcceptanceRuns");
  requireExact(policy.requireExactStagingAuthority, true, "policy.requireExactStagingAuthority");
  requireExact(policy.historicalEvidenceUse, "baseline-and-equivalence-only", "policy.historicalEvidenceUse");
  return policy;
}

function validateCandidate(candidateValue) {
  const candidate = requireObject(candidateValue, "candidate");
  requireSha(candidate.head, "candidate.head");
  requireSha(candidate.tree, "candidate.tree");
  requireExact(candidate.branch, "main", "candidate.branch");
  requireExact(candidate.stagingProjectRef, STAGING_PROJECT_REF, "candidate.stagingProjectRef");
  const finalAcceptanceRunIds = candidate.finalAcceptanceRunIds;
  requireCondition(Array.isArray(finalAcceptanceRunIds), "candidate.finalAcceptanceRunIds must be an array.");
  for (const runId of finalAcceptanceRunIds) requirePositiveInteger(runId, "candidate.finalAcceptanceRunIds entry");
  requireCondition(
    new Set(finalAcceptanceRunIds).size === finalAcceptanceRunIds.length,
    "candidate.finalAcceptanceRunIds must not contain duplicates.",
  );
  const sortedRunIds = [...finalAcceptanceRunIds].sort((left, right) => left - right);
  requireCondition(
    finalAcceptanceRunIds.every((runId, index) => runId === sortedRunIds[index]),
    "candidate.finalAcceptanceRunIds must be sorted.",
  );
  return candidate;
}

function validateReview(reviewValue, source, label) {
  if (reviewValue === null || reviewValue === undefined) return;
  const review = requireObject(reviewValue, `${label}.review`);
  requirePositiveInteger(review.pullRequestNumber, `${label}.review.pullRequestNumber`);
  requireSha(review.head, `${label}.review.head`);
  requireSha(review.headTree, `${label}.review.headTree`);
  requireSha(review.mergeCommit, `${label}.review.mergeCommit`);
  requireSha(review.mergeTree, `${label}.review.mergeTree`);
  requireExact(review.head, source.head, `${label}.review.head`);
  requireExact(review.headTree, source.tree, `${label}.review.headTree`);
  requireExact(review.mergeTree, source.tree, `${label}.review.mergeTree`);
}

function validateEnvelope(envelopeValue, label, globalIds) {
  const envelope = requireObject(envelopeValue, `${label}.envelope`);
  const source = requireObject(envelope.source, `${label}.envelope.source`);
  requireSha(source.head, `${label}.envelope.source.head`);
  requireSha(source.tree, `${label}.envelope.source.tree`);
  requireString(source.branch, `${label}.envelope.source.branch`);

  const run = requireObject(envelope.run, `${label}.envelope.run`);
  requirePositiveInteger(run.id, `${label}.envelope.run.id`);
  requireCondition(!globalIds.runs.has(run.id), `${label}.envelope.run.id is duplicated across evidence records.`);
  globalIds.runs.add(run.id);
  requireString(run.name, `${label}.envelope.run.name`);
  requireRepositoryPath(run.path, `${label}.envelope.run.path`);
  requireCondition(run.path.startsWith(".github/workflows/"), `${label}.envelope.run.path must name a workflow.`);
  requireCondition(
    ["pull_request", "push", "workflow_dispatch", "workflow_run"].includes(run.event),
    `${label}.envelope.run.event is unsupported.`,
  );
  requireExact(run.status, "completed", `${label}.envelope.run.status`);
  requireExact(run.conclusion, "success", `${label}.envelope.run.conclusion`);
  requirePositiveInteger(run.attempt, `${label}.envelope.run.attempt`);
  requireExact(run.head, source.head, `${label}.envelope.run.head`);
  requireExact(run.tree, source.tree, `${label}.envelope.run.tree`);

  requireCondition(Array.isArray(envelope.jobs) && envelope.jobs.length > 0, `${label}.envelope.jobs must not be empty.`);
  for (const [index, jobValue] of envelope.jobs.entries()) {
    const jobLabel = `${label}.envelope.jobs[${index}]`;
    const job = requireObject(jobValue, jobLabel);
    requirePositiveInteger(job.id, `${jobLabel}.id`);
    requireCondition(!globalIds.jobs.has(job.id), `${jobLabel}.id is duplicated across evidence records.`);
    globalIds.jobs.add(job.id);
    requireExact(job.runId, run.id, `${jobLabel}.runId`);
    requireString(job.name, `${jobLabel}.name`);
    requireExact(job.status, "completed", `${jobLabel}.status`);
    requireExact(job.conclusion, "success", `${jobLabel}.conclusion`);
  }

  requireCondition(
    Array.isArray(envelope.artifacts) && envelope.artifacts.length > 0,
    `${label}.envelope.artifacts must not be empty.`,
  );
  for (const [index, artifactValue] of envelope.artifacts.entries()) {
    const artifactLabel = `${label}.envelope.artifacts[${index}]`;
    const artifact = requireObject(artifactValue, artifactLabel);
    requirePositiveInteger(artifact.id, `${artifactLabel}.id`);
    requireCondition(!globalIds.artifacts.has(artifact.id), `${artifactLabel}.id is duplicated across evidence records.`);
    globalIds.artifacts.add(artifact.id);
    requireExact(artifact.runId, run.id, `${artifactLabel}.runId`);
    requireString(artifact.name, `${artifactLabel}.name`);
    requireCondition(
      typeof artifact.digest === "string" && ARTIFACT_DIGEST_PATTERN.test(artifact.digest),
      `${artifactLabel}.digest must be a sha256:-prefixed lowercase digest.`,
    );
    requireExact(artifact.head, source.head, `${artifactLabel}.head`);
    requireExact(artifact.tree, source.tree, `${artifactLabel}.tree`);
    requireExact(artifact.expired, false, `${artifactLabel}.expired`);
    requireCondition(
      Array.isArray(artifact.evidenceFiles) && artifact.evidenceFiles.length > 0,
      `${artifactLabel}.evidenceFiles must not be empty.`,
    );
    const evidencePaths = new Set();
    for (const [fileIndex, fileValue] of artifact.evidenceFiles.entries()) {
      const fileLabel = `${artifactLabel}.evidenceFiles[${fileIndex}]`;
      const file = requireObject(fileValue, fileLabel);
      requireRepositoryPath(file.path, `${fileLabel}.path`);
      requireCondition(!evidencePaths.has(file.path), `${fileLabel}.path is duplicated in the artifact.`);
      evidencePaths.add(file.path);
      requireSha256(file.sha256, `${fileLabel}.sha256`);
    }
  }

  validateReview(envelope.review, source, `${label}.envelope`);
  return { source, run, artifacts: envelope.artifacts };
}

function validateEvidenceBindings(bindingsValue, artifacts, label) {
  requireCondition(Array.isArray(bindingsValue) && bindingsValue.length > 0, `${label}.evidenceBindings must not be empty.`);
  const artifactById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const keys = new Set();
  let previousKey = "";
  for (const [index, bindingValue] of bindingsValue.entries()) {
    const bindingLabel = `${label}.evidenceBindings[${index}]`;
    const binding = requireObject(bindingValue, bindingLabel);
    requirePositiveInteger(binding.artifactId, `${bindingLabel}.artifactId`);
    requireRepositoryPath(binding.path, `${bindingLabel}.path`);
    requireSha256(binding.sha256, `${bindingLabel}.sha256`);
    const key = `${String(binding.artifactId).padStart(20, "0")}:${binding.path}`;
    requireCondition(!keys.has(key), `${bindingLabel} is duplicated.`);
    requireCondition(previousKey < key, `${label}.evidenceBindings must be sorted by artifactId and path.`);
    keys.add(key);
    previousKey = key;
    const artifact = artifactById.get(binding.artifactId);
    requireCondition(artifact !== undefined, `${bindingLabel}.artifactId does not identify an attached artifact.`);
    const file = artifact.evidenceFiles.find((entry) => entry.path === binding.path);
    requireCondition(file !== undefined, `${bindingLabel}.path does not identify an attached evidence file.`);
    requireExact(binding.sha256, file.sha256, `${bindingLabel}.sha256`);
  }
  return bindingsValue;
}

function validateCandidateBinding(bindingValue, source, candidate, label) {
  const binding = requireObject(bindingValue, `${label}.candidateBinding`);
  requireCondition(
    binding.mode === "exact-source" || binding.mode === "relevant-surface-equivalent",
    `${label}.candidateBinding.mode is unsupported.`,
  );
  if (binding.mode === "exact-source") {
    requireExact(source.head, candidate.head, `${label}.candidateBinding exact head`);
    requireExact(source.tree, candidate.tree, `${label}.candidateBinding exact tree`);
    return binding.mode;
  }

  requireExact(binding.fromHead, source.head, `${label}.candidateBinding.fromHead`);
  requireExact(binding.fromTree, source.tree, `${label}.candidateBinding.fromTree`);
  requireExact(binding.toHead, candidate.head, `${label}.candidateBinding.toHead`);
  requireExact(binding.toTree, candidate.tree, `${label}.candidateBinding.toTree`);
  requireExact(binding.comparison, "git-diff-name-only", `${label}.candidateBinding.comparison`);
  const allowlist = sortedUniqueStrings(binding.diffAllowlist, `${label}.candidateBinding.diffAllowlist`);
  const observed = sortedUniqueStrings(binding.observedDiff, `${label}.candidateBinding.observedDiff`);
  requireSameArray(observed, allowlist, `${label}.candidateBinding observed diff`);
  requireCondition(
    Array.isArray(binding.relevantSurfaceChangedPaths) && binding.relevantSurfaceChangedPaths.length === 0,
    `${label}.candidateBinding.relevantSurfaceChangedPaths must be empty.`,
  );
  for (const entry of observed) {
    requireRepositoryPath(entry, `${label}.candidateBinding observed path`);
    requireCondition(
      pathMayUseRelevantSurfaceEquivalence(entry),
      `${label}.candidateBinding cannot reuse acceptance evidence across changed relevant path ${entry}.`,
    );
  }
  return binding.mode;
}

function validateGoldenFive(value, label) {
  const golden = requireObject(value, label);
  requireExact(golden.decision, "PASS", `${label}.decision`);
  requireExact(golden.environment, "staging", `${label}.environment`);
  requireExact(golden.projectRef, STAGING_PROJECT_REF, `${label}.projectRef`);
  requireExact(golden.productionSelected, false, `${label}.productionSelected`);
  requireExact(golden.playerCount, PHASE15_ACCEPTANCE_LIMITS.goldenFivePlayers, `${label}.playerCount`);
  requireExact(golden.browserContexts, PHASE15_ACCEPTANCE_LIMITS.goldenFivePlayers, `${label}.browserContexts`);
  requireExact(golden.requestedConcurrency, PHASE15_ACCEPTANCE_LIMITS.goldenFivePlayers, `${label}.requestedConcurrency`);
  requireExact(golden.successfulLogins, PHASE15_ACCEPTANCE_LIMITS.goldenFivePlayers, `${label}.successfulLogins`);
  requireExact(golden.routeCount, 8, `${label}.routeCount`);
  for (const field of ["requestErrors", "serverErrors", "browserErrors", "pageErrors", "securityFailures"]) {
    requireExact(golden[field], PHASE15_ACCEPTANCE_LIMITS.maximumErrors, `${label}.${field}`);
  }
  for (const field of ["fixtureComplete", "lifecycleActive", "refreshPersistencePassed", "logoutPassed"]) {
    requireBooleanTrue(golden[field], `${label}.${field}`);
  }
  return ["authenticated-browser", "browser-server-cleanliness", "golden-five-lifecycle"];
}

function validateEconomics(value, label) {
  const economics = requireObject(value, label);
  requireExact(economics.decision, "PASS", `${label}.decision`);
  requireExact(economics.games, 2, `${label}.games`);
  requireExact(economics.playerBrowserContexts, 2, `${label}.playerBrowserContexts`);
  for (const field of ["requestErrors", "serverErrors", "browserErrors", "pageErrors"]) {
    requireExact(economics[field], PHASE15_ACCEPTANCE_LIMITS.maximumErrors, `${label}.${field}`);
  }
  for (const field of [
    "playerIsolation",
    "gameIsolationBidirectional",
    "concurrencyPassed",
    "economicConservation",
    "sourceDebitsExact",
    "recipientCreditExact",
    "inventoryTransferExact",
    "replayZeroDelta",
    "orderingRacePassed",
    "withdrawalFirstRejectedBeforePayment",
    "purchaseFirstExcessWithdrawalRejected",
    "purchaseFirstRemainingWithdrawalAccepted",
  ]) requireBooleanTrue(economics[field], `${label}.${field}`);
  return [
    "authenticated-browser",
    "browser-server-cleanliness",
    "economic-concurrency",
    "economic-conservation",
    "ordering-race",
    "two-game-isolation",
  ];
}

function validateLoadWave(value, label, expected) {
  const wave = requireObject(value, label);
  requireExact(wave.concurrentPlayers, expected.concurrentPlayers, `${label}.concurrentPlayers`);
  requireExact(wave.loginCount, expected.loginCount, `${label}.loginCount`);
  requireExact(wave.readCount, expected.readCount, `${label}.readCount`);
  for (const field of ["loginErrors", "readErrors", "serverErrors"]) {
    requireExact(wave[field], PHASE15_ACCEPTANCE_LIMITS.maximumErrors, `${label}.${field}`);
  }
  requireFiniteNonnegative(wave.loginP95Ms, `${label}.loginP95Ms`);
  requireFiniteNonnegative(wave.readP95Ms, `${label}.readP95Ms`);
  requireCondition(
    wave.loginP95Ms <= PHASE15_ACCEPTANCE_LIMITS.maximumLoginP95Ms,
    `${label}.loginP95Ms exceeds ${PHASE15_ACCEPTANCE_LIMITS.maximumLoginP95Ms}.`,
  );
  requireCondition(
    wave.readP95Ms <= PHASE15_ACCEPTANCE_LIMITS.maximumReadP95Ms,
    `${label}.readP95Ms exceeds ${PHASE15_ACCEPTANCE_LIMITS.maximumReadP95Ms}.`,
  );
}

function validateLoad(value, label) {
  const load = requireObject(value, label);
  requireExact(load.decision, "PASS", `${label}.decision`);
  const profile = requireObject(load.profile, `${label}.profile`);
  requireExact(profile.expectedConcurrentPlayers, PHASE15_ACCEPTANCE_LIMITS.baselineConcurrentPlayers, `${label}.profile.expectedConcurrentPlayers`);
  requireExact(profile.maximumConcurrentPlayers, PHASE15_ACCEPTANCE_LIMITS.maximumConcurrentPlayers, `${label}.profile.maximumConcurrentPlayers`);
  requireExact(profile.readPathsPerPlayer, PHASE15_ACCEPTANCE_LIMITS.readPathsPerPlayer, `${label}.profile.readPathsPerPlayer`);
  const players = requireObject(load.players, `${label}.players`);
  for (const field of ["requested", "provisioned", "activeCredentials"]) {
    requireExact(players[field], PHASE15_ACCEPTANCE_LIMITS.maximumConcurrentPlayers, `${label}.players.${field}`);
  }
  validateLoadWave(load.baseline30, `${label}.baseline30`, {
    concurrentPlayers: PHASE15_ACCEPTANCE_LIMITS.baselineConcurrentPlayers,
    loginCount: PHASE15_ACCEPTANCE_LIMITS.baselineConcurrentPlayers,
    readCount: PHASE15_ACCEPTANCE_LIMITS.baselineReadCount,
  });
  validateLoadWave(load.burst40, `${label}.burst40`, {
    concurrentPlayers: PHASE15_ACCEPTANCE_LIMITS.maximumConcurrentPlayers,
    loginCount: PHASE15_ACCEPTANCE_LIMITS.maximumConcurrentPlayers - PHASE15_ACCEPTANCE_LIMITS.baselineConcurrentPlayers,
    readCount: PHASE15_ACCEPTANCE_LIMITS.burstReadCount,
  });
  requireExact(load.browserErrors, PHASE15_ACCEPTANCE_LIMITS.maximumErrors, `${label}.browserErrors`);
  return ["authenticated-browser", "browser-server-cleanliness", "load-30", "load-40"];
}

function validateAuthority(value, label) {
  const authority = requireObject(value, label);
  requireExact(authority.decision, "PASS", `${label}.decision`);
  requirePositiveInteger(authority.stagingRunId, `${label}.stagingRunId`);
  requirePositiveInteger(authority.populatedBaselineRunId, `${label}.populatedBaselineRunId`);
  requirePositiveInteger(authority.replayRunId, `${label}.replayRunId`);
  for (const field of ["databaseCertified", "runtimeCertified", "goldenFiveCertified"]) {
    requireBooleanTrue(authority[field], `${label}.${field}`);
  }
  return ["staging-authority"];
}

function validateAcceptance(value, label) {
  const acceptance = requireObject(value, `${label}.acceptance`);
  const claims = new Set();
  if (acceptance.goldenFive !== undefined) {
    for (const claim of validateGoldenFive(acceptance.goldenFive, `${label}.acceptance.goldenFive`)) claims.add(claim);
  }
  if (acceptance.economics !== undefined) {
    for (const claim of validateEconomics(acceptance.economics, `${label}.acceptance.economics`)) claims.add(claim);
  }
  if (acceptance.load !== undefined) {
    for (const claim of validateLoad(acceptance.load, `${label}.acceptance.load`)) claims.add(claim);
  }
  if (acceptance.authority !== undefined) {
    for (const claim of validateAuthority(acceptance.authority, `${label}.acceptance.authority`)) claims.add(claim);
  }
  requireCondition(claims.size > 0, `${label}.acceptance contains no supported evidence.`);
  return [...claims].sort((left, right) => left.localeCompare(right));
}

function requireArtifactAndEvidence({ artifacts, bindings, artifactName, evidencePath, label }) {
  const artifact = artifacts.find((entry) => entry.name === artifactName);
  requireCondition(artifact !== undefined, `${label} must attach artifact ${artifactName}.`);
  requireCondition(
    bindings.some((entry) => entry.artifactId === artifact.id && entry.path === evidencePath),
    `${label} must bind evidence file ${evidencePath}.`,
  );
}

function validateExactSummaryProvenance(value, { source, run, workflowJob, workflowName, label }) {
  requireExact(value.schemaVersion, 1, `${label}.schemaVersion`);
  requireExact(value.sourceCommit, source.head, `${label}.sourceCommit`);
  requireExact(value.sourceTree, source.tree, `${label}.sourceTree`);
  const workflow = requireObject(value.workflow, `${label}.workflow`);
  requireExact(workflow.runId, run.id, `${label}.workflow.runId`);
  requireExact(workflow.runAttempt, run.attempt, `${label}.workflow.runAttempt`);
  requireExact(workflow.job, workflowJob, `${label}.workflow.job`);
  requireExact(workflow.name, workflowName, `${label}.workflow.name`);
  requireExact(workflow.path, run.path, `${label}.workflow.path`);
  requireExact(workflow.event, run.event, `${label}.workflow.event`);
}

function validateRecordEvidenceShape({ record, source, run, artifacts, bindings, label }) {
  const acceptanceKinds = ["goldenFive", "economics", "load", "authority"]
    .filter((key) => record.acceptance[key] !== undefined);
  const combinesStagingAuthority = acceptanceKinds.length === 2 &&
    acceptanceKinds.includes("goldenFive") && acceptanceKinds.includes("authority");
  requireCondition(
    acceptanceKinds.length === 1 || combinesStagingAuthority,
    `${label}.acceptance must contain one evidence kind or the exact Golden Five/staging-authority pair.`,
  );
  const kind = acceptanceKinds[0];

  if (record.role === "candidate-evidence" || record.role === "supporting-attestation") {
    requireExact(source.branch, "main", `${label}.envelope.source.branch`);
  }

  if (acceptanceKinds.includes("goldenFive")) {
    requireExact(run.path, ".github/workflows/phase15-controlled-staging.yml", `${label}.envelope.run.path`);
    requireCondition(
      record.envelope.jobs.some((job) => job.name === "Exercise real staging browser lifecycle and isolation"),
      `${label} must bind the Golden Five lifecycle job.`,
    );
    requireArtifactAndEvidence({
      artifacts,
      bindings,
      artifactName: `phase15-staging-lifecycle-${source.head}`,
      evidencePath: "econovaria-golden-five/browser/golden-five-browser-acceptance.json",
      label,
    });
    requireCondition(
      bindings.some((entry) => entry.path === "econovaria-golden-five/fixture-verification.json"),
      `${label} must bind the Golden Five fixture verification.`,
    );
    if (!combinesStagingAuthority) return;
  }

  if (acceptanceKinds.includes("authority")) {
    if (run.path === ".github/workflows/phase15-controlled-production.yml") {
      requireCondition(
        record.envelope.jobs.some((job) => job.name === "Certify exact populated staging authority"),
        `${label} must bind the legacy staging authority job.`,
      );
      requireArtifactAndEvidence({
        artifacts,
        bindings,
        artifactName: `phase15-staging-authority-${source.head}`,
        evidencePath: "staging-authority.json",
        label,
      });
    } else {
      requireExact(run.path, ".github/workflows/phase15-controlled-staging.yml", `${label}.envelope.run.path`);
      for (const expectedJob of [
        "Rehearse and converge populated staging database",
        "Deploy and attest current staging Edge runtime",
        "Exercise real staging browser lifecycle and isolation",
      ]) {
        requireCondition(
          record.envelope.jobs.some((job) => job.name === expectedJob),
          `${label} must bind current staging job ${expectedJob}.`,
        );
      }
      for (const [artifactName, evidencePath] of [
        [`phase15-staging-database-${source.head}`, "summary.json"],
        [`phase15-staging-runtime-${source.head}`, "staging-attestation.json"],
        [`phase15-staging-lifecycle-${source.head}`, "econovaria-golden-five/fixture-verification.json"],
      ]) {
        requireArtifactAndEvidence({ artifacts, bindings, artifactName, evidencePath, label });
      }
    }
    return;
  }

  if (kind === "load") {
    requireExact(run.path, ".github/workflows/player-multiplayer-load-e2e.yml", `${label}.envelope.run.path`);
    requireCondition(
      record.envelope.jobs.some((job) => job.name === "Two-browser Player journey, secure mutations, and 30-40 Player load"),
      `${label} must bind the connected Player load job.`,
    );
    const evidencePath = record.finalAcceptanceRun
      ? "econovaria-player-load/phase15-load-summary.json"
      : "econovaria-player-load/player-runtime-load-profile.json";
    requireArtifactAndEvidence({
      artifacts,
      bindings,
      artifactName: `player-multiplayer-load-${source.head}`,
      evidencePath,
      label,
    });
    if (record.finalAcceptanceRun) {
      requireExact(run.event, "push", `${label}.envelope.run.event`);
      validateExactSummaryProvenance(record.acceptance.load, {
        source,
        run,
        workflowJob: "connected-player-runtime",
        workflowName: "Player Multiplayer and Load E2E",
        label: `${label}.acceptance.load`,
      });
      requireExact(record.acceptance.load.thresholds?.loginP95Ms, PHASE15_ACCEPTANCE_LIMITS.maximumLoginP95Ms, `${label}.acceptance.load.thresholds.loginP95Ms`);
      requireExact(record.acceptance.load.thresholds?.readP95Ms, PHASE15_ACCEPTANCE_LIMITS.maximumReadP95Ms, `${label}.acceptance.load.thresholds.readP95Ms`);
      for (const field of ["retryEvents", "serverErrors", "browserErrors", "browserServerErrors"]) {
        requireExact(record.acceptance.load[field], PHASE15_ACCEPTANCE_LIMITS.maximumErrors, `${label}.acceptance.load.${field}`);
      }
      requirePositiveInteger(record.acceptance.load.browserEvidenceFiles, `${label}.acceptance.load.browserEvidenceFiles`);
    }
    return;
  }

  requireExact(run.path, ".github/workflows/business-player-store-cutover-v2.yml", `${label}.envelope.run.path`);
  const economicEvidencePath = record.finalAcceptanceRun
    ? "econovaria-phase10a4-player-store-evidence/phase15-economic-summary.json"
    : "econovaria-phase10a4-player-store-evidence/business-phase10-player-store-browser-acceptance.json";
  const artifactName = record.finalAcceptanceRun
    ? `phase15-economic-acceptance-${source.head}`
    : `phase10a4-connected-player-store-${source.head}`;
  requireArtifactAndEvidence({ artifacts, bindings, artifactName, evidencePath: economicEvidencePath, label });
  if (record.finalAcceptanceRun) {
    requireExact(run.event, "push", `${label}.envelope.run.event`);
    for (const expectedJob of [
      "Verify serial settlement, ordering races, and two-game isolation",
      "Verify connected Buyer and seller Store journey in two games",
      "Certify exact-source economic isolation and conservation",
    ]) {
      requireCondition(
        record.envelope.jobs.some((job) => job.name === expectedJob),
        `${label} must bind exact-source economic job ${expectedJob}.`,
      );
    }
    validateExactSummaryProvenance(record.acceptance.economics, {
      source,
      run,
      workflowJob: "phase15-economic-acceptance",
      workflowName: "Business Player Store Cutover V2",
      label: `${label}.acceptance.economics`,
    });
    requireBooleanTrue(
      record.acceptance.economics.connectedAuthenticatedJourneys,
      `${label}.acceptance.economics.connectedAuthenticatedJourneys`,
    );
    const sourceJobs = requireObject(
      record.acceptance.economics.sourceJobs,
      `${label}.acceptance.economics.sourceJobs`,
    );
    for (const sourceJob of [
      "cutoverAuthority",
      "backendRuntime",
      "databaseSettlement",
      "databaseReplay",
      "playerTerminal",
      "connectedStore",
    ]) requireExact(
      sourceJobs[sourceJob],
      "success",
      `${label}.acceptance.economics.sourceJobs.${sourceJob}`,
    );
  } else {
    for (const expectedJob of [
      "Verify connected Buyer and seller Store journey in two games",
      "Verify serial settlement, ordering races, and two-game isolation",
    ]) {
      requireCondition(
        record.envelope.jobs.some((job) => job.name === expectedJob),
        `${label} must bind historical job ${expectedJob}.`,
      );
    }
  }
}

function validateKnownEvidenceBinding({ record, source, run, artifacts, bindings, label }) {
  const expected = KNOWN_EVIDENCE_BINDINGS[record.id];
  if (expected === undefined) {
    requireCondition(record.role !== "prior-baseline", `${label}.id is not an approved historical baseline.`);
    return;
  }
  requireExact(record.role, expected.role, `${label}.role for known evidence`);
  requireExact(source.head, expected.sourceHead, `${label}.envelope.source.head for known evidence`);
  requireExact(source.tree, expected.sourceTree, `${label}.envelope.source.tree for known evidence`);
  requireExact(source.branch, expected.sourceBranch, `${label}.envelope.source.branch for known evidence`);
  requireExact(run.id, expected.runId, `${label}.envelope.run.id for known evidence`);
  requireSameArray(record.envelope.jobs.map((job) => job.id), expected.jobIds, `${label}.envelope job ids`);
  requireExact(artifacts.length, 1, `${label}.envelope artifact count`);
  requireExact(artifacts[0].id, expected.artifactId, `${label}.envelope.artifacts[0].id for known evidence`);
  requireExact(artifacts[0].digest, expected.artifactDigest, `${label}.envelope.artifacts[0].digest for known evidence`);
  requireCondition(
    bindings.some((binding) => binding.sha256 === expected.evidenceSha256),
    `${label}.evidenceBindings does not contain the approved evidence digest.`,
  );

  if (record.role === "prior-baseline") {
    const review = requireObject(record.envelope.review, `${label}.envelope.review`);
    requireExact(review.pullRequestNumber, expected.pullRequestNumber, `${label}.envelope.review.pullRequestNumber`);
    requireExact(review.mergeCommit, expected.mergeCommit, `${label}.envelope.review.mergeCommit`);
    const diffSha256 = createHash("sha256")
      .update(record.candidateBinding.diffAllowlist.join("\n"))
      .digest("hex");
    requireExact(diffSha256, expected.diffSha256, `${label}.candidateBinding.diffAllowlist digest`);
  }
}

function validateRecord(recordValue, index, candidate, globalIds) {
  const label = `evidence[${index}]`;
  const record = requireObject(recordValue, label);
  requireCondition(typeof record.id === "string" && RECORD_ID_PATTERN.test(record.id), `${label}.id is invalid.`);
  requireCondition(!globalIds.records.has(record.id), `${label}.id is duplicated.`);
  globalIds.records.add(record.id);
  requireCondition(
    ["candidate-evidence", "prior-baseline", "supporting-attestation"].includes(record.role),
    `${label}.role is unsupported.`,
  );
  requireExact(typeof record.finalAcceptanceRun, "boolean", `${label}.finalAcceptanceRun type`);
  if (record.role !== "candidate-evidence") {
    requireExact(record.finalAcceptanceRun, false, `${label}.finalAcceptanceRun`);
  }

  const claims = sortedUniqueStrings(record.claims, `${label}.claims`);
  for (const claim of claims) requireCondition(SUPPORTED_CLAIMS.has(claim), `${label}.claims contains unsupported claim ${claim}.`);
  const { source, run, artifacts } = validateEnvelope(record.envelope, label, globalIds);
  const bindings = validateEvidenceBindings(record.evidenceBindings, artifacts, label);
  const bindingMode = validateCandidateBinding(record.candidateBinding, source, candidate, label);
  if (record.role === "candidate-evidence" || record.role === "supporting-attestation") {
    requireExact(bindingMode, "exact-source", `${label}.candidateBinding.mode for current candidate evidence`);
  } else {
    requireExact(bindingMode, "relevant-surface-equivalent", `${label}.candidateBinding.mode for prior baseline evidence`);
  }
  const metricClaims = validateAcceptance(record.acceptance, label);
  validateRecordEvidenceShape({ record, source, run, artifacts, bindings, label });
  validateKnownEvidenceBinding({ record, source, run, artifacts, bindings, label });
  requireSameArray(claims, metricClaims, `${label}.claims`);

  if (record.role === "supporting-attestation") {
    requireSameArray(claims, ["staging-authority"], `${label}.claims`);
  } else {
    if (claims.includes("staging-authority")) {
      requireCondition(
        record.role === "candidate-evidence" &&
          record.acceptance.goldenFive !== undefined &&
          record.acceptance.authority !== undefined &&
          bindingMode === "exact-source",
        `${label}.claims may combine staging authority only with exact-source Golden Five candidate evidence.`,
      );
    }
  }
  if (record.finalAcceptanceRun) {
    requireExact(bindingMode, "exact-source", `${label}.candidateBinding.mode for a final acceptance run`);
  }
  return { record, run, bindingMode, metricClaims };
}

function validateAuthorityLinks(records) {
  const goldenRunIds = new Set(
    records
      .filter(({ record, bindingMode }) =>
        record.role === "candidate-evidence" &&
        bindingMode === "exact-source" &&
        record.acceptance.goldenFive !== undefined)
      .map(({ run }) => run.id),
  );
  for (const { record } of records) {
    const authority = record.acceptance.authority;
    if (authority === undefined) continue;
    requireCondition(
      goldenRunIds.has(authority.stagingRunId),
      `${record.id} authority does not link to an attached Golden Five staging run.`,
    );
  }
}

export function validatePhase15AcceptanceCertificate(value, options = {}) {
  const contract = requireObject(value, "contract");
  requireExact(contract.schemaVersion, 1, "schemaVersion");
  requireExact(contract.certificateId, CONTRACT_ID, "certificateId");
  requireCondition(contract.status === "PENDING" || contract.status === "PASS", "status must be PENDING or PASS.");
  const policy = validatePolicy(contract.policy);
  const candidate = validateCandidate(contract.candidate);
  if (options.expectedHead !== undefined) requireExact(candidate.head, requireSha(options.expectedHead, "expectedHead"), "candidate.head");
  if (options.expectedTree !== undefined) requireExact(candidate.tree, requireSha(options.expectedTree, "expectedTree"), "candidate.tree");

  requireCondition(Array.isArray(contract.evidence) && contract.evidence.length > 0, "evidence must not be empty.");
  const globalIds = { records: new Set(), runs: new Set(), jobs: new Set(), artifacts: new Set() };
  const records = contract.evidence.map((record, index) => validateRecord(record, index, candidate, globalIds));
  validateAuthorityLinks(records);

  const candidateClaims = new Set();
  const priorBaselineClaims = new Set();
  const finalExactRunIds = [];
  for (const { record, run, metricClaims } of records) {
    if (record.role === "candidate-evidence") {
      for (const claim of metricClaims) {
        if (PHASE15_REQUIRED_ACCEPTANCE_CLAIMS.includes(claim)) candidateClaims.add(claim);
      }
      if (record.finalAcceptanceRun) finalExactRunIds.push(run.id);
    } else if (record.role === "prior-baseline") {
      for (const claim of metricClaims) {
        if (PHASE15_REQUIRED_ACCEPTANCE_CLAIMS.includes(claim)) priorBaselineClaims.add(claim);
      }
    }
  }
  finalExactRunIds.sort((left, right) => left - right);
  requireSameArray(candidate.finalAcceptanceRunIds, finalExactRunIds, "candidate.finalAcceptanceRunIds");

  const orderedCandidateClaims = PHASE15_REQUIRED_ACCEPTANCE_CLAIMS.filter((claim) => candidateClaims.has(claim));
  const missingClaims = PHASE15_REQUIRED_ACCEPTANCE_CLAIMS.filter((claim) => !candidateClaims.has(claim));
  const orderedPriorBaselineClaims = PHASE15_REQUIRED_ACCEPTANCE_CLAIMS.filter((claim) => priorBaselineClaims.has(claim));
  const complete = missingClaims.length === 0 &&
    finalExactRunIds.length >= policy.minimumExactFinalAcceptanceRuns &&
    records.some(({ record, bindingMode }) =>
      bindingMode === "exact-source" && record.acceptance.authority !== undefined);
  const derivedStatus = complete ? "PASS" : "PENDING";
  requireExact(contract.status, derivedStatus, "status derived from attached evidence");
  if (derivedStatus === "PENDING") {
    requireString(contract.pendingReason, "pendingReason");
  } else {
    requireExact(contract.pendingReason, null, "pendingReason");
  }
  if (options.requirePass === true) {
    requireExact(derivedStatus, "PASS", "certificate status required by --require-pass");
  }

  return Object.freeze({
    schemaVersion: 1,
    certificateId: CONTRACT_ID,
    status: derivedStatus,
    candidateHead: candidate.head,
    candidateTree: candidate.tree,
    finalAcceptanceRunIds: Object.freeze([...finalExactRunIds]),
    candidateClaims: Object.freeze(orderedCandidateClaims),
    missingClaims: Object.freeze(missingClaims),
    priorBaselineClaims: Object.freeze(orderedPriorBaselineClaims),
    evidenceRecordCount: records.length,
    thresholds: PHASE15_ACCEPTANCE_LIMITS,
  });
}

function parseArguments(argv) {
  const options = {
    contractPath: DEFAULT_CONTRACT_PATH,
    expectedHead: undefined,
    expectedTree: undefined,
    requirePass: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--contract") options.contractPath = argv[++index];
    else if (argument === "--expected-head") options.expectedHead = argv[++index];
    else if (argument === "--expected-tree") options.expectedTree = argv[++index];
    else if (argument === "--require-pass") options.requirePass = true;
    else invalid(`Unknown argument ${argument}.`);
  }
  requireString(options.contractPath, "--contract");
  if (options.expectedHead !== undefined) requireSha(options.expectedHead, "--expected-head");
  if (options.expectedTree !== undefined) requireSha(options.expectedTree, "--expected-tree");
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const contract = JSON.parse(await readFile(options.contractPath, "utf8"));
  const result = validatePhase15AcceptanceCertificate(contract, options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
