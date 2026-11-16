import { SupabaseStockMarketPlayerReadRepository } from "./supabaseStockMarketPlayerReadRepository.ts";
import {
  asset,
  eq,
  fixture,
  holding,
  input,
  now,
  ok,
  order,
  rejects,
  repository,
  type Response,
  session,
  trade,
} from "./stockMarketPlayerReadRowsTestFixtures.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

for (
  const [label, patch] of [
    ["expired", { expires_at: "2026-11-14T11:59:59Z" }],
    ["exact expiry", { expires_at: now.toISOString() }],
    ["invalid date", { expires_at: "not a date" }],
    ["inactive", { status: "inactive" }],
    ["case variant", { status: "ACTIVE" }],
    ["revoked", { revoked_at: "revoked" }],
  ] as const
) {
  Deno.test(`stock rows reject ${label} before any economic read`, async () => {
    const client = fixture({ player_sessions: ok([{ ...session, ...patch }]) });
    await rejects(
      () => repository(client).read(input),
      "invalid_player_session",
      409,
    );
    eq(client.calls.map((call) => call[0]), [
      "from",
      "select",
      "eq",
      "eq",
      "limit",
      "await",
    ]);
  });
}

Deno.test("stock rows accept empty revocation and select only first session", async () => {
  const client = fixture({
    player_sessions: ok([{ ...session, revoked_at: "" }, {
      ...session,
      status: "revoked",
    }]),
  });
  eq((await repository(client).read(input)).playerId, "derived-player");
});
Deno.test("stock rows reject missing id and invalid injected clock", async () => {
  await rejects(
    () =>
      repository(fixture({ player_sessions: ok([{ ...session, id: "" }]) }))
        .read(input),
    "player_session_not_found",
    404,
  );
  await rejects(
    () =>
      new SupabaseStockMarketPlayerReadRepository(fixture() as never, {
        now: () => new Date(NaN),
      }).read(input),
    "invalid_player_session",
    409,
  );
});

for (
  const [error, expected] of [
    [
      { message: "down", code: "42P01" },
      "stock_market_player_read_schema_not_applied",
    ],
    [
      { message: "down", code: "42703" },
      "stock_market_player_read_schema_not_applied",
    ],
    [
      { message: "RELATION DOES NOT EXIST" },
      "stock_market_player_read_schema_not_applied",
    ],
    [
      { message: "Stale SCHEMA CACHE" },
      "stock_market_player_read_schema_not_applied",
    ],
    [
      { message: "permission denied", code: "42501" },
      "stock_market_player_read_failed",
    ],
  ] as const
) {
  Deno.test(`stock rows retain schema error classification: ${error.message}/${"code" in error ? error.code : ""}`, async () => {
    await rejects(
      () =>
        repository(fixture({ player_sessions: { data: [session], error } }))
          .read(input),
      expected,
      500,
    );
  });
}

for (
  const [table, action] of [
    ["account_balances", "read_portfolio"],
    ["rpc", "read_portfolio"],
    ["game_session_stock_assets", "read_portfolio"],
    ["stock_orders", "read_orders"],
    ["stock_trades", "read_trades"],
  ] as const
) {
  Deno.test(`stock rows propagate ${table} failures through the original error class`, async () => {
    await rejects(
      () =>
        repository(
          fixture({ [table]: { data: null, error: { message: "down" } } }),
        ).read({ ...input, action }),
      "stock_market_player_read_failed",
      500,
    );
  });
}

Deno.test("stock holdings preserve six-place arithmetic order, asset override and response shape", async () => {
  const result = await repository(fixture()).read(input);
  if (result.action !== "read_portfolio") throw Error("Unexpected action");
  eq(result.holdings[0], {
    stockAssetId: "asset",
    ticker: "NEW",
    companyName: "Name",
    sector: "sector",
    countryCode: "country",
    currencyCode: "ECO",
    quantity: 3,
    averageCost: 1.23456789,
    currentPrice: 2.3456789,
    marketValue: 7.037037,
    costBasis: 3.703704,
    unrealizedPnl: 3.333333,
    unrealizedPnlPct: 89.999984,
    realizedPnl: -2,
  });
  eq(
    Object.keys(result).sort(),
    [
      "action",
      "cash",
      "gameSessionId",
      "holdings",
      "playerId",
      "playerSessionId",
      "summary",
    ].sort(),
  );
  eq(result.cash, {
    accountType: "checking",
    currencyCode: "ECO",
    balance: 10,
  });
});

Deno.test("stock holdings preserve absent-asset defaults and first-seen ID deduplication", async () => {
  const client = fixture({
    rpc: ok([holding, holding, { ...holding, stock_asset_id: "second" }]),
    game_session_stock_assets: ok([]),
  });
  const result = await repository(client).read(input);
  if (result.action !== "read_portfolio") throw Error("Unexpected action");
  eq(result.holdings.length, 3);
  eq(result.holdings[0], {
    stockAssetId: "asset",
    ticker: "OLD",
    companyName: "OLD",
    sector: "",
    countryCode: "",
    currencyCode: "UNKNOWN",
    quantity: 3,
    averageCost: 1.23456789,
    currentPrice: 0,
    marketValue: 0,
    costBasis: 3.703704,
    unrealizedPnl: -3.703704,
    unrealizedPnlPct: -100,
    realizedPnl: -2,
  });
  eq(client.calls.find((call) => call[0] === "in"), ["in", "id", [
    "asset",
    "second",
  ]]);
});

for (
  const value of [
    undefined,
    null,
    "bad",
    "Infinity",
    Infinity,
    NaN,
    "",
    " 2.5 ",
    -0,
    -2,
  ]
) {
  Deno.test(`stock rows retain finite number conversion: ${String(value)}`, async () => {
    const client = fixture({
      account_balances: ok([{ balance: value, currency_code: "" }]),
      rpc: ok([{
        ...holding,
        quantity: value,
        average_cost: value,
        realized_pnl: value,
      }]),
      game_session_stock_assets: ok([{ ...asset, current_price: value }]),
      stock_orders: ok([{
        ...order,
        quantity: value,
        execution_price: value,
        gross_value: value,
      }]),
    });
    const expected = typeof value === "number" || typeof value === "string"
      ? (Number.isFinite(Number(value)) ? Number(value) : 0)
      : 0;
    const result = await repository(client).read(input);
    if (result.action !== "read_portfolio") throw Error("Unexpected action");
    eq(result.cash, {
      accountType: "checking",
      currencyCode: "",
      balance: expected,
    });
    eq([
      result.holdings[0].quantity,
      result.holdings[0].averageCost,
      result.holdings[0].currentPrice,
      result.holdings[0].realizedPnl,
    ], [expected, expected, expected, expected]);
    const orders = await repository(client).read({
      ...input,
      action: "read_orders",
    });
    if (orders.action !== "read_orders") throw Error("Unexpected action");
    eq([
      orders.orders[0].quantity,
      orders.orders[0].executionPrice,
      orders.orders[0].grossValue,
    ], [expected, expected, expected]);
  });
}

Deno.test("stock rows keep order/trade defaults, exact fields and scoped selectors", async () => {
  const client = fixture({
    stock_orders: ok([{
      ...order,
      side: "SELL",
      status: "pending",
      rejection_reason: null,
    }]),
    stock_trades: ok([trade]),
  });
  const orders = await repository(client).read({
    ...input,
    action: "read_orders",
  });
  const trades = await repository(client).read({
    ...input,
    action: "read_trades",
  });
  if (orders.action !== "read_orders" || trades.action !== "read_trades") {
    throw Error("Unexpected action");
  }
  eq(orders.orders, [{
    orderId: "order",
    stockAssetId: "asset",
    ticker: "OLD",
    side: "buy",
    quantity: 3,
    executionPrice: 2.5,
    grossValue: 7.5,
    status: "filled",
    rejectionReason: null,
    idempotencyKey: "key",
    createdAt: "date",
  }]);
  eq(trades.trades, [{
    tradeId: "trade",
    orderId: "order",
    stockAssetId: "asset",
    ticker: "OLD",
    side: "sell",
    quantity: 3,
    executionPrice: 2.5,
    grossValue: 7.5,
    createdAt: "date",
  }]);
  eq(client.calls.slice(0, 13), [
    ["from", "player_sessions"],
    ["select", "id,game_session_id,player_id,status,expires_at,revoked_at"],
    ["eq", "game_session_id", "game"],
    ["eq", "id", "session"],
    ["limit", 1],
    ["await", "player_sessions"],
    ["from", "stock_orders"],
    [
      "select",
      "id,game_session_id,player_session_id,player_id,stock_asset_id,ticker,side,quantity,execution_price,gross_value,status,rejection_reason,idempotency_key,created_at",
    ],
    ["eq", "game_session_id", "game"],
    ["eq", "player_session_id", "session"],
    ["eq", "player_id", "derived-player"],
    ["order", "created_at", { ascending: false }],
    ["limit", 7],
  ]);
  eq(client.calls.filter((call) => call[0] === "rpc").length, 0);
});

Deno.test("stock rows keep null cash/holdings/order/trade defaults and skip empty asset query", async () => {
  const client = fixture({
    account_balances: ok(null),
    rpc: ok(null),
    stock_orders: ok(null),
    stock_trades: ok(null),
  });
  const result = await repository(client).read(input);
  if (result.action !== "read_portfolio") throw Error("Unexpected action");
  eq(result.cash, { accountType: "checking", currencyCode: "ECO", balance: 0 });
  eq(result.holdings, []);
  eq(
    client.calls.some((call) => call[1] === "game_session_stock_assets"),
    false,
  );
  const orders = await repository(client).read({
    ...input,
    action: "read_orders",
  });
  const trades = await repository(client).read({
    ...input,
    action: "read_trades",
  });
  if (orders.action !== "read_orders" || trades.action !== "read_trades") {
    throw Error("Unexpected action");
  }
  eq(orders.orders, []);
  eq(trades.trades, []);
});

for (const scope of [{ game_session_id: "other" }, { player_id: "other" }]) {
  Deno.test(`stock rows reject foreign ${Object.keys(scope)[0]} before loading assets`, async () => {
    const client = fixture({ rpc: ok([{ ...holding, ...scope }]) });
    await rejects(
      () => repository(client).read(input),
      "stock_market_player_read_failed",
      500,
    );
    eq(
      client.calls.some((call) => call[1] === "game_session_stock_assets"),
      false,
    );
  });
}

Deno.test("stock reads wait for session then admit cash and holdings concurrently with server-derived scope", async () => {
  let releaseSession!: (value: Response) => void;
  let releaseCash!: (value: Response) => void;
  const client = fixture({
    player_sessions: new Promise<Response>((resolve) => {
      releaseSession = resolve;
    }),
    account_balances: new Promise<Response>((resolve) => {
      releaseCash = resolve;
    }),
  });
  const pending = repository(client).read(input);
  await Promise.resolve();
  await Promise.resolve();
  eq(client.calls.filter((call) => call[0] === "from"), [[
    "from",
    "player_sessions",
  ]]);
  releaseSession(ok([session]));
  for (let i = 0; i < 12; i++) await Promise.resolve();
  eq(client.calls.find((call) => call[0] === "rpc"), [
    "rpc",
    "read_player_stock_positions_v1",
    { p_game_session_id: "game", p_player_id: "derived-player" },
  ]);
  eq(
    client.calls.some((call) =>
      call[0] === "from" && call[1] === "game_session_stock_assets"
    ),
    true,
  );
  eq(client.calls.slice(6, 13), [
    ["from", "account_balances"],
    ["select", "account_type,balance,currency_code"],
    ["eq", "game_session_id", "game"],
    ["eq", "player_id", "derived-player"],
    ["eq", "account_type", "checking"],
    ["eq", "currency_code", "ECO"],
    ["limit", 1],
  ]);
  releaseCash(ok([]));
  await pending;
});
