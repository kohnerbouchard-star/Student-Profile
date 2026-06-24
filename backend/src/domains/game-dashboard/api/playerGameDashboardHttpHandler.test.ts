import {
  handlePlayerGameDashboardRequest,
} from "./playerGameDashboardHttpHandler.ts";
import type {
  PlayerGameDashboardReadInput,
  PlayerGameDashboardRepository,
  PlayerGameDashboardSnapshot,
} from "../contracts/playerGameDashboardContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const GAME_SESSION_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_GAME_SESSION_ID = "00000000-0000-4000-8000-000000000002";
const PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000011";
const PREVIOUS_PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000010";
const OTHER_PLAYER_SESSION_ID = "00000000-0000-4000-8000-000000000012";
const PLAYER_ID = "00000000-0000-4000-8000-000000000021";
const OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000022";
const OTHER_GAME_PLAYER_ID = "00000000-0000-4000-8000-000000000023";
const COUNTRY_ID = "00000000-0000-4000-8000-000000000031";
const OTHER_COUNTRY_ID = "00000000-0000-4000-8000-000000000032";
const STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000101";
const OTHER_GAME_STOCK_ASSET_ID = "00000000-0000-4000-8000-000000000102";
const ORDER_ID = "00000000-0000-4000-8000-000000000201";
const OTHER_PLAYER_ORDER_ID = "00000000-0000-4000-8000-000000000202";
const PREVIOUS_SESSION_ORDER_ID = "00000000-0000-4000-8000-000000000203";
const TRADE_ID = "00000000-0000-4000-8000-000000000301";
const PREVIOUS_SESSION_TRADE_ID = "00000000-0000-4000-8000-000000000303";
const OTHER_PLAYER_TRADE_ID = "00000000-0000-4000-8000-000000000302";
const STORE_ITEM_ID = "00000000-0000-4000-8000-000000000401";
const HIDDEN_STORE_ITEM_ID = "00000000-0000-4000-8000-000000000402";
const INVENTORY_ID = "00000000-0000-4000-8000-000000000501";
const OTHER_INVENTORY_ID = "00000000-0000-4000-8000-000000000502";
const PURCHASE_ID = "00000000-0000-4000-8000-000000000601";
const OTHER_PURCHASE_ID = "00000000-0000-4000-8000-000000000602";
const MARKET_EVENT_ID = "00000000-0000-4000-8000-000000000701";

Deno.test("player dashboard rejects missing player session token", async () => {
  const response = await handlePlayerGameDashboardRequest(
    request({ authToken: null }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player dashboard rejects invalid player session token", async () => {
  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({ client: new FakeClient({ ...tables(), player_sessions: [] }) }),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player dashboard rejects revoked, expired, or inactive sessions", async () => {
  for (const session of [
    playerSession({ status: "revoked", revoked_at: "2026-06-24T00:00:00.000Z" }),
    playerSession({ expires_at: "2020-01-01T00:00:00.000Z" }),
    playerSession({ status: "expired" }),
  ]) {
    const response = await handlePlayerGameDashboardRequest(
      request(),
      dependencies({
        client: new FakeClient({ ...tables(), player_sessions: [session] }),
      }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }
});

Deno.test("player dashboard rejects mismatched gameSessionId", async () => {
  const response = await handlePlayerGameDashboardRequest(
    request({ gameSessionId: OTHER_GAME_SESSION_ID }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session_scope");
});

Deno.test("player dashboard rejects runner secret and client-supplied identity", async () => {
  const withSecret = await handlePlayerGameDashboardRequest(
    request({ runnerSecret: "runner-secret" }),
    dependencies(),
  );
  const withPlayerId = await handlePlayerGameDashboardRequest(
    request({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    dependencies(),
  );
  const withPlayerSessionId = await handlePlayerGameDashboardRequest(
    request({ extraQuery: `playerSessionId=${OTHER_PLAYER_SESSION_ID}` }),
    dependencies(),
  );
  const withPlayerSessionHeader = await handlePlayerGameDashboardRequest(
    request({ playerSessionIdHeader: OTHER_PLAYER_SESSION_ID }),
    dependencies(),
  );

  await assertErrorResponse(withSecret, 400, "stock_runner_secret_not_allowed");
  await assertErrorResponse(withPlayerId, 400, "invalid_game_dashboard_request");
  await assertErrorResponse(withPlayerSessionId, 400, "invalid_game_dashboard_request");
  await assertErrorResponse(withPlayerSessionHeader, 400, "invalid_game_dashboard_request");
});

Deno.test("player dashboard does not require playerSessionId and derives it from token", async () => {
  const repository = new CapturingRepository();
  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({ repository }),
  );

  assertEquals(response.status, 200);
  assertEquals(repository.inputs, [{
    gameSessionId: GAME_SESSION_ID,
    playerSessionId: PLAYER_SESSION_ID,
    playerId: PLAYER_ID,
    playerDisplayName: "Avery",
    playerRosterLabel: "A-1",
  }]);
});

Deno.test("player dashboard includes same-player stock history across sessions and excludes other players", async () => {
  const client = new FakeClient(tables());
  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.ok, true);
  assertEquals(body.gameSession, {
    id: GAME_SESSION_ID,
    name: "Period 1",
    status: "active",
    marketStatus: "open",
    currentTick: 7,
    updatedAt: "2026-06-24T00:10:00.000Z",
  });
  assertEquals(body.me.playerId, PLAYER_ID);
  assertEquals(body.me.displayName, "Avery");
  assertEquals(body.me.rosterLabel, "A-1");
  assertEquals(body.me.countryCode, "SOLVEND");
  assertEquals(body.me.cash, {
    balances: [{
      accountType: "cash",
      currencyCode: "SLV",
      balance: 9500,
    }],
    primaryCurrencyCode: "SLV",
    totalBalance: 9500,
  });
  assertEquals(body.me.stocks.portfolio, {
    cashBalance: 9500,
    holdingsMarketValue: 625,
    totalEquity: 10125,
    totalCostBasis: 500,
    unrealizedPnl: 125,
    realizedPnl: 30,
    positionsCount: 1,
  });
  assertEquals(body.me.stocks.holdings, [{
    stockAssetId: STOCK_ASSET_ID,
    ticker: "AURA",
    companyName: "Aurora Aerospace Systems",
    sector: "AI_AEROSPACE",
    countryCode: "SOLVEND",
    quantity: 5,
    averageCost: 100,
    currentPrice: 125,
    marketValue: 625,
    costBasis: 500,
    unrealizedPnl: 125,
    unrealizedPnlPct: 25,
    realizedPnl: 30,
  }]);
  assertEquals(body.me.stocks.orders.map((order: { readonly orderId: string }) => order.orderId), [
    ORDER_ID,
    PREVIOUS_SESSION_ORDER_ID,
  ]);
  assertEquals(body.me.stocks.trades.map((trade: { readonly tradeId: string }) => trade.tradeId), [
    TRADE_ID,
    PREVIOUS_SESSION_TRADE_ID,
  ]);
  assertEquals(body.me.store.listings.map((item: { readonly id: string }) => item.id), [
    STORE_ITEM_ID,
  ]);
  assertEquals(body.me.store.inventory, [{
    inventoryId: INVENTORY_ID,
    itemId: STORE_ITEM_ID,
    itemName: "Homework Pass",
    quantityOwned: 2,
    quantityReserved: 1,
    updatedAt: "2026-06-24T00:07:00.000Z",
  }]);
  assertEquals(body.me.store.recentPurchases, [{
    purchaseId: PURCHASE_ID,
    itemId: STORE_ITEM_ID,
    itemName: "Homework Pass",
    quantity: 1,
    finalTotalPrice: 75,
    currencyCode: "SLV",
    status: "COMPLETED",
    createdAt: "2026-06-24T00:06:00.000Z",
  }]);
  assertEquals(body.me.contracts, { available: [], progress: [] });
  assertEquals(body.public.players.map((player: { readonly playerId: string }) => player.playerId), [
    PLAYER_ID,
    OTHER_PLAYER_ID,
  ]);
  assertEquals(body.public.leaderboard.map((entry: { readonly playerId: string; readonly rank: number; readonly netWorth: number }) => ({
    playerId: entry.playerId,
    rank: entry.rank,
    netWorth: entry.netWorth,
  })), [
    { playerId: OTHER_PLAYER_ID, rank: 1, netWorth: 52500 },
    { playerId: PLAYER_ID, rank: 2, netWorth: 10125 },
  ]);
  assertEquals(body.public.market.stocks.map((stock: { readonly assetId: string }) => stock.assetId), [
    STOCK_ASSET_ID,
  ]);
  assertEquals(body.public.market.news.map((news: { readonly id: string }) => news.id), [
    MARKET_EVENT_ID,
  ]);
  assertEquals(body.public.contracts, []);
  assertEquals(body.public.storeListings, [{
    itemId: STORE_ITEM_ID,
    itemKey: "homework_pass",
    name: "Homework Pass",
    description: "Skip one homework assignment.",
    category: "privilege",
    stockQuantity: 10,
    status: "active",
    visibility: "visible",
    sortOrder: 10,
    updatedAt: "2026-06-24T00:04:00.000Z",
  }]);
  assertEquals(body.realtime.publicChannel, `game:${GAME_SESSION_ID}:public`);
  assertEquals(body.realtime.lastSequence, null);
  assertEquals(body.realtime.events.includes("stock_tick"), true);
  assertEquals(client.forbiddenCalls, []);

  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(PLAYER_SESSION_ID), false);
  assertEquals(serialized.includes(PREVIOUS_PLAYER_SESSION_ID), false);
  assertEquals(serialized.includes(OTHER_PLAYER_SESSION_ID), false);
  assertEquals(serialized.includes("session-token-hash"), false);
  assertEquals(serialized.includes(OTHER_PLAYER_ORDER_ID), false);
  assertEquals(serialized.includes(OTHER_PLAYER_TRADE_ID), false);
  assertEquals(serialized.includes(OTHER_INVENTORY_ID), false);
  assertEquals(serialized.includes(OTHER_PURCHASE_ID), false);
  assertEquals(serialized.includes(OTHER_GAME_PLAYER_ID), false);
  assertEquals(serialized.includes(OTHER_GAME_STOCK_ASSET_ID), false);
  assertEquals("price" in body.public.storeListings[0], false);
});

function dependencies(options: {
  readonly client?: FakeClient;
  readonly repository?: PlayerGameDashboardRepository;
} = {}): any {
  const client = options.client ?? new FakeClient(tables());

  return {
    createServiceClient: () => client as any,
    readSupabaseEnv: () => ({
      ok: true as const,
      value: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "anon",
        supabaseServiceRoleKey: "service-role",
      },
    }),
    hashSessionToken: async () => "session-token-hash",
    createRepository: options.repository
      ? () => options.repository
      : undefined,
  };
}

function request(options: {
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly runnerSecret?: string;
  readonly extraQuery?: string;
  readonly playerSessionIdHeader?: string;
} = {}): Request {
  const query = new URLSearchParams({
    gameSessionId: options.gameSessionId ?? GAME_SESSION_ID,
  });
  const suffix = options.extraQuery ? `&${options.extraQuery}` : "";
  const headers = new Headers();

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  if (options.playerSessionIdHeader) {
    headers.set("x-player-session-id", options.playerSessionIdHeader);
  }

  return new Request(
    `https://example.test/players/me/game/dashboard?${query}${suffix}`,
    { method: "GET", headers },
  );
}

function tables(): Record<string, readonly Record<string, unknown>[]> {
  return {
    player_sessions: [playerSession()],
    game_sessions: [
      {
        id: GAME_SESSION_ID,
        name: "Period 1",
        status: "active",
        updated_at: "2026-06-24T00:10:00.000Z",
      },
      {
        id: OTHER_GAME_SESSION_ID,
        name: "Period 2",
        status: "active",
        updated_at: "2026-06-24T00:11:00.000Z",
      },
    ],
    players: [
      {
        id: PLAYER_ID,
        game_session_id: GAME_SESSION_ID,
        display_name: "Avery",
        roster_label: "A-1",
        status: "active",
      },
      {
        id: OTHER_PLAYER_ID,
        game_session_id: GAME_SESSION_ID,
        display_name: "Blake",
        roster_label: "B-1",
        status: "active",
      },
      {
        id: OTHER_GAME_PLAYER_ID,
        game_session_id: OTHER_GAME_SESSION_ID,
        display_name: "Casey",
        roster_label: "C-1",
        status: "active",
      },
    ],
    country_profiles: [
      {
        id: COUNTRY_ID,
        country_code: "SOLVEND",
        currency_code: "SLV",
      },
      {
        id: OTHER_COUNTRY_ID,
        country_code: "ELDORAN",
        currency_code: "ELD",
      },
    ],
    player_country_assignments: [
      {
        game_session_id: GAME_SESSION_ID,
        player_id: PLAYER_ID,
        country_profile_id: COUNTRY_ID,
        status: "active",
        assigned_at: "2026-06-24T00:00:00.000Z",
      },
      {
        game_session_id: GAME_SESSION_ID,
        player_id: OTHER_PLAYER_ID,
        country_profile_id: OTHER_COUNTRY_ID,
        status: "active",
        assigned_at: "2026-06-24T00:00:00.000Z",
      },
    ],
    account_balances: [
      {
        game_session_id: GAME_SESSION_ID,
        player_id: PLAYER_ID,
        account_type: "cash",
        balance: 9500,
        currency_code: "SLV",
      },
      {
        game_session_id: GAME_SESSION_ID,
        player_id: OTHER_PLAYER_ID,
        account_type: "cash",
        balance: 50000,
        currency_code: "ELD",
      },
      {
        game_session_id: OTHER_GAME_SESSION_ID,
        player_id: OTHER_GAME_PLAYER_ID,
        account_type: "cash",
        balance: 999999,
        currency_code: "SLV",
      },
    ],
    game_session_stock_assets: [
      stockAsset(),
      stockAsset({
        id: OTHER_GAME_STOCK_ASSET_ID,
        game_session_id: OTHER_GAME_SESSION_ID,
        ticker: "LEAK",
        company_name: "Other Game Asset",
      }),
    ],
    stock_price_ticks: [
      stockTick(),
      stockTick({
        game_session_id: OTHER_GAME_SESSION_ID,
        stock_asset_id: OTHER_GAME_STOCK_ASSET_ID,
        ticker: "LEAK",
        tick_index: 99,
      }),
    ],
    stock_holdings: [
      holdingRow(),
      holdingRow({
        player_id: OTHER_PLAYER_ID,
        player_session_id: OTHER_PLAYER_SESSION_ID,
        quantity: 20,
        average_cost: 100,
        realized_pnl: 0,
      }),
      holdingRow({
        game_session_id: OTHER_GAME_SESSION_ID,
        player_id: OTHER_GAME_PLAYER_ID,
        stock_asset_id: OTHER_GAME_STOCK_ASSET_ID,
        ticker: "LEAK",
        quantity: 100,
      }),
    ],
    stock_orders: [
      orderRow(),
      orderRow({
        id: PREVIOUS_SESSION_ORDER_ID,
        player_session_id: PREVIOUS_PLAYER_SESSION_ID,
        idempotency_key: "previous-session-order",
        created_at: "2026-06-23T00:00:00.000Z",
      }),
      orderRow({
        id: OTHER_PLAYER_ORDER_ID,
        player_id: OTHER_PLAYER_ID,
        player_session_id: OTHER_PLAYER_SESSION_ID,
        idempotency_key: "other-order",
      }),
    ],
    stock_trades: [
      tradeRow(),
      tradeRow({
        id: PREVIOUS_SESSION_TRADE_ID,
        order_id: PREVIOUS_SESSION_ORDER_ID,
        player_session_id: PREVIOUS_PLAYER_SESSION_ID,
        created_at: "2026-06-23T00:00:00.000Z",
      }),
      tradeRow({
        id: OTHER_PLAYER_TRADE_ID,
        player_id: OTHER_PLAYER_ID,
        player_session_id: OTHER_PLAYER_SESSION_ID,
        order_id: OTHER_PLAYER_ORDER_ID,
      }),
    ],
    store_items: [
      storeItem(),
      storeItem({
        id: HIDDEN_STORE_ITEM_ID,
        item_key: "hidden_item",
        name: "Hidden Item",
        visibility: "hidden",
      }),
      storeItem({
        id: "00000000-0000-4000-8000-000000000403",
        game_session_id: OTHER_GAME_SESSION_ID,
        item_key: "other_game_item",
        name: "Other Game Item",
      }),
    ],
    inventory_holdings: [
      {
        id: INVENTORY_ID,
        game_session_id: GAME_SESSION_ID,
        player_id: PLAYER_ID,
        store_item_id: STORE_ITEM_ID,
        quantity_owned: 2,
        quantity_reserved: 1,
        updated_at: "2026-06-24T00:07:00.000Z",
      },
      {
        id: OTHER_INVENTORY_ID,
        game_session_id: GAME_SESSION_ID,
        player_id: OTHER_PLAYER_ID,
        store_item_id: STORE_ITEM_ID,
        quantity_owned: 8,
        quantity_reserved: 0,
        updated_at: "2026-06-24T00:08:00.000Z",
      },
    ],
    store_purchases: [
      {
        id: PURCHASE_ID,
        game_session_id: GAME_SESSION_ID,
        player_id: PLAYER_ID,
        store_item_id: STORE_ITEM_ID,
        quantity: 1,
        final_total_price: 75,
        currency_code: "SLV",
        status: "COMPLETED",
        created_at: "2026-06-24T00:06:00.000Z",
      },
      {
        id: OTHER_PURCHASE_ID,
        game_session_id: GAME_SESSION_ID,
        player_id: OTHER_PLAYER_ID,
        store_item_id: STORE_ITEM_ID,
        quantity: 9,
        final_total_price: 675,
        currency_code: "ELD",
        status: "COMPLETED",
        created_at: "2026-06-24T00:09:00.000Z",
      },
    ],
    stock_market_events: [
      {
        id: MARKET_EVENT_ID,
        game_session_id: GAME_SESSION_ID,
        shock_id: "aura-contract",
        scope: "ticker",
        target_key: "AURA",
        headline: "Aurora wins a launch contract",
        explanation: "A game-public market event.",
        created_tick: 7,
        expires_tick: 12,
        is_active: true,
        created_at: "2026-06-24T00:05:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000702",
        game_session_id: OTHER_GAME_SESSION_ID,
        shock_id: "other-game-news",
        scope: "global",
        target_key: null,
        headline: "Other game news",
        explanation: "Should not be returned.",
        created_tick: 99,
        expires_tick: null,
        is_active: true,
        created_at: "2026-06-24T00:05:00.000Z",
      },
    ],
  };
}

function playerSession(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAYER_SESSION_ID,
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    session_token_hash: "session-token-hash",
    status: "active",
    expires_at: "2999-01-01T00:00:00.000Z",
    revoked_at: null,
    ...overrides,
  };
}

function stockAsset(overrides: Record<string, unknown> = {}) {
  return {
    id: STOCK_ASSET_ID,
    game_session_id: GAME_SESSION_ID,
    ticker: "AURA",
    company_name: "Aurora Aerospace Systems",
    sector_key: "AI_AEROSPACE",
    country_code: "SOLVEND",
    description: "A game-public stock.",
    current_price: 125,
    previous_close: 100,
    open_price: 100,
    day_high: 130,
    day_low: 98,
    market_cap: 1000000,
    current_volatility: 0.2,
    long_run_volatility: 0.3,
    is_active: true,
    ...overrides,
  };
}

function stockTick(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_SESSION_ID,
    stock_asset_id: STOCK_ASSET_ID,
    tick_index: 7,
    ticker: "AURA",
    price: 125,
    previous_price: 120,
    change_pct: 4.166667,
    volume: 1000,
    created_at: "2026-06-24T00:05:00.000Z",
    ...overrides,
  };
}

function holdingRow(overrides: Record<string, unknown> = {}) {
  return {
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    quantity: 5,
    average_cost: 100,
    realized_pnl: 30,
    ...overrides,
  };
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "buy",
    quantity: 5,
    execution_price: 100,
    gross_value: 500,
    status: "filled",
    rejection_reason: null,
    idempotency_key: "order-1",
    created_at: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

function tradeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TRADE_ID,
    order_id: ORDER_ID,
    game_session_id: GAME_SESSION_ID,
    player_session_id: PLAYER_SESSION_ID,
    player_id: PLAYER_ID,
    stock_asset_id: STOCK_ASSET_ID,
    ticker: "AURA",
    side: "buy",
    quantity: 5,
    execution_price: 100,
    gross_value: 500,
    created_at: "2026-06-24T00:00:00.000Z",
    ...overrides,
  };
}

function storeItem(overrides: Record<string, unknown> = {}) {
  return {
    id: STORE_ITEM_ID,
    game_session_id: GAME_SESSION_ID,
    item_key: "homework_pass",
    name: "Homework Pass",
    description: "Skip one homework assignment.",
    category: "privilege",
    price: 75,
    currency_code: "SLV",
    stock_quantity: 10,
    status: "active",
    visibility: "visible",
    sort_order: 10,
    created_at: "2026-06-24T00:03:00.000Z",
    updated_at: "2026-06-24T00:04:00.000Z",
    ...overrides,
  };
}

class CapturingRepository implements PlayerGameDashboardRepository {
  readonly inputs: PlayerGameDashboardReadInput[] = [];

  async read(input: PlayerGameDashboardReadInput): Promise<PlayerGameDashboardSnapshot> {
    this.inputs.push(input);

    return {
      gameSession: {
        id: input.gameSessionId,
        name: "Period 1",
        status: "active",
        marketStatus: "open",
        currentTick: 0,
        updatedAt: null,
      },
      me: {
        playerId: input.playerId,
        displayName: input.playerDisplayName,
        rosterLabel: input.playerRosterLabel,
        countryCode: null,
        netWorth: 0,
        cash: {
          balances: [],
          primaryCurrencyCode: null,
          totalBalance: 0,
        },
        stocks: {
          portfolio: {
            cashBalance: 0,
            holdingsMarketValue: 0,
            totalEquity: 0,
            totalCostBasis: 0,
            unrealizedPnl: 0,
            realizedPnl: 0,
            positionsCount: 0,
          },
          holdings: [],
          orders: [],
          trades: [],
        },
        store: {
          currencyCode: null,
          listings: [],
          inventory: [],
          recentPurchases: [],
        },
        contracts: {
          available: [],
          progress: [],
        },
      },
      public: {
        leaderboard: [],
        players: [],
        market: {
          stocks: [],
          news: [],
        },
        contracts: [],
        storeListings: [],
      },
    };
  }
}

class FakeClient {
  readonly forbiddenCalls: string[] = [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }

  async rpc(functionName: string, args: Record<string, unknown> = {}) {
    if (functionName !== "read_latest_stock_market_ticks_for_game") {
      this.forbiddenCalls.push(`rpc:${functionName}`);
      return { data: null, error: { message: `Unexpected RPC ${functionName}` } };
    }

    const gameSessionId = args.p_game_session_id;
    const ticker = args.p_ticker;
    const rows = (this.tables.stock_price_ticks ?? [])
      .filter((row) => row.game_session_id === gameSessionId)
      .filter((row) => ticker === null || ticker === undefined || row.ticker === ticker);
    const latestByAssetId = new Map<string, Record<string, unknown>>();

    for (const row of rows) {
      const assetId = String(row.stock_asset_id);
      const existing = latestByAssetId.get(assetId);

      if (
        !existing ||
        compareValues(row.tick_index, existing.tick_index) > 0 ||
        (
          row.tick_index === existing.tick_index &&
          compareValues(row.created_at, existing.created_at) > 0
        )
      ) {
        latestByAssetId.set(assetId, row);
      }
    }

    return { data: [...latestByAssetId.values()], error: null };
  }
}

class FakeQueryBuilder
  implements PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
  private readonly filters: { readonly column: string; readonly value: unknown }[] = [];
  private readonly inFilters: {
    readonly column: string;
    readonly values: readonly unknown[];
  }[] = [];
  private readonly orderings: { readonly column: string; readonly ascending: boolean }[] = [];
  private limitCount: number | null = null;

  constructor(
    private readonly client: FakeClient,
    private readonly tableName: string,
  ) {}

  select(): FakeQueryBuilder {
    return this;
  }

  insert(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`insert:${this.tableName}`);
    return this;
  }

  update(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`update:${this.tableName}`);
    return this;
  }

  delete(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`delete:${this.tableName}`);
    return this;
  }

  eq(column: string, value: unknown): FakeQueryBuilder {
    this.filters.push({ column, value });
    return this;
  }

  in(column: string, values: readonly unknown[]): FakeQueryBuilder {
    this.inFilters.push({ column, values });
    return this;
  }

  order(
    column: string,
    options: { readonly ascending?: boolean } = {},
  ): FakeQueryBuilder {
    this.orderings.push({ column, ascending: options.ascending ?? true });
    return this;
  }

  limit(count: number): FakeQueryBuilder {
    this.limitCount = count;
    return this;
  }

  async maybeSingle() {
    const result = await this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
  }

  then<TResult1 = { readonly data: unknown[] | null; readonly error: unknown }, TResult2 = never>(
    onfulfilled?: ((
      value: { readonly data: unknown[] | null; readonly error: unknown },
    ) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    readonly data: unknown[] | null;
    readonly error: unknown;
  }> {
    let rows = [...(this.client.tables[this.tableName] ?? [])];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    for (const filter of this.inFilters) {
      rows = rows.filter((row) => filter.values.includes(row[filter.column]));
    }

    for (const ordering of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const comparison = compareValues(left[ordering.column], right[ordering.column]);
        return ordering.ascending ? comparison : -comparison;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return { data: rows, error: null };
  }
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }

  return String(left).localeCompare(String(right));
}

async function assertErrorResponse(
  response: Response,
  status: number,
  code: string,
): Promise<void> {
  const body = await response.json();

  assertEquals(response.status, status);
  assertEquals(body.error.code, code);
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
