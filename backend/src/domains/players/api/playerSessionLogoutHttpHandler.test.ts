import { handlePlayerSessionLogoutRequest } from "./playerSessionLogoutHttpHandler.ts";
import type {
  PlayerSessionLogoutRecord,
  PlayerSessionLogoutRepository,
  RevokeActivePlayerSessionInput,
} from "../infrastructure/playerSessionLogoutRepository.ts";
import { PlayerSessionLogoutPersistenceError } from "../infrastructure/playerSessionLogoutRepository.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const NOW = "2026-07-17T08:00:00.000Z";

Deno.test("player logout rejects unsupported methods and missing sessions", async () => {
  const wrongMethod = await handlePlayerSessionLogoutRequest(
    request({ method: "GET" }),
    dependencies(),
  );
  const missingSession = await handlePlayerSessionLogoutRequest(
    request({ authToken: null }),
    dependencies(),
  );

  await assertErrorResponse(wrongMethod, 405, "method_not_allowed");
  await assertErrorResponse(missingSession, 401, "invalid_player_session");
});

Deno.test("player logout rejects server-owned runner credentials", async () => {
  const response = await handlePlayerSessionLogoutRequest(
    request({ runnerSecret: "runner-secret" }),
    dependencies(),
  );

  await assertErrorResponse(response, 400, "stock_runner_secret_not_allowed");
});

Deno.test("player logout conditionally revokes only the token-owned session scope", async () => {
  const repository = new MockLogoutRepository([activeSession()]);
  const response = await handlePlayerSessionLogoutRequest(
    request({ gameSessionId: GAME_SESSION_ID }),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    message: "Player session logged out.",
    alreadyLoggedOut: false,
    session: {
      id: PLAYER_SESSION_ID,
      status: "revoked",
      revokedAt: NOW,
    },
  });
  assertEquals(repository.findHashes, ["hash:player-token"]);
  assertEquals(repository.revokeInputs, [{
    id: PLAYER_SESSION_ID,
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    sessionTokenHash: "hash:player-token",
    revokedAt: NOW,
  }]);
});

Deno.test("player logout is replay-safe for an already revoked token", async () => {
  const repository = new MockLogoutRepository([
    revokedSession({ revokedAt: "2026-07-17T07:55:00.000Z" }),
  ]);
  let resolveCalls = 0;
  const response = await handlePlayerSessionLogoutRequest(
    request(),
    dependencies({
      repository,
      resolvePlayerSession: () => {
        resolveCalls += 1;
        return validSessionResolution();
      },
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.alreadyLoggedOut, true);
  assertEquals(body.session.revokedAt, "2026-07-17T07:55:00.000Z");
  assertEquals(repository.revokeInputs, []);
  assertEquals(resolveCalls, 0);
});

Deno.test("player logout treats a concurrent winning revocation as success", async () => {
  const repository = new MockLogoutRepository(
    [activeSession(), revokedSession()],
    { returnNullOnRevoke: true },
  );
  const response = await handlePlayerSessionLogoutRequest(
    request(),
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.alreadyLoggedOut, true);
  assertEquals(repository.findHashes, [
    "hash:player-token",
    "hash:player-token",
  ]);
  assertEquals(repository.revokeInputs.length, 1);
});

Deno.test("player logout rejects mismatched game scope and client-supplied identities", async () => {
  const mismatchedGame = await handlePlayerSessionLogoutRequest(
    request({ gameSessionId: OTHER_GAME_SESSION_ID }),
    dependencies(),
  );
  const queryPlayer = await handlePlayerSessionLogoutRequest(
    request({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    dependencies(),
  );
  const bodyPlayer = await handlePlayerSessionLogoutRequest(
    request({ body: { playerId: OTHER_PLAYER_ID } }),
    dependencies(),
  );

  await assertErrorResponse(
    mismatchedGame,
    401,
    "invalid_player_session_scope",
  );
  await assertErrorResponse(queryPlayer, 400, "invalid_player_request");
  await assertErrorResponse(bodyPlayer, 400, "invalid_player_request");
});

Deno.test("player logout rejects expired sessions and resolver scope mismatches", async () => {
  const expired = await handlePlayerSessionLogoutRequest(
    request(),
    dependencies({
      repository: new MockLogoutRepository([
        activeSession({ expiresAt: "2020-01-01T00:00:00.000Z" }),
      ]),
    }),
  );
  const mismatchedResolver = await handlePlayerSessionLogoutRequest(
    request(),
    dependencies({
      resolvePlayerSession: () =>
        Promise.resolve({
          ...(validSessionResolutionValue()),
          session: {
            ...validSessionResolutionValue().session,
            player_id: OTHER_PLAYER_ID,
          },
        }),
    }),
  );

  await assertErrorResponse(expired, 401, "invalid_player_session");
  await assertErrorResponse(
    mismatchedResolver,
    500,
    "player_logout_scope_violation",
  );
});

Deno.test("player logout maps persistence failures without leaking details", async () => {
  const response = await handlePlayerSessionLogoutRequest(
    request(),
    dependencies({
      repository: new MockLogoutRepository([], { failFind: true }),
    }),
  );

  await assertErrorResponse(response, 500, "player_logout_failed");
});

function dependencies(options: {
  readonly repository?: MockLogoutRepository;
  readonly resolvePlayerSession?: () => ReturnType<
    typeof validSessionResolution
  >;
} = {}) {
  const repository = options.repository ??
    new MockLogoutRepository([activeSession()]);

  return {
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    createServiceClient: () => ({} as never),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: options.resolvePlayerSession ??
      validSessionResolution,
    createRepository: () => repository,
    now: () => NOW,
  };
}

function request(options: {
  readonly method?: string;
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly extraQuery?: string;
  readonly body?: unknown;
  readonly runnerSecret?: string;
} = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.gameSessionId) {
    headers.set("x-econovaria-game-session-id", options.gameSessionId);
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  const query = options.extraQuery ? `?${options.extraQuery}` : "";
  const init: RequestInit = {
    method: options.method ?? "POST",
    headers,
  };

  if (options.body !== undefined) {
    init.body = JSON.stringify(options.body);
  }

  return new Request(
    `https://example.test/players/me/session/logout${query}`,
    init,
  );
}

class MockLogoutRepository implements PlayerSessionLogoutRepository {
  readonly findHashes: string[] = [];
  readonly revokeInputs: RevokeActivePlayerSessionInput[] = [];
  private readonly findResults: (PlayerSessionLogoutRecord | null)[];

  constructor(
    findResults: readonly (PlayerSessionLogoutRecord | null)[],
    private readonly options: {
      readonly returnNullOnRevoke?: boolean;
      readonly failFind?: boolean;
    } = {},
  ) {
    this.findResults = [...findResults];
  }

  findByTokenHash(
    sessionTokenHash: string,
  ): Promise<PlayerSessionLogoutRecord | null> {
    this.findHashes.push(sessionTokenHash);

    if (this.options.failFind) {
      throw new PlayerSessionLogoutPersistenceError(
        "player_logout_failed",
        "Player logout could not be completed.",
      );
    }

    return Promise.resolve(this.findResults.shift() ?? null);
  }

  revokeActiveSession(
    input: RevokeActivePlayerSessionInput,
  ): Promise<PlayerSessionLogoutRecord | null> {
    this.revokeInputs.push(input);

    if (this.options.returnNullOnRevoke) {
      return Promise.resolve(null);
    }

    return Promise.resolve(revokedSession({
      id: input.id,
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      revokedAt: input.revokedAt,
    }));
  }
}

function activeSession(
  overrides: Partial<PlayerSessionLogoutRecord> = {},
): PlayerSessionLogoutRecord {
  return {
    id: PLAYER_SESSION_ID,
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    status: "active",
    expiresAt: "2099-07-17T08:00:00.000Z",
    revokedAt: null,
    ...overrides,
  };
}

function revokedSession(
  overrides: Partial<PlayerSessionLogoutRecord> = {},
): PlayerSessionLogoutRecord {
  return activeSession({
    status: "revoked",
    revokedAt: NOW,
    ...overrides,
  });
}

function validSessionResolution() {
  return Promise.resolve(validSessionResolutionValue());
}

function validSessionResolutionValue() {
  return {
    ok: true as const,
    session: {
      id: PLAYER_SESSION_ID,
      game_session_id: GAME_SESSION_ID,
      player_id: PLAYER_ID,
      status: "active",
      expires_at: "2099-07-17T08:00:00.000Z",
      revoked_at: null,
    },
    gameSession: {
      id: GAME_SESSION_ID,
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

async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedCode: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, expectedStatus);
  assertEquals(body.ok, false);
  assertEquals(body.error.code, expectedCode);
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
