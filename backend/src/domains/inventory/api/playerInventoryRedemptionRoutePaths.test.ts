import { readPlayerInventoryRedemptionRoutePath } from "./playerInventoryRedemptionRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const REQUEST_ID = `red_${"a".repeat(32)}`;

Deno.test("Inventory redemption routes recognize direct and Edge public-ID paths", () => {
  assertEquals(
    readPlayerInventoryRedemptionRoutePath(
      "/players/me/inventory/meal-pass/redemptions",
    ),
    {
      kind: "request",
      itemId: "meal-pass",
    },
  );
  assertEquals(
    readPlayerInventoryRedemptionRoutePath(
      "/functions/v1/classroom-api/players/me/inventory/redemptions",
    ),
    {
      kind: "collection",
    },
  );
  assertEquals(
    readPlayerInventoryRedemptionRoutePath(
      `/functions/v1/classroom-api/players/me/inventory/redemptions/${REQUEST_ID}`,
    ),
    {
      kind: "item",
      requestId: REQUEST_ID,
    },
  );
});

Deno.test("Inventory redemption routes reject UUID-like and malformed browser identifiers", () => {
  for (
    const path of [
      "/players/me/inventory/00000000-0000-4000-8000-000000000001/redemptions",
      "/players/me/inventory/Meal-Pass/redemptions",
      "/players/me/inventory/redemptions/00000000-0000-4000-8000-000000000001",
      "/players/me/inventory/redemptions/red_bad",
      "/players/me/inventory/meal-pass/redemptions/extra",
    ]
  ) {
    assertEquals(readPlayerInventoryRedemptionRoutePath(path), {
      kind: "malformed",
    });
  }
  assertEquals(
    readPlayerInventoryRedemptionRoutePath("/players/me/inventory"),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
