import { PlayerWorldReadError } from "../contracts/playerWorldReadContracts.ts";
import {
  decodePlayerWorldNewsCursor,
  encodePlayerWorldNewsCursor,
  parsePlayerWorldReadRequest,
} from "./playerWorldRequestParser.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

Deno.test("country requests accept public codes and reject UUID identifiers", () => {
  assertEquals(
    parsePlayerWorldReadRequest(
      request("/players/me/world/countries/nrc"),
      { kind: "country", countryIdentifier: "nrc" },
    ),
    { kind: "country", countryCode: "NRC" },
  );

  assertWorldError(
    () => parsePlayerWorldReadRequest(
      request("/players/me/world/countries/00000000-0000-4000-8000-000000000001"),
      { kind: "country", countryIdentifier: "00000000-0000-4000-8000-000000000001" },
    ),
    "invalid_player_world_request",
  );
});

Deno.test("news requests use bounded deterministic cursor pagination", () => {
  const cursor = encodePlayerWorldNewsCursor({ createdTick: 41, publicId: "shock.nrc-41" });
  assertEquals(decodePlayerWorldNewsCursor(cursor), { createdTick: 41, publicId: "shock.nrc-41" });

  assertEquals(
    parsePlayerWorldReadRequest(
      request(`/players/me/world/news?limit=10&category=macro&cursor=${encodeURIComponent(cursor)}`),
      { kind: "news" },
    ),
    {
      kind: "news",
      news: {
        limit: 10,
        category: "macro",
        cursor: { createdTick: 41, publicId: "shock.nrc-41" },
      },
    },
  );

  assertWorldError(
    () => parsePlayerWorldReadRequest(request("/players/me/world/news?limit=51"), { kind: "news" }),
    "invalid_player_world_request",
  );
});

Deno.test("world requests reject browser-selected game scope and unknown query fields", () => {
  assertWorldError(
    () => parsePlayerWorldReadRequest(
      request("/players/me/world/news?gameSessionId=00000000-0000-4000-8000-000000000001"),
      { kind: "news" },
    ),
    "invalid_player_world_request",
  );

  const headers = new Headers({ "x-econovaria-game-session-id": "00000000-0000-4000-8000-000000000001" });
  assertWorldError(
    () => parsePlayerWorldReadRequest(request("/players/me/world/countries", headers), { kind: "countries" }),
    "invalid_player_world_request",
  );

  assertWorldError(
    () => parsePlayerWorldReadRequest(request("/players/me/world/news?offset=20"), { kind: "news" }),
    "invalid_player_world_request",
  );
});

function request(path: string, headers = new Headers()): Request {
  return new Request(`https://example.test${path}`, { method: "GET", headers });
}

function assertWorldError(run: () => unknown, expectedCode: string): void {
  try {
    run();
  } catch (error) {
    if (!(error instanceof PlayerWorldReadError)) throw error;
    assertEquals(error.code, expectedCode);
    assertEquals(error.status, 400);
    return;
  }
  throw new Error(`Expected ${expectedCode}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}
