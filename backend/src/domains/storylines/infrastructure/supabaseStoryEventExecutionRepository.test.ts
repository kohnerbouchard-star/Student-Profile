import { SupabaseStoryEventExecutionRepository } from "./supabaseStoryEventExecutionRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Story execution repository parses acquired claim", async () => {
  const client = new FakeRpcClient({
    claim_story_event_execution_v1: [{
      claim_outcome: "acquired",
      claim_id: "claim-1",
      lease_token: "lease-1",
      lease_expires_at: "2026-08-13T00:02:00.000Z",
      effective_at: "2026-08-13T00:00:00.000Z",
      effective_market_tick: 42,
      attempt_count: 1,
      execution_plan: { version: 1, effects: [] },
      resolution_id: null,
    }],
  });
  const repository = new SupabaseStoryEventExecutionRepository(client);

  const result = await repository.claim({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    effectiveAt: "2026-08-13T00:00:00.000Z",
    effectiveMarketTick: 42,
    executionPlan: { version: 1, effects: [] },
  });

  assertEquals(result, {
    outcome: "acquired",
    claimId: "claim-1",
    leaseToken: "lease-1",
    leaseExpiresAt: "2026-08-13T00:02:00.000Z",
    effectiveAt: "2026-08-13T00:00:00.000Z",
    effectiveMarketTick: 42,
    attemptCount: 1,
    executionPlan: { version: 1, effects: [] },
    resolutionId: null,
  });
  assertEquals(client.calls[0]?.functionName, "claim_story_event_execution_v1");
  assertEquals(client.calls[0]?.args?.p_lease_seconds, 120);
});

Deno.test("Story execution repository parses retryable failure and finalize", async () => {
  const client = new FakeRpcClient({
    fail_story_event_execution_v1: [{
      claim_outcome: "retryable_failed",
      claim_id: "claim-1",
      attempt_count: 2,
    }],
    finalize_story_event_execution_v1: [{
      finalize_outcome: "finalized",
      claim_id: "claim-1",
      resolution_id: "resolution-1",
      attempt_count: 3,
    }],
  });
  const repository = new SupabaseStoryEventExecutionRepository(client);

  assertEquals(await repository.fail({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    leaseToken: "lease-2",
    errorMessage: "temporary World revision conflict",
  }), {
    outcome: "retryable_failed",
    claimId: "claim-1",
    attemptCount: 2,
  });

  assertEquals(await repository.finalize({
    gameSessionId: "game-1",
    storylineEventId: "event-1",
    leaseToken: "lease-3",
    resultPayload: { resolutionPhase: "completed" },
  }), {
    outcome: "finalized",
    claimId: "claim-1",
    resolutionId: "resolution-1",
    attemptCount: 3,
  });
});

Deno.test("Story execution repository rejects incomplete acquired claim", async () => {
  const repository = new SupabaseStoryEventExecutionRepository(new FakeRpcClient({
    claim_story_event_execution_v1: [{
      claim_outcome: "acquired",
      claim_id: "claim-1",
      lease_token: null,
      lease_expires_at: null,
      effective_at: "2026-08-13T00:00:00.000Z",
      effective_market_tick: 42,
      attempt_count: 1,
      execution_plan: {},
      resolution_id: null,
    }],
  }));

  await assertRejects(
    () => repository.claim({
      gameSessionId: "game-1",
      storylineEventId: "event-1",
      effectiveAt: "2026-08-13T00:00:00.000Z",
      effectiveMarketTick: 42,
      executionPlan: {},
    }),
    "acquired claim is incomplete.",
  );
});

class FakeRpcClient {
  readonly calls: Array<{
    readonly functionName: string;
    readonly args: Readonly<Record<string, unknown>>;
  }> = [];

  constructor(private readonly responses: Record<string, unknown>) {}

  rpc<T = unknown>(
    functionName: string,
    args?: Readonly<Record<string, unknown>>,
  ): Promise<{ readonly data: T | null; readonly error: null }> {
    this.calls.push({ functionName, args: args ?? {} });
    return Promise.resolve({
      data: (this.responses[functionName] ?? null) as T | null,
      error: null,
    });
  }
}

async function assertRejects(run: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await run();
    throw new Error("Expected rejection.");
  } catch (error) {
    assertEquals(error instanceof Error ? error.message : String(error), expected);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`);
  }
}
