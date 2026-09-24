import { deepStrictEqual as equal, ok, rejects } from "node:assert/strict";
import {
  executePreparedAdminContractReview,
  prepareAdminContractReview,
} from "./contractReviewOperation.ts";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import type { AdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { SupabaseContractReviewReadRepository } from "../../../src/domains/contracts/infrastructure/contractReviewReadRepository.ts";
import type { EdgeSupabaseClient } from "../../../src/platform/supabase/edgeStaffSession.ts";

const G = "22222222-2222-4222-8222-222222222222";
const S = "11111111-1111-4111-8111-111111111111";
const C = "33333333-3333-4333-8333-333333333333";
const P = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";
const NOW = "2026-09-24T00:00:00.000Z";
const paths = {
  decision: `/contract-submissions/${P}/decision`,
  submission: `/contracts/${C}/submissions/${P}/review`,
  progress: `/contracts/${C}/progress/${P}/review`,
};
const variants = [
  ["decision", "POST"], ["decision", "PATCH"],
  ["submission", "POST"], ["submission", "PATCH"], ["progress", "POST"],
] as const;
function authority(alias: keyof typeof paths) {
  const permission = alias === "decision" ? "game.update" : "contracts.manage";
  return createAdminRequestApplicationContext({ ownedGame: { id: G }, staffUserId: S,
    security: { ok: true, assuranceLevel: "aal2", permissions: [permission], requiredPermission: permission },
    requestId: "context-request-not-a-transport-override" });
}
function incoming(alias: keyof typeof paths, method: string, body: unknown = { decision: "approve" }) {
  return new Request(`https://ref008.invalid/functions/v1/admin-api/games/${G}${paths[alias]}?ignored=1`, {
    method, headers: { "content-type": "application/json", "x-request-id": "request-8", "idempotency-key": "retry-8" },
    ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(body) }),
  });
}
function fixture(options: { missing?: boolean; failure?: boolean } = {}) {
  const reads: unknown[] = [];
  const repository = { async findSubmissionIdentity(input: unknown) {
    reads.push(input);
    if (options.failure) throw new Error("synthetic identity read failed");
    return options.missing ? null : { contractId: C, progressId: P };
  } };
  const prepare = (request: Request, alias: keyof typeof paths, context = authority(alias), suffix = paths[alias]) =>
    prepareAdminContractReview(request, G, suffix, context, repository, { createRequestId: () => "generated-8" });
  return { reads, repository, prepare };
}
for (const [alias, method] of variants) for (const [action, normalized] of [
  ["accepted", "approve"], ["failed", "reject"], ["changes_requested", "request_revision"],
]) Deno.test(`REF-008 prepare ${alias} ${method} ${action}: one command, no mutation`, async () => {
  const f = fixture(), source = { payload: { decision: action, feedback: "Keep this",
    resultPayload: { score: 7 }, staffUserId: OTHER, gameSessionId: OTHER } };
  const request = incoming(alias, method, source), prepared = await f.prepare(request, alias);
  if (prepared.kind !== "command") throw new Error("Expected prepared command");
  const command = prepared.command;
  equal(command.alias, alias); equal(command.method, "POST");
  equal([command.gameSessionId, command.staffUserId, command.contractId, command.progressId], [G, S, C, P]);
  equal(command.normalizedBody, { action: normalized, resultPayload: { score: 7, feedback: "Keep this" } });
  equal(command.identity, { requestId: "request-8", idempotencyKey: "retry-8" });
  equal(command.issueRewardAfterApproval, alias === "decision" && normalized === "approve");
  equal(command.reviewPath, `/staff/game-sessions/${G}/contracts/${C}/progress/${P}/review`);
  equal(command.originalRequest === request, true); equal(await request.json(), source);
  equal(f.reads, alias === "decision" ? [{ gameSessionId: G, submissionId: P }] : []);
});
for (const [alias, method] of [
  ["decision", "GET"], ["decision", "DELETE"], ["submission", "GET"],
  ["submission", "DELETE"], ["progress", "PATCH"], ["progress", "HEAD"],
] as const) Deno.test(`REF-008 prepare ${alias} ${method}: remains unhandled`, async () => {
  const f = fixture(); equal(await f.prepare(incoming(alias, method), alias), { kind: "unhandled" }); equal(f.reads, []);
});
Deno.test("REF-008 unrelated write paths remain unhandled before decoding or reads", async () => {
  const f = fixture(); equal(await f.prepare(incoming("decision", "POST"), "decision", authority("decision"), "/settings"), { kind: "unhandled" }); equal(f.reads, []);
});
for (const change of [
  { role: "player" }, { actor: { kind: "player", staffUserId: S } }, { actor: { kind: "staff", staffUserId: "" } },
  { gameSessionId: OTHER }, { permissions: [] }, { requiredPermission: "contracts.manage" },
]) Deno.test(`REF-008 prepare denies unapproved decision context ${JSON.stringify(change)}`, async () => {
  const f = fixture(), context = { ...authority("decision"), ...change } as unknown as AdminRequestApplicationContext;
  const result = await f.prepare(incoming("decision", "POST"), "decision", context);
  if (result.kind !== "response") throw new Error("Expected context denial");
  equal(result.response.status, 403); equal((await result.response.json()).code, "staff_permission_denied"); equal(f.reads, []);
});
Deno.test("REF-008 explicit review cannot substitute game.update for contracts.manage", async () => {
  const f = fixture(), result = await f.prepare(incoming("submission", "POST"), "submission", authority("decision"));
  if (result.kind !== "response") throw new Error("Expected permission denial");
  equal(result.response.status, 403); equal(f.reads, []);
});
Deno.test("REF-008 missing submission preserves the flat 404 before preparation", async () => {
  const f = fixture({ missing: true }), result = await f.prepare(incoming("decision", "POST"), "decision");
  if (result.kind !== "response") throw new Error("Expected missing submission");
  equal(result.response.status, 404); equal(await result.response.json(), {
    code: "contract_submission_not_found", message: "Contract submission was not found.",
  }); equal(result.response.headers.get("cache-control"), "no-store");
  equal(f.reads, [{ gameSessionId: G, submissionId: P }]);
});
Deno.test("REF-008 identity repository failure retains the caller error boundary", async () => {
  const f = fixture({ failure: true }); await rejects(() => f.prepare(incoming("decision", "POST"), "decision"), /synthetic identity read failed/);
  equal(f.reads.length, 1);
});
Deno.test("REF-008 malformed percent encoding is not silently reinterpreted", async () => {
  const f = fixture(); await rejects(() => f.prepare(incoming("decision", "POST"), "decision", authority("decision"), "/contract-submissions/%zz/decision"), URIError);
  equal(f.reads, []);
});
Deno.test("REF-008 invalid explicit identifier cannot become an executable command", async () => {
  const f = fixture(), result = await f.prepare(incoming("progress", "POST"), "progress", authority("progress"), `/contracts/invalid/progress/${P}/review`);
  if (result.kind !== "response") throw new Error("Expected invalid route");
  equal(result.response.status, 404); equal((await result.response.json()).error.code, "route_not_found"); equal(f.reads, []);
});
for (const [body, expected] of [
  [{ review: { action: "reject" }, payload: { action: "approve" } }, "reject"],
  [{ payload: { status: "revision", note: "Note", result: { score: 2 } } }, "request_revision"],
  [{ review: [], payload: { action: "approve" } }, ""],
] as const) Deno.test(`REF-008 retains normalizer precedence ${JSON.stringify(body)}`, async () => {
  const f = fixture(), result = await f.prepare(incoming("submission", "POST", body), "submission");
  if (result.kind !== "command") throw new Error("Expected command"); equal(result.command.normalizedBody.action, expected);
  if (expected === "request_revision") equal(result.command.normalizedBody.resultPayload, { score: 2, feedback: "Note" });
});
for (const [dropRequest, dropPrimary, dropAlternate, expectedRequest, expectedKey] of [
  [false, false, false, "request-8", "retry-8"], [true, false, false, "retry-8", "retry-8"],
  [true, true, false, "alternate-8", "alternate-8"], [true, true, true, "generated-8", null],
] as const) Deno.test(`REF-008 transport identity precedence ${expectedRequest}`, async () => {
  const request = incoming("submission", "POST"); request.headers.set("x-idempotency-key", "alternate-8");
  if (dropRequest) request.headers.delete("x-request-id"); if (dropPrimary) request.headers.delete("idempotency-key");
  if (dropAlternate) request.headers.delete("x-idempotency-key");
  const result = await fixture().prepare(request, "submission");
  if (result.kind !== "command") throw new Error("Expected command");
  equal(result.command.identity, { requestId: expectedRequest, idempotencyKey: expectedKey });
});
Deno.test("REF-008 preparation adds no replay cache or payload hashing", async () => {
  const f = fixture(), actions: unknown[] = [];
  for (const action of ["approve", "approve", "reject"]) {
    const result = await f.prepare(incoming("progress", "POST", { action }), "progress");
    if (result.kind !== "command") throw new Error("Expected independent command");
    equal(result.command.identity.idempotencyKey, "retry-8"); actions.push(result.command.normalizedBody.action);
  }
  equal(actions, ["approve", "approve", "reject"]); equal(f.reads, []);
});
for (const mode of ["found", "missing", "failure"] as const) Deno.test(`REF-008 actual identity repository ${mode}: exact game and submission predicates`, async () => {
  const calls: unknown[] = [], failure = { message: "synthetic query error" };
  const client = { from(table: string) {
    calls.push(["from", table]); const query = {
      select(columns: string) { calls.push(["select", columns]); return query; },
      eq(column: string, value: unknown) { calls.push(["eq", column, value]); return query; },
      maybeSingle() { calls.push(["maybeSingle"]); return Promise.resolve({
        data: mode === "found" ? { id: P, contract_id: C } : null, error: mode === "failure" ? failure : null,
      }); },
    }; return query;
  } } as unknown as EdgeSupabaseClient;
  const repository = new SupabaseContractReviewReadRepository(client);
  const run = () => repository.findSubmissionIdentity({ gameSessionId: G, submissionId: P });
  if (mode === "failure") await rejects(run, (error) => error === failure);
  else equal(await run(), mode === "found" ? { contractId: C, progressId: P } : null);
  equal(calls, [["from", "player_contract_progress"], ["select", "id,contract_id"],
    ["eq", "game_session_id", G], ["eq", "id", P], ["maybeSingle"]]);
  ok(!calls.some((entry: any) => ["update", "insert", "rpc", "delete"].includes(entry[0])));
});


async function preparedCommand(alias: keyof typeof paths, action = "approve") {
  return await fixture().prepare(incoming(alias, "POST", { action }), alias);
}

Deno.test("REF-008 local execution preserves Staff limiter tuple, fresh ownership and one review", async () => {
  const prepared = await preparedCommand("submission");
  if (prepared.kind !== "command") throw new Error("Expected command");
  const events: string[] = [], limits: any[] = [];
  const response = await executePreparedAdminContractReview({} as EdgeSupabaseClient, prepared.command, {
    readEnvironment: () => ({ ok: true as const, value: {
      supabaseUrl: "https://ref008.invalid", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture",
    } }),
    projectTrustedClientIp: () => ({ header: "x-real-ip" as const, value: "192.0.2.8" }),
    consumeRateLimit: async (input) => {
      events.push("limit");
      limits.push({
        action: input.action, profile: input.profile, gameId: input.gameId, staffUserId: input.staffUserId,
        path: new URL(input.request.url).pathname, ip: input.request.headers.get("x-real-ip"),
      });
      return { allowed: true, retryAfterSeconds: 0, resetAt: NOW, limitingDimension: null, limit: 100, remaining: 99 };
    },
    readOwnedGame: async () => {
      events.push("ownership");
      return { ok: true as const, gameSession: { id: G, name: "Fixture", status: "active" } };
    },
    executeReview: async (_service, input) => {
      events.push("review");
      equal(await input.request.json(), { action: "approve", resultPayload: {} });
      equal(input.reviewedAt, NOW);
      return new Response(JSON.stringify({ ok: true, contract: { contractId: C },
        progress: { progressId: P, status: "completed" } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
    issueRewards: async () => { throw new Error("Explicit aliases must never auto-reward"); },
    now: () => NOW,
  });
  equal(response.status, 200);
  equal(events, ["limit", "ownership", "review"]);
  equal(limits, [{
    action: "staff.api.write.unknown", profile: "sensitive", gameId: S, staffUserId: S,
    path: `/functions/v1/internal-contract-review/staff/game-sessions/${G}/contracts/${C}/progress/${P}/review`,
    ip: "192.0.2.8",
  }]);
  equal(response.headers.get("cache-control"), "no-store");
  equal(response.headers.get("vary"), "Origin");
});

for (const [mode, status, code] of [
  ["limit", 429, "staff_rate_limit_exceeded"],
  ["limit-error", 503, "staff_rate_limit_unavailable"],
  ["ownership", 404, "game_session_not_found"],
] as const) {
  Deno.test(`REF-008 local execution fail-closed ${mode}`, async () => {
    const prepared = await preparedCommand("progress");
    if (prepared.kind !== "command") throw new Error("Expected command");
    let reviews = 0;
    const response = await executePreparedAdminContractReview({} as EdgeSupabaseClient, prepared.command, {
      readEnvironment: () => ({ ok: true as const, value: {
        supabaseUrl: "https://ref008.invalid", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture",
      } }),
      projectTrustedClientIp: () => null,
      consumeRateLimit: async () => {
        if (mode === "limit-error") throw new Error("synthetic");
        return { allowed: mode !== "limit", retryAfterSeconds: 3, resetAt: NOW,
          limitingDimension: mode === "limit" ? "action" as const : null, limit: 100, remaining: 0 };
      },
      readOwnedGame: async () => mode === "ownership"
        ? { ok: false as const, status: 404, error: { code: "game_session_not_found",
          message: "Game session was not found for this staff user.", retryable: false } }
        : { ok: true as const, gameSession: { id: G, name: "Fixture", status: "active" } },
      executeReview: async () => { reviews += 1; return new Response("{}", { status: 200 }); },
    });
    equal(response.status, status);
    equal((await response.json()).error.code, code);
    equal(reviews, 0);
  });
}

Deno.test("REF-008 decision approval reviews once then invokes the existing atomic reward adapter once", async () => {
  const prepared = await preparedCommand("decision", "approve");
  if (prepared.kind !== "command") throw new Error("Expected command");
  const calls: string[] = [];
  const response = await executePreparedAdminContractReview({} as EdgeSupabaseClient, prepared.command, {
    readEnvironment: () => ({ ok: true as const, value: {
      supabaseUrl: "https://ref008.invalid", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture",
    } }),
    projectTrustedClientIp: () => null,
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0, resetAt: NOW,
      limitingDimension: null, limit: 100, remaining: 99 }),
    readOwnedGame: async () => ({ ok: true as const, gameSession: { id: G, name: "Fixture", status: "active" } }),
    executeReview: async () => {
      calls.push("review");
      return new Response(JSON.stringify({ ok: true, contract: { contractId: C },
        progress: { progressId: P, status: "completed" } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
    issueRewards: async (_service, input) => {
      calls.push("reward");
      equal(input, { gameSessionId: G, contractId: C, progressId: P, staffUserId: S, requestId: "request-8" });
      return { ok: true as const, status: 200, body: {
        ok: true, rewardIssued: true, alreadyIssued: false,
        progress: { progressId: P, status: "completed" }, rewardResult: { cash: 12 },
      } };
    },
    now: () => NOW,
  });
  equal(calls, ["review", "reward"]);
  equal(response.status, 200);
  equal((await response.json()).data, {
    reviewed: true, rewardIssued: true, alreadyIssued: false,
    progress: { progressId: P, status: "completed" }, rewardResult: { cash: 12 },
  });
});

Deno.test("REF-008 decision keeps the existing partial-success boundary when reward issuance fails", async () => {
  const prepared = await preparedCommand("decision", "approve");
  if (prepared.kind !== "command") throw new Error("Expected command");
  let reviews = 0, rewards = 0;
  const response = await executePreparedAdminContractReview({} as EdgeSupabaseClient, prepared.command, {
    readEnvironment: () => ({ ok: true as const, value: {
      supabaseUrl: "https://ref008.invalid", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture",
    } }),
    projectTrustedClientIp: () => null,
    consumeRateLimit: async () => ({ allowed: true, retryAfterSeconds: 0, resetAt: NOW,
      limitingDimension: null, limit: 100, remaining: 99 }),
    readOwnedGame: async () => ({ ok: true as const, gameSession: { id: G, name: "Fixture", status: "active" } }),
    executeReview: async () => {
      reviews += 1;
      return new Response(JSON.stringify({ ok: true, progress: { progressId: P } }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
    issueRewards: async () => {
      rewards += 1;
      return { ok: false as const, status: 409,
        error: { code: "contract_reward_item_out_of_stock", message: "OUT_OF_STOCK", retryable: false } };
    },
  });
  equal(response.status, 409);
  equal((await response.json()).error.code, "contract_reward_item_out_of_stock");
  equal([reviews, rewards], [1, 1]);
});
