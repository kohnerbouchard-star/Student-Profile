import { readPlayerInventoryRoutePath } from "./playerInventoryRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player inventory route accepts the exact authenticated collection path", () => {
  assertEquals(
    readPlayerInventoryRoutePath(
      "/functions/v1/classroom-api/players/me/inventory",
    ),
    { kind: "inventory" },
  );
  assertEquals(
    readPlayerInventoryRoutePath("/players/me/inventory"),
    { kind: "inventory" },
  );
});

Deno.test("player inventory route rejects item and unrelated paths", () => {
  assertEquals(
    readPlayerInventoryRoutePath("/players/me/inventory/internal-id"),
    { kind: "malformed" },
  );
  assertEquals(readPlayerInventoryRoutePath("/players/me/store/items"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
