import {
  dispatchRateLimitedPlayerCraftingRequest,
  readPlayerCraftingRateLimitOperation,
} from "./playerCraftingRateLimitDispatch.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Crafting rate-limit operations are explicit and bounded", () => {
  assertEquals(readPlayerCraftingRateLimitOperation("crafting", "GET"), {
    action: "player.crafting.read",
    profile: "read",
  });
  assertEquals(readPlayerCraftingRateLimitOperation("crafting", "POST"), {
    action: "player.crafting.start",
    profile: "sensitive",
  });
  assertEquals(readPlayerCraftingRateLimitOperation("craftingJobCancel", "POST"), {
    action: "player.crafting.cancel",
    profile: "write",
  });
  assertEquals(readPlayerCraftingRateLimitOperation("equipmentSalvage", "POST"), {
    action: "player.equipment.salvage",
    profile: "sensitive",
  });
  assertEquals(readPlayerCraftingRateLimitOperation("craftingJobClaim", "GET"), null);
});

Deno.test("allowed Crafting requests dispatch only after authenticated rate-limit acceptance", async () => {
  let nextCalls = 0;
  let enforcedAction = "";
  const response = await dispatchRateLimitedPlayerCraftingRequest(
    new Request("https://example.test/players/me/crafting", { method: "GET" }),
    "crafting",
    () => {
      nextCalls += 1;
      return new Response(null, { status: 204 });
    },
    {
      createServiceClient: () => ({} as never),
      readEnvironment: () => ({
        ok: true,
        value: {
          supabaseUrl: "https://example.test",
          supabaseAnonKey: "anon",
          supabaseServiceRoleKey: "service",
        },
      }),
      resolveScope: async () => ({
        gameId: "00000000-0000-4000-8000-000000000001",
        playerUuid: "00000000-0000-4000-8000-000000000002",
        playerSessionId: "00000000-0000-4000-8000-000000000003",
        sessionTokenHash: "a".repeat(64),
      }),
      enforce: async (input) => {
        enforcedAction = input.action;
        return {
          allowed: true,
          retryAfterSeconds: 0,
          limitingDimension: null,
          limit: 60,
          remaining: 59,
          resetAt: "2027-01-01T00:00:00.000Z",
        };
      },
    },
  );

  assertEquals(response.status, 204);
  assertEquals(nextCalls, 1);
  assertEquals(enforcedAction, "player.crafting.read");
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
