import { handleInventoryRedemptionOperation } from "./inventoryRedemptionOperations.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Admin Inventory seam delegates Crafting oversight before the preserved core", async () => {
  let functionName = "";
  let args: unknown = null;
  const result = await handleInventoryRedemptionOperation({
    rpc(name: string, value: unknown) {
      functionName = name;
      args = value;
      return Promise.resolve({ data: { jobs: [] }, error: null });
    },
  } as never, {
    request: new Request("https://example.test/games/game-1/crafting/oversight?limit=25", {
      method: "GET",
    }),
    gameId: "00000000-0000-4000-8000-000000000001",
    staffUserId: "00000000-0000-4000-8000-000000000002",
    suffix: "/crafting/oversight",
  });

  assertEquals(result.handled, true);
  assertEquals(result.status, 200);
  assertEquals(functionName, "read_admin_crafting_oversight_v1");
  assertEquals(args, {
    p_game_session_id: "00000000-0000-4000-8000-000000000001",
    p_staff_user_id: "00000000-0000-4000-8000-000000000002",
    p_status: null,
    p_limit: 25,
  });
});

Deno.test("Admin Inventory seam preserves unrelated fallthrough", async () => {
  const result = await handleInventoryRedemptionOperation({} as never, {
    request: new Request("https://example.test/games/game-1/unrelated", {
      method: "GET",
    }),
    gameId: "00000000-0000-4000-8000-000000000001",
    staffUserId: "00000000-0000-4000-8000-000000000002",
    suffix: "/unrelated",
  });
  assertEquals(result.handled, false);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
