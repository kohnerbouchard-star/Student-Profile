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
const DEVICE_ID = "11111111-1111-4111-8111-111111111111";
const CSRF_TOKEN = "C".repeat(43);

function probeGateway() {
  const program = String.raw`
import base64
import importlib.util
import json
import sys
from email.message import Message

path = sys.argv[1]
spec = importlib.util.spec_from_file_location("econovaria_gateway", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

publishable_key = "sb_publishable_contract_test"
user_jwt = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJzdGFmZi11c2VyIn0.signature"
iv = base64.urlsafe_b64encode(bytes(range(12))).decode("ascii").rstrip("=")
ciphertext = base64.urlsafe_b64encode(bytes(range(17, 81))).decode("ascii").rstrip("=")
envelope = f"v1.{iv}.{ciphertext}"
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
staff_headers["x-unreviewed-header"] = "must-not-pass"
staff_forwarded = module.filtered_request_headers(
    staff_headers,
    "127.0.0.1:54321",
    browser_publishable_key=publishable_key,
)

web_headers = Message()
web_headers["apikey"] = publishable_key
web_headers["Cookie"] = f"analytics=secret; econovaria_admin_session={envelope}; unrelated=value"
web_headers["x-econovaria-csrf-token"] = "C" * 43
web_headers["x-idempotency-key"] = "admin-command-001"
web_forwarded = module.filtered_request_headers(
    web_headers,
    "127.0.0.1:54321",
    browser_publishable_key=publishable_key,
    request_path="/functions/v1/web-session-api/proxy/games",
    browser_origin="http://127.0.0.1:4173",
)

conflicting_idempotency_headers = Message()
conflicting_idempotency_headers["Idempotency-Key"] = "admin-command-canonical"
conflicting_idempotency_headers["X-Idempotency-Key"] = "admin-command-compatibility"
conflicting_idempotency_forwarded = module.filtered_request_headers(
    conflicting_idempotency_headers,
    "127.0.0.1:54321",
    browser_publishable_key=publishable_key,
    request_path="/functions/v1/web-session-api/proxy/games",
)

response_metadata = module.filtered_response_headers([
    ("Content-Type", "application/json; charset=iso-8859-1"),
    ("Retry-After", "00045"),
    ("X-Request-Id", "req.contract-1"),
    ("Set-Cookie", f"econovaria_admin_session={envelope}; Path=/; HttpOnly; SameSite=Strict"),
    ("Location", "https://attacker.invalid/"),
    ("Access-Control-Allow-Origin", "*"),
    ("X-Attacker\r\nInjected", "yes"),
])
clear_metadata = module.filtered_response_headers([
    ("Set-Cookie", "__Host-econovaria_admin_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"),
])
invalid_response_metadata = module.filtered_response_headers([
    ("Content-Type", "text/html"),
    ("Retry-After", "Thu, 01 Jan 2099 00:00:00 GMT"),
    ("X-Request-Id", "bad request id"),
    ("Set-Cookie", "econovaria_admin_session=v1.bad.bad; Path=/; HttpOnly"),
])

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
    "webForwarded": web_forwarded,
    "conflictingIdempotencyForwarded": conflicting_idempotency_forwarded,
    "adminSignedContextHeaders": module.ADMIN_BFF_SIGNED_CONTEXT_HEADERS,
    "responseMetadata": {
        "contentType": response_metadata.content_type,
        "retryAfter": response_metadata.retry_after,
        "requestId": response_metadata.request_id,
        "sessionCookie": response_metadata.session_cookie,
    },
    "clearCookie": clear_metadata.session_cookie,
    "invalidResponseMetadata": {
        "contentType": invalid_response_metadata.content_type,
        "retryAfter": invalid_response_metadata.retry_after,
        "requestId": invalid_response_metadata.request_id,
        "sessionCookie": invalid_response_metadata.session_cookie,
    },
    "runtimeConfig": config,
    "staticHeaders": dict(module.STATIC_NO_CACHE_HEADERS),
    "maxBody": module.MAX_PROXY_BODY_BYTES,
    "envelope": envelope,
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
  const functions = "http://127.0.0.1:4173/functions/v1";
  assert.equal(runtime.playerWebSessionApiUrl, `${functions}/player-web-session-api`);
  assert.equal(runtime.playerApiUrl, `${functions}/player-web-session-api/proxy`);
  assert.equal(runtime.staffApiUrl, `${functions}/staff-api`);
  assert.equal(runtime.bootstrapApiUrl, `${functions}/bootstrap-api`);
  assert.equal(runtime.adminApiUrl, `${functions}/admin-api`);
  assert.equal(runtime.webSessionApiUrl, `${functions}/web-session-api`);
  assert.equal(runtime.adminLogoutApiUrl, `${functions}/web-session-api/logout`);
  assert.equal(runtime.adminBffApiUrl, `${functions}/web-session-api/proxy`);
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
  assert.equal(result.staffForwarded["x-unreviewed-header"], undefined);
  assert.equal(result.staticHeaders["X-Econovaria-Local-Gateway"], "publishable-only-v3");
});

test("gateway carries only the encrypted Admin session and CSRF", () => {
  const result = probeGateway();
  assert.equal(
    result.webForwarded.Cookie,
    `econovaria_admin_session=${result.envelope}`,
  );
  assert.equal(result.webForwarded.Origin, "http://127.0.0.1:4173");
  assert.equal(result.webForwarded["x-econovaria-csrf-token"], "C".repeat(43));
  assert.equal(result.webForwarded["Idempotency-Key"], "admin-command-001");
  assert.equal(result.webForwarded["x-idempotency-key"], undefined);
  assert.equal(result.conflictingIdempotencyForwarded["Idempotency-Key"], undefined);
  assert.ok(result.adminSignedContextHeaders.includes("idempotency-key"));
  assert.equal(result.adminSignedContextHeaders.includes("x-idempotency-key"), false);
  assert.equal(result.webForwarded.Cookie.includes("analytics"), false);
  assert.equal(result.webForwarded.Cookie.includes("unrelated"), false);
});

test("gateway reconstructs a bounded response-header and cookie contract", () => {
  const result = probeGateway();
  assert.deepEqual(result.responseMetadata, {
    contentType: "application/json; charset=utf-8",
    retryAfter: "45",
    requestId: "req.contract-1",
    sessionCookie: `econovaria_admin_session=${result.envelope}; Path=/; Max-Age=28800; HttpOnly; SameSite=Strict`,
  });
  assert.equal(
    result.clearCookie,
    "econovaria_admin_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict",
  );
  assert.deepEqual(result.invalidResponseMetadata, {
    contentType: "application/octet-stream",
    retryAfter: null,
    requestId: null,
    sessionCookie: null,
  });
  assert.equal(JSON.stringify(result.responseMetadata).includes("attacker.invalid"), false);
});

test("Player Terminal uses the HttpOnly BFF without a browser credential", async () => {
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
      apiBaseUrl: "http://127.0.0.1:4173/functions/v1/player-web-session-api/proxy",
      requestTimeoutMs: 1000,
      publishableKey: "sb_publishable_contract_test",
      deviceId: DEVICE_ID,
      sessionProvider: () => ({ authenticated: true, csrfToken: CSRF_TOKEN }),
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
    assert.equal(request.options.headers["x-player-session-token"], undefined);
    assert.equal(request.options.headers["x-econovaria-device-id"], DEVICE_ID);
    assert.equal(request.options.credentials, "include");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Player mutation headers use publishable identity, device binding, and CSRF only", () => {
  const headers = headersFor({
    endpointKey: "marketOrder",
    method: "POST",
    requestId: "ptr_adapter_contract",
    idempotencyKey: "idem_adapter_contract",
    session: {
      authenticated: true,
      csrfToken: CSRF_TOKEN,
    },
    config: {
      publishableKey: "sb_publishable_contract_test",
      deviceId: DEVICE_ID,
    },
  });
  assert.equal(headers.apikey, "sb_publishable_contract_test");
  assert.equal(headers["x-econovaria-device-id"], DEVICE_ID);
  assert.equal(headers["x-econovaria-csrf-token"], CSRF_TOKEN);
  assert.equal(headers["x-player-session-token"], undefined);
  assert.equal(headers.Authorization, undefined);
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
