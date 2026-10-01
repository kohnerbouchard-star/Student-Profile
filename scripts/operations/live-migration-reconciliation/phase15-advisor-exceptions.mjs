#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const TEXT_FIELDS = ["rule", "title", "level", "facing", "detail", "objectType"];
const NULLABLE_TEXT_FIELDS = ["remediation", "schema", "object"];
const LEVELS = new Set(["INFO", "WARN", "ERROR"]);
const APPROVED_DISPOSITIONS = new Set(["ACCEPTED_EXCEPTION", "ACCEPTED_TEMPORARY_EXCEPTION"]);
const EXPECTED_REVIEWER = "@kohnerbouchard-star";
const PENDING = Object.freeze({
  status: "PENDING",
  disposition: "PENDING",
  rationale: "PENDING",
  owner: "PENDING",
  reviewedAtUtc: "PENDING",
  reviewEvidence: "PENDING",
});

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export const digest = value => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
export const textDigest = value => createHash("sha256").update(value).digest("hex");

function fail(code, detail = "") {
  throw new Error(detail ? `${code}:${detail}` : code);
}

/** JSON.parse accepts duplicate object keys and silently keeps the last one. */
export function parseStrictJson(input, label = "json") {
  if (Buffer.isBuffer(input)) input = input.toString("utf8");
  if (typeof input !== "string") fail("MALFORMED_JSON", label);
  let cursor = 0;
  const whitespace = () => {
    while (/\s/u.test(input[cursor] ?? "")) cursor += 1;
  };
  const stringToken = () => {
    whitespace();
    if (input[cursor] !== "\"") fail("MALFORMED_JSON", label);
    const start = cursor++;
    while (cursor < input.length) {
      if (input[cursor] === "\\") {
        cursor += 2;
        continue;
      }
      if (input[cursor++] === "\"") {
        try {
          return JSON.parse(input.slice(start, cursor));
        } catch {
          fail("MALFORMED_JSON", label);
        }
      }
    }
    fail("MALFORMED_JSON", label);
  };
  const valueToken = () => {
    whitespace();
    if (input[cursor] === "{") return objectToken();
    if (input[cursor] === "[") return arrayToken();
    if (input[cursor] === "\"") {
      stringToken();
      return;
    }
    const start = cursor;
    while (cursor < input.length && !/[\s,\]}]/u.test(input[cursor])) cursor += 1;
    if (start === cursor) fail("MALFORMED_JSON", label);
    try {
      JSON.parse(input.slice(start, cursor));
    } catch {
      fail("MALFORMED_JSON", label);
    }
  };
  const objectToken = () => {
    cursor += 1;
    whitespace();
    const keys = new Set();
    if (input[cursor] === "}") {
      cursor += 1;
      return;
    }
    while (cursor < input.length) {
      const key = stringToken();
      if (keys.has(key)) fail("AMBIGUOUS_JSON_DUPLICATE_KEY", `${label}:${key}`);
      keys.add(key);
      whitespace();
      if (input[cursor++] !== ":") fail("MALFORMED_JSON", label);
      valueToken();
      whitespace();
      if (input[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (input[cursor++] !== ",") fail("MALFORMED_JSON", label);
    }
    fail("MALFORMED_JSON", label);
  };
  const arrayToken = () => {
    cursor += 1;
    whitespace();
    if (input[cursor] === "]") {
      cursor += 1;
      return;
    }
    while (cursor < input.length) {
      valueToken();
      whitespace();
      if (input[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (input[cursor++] !== ",") fail("MALFORMED_JSON", label);
    }
    fail("MALFORMED_JSON", label);
  };
  valueToken();
  whitespace();
  if (cursor !== input.length) fail("MALFORMED_JSON", label);
  try {
    return JSON.parse(input);
  } catch {
    fail("MALFORMED_JSON", label);
  }
}

function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) {
    fail("MALFORMED_ADVISOR_FINDING", field);
  }
  return value;
}

function nullableText(value, field) {
  if (value === null || value === undefined) return null;
  return requiredText(value, field);
}

function normalizeCategories(value, defaultCategory) {
  const source = value === undefined && defaultCategory ? [defaultCategory] : value;
  if (!Array.isArray(source) || source.length === 0 || source.some(item => typeof item !== "string" || !item.trim())) {
    fail("MALFORMED_ADVISOR_FINDING", "categories");
  }
  const normalized = [...new Set(source.map(item => item.trim().toUpperCase()))].sort();
  if (normalized.length !== source.length) fail("MALFORMED_ADVISOR_FINDING", "duplicate-category");
  return normalized;
}

function findingPayload(finding) {
  return Object.fromEntries([
    ...TEXT_FIELDS.map(field => [field, finding[field]]),
    ...NULLABLE_TEXT_FIELDS.map(field => [field, finding[field]]),
    ["categories", finding.categories],
  ]);
}

export function advisorFingerprint(finding) {
  return digest(findingPayload(finding));
}

function normalizeFinding(group, finding, defaultCategory) {
  if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
    fail("MALFORMED_ADVISOR_FINDING", "finding-object");
  }
  const metadata = finding.metadata;
  if (metadata !== undefined && (!metadata || typeof metadata !== "object" || Array.isArray(metadata))) {
    fail("MALFORMED_ADVISOR_FINDING", "metadata");
  }

  const normalized = {
    rule: requiredText(group.rule ?? group.name ?? finding.rule ?? finding.name, "rule"),
    title: requiredText(group.title ?? finding.title, "title"),
    level: requiredText(group.level ?? finding.level, "level").toUpperCase(),
    facing: requiredText(group.facing ?? finding.facing, "facing").toUpperCase(),
    categories: normalizeCategories(group.categories ?? finding.categories, defaultCategory),
    remediation: nullableText(group.remediation ?? finding.remediation, "remediation"),
    schema: nullableText(finding.schema ?? metadata?.schema, "schema"),
    object: nullableText(finding.object ?? metadata?.name, "object"),
    objectType: requiredText(finding.objectType ?? metadata?.type, "objectType"),
    detail: requiredText(finding.detail, "detail"),
  };
  if (!/^[a-z0-9_]+$/u.test(normalized.rule)) fail("MALFORMED_ADVISOR_FINDING", "rule");
  if (!LEVELS.has(normalized.level)) fail("MALFORMED_ADVISOR_FINDING", "level");
  if (defaultCategory && !normalized.categories.includes(defaultCategory)) {
    fail("MALFORMED_ADVISOR_FINDING", "category-bucket-mismatch");
  }
  if ((normalized.schema === null) !== (normalized.object === null) && normalized.objectType !== "auth") {
    fail("MALFORMED_ADVISOR_FINDING", "schema-object-pair");
  }
  const fingerprint = advisorFingerprint(normalized);
  return { ...normalized, fingerprint };
}

function advisorCollections(value) {
  if (Array.isArray(value)) return [{ category: null, rows: value }];
  if (!value || typeof value !== "object") fail("MALFORMED_ADVISOR_JSON", "root");

  const collections = [];
  const categoryKeys = ["security", "performance"];
  for (const category of categoryKeys) {
    if (value[category] !== undefined) {
      if (!Array.isArray(value[category])) fail("MALFORMED_ADVISOR_JSON", category);
      collections.push({ category: category.toUpperCase(), rows: value[category] });
    }
  }
  if (collections.length) {
    if (collections.length !== categoryKeys.length) fail("MALFORMED_ADVISOR_JSON", "missing-advisor-collection");
    return collections;
  }

  for (const key of ["advisors", "result", "data"]) {
    if (value[key] !== undefined) return advisorCollections(value[key]);
  }
  fail("MALFORMED_ADVISOR_JSON", "advisor-collections");
}

/**
 * Parse either Supabase CLI advisor JSON (one row per finding) or the grouped,
 * sanitized shape used by the Phase 15 evidence capture. `observed_at` and
 * `observedAt` are deliberately never copied into the canonical fingerprint.
 */
export function parseSupabaseAdvisorJson(input) {
  let value = input;
  if (Buffer.isBuffer(value)) value = value.toString("utf8");
  if (typeof value === "string") {
    try {
      value = parseStrictJson(value, "advisor-json");
    } catch (error) {
      if (error.message.startsWith("AMBIGUOUS_JSON_DUPLICATE_KEY")) throw error;
      fail("MALFORMED_ADVISOR_JSON", "invalid-json");
    }
  }

  const findings = [];
  for (const { category, rows } of advisorCollections(value)) {
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row)) {
        fail("MALFORMED_ADVISOR_FINDING", "advisor-row");
      }
      if (row.findings !== undefined) {
        if (!Array.isArray(row.findings)) fail("MALFORMED_ADVISOR_FINDING", "findings");
        if (row.count !== undefined && (!Number.isSafeInteger(row.count) || row.count !== row.findings.length)) {
          fail("MALFORMED_ADVISOR_FINDING", "count");
        }
        for (const finding of row.findings) findings.push(normalizeFinding(row, finding, category));
      } else {
        findings.push(normalizeFinding(row, row, category));
      }
    }
  }

  const seen = new Set();
  for (const finding of findings) {
    if (seen.has(finding.fingerprint)) fail("DUPLICATE_ADVISOR_FINDING", finding.fingerprint);
    seen.add(finding.fingerprint);
  }
  return findings.sort(compareFindings);
}

function compareFindings(a, b) {
  return a.rule.localeCompare(b.rule)
    || (a.schema ?? "").localeCompare(b.schema ?? "")
    || (a.object ?? "").localeCompare(b.object ?? "")
    || a.objectType.localeCompare(b.objectType)
    || a.detail.localeCompare(b.detail)
    || a.fingerprint.localeCompare(b.fingerprint);
}

function countsByRule(findings) {
  const counts = {};
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function validateProjectRef(value, field = "projectRef") {
  if (typeof value !== "string" || !/^[a-z]{20}$/u.test(value)) fail("MALFORMED_ADVISOR_CONTRACT", field);
  return value;
}

export function buildAdvisorArtifacts(source) {
  if (!source || typeof source !== "object" || source.schemaVersion !== 1 || !source.environments) {
    fail("MALFORMED_ADVISOR_SOURCE");
  }
  requiredText(source.generatedAtUtc, "generatedAtUtc");
  const evidenceEnvironments = {};
  const contractEnvironments = {};
  for (const environment of ["staging", "production"]) {
    const raw = source.environments[environment];
    if (!raw || typeof raw !== "object") fail("MALFORMED_ADVISOR_SOURCE", environment);
    const projectRef = validateProjectRef(raw.projectRef);
    const findings = parseSupabaseAdvisorJson({ security: raw.security, performance: raw.performance });
    const baselineDigest = digest(findings);
    evidenceEnvironments[environment] = {
      projectRef,
      findingCount: findings.length,
      countsByRule: countsByRule(findings),
      baselineDigest,
      findings,
    };
    contractEnvironments[environment] = {
      projectRef,
      findingCount: findings.length,
      countsByRule: countsByRule(findings),
      baselineDigest,
      findings,
      decisionsByFingerprint: Object.fromEntries(findings.map(({ fingerprint }) => [fingerprint, { ...PENDING }])),
    };
  }

  const evidence = {
    schemaVersion: 1,
    evidenceId: "econovaria.phase15.advisors.sanitized.v1",
    capturedAtUtc: source.generatedAtUtc,
    source: requiredText(source.source, "source"),
    sanitization: {
      excludedFields: ["observed_at", "observedAt"],
      retainedFields: [
        "rule", "title", "level", "facing", "categories", "remediation",
        "schema", "object", "objectType", "detail", "fingerprint",
      ],
    },
    environments: evidenceEnvironments,
  };
  const contract = {
    schemaVersion: 1,
    contractId: "econovaria.phase15.advisor-exceptions.v1",
    sourceEvidence: "docs/operations/evidence/phase15-certification/2026-09-21/advisors-sanitized.json",
    sourceEvidenceSha256: textDigest(JSON.stringify(evidence, null, 2) + "\n"),
    policy: {
      comparison: "CURRENT_MUST_BE_AN_APPROVED_SUBSET_OF_BASELINE",
      resolvedRemovalsAllowed: true,
      additionsAllowed: false,
      changedSeverityDetailOrMetadataAllowed: false,
      duplicateFindingsAllowed: false,
      approvalRequiredForEveryCurrentFingerprint: true,
      pendingDecisionFailsClosed: true,
      approvedDecisionStatus: "APPROVED",
      approvedDispositions: [...APPROVED_DISPOSITIONS].sort(),
    },
    approval: {
      status: "PENDING",
      reviewer: "PENDING",
      reviewedAtUtc: "PENDING",
      evidenceReference: "PENDING",
      reviewSha256: "PENDING",
      baselineDigests: {
        staging: "PENDING",
        production: "PENDING",
      },
    },
    environments: contractEnvironments,
  };
  return { evidence, contract };
}

function assertContractEnvironment(contract, environment, projectRef) {
  if (!contract || typeof contract !== "object"
      || contract.schemaVersion !== 1
      || contract.contractId !== "econovaria.phase15.advisor-exceptions.v1"
      || !/^[0-9a-f]{64}$/u.test(contract.sourceEvidenceSha256 ?? "")
      || !contract.environments) {
    fail("MALFORMED_ADVISOR_CONTRACT");
  }
  if (typeof environment !== "string" || !contract.environments[environment]) {
    fail("WRONG_ADVISOR_ENVIRONMENT", String(environment));
  }
  const expected = contract.environments[environment];
  validateProjectRef(projectRef, "suppliedProjectRef");
  if (projectRef !== expected.projectRef) fail("WRONG_ADVISOR_ENVIRONMENT", projectRef);
  if (!Array.isArray(expected.findings) || !expected.decisionsByFingerprint) {
    fail("MALFORMED_ADVISOR_CONTRACT", environment);
  }
  const fingerprints = new Set();
  for (const finding of expected.findings) {
    const normalized = normalizeFinding(finding, finding);
    if (normalized.fingerprint !== finding.fingerprint) fail("ADVISOR_BASELINE_TAMPERED", finding.fingerprint ?? "missing");
    if (fingerprints.has(finding.fingerprint)) fail("DUPLICATE_ADVISOR_BASELINE", finding.fingerprint);
    fingerprints.add(finding.fingerprint);
  }
  if (expected.findingCount !== expected.findings.length
      || expected.baselineDigest !== digest(expected.findings)
      || JSON.stringify(expected.countsByRule) !== JSON.stringify(countsByRule(expected.findings))) {
    fail("ADVISOR_BASELINE_TAMPERED", environment);
  }
  const decisionFingerprints = Object.keys(expected.decisionsByFingerprint).sort();
  const findingFingerprints = [...fingerprints].sort();
  if (JSON.stringify(decisionFingerprints) !== JSON.stringify(findingFingerprints)) {
    fail("ADVISOR_DECISION_MAP_MISMATCH", environment);
  }
  return expected;
}

function plainObject(value, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function exactKeys(value, expected, code) {
  plainObject(value, code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(code, "keys");
}

function validReviewedAtUtc(value) {
  return typeof value === "string"
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)
    && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function explicitReference(value) {
  return typeof value === "string"
    && value.trim() === value
    && value.length >= 12
    && !/^(?:PENDING|TODO|TBD|NONE|N\/?A)$/iu.test(value)
    && /[:/#]/u.test(value);
}

function explicitRationale(value) {
  return typeof value === "string"
    && value.trim() === value
    && value.length >= 20
    && !/^(?:PENDING|TODO|TBD|NONE|N\/?A)$/iu.test(value);
}

function pendingDecision(decision) {
  return decision && Object.keys(PENDING).every(key => decision[key] === PENDING[key])
    && Object.keys(decision).length === Object.keys(PENDING).length;
}

export function applyAdvisorReview(contract, reviewInput) {
  plainObject(contract, "MALFORMED_ADVISOR_CONTRACT");
  const review = typeof reviewInput === "string" || Buffer.isBuffer(reviewInput)
    ? parseStrictJson(reviewInput, "advisor-review")
    : structuredClone(reviewInput);
  exactKeys(review, [
    "schemaVersion", "reviewer", "reviewedAtUtc", "evidenceReference", "environments",
  ], "MALFORMED_ADVISOR_REVIEW");
  if (review.schemaVersion !== 1) fail("MALFORMED_ADVISOR_REVIEW", "schemaVersion");
  if (review.reviewer !== EXPECTED_REVIEWER) fail("AMBIGUOUS_ADVISOR_REVIEWER");
  if (!validReviewedAtUtc(review.reviewedAtUtc)) fail("AMBIGUOUS_ADVISOR_REVIEW_TIMESTAMP");
  if (!explicitReference(review.evidenceReference)) fail("AMBIGUOUS_ADVISOR_REVIEW_EVIDENCE");
  exactKeys(review.environments, ["staging", "production"], "MALFORMED_ADVISOR_REVIEW_ENVIRONMENTS");

  exactKeys(contract.approval, [
    "status", "reviewer", "reviewedAtUtc", "evidenceReference", "reviewSha256", "baselineDigests",
  ], "MALFORMED_ADVISOR_APPROVAL_STATE");
  if (contract.approval.status !== "PENDING"
      || contract.approval.reviewer !== "PENDING"
      || contract.approval.reviewedAtUtc !== "PENDING"
      || contract.approval.evidenceReference !== "PENDING"
      || contract.approval.reviewSha256 !== "PENDING") {
    fail("ADVISOR_BASELINE_ALREADY_REVIEWED");
  }
  exactKeys(contract.approval.baselineDigests, ["staging", "production"], "MALFORMED_ADVISOR_APPROVAL_STATE");
  if (Object.values(contract.approval.baselineDigests).some(value => value !== "PENDING")) {
    fail("ADVISOR_BASELINE_ALREADY_REVIEWED");
  }

  const approved = structuredClone(contract);
  const baselineDigests = {};
  for (const environment of ["staging", "production"]) {
    const baseline = assertContractEnvironment(contract, environment, contract.environments?.[environment]?.projectRef);
    if (Object.values(baseline.decisionsByFingerprint).some(decision => !pendingDecision(decision))) {
      fail("ADVISOR_BASELINE_ALREADY_REVIEWED", environment);
    }
    const environmentReview = review.environments[environment];
    exactKeys(environmentReview, ["baselineDigest", "rules"], "MALFORMED_ADVISOR_REVIEW_ENVIRONMENT");
    if (environmentReview.baselineDigest !== baseline.baselineDigest) {
      fail("ADVISOR_REVIEW_BASELINE_DIGEST_MISMATCH", environment);
    }
    exactKeys(environmentReview.rules, Object.keys(baseline.countsByRule), "ADVISOR_REVIEW_RULE_SET_MISMATCH");
    for (const [rule, decision] of Object.entries(environmentReview.rules)) {
      exactKeys(decision, ["disposition", "rationale"], "MALFORMED_ADVISOR_RULE_REVIEW");
      if (!APPROVED_DISPOSITIONS.has(decision.disposition)) {
        fail("UNKNOWN_ADVISOR_REVIEW_DISPOSITION", `${environment}:${rule}`);
      }
      if (!explicitRationale(decision.rationale)) fail("AMBIGUOUS_ADVISOR_REVIEW_RATIONALE", `${environment}:${rule}`);
    }
    for (const finding of approved.environments[environment].findings) {
      const ruleReview = environmentReview.rules[finding.rule];
      approved.environments[environment].decisionsByFingerprint[finding.fingerprint] = {
        status: "APPROVED",
        disposition: ruleReview.disposition,
        rationale: ruleReview.rationale,
        owner: review.reviewer,
        reviewedAtUtc: review.reviewedAtUtc,
        reviewEvidence: review.evidenceReference,
      };
    }
    baselineDigests[environment] = baseline.baselineDigest;
  }
  approved.approval = {
    status: "APPROVED",
    reviewer: review.reviewer,
    reviewedAtUtc: review.reviewedAtUtc,
    evidenceReference: review.evidenceReference,
    reviewSha256: digest(review),
    baselineDigests,
  };
  return approved;
}

function approvedDecision(decision, approval, environment, baselineDigest) {
  if (!decision || typeof decision !== "object" || Array.isArray(decision)) return false;
  if (!approval || approval.status !== "APPROVED"
      || approval.reviewer !== EXPECTED_REVIEWER
      || !validReviewedAtUtc(approval.reviewedAtUtc)
      || !explicitReference(approval.evidenceReference)
      || !/^[0-9a-f]{64}$/u.test(approval.reviewSha256 ?? "")
      || approval.baselineDigests?.[environment] !== baselineDigest) return false;
  if (decision.status !== "APPROVED") return false;
  if (!APPROVED_DISPOSITIONS.has(decision.disposition)) return false;
  return explicitRationale(decision.rationale)
    && decision.owner === approval.reviewer
    && decision.reviewedAtUtc === approval.reviewedAtUtc
    && decision.reviewEvidence === approval.evidenceReference;
}

export function validateAdvisorSnapshot(input, contract, { environment, projectRef } = {}) {
  const baseline = assertContractEnvironment(contract, environment, projectRef);
  const current = parseSupabaseAdvisorJson(input);
  const baselineByFingerprint = new Map(baseline.findings.map(finding => [finding.fingerprint, finding]));
  const additions = current.filter(finding => !baselineByFingerprint.has(finding.fingerprint));
  if (additions.length) {
    fail("UNAPPROVED_ADVISOR_ADDITION_OR_CHANGE", additions.map(({ fingerprint }) => fingerprint).join(","));
  }
  const unapproved = current.filter(({ fingerprint }) => !approvedDecision(
    baseline.decisionsByFingerprint[fingerprint], contract.approval, environment, baseline.baselineDigest,
  ));
  if (unapproved.length) fail("UNAPPROVED_ADVISOR_EXCEPTION", unapproved.map(({ fingerprint }) => fingerprint).join(","));

  const currentFingerprints = new Set(current.map(({ fingerprint }) => fingerprint));
  const resolved = baseline.findings.filter(({ fingerprint }) => !currentFingerprints.has(fingerprint));
  return {
    schemaVersion: 1,
    status: "PASS",
    environment,
    projectRef,
    comparison: "APPROVED_SUBSET",
    baselineCount: baseline.findings.length,
    currentCount: current.length,
    resolvedCount: resolved.length,
    baselineDigest: baseline.baselineDigest,
    currentDigest: digest(current),
    currentFingerprints: current.map(({ fingerprint }) => fingerprint).sort(),
    resolvedFingerprints: resolved.map(({ fingerprint }) => fingerprint).sort(),
  };
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "build") {
    const [inputPath, contractPath, evidencePath] = args;
    if (!inputPath || !contractPath || !evidencePath) {
      fail("USAGE", "build INPUT_JSON CONTRACT_JSON EVIDENCE_JSON");
    }
    const source = parseStrictJson(await readFile(resolve(inputPath), "utf8"), "advisor-source");
    const { contract, evidence } = buildAdvisorArtifacts(source);
    await writeFile(resolve(contractPath), JSON.stringify(contract, null, 2) + "\n");
    await writeFile(resolve(evidencePath), JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify({
      contractSha256: textDigest(JSON.stringify(contract, null, 2) + "\n"),
      evidenceSha256: textDigest(JSON.stringify(evidence, null, 2) + "\n"),
      counts: Object.fromEntries(Object.entries(contract.environments).map(([name, value]) => [name, value.findingCount])),
    }, null, 2));
    return;
  }
  if (command === "validate") {
    const [inputPath, contractPath, environment, projectRef, outputPath] = args;
    if (!inputPath || !contractPath || !environment || !projectRef) {
      fail("USAGE", "validate INPUT_JSON CONTRACT_JSON ENVIRONMENT PROJECT_REF [OUTPUT_JSON]");
    }
    const [input, contract] = await Promise.all([
      readFile(resolve(inputPath), "utf8"),
      readFile(resolve(contractPath), "utf8").then(value => parseStrictJson(value, "advisor-baseline")),
    ]);
    const result = validateAdvisorSnapshot(input, contract, { environment, projectRef });
    if (outputPath) await writeFile(resolve(outputPath), JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "approve") {
    const [contractPath, reviewPath, outputPath] = args;
    if (!contractPath || !reviewPath) fail("USAGE", "approve BASELINE_JSON REVIEW_JSON [OUTPUT_JSON]");
    const [contractText, reviewText] = await Promise.all([
      readFile(resolve(contractPath), "utf8"),
      readFile(resolve(reviewPath), "utf8"),
    ]);
    const contract = parseStrictJson(contractText, "advisor-baseline");
    const approved = applyAdvisorReview(contract, reviewText);
    const output = JSON.stringify(approved, null, 2) + "\n";
    if (outputPath) {
      await writeFile(resolve(outputPath), output);
      console.log(JSON.stringify({
        status: approved.approval.status,
        reviewer: approved.approval.reviewer,
        reviewedAtUtc: approved.approval.reviewedAtUtc,
        reviewSha256: approved.approval.reviewSha256,
        outputSha256: textDigest(output),
      }, null, 2));
    } else {
      process.stdout.write(output);
    }
    return;
  }
  fail("USAGE", "build|validate|approve");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
