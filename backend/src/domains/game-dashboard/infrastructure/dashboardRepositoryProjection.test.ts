import {
  equal,
  ok,
  setup,
} from "./dashboardRepositoryCharacterizationFixture.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
Deno.test("dashboard projects numeric/default rows and removes private fields from public listings", async () => {
  const s = setup();
  const item = {
    id: "item",
    gameSessionId: "game",
    itemKey: "key",
    name: "Bike",
    description: null,
    category: "transport",
    price: 42,
    currencyCode: "USD",
    stockQuantity: 7,
    status: "active" as const,
    visibility: "visible" as const,
    sortOrder: 2,
    sourceType: "custom" as const,
    createdAt: "created",
    updatedAt: "updated",
  };
  s.dependencies.storeListingsReadQuery.read = async () => [item];
  s.client.rows("inventory_holdings", [{
    id: "inv",
    store_item_id: "item",
    quantity_owned: "3.9",
    quantity_reserved: "-1.9",
    updated_at: "now",
  }, {
    id: "missing",
    store_item_id: "absent",
    quantity_owned: "NaN",
    quantity_reserved: Infinity,
    updated_at: "then",
  }]);
  s.client.rows("store_purchases", [{
    id: "purchase",
    store_item_id: "item",
    quantity: "2.9",
    final_total_price: "84.125",
    currency_code: " usd ",
    status: "completed",
    created_at: "now",
  }, {
    id: "unknown",
    store_item_id: "absent",
    quantity: "bad",
    final_total_price: "Infinity",
    currency_code: "ECO",
    status: "rejected",
    created_at: "then",
  }]);
  const order = {
    id: "order",
    player_id: "me",
    stock_asset_id: "stock",
    ticker: "T",
    side: "SELL",
    quantity: "2.25",
    execution_price: null,
    gross_value: "bad",
    status: "pending",
    idempotency_key: "secret-key",
    created_at: "now",
  };
  s.client.rows("stock_orders", [order, {
    ...order,
    id: "rejected",
    side: "sell",
    status: "rejected",
    execution_price: "5",
    rejection_reason: "funds",
  }]);
  s.client.rows("stock_trades", [{
    ...order,
    id: "trade",
    order_id: "order",
    side: "sell",
    execution_price: "4.5",
    gross_value: "10.125",
  }]);
  s.client.rows("stock_market_events", [{
    id: "news",
    shock_id: "shock",
    scope: "global",
    headline: "Headline",
    explanation: "Explanation",
    created_tick: "7.9",
    expires_tick: null,
    created_at: "now",
    visibility: "private",
  }, {
    id: "news2",
    shock_id: "shock2",
    scope: "sector",
    target_key: "energy",
    category: "custom",
    sentiment: "positive",
    source: "teacher",
    headline: "More",
    explanation: "Details",
    created_tick: "bad",
    expires_tick: "9.9",
    created_at: "then",
  }]);
  const result = await s.read();
  ok(
    result.me.store.listings[0] === item,
    "Private listings retain authoritative objects",
  );
  equal(result.public.storeListings, [{
    itemId: "item",
    itemKey: "key",
    name: "Bike",
    description: null,
    category: "transport",
    stockQuantity: 7,
    status: "active",
    visibility: "visible",
    sortOrder: 2,
    updatedAt: "updated",
  }]);
  equal(result.me.store.inventory, [{
    inventoryId: "inv",
    itemId: "item",
    itemName: "Bike",
    quantityOwned: 3,
    quantityReserved: -1,
    updatedAt: "now",
  }, {
    inventoryId: "missing",
    itemId: "absent",
    itemName: "Unknown item",
    quantityOwned: 0,
    quantityReserved: 0,
    updatedAt: "then",
  }]);
  equal(
    result.me.store.recentPurchases.map((
      p,
    ) => [p.itemName, p.quantity, p.finalTotalPrice, p.currencyCode, p.status]),
    [["Bike", 2, 84.125, " usd ", "completed"], [
      "Unknown item",
      0,
      0,
      "ECO",
      "rejected",
    ]],
  );
  equal(result.me.stocks.orders[0], {
    orderId: "order",
    stockAssetId: "stock",
    ticker: "T",
    side: "buy",
    quantity: 2.25,
    executionPrice: 0,
    grossValue: 0,
    status: "filled",
    rejectionReason: null,
    idempotencyKey: "secret-key",
    createdAt: "now",
  });
  equal(result.me.stocks.orders[1].side, "sell");
  equal(result.me.stocks.orders[1].status, "rejected");
  equal(result.me.stocks.orders[1].rejectionReason, "funds");
  equal(result.me.stocks.trades[0], {
    tradeId: "trade",
    orderId: "order",
    stockAssetId: "stock",
    ticker: "T",
    side: "sell",
    quantity: 2.25,
    executionPrice: 4.5,
    grossValue: 10.125,
    createdAt: "now",
  });
  equal(result.public.market.news, [{
    id: "news",
    shockId: "shock",
    category: "sector",
    sentiment: "neutral",
    source: "runner",
    scope: "global",
    targetKey: null,
    headline: "Headline",
    explanation: "Explanation",
    createdTick: 7,
    expiresTick: null,
    createdAt: "now",
  }, {
    id: "news2",
    shockId: "shock2",
    category: "custom",
    sentiment: "positive",
    source: "teacher",
    scope: "sector",
    targetKey: "energy",
    headline: "More",
    explanation: "Details",
    createdTick: 0,
    expiresTick: 9,
    createdAt: "then",
  }]);
});
