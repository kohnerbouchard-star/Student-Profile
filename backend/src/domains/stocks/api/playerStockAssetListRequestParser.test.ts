import {
  MAX_PLAYER_STOCK_ASSET_LIST_LIMIT,
  MAX_PLAYER_STOCK_ASSET_LIST_OFFSET,
  parsePlayerStockAssetListRequest,
} from "./playerStockAssetListRequestParser.ts";
import { PlayerStockAssetListError } from "../contracts/playerStockAssetListContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock asset list parser applies bounded defaults", () => {
  assertEquals(
    parsePlayerStockAssetListRequest(
      request("/players/me/stocks/assets"),
      { kind: "assets" },
    ),
    { limit: 50, offset: 0 },
  );
  assertEquals(
    parsePlayerStockAssetListRequest(
      request("/players/me/stocks/assets?limit=100&offset=25"),
      { kind: "assets" },
    ),
    { limit: 100, offset: 25 },
  );
});

Deno.test("player stock asset list parser rejects invalid bounds and duplicates", () => {
  for (
    const query of [
      "limit=0",
      `limit=${MAX_PLAYER_STOCK_ASSET_LIST_LIMIT + 1}`,
      "limit=1.5",
      "limit=10&limit=20",
      "offset=-1",
      `offset=${MAX_PLAYER_STOCK_ASSET_LIST_OFFSET + 1}`,
      "offset=1.5",
      "offset=1&offset=2",
      "historyLimit=10",
    ]
  ) {
    assertThrowsCode(
      () =>
        parsePlayerStockAssetListRequest(
          request(`/players/me/stocks/assets?${query}`),
          { kind: "assets" },
        ),
      "invalid_player_stock_asset_list_request",
    );
  }
});

Deno.test("player stock asset list parser rejects client-selected game scope", () => {
  assertThrowsCode(
    () =>
      parsePlayerStockAssetListRequest(
        request("/players/me/stocks/assets?gameSessionId=game-one"),
        { kind: "assets" },
      ),
    "invalid_player_stock_asset_list_request",
  );
  assertThrowsCode(
    () =>
      parsePlayerStockAssetListRequest(
        request("/players/me/stocks/assets", {
          "x-econovaria-game-id": "game-one",
        }),
        { kind: "assets" },
      ),
    "invalid_player_stock_asset_list_request",
  );
});

Deno.test("player stock asset list parser rejects malformed paths", () => {
  assertThrowsCode(
    () =>
      parsePlayerStockAssetListRequest(
        request("/players/me/stocks/assets/AURA"),
        { kind: "malformed" },
      ),
    "invalid_player_stock_asset_list_request",
  );
});

function request(path: string, headers: Record<string, string> = {}): Request {
  return new Request(`https://example.test${path}`, { headers });
}

function assertThrowsCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof PlayerStockAssetListError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(`Expected PlayerStockAssetListError with code ${code}.`);
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
