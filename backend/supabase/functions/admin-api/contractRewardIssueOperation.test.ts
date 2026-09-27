import { deepStrictEqual as equal } from "node:assert/strict";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { handleAdminContractRewardIssueOperation } from "./contractRewardIssueOperation.ts";
import { proxyClassroom } from "./common.ts";
import type { EdgeSupabaseClient } from "../../../src/platform/supabase/edgeStaffSession.ts";

const G = "22222222-2222-4222-8222-222222222222";
const S = "11111111-1111-4111-8111-111111111111";
const C = "33333333-3333-4333-8333-333333333333";
const P = "44444444-4444-4444-8444-444444444444";
const suffix = `/contracts/${C}/progress/${P}/rewards/issue`;

function authority() {
  return createAdminRequestApplicationContext({
    ownedGame: { id: G }, staffUserId: S,
    security: { ok: true, assuranceLevel: "aal2", permissions: ["contracts.manage"], requiredPermission: "contracts.manage" },
    requestId: "context-only",
  });
}

Deno.test("REF-009 local reward route invokes one atomic authority with transport identity", async () => {
  const calls: unknown[] = [];
  const request = new Request(`https://ref009.invalid/games/${G}${suffix}`, {
    method: "POST", headers: { "x-request-id": "request-9", "idempotency-key": "retry-9", "content-type": "application/json" },
    body: JSON.stringify({ gameId: "untrusted", reward: { amount: 999999 } }),
  });
  const response = await handleAdminContractRewardIssueOperation(
    request, {} as EdgeSupabaseClient,
    { applicationContext: authority(), gameSessionId: G, suffix },
    { issueRewards: async (_service, input) => {
      calls.push(input);
      return { ok: true as const, status: 200, body: { ok: true, rewardIssued: true, alreadyIssued: false,
        issuedAt: "2026-09-25T00:00:00.000Z", contract: null, progress: null,
        rewardResult: { cash: { amount: 12.34, currencyCode: "NRC" } } } };
    } },
  );
  if (!response) throw new Error("Expected handled response");
  equal(response.status, 200);
  equal(calls, [{ gameSessionId: G, contractId: C, progressId: P, staffUserId: S, requestId: "request-9" }]);
  equal((await response.json()).rewardResult, { cash: { amount: 12.34, currencyCode: "NRC" } });
  equal(response.headers.get("cache-control"), "no-store");
  equal(response.headers.get("content-type"), "application/json; charset=utf-8");
});

Deno.test("REF-009 identical retries preserve the same idempotency identity", async () => {
  const calls: unknown[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const request = new Request(`https://ref009.invalid/games/${G}${suffix}`, {
      method: "POST", headers: { "idempotency-key": "retry-9" },
    });
    const response = await handleAdminContractRewardIssueOperation(
      request, {} as EdgeSupabaseClient,
      { applicationContext: authority(), gameSessionId: G, suffix },
      { issueRewards: async (_service, input) => {
        calls.push(input);
        return { ok: true as const, status: 200, body: { ok: true, rewardIssued: attempt === 0,
          alreadyIssued: attempt === 1, issuedAt: null, contract: null, progress: null, rewardResult: {} } };
      } },
    );
    if (!response) throw new Error("Expected handled response");
    equal(response.status, 200);
  }
  equal((calls as any[]).map((call) => call.requestId), ["retry-9", "retry-9"]);
});

Deno.test("REF-009 rejects unapproved context before atomic authority", async () => {
  let calls = 0;
  const context = { ...authority(), permissions: [] };
  const response = await handleAdminContractRewardIssueOperation(
    new Request(`https://ref009.invalid/games/${G}${suffix}`, { method: "POST" }),
    {} as EdgeSupabaseClient,
    { applicationContext: context as any, gameSessionId: G, suffix },
    { issueRewards: async () => { calls += 1; throw new Error("must not execute"); } },
  );
  if (!response) throw new Error("Expected handled response");
  equal(response.status, 403); equal(calls, 0);
});

Deno.test("REF-009 preserves atomic error envelope and does not retry internally", async () => {
  let calls = 0;
  const response = await handleAdminContractRewardIssueOperation(
    new Request(`https://ref009.invalid/games/${G}${suffix}`, { method: "POST", headers: { "x-request-id": "request-9" } }),
    {} as EdgeSupabaseClient,
    { applicationContext: authority(), gameSessionId: G, suffix },
    { issueRewards: async () => {
      calls += 1;
      return { ok: false as const, status: 409,
        error: { code: "contract_reward_item_out_of_stock", message: "OUT_OF_STOCK", retryable: false } };
    } },
  );
  if (!response) throw new Error("Expected handled response");
  equal(response.status, 409);
  equal(await response.json(), { error: { code: "contract_reward_item_out_of_stock", message: "OUT_OF_STOCK", retryable: false } });
  equal(calls, 1);
});

for (const [method, path] of [["GET", suffix], ["PATCH", suffix], ["POST", "/settings"]] as const) {
  Deno.test(`REF-009 leaves unsupported ${method} ${path} unhandled`, async () => {
    const response = await handleAdminContractRewardIssueOperation(
      new Request(`https://ref009.invalid/games/${G}${path}`, { method }),
      {} as EdgeSupabaseClient,
      { applicationContext: authority(), gameSessionId: G, suffix: path },
    );
    equal(response, null);
  });
}

Deno.test("REF-009 preserves all transport-ID aliases and generates only missing audit IDs", async () => {
  const cases: Array<{ headers: Record<string, string>; expected: string; generated: number }> = [
    { headers: {}, expected: "generated-audit-id", generated: 1 },
    { headers: { "x-request-id": "", "idempotency-key": "" }, expected: "generated-audit-id", generated: 1 },
    { headers: { "x-request-id": "request", "idempotency-key": "primary", "x-idempotency-key": "alias" }, expected: "request", generated: 0 },
    { headers: { "idempotency-key": "primary", "x-idempotency-key": "alias" }, expected: "primary", generated: 0 },
    { headers: { "x-idempotency-key": "alias" }, expected: "alias", generated: 0 },
  ];
  for (const scenario of cases) {
    let generated = 0;
    const ids: unknown[] = [];
    await handleAdminContractRewardIssueOperation(
      new Request(`https://ref009.invalid/games/${G}${suffix}`, { method: "POST", headers: scenario.headers }),
      {} as EdgeSupabaseClient,
      { applicationContext: authority(), gameSessionId: G, suffix },
      {
        createRequestId: () => { generated += 1; return "generated-audit-id"; },
        issueRewards: async (_service, input) => {
          ids.push(input.requestId);
          return { ok: true, status: 200, body: { alreadyIssued: true } };
        },
      },
    );
    equal(ids, [scenario.expected]);
    equal(generated, scenario.generated);
  }
});

Deno.test("REF-009 rejects every invalid context before creating an ID or issuing rewards", async () => {
  const approved = authority();
  const invalidContexts: unknown[] = [
    null,
    { ...approved, role: "player" },
    { ...approved, actor: { ...approved.actor, kind: "player" } },
    { ...approved, actor: { ...approved.actor, staffUserId: "" } },
    { ...approved, gameSessionId: C },
    { ...approved, requiredPermission: "game.manage" },
    { ...approved, permissions: ["game.manage"] },
    { ...approved, permissions: null },
  ];
  for (const applicationContext of invalidContexts) {
    let effects = 0;
    const forbiddenEffect = () => { effects += 1; throw new Error("must fail before effects"); };
    const response = await handleAdminContractRewardIssueOperation(
      new Request(`https://ref009.invalid/games/${G}${suffix}`, { method: "POST" }),
      {} as EdgeSupabaseClient,
      { applicationContext: applicationContext as never, gameSessionId: G, suffix },
      { createRequestId: forbiddenEffect, issueRewards: async () => forbiddenEffect() },
    );
    equal(response?.status, 403);
    equal(effects, 0);
  }
});

// The real helper is exercised below; only its Supabase transport is substituted.
// These adapter parity tests do not certify database rollback or double-submit effects.
function atomicFixture(data: unknown, error: unknown = null) {
  const calls: Array<{ name: string; args: unknown }> = [];
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const service = {
    async rpc(name: string, args: unknown) { calls.push({ name, args }); return { data, error }; },
    from(table: string) {
      const read = { table, filters: [] as Array<[string, unknown]> };
      reads.push(read);
      const query = {
        select(_columns: string) { return query; },
        eq(column: string, value: unknown) { read.filters.push([column, value]); return query; },
        async maybeSingle() { return { data: null, error: null }; },
      };
      return query;
    },
  };
  return { service, calls, reads };
}

const receipt = { cash: { amount: 12.34, currencyCode: "NRC" } };
const settlement = { reward_issued: true, already_issued: false, issued_at: "2026-09-25T00:00:00.000Z", reward_result: receipt };
const parityCases: Array<{ name: string; data: unknown; error?: unknown; status: number }> = [
  { name: "success", data: [settlement], status: 200 },
  { name: "already issued", data: [{ ...settlement, reward_issued: false, already_issued: true }], status: 200 },
  { name: "missing result", data: [], status: 500 },
  ...[
    ["CONTRACT_PROGRESS_NOT_FOUND", 404],
    ["CONTRACT_NOT_FOUND", 404],
    ["CONTRACT_PROGRESS_NOT_COMPLETED", 409],
    ["OUT_OF_STOCK", 409],
    ["UNSUPPORTED_CONTRACT_REWARD_TYPES", 400],
    ["INVALID_CONTRACT_REWARD", 400],
    ["OTHER_DATABASE_REJECTION", 400],
  ].map(([message, status]) => ({ name: String(message), data: null, error: { message }, status: Number(status) })),
];

for (const scenario of parityCases) {
  Deno.test(`REF-009 matches legacy local RPC response and effects for ${scenario.name}`, async () => {
    const legacy = atomicFixture(scenario.data, scenario.error);
    const local = atomicFixture(scenario.data, scenario.error);
    const request = new Request(`https://ref009.invalid/games/${G}${suffix}`, {
      method: "POST", headers: { "x-request-id": "parity-request", "content-type": "application/json" },
      body: JSON.stringify({ staffUserId: "forged", gameSessionId: "forged", reward: { amount: 999999 } }),
    });
    const savedFetch = globalThis.fetch;
    let outboundCalls = 0;
    globalThis.fetch = (() => { outboundCalls += 1; throw new Error("Classroom fetch is forbidden"); }) as typeof fetch;
    try {
      const expected = await proxyClassroom(request.clone(), { service: legacy.service, staff: { id: S } },
        `/staff/game-sessions/${G}${suffix}`, "POST");
      const actual = await handleAdminContractRewardIssueOperation(request.clone(), local.service as unknown as EdgeSupabaseClient,
        { applicationContext: authority(), gameSessionId: G, suffix });
      if (!actual) throw new Error("Expected handled response");
      equal(actual.status, scenario.status);
      equal(actual.status, expected.status);
      equal([...actual.headers.entries()], [...expected.headers.entries()]);
      equal(actual.headers.get("content-type"), "application/json; charset=utf-8");
      equal(actual.headers.get("cache-control"), "no-store");
      const actualBody = await actual.json();
      equal(actualBody, await expected.json());
      if (scenario.status === 200) equal(actualBody.rewardResult, receipt);
      equal(local.calls, legacy.calls);
      equal(local.calls, [{ name: "issue_contract_rewards_atomic_v1", args: {
        p_game_session_id: G, p_contract_id: C, p_progress_id: P, p_staff_user_id: S, p_request_id: "parity-request",
      } }]);
      equal(local.reads, legacy.reads);
      equal(local.reads.length, scenario.status === 200 ? 2 : 0);
      equal(outboundCalls, 0);
    } finally {
      globalThis.fetch = savedFetch;
    }
  });
}
