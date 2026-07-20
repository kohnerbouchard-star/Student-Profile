import { readReviewedPlayerRateLimitOperation } from "./playerRateLimitDispatch.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Player dashboard uses the reviewed read-rate-limit profile", () => {
  const operation = readReviewedPlayerRateLimitOperation("dashboard", "GET");

  assertEquals(operation, {
    action: "player.dashboard.read",
    profile: "read",
  });
  assertEquals(
    readReviewedPlayerRateLimitOperation("dashboard", "POST"),
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
