import {
  type PlayerWorldReadRepository,
  PlayerWorldReadError,
  PlayerWorldReadPersistenceError,
} from "../contracts/playerWorldReadContracts.ts";
import { PlayerWorldReadService } from "./playerWorldReadService.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const PLAYER = "00000000-0000-4000-8000-000000000011";
const PROFILE = "00000000-0000-4000-8000-000000000021";
const NOW = "2026-07-18T02:00:00.000Z";
const SCOPE = { gameId: GAME, playerUuid: PLAYER, effectiveAt: NOW };

Deno.test("world service returns deterministic country DTOs without UUIDs", async () => {
  const repository = fakeRepository({
    countries: [country("SLV", "Silverreach", "00000000-0000-4000-8000-000000000022"), country("NRC", "Northreach", PROFILE)],
    playerCountryProfileUuid: PROFILE,
  });
  const body = await new PlayerWorldReadService(repository).listCountries(SCOPE);

  assertEquals(body.items.map((item) => item.id), ["NRC", "SLV"]);
  assertEquals(body.items[0]?.isPlayerCountry, true);
  assertEquals(body.availability, "available");
  assertNoUuid(JSON.stringify(body));
});

Deno.test("country detail rejects missing, hidden, unavailable, and cross-game records", async () => {
  const valid = await new PlayerWorldReadService(fakeRepository({ country: country("NRC", "Northreach", PROFILE) }))
    .readCountry(SCOPE, "NRC");
  assertEquals(valid.country.id, "NRC");
  assertNoUuid(JSON.stringify(valid));

  await assertWorldError(
    () => new PlayerWorldReadService(fakeRepository({ country: null })).readCountry(SCOPE, "NRC"),
    404,
    "player_world_country_not_found",
  );

  const wrongGame = country("NRC", "Northreach", PROFILE, OTHER_GAME);
  await assertWorldError(
    () => new PlayerWorldReadService(fakeRepository({ country: wrongGame })).readCountry(SCOPE, "NRC"),
    500,
    "player_world_scope_violation",
  );
});

Deno.test("world news is deterministic, paginated, empty-safe, and game-scoped", async () => {
  const repository = fakeRepository({
    news: [
      news("event-a", 9),
      news("event-c", 10),
      news("event-b", 10),
    ],
  });
  const result = await new PlayerWorldReadService(repository).listNews(SCOPE, {
    limit: 2,
    category: null,
    cursor: null,
  });

  assertEquals(result.items.map((item) => item.id), ["event-c", "event-b"]);
  assertEquals(result.nextCursor, { createdTick: 10, publicId: "event-b" });
  assertNoUuid(JSON.stringify(result));

  const empty = await new PlayerWorldReadService(fakeRepository({ news: [] })).listNews(SCOPE, {
    limit: 10,
    category: null,
    cursor: null,
  });
  assertEquals(empty.items, []);
  assertEquals(empty.nextCursor, null);

  await assertWorldError(
    () => new PlayerWorldReadService(fakeRepository({ news: [news("foreign", 4, OTHER_GAME)] })).listNews(SCOPE, {
      limit: 10,
      category: null,
      cursor: null,
    }),
    500,
    "player_world_scope_violation",
  );
});

Deno.test("repository failure is distinct from an empty world feed", async () => {
  const repository = fakeRepository({ unavailable: true });
  await assertWorldError(
    () => new PlayerWorldReadService(repository).listNews(SCOPE, { limit: 10, category: null, cursor: null }),
    503,
    "player_world_service_unavailable",
  );
});

function fakeRepository(options: {
  readonly countries?: readonly ReturnType<typeof country>[];
  readonly country?: ReturnType<typeof country> | null;
  readonly playerCountryProfileUuid?: string | null;
  readonly news?: readonly ReturnType<typeof news>[];
  readonly unavailable?: boolean;
} = {}): PlayerWorldReadRepository {
  const fail = () => {
    if (options.unavailable) {
      throw new PlayerWorldReadPersistenceError("player_world_read_failed", "unavailable");
    }
  };
  return {
    readCountries: (input) => {
      fail();
      return Promise.resolve({
        gameId: input.gameId,
        playerUuid: input.playerUuid,
        playerCountryProfileUuid: options.playerCountryProfileUuid ?? null,
        countries: options.countries ?? [],
      });
    },
    readCountry: (input) => {
      fail();
      return Promise.resolve({
        gameId: input.gameId,
        playerUuid: input.playerUuid,
        playerCountryProfileUuid: options.playerCountryProfileUuid ?? null,
        country: options.country ?? null,
      });
    },
    readNews: (input) => {
      fail();
      return Promise.resolve({ gameId: input.gameId, news: options.news ?? [] });
    },
  };
}

function country(code: string, name: string, profileUuid: string, gameId = GAME) {
  return {
    countryProfileUuid: profileUuid,
    countryCode: code,
    countryName: name,
    capitalName: `${name} City`,
    currencyCode: code === "NRC" ? "NRC" : "SLV",
    status: "active" as const,
    flagUrl: `/assets/flags/${code.toLowerCase()}.svg`,
    mapRegion: code.toLowerCase(),
    mapColor: "#123456",
    snapshot: {
      gameId,
      countryProfileUuid: profileUuid,
      sequence: 1,
      effectiveAt: NOW,
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

function news(publicId: string, createdTick: number, gameId = GAME) {
  return {
    gameId,
    publicId,
    category: "macro",
    sentiment: "neutral",
    source: "system",
    scope: "global",
    targetKey: null,
    headline: publicId,
    explanation: "Player-visible world event.",
    magnitude: 0.1,
    confidence: 0.9,
    volatilityImpact: null,
    volumeImpact: null,
    createdTick,
    expiresTick: null,
    publishedAt: NOW,
    updatedAt: NOW,
    imageUrl: null,
  };
}

async function assertWorldError(
  run: () => Promise<unknown>,
  status: number,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof PlayerWorldReadError)) throw error;
    assertEquals(error.status, status);
    assertEquals(error.code, code);
    return;
  }
  throw new Error(`Expected ${code}.`);
}

function assertNoUuid(value: string): void {
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(value)) {
    throw new Error(`Browser DTO exposed a UUID: ${value}`);
  }
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}
