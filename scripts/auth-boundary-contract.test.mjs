import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { observeOnboardingEdgeFailure, sanitizeOnboardingRuntimeLog } from "./onboarding-edge-failure-receipt.mjs";

const ROOT = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, ROOT), "utf8");

test("Onboarding observation preserves requests and failures without exposing response data", async () => {
  const workflow = await read(".github/workflows/runtime-stabilization-onboarding.yml");
  const block = workflow.split("      - name: Prove publishable-key functions are reachable\n")[1].split("      - name: Observe owned Edge runtime after failed OPTIONS\n")[0];
  const source = block.split("        run: |\n")[1].split("\n").map((line) => line.slice(10)).join("\n");
  assert.equal(spawnSync("bash", ["-n"], { input: source }).status, 0);
  const root = await mkdtemp(join(tmpdir(), "onboarding-observation-"));
  const functions = ["player-api", "bootstrap-api", "stock-market-runner", "stock-market-read", "stock-market-seed-copy", "stock-market-player-read", "stock-market-trading"];
  try {
    const bin = join(root, "bin"); await mkdir(bin);
    await writeFile(join(bin, "npx"), '#!/bin/bash\n[ "$*" = "supabase status --workdir backend -o env" ] || exit 99\nprintf "API_URL=%q\\nPUBLISHABLE_KEY=%q\\n" "$STUB_API" "$STUB_KEY"\n', { mode: 0o700 });
    await writeFile(join(bin, "curl"), [
      "#!/bin/bash", 'printf "%s\\0" "$@" >>"$STUB_CALLS"', 'printf "\\n" >>"$STUB_CALLS"',
      'NAME="${!#}"; NAME="${NAME##*/}"', 'HTTP=204; CODE=0; TEXT=""',
      'if [ "$NAME" = "$STUB_FAIL" ]; then HTTP="$STUB_HTTP"; CODE="$STUB_EXIT"; TEXT="$STUB_BODY"; fi',
      'printf "%s" "$TEXT" >"$4"', 'printf "%s" "$HTTP"', 'printf "%s" "PRIVATE_CURL_STDERR" >&2', 'exit "$CODE"', "",
    ].join("\n"), { mode: 0o700 });
    const cases = [
      { code: 0, count: 7, error: "none" },
      { api: "", code: 1, count: 0, error: "api_url_missing" },
      { key: "", code: 1, count: 0, error: "publishable_key_missing" },
      { key: "PRIVATE_INVALID_KEY", code: 1, count: 0, error: "publishable_key_shape" },
      { exit: "7", http: "000", code: 7, count: 3, error: "connection_error" },
      { http: "503", code: 1, count: 3, error: "unexpected_http_status" },
      { http: '204"::error::PRIVATE_STATUS', code: 1, count: 3, error: "unexpected_http_status" },
      ...["name resolution failed", "connection refused", "upstream unavailable"].map((body) => ({ body: `${body} PRIVATE_BODY`, code: 1, count: 3, error: "response_transport_error" })),
    ];
    for (const scenario of cases) {
      const callsPath = join(root, "calls"); await writeFile(callsPath, "");
      const api = scenario.api ?? "http://127.0.0.1:54321", key = scenario.key ?? "sb_publishable_offline_fixture";
      const result = spawnSync("bash", ["--noprofile", "--norc", "-s"], {
        input: source.replaceAll("/tmp/", `${root}/`), cwd: root, encoding: "utf8", timeout: 5000,
        env: { PATH: `${bin}:${process.env.PATH}`, STUB_CALLS: callsPath, STUB_API: api, STUB_KEY: key, STUB_FAIL: "stock-market-runner", STUB_HTTP: scenario.http ?? "204", STUB_EXIT: scenario.exit ?? "0", STUB_BODY: scenario.body ?? "" },
      });
      assert(!result.error); assert.equal(result.status, scenario.code);
      const calls = (await readFile(callsPath, "utf8")).split("\n").filter(Boolean).map((line) => line.split("\0").slice(0, -1));
      assert.equal(calls.length, scenario.count);
      calls.forEach((args, index) => assert.deepEqual(args, ["--silent", "--show-error", "--output", `${root}/${functions[index]}-options.body`, "--write-out", "%{http_code}", "--request", "OPTIONS", "--header", `apikey: ${key}`, `${api}/functions/v1/${functions[index]}`]));
      const records = result.stdout.split("\n").filter((line) => line.startsWith("ONBOARDING_OPTIONS ")).map((line) => JSON.parse(line.slice("ONBOARDING_OPTIONS ".length)));
      assert.equal(records.length, scenario.count + 1);
      assert.equal(records[0].apiUrlPresent, Boolean(api)); assert.equal(records[0].publishableKeyPresent, Boolean(key));
      assert.equal(records.at(-1).errorClass, scenario.error);
      if (scenario.count) {
        assert.equal(records.at(-1).function, functions[scenario.count - 1]);
        assert.equal(records.at(-1).curlExit, Number(scenario.exit ?? "0"));
        assert.equal(records.at(-1).httpStatus, scenario.http?.length === 3 ? scenario.http : scenario.http ? "invalid" : "204");
      }
      assert(!`${result.stdout}${result.stderr}`.includes("PRIVATE"));
      assert(!result.stdout.includes("sb_publishable_offline_fixture") && !result.stdout.includes(api || "http://127.0.0.1:54321"));
    }
  } finally { await rm(root, { recursive: true }); }
});

test("Onboarding runtime capture is failure-only, read-only and separately bounded", async () => {
  const workflow = await read(".github/workflows/runtime-stabilization-onboarding.yml");
  const capture = workflow.split("      - name: Observe owned Edge runtime after failed OPTIONS\n")[1].split("      - name: Stop local Supabase\n")[0];
  assert.match(capture, /failure\(\) && !cancelled\(\) && steps\.local-options\.outcome == 'failure'/u);
  assert.match(capture, /timeout-minutes: 1/u);
  assert.match(capture, /run: node scripts\/onboarding-edge-failure-receipt\.mjs capture/u);
  assert.match(workflow, /node scripts\/onboarding-edge-failure-receipt\.mjs prepare\n\s+EXCLUDED=/u);
  assert.match(workflow, /- name: Prove publishable-key functions are reachable\n\s+id: local-options/u);
});

test("Onboarding reads logs only after exact same-job container ownership is established", async () => {
  const root = await mkdtemp(join(tmpdir(), "onboarding-container-"));
  const head = "a".repeat(40), id = "b".repeat(64), now = Date.parse("2026-11-01T00:00:00Z");
  try {
    for (const scenario of ["valid", "preexisting", "wrong-label", "wrong-name", "wrong-id", "old-container", "wrong-run", "wrong-attempt", "wrong-head", "remote-context", "remote-host", "timeout", "signal", "logs-failed", "unknown-absence"]) {
      const dir = join(root, scenario); await mkdir(dir);
      const calls = [];
      const env = { PATH: process.env.PATH, RUNNER_TEMP: dir, GITHUB_RUN_ID: "123", GITHUB_RUN_ATTEMPT: "1", GITHUB_JOB: "local-functions", RELEASE_COMMIT: head, PRIVATE_TOKEN: "PRIVATE_INHERITED_TOKEN" };
      const run = (tool, args, options) => {
        calls.push([tool, ...args]);
        assert.equal(options.timeout, 5000); assert.equal(options.maxBuffer, 131072);
        assert(!("PRIVATE_TOKEN" in options.env));
        const result = { status: 0, signal: null, stdout: "", stderr: "" };
        if (tool === "git") { assert.deepEqual(args, ["rev-parse", "HEAD"]); return { ...result, stdout: head + "\n" }; }
        assert.equal(tool, "docker");
        if (args[0] === "context") return { ...result, stdout: JSON.stringify(scenario === "remote-context" ? "tcp://remote:2375" : "unix:///var/run/docker.sock") };
        if (args[0] === "container") {
          assert.equal(args.at(-1), "supabase_edge_runtime_econovaria");
          if (args[3] === "{{.Id}}") return scenario === "preexisting" ? { ...result, stdout: id } : { ...result, status: 1, stderr: scenario === "unknown-absence" ? "daemon unavailable" : "Error: No such container: supabase_edge_runtime_econovaria\n" };
          return { ...result, stdout: JSON.stringify({ id: scenario === "wrong-id" ? "bad-id" : id, name: scenario === "wrong-name" ? "/foreign" : "/supabase_edge_runtime_econovaria", project: scenario === "wrong-label" ? "foreign" : "econovaria", created: new Date(now + (scenario === "old-container" ? -1000 : 1000)).toISOString() }) };
        }
        assert.deepEqual(args, ["logs", "--since", new Date(now).toISOString(), "--tail", "80", "--timestamps", id]);
        if (scenario === "timeout") return { ...result, error: Object.assign(new Error("PRIVATE_PROCESS_ERROR"), { code: "ETIMEDOUT" }) };
        if (scenario === "signal") return { ...result, signal: "SIGTERM", status: null };
        if (scenario === "logs-failed") return { ...result, status: 1, stderr: "PRIVATE_DOCKER_ERROR" };
        return { ...result, stdout: "worker boot error: module not found", stderr: "token=PRIVATE_CONTAINER_TOKEN" };
      };
      const options = { env, run, now: () => now };
      observeOnboardingEdgeFailure("prepare", options);
      if (scenario === "wrong-run") env.GITHUB_RUN_ID = "456";
      if (scenario === "wrong-attempt") env.GITHUB_RUN_ATTEMPT = "2";
      if (scenario === "wrong-head") env.RELEASE_COMMIT = "c".repeat(40);
      if (scenario === "remote-host") env.DOCKER_HOST = "tcp://remote:2375";
      const result = observeOnboardingEdgeFailure("capture", options);
      assert.equal(result.available, scenario === "valid");
      assert.equal(calls.filter((args) => args[1] === "logs").length, ["valid", "timeout", "signal", "logs-failed"].includes(scenario) ? 1 : 0);
      assert(!JSON.stringify(result).includes("PRIVATE"));
      if (scenario === "valid") assert(result.log.lines.join("\n").includes("module not found"));
    }
  } finally { await rm(root, { recursive: true }); }
});

test("Onboarding runtime data preserves errors while redacting credentials and bounding JSON", () => {
  const raw = [
    "worker boot error: UnfamiliarModuleFailure at https://user:PRIVATE_USER@esm.sh/tslib.mjs?token=PRIVATE_QUERY#PRIVATE_FRAGMENT",
    'Authorization: Bearer PRIVATE_BEARER', '"token":"PRIVATE_JSON_TOKEN"', '"access_token":"PRIVATE_ACCESS_TOKEN"', "sb_secret_PRIVATE_SUPABASE_KEY",
    "https://proxy:PRIVATE_PROXY@example.com:8080", "PRIVATE_ENV_VALUE", "person@example.com",
    "d9428888-122b-4aa9-8e2f-00c0655adcf2", "\u001b[31m::error::untrusted command\u001b[0m",
    ...Array.from({ length: 200 }, () => "界".repeat(100)),
  ].join("\n");
  const receipt = sanitizeOnboardingRuntimeLog(raw, { HTTPS_PROXY: "https://proxy:PRIVATE_PROXY@example.com:8080", PRIVATE_TOKEN: "PRIVATE_ENV_VALUE" });
  const serialized = JSON.stringify(receipt);
  assert(!serialized.includes("PRIVATE") && !serialized.includes("person@example.com") && !serialized.includes("d9428888"));
  assert(serialized.includes("UnfamiliarModuleFailure") && serialized.includes("https://esm.sh/tslib.mjs"));
  assert(!serialized.includes("\u001b") && !serialized.includes("\n"));
  assert.equal(receipt.originalBytes, Buffer.byteLength(raw)); assert.match(receipt.sha256, /^[a-f0-9]{64}$/u);
  assert(receipt.truncated); assert(Buffer.byteLength(serialized) <= 8192);
});

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
  assert.match(vercel, /COOKIE_ENVELOPE_PATTERN|proxyAdminBff/);
  assert.match(vercel, /VERCEL_OIDC_TOKEN/);
  assert.match(vercel, /x-forwarded-for/);
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
