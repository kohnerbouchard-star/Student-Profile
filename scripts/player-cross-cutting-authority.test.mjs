import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AUTHORITY_ID_PATTERN,
  authorityPathForPullRequest,
  verifyAuthority,
} from "./verify-player-cross-cutting-authority.mjs";

const AUTHORIZED_PR = 672;
const AUTHORIZED_BASE = "feat/canonical-fx-authority-v1";
const AUTHORITY_ID = `econovaria.banking-fx-clearing-pr-${AUTHORIZED_PR}.v1`;
const AUTHORITY_PATH = authorityPathForPullRequest(AUTHORIZED_PR);

function manifest() {
  const paths = [
    "backend/supabase/functions/player-api/runtime.ts",
    AUTHORITY_PATH,
    "scripts/player-cross-cutting-authority.test.mjs",
    "scripts/player-edge-trusted-ip-entrypoint-contract.test.mjs",
    "scripts/verify-player-cross-cutting-authority.mjs",
  ];
  return {
    schemaVersion: 1,
    authorityId: AUTHORITY_ID,
    purpose: "authorize-cross-cutting-player-verification",
    pullRequestNumber: AUTHORIZED_PR,
    baseRef: AUTHORIZED_BASE,
    scopeLock: "exact-path-allowlist",
    productionDeploymentAllowed: false,
    productionMutationAllowed: false,
    secretValuesAllowed: false,
    allowedPaths: paths,
    requiredFiles: [
      AUTHORITY_PATH,
      "scripts/player-cross-cutting-authority.test.mjs",
      "scripts/verify-player-cross-cutting-authority.mjs",
    ],
    criticalJobChecks: ["banking-fx-clearing-v1"],
    requiredChecks: [
      "player-terminal-verify",
      "player-edge-trusted-ip-entrypoint-contract",
      "player-production-secret-provision-contract",
      "player-api-read-resilience",
      "database-replay",
      "banking-fx-clearing-v1",
    ],
  };
}

test("cross-cutting Player authority accepts only its PR-bound exact scope", () => {
  const value = manifest();
  assert.match(value.authorityId, AUTHORITY_ID_PATTERN);
  const result = verifyAuthority({
    manifest: value,
    changedPaths: [...value.allowedPaths],
    pullRequestNumber: AUTHORIZED_PR,
    baseRef: AUTHORIZED_BASE,
    manifestPath: AUTHORITY_PATH,
  });
  assert.equal(result.changedPathCount, value.allowedPaths.length);
  assert.equal(result.criticalJobCheckCount, 1);
});

test("cross-cutting Player authority rejects an unreviewed path", () => {
  const value = manifest();
  assert.throws(
    () => verifyAuthority({
      manifest: value,
      changedPaths: [...value.allowedPaths, "scripts/unreviewed-production-step.mjs"],
      pullRequestNumber: AUTHORIZED_PR,
      baseRef: AUTHORIZED_BASE,
      manifestPath: AUTHORITY_PATH,
    }),
    /does not allow changed path/u,
  );
});

test("cross-cutting Player authority rejects identity and production drift", () => {
  const wrongId = manifest();
  wrongId.authorityId = "econovaria.stock-market-runtime-pr-483.v1";
  assert.throws(
    () => verifyAuthority({
      manifest: wrongId,
      changedPaths: wrongId.allowedPaths,
      pullRequestNumber: AUTHORIZED_PR,
      baseRef: AUTHORIZED_BASE,
      manifestPath: AUTHORITY_PATH,
    }),
    /identifier is not bound to this pull request/u,
  );

  const malformedId = manifest();
  malformedId.authorityId = "unscoped-authority";
  assert.throws(
    () => verifyAuthority({
      manifest: malformedId,
      changedPaths: malformedId.allowedPaths,
      pullRequestNumber: AUTHORIZED_PR,
      baseRef: AUTHORIZED_BASE,
      manifestPath: AUTHORITY_PATH,
    }),
    /Unexpected Player authority identifier/u,
  );

  const wrongPr = manifest();
  assert.throws(
    () => verifyAuthority({
      manifest: wrongPr,
      changedPaths: wrongPr.allowedPaths,
      pullRequestNumber: AUTHORIZED_PR + 1,
      baseRef: AUTHORIZED_BASE,
      manifestPath: AUTHORITY_PATH,
    }),
    /not bound to this pull request/u,
  );

  const productionEnabled = manifest();
  productionEnabled.productionMutationAllowed = true;
  assert.throws(
    () => verifyAuthority({
      manifest: productionEnabled,
      changedPaths: productionEnabled.allowedPaths,
      pullRequestNumber: AUTHORIZED_PR,
      baseRef: AUTHORIZED_BASE,
      manifestPath: AUTHORITY_PATH,
    }),
    /deny production mutation/u,
  );
});

test("cross-cutting Player authority binds every critical job as a required check", () => {
  const value = manifest();
  value.requiredChecks = value.requiredChecks.filter((check) =>
    check !== "banking-fx-clearing-v1"
  );
  assert.throws(
    () => verifyAuthority({
      manifest: value,
      changedPaths: value.allowedPaths,
      pullRequestNumber: AUTHORIZED_PR,
      baseRef: AUTHORIZED_BASE,
      manifestPath: AUTHORITY_PATH,
    }),
    /Critical workflow job is not bound as a required check/u,
  );
});

test("Player and Admin CSRF response state remains surface-isolated", async () => {
  const source = await readFile(
    new URL("../frontend/src/core/api.js", import.meta.url),
    "utf8",
  );
  assert.match(
    source,
    /if \(surface === "player" \|\| surface === "playerWebSession"\) \{\s*rememberPlayerCsrf\(result\);\s*\} else if \(surface === "webSession"\) \{\s*rememberAdminCsrf\(result\);\s*\}/u,
  );
  assert.doesNotMatch(
    source,
    /if \(surface === "player" \|\| surface === "playerWebSession"\) rememberPlayerCsrf\(result\);\s*rememberAdminCsrf\(result\);/u,
  );
});

test("Player namespaces retain explicit Vercel rewrites", async () => {
  const configuration = JSON.parse(
    await readFile(new URL("../vercel.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(
    configuration.rewrites.filter((entry) => entry.source.startsWith("/api/player")),
    [
      {
        source: "/api/player-session/:path*",
        destination: "/api/player-session-proxy?path=:path*",
      },
      {
        source: "/api/player/:path*",
        destination: "/api/player-proxy?path=:path*",
      },
    ],
  );
});
