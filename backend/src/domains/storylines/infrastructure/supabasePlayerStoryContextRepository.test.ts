import { SupabasePlayerStoryContextRepository } from "./supabasePlayerStoryContextRepository.ts";
import {
  PlayerStoryContextRepositoryError,
} from "../contracts/playerStoryContextRepositoryContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player story context repository builds contexts for active players", async () => {
  const client = new FakeClient(baseTables());
  const repository = new SupabasePlayerStoryContextRepository(client as never);

  const contexts = await repository.listPlayerStoryContexts("game-1");

  assertEquals(contexts.length, 2);
  assertEquals(contexts[0]?.playerId, "player-1");
  assertEquals(contexts[0]?.gameSessionId, "game-1");
  assertEquals(contexts[0]?.homeCountryId, "country-northreach");
  assertEquals(contexts[0]?.homeCountryCode, "NORTHREACH");
  assertEquals(contexts[0]?.currentCountryId, "country-northreach");
  assertEquals(contexts[0]?.currentCountryCode, "NORTHREACH");
  assertEquals(contexts[0]?.cashBalance, 1250);
  assertEquals(contexts[0]?.resources, {});
  assertEquals(contexts[0]?.sectorExposurePct, {
    ENERGY: 33.33,
    TECHNOLOGY: 66.67,
  });
  assertEquals(contexts[0]?.countryExposurePct, {
    NORTHREACH: 33.33,
    SOLVEND: 66.67,
  });
  assertEquals(contexts[0]?.activeContractKeys, [
    "northreach-brief",
    "public-market-brief",
  ]);
  assertEquals(contexts[0]?.completedContractKeys, ["intro-contract"]);
  assertEquals(contexts[0]?.storyFlags, {
    northreach_border_closed: true,
    tariff_level: 2,
  });

  assertEquals(contexts[1]?.playerId, "player-2");
  assertEquals(contexts[1]?.currentCountryCode, "YRETHIA");
  assertEquals(contexts[1]?.cashBalance, 500);
  assertEquals(contexts[1]?.sectorExposurePct, {});
  assertEquals(contexts[1]?.activeContractKeys, ["public-market-brief"]);
  assertEquals(contexts[1]?.completedContractKeys, []);
});

Deno.test("player story context repository keeps safe defaults for sparse players", async () => {
  const tables = baseTables();
  tables.player_country_assignments = [];
  tables.account_balances = [];
  tables.stock_holdings = [];
  tables.player_contract_progress = [];
  tables.game_session_story_flags = [];
  const client = new FakeClient(tables);
  const repository = new SupabasePlayerStoryContextRepository(client as never);

  const contexts = await repository.listPlayerStoryContexts("game-1");

  assertEquals(contexts[0]?.homeCountryId, null);
  assertEquals(contexts[0]?.homeCountryCode, null);
  assertEquals(contexts[0]?.currentCountryId, null);
  assertEquals(contexts[0]?.currentCountryCode, null);
  assertEquals(contexts[0]?.cashBalance, 0);
  assertEquals(contexts[0]?.resources, {});
  assertEquals(contexts[0]?.sectorExposurePct, {});
  assertEquals(contexts[0]?.countryExposurePct, {});
  assertEquals(contexts[0]?.activeContractKeys, ["public-market-brief"]);
  assertEquals(contexts[0]?.completedContractKeys, []);
  assertEquals(contexts[0]?.storyFlags, {});
});

Deno.test("player story context repository reports read failures", async () => {
  const client = new FakeClient(baseTables(), {
    failTable: "players",
  });
  const repository = new SupabasePlayerStoryContextRepository(client as never);

  try {
    await repository.listPlayerStoryContexts("game-1");
    throw new Error("Expected repository read failure.");
  } catch (error) {
    if (!(error instanceof PlayerStoryContextRepositoryError)) {
      throw error;
    }

    assertEquals(error.code, "player_story_context_players_select_failed");
    assertEquals(error.tableName, "players");
    assertEquals(error.operation, "select");
  }
});

type FakeTableName =
  | "players"
  | "player_country_assignments"
  | "country_profiles"
  | "account_balances"
  | "stock_holdings"
  | "game_session_stock_assets"
  | "game_session_contracts"
  | "player_contract_progress"
  | "game_session_story_flags";

type FakeTables = Record<FakeTableName, Record<string, unknown>[]>;

interface FakeClientOptions {
  readonly failTable?: FakeTableName;
}

class FakeClient {
  constructor(
    readonly tables: FakeTables,
    private readonly options: FakeClientOptions = {},
  ) {}

  from(tableName: FakeTableName): FakeQueryBuilder {
    return new FakeQueryBuilder(tableName, this.tables, this.options);
  }
}

class FakeQueryBuilder {
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
    readonly operator: "eq" | "in";
  }[] = [];
  private readonly orderRules: {
    readonly column: string;
    readonly ascending: boolean;
  }[] = [];

  constructor(
    private readonly tableName: FakeTableName,
    private readonly tables: FakeTables,
    private readonly options: FakeClientOptions,
  ) {}

  select(_columns: string): FakeQueryBuilder {
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ column, value, operator: "eq" });
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    this.filters.push({ column, value: values, operator: "in" });
    return this;
  }

  order(
    column: string,
    options?: { readonly ascending?: boolean },
  ): FakeQueryBuilder {
    this.orderRules.push({
      column,
      ascending: options?.ascending ?? true,
    });
    return this;
  }

  then<TResult1 = FakeResponse<unknown[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResponse<unknown[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    _onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null,
  ): PromiseLike<TResult1 | TResult2> {
    if (this.options.failTable === this.tableName) {
      return Promise.resolve({
        data: null,
        error: { message: `${this.tableName} unavailable` },
      }).then(onfulfilled ?? undefined);
    }

    return Promise.resolve({
      data: this.readRows(),
      error: null,
    }).then(onfulfilled ?? undefined);
  }

  private readRows(): Record<string, unknown>[] {
    let rows = [...this.tables[this.tableName]];

    for (const filter of this.filters) {
      if (filter.operator === "eq") {
        rows = rows.filter((row) => row[filter.column] === filter.value);
      } else {
        const values = filter.value as readonly unknown[];
        rows = rows.filter((row) => values.includes(row[filter.column]));
      }
    }

    for (const orderRule of [...this.orderRules].reverse()) {
      rows.sort((left, right) =>
        compareValues(left[orderRule.column], right[orderRule.column]) *
        (orderRule.ascending ? 1 : -1)
      );
    }

    return rows;
  }
}

interface FakeResponse<T> {
  readonly data: T | null;
  readonly error: { readonly message: string } | null;
}

function baseTables(): FakeTables {
  return {
    players: [
      {
        id: "player-1",
        game_session_id: "game-1",
        status: "active",
      },
      {
        id: "player-2",
        game_session_id: "game-1",
        status: "active",
      },
      {
        id: "inactive-player",
        game_session_id: "game-1",
        status: "inactive",
      },
      {
        id: "other-game-player",
        game_session_id: "game-2",
        status: "active",
      },
    ],
    player_country_assignments: [
      {
        player_id: "player-1",
        game_session_id: "game-1",
        country_profile_id: "country-northreach",
        status: "active",
        assigned_at: "2026-06-25T12:00:00.000Z",
      },
      {
        player_id: "player-2",
        game_session_id: "game-1",
        country_profile_id: "country-yrethia",
        status: "active",
        assigned_at: "2026-06-25T12:01:00.000Z",
      },
      {
        player_id: "player-1",
        game_session_id: "game-1",
        country_profile_id: "country-old",
        status: "inactive",
        assigned_at: "2026-06-25T11:00:00.000Z",
      },
    ],
    country_profiles: [
      {
        id: "country-northreach",
        country_code: "NORTHREACH",
      },
      {
        id: "country-yrethia",
        country_code: "YRETHIA",
      },
      {
        id: "country-old",
        country_code: "OLD",
      },
    ],
    account_balances: [
      {
        player_id: "player-1",
        game_session_id: "game-1",
        account_type: "cash",
        balance: "1000",
      },
      {
        player_id: "player-1",
        game_session_id: "game-1",
        account_type: "cash",
        balance: 250,
      },
      {
        player_id: "player-1",
        game_session_id: "game-1",
        account_type: "escrow",
        balance: 999,
      },
      {
        player_id: "player-2",
        game_session_id: "game-1",
        account_type: "cash",
        balance: 500,
      },
    ],
    stock_holdings: [
      {
        player_id: "player-1",
        game_session_id: "game-1",
        stock_asset_id: "asset-tech",
        quantity: 10,
      },
      {
        player_id: "player-1",
        game_session_id: "game-1",
        stock_asset_id: "asset-energy",
        quantity: 5,
      },
      {
        player_id: "player-2",
        game_session_id: "game-1",
        stock_asset_id: "asset-zero",
        quantity: 0,
      },
    ],
    game_session_stock_assets: [
      {
        id: "asset-tech",
        game_session_id: "game-1",
        is_active: true,
        sector_key: "TECHNOLOGY",
        country_code: "SOLVEND",
        current_price: 100,
      },
      {
        id: "asset-energy",
        game_session_id: "game-1",
        is_active: true,
        sector_key: "ENERGY",
        country_code: "NORTHREACH",
        current_price: 100,
      },
      {
        id: "asset-zero",
        game_session_id: "game-1",
        is_active: true,
        sector_key: "ENERGY",
        country_code: "NORTHREACH",
        current_price: 0,
      },
    ],
    game_session_contracts: [
      {
        id: "contract-public",
        game_session_id: "game-1",
        contract_key: "public-market-brief",
        status: "active",
        visibility: "public",
      },
      {
        id: "contract-player",
        game_session_id: "game-1",
        contract_key: "northreach-brief",
        status: "active",
        visibility: "private",
      },
      {
        id: "contract-completed",
        game_session_id: "game-1",
        contract_key: "intro-contract",
        status: "archived",
        visibility: "public",
      },
      {
        id: "contract-paused",
        game_session_id: "game-1",
        contract_key: "paused-contract",
        status: "paused",
        visibility: "public",
      },
    ],
    player_contract_progress: [
      {
        player_id: "player-1",
        game_session_id: "game-1",
        contract_id: "contract-player",
        status: "in_progress",
      },
      {
        player_id: "player-1",
        game_session_id: "game-1",
        contract_id: "contract-completed",
        status: "completed",
      },
    ],
    game_session_story_flags: [
      {
        game_session_id: "game-1",
        flag_key: "northreach_border_closed",
        value: true,
        created_at: "2026-06-25T12:00:00.000Z",
      },
      {
        game_session_id: "game-1",
        flag_key: "tariff_level",
        value: 2,
        created_at: "2026-06-25T12:01:00.000Z",
      },
    ],
  };
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left ?? "").localeCompare(String(right ?? ""));
}

function assertEquals(actual: unknown, expected: unknown): void {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);

  if (actualJson !== expectedJson) {
    throw new Error(
      `Assertion failed. Actual: ${actualJson} Expected: ${expectedJson}`,
    );
  }
}
