import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("CodeQL remediation removes the flagged security patterns", () => {
  const qr = source("backend/supabase/functions/staff-mfa-api/mfaQrCode.ts");
  assert.doesNotMatch(qr, /SAFE_ROOT_TAG|stripComments\([^)]*\)\s*\{\s*return[^;]*\.replace/s);

  const auth = source("backend/src/security/adminBffRequestAuth.ts");
  assert.doesNotMatch(auth, /audience\.includes\(/);

  const player = source("backend/src/domains/players/api/playerLoginHttpHandler.ts");
  assert.match(player, /maximumUnbiasedByte/);

  const smoke = source("scripts/player-login-identity-smoke.mjs");
  assert.doesNotMatch(smoke, /request\.url\(\)\.includes\("cdn\.jsdelivr\.net"\)/);

  const gateway = source("scripts/local-staging-gateway.py");
  assert.match(gateway, /is_safe_response_header/);
  assert.match(gateway, /"\\r" not in normalized_value/);

  const login = source("frontend/src/core/login.js");
  assert.doesNotMatch(login, /sessionStorage\.setItem\(selectedGameStorageKey\(\)/);
});
