import "../infrastructure/supabasePlayerGameDashboardRepository.test.ts";
import {
  summarizePortfolio,
  toCashDto,
  toHoldingDto,
} from "../infrastructure/dashboardFinancialProjection.ts";
import { SupabasePlayerGameDashboardRepository } from "../infrastructure/supabasePlayerGameDashboardRepository.ts";
import { PlayerGameDashboardError } from "../contracts/playerGameDashboardContracts.ts";
import {
  createDashboardStoreListingsReadQuery,
  DashboardStoreListingsReadError,
} from "../../store/dashboardReadModel.ts";
import {
  ContractRepositoryError,
  createPlayerContractsReadQuery,
  type PlayerContractsReadInput,
} from "../../contracts/index.ts";
import {
  createStockMarketOpenStateReadRepository,
  createStockMarketReadRepository,
  StockMarketOpenStateReadError,
  StockMarketReadError,
  type StockMarketReadInput,
  type StockMarketReadRepository,
} from "../../stocks/index.ts";
import {
  handlePlayerGameDashboardRequest,
} from "./playerGameDashboardHttpHandler.ts";
import type {
  PlayerGameDashboardReadInput,
  PlayerGameDashboardRepository,
  PlayerGameDashboardSnapshot,
  PlayerGameDashboardStoryNotificationRepository,
} from "../contracts/playerGameDashboardContracts.ts";
import type {
  MarkNotificationDeliveryInput,
  StoryNotificationDeliveryRecord,
} from "../../storylines/server/notificationCapabilities.ts";

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
const CONTRACT_ID = "00000000-0000-4000-8000-000000000a01";
const DRAFT_CONTRACT_ID = "00000000-0000-4000-8000-000000000a02";
const OTHER_GAME_CONTRACT_ID = "00000000-0000-4000-8000-000000000a03";
const CONTRACT_PROGRESS_ID = "00000000-0000-4000-8000-000000000b01";
const OTHER_PLAYER_CONTRACT_PROGRESS_ID =
  "00000000-0000-4000-8000-000000000b02";
const OTHER_GAME_CONTRACT_PROGRESS_ID = "00000000-0000-4000-8000-000000000b03";
const STORY_NOTIFICATION_ID = "00000000-0000-4000-8000-000000000801";
const STORY_NOTIFICATION_LOW_ID = "00000000-0000-4000-8000-000000000802";
const STORY_NOTIFICATION_SEEN_ID = "00000000-0000-4000-8000-000000000803";
const STORY_NOTIFICATION_DISMISSED_ID = "00000000-0000-4000-8000-000000000804";
const STORY_NOTIFICATION_OTHER_PLAYER_ID =
  "00000000-0000-4000-8000-000000000805";
const STORY_DELIVERY_ID = "00000000-0000-4000-8000-000000000901";
const STORY_DELIVERY_LOW_ID = "00000000-0000-4000-8000-000000000902";
const STORY_DELIVERY_SEEN_ID = "00000000-0000-4000-8000-000000000903";
const STORY_DELIVERY_DISMISSED_ID = "00000000-0000-4000-8000-000000000904";
const STORY_DELIVERY_OTHER_PLAYER_ID = "00000000-0000-4000-8000-000000000905";

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
    dependencies({
      client: new FakeClient({ ...tables(), player_sessions: [] }),
    }),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player dashboard rejects revoked, expired, or inactive sessions", async () => {
  for (
    const session of [
      playerSession({
        status: "revoked",
        revoked_at: "2026-06-24T00:00:00.000Z",
      }),
      playerSession({ expires_at: "2020-01-01T00:00:00.000Z" }),
      playerSession({ status: "expired" }),
    ]
  ) {
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
  await assertErrorResponse(
    withPlayerId,
    400,
    "invalid_game_dashboard_request",
  );
  await assertErrorResponse(
    withPlayerSessionId,
    400,
    "invalid_game_dashboard_request",
  );
  await assertErrorResponse(
    withPlayerSessionHeader,
    400,
    "invalid_game_dashboard_request",
  );
});

Deno.test("dashboard uses authoritative common shares and keeps national currency values separate", async () => {
  const data = tables();
  const secondAsset = "00000000-0000-4000-8000-000000000103";
  data.game_session_stock_assets = [
    stockAsset(),
    stockAsset({
      id: secondAsset,
      ticker: "LISTED",
      listing_currency_code: "NRC",
      current_price: 2.5,
    }),
  ];
  data.stock_price_ticks = [
    stockTick(),
    stockTick({ stock_asset_id: secondAsset, ticker: "LISTED", price: 2.5 }),
  ];
  data.stock_holdings = [holdingRow({ quantity: 0 })];
  data.stock_positions = [
    holdingRow(),
    holdingRow({
      stock_asset_id: secondAsset,
      ticker: "LISTED",
      quantity: 20,
      average_cost: 2.5,
      realized_pnl: 0,
    }),
  ];
  const client = new FakeClient(data);
  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({ client }),
  );
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(
    body.me.stocks.holdings.map((h: { quantity: number }) => h.quantity),
    [5, 20],
  );
  assertEquals(body.me.stocks.portfolio.holdingsMarketValue, 0);
  assertEquals(body.me.stocks.portfolio.valuationStatus, "partial_unconverted");
  assertEquals(body.me.netWorth, 10125);
  assertEquals(body.me.netWorthValuation.status, "partial_unconverted");
  assertEquals(body.me.netWorthValuation.excludedStocksByCurrency, [{
    currencyCode: "NRC",
    marketValue: 50,
    costBasis: 50,
    unrealizedPnl: 0,
    realizedPnl: 0,
  }]);
  assertEquals(client.forbiddenCalls, []);
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
      accountType: "checking",
      currencyCode: "SLV",
      balance: 9500,
    }],
    primaryCurrencyCode: "SLV",
    totalBalance: 9500,
  });
  assertEquals(body.me.stocks.portfolio, {
    currencyCode: "ECO",
    byCurrency: [{
      currencyCode: "SLV",
      marketValue: 625,
      costBasis: 500,
      unrealizedPnl: 125,
      realizedPnl: 30,
    }],
    valuationStatus: "partial_unconverted",
    cashBalance: 0,
    holdingsMarketValue: 0,
    totalEquity: 0,
    totalCostBasis: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    positionsCount: 1,
  });
  assertEquals(body.me.stocks.holdings, [{
    stockAssetId: STOCK_ASSET_ID,
    ticker: "AURA",
    companyName: "Aurora Aerospace Systems",
    sector: "AI_AEROSPACE",
    countryCode: "SOLVEND",
    currencyCode: "SLV",
    quantity: 5,
    averageCost: 100,
    currentPrice: 125,
    marketValue: 625,
    costBasis: 500,
    unrealizedPnl: 125,
    unrealizedPnlPct: 25,
    realizedPnl: 30,
  }]);
  assertEquals(
    body.me.stocks.orders.map((order: { readonly orderId: string }) =>
      order.orderId
    ),
    [
      ORDER_ID,
      PREVIOUS_SESSION_ORDER_ID,
    ],
  );
  assertEquals(
    body.me.stocks.trades.map((trade: { readonly tradeId: string }) =>
      trade.tradeId
    ),
    [
      TRADE_ID,
      PREVIOUS_SESSION_TRADE_ID,
    ],
  );
  assertEquals(
    body.me.store.listings.map((item: { readonly id: string }) => item.id),
    [
      STORE_ITEM_ID,
    ],
  );
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
  assertEquals(
    body.public.players.map((player: { readonly playerId: string }) =>
      player.playerId
    ),
    [
      PLAYER_ID,
      OTHER_PLAYER_ID,
    ],
  );
  assertEquals(
    body.public.leaderboard.map((
      entry: {
        readonly playerId: string;
        readonly rank: number;
        readonly netWorth: number;
      },
    ) => ({
      playerId: entry.playerId,
      rank: entry.rank,
      netWorth: entry.netWorth,
    })),
    [
      { playerId: OTHER_PLAYER_ID, rank: 1, netWorth: 50000 },
      { playerId: PLAYER_ID, rank: 1, netWorth: 10125 },
    ],
  );
  assertEquals(
    body.public.market.stocks.map((stock: { readonly assetId: string }) =>
      stock.assetId
    ),
    [
      STOCK_ASSET_ID,
    ],
  );
  assertEquals(
    body.public.market.news.map((news: { readonly id: string }) => news.id),
    [
      MARKET_EVENT_ID,
    ],
  );
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
  assertEquals(body.unseenCutscenes, []);
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

Deno.test("player dashboard retires raw cutscene payload delivery", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow({
    payload: {
      videoAssetKey: "northreach-border-closure-v1",
      requiresAcknowledgement: true,
      arbitrarySecret: { mustNotReachBrowser: true },
    },
  })];
  seededTables.notification_deliveries = [storyDeliveryRow()];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.unseenCutscenes, []);
  assertEquals(JSON.stringify(body).includes("arbitrarySecret"), false);
  assertEquals(JSON.stringify(body).includes(STORY_DELIVERY_ID), false);
  assertEquals(JSON.stringify(body).includes(STORY_NOTIFICATION_ID), false);
});

Deno.test("player dashboard does not invoke the retired cutscene reader", async () => {
  const storyNotificationRepository = new CapturingStoryNotificationReader();

  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({
      repository: new CapturingRepository(),
      storyNotificationRepository,
    }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.unseenCutscenes, []);
  assertEquals(storyNotificationRepository.readCalls, 0);
});

Deno.test("player dashboard marks own cutscene delivery seen", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow()];
  seededTables.notification_deliveries = [storyDeliveryRow()];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ action: "mark_cutscene_seen" }),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body, {
    ok: true,
    delivery: {
      deliveryId: STORY_DELIVERY_ID,
      notificationId: STORY_NOTIFICATION_ID,
      deliveredAt: "2026-06-24T00:12:30.000Z",
      seenAt: "2026-06-25T12:30:00.000Z",
      dismissedAt: null,
      acknowledgedAt: null,
    },
  });
  assertEquals(
    seededTables.notification_deliveries[0]?.seen_at,
    "2026-06-25T12:30:00.000Z",
  );
  assertEquals(seededTables.notification_deliveries[0]?.dismissed_at, null);
  assertEquals(seededTables.notification_deliveries[0]?.acknowledged_at, null);
});

Deno.test("player dashboard marks own cutscene delivery dismissed", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow()];
  seededTables.notification_deliveries = [storyDeliveryRow()];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ action: "mark_cutscene_dismissed" }),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.delivery, {
    deliveryId: STORY_DELIVERY_ID,
    notificationId: STORY_NOTIFICATION_ID,
    deliveredAt: "2026-06-24T00:12:30.000Z",
    seenAt: null,
    dismissedAt: "2026-06-25T12:30:00.000Z",
    acknowledgedAt: null,
  });
  assertEquals(seededTables.notification_deliveries[0]?.seen_at, null);
  assertEquals(
    seededTables.notification_deliveries[0]?.dismissed_at,
    "2026-06-25T12:30:00.000Z",
  );
  assertEquals(seededTables.notification_deliveries[0]?.acknowledged_at, null);
});

Deno.test("player dashboard marks own cutscene delivery acknowledged", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow()];
  seededTables.notification_deliveries = [storyDeliveryRow({
    seen_at: "2026-06-25T12:29:00.000Z",
  })];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ action: "mark_cutscene_acknowledged" }),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(body.delivery, {
    deliveryId: STORY_DELIVERY_ID,
    notificationId: STORY_NOTIFICATION_ID,
    deliveredAt: "2026-06-24T00:12:30.000Z",
    seenAt: "2026-06-25T12:29:00.000Z",
    dismissedAt: null,
    acknowledgedAt: "2026-06-25T12:30:00.000Z",
  });
  assertEquals(
    seededTables.notification_deliveries[0]?.seen_at,
    "2026-06-25T12:29:00.000Z",
  );
  assertEquals(seededTables.notification_deliveries[0]?.dismissed_at, null);
  assertEquals(
    seededTables.notification_deliveries[0]?.acknowledged_at,
    "2026-06-25T12:30:00.000Z",
  );
});

Deno.test("player dashboard cutscene actions reject missing player session token", async () => {
  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ authToken: null }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session");
});

Deno.test("player dashboard cutscene actions reject revoked expired or inactive sessions", async () => {
  for (
    const session of [
      playerSession({
        status: "revoked",
        revoked_at: "2026-06-24T00:00:00.000Z",
      }),
      playerSession({ expires_at: "2020-01-01T00:00:00.000Z" }),
      playerSession({ status: "expired" }),
    ]
  ) {
    const response = await handlePlayerGameDashboardRequest(
      cutsceneActionRequest(),
      dependencies({
        client: new FakeClient({ ...tables(), player_sessions: [session] }),
      }),
    );

    await assertErrorResponse(response, 401, "invalid_player_session");
  }
});

Deno.test("player dashboard cutscene actions reject mismatched gameSessionId", async () => {
  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ gameSessionId: OTHER_GAME_SESSION_ID }),
    dependencies(),
  );

  await assertErrorResponse(response, 401, "invalid_player_session_scope");
});

Deno.test("player dashboard cutscene actions reject client-supplied player identity", async () => {
  const withBodyPlayerId = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ bodyOverrides: { playerId: OTHER_PLAYER_ID } }),
    dependencies(),
  );
  const withQueryPlayerId = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ extraQuery: `playerId=${OTHER_PLAYER_ID}` }),
    dependencies(),
  );

  await assertErrorResponse(
    withBodyPlayerId,
    400,
    "invalid_game_dashboard_request",
  );
  await assertErrorResponse(
    withQueryPlayerId,
    400,
    "invalid_game_dashboard_request",
  );
});

Deno.test("player dashboard cutscene actions cannot mark another player's delivery", async () => {
  const seededTables = tables();
  seededTables.notifications = [storyNotificationRow()];
  seededTables.notification_deliveries = [storyDeliveryRow({
    player_id: OTHER_PLAYER_ID,
  })];
  const client = new FakeClient(seededTables);

  const response = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ action: "mark_cutscene_seen" }),
    dependencies({ client }),
  );

  await assertErrorResponse(
    response,
    404,
    "game_dashboard_cutscene_delivery_not_found",
  );
  assertEquals(seededTables.notification_deliveries[0]?.seen_at, null);
});

Deno.test("player dashboard cutscene actions cannot mark another game's delivery or a missing delivery", async () => {
  for (
    const deliveries of [[], [
      storyDeliveryRow({ game_session_id: OTHER_GAME_SESSION_ID }),
    ]]
  ) {
    const seededTables = tables();
    seededTables.notification_deliveries = deliveries;
    const response = await handlePlayerGameDashboardRequest(
      cutsceneActionRequest(),
      dependencies({ client: new FakeClient(seededTables) }),
    );
    await assertErrorResponse(
      response,
      404,
      "game_dashboard_cutscene_delivery_not_found",
    );
    assertEquals(
      deliveries.map((row) => row.seen_at),
      deliveries.map(() => null),
    );
  }
});

Deno.test("player dashboard constructs Story capability only for authorized delivery actions", async () => {
  let constructions = 0;
  const deps = dependencies({ repository: new CapturingRepository() });
  deps.createStoryNotificationRepository = () => {
    constructions += 1;
    return new CapturingStoryNotificationReader();
  };
  const get = await handlePlayerGameDashboardRequest(request(), deps);
  assertEquals(get.status, 200);
  assertEquals(constructions, 0);
  await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ gameSessionId: OTHER_GAME_SESSION_ID }),
    deps,
  );
  await handlePlayerGameDashboardRequest(
    cutsceneActionRequest({ bodyOverrides: { playerId: OTHER_PLAYER_ID } }),
    deps,
  );
  assertEquals(constructions, 0);
  const post = await handlePlayerGameDashboardRequest(
    cutsceneActionRequest(),
    deps,
  );
  assertEquals(post.status, 200);
  assertEquals(constructions, 1);
});

Deno.test("dashboard financial helpers preserve currency ambiguity and invalid numeric defaults without I/O", () => {
  const balances = ["ECO", "SLV"].map((currency_code) => ({
    player_id: PLAYER_ID,
    account_type: "checking",
    currency_code,
    balance: "1.23456789",
  }));
  const ambiguous = toCashDto(balances, null);
  assertEquals([ambiguous.primaryCurrencyCode, ambiguous.totalBalance], [
    null,
    0,
  ]);
  assertEquals(toCashDto(balances, " slv ").totalBalance, 1.234568);
  assertEquals(
    toCashDto(balances.slice(0, 1), null).primaryCurrencyCode,
    "ECO",
  );
  assertEquals(
    toCashDto([{ ...balances[0], balance: "Infinity" }], "ECO").totalBalance,
    0,
  );
  assertEquals(
    toCashDto([{ ...balances[0], balance: NaN }], "ECO").totalBalance,
    0,
  );
  const missing = toHoldingDto({
    ...holdingRow(),
    listing_currency_code: "SLV",
  }, undefined);
  assertEquals([
    missing.currentPrice,
    missing.marketValue,
    missing.costBasis,
    missing.unrealizedPnl,
    missing.unrealizedPnlPct,
  ], [0, 0, 500, -500, -100]);
  const invalid = toHoldingDto({
    ...holdingRow(),
    listing_currency_code: "ECO",
    quantity: "invalid",
    average_cost: Infinity,
    realized_pnl: "bad",
  }, undefined);
  assertEquals([invalid.quantity, invalid.averageCost, invalid.realizedPnl], [
    0,
    0,
    0,
  ]);
  const unknown = summarizePortfolio(toCashDto([], null), []);
  assertEquals([
    unknown.currencyCode,
    unknown.valuationStatus,
    unknown.totalEquity,
  ], ["UNKNOWN", "complete", 0]);
  const portfolio = summarizePortfolio(toCashDto(balances, "ECO"), [
    missing,
    invalid,
  ]);
  assertEquals([
    portfolio.currencyCode,
    portfolio.cashBalance,
    portfolio.totalEquity,
    portfolio.positionsCount,
    portfolio.valuationStatus,
  ], ["ECO", 1.234568, 1.234568, 1, "partial_unconverted"]);
  assertEquals(portfolio.byCurrency?.map((row) => row.currencyCode), [
    "ECO",
    "SLV",
  ]);
});

// Frozen synthetic snapshots and complete query traces were captured before REF-037.
// Keep these together: output parity alone would miss extra reads or weakened scope.
Deno.test("dashboard financial extraction preserves snapshots and scoped query traces", async () => {
  const expected: Record<string, readonly unknown[]> = {
    "scoped": [
      "b9044a3aa92209705bd44b733580b5e26f61f0c5dd7f48bc285af00f050d618d",
      "4e3f72249c0570c4605d9a5347689c13be1aa5efe32c5f11d49cb2d9dcd9c5c7",
      18,
    ],
    "empty": [
      "a5768116b1241a18145c139762347e887a02af7e43412830434d193bb60a598d",
      "db12053205f61e33d34740c5bf0c30881e2fcc7561d9d39165890ffd7c3f563f",
      17,
    ],
    "mixed": [
      "3db88ae6854cea1e78bba71fb8bbb155e3f1c0f28e81ac4f49f0f65746eb64c2",
      "4e3f72249c0570c4605d9a5347689c13be1aa5efe32c5f11d49cb2d9dcd9c5c7",
      18,
    ],
    "missing-stock": [
      "c181afc372ddd38076c20002566459a5ad96daba62514ce8c8f9d0946b411ea3",
      "4e3f72249c0570c4605d9a5347689c13be1aa5efe32c5f11d49cb2d9dcd9c5c7",
      18,
    ],
    "large": [
      "f762c69536659a75f61ba163a96a0cf4297766a24926fff7bb9ec7e21424d0bd",
      "4e3f72249c0570c4605d9a5347689c13be1aa5efe32c5f11d49cb2d9dcd9c5c7",
      18,
    ],
    "failure": [
      "ddcd92d3d196f90d7184a6ffdf00451af3f727e0a94d0c174666cdc2436b154c",
      "4e3f72249c0570c4605d9a5347689c13be1aa5efe32c5f11d49cb2d9dcd9c5c7",
      18,
    ],
  };
  for (const scenario of Object.keys(expected)) {
    const data = tables();
    if (scenario === "empty") {
      for (const key of Object.keys(data)) {
        if (key !== "game_sessions") data[key] = [];
      }
    }
    if (scenario === "mixed") {
      data.account_balances = [
        ...data.account_balances,
        ...["ECO", "SLV"].map((currency_code) => ({
          game_session_id: GAME_SESSION_ID,
          player_id: PLAYER_ID,
          account_type: "checking",
          currency_code,
          balance: "1.23456789",
        })),
      ];
      data.stock_positions = [
        holdingRow({
          quantity: "2.3333333",
          average_cost: "bad",
          realized_pnl: "Infinity",
        }),
      ];
    }
    if (scenario === "missing-stock") {
      data.game_session_stock_assets = [stockAsset({ is_active: false })];
    }
    if (scenario === "large") {
      data.stock_positions = Array.from(
        { length: 1000 },
        (_, i) => holdingRow({ quantity: i % 3, average_cost: "0.12345678" }),
      );
    }
    const client = new FakeClient(
      data,
      scenario === "failure" ? "account_balances" : null,
    );
    const repository = new SupabasePlayerGameDashboardRepository(
      client as any,
      {
        stockMarketReadRepository: createStockMarketReadRepository(client as any),
        stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
        playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
        storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
      },
      () => new Date("2026-06-24T00:00:00Z"),
    );
    let result: unknown;
    try {
      result = await repository.read({
        gameSessionId: GAME_SESSION_ID,
        playerId: PLAYER_ID,
        playerSessionId: PLAYER_SESSION_ID,
        playerDisplayName: "Avery",
        playerRosterLabel: "A-1",
      });
    } catch (error) {
      const failure = error as {
        code: string;
        message: string;
        status: number;
      };
      result = {
        code: failure.code,
        message: failure.message,
        status: failure.status,
      };
    }
    const digest = async (value: unknown) =>
      [
        ...new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(value)),
          ),
        ),
      ].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    assertEquals([
      await digest(result),
      await digest(client.trace),
      client.trace.length,
    ], expected[scenario]);
    assertEquals(client.forbiddenCalls, []);
  }
});

Deno.test("dashboard preserves public stock-read error codes, messages and statuses", async () => {
  const cases = [
    {
      error: new StockMarketReadError("game_session_not_found", "Missing game", 404),
      code: "game_dashboard_game_session_not_found",
    },
    {
      error: new StockMarketReadError("stock_market_schema_not_applied", "Schema unavailable", 503),
      code: "game_dashboard_read_failed",
    },
    {
      error: new StockMarketReadError("invalid_stock_market_read_request", "Invalid read", 400),
      code: "game_dashboard_read_failed",
    },
    {
      error: new StockMarketReadError("stock_market_read_failed", "Read unavailable", 500),
      code: "game_dashboard_read_failed",
    },
  ];
  for (const { error, code } of cases) {
    const client = new FakeClient(tables());
    const repository = new SupabasePlayerGameDashboardRepository(
      client as any,
      {
        stockMarketReadRepository: { read: () => Promise.reject(error) },
        stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
        playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
        storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
      },
    );
    let caught: unknown;
    try {
      await repository.read({
        gameSessionId: GAME_SESSION_ID,
        playerId: PLAYER_ID,
        playerSessionId: PLAYER_SESSION_ID,
        playerDisplayName: "Avery",
        playerRosterLabel: "A-1",
      });
    } catch (failure) {
      caught = failure;
    }
    if (!(caught instanceof PlayerGameDashboardError)) {
      throw new Error("Expected the public Dashboard error type");
    }
    assertEquals([caught.code, caught.message, caught.status], [
      code, error.message, error.status,
    ]);
  }
});

Deno.test("dashboard rethrows unknown stock-read failures unchanged", async () => {
  const failure = new Error("Synthetic provider failure");
  const client = new FakeClient(tables());
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: { read: () => Promise.reject(failure) },
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
      playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
      storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
    },
  );
  let caught: unknown;
  try {
    await repository.read({
      gameSessionId: GAME_SESSION_ID,
      playerId: PLAYER_ID,
      playerSessionId: PLAYER_SESSION_ID,
      playerDisplayName: "Avery",
      playerRosterLabel: "A-1",
    });
  } catch (error) {
    caught = error;
  }
  if (caught !== failure) throw new Error("Unknown stock failure was replaced");
});

Deno.test("dashboard consumes its injected stock port with fresh game-scoped reads", async () => {
  const client = new FakeClient(tables());
  const calls: StockMarketReadInput[] = [];
  const stockMarket: StockMarketReadRepository = {
    read: (input) => {
      calls.push(input);
      return Promise.resolve({
        gameSessionId: input.gameSessionId,
        tickIndex: calls.length,
        stocks: [],
      });
    },
  };
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: stockMarket,
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
      playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
      storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
    },
    () => new Date("2026-06-24T00:00:00Z"),
  );
  const games = [GAME_SESSION_ID, OTHER_GAME_SESSION_ID, GAME_SESSION_ID];
  for (const [index, gameSessionId] of games.entries()) {
    const snapshot = await repository.read({
      gameSessionId,
      playerId: gameSessionId === GAME_SESSION_ID ? PLAYER_ID : OTHER_GAME_PLAYER_ID,
      playerSessionId: PLAYER_SESSION_ID,
      playerDisplayName: "Synthetic player",
      playerRosterLabel: "A-1",
    });
    assertEquals(snapshot.gameSession.currentTick, index + 1);
    assertEquals(snapshot.public.market.stocks, []);
  }
  assertEquals(calls, games.map((gameSessionId) => ({
    gameSessionId,
    includeHistory: false,
    historyLimit: 1,
  })));
  assertEquals(client.trace.filter((entry) =>
    (entry as { rpc?: string }).rpc === "read_latest_stock_market_ticks_for_game"
  ), []);
});

Deno.test("dashboard market-open port preserves game, caller time and one clock evaluation", async () => {
  for (const [gameSessionId, open, expectedStatus] of [
    [GAME_SESSION_ID, true, "open"],
    [OTHER_GAME_SESSION_ID, false, "closed"],
  ] as const) {
    const client = new FakeClient(tables());
    const at = new Date("2026-07-20T12:34:56.789Z");
    const calls: unknown[] = [];
    const marketOpen = createStockMarketOpenStateReadRepository({
      rpc: <T>(functionName: string, args?: unknown) => {
        calls.push({ functionName, args });
        return Promise.resolve({ data: open as T, error: null });
      },
    });
    let clockCalls = 0;
    const repository = new SupabasePlayerGameDashboardRepository(
      client as any,
      {
        stockMarketReadRepository: createStockMarketReadRepository(client as any),
        stockMarketOpenStateReadRepository: {
          read: (gameId, receivedAt) => {
            if (receivedAt !== at) throw new Error("Caller Date was replaced");
            return marketOpen.read(gameId, receivedAt);
          },
        },
        playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
        storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
      },
      () => {
        clockCalls += 1;
        return at;
      },
    );
    const snapshot = await repository.read({
      gameSessionId,
      playerId: gameSessionId === GAME_SESSION_ID ? PLAYER_ID : OTHER_GAME_PLAYER_ID,
      playerSessionId: PLAYER_SESSION_ID,
      playerDisplayName: "Synthetic player",
      playerRosterLabel: "A-1",
    });
    assertEquals(snapshot.gameSession.marketStatus, expectedStatus);
    assertEquals(clockCalls, 1);
    assertEquals(calls, [{
      functionName: "is_stock_market_open_at",
      args: { p_game_session_id: gameSessionId, p_at: at.toISOString() },
    }]);
    assertEquals(client.trace.filter((entry) =>
      (entry as { rpc?: string }).rpc === "is_stock_market_open_at"
    ), []);
  }
});

Deno.test("public market-open port rejects invalid dates before any RPC", async () => {
  let calls = 0;
  const repository = createStockMarketOpenStateReadRepository({
    rpc: <T>() => {
      calls += 1;
      return Promise.resolve({ data: true as T, error: null });
    },
  });
  for (const at of [new Date(NaN), "2026-07-20" as unknown as Date]) {
    await assertMarketOpenReadError(
      () => repository.read(GAME_SESSION_ID, at),
      "A valid server market-evaluation time is required.",
    );
    assertEquals(calls, 0);
  }
});

Deno.test("public market-open port rejects RPC errors and non-boolean data", async () => {
  for (const response of [
    { data: null, error: null },
    { data: 1, error: null },
    { data: "false", error: null },
    { data: true, error: { message: "Synthetic RPC failure" } },
  ]) {
    let calls = 0;
    const repository = createStockMarketOpenStateReadRepository({
      rpc: <T>() => {
        calls += 1;
        return Promise.resolve({
          data: response.data as T | null,
          error: response.error,
        });
      },
    });
    await assertMarketOpenReadError(
      () => repository.read(GAME_SESSION_ID, new Date("2026-07-20T00:00:00Z")),
      "Authoritative game market-session state could not be read.",
    );
    assertEquals(calls, 1);
  }
});

Deno.test("dashboard preserves market-open RPC rejection identity", async () => {
  const failure = new Error("Synthetic provider rejection");
  const client = new FakeClient(tables());
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: createStockMarketReadRepository(client as any),
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository({
        rpc: () => Promise.reject(failure),
      }),
      playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
      storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
    },
    () => new Date("2026-07-20T00:00:00Z"),
  );
  let caught: unknown;
  try {
    await repository.read({
      gameSessionId: GAME_SESSION_ID,
      playerId: PLAYER_ID,
      playerSessionId: PLAYER_SESSION_ID,
      playerDisplayName: "Avery",
      playerRosterLabel: "A-1",
    });
  } catch (error) {
    caught = error;
  }
  if (caught !== failure) throw new Error("Market-open failure was replaced");
});

async function assertMarketOpenReadError(
  action: () => Promise<unknown>,
  message: string,
): Promise<void> {
  let caught: unknown;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof StockMarketOpenStateReadError)) {
    throw new Error("Expected the existing market-open error type");
  }
  assertEquals(caught.message, message);
}

function dependencies(options: {
  readonly client?: FakeClient;
  readonly repository?: PlayerGameDashboardRepository;
  readonly storyNotificationRepository?:
    PlayerGameDashboardStoryNotificationRepository;
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
    now: () => "2026-06-25T12:30:00.000Z",
    createRepository: options.repository ? () => options.repository : undefined,
    createStoryNotificationRepository: options.storyNotificationRepository
      ? () => options.storyNotificationRepository
      : undefined,
  };
}

Deno.test("player dashboard populates contracts for authenticated player only", async () => {
  const seededTables = tables();
  seededTables.game_session_contracts = [
    gameSessionContract(),
    gameSessionContract({
      id: DRAFT_CONTRACT_ID,
      contract_key: "draft_contract",
      title: "Draft Contract",
      status: "draft",
    }),
    gameSessionContract({
      id: OTHER_GAME_CONTRACT_ID,
      game_session_id: OTHER_GAME_SESSION_ID,
      contract_key: "other_game_contract",
      title: "Other Game Contract",
    }),
  ];
  seededTables.player_contract_progress = [
    playerContractProgress(),
    playerContractProgress({
      id: OTHER_PLAYER_CONTRACT_PROGRESS_ID,
      player_id: OTHER_PLAYER_ID,
    }),
    playerContractProgress({
      id: OTHER_GAME_CONTRACT_PROGRESS_ID,
      game_session_id: OTHER_GAME_SESSION_ID,
      contract_id: OTHER_GAME_CONTRACT_ID,
      player_id: OTHER_GAME_PLAYER_ID,
    }),
  ];

  const client = new FakeClient(seededTables);
  const response = await handlePlayerGameDashboardRequest(
    request(),
    dependencies({ client }),
  );
  const body = await response.json();

  assertEquals(response.status, 200);
  assertEquals(
    body.me.contracts.available.map((
      contract: { readonly contractId: string },
    ) => contract.contractId),
    [CONTRACT_ID],
  );
  assertEquals(body.me.contracts.available[0].title, "Market Research Brief");
  assertEquals(body.me.contracts.available[0].status, "active");

  assertEquals(
    body.me.contracts.progress.map((
      progress: { readonly progressId: string },
    ) => progress.progressId),
    [CONTRACT_PROGRESS_ID],
  );
  assertEquals(body.me.contracts.progress[0].status, "submitted");
  assertEquals(body.me.contracts.progress[0].playerId, PLAYER_ID);

  assertEquals(
    body.public.contracts.map((
      contract: { readonly contractId: string },
    ) => contract.contractId),
    [CONTRACT_ID],
  );

  const serialized = JSON.stringify(body);
  assertEquals(serialized.includes(DRAFT_CONTRACT_ID), false);
  assertEquals(serialized.includes(OTHER_GAME_CONTRACT_ID), false);
  assertEquals(serialized.includes(OTHER_PLAYER_CONTRACT_PROGRESS_ID), false);
  assertEquals(serialized.includes(OTHER_GAME_CONTRACT_PROGRESS_ID), false);
});

Deno.test("public Contracts query exposes reads and returns scoped player DTOs", async () => {
  const data = tables();
  data.game_session_contracts = [
    gameSessionContract({
      metadata: { quiz: { prompt: "Visible question", correctAnswer: "Hidden answer" } },
      requirements_payload: { quiz: { expectedAnswer: "Hidden requirement" } },
    }),
    gameSessionContract({
      id: DRAFT_CONTRACT_ID,
      visibility: "targeted",
      targeting_payload: { playerIds: [OTHER_PLAYER_ID], countryCodes: ["SOLVEND"] },
    }),
    gameSessionContract({ id: OTHER_GAME_CONTRACT_ID, game_session_id: OTHER_GAME_SESSION_ID }),
  ];
  data.player_contract_progress = [
    playerContractProgress(),
    playerContractProgress({ id: OTHER_PLAYER_CONTRACT_PROGRESS_ID, player_id: OTHER_PLAYER_ID }),
    playerContractProgress({
      id: OTHER_GAME_CONTRACT_PROGRESS_ID,
      game_session_id: OTHER_GAME_SESSION_ID,
      contract_id: OTHER_GAME_CONTRACT_ID,
      player_id: OTHER_GAME_PLAYER_ID,
    }),
  ];
  const client = new FakeClient(data);
  const query = createPlayerContractsReadQuery(client as any);
  assertEquals(Object.keys(query), ["read"]);
  for (const method of [
    "createContractTemplate", "createGameSessionContract",
    "updateGameSessionContractStatus", "upsertPlayerContractProgress",
    "reviewPlayerContractProgress", "markContractRewardIssued",
  ]) {
    assertEquals((query as unknown as Record<string, unknown>)[method], undefined);
  }
  const result = await query.read({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    countryCode: "SOLVEND",
    rosterLabel: "A-1",
  } as PlayerContractsReadInput);
  assertEquals(result.available.map((row) => row.contractId), [CONTRACT_ID]);
  assertEquals(result.progress.map((row) => row.progressId), [CONTRACT_PROGRESS_ID]);
  assertEquals(result.available[0].metadata, { quiz: { prompt: "Visible question" } });
  assertEquals(result.available[0].requirementsPayload, { quiz: {} });
  assertEquals("createdByStaffId" in result.available[0], false);
  assertEquals("contractTemplateId" in result.available[0], false);
  assertEquals(data.game_session_contracts[0].metadata, {
    quiz: { prompt: "Visible question", correctAnswer: "Hidden answer" },
  });
  const other = await query.read({
    gameSessionId: OTHER_GAME_SESSION_ID,
    playerId: OTHER_GAME_PLAYER_ID,
  });
  assertEquals(other.available.map((row) => row.contractId), [OTHER_GAME_CONTRACT_ID]);
  assertEquals(other.progress.map((row) => row.progressId), [OTHER_GAME_CONTRACT_PROGRESS_ID]);
  assertEquals(client.forbiddenCalls, []);
});

Deno.test("public Contracts query starts both reads before either completes", async () => {
  const client = new FakeClient(tables());
  const from = client.from.bind(client);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => release = resolve);
  const started: string[] = [];
  client.from = (table) => {
    const builder = from(table);
    return new Proxy(builder, {
      get(target, key, receiver) {
        if (key !== "then") return Reflect.get(target, key, receiver);
        return (
          resolve: Parameters<typeof target.then>[0],
          reject: Parameters<typeof target.then>[1],
        ) => {
          started.push(table);
          return gate.then(() => target.then(resolve, reject));
        };
      },
    });
  };
  const pending = createPlayerContractsReadQuery(client as any).read({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  });
  try {
    await Promise.resolve();
    assertEquals(started, ["game_session_contracts", "player_contract_progress"]);
  } finally {
    release();
  }
  await pending;
});

Deno.test("public Contracts query preserves persistence errors and unknown rejection identity", async () => {
  for (const table of ["game_session_contracts", "player_contract_progress"]) {
    const client = new FakeClient(tables(), table);
    let caught: unknown;
    try {
      await createPlayerContractsReadQuery(client as any).read({
        gameSessionId: GAME_SESSION_ID,
        playerId: PLAYER_ID,
      });
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof ContractRepositoryError)) {
      throw new Error("Expected the existing Contracts persistence error");
    }
    assertEquals([caught.code, caught.message, caught.tableName, caught.operation], [
      "contract_repository_query_failed", "synthetic dependency failure", table, "select",
    ]);
    const failure = new Error("Synthetic Contracts provider failure");
    const unknownClient = new FakeClient(tables());
    const from = unknownClient.from.bind(unknownClient);
    unknownClient.from = (name) => {
      if (name === table) throw failure;
      return from(name);
    };
    let unknown: unknown;
    try {
      await createPlayerContractsReadQuery(unknownClient as any).read({
        gameSessionId: GAME_SESSION_ID,
        playerId: PLAYER_ID,
      });
    } catch (error) {
      unknown = error;
    }
    if (unknown !== failure) throw new Error("Contracts rejection was replaced");
  }
});

Deno.test("dashboard uses injected Contracts DTOs in both response locations on fresh reads", async () => {
  let result = await createPlayerContractsReadQuery(new FakeClient(tables()) as any).read({
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
  });
  const calls: PlayerContractsReadInput[] = [];
  const client = new FakeClient(tables(), "game_session_contracts");
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: createStockMarketReadRepository(client as any),
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
      playerContractsReadQuery: { read: (input) => { calls.push(input); return Promise.resolve(result); } },
      storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
    },
    () => new Date("2026-06-24T00:00:00Z"),
  );
  const input = {
    gameSessionId: GAME_SESSION_ID,
    playerId: PLAYER_ID,
    playerSessionId: PLAYER_SESSION_ID,
    playerDisplayName: "Avery",
    playerRosterLabel: "A-1",
  };
  const first = await repository.read(input);
  if (first.me.contracts.available !== result.available || first.public.contracts !== result.available || first.me.contracts.progress !== result.progress) {
    throw new Error("Dashboard replaced the owned Contracts DTO arrays");
  }
  result = { available: [], progress: [] };
  const second = await repository.read(input);
  assertEquals(second.me.contracts, result);
  assertEquals(second.public.contracts, []);
  assertEquals(calls, [
    { gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID },
    { gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID },
  ]);
  assertEquals(client.trace.filter((entry) =>
    ["game_session_contracts", "player_contract_progress"].includes((entry as { table?: string }).table ?? "")
  ), []);
});

Deno.test("dashboard preserves an injected Contracts query rejection unchanged", async () => {
  const client = new FakeClient(tables());
  const failure = new Error("Synthetic Contracts query failure");
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: createStockMarketReadRepository(client as any),
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
      playerContractsReadQuery: { read: () => Promise.reject(failure) },
      storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
    },
  );
  let caught: unknown;
  try {
    await repository.read({
      gameSessionId: GAME_SESSION_ID,
      playerId: PLAYER_ID,
      playerSessionId: PLAYER_SESSION_ID,
      playerDisplayName: "Avery",
      playerRosterLabel: "A-1",
    });
  } catch (error) {
    caught = error;
  }
  if (caught !== failure) throw new Error("Contracts query failure was replaced");
});

Deno.test("Store Dashboard query exposes only reads with exact scope, visibility and ordering", async () => {
  const data = tables();
  data.store_items = [
    storeItem({ id: "later", name: "Alpha", sort_order: 2 }),
    storeItem({ id: "zulu", name: "Zulu", sort_order: 1 }),
    storeItem({ id: "alpha", name: "Alpha", sort_order: 1 }),
    storeItem({ id: "hidden", visibility: "hidden" }),
    storeItem({ id: "disabled", status: "disabled" }),
    storeItem({ id: "archived", status: "archived" }),
    storeItem({ id: "other", game_session_id: OTHER_GAME_SESSION_ID }),
  ];
  const client = new FakeClient(data);
  const query = createDashboardStoreListingsReadQuery(client as any);
  assertEquals(Object.keys(query), ["read"]);
  for (const method of ["from", "client", "createStoreItem", "updateStoreItem", "listPurchases", "purchase"]) {
    assertEquals((query as unknown as Record<string, unknown>)[method], undefined);
  }
  assertEquals((await query.read(GAME_SESSION_ID)).map((row) => row.id), ["alpha", "zulu", "later"]);
  assertEquals((await query.read(OTHER_GAME_SESSION_ID)).map((row) => row.id), ["other"]);
  data.store_items = [];
  assertEquals(await query.read(GAME_SESSION_ID), []);
  assertEquals(client.trace, [GAME_SESSION_ID, OTHER_GAME_SESSION_ID, GAME_SESSION_ID].map((gameId) => ({
    table: "store_items",
    columns: "id,game_session_id,item_key,name,description,category,price,currency_code,stock_quantity,status,visibility,sort_order,created_at,updated_at",
    filters: [
      { column: "game_session_id", value: gameId },
      { column: "status", value: "active" },
      { column: "visibility", value: "visible" },
    ],
    inFilters: [],
    orderings: [{ column: "sort_order", ascending: true }, { column: "name", ascending: true }],
    limit: null,
  })));
  assertEquals(client.forbiddenCalls, []);
});

Deno.test("Store Dashboard projection preserves numeric defaults, truncation and exact DTO fields", async () => {
  for (const [value, expected] of [
    [1.75, 1.75], [-2.5, -2.5], ["3.75", 3.75], ["-4.5", -4.5],
    ["0x10", 16], ["", 0], ["bad", 0], ["Infinity", 0],
    [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0], [null, 0], [undefined, 0],
  ] as const) {
    const row = storeItem({
      price: value, stock_quantity: value, sort_order: value,
      description: undefined, game_item: { source_kind: "system" },
    });
    const client = new FakeClient({ store_items: [row] });
    const result = await createDashboardStoreListingsReadQuery(client as any).read(GAME_SESSION_ID);
    assertEquals(result, [{
      id: row.id, gameSessionId: row.game_session_id, itemKey: row.item_key,
      name: row.name, description: null, category: row.category,
      price: expected, currencyCode: row.currency_code,
      stockQuantity: Math.trunc(expected), status: row.status,
      visibility: row.visibility, sortOrder: Math.trunc(expected),
      createdAt: row.created_at, updatedAt: row.updated_at,
    }]);
    assertEquals(Object.hasOwn(result[0], "sourceType"), false);
    assertEquals(Object.hasOwn(result[0], "game_item"), false);
  }
});

Deno.test("Store Dashboard query preserves response failure and unknown provider or projection rejection", async () => {
  let caught: unknown;
  try {
    await createDashboardStoreListingsReadQuery(new FakeClient(tables(), "store_items") as any).read(GAME_SESSION_ID);
  } catch (error) {
    caught = error;
  }
  if (!(caught instanceof DashboardStoreListingsReadError)) throw new Error("Expected Store read failure");
  for (const scenario of ["provider", "projection"]) {
    const failure = new Error(`Synthetic Store ${scenario} failure`);
    const row = storeItem();
    const client = new FakeClient({ store_items: [row] });
    if (scenario === "provider") {
      client.from = () => { throw failure; };
    } else {
      Object.defineProperty(row, "price", { get: () => { throw failure; } });
    }
    caught = undefined;
    try {
      await createDashboardStoreListingsReadQuery(client as any).read(GAME_SESSION_ID);
    } catch (error) {
      caught = error;
    }
    if (caught !== failure) throw new Error(`Store ${scenario} rejection was replaced`);
  }
});

Deno.test("Dashboard uses fresh injected Store listings without hidden catalog reads", async () => {
  let listings = await createDashboardStoreListingsReadQuery(new FakeClient(tables()) as any).read(GAME_SESSION_ID);
  const calls: string[] = [];
  const client = new FakeClient(tables(), "store_items");
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    {
      stockMarketReadRepository: createStockMarketReadRepository(client as any),
      stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
      playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
      storeListingsReadQuery: { read: (gameId) => { calls.push(gameId); return Promise.resolve(listings); } },
    },
    () => new Date("2026-06-24T00:00:00Z"),
  );
  const input = {
    gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID,
    playerSessionId: PLAYER_SESSION_ID, playerDisplayName: "Avery", playerRosterLabel: "A-1",
  };
  const first = await repository.read(input);
  if (first.me.store.listings !== listings) throw new Error("Dashboard replaced Store DTO array");
  assertEquals(first.public.storeListings.map((row) => row.itemId), [STORE_ITEM_ID]);
  assertEquals("price" in first.public.storeListings[0], false);
  listings = [];
  assertEquals((await repository.read(input)).me.store.listings, []);
  assertEquals(calls, [GAME_SESSION_ID, GAME_SESSION_ID]);
  assertEquals(client.trace.filter((entry) => (entry as { table?: string }).table === "store_items"), []);
  assertEquals(client.forbiddenCalls, []);
});

Deno.test("Dashboard retains its Store error contract and unknown rejection identity", async () => {
  for (const known of [true, false]) {
    const failure = known ? new DashboardStoreListingsReadError() : new Error("Synthetic injected Store failure");
    const client = new FakeClient(tables());
    const repository = new SupabasePlayerGameDashboardRepository(
      client as any,
      {
        stockMarketReadRepository: createStockMarketReadRepository(client as any),
        stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
        playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
        storeListingsReadQuery: { read: () => Promise.reject(failure) },
      },
    );
    let caught: unknown;
    try {
      await repository.read({
        gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID,
        playerSessionId: PLAYER_SESSION_ID, playerDisplayName: "Avery", playerRosterLabel: "A-1",
      });
    } catch (error) {
      caught = error;
    }
    if (known) {
      if (!(caught instanceof PlayerGameDashboardError)) throw new Error("Expected original Dashboard error");
      assertEquals([caught.code, caught.message, caught.status], [
        "game_dashboard_read_failed", "Player game dashboard could not be loaded.", 500,
      ]);
    } else if (caught !== failure) {
      throw new Error("Injected Store rejection was replaced");
    }
  }
});

Deno.test("Dashboard captures port references without retaining or freezing the caller record", async () => {
  const client = new FakeClient(tables());
  const original = {
    stockMarketReadRepository: createStockMarketReadRepository(client as any),
    stockMarketOpenStateReadRepository: createStockMarketOpenStateReadRepository(client as any),
    playerContractsReadQuery: createPlayerContractsReadQuery(client as any),
    storeListingsReadQuery: createDashboardStoreListingsReadQuery(client as any),
  };
  const callerRecord = { ...original };
  const repository = new SupabasePlayerGameDashboardRepository(
    client as any,
    callerRecord,
    () => new Date("2026-06-24T00:00:00Z"),
  );
  const replaced = () => Promise.reject(new Error("Caller replacement must not run"));
  callerRecord.stockMarketReadRepository = { read: replaced };
  callerRecord.stockMarketOpenStateReadRepository = { read: replaced };
  callerRecord.playerContractsReadQuery = { read: replaced };
  callerRecord.storeListingsReadQuery = { read: replaced };
  const input = {
    gameSessionId: GAME_SESSION_ID, playerId: PLAYER_ID,
    playerSessionId: PLAYER_SESSION_ID, playerDisplayName: "Avery", playerRosterLabel: "A-1",
  };
  const first = await repository.read(input);
  assertEquals(first.me.store.listings.map((row) => row.id), [STORE_ITEM_ID]);
  assertEquals(Object.isFrozen(callerRecord), false);
  for (const port of Object.values(original)) assertEquals(Object.isFrozen(port), false);
  const readStore = original.storeListingsReadQuery.read;
  original.storeListingsReadQuery.read = async (gameId) =>
    (await readStore(gameId)).map((row) => ({ ...row, name: "Fresh original port" }));
  const second = await repository.read(input);
  assertEquals(second.me.store.listings.map((row) => row.name), ["Fresh original port"]);
  for (const name of ["game_session_contracts", "player_contract_progress", "store_items"]) {
    assertEquals(client.trace.filter((entry) => (entry as { table?: string }).table === name).length, 2);
  }
  assertEquals(client.trace.filter((entry) => (entry as { rpc?: string }).rpc === "is_stock_market_open_at").length, 2);
  assertEquals(client.forbiddenCalls, []);
});

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

function cutsceneActionRequest(options: {
  readonly action?:
    | "mark_cutscene_seen"
    | "mark_cutscene_dismissed"
    | "mark_cutscene_acknowledged";
  readonly authToken?: string | null;
  readonly gameSessionId?: string;
  readonly deliveryId?: string;
  readonly runnerSecret?: string;
  readonly extraQuery?: string;
  readonly bodyOverrides?: Record<string, unknown>;
} = {}): Request {
  const headers = new Headers({
    "content-type": "application/json",
  });
  const query = options.extraQuery ? `?${options.extraQuery}` : "";

  if (options.authToken !== null) {
    headers.set("x-player-session-token", options.authToken ?? "player-token");
  }

  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }

  return new Request(
    `https://example.test/players/me/game/dashboard${query}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: options.action ?? "mark_cutscene_seen",
        gameSessionId: options.gameSessionId ?? GAME_SESSION_ID,
        deliveryId: options.deliveryId ?? STORY_DELIVERY_ID,
        ...options.bodyOverrides,
      }),
    },
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
        account_type: "checking",
        balance: 9500,
        currency_code: "SLV",
      },
      {
        game_session_id: GAME_SESSION_ID,
        player_id: OTHER_PLAYER_ID,
        account_type: "checking",
        balance: 50000,
        currency_code: "ELD",
      },
      {
        game_session_id: OTHER_GAME_SESSION_ID,
        player_id: OTHER_GAME_PLAYER_ID,
        account_type: "checking",
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
    notifications: [],
    notification_deliveries: [],
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
    listing_currency_code: "SLV",
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

function gameSessionContract(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: CONTRACT_ID,
    game_session_id: GAME_SESSION_ID,
    contract_key: "market_research_brief",
    source_type: "teacher",
    source_id: null,
    created_by_staff_id: "00000000-0000-4000-8000-000000000c01",
    title: "Market Research Brief",
    description: "Research one Econovaria market.",
    instructions: "Submit a short market note.",
    category: "research",
    status: "active",
    visibility: "public",
    targeting_payload: {},
    requirements_payload: {},
    reward_payload: { cash: { amount: 100, currencyCode: "SLV" } },
    completion_mode: "manual_review",
    published_at: "2026-06-24T00:01:00.000Z",
    deadline_at: "2026-06-30T00:00:00.000Z",
    expires_at: null,
    metadata: {},
    created_at: "2026-06-24T00:00:00.000Z",
    updated_at: "2026-06-24T00:01:00.000Z",
    ...overrides,
  };
}

function playerContractProgress(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: CONTRACT_PROGRESS_ID,
    game_session_id: GAME_SESSION_ID,
    contract_id: CONTRACT_ID,
    player_id: PLAYER_ID,
    status: "submitted",
    evidence_payload: { note: "Solvend demand is rising." },
    result_payload: {},
    submitted_at: "2026-06-24T00:08:00.000Z",
    completed_at: null,
    reward_issued_at: null,
    created_at: "2026-06-24T00:07:00.000Z",
    updated_at: "2026-06-24T00:08:00.000Z",
    ...overrides,
  };
}

function storyNotificationRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: STORY_NOTIFICATION_ID,
    game_session_id: GAME_SESSION_ID,
    source_type: "storyline_event",
    source_id: "story-event-1",
    notification_type: "story_cutscene",
    title: "Northreach closes northern migration corridors",
    summary: "Border restrictions escalate after security concerns.",
    priority: "major",
    display_mode: "modal_on_next_login",
    payload: {
      videoAssetKey: "northreach-border-closure-v1",
      posterAssetKey: "northreach-border-closure-poster",
      requiresAcknowledgement: true,
    },
    published_at: "2026-06-24T00:12:00.000Z",
    ...overrides,
  };
}

function storyDeliveryRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: STORY_DELIVERY_ID,
    notification_id: STORY_NOTIFICATION_ID,
    game_session_id: GAME_SESSION_ID,
    player_id: PLAYER_ID,
    delivered_at: "2026-06-24T00:12:30.000Z",
    seen_at: null,
    dismissed_at: null,
    acknowledged_at: null,
    ...overrides,
  };
}

class CapturingRepository implements PlayerGameDashboardRepository {
  readonly inputs: PlayerGameDashboardReadInput[] = [];

  async read(
    input: PlayerGameDashboardReadInput,
  ): Promise<PlayerGameDashboardSnapshot> {
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
      unseenCutscenes: [],
    };
  }
}

class CapturingStoryNotificationReader
  implements PlayerGameDashboardStoryNotificationRepository {
  readonly readCalls = 0;

  markNotificationDeliverySeen(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input, {
      seenAt: input.markedAt,
    }));
  }

  markNotificationDeliveryDismissed(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input, {
      dismissedAt: input.markedAt,
    }));
  }

  markNotificationDeliveryAcknowledged(
    input: MarkNotificationDeliveryInput,
  ): Promise<StoryNotificationDeliveryRecord> {
    return Promise.resolve(deliveryRecord(input, {
      acknowledgedAt: input.markedAt,
    }));
  }
}

function deliveryRecord(
  input: MarkNotificationDeliveryInput,
  overrides: Partial<StoryNotificationDeliveryRecord> = {},
): StoryNotificationDeliveryRecord {
  return {
    id: input.deliveryId,
    notificationId: STORY_NOTIFICATION_ID,
    gameSessionId: input.gameSessionId,
    playerId: input.playerId,
    deliveredAt: "2026-06-24T00:12:30.000Z",
    seenAt: null,
    dismissedAt: null,
    acknowledgedAt: null,
    ...overrides,
  };
}

class FakeClient {
  readonly forbiddenCalls: string[] = [];
  readonly trace: unknown[] = [];

  constructor(
    readonly tables: Record<string, readonly Record<string, unknown>[]>,
    readonly failTable: string | null = null,
  ) {}

  from(tableName: string): FakeQueryBuilder {
    return new FakeQueryBuilder(this, tableName);
  }

  async rpc(functionName: string, args: Record<string, unknown> = {}) {
    this.trace.push({ rpc: functionName, args });
    if (functionName === "is_stock_market_open_at") {
      return { data: true, error: null };
    }
    if (functionName === "read_game_stock_positions_v1") {
      const rows = this.tables.stock_positions ?? this.tables.stock_holdings ??
        [];
      return {
        data: rows.filter((row) =>
          row.game_session_id === args.p_game_session_id
        ).map((row) => ({
          ...row,
          listing_currency_code: this.tables.game_session_stock_assets.find((
            a,
          ) => a.id === row.stock_asset_id)?.listing_currency_code,
        })),
        error: null,
      };
    }
    if (functionName !== "read_latest_stock_market_ticks_for_game") {
      this.forbiddenCalls.push(`rpc:${functionName}`);
      return {
        data: null,
        error: { message: `Unexpected RPC ${functionName}` },
      };
    }

    const gameSessionId = args.p_game_session_id;
    const ticker = args.p_ticker;
    const rows = (this.tables.stock_price_ticks ?? [])
      .filter((row) => row.game_session_id === gameSessionId)
      .filter((row) =>
        ticker === null || ticker === undefined || row.ticker === ticker
      );
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
  implements
    PromiseLike<{ readonly data: unknown[] | null; readonly error: unknown }> {
  private readonly filters: {
    readonly column: string;
    readonly value: unknown;
  }[] = [];
  private readonly inFilters: {
    readonly column: string;
    readonly values: readonly unknown[];
  }[] = [];
  private readonly orderings: {
    readonly column: string;
    readonly ascending: boolean;
  }[] = [];
  private columns = "";
  private operation: "select" | "update" = "select";
  private updateValues: Record<string, unknown> | null = null;
  private limitCount: number | null = null;

  constructor(
    private readonly client: FakeClient,
    private readonly tableName: string,
  ) {}

  select(columns = ""): FakeQueryBuilder {
    this.columns = columns;
    return this;
  }

  insert(): FakeQueryBuilder {
    this.client.forbiddenCalls.push(`insert:${this.tableName}`);
    return this;
  }

  update(values: Record<string, unknown>): FakeQueryBuilder {
    this.operation = "update";
    this.updateValues = values;
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

  is(column: string, value: null): FakeQueryBuilder {
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
    const result = this.operation === "update"
      ? await this.executeUpdate()
      : await this.execute();
    return { data: result.data?.[0] ?? null, error: result.error };
  }

  then<
    TResult1 = { readonly data: unknown[] | null; readonly error: unknown },
    TResult2 = never,
  >(
    onfulfilled?:
      | ((
        value: { readonly data: unknown[] | null; readonly error: unknown },
      ) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{
    readonly data: unknown[] | null;
    readonly error: unknown;
  }> {
    this.client.trace.push({
      table: this.tableName,
      columns: this.columns,
      filters: this.filters,
      inFilters: this.inFilters,
      orderings: this.orderings,
      limit: this.limitCount,
    });
    if (this.client.failTable === this.tableName) {
      return { data: null, error: { message: "synthetic dependency failure" } };
    }
    return { data: this.readRows(), error: null };
  }

  private async executeUpdate(): Promise<{
    readonly data: unknown[] | null;
    readonly error: unknown;
  }> {
    const rows = this.readRows();

    for (const row of rows) {
      Object.assign(row, this.updateValues ?? {});
    }

    return { data: rows, error: null };
  }

  private readRows(): Record<string, unknown>[] {
    let rows = [...(this.client.tables[this.tableName] ?? [])];

    for (const filter of this.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    for (const filter of this.inFilters) {
      rows = rows.filter((row) => filter.values.includes(row[filter.column]));
    }

    for (const ordering of [...this.orderings].reverse()) {
      rows.sort((left, right) => {
        const comparison = compareValues(
          left[ordering.column],
          right[ordering.column],
        );
        return ordering.ascending ? comparison : -comparison;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
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
