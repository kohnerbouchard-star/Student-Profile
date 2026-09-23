import { deepStrictEqual as equal, ok } from "node:assert/strict";
import { handleStaffContractRequest } from "../../../src/domains/contracts/api/staffContractHttpHandler.ts";
import type { StaffContractRoute } from "../../../src/domains/contracts/api/contractRoutePaths.ts";

const G = "22222222-2222-4222-8222-222222222222", S = "11111111-1111-4111-8111-111111111111";
const C = "33333333-3333-4333-8333-333333333333", P = "44444444-4444-4444-8444-444444444444";
const U = "55555555-5555-4555-8555-555555555555", NOW = "2026-09-23T00:00:00.000Z";
const contractDto = { contractId: C, gameSessionId: G, contractKey: "ref004-contract", title: "Fixture",
  status: "active", sourceType: "teacher", visibility: "public", completionMode: "manual_review", deadlineAt: null, expiresAt: null };
const progressDto = { progressId: P, gameSessionId: G, contractId: C, playerId: U, status: "submitted",
  evidencePayload: { answer: "synthetic" }, resultPayload: {}, submittedAt: NOW, completedAt: null,
  rewardIssuedAt: null, createdAt: NOW, updatedAt: NOW };
type Options = { noEnv?: boolean; auth?: string; owner?: string; gameError?: boolean; noContract?: boolean;
  noProgress?: boolean; rewarded?: boolean; repositoryError?: boolean };
function fixture(options: Options = {}) {
  const events: string[] = [], reads: Array<[string, unknown]> = [], writes: unknown[] = [];
  let progress = { ...progressDto, id: P, rewardIssuedAt: options.rewarded ? NOW : null };
  const service = { from(table: string) {
    events.push(`from:${table}`); equal(table, "game_sessions");
    const filters: Record<string, unknown> = {};
    const query = { select(columns: string) { equal(columns, "id,name,status,owner_staff_user_id"); return query; },
      eq(key: string, value: unknown) { filters[key] = value; return query; },
      maybeSingle() { events.push("ownership"); equal(filters, { id: G, owner_staff_user_id: S });
        return Promise.resolve({ data: options.owner === U ? null : { id: G, name: "Fixture", status: "active", owner_staff_user_id: S },
          error: options.gameError ? { message: "synthetic unavailable" } : null }); } };
    return query;
  }, rpc() { throw new Error("No economic RPC belongs in progress/review"); } };
  const repository = {
    getGameSessionContractById(input: unknown) { reads.push(["contract", input]); equal(input, { gameSessionId: G, contractId: C });
      if (options.repositoryError) throw new Error("synthetic private database failure");
      return Promise.resolve(options.noContract ? null : { ...contractDto, id: C, privateFixtureField: "must not escape" }); },
    getContractProgressById(input: unknown) { reads.push(["progress", input]); equal(input, { gameSessionId: G, contractId: C, progressId: P });
      return Promise.resolve(options.noProgress ? null : progress); },
    listContractProgressForStaff(input: unknown) { reads.push(["list", input]); return Promise.resolve([progress]); },
    reviewPlayerContractProgress(input: Record<string, unknown>) { writes.push(input);
      progress = { ...progress, ...input, completedAt: input.completedAt ?? progress.completedAt } as typeof progress;
      return Promise.resolve(progress); },
  };
  const dependencies = { readSupabaseEnv() { events.push("env"); return options.noEnv ? { ok: false as const } :
    { ok: true as const, value: { supabaseUrl: "https://ref004.invalid", supabaseAnonKey: "fixture", supabaseServiceRoleKey: "fixture" } }; },
    resolveStaffForRequest() { events.push("auth"); return Promise.resolve(options.auth ?
      { ok: false as const, status: 401, error: { code: options.auth, message: "Synthetic auth denial", retryable: false } } :
      { ok: true as const, staff: { id: S }, serviceClient: service as never }); },
    createRepository() { events.push("repository"); return repository as never; }, now: () => NOW };
  const send = (kind: "progress" | "review" | "issueRewards", method: string, body: unknown = {}, query = "") => {
    const route = { kind, gameSessionId: G, contractId: C, ...(kind === "progress" ? {} : { progressId: P }) } as StaffContractRoute;
    return handleStaffContractRequest(new Request(`https://ref004.invalid/staff/game-sessions/${G}/contracts/${C}/progress${query}`, {
      method, headers: { "content-type": "application/json", "idempotency-key": "same-key", "x-request-id": "same-request" },
      ...(["GET", "HEAD"].includes(method) ? {} : { body: JSON.stringify(body) }),
    }), route, dependencies);
  };
  return { send, events, reads, writes };
}
async function error(response: Response, status: number, code: string) {
  equal(response.status, status); const body = await response.json();
  equal(Object.keys(body).sort(), ["error", "ok"]); equal(body.ok, false);
  equal(Object.keys(body.error).sort(), ["code", "message", "retryable"]); equal(body.error.code, code);
  equal(body.error.retryable, false); ok(body.error.message.length > 0);
  equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  equal(response.headers.get("vary"), "Origin, Authorization, X-Player-Session-Token, X-Econovaria-Device-Id");
}
for (const [kind, method] of [["progress", "POST"], ["review", "PATCH"], ["issueRewards", "DELETE"]] as const) {
  Deno.test(`REF004 Contract ${kind}: method denial precedes environment and auth`, async () => {
    const f = fixture(); await error(await f.send(kind, method), 405, "method_not_allowed"); equal(f.events, []); equal(f.writes, []);
  });
}
for (const [options, status, code, expected] of [
  [{ noEnv: true }, 500, "missing_edge_runtime_config", ["env"]],
  [{ auth: "expired_staff_session" }, 401, "expired_staff_session", ["env", "auth"]],
  [{ auth: "revoked_staff_session" }, 401, "revoked_staff_session", ["env", "auth"]],
  [{ owner: U }, 404, "game_session_not_found", ["env", "auth", "from:game_sessions", "ownership"]],
  [{ gameError: true }, 500, "game_session_lookup_failed", ["env", "auth", "from:game_sessions", "ownership"]],
] as const) Deno.test(`REF004 Contract scope: ${code}`, async () => {
  const f = fixture(options); await error(await f.send("review", "POST", { action: "approve" }), status, code);
  equal(f.events, expected); equal(f.reads, []); equal(f.writes, []);
});
Deno.test("REF004 Contract progress: exact projection, filters, scope and read order", async () => {
  const f = fixture(), response = await f.send("progress", "GET", {}, `?status=submitted,completed&playerId=${U}`);
  equal(response.status, 200); equal(await response.json(), { ok: true, contract: contractDto, progress: [progressDto] });
  equal(f.events, ["env", "auth", "from:game_sessions", "ownership", "repository"]);
  equal(f.reads, [["contract", { gameSessionId: G, contractId: C }], ["list", { gameSessionId: G, contractId: C, statuses: ["submitted", "completed"], playerId: U }]]);
  equal(f.writes, []); equal(response.headers.get("vary"), "Origin");
});
for (const [action, status] of [["approve", "completed"], ["reject", "failed"], ["request_revision", "in_progress"]]) {
  Deno.test(`REF004 Contract review transition ${action}: one scoped review, no reward`, async () => {
    const f = fixture(), resultPayload = { score: 7, feedback: "Keep this" };
    const response = await f.send("review", "POST", { action, resultPayload }); equal(response.status, 200);
    equal(await response.json(), { ok: true, contract: contractDto, progress: { ...progressDto, status, resultPayload, completedAt: action === "approve" ? NOW : null } });
    equal(f.writes, [{ gameSessionId: G, contractId: C, progressId: P, status, resultPayload, completedAt: action === "approve" ? NOW : undefined }]);
  });
}
for (const [body, code] of [
  ...["staffId", "staffUserId", "reviewedByStaffId", "createdByStaffId"].map((key) => [{ action: "approve", [key]: U }, "staff_id_not_allowed"]),
  [{ action: "approve", issueRewardNow: true }, "issue_reward_now_not_supported"],
  [{ action: "accept" }, "invalid_contract_review_action"], [{ action: "approve", resultPayload: [] }, "invalid_contract_request"],
] as const) Deno.test(`REF004 Contract review invalid ${JSON.stringify(body)}: zero repository calls`, async () => {
  const f = fixture(); await error(await f.send("review", "POST", body), 400, String(code)); equal(f.reads, []); equal(f.writes, []);
});
for (const [options, status, code] of [[{ noContract: true }, 404, "contract_not_found"], [{ noProgress: true }, 404, "contract_progress_not_found"],
  [{ rewarded: true }, 409, "contract_reward_already_issued"], [{ repositoryError: true }, 500, "contract_request_failed"]] as const) {
  Deno.test(`REF004 Contract review ${code}: no write`, async () => {
    const f = fixture(options); await error(await f.send("review", "POST", { action: "approve" }), status, code); equal(f.writes, []);
  });
}
Deno.test("REF004 Contract review records current non-idempotent changed-payload behavior", async () => {
  const f = fixture();
  for (const action of ["approve", "reject"]) equal((await f.send("review", "POST", { action })).status, 200);
  equal(f.writes.length, 2); equal(f.writes.map((write: any) => write.status), ["completed", "failed"]);
});
