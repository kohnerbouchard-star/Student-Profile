import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runInNewContext } from "node:vm";

const root = new URL("../", import.meta.url);
const cwd = fileURLToPath(root);
const game = "11111111-1111-4111-8111-111111111111";
const gatewayPath = "scripts/econovaria-local-gateway.py";
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("the recommended local launcher opts in while connected staging cannot", () => {
  const { scripts } = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
  assert.match(scripts["dev:local"], /econovaria-local-gateway\.py --local-supabase --admin-v2-entry --open$/);
  assert.doesNotMatch(scripts["dev:staging"], /--admin-v2-entry/);
  const refused = spawnSync("python3", [gatewayPath, "--admin-v2-entry"], { cwd, encoding: "utf8" });
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /--admin-v2-entry requires --local-supabase/);
});

test("the same local HTTP ingress serves the V2 shell after selection and direct navigation", () => {
  let destination;
  const runtime = {
    document: { baseURI: "http://127.0.0.1/" },
    location: { href: "http://127.0.0.1/?mode=admin", assign: (url) => { destination = new URL(url); } },
  };
  for (const file of ["admin-game-selection.js", "login-game-selection.js"]) {
    runInNewContext(readFileSync(new URL(`frontend/src/core/${file}`, root), "utf8"), { URL, window: runtime });
  }
  runtime.createLoginGameSelection({ runtime }).openAdminTerminal(game);
  assert.equal(destination.pathname, "/admin/");
  assert.equal(destination.searchParams.get("game"), game);
  const selectedPath = destination.pathname + destination.search;
  const probe = spawnSync("python3", ["-c", String.raw`
import hashlib
import http.client
import json
import runpy
import sys
import threading

gateway = runpy.run_path(sys.argv[1])
def probe(opt_in, upstream, routes):
    server = gateway["EconovariaGatewayServer"](
        ("127.0.0.1", 0), gateway["EconovariaGatewayHandler"],
        upstream_url=upstream, publishable_key="sb_publishable_fixture",
        request_timeout=30, admin_v2_entry=opt_in)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        results = []
        for method, path in routes:
            connection = http.client.HTTPConnection(*server.server_address, timeout=3)
            try:
                connection.request(method, path, headers={"If-Modified-Since": "Wed, 21 Oct 2099 07:28:00 GMT"})
                response = connection.getresponse()
                results.append(dict(status=response.status, digest=hashlib.sha256(response.read()).hexdigest(),
                    cache=response.getheader("Cache-Control"), location=response.getheader("Location")))
            finally:
                connection.close()
        return results
    finally:
        server.shutdown()
        server.server_close()
        thread.join()

game_path = sys.argv[2]
print(json.dumps({
    "local": probe(True, "http://127.0.0.1:54321", [
        ("GET", game_path), ("GET", "/admin/index.html?game=fixture"),
        ("GET", "/admin/v2.html"), ("GET", "/admin?game=fixture"),
        ("HEAD", game_path), ("POST", game_path), ("GET", "/player-terminal/"),
    ]),
    "staging": probe(False, "https://stagingfixture000001.supabase.co", [
        ("GET", game_path), ("GET", "/admin/index.html"),
    ]),
    "localWithoutOptIn": probe(False, "http://127.0.0.1:54321", [("GET", game_path)]),
}))
`, gatewayPath, selectedPath], { cwd, encoding: "utf8", timeout: 8000 });
  assert.equal(probe.status, 0, probe.stderr);
  const { local, staging, localWithoutOptIn } = JSON.parse(probe.stdout);
  assert.deepEqual(local.slice(0, 5).map((result) => result.status), [200, 200, 200, 301, 200]);
  assert.equal(local[0].digest, digest(readFileSync(new URL("admin/v2.html", root))));
  assert.equal(local[0].digest, local[2].digest);
  assert.equal(local[1].digest, local[2].digest);
  assert.match(local[0].cache, /no-store/);
  assert.equal(local[3].location, "/admin/?game=fixture");
  assert.equal(local[4].digest, digest(""));
  assert.equal(local[5].status, 405);
  assert.equal(local[6].status, 200);
  assert.deepEqual(staging.map((result) => result.status), [200, 200]);
  assert.equal(staging[0].digest, staging[1].digest);
  assert.equal(staging[0].digest, digest(readFileSync(new URL("admin/index.html", root))));
  assert.notEqual(staging[0].digest, local[0].digest);
  assert.deepEqual(localWithoutOptIn, [staging[0]]);
});
