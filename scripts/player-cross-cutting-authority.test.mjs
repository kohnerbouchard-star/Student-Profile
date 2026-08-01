import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  DEFAULT_AUTHORITY_PATH,
  EXPECTED_AUTHORITY_ID,
  verifyAuthority,
} from "./verify-player-cross-cutting-authority.mjs";

function manifest() {
  return {
    schemaVersion: 1,
    authorityId: EXPECTED_AUTHORITY_ID,
    purpose: "authorize-cross-cutting-player-verification",
    pullRequestNumber: 480,
    baseRef: "main",
    scopeLock: "exact-path-allowlist",
    productionDeploymentAllowed: false,
    productionMutationAllowed: false,
    secretValuesAllowed: false,
    allowedPaths: [
      DEFAULT_AUTHORITY_PATH,
      "api/_canonical-bff-path.js",
      "api/_player-bff-proxy.js",
      "api/player-session/[...path].js",
      "api/player/[...path].js",
      "backend/supabase/functions/player-api/index.ts",
      "backend/supabase/functions/player-api/runtime.ts",
      "backend/supabase/functions/player-web-session-api/index.ts",
      "backend/supabase/functions/player-web-session-api/runtime.ts",
      "frontend/src/core/api.js",
      "scripts/build-vercel-runtime-config.mjs",
      "scripts/player-cross-cutting-authority.test.mjs",
      "scripts/verify-player-cross-cutting-authority.mjs",
      "scripts/vercel-deployment-contract.test.mjs",
    ],
    requiredFiles: [
      "api/_canonical-bff-path.js",
      "api/_player-bff-proxy.js",
      "api/player-session/[...path].js",
      "api/player/[...path].js",
      "backend/supabase/functions/player-api/index.ts",
      "backend/supabase/functions/player-api/runtime.ts",
      "backend/supabase/functions/player-web-session-api/index.ts",
      "backend/supabase/functions/player-web-session-api/runtime.ts",
      "frontend/src/core/api.js",
      "scripts/build-vercel-runtime-config.mjs",
      "scripts/vercel-deployment-contract.test.mjs",
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
    pullRequestNumber: 480,
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
      pullRequestNumber: 480,
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
      pullRequestNumber: 481,
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
      pullRequestNumber: 480,
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
