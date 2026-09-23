import { deepStrictEqual as equal, ok } from "node:assert/strict";
import { handleResetPlayerAccessCodeRequest } from "../../../src/domains/players/api/playerAccessCodeResetHttpHandler.ts";
const G = "22222222-2222-4222-8222-222222222222", S = "11111111-1111-4111-8111-111111111111";
const P = "44444444-4444-4444-8444-444444444444", OTHER = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-09-23T00:00:00.000Z", VERSION = "pbkdf2-sha256-v2" as const;
type Options = { noEnv?: boolean; auth?: string; noGame?: boolean; playerId?: string; inactive?: boolean;
  playerError?: boolean; rpcError?: { code?: string; message: string }; materialError?: boolean };
type Call = { table: string; filters: Record<string, unknown>; update?: Record<string, unknown> };
async function fixture(options: Options, run: (f: any) => Promise<void>) {
  const runtime = (globalThis as any).Deno, savedGet = runtime.env.get, savedFetch = globalThis.fetch;
  const queries: Call[] = [], rpcs: Array<{ name: string; args: unknown }> = [], materials: string[] = [], events: string[] = [];
  const env: Record<string, string> = { SUPABASE_URL: "https://ref004.invalid", SUPABASE_ANON_KEY: "fixture", SUPABASE_SERVICE_ROLE_KEY: "fixture" };
  runtime.env.get = (key: string) => { events.push(`env:${key}`); return options.noEnv ? undefined : env[key]; };
  globalThis.fetch = () => { throw new Error("Credential fixture must not use network"); };
  const service = { from(table: string) {
    const call: Call = { table, filters: {} }; queries.push(call); events.push(table);
    const q = { select() { return q; }, eq(key: string, value: unknown) { call.filters[key] = value; return q; },
      update(value: Record<string, unknown>) { equal(table, "players"); call.update = value; return q; },
      maybeSingle() {
        if (table === "game_sessions") { equal(call.filters, { id: G, owner_staff_user_id: S });
          return Promise.resolve({ data: options.noGame ? null : { id: G, name: "Fixture", status: "active", owner_staff_user_id: S }, error: null }); }
        equal(table, "players"); equal(call.filters, { game_session_id: G, id: options.playerId ?? P });
        return Promise.resolve({ data: options.playerId === OTHER ? null : { id: P, display_name: "Fixture Player", roster_label: null,
          player_identifier: "RFID-OLD", status: options.inactive ? "archived" : "active" }, error: options.playerError ? { message: "private failure" } : null });
      } }; return q;
  }, rpc(name: string, args: unknown) { rpcs.push({ name, args }); return Promise.resolve({
    data: [{ credential_created_at: NOW }], error: options.rpcError ?? null }); } };
  const send = (body: unknown = {}, method = "POST") => handleResetPlayerAccessCodeRequest(new Request("https://ref004.invalid/reset", {
    method, headers: { "content-type": "application/json", "x-request-id": "same-request", "idempotency-key": "same-key" },
    ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(body) }),
  }), G, options.playerId ?? P, {
    resolveStaffForRequest() { events.push("auth"); return Promise.resolve(options.auth ? { ok: false as const, status: 401,
      error: { code: options.auth, message: "Synthetic auth denial", retryable: false } } :
      { ok: true as const, staff: { id: S, email: null }, serviceClient: service as never }); },
    createCredentialMaterial(code: string) { materials.push(code); if (options.materialError) throw new Error("private hashing failure");
      return Promise.resolve({ credentialVersion: VERSION, lookupDigest: `digest-${code}`, salt: "synthetic-salt", verifier: "synthetic-verifier", iterations: 600000 }); },
  });
  try { await run({ send, queries, rpcs, materials, events }); } finally { runtime.env.get = savedGet; globalThis.fetch = savedFetch; }
}
async function error(response: Response, status: number, code: string) {
  equal(response.status, status); const body = await response.json(); equal(Object.keys(body).sort(), ["error", "ok"]);
  equal(body.ok, false); equal(Object.keys(body.error).sort(), ["code", "message", "retryable"]);
  equal(body.error.code, code); equal(body.error.retryable, false); ok(!JSON.stringify(body).includes("private"));
  equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
}
const expected = (active = true) => ({ ok: true, player: { displayName: "Fixture Player", rosterLabel: null, playerIdentifier: "rfid-04", status: "active" },
  accessCode: { studentCode: active ? "AC-004" : null, status: active ? "active" : "unchanged", createdAt: active ? NOW : null, credentialVersion: active ? VERSION : null }, sessionsRevoked: active });
const rpcArgs = (code = "AC-004") => ({ p_game_session_id: G, p_player_id: P, p_player_identifier: "rfid-04", p_player_identifier_normalized: "RFID-04",
  p_lookup_digest: `digest-${code}`, p_credential_version: VERSION, p_credential_salt: "synthetic-salt", p_credential_verifier: "synthetic-verifier", p_credential_iterations: 600000 });
for (const method of ["GET", "PATCH", "DELETE"]) Deno.test(`REF004 credential method ${method} before env/auth`, () => fixture({}, async (f) => {
  await error(await f.send({}, method), 405, "method_not_allowed"); equal(f.events, []); equal(f.queries, []); equal(f.rpcs, []);
}));
for (const [options, status, code, reads] of [
  [{ noEnv: true }, 500, "missing_edge_runtime_config", 0], [{ auth: "expired_session" }, 401, "expired_session", 0],
  [{ auth: "revoked_session" }, 401, "revoked_session", 0], [{ noGame: true }, 404, "game_session_not_found", 1],
  [{ playerId: OTHER }, 404, "player_not_found", 2], [{ inactive: true }, 409, "player_not_active", 2],
  [{ playerError: true }, 500, "player_identity_update_failed", 2],
] as const) Deno.test(`REF004 credential denied ${code}: no material or write`, () => fixture(options, async (f) => {
  await error(await f.send({ accessCode: "AC-004" }), status, code); equal(f.queries.length, reads); equal(f.rpcs, []); equal(f.materials, []);
  equal(f.queries.filter((q: Call) => q.update), []);
}));
for (const identifier of ["playerIdentifier", "playerId", "rfidCardId", "rfidId", "cardId", "externalPlayerId"]) {
  for (const credential of ["accessCode", "studentCode", "playerAccessCode", "pin"]) Deno.test(`REF004 credential aliases ${identifier}/${credential}`, () => fixture({}, async (f) => {
    const response = await f.send({ payload: { [identifier]: " rfid-04 ", [credential]: " ac -004 " } });
    equal(response.status, 200); equal(await response.json(), expected()); equal(f.materials, ["AC-004"]);
    equal(f.rpcs, [{ name: "set_player_identity_and_access_credential_v2", args: rpcArgs() }]); equal(f.queries.filter((q: Call) => q.update), []);
    equal(f.events.filter((event: string) => !event.startsWith("env:")), ["auth", "game_sessions", "players"]);
    equal(response.headers.get("vary"), "authorization"); equal(response.headers.get("pragma"), "no-cache");
  }));
}
for (const [body, status, code] of [[[], 400, "invalid_request_body"], [{ gameId: OTHER }, 400, "unknown_request_field"],
  [{ payload: [] }, 400, "invalid_request_payload"], [{ payload: { staffId: OTHER } }, 400, "unknown_request_field"],
  [{ accessCode: "@" }, 400, "invalid_student_code"], [{ playerIdentifier: "@" }, 400, "invalid_player_identifier"],
  [{ accessCode: "A".repeat(129) }, 400, "player_access_code_too_long"], [{ accessCode: "A".repeat(4100) }, 413, "request_body_too_large"]] as const) {
  Deno.test(`REF004 credential input ${code}: no write`, () => fixture({}, async (f) => {
    await error(await f.send(body), status, code); equal(f.rpcs, []); equal(f.materials, []); equal(f.queries.filter((q: Call) => q.update), []);
  }));
}
for (const [rpcError, status, code] of [[{ code: "23505", message: "private detail" }, 409, "player_identifier_conflict"],
  [{ message: "PLAYER_ACCESS_CODE_CONFLICT" }, 409, "player_access_code_conflict"], [{ message: "PLAYER_NOT_FOUND" }, 404, "player_not_found"],
  [{ message: "private database failure" }, 500, "player_identity_update_failed"]] as const) {
  Deno.test(`REF004 credential RPC ${code}: one attempted authority and redacted error`, () => fixture({ rpcError }, async (f) => {
    await error(await f.send({ playerIdentifier: "rfid-04", accessCode: "AC-004" }), status, code); equal(f.rpcs.length, 1);
    equal(f.rpcs[0], { name: "set_player_identity_and_access_credential_v2", args: rpcArgs() });
  }));
}
Deno.test("REF004 credential material failure precedes RPC", () => fixture({ materialError: true }, async (f) => {
  await error(await f.send({ accessCode: "AC-004" }), 500, "player_identity_update_failed"); equal(f.rpcs, []);
}));
Deno.test("REF004 identifier-only update is scoped and does not revoke sessions", () => fixture({}, async (f) => {
  const before = Date.now(), response = await f.send({ playerIdentifier: " rfid-04 " });
  equal(response.status, 200); equal(await response.json(), expected(false)); equal(f.rpcs, []); equal(f.materials, []);
  const writes = f.queries.filter((q: Call) => q.update); equal(writes.length, 1); equal(writes[0].filters, { game_session_id: G, id: P });
  equal(Object.keys(writes[0].update).sort(), ["player_identifier", "player_identifier_normalized", "updated_at"]);
  equal(writes[0].update.player_identifier, "rfid-04"); equal(writes[0].update.player_identifier_normalized, "RFID-04");
  const time = Date.parse(writes[0].update.updated_at); ok(time >= before && time <= Date.now());
}));
Deno.test("REF004 credential retry has no RPC idempotency parameter or invented conflict", () => fixture({}, async (f) => {
  for (const accessCode of ["AC-004", "AC-005"]) equal((await f.send({ playerIdentifier: "rfid-04", accessCode })).status, 200);
  equal(f.rpcs, ["AC-004", "AC-005"].map((code) => ({ name: "set_player_identity_and_access_credential_v2", args: rpcArgs(code) })));
}));
