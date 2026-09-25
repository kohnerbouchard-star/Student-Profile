import { deepStrictEqual as equal } from "node:assert/strict";
import { createAdminRequestApplicationContext } from "./adminRequestApplicationContext.ts";
import { handleAdminContractRewardIssueOperation } from "./contractRewardIssueOperation.ts";
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
