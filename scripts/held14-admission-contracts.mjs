// Pure finite metadata contracts. CI extracts this module from the same trusted base as the gate.
import assert from "node:assert/strict";
const fail = (condition, message) => assert.ok(condition, message);
const same = (a, b, message) => assert.deepEqual(a, b, message);
const SHA = /^[a-f0-9]{40}$/u;

export function verifyTrigger(before, after, authorityPath) {
  const line = `      - "${authorityPath}"\n`;
  fail(!before.includes(authorityPath), "Authority trigger already exists");
  const section = before.match(/^  pull_request:\n(?:(?: {4}.*|)\n)*/mu)?.[0];
  fail(
    section && section.includes("    paths:\n"),
    "Expected explicit PR paths section",
  );
  const expected = before.replace(
    section,
    section.replace("    paths:\n", `    paths:\n${line}`),
  );
  same(
    after,
    expected,
    "Only the own-authority insertion into PR paths is permitted",
  );
}
export const CLASSROOM_READ_FILES = [
  "dispatchPlayerWorldRoutes.ts",
  "dispatchPlayerEconomyRoutes.ts",
  "dispatchStaffRoutes.ts",
  "classroomClients.ts",
].map((name) => `supabase/functions/classroom-api/${name}`);
export function withClassroomReads(before) {
  const anchor = "--allow-read=supabase/functions/classroom-api/index.ts";
  fail(before.includes(anchor), "Expected finite Classroom read argument");
  return before.replaceAll(
    anchor,
    `${anchor},${CLASSROOM_READ_FILES.join(",")}`,
  );
}
export function verifyAuthority(manifest, inherited, record, changedPaths) {
  fail(
    manifest.schemaVersion === 1 &&
      manifest.purpose === "authorize-cross-cutting-player-verification",
    "Invalid authority",
  );
  fail(
    new RegExp(
      `^econovaria\\.[a-z0-9]+(?:-[a-z0-9]+)*-pr-${record.pullRequestNumber}\\.v1$`,
      "u",
    ).test(manifest.authorityId),
    "Authority ID mismatch",
  );
  fail(
    manifest.pullRequestNumber === record.pullRequestNumber &&
      manifest.baseRef === "main",
    "Authority PR/base mismatch",
  );
  fail(
    manifest.scopeLock === "exact-path-allowlist",
    "Authority must be exact",
  );
  for (
    const flag of [
      "productionDeploymentAllowed",
      "productionMutationAllowed",
      "secretValuesAllowed",
    ]
  ) fail(manifest[flag] === false, `Authority escalates ${flag}`);
  for (
    const [field, count] of [["requiredChecks", 151], [
      "criticalJobChecks",
      105,
    ]]
  ) {
    fail(
      inherited[field].length === count,
      "Unexpected inherited checks baseline",
    );
    fail(Array.isArray(manifest[field]), `Missing ${field}`);
    same(
      manifest[field].slice(0, count),
      inherited[field],
      `Inherited ordered ${field} changed`,
    );
    fail(
      new Set(manifest[field]).size === manifest[field].length,
      `Duplicate ${field}`,
    );
  }
  if (record.tranche === "economy2") {
    for (
      const name of [
        "Economic Balance and Exploit Lab",
        "Validate isolated economic simulation tranche",
      ]
    ) {
      fail(manifest.requiredChecks.includes(name), `Missing ${name}`);
    }
    fail(
      manifest.criticalJobChecks.includes(
        "Validate isolated economic simulation tranche",
      ),
      "Lab job must be critical",
    );
  }
  for (const name of manifest.criticalJobChecks) {
    fail(manifest.requiredChecks.includes(name), "Critical check not required");
  }
  fail(
    Array.isArray(manifest.allowedPaths) &&
      Array.isArray(manifest.requiredFiles),
    "Missing authority file lists",
  );
  for (const file of changedPaths) {
    fail(manifest.allowedPaths.includes(file), `Authority omits ${file}`);
  }
  for (const file of manifest.requiredFiles) {
    fail(
      manifest.allowedPaths.includes(file),
      `Required file outside authority: ${file}`,
    );
  }
  for (
    const file of [
      `docs/operations/contracts/player-cross-cutting/pr-${record.pullRequestNumber}.json`,
      "scripts/verify-player-cross-cutting-authority.mjs",
      "scripts/player-cross-cutting-authority.test.mjs",
    ]
  ) {
    fail(
      manifest.allowedPaths.includes(file),
      `Authority does not lock ${file}`,
    );
  }
}
export function verifyRetainedEvidence(before, after, sourceHashes) {
  const expected = structuredClone(before);
  let replacements = 0;
  for (const review of expected.reviews) {
    for (
      const file of [
        "backend/package.json",
        "backend/supabase/functions/classroom-api/index.ts",
      ]
    ) {
      if (Object.hasOwn(review.sourceEvidenceBlobs ?? {}, file)) {
        fail(
          SHA.test(sourceHashes[file] ?? ""),
          "Missing retained source hash",
        );
        review.sourceEvidenceBlobs[file] = sourceHashes[file];
        replacements++;
      }
    }
  }
  fail(replacements === 4, "Unexpected retained-source field count");
  same(after, expected, "Only four retained-source blob bindings may change");
}
