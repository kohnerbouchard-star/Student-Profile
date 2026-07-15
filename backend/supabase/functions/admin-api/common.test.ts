import { proxyClassroom } from "./common.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function rowCount(rows: readonly unknown[]): number {
  return rows.length;
}

function responseRow(tableName: string): Record<string, unknown> {
  if (tableName === "game_session_contracts") {
    return {
      id: "contract-1",
      game_session_id: "game-1",
      contract_key: "contract-1",
      title: "Contract 1",
      description: "",
      instructions: "",
      category: "general",
      status: "active",
      visibility: "public",
      targeting_payload: {},
      requirements_payload: {},
      reward_payload: { cash: { amount: 10, currencyCode: "NRC" } },
      completion_mode: "manual_review",
      published_at: "2026-07-15T00:00:00.000Z",
      deadline_at: null,
      expires_at: null,
      metadata: {},
      created_at: "2026-07-15T00:00:00.000Z",
      updated_at: "2026-07-15T00:00:00.000Z",
    };
  }

  return {
    id: "progress-1",
    game_session_id: "game-1",
    contract_id: "contract-1",
    player_id: "player-1",
    status: "completed",
    evidence_payload: {},
    result_payload: {},
    submitted_at: "2026-07-15T01:00:00.000Z",
    completed_at: "2026-07-15T02:00:00.000Z",
    reward_issued_at: "2026-07-15T02:00:01.000Z",
    created_at: "2026-07-15T01:00:00.000Z",
    updated_at: "2026-07-15T02:00:01.000Z",
  };
}

function createService() {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    rpcCalls,
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return {
        data: [{
          reward_issued: rpcCalls.length === 1,
          already_issued: rpcCalls.length > 1,
          issued_at: "2026-07-15T02:00:01.000Z",
          reward_result: { cash: { amount: 10, currencyCode: "NRC" } },
        }],
        error: null,
      };
    },
    from(tableName: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        async maybeSingle() {
          return { data: responseRow(tableName), error: null };
        },
      };
      return builder;
    },
  };
}

function context(service: ReturnType<typeof createService>) {
  return {
    token: "admin-token",
    staff: { id: "staff-1" },
    service,
  };
}

function acceptedDecisionRequest(requestId: string): Request {
  return new Request(
    "https://example.test/functions/v1/admin-api/games/game-1/contract-submissions/progress-1/decision",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
      },
      body: JSON.stringify({
        action: "contract-submission-confirm-decision",
        payload: { decision: "accepted", feedback: "Approved." },
      }),
    },
  );
}

Deno.test("legacy accepted contract decision reviews then issues atomic rewards", async () => {
  const originalFetch = globalThis.fetch;
  const classroomCalls: Array<{ url: string; body: unknown }> = [];
  const service = createService();

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    classroomCalls.push({
      url: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return new Response(JSON.stringify({
      ok: true,
      progress: {
        progressId: "progress-1",
        contractId: "contract-1",
        status: "completed",
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const firstResponse = await proxyClassroom(
      acceptedDecisionRequest("review-request-1"),
      context(service),
      "/staff/game-sessions/game-1/contracts/contract-1/progress/progress-1/review",
      "POST",
    );
    const firstBody = await firstResponse.json();

    assert(firstResponse.status === 200, `Expected 200, received ${firstResponse.status}.`);
    assert(rowCount(classroomCalls) === 1, `Expected one canonical review call, received ${rowCount(classroomCalls)}.`);
    assert((classroomCalls[0].body as Record<string, unknown>).action === "approve", "Legacy accept was not normalized to approve.");
    assert(rowCount(service.rpcCalls) === 1, `Expected one atomic reward RPC, received ${rowCount(service.rpcCalls)}.`);
    assert(service.rpcCalls[0].name === "issue_contract_rewards_atomic_v1", "Wrong reward RPC was called.");
    assert(service.rpcCalls[0].args.p_request_id === "review-request-1", "Reward RPC did not receive the request id.");
    assert(firstBody.data?.reviewed === true, "Combined decision response omitted reviewed state.");
    assert(firstBody.data?.rewardIssued === true, "Combined decision response omitted reward issuance.");
    assert(firstBody.data?.alreadyIssued === false, "First reward issue was incorrectly marked as already issued.");

    const secondResponse = await proxyClassroom(
      acceptedDecisionRequest("review-request-1"),
      context(service),
      "/staff/game-sessions/game-1/contracts/contract-1/progress/progress-1/review",
      "POST",
    );
    const secondBody = await secondResponse.json();

    assert(secondResponse.status === 200, `Expected repeated approval to return 200, received ${secondResponse.status}.`);
    assert(rowCount(classroomCalls) === 2, `Expected repeated approval to perform one review call, received ${rowCount(classroomCalls)}.`);
    assert(rowCount(service.rpcCalls) === 2, `Expected repeated approval to consult the atomic reward RPC, received ${rowCount(service.rpcCalls)}.`);
    assert(service.rpcCalls[1].args.p_request_id === "review-request-1", "Repeated reward RPC changed the idempotency request id.");
    assert(secondBody.data?.reviewed === true, "Repeated approval omitted reviewed state.");
    assert(secondBody.data?.rewardIssued === false, "Repeated approval reported a duplicate reward issuance.");
    assert(secondBody.data?.alreadyIssued === true, "Repeated approval was not marked as already issued.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("legacy rejected contract decision never issues rewards", async () => {
  const originalFetch = globalThis.fetch;
  const service = createService();

  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: true,
    progress: { progressId: "progress-1", status: "failed" },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const request = new Request(
      "https://example.test/functions/v1/admin-api/games/game-1/contract-submissions/progress-1/decision",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision: "reject", feedback: "Needs revision." }),
      },
    );
    const response = await proxyClassroom(
      request,
      context(service),
      "/staff/game-sessions/game-1/contracts/contract-1/progress/progress-1/review",
      "POST",
    );

    assert(response.status === 200, `Expected 200, received ${response.status}.`);
    assert(rowCount(service.rpcCalls) === 0, "Rejected decision issued rewards.");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
