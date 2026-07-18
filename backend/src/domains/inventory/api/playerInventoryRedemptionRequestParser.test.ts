import { PlayerInventoryRedemptionError } from "../contracts/playerInventoryRedemptionContracts.ts";
import {
  parsePlayerInventoryRedemptionCommand,
  parsePlayerInventoryRedemptionRead,
} from "./playerInventoryRedemptionRequestParser.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Redemption command parser normalizes the bounded public command", async () => {
  const command = await parsePlayerInventoryRedemptionCommand(
    request({
      body: { quantity: 2, note: "  Lunch  ", idempotencyKey: "redeem:001" },
    }),
    { kind: "request", itemId: "meal-pass" },
  );
  assertEquals(command, {
    quantity: 2,
    note: "Lunch",
    idempotencyKey: "redeem:001",
  });
});

Deno.test("Redemption command parser rejects ownership, unknown keys, invalid quantity, and unsafe idempotency", async () => {
  for (
    const candidate of [
      request({ query: "gameId=browser" }),
      request({ gameHeader: "browser" }),
      request({ runnerSecret: "secret" }),
      request({
        body: { quantity: 1, idempotencyKey: "one", playerId: "browser" },
      }),
      request({ body: { quantity: 0, idempotencyKey: "one" } }),
      request({ body: { quantity: 1.5, idempotencyKey: "one" } }),
      request({ body: { quantity: 1, idempotencyKey: "unsafe key" } }),
      request({ body: { quantity: 1, idempotencyKey: "one", note: 7 } }),
    ]
  ) {
    await assertInvalid(() =>
      parsePlayerInventoryRedemptionCommand(candidate, {
        kind: "request",
        itemId: "meal-pass",
      })
    );
  }
});

Deno.test("Redemption read parser accepts bounded collection filters and exact item reads", () => {
  assertEquals(
    parsePlayerInventoryRedemptionRead(
      request({ method: "GET", query: "status=APPROVED&limit=10&offset=20" }),
      { kind: "collection" },
    ),
    { status: "approved", limit: 10, offset: 20 },
  );
  assertEquals(
    parsePlayerInventoryRedemptionRead(
      request({ method: "GET" }),
      { kind: "item", requestId: `red_${"a".repeat(32)}` },
    ),
    { status: null, limit: 1, offset: 0 },
  );
});

Deno.test("Redemption read parser rejects unknown, repeated, unbounded, and item query parameters", () => {
  for (
    const [query, route] of [
      ["ownerId=browser", { kind: "collection" }],
      ["status=pending&status=approved", { kind: "collection" }],
      ["status=cancelled", { kind: "collection" }],
      ["limit=51", { kind: "collection" }],
      ["offset=-1", { kind: "collection" }],
      ["status=pending", { kind: "item", requestId: `red_${"a".repeat(32)}` }],
    ] as const
  ) {
    assertThrowsInvalid(() =>
      parsePlayerInventoryRedemptionRead(
        request({ method: "GET", query }),
        route as never,
      )
    );
  }
});

function request(options: {
  readonly method?: string;
  readonly query?: string;
  readonly body?: unknown;
  readonly gameHeader?: string;
  readonly runnerSecret?: string;
} = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.gameHeader) {
    headers.set("x-econovaria-game-id", options.gameHeader);
  }
  if (options.runnerSecret) {
    headers.set("x-stock-market-runner-secret", options.runnerSecret);
  }
  const method = options.method ?? "POST";
  return new Request(
    `https://example.test/players/me/inventory/meal-pass/redemptions${
      options.query ? `?${options.query}` : ""
    }`,
    {
      method,
      headers,
      ...(method === "GET" ? {} : {
        body: JSON.stringify(
          options.body ?? { quantity: 1, idempotencyKey: "one" },
        ),
      }),
    },
  );
}

async function assertInvalid(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (
      error instanceof PlayerInventoryRedemptionError && error.status === 400
    ) return;
    throw error;
  }
  throw new Error("Expected invalid request");
}

function assertThrowsInvalid(run: () => unknown): void {
  try {
    run();
  } catch (error) {
    if (
      error instanceof PlayerInventoryRedemptionError && error.status === 400
    ) return;
    throw error;
  }
  throw new Error("Expected invalid request");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}`,
    );
  }
}
