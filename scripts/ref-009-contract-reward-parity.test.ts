import { deepStrictEqual as equal } from "node:assert/strict";
import { createAdminRequestApplicationContext } from "../backend/supabase/functions/admin-api/adminRequestApplicationContext.ts";
import { handleAdminContractRewardIssueOperation } from "../backend/supabase/functions/admin-api/contractRewardIssueOperation.ts";
import { proxyClassroom } from "../backend/supabase/functions/admin-api/common.ts";
import type { EdgeSupabaseClient } from "../backend/src/platform/supabase/edgeStaffSession.ts";

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
