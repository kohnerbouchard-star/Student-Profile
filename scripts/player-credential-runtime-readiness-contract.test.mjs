import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const productionWorkflowPath =
  ".github/workflows/production-player-credential-pepper.yml";
const evidencePath =
  "docs/operations/evidence/production-player-credential-pepper-preflight-v1.json";
const credentialSourcePath =
  "backend/src/security/playerCredentialHashing.ts";
const adminRateLimitPath =
  "backend/supabase/functions/admin-api/progressionRateLimit.ts";

test("production Player credential pepper workflow is narrow and create-only", async () => {
  const workflow = await readFile(productionWorkflowPath, "utf8");

  assert.match(workflow, /workflow_dispatch:/u);
  assert.match(workflow, /environment: production/u);
  assert.match(workflow, /confirm_source_sha:/u);
  assert.match(workflow, /confirm_active_v2_credentials:/u);
  assert.match(
    workflow,
    /test "\$\{\{ inputs\.confirm_active_v2_credentials \}\}" = "0"/u,
  );
  assert.match(
    workflow,
    /test "\$\{\{ inputs\.confirm_source_sha \}\}" = "\$GITHUB_SHA"/u,
  );
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(workflow, /ECONOVARIA_PLAYER_CREDENTIAL_PEPPER/u);
  assert.match(workflow, /already exists; refusing to overwrite it/u);
  assert.match(workflow, /randomBytes\(64\)\.toString\("base64url"\)/u);
  assert.doesNotMatch(workflow, /ECONOVARIA_RATE_LIMIT_HMAC_SECRET/u);
  assert.doesNotMatch(workflow, /ECONOVARIA_WEB_SESSION_ENCRYPTION_KEY/u);
  assert.doesNotMatch(workflow, /ECONOVARIA_MFA_HANDLE_KEY/u);
  assert.doesNotMatch(workflow, /ECONOVARIA_WEB_ALLOWED_ORIGINS/u);
  assert.doesNotMatch(workflow, /ECONOVARIA_TRUSTED_CLIENT_IP_HEADER/u);
  assert.doesNotMatch(workflow, /supabase\s+db\s+(?:push|reset|dump)/u);
  assert.doesNotMatch(workflow, /supabase\s+functions\s+deploy/u);
  assert.doesNotMatch(workflow, /vercel\s+(?:deploy|promote)/u);
  assert.doesNotMatch(
    workflow,
    /ECONOVARIA_PLAYER_CREDENTIAL_PEPPER=[A-Za-z0-9_-]{32,}/u,
  );
});

test("production preflight authorizes a new pepper only with zero active v2 credentials", async () => {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));

  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.purpose, "provision-missing-player-credential-pepper");
  assert.equal(evidence.targetProjectRef, "cgiukdjwicykrmtkhudh");
  assert.ok(evidence.deniedProjectRefs.includes("eecvbssdvarfcykcfrny"));
  assert.equal(evidence.requiredSecret, "ECONOVARIA_PLAYER_CREDENTIAL_PEPPER");
  assert.equal(evidence.sourceBranch, "main");
  assert.equal(
    evidence.credentialHistory.activePbkdf2Sha256V2Credentials,
    0,
  );
  assert.equal(
    evidence.credentialHistory.revokedPbkdf2Sha256V2Credentials,
    2,
  );
  assert.equal(evidence.credentialHistory.legacySha256V1Credentials, 14);
  assert.equal(
    evidence.continuityDecision,
    "new-pepper-authorized-no-active-v2-credentials",
  );
  assert.equal(evidence.manualDispatchOnly, true);
  assert.equal(evidence.protectedEnvironmentRequired, true);
  assert.equal(evidence.exactSourceShaConfirmationRequired, true);
  assert.equal(evidence.activeV2CountConfirmationRequired, true);
  assert.equal(evidence.createOnlyWhenMissing, true);
  assert.equal(evidence.overwriteExistingCryptographicKeys, false);
  assert.equal(evidence.recordSecretValues, false);
  assert.equal(evidence.databaseChangesAllowed, false);
  assert.equal(evidence.edgeFunctionDeploymentsAllowed, false);
  assert.equal(evidence.vercelDeploymentsAllowed, false);
});

test("Player credential runtime failures are typed, retryable, and secret-safe", async () => {
  const source = await readFile(credentialSourcePath, "utf8");

  assert.match(source, /player_credential_runtime_unavailable/u);
  assert.match(source, /new EdgeActivationError\(/u);
  assert.match(source, /temporarily unavailable/u);
  assert.match(source, /\n\s*503,\n\s*true,/u);
  assert.match(source, /if \(error instanceof EdgeActivationError\) throw error;/u);
  assert.doesNotMatch(
    source,
    /Player credential operations[^\n]*ECONOVARIA_PLAYER_CREDENTIAL_PEPPER/u,
  );
});

test("canonical Admin source preserves gateway client-IP binding", async () => {
  const source = await readFile(adminRateLimitPath, "utf8");

  assert.match(source, /bindGatewayTrustedClientIp/u);
  assert.match(
    source,
    /const boundRequest = bindGatewayTrustedClientIp\([\s\S]*metadataRequest,[\s\S]*trustedIpHeader/u,
  );
  assert.match(source, /request: boundRequest/u);
  assert.doesNotMatch(source, /overwriteTrustedClientIpHeaders/u);
});
