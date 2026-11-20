import {
  enforcePlayerBrowserResponsePrivacy,
  sanitizePlayerBrowserPayload,
} from "./playerBrowserResponsePrivacy.ts";
import {
  createPlayerPublicIdHash,
  MAX_PENDING_PLAYER_PUBLIC_ID_HASHES,
} from "./playerPublicIdHash.ts";

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

Deno.test("Player browser privacy sanitizes high-cardinality responses deterministically", async () => {
  const identifiers = Array.from({ length: 512 }, (_, index) =>
    `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`
  );
  const source = {
    records: identifiers.map((id, index) => ({
      id,
      relation: `game:${GAME_ID}:record:${id}`,
      duplicatePlayerId: index % 2 === 0 ? PLAYER_ID : id,
    })),
  };

  const first = await sanitizePlayerBrowserPayload(source);
  const second = await sanitizePlayerBrowserPayload(source);
  const firstText = JSON.stringify(first.value);

  assertEquals(first.changed, true);
  assertEquals(second.changed, true);
  assertEquals(UUID_PATTERN.test(firstText), false);
  assertEquals(first.value, second.value);
  assertEquals(firstText.includes("pub_"), true);
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

Deno.test("Player public-ID hashing shares only identical unfinished work", async () => {
  const gates = new Map<string, (digest: string) => void>();
  const calls: string[] = [];
  const hash = createPlayerPublicIdHash((value) => {
    calls.push(value);
    return new Promise((resolve) => gates.set(value, resolve));
  });
  const first = hash("game-one-id");
  const duplicate = hash("game-one-id");
  const other = hash("game-two-id");
  assertEquals(calls, ["game-one-id", "game-two-id"]);
  gates.get("game-two-id")!("second-digest");
  gates.get("game-one-id")!("first-digest");
  assertEquals(await Promise.all([first, duplicate, other]), [
    "first-digest", "first-digest", "second-digest",
  ]);
  const later = hash("game-one-id");
  assertEquals(calls.length, 3);
  gates.get("game-one-id")!("recomputed-digest");
  assertEquals(await later, "recomputed-digest");
});

Deno.test("Player public-ID hashing clears rejected work without hiding failure", async () => {
  const failure = new Error("hash unavailable");
  let reject: (reason: Error) => void = () => {};
  let calls = 0;
  const hash = createPlayerPublicIdHash(() => {
    calls += 1;
    return calls === 1
      ? new Promise((_resolve, fail) => { reject = fail; })
      : Promise.resolve("recovered");
  });
  const first = hash("id").catch((error) => error);
  const duplicate = hash("id").catch((error) => error);
  reject(failure);
  assertEquals((await first) === failure, true);
  assertEquals((await duplicate) === failure, true);
  assertEquals(calls, 1);
  assertEquals(await hash("id"), "recovered");
  assertEquals(calls, 2);
});

Deno.test("Player public-ID hashing bounds pending entries without dropping work", async () => {
  const releases: Array<() => void> = [];
  let calls = 0;
  const hash = createPlayerPublicIdHash((value) => {
    calls += 1;
    return new Promise((resolve) => releases.push(() => resolve(value)));
  });
  const pending = Array.from({ length: MAX_PENDING_PLAYER_PUBLIC_ID_HASHES },
    (_, index) => hash(String(index)));
  pending.push(hash("0"), hash("overflow"), hash("overflow"));
  assertEquals(calls, MAX_PENDING_PLAYER_PUBLIC_ID_HASHES + 2);
  for (const release of releases) release();
  const values = await Promise.all(pending);
  assertEquals(values.slice(-3), ["0", "overflow", "overflow"]);
  const later = hash("0");
  assertEquals(calls, MAX_PENDING_PLAYER_PUBLIC_ID_HASHES + 3);
  releases.at(-1)!();
  assertEquals(await later, "0");
});

Deno.test("Player privacy coalesces forty concurrent snapshots without changing aliases", async () => {
  const source = {
    gameId: GAME_ID,
    records: Array.from({ length: 512 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${(index + 100).toString(16).padStart(12, "0")}`,
      relation: `game:${GAME_ID}:public`,
    })),
  };
  const expected = await sanitizePlayerBrowserPayload(source);
  assertEquals((expected.value as { gameId: string }).gameId,
    "pub_109639991d9a5b761e3dd2dd");
  const originalDigest = crypto.subtle.digest;
  let calls = 0;
  crypto.subtle.digest = function (algorithm, data) {
    calls += 1;
    return originalDigest.call(this, algorithm, data);
  };
  try {
    const results = await Promise.all(Array.from({ length: 40 }, () =>
      sanitizePlayerBrowserPayload(source)));
    assertEquals(calls, 513);
    for (const result of results) {
      assertEquals(result, expected);
      assertEquals(UUID_PATTERN.test(JSON.stringify(result.value)), false);
    }
    assertEquals(source.gameId, GAME_ID);
    assertEquals(source.records[0].id, "00000000-0000-4000-8000-000000000064");
    await sanitizePlayerBrowserPayload(source);
    assertEquals(calls, 1_026);
  } finally {
    crypto.subtle.digest = originalDigest;
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
