import {
  summarizePortfolio,
  toCashDto,
  toHoldingDto,
} from "../infrastructure/dashboardFinancialProjection.ts";
import { SupabasePlayerGameDashboardRepository } from "../infrastructure/supabasePlayerGameDashboardRepository.ts";
import { PlayerGameDashboardError } from "../contracts/playerGameDashboardContracts.ts";
import { createDashboardStoreListingsReadQuery } from "./playerGameDashboardHttpHandler.test.requestFixtures.support.ts";
import { createPlayerContractsReadQuery } from "../../contracts/index.ts";
import {
  createStockMarketOpenStateReadRepository,
  createStockMarketReadRepository,
  StockMarketReadError,
  type StockMarketReadInput,
  type StockMarketReadRepository,
} from "../../stocks/index.ts";
import {
  GAME_SESSION_ID,
  OTHER_GAME_PLAYER_ID,
  OTHER_GAME_SESSION_ID,
  PLAYER_ID,
  PLAYER_SESSION_ID,
} from "./playerGameDashboardHttpHandler.test.constants.support.ts";
import { tables } from "./playerGameDashboardHttpHandler.test.tableFixtures.support.ts";
import {
  holdingRow,
  stockAsset,
} from "./playerGameDashboardHttpHandler.test.rowFixtures.support.ts";
import { FakeClient } from "./playerGameDashboardHttpHandler.test.repositoryFakes.support.ts";
import { assertEquals } from "./playerGameDashboardHttpHandler.test.assertions.support.ts";
declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

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
