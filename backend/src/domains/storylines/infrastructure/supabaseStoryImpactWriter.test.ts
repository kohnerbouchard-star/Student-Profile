import { SupabaseStoryImpactWriter } from "./supabaseStoryImpactWriter.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Story impact writer inserts deterministic idempotency key", async () => {
  const client = new FakeImpactClient("inserted");
  const writer = new SupabaseStoryImpactWriter(client as never);

  assertEquals(await writer.createPlayerImpact(input()), { id: "impact-1" });
  assertEquals(client.inserted?.idempotency_key, "story:effect:impact:1");
});

Deno.test("Story impact writer reuses the existing row on duplicate replay", async () => {
  const client = new FakeImpactClient("duplicate");
  const writer = new SupabaseStoryImpactWriter(client as never);

  assertEquals(await writer.createPlayerImpact(input()), { id: "impact-existing" });
  assertEquals(client.lookupFilters, [
    ["game_session_id", "game-1"],
    ["idempotency_key", "story:effect:impact:1"],
  ]);
});

Deno.test("Story impact writer fails closed when duplicate lookup is missing", async () => {
  const client = new FakeImpactClient("duplicate-missing");
  const writer = new SupabaseStoryImpactWriter(client as never);

  await assertRejects(
    () => writer.createPlayerImpact(input()),
    "Story impact replay row was not found.",
  );
});

type Mode = "inserted" | "duplicate" | "duplicate-missing";

class FakeImpactClient {
  inserted: Record<string, unknown> | null = null;
  readonly lookupFilters: [string, unknown][] = [];

  constructor(private readonly mode: Mode) {}

  from(tableName: string) {
    if (tableName !== "player_story_impacts") {
      throw new Error(`Unexpected table ${tableName}`);
    }

    return {
      insert: (row: Record<string, unknown>) => {
        this.inserted = row;
        return {
          select: (_columns: string) => ({
            maybeSingle: async () => this.mode === "inserted"
              ? { data: { id: "impact-1" }, error: null }
              : { data: null, error: { code: "23505", message: "duplicate" } },
          }),
        };
      },
      select: (_columns: string) => {
        const builder = {
          eq: (column: string, value: unknown) => {
            this.lookupFilters.push([column, value]);
            return builder;
          },
          maybeSingle: async () => this.mode === "duplicate"
            ? { data: { id: "impact-existing" }, error: null }
            : { data: null, error: null },
        };
        return builder;
      },
    };
  }
}

function input() {
  return {
    gameSessionId: "game-1",
    playerId: "player-1",
    storylineEventId: "event-1",
    effectType: "character_message" as const,
    impactLabel: "Message from Edda Veyr",
    impactReason: "Keep the evidence separate from rumor.",
    amount: null,
    payload: { conversationKey: "arrival" },
    idempotencyKey: "story:effect:impact:1",
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
