import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_AUTHORITY_PATH,
  verifyAuthority,
} from "./verify-player-cross-cutting-authority.mjs";

function manifest() {
  return {
    schemaVersion: 1,
    authorityId: "econovaria.admin-player-convergence-pr-476.v1",
    purpose: "authorize-cross-cutting-player-verification",
    pullRequestNumber: 476,
    baseRef: "main",
    scopeLock: "exact-path-allowlist",
    productionDeploymentAllowed: false,
    productionMutationAllowed: false,
    secretValuesAllowed: false,
    allowedPaths: [
      DEFAULT_AUTHORITY_PATH,
      "scripts/verify-player-cross-cutting-authority.mjs",
      "scripts/player-cross-cutting-authority.test.mjs",
      "backend/supabase/functions/_shared/playerApiReadResilience.ts",
      "backend/supabase/functions/player-api/index.ts",
      "backend/supabase/functions/player-api/runtime.ts",
      "backend/supabase/functions/player-web-session-api/index.ts",
      "backend/supabase/functions/player-web-session-api/runtime.ts",
      "docs/operations/evidence/player-login-production-secret-trigger-v1.json",
      "scripts/player-api-read-resilience.test.mjs",
      "scripts/player-edge-trusted-ip-entrypoint-contract.test.mjs",
      "scripts/player-production-secret-provision-contract.test.mjs",
      "scripts/security-audit-remediation-contract.test.mjs",
    ],
    requiredFiles: [
      "backend/supabase/functions/_shared/playerApiReadResilience.ts",
      "backend/supabase/functions/player-api/index.ts",
      "backend/supabase/functions/player-api/runtime.ts",
      "backend/supabase/functions/player-web-session-api/index.ts",
      "backend/supabase/functions/player-web-session-api/runtime.ts",
      "docs/operations/evidence/player-login-production-secret-trigger-v1.json",
      "scripts/player-api-read-resilience.test.mjs",
      "scripts/player-edge-trusted-ip-entrypoint-contract.test.mjs",
      "scripts/player-production-secret-provision-contract.test.mjs",
      "scripts/security-audit-remediation-contract.test.mjs",
    ],
    requiredChecks: [
      "player-terminal-verify",
      "player-edge-trusted-ip-entrypoint-contract",
      "player-production-secret-provision-contract",
      "player-api-read-resilience",
    ],
  };
}

test("cross-cutting Player authority accepts only its PR-bound exact scope", () => {
  const value = manifest();
  const result = verifyAuthority({
    manifest: value,
    changedPaths: [...value.allowedPaths],
    pullRequestNumber: 476,
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
      pullRequestNumber: 476,
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
      pullRequestNumber: 477,
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
      pullRequestNumber: 476,
      baseRef: "main",
    }),
    /deny production mutation/u,
  );
});
