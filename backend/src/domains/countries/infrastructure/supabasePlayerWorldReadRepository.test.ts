import { SupabasePlayerWorldReadRepository } from "./supabasePlayerWorldReadRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const PLAYER = "00000000-0000-4000-8000-000000000011";
const PROFILE = "00000000-0000-4000-8000-000000000021";
const OTHER_PROFILE = "00000000-0000-4000-8000-000000000022";
const NOW = "2026-07-18T02:00:00.000Z";

Deno.test("Supabase world repository scopes countries to game snapshots and active profiles", async () => {
  const client = scriptedClient({
    country_economic_snapshots: [response([
      snapshotRow(PROFILE, GAME, 2),
      snapshotRow(PROFILE, GAME, 1),
      snapshotRow(OTHER_PROFILE, GAME, 1),
    ])],
    player_country_assignments: [response({
      game_session_id: GAME,
      player_id: PLAYER,
      country_profile_id: PROFILE,
      status: "active",
      assigned_at: NOW,
    })],
    country_profiles: [response([
      profileRow(PROFILE, "NRC", "Northreach"),
      profileRow(OTHER_PROFILE, "SLV", "Silverreach"),
    ])],
  });

  const result = await new SupabasePlayerWorldReadRepository(client as never).readCountries({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
  });

  assertEquals(result.gameId, GAME);
  assertEquals(result.playerUuid, PLAYER);
  assertEquals(result.playerCountryProfileUuid, PROFILE);
  assertEquals(result.countries.map((item) => item.countryCode), ["NRC", "SLV"]);
  assertEquals(result.countries[0]?.snapshot.sequence, 2);

  assertOperation(client.operations, "country_economic_snapshots", "eq", ["game_session_id", GAME]);
  assertOperation(client.operations, "country_profiles", "eq", ["status", "active"]);
  assertOperation(client.operations, "country_profiles", "in", ["id", [PROFILE, OTHER_PROFILE]]);
  assertOperation(client.operations, "player_country_assignments", "eq", ["player_id", PLAYER]);
});

Deno.test("country detail requires an active public code and an authenticated-game snapshot", async () => {
  const client = scriptedClient({
    country_profiles: [response(profileRow(PROFILE, "NRC", "Northreach"))],
    player_country_assignments: [response(null)],
    country_economic_snapshots: [response(null)],
  });

  const result = await new SupabasePlayerWorldReadRepository(client as never).readCountry({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
    countryCode: "NRC",
  });

  assertEquals(result.country, null);
  assertOperation(client.operations, "country_profiles", "eq", ["country_code", "NRC"]);
  assertOperation(client.operations, "country_profiles", "eq", ["status", "active"]);
  assertOperation(client.operations, "country_economic_snapshots", "eq", ["game_session_id", GAME]);
});

Deno.test("news query enforces game, public visibility, activity, deterministic order, and cursor", async () => {
  const client = scriptedClient({
    stock_market_events: [response([
      newsRow("event-b", 12),
      newsRow("event-a", 11),
    ])],
  });

  const result = await new SupabasePlayerWorldReadRepository(client as never).readNews({
    gameId: GAME,
    limit: 2,
    category: "macro",
    cursor: { createdTick: 13, publicId: "event-c" },
  });

  assertEquals(result.news.map((item) => item.publicId), ["event-b", "event-a"]);
  assertOperation(client.operations, "stock_market_events", "eq", ["game_session_id", GAME]);
  assertOperation(client.operations, "stock_market_events", "eq", ["visibility", "public"]);
  assertOperation(client.operations, "stock_market_events", "eq", ["is_active", true]);
  assertOperation(client.operations, "stock_market_events", "eq", ["category", "macro"]);
  assertOperation(client.operations, "stock_market_events", "order", ["created_tick", { ascending: false }]);
  assertOperation(client.operations, "stock_market_events", "order", ["shock_id", { ascending: false }]);
  const cursorOperation = client.operations.find((item) => item.table === "stock_market_events" && item.name === "or");
  assertEquals(
    cursorOperation?.args,
    ["created_tick.lt.13,and(created_tick.eq.13,shock_id.lt.\"event-c\")"],
  );
});

Deno.test("repository rejects cross-game rows and unsafe media is omitted", async () => {
  const crossGame = scriptedClient({
    country_economic_snapshots: [response([snapshotRow(PROFILE, OTHER_GAME, 1)])],
    player_country_assignments: [response(null)],
  });

  await assertRejects(() =>
    new SupabasePlayerWorldReadRepository(crossGame as never).readCountries({
      gameId: GAME,
      playerUuid: PLAYER,
      effectiveAt: NOW,
    })
  );

  const safeMedia = scriptedClient({
    country_profiles: [response({
      ...profileRow(PROFILE, "NRC", "Northreach"),
      metadata: { flagUrl: "javascript:alert(1)", mapColor: "red" },
    })],
    player_country_assignments: [response(null)],
    country_economic_snapshots: [response(snapshotRow(PROFILE, GAME, 1))],
  });
  const detail = await new SupabasePlayerWorldReadRepository(safeMedia as never).readCountry({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
    countryCode: "NRC",
  });
  assertEquals(detail.country?.flagUrl, null);
  assertEquals(detail.country?.mapColor, null);
});

interface Operation {
  readonly table: string;
  readonly name: string;
  readonly args: readonly unknown[];
}

function scriptedClient(script: Record<string, readonly ReturnType<typeof response>[]>) {
  const queues = new Map(Object.entries(script).map(([table, values]) => [table, [...values]]));
  const operations: Operation[] = [];
  return {
    operations,
    from(table: string) {
      return {
        select(columns: string) {
          operations.push({ table, name: "select", args: [columns] });
          return builder(table, queues, operations);
        },
      };
    },
  };
}

function builder(
  table: string,
  queues: Map<string, ReturnType<typeof response>[]>,
  operations: Operation[],
) {
  const value = {
    eq(column: string, filter: unknown) {
      operations.push({ table, name: "eq", args: [column, filter] });
      return value;
    },
    in(column: string, filters: readonly unknown[]) {
      operations.push({ table, name: "in", args: [column, filters] });
      return value;
    },
    lte(column: string, filter: unknown) {
      operations.push({ table, name: "lte", args: [column, filter] });
      return value;
    },
    or(filters: string) {
      operations.push({ table, name: "or", args: [filters] });
      return value;
    },
    order(column: string, options?: { readonly ascending?: boolean }) {
      operations.push({ table, name: "order", args: [column, options] });
      return value;
    },
    limit(count: number) {
      operations.push({ table, name: "limit", args: [count] });
      return value;
    },
    maybeSingle() {
      operations.push({ table, name: "maybeSingle", args: [] });
      return Promise.resolve(next(table, queues));
    },
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(next(table, queues)).then(onfulfilled, onrejected);
    },
  };
  return value;
}

function next(table: string, queues: Map<string, ReturnType<typeof response>[]>): ReturnType<typeof response> {
  const queue = queues.get(table) ?? [];
  const item = queue.shift();
  if (!item) throw new Error(`No scripted response for ${table}.`);
  return item;
}

function response(data: unknown, error: { readonly message: string; readonly code?: string } | null = null) {
  return { data, error };
}

function profileRow(id: string, countryCode: string, countryName: string) {
  return {
    id,
    country_code: countryCode,
    country_name: countryName,
    capital_name: `${countryName} City`,
    currency_code: countryCode,
    status: "active",
    metadata: {
      flagUrl: `/assets/flags/${countryCode.toLowerCase()}.svg`,
      mapRegion: countryCode.toLowerCase(),
      mapColor: "#123456",
    },
  };
}

function snapshotRow(countryProfileId: string, gameSessionId: string, sequence: number) {
  return {
    game_session_id: gameSessionId,
    country_profile_id: countryProfileId,
    snapshot_sequence: sequence,
    effective_at: NOW,
    gdp_growth_rate: 0.02,
    inflation_rate: 0.03,
    unemployment_rate: 0.04,
    interest_rate: 0.05,
    consumer_confidence_index: 101,
    business_confidence_index: 99,
    exchange_rate_index: 1,
    market_risk_index: 0.8,
    political_stability_index: 1.1,
  };
}

function newsRow(shockId: string, createdTick: number) {
  return {
    game_session_id: GAME,
    shock_id: shockId,
    category: "macro",
    sentiment: "neutral",
    source: "system",
    scope: "global",
    target_key: null,
    headline: shockId,
    explanation: "Player-visible event.",
    magnitude: 0.1,
    confidence: 0.9,
    volatility_impact: null,
    volume_impact: null,
    created_tick: createdTick,
    expires_tick: null,
    created_at: NOW,
    updated_at: NOW,
    metadata: { imageUrl: "https://cdn.example.test/news/event.svg" },
  };
}

function assertOperation(
  operations: readonly Operation[],
  table: string,
  name: string,
  args: readonly unknown[],
): void {
  const found = operations.some((item) =>
    item.table === table && item.name === name && JSON.stringify(item.args) === JSON.stringify(args)
  );
  if (!found) throw new Error(`Missing ${table}.${name}(${JSON.stringify(args)}).`);
}

async function assertRejects(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch {
    return;
  }
  throw new Error("Expected rejection.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}
