import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gatewayPath = path.join(repositoryRoot, "scripts", "econovaria-local-gateway.py");

function probePlayerSessionGateway() {
  const program = String.raw`
import base64
import importlib.util
import json
import sys
from email.message import Message

path = sys.argv[1]
spec = importlib.util.spec_from_file_location("econovaria_player_gateway", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

publishable_key = "sb_publishable_player_gateway_contract"
iv = base64.urlsafe_b64encode(bytes(range(12))).decode("ascii").rstrip("=")
ciphertext = base64.urlsafe_b64encode(bytes(range(17, 81))).decode("ascii").rstrip("=")
envelope = f"v1.{iv}.{ciphertext}"

headers = Message()
headers["apikey"] = publishable_key
headers["Cookie"] = (
    f"econovaria_admin_session={envelope}; "
    f"econovaria_player_session={envelope}; analytics=discard"
)
headers["x-player-session-token"] = "must-not-pass"
forwarded = module.filtered_request_headers(
    headers,
    "127.0.0.1:54321",
    browser_publishable_key=publishable_key,
    request_path="/functions/v1/player-web-session-api/status",
    browser_origin="http://127.0.0.1:4173",
)
issued = module.normalized_session_response_cookie(
    f"__Host-econovaria_player_session={envelope}; Path=/; HttpOnly; Secure; SameSite=Strict"
)
cleared = module.normalized_session_response_cookie(
    "__Host-econovaria_player_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict"
)

print(json.dumps({
    "playerPath": module.is_player_web_session_path(
        "/functions/v1/player-web-session-api/status"
    ),
    "adminPath": module.is_admin_web_session_path(
        "/functions/v1/web-session-api/status"
    ),
    "forwarded": forwarded,
    "issued": issued,
    "cleared": cleared,
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
    `Player web-session gateway probe failed:\n${result.stderr || result.stdout}`,
  );
  return JSON.parse(result.stdout);
}

test("local gateway binds Player HttpOnly sessions to their exact loopback origin", () => {
  const result = probePlayerSessionGateway();
  assert.equal(result.playerPath, true);
  assert.equal(result.adminPath, true);
  assert.equal(result.forwarded.apikey, "sb_publishable_player_gateway_contract");
  assert.equal(result.forwarded.Origin, "http://127.0.0.1:4173");
  assert.equal(
    result.forwarded.Cookie,
    `econovaria_player_session=${result.envelope}`,
  );
  assert.equal(result.forwarded["x-player-session-token"], undefined);
  assert.equal(result.forwarded.Cookie.includes("admin"), false);
  assert.equal(result.forwarded.Cookie.includes("analytics"), false);
});

test("local gateway normalizes Player session issuance and clearing", () => {
  const result = probePlayerSessionGateway();
  assert.equal(
    result.issued,
    `econovaria_player_session=${result.envelope}; Path=/; Max-Age=14400; HttpOnly; SameSite=Strict`,
  );
  assert.equal(
    result.cleared,
    "econovaria_player_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict",
  );
});
