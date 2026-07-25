import { PLAYER_RATE_LIMIT_POLICIES } from "./playerRateLimitPolicy.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("read rate limits support a 40-Player classroom behind one NAT without weakening scoped controls", () => {
  const read = PLAYER_RATE_LIMIT_POLICIES.read;
  const reviewedReadsPerPlayer = 7;
  const maximumPlayers = 40;

  assert(read.ip.limit >= reviewedReadsPerPlayer * maximumPlayers);
  assertEquals(read.ip, { limit: 600, windowSeconds: 60, blockSeconds: 30 });
  assertEquals(read.identity, { limit: 180, windowSeconds: 60, blockSeconds: 30 });
  assertEquals(read.action, { limit: 90, windowSeconds: 60, blockSeconds: 30 });
  assertEquals(read.game, { limit: 1200, windowSeconds: 60, blockSeconds: 30 });
});

function assert(condition: boolean): void {
  if (!condition) throw new Error("Assertion failed.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
