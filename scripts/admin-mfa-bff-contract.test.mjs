import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("web-session BFF owns Staff MFA token elevation", async () => {
  const source = await read("backend/supabase/functions/web-session-api/index.ts");

  assert.match(source, /route === "\/mfa" \|\| route\.startsWith\("\/mfa\/"\)/);
  assert.match(source, /\/functions\/v1\/staff-mfa-api/);
  assert.match(source, /constantTimeTextEqual\(suppliedCsrf, current\.payload\.csrfToken\)/);
  assert.match(source, /readTrustedClientIp\(request, TRUSTED_IP_HEADER\)/);
  assert.match(source, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(source, /const elevated: WebAdminSessionPayload/);
  assert.match(source, /accessToken,/);
  assert.match(source, /refreshToken,/);
  assert.match(source, /csrfToken: randomWebAdminCsrfToken\(\)/);
  assert.match(source, /session: publicSession\(elevated, "aal2", true\)/);
  assert.match(source, /await appendSessionCookie\(headers, current\.payload, key, request\)/);
  assert.doesNotMatch(
    source,
    /sessionJson\([\s\S]{0,500}accessToken:\s*accessToken/,
    "MFA verification must not return the elevated access token to the browser.",
  );
  assert.doesNotMatch(
    source,
    /sessionJson\([\s\S]{0,500}refreshToken:\s*refreshToken/,
    "MFA verification must not return the elevated refresh token to the browser.",
  );
});

test("browser API completes password sign-in through memory-only MFA state", async () => {
  const source = await read("frontend/src/core/api.js");

  assert.match(source, /let inMemoryAdminCsrfToken = ""/);
  assert.match(source, /function loadAdminMfaModule\(\)/);
  assert.match(source, /const mfa = await loadAdminMfaModule\(\)/);
  assert.match(source, /const elevated = await mfa\.ensureAal2\(status\)/);
  assert.match(source, /callAdminMfaStatus/);
  assert.match(source, /callAdminMfaEnroll/);
  assert.match(source, /callAdminMfaVerify/);
  assert.match(source, /requireCsrf: true/);
  assert.match(source, /credentials: "include"/);
  assert.doesNotMatch(source, /sessionStorage\.setItem/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*mfa/i);
  assert.doesNotMatch(source, /Authorization/);
  assert.doesNotMatch(source, /accessToken/);
  assert.doesNotMatch(source, /refreshToken/);
});

test("MFA UI keeps enrollment material in page memory only", async () => {
  const source = await read("frontend/src/core/admin-mfa.js");

  assert.match(source, /FACTOR_HANDLE_PATTERN/);
  assert.match(source, /QR_DATA_PATTERN/);
  assert.match(source, /SECRET_PATTERN/);
  assert.match(source, /input\.pattern = "\[0-9\]\{6\}"/);
  assert.match(source, /callAdminMfaVerify/);
  assert.match(source, /callAdminWebSessionLogout/);
  assert.match(source, /view\.secretNode\.textContent = ""/);
  assert.match(source, /view\.factorHandle = ""/);
  assert.doesNotMatch(source, /sessionStorage/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /innerHTML/);
  assert.doesNotMatch(source, /Authorization/);
  assert.doesNotMatch(source, /accessToken/);
  assert.doesNotMatch(source, /refreshToken/);
});

test("Staff MFA direct service remains platform-JWT verified", async () => {
  const [config, source] = await Promise.all([
    read("backend/supabase/config.toml"),
    read("backend/supabase/functions/staff-mfa-api/index.ts"),
  ]);

  assert.match(config, /\[functions\.staff-mfa-api\]\s*verify_jwt = true/s);
  assert.match(source, /resolveStaffForRequest/);
  assert.match(source, /mfa\.challengeAndVerify/);
  assert.match(source, /createFactorHandle/);
  assert.match(source, /ECONOVARIA_MFA_HANDLE_KEY/);
});
