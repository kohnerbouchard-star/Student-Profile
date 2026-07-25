import {
  enforcePlayerBrowserResponsePrivacy,
  sanitizePlayerBrowserPayload,
} from "./playerBrowserResponsePrivacy.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

Deno.test("Player browser privacy replaces UUIDs recursively and deterministically", async () => {
  const result = await sanitizePlayerBrowserPayload({
    gameSession: { id: GAME_ID },
    me: { playerId: PLAYER_ID },
    public: {
      players: [{ playerId: PLAYER_ID }],
      channel: `game:${GAME_ID}:public`,
    },
  });

  const text = JSON.stringify(result.value);
  assertEquals(result.changed, true);
  assertEquals(UUID_PATTERN.test(text), false);

  const value = result.value as {
    readonly me: { readonly playerId: string };
    readonly public: { readonly players: readonly { readonly playerId: string }[] };
  };
  assertEquals(value.me.playerId, value.public.players[0]?.playerId);
  assertEquals(value.me.playerId.startsWith("pub_"), true);
});

Deno.test("Player browser privacy preserves safe payloads without rewriting", async () => {
  const source = { ok: true, player: { playerIdentifier: "PLAYER-001" } };
  const result = await sanitizePlayerBrowserPayload(source);
  assertEquals(result.changed, false);
  assertEquals(result.value, source);
});

Deno.test("Player browser response privacy preserves status and headers", async () => {
  const response = new Response(JSON.stringify({
    ok: true,
    gameSession: { id: GAME_ID },
  }), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-request-id": "request-1",
    },
  });

  const sanitized = await enforcePlayerBrowserResponsePrivacy(response);
  const body = await sanitized.json();

  assertEquals(sanitized.status, 200);
  assertEquals(sanitized.headers.get("x-request-id"), "request-1");
  assertEquals(sanitized.headers.get("cache-control"), "private, no-store, max-age=0");
  assertEquals(UUID_PATTERN.test(JSON.stringify(body)), false);
});

Deno.test("Player browser response privacy ignores non-JSON responses", async () => {
  const response = new Response(GAME_ID, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
  const result = await enforcePlayerBrowserResponsePrivacy(response);
  assertEquals(await result.text(), GAME_ID);
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
