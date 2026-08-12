import { SupabaseStoryContractWriter } from "./supabaseStoryContractWriter.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Story Contract writer inserts the authored Story contract", async () => {
  const client = new FakeContractClient("inserted");
  const writer = new SupabaseStoryContractWriter(client as never);

  assertEquals(await writer.createGameSessionContract(input()), { id: "contract-1" });
  assertEquals(client.inserted?.contract_key, "contract.meridian.response.v1");
  assertEquals(client.inserted?.source_type, "story_event");
  assertEquals(client.inserted?.source_id, "event-1");
});

Deno.test("Story Contract writer reuses the same Story source on duplicate", async () => {
  const client = new FakeContractClient("duplicate");
  const writer = new SupabaseStoryContractWriter(client as never);

  assertEquals(await writer.createGameSessionContract(input()), {
    id: "contract-existing",
  });
});

Deno.test("Story Contract writer rejects a duplicate from a different Story source", async () => {
  const client = new FakeContractClient("duplicate-wrong-source");
  const writer = new SupabaseStoryContractWriter(client as never);

  await assertRejects(
    () => writer.createGameSessionContract(input()),
    "Story Contract conflict did not match the same Story source.",
  );
});

type Mode = "inserted" | "duplicate" | "duplicate-wrong-source";

class FakeContractClient {
  inserted: Record<string, unknown> | null = null;

  constructor(private readonly mode: Mode) {}

  from(tableName: string) {
    if (tableName !== "game_session_contracts") {
      throw new Error(`Unexpected table ${tableName}`);
    }

    return {
      insert: (row: Record<string, unknown>) => {
        this.inserted = row;
        return {
          select: (_columns: string) => ({
            maybeSingle: async () => this.mode === "inserted"
              ? { data: { id: "contract-1" }, error: null }
              : { data: null, error: { code: "23505", message: "duplicate" } },
          }),
        };
      },
      select: (_columns: string) => {
        const builder = {
          eq: (_column: string, _value: unknown) => builder,
          then: (
            onFulfilled?: (value: unknown) => unknown,
            onRejected?: (reason: unknown) => unknown,
          ) => Promise.resolve({
            data: this.mode === "duplicate"
              ? [{
                id: "contract-existing",
                contract_key: "contract.meridian.response.v1",
                source_type: "story_event",
                source_id: "event-1",
              }]
              : [{
                id: "contract-other",
                contract_key: "contract.meridian.response.v1",
                source_type: "story_event",
                source_id: "event-other",
              }],
            error: null,
          }).then(onFulfilled, onRejected),
        };
        return builder;
      },
    };
  }
}

function input() {
  return {
    gameSessionId: "game-1",
    contractKey: "contract.meridian.response.v1",
    sourceType: "story_event" as const,
    sourceId: "event-1",
    createdByStaffId: null,
    title: "Meridian Emergency Response",
    description: "Coordinate continuity and evidence handling.",
    instructions: "Separate verified facts from attribution claims.",
    category: "story",
    status: "active" as const,
    visibility: "public" as const,
    targetingPayload: {},
    requirementsPayload: {},
    rewardPayload: {},
    completionMode: "manual_review" as const,
    publishedAt: "2026-08-12T00:00:00.000Z",
    deadlineAt: null,
    expiresAt: null,
    metadata: {},
  };
}

async function assertRejects(
  run: () => Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await run();
    throw new Error("Expected rejection.");
  } catch (error) {
    assertEquals(error instanceof Error ? error.message : String(error), expectedMessage);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
