import { readPlayerCraftingRoutePath } from "./playerCraftingRoutePaths.ts";

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test("player crafting route paths expose reviewed public identifiers", () => {
  assertEquals(readPlayerCraftingRoutePath("/players/me/crafting"), { kind: "read" });
  assertEquals(readPlayerCraftingRoutePath("/players/me/crafting/jobs"), { kind: "startJob" });
  assertEquals(
    readPlayerCraftingRoutePath("/players/me/crafting/jobs/cft_00000000000000000000000000000001/cancel"),
    { kind: "cancelJob", jobKey: "cft_00000000000000000000000000000001" },
  );
  assertEquals(
    readPlayerCraftingRoutePath("/players/me/items/field_ration/use"),
    { kind: "useItem", itemKey: "field_ration" },
  );
  assertEquals(
    readPlayerCraftingRoutePath("/players/me/equipment/eqp_00000000000000000000000000000001/salvage"),
    { kind: "salvage", equipmentKey: "eqp_00000000000000000000000000000001" },
  );
});

Deno.test("player crafting route paths reject UUID and malformed identifiers", () => {
  assertEquals(
    readPlayerCraftingRoutePath("/players/me/crafting/jobs/00000000-0000-4000-8000-000000000001/cancel"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerCraftingRoutePath("/players/me/items/%2E%2E/use"),
    { kind: "malformed" },
  );
});
