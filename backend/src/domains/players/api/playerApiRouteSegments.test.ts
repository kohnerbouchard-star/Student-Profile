import { readPlayerApiRouteSegments } from "./playerApiRouteSegments.ts";

Deno.test("Player route prefixes accept direct, Player API, and bounded compatibility paths", () => {
  assertEquals(readPlayerApiRouteSegments("/players/me/inventory"), [
    "players",
    "me",
    "inventory",
  ]);
  assertEquals(readPlayerApiRouteSegments("/player-api/players/me/inventory"), [
    "players",
    "me",
    "inventory",
  ]);
  assertEquals(
    readPlayerApiRouteSegments("/functions/v1/player-api/players/me/inventory"),
    ["players", "me", "inventory"],
  );
  assertEquals(
    readPlayerApiRouteSegments("/classroom-api/players/me/inventory"),
    ["players", "me", "inventory"],
  );
  assertEquals(
    readPlayerApiRouteSegments(
      "/functions/v1/classroom-api/players/me/inventory",
    ),
    ["players", "me", "inventory"],
  );
});

Deno.test("Player route prefixes reject spoofed or incomplete service paths", () => {
  assertEquals(
    readPlayerApiRouteSegments("/spoof/player-api/players/me/inventory"),
    null,
  );
  assertEquals(
    readPlayerApiRouteSegments("/functions/v1/player-api/spoof/players/me"),
    null,
  );
  assertEquals(readPlayerApiRouteSegments("/player-api/spoof/players/me"), null);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
