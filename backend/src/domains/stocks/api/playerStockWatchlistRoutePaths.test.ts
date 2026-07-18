import {
  readPlayerStockWatchlistRoutePath,
} from "./playerStockWatchlistRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock watchlist route accepts collection and public tickers", () => {
  assertEquals(
    readPlayerStockWatchlistRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/watchlist",
    ),
    { kind: "watchlist" },
  );
  assertEquals(
    readPlayerStockWatchlistRoutePath("/players/me/stocks/watchlist/aura"),
    { kind: "watchlist_asset", assetId: "AURA" },
  );
  assertEquals(
    readPlayerStockWatchlistRoutePath("/players/me/stocks/watchlist/BRK.B"),
    { kind: "watchlist_asset", assetId: "BRK.B" },
  );
});

Deno.test("player stock watchlist route rejects UUIDs, encoded separators, and extra segments", () => {
  assertEquals(
    readPlayerStockWatchlistRoutePath(
      "/players/me/stocks/watchlist/00000000-0000-4000-8000-000000000101",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockWatchlistRoutePath("/players/me/stocks/watchlist/AURA%2FOTHER"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockWatchlistRoutePath("/players/me/stocks/watchlist/AURA/extra"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockWatchlistRoutePath("/players/me/stocks/assets"),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
