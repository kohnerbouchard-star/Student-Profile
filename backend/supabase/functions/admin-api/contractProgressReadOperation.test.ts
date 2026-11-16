import { deepStrictEqual as equal, ok, rejects } from "node:assert/strict";
import { handleContractProgressReadOperation } from "./contractProgressReadOperation.ts";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { handleGameRead } from "./gameRoutes.ts";
import { corsHeaders } from "./common.ts";
import { requiredAdminPermission } from "./adminSecurityGuard.ts";
import { handleStaffContractRequest } from "../../../src/domains/contracts/api/staffContractHttpHandler.ts";
import type { StaffContractHttpHandlerDependencies } from "../../../src/domains/contracts/api/staffContractHttpHandler.ts";
import type { ContractRepository } from "../../../src/domains/contracts/contracts/contractRepositoryContracts.ts";
import type { EdgeSupabaseClient } from "../../../src/platform/supabase/edgeStaffSession.ts";
import { normalizedStaffAction } from "../../../src/security/staffRequestRateLimit.ts";
import type { StaffRequestRateLimitInput } from "../../../src/security/staffRequestRateLimit.ts";

const G = "22222222-2222-4222-8222-222222222222";
const S = "11111111-1111-4111-8111-111111111111";
const C = "33333333-3333-4333-8333-333333333333";
const P = "44444444-4444-4444-8444-444444444444";
const U = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-09-23T00:00:00.000Z";
const PATH = `/staff/game-sessions/${G}/contracts/${C}/progress`;
const ENV = { supabaseUrl: "https://ref007.invalid", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture" };
const contractDto = { contractId: C, gameSessionId: G, contractKey: "ref007-contract", title: "Fixture",
  status: "active", sourceType: "teacher", visibility: "public", completionMode: "manual_review", deadlineAt: null, expiresAt: null };
const progressDto = { progressId: P, gameSessionId: G, contractId: C, playerId: U, status: "submitted",
  evidencePayload: { answer: "synthetic" }, resultPayload: {}, submittedAt: NOW, completedAt: null,
  rewardIssuedAt: null, createdAt: NOW, updatedAt: NOW };

type Options = { noContract?: boolean; empty?: boolean; wrongGame?: boolean; gameError?: boolean;
  repositoryError?: boolean; limiter?: "deny" | "unavailable"; noEnv?: boolean };
function authority(): AdminRequestApplicationContext {
  return createAdminRequestApplicationContext({ ownedGame: { id: G }, staffUserId: S,
    security: { ok: true, assuranceLevel: "aal1", permissions: ["contracts.manage"], requiredPermission: "contracts.manage" },
    requestId: "ref007-request" });
}
function request(query = "", contractId = C, method = "GET") {
  return new Request(`https://ref007.invalid/functions/v1/admin-api/games/${G}/contracts/${contractId}/progress${query}`, {
    method, headers: { origin: "https://ref007.invalid", "x-forwarded-for": "198.51.100.99",
      "x-econovaria-game-id": U, "x-player-id": U, "x-staff-id": U },
  });
}
function fixture(options: Options = {}) {
  const events: string[] = [];
  const reads: Array<[string, unknown]> = [];
  const limits: unknown[] = [];
  const service = { from(table: string) {
    equal(table, "game_sessions");
    const filters: Record<string, unknown> = {};
    const query = { select(columns: string) { equal(columns, "id,name,status,owner_staff_user_id"); return query; },
      eq(key: string, value: unknown) { filters[key] = value; return query; },
      maybeSingle() { events.push("ownership"); equal(filters, { id: G, owner_staff_user_id: S });
        return Promise.resolve({ data: options.wrongGame ? null : { id: G, name: "Fixture", status: "active" },
          error: options.gameError ? { message: "private synthetic lookup failure" } : null }); } };
    return query;
  }, rpc() { throw new Error("No domain mutation or economic RPC belongs in progress reads"); } } as unknown as EdgeSupabaseClient;
  const repository = {
    getGameSessionContractById(input: unknown) {
      events.push("contract"); reads.push(["contract", input]); equal(input, { gameSessionId: G, contractId: C });
      if (options.repositoryError) throw new Error("private synthetic database failure");
      return Promise.resolve(options.noContract ? null : { ...contractDto, id: C, privateFixtureField: "must not escape" });
    },
    listContractProgressForStaff(input: unknown) { events.push("progress"); reads.push(["progress", input]);
      return Promise.resolve(options.empty ? [] : [{ ...progressDto, id: P, privateFixtureField: "must not escape" }]); },
  } as unknown as ContractRepository;
  const readEnvironment = () => options.noEnv ? { ok: false as const } : { ok: true as const, value: ENV };
  const consumeRateLimit = (input: StaffRequestRateLimitInput, receivedService: EdgeSupabaseClient) => {
    equal(receivedService === service, true);
    events.push("limit");
    limits.push({ action: input.action, profile: input.profile, gameId: input.gameId, staffUserId: input.staffUserId,
      path: new URL(input.request.url).pathname, query: new URL(input.request.url).search,
      ip: input.request.headers.get("x-real-ip"), forwarding: input.request.headers.get("x-forwarded-for") });
    if (options.limiter === "unavailable") throw new Error("private synthetic limiter failure");
    return Promise.resolve({ allowed: options.limiter !== "deny", retryAfterSeconds: 2, resetAt: NOW,
      limitingDimension: options.limiter === "deny" ? "action" as const : null, limit: 120, remaining: 1 });
  };
  const dependencies = { readEnvironment,
    projectTrustedClientIp: () => ({ header: "x-real-ip" as const, value: "192.0.2.1" }),
    consumeRateLimit, createRepository: (receivedService: EdgeSupabaseClient) => { equal(receivedService === service, true); return repository; } };
  const downstreamDependencies: StaffContractHttpHandlerDependencies = {
    readSupabaseEnv: readEnvironment, createRepository: dependencies.createRepository,
    resolveStaffForRequest: async (downstreamRequest) => {
      try {
        const decision = await consumeRateLimit({ request: downstreamRequest,
          action: normalizedStaffAction("GET", new URL(downstreamRequest.url).pathname),
          gameId: S, staffUserId: S, profile: "read" }, service);
        if (!decision.allowed) return { ok: false, status: 429,
          error: { code: "staff_rate_limit_exceeded", message: "Too many staff requests. Try again later.", retryable: true } };
      } catch {
        return { ok: false, status: 503,
          error: { code: "staff_rate_limit_unavailable", message: "Staff request protection is unavailable.", retryable: true } };
      }
      return { ok: true, staff: { id: S }, serviceClient: service };
    },
  };
  return { service, events, reads, limits, dependencies,
    local: (incoming = request(), context = authority(), contractId = C, gameSessionId = G) =>
      handleContractProgressReadOperation(incoming, service, { applicationContext: context, gameSessionId, contractId }, dependencies),
    downstream: () => handleStaffContractRequest(new Request(`${ENV.supabaseUrl}/functions/v1/classroom-api${PATH}`,
      { headers: { "x-real-ip": "192.0.2.1" } }),
      { kind: "progress", gameSessionId: G, contractId: C }, downstreamDependencies),
    directStaff: (query: string) => handleStaffContractRequest(new Request(`${ENV.supabaseUrl}/functions/v1/staff-api${PATH}${query}`,
      { headers: { "x-real-ip": "192.0.2.1" } }),
      { kind: "progress", gameSessionId: G, contractId: C }, downstreamDependencies),
  };
}
async function outerSnapshot(response: Response, incoming: Request) {
  return { status: response.status, body: await response.json(), headers: {
    ...corsHeaders(incoming), "Content-Type": response.headers.get("content-type") || "application/json", "Cache-Control": "no-store",
  } };
}

for (const [name, options, expectedStatus] of [
  ["valid owner", {}, 200], ["empty progress", { empty: true }, 200],
  ["missing contract", { noContract: true }, 404], ["wrong game", { wrongGame: true }, 404],
  ["game lookup failure", { gameError: true }, 500], ["repository failure", { repositoryError: true }, 500],
  ["Staff limiter denial", { limiter: "deny" }, 429], ["Staff limiter unavailable", { limiter: "unavailable" }, 503],
  ["missing environment", { noEnv: true }, 500],
] as const) {
  Deno.test(`REF-007 progress ${name}: same downstream result, reads and order without an HTTP hop`, async () => {
    const before = fixture(options), after = fixture(options), incoming = request("?status=not-a-status&playerId=not-a-player");
    const oldResponse = await before.downstream(), newResponse = await after.local(incoming);
    const expected = await outerSnapshot(oldResponse, incoming);
    equal(newResponse.status, expectedStatus); equal(newResponse.status, expected.status);
    const body = await newResponse.json(); equal(body, expected.body);
    equal(Object.fromEntries(newResponse.headers), Object.fromEntries(new Headers(expected.headers)));
    equal(after.reads, before.reads); equal(after.events, before.events); equal(after.limits, before.limits);
    ok(!JSON.stringify(body).includes("privateFixtureField")); ok(!JSON.stringify(body).includes("private synthetic"));
    equal(newResponse.headers.get("retry-after"), null);
    if (expectedStatus === 200) equal(body, { ok: true, contract: contractDto, progress: ((options as Options).empty ? [] : [progressDto]) });
  });
}
Deno.test("REF-007 preserves query omission, Staff throttle dimensions and two ordered domain reads", async () => {
  const f = fixture(); equal((await f.local(request(`?status=failed&playerId=${U}`))).status, 200);
  equal(f.events, ["limit", "ownership", "contract", "progress"]);
  equal(f.reads, [["contract", { gameSessionId: G, contractId: C }],
    ["progress", { gameSessionId: G, contractId: C, statuses: undefined, playerId: null }]]);
  equal(f.limits, [{ action: "staff.api.read.unknown", profile: "read", gameId: S, staffUserId: S,
    path: `/functions/v1/classroom-api${PATH}`, query: "", ip: "192.0.2.1", forwarding: null }]);
  equal(normalizedStaffAction("GET", `/classroom-api${PATH}`), "staff.api.read.unknown");
});
Deno.test("REF-007 direct Staff filters are unchanged", async () => {
  const f = fixture(); equal((await f.directStaff(`?status=submitted,completed&playerId=${U}`)).status, 200);
  equal(f.reads[1], ["progress", { gameSessionId: G, contractId: C, statuses: ["submitted", "completed"], playerId: U }]);
});
Deno.test("REF-007 direct Staff still rejects malformed filters after reading the contract", async () => {
  const f = fixture(), response = await f.directStaff("?status=invalid");
  equal(response.status, 400); equal((await response.json()).error.code, "invalid_contract_progress_status_filter");
  equal(f.events, ["limit", "ownership", "contract"]);
});
for (const changes of [{ role: "player" }, { actor: { kind: "player", staffUserId: U } },
  { permissions: [] }, { requiredPermission: "game.read" }]) {
  Deno.test(`REF-007 denies unapproved context ${JSON.stringify(changes)} before service access`, async () => {
    const f = fixture(), context = { ...authority(), ...changes } as unknown as AdminRequestApplicationContext;
    equal((await f.local(request(), context)).status, 403); equal(f.events, []); equal(f.reads, []);
  });
}
Deno.test("REF-007 rejects a route/context game mismatch before any service access", async () => {
  const f = fixture(); equal((await f.local(request(), authority(), C, U)).status, 403); equal(f.events, []);
});
Deno.test("REF-007 malformed contract identifier keeps the previous unhandled-route response", async () => {
  const f = fixture(), response = await f.local(request("", "invalid"), authority(), "invalid");
  equal(response.status, 404); equal(await response.json(), { ok: false,
    error: { code: "route_not_found", message: "Classroom API route was not found.", retryable: false } });
  equal(f.events, []);
});
Deno.test("REF-007 unsupported method does not query or consume a Staff limit", async () => {
  const f = fixture(), response = await f.local(request("", C, "POST"));
  equal(response.status, 405); equal((await response.json()).error.code, "method_not_allowed"); equal(f.events, []);
});
Deno.test("REF-007 real Admin route is local and keeps method, identifier and permission gates", async () => {
  const f = fixture(), incoming = request(), context = { service: f.service, staff: { id: S } };
  const suffix = `/contracts/${C}/progress`;
  equal(requiredAdminPermission("GET", `/games/${G}${suffix}`), "contracts.manage");
  // This registered suite grants neither environment access nor network access.
  const response = await handleGameRead(incoming, context, new URL(incoming.url), { id: G }, G, suffix, authority());
  ok(response); equal(response.status, 500); equal((await response.json()).error.code, "missing_edge_runtime_config");
  equal(f.events, []);
  const wrongMethod = request("", C, "POST");
  equal(await handleGameRead(wrongMethod, context, new URL(wrongMethod.url), { id: G }, G, suffix, authority()), null);
  await rejects(() => handleGameRead(incoming, context, new URL(incoming.url), { id: G }, G, "/contracts/%zz/progress", authority()), URIError);
});
