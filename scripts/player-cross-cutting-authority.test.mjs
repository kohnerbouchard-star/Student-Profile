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

test("Phase 14B ordered integration is bound to PR 685 and main", async () => {
  const manifestPath = authorityPathForPullRequest(685);
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  const input = { manifest: value, changedPaths: value.allowedPaths, pullRequestNumber: 685, baseRef: "main", manifestPath };
  assert.ok(verifyAuthority(input).changedPathCount > 0);
  assert.throws(() => verifyAuthority({ ...input, baseRef: "feat/business-financial-reporting-v2" }), /base ref/u);
  assert.throws(() => verifyAuthority({ ...input, pullRequestNumber: 684 }), /not bound/u);
  assert.throws(() => verifyAuthority({ ...input, changedPaths: [...value.allowedPaths, "unreviewed.sql"] }), /does not allow/u);
  assert.equal(value.productionDeploymentAllowed, false);
  assert.equal(value.productionMutationAllowed, false);
});

test("Phase 13 retained verification is bound to PR 682 and its exact paths", async () => {
  const manifestPath = authorityPathForPullRequest(682);
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  const input = { manifest: value, changedPaths: value.allowedPaths, pullRequestNumber: 682, baseRef: "main", manifestPath };
  assert.ok(verifyAuthority(input).changedPathCount > 0);
  assert.throws(() => verifyAuthority({ ...input, pullRequestNumber: 681 }), /not bound/u);
  assert.throws(() => verifyAuthority({ ...input, baseRef: "feat/player-business-workspace-v2" }), /base ref/u);
  assert.throws(() => verifyAuthority({ ...input, changedPaths: [...value.allowedPaths, "unreviewed.sql"] }), /does not allow/u);
  assert.equal(value.productionDeploymentAllowed, false);
  assert.equal(value.productionMutationAllowed, false);
});

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

test("Phase 14C retained verification is bound to PR 686 and exact IPO paths", async () => {
  const manifestPath = authorityPathForPullRequest(686);
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  const input = { manifest: value, changedPaths: value.allowedPaths, pullRequestNumber: 686, baseRef: "main", manifestPath };
  assert.ok(verifyAuthority(input).changedPathCount > 0);
  assert.throws(() => verifyAuthority({ ...input, baseRef: "feat/business-common-equity-v2" }), /base ref/u);
  assert.throws(() => verifyAuthority({ ...input, changedPaths: [...value.allowedPaths, "scripts/unreviewed.sql"] }), /does not allow/u);
  for (const gate of ["business-primary-ipo-source", "business-primary-ipo-database", "business-primary-ipo-browser"]) assert.ok(value.criticalJobChecks.includes(gate));
});

test("Phase 14D retained verification binds PR 687 to main and exact Market paths", async () => {
  const manifestPath = authorityPathForPullRequest(687);
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  const input = { manifest: value, changedPaths: value.allowedPaths, pullRequestNumber: 687, baseRef: "main", manifestPath };
  assert.ok(verifyAuthority(input).changedPathCount > 0);
  assert.throws(() => verifyAuthority({ ...input, pullRequestNumber: 686 }), /pull request/u);
  assert.throws(() => verifyAuthority({ ...input, baseRef: "feat/business-ipo-issuance-v2" }), /base ref/u);
  assert.throws(() => verifyAuthority({ ...input, changedPaths: [...value.allowedPaths, "scripts/unreviewed.sql"] }), /does not allow/u);
  for (const gate of ["business-financial-market-source", "business-financial-market-database", "business-financial-market-browser"]) assert.ok(value.criticalJobChecks.includes(gate));
});


test("Phase 15A audit authority binds PR 689 and rejects runtime or production expansion", async () => {
  const manifestPath = authorityPathForPullRequest(689);
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  const input = { manifest: value, changedPaths: value.allowedPaths, pullRequestNumber: 689, baseRef: "main", manifestPath };
  assert.ok(verifyAuthority(input).changedPathCount > 0);
  assert.throws(() => verifyAuthority({ ...input, pullRequestNumber: 688 }), /not bound/u);
  assert.throws(() => verifyAuthority({ ...input, baseRef: "release/production" }), /base ref/u);
  assert.throws(() => verifyAuthority({ ...input, changedPaths: [...value.allowedPaths, "backend/supabase/functions/player-api/runtime.ts"] }), /does not allow/u);
  assert.throws(() => verifyAuthority({ ...input, manifest: { ...value, productionMutationAllowed: true } }), /deny production mutation/u);
  assert.throws(() => verifyAuthority({ ...input, manifest: { ...value, productionDeploymentAllowed: true } }), /deny production deployment/u);
  assert.throws(() => verifyAuthority({ ...input, manifest: { ...value, secretValuesAllowed: true } }), /deny secret-value handling/u);
  for (const gate of ["business-financial-reporting-source", "business-common-equity-database", "business-primary-ipo-browser", "business-financial-market-database", "admin-business-supervision-source"]) assert.ok(value.criticalJobChecks.includes(gate));
});

test("Phase 15 environment boundary correction binds PR 691 and remains read-only", async () => {
  const manifestPath = authorityPathForPullRequest(691);
  const value = JSON.parse(await readFile(manifestPath, "utf8"));
  const input = { manifest: value, changedPaths: value.allowedPaths, pullRequestNumber: 691, baseRef: "main", manifestPath };
  assert.equal(verifyAuthority(input).changedPathCount, value.allowedPaths.length);
  assert.throws(() => verifyAuthority({ ...input, pullRequestNumber: 690 }), /not bound/u);
  assert.throws(() => verifyAuthority({ ...input, changedPaths: [...value.allowedPaths, "backend/supabase/migrations/20260920000000_unreviewed.sql"] }), /does not allow/u);
  assert.throws(() => verifyAuthority({ ...input, manifest: { ...value, productionMutationAllowed: true } }), /deny production mutation/u);
  assert.throws(() => verifyAuthority({ ...input, manifest: { ...value, productionDeploymentAllowed: true } }), /deny production deployment/u);
  assert.throws(() => verifyAuthority({ ...input, manifest: { ...value, secretValuesAllowed: true } }), /deny secret-value handling/u);
});
