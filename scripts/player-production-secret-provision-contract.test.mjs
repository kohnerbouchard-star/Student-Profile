import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/production-web-session-secrets.yml";
const evidencePath = "docs/operations/evidence/player-login-production-secret-trigger-v1.json";

test("production secret workflow provisions the Player credential pepper missing-only", async () => {
  const workflow = await readFile(workflowPath, "utf8");
  const evidence = JSON.parse(await readFile(evidencePath, "utf8"));

  assert.match(workflow, /ECONOVARIA_PLAYER_CREDENTIAL_PEPPER/u);
  assert.match(workflow, /if ! grep -q 'ECONOVARIA_PLAYER_CREDENTIAL_PEPPER'/u);
  assert.match(workflow, /randomBytes\(64\)\.toString\("base64url"\)/u);
  assert.match(workflow, /overwriteExistingCryptographicKeys !== false/u);
  assert.match(workflow, /recordSecretValues !== false/u);
  assert.doesNotMatch(workflow, /ECONOVARIA_PLAYER_CREDENTIAL_PEPPER=[A-Za-z0-9_-]{32,}/u);

  assert.equal(evidence.targetProjectRef, "cgiukdjwicykrmtkhudh");
  assert.ok(evidence.deniedProjectRefs.includes("eecvbssdvarfcykcfrny"));
  assert.equal(evidence.requiredSecret, "ECONOVARIA_PLAYER_CREDENTIAL_PEPPER");
  assert.equal(evidence.createOnlyWhenMissing, true);
  assert.equal(evidence.overwriteExistingCryptographicKeys, false);
  assert.equal(evidence.recordSecretValues, false);
});
