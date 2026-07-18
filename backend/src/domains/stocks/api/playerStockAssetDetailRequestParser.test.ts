import {
  MAX_PLAYER_STOCK_ASSET_HISTORY_LIMIT,
  parsePlayerStockAssetDetailRequest,
} from "./playerStockAssetDetailRequestParser.ts";
import {
  PlayerStockAssetDetailError,
} from "../contracts/playerStockAssetDetailContracts.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock asset detail parser applies a bounded history default", () => {
  assertEquals(
    parsePlayerStockAssetDetailRequest(
      request("/players/me/stocks/assets/AURA"),
      { kind: "asset", assetId: "AURA" },
    ),
    { assetId: "AURA", historyLimit: 200 },
  );
  assertEquals(
    parsePlayerStockAssetDetailRequest(
      request("/players/me/stocks/assets/AURA?historyLimit=1"),
      { kind: "asset", assetId: "AURA" },
    ),
    { assetId: "AURA", historyLimit: 1 },
  );
  assertEquals(
    parsePlayerStockAssetDetailRequest(
      request(
        `/players/me/stocks/assets/AURA?historyLimit=${MAX_PLAYER_STOCK_ASSET_HISTORY_LIMIT}`,
      ),
      { kind: "asset", assetId: "AURA" },
    ),
    { assetId: "AURA", historyLimit: MAX_PLAYER_STOCK_ASSET_HISTORY_LIMIT },
  );
});

Deno.test("player stock asset detail parser rejects malformed bounds and unsupported query", () => {
  for (
    const query of [
      "historyLimit=0",
      "historyLimit=501",
      "historyLimit=1.5",
      "historyLimit=1&historyLimit=2",
      "limit=10",
      "offset=0",
    ]
  ) {
    assertThrowsCode(
      () =>
        parsePlayerStockAssetDetailRequest(
          request(`/players/me/stocks/assets/AURA?${query}`),
          { kind: "asset", assetId: "AURA" },
        ),
      "invalid_player_stock_asset_detail_request",
    );
  }

  assertThrowsCode(
    () =>
      parsePlayerStockAssetDetailRequest(
        request("/players/me/stocks/assets"),
        { kind: "assets" },
      ),
    "invalid_player_stock_asset_detail_request",
  );
});

Deno.test("player stock asset detail parser rejects client-selected game scope", () => {
  assertThrowsCode(
    () =>
      parsePlayerStockAssetDetailRequest(
        request("/players/me/stocks/assets/AURA?gameSessionId=game"),
        { kind: "asset", assetId: "AURA" },
      ),
    "invalid_player_stock_asset_detail_request",
  );
  assertThrowsCode(
    () =>
      parsePlayerStockAssetDetailRequest(
        request("/players/me/stocks/assets/AURA", { gameHeader: "game" }),
        { kind: "asset", assetId: "AURA" },
      ),
    "invalid_player_stock_asset_detail_request",
  );
});

function request(
  path: string,
  options: { readonly gameHeader?: string } = {},
): Request {
  const headers = new Headers();
  if (options.gameHeader) {
    headers.set("x-econovaria-game-id", options.gameHeader);
  }
  return new Request(`https://example.test${path}`, { headers });
}

function assertThrowsCode(run: () => unknown, code: string): void {
  try {
    run();
  } catch (error) {
    if (error instanceof PlayerStockAssetDetailError) {
      assertEquals(error.code, code);
      return;
    }
    throw error;
  }
  throw new Error(`Expected PlayerStockAssetDetailError with code ${code}.`);
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
