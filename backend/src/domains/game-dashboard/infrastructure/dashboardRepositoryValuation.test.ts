import {
  countries,
  equal,
  ok,
  position,
  setup,
} from "./dashboardRepositoryCharacterizationFixture.ts";
import type { PlayerGameDashboardReadDependencies } from "./supabasePlayerGameDashboardRepository.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};
Deno.test("dashboard latest country, per-currency ranks, and stable tie breakers are preserved", async () => {
  const s = setup();
  s.client.rows("players", [
    { id: "z", display_name: "Same" },
    { id: "me", display_name: "Same" },
    { id: "a", display_name: "Aaron" },
    { id: "eur", display_name: "Euro" },
    { id: "missing", display_name: "Missing" },
  ]);
  countries(s.client, [
    ...["me", "z", "a"].map((player_id) => ({
      player_id,
      country_profile_id: "us",
      assigned_at: "new",
    })),
    { player_id: "me", country_profile_id: "eu", assigned_at: "old" },
    { player_id: "eur", country_profile_id: "eu", assigned_at: "new" },
    { player_id: "missing", country_profile_id: "absent", assigned_at: "new" },
    { player_id: "missing", country_profile_id: "us", assigned_at: "old" },
  ], [{ id: "us", country_code: "US", currency_code: " usd " }, {
    id: "eu",
    country_code: "EU",
    currency_code: "EUR",
  }]);
  s.client.rows("account_balances", [
    ...["me", "z", "a"].map((player_id) => ({
      player_id,
      account_type: "checking",
      balance: "10",
      currency_code: "USD",
    })),
    {
      player_id: "eur",
      account_type: "checking",
      balance: "999",
      currency_code: "EUR",
    },
    {
      player_id: "me",
      account_type: "checking",
      balance: "9999",
      currency_code: "ECO",
    },
  ]);
  const result = await s.read();
  // Null currency sorts under the existing locale's '~' ordering; test the
  // currency groups separately rather than imposing a new cross-locale order.
  equal(
    result.public.leaderboard.filter((p) => p.valuationCurrencyCode === "USD")
      .map((p) => [p.playerId, p.rank, p.netWorth, p.rankScope]),
    [["a", 1, 10, "currency"], ["me", 2, 10, "currency"], [
      "z",
      3,
      10,
      "currency",
    ]],
  );
  equal(result.public.leaderboard.find((p) => p.playerId === "eur")?.rank, 1);
  equal(result.public.players.find((p) => p.playerId === "missing"), {
    playerId: "missing",
    displayName: "Missing",
    rosterLabel: null,
    countryCode: null,
  });
  equal([
    result.me.countryCode,
    result.me.cash.primaryCurrencyCode,
    result.me.netWorth,
  ], ["US", "USD", 10]);
});

Deno.test("dashboard values national cash separately from ECO positions and private holdings", async () => {
  const s = setup();
  countries(s.client, [{
    player_id: "me",
    country_profile_id: "us",
    assigned_at: "now",
  }], [{ id: "us", country_code: "US", currency_code: "usd" }]);
  s.client.rows("account_balances", [
    {
      player_id: "me",
      account_type: "checking",
      currency_code: " usd ",
      balance: "10.125",
    },
    {
      player_id: "me",
      account_type: "savings",
      currency_code: "USD",
      balance: "5",
    },
    {
      player_id: "me",
      account_type: "checking",
      currency_code: "ECO",
      balance: "100",
    },
    {
      player_id: "other",
      account_type: "checking",
      currency_code: "USD",
      balance: "9000",
    },
  ]);
  s.client.positions = {
    data: [
      position(),
      position({
        stock_asset_id: "national",
        listing_currency_code: "USD",
        quantity: "3",
        average_cost: "4",
      }),
      position({
        stock_asset_id: "missing",
        quantity: "bad",
        realized_pnl: "Infinity",
      }),
      position({ player_id: "other", quantity: 999 }),
    ],
    error: null,
  };
  const stock = {
    assetId: "stock",
    ticker: "NEW",
    companyName: "Company",
    sector: "tech",
    countryCode: "US",
    currentPrice: 10,
    previousClose: 8,
    changePct: 25,
    openPrice: 8,
    dayHigh: 10,
    dayLow: 8,
    volume: 1,
    marketCap: null,
    currentVolatility: 0,
    longRunVolatility: 0,
    description: null,
  };
  s.dependencies.stockMarketReadRepository.read = async () => ({
    gameSessionId: "game",
    tickIndex: 2,
    stocks: [stock, { ...stock, assetId: "national", currentPrice: 7 }],
  });
  const result = await s.read();
  equal(result.me.netWorth, 36.125); // No active player row: 10.125 + 5 + 21.
  equal(result.me.cash.totalBalance, 10.125);
  equal([
    result.me.stocks.portfolio.cashBalance,
    result.me.stocks.portfolio.holdingsMarketValue,
    result.me.stocks.portfolio.totalEquity,
    result.me.stocks.portfolio.positionsCount,
  ], [100, 20, 120, 2]);
  equal(result.me.netWorthValuation, {
    currencyCode: "USD",
    status: "partial_unconverted",
    excludedStockMarketValue: 20,
    excludedStocksByCurrency: [{
      currencyCode: "ECO",
      marketValue: 20,
      costBasis: 6,
      unrealizedPnl: 14,
      realizedPnl: 1.25,
    }],
  });
  equal(result.me.stocks.holdings[0], {
    stockAssetId: "stock",
    ticker: "NEW",
    companyName: "Company",
    sector: "tech",
    countryCode: "US",
    currencyCode: "ECO",
    quantity: 2,
    averageCost: 3,
    currentPrice: 10,
    marketValue: 20,
    costBasis: 6,
    unrealizedPnl: 14,
    unrealizedPnlPct: 233.333333,
    realizedPnl: 1.25,
  });
  equal([
    result.me.stocks.holdings[2].companyName,
    result.me.stocks.holdings[2].currentPrice,
    result.me.stocks.holdings[2].quantity,
  ], ["OLD", 0, 0]);
});

Deno.test("dashboard keeps raw position currency matching and excludes foreign holdings from leaderboard", async () => {
  const s = setup();
  s.client.rows("players", [{
    id: "me",
    display_name: "Me",
    roster_label: "Roster",
  }]);
  countries(s.client, [{
    player_id: "me",
    country_profile_id: "us",
    assigned_at: "now",
  }], [{ id: "us", country_code: "US", currency_code: " usd " }]);
  s.client.rows("account_balances", [{
    player_id: "me",
    account_type: "checking",
    currency_code: "USD",
    balance: "1.0000004",
  }, {
    player_id: "me",
    account_type: "savings",
    currency_code: " usd ",
    balance: "2.0000004",
  }]);
  s.client.positions = {
    data: [
      position({ listing_currency_code: "USD" }),
      position({ listing_currency_code: " usd ", quantity: 100 }),
      position({ listing_currency_code: "ECO", quantity: 100 }),
    ],
    error: null,
  };
  s.dependencies.stockMarketReadRepository.read = async () => ({
    gameSessionId: "game",
    tickIndex: 1,
    stocks: [{
      assetId: "stock",
      ticker: "T",
      companyName: "Stock",
      sector: "tech",
      countryCode: "US",
      currentPrice: 4,
      previousClose: 4,
      changePct: 0,
      openPrice: 4,
      dayHigh: 4,
      dayLow: 4,
      volume: 0,
      marketCap: null,
      currentVolatility: 0,
      longRunVolatility: 0,
      description: null,
    }],
  });
  const result = await s.read();
  equal(result.me.netWorth, 11.000001);
  equal(result.public.leaderboard[0].netWorth, 11.000001);
  equal(result.me.stocks.holdings.map((h) => h.currencyCode), [
    "USD",
    " usd ",
    "ECO",
  ]);
  equal(result.public.players, [{
    playerId: "me",
    displayName: "Me",
    rosterLabel: "Roster",
    countryCode: "US",
  }]);
  equal(result.me.displayName, "Session name");
});

Deno.test("dashboard ambiguous cash currencies stay unvalued and contracts retain read-query references", async () => {
  const s = setup();
  s.client.rows("account_balances", [{
    player_id: "me",
    account_type: "checking",
    currency_code: "USD",
    balance: 100,
  }, {
    player_id: "me",
    account_type: "checking",
    currency_code: "EUR",
    balance: 200,
  }]);
  type Contracts = Awaited<
    ReturnType<
      PlayerGameDashboardReadDependencies["playerContractsReadQuery"]["read"]
    >
  >;
  const available: Contracts["available"] = [];
  const progress: Contracts["progress"] = [];
  s.dependencies.playerContractsReadQuery.read = async () => ({
    available,
    progress,
  });
  const result = await s.read();
  equal([
    result.me.cash.primaryCurrencyCode,
    result.me.cash.totalBalance,
    result.me.netWorth,
    result.me.store.currencyCode,
  ], [null, 0, 0, null]);
  ok(
    result.me.contracts.available === available &&
      result.public.contracts === available,
    "Both projections reuse available contracts",
  );
  ok(
    result.me.contracts.progress === progress,
    "Private progress retains query result",
  );
  ok(
    !("progress" in result.public),
    "Public result must not expose private progress",
  );
});
