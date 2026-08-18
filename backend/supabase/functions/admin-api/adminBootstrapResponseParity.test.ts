import { ensureOwnedGame, gameDto, selectGame } from "./common.ts";

const FIRST_GAME = gameRow({
  id: "first-game",
  name: "First",
  status: "archived",
  game_join_code: null,
});
const ACTIVE_GAME = gameRow({
  id: "active-game",
  name: "Active",
  status: "active",
  game_join_code: "ACTIVE7",
});

Deno.test("Admin game DTO remains byte-shape exact after hydration", () => {
  assertEquals(gameDto(FIRST_GAME), {
    id: "first-game",
    gameId: "first-game",
    name: "First",
    status: "archived",
    joinCodeStatus: "unknown",
    joinCode: "",
    gameCode: "",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  });
  assertEquals(gameDto(ACTIVE_GAME), {
    id: "active-game",
    gameId: "active-game",
    name: "Active",
    status: "active",
    joinCodeStatus: "ready",
    joinCode: "ACTIVE7",
    gameCode: "ACTIVE7",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  });
});

Deno.test("Admin zero, one, and multi-game selection behavior remains exact", () => {
  assertEquals(selectGame({ games: [] }, request()), null);
  assert(
    selectGame({ games: [FIRST_GAME] }, request("not-owned")) === FIRST_GAME,
  );

  const games = [FIRST_GAME, ACTIVE_GAME];
  assert(
    selectGame({ games }, request("first-game")) === FIRST_GAME,
    "An exact owned header must win even for an inactive game.",
  );
  assert(
    selectGame({ games }, request("not-owned")) === ACTIVE_GAME,
    "An invalid header must select the first active game.",
  );
  assert(
    selectGame({ games }, request(), "first-game") === FIRST_GAME,
    "A server-selected ID must take precedence over the header.",
  );
  assert(
    selectGame(
      { games: [FIRST_GAME, { ...ACTIVE_GAME, status: "paused" }] },
      request(),
    ) === FIRST_GAME,
    "When no game is active, discovery order must choose the first game.",
  );
});

Deno.test("Admin ownership checks preserve exact hydrated row references", () => {
  const games = [FIRST_GAME, ACTIVE_GAME];
  assert(ensureOwnedGame({ games }, "active-game") === ACTIVE_GAME);
  assertEquals(ensureOwnedGame({ games }, "not-owned"), null);
});

function gameRow(overrides: {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly game_join_code: string | null;
}) {
  return {
    ...overrides,
    game_join_code_status: overrides.game_join_code ? "ready" : "",
    created_at: "2026-08-17T00:00:00.000Z",
    updated_at: "2026-08-18T00:00:00.000Z",
  };
}

function request(gameId = ""): Request {
  return new Request("https://example.test/admin-api/session/bootstrap", {
    headers: gameId ? { "x-econovaria-game-id": gameId } : {},
  });
}

function assert(value: boolean, message = "Assertion failed."): asserts value {
  if (!value) throw new Error(message);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Expected ${JSON.stringify(expected)}, received ${
        JSON.stringify(actual)
      }.`,
    );
  }
}
