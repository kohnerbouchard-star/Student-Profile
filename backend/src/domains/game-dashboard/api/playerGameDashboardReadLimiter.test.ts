import {
  PLAYER_GAME_DASHBOARD_CONCURRENT_READ_LIMIT,
  resetPlayerGameDashboardReadLimiterForTests,
  withPlayerGameDashboardReadPermit,
} from "./playerGameDashboardReadLimiter.ts";

declare const Deno: {
  test(name: string, run: () => void | Promise<void>): void;
};

Deno.test("Player dashboard limiter caps concurrent snapshot aggregation", async () => {
  resetPlayerGameDashboardReadLimiterForTests();
  let active = 0;
  let peak = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const tasks = Array.from(
    { length: PLAYER_GAME_DASHBOARD_CONCURRENT_READ_LIMIT + 5 },
    () =>
      withPlayerGameDashboardReadPermit(async () => {
        active += 1;
        peak = Math.max(peak, active);
        await gate;
        active -= 1;
      }),
  );

  await waitUntil(() => active === PLAYER_GAME_DASHBOARD_CONCURRENT_READ_LIMIT);
  assertEquals(peak, PLAYER_GAME_DASHBOARD_CONCURRENT_READ_LIMIT);
  release?.();
  await Promise.all(tasks);
  assertEquals(active, 0);
});

Deno.test("Player dashboard limiter releases permits after failures", async () => {
  resetPlayerGameDashboardReadLimiterForTests();
  await Promise.all(
    Array.from({ length: PLAYER_GAME_DASHBOARD_CONCURRENT_READ_LIMIT }, () =>
      withPlayerGameDashboardReadPermit(async () => {
        throw new Error("expected failure");
      }).catch(() => undefined)
    ),
  );

  const result = await withPlayerGameDashboardReadPermit(async () => "released");
  assertEquals(result, "released");
});

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("Timed out waiting for dashboard limiter state.");
}

function assertEquals(actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Actual ${JSON.stringify(actual)} Expected ${JSON.stringify(expected)}`);
  }
}
