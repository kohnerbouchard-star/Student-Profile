import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

import { HttpTransport } from "../player-terminal/src/api/http-transport.js";
import { headersFor } from "../player-terminal/src/integrations/student-profile-api-call.js";
import { resolvePlayerLogoutUrl } from "../player-terminal/src/integrations/player-logout-controller.js";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gatewayPath = path.join(repositoryRoot, "scripts", "local-staging-gateway.py");

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

generated = module.runtime_config(
    "eecvbssdvarfcykcfrny",
    "sb_publishable_contract_test",
    4173,
)
prefix = "window.__ECONOVARIA_RUNTIME_CONFIG__ = Object.freeze("
suffix = ");\n"
assert generated.startswith(prefix)
assert generated.endswith(suffix)
config = json.loads(generated[len(prefix):-len(suffix)])

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

test("local staging gateway proxies only Edge Function traffic", () => {
  const result = probeGateway();

  assert.equal(result.functions, true);
  assert.equal(result.auth, false);
  assert.equal(result.rest, false);
  assert.equal(result.storage, false);
});

test("local staging config keeps Auth on Supabase and Edge APIs on loopback", () => {
  const { config } = probeGateway();

  assert.deepEqual(config, {
    environment: "staging",
    projectRef: "eecvbssdvarfcykcfrny",
    supabaseUrl: "https://eecvbssdvarfcykcfrny.supabase.co",
    apiProxyUrl: "http://127.0.0.1:4173",
    supabasePublishableKey: "sb_publishable_contract_test",
  });
});

test("connected local static assets cannot reuse stale browser validators", () => {
  const result = probeGateway();

  assert.deepEqual(result.remainingConditionals, []);
  assert.equal(result.staticHeaders["Cache-Control"], "no-store, no-cache, must-revalidate, max-age=0");
  assert.equal(result.staticHeaders.Pragma, "no-cache");
  assert.equal(result.staticHeaders.Expires, "0");
  assert.equal(result.staticHeaders["X-Econovaria-Local-Gateway"], "connected-no-cache-v1");
});

test("Player Terminal sends the canonical backend session contract", async () => {
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
      accessToken: "sb_publishable_contract_test",
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

    assert.equal(request.options.headers["x-player-session-token"], "ps_contract");
    assert.equal(request.options.headers["x-econovaria-game-id"], "game_contract");
    assert.equal(request.options.headers["x-idempotency-key"], "ptr_contract_idempotency");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Student-Profile adapter supplies platform and Player session headers when configured", () => {
  const headers = headersFor({
    endpointKey: "session",
    requestId: "ptr_adapter_contract",
    session: {
      accessToken: "sb_publishable_contract_test",
      playerSessionToken: "ps_adapter_contract",
    },
    config: {},
  });

  assert.equal(headers.Authorization, "Bearer sb_publishable_contract_test");
  assert.equal(headers.apikey, "sb_publishable_contract_test");
  assert.equal(headers["x-player-session-token"], "ps_adapter_contract");
  assert.equal(headers["x-request-id"], "ptr_adapter_contract");
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
