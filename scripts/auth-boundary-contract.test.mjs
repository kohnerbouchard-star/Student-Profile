import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");

const browserSources = [
  "frontend/src/core/runtime-config.js",
  "frontend/src/core/constants.js",
  "frontend/src/core/api.js",
  "frontend/src/core/login.js",
  "admin/auth-session-manager.js",
  "admin/admin-auth.js",
  "player-terminal/host-runtime.js",
  "player-terminal/src/api/http-transport.js",
  "player-terminal/src/integrations/student-profile-api-call.js",
];

const standaloneAdminClients = [
  "admin/messaging-moderation-client.js",
  "admin/inventory-redemption-queue-client.js",
  "admin/crafting-oversight-client.js",
  "admin/progression-review-client.js",
  "admin/marketplace-lifecycle-client.js",
];

test("auth ledger is complete, unique, and machine-readable", async () => {
  const ledger = JSON.parse(await read("docs/security/auth-boundary-ledger-v1.json"));
  assert.equal(ledger.schemaVersion, "econovaria-auth-boundary-ledger-v1");
  const ids = ledger.boundaries.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const expected of [
    "supabase-password-sign-in",
    "supabase-token-refresh",
    "password-recovery-request",
    "password-recovery-update",
    "web-session-api",
    "vercel-admin-bff-proxy",
    "bootstrap-api",
    "staff-api",
    "admin-api",
    "player-api",
    "classroom-api-compatibility",
    "stock-market-runner-family",
    "business-operations-worker",
    "local-gateway",
  ]) {
    assert.ok(ids.includes(expected), `missing auth boundary ${expected}`);
  }
  assert.equal(
    ledger.principles.browserApplicationIdentity,
    "Supabase sb_publishable_ key in apikey only",
  );
  assert.match(ledger.principles.staffIdentity, /encrypted HttpOnly web-session envelope/);
  assert.match(ledger.principles.playerIdentity, /Opaque player session token/);
});

test("browser runtime exposes only publishable application identity", async () => {
  for (const path of browserSources) {
    const source = await read(path);
    assert.doesNotMatch(
      source,
      /\bsb_secret_[A-Za-z0-9._-]{8,}/i,
      `${path} contains secret-key material`,
    );
    assert.doesNotMatch(source, /service_role/i, `${path} contains service-role authority`);
    assert.doesNotMatch(
      source,
      /SUPABASE_SERVICE_ROLE_KEY\s*[:=]/,
      `${path} contains service-role configuration`,
    );
    assert.doesNotMatch(
      source,
      /STOCK_MARKET_RUNNER_SECRET\s*[:=]/,
      `${path} contains runner authority`,
    );
    assert.doesNotMatch(
      source,
      /PURCHASE_CODE_HMAC_SECRET\s*[:=]/i,
      `${path} contains purchase-code key material`,
    );
  }

  const runtime = await read("frontend/src/core/runtime-config.js");
  assert.match(runtime, /supabasePublishableKey/);
  assert.match(runtime, /ECONOVARIA_RUNTIME_CONFIG_SECRET_KEY_PROHIBITED/);
  assert.match(runtime, /ECONOVARIA_RUNTIME_CONFIG_PUBLISHABLE_KEY_REQUIRED/);
  assert.doesNotMatch(runtime, /supabaseAnonKey/);
});

test("Admin browser storage and transport contain no Staff credential", async () => {
  const [apiSource, loginSource, sessionManager, adminAuth] = await Promise.all([
    read("frontend/src/core/api.js"),
    read("frontend/src/core/login.js"),
    read("admin/auth-session-manager.js"),
    read("admin/admin-auth.js"),
  ]);

  assert.match(apiSource, /credentials:\s*"include"/);
  assert.match(apiSource, /x-econovaria-csrf-token/);
  assert.doesNotMatch(apiSource, /accessToken:\s*signIn|refreshToken:\s*signIn/);
  assert.doesNotMatch(loginSource, /accessToken|refreshToken/);
  assert.doesNotMatch(sessionManager, /refreshToken/);
  assert.match(sessionManager, /adminLogoutApiUrl/);
  assert.match(sessionManager, /staff_logout_revocation_failed/);
  assert.doesNotMatch(adminAuth, /refreshToken|Bearer/);
});

test("Admin browser direct legacy route fallback is retired", async () => {
  const [runtimeConfig, apiSource, adminAuth, playerBridge, writeAdapter] = await Promise.all([
    read("frontend/src/core/runtime-config.js"),
    read("frontend/src/core/api.js"),
    read("admin/admin-auth.js"),
    read("admin/player-access-code-bridge.js"),
    read("admin/classroom-write-fallback.js"),
  ]);

  for (const source of [runtimeConfig, apiSource, adminAuth, playerBridge]) {
    assert.equal(source.includes("/functions/v1/classroom-api"), false);
  }
  assert.doesNotMatch(playerBridge, /Authorization/);
  assert.match(writeAdapter, /legacyClassroomFallbackRetired:\s*true/);
  assert.doesNotMatch(writeAdapter, /CLASSROOM_API_BASE|classroom-api|retryStatuses/);
});

test("standalone Admin clients remain cookie and CSRF bound", async () => {
  const adminAuth = await read("admin/admin-auth.js");
  assert.match(adminAuth, /url\.pathname\.startsWith\(LOCAL_API_PREFIX\)/);
  assert.match(adminAuth, /headers\.set\(DEVICE_HEADER, deviceId\(\)\)/);
  assert.match(adminAuth, /headers\.set\("X-Econovaria-Game-Id", selectedGameId\)/);
  assert.match(adminAuth, /headers\.set\(CSRF_HEADER, session\.csrfToken\)/);
  assert.match(adminAuth, /credentials:\s*"include"/);
  assert.match(adminAuth, /redirect:\s*"error"/);
  assert.match(adminAuth, /referrerPolicy:\s*"no-referrer"/);

  let explicitBoundaryClients = 0;
  for (const path of standaloneAdminClients) {
    const source = await read(path);
    assert.doesNotMatch(source, /AdminAuthSessionManager|authorization/i);

    if (/AdminAdapter/.test(source)) {
      assert.match(source, /\.request\(/, `${path} must delegate to AdminAdapter`);
      assert.match(source, /\/games\//, `${path} must retain game-scoped paths`);
      assert.doesNotMatch(source, /\bfetch\s*\(/, `${path} must not bypass AdminAdapter`);
      continue;
    }

    if (/apiBase\s*=\s*"\/api\/admin"/.test(source)) {
      assert.match(source, /\/games\/\$\{encodeURIComponent\(selectedGameId\)\}/);
      assert.match(source, /credentials:\s*"same-origin"/);
      explicitBoundaryClients += 1;
      continue;
    }

    assert.match(source, /x-econovaria-game-id/, `${path} must bind active game scope`);
    assert.match(source, /x-econovaria-csrf-token/, `${path} must bind CSRF`);
    assert.match(source, /getUsableSession/, `${path} must use the central session manager`);
    assert.match(source, /credentials:\s*"include"/, `${path} must use HttpOnly cookies`);
    assert.match(source, /redirect:\s*"error"/, `${path} must reject redirects`);
    assert.match(source, /referrerPolicy:\s*"no-referrer"/, `${path} must suppress referrers`);
    assert.doesNotMatch(source, /credentials:\s*"same-origin"/);
    explicitBoundaryClients += 1;
  }
  assert.ok(explicitBoundaryClients >= 1, "reviewed Admin clients must preserve explicit request boundaries");
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
  assert.match(host, /runtimeConfig\.playerWebSessionApiUrl/);
  assert.match(host, /publishableKey:\s*SUPABASE_PUBLISHABLE_KEY/);
  assert.match(host, /csrfToken:\s*session\?\.csrfToken/);
  assert.doesNotMatch(host, /playerSessionToken/);

  assert.match(transport, /headers\.apikey\s*=\s*publishableKey/);
  assert.match(transport, /credentials:\s*"include"/);
  assert.match(transport, /x-econovaria-csrf-token/);
  assert.match(transport, /x-econovaria-device-id/);
  assert.doesNotMatch(transport, /x-player-session-token|headers\.Authorization/);

  assert.match(adapter, /publishableKey/);
  assert.match(adapter, /credentials:\s*"include"/);
  assert.match(adapter, /x-econovaria-csrf-token/);
  assert.doesNotMatch(
    adapter,
    /playerSessionToken|x-player-session-token|Authorization\s*=\s*`Bearer/,
  );

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
  const [edge, vercel, recoveryProxy, logoutProxy, sessionManager, adminRoute, sessionRoute] = await Promise.all([
    read("backend/supabase/functions/web-session-api/index.ts"),
    read("api/_admin-bff-proxy.js"),
    read("api/password-reset.js"),
    read("api/admin-logout.js"),
    read("admin/auth-session-manager.js"),
    read("api/admin/[...path].js"),
    read("api/admin-session/[...path].js"),
  ]);

  assert.match(edge, /WEB_ADMIN_SESSION_COOKIE/);
  assert.match(edge, /HttpOnly|SameSite=Strict|constantTimeTextEqual/);
  assert.match(edge, /Authorization:\s*`Bearer \$\{accessToken\}`/);
  assert.match(vercel, /COOKIE_ENVELOPE_PATTERN|proxyAdminBff|x-vercel-forwarded-for/);
  assert.match(recoveryProxy, /password-reset-api/);
  assert.match(logoutProxy, /proxyAdminBff/);
  assert.match(logoutProxy, /path:\s*\["logout"\]/);
  assert.match(logoutProxy, /proxyAdmin:\s*false/);
  assert.doesNotMatch(logoutProxy, /admin-logout-api/);
  assert.match(sessionManager, /ADMIN_LOGOUT_API|staff_logout_revocation_failed/);
  assert.match(adminRoute, /proxyAdmin:\s*true/);
  assert.match(sessionRoute, /proxyAdmin:\s*false/);
});

test("explicit Admin session routes cannot be placeholder stubs", async () => {
  const routes = [
    {
      path: "api/admin-logout.js",
      routePattern: /path:\s*\["logout"\]/,
      proxyPattern: /proxyAdmin:\s*false/,
    },
    {
      path: "api/admin/session/bootstrap.js",
      routePattern: /path:\s*\["session",\s*"bootstrap"\]/,
      proxyPattern: /proxyAdmin:\s*true/,
    },
  ];

  for (const route of routes) {
    const source = await read(route.path);
    assert.notEqual(source.trim().toLowerCase(), "placeholder", `${route.path} is a placeholder`);
    assert.match(source, /module\.exports\s*=/, `${route.path} must export a Vercel handler`);
    assert.match(source, /proxyAdminBff/, `${route.path} must use the signed Admin BFF`);
    assert.match(source, route.routePattern, `${route.path} must bind its exact upstream route`);
    assert.match(source, route.proxyPattern, `${route.path} must bind the correct proxy mode`);
  }
});

test("server runners use publishable identity plus timestamped HMAC and replay denial", async () => {
  const [
    config,
    runner,
    stockRead,
    seed,
    playerRead,
    trading,
    businessWorker,
    businessWorkerHandler,
    scheduler,
    auth,
  ] = await Promise.all([
    read("backend/supabase/config.toml"),
    read("backend/supabase/functions/stock-market-runner/index.ts"),
    read("backend/supabase/functions/stock-market-read/index.ts"),
    read("backend/supabase/functions/stock-market-seed-copy/index.ts"),
    read("backend/supabase/functions/stock-market-player-read/index.ts"),
    read("backend/supabase/functions/stock-market-trading/index.ts"),
    read("backend/supabase/functions/business-operations-worker/index.ts"),
    read("backend/src/domains/business/api/businessOperationsWorkerHttpHandler.ts"),
    read("scripts/trigger-stock-market-tick.mjs"),
    read("backend/src/security/internalRunnerAuth.ts"),
  ]);

  for (const source of [runner, stockRead, seed, playerRead, trading]) {
    assert.match(source, /requirePublishableRequest\(request\)/);
    assert.match(source, /authorizeInternalRunnerRequest/);
    assert.match(source, /claim_internal_runner_nonce_v2/);
    assert.doesNotMatch(
      source,
      /request\.headers\.get\(["']x-stock-market-runner-secret["']\)/,
      "entrypoints must not authorize external callers with the legacy raw-secret header",
    );
  }

  assert.match(auth, /x-econovaria-runner-timestamp/);
  assert.match(auth, /x-econovaria-runner-nonce/);
  assert.match(auth, /x-econovaria-runner-signature/);
  assert.match(auth, /`body-sha256:\$\{input\.bodyHash\.toLowerCase\(\)\}`/);
  assert.match(auth, /request\.headers\.has\(options\.internalSecretHeader\)/);
  assert.match(auth, /headers\.set\(options\.internalSecretHeader, secret\)/);
  assert.match(scheduler, /createInternalRunnerHeaders/);
  assert.doesNotMatch(scheduler, /x-stock-market-runner-secret/);
  assert.match(config, /\[functions\.stock-market-runner\][\s\S]*verify_jwt\s*=\s*false/);
  assert.match(config, /\[functions\.business-operations-worker\][\s\S]*verify_jwt\s*=\s*false/);
  assert.match(businessWorker, /requirePublishableRequest\(request\)/);
  assert.match(businessWorker, /authorizeInternalRunnerRequest/);
  assert.match(businessWorker, /runnerName:\s*"business-operations-worker"/);
  assert.match(businessWorker, /claim_internal_runner_nonce_v2/);
  assert.match(businessWorker, /Deno\.env\.get\("STOCK_MARKET_RUNNER_SECRET"\)/);
  assert.match(businessWorker, /handleBusinessOperationsWorkerRequest/);
  assert.ok(
    businessWorker.indexOf("businessOperationsWorkerBrowserRequestFailure(request)") <
      businessWorker.indexOf("requirePublishableRequest(request)"),
  );
  assert.ok(
    businessWorker.indexOf("requirePublishableRequest(request)") <
      businessWorker.indexOf("authorizeInternalRunnerRequest(request"),
  );
  assert.ok(
    businessWorker.indexOf("authorizeInternalRunnerRequest(request") <
      businessWorker.indexOf("return handleBusinessOperationsWorkerRequest"),
  );
  assert.doesNotMatch(
    businessWorker,
    /request\.headers\.get\(["']x-business-operations-worker-secret["']\)/,
  );
  assert.match(businessWorkerHandler, /assertEmptyBody\(request\)/);
  assert.match(businessWorkerHandler, /bytes\.byteLength\s*!==\s*0/);
  assert.match(businessWorkerHandler, /authorization/);
  assert.match(businessWorkerHandler, /cookie/);
  assert.match(businessWorkerHandler, /origin/);
  assert.match(businessWorkerHandler, /x-econovaria-csrf-token/);
  assert.match(businessWorkerHandler, /x-player-session-token/);
  assert.doesNotMatch(businessWorkerHandler, /access-control-allow-origin/);
});

test("local launcher never exposes a privileged browser bearer or arbitrary cookie", async () => {
  const gateway = await read("scripts/local-staging-gateway.py");
  assert.match(gateway, /PUBLISHABLE_KEY/);
  assert.doesNotMatch(gateway, /Authorization.*publishable/i);
  assert.doesNotMatch(gateway, /forward_headers\["cookie"\]/i);
  assert.doesNotMatch(gateway, /supabaseAnonKey/);
});
