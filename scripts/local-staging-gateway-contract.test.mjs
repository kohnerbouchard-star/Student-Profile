import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gatewayPath = path.join(repositoryRoot, "scripts", "local-staging-gateway.py");

function probeGateway() {
  const program = String.raw`
import importlib.util
import json
import sys

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

print(json.dumps({
    "functions": module.is_proxy_path("/functions/v1/classroom-api/players/login"),
    "auth": module.is_proxy_path("/auth/v1/token?grant_type=password"),
    "rest": module.is_proxy_path("/rest/v1/players"),
    "storage": module.is_proxy_path("/storage/v1/object/public/example"),
    "config": config,
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
