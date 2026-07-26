import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const browserCredentialFiles = [
  "frontend/src/core/api.js",
  "frontend/src/core/constants.js",
  "frontend/src/core/runtime-config.js",
  "frontend/src/core/login.js",
  "player-terminal/host-runtime.js",
  "player-terminal/src/api/http-transport.js",
  "player-terminal/src/integrations/student-profile-api-call.js",
  "admin/admin-auth.js",
  "admin/auth-session-manager.js",
  "admin/player-access-code-bridge.js",
  "admin/classroom-write-fallback.js",
  "auth/reset-password.js",
];

const adminBrowserFiles = [
  "frontend/src/core/api.js",
  "frontend/src/core/login.js",
  "admin/admin-auth.js",
  "admin/auth-session-manager.js",
  "admin/player-access-code-bridge.js",
  "admin/classroom-write-fallback.js",
];

const privilegedPatterns = [
  /sb_secret_[A-Za-z0-9_-]+/,
  /service_role[^\n]{0,30}(?:key|token)/i,
  /SUPABASE_SERVICE_ROLE_KEY\s*[:=]\s*["'`][^"'`]+/,
];

const browserStaffCredentialPatterns = [
  /\baccessToken\b/,
  /\brefreshToken\b/,
  /\baccess_token\b/,
  /\brefresh_token\b/,
  /Authorization\s*[:=]/,
  /headers\.set\(["']Authorization["']/,
  /Bearer\s+\$\{/,
];

test("auth ledger is complete, unique, and machine-readable", async () => {
  const ledger = JSON.parse(await read("docs/security/auth-boundary-ledger-v1.json"));
  assert.equal(ledger.schemaVersion, "econovaria-auth-boundary-ledger-v1");
  assert.ok(Array.isArray(ledger.boundaries));
  assert.ok(ledger.boundaries.length >= 11);
  const ids = ledger.boundaries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const required of [
    "bootstrap-api",
    "staff-api",
    "admin-api",
    "player-api",
    "web-session-api",
    "classroom-api-compatibility",
    "stock-market-runner-family",
    "local-gateway",
  ]) {
    assert.ok(ids.includes(required), `Missing auth boundary: ${required}`);
  }

  assert.ok(
    ledger.principles.prohibited.includes("sb_publishable_ key in Authorization"),
  );
  assert.ok(Array.isArray(ledger.releaseGates));
  assert.ok(ledger.releaseGates.length >= 8);
});

test("browser runtime exposes only publishable application identity", async () => {
  const sources = await Promise.all(browserCredentialFiles.map(read));
  for (let index = 0; index < sources.length; index += 1) {
    const source = sources[index];
    const path = browserCredentialFiles[index];
    for (const pattern of privilegedPatterns) {
      assert.doesNotMatch(source, pattern, `${path} contains a privileged credential`);
    }
  }

  const runtime = await read("frontend/src/core/runtime-config.js");
  assert.match(runtime, /playerApiUrl/);
  assert.match(runtime, /staffApiUrl/);
  assert.match(runtime, /bootstrapApiUrl/);
  assert.match(runtime, /adminApiUrl/);
  assert.match(runtime, /webSessionApiUrl/);
  assert.match(runtime, /adminBffApiUrl/);
  assert.match(runtime, /passwordResetApiUrl/);
  assert.match(runtime, /classroomApiUrl:\s*staffApiUrl/);
  assert.match(runtime, /SECRET_KEY_PROHIBITED/);

  const constants = await read("frontend/src/core/constants.js");
  assert.match(constants, /installPublishableBearerGuard/);
  assert.match(constants, /headers\.delete\("authorization"\)/);

  const api = await read("frontend/src/core/api.js");
  assert.match(api, /callSupabaseJsonRoute\("player"/);
  assert.match(api, /callSupabaseJsonRoute\("bootstrap"/);
  assert.match(api, /callSupabaseJsonRoute\("webSession",\s*"\/login"/);
  assert.match(api, /callAdminBffJsonRoute\("\/games\/provision"/);
  assert.doesNotMatch(api, /grant_type=password/);
  assert.doesNotMatch(api, /token:\s*publishableKey/);
  assert.doesNotMatch(api, /Authorization:\s*`Bearer \$\{publishableKey\}`/);
  assert.doesNotMatch(api, /const ADMIN_SELECTED_GAME_STORAGE_KEY/);
});

test("Admin browser storage and transport contain no Staff credential", async () => {
  for (const path of adminBrowserFiles) {
    const source = await read(path);
    for (const pattern of browserStaffCredentialPatterns) {
      assert.doesNotMatch(
        source,
        pattern,
        `${path} must not contain browser-readable Staff credential transport`,
      );
    }
  }

  const [login, manager, adminAuth, playerBridge, writeAdapter] = await Promise.all([
    read("frontend/src/core/login.js"),
    read("admin/auth-session-manager.js"),
    read("admin/admin-auth.js"),
    read("admin/player-access-code-bridge.js"),
    read("admin/classroom-write-fallback.js"),
  ]);
  assert.match(login, /function persistSafeAdminStatus\(status\)/);
  assert.match(login, /persistSafeAdminStatus\(status\)/);
  assert.doesNotMatch(login, /persistSafeAdminStatus\(signIn\)/);
  assert.doesNotMatch(login, /persistAdminState\(signIn\)/);
  assert.match(login, /clearAdminState\(\);\s*renderGameSelection\(signIn\.activeGameSessions/s);
  assert.match(manager, /credentials:\s*"include"/);
  assert.match(adminAuth, /credentials:\s*"include"/);
  assert.match(adminAuth, /x-econovaria-csrf-token/);
  assert.match(adminAuth, /http-only-bff/);
  assert.doesNotMatch(adminAuth, /permissions:\s*\["\*"\]/);
  assert.doesNotMatch(playerBridge, /staffApiUrl/);
  assert.doesNotMatch(playerBridge, /Authorization/);
  assert.match(writeAdapter, /legacyClassroomFallbackRetired:\s*true/);
  assert.doesNotMatch(writeAdapter, /CLASSROOM_API_BASE/);
  assert.doesNotMatch(writeAdapter, /classroom-api/);
  assert.doesNotMatch(writeAdapter, /retryStatuses/);
});

test("Player and Admin callers remain bound to their own identities", async () => {
  const [host, transport, adapter, adminAuth, playerBridge, writeAdapter] = await Promise.all([
    read("player-terminal/host-runtime.js"),
    read("player-terminal/src/api/http-transport.js"),
    read("player-terminal/src/integrations/student-profile-api-call.js"),
    read("admin/admin-auth.js"),
    read("admin/player-access-code-bridge.js"),
    read("admin/classroom-write-fallback.js"),
  ]);

  assert.match(host, /runtimeConfig\.playerApiUrl/);
  assert.match(host, /publishableKey:\s*SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(host, /accessToken:\s*SUPABASE_PUBLISHABLE_KEY/);

  assert.match(transport, /headers\.apikey\s*=\s*publishableKey/);
  assert.match(transport, /headers\.Authorization\s*=\s*`Bearer \$\{userAccessToken\}`/);
  assert.match(transport, /x-player-session-token/);
  assert.match(transport, /x-econovaria-device-id/);

  assert.match(adapter, /publishableKey/);
  assert.match(adapter, /playerSessionToken/);
  assert.doesNotMatch(adapter, /Authorization\s*=\s*`Bearer \$\{publishableKey\}`/);

  assert.match(adminAuth, /headers\.set\("apikey", SUPABASE_PUBLISHABLE_KEY\)/);
  assert.match(adminAuth, /headers\.set\(CSRF_HEADER, session\.csrfToken\)/);
  assert.match(adminAuth, /ADMIN_BFF_BASE/);
  assert.doesNotMatch(adminAuth, /Bearer/);
  assert.match(playerBridge, /LOCAL_API_PREFIX/);
  assert.doesNotMatch(playerBridge, /STAFF_API_BASE/);
  assert.match(writeAdapter, /url\.origin === window\.location\.origin/);
  assert.match(writeAdapter, /url\.pathname\.startsWith\(LOCAL_API_PREFIX\)/);
});

test("server-side Admin BFF is the only Staff credential transport", async () => {
  const [edge, vercel, recoveryProxy, adminRoute, sessionRoute] = await Promise.all([
    read("backend/supabase/functions/web-session-api/index.ts"),
    read("api/_admin-bff-proxy.js"),
    read("api/password-reset.js"),
    read("api/admin/[...path].js"),
    read("api/admin-session/[...path].js"),
  ]);

  assert.match(edge, /WEB_ADMIN_SESSION_COOKIE/);
  assert.match(edge, /HttpOnly/);
  assert.match(edge, /SameSite=Strict/);
  assert.match(edge, /constantTimeTextEqual/);
  assert.match(edge, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.match(vercel, /COOKIE_ENVELOPE_PATTERN/);
  assert.match(vercel, /proxyAdminBff/);
  assert.match(vercel, /x-vercel-forwarded-for/);
  assert.match(vercel, /"x-real-ip": clientIp/);
  assert.doesNotMatch(vercel, /headers\.set\(["']authorization/i);
  assert.match(recoveryProxy, /x-vercel-forwarded-for/);
  assert.match(recoveryProxy, /"x-real-ip": clientIp/);
  assert.match(adminRoute, /proxyAdmin:\s*true/);
  assert.match(sessionRoute, /proxyAdmin:\s*false/);
});

test("server runners use publishable identity plus dedicated authorization", async () => {
  const trigger = await read("scripts/trigger-stock-market-tick.mjs");
  assert.match(trigger, /SUPABASE_PUBLISHABLE_KEY/);
  assert.match(trigger, /apikey:\s*publishableKey/);
  assert.match(trigger, /x-stock-market-runner-secret/);
  assert.doesNotMatch(trigger, /SUPABASE_ANON_KEY/);
  assert.doesNotMatch(trigger, /authorization:\s*`Bearer/);

  for (const name of [
    "stock-market-runner",
    "stock-market-read",
    "stock-market-seed-copy",
    "stock-market-player-read",
    "stock-market-trading",
  ]) {
    const source = await read(`backend/supabase/functions/${name}/index.ts`);
    assert.match(source, /requirePublishableRequest\(request\)/);
    assert.match(source, /handleStockMarket/);
  }
});

test("local launcher never injects a legacy anon bearer or arbitrary cookie", async () => {
  const launcher = await read("scripts/econovaria-local-gateway.py");
  assert.match(launcher, /filtered_request_headers/);
  assert.match(launcher, /safe_header_pair/);
  assert.match(launcher, /HEADER_NAME_PATTERN/);
  assert.match(launcher, /MAX_HEADER_VALUE_BYTES/);
  assert.match(launcher, /FORWARDED_IP_HEADERS/);
  assert.match(launcher, /normalized_session_request_cookie/);
  assert.match(launcher, /normalized_session_response_cookie/);
  assert.match(launcher, /"\\r",\s*"\\n",\s*"\\x00"/);
  assert.match(launcher, /Bearer \{browser_publishable_key\}/);
  assert.doesNotMatch(
    launcher,
    /result\["Authorization"\]\s*=\s*f"Bearer \{platform_anon_key\}"/,
  );
  assert.match(launcher, /x-real-ip/);
});
