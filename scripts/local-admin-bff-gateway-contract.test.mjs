import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gatewayPath = path.join(repositoryRoot, "scripts", "econovaria-local-gateway.py");

function probeLocalAdminBff() {
  const program = String.raw`
import base64
import importlib.util
import json
import sys
import uuid
from email.message import Message

path = sys.argv[1]
spec = importlib.util.spec_from_file_location("econovaria_admin_gateway", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

publishable_key = "sb_publishable_admin_gateway_contract"
game_id = "11111111-1111-4111-8111-111111111111"
browser_path = (
    f"/api/admin/games/{game_id}/join-code/reset"
    "?path=browser-forgery&limit=2&trace=1"
)
mapped = module.local_admin_bff_upstream_path(
    browser_path,
    local_supabase=True,
)

iv = base64.urlsafe_b64encode(bytes(range(12))).decode("ascii").rstrip("=")
ciphertext = base64.urlsafe_b64encode(bytes(range(17, 81))).decode("ascii").rstrip("=")
envelope = f"v1.{iv}.{ciphertext}"
headers = Message()
headers["apikey"] = publishable_key
headers["Authorization"] = "Bearer browser-staff-jwt-must-not-pass"
headers["Cookie"] = (
    f"econovaria_admin_session={envelope}; "
    f"econovaria_player_session={envelope}; analytics=discard"
)
headers["x-econovaria-bff-mode"] = "browser-forgery"
headers["x-econovaria-bff-signature"] = "v1=browser-forgery"
headers["x-player-session-token"] = "legacy-token-must-not-pass"
headers["x-forwarded-for"] = "203.0.113.44"
forwarded = module.filtered_request_headers(
    headers,
    "127.0.0.1:54321",
    browser_publishable_key=publishable_key,
    request_path=mapped,
    browser_origin="http://127.0.0.1:4173",
)

module.time.time = lambda: 1785362400
module.uuid.uuid4 = lambda: uuid.UUID("123e4567-e89b-42d3-a456-426614174000")
local_signed = module.maybe_signed_local_admin_bff_headers(
    forwarded,
    local_supabase=True,
    method="GET",
    upstream_path=mapped,
    body=None,
)
remote_unsigned = module.maybe_signed_local_admin_bff_headers(
    forwarded,
    local_supabase=False,
    method="GET",
    upstream_path=mapped,
    body=None,
)

def failure_name(candidate, local_supabase=True):
    try:
        module.local_admin_bff_upstream_path(
            candidate,
            local_supabase=local_supabase,
        )
    except Exception as error:
        return type(error).__name__
    return None

unsafe = {
    "rawTraversal": failure_name("/api/admin/../secrets"),
    "encodedTraversal": failure_name("/api/admin/%2e%2e/secrets"),
    "doubleEncodedTraversal": failure_name("/api/admin/%252e%252e/secrets"),
    "encodedBackslash": failure_name("/api/admin/games%5csecrets"),
    "emptySegment": failure_name("/api/admin/games//join-code/reset"),
    "oversized": failure_name("/api/admin/" + ("a" * 2049)),
    "remote": failure_name(browser_path, local_supabase=False),
}

try:
    module.signed_local_admin_bff_headers(
        forwarded,
        method="GET",
        target_url="https://remoteproject00000.supabase.co" + mapped,
        body=None,
    )
except Exception as error:
    remote_signature_error = type(error).__name__
else:
    remote_signature_error = None

try:
    module.EconovariaGatewayServer(
        ("127.0.0.1", 0),
        module.EconovariaGatewayHandler,
        upstream_url="https://remoteproject00000.supabase.co",
        publishable_key=publishable_key,
        request_timeout=30,
        local_supabase=True,
    )
except Exception as error:
    remote_local_server_error = type(error).__name__
else:
    remote_local_server_error = None

print(json.dumps({
    "mapped": mapped,
    "wrongPrefix": module.local_admin_bff_upstream_path(
        "/api/administrator/games",
        local_supabase=True,
    ),
    "forwarded": forwarded,
    "localSigned": local_signed,
    "remoteUnsigned": remote_unsigned,
    "unsafe": unsafe,
    "remoteSignatureError": remote_signature_error,
    "remoteLocalServerError": remote_local_server_error,
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
    `local Admin BFF gateway probe failed:\n${result.stderr || result.stdout}`,
  );
  return JSON.parse(result.stdout);
}

function probeHandlerDispatch() {
  const program = String.raw`
import base64
import http.client
import importlib.util
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

path = sys.argv[1]
spec = importlib.util.spec_from_file_location("econovaria_admin_gateway_dispatch", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

publishable_key = "sb_publishable_admin_gateway_dispatch_contract"
game_id = "11111111-1111-4111-8111-111111111111"
captured = []

class UpstreamHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        captured.append({
            "path": self.path,
            "headers": dict(self.headers.items()),
        })
        payload = b'{"ok":true}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args):
        return

class QuietGatewayHandler(module.EconovariaGatewayHandler):
    def log_message(self, *_args):
        return

def request(server, target):
    iv = base64.urlsafe_b64encode(bytes(range(12))).decode("ascii").rstrip("=")
    ciphertext = base64.urlsafe_b64encode(bytes(range(17, 81))).decode("ascii").rstrip("=")
    envelope = f"v1.{iv}.{ciphertext}"
    connection = http.client.HTTPConnection(
        "127.0.0.1",
        server.server_address[1],
        timeout=5,
    )
    connection.request("GET", target, headers={
        "apikey": publishable_key,
        "Authorization": "Bearer browser-forgery",
        "Cookie": (
            f"econovaria_admin_session={envelope}; "
            f"econovaria_player_session={envelope}; analytics=discard"
        ),
        "x-econovaria-bff-mode": "browser-forgery",
        "x-econovaria-bff-signature": "v1=browser-forgery",
    })
    response = connection.getresponse()
    body = response.read().decode("utf-8")
    connection.close()
    return {"status": response.status, "body": body}

upstream = ThreadingHTTPServer(("127.0.0.1", 0), UpstreamHandler)
upstream_thread = threading.Thread(target=upstream.serve_forever, daemon=True)
upstream_thread.start()

local_gateway = module.EconovariaGatewayServer(
    ("127.0.0.1", 0),
    QuietGatewayHandler,
    upstream_url=f"http://127.0.0.1:{upstream.server_address[1]}",
    publishable_key=publishable_key,
    request_timeout=30,
    local_supabase=True,
)
local_thread = threading.Thread(target=local_gateway.serve_forever, daemon=True)
local_thread.start()

remote_gateway = module.EconovariaGatewayServer(
    ("127.0.0.1", 0),
    QuietGatewayHandler,
    upstream_url=f"http://127.0.0.1:{upstream.server_address[1]}",
    publishable_key=publishable_key,
    request_timeout=30,
    local_supabase=False,
)
remote_thread = threading.Thread(target=remote_gateway.serve_forever, daemon=True)
remote_thread.start()

try:
    successful = request(
        local_gateway,
        f"/api/admin/games/{game_id}/join-code/reset?path=discard&trace=1",
    )
    traversal = request(local_gateway, "/api/admin/%252e%252e/secrets")
    remote = request(
        remote_gateway,
        f"/api/admin/games/{game_id}/join-code/reset",
    )
finally:
    local_gateway.shutdown()
    remote_gateway.shutdown()
    upstream.shutdown()
    local_gateway.server_close()
    remote_gateway.server_close()
    upstream.server_close()

print(json.dumps({
    "successful": successful,
    "traversal": traversal,
    "remote": remote,
    "localOrigin": local_gateway.browser_origin,
    "captured": captured,
}))
`;
  const result = spawnSync("python3", ["-c", program, gatewayPath], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(
    result.status,
    0,
    `local Admin BFF handler probe failed:\n${result.stderr || result.stdout}`,
  );
  return JSON.parse(result.stdout);
}

test("hosted-style Admin join-code reads map exactly into the local web-session BFF", () => {
  const result = probeLocalAdminBff();
  assert.equal(
    result.mapped,
    "/functions/v1/web-session-api/proxy/games/11111111-1111-4111-8111-111111111111/join-code/reset?limit=2&trace=1",
  );
  assert.equal(result.wrongPrefix, null);
});

test("local Admin BFF forwards only the publishable key and Admin HttpOnly session", () => {
  const result = probeLocalAdminBff();
  assert.equal(result.forwarded.apikey, "sb_publishable_admin_gateway_contract");
  assert.equal(result.forwarded.Origin, "http://127.0.0.1:4173");
  assert.equal(
    result.forwarded.Cookie,
    `econovaria_admin_session=${result.envelope}`,
  );
  assert.equal(result.forwarded.Authorization, undefined);
  assert.equal(result.forwarded["x-player-session-token"], undefined);
  assert.equal(result.forwarded["x-econovaria-bff-mode"], undefined);
  assert.equal(result.forwarded["x-econovaria-bff-signature"], undefined);
  assert.equal(result.forwarded["x-forwarded-for"], undefined);
});

test("Admin BFF local signatures are added only for explicit local mode", () => {
  const result = probeLocalAdminBff();
  assert.equal(result.localSigned["x-econovaria-bff-mode"], "local");
  assert.equal(result.localSigned["x-econovaria-bff-timestamp"], "1785362400");
  assert.equal(
    result.localSigned["x-econovaria-bff-nonce"],
    "123e4567-e89b-42d3-a456-426614174000",
  );
  assert.equal(result.localSigned["x-econovaria-bff-client-ip"], "127.0.0.1");
  assert.match(
    result.localSigned["x-econovaria-bff-signature"],
    /^v1=[A-Za-z0-9_-]{43}$/u,
  );
  assert.equal(result.remoteUnsigned["x-econovaria-bff-mode"], undefined);
  assert.equal(result.remoteUnsigned["x-econovaria-bff-signature"], undefined);
  assert.equal(result.remoteSignatureError, "ValueError");
  assert.equal(result.remoteLocalServerError, "ValueError");

  const normalized = Object.fromEntries(
    Object.entries(result.localSigned).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const signedContext = [
    "content-type",
    "cookie",
    "x-econovaria-csrf-token",
    "x-econovaria-device-id",
    "x-econovaria-game-id",
    "x-idempotency-key",
    "x-request-id",
  ].map((name) => `${name}:${normalized[name] || ""}`).join("\n");
  const sha256 = (value) => createHash("sha256").update(value).digest("hex");
  const canonical = [
    "econovaria-admin-bff-request-v1",
    "timestamp:1785362400",
    "nonce:123e4567-e89b-42d3-a456-426614174000",
    "method:GET",
    "target-origin:http://kong:8000",
    `path:${result.mapped}`,
    "browser-origin:http://127.0.0.1:4173",
    "client-ip:127.0.0.1",
    `context-sha256:${sha256(signedContext)}`,
    `body-sha256:${sha256(Buffer.alloc(0))}`,
  ].join("\n");
  const signingKey = createHmac(
    "sha256",
    "econovaria-local-admin-bff-public-development-material-v1",
  ).update("econovaria-admin-bff-signing-key-v1").digest();
  const expectedSignature = createHmac("sha256", signingKey)
    .update(canonical)
    .digest("base64url");
  assert.equal(
    result.localSigned["x-econovaria-bff-signature"],
    `v1=${expectedSignature}`,
  );
});

test("Admin BFF mapping rejects traversal, ambiguous segments, oversize, and remote use", () => {
  const result = probeLocalAdminBff();
  assert.deepEqual(result.unsafe, {
    rawTraversal: "ValueError",
    encodedTraversal: "ValueError",
    doubleEncodedTraversal: "ValueError",
    encodedBackslash: "ValueError",
    emptySegment: "ValueError",
    oversized: "ValueError",
    remote: "PermissionError",
  });
});

test("gateway handler dispatches the exact local Admin route and fails closed otherwise", () => {
  const result = probeHandlerDispatch();
  assert.equal(result.successful.status, 200);
  assert.equal(result.traversal.status, 400);
  assert.match(result.traversal.body, /invalid_admin_bff_path/u);
  assert.equal(result.remote.status, 403);
  assert.match(result.remote.body, /local_admin_bff_disabled/u);
  assert.equal(result.captured.length, 1);
  assert.equal(
    result.captured[0].path,
    "/functions/v1/web-session-api/proxy/games/11111111-1111-4111-8111-111111111111/join-code/reset?trace=1",
  );
  const headers = Object.fromEntries(
    Object.entries(result.captured[0].headers).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ]),
  );
  assert.equal(headers.apikey, "sb_publishable_admin_gateway_dispatch_contract");
  assert.equal(headers.origin, result.localOrigin);
  assert.equal(headers.authorization, undefined);
  assert.equal(headers["x-econovaria-bff-mode"], "local");
  assert.equal(headers["x-econovaria-bff-client-ip"], "127.0.0.1");
  assert.match(headers["x-econovaria-bff-signature"], /^v1=[A-Za-z0-9_-]{43}$/u);
  assert.match(headers.cookie, /^econovaria_admin_session=v1\./u);
  assert.doesNotMatch(headers.cookie, /player|analytics/u);
});

test("gateway compatibility entrypoint loads canonical code without rewriting source", () => {
  const source = readFileSync(gatewayPath, "utf8");
  assert.doesNotMatch(source, /read_text|\.replace\(|exec\(compile/u);
  assert.match(source, /spec_from_file_location/u);
  assert.match(source, /econovaria-local-gateway-core\.py/u);
});
