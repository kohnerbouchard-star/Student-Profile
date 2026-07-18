import { parsePlayerInventoryReadRequest } from "./playerInventoryRequestParser.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player inventory request parser accepts an unparameterized read", () => {
  assertEquals(
    parsePlayerInventoryReadRequest(
      new Request("https://example.test/players/me/inventory"),
      { kind: "inventory" },
    ),
    { kind: "inventory" },
  );
});

Deno.test("player inventory request parser rejects malformed routes and query parameters", () => {
  assertThrows(() =>
    parsePlayerInventoryReadRequest(
      new Request("https://example.test/players/me/inventory/extra"),
      { kind: "malformed" },
    )
  );
  assertThrows(() =>
    parsePlayerInventoryReadRequest(
      new Request("https://example.test/players/me/inventory?limit=20"),
      { kind: "inventory" },
    )
  );
});

function assertThrows(run: () => unknown): void {
  try {
    run();
  } catch {
    return;
  }
  throw new Error("Expected function to throw.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
