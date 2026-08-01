import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const functions = ["player-api", "player-web-session-api"];

for (const functionName of functions) {
  test(`${functionName} binds gateway client IP before loading its runtime`, async () => {
    const root = `backend/supabase/functions/${functionName}`;
    const entrypoint = await readFile(`${root}/index.ts`, "utf8");
    const runtime = await readFile(`${root}/runtime.ts`, "utf8");

    const binder = entrypoint.indexOf("bindGatewayTrustedClientIp(");
    const runtimeImport = entrypoint.indexOf('await import("./runtime.ts")');

    assert.ok(binder >= 0, "entrypoint must bind the reviewed gateway client IP");
    assert.ok(runtimeImport > binder, "runtime must load only after trusted-IP binding is installed");
    assert.match(entrypoint, /ECONOVARIA_TRUSTED_CLIENT_IP_HEADER/u);
    assert.match(runtime, /Deno\.serve\(/u);
    assert.doesNotMatch(runtime, /raw\.githubusercontent\.com/u);
  });
}

test("Player web-session installs bounded read resilience before loading runtime", async () => {
  const entrypoint = await readFile(
    "backend/supabase/functions/player-web-session-api/index.ts",
    "utf8",
  );
  const helper = await readFile(
    "backend/supabase/functions/_shared/playerApiReadResilience.ts",
    "utf8",
  );

  const importIndex = entrypoint.indexOf("createPlayerApiReadResilientFetch");
  const installIndex = entrypoint.indexOf("resilientPlayerApiFetch as typeof globalThis.fetch");
  const runtimeImport = entrypoint.indexOf('await import("./runtime.ts")');

  assert.ok(importIndex >= 0, "Player BFF must import the reviewed retry helper");
  assert.ok(installIndex > importIndex, "Player BFF must install the reviewed retry helper");
  assert.ok(runtimeImport > installIndex, "Player runtime must load after resilient fetch installation");
  assert.match(entrypoint, /player_api_read_retry/u);
  assert.match(helper, /\["GET", "HEAD"\]/u);
  assert.match(helper, /new Set\(\[502, 503, 504\]\)/u);
  assert.match(helper, /DEFAULT_MAX_ATTEMPTS = 3/u);
  assert.match(helper, /crypto\.getRandomValues/u);
  assert.doesNotMatch(helper, /Math\.random/u);
}
