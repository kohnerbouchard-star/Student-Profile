import { EdgeActivationError } from "../../../platform/supabase/edgeResponse.ts";
import {
  readRequestedGameSessionId,
  rejectClientSuppliedBodyIdentity,
  rejectClientSuppliedPlayerIdentity,
  requireMatchingPlayerGameSession,
  resolvePlayerRequestScope,
} from "./playerRequestScope.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000002";
const SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_UUID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_UUID = "00000000-0000-4000-8000-000000000022";
const NOW = new Date("2026-07-18T00:00:00.000Z");

Deno.test("player request scope derives immutable identity only from the active session", async () => {
  const hashes: string[] = [];
  const scope = await resolvePlayerRequestScope(
    request({ gameHeader: GAME_ID }),
    {
      hashSessionToken: (token) => {
        hashes.push(token);
        return Promise.resolve(`hash:${token}`);
      },
      resolvePlayerSession: (hash) => {
        hashes.push(hash);
        return Promise.resolve(activeResolution());
      },
      now: () => NOW,
    },
  );

  assertEquals(scope, {
    playerUuid: PLAYER_UUID,
    gameId: GAME_ID,
    activeSessionId: SESSION_ID,
    sessionValid: true,
    sessionExpiresAt: "2026-07-19T00:00:00.000Z",
    authorizationContext: {
      actorType: "player",
      source: "player_session",
      gameScope: "session",
      resourceScope: "own_player",
    },
  });
  assertEquals(hashes, ["player-token", "hash:player-token"]);
});

Deno.test("player request scope rejects a missing player session", async () => {
  await assertEdgeError(
    () =>
      resolvePlayerRequestScope(
        request({ token: null }),
        dependencies(activeResolution()),
      ),
    401,
    "missing_player_session",
  );
});

Deno.test("player request scope rejects expired and revoked sessions", async () => {
  await assertEdgeError(
    () =>
      resolvePlayerRequestScope(
        request(),
        dependencies(activeResolution({
          expiresAt: "2026-07-17T00:00:00.000Z",
        })),
      ),
    401,
    "player_session_expired",
  );

  await assertEdgeError(
    () =>
      resolvePlayerRequestScope(
        request(),
        dependencies(activeResolution({
          status: "revoked",
          revokedAt: "2026-07-17T23:00:00.000Z",
        })),
      ),
    401,
    "player_session_revoked",
  );
});

Deno.test("player request scope rejects inactive or structurally mismatched session resolution", async () => {
  await assertEdgeError(
    () =>
      resolvePlayerRequestScope(
        request(),
        dependencies(activeResolution({ status: "disabled" })),
      ),
    401,
    "player_session_inactive",
  );

  const mismatchedPlayer = activeResolution();
  mismatchedPlayer.player.id = OTHER_PLAYER_UUID;

  await assertEdgeError(
    () =>
      resolvePlayerRequestScope(
        request(),
        dependencies(mismatchedPlayer),
      ),
    401,
    "invalid_player_session_scope",
  );
});

Deno.test("player request scope rejects wrong-game access and conflicting game hints", async () => {
  await assertEdgeError(
    () =>
      resolvePlayerRequestScope(
        request({ gameQuery: OTHER_GAME_ID }),
        dependencies(activeResolution()),
      ),
    401,
    "invalid_player_session_scope",
  );

  await assertEdgeError(
    () =>
      resolvePlayerRequestScope(
        request({ gameQuery: GAME_ID, gameHeader: OTHER_GAME_ID }),
        dependencies(activeResolution()),
      ),
    400,
    "invalid_player_request",
  );
});

Deno.test("player request scope rejects query and header ownership selection", async () => {
  for (
    const candidate of [
      request({ extraQuery: `player_uuid=${OTHER_PLAYER_UUID}` }),
      request({ ownershipHeader: ["x-player-uuid", OTHER_PLAYER_UUID] }),
      request({ ownershipHeader: ["x-owner-uuid", OTHER_PLAYER_UUID] }),
      request({ ownershipHeader: ["x-recipient-player-uuid", OTHER_PLAYER_UUID] }),
    ] as const
  ) {
    await assertEdgeError(
      () =>
        resolvePlayerRequestScope(
          candidate,
          dependencies(activeResolution()),
        ),
      400,
      "invalid_player_request",
    );
  }
});

Deno.test("player request scope rejects body ownership and recipient UUID injection", async () => {
  for (
    const body of [
      { player_uuid: OTHER_PLAYER_UUID },
      { ownerUuid: OTHER_PLAYER_UUID },
      { recipient_uuid: OTHER_PLAYER_UUID },
      { recipientPlayerUuid: OTHER_PLAYER_UUID },
      { gameSessionId: OTHER_GAME_ID },
    ] as const
  ) {
    await assertEdgeError(
      () =>
        resolvePlayerRequestScope(
          request(),
          dependencies(activeResolution()),
          { body },
        ),
      400,
      "invalid_player_request",
    );
  }
});

Deno.test("player-facing recipient identifiers remain available for scoped lookup", async () => {
  const scope = await resolvePlayerRequestScope(
    request(),
    dependencies(activeResolution()),
    { body: { recipientPlayerId: "PLAYER-1042" } },
  );

  assertEquals(scope.playerUuid, PLAYER_UUID);
  assertEquals(scope.gameId, GAME_ID);
});

Deno.test("player request scope preserves resolver authorization failures", async () => {
  await assertEdgeError(
    () =>
      resolvePlayerRequestScope(request(), {
        hashSessionToken: () => Promise.resolve("hash:player-token"),
        resolvePlayerSession: () =>
          Promise.resolve({
            ok: false as const,
            status: 401,
            error: {
              code: "invalid_player_session",
              message: "Player session is invalid or expired.",
              retryable: false,
            },
          }),
        now: () => NOW,
      }),
    401,
    "invalid_player_session",
  );
});

Deno.test("request-scope compatibility helpers enforce the same boundary", () => {
  assertEquals(
    readRequestedGameSessionId(request({ gameQuery: GAME_ID })),
    GAME_ID,
  );
  requireMatchingPlayerGameSession(GAME_ID, GAME_ID);

  assertThrowsEdgeError(
    () => rejectClientSuppliedPlayerIdentity(
      request({ ownershipHeader: ["x-player-id", OTHER_PLAYER_UUID] }),
    ),
    400,
    "invalid_player_request",
  );
  assertThrowsEdgeError(
    () => rejectClientSuppliedBodyIdentity({ owner_id: OTHER_PLAYER_UUID }),
    400,
    "invalid_player_request",
  );
  assertThrowsEdgeError(
    () => requireMatchingPlayerGameSession(OTHER_GAME_ID, GAME_ID),
    401,
    "invalid_player_session_scope",
  );
});

function dependencies(resolution: ReturnType<typeof activeResolution>) {
  return {
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(resolution),
    now: () => NOW,
  };
}

function activeResolution(overrides: {
  readonly status?: string;
  readonly expiresAt?: string;
  readonly revokedAt?: string | null;
} = {}) {
  return {
    ok: true as const,
    session: {
      id: SESSION_ID,
      game_session_id: GAME_ID,
      player_id: PLAYER_UUID,
      status: overrides.status ?? "active",
      expires_at: overrides.expiresAt ?? "2026-07-19T00:00:00.000Z",
      revoked_at: overrides.revokedAt ?? null,
    },
    gameSession: {
      id: GAME_ID,
      name: "Period 1",
      status: "active",
    },
    player: {
      id: PLAYER_UUID,
      display_name: "Avery",
      roster_label: "A-1",
      status: "active",
    },
  };
}

function request(options: {
  readonly token?: string | null;
  readonly gameQuery?: string;
  readonly gameHeader?: string;
  readonly extraQuery?: string;
  readonly ownershipHeader?: readonly [string, string];
} = {}): Request {
  const headers = new Headers();

  if (options.token !== null) {
    headers.set("x-player-session-token", options.token ?? "player-token");
  }

  if (options.gameHeader) {
    headers.set("x-econovaria-game-session-id", options.gameHeader);
  }

  if (options.ownershipHeader) {
    headers.set(options.ownershipHeader[0], options.ownershipHeader[1]);
  }

  const search = new URLSearchParams();

  if (options.gameQuery) {
    search.set("gameSessionId", options.gameQuery);
  }

  if (options.extraQuery) {
    const extra = new URLSearchParams(options.extraQuery);
    extra.forEach((value, key) => search.append(key, value));
  }

  const query = search.size ? `?${search.toString()}` : "";
  return new Request(`https://example.test/players/me/world/countries${query}`, {
    method: "GET",
    headers,
  });
}

async function assertEdgeError(
  run: () => Promise<unknown>,
  expectedStatus: number,
  expectedCode: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    assertEdgeErrorValue(error, expectedStatus, expectedCode);
    return;
  }

  throw new Error(`Expected ${expectedCode} to be thrown.`);
}

function assertThrowsEdgeError(
  run: () => unknown,
  expectedStatus: number,
  expectedCode: string,
): void {
  try {
    run();
  } catch (error) {
    assertEdgeErrorValue(error, expectedStatus, expectedCode);
    return;
  }

  throw new Error(`Expected ${expectedCode} to be thrown.`);
}

function assertEdgeErrorValue(
  error: unknown,
  expectedStatus: number,
  expectedCode: string,
): void {
  if (!(error instanceof EdgeActivationError)) {
    throw error;
  }

  assertEquals(error.status, expectedStatus);
  assertEquals(error.code, expectedCode);
  assertEquals(error.retryable, false);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
