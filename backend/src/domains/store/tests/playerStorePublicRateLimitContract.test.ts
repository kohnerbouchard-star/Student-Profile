import { readReviewedPlayerRateLimitOperation } from "../../../security/playerRateLimitDispatch.ts";

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

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
