import { handlePlayerGameDashboardRequest } from "./playerGameDashboardHttpHandler.ts";
import {
  GAME_SESSION_ID,
  INVENTORY_ID,
  MARKET_EVENT_ID,
  ORDER_ID,
  OTHER_GAME_PLAYER_ID,
  OTHER_GAME_STOCK_ASSET_ID,
  OTHER_INVENTORY_ID,
  OTHER_PLAYER_ID,
  OTHER_PLAYER_ORDER_ID,
  OTHER_PLAYER_SESSION_ID,
  OTHER_PLAYER_TRADE_ID,
  OTHER_PURCHASE_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
  PREVIOUS_PLAYER_SESSION_ID,
  PREVIOUS_SESSION_ORDER_ID,
  PREVIOUS_SESSION_TRADE_ID,
  PURCHASE_ID,
  STOCK_ASSET_ID,
  STORE_ITEM_ID,
  TRADE_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import {
  dependencies,
  request,
} from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import {
  holdingRow,
  stockAsset,
  stockTick,
} from "./playerGameDashboardHttpHandler.test.rowFixtures.support.ts";
import {
  CapturingRepository,
  FakeClient,
} from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import { assertEquals } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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
