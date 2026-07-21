import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildFullMarketEditorialReview } from "./lib/full-market-editorial-review.mjs";

const MANIFEST_PATH =
  "docs/seed-content/markets/universe/manifest-v1.json";

test("editorial review is deterministic and leaves the source untouched", async () => {
  const before = await readFile(MANIFEST_PATH);
  const first = await buildFullMarketEditorialReview({ repositoryRoot: process.cwd() });
  const second = await buildFullMarketEditorialReview({ repositoryRoot: process.cwd() });
  const after = await readFile(MANIFEST_PATH);

  assert.equal(first.report.counts.instruments, 3_200);
  assert.equal(first.report.structurallyValid, true);
  assert.equal(first.report.activationAuthorized, false);
  assert.equal(first.report.productionAuthorized, false);
  assert.equal(first.report.deterministicOrdering, true);
  assert.equal(first.report.reproducibleOutput, true);
  assert.equal(
    first.report.reviewDigestSha256,
    second.report.reviewDigestSha256,
  );
  assert.deepEqual(first.report, second.report);
  assert.deepEqual(first.transformationPlan, second.transformationPlan);
  assert.equal(sha256(before), sha256(after));
});

test("editorial review emits all required report categories", async () => {
  const { report, transformationPlan } = await buildFullMarketEditorialReview({
    repositoryRoot: process.cwd(),
  });

  assert.ok(Array.isArray(report.placeholderIssuerNames));
  assert.ok(Array.isArray(report.suspiciousLexicalGroups));
  assert.ok(Array.isArray(report.duplicateOrNearDuplicateIssuers));
  assert.ok(Array.isArray(report.duplicateOrConfusingSymbols));
  assert.ok(Array.isArray(report.concentrations.country));
  assert.ok(Array.isArray(report.concentrations.exchange));
  assert.ok(Array.isArray(report.concentrations.sector));
  assert.ok(Array.isArray(report.concentrations.industry));
  assert.ok(Array.isArray(report.unsupportedOrIncompleteMetadata));
  assert.ok(Array.isArray(report.editorialWarnings));
  assert.ok(Array.isArray(report.recordsRequiringHumanApproval));
  assert.equal(transformationPlan.sourceMutationAuthorized, false);
  assert.equal(transformationPlan.automaticActivationAuthorized, false);
  assert.equal(
    transformationPlan.instructionCount,
    transformationPlan.instructions.length,
  );
  assert.ok(
    transformationPlan.instructions.every((instruction) =>
      instruction.activationAuthorized === false &&
      instruction.proposedOperations.every((operation) =>
        operation.automaticRewriteAllowed === false &&
        operation.requiresSeedAuthorityApproval === true
      )
    ),
  );
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
