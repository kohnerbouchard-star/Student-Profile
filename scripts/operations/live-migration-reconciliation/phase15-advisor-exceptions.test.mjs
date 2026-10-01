import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyAdvisorReview,
  advisorFingerprint,
  buildAdvisorArtifacts,
  digest,
  parseStrictJson,
  parseSupabaseAdvisorJson,
  validateAdvisorSnapshot,
} from "./phase15-advisor-exceptions.mjs";

const tableFinding = ({
  name = "example_table",
  detail = "Table `public.example_table` has RLS enabled, but no policies exist",
  level = "INFO",
  schema = "public",
  type = "table",
} = {}) => ({
  name: "rls_enabled_no_policy",
  title: "RLS Enabled No Policy",
  level,
  facing: "EXTERNAL",
  categories: ["SECURITY"],
  remediation: "https://example.test/rls",
  detail,
  metadata: { schema, name, type },
  observed_at: "2026-09-21T01:00:00.000Z",
});

const authFinding = {
  name: "auth_leaked_password_protection",
  title: "Leaked Password Protection Disabled",
  level: "WARN",
  facing: "EXTERNAL",
  categories: ["SECURITY"],
  remediation: "https://example.test/passwords",
  detail: "Leaked password protection is disabled.",
  metadata: { type: "auth", entity: "Auth" },
};

function sourceWith(...rows) {
  const environment = projectRef => ({ projectRef, security: rows, performance: [] });
  return {
    schemaVersion: 1,
    generatedAtUtc: "2026-09-21T02:04:46.914Z",
    source: "test fixture",
    environments: {
      staging: environment("eecvbssdvarfcykcfrny"),
      production: environment("cgiukdjwicykrmtkhudh"),
    },
  };
}

function reviewFor(contract) {
  return {
    schemaVersion: 1,
    reviewer: "@kohnerbouchard-star",
    reviewedAtUtc: "2026-09-21T03:15:00.000Z",
    evidenceReference: "https://github.com/kohnerbouchard-star/Student-Profile/issues/999#issuecomment-1",
    environments: Object.fromEntries(["staging", "production"].map(environment => [environment, {
      baselineDigest: contract.environments[environment].baselineDigest,
      rules: Object.fromEntries(Object.keys(contract.environments[environment].countsByRule).map(rule => [rule, {
        disposition: "ACCEPTED_TEMPORARY_EXCEPTION",
        rationale: `Owner reviewed ${rule} for ${environment} and accepted this bounded exception.`,
      }])),
    }])),
  };
}

function approve(contract) {
  return applyAdvisorReview(contract, reviewFor(contract));
}

test("parses generic Supabase CLI rows and grouped sanitized rows identically", () => {
  const cli = { security: [tableFinding()], performance: [] };
  const grouped = {
    security: [{
      rule: "rls_enabled_no_policy",
      title: "RLS Enabled No Policy",
      level: "INFO",
      facing: "EXTERNAL",
      categories: ["SECURITY"],
      remediation: "https://example.test/rls",
      findings: [{
        schema: "public",
        object: "example_table",
        objectType: "table",
        detail: "Table `public.example_table` has RLS enabled, but no policies exist",
        observedAt: "2026-09-22T03:00:00.000Z",
      }],
    }],
    performance: [],
  };
  assert.deepEqual(parseSupabaseAdvisorJson(cli), parseSupabaseAdvisorJson(grouped));
});

test("fingerprints exclude observed timestamps but bind severity, detail and object metadata", () => {
  const first = parseSupabaseAdvisorJson({ security: [tableFinding()], performance: [] })[0];
  const later = parseSupabaseAdvisorJson({
    security: [{ ...tableFinding(), observed_at: "2030-01-01T00:00:00.000Z" }],
    performance: [],
  })[0];
  assert.equal(first.fingerprint, later.fingerprint);
  for (const changed of [
    { ...first, level: "WARN" },
    { ...first, detail: `${first.detail}.` },
    { ...first, schema: "private" },
    { ...first, object: "other_table" },
    { ...first, objectType: "view" },
  ]) assert.notEqual(first.fingerprint, advisorFingerprint(changed));
});

test("the generated baseline is object-specific, deterministic and pending by default", () => {
  const first = buildAdvisorArtifacts(sourceWith(tableFinding(), authFinding));
  const second = buildAdvisorArtifacts(sourceWith(authFinding, tableFinding()));
  assert.equal(digest(first), digest(second));
  assert.equal(first.contract.environments.production.findingCount, 2);
  assert.equal(first.evidence.environments.production.findings[1].object, "example_table");
  assert.ok(first.evidence.environments.production.findings.every(row => !("observedAt" in row) && !("observed_at" in row)));
  assert.ok(Object.values(first.contract.environments.production.decisionsByFingerprint)
    .every(decision => Object.values(decision).every(value => value === "PENDING")));
  assert.ok(Object.values(first.contract.approval).flatMap(value => (
    value && typeof value === "object" ? Object.values(value) : [value]
  )).every(value => value === "PENDING"));
});

test("an exact digest-bound review deterministically populates every object decision", () => {
  const { contract } = buildAdvisorArtifacts(sourceWith(tableFinding(), authFinding));
  const before = digest(contract);
  const review = reviewFor(contract);
  const first = applyAdvisorReview(contract, review);
  const second = applyAdvisorReview(contract, JSON.stringify(review));
  assert.equal(digest(first), digest(second));
  assert.throws(() => applyAdvisorReview(first, review), /ADVISOR_BASELINE_ALREADY_REVIEWED/);
  assert.equal(digest(contract), before);
  assert.equal(contract.approval.status, "PENDING");
  assert.deepEqual(first.approval, {
    status: "APPROVED",
    reviewer: review.reviewer,
    reviewedAtUtc: review.reviewedAtUtc,
    evidenceReference: review.evidenceReference,
    reviewSha256: digest(review),
    baselineDigests: {
      staging: contract.environments.staging.baselineDigest,
      production: contract.environments.production.baselineDigest,
    },
  });
  for (const environment of ["staging", "production"]) {
    for (const [fingerprint, decision] of Object.entries(first.environments[environment].decisionsByFingerprint)) {
      const finding = first.environments[environment].findings.find(row => row.fingerprint === fingerprint);
      assert.equal(decision.status, "APPROVED");
      assert.equal(decision.owner, review.reviewer);
      assert.equal(decision.reviewedAtUtc, review.reviewedAtUtc);
      assert.equal(decision.reviewEvidence, review.evidenceReference);
      assert.deepEqual(
        { disposition: decision.disposition, rationale: decision.rationale },
        review.environments[environment].rules[finding.rule],
      );
    }
  }
});

test("approval refuses wrong digests, incomplete rules and unknown dispositions without mutating baseline", () => {
  const { contract } = buildAdvisorArtifacts(sourceWith(tableFinding(), authFinding));
  const before = digest(contract);
  for (const environment of ["staging", "production"]) {
    const wrongDigest = reviewFor(contract);
    wrongDigest.environments[environment].baselineDigest = "0".repeat(64);
    assert.throws(() => applyAdvisorReview(contract, wrongDigest), /ADVISOR_REVIEW_BASELINE_DIGEST_MISMATCH/);
  }

  const missingRule = reviewFor(contract);
  delete missingRule.environments.production.rules.auth_leaked_password_protection;
  assert.throws(() => applyAdvisorReview(contract, missingRule), /ADVISOR_REVIEW_RULE_SET_MISMATCH/);

  const unknownDisposition = reviewFor(contract);
  unknownDisposition.environments.staging.rules.rls_enabled_no_policy.disposition = "APPROVE_EVERYTHING";
  assert.throws(() => applyAdvisorReview(contract, unknownDisposition), /UNKNOWN_ADVISOR_REVIEW_DISPOSITION/);
  assert.equal(digest(contract), before);
  assert.equal(contract.approval.status, "PENDING");
});

test("approval refuses ambiguous reviewer, timestamp, evidence, rationale and duplicate JSON keys", () => {
  const { contract } = buildAdvisorArtifacts(sourceWith(tableFinding()));
  const cases = [
    ["reviewer", "someone-else", /AMBIGUOUS_ADVISOR_REVIEWER/],
    ["reviewedAtUtc", "2026-09-21", /AMBIGUOUS_ADVISOR_REVIEW_TIMESTAMP/],
    ["evidenceReference", "approved", /AMBIGUOUS_ADVISOR_REVIEW_EVIDENCE/],
  ];
  for (const [field, value, expected] of cases) {
    const review = reviewFor(contract);
    review[field] = value;
    assert.throws(() => applyAdvisorReview(contract, review), expected);
  }
  const rationale = reviewFor(contract);
  rationale.environments.production.rules.rls_enabled_no_policy.rationale = "PENDING";
  assert.throws(() => applyAdvisorReview(contract, rationale), /AMBIGUOUS_ADVISOR_REVIEW_RATIONALE/);
  assert.throws(
    () => parseStrictJson('{"reviewer":"@kohnerbouchard-star","reviewer":"someone-else"}', "advisor-review"),
    /AMBIGUOUS_JSON_DUPLICATE_KEY:advisor-review:reviewer/,
  );
});

test("approve CLI writes the reviewed contract only when explicitly invoked", async () => {
  const directory = await mkdtemp(join(tmpdir(), "phase15-advisor-approve-"));
  try {
    const { contract } = buildAdvisorArtifacts(sourceWith(tableFinding()));
    const baselinePath = join(directory, "baseline.json");
    const reviewPath = join(directory, "review.json");
    const outputPath = join(directory, "approved.json");
    await Promise.all([
      writeFile(baselinePath, JSON.stringify(contract, null, 2) + "\n"),
      writeFile(reviewPath, JSON.stringify(reviewFor(contract), null, 2) + "\n"),
    ]);
    execFileSync(process.execPath, [
      fileURLToPath(new URL("./phase15-advisor-exceptions.mjs", import.meta.url)),
      "approve", baselinePath, reviewPath, outputPath,
    ], { stdio: "pipe" });
    const output = JSON.parse(await readFile(outputPath, "utf8"));
    assert.equal(output.approval.status, "APPROVED");
    assert.equal(contract.approval.status, "PENDING");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("exact and resolved-only subset snapshots pass after object-specific approval", () => {
  const rows = [tableFinding(), authFinding];
  const { contract } = buildAdvisorArtifacts(sourceWith(...rows));
  const approved = approve(contract);
  const exact = validateAdvisorSnapshot({ security: rows, performance: [] }, approved, {
    environment: "production",
    projectRef: "cgiukdjwicykrmtkhudh",
  });
  assert.equal(exact.status, "PASS");
  assert.equal(exact.resolvedCount, 0);

  const subset = validateAdvisorSnapshot({ security: [tableFinding()], performance: [] }, approved, {
    environment: "production",
    projectRef: "cgiukdjwicykrmtkhudh",
  });
  assert.equal(subset.status, "PASS");
  assert.equal(subset.currentCount, 1);
  assert.equal(subset.resolvedCount, 1);
});

test("new findings and severity, detail, or metadata changes fail closed", () => {
  const { contract } = buildAdvisorArtifacts(sourceWith(tableFinding()));
  const approved = approve(contract);
  const options = { environment: "production", projectRef: "cgiukdjwicykrmtkhudh" };
  for (const changed of [
    tableFinding({ name: "new_table" }),
    tableFinding({ level: "WARN" }),
    tableFinding({ detail: "Changed detail" }),
    tableFinding({ schema: "private" }),
    tableFinding({ type: "view" }),
  ]) {
    assert.throws(
      () => validateAdvisorSnapshot({ security: [changed], performance: [] }, approved, options),
      /UNAPPROVED_ADVISOR_ADDITION_OR_CHANGE/,
    );
  }
});

test("malformed and duplicate CLI findings fail closed", () => {
  const missingDetail = tableFinding();
  delete missingDetail.detail;
  assert.throws(
    () => parseSupabaseAdvisorJson({ security: [missingDetail], performance: [] }),
    /MALFORMED_ADVISOR_FINDING:detail/,
  );
  assert.throws(
    () => parseSupabaseAdvisorJson({ security: [tableFinding(), tableFinding()], performance: [] }),
    /DUPLICATE_ADVISOR_FINDING/,
  );
  assert.throws(
    () => parseSupabaseAdvisorJson({ security: [{ ...tableFinding(), level: "CRITICAL" }], performance: [] }),
    /MALFORMED_ADVISOR_FINDING:level/,
  );
  assert.throws(
    () => parseSupabaseAdvisorJson({ security: [tableFinding()] }),
    /MALFORMED_ADVISOR_JSON:missing-advisor-collection/,
  );
  assert.throws(
    () => parseSupabaseAdvisorJson({
      security: [{ ...tableFinding(), categories: ["PERFORMANCE"] }],
      performance: [],
    }),
    /MALFORMED_ADVISOR_FINDING:category-bucket-mismatch/,
  );
  assert.throws(
    () => parseSupabaseAdvisorJson({
      security: [{
        rule: "rls_enabled_no_policy",
        title: "RLS Enabled No Policy",
        level: "INFO",
        facing: "EXTERNAL",
        categories: ["SECURITY"],
        remediation: "https://example.test/rls",
        count: 2,
        findings: [{
          schema: "public",
          object: "example_table",
          objectType: "table",
          detail: "one",
        }],
      }],
      performance: [],
    }),
    /MALFORMED_ADVISOR_FINDING:count/,
  );
});

test("wrong environments and project refs fail closed", () => {
  const { contract } = buildAdvisorArtifacts(sourceWith(tableFinding()));
  const approved = approve(contract);
  assert.throws(
    () => validateAdvisorSnapshot({ security: [], performance: [] }, approved, {
      environment: "development",
      projectRef: "cgiukdjwicykrmtkhudh",
    }),
    /WRONG_ADVISOR_ENVIRONMENT/,
  );
  assert.throws(
    () => validateAdvisorSnapshot({ security: [], performance: [] }, approved, {
      environment: "production",
      projectRef: "eecvbssdvarfcykcfrny",
    }),
    /WRONG_ADVISOR_ENVIRONMENT/,
  );
});

test("pending, missing and incomplete review decisions fail closed", () => {
  const raw = { security: [tableFinding()], performance: [] };
  const { contract } = buildAdvisorArtifacts(sourceWith(tableFinding()));
  const options = { environment: "production", projectRef: "cgiukdjwicykrmtkhudh" };
  assert.throws(() => validateAdvisorSnapshot(raw, contract, options), /UNAPPROVED_ADVISOR_EXCEPTION/);

  const incomplete = approve(contract);
  Object.values(incomplete.environments.production.decisionsByFingerprint)[0].rationale = "PENDING";
  assert.throws(() => validateAdvisorSnapshot(raw, incomplete, options), /UNAPPROVED_ADVISOR_EXCEPTION/);

  const rejected = approve(contract);
  Object.values(rejected.environments.production.decisionsByFingerprint)[0].disposition = "REJECTED";
  assert.throws(() => validateAdvisorSnapshot(raw, rejected, options), /UNAPPROVED_ADVISOR_EXCEPTION/);
});

test("tampered findings, digests and decision maps fail closed", () => {
  const raw = { security: [tableFinding()], performance: [] };
  const options = { environment: "production", projectRef: "cgiukdjwicykrmtkhudh" };
  const { contract } = buildAdvisorArtifacts(sourceWith(tableFinding()));

  const changedFinding = approve(contract);
  changedFinding.environments.production.findings[0].detail = "tampered";
  assert.throws(() => validateAdvisorSnapshot(raw, changedFinding, options), /ADVISOR_BASELINE_TAMPERED/);

  const changedDigest = approve(contract);
  changedDigest.environments.production.baselineDigest = "0".repeat(64);
  assert.throws(() => validateAdvisorSnapshot(raw, changedDigest, options), /ADVISOR_BASELINE_TAMPERED/);

  const missingDecision = approve(contract);
  delete missingDecision.environments.production.decisionsByFingerprint[
    missingDecision.environments.production.findings[0].fingerprint
  ];
  assert.throws(() => validateAdvisorSnapshot(raw, missingDecision, options), /ADVISOR_DECISION_MAP_MISMATCH/);
});
