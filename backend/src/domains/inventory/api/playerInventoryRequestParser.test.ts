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

Deno.test("player inventory request parser rejects malformed routes, query parameters, and game headers", () => {
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

  const request = new Request("https://example.test/players/me/inventory", {
    headers: {
      "x-econovaria-game-session-id":
        "00000000-0000-4000-8000-000000000002",
    },
  });
  assertThrows(() =>
    parsePlayerInventoryReadRequest(request, { kind: "inventory" })
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
