import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW = path.join(
  ROOT,
  ".github/workflows/production-web-session-secrets.yml",
);

function workflowSource() {
  return fs.readFileSync(WORKFLOW, "utf8");
}

test("production provisions an independent missing-only MFA handle key", () => {
  const workflow = workflowSource();
  assert.match(workflow, /environment:\s*production/u);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/u);
  assert.match(
    workflow,
    /if ! grep -q 'ECONOVARIA_MFA_HANDLE_KEY' "\$names"; then/u,
  );
  assert.match(
    workflow,
    /randomBytes\(32\)\.toString\("base64url"\)/u,
  );
  assert.match(workflow, /test "\$\{#mfa_handle_key\}" -eq 43/u);
  assert.match(workflow, /::add-mask::\$mfa_handle_key/u);
  assert.match(
    workflow,
    /"ECONOVARIA_MFA_HANDLE_KEY=\$mfa_handle_key"/u,
  );
  assert.match(workflow, /grep -q 'ECONOVARIA_MFA_HANDLE_KEY' "\$names"/u);
  assert.doesNotMatch(workflow, /echo\s+"?\$mfa_handle_key/u);
});

test("MFA key provisioning remains independent from other cryptographic keys", () => {
  const workflow = workflowSource();
  const mfaBlock = workflow.match(
    /if ! grep -q 'ECONOVARIA_MFA_HANDLE_KEY'[\s\S]*?^\s*fi$/mu,
  )?.[0] || "";
  assert.ok(mfaBlock, "missing MFA handle key provisioning block");
  assert.doesNotMatch(mfaBlock, /RATE_LIMIT_HMAC_SECRET/u);
  assert.doesNotMatch(mfaBlock, /WEB_SESSION_ENCRYPTION_KEY/u);
  assert.doesNotMatch(mfaBlock, /Deno\.env\.set/u);
  assert.doesNotMatch(mfaBlock, /crypto\.subtle\.digest/u);
});
