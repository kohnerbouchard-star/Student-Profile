import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

const secret = "PRIVATE_SQL_AND_OBJECT_KEY_SENTINEL";
const source = readFileSync(new URL("../backend/supabase/functions/game-data-purger/index.ts", import.meta.url), "utf8");
// Only replace the three external imports; execute the actual served handler.
const imports = [...source.matchAll(/^import \{[\s\S]*?^\} from "[^"]+";$/gm)];
assert.equal(imports.length, 3);
const executable = stripTypeScriptTypes(source.replace(/^import \{[\s\S]*?^\} from "[^"]+";$/gm, ""));

function fixture({ authorized = true, claimError = false, failureRecordThrows = false, failureRecordError = false } = {}) {
  let handler;
  const calls = [];
  const logs = [];
  const client = { async rpc(name, args) {
    calls.push({ name, args });
    if (name === "verify_runtime_scheduler_token_v1") return { data: authorized };
    if (name === "claim_confirmed_game_data_purge_v1") return claimError
      ? { error: { message: secret } }
      : { data: [{ request_id: "request", game_session_id: "game", stage: "db" }] };
    if (name === "get_game_data_purge_preflight_v1") return { error: { message: secret } };
    if (name === "record_game_data_purge_failure_v1") {
      if (failureRecordThrows) throw new Error(secret);
      return failureRecordError ? { error: { message: secret } } : {};
    }
    throw new Error(`unexpected RPC: ${name}`);
  } };
  vm.runInNewContext(executable, {
    Deno: { env: { get: () => "fixture-config" }, serve: (callback) => { handler = callback; } },
    createClient: () => client,
    resolvePurgeRuntimeBinding: () => ({ environmentName: "staging", r2BucketName: "fixture" }),
    assertPurgeRuntimeBinding: () => {},
    console: { error: (...args) => logs.push(args) },
    crypto: webcrypto, TextEncoder, Response, Uint8Array,
  });
  return { calls, logs, request: (token = "a".repeat(64)) => handler(new Request("https://fixture.invalid", {
    method: "POST", headers: { "x-econovaria-purge-scheduler-token": token },
  })) };
}

for (const token of ["", "invalid", "a".repeat(64)]) {
  test(`unauthorized scheduler cannot reach claim or failure diagnostics (${token.length})`, async () => {
    const f = fixture({ authorized: false });
    const response = await f.request(token);
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { ok: false, error: "unauthorized" });
    assert.ok(f.calls.every(({ name }) => name === "verify_runtime_scheduler_token_v1"));
    assert.deepEqual(f.logs, []);
  });
}

test("claim errors cannot disclose database messages", async () => {
  const f = fixture({ claimError: true });
  const response = await f.request();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { ok: false, error: "claim_failed" });
  assert.equal(JSON.stringify(f.logs).includes(secret), false);
});

for (const options of [{}, { failureRecordThrows: true }, { failureRecordError: true }]) {
  test(`stage and failure-record diagnostics are sanitized: ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const response = await f.request();
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { ok: false, error: "purge_stage_failed" });
    const record = f.calls.find(({ name }) => name === "record_game_data_purge_failure_v1");
    assert.equal(record.args.p_error, "purge_stage_failed");
    assert.equal(record.args.p_request_id, "request");
    assert.equal(JSON.stringify({ calls: f.calls, logs: f.logs }).includes(secret), false);
    assert.ok(f.logs.some(([code]) => code === "game_data_purge_failed"));
  });
}
