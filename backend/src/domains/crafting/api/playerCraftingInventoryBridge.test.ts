import { readPlayerInventoryRoutePath } from "../../inventory/api/playerInventoryRoutePaths.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("Inventory dispatch seam preserves Inventory and recognizes every Crafting path", () => {
  assertEquals(readPlayerInventoryRoutePath("/players/me/inventory"), {
    kind: "inventory",
  });
  assertEquals(readPlayerInventoryRoutePath("/players/me/crafting"), {
    kind: "crafting",
    route: { kind: "read" },
  });
  assertEquals(readPlayerInventoryRoutePath("/players/me/crafting/jobs"), {
    kind: "crafting",
    route: { kind: "startJob" },
  });
  assertEquals(
    readPlayerInventoryRoutePath(
      "/players/me/crafting/jobs/cft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/cancel",
    ),
    {
      kind: "crafting",
      route: {
        kind: "cancelJob",
        jobKey: "cft_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    },
  );
  assertEquals(
    readPlayerInventoryRoutePath(
      "/players/me/equipment/eqp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/salvage",
    ),
    {
      kind: "crafting",
      route: {
        kind: "salvage",
        equipmentKey: "eqp_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    },
  );
});

Deno.test("Crafting-like malformed paths remain fail closed", () => {
  assertEquals(readPlayerInventoryRoutePath("/players/me/crafting/jobs/not-public/claim"), {
    kind: "crafting",
    route: { kind: "malformed" },
  });
  assertEquals(readPlayerInventoryRoutePath("/players/me/inventory/extra"), {
    kind: "malformed",
  });
  assertEquals(readPlayerInventoryRoutePath("/players/me/unrelated"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
