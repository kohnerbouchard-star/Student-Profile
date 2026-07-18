import {
  parsePlayerStockWatchlistListRequest,
  parsePlayerStockWatchlistMutationRequest,
  rejectPlayerStockWatchlistMutationBody,
} from "./playerStockWatchlistRequestParser.ts";
import { PlayerStockWatchlistError } from "../contracts/playerStockWatchlistContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock watchlist parser applies bounded list defaults", () => {
  assertEquals(
    parsePlayerStockWatchlistListRequest(
      request("/players/me/stocks/watchlist"),
      { kind: "watchlist" },
    ),
    { limit: 50, offset: 0 },
  );
  assertEquals(
    parsePlayerStockWatchlistListRequest(
      request("/players/me/stocks/watchlist?limit=100&offset=10000"),
      { kind: "watchlist" },
    ),
    { limit: 100, offset: 10000 },
  );
});

Deno.test("player stock watchlist parser rejects duplicate, unknown, and client scope fields", () => {
  assertThrowsCode(
    () => parsePlayerStockWatchlistListRequest(
      request("/players/me/stocks/watchlist?limit=1&limit=2"),
      { kind: "watchlist" },
    ),
    "invalid_player_stock_watchlist_request",
  );
  assertThrowsCode(
    () => parsePlayerStockWatchlistListRequest(
      request("/players/me/stocks/watchlist?cursor=x"),
      { kind: "watchlist" },
    ),
    "invalid_player_stock_watchlist_request",
  );
  assertThrowsCode(
    () => parsePlayerStockWatchlistListRequest(
      request("/players/me/stocks/watchlist?gameSessionId=game"),
      { kind: "watchlist" },
    ),
    "invalid_player_stock_watchlist_request",
  );
});

Deno.test("player stock watchlist mutation parser rejects query fields and bodies", async () => {
  assertThrowsCode(
    () => parsePlayerStockWatchlistMutationRequest(
      request("/players/me/stocks/watchlist/AURA?enabled=true"),
      { kind: "watchlist_asset", assetId: "AURA" },
    ),
    "invalid_player_stock_watchlist_request",
  );
  await assertRejectsCode(
    () => rejectPlayerStockWatchlistMutationBody(
      request("/players/me/stocks/watchlist/AURA", {
        method: "PUT",
        body: "{}",
      }),
    ),
    "invalid_player_stock_watchlist_request",
  );
});

function request(
  path: string,
  options: { method?: string; body?: string } = {},
): Request {
  return new Request(`https://example.test${path}`, {
    method: options.method ?? "GET",
    body: options.body,
    headers: options.body ? { "content-type": "application/json" } : undefined,
  });
}

function assertThrowsCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof PlayerStockWatchlistError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(`Expected PlayerStockWatchlistError with code ${code}.`);
}

async function assertRejectsCode(
  run: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (error instanceof PlayerStockWatchlistError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(`Expected PlayerStockWatchlistError with code ${code}.`);
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
