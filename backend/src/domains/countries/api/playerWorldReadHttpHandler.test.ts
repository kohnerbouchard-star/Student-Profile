import { handlePlayerWorldReadRequest } from "./playerWorldReadHttpHandler.ts";
import type {
  PlayerWorldCountryCollectionRecord,
  PlayerWorldCountryDetailReadInput,
  PlayerWorldCountryDetailRecord,
  PlayerWorldCountryReadInput,
  PlayerWorldCountryRecord,
  PlayerWorldNewsCollectionRecord,
  PlayerWorldNewsReadInput,
  PlayerWorldNewsRecord,
  PlayerWorldReadRepository,
  PlayerWorldRoute,
} from "../contracts/playerWorldReadContracts.ts";
import { PlayerWorldReadPersistenceError } from "../contracts/playerWorldReadContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const COUNTRY_ID = "00000000-0000-4000-8000-000000000031";
const OTHER_COUNTRY_ID = "00000000-0000-4000-8000-000000000032";
const SNAPSHOT_ID = "00000000-0000-4000-8000-000000000041";
const EVENT_ID = "00000000-0000-4000-8000-000000000051";
const NOW = "2026-07-17T08:00:00.000Z";

Deno.test("player world reads reject unsupported methods and missing sessions", async () => {
  const wrongMethod = await handlePlayerWorldReadRequest(
    request({ method: "POST" }),
    { kind: "countries" },
    dependencies(),
  );
  const missingSession = await handlePlayerWorldReadRequest(
    request({ authToken: null }),
    { kind: "countries" },
    dependencies(),
  );

  await assertErrorResponse(wrongMethod, 405, "method_not_allowed");
  await assertErrorResponse(missingSession, 401, "invalid_player_session");
});

Deno.test("player world reads derive player and game scope from the player token", async () => {
  const repository = new MockWorldRepository();
  const response = await handlePlayerWorldReadRequest(
    request({ gameSessionId: GAME_SESSION_ID }),
    { kind: "countries" },
    dependencies({ repository }),
  );

  assertEquals(response.status, 200);
  assertEquals(repository.countryInputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    effectiveAtIso: NOW,
  }]);
});

Deno.test("player world reads reject identity injection, scope mismatch, and runner secrets", async () => {
  const suppliedPlayer = await handlePlayerWorldReadRequest(
    request({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    { kind: "countries" },
    dependencies(),
  );
  const suppliedSession = await handlePlayerWorldReadRequest(
    request({ playerSessionIdHeader: PLAYER_SESSION_ID }),
    { kind: "countries" },
    dependencies(),
  );
  const mismatchedGame = await handlePlayerWorldReadRequest(
    request({ gameSessionId: OTHER_GAME_SESSION_ID }),
    { kind: "countries" },
    dependencies(),
  );
  const runnerSecret = await handlePlayerWorldReadRequest(
    request({ runnerSecret: "runner-secret" }),
    { kind: "news" },
    dependencies(),
  );

  await assertErrorResponse(suppliedPlayer, 400, "invalid_player_request");
  await assertErrorResponse(suppliedSession, 400, "invalid_player_request");
  await assertErrorResponse(
    mismatchedGame,
    401,
    "invalid_player_session_scope",
  );
  await assertErrorResponse(
    runnerSecret,
    400,
    "stock_runner_secret_not_allowed",
  );
});

Deno.test("player country collection returns only authoritative profile and economy fields", async () => {
  const response = await handlePlayerWorldReadRequest(
    request(),
    { kind: "countries" },
    dependencies(),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    gameSession: {
      id: GAME_SESSION_ID,
      name: "Period 1",
      status: "active",
    },
    player: {
      id: PLAYER_ID,
      displayName: "Avery",
      rosterLabel: "A-1",
      status: "active",
    },
    generatedAt: NOW,
    playerCountryProfileId: COUNTRY_ID,
    items: [countryDto()],
  });
  assertEquals("metadata" in body.items[0], false);
  assertEquals("policy" in body.items[0], false);
  assertEquals("tradePartners" in body.items[0], false);
});

Deno.test("player country detail accepts country codes and returns a scoped detail", async () => {
  const repository = new MockWorldRepository();
  const response = await handlePlayerWorldReadRequest(
    request({ path: "/players/me/world/countries/northreach" }),
    { kind: "country", countryIdentifier: " northreach " },
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.detailInputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    effectiveAtIso: NOW,
    countryIdentifier: "NORTHREACH",
  }]);
  assertEquals(body.country, countryDto());
});

Deno.test("player country detail rejects malformed identifiers and hides missing countries", async () => {
  const malformed = await handlePlayerWorldReadRequest(
    request({ path: "/players/me/world/countries/bad" }),
    { kind: "country", countryIdentifier: "bad/id" },
    dependencies(),
  );
  const missing = await handlePlayerWorldReadRequest(
    request({ path: "/players/me/world/countries/unknown" }),
    { kind: "country", countryIdentifier: "unknown" },
    dependencies({
      repository: new MockWorldRepository({ missingCountry: true }),
    }),
  );

  await assertErrorResponse(malformed, 400, "invalid_player_world_request");
  await assertErrorResponse(missing, 404, "player_world_country_not_found");
});

Deno.test("player world news validates and forwards bounded filters", async () => {
  const repository = new MockWorldRepository();
  const response = await handlePlayerWorldReadRequest(
    request({
      extraQuery: "limit=25&category=POLICY",
      path: "/players/me/world/news",
    }),
    { kind: "news" },
    dependencies({ repository }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(repository.newsInputs, [{
    gameSessionId: GAME_SESSION_ID,
    limit: 25,
    category: "policy",
  }]);
  assertEquals(body.page, { limit: 25, returned: 1 });
  assertEquals(body.items, [{
    id: EVENT_ID,
    shockId: "policy-1",
    category: "policy",
    sentiment: "mixed",
    source: "staff",
    scope: "country",
    targetKey: "NORTHREACH",
    headline: "Northreach policy changes",
    explanation: "A public policy event was published.",
    impact: {
      magnitude: -0.02,
      confidence: 0.8,
      volatility: 0.01,
      volume: null,
    },
    tick: { created: 14, expires: 20 },
    createdAt: "2026-07-17T07:00:00.000Z",
    updatedAt: "2026-07-17T07:30:00.000Z",
  }]);
});

Deno.test("player world news rejects duplicate, non-integer, and out-of-range limits", async () => {
  for (
    const query of [
      "limit=1&limit=2",
      "limit=1.5",
      "limit=0",
      "limit=101",
      "category=not-real",
      "category=policy&category=macro",
    ]
  ) {
    const response = await handlePlayerWorldReadRequest(
      request({ extraQuery: query, path: "/players/me/world/news" }),
      { kind: "news" },
      dependencies(),
    );

    await assertErrorResponse(response, 400, "invalid_player_world_request");
  }
});

Deno.test("player world reads fail closed on repository scope leaks", async () => {
  const countryLeak = await handlePlayerWorldReadRequest(
    request(),
    { kind: "countries" },
    dependencies({
      repository: new MockWorldRepository({
        countryGameSessionId: OTHER_GAME_SESSION_ID,
      }),
    }),
  );
  const newsLeak = await handlePlayerWorldReadRequest(
    request({ path: "/players/me/world/news" }),
    { kind: "news" },
    dependencies({
      repository: new MockWorldRepository({
        newsGameSessionId: OTHER_GAME_SESSION_ID,
      }),
    }),
  );

  await assertErrorResponse(countryLeak, 500, "player_world_scope_violation");
  await assertErrorResponse(newsLeak, 500, "player_world_scope_violation");
});

Deno.test("player world reads map persistence errors without leaking details", async () => {
  const response = await handlePlayerWorldReadRequest(
    request(),
    { kind: "countries" },
    dependencies({ repository: new MockWorldRepository({ shouldFail: true }) }),
  );

  await assertErrorResponse(response, 500, "player_world_read_failed");
});

function dependencies(options: {
  readonly repository?: MockWorldRepository;
  readonly sessionMode?: "ok" | "invalid";
} = {}): any {
  const repository = options.repository ?? new MockWorldRepository();

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
    resolvePlayerSession: () => {
      if (options.sessionMode === "invalid") {
        return Promise.resolve({
          ok: false as const,
          status: 401,
          error: {
            code: "invalid_player_session",
            message: "Player session is invalid or expired.",
            retryable: false,
          },
        });
      }

      return Promise.resolve({
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
      });
    },
    createRepository: () => repository,
    now: () => NOW,
  };
}

function request(options: {
  readonly method?: string;
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly extraQuery?: string;
  readonly playerSessionIdHeader?: string;
  readonly runnerSecret?: string;
  readonly path?: string;
} = {}): Request {
  const headers = new Headers();

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.gameSessionId) {
    headers.set("x-econovaria-game-session-id", options.gameSessionId);
  }

  if (options.playerSessionIdHeader) {
    headers.set("x-player-session-id", options.playerSessionIdHeader);
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  const query = options.extraQuery ? `?${options.extraQuery}` : "";
  return new Request(
    `https://example.test${
      options.path ?? "/players/me/world/countries"
    }${query}`,
    { method: options.method ?? "GET", headers },
  );
}

class MockWorldRepository implements PlayerWorldReadRepository {
  readonly countryInputs: PlayerWorldCountryReadInput[] = [];
  readonly detailInputs: PlayerWorldCountryDetailReadInput[] = [];
  readonly newsInputs: PlayerWorldNewsReadInput[] = [];

  constructor(
    private readonly options: {
      readonly missingCountry?: boolean;
      readonly countryGameSessionId?: string;
      readonly newsGameSessionId?: string;
      readonly shouldFail?: boolean;
    } = {},
  ) {}

  readCountries(
    input: PlayerWorldCountryReadInput,
  ): Promise<PlayerWorldCountryCollectionRecord> {
    this.countryInputs.push(input);
    this.failIfRequested();
    return Promise.resolve({
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      playerCountryProfileId: COUNTRY_ID,
      countries: [countryRecord({
        snapshotGameSessionId: this.options.countryGameSessionId,
      })],
    });
  }

  readCountry(
    input: PlayerWorldCountryDetailReadInput,
  ): Promise<PlayerWorldCountryDetailRecord> {
    this.detailInputs.push(input);
    this.failIfRequested();
    return Promise.resolve({
      gameSessionId: input.gameSessionId,
      playerId: input.playerId,
      playerCountryProfileId: COUNTRY_ID,
      country: this.options.missingCountry ? null : countryRecord(),
    });
  }

  readNews(
    input: PlayerWorldNewsReadInput,
  ): Promise<PlayerWorldNewsCollectionRecord> {
    this.newsInputs.push(input);
    this.failIfRequested();
    return Promise.resolve({
      gameSessionId: input.gameSessionId,
      news: [newsRecord({ gameSessionId: this.options.newsGameSessionId })],
    });
  }

  private failIfRequested(): void {
    if (this.options.shouldFail) {
      throw new PlayerWorldReadPersistenceError(
        "player_world_read_failed",
        "Player world data could not be loaded.",
      );
    }
  }
}

function countryRecord(options: {
  readonly snapshotGameSessionId?: string;
} = {}): PlayerWorldCountryRecord {
  return {
    profile: {
      id: COUNTRY_ID,
      countryCode: "NORTHREACH",
      countryName: "Northreach",
      capitalName: "Frostgate",
      currencyCode: "NRT",
      mapRegion: "northwest",
      mapColor: "purple",
    },
    latestEconomicSnapshot: {
      id: SNAPSHOT_ID,
      gameSessionId: options.snapshotGameSessionId ?? GAME_SESSION_ID,
      countryProfileId: COUNTRY_ID,
      snapshotSequence: 4,
      effectiveAt: "2026-07-17T07:45:00.000Z",
      snapshotLabel: "Tick 4",
      difficultyPreset: "standard",
      realGdpIndex: 104.2,
      gdpGrowthRate: 0.031,
      inflationRate: 0.027,
      unemploymentRate: 0.043,
      interestRate: 0.04,
      consumerConfidenceIndex: 108,
      businessConfidenceIndex: 111,
      costOfLivingIndex: 1.02,
      regionalPriceMultiplier: 1.01,
      supplyConstraintIndex: 0.98,
      importDependencyIndex: 0.8,
      taxRate: 0.18,
      subsidyRate: 0.02,
      exchangeRateIndex: 1.04,
      currencyStabilityIndex: 1.08,
      tradeBalanceIndex: 12,
      exportStrengthIndex: 1.12,
      marketRiskIndex: 0.92,
      politicalStabilityIndex: 1.15,
      infrastructureIndex: 1.2,
      energySecurityIndex: 0.9,
    },
  };
}

function countryDto() {
  return {
    id: COUNTRY_ID,
    countryCode: "NORTHREACH",
    countryName: "Northreach",
    capitalName: "Frostgate",
    currencyCode: "NRT",
    map: { region: "northwest", color: "purple" },
    isPlayerCountry: true,
    economy: {
      id: SNAPSHOT_ID,
      sequence: 4,
      effectiveAt: "2026-07-17T07:45:00.000Z",
      label: "Tick 4",
      difficultyPreset: "standard",
      realGdpIndex: 104.2,
      gdpGrowthRate: 0.031,
      inflationRate: 0.027,
      unemploymentRate: 0.043,
      interestRate: 0.04,
      consumerConfidenceIndex: 108,
      businessConfidenceIndex: 111,
      costOfLivingIndex: 1.02,
      regionalPriceMultiplier: 1.01,
      supplyConstraintIndex: 0.98,
      importDependencyIndex: 0.8,
      taxRate: 0.18,
      subsidyRate: 0.02,
      exchangeRateIndex: 1.04,
      currencyStabilityIndex: 1.08,
      tradeBalanceIndex: 12,
      exportStrengthIndex: 1.12,
      marketRiskIndex: 0.92,
      politicalStabilityIndex: 1.15,
      infrastructureIndex: 1.2,
      energySecurityIndex: 0.9,
    },
  };
}

function newsRecord(overrides: {
  readonly gameSessionId?: string;
} = {}): PlayerWorldNewsRecord {
  return {
    id: EVENT_ID,
    gameSessionId: overrides.gameSessionId ?? GAME_SESSION_ID,
    shockId: "policy-1",
    category: "policy",
    sentiment: "mixed",
    source: "staff",
    scope: "country",
    targetKey: "NORTHREACH",
    headline: "Northreach policy changes",
    explanation: "A public policy event was published.",
    magnitude: -0.02,
    confidence: 0.8,
    volatilityImpact: 0.01,
    volumeImpact: null,
    createdTick: 14,
    expiresTick: 20,
    createdAt: "2026-07-17T07:00:00.000Z",
    updatedAt: "2026-07-17T07:30:00.000Z",
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
