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
const gatewayPath = path.join(repositoryRoot, "scripts", "econovaria-local-gateway.py");
const runtimeConfigPath = path.join(repositoryRoot, "frontend", "src", "core", "runtime-config.js");

function probeGateway() {
  const program = String.raw`
import importlib.util
import json
import sys
from email.message import Message

path = sys.argv[1]
spec = importlib.util.spec_from_file_location("econovaria_gateway", path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

publishable_key = "sb_publishable_contract_test"
user_jwt = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJzdGFmZi11c2VyIn0.signature"
parsed_status = module.parse_supabase_status_env(
    'API_URL="http://127.0.0.1:54321"\n'
    f'PUBLISHABLE_KEY="{publishable_key}"\n'
    'ANON_KEY="eyJlegacy-unused"\n'
)

public_headers = Message()
public_headers["apikey"] = publishable_key
public_headers["Authorization"] = f"Bearer {publishable_key}"
public_forwarded = module.filtered_request_headers(
    public_headers,
    "127.0.0.1:54321",
    browser_publishable_key=publishable_key,
)

staff_headers = Message()
staff_headers["apikey"] = publishable_key
staff_headers["Authorization"] = f"Bearer {user_jwt}"
staff_headers["x-forwarded-for"] = "203.0.113.7"
staff_forwarded = module.filtered_request_headers(
    staff_headers,
    "127.0.0.1:54321",
    browser_publishable_key=publishable_key,
)

generated = module.runtime_config(
    module.LOCAL_DEVELOPMENT_PROJECT_REF,
    publishable_key,
    4173,
    environment="development",
    supabase_url="http://127.0.0.1:54321",
)
prefix = "window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze("
suffix = ");\n"
config = json.loads(generated[len(prefix):-len(suffix)])

print(json.dumps({
    "functions": module.is_proxy_path("/functions/v1/player-api/players/login"),
    "auth": module.is_proxy_path("/auth/v1/token?grant_type=password"),
    "rest": module.is_proxy_path("/rest/v1/players"),
    "parsedStatus": parsed_status,
    "publicForwarded": public_forwarded,
    "staffForwarded": staff_forwarded,
    "runtimeConfig": config,
    "staticHeaders": dict(module.STATIC_NO_CACHE_HEADERS),
    "maxBody": module.MAX_PROXY_BODY_BYTES,
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

test("gateway proxies only Edge Functions and Supabase Auth", () => {
  const result = probeGateway();
  assert.equal(result.functions, true);
  assert.equal(result.auth, true);
  assert.equal(result.rest, false);
  assert.equal(result.maxBody, 1_048_576);
});

test("local browser config contains only publishable application identity", () => {
  const result = probeGateway();
  assert.equal(result.parsedStatus.PUBLISHABLE_KEY, "sb_publishable_contract_test");
  assert.equal(result.runtimeConfig.supabasePublishableKey, "sb_publishable_contract_test");
  assert.equal(JSON.stringify(result.runtimeConfig).includes("eyJlegacy-unused"), false);

  const runtime = evaluateRuntimeConfig(result.runtimeConfig);
  assert.equal(runtime.playerApiUrl, "http://127.0.0.1:4173/functions/v1/player-api");
  assert.equal(runtime.staffApiUrl, "http://127.0.0.1:4173/functions/v1/staff-api");
  assert.equal(runtime.bootstrapApiUrl, "http://127.0.0.1:4173/functions/v1/bootstrap-api");
  assert.equal(runtime.adminApiUrl, "http://127.0.0.1:4173/functions/v1/admin-api");
  assert.equal(runtime.classroomApiUrl, runtime.staffApiUrl);
});

test("gateway strips publishable bearer and preserves real staff JWT", () => {
  const result = probeGateway();
  assert.equal(result.publicForwarded.apikey, "sb_publishable_contract_test");
  assert.equal(result.publicForwarded.Authorization, undefined);
  assert.equal(result.publicForwarded["x-real-ip"], "127.0.0.1");

  assert.equal(result.staffForwarded.apikey, "sb_publishable_contract_test");
  assert.equal(
    result.staffForwarded.Authorization,
    "Bearer eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJzdGFmZi11c2VyIn0.signature",
  );
  assert.equal(result.staffForwarded["x-real-ip"], "127.0.0.1");
  assert.equal(result.staffForwarded["x-forwarded-for"], undefined);
  assert.equal(result.staticHeaders["X-Econovaria-Local-Gateway"], "publishable-only-v2");
});

test("Player Terminal sends publishable key only as apikey", async () => {
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
      apiBaseUrl: "http://127.0.0.1:4173/functions/v1/player-api",
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
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Student-Profile adapter separates publishable and bearer credentials", () => {
  const publicHeaders = headersFor({
    endpointKey: "session",
    requestId: "ptr_adapter_contract",
    session: {
      publishableKey: "sb_publishable_contract_test",
      playerSessionToken: "ps_adapter_contract",
    },
    config: {},
  });
  assert.equal(publicHeaders.apikey, "sb_publishable_contract_test");
  assert.equal(publicHeaders.Authorization, undefined);

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
  assert.equal(userHeaders.apikey, "sb_publishable_contract_test");
  assert.equal(userHeaders.Authorization, "Bearer user.jwt.contract");
});

test("voluntary logout does not reuse invalid-session destination", () => {
  const result = resolvePlayerLogoutUrl({
    logoutExitUrl: "http://127.0.0.1:4173/?mode=player&reason=logged-out",
    sessionExitUrl: "http://127.0.0.1:4173/?mode=player&reason=session-invalid",
  }, {
    href: "http://127.0.0.1:4173/player-terminal/",
  });
  assert.equal(result, "http://127.0.0.1:4173/?mode=player&reason=logged-out");
});
