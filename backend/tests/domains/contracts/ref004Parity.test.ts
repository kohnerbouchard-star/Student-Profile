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

// REF-028: lock the optional country projection before moving its persistence.
import { resolveActivePlayerCountryCode } from "../../../src/domains/contracts/infrastructure/supabaseContractAvailabilityReadRepository.ts";
import { isContractAvailableNow,
  listPlayerContractsAvailableNow } from "../../../src/domains/contracts/services/playerContractAvailabilityService.ts";
import type { ContractRepository, GameSessionContractRecord } from "../../../src/domains/contracts/contracts/contractRepositoryContracts.ts";
import "../../../src/domains/contracts/services/playerContractAvailabilityService.test.ts";

type CountryResponse = { data?: Record<string, unknown> | null; error?: unknown } | undefined;
function countryReadFixture(assignment: CountryResponse, country: CountryResponse, throwAt = "") {
  const trace: unknown[][] = [];
  const client = { from(table: string) {
    trace.push(["from", table]);
    if (throwAt === table) throw new Error("private lookup failure");
    const query = {
      select(value: string) { trace.push(["select", value]); return query; },
      eq(key: string, value: string) { trace.push(["eq", key, value]); return query; },
      order(key: string, value: unknown) { trace.push(["order", key, value]); return query; },
      limit(value: number) { trace.push(["limit", value]); return query; },
      maybeSingle() { trace.push(["maybeSingle"]);
        if (throwAt === `${table}:response`) return Promise.reject(new Error("private response failure"));
        return Promise.resolve(table === "player_country_assignments" ? assignment : country); },
    }; return query;
  } };
  return { trace, read: () => resolveActivePlayerCountryCode(client as never, G, U) };
}
const assignmentTrace = [["from", "player_country_assignments"], ["select", "country_profile_id,assigned_at"],
  ["eq", "game_session_id", G], ["eq", "player_id", U], ["eq", "status", "active"],
  ["order", "assigned_at", { ascending: false }], ["limit", 1], ["maybeSingle"]];
const countryTrace = [["from", "country_profiles"], ["select", "country_code"], ["eq", "id", C], ["maybeSingle"]];
Deno.test("REF028 country reads: exact scope, order, limit, count and normalization", async () => {
  const f = countryReadFixture({ data: { country_profile_id: ` ${C} ` } }, { data: { country_code: " northreach " } });
  equal(await f.read(), "NORTHREACH"); equal(f.trace, [...assignmentTrace, ...countryTrace]);
});
for (const [name, response] of Object.entries({ absent: undefined, missing: {}, null: { data: null },
  empty: { data: {} }, blank: { data: { country_profile_id: "  " } },
  error: { data: { country_profile_id: C }, error: { message: "private" } } })) {
  Deno.test(`REF028 country reads: ${name} assignment returns null without second query`, async () => {
    const f = countryReadFixture(response, { data: { country_code: "NORTHREACH" } });
    equal(await f.read(), null); equal(f.trace, assignmentTrace);
  });
}
for (const [name, response] of Object.entries({ absent: undefined, missing: {}, null: { data: null },
  empty: { data: {} }, blank: { data: { country_code: "  " } },
  error: { data: { country_code: "NORTHREACH" }, error: { message: "private" } } })) {
  Deno.test(`REF028 country reads: ${name} profile returns null without retry`, async () => {
    const f = countryReadFixture({ data: { country_profile_id: C } }, response);
    equal(await f.read(), null); equal(f.trace, [...assignmentTrace, ...countryTrace]);
  });
}
for (const table of ["player_country_assignments", "country_profiles"]) {
  for (const suffix of ["", ":response"]) Deno.test(`REF028 country reads: ${table}${suffix} exception stays null`, async () => {
    const f = countryReadFixture({ data: { country_profile_id: C } }, { data: { country_code: "NORTHREACH" } }, `${table}${suffix}`);
    equal(await f.read(), null);
    equal(f.trace.filter((entry) => entry[0] === "from").length, table === "country_profiles" ? 2 : 1);
  });
}
const availabilityInput = Object.freeze({ gameSessionId: G, playerId: U, nowIso: NOW });
const availabilityContract = { ...contractDto, id: C, targetingPayload: {}, publishedAt: NOW,
  expiresAt: null, deadlineAt: null, createdAt: NOW } as unknown as GameSessionContractRecord;
Deno.test("REF028 policy: publication inclusive, expiry exclusive, deadline is not expiry", () => {
  const before = "2026-09-22T23:59:59.999Z", after = "2026-09-23T00:00:00.001Z";
  for (const [time, published, expires] of [[before, true, false], [NOW, true, false], [after, false, true]] as const) {
    equal(isContractAvailableNow({ ...availabilityContract, publishedAt: time }, availabilityInput), published);
    equal(isContractAvailableNow({ ...availabilityContract, expiresAt: time }, availabilityInput), expires);
  }
  equal(isContractAvailableNow({ ...availabilityContract, deadlineAt: before }, availabilityInput), true);
  for (const publishedAt of [null, "invalid"]) equal(isContractAvailableNow({ ...availabilityContract, publishedAt }, availabilityInput), false);
  equal(isContractAvailableNow({ ...availabilityContract, expiresAt: "invalid" }, availabilityInput), false);
  equal(isContractAvailableNow(availabilityContract, { ...availabilityInput, nowIso: "invalid" }), false);
});
Deno.test("REF028 policy: wrong game/status/private and absent targeting remain unavailable", () => {
  for (const override of [{ gameSessionId: S }, { status: "paused" }, { status: "completed" },
    { visibility: "private" }, { visibility: "targeted", targetingPayload: { playerIds: [S], countryCodes: ["NORTHREACH"] } }]) {
    equal(isContractAvailableNow({ ...availabilityContract, ...override }, availabilityInput), false);
  }
  const targets: GameSessionContractRecord["targetingPayload"][] = [{ playerIds: [` ${U} `] }, { countryCodes: [" northreach "] }, { rosterLabels: [" north "] }];
  for (const targetingPayload of targets) {
    equal(isContractAvailableNow({ ...availabilityContract, status: "scheduled", visibility: "targeted", targetingPayload },
      { ...availabilityInput, countryCode: "NORTHREACH", rosterLabel: "NORTH" }), true);
  }
});
Deno.test("REF028 list: two scoped reads, last duplicate wins, descending time, failures propagate", async () => {
  const calls: unknown[] = [], duplicate = { ...availabilityContract, title: "scheduled replacement" };
  const older = { ...availabilityContract, id: P, publishedAt: "2026-09-22T00:00:00.000Z" };
  const repository = { async listPlayerAvailableContracts(input: unknown) { calls.push(["active", input]); return [older, availabilityContract]; },
    async listGameSessionContracts(input: unknown) { calls.push(["scheduled", input]); return [duplicate, { ...older, id: S, gameSessionId: S }]; } };
  equal(await listPlayerContractsAvailableNow(repository as unknown as ContractRepository, availabilityInput), [duplicate, older]);
  equal(calls, [["active", { gameSessionId: G, playerId: U }], ["scheduled", { gameSessionId: G, statuses: ["scheduled"] }]]);
  const failure = new Error("repository failure");
  for (const method of ["listPlayerAvailableContracts", "listGameSessionContracts"] as const) {
    let caught: unknown;
    try { await listPlayerContractsAvailableNow({ ...repository, [method]: () => Promise.reject(failure) } as unknown as ContractRepository, availabilityInput); }
    catch (error) { caught = error; }
    equal(caught, failure);
  }
});

// Keep the existing repository lifecycle/negative cases in their owner while
// registering them alongside the read-seam trace characterization below.
import "../../../src/domains/contracts/infrastructure/supabaseContractRepository.test.ts";
import { SupabaseContractRepository } from "../../../src/domains/contracts/infrastructure/supabaseContractRepository.ts";
import { ContractRepositoryError } from "../../../src/domains/contracts/contracts/contractRepositoryContracts.ts";
const progressColumns = "id,game_session_id,contract_id,player_id,status,evidence_payload,result_payload,submitted_at,completed_at,reward_issued_at,created_at,updated_at";
const progressRow = { id: P, game_session_id: G, contract_id: C, player_id: U, status: "submitted",
  evidence_payload: { answer: "synthetic", numeric: 1.25 }, result_payload: { score: 0 },
  created_at: NOW, updated_at: NOW };
function progressReadFixture(data: unknown, message?: string) {
  const trace: unknown[] = [];
  const response = { data, error: message === undefined ? null : { message } };
  const query = {
    eq(key: string, value: unknown) { trace.push(["eq", key, value]); return query; },
    in(key: string, value: unknown) { trace.push(["in", key, value]); return query; },
    order(key: string, options: unknown) { trace.push(["order", key, options]); return query; },
    maybeSingle() { trace.push(["maybeSingle"]); return Promise.resolve(response); },
    then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
      trace.push(["await"]); return Promise.resolve(response).then(resolve, reject);
    },
  };
  const client = { from(table: string) { trace.push(["from", table]); return {
    select(columns: string) { trace.push(["select", columns]); return query; },
  }; } };
  return { repository: new SupabaseContractRepository(client as never), trace };
}
const progressReadCases = [
  { method: "getPlayerContractProgress", input: { gameSessionId: G, contractId: C, playerId: U }, single: true,
    trace: [["eq", "game_session_id", G], ["eq", "contract_id", C], ["eq", "player_id", U], ["maybeSingle"]] },
  { method: "getContractProgressById", input: { gameSessionId: G, contractId: C, progressId: P }, single: true,
    trace: [["eq", "game_session_id", G], ["eq", "contract_id", C], ["eq", "id", P], ["maybeSingle"]] },
  { method: "listPlayerContractProgress", input: { gameSessionId: G, playerId: U }, single: false,
    trace: [["eq", "game_session_id", G], ["eq", "player_id", U], ["order", "created_at", { ascending: false }], ["await"]] },
  { method: "listContractProgressForStaff", input: { gameSessionId: G, contractId: C }, single: false,
    trace: [["eq", "game_session_id", G], ["eq", "contract_id", C], ["order", "submitted_at", { ascending: false, nullsFirst: false }],
      ["order", "created_at", { ascending: false }], ["await"]] },
] as const;
for (const scenario of progressReadCases) {
  Deno.test(`REF029 ${scenario.method}: one exact scoped query and unchanged projection`, async () => {
    for (const data of [null, ...(scenario.single ? [progressRow] : [[], Array.from({ length: 200 }, (_, i) => ({ ...progressRow,
      id: `${P}-${i}`, status: i % 2 ? "completed" : "submitted", submitted_at: i % 2 ? NOW : null }))])]) {
      const f = progressReadFixture(data);
      const result = await f.repository[scenario.method](scenario.input as never);
      const map = (row: typeof progressRow) => ({ id: row.id, gameSessionId: G, contractId: C, playerId: U, status: row.status,
        evidencePayload: row.evidence_payload, resultPayload: row.result_payload,
        submittedAt: (row as typeof row & { submitted_at?: string }).submitted_at ?? null,
        completedAt: null, rewardIssuedAt: null, createdAt: NOW, updatedAt: NOW });
      equal(result, data === null ? (scenario.single ? null : []) : scenario.single ? map(data as typeof progressRow) : (data as typeof progressRow[]).map(map));
      equal(f.trace, [["from", "player_contract_progress"], ["select", progressColumns], ...scenario.trace]);
    }
  });
  Deno.test(`REF029 ${scenario.method}: error precedes malformed row mapping`, async () => {
    for (const message of ["synthetic unavailable", ""]) {
      const f = progressReadFixture(scenario.single ? {} : [{}], message);
      let caught: unknown;
      try { await f.repository[scenario.method](scenario.input as never); } catch (error) { caught = error; }
      ok(caught instanceof ContractRepositoryError);
      equal([caught.code, caught.message, caught.tableName, caught.operation], ["contract_repository_query_failed",
        message || "Contract repository query failed.", "player_contract_progress", "select"]);
      equal(f.trace, [["from", "player_contract_progress"], ["select", progressColumns], ...scenario.trace]);
    }
  });
}
for (const method of ["listPlayerContractProgress", "listContractProgressForStaff"] as const) {
  Deno.test(`REF029 ${method}: optional filters preserve empty and mixed-state semantics`, async () => {
    for (const statuses of [undefined, [], ["submitted", "completed"]]) {
      const f = progressReadFixture([]);
      await f.repository[method]({ gameSessionId: G, contractId: C, playerId: U, statuses } as never);
      const base = [["from", "player_contract_progress"], ["select", progressColumns], ["eq", "game_session_id", G],
        ["eq", method === "listPlayerContractProgress" ? "player_id" : "contract_id", method === "listPlayerContractProgress" ? U : C]];
      equal(f.trace, [...base, ...(statuses?.length ? [["in", "status", statuses]] : []),
        ...(method === "listContractProgressForStaff" ? [["eq", "player_id", U], ["order", "submitted_at", { ascending: false, nullsFirst: false }]] : []),
        ["order", "created_at", { ascending: false }], ["await"]]);
    }
  });
}
