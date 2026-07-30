import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const CONFIG = new URL("../backend/supabase/config.toml", import.meta.url);
const PACKAGE = new URL("../package.json", import.meta.url);
const FUNCTION_ROOT = new URL("../backend/supabase/functions/", import.meta.url);
const FUNCTION_POLICIES = Object.freeze({
  "player-api": false,
  "player-web-session-api": false,
  "bootstrap-api": false,
  "web-session-api": false,
  "admin-password-recovery": false,
  "admin-logout-api": false,
  "staff-api": true,
  "admin-api": true,
  "staff-mfa-api": true,
  "password-reset-api": true,
  "classroom-api": true,
  "stock-market-runner": false,
  "stock-market-read": false,
  "stock-market-seed-copy": false,
  "stock-market-player-read": false,
  "stock-market-trading": false,
});
const CUSTOM_AUTH_FUNCTIONS = new Set(["admin-password-recovery"]);
const WRAPPED_RUNTIME_FUNCTIONS = new Set([
  "player-api",
  "player-web-session-api",
]);

function section(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = source.match(new RegExp(`\\[${escaped}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
  return match?.[1] || "";
}

test("local Supabase starts every declared split Edge security boundary", async () => {
  const [config, packageSource] = await Promise.all([
    readFile(CONFIG, "utf8"),
    readFile(PACKAGE, "utf8"),
  ]);

  assert.match(section(config, "edge_runtime"), /(?:^|\n)enabled\s*=\s*true(?:\s|$)/);

  const functionSources = {};
  for (const [name, verifyJwt] of Object.entries(FUNCTION_POLICIES)) {
    const policy = section(config, `functions.${name}`);
    assert.match(policy, new RegExp(`verify_jwt\\s*=\\s*${verifyJwt}`));
    const entrypoint = await readFile(
      new URL(`${name}/index.ts`, FUNCTION_ROOT),
      "utf8",
    );
    const runtime = WRAPPED_RUNTIME_FUNCTIONS.has(name)
      ? await readFile(new URL(`${name}/runtime.ts`, FUNCTION_ROOT), "utf8")
      : "";
    functionSources[name] = `${entrypoint}\n${runtime}`;
  }

  const declaredNames = [...config.matchAll(/\[functions\.([^\]]+)\]/g)]
    .map((match) => match[1]);
  const falseSections = declaredNames
    .filter((name) => /verify_jwt\s*=\s*false/.test(section(config, `functions.${name}`)))
    .sort();
  const expectedFalse = Object.entries(FUNCTION_POLICIES)
    .filter(([, value]) => value === false)
    .map(([name]) => name)
    .sort();
  assert.deepEqual(falseSections, expectedFalse);

  for (const [name, source] of Object.entries(functionSources)) {
    assert.doesNotMatch(source, /Authorization[^\n]+sb_publishable_/i);
    if (FUNCTION_POLICIES[name] === false && !CUSTOM_AUTH_FUNCTIONS.has(name)) {
      assert.match(source, /requirePublishableRequest\((?:request|incomingRequest)\)/);
    }
  }

  assert.match(functionSources["staff-api"], /resolveStaffForRequest/);
  assert.match(functionSources["staff-api"], /handleStaffBootstrapRequest/);
  assert.match(functionSources["staff-mfa-api"], /resolveStaffSessionForRequest/);
  assert.match(functionSources["staff-mfa-api"], /requiredAssuranceLevel/);
  assert.match(functionSources["staff-mfa-api"], /mfa\.challengeAndVerify/);
  assert.match(functionSources["password-reset-api"], /resolveStaffForRequest/);
  assert.match(functionSources["password-reset-api"], /validateStaffPassword/);
  assert.match(functionSources["web-session-api"], /WEB_ADMIN_SESSION_COOKIE/);
  assert.match(functionSources["web-session-api"], /\/functions\/v1\/staff-mfa-api/);
  assert.match(
    functionSources["web-session-api"],
    /authorizeAdminBffRequest\(incomingRequest/,
  );
  assert.match(
    functionSources["web-session-api"],
    /const request = authorization\.request/,
  );
  assert.match(functionSources["admin-password-recovery"], /request\.method\.toUpperCase\(\)/);
  assert.match(functionSources["admin-password-recovery"], /method === "GET"/);
  assert.match(functionSources["admin-password-recovery"], /method === "POST"/);
  assert.match(functionSources["admin-password-recovery"], /constantTimeEqual\(challenge, cookieChallenge\)/);
  assert.match(functionSources["admin-password-recovery"], /\/auth\/v1\/verify/);
  assert.doesNotMatch(functionSources["admin-password-recovery"], /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(functionSources["admin-logout-api"], /openWebAdminSession/);
  assert.match(functionSources["admin-logout-api"], /constantTimeTextEqual/);
  assert.match(functionSources["admin-logout-api"], /response\?\.ok \|\| response\?\.status === 401/);
  assert.match(functionSources["admin-logout-api"], /staff_logout_revocation_failed/);
  assert.match(functionSources["player-web-session-api"], /WEB_PLAYER_SESSION_COOKIE/);
  assert.match(functionSources["player-web-session-api"], /constantTimePlayerTextEqual/);
  assert.match(functionSources["player-web-session-api"], /\/functions\/v1\/player-api/);
  assert.match(
    functionSources["player-api"],
    /dispatchRateLimitedReviewedPlayerRequest/,
  );
  assert.match(functionSources["bootstrap-api"], /handleStaffSignupRequest/);
  for (const name of expectedFalse.filter((value) => value.startsWith("stock-market-"))) {
    assert.match(functionSources[name], /handleStockMarket/);
  }

  const packageJson = JSON.parse(packageSource);
  const localCommand = packageJson.scripts?.["dev:local"] || "";
  assert.match(localCommand, /supabase start --workdir backend/);
  assert.match(localCommand, /local-auth-readiness\.mjs/);
  assert.match(localCommand, /econovaria-local-gateway\.py --local-supabase/);
});
