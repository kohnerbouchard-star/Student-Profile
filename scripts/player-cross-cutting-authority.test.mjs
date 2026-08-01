import assert from "node:assert/strict";
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
      "scripts/verify-player-cross-cutting-authority.mjs",
      "scripts/player-cross-cutting-authority.test.mjs",
      "api/_canonical-bff-path.js",
      "api/_player-bff-proxy.js",
      "api/player-session/[...path].js",
      "api/player/[...path].js",
      "scripts/build-vercel-runtime-config.mjs",
      "scripts/vercel-deployment-contract.test.mjs",
      "backend/supabase/functions/player-api/index.ts",
      "backend/supabase/functions/player-api/runtime.ts",
      "backend/supabase/functions/player-web-session-api/index.ts",
      "backend/supabase/functions/player-web-session-api/runtime.ts",
      "docs/operations/evidence/player-login-production-secret-trigger-v1.json",
      "player-terminal/src/integrations/student-profile-read-resilience.js",
      "player-terminal/src/integrations/student-profile-runtime.js",
      "scripts/business-banking-player-business-browser-acceptance.mjs",
      "scripts/business-banking-player-commerce-browser-acceptance.mjs",
      "scripts/business-banking-player-inventory-browser-acceptance.mjs",
      "scripts/business-banking-player-market-browser-acceptance.mjs",
      "scripts/business-banking-player-world-browser-acceptance.mjs",
      "scripts/local-edge-runtime-isolation.mjs",
      "scripts/local-edge-runtime-isolation.test.mjs",
      "scripts/player-api-read-resilience.test.mjs",
      "scripts/player-bff-retry-classification.test.mjs",
      "scripts/player-contracts-browser-acceptance.mjs",
      "scripts/player-edge-trusted-ip-entrypoint-contract.test.mjs",
      "scripts/player-production-secret-provision-contract.test.mjs",
      "scripts/player-runtime-load-profile.mjs",
      "scripts/security-audit-remediation-contract.test.mjs",
    ],
    requiredFiles: [
      "api/_canonical-bff-path.js",
      "api/_player-bff-proxy.js",
      "api/player-session/[...path].js",
      "api/player/[...path].js",
      "scripts/build-vercel-runtime-config.mjs",
      "scripts/vercel-deployment-contract.test.mjs",
      "backend/supabase/functions/player-api/index.ts",
      "backend/supabase/functions/player-api/runtime.ts",
      "backend/supabase/functions/player-web-session-api/index.ts",
      "backend/supabase/functions/player-web-session-api/runtime.ts",
      "docs/operations/evidence/player-login-production-secret-trigger-v1.json",
      "player-terminal/src/integrations/student-profile-read-resilience.js",
      "player-terminal/src/integrations/student-profile-runtime.js",
      "scripts/business-banking-player-business-browser-acceptance.mjs",
      "scripts/business-banking-player-commerce-browser-acceptance.mjs",
      "scripts/business-banking-player-inventory-browser-acceptance.mjs",
      "scripts/business-banking-player-market-browser-acceptance.mjs",
      "scripts/business-banking-player-world-browser-acceptance.mjs",
      "scripts/local-edge-runtime-isolation.mjs",
      "scripts/local-edge-runtime-isolation.test.mjs",
      "scripts/player-api-read-resilience.test.mjs",
      "scripts/player-bff-retry-classification.test.mjs",
      "scripts/player-contracts-browser-acceptance.mjs",
      "scripts/player-edge-trusted-ip-entrypoint-contract.test.mjs",
      "scripts/player-production-secret-provision-contract.test.mjs",
      "scripts/player-runtime-load-profile.mjs",
      "scripts/security-audit-remediation-contract.test.mjs",
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
