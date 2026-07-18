import { SupabasePlayerWorldReadRepository } from "./supabasePlayerWorldReadRepository.ts";

declare const Deno: { test(name: string, run: () => void | Promise<void>): void };

const GAME = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME = "00000000-0000-4000-8000-000000000002";
const PLAYER = "00000000-0000-4000-8000-000000000011";
const PROFILE = "00000000-0000-4000-8000-000000000021";
const OTHER_PROFILE = "00000000-0000-4000-8000-000000000022";
const NOW = "2026-07-18T02:00:00.000Z";

Deno.test("Supabase world repository scopes countries to authenticated game snapshots", async () => {
  const client = scriptedClient({
    country_economic_snapshots: [ok([
      snapshot(PROFILE, GAME, 2),
      snapshot(PROFILE, GAME, 1),
      snapshot(OTHER_PROFILE, GAME, 1),
    ])],
    player_country_assignments: [ok({
      game_session_id: GAME,
      player_id: PLAYER,
      country_profile_id: PROFILE,
    })],
    country_profiles: [ok([
      profile(PROFILE, "NRC", "Northreach"),
      profile(OTHER_PROFILE, "SLV", "Silverreach"),
    ])],
  });

  const result = await new SupabasePlayerWorldReadRepository(client as never).readCountries({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
  });

  assertEquals(result.countries.map((item) => item.countryCode), ["NRC", "SLV"]);
  assertEquals(result.countries[0]?.snapshot.sequence, 2);
  assertEquals(result.playerCountryProfileUuid, PROFILE);
  assertCall(client.calls, "country_economic_snapshots", "eq", ["game_session_id", GAME]);
  assertCall(client.calls, "country_profiles", "eq", ["status", "active"]);
  assertCall(client.calls, "country_profiles", "in", ["id", [PROFILE, OTHER_PROFILE]]);
  assertCall(client.calls, "player_country_assignments", "eq", ["player_id", PLAYER]);
});

Deno.test("country detail requires an active public country and a game snapshot", async () => {
  const client = scriptedClient({
    country_profiles: [ok(profile(PROFILE, "NRC", "Northreach"))],
    player_country_assignments: [ok(null)],
    country_economic_snapshots: [ok(null)],
  });

  const result = await new SupabasePlayerWorldReadRepository(client as never).readCountry({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
    countryCode: "NRC",
  });

  assertEquals(result.country, null);
  assertCall(client.calls, "country_profiles", "eq", ["country_code", "NRC"]);
  assertCall(client.calls, "country_profiles", "eq", ["status", "active"]);
  assertCall(client.calls, "country_economic_snapshots", "eq", ["game_session_id", GAME]);
});

Deno.test("world news query is game-scoped, public, active, ordered, and cursor-bounded", async () => {
  const client = scriptedClient({
    stock_market_events: [ok([news("event-b", 12), news("event-a", 11)])],
  });

  const result = await new SupabasePlayerWorldReadRepository(client as never).readNews({
    gameId: GAME,
    limit: 2,
    category: "macro",
    cursor: { createdTick: 13, publicId: "event-c" },
  });

  assertEquals(result.news.map((item) => item.publicId), ["event-b", "event-a"]);
  assertCall(client.calls, "stock_market_events", "eq", ["game_session_id", GAME]);
  assertCall(client.calls, "stock_market_events", "eq", ["visibility", "public"]);
  assertCall(client.calls, "stock_market_events", "eq", ["is_active", true]);
  assertCall(client.calls, "stock_market_events", "eq", ["category", "macro"]);
  assertCall(client.calls, "stock_market_events", "order", ["created_tick", { ascending: false }]);
  assertCall(client.calls, "stock_market_events", "order", ["shock_id", { ascending: false }]);
  assertCall(
    client.calls,
    "stock_market_events",
    "or",
    ["created_tick.lt.13,and(created_tick.eq.13,shock_id.lt.event-c)"],
  );
});

Deno.test("cross-game rows fail closed and unsafe media is removed", async () => {
  const crossGame = scriptedClient({
    country_economic_snapshots: [ok([snapshot(PROFILE, OTHER_GAME, 1)])],
    player_country_assignments: [ok(null)],
  });
  await assertRejects(() => new SupabasePlayerWorldReadRepository(crossGame as never).readCountries({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
  }));

  const unsafe = scriptedClient({
    country_profiles: [ok({
      ...profile(PROFILE, "NRC", "Northreach"),
      metadata: { flagUrl: "javascript:alert(1)", mapColor: "red" },
    })],
    player_country_assignments: [ok(null)],
    country_economic_snapshots: [ok(snapshot(PROFILE, GAME, 1))],
  });
  const detail = await new SupabasePlayerWorldReadRepository(unsafe as never).readCountry({
    gameId: GAME,
    playerUuid: PLAYER,
    effectiveAt: NOW,
    countryCode: "NRC",
  });
  assertEquals(detail.country?.flagUrl, null);
  assertEquals(detail.country?.mapColor, null);
});

interface Call { readonly table: string; readonly name: string; readonly args: readonly unknown[] }

function scriptedClient(script: Record<string, readonly ReturnType<typeof ok>[]>) {
  const queues = new Map(Object.entries(script).map(([table, values]) => [table, [...values]]));
  const calls: Call[] = [];
  return {
    calls,
    from(table: string) {
      return {
        select(columns: string) {
          calls.push({ table, name: "select", args: [columns] });
          return query(table, queues, calls);
        },
      };
    },
  };
}

function query(table: string, queues: Map<string, ReturnType<typeof ok>[]>, calls: Call[]) {
  const builder = {
    eq(column: string, value: unknown) { calls.push({ table, name: "eq", args: [column, value] }); return builder; },
    in(column: string, value: readonly unknown[]) { calls.push({ table, name: "in", args: [column, value] }); return builder; },
    lte(column: string, value: unknown) { calls.push({ table, name: "lte", args: [column, value] }); return builder; },
    or(value: string) { calls.push({ table, name: "or", args: [value] }); return builder; },
    order(column: string, options?: { readonly ascending?: boolean }) { calls.push({ table, name: "order", args: [column, options] }); return builder; },
    limit(value: number) { calls.push({ table, name: "limit", args: [value] }); return builder; },
    maybeSingle() { calls.push({ table, name: "maybeSingle", args: [] }); return Promise.resolve(next(table, queues)); },
    then<TResult1 = unknown, TResult2 = never>(
      fulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      rejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) { return Promise.resolve(next(table, queues)).then(fulfilled, rejected); },
  };
  return builder;
}

function next(table: string, queues: Map<string, ReturnType<typeof ok>[]>): ReturnType<typeof ok> {
  const item = queues.get(table)?.shift();
  if (!item) throw new Error(`Missing scripted response for ${table}.`);
  return item;
}

function ok(data: unknown) { return { data, error: null }; }

function profile(id: string, code: string, name: string) {
  return {
    id,
    country_code: code,
    country_name: name,
    capital_name: `${name} City`,
    currency_code: code,
    status: "active",
    metadata: { flagUrl: `/assets/flags/${code.toLowerCase()}.svg`, mapRegion: code.toLowerCase(), mapColor: "#123456" },
  };
}

function snapshot(countryProfileId: string, gameSessionId: string, sequence: number) {
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

function news(shockId: string, createdTick: number) {
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

function assertCall(calls: readonly Call[], table: string, name: string, args: readonly unknown[]): void {
  if (!calls.some((call) => call.table === table && call.name === name && JSON.stringify(call.args) === JSON.stringify(args))) {
    throw new Error(`Missing ${table}.${name}(${JSON.stringify(args)}).`);
  }
}

async function assertRejects(run: () => Promise<unknown>): Promise<void> {
  try { await run(); } catch { return; }
  throw new Error("Expected rejection.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Assertion failed: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
  }
}
