import { EdgeActivationError } from "../platform/supabase/edgeResponse.ts";
import { resolvePlayerRequestScope } from "../domains/players/api/playerRequestScope.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_ID = "00000000-0000-4000-8000-000000000002";
const SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const NOW = new Date("2026-07-18T00:00:00.000Z");

Deno.test("authorization matrix: repeated invalid-token attempts fail closed with uniform public errors", async () => {
  const rawTokens: string[] = [];
  const resolvedHashes: string[] = [];

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const token = `invalid-attempt-${attempt}`;
    const error = await captureEdgeError(() =>
      resolvePlayerRequestScope(request({ token }), {
        hashSessionToken: (rawToken) => {
          rawTokens.push(rawToken);
          return Promise.resolve(`sha256:${rawToken}`);
        },
        resolvePlayerSession: (hash) => {
          resolvedHashes.push(hash);
          return Promise.resolve({
            ok: false as const,
            status: 401,
            error: {
              code: "invalid_player_session",
              message: "Player session is invalid or expired.",
              retryable: false,
            },
          });
        },
        now: () => NOW,
      })
    );

    assertPublicError(error, 401, "invalid_player_session");
    assertNotContains(JSON.stringify(publicError(error)), token);
    assertNotContains(JSON.stringify(publicError(error)), `sha256:${token}`);
  }

  assertEquals(rawTokens.length, 25);
  assertEquals(new Set(rawTokens).size, 25);
  assertEquals(resolvedHashes.length, 25);
  assert(resolvedHashes.every((hash) => hash.startsWith("sha256:")));
});

Deno.test("authorization matrix: revoked, expired, inactive, and malformed-expiry sessions fail closed", async () => {
  const cases = [
    {
      resolution: activeResolution({
        status: "revoked",
        revokedAt: "2026-07-17T23:59:00.000Z",
      }),
      status: 401,
      code: "player_session_revoked",
    },
    {
      resolution: activeResolution({
        expiresAt: "2026-07-18T00:00:00.000Z",
      }),
      status: 401,
      code: "player_session_expired",
    },
    {
      resolution: activeResolution({ status: "disabled" }),
      status: 401,
      code: "player_session_inactive",
    },
    {
      resolution: activeResolution({ expiresAt: "not-a-timestamp" }),
      status: 409,
      code: "invalid_player_session_expiry",
    },
  ] as const;

  for (const testCase of cases) {
    const error = await captureEdgeError(() =>
      resolvePlayerRequestScope(
        request(),
        dependencies(testCase.resolution),
      )
    );

    assertPublicError(error, testCase.status, testCase.code);
    assertNoInternalIdentifiers(publicError(error));
  }
});

Deno.test("authorization matrix: replay of a token after revocation is rejected", async () => {
  let resolutionCount = 0;
  const dependenciesWithRevocation = {
    hashSessionToken: (token: string) => Promise.resolve(`sha256:${token}`),
    resolvePlayerSession: () => {
      resolutionCount += 1;
      return Promise.resolve(
        resolutionCount === 1 ? activeResolution() : activeResolution({
          status: "revoked",
          revokedAt: "2026-07-18T00:00:01.000Z",
        }),
      );
    },
    now: () => NOW,
  };

  const firstScope = await resolvePlayerRequestScope(
    request({ token: "replayed-token" }),
    dependenciesWithRevocation,
  );
  assertEquals(firstScope.gameId, GAME_ID);
  assertEquals(firstScope.playerUuid, PLAYER_ID);

  const replayError = await captureEdgeError(() =>
    resolvePlayerRequestScope(
      request({ token: "replayed-token" }),
      dependenciesWithRevocation,
    )
  );
  assertPublicError(replayError, 401, "player_session_revoked");
  assertEquals(resolutionCount, 2);
});

Deno.test("authorization matrix: cross-game request hints and cross-game resolved rows are rejected", async () => {
  const wrongHint = await captureEdgeError(() =>
    resolvePlayerRequestScope(
      request({ gameId: OTHER_GAME_ID }),
      dependencies(activeResolution()),
    )
  );
  assertPublicError(wrongHint, 401, "invalid_player_session_scope");

  const mismatchedGame = activeResolution();
  mismatchedGame.gameSession.id = OTHER_GAME_ID;
  const wrongResolvedGame = await captureEdgeError(() =>
    resolvePlayerRequestScope(
      request(),
      dependencies(mismatchedGame),
    )
  );
  assertPublicError(wrongResolvedGame, 401, "invalid_player_session_scope");
});

Deno.test("authorization matrix: wrong-player resolution and ownership injection are rejected", async () => {
  const mismatchedPlayer = activeResolution();
  mismatchedPlayer.player.id = OTHER_PLAYER_ID;
  const wrongPlayer = await captureEdgeError(() =>
    resolvePlayerRequestScope(request(), dependencies(mismatchedPlayer))
  );
  assertPublicError(wrongPlayer, 401, "invalid_player_session_scope");

  const injectedOwner = await captureEdgeError(() =>
    resolvePlayerRequestScope(
      request({ playerId: OTHER_PLAYER_ID }),
      dependencies(activeResolution()),
    )
  );
  assertPublicError(injectedOwner, 400, "invalid_player_request");
});

Deno.test("authorization matrix: active owner succeeds without accepting browser-selected ownership", async () => {
  const scope = await resolvePlayerRequestScope(
    request(),
    dependencies(activeResolution()),
  );

  assertEquals(scope, {
    playerUuid: PLAYER_ID,
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
});

function dependencies(resolution: ReturnType<typeof activeResolution>) {
  return {
    hashSessionToken: (token: string) => Promise.resolve(`sha256:${token}`),
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
      player_id: PLAYER_ID,
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
      id: PLAYER_ID,
      display_name: "Avery",
      roster_label: "A-1",
      status: "active",
    },
  };
}

function request(options: {
  readonly token?: string;
  readonly gameId?: string;
  readonly playerId?: string;
} = {}): Request {
  const url = new URL("https://example.test/players/me/inventory");
  const headers = new Headers({
    "x-player-session-token": options.token ?? "active-player-token",
  });

  if (options.gameId) {
    headers.set("x-econovaria-game-session-id", options.gameId);
  }

  if (options.playerId) {
    headers.set("x-player-id", options.playerId);
  }

  return new Request(url, { headers });
}

async function captureEdgeError(
  run: () => Promise<unknown>,
): Promise<EdgeActivationError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof EdgeActivationError) {
      return error;
    }
    throw error;
  }

  throw new Error("Expected request authorization to fail.");
}

function publicError(error: EdgeActivationError): Record<string, unknown> {
  return {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
  };
}

function assertPublicError(
  error: EdgeActivationError,
  expectedStatus: number,
  expectedCode: string,
): void {
  assertEquals(error.status, expectedStatus);
  assertEquals(error.code, expectedCode);
  assertEquals(error.retryable, false);
}

function assertNoInternalIdentifiers(value: unknown): void {
  const text = JSON.stringify(value);
  for (
    const identifier of [
      GAME_ID,
      OTHER_GAME_ID,
      SESSION_ID,
      PLAYER_ID,
      OTHER_PLAYER_ID,
    ]
  ) {
    assertNotContains(text, identifier);
  }
}

function assertNotContains(actual: string, forbidden: string): void {
  if (actual.includes(forbidden)) {
    throw new Error(`Expected value not to contain ${forbidden}.`);
  }
}

function assert(condition: boolean): void {
  if (!condition) {
    throw new Error("Assertion failed.");
  }
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
