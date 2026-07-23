import {
  readPlayerStockAssetListRoutePath,
  readPlayerStockAssetRoutePath,
} from "./playerStockAssetListRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock asset routes accept collection and public ticker detail paths", () => {
  for (const pathname of [
    "/players/me/stocks/assets",
    "/classroom-api/players/me/stocks/assets",
    "/functions/v1/classroom-api/players/me/stocks/assets",
  ]) {
    assertEquals(readPlayerStockAssetRoutePath(pathname), {
      kind: "assets",
    });
  }
  assertEquals(
    readPlayerStockAssetRoutePath(
      "/classroom-api/players/me/stocks/assets/aura",
    ),
    { kind: "asset", assetId: "AURA" },
  );
  assertEquals(
    readPlayerStockAssetListRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/assets/BRK.B",
    ),
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
    readPlayerStockAssetRoutePath(
      "/classroom-api/players/me/stocks/assets/AURA/extra",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockAssetRoutePath(
      "/classroom-api/players/me/stocks/assets/AURA%2FBETA",
    ),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockAssetRoutePath("/players/me/stocks/orders"),
    null,
  );
  assertEquals(
    readPlayerStockAssetRoutePath("/spoof/players/me/stocks/assets"),
    null,
  );
  assertEquals(
    readPlayerStockAssetRoutePath(
      "/spoof/classroom-api/players/me/stocks/assets",
    ),
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
