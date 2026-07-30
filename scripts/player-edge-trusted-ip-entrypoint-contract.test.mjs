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
