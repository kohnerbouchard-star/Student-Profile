import {
  playerBankingFxRateLimitKey,
  readPlayerBankingFxRoutePath,
} from "./playerBankingFxRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

const ORDER_KEY = `fxo_${"a".repeat(32)}`;

Deno.test("Player Banking FX parser accepts every exact route on both Player roots", () => {
  const expected = [
    ["/players/me/banking/fx", { kind: "overview" }],
    ["/players/me/banking/fx/history", { kind: "history" }],
    ["/players/me/banking/fx/orders", { kind: "orders" }],
    ["/players/me/banking/fx/quotes", { kind: "quote" }],
    ["/players/me/banking/fx/orders/standard", { kind: "standard" }],
    ["/players/me/banking/fx/orders/instant", { kind: "instant" }],
    [`/players/me/banking/fx/orders/${ORDER_KEY}/cancel`, {
      kind: "cancel",
      orderKey: ORDER_KEY,
    }],
  ] as const;

  for (
    const prefix of [
      "",
      "/player-api",
      "/classroom-api",
      "/functions/v1/player-api",
      "/functions/v1/classroom-api",
    ]
  ) {
    for (const [path, route] of expected) {
      assertEquals(readPlayerBankingFxRoutePath(`${prefix}${path}`), route);
    }
  }
});

Deno.test("Player Banking FX parser rejects spoofed, internal, and malformed paths", () => {
  assertEquals(readPlayerBankingFxRoutePath("/players/me/banking"), null);
  assertEquals(
    readPlayerBankingFxRoutePath("/spoof/players/me/banking/fx"),
    null,
  );
  assertEquals(
    readPlayerBankingFxRoutePath(
      "/functions/v1/not-player-api/players/me/banking/fx",
    ),
    null,
  );
  for (
    const path of [
      "/players/me/banking/fx/private",
      "/players/me/banking/fx/orders/not-public/cancel",
      `/players/me/banking/fx/orders/${ORDER_KEY}/cancel/extra`,
      "/players/me/banking/fx/orders/00000000-0000-4000-8000-000000000001/cancel",
    ]
  ) {
    assertEquals(readPlayerBankingFxRoutePath(path), { kind: "malformed" });
  }
});

Deno.test("Player Banking FX routes map to reviewed rate-limit operations", () => {
  const expected = [
    [{ kind: "overview" }, "GET", "bankingFx"],
    [{ kind: "history" }, "GET", "bankingFxHistory"],
    [{ kind: "orders" }, "GET", "bankingFxOrders"],
    [{ kind: "quote" }, "POST", "bankingFxQuote"],
    [{ kind: "standard" }, "POST", "bankingFxStandard"],
    [{ kind: "instant" }, "POST", "bankingFxInstant"],
    [{ kind: "cancel", orderKey: ORDER_KEY }, "POST", "bankingFxCancel"],
    [{ kind: "malformed" }, "GET", "bankingFx"],
    [{ kind: "malformed" }, "POST", "bankingFxStandard"],
  ] as const;
  for (const [route, method, endpoint] of expected) {
    assertEquals(playerBankingFxRateLimitKey(route, method), endpoint);
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
