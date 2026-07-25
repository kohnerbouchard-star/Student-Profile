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
const launcherPath = path.join(repositoryRoot, "scripts", "econovaria-local-gateway.py");
const runtimeConfigPath = path.join(repositoryRoot, "frontend", "src", "core", "runtime-config.js");

function probeGateway() {
  const program = String.raw`
import importlib.util
import json
import sys
from email.message import Message

base_path = sys.argv[1]
launcher_path = sys.argv[2]

base_spec = importlib.util.spec_from_file_location("econovaria_local_gateway_base", base_path)
base = importlib.util.module_from_spec(base_spec)
base_spec.loader.exec_module(base)

launcher_spec = importlib.util.spec_from_file_location("econovaria_local_gateway_launcher", launcher_path)
launcher = importlib.util.module_from_spec(launcher_spec)
launcher_spec.loader.exec_module(launcher)
launcher.install_publishable_only_contract(base)
launcher.install_trusted_client_ip(base)

publishable_key = "sb_publishable_contract_test"
user_jwt = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJzdGFmZi11c2VyIn0.signature"
parsed_status = base.parse_supabase_status_env(
    'API_URL="http://127.0.0.1:54321"\n'
    f'PUBLISHABLE_KEY="{publishable_key}"\n'
    'ANON_KEY="eyJlegacy-unused"\n'
)
selected_publishable, selected_compat = base.local_browser_keys(parsed_status)

public_headers = Message()
public_headers["apikey"] = publishable_key
public_headers["Authorization"] = f"Bearer {publishable_key}"
public_forwarded = base.filtered_request_headers(
    public_headers,
    "127.0.0.1:54321",
    path="/functions/v1/player-api/players/login",
    browser_publishable_key=publishable_key,
    platform_anon_key="eyJmust-not-be-used",
)

staff_headers = Message()
staff_headers["apikey"] = publishable_key
staff_headers["Authorization"] = f"Bearer {user_jwt}"
staff_forwarded = base.filtered_request_headers(
    staff_headers,
    "127.0.0.1:54321",
    path="/functions/v1/staff-api/staff/bootstrap",
    browser_publishable_key=publishable_key,
    platform_anon_key="eyJmust-not-be-used",
)

generated = base.runtime_config(
    base.LOCAL_DEVELOPMENT_PROJECT_REF,
    publishable_key,
    4173,
    environment="development",
    supabase_url="http://127.0.0.1:54321",
)
prefix = "window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze("
suffix = ");\n"
config = json.loads(generated[len(prefix):-len(suffix)])

print(json.dumps({
    "functions": base.is_proxy_path("/functions/v1/player-api/players/login"),
    "auth": base.is_proxy_path("/auth/v1/token?grant_type=password"),
    "rest": base.is_proxy_path("/rest/v1/players"),
    "selectedPublishable": selected_publishable,
    "selectedCompatibility": selected_compat,
    "publicForwarded": public_forwarded,
    "staffForwarded": staff_forwarded,
    "runtimeConfig": config,
}))
`;

  const result = spawnSync(
    "python3",
    ["-c", program, gatewayPath, launcherPath],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
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

test("local gateway proxies only Edge Functions and Supabase Auth", () => {
  const result = probeGateway();
  assert.equal(result.functions, true);
  assert.equal(result.auth, true);
  assert.equal(result.rest, false);
});

test("local browser config contains publishable key and split endpoints", () => {
  const result = probeGateway();
  assert.equal(result.selectedPublishable, "sb_publishable_contract_test");
  assert.equal(result.selectedCompatibility, "");
  assert.equal(result.runtimeConfig.supabasePublishableKey, "sb_publishable_contract_test");

  const runtime = evaluateRuntimeConfig(result.runtimeConfig);
  assert.equal(runtime.playerApiUrl, "http://127.0.0.1:4173/functions/v1/player-api");
  assert.equal(runtime.staffApiUrl, "http://127.0.0.1:4173/functions/v1/staff-api");
  assert.equal(runtime.bootstrapApiUrl, "http://127.0.0.1:4173/functions/v1/bootstrap-api");
  assert.equal(runtime.adminApiUrl, "http://127.0.0.1:4173/functions/v1/admin-api");
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
