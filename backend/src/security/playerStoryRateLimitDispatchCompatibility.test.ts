import { readReviewedPlayerRateLimitOperation } from "./playerRateLimitDispatch.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("story delivery routes retain reviewed rate-limit actions", () => {
  assertEquals(
    readReviewedPlayerRateLimitOperation("storyDeliveries", "GET"),
    {
      action: "player.story.deliveries.read",
      profile: "read",
    },
  );
  assertEquals(
    readReviewedPlayerRateLimitOperation("storyDeliveryState", "POST"),
    {
      action: "player.story.deliveries.write",
      profile: "write",
    },
  );
  assertEquals(
    readReviewedPlayerRateLimitOperation("storyDeliveries", "POST"),
    null,
  );
  assertEquals(
    readReviewedPlayerRateLimitOperation("storyDeliveryState", "GET"),
    null,
  );
});

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`,
    );
  }
}
