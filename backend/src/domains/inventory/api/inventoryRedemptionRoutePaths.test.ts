import { readInventoryRedemptionRoutePath } from "./inventoryRedemptionRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("inventory redemption routes parse player and staff paths", () => {
  assertEquals(
    readInventoryRedemptionRoutePath(
      "/players/me/inventory/holding-1/redemptions",
    ),
    { kind: "player_request", inventoryHoldingId: "holding-1" },
  );
  assertEquals(
    readInventoryRedemptionRoutePath(
      "/functions/v1/classroom-api/players/me/inventory/holding%201/redemptions",
    ),
    { kind: "player_request", inventoryHoldingId: "holding 1" },
  );
  assertEquals(
    readInventoryRedemptionRoutePath(
      "/staff/game-sessions/game-1/inventory/redemptions",
    ),
    { kind: "staff_collection", gameSessionId: "game-1" },
  );
  assertEquals(
    readInventoryRedemptionRoutePath(
      "/functions/v1/admin-api/staff/game-sessions/game-1/inventory/redemptions/request-1",
    ),
    {
      kind: "staff_item",
      gameSessionId: "game-1",
      requestId: "request-1",
    },
  );
});

Deno.test("inventory redemption routes reject malformed and spoofed paths", () => {
  assertEquals(
    readInventoryRedemptionRoutePath(
      "/not-classroom-api/players/me/inventory/holding-1/redemptions",
    ),
    null,
  );
  assertEquals(
    readInventoryRedemptionRoutePath(
      "/players/other/inventory/holding-1/redemptions",
    ),
    null,
  );
  assertEquals(
    readInventoryRedemptionRoutePath(
      "/players/me/inventory/holding-1/redemptions/extra",
    ),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
