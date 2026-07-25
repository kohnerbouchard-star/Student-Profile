import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

import { HttpTransport } from "../player-terminal/src/api/http-transport.js";
import { headersFor } from "../player-terminal/src/integrations/student-profile-api-call.js";
import { resolvePlayerLogoutUrl } from "../player-terminal/src/integrations/player-logout-controller.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gatewayPath = path.join(repositoryRoot, "scripts", "local-staging-gateway.py");
const runtimeConfigPath = path.join(repositoryRoot, "frontend", "src", "core", "runtime-config.js");

function probeGateway() {
  const program = String.raw`
import importlib.util
import json
import sys
from email.message import Message

path = sys.argv[1]
spec = importlib.util.spec_from_file_location("econovaria_local_gateway", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

publishable_key = "sb_publishable_contract_test"
local_anon_key = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6ImxvY2FsaG9zdCJ9.signature"
user_jwt = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJzdGFmZi11c2VyIn0.signature"

generated = module.runtime_config(
    "eecvbssdvarfcykcfrny",
    publishable_key,
    4173,
)
local_generated = module.runtime_config(
    module.LOCAL_DEVELOPMENT_PROJECT_REF,
    publishable_key,
    4173,
    environment="development",
    supabase_url="http://127.0.0.1:54321",
)
prefix = "window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze("
suffix = ");\n"
assert generated.startswith(prefix)
assert generated.endswith(suffix)
assert local_generated.startswith(prefix)
assert local_generated.endswith(suffix)
config = json.loads(generated[len(prefix):-len(suffix)])
local_config = json.loads(local_generated[len(prefix):-len(suffix)])

parsed_status = module.parse_supabase_status_env(
    'API_URL="http://127.0.0.1:54321"\n'
    f'PUBLISHABLE_KEY="{publishable_key}"\n'
    f'ANON_KEY="{local_anon_key}"\n'
    'IGNORED\n'
)
selected_publishable, selected_anon = module.local_browser_keys(parsed_status)

public_headers = Message()
public_headers["apikey"] = publishable_key
public_forwarded = module.filtered_request_headers(
    public_headers,
    "127.0.0.1:54321",
    path="/functions/v1/classroom-api/staff/signup",
    browser_publishable_key=publishable_key,
    platform_anon_key=local_anon_key,
)

staff_headers = Message()
staff_headers["apikey"] = publishable_key
staff_headers["Authorization"] = f"Bearer {user_jwt}"
staff_forwarded = module.filtered_request_headers(
    staff_headers,
    "127.0.0.1:54321",
    path="/functions/v1/classroom-api/staff/bootstrap",
    browser_publishable_key=publishable_key,
    platform_anon_key=local_anon_key,
)

auth_headers = Message()
auth_headers["apikey"] = publishable_key
auth_headers["Authorization"] = f"Bearer {publishable_key}"
auth_forwarded = module.filtered_request_headers(
    auth_headers,
    "127.0.0.1:54321",
    path="/auth/v1/token?grant_type=password",
    browser_publishable_key=publishable_key,
    platform_anon_key=local_anon_key,
)

conditional_headers = Message()
conditional_headers["If-Modified-Since"] = "Wed, 22 Jul 2026 00:00:00 GMT"
conditional_headers["If-None-Match"] = '"stale-player-bundle"'
module.remove_static_conditionals(conditional_headers)

print(json.dumps({
    "functions": module.is_proxy_path("/functions/v1/classroom-api/players/login"),
    "auth": module.is_proxy_path("/auth/v1/token?grant_type=password"),
    "rest": module.is_proxy_path("/rest/v1/players"),
    "storage": module.is_proxy_path("/storage/v1/object/public/example"),
    "config": config,
    "localConfig": local_config,
    "parsedStatus": parsed_status,
    "selectedPublishable": selected_publishable,
    "selectedAnon": selected_anon,
    "publicForwarded": public_forwarded,
    "staffForwarded": staff_forwarded,
    "authForwarded": auth_forwarded,
    "staticHeaders": dict(module.STATIC_NO_CACHE_HEADERS),
    "remainingConditionals": list(conditional_headers.keys()),
}))
`;

  const result = spawnSync("python3", ["-c", program, gatewayPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });

  assert.equal(
    result.status,
    0,
    `local gateway contract probe failed:\n${result.stderr || result.stdout}`,
  );
  return JSON.parse(result.stdout);
}

function legacyAnonKey(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${encoded}.signature`;
}

function evaluateRuntimeConfig(config) {
  const window = {
    __ECONOVARIA_RUNTIME_CONFIG__: config,
    atob(value) {
      return Buffer.from(value, "base64").toString("binary");
    },
    document: { querySelector: () => null },
  };
  vm.runInNewContext(readFileSync(runtimeConfigPath, "utf8"), { window, URL });
  return window.EconovariaRuntimeConfig;
}

test("local gateway proxies Edge Functions and Supabase Auth only", () => {
  const result = probeGateway();

  assert.equal(result.functions, true);
  assert.equal(result.auth, true);
  assert.equal(result.rest, false);
  assert.equal(result.storage, false);
});

test("connected staging exposes the publishable key to the browser", () => {
  const { config } = probeGateway();

  assert.deepEqual(config, {
    environment: "staging",
    projectRef: "eecvbssdvarfcykcfrny",
    supabaseUrl: "https://eecvbssdvarfcykcfrny.supabase.co",
    apiProxyUrl: "http://127.0.0.1:4173",
    supabasePublishableKey: "sb_publishable_contract_test",
  });
});

test("local mode exposes publishable key and retains anon JWT server-side only", () => {
  const {
    localConfig,
    parsedStatus,
    selectedPublishable,
    selectedAnon,
  } = probeGateway();

  assert.deepEqual(localConfig, {
    environment: "development",
    projectRef: "localdevelopment0000",
    supabaseUrl: "http://127.0.0.1:4173",
    apiProxyUrl: "http://127.0.0.1:4173",
    supabasePublishableKey: "sb_publishable_contract_test",
  });
  assert.deepEqual(parsedStatus, {
    API_URL: "http://127.0.0.1:54321",
    PUBLISHABLE_KEY: "sb_publishable_contract_test",
    ANON_KEY:
      "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiIsInJlZiI6ImxvY2FsaG9zdCJ9.signature",
  });
  assert.equal(selectedPublishable, "sb_publishable_contract_test");
  assert.match(selectedAnon, /^eyJ/);
  assert.notEqual(localConfig.supabasePublishableKey, selectedAnon);
});

test("gateway injects anon JWT only for public verified Edge requests", () => {
  const { publicForwarded, staffForwarded, authForwarded } = probeGateway();

  assert.equal(publicForwarded.apikey, "sb_publishable_contract_test");
  assert.match(publicForwarded.Authorization, /^Bearer eyJ/);

  assert.equal(staffForwarded.apikey, "sb_publishable_contract_test");
  assert.equal(
    staffForwarded.Authorization,
    "Bearer eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJzdGFmZi11c2VyIn0.signature",
  );

  assert.equal(authForwarded.apikey, "sb_publishable_contract_test");
  assert.equal(authForwarded.Authorization, undefined);
});

test("runtime validator accepts publishable keys under local development binding", () => {
  const runtime = evaluateRuntimeConfig({
    environment: "development",
    projectRef: "localdevelopment0000",
    supabaseUrl: "http://127.0.0.1:4173",
    apiProxyUrl: "http://127.0.0.1:4173",
    supabasePublishableKey: "sb_publishable_contract_test",
  });

  assert.equal(runtime.environment, "development");
  assert.equal(runtime.supabaseUrl, "http://127.0.0.1:4173");
  assert.equal(runtime.classroomApiUrl, "http://127.0.0.1:4173/functions/v1/classroom-api");
});

test("remote legacy anon keys retain exact project binding", () => {
  assert.throws(
    () =>
      evaluateRuntimeConfig({
        environment: "staging",
        projectRef: "eecvbssdvarfcykcfrny",
        supabaseUrl: "https://eecvbssdvarfcykcfrny.supabase.co",
        apiProxyUrl: "http://127.0.0.1:4173",
        supabasePublishableKey: legacyAnonKey({ role: "anon", ref: "anotherprojectref000" }),
      }),
    /ECONOVARIA_RUNTIME_CONFIG_INVALID_LEGACY_ANON_KEY/,
  );
});

test("connected local static assets cannot reuse stale browser validators", () => {
  const result = probeGateway();

  assert.deepEqual(result.remainingConditionals, []);
  assert.equal(result.staticHeaders["Cache-Control"], "no-store, no-cache, must-revalidate, max-age=0");
  assert.equal(result.staticHeaders.Pragma, "no-cache");
  assert.equal(result.staticHeaders.Expires, "0");
  assert.equal(result.staticHeaders["X-Econovaria-Local-Gateway"], "connected-no-cache-v2");
});

test("Player Terminal sends publishable key as apikey without bearer duplication", async () => {
  const originalFetch = globalThis.fetch;
  let request = null;

  try {
    globalThis.fetch = async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const transport = new HttpTransport({
      apiBaseUrl: "http://127.0.0.1:4173/functions/v1/classroom-api",
      requestTimeoutMs: 1000,
      publishableKey: "sb_publishable_contract_test",
      playerSessionToken: "ps_contract",
      gameSessionId: "game_contract",
    });

    await transport.request({
      endpointKey: "session",
      method: "GET",
      path: "/players/me",
      requestId: "ptr_contract",
      idempotencyKey: "ptr_contract_idempotency",
    });

    assert.equal(request.options.headers.apikey, "sb_publishable_contract_test");
    assert.equal(request.options.headers.Authorization, undefined);
    assert.equal(request.options.headers["x-player-session-token"], "ps_contract");
    assert.equal(request.options.headers["x-econovaria-game-id"], "game_contract");
    assert.equal(request.options.headers["x-idempotency-key"], "ptr_contract_idempotency");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Student-Profile adapter separates publishable and user credentials", () => {
  const publicHeaders = headersFor({
    endpointKey: "session",
    requestId: "ptr_adapter_contract",
    session: {
      publishableKey: "sb_publishable_contract_test",
      playerSessionToken: "ps_adapter_contract",
    },
    config: {},
  });

  assert.equal(publicHeaders.Authorization, undefined);
  assert.equal(publicHeaders.apikey, "sb_publishable_contract_test");
  assert.equal(publicHeaders["x-player-session-token"], "ps_adapter_contract");

  const userHeaders = headersFor({
    endpointKey: "session",
    requestId: "ptr_user_adapter_contract",
    session: {
      accessToken: "user.jwt.contract",
      publishableKey: "sb_publishable_contract_test",
      playerSessionToken: "ps_adapter_contract",
    },
    config: {},
  });

  assert.equal(userHeaders.Authorization, "Bearer user.jwt.contract");
  assert.equal(userHeaders.apikey, "sb_publishable_contract_test");
});

test("Student-Profile adapter retains Player session headers in injected test adapters", () => {
  const headers = headersFor({
    endpointKey: "session",
    requestId: "ptr_injected_adapter",
    session: { playerSessionToken: "ps_adapter_contract" },
    config: {},
  });

  assert.equal(headers.Authorization, undefined);
  assert.equal(headers.apikey, undefined);
  assert.equal(headers["x-player-session-token"], "ps_adapter_contract");
});

test("voluntary logout does not reuse the invalid-session destination", () => {
  const result = resolvePlayerLogoutUrl({
    logoutExitUrl: "http://127.0.0.1:4173/?mode=player&reason=logged-out",
    sessionExitUrl: "http://127.0.0.1:4173/?mode=player&reason=session-invalid",
  }, {
    href: "http://127.0.0.1:4173/player-terminal/",
  });

  assert.equal(result, "http://127.0.0.1:4173/?mode=player&reason=logged-out");
});
