import { readPlayerStockMarketPublicRoutePath } from "./playerStockMarketPublicRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("player public stock routes recognize exact portfolio and order paths", () => {
  assertEquals(
    readPlayerStockMarketPublicRoutePath("/players/me/stocks/portfolio"),
    { kind: "portfolio" },
  );
  assertEquals(
    readPlayerStockMarketPublicRoutePath("/players/me/stocks/portfolio/"),
    { kind: "portfolio" },
  );
  assertEquals(
    readPlayerStockMarketPublicRoutePath("/players/me/stocks/orders"),
    { kind: "orders" },
  );
});

Deno.test("player public stock routes fail closed for nested and unrelated paths", () => {
  assertEquals(
    readPlayerStockMarketPublicRoutePath("/players/me/stocks/portfolio/internal"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockMarketPublicRoutePath("/players/me/stocks/orders/internal"),
    { kind: "malformed" },
  );
  assertEquals(
    readPlayerStockMarketPublicRoutePath("/players/me/stocks/assets"),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual: ${JSON.stringify(actual)} Expected: ${JSON.stringify(expected)}`,
    );
  }
}
