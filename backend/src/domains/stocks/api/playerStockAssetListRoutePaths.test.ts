import {
  readPlayerStockAssetListRoutePath,
} from "./playerStockAssetListRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player stock asset list route accepts only the collection path", () => {
  assertEquals(
    readPlayerStockAssetListRoutePath(
      "/functions/v1/classroom-api/players/me/stocks/assets",
    ),
    { kind: "assets" },
  );
  assertEquals(
    readPlayerStockAssetListRoutePath("/players/me/stocks/assets/AURA"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockAssetListRoutePath("/players/me/stocks/orders"),
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
