import "./dashboardRepositoryProjection.test.ts";
import "./dashboardRepositoryValuation.test.ts";
import { PlayerGameDashboardError } from "../contracts/playerGameDashboardContracts.ts";
import { StockMarketReadError } from "../../stocks/index.ts";
import { DashboardStoreListingsReadError } from "../../store/dashboardReadModel.ts";
import {
  countries,
  equal,
  failure,
  instant,
  ok,
  position,
  setup,
} from "./dashboardRepositoryCharacterizationFixture.ts";
import type { PlayerGameDashboardReadDependencies } from "./supabasePlayerGameDashboardRepository.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
Deno.test("dashboard repository preserves exact selects, scope, ordering, and limits", async () => {
  const s = setup();
  countries(s.client, [{
    player_id: "me",
    country_profile_id: "country",
    assigned_at: "today",
  }, {
    player_id: "other",
    country_profile_id: "country",
    assigned_at: "yesterday",
  }], []);
  await s.read();
  const scope = [["eq", "game_session_id", "game"]];
  const own = [...scope, ["eq", "player_id", "me"]];
  const descending = ["order", "created_at", { ascending: false }];
  const expected: Record<string, (readonly unknown[])[]> = {
    game_sessions: [["select", "id,name,status,updated_at"], [
      "eq",
      "id",
      "game",
    ], ["maybeSingle"]],
    players: [["select", "id,display_name,roster_label"], ...scope, [
      "eq",
      "status",
      "active",
    ], ["order", "display_name", { ascending: true }]],
    player_country_assignments: [
      ["select", "player_id,country_profile_id,assigned_at"],
      ...scope,
      ["eq", "status", "active"],
      ["order", "assigned_at", { ascending: false }],
    ],
    country_profiles: [["select", "id,country_code,currency_code"], [
      "in",
      "id",
      ["country"],
    ]],
    account_balances: [
      ["select", "player_id,account_type,balance,currency_code"],
      ...scope,
      ["in", "account_type", ["checking", "savings"]],
      ["order", "account_type", { ascending: true }],
      ["order", "currency_code", { ascending: true }],
    ],
    stock_orders: [
      [
        "select",
        "id,player_id,stock_asset_id,ticker,side,quantity,execution_price,gross_value,status,rejection_reason,idempotency_key,created_at",
      ],
      ...own,
      descending,
      ["limit", 100],
    ],
    stock_trades: [
      [
        "select",
        "id,order_id,player_id,stock_asset_id,ticker,side,quantity,execution_price,gross_value,created_at",
      ],
      ...own,
      descending,
      ["limit", 100],
    ],
    inventory_holdings: [
      [
        "select",
        "id,store_item_id,quantity_owned,quantity_reserved,updated_at",
      ],
      ...own,
      ["order", "updated_at", { ascending: false }],
    ],
    store_purchases: [
      [
        "select",
        "id,store_item_id,quantity,final_total_price,currency_code,status,created_at",
      ],
      ...own,
      descending,
      ["limit", 25],
    ],
    stock_market_events: [
      [
        "select",
        "id,shock_id,category,sentiment,source,visibility,scope,target_key,headline,explanation,created_tick,expires_tick,created_at",
      ],
      ...scope,
      ["eq", "is_active", true],
      ["order", "created_tick", { ascending: false }],
      descending,
      ["limit", 25],
    ],
  };
  equal(s.client.calls.length, Object.keys(expected).length);
  for (const call of s.client.calls) {
    equal(call.operations, expected[call.table]);
  }
  equal(s.client.rpcCalls, [["read_game_stock_positions_v1", {
    p_game_session_id: "game",
  }]]);
  equal(s.calls, [
    ["open", "game", instant],
    ["market", {
      gameSessionId: "game",
      includeHistory: false,
      historyLimit: 1,
    }],
    ["store", "game"],
    ["contracts", { gameSessionId: "game", playerId: "me" }],
  ]);
  ok(
    (s.calls[0] as unknown[])[2] === instant,
    "Open-state read must receive the exact Date object",
  );
});

Deno.test("dashboard starts all injected dependencies before waiting for any result", async () => {
  const s = setup();
  const started: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  for (const [name, repository] of Object.entries(s.dependencies)) {
    const target = repository as {
      read: (...args: unknown[]) => Promise<unknown>;
    };
    const read = target.read.bind(target);
    target.read = async (...args) => {
      started.push(name);
      await gate;
      return read(...args);
    };
  }
  const pending = s.read();
  equal(started, [
    "stockMarketOpenStateReadRepository",
    "stockMarketReadRepository",
    "storeListingsReadQuery",
    "playerContractsReadQuery",
  ]);
  equal(s.client.rpcCalls.length, 1);
  ok(
    s.client.calls.some((call) => call.table === "stock_market_events"),
    "Later database reads must already have started",
  );
  release();
  await pending;
});

Deno.test("dashboard null optional rows retain empty projections and skip country lookup", async () => {
  const s = setup();
  for (
    const table of [
      "players",
      "player_country_assignments",
      "account_balances",
      "stock_orders",
      "stock_trades",
      "inventory_holdings",
      "store_purchases",
      "stock_market_events",
    ]
  ) s.client.rows(table, null);
  const result = await s.read();
  equal(result.gameSession, {
    id: "game",
    name: "Game",
    status: "active",
    marketStatus: "open",
    currentTick: 17,
    updatedAt: null,
  });
  equal(result.me.cash, {
    balances: [],
    primaryCurrencyCode: null,
    totalBalance: 0,
  });
  equal([
    result.me.displayName,
    result.me.rosterLabel,
    result.me.countryCode,
    result.me.netWorth,
  ], ["Session name", "Session roster", null, 0]);
  equal([
    result.me.stocks.orders,
    result.me.stocks.trades,
    result.me.stocks.holdings,
    result.me.store.inventory,
    result.me.store.recentPurchases,
    result.public.leaderboard,
    result.public.players,
    result.public.market.news,
    result.unseenCutscenes,
  ], [[], [], [], [], [], [], [], [], []]);
  ok(
    !s.client.calls.some((call) => call.table === "country_profiles"),
    "No assignments means no profile lookup",
  );
});

Deno.test("dashboard game status and open-state both gate market opening", async () => {
  for (
    const [status, open, expected] of [["active", false, "closed"], [
      "paused",
      true,
      "closed",
    ], ["active", true, "open"]] as const
  ) {
    const s = setup();
    s.client.rows("game_sessions", {
      id: "game",
      name: "Game",
      status,
      updated_at: "updated",
    });
    s.dependencies.stockMarketOpenStateReadRepository.read = async () => open;
    const result = await s.read();
    equal([result.gameSession.marketStatus, result.gameSession.updatedAt], [
      expected,
      "updated",
    ]);
  }
});

Deno.test("dashboard rejects every query error and absent game without leaking database details", async () => {
  for (
    const table of [
      "game_sessions",
      "players",
      "player_country_assignments",
      "country_profiles",
      "account_balances",
      "stock_orders",
      "stock_trades",
      "inventory_holdings",
      "store_purchases",
      "stock_market_events",
      "rpc",
    ]
  ) {
    const s = setup();
    countries(s.client, [{
      player_id: "me",
      country_profile_id: "country",
      assigned_at: "today",
    }], []);
    const response = {
      data: null,
      error: { message: "private database detail" },
    };
    if (table === "rpc") s.client.positions = response;
    else s.client.responses[table] = response;
    const error = await failure(s.read);
    ok(
      error instanceof PlayerGameDashboardError,
      `Expected domain error for ${table}`,
    );
    equal([error.code, error.status, error.message], [
      "game_dashboard_read_failed",
      500,
      "Player game dashboard could not be loaded.",
    ]);
  }
  for (const missing of [null, {}]) {
    const s = setup();
    s.client.rows("game_sessions", missing);
    const error = await failure(s.read);
    ok(
      error instanceof PlayerGameDashboardError,
      "Expected missing-game domain error",
    );
    equal([error.code, error.status], [
      "game_dashboard_game_session_not_found",
      404,
    ]);
  }
});

Deno.test("dashboard validates authoritative positions game and currency before projection", async () => {
  for (
    const data of [null, {}, [null], [position({ game_session_id: "other" })], [
      position({ listing_currency_code: "!" }),
    ], [position({ listing_currency_code: "" })]]
  ) {
    const s = setup();
    s.client.positions = { data, error: null };
    const error = await failure(s.read);
    ok(
      error instanceof PlayerGameDashboardError,
      "Invalid positions must fail closed",
    );
    equal(error.code, "game_dashboard_read_failed");
  }
});

Deno.test("dashboard translates Stock and Store errors but preserves unknown error identity", async () => {
  for (
    const [code, expected] of [[
      "game_session_not_found",
      "game_dashboard_game_session_not_found",
    ], [
      "stock_market_schema_not_applied",
      "game_dashboard_read_failed",
    ]] as const
  ) {
    const s = setup();
    s.dependencies.stockMarketReadRepository.read = async () => {
      throw new StockMarketReadError(code, "Stock message", 409);
    };
    const error = await failure(s.read);
    ok(
      error instanceof PlayerGameDashboardError,
      "Expected translated stock error",
    );
    equal([error.code, error.message, error.status], [
      expected,
      "Stock message",
      409,
    ]);
  }
  const s = setup();
  s.dependencies.storeListingsReadQuery.read = async () => {
    throw new DashboardStoreListingsReadError();
  };
  const error = await failure(s.read);
  ok(
    error instanceof PlayerGameDashboardError,
    "Expected translated Store error",
  );
  equal([error.code, error.status], ["game_dashboard_read_failed", 500]);
  for (
    const repository of Object.keys(
      setup().dependencies,
    ) as (keyof PlayerGameDashboardReadDependencies)[]
  ) {
    const s = setup();
    const original = new Error(`Unknown ${repository}`);
    s.dependencies[repository].read = async () => {
      throw original;
    };
    ok(
      await failure(s.read) === original,
      "Unknown dependency errors must retain identity",
    );
  }
});
