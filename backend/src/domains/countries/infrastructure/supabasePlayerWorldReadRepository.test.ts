import {
  SupabasePlayerWorldReadRepository,
} from "./supabasePlayerWorldReadRepository.ts";
import { PlayerWorldReadPersistenceError } from "../contracts/playerWorldReadContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_ID = "00000000-0000-4000-8000-000000000011";
const COUNTRY_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_COUNTRY_ID = "00000000-0000-4000-8000-000000000022";
const NOW = "2026-07-17T08:00:00.000Z";

Deno.test("world repository scopes country profiles, assignment, and latest effective economy", async () => {
  const client = new FakeClient(tables());
  const repository = new SupabasePlayerWorldReadRepository(client as never);
  const result = await repository.readCountries({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    effectiveAtIso: NOW,
  });

  assertEquals(result.gameSessionId, GAME_SESSION_ID);
  assertEquals(result.playerId, PLAYER_ID);
  assertEquals(result.playerCountryProfileId, COUNTRY_ID);
  assertEquals(result.countries.length, 2);
  assertEquals(result.countries[0]?.profile, {
    id: COUNTRY_ID,
    countryCode: "NORTHREACH",
    countryName: "Northreach",
    capitalName: "Frostgate",
    currencyCode: "NRT",
    mapRegion: "northwest",
    mapColor: "purple",
  });
  assertEquals(
    result.countries[0]?.latestEconomicSnapshot?.snapshotSequence,
    2,
  );
  assertEquals(
    result.countries[0]?.latestEconomicSnapshot?.effectiveAt,
    "2026-07-17T07:00:00.000Z",
  );
  assertEquals(
    result.countries[1]?.latestEconomicSnapshot,
    null,
  );

  assertCall(client, "country_profiles", {
    filters: [{ column: "status", operator: "eq", value: "active" }],
    orders: [{ column: "country_name", ascending: true }],
    limit: 51,
  });
  assertCall(client, "player_country_assignments", {
    filters: [
      { column: "game_session_id", operator: "eq", value: GAME_SESSION_ID },
      { column: "player_id", operator: "eq", value: PLAYER_ID },
      { column: "status", operator: "eq", value: "active" },
    ],
    limit: 1,
  });
  assertCall(client, "country_economic_snapshots", {
    filters: [
      { column: "game_session_id", operator: "eq", value: GAME_SESSION_ID },
      { column: "country_profile_id", operator: "eq", value: COUNTRY_ID },
      { column: "effective_at", operator: "lte", value: NOW },
    ],
    orders: [
      { column: "effective_at", ascending: false },
      { column: "snapshot_sequence", ascending: false },
    ],
    limit: 1,
  });
});

Deno.test("world repository resolves country details by code and UUID", async () => {
  const client = new FakeClient(tables());
  const repository = new SupabasePlayerWorldReadRepository(client as never);

  const byCode = await repository.readCountry({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    effectiveAtIso: NOW,
    countryIdentifier: "northreach",
  });
  const byId = await repository.readCountry({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    effectiveAtIso: NOW,
    countryIdentifier: COUNTRY_ID.toUpperCase(),
  });

  assertEquals(byCode.country?.profile.id, COUNTRY_ID);
  assertEquals(byId.country?.profile.countryCode, "NORTHREACH");
  const profileCalls = client.calls.filter((call) =>
    call.tableName === "country_profiles" &&
    call.filters.some((filter) => filter.column !== "status")
  );
  assertEquals(profileCalls[0]?.filters, [
    { column: "status", operator: "eq", value: "active" },
    { column: "country_code", operator: "eq", value: "NORTHREACH" },
  ]);
  assertEquals(profileCalls[1]?.filters, [
    { column: "status", operator: "eq", value: "active" },
    { column: "id", operator: "eq", value: COUNTRY_ID },
  ]);
});

Deno.test("world repository limits news to public active events in the token game", async () => {
  const client = new FakeClient(tables());
  const repository = new SupabasePlayerWorldReadRepository(client as never);
  const result = await repository.readNews({
    gameSessionId: GAME_SESSION_ID,
    category: "policy",
    limit: 2,
  });

  assertEquals(result.gameSessionId, GAME_SESSION_ID);
  assertEquals(result.news.map((item) => item.shockId), [
    "public-new",
    "public-old",
  ]);
  assertEquals(result.news[0]?.targetKey, "NORTHREACH");
  assertEquals(result.news[0]?.magnitude, -0.03);
  assertEquals(result.news[0]?.volumeImpact, null);
  assertCall(client, "stock_market_events", {
    filters: [
      { column: "game_session_id", operator: "eq", value: GAME_SESSION_ID },
      { column: "visibility", operator: "eq", value: "public" },
      { column: "is_active", operator: "eq", value: true },
      { column: "category", operator: "eq", value: "policy" },
    ],
    orders: [
      { column: "created_tick", ascending: false },
      { column: "created_at", ascending: false },
    ],
    limit: 2,
  });
});

Deno.test("world repository fails closed on malformed authoritative numbers", async () => {
  const data = tables();
  data.stock_market_events = [
    eventRow({ magnitude: "not-a-number" }),
  ];
  const repository = new SupabasePlayerWorldReadRepository(
    new FakeClient(data) as never,
  );
  const error = await assertRejects(
    () =>
      repository.readNews({
        gameSessionId: GAME_SESSION_ID,
        category: null,
        limit: 10,
      }),
    PlayerWorldReadPersistenceError,
  );

  assertEquals(error.code, "player_world_read_failed");
});

Deno.test("world repository maps missing schema errors without database details", async () => {
  const repository = new SupabasePlayerWorldReadRepository(
    new FakeClient(tables(), {
      stock_market_events: {
        code: "42P01",
        message: "relation public.secret_internal_name does not exist",
      },
    }) as never,
  );
  const error = await assertRejects(
    () =>
      repository.readNews({
        gameSessionId: GAME_SESSION_ID,
        category: null,
        limit: 10,
      }),
    PlayerWorldReadPersistenceError,
  );

  assertEquals(error.code, "player_world_schema_not_applied");
  assertEquals(error.message, "Player world read schema is not applied.");
});

interface Tables {
  [tableName: string]: Record<string, unknown>[];
}

function tables(): Tables {
  return {
    country_profiles: [
      countryProfileRow(),
      countryProfileRow({
        id: OTHER_COUNTRY_ID,
        country_code: "SOLVEND",
        country_name: "Solvend",
        capital_name: "Aurora Spire",
        currency_code: "SLV",
        metadata: {},
      }),
      countryProfileRow({
        id: "00000000-0000-4000-8000-000000000023",
        country_code: "ARCHIVED",
        country_name: "Archived",
        status: "archived",
      }),
    ],
    player_country_assignments: [{
      game_session_id: GAME_SESSION_ID,
      player_id: PLAYER_ID,
      country_profile_id: COUNTRY_ID,
      status: "active",
      assigned_at: "2026-07-16T00:00:00.000Z",
    }, {
      game_session_id: OTHER_GAME_SESSION_ID,
      player_id: PLAYER_ID,
      country_profile_id: OTHER_COUNTRY_ID,
      status: "active",
      assigned_at: "2026-07-17T00:00:00.000Z",
    }],
    country_economic_snapshots: [
      snapshotRow({
        id: "00000000-0000-4000-8000-000000000031",
        snapshot_sequence: 1,
        effective_at: "2026-07-17T06:00:00.000Z",
      }),
      snapshotRow({
        id: "00000000-0000-4000-8000-000000000032",
        snapshot_sequence: 2,
        effective_at: "2026-07-17T07:00:00.000Z",
      }),
      snapshotRow({
        id: "00000000-0000-4000-8000-000000000033",
        snapshot_sequence: 3,
        effective_at: "2026-07-17T09:00:00.000Z",
      }),
      snapshotRow({
        id: "00000000-0000-4000-8000-000000000034",
        game_session_id: OTHER_GAME_SESSION_ID,
        snapshot_sequence: 99,
      }),
    ],
    stock_market_events: [
      eventRow({ shock_id: "public-old", created_tick: 8 }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000042",
        shock_id: "public-new",
        created_tick: 12,
        magnitude: "-0.03",
      }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000043",
        shock_id: "hidden",
        created_tick: 20,
        visibility: "hidden",
      }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000044",
        shock_id: "inactive",
        created_tick: 19,
        is_active: false,
      }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000045",
        shock_id: "other-game",
        created_tick: 18,
        game_session_id: OTHER_GAME_SESSION_ID,
      }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000046",
        shock_id: "other-category",
        created_tick: 17,
        category: "macro",
      }),
    ],
  };
}

function countryProfileRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: COUNTRY_ID,
    country_code: "NORTHREACH",
    country_name: "Northreach",
    capital_name: "Frostgate",
    currency_code: "NRT",
    status: "active",
    metadata: {
      mapRegion: "northwest",
      mapColor: "purple",
      internal: "hidden",
    },
    ...overrides,
  };
}

function snapshotRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "00000000-0000-4000-8000-000000000031",
    game_session_id: GAME_SESSION_ID,
    country_profile_id: COUNTRY_ID,
    snapshot_sequence: 1,
    effective_at: "2026-07-17T06:00:00.000Z",
    snapshot_label: "Tick",
    difficulty_preset: "standard",
    real_gdp_index: "102.4",
    gdp_growth_rate: "0.03",
    inflation_rate: "0.02",
    unemployment_rate: "0.04",
    interest_rate: "0.05",
    consumer_confidence_index: "105",
    business_confidence_index: "106",
    cost_of_living_index: "1.01",
    regional_price_multiplier: "1.02",
    supply_constraint_index: "0.99",
    import_dependency_index: "0.8",
    tax_rate: "0.2",
    subsidy_rate: "0.01",
    exchange_rate_index: "1.03",
    currency_stability_index: "1.05",
    trade_balance_index: "8",
    export_strength_index: "1.1",
    market_risk_index: "0.9",
    political_stability_index: "1.2",
    infrastructure_index: "1.15",
    energy_security_index: "0.95",
    ...overrides,
  };
}

function eventRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "00000000-0000-4000-8000-000000000041",
    game_session_id: GAME_SESSION_ID,
    shock_id: "public-old",
    category: "policy",
    sentiment: "negative",
    source: "staff",
    scope: "country",
    target_key: "NORTHREACH",
    headline: "Policy change",
    explanation: "A policy changed.",
    magnitude: "-0.02",
    confidence: "0.8",
    volatility_impact: "0.01",
    volume_impact: null,
    created_tick: 8,
    expires_tick: 14,
    visibility: "public",
    is_active: true,
    created_at: "2026-07-17T07:00:00.000Z",
    updated_at: "2026-07-17T07:30:00.000Z",
    ...overrides,
  };
}

type Operator = "eq" | "lte";

interface QueryFilter {
  readonly column: string;
  readonly operator: Operator;
  readonly value: unknown;
}

interface QueryOrder {
  readonly column: string;
  readonly ascending: boolean;
}

interface QueryCall {
  readonly tableName: string;
  readonly columns: string;
  readonly filters: QueryFilter[];
  readonly orders: QueryOrder[];
  limit: number | null;
}

class FakeClient {
  readonly calls: QueryCall[] = [];

  constructor(
    readonly tables: Tables,
    private readonly errors: Record<
      string,
      { readonly code?: string; readonly message: string }
    > = {},
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }

  readError(tableName: string) {
    return this.errors[tableName] ?? null;
  }
}

class FakeQueryBuilder {
  private call: QueryCall | null = null;

  constructor(
    private readonly client: FakeClient,
    private readonly tableName: string,
  ) {}

  select(columns: string): FakeQueryBuilder {
    this.call = {
      tableName: this.tableName,
      columns,
      filters: [],
      orders: [],
      limit: null,
    };
    this.client.calls.push(this.call);
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.requireCall().filters.push({ column, operator: "eq", value });
    return this;
  }

  lte(column: string, value: unknown): FakeQueryBuilder {
    this.requireCall().filters.push({ column, operator: "lte", value });
    return this;
  }

  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FakeQueryBuilder {
    this.requireCall().orders.push({
      column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.requireCall().limit = count;
    return this;
  }

  maybeSingle(): Promise<
    { readonly data: Record<string, unknown> | null; readonly error: unknown }
  > {
    const error = this.client.readError(this.tableName);
    return Promise.resolve({
      data: error ? null : this.readRows()[0] ?? null,
      error,
    });
  }

  then<
    TResult1 = {
      readonly data: Record<string, unknown>[];
      readonly error: unknown;
    },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
        value: {
          readonly data: Record<string, unknown>[] | null;
          readonly error: unknown;
        },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    _onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    const error = this.client.readError(this.tableName);
    return Promise.resolve({
      data: error ? null : this.readRows(),
      error,
    }).then(onfulfilled ?? undefined);
  }

  private readRows(): Record<string, unknown>[] {
    const call = this.requireCall();
    let rows = [...(this.client.tables[this.tableName] ?? [])];

    for (const filter of call.filters) {
      rows = rows.filter((row) => {
        if (filter.operator === "eq") {
          return row[filter.column] === filter.value;
        }

        return String(row[filter.column] ?? "") <= String(filter.value ?? "");
      });
    }

    if (call.orders.length > 0) {
      rows.sort((left, right) => {
        for (const order of call.orders) {
          const comparison = compare(left[order.column], right[order.column]);

          if (comparison !== 0) {
            return order.ascending ? comparison : -comparison;
          }
        }

        return 0;
      });
    }

    return call.limit === null ? rows : rows.slice(0, call.limit);
  }

  private requireCall(): QueryCall {
    if (!this.call) {
      throw new Error("select must be called first");
    }

    return this.call;
  }
}

function compare(left: unknown, right: unknown): number {
  const leftNumber = Number(left);
  const rightNumber = Number(right);

  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return leftNumber - rightNumber;
  }

  return String(left).localeCompare(String(right));
}

function assertCall(
  client: FakeClient,
  tableName: string,
  expected: {
    readonly filters: readonly QueryFilter[];
    readonly orders?: readonly QueryOrder[];
    readonly limit: number;
  },
): void {
  const call = client.calls.find((candidate) =>
    candidate.tableName === tableName &&
    JSON.stringify(candidate.filters) === JSON.stringify(expected.filters)
  );

  if (!call) {
    throw new Error(`Expected query for ${tableName} was not recorded.`);
  }

  assertEquals(call.orders, expected.orders ?? call.orders);
  assertEquals(call.limit, expected.limit);
}

async function assertRejects<TError extends Error>(
  run: () => Promise<unknown>,
  expectedErrorClass: new (...args: never[]) => TError,
): Promise<TError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof expectedErrorClass) {
      return error;
    }

    throw new Error(
      `Expected ${expectedErrorClass.name}, got ${String(error)}`,
    );
  }

  throw new Error(`Expected ${expectedErrorClass.name} to be thrown.`);
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
