import { readPlayerInventoryRoutePath } from "./playerInventoryRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player inventory route accepts exact direct and classroom-api paths", () => {
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

Deno.test("player inventory route rejects spoofed prefixes, item paths, and unrelated paths", () => {
  assertEquals(
    readPlayerInventoryRoutePath(
      "/not-classroom-api/players/me/inventory",
    ),
    null,
  );
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
