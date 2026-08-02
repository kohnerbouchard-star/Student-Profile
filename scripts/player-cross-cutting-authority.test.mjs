import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_AUTHORITY_PATH,
  EXPECTED_AUTHORITY_ID,
  verifyAuthority,
} from "./verify-player-cross-cutting-authority.mjs";

const AUTHORIZED_PR = 490;

function manifest() {
  return {
    schemaVersion: 1,
    authorityId: EXPECTED_AUTHORITY_ID,
    purpose: "authorize-cross-cutting-player-verification",
    pullRequestNumber: AUTHORIZED_PR,
    baseRef: "main",
    scopeLock: "exact-path-allowlist",
    productionDeploymentAllowed: false,
    productionMutationAllowed: false,
    secretValuesAllowed: false,
    allowedPaths: [
      DEFAULT_AUTHORITY_PATH,
      "frontend/src/core/login-signed-out-cleanup.js",
      "frontend/src/core/login-surface-guard.js",
      "index.html",
      "scripts/admin-browser-reconnaissance.mjs",
      "scripts/player-cross-cutting-authority.test.mjs",
      "scripts/security-audit-remediation-contract.test.mjs",
      "scripts/verify-player-cross-cutting-authority.mjs",
      "vercel.json",
    ],
    requiredFiles: [
      DEFAULT_AUTHORITY_PATH,
      "frontend/src/core/login-signed-out-cleanup.js",
      "frontend/src/core/login-surface-guard.js",
      "index.html",
      "scripts/admin-browser-reconnaissance.mjs",
      "scripts/player-cross-cutting-authority.test.mjs",
      "scripts/security-audit-remediation-contract.test.mjs",
      "scripts/verify-player-cross-cutting-authority.mjs",
      "vercel.json",
    ],
    requiredChecks: [
      "player-terminal-verify",
      "player-edge-trusted-ip-entrypoint-contract",
      "player-production-secret-provision-contract",
      "player-api-read-resilience",
      "player-bff-retry-classification",
      "local-edge-runtime-isolation",
    ],
  };
}

test("cross-cutting Player authority accepts only its PR-bound exact scope", () => {
  const value = manifest();
  const result = verifyAuthority({
    manifest: value,
    changedPaths: [...value.allowedPaths],
    pullRequestNumber: AUTHORIZED_PR,
    baseRef: "main",
  });
  assert.equal(result.changedPathCount, value.allowedPaths.length);
});

test("cross-cutting Player authority rejects an unreviewed path", () => {
  const value = manifest();
  assert.throws(
    () => verifyAuthority({
      manifest: value,
      changedPaths: [...value.allowedPaths, "scripts/unreviewed-production-step.mjs"],
      pullRequestNumber: AUTHORIZED_PR,
      baseRef: "main",
    }),
    /does not allow changed path/u,
  );
});

test("cross-cutting Player authority rejects identity and production drift", () => {
  const wrongPr = manifest();
  assert.throws(
    () => verifyAuthority({
      manifest: wrongPr,
      changedPaths: wrongPr.allowedPaths,
      pullRequestNumber: AUTHORIZED_PR + 1,
      baseRef: "main",
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
      baseRef: "main",
    }),
    /deny production mutation/u,
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
