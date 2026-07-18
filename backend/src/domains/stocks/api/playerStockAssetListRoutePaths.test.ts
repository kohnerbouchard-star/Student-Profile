import {
  readPlayerStockAssetListRoutePath,
  readPlayerStockAssetRoutePath,
} from "./playerStockAssetListRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock asset routes accept collection and public ticker detail paths", () => {
  assertEquals(
    readPlayerStockAssetRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/assets",
    ),
    { kind: "assets" },
  );
  assertEquals(
    readPlayerStockAssetRoutePath("/players/me/stocks/assets/aura"),
    { kind: "asset", assetId: "AURA" },
  );
  assertEquals(
    readPlayerStockAssetListRoutePath("/players/me/stocks/assets/BRK.B"),
    { kind: "asset", assetId: "BRK.B" },
  );
});

Deno.test("player stock asset routes reject internal UUIDs and malformed detail paths", () => {
  assertEquals(
    readPlayerStockAssetRoutePath(
      "/players/me/stocks/assets/00000000-0000-4000-8000-000000000101",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockAssetRoutePath("/players/me/stocks/assets/AURA/extra"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockAssetRoutePath("/players/me/stocks/assets/AURA%2FBETA"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockAssetRoutePath("/players/me/stocks/orders"),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Assertion failed. Actual: ${JSON.stringify(actual)} Expected: ${
        JSON.stringify(expected)
      }`,
    );
  }
}
