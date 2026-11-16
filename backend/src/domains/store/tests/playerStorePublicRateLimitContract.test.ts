import { readReviewedPlayerRateLimitOperation } from "../../../security/playerRateLimitDispatch.ts";
import {
  playerStoreRouteRateLimitKey,
  readPlayerStorePublicRoutePath,
} from "../api/playerStorePublicRoutePaths.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("public Player Store operations use reviewed rate-limit profiles", () => {
  assertEquals(readReviewedPlayerRateLimitOperation("store", "GET"), {
    action: "player.store.read",
    profile: "read",
  });
  assertEquals(readReviewedPlayerRateLimitOperation("storeQuote", "POST"), {
    action: "player.store.quote",
    profile: "write",
  });
  assertEquals(readReviewedPlayerRateLimitOperation("storePurchase", "GET"), {
    action: "player.store.purchases.read",
    profile: "read",
  });
  assertEquals(readReviewedPlayerRateLimitOperation("storePurchase", "POST"), {
    action: "player.store.purchase",
    profile: "sensitive",
  });
  assertEquals(readReviewedPlayerRateLimitOperation("store", "POST"), null);
  assertEquals(readReviewedPlayerRateLimitOperation("storeQuote", "GET"), null);
});

Deno.test("Business Store routes reuse the reviewed quote and purchase buckets", () => {
  const expected = [
    ["/players/me/store/items", "store", "GET", "player.store.read", "read"],
    [
      "/players/me/store/quotes",
      "storeQuote",
      "POST",
      "player.store.quote",
      "write",
    ],
    [
      "/players/me/store/offer-quotes",
      "storeQuote",
      "POST",
      "player.store.quote",
      "write",
    ],
    [
      "/players/me/store/purchases",
      "storePurchase",
      "POST",
      "player.store.purchase",
      "sensitive",
    ],
    [
      "/players/me/store/offer-purchases",
      "storePurchase",
      "POST",
      "player.store.purchase",
      "sensitive",
    ],
    [
      `/players/me/store/receipts/spr_${"a".repeat(32)}`,
      "storePurchase",
      "GET",
      "player.store.purchases.read",
      "read",
    ],
  ] as const;

  for (const [path, endpointKey, method, action, profile] of expected) {
    const route = readPlayerStorePublicRoutePath(path);
    if (!route) throw new Error(`Expected Store route for ${path}`);
    assertEquals(playerStoreRouteRateLimitKey(route), endpointKey);
    assertEquals(readReviewedPlayerRateLimitOperation(endpointKey, method), {
      action,
      profile,
    });
  }
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
