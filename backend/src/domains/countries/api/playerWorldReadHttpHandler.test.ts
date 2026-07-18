import type { PlayerWorldReadRepository } from "../contracts/playerWorldReadContracts.ts";
import { handlePlayerWorldReadRequest } from "./playerWorldReadHttpHandler.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const SESSION = "00000000-0000-4000-8000-000000000011";
const PLAYER = "00000000-0000-4000-8000-000000000021";
const PROFILE = "00000000-0000-4000-8000-000000000031";
const NOW = new Date("2026-07-18T02:00:00.000Z");

Deno.test("countries, country detail, and news use the authenticated scope", async () => {
  const repository = worldRepository();
  const countries = await handlePlayerWorldReadRequest(
    request("/players/me/world/countries"),
    { kind: "countries" },
    dependencies(activeResolution(), repository),
  );
  assertEquals(countries.status, 200);
  const countriesBody = await countries.json();
  assertEquals(countriesBody.items[0].id, "NRC");
  assertNoUuid(JSON.stringify(countriesBody));

  const detail = await handlePlayerWorldReadRequest(
    request("/players/me/world/countries/NRC"),
    { kind: "country", countryIdentifier: "NRC" },
    dependencies(activeResolution(), repository),
  );
  assertEquals(detail.status, 200);
  assertEquals((await detail.json()).country.countryCode, "NRC");

  const news = await handlePlayerWorldReadRequest(
    request("/players/me/world/news?limit=1"),
    { kind: "news" },
    dependencies(activeResolution(), repository),
  );
  assertEquals(news.status, 200);
  const newsBody = await news.json();
  assertEquals(newsBody.page.returned, 1);
  assertEquals(typeof newsBody.page.nextCursor, "string");
  assertNoUuid(JSON.stringify(newsBody));
});

Deno.test("world handlers distinguish empty feeds from unavailable services", async () => {
  const empty = await handlePlayerWorldReadRequest(
    request("/players/me/world/news"),
    { kind: "news" },
    dependencies(activeResolution(), worldRepository({ news: [] })),
  );
  assertEquals(empty.status, 200);
  assertEquals((await empty.json()).items, []);

  const unavailable = await handlePlayerWorldReadRequest(
    request("/players/me/world/news"),
    { kind: "news" },
    dependencies(activeResolution(), {
      ...worldRepository(),
      readNews: () => Promise.reject(new Error("database unavailable")),
    }),
  );
  assertEquals(unavailable.status, 500);
  assertEquals((await unavailable.json()).code, "player_world_read_failed");
});

Deno.test("world handlers reject missing, expired, revoked, and wrong-game sessions", async () => {
  const repository = worldRepository();
  const missing = await handlePlayerWorldReadRequest(
    request("/players/me/world/countries", { token: null }),
    { kind: "countries" },
    dependencies(activeResolution(), repository),
  );
  assertEquals(missing.status, 401);
  assertEquals((await missing.json()).code, "missing_player_session");

  for (const [resolution, code] of [
    [activeResolution({ expiresAt: "2026-07-17T00:00:00.000Z" }), "player_session_expired"],
    [activeResolution({ status: "revoked", revokedAt: NOW.toISOString() }), "player_session_revoked"],
  ] as const) {
    const response = await handlePlayerWorldReadRequest(
      request("/players/me/world/countries"),
      { kind: "countries" },
      dependencies(resolution, repository),
    );
    assertEquals(response.status, 401);
    assertEquals((await response.json()).code, code);
  }

  const wrongGame = await handlePlayerWorldReadRequest(
    request(`/players/me/world/countries?gameSessionId=${OTHER_GAME}`),
    { kind: "countries" },
    dependencies(activeResolution(), repository),
  );
  assertEquals(wrongGame.status, 401);
  assertEquals((await wrongGame.json()).code, "invalid_player_session_scope");
});

Deno.test("world handlers reject UUID ownership injection", async () => {
  for (const candidate of [
    request(`/players/me/world/countries?player_uuid=${PLAYER}`),
    request("/players/me/world/countries", { header: ["x-player-uuid", PLAYER] }),
    request("/players/me/world/news", { header: ["x-owner-uuid", PLAYER] }),
  ]) {
    const response = await handlePlayerWorldReadRequest(
      candidate,
      candidate.url.includes("news") ? { kind: "news" } : { kind: "countries" },
      dependencies(activeResolution(), worldRepository()),
    );
    assertEquals(response.status, 400);
    assertEquals((await response.json()).code, "invalid_player_request");
  }
});

function dependencies(resolution: ReturnType<typeof activeResolution>, repository: PlayerWorldReadRepository) {
  return {
    createServiceClient: () => ({}) as never,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "http://localhost:54321",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service",
      },
    }),
    hashSessionToken: (token: string) => Promise.resolve(`hash:${token}`),
    resolvePlayerSession: () => Promise.resolve(resolution),
    createRepository: () => repository,
    now: () => NOW,
  };
}

function worldRepository(options: { readonly news?: readonly ReturnType<typeof newsRecord>[] } = {}): PlayerWorldReadRepository {
  const country = countryRecord();
  return {
    readCountries: (input) => Promise.resolve({
      gameId: input.gameId,
      playerUuid: input.playerUuid,
      playerCountryProfileUuid: PROFILE,
      countries: [country],
    }),
    readCountry: (input) => Promise.resolve({
      gameId: input.gameId,
      playerUuid: input.playerUuid,
      playerCountryProfileUuid: PROFILE,
      country,
    }),
    readNews: (input) => Promise.resolve({
      gameId: input.gameId,
      news: options.news ?? [newsRecord("event-b", 4), newsRecord("event-a", 3)],
    }),
  };
}

function countryRecord() {
  return {
    countryProfileUuid: PROFILE,
    countryCode: "NRC",
    countryName: "Northreach",
    capitalName: "Frostholm",
    currencyCode: "NRC",
    status: "active" as const,
    flagUrl: "/assets/flags/nrc.svg",
    mapRegion: "northreach",
    mapColor: "#123456",
    snapshot: {
      gameId: GAME,
      countryProfileUuid: PROFILE,
      sequence: 1,
      effectiveAt: NOW.toISOString(),
      gdpGrowthRate: 0.02,
      inflationRate: 0.03,
      unemploymentRate: 0.04,
      interestRate: 0.05,
      consumerConfidenceIndex: 101,
      businessConfidenceIndex: 99,
      exchangeRateIndex: 1,
      marketRiskIndex: 0.8,
      politicalStabilityIndex: 1.1,
    },
  };
}

function newsRecord(publicId: string, createdTick: number) {
  return {
    gameId: GAME,
    publicId,
    category: "macro",
    sentiment: "neutral",
    source: "system",
    scope: "global",
    targetKey: null,
    headline: publicId,
    explanation: "News",
    magnitude: 0.1,
    confidence: 0.9,
    volatilityImpact: null,
    volumeImpact: null,
    createdTick,
    expiresTick: null,
    publishedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    imageUrl: null,
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
      id: SESSION,
      game_session_id: GAME,
      player_id: PLAYER,
      status: overrides.status ?? "active",
      expires_at: overrides.expiresAt ?? "2026-07-19T00:00:00.000Z",
      revoked_at: overrides.revokedAt ?? null,
    },
    gameSession: { id: GAME, name: "Period 1", status: "active" },
    player: { id: PLAYER, display_name: "Avery", roster_label: "A-1", status: "active" },
  };
}

function request(path: string, options: {
  readonly token?: string | null;
  readonly header?: readonly [string, string];
} = {}): Request {
  const headers = new Headers();
  if (options.token !== null) headers.set("x-player-session-token", options.token ?? "player-token");
  if (options.header) headers.set(options.header[0], options.header[1]);
  return new Request(`https://example.test${path}`, { method: "GET", headers });
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`Browser DTO exposed UUID: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}
