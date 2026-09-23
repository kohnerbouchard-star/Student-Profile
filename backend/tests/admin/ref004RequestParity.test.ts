import { deepStrictEqual as equal, ok } from "node:assert/strict";

// Capture the real entrypoint; never bind a port, read real credentials, or use network I/O.
const runtime = (globalThis as any).Deno;
const G = "22222222-2222-4222-8222-222222222222";
const S = "11111111-1111-4111-8111-111111111111";
const C = "33333333-3333-4333-8333-333333333333";
const P = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-09-23T00:00:00.000Z";
const fixtureEnv: Record<string, string> = {
  SUPABASE_URL: "https://ref004.invalid", SUPABASE_ANON_KEY: "fixture-anon",
  SUPABASE_SERVICE_ROLE_KEY: "fixture-service", ECONOVARIA_TRUSTED_CLIENT_IP_HEADER: "x-real-ip",
  ECONOVARIA_RATE_LIMIT_HMAC_SECRET: "abcdefghijklmnopqrstuvwxyz_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789",
};
let handle: (request: Request) => Promise<Response>;
const originalServe = runtime.serve, originalGet = runtime.env.get;
try {
  runtime.env.get = (name: string) => fixtureEnv[name];
  runtime.serve = (callback: typeof handle) => { handle = callback; return {}; };
  await import("../../supabase/functions/admin-api/index.ts");
} finally { runtime.serve = originalServe; runtime.env.get = originalGet; }
ok(handle!, "The real Admin entrypoint must register its handler");
type Call = { path: string; method: string; headers: Headers; body: any; query: URLSearchParams };
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", ...headers },
});
const suffixes = {
  progress: `/contracts/${C}/progress`, decision: `/contract-submissions/${P}/decision`,
  submission: `/contracts/${C}/submissions/${P}/review`, review: `/contracts/${C}/progress/${P}/review`,
  reward: `/contracts/${C}/progress/${P}/rewards/issue`, reset: `/players/${P}/access-code/reset`,
};
async function fixture(options: any, run: (send: any, calls: Call[]) => Promise<void>) {
  const calls: Call[] = []; const savedFetch = globalThis.fetch, savedGet = runtime.env.get;
  const upstream = options.upstream ?? { ok: true, progress: [], contract: { contractId: C } };
  const staff = { id: S, supabase_auth_user_id: S, email: "fixture@example.invalid", display_name: "Fixture",
    status: "active", role: "game_admin", permission_version: 1, security_version: 1, mfa_required: true, ...options.staff };
  const token = ["fixture", btoa(JSON.stringify({ aal: options.aal ?? "aal2" })), "fixture"].join(".");
  runtime.env.get = (name: string) => fixtureEnv[name];
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init), url = new URL(request.url);
    equal(url.origin, "https://ref004.invalid", "Unexpected outbound origin");
    const raw = await request.text();
    const call = { path: url.pathname, method: request.method, headers: request.headers,
      body: raw ? JSON.parse(raw) : null, query: url.searchParams }; calls.push(call);
    if (call.path === "/auth/v1/user") return options.expired
      ? json({ message: "synthetic expired/revoked session" }, 401)
      : json({ id: S, app_metadata: { econovaria_role: "game_admin", permission_version: 1, security_version: options.stale ? 2 : 1 } });
    if (call.path === "/rest/v1/staff_users") return options.securityError && call.query.has("id")
      ? json({ message: "synthetic unavailable" }, 503) : json([staff]);
    if (call.path === "/rest/v1/game_sessions") return json(options.noGame ? [] : [{ id: G, name: "Fixture", status: "active" }]);
    if (call.path === "/rest/v1/staff_permission_grants") return json((options.grants ?? ["contracts.manage", "players.manage", "game.update"]).map((permission: string) => ({ permission })));
    if (call.path.endsWith("/consume_request_rate_limits_v1")) return options.limiterError
      ? json({ message: "synthetic limiter unavailable" }, 503)
      : json([{ allowed: !options.limited, retry_after_seconds: options.limited ? 45 : 0,
        limiting_dimension: options.limited ? "ip" : null, limit_count: 100, remaining_count: 50, reset_at: NOW }]);
    if (call.path.startsWith("/functions/v1/classroom-api/")) return json(upstream, options.upstreamStatus ?? 202, { "x-upstream-only": "not-forwarded", "retry-after": "19" });
    if (call.path.endsWith("/issue_contract_rewards_atomic_v1")) {
      if (options.rewardError) return json({ message: options.rewardError }, 400);
      const count = calls.filter((c) => c.path.endsWith("/issue_contract_rewards_atomic_v1")).length;
      return json([{ reward_issued: count === 1, already_issued: count > 1, issued_at: NOW, reward_result: { cash: { amount: 12.34, currencyCode: "NRC" } } }]);
    }
    if (call.path === "/rest/v1/player_contract_progress" || call.path === "/rest/v1/game_session_contracts") {
      equal(call.method, "GET", "No direct economic table mutation is permitted");
      equal(call.query.get("game_session_id"), `eq.${G}`);
      if (call.query.get("select") === "id,contract_id") return json(options.noProgress ? [] : [{ id: P, contract_id: C }]);
      equal(call.query.get("id"), `eq.${call.path.endsWith("player_contract_progress") ? P : C}`);
      if (call.path.endsWith("player_contract_progress")) equal(call.query.get("contract_id"), `eq.${C}`);
      return json([]);
    }
    throw new Error(`Unexpected persistence or transport: ${call.method} ${call.path}`);
  };
  const send = async (suffix: string, method = "POST", body: unknown = {}, extra: Record<string, string> = {}) => {
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json", "x-real-ip": "192.0.2.10",
      "x-request-id": "ref004-request", "idempotency-key": "ref004-retry", ...extra };
    return handle(new Request(`https://admin.invalid/functions/v1/admin-api/games/${options.urlGame ?? G}${suffix}`, {
      method, headers, ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(body) }),
    }));
  };
  try { await run(send, calls); } finally { globalThis.fetch = savedFetch; runtime.env.get = savedGet; }
}
const forwarded = (calls: Call[]) => calls.filter((c) => c.path.startsWith("/functions/v1/"));
const writes = (calls: Call[]) => calls.filter((c) => c.method !== "GET" && !c.path.endsWith("/consume_request_rate_limits_v1"));
function transportHeaders(response: Response) {
  equal(response.headers.get("cache-control"), "no-store"); equal(response.headers.get("vary"), "Origin");
  equal(response.headers.get("x-upstream-only"), null); equal(response.headers.get("retry-after"), null);
}
for (const [name, suffix] of Object.entries(suffixes)) {
  for (const [reason, options, status, code] of [
    ["expired/revoked", { expired: true }, 401, "auth_failed"],
    ["stale claims", { stale: true }, 403, "staff_claims_outdated"],
    ["wrong role", { staff: { role: "security_operator" } }, 403, "staff_account_inactive"],
    ["missing permission", { grants: [] }, 403, "staff_permission_denied"],
    ["wrong owned game", { noGame: true }, 404, "game_not_found"],
    ["wrong URL game", { urlGame: OTHER }, 404, "game_not_found"],
    ["security unavailable", { securityError: true }, 503, "staff_security_state_unavailable"],
    ["rate limit unavailable", { limiterError: true }, 503, "admin_rate_limit_unavailable"],
  ] as const) runtime.test(`REF004 root ${name}: ${reason} stops before adapter effects`, () => fixture(options, async (send, calls) => {
    const response = await send(suffix, name === "progress" ? "GET" : "POST");
    equal(response.status, status); const body = await response.json(); equal(body.code, code);
    equal(Object.keys(body).sort(), ["code", "message"]); equal(writes(calls), []); equal(forwarded(calls), []);
    const securityReads = calls.filter((c) => c.path.endsWith("staff_permission_grants"));
    if (["expired/revoked", "stale claims", "wrong role", "security unavailable"].includes(reason)) equal(securityReads, []);
    if (["missing permission", "stale claims", "wrong role"].includes(reason)) equal(calls.filter((c) => c.path.includes("/rpc/")), []);
  }));
}
runtime.test("REF004 root rate denial retains retry headers and has no adapter effect", () => fixture({ limited: true }, async (send, calls) => {
  const response = await send(suffixes.reward); equal(response.status, 429);
  equal(response.headers.get("retry-after"), "45"); equal(response.headers.get("x-ratelimit-reset"), NOW);
  equal(response.headers.get("cache-control"), "private, no-store, max-age=0"); equal(response.headers.get("x-content-type-options"), "nosniff");
  equal(writes(calls), []);
}));
runtime.test("REF004 progress preserves the current query-drop and filtered response headers", () => fixture({}, async (send, calls) => {
  const response = await send(`${suffixes.progress}?status=submitted&playerId=${OTHER}`, "GET");
  equal(response.status, 202); equal(await response.json(), { ok: true, progress: [], contract: { contractId: C } }); transportHeaders(response);
  const [call] = forwarded(calls); equal(forwarded(calls).length, 1); equal(call.method, "GET"); equal(call.body, null);
  equal(call.path, `/functions/v1/classroom-api/staff/game-sessions/${G}/contracts/${C}/progress`); equal(call.query.toString(), "");
  equal(call.headers.get("x-request-id"), "ref004-request"); equal(call.headers.get("idempotency-key"), "ref004-retry");
}));
for (const name of ["submission", "review"] as const) for (const method of name === "submission" ? ["POST", "PATCH"] : ["POST"]) {
  runtime.test(`REF004 ${name} ${method}: normalized review never automatically rewards`, () => fixture({ grants: ["contracts.manage"] }, async (send, calls) => {
    const response = await send(suffixes[name], method, { payload: { decision: "accepted", feedback: "Keep this feedback", resultPayload: { score: 7 } } });
    equal(response.status, 202); equal(await response.json(), { ok: true, progress: [], contract: { contractId: C } }); transportHeaders(response);
    equal(writes(calls).length, 1); const [call] = forwarded(calls); equal(call.method, "POST");
    equal(call.path, `/functions/v1/classroom-api/staff/game-sessions/${G}/contracts/${C}/progress/${P}/review`);
    equal(call.body, { action: "approve", resultPayload: { score: 7, feedback: "Keep this feedback" } });
  }));
}
for (const method of ["POST", "PATCH"]) runtime.test(`REF004 decision ${method}: game.update review then single atomic reward`, () => fixture({ grants: ["game.update"] }, async (send, calls) => {
  const response = await send(suffixes.decision, method, { payload: { decision: "approved" } }); equal(response.status, 200);
  const body = await response.json(); equal(Object.keys(body).sort(), ["data", "review", "reward"]); equal(body.data.rewardIssued, true);
  equal(writes(calls).map((c) => c.path), [`/functions/v1/classroom-api/staff/game-sessions/${G}/contracts/${C}/progress/${P}/review`, "/rest/v1/rpc/issue_contract_rewards_atomic_v1"]);
  equal(writes(calls)[1].body, { p_game_session_id: G, p_contract_id: C, p_progress_id: P, p_staff_user_id: S, p_request_id: "ref004-request" });
}));
for (const [options, status, code] of [[{ noProgress: true }, 404, "contract_submission_not_found"], [{ upstreamStatus: 409, upstream: { error: { code: "contract_reward_already_issued" } } }, 409, "contract_reward_already_issued"]] as const) {
  runtime.test(`REF004 decision: ${code} cannot issue rewards`, () => fixture(options, async (send, calls) => {
    const response = await send(suffixes.decision, "POST", { decision: "approve" }); equal(response.status, status);
    const body = await response.json(); equal(body.code ?? body.error.code, code);
    equal(calls.filter((c) => c.path.endsWith("issue_contract_rewards_atomic_v1")), []);
  }));
}
runtime.test("REF004 reward: one authoritative call per attempt, receipt flags and body authority preserved", () => fixture({}, async (send, calls) => {
  for (const attempt of [0, 1]) {
    const response = await send(suffixes.reward, "POST", { gameId: OTHER, staffUserId: OTHER, reward: { amount: 999999 + attempt } });
    equal(response.status, 200); equal(await response.json(), { ok: true, rewardIssued: attempt === 0, alreadyIssued: attempt === 1,
      issuedAt: NOW, contract: null, progress: null, rewardResult: { cash: { amount: 12.34, currencyCode: "NRC" } } });
    transportHeaders(response);
  }
  equal(forwarded(calls), []); equal(writes(calls).length, 2);
  for (const call of writes(calls)) equal(call.body, { p_game_session_id: G, p_contract_id: C, p_progress_id: P, p_staff_user_id: S, p_request_id: "ref004-request" });
}));
for (const [error, status, code] of [["CONTRACT_PROGRESS_NOT_FOUND", 404, "contract_progress_not_found"], ["CONTRACT_PROGRESS_NOT_COMPLETED", 409, "contract_progress_not_completed"], ["OUT_OF_STOCK", 409, "contract_reward_item_out_of_stock"], ["database unavailable", 400, "contract_reward_issue_failed"]] as const) {
  runtime.test(`REF004 reward RPC rejection: ${error}`, () => fixture({ rewardError: error }, async (send, calls) => {
    const response = await send(suffixes.reward); equal(response.status, status);
    equal(await response.json(), { error: { code, message: error, retryable: false } }); equal(writes(calls).length, 1); equal(forwarded(calls), []);
  }));
}
runtime.test("REF004 legacy approval retains partial-success boundary on reward failure", () => fixture({ rewardError: "OUT_OF_STOCK" }, async (send, calls) => {
  const response = await send(suffixes.decision, "POST", { decision: "approve" }); equal(response.status, 409);
  equal((await response.json()).error.code, "contract_reward_item_out_of_stock"); equal(writes(calls).length, 2); equal(forwarded(calls).length, 1);
}));
runtime.test("REF004 reset forwards one POST with unchanged credential aliases and retry identity", () => fixture({ upstream: { ok: true, sessionsRevoked: true }, upstreamStatus: 200 }, async (send, calls) => {
  const body = { payload: { rfidCardId: "RFID-04", pin: "AC-004" } };
  const response = await send(suffixes.reset, "POST", body); equal(response.status, 200); equal(await response.json(), { ok: true, sessionsRevoked: true });
  equal(writes(calls).length, 1); const [call] = forwarded(calls); equal(call.path, `/functions/v1/classroom-api/games/${G}/players/${P}/access-code/reset`);
  equal(call.body, body); equal(call.headers.get("x-request-id"), "ref004-request"); equal(call.headers.get("idempotency-key"), "ref004-retry");
}));
for (const [suffix, method] of [[suffixes.progress, "POST"], [suffixes.review, "PATCH"], [suffixes.reward, "DELETE"], [suffixes.reset, "GET"]]) {
  runtime.test(`REF004 unsupported ${method} ${suffix}: current 501, not invented 405`, () => fixture({}, async (send, calls) => {
    const response = await send(suffix, method); equal(response.status, 501);
    equal(await response.json(), { code: "admin_route_not_implemented", message: "This administrator operation is not connected yet.", path: `/games/${G}${suffix}` });
    equal(writes(calls), []); equal(forwarded(calls), []);
  }));
}
